# SPDX-License-Identifier: LGPL-3.0-or-later
# Copyright 2026 Qorlia contributors.
from odoo import api, models
from odoo.exceptions import AccessError, UserError, ValidationError

from .invoice_draft import _digest


class BankStatementLine(models.Model):
    _inherit = 'account.bank.statement.line'

    def _qorlia_bank_access(self):
        if not self.env.user.has_group('base.group_user'):
            raise AccessError('Bank statements require an internal Billing account.')
        self.check_access_rights('read')
        self.check_access_rule('read')
        for records in (self.move_id, self.journal_id, self.company_id, self.partner_id,
                        self.statement_id, self.currency_id, self.foreign_currency_id,
                        self.company_id.currency_id, self.journal_id.default_account_id,
                        self.journal_id.suspense_account_id):
            records.check_access_rights('read')
            records.check_access_rule('read')
        if any(row.company_id not in self.env.companies or row.journal_id.type not in ('bank', 'cash') for row in self):
            raise AccessError('Select bank or cash entries in your active Billing companies.')

    def _qorlia_bank_origin(self, statement_line_id):
        if type(statement_line_id) is not int or statement_line_id <= 0:
            raise ValidationError('Select a saved bank or cash statement entry.')
        row = self.browse(statement_line_id).exists()
        if not row:
            raise UserError('This statement entry is no longer available.')
        row._qorlia_bank_access()
        return row

    def _qorlia_bank_page(self, search, offset):
        if (not isinstance(search, str) or len(search) > 160
                or type(offset) is not int or not 0 <= offset <= 2147483647):
            raise ValidationError('Use a valid statement search and page.')

    @api.model
    def qorlia_bank_history(self, search='', state='all', offset=0):
        self._qorlia_bank_page(search, offset)
        self._qorlia_bank_access()
        if state not in ('all', 'unmatched', 'matched'):
            raise ValidationError('Select all, unmatched or matched statement entries.')
        domain = [('company_id', 'in', self.env.companies.ids), ('journal_id.type', 'in', ('bank', 'cash'))]
        if state != 'all':
            domain.append(('is_reconciled', '=', state == 'matched'))
        if search.strip():
            domain += ['|', '|', '|', ('payment_ref', 'ilike', search.strip()),
                       ('partner_id.name', 'ilike', search.strip()), ('move_id.name', 'ilike', search.strip()),
                       ('statement_id.name', 'ilike', search.strip())]
        entries = self.search(domain, offset=offset, limit=26, order='date desc,id desc')
        entries[:25]._qorlia_bank_access()
        return {'rows': entries[:25].read(['date', 'payment_ref', 'partner_id', 'journal_id', 'statement_id',
            'move_id', 'state', 'amount', 'currency_id', 'foreign_currency_id', 'amount_currency',
            'amount_residual', 'is_reconciled']), 'offset': offset, 'has_more': len(entries) > 25}

    def _qorlia_bank_ledger(self):
        self.ensure_one()
        # One2many access can omit denied rows; totals must include every native ledger item or fail.
        self.env['account.move.line'].flush_model(['move_id'])
        self.env.cr.execute('SELECT id FROM account_move_line WHERE move_id = %s ORDER BY id', [self.move_id.id])
        lines = self.env['account.move.line'].browse([item[0] for item in self.env.cr.fetchall()])
        lines.check_access_rights('read')
        lines.check_access_rule('read')
        for records in (lines.account_id, lines.partner_id, lines.currency_id):
            records.check_access_rights('read')
            records.check_access_rule('read')
        return lines

    def _qorlia_bank_version(self, lines):
        return _digest({'author': self.env.uid, 'companies': self.env.companies.ids,
            'entry': self.read(['write_date', 'date', 'payment_ref', 'journal_id', 'state', 'amount', 'amount_currency', 'amount_residual',
                'currency_id', 'foreign_currency_id', 'partner_id', 'is_reconciled', 'statement_id']),
            'move': self.move_id.read(['write_date', 'date', 'state']),
            'journal': self.journal_id.read(['write_date', 'default_account_id', 'suspense_account_id']),
            'ledger': lines.read(['write_date', 'account_id', 'debit', 'credit', 'currency_id', 'amount_currency',
                'amount_residual', 'amount_residual_currency', 'matched_debit_ids', 'matched_credit_ids'])})

    @api.model
    def qorlia_bank_detail(self, statement_line_id, after=False, version=False):
        if ((after is not False and (type(after) is not int or after <= 0))
                or (version is not False and (not isinstance(version, str) or len(version) != 64
                    or any(char not in '0123456789abcdef' for char in version))) or (after and not version)):
            raise ValidationError('Reload the statement entry before reading its next ledger page.')
        entry = self._qorlia_bank_origin(statement_line_id)
        lines = entry._qorlia_bank_ledger()
        current = entry._qorlia_bank_version(lines)
        if version and version != current:
            raise UserError('The statement entry changed. Reload its complete ledger.')
        if after and after not in lines.ids:
            raise ValidationError('This ledger cursor belongs to another entry.')
        page = lines.filtered(lambda line: not after or line.id > after)[:101]
        selected = page[:100]
        liquidity, suspense, other = entry._seek_for_lines()
        rows = selected.read(['name', 'account_id', 'partner_id', 'date', 'debit', 'credit', 'balance',
            'currency_id', 'amount_currency', 'amount_residual', 'amount_residual_currency', 'reconciled', 'matching_number'])
        for row in rows:
            row['kind'] = 'liquidity' if row['id'] in liquidity.ids else 'suspense' if row['id'] in suspense.ids else 'counterpart'
        debit, credit = sum(lines.mapped('debit')), sum(lines.mapped('credit'))
        currency = entry.company_id.currency_id
        return {'statement_line_id': entry.id, 'version': current, 'after': after,
            'next_after': selected[-1].id if len(page) > 100 else False, 'total_count': len(lines),
            'entry': entry._qorlia_bank_history_entry(), 'company': entry.company_id.display_name,
            'company_currency': [currency.id, currency.name], 'debit': debit, 'credit': credit,
            'balanced': currency.is_zero(debit - credit), 'rows': rows}

    def _qorlia_bank_history_entry(self):
        self.ensure_one()
        self._qorlia_bank_access()
        return self.read(['date', 'payment_ref', 'partner_id', 'journal_id', 'statement_id', 'move_id', 'state',
            'amount', 'currency_id', 'foreign_currency_id', 'amount_currency', 'amount_residual', 'is_reconciled'])[0]

    @api.model
    def qorlia_bank_candidates(self, statement_line_id, version, search='', offset=0):
        self._qorlia_bank_page(search, offset)
        if not isinstance(version, str) or len(version) != 64 or any(char not in '0123456789abcdef' for char in version):
            raise ValidationError('Reload the statement entry before finding possible matches.')
        entry = self._qorlia_bank_origin(statement_line_id)
        current = entry._qorlia_bank_version(entry._qorlia_bank_ledger())
        if version != current:
            raise UserError('The statement entry changed. Reload before finding possible matches.')
        domain = entry._get_default_amls_matching_domain() + [('move_id', '!=', entry.move_id.id)]
        if search.strip():
            domain += ['|', '|', ('name', 'ilike', search.strip()), ('move_id.name', 'ilike', search.strip()),
                       ('partner_id.name', 'ilike', search.strip())]
        lines = self.env['account.move.line'].search(domain, offset=offset, limit=26, order='date,id')
        for records in (lines[:25], lines[:25].move_id, lines[:25].account_id, lines[:25].partner_id, lines[:25].currency_id):
            records.check_access_rights('read')
            records.check_access_rule('read')
        return {'statement_line_id': entry.id, 'version': current, 'offset': offset, 'has_more': len(lines) > 25,
            'rows': lines[:25].read(['name', 'move_id', 'account_id', 'partner_id', 'date', 'debit', 'credit',
                'currency_id', 'amount_currency', 'amount_residual', 'amount_residual_currency', 'reconciled'])}
