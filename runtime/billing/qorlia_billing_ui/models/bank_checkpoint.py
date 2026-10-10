# SPDX-License-Identifier: LGPL-3.0-or-later
# Copyright 2026 Qorlia contributors.
from odoo import api, models
from odoo.exceptions import AccessError, UserError, ValidationError

from .invoice_draft import _digest


CHECKPOINT_FIELDS = ('name', 'reference', 'date', 'journal_id', 'company_id', 'currency_id',
    'balance_start', 'balance_end', 'balance_end_real', 'is_complete', 'is_valid', 'problem_description')


class BankCheckpoint(models.Model):
    _inherit = 'account.bank.statement'

    def _qorlia_checkpoint_access(self):
        if not self.env.user.has_group('base.group_user'):
            raise AccessError('Statement checkpoints require an internal Billing account.')
        self.check_access_rights('read')
        self.check_access_rule('read')
        if any(row.company_id and row.company_id not in self.env.companies
                or row.journal_id and row.journal_id.type not in ('bank', 'cash') for row in self):
            raise AccessError('Select bank or cash checkpoints in your active companies.')
        for records in (self.company_id, self.journal_id, self.currency_id):
            records.check_access_rights('read')
            records.check_access_rule('read')

    def _qorlia_checkpoint_lines(self):
        self.ensure_one()
        self.env['account.bank.statement.line'].flush_model(['statement_id', 'internal_index'])
        # Do not compute checkpoint status over an ORM subset with hidden statement entries.
        self.env.cr.execute('SELECT id FROM account_bank_statement_line WHERE statement_id = %s '
            'ORDER BY internal_index DESC, id DESC', [self.id])
        lines = self.env['account.bank.statement.line'].browse([row[0] for row in self.env.cr.fetchall()])
        lines._qorlia_bank_access()
        return lines

    def _qorlia_checkpoint_row(self):
        self.ensure_one()
        self._qorlia_checkpoint_access()
        self._qorlia_checkpoint_lines()
        self._qorlia_checkpoint_previous()
        # Native validity depends on the previous statement, outside its computed-field dependencies.
        self.invalidate_recordset(['is_valid', 'problem_description'])
        return self.read(list(CHECKPOINT_FIELDS))[0]

    def _qorlia_checkpoint_previous(self):
        self.ensure_one()
        self.flush_model(['first_line_index', 'journal_id', 'balance_end_real'])
        if not self.journal_id or not self.first_line_index:
            return self.browse()
        self.env.cr.execute('SELECT id FROM account_bank_statement '
            'WHERE journal_id = %s AND first_line_index < %s '
            'ORDER BY first_line_index DESC LIMIT 1', [self.journal_id.id, self.first_line_index])
        result = self.env.cr.fetchone()
        previous = self.browse(result[0] if result else [])
        previous._qorlia_checkpoint_access()
        if previous:
            previous._qorlia_checkpoint_lines()
        return previous

    @api.model
    def qorlia_checkpoint_history(self, search='', state='all', journal_type='all', offset=0):
        self.env['account.bank.statement.line']._qorlia_bank_page(search, offset)
        self._qorlia_checkpoint_access()
        if state not in ('all', 'invalid', 'empty') or journal_type not in ('all', 'bank', 'cash'):
            raise ValidationError('Select a valid checkpoint status and journal type.')
        domain = ['|', ('company_id', 'in', self.env.companies.ids), ('company_id', '=', False),
            '|', ('journal_id', '=', False),
            ('journal_id.type', 'in', ('bank', 'cash') if journal_type == 'all' else (journal_type,))]
        if state == 'empty':
            domain.append(('line_ids', '=', False))
        elif state == 'invalid':
            domain += ['|', ('is_valid', '=', False), ('is_complete', '=', False)]
        if search.strip():
            domain += ['|', '|', ('name', 'ilike', search.strip()),
                ('reference', 'ilike', search.strip()), ('journal_id.name', 'ilike', search.strip())]
        records = self.search(domain, offset=offset, limit=26, order='first_line_index desc,id desc')
        return {'rows': [row._qorlia_checkpoint_row() for row in records[:25]],
            'offset': offset, 'has_more': len(records) > 25}

    @api.model
    def qorlia_checkpoint_detail(self, checkpoint_id, after=False, version=False):
        if (type(checkpoint_id) is not int or checkpoint_id <= 0
                or after is not False and (type(after) is not int or after <= 0)
                or version is not False and (not isinstance(version, str) or len(version) != 64
                    or any(char not in '0123456789abcdef' for char in version))
                or after and not version):
            raise ValidationError('Reload a saved checkpoint before reading its next entry page.')
        checkpoint = self.browse(checkpoint_id).exists()
        if not checkpoint:
            raise UserError('This statement checkpoint is no longer available.')
        row = checkpoint._qorlia_checkpoint_row()
        lines = checkpoint._qorlia_checkpoint_lines()
        current = _digest({'author': self.env.uid, 'companies': self.env.companies.ids,
            'checkpoint': row, 'source': checkpoint.read(['write_date', 'first_line_index']),
            'previous': checkpoint._qorlia_checkpoint_previous().read([
                'write_date', 'first_line_index', 'balance_end_real']),
            'currency': checkpoint.currency_id.read(['write_date', 'rounding']),
            'entries': lines.read(['write_date', 'internal_index', 'date', 'payment_ref', 'partner_id',
                'journal_id', 'statement_id', 'move_id', 'state', 'amount', 'currency_id',
                'foreign_currency_id', 'amount_currency', 'amount_residual', 'is_reconciled'])})
        if version and version != current:
            raise UserError('The statement checkpoint changed. Reload its complete entries.')
        if after and after not in lines.ids:
            raise ValidationError('This entry cursor belongs to another checkpoint.')
        start = lines.ids.index(after) + 1 if after else 0
        page = lines[start:start + 101]
        return {'checkpoint_id': checkpoint.id, 'checkpoint': row, 'version': current,
            'after': after, 'next_after': page[99].id if len(page) > 100 else False,
            'total_count': len(lines), 'rows': [line._qorlia_bank_history_entry() for line in page[:100]]}
