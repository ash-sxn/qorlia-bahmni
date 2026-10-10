# SPDX-License-Identifier: LGPL-3.0-or-later
# Copyright 2026 Qorlia contributors.
import base64
import binascii
import hashlib
import json
import unicodedata
import uuid
from urllib.parse import urlsplit

from markupsafe import Markup, escape
from psycopg2.errors import UniqueViolation

from odoo import api, fields, models
from odoo.exceptions import AccessError, ValidationError
from odoo.tools import html2plaintext


MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024


def safe_filename(name):
    return (isinstance(name, str) and 0 < len(name) <= 160 and name.strip() == name
            and name not in ('.', '..') and not any(
                char in '/\\' or unicodedata.category(char).startswith('C') for char in name))


class Message(models.Model):
    _inherit = 'mail.message'

    qorlia_note_key = fields.Char(copy=False, readonly=True, index=True)
    qorlia_note_hash = fields.Char(copy=False, readonly=True)
    _sql_constraints = [
        ('qorlia_note_key_unique', 'unique(qorlia_note_key)',
         'This internal note request has already been saved.'),
    ]


class InvoiceMessages(models.Model):
    _inherit = 'account.move'

    def _qorlia_note_access(self, invoice_id, operation='read', lock=False):
        if not self.env.user.has_group('base.group_user'):
            raise AccessError('Invoice conversation requires an internal Billing account.')
        invoice = self._qorlia_invoice(invoice_id, operation, lock)
        self.env['mail.message'].check_access_rights('read')
        return invoice

    def _qorlia_can_note(self, invoice):
        if not (self.check_access_rights('write', raise_exception=False)
                and self.env.user.has_group('account.group_account_invoice')):
            return False
        try:
            invoice.check_access_rule('write')
        except AccessError:
            return False
        return True

    def _qorlia_message_values(self, messages):
        messages.check_access_rights('read')
        messages.check_access_rule('read')
        # Native formatting filters tracked fields by the caller's groups.
        formatted = messages.message_format(format_reply=False)
        result = []
        for value in formatted:
            text = html2plaintext(value['body'] or '')
            changes = value.get('trackingValues', [])
            result.append({
                'id': value['id'], 'date': value['date'],
                'author': value['author'].get('name', 'Unknown author')
                    if isinstance(value['author'], dict) else 'Unknown author',
                'subject': value['subject'] or '',
                'kind': 'note' if value['is_note'] else value['message_type'],
                'body': text[:20000], 'body_truncated': len(text) > 20000,
                'changes': [{'id': change['id'], 'field': change['changedField'],
                             'old': self._qorlia_tracking_text(change['oldValue']),
                             'new': self._qorlia_tracking_text(change['newValue'])} for change in changes],
                'attachments': [{'id': attachment['id'], 'name': attachment['name']}
                                for attachment in sorted(value['attachment_ids'], key=lambda item: item['id'])],
            })
        return result

    def _qorlia_tracking_text(self, value):
        text = str(value['value'])
        if value['fieldType'] == 'monetary' and value['currencyId']:
            currency = self.env['res.currency'].browse(value['currencyId'])
            currency.check_access_rights('read')
            currency.check_access_rule('read')
            text = '%s %s' % (currency.name, text)
        return text

    @api.model
    def qorlia_invoice_messages(self, invoice_id, before=False):
        invoice = self._qorlia_note_access(invoice_id)
        if before is not False and (type(before) is not int or before <= 0):
            raise ValidationError('Use a valid conversation cursor.')
        domain = [('model', '=', 'account.move'), ('res_id', '=', invoice.id)]
        if before:
            domain.append(('id', '<', before))
        messages = self.env['mail.message'].search(domain, order='id desc', limit=31)
        page = messages[:30]
        return {'invoice_id': invoice.id, 'can_note': self._qorlia_can_note(invoice),
                'messages': self._qorlia_message_values(page),
                'next_before': page[-1].id if len(messages) > 30 else False}

    def _qorlia_note_request(self, request_key, body, uploads):
        try:
            if not isinstance(request_key, str) or str(uuid.UUID(request_key)) != request_key:
                raise ValueError()
        except (ValueError, TypeError, AttributeError):
            raise ValidationError('Use a valid internal note request key.')
        if (not isinstance(body, str) or (not body.strip() and not uploads) or len(body) > 5000
                or '\x00' in body):
            raise ValidationError('Enter a note of up to 5,000 characters or attach a file.')
        if not isinstance(uploads, list) or len(uploads) > 5:
            raise ValidationError('Attach up to five files, totalling at most 10 MiB.')
        files, identities, total = [], [], 0
        for upload in uploads:
            if (not isinstance(upload, dict) or set(upload) != {'name', 'content'}
                    or not safe_filename(upload['name']) or not isinstance(upload['content'], str)
                    or len(upload['content']) > 4 * ((MAX_ATTACHMENT_BYTES + 2) // 3)):
                raise ValidationError('Use a valid attachment name and base64 file content.')
            try:
                raw = base64.b64decode(upload['content'], validate=True)
            except (ValueError, binascii.Error):
                raise ValidationError('Use valid base64 file content.')
            if base64.b64encode(raw).decode() != upload['content']:
                raise ValidationError('Use canonical base64 file content.')
            total += len(raw)
            if total > MAX_ATTACHMENT_BYTES:
                raise ValidationError('Attachments may total at most 10 MiB.')
            files.append((upload['name'], raw))
            identities.append([upload['name'], len(raw), hashlib.sha256(raw).hexdigest()])
        # Keep request hashes compatible with notes saved before file uploads existed.
        payload = json.dumps([body, identities], ensure_ascii=False, separators=(',', ':')) if files else body
        return hashlib.sha256(payload.encode()).hexdigest(), files

    def _qorlia_existing_note(self, invoice, request_key, digest):
        existing = self.env['mail.message'].search([('qorlia_note_key', '=', request_key)], limit=1)
        if existing:
            existing.check_access_rule('read')
            if (existing.model != 'account.move' or existing.res_id != invoice.id
                    or existing.create_uid != self.env.user or existing.qorlia_note_hash != digest):
                raise ValidationError('This request key belongs to a different internal note.')
        return existing

    @api.model
    def qorlia_invoice_note_status(self, invoice_id, request_key, body, uploads=None):
        digest, _files = self._qorlia_note_request(request_key, body, [] if uploads is None else uploads)
        # Absence in this transaction's snapshot does not disprove a delayed save.
        invoice = self._qorlia_note_access(invoice_id, lock=True)
        existing = self._qorlia_existing_note(invoice, request_key, digest)
        return {'invoice_id': invoice.id, 'request_key': request_key,
                'message': self._qorlia_message_values(existing)[0] if existing else False}

    @api.model
    def qorlia_invoice_note(self, invoice_id, request_key, body, uploads=None):
        digest, files = self._qorlia_note_request(request_key, body, [] if uploads is None else uploads)
        invoice = self._qorlia_note_access(invoice_id, 'write', lock=True)
        if not self._qorlia_can_note(invoice):
            raise AccessError('Your Billing account cannot post invoice notes.')
        existing = self._qorlia_existing_note(invoice, request_key, digest)
        if not existing:
            if files:
                self.env['ir.attachment'].check_access_rights('create')
                self.env['ir.attachment'].check('create', {'res_model': 'account.move', 'res_id': invoice.id})
            try:
                with self.env.cr.savepoint():
                    existing = invoice.with_context(
                        mail_create_nosubscribe=True, mail_post_autofollow=False,
                        mail_notify_force_send=False, no_new_invoice=True,
                        image_no_postprocess=True,
                    ).message_post(
                        body=Markup('<p>') + escape(body).replace('\n', Markup('<br/>')) + Markup('</p>'),
                        message_type='comment', subtype_xmlid='mail.mt_note',
                        is_internal=True, partner_ids=[], attachments=files, attachment_ids=[],
                        qorlia_note_key=request_key, qorlia_note_hash=digest,
                    )
            except UniqueViolation as error:
                if error.diag.constraint_name != 'mail_message_qorlia_note_key_unique':
                    raise
                # Match native invoice creation: retry with a fresh PostgreSQL snapshot.
                self.env.cr.execute("DO $$ BEGIN RAISE EXCEPTION 'Concurrent internal note' USING ERRCODE = '40001'; END $$")
        return {'invoice_id': invoice.id, 'request_key': request_key,
                'message': self._qorlia_message_values(existing)[0]}

    @api.model
    def qorlia_invoice_attachment_download(self, invoice_id, message_id, attachment_id):
        invoice = self._qorlia_note_access(invoice_id)
        if any(type(value) is not int or value <= 0 for value in (message_id, attachment_id)):
            raise ValidationError('Select a saved invoice message and attachment.')
        message = self.env['mail.message'].browse(message_id).exists()
        message.check_access_rights('read')
        message.check_access_rule('read')
        if not message or message.model != 'account.move' or message.res_id != invoice.id:
            raise AccessError('This message does not belong to the selected invoice.')
        attachment = self.env['ir.attachment'].browse(attachment_id).exists()
        attachment.check_access_rights('read')
        attachment.check('read')
        if (not attachment or attachment not in message.attachment_ids or attachment.res_field
                or attachment.res_model != 'account.move' or attachment.res_id != invoice.id):
            raise AccessError('This attachment does not belong to the selected invoice message.')
        result = {'invoice_id': invoice.id, 'message_id': message.id, 'attachment_id': attachment.id}
        if attachment.type == 'url':
            try:
                parsed = urlsplit(attachment.url or '')
                valid = (parsed.scheme in ('https', 'http') and parsed.hostname
                         and not parsed.username and not parsed.password
                         and not any(char.isspace() or unicodedata.category(char).startswith('C')
                                     for char in attachment.url))
                parsed.port
            except ValueError:
                valid = False
            if not valid:
                raise ValidationError('This attachment link is not a supported HTTP or HTTPS address.')
            return dict(result, kind='url', url=attachment.url)
        if attachment.file_size > MAX_ATTACHMENT_BYTES:
            raise ValidationError('Download attachments larger than 10 MiB through native Billing.')
        raw = attachment.with_context(bin_size=False).raw or b''
        if len(raw) != attachment.file_size or len(raw) > MAX_ATTACHMENT_BYTES:
            raise ValidationError('The stored attachment is unavailable or has an invalid size.')
        return dict(result, kind='binary',
                    filename=attachment.name if safe_filename(attachment.name) else 'Attachment-%s' % attachment.id,
                    mimetype='application/octet-stream', byte_count=len(raw), content=base64.b64encode(raw).decode())
