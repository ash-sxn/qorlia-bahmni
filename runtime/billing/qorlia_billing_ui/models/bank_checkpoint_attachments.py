# SPDX-License-Identifier: LGPL-3.0-or-later
# Copyright 2026 Qorlia contributors.
from odoo import api, models
from odoo.exceptions import AccessError, UserError, ValidationError
from psycopg2 import sql

from .invoice_draft import _digest
from .invoice_messages import attachment_download_values, safe_filename


class BankCheckpointAttachments(models.Model):
    _inherit = 'account.bank.statement'

    def _qorlia_checkpoint_attachment_snapshot(self, checkpoint_id):
        if type(checkpoint_id) is not int or checkpoint_id <= 0:
            raise ValidationError('Select a saved statement checkpoint.')
        checkpoint = self.browse(checkpoint_id).exists()
        if not checkpoint:
            raise UserError('This statement checkpoint is no longer available.')
        checkpoint._qorlia_checkpoint_access()
        # Native M2M reads may silently filter inaccessible attachments before their parent is checked.
        field = self._fields['attachment_ids']
        checkpoint.flush_recordset(['attachment_ids'])
        self.env.cr.execute(sql.SQL('SELECT {file} FROM {relation} WHERE {parent} = %s ORDER BY {file} DESC').format(
            file=sql.Identifier(field.column2), relation=sql.Identifier(field.relation),
            parent=sql.Identifier(field.column1)), [checkpoint.id])
        attachments = self.env['ir.attachment'].browse([row[0] for row in self.env.cr.fetchall()])
        attachments.check_access_rights('read')
        attachments.check_access_rule('read')
        attachments.check('read')
        version = _digest({'author': self.env.uid, 'companies': self.env.companies.ids,
            'checkpoint': checkpoint.read(['write_date']), 'attachment_ids': attachments.ids,
            'attachments': attachments.read(['write_date', 'name', 'type', 'file_size', 'checksum',
                'url', 'res_model', 'res_id', 'res_field'])})
        return checkpoint, attachments, version

    @api.model
    def qorlia_checkpoint_attachments(self, checkpoint_id, after=False, version=False):
        if (after is not False and (type(after) is not int or after <= 0)
                or version is not False and (not isinstance(version, str) or len(version) != 64
                    or any(char not in '0123456789abcdef' for char in version))
                or after and not version):
            raise ValidationError('Reload the checkpoint attachments before reading the next page.')
        checkpoint, attachments, current = self._qorlia_checkpoint_attachment_snapshot(checkpoint_id)
        if version and current != version:
            raise UserError('The checkpoint attachments changed. Reload the complete attachment list.')
        if after and after not in attachments.ids:
            raise ValidationError('This attachment cursor belongs to another checkpoint.')
        start = attachments.ids.index(after) + 1 if after else 0
        page = attachments[start:start + 31]
        return {'checkpoint_id': checkpoint.id, 'version': current, 'after': after,
            'total_count': len(attachments), 'next_after': page[29].id if len(page) > 30 else False,
            'rows': [{'id': row.id,
                'name': row.name if safe_filename(row.name) else 'Attachment-%s' % row.id,
                'kind': row.type, 'byte_count': row.file_size} for row in page[:30]]}

    @api.model
    def qorlia_checkpoint_attachment_download(self, checkpoint_id, attachment_id, version):
        if (type(attachment_id) is not int or attachment_id <= 0
                or not isinstance(version, str) or len(version) != 64
                or any(char not in '0123456789abcdef' for char in version)):
            raise ValidationError('Select an attachment from the current checkpoint list.')
        checkpoint, attachments, current = self._qorlia_checkpoint_attachment_snapshot(checkpoint_id)
        if current != version:
            raise UserError('The checkpoint attachments changed. Reload them before downloading.')
        attachment = attachments.filtered(lambda row: row.id == attachment_id)
        if not attachment:
            raise AccessError('This attachment does not belong to the selected checkpoint.')
        # Native attachment checks above also authorize any original parent of a shared M2M file.
        return dict({'checkpoint_id': checkpoint.id, 'attachment_id': attachment.id,
            'version': current}, **attachment_download_values(attachment))
