# SPDX-License-Identifier: LGPL-3.0-or-later
# Copyright 2026 Qorlia contributors.
import copy
import hashlib
import uuid

from odoo import api, Command, models
from odoo.exceptions import AccessError, UserError, ValidationError

from .bank_checkpoint_editor import _RECEIPT_TOKEN
from .invoice_draft import _digest
from .invoice_messages import attachment_upload_values


FILE_FIELDS = ('write_date', 'name', 'type', 'file_size', 'checksum', 'url', 'res_model', 'res_id', 'res_field',
    'company_id', 'public', 'access_token')


class BankCheckpointAttachmentEdit(models.Model):
    _inherit = 'account.bank.statement'

    def _qorlia_checkpoint_attachment_request(self, payload, request_key):
        if (not isinstance(payload, dict) or set(payload) != {'checkpoint_id', 'version', 'uploads', 'remove_ids'}
                or type(payload['checkpoint_id']) is not int or payload['checkpoint_id'] <= 0
                or not isinstance(payload['version'], str) or len(payload['version']) != 64
                or any(char not in '0123456789abcdef' for char in payload['version'])
                or not isinstance(payload['remove_ids'], list)
                or any(type(value) is not int or value <= 0 for value in payload['remove_ids'])
                or len(set(payload['remove_ids'])) != len(payload['remove_ids'])):
            raise ValidationError('Use a complete saved checkpoint attachment request.')
        try:
            if not isinstance(request_key, str) or str(uuid.UUID(request_key)) != request_key:
                raise ValueError()
        except (ValueError, TypeError, AttributeError):
            raise ValidationError('Use a valid checkpoint attachment save identifier.')
        files, identities = attachment_upload_values(payload['uploads'])
        if not files and not payload['remove_ids']:
            raise ValidationError('Select files to upload or remove from this checkpoint.')
        return files, _digest({'checkpoint_id': payload['checkpoint_id'], 'version': payload['version'],
            'uploads': identities, 'remove_ids': payload['remove_ids'], 'author': self.env.uid,
            'companies': self.env.companies.ids, 'operation': 'checkpoint-attachments'})

    @api.model
    def qorlia_checkpoint_attachment_status(self, payload, request_key):
        _files, digest = self._qorlia_checkpoint_attachment_request(payload, request_key)
        checkpoint, accepted = self._qorlia_checkpoint_editor_receipt(payload, request_key, digest)
        return {'checkpoint_id': checkpoint.id, 'request_key': request_key, 'accepted': accepted,
            'attachments': self.qorlia_checkpoint_attachments(checkpoint.id) if accepted else False}

    @api.model
    def qorlia_checkpoint_attachment_save(self, payload, request_key):
        files, digest = self._qorlia_checkpoint_attachment_request(payload, request_key)
        # Shares the editor's key namespace, so one key cannot become two different statement saves.
        lock = int.from_bytes(hashlib.sha256(('statement-checkpoint:' + request_key).encode()).digest()[:8], 'big', signed=True)
        self.env.cr.execute('SELECT pg_advisory_xact_lock(%s)', [lock])
        checkpoint, accepted = self._qorlia_checkpoint_editor_receipt(payload, request_key, digest)
        if accepted:
            return self.qorlia_checkpoint_attachment_status(payload, request_key)
        scope = self._qorlia_checkpoint_editor_scope(checkpoint.id, [], False, lock=True)
        model, checkpoint, _defaults, lines, checkpoints, graph, _version = scope
        _parent, attachments, version = self._qorlia_checkpoint_attachment_snapshot(checkpoint.id)
        if version != payload['version']:
            raise UserError('The checkpoint or attachments changed. Reload before changing files.')
        if not set(payload['remove_ids']).issubset(attachments.ids):
            raise AccessError('A selected attachment does not belong to this checkpoint.')
        # Lock all current files too; an independent native file edit must invalidate this transaction.
        self.env.cr.execute('SELECT id FROM ir_attachment WHERE id IN %s ORDER BY id FOR UPDATE',
            [tuple(attachments.ids) or (0,)])
        attachments.invalidate_recordset()
        _parent, attachments, current = self._qorlia_checkpoint_attachment_snapshot(checkpoint.id)
        if current != version:
            raise UserError('The attachment list changed. Reload before changing files.')
        before = model._qorlia_checkpoint_editor_result(checkpoint, checkpoints, lines, graph)
        file_before = attachments.read(list(FILE_FIELDS))
        attachment_model = self.env['ir.attachment']
        if files:
            attachment_model.check_access_rights('create')
            attachment_model.check('create', {'res_model': self._name, 'res_id': checkpoint.id})
        hooks = {name: (getattr(self.env.cr, name), list(getattr(self.env.cr, name)._funcs),
            copy.deepcopy(getattr(self.env.cr, name).data)) for name in ('postcommit', 'prerollback', 'postrollback')}
        try:
            with self.env.cr.savepoint():
                created = attachment_model.with_context(image_no_postprocess=True).create([
                    {'name': name, 'type': 'binary', 'raw': raw, 'res_model': self._name,
                        'res_id': checkpoint.id, 'company_id': (checkpoint.company_id or self.env.company).id}
                    for name, raw in files]) if files else attachment_model.browse()
                checkpoint.write({'attachment_ids': [Command.unlink(value) for value in payload['remove_ids']]
                    + [Command.link(value) for value in created.ids]})
                receipts = dict(checkpoint.qorlia_checkpoint_edit_receipts or {})
                receipts[request_key] = {'hash': digest, 'author': self.env.uid}
                checkpoint.with_context(qorlia_checkpoint_receipt_token=_RECEIPT_TOKEN).write({
                    'qorlia_checkpoint_edit_receipts': receipts})
                self.env.cr.flush()
                created.invalidate_recordset()
                checkpoint.check_access_rule('write')
                _parent, linked, _current = self._qorlia_checkpoint_attachment_snapshot(checkpoint.id)
                expected = (set(attachments.ids) - set(payload['remove_ids'])) | set(created.ids)
                if (set(linked.ids) != expected or attachments.read(list(FILE_FIELDS)) != file_before
                        or model._qorlia_checkpoint_editor_result(checkpoint, checkpoints, lines, graph) != before):
                    raise UserError('Native Billing changed unrelated files or accounting. Nothing was saved.')
                for record, (name, raw) in zip(created, files):
                    if (record.name != name or record.type != 'binary' or (record.raw or b'') != raw
                            or record.file_size != len(raw) or record.public or record.res_field or record.access_token
                            or record.res_model != self._name or record.res_id != checkpoint.id
                            or record.company_id != (checkpoint.company_id or self.env.company)):
                        raise UserError('The stored attachment differs from the requested file. Nothing was saved.')
                return self.qorlia_checkpoint_attachment_status(payload, request_key)
        except Exception:
            for name, (callbacks, functions, data) in hooks.items():
                setattr(self.env.cr, name, callbacks)
                callbacks.clear()
                for function in functions:
                    callbacks.add(function)
                callbacks.data.update(data)
            raise
