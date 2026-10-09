# SPDX-License-Identifier: LGPL-3.0-or-later
# Copyright 2026 Qorlia contributors.
from datetime import date

from odoo import api, models
from odoo.exceptions import AccessError, UserError, ValidationError


class AccountMove(models.Model):
    _inherit = 'account.move'

    @api.model
    def qorlia_customer_statement(self, invoice_id, date_from, date_to):
        invoice = self._qorlia_invoice(invoice_id)
        if not self.env.user.has_group('account.group_account_readonly'):
            raise AccessError('Your Billing account needs accounting read access to view customer statements.')
        dates = []
        for value in (date_from, date_to):
            try:
                parsed = date.fromisoformat(value) if type(value) is str else None
            except ValueError:
                parsed = None
            if not parsed or parsed.isoformat() != value:
                raise ValidationError('Choose valid statement dates in YYYY-MM-DD format.')
            dates.append(parsed)
        if dates[0] > dates[1]:
            raise ValidationError('The statement start date must not be after its end date.')
        customer = invoice.commercial_partner_id
        if not customer:
            raise UserError('This invoice has no customer account to review.')
        for records in (customer, invoice.company_id, invoice.company_id.currency_id):
            records.check_access_rights('read')
            records.check_access_rule('read')
        # Use posted native receivables, including payments/credits, not current invoice residuals.
        lines = self.env['account.move.line'].search([
            ('company_id', '=', invoice.company_id.id),
            ('partner_id', 'child_of', customer.id),
            ('account_id.account_type', '=', 'asset_receivable'),
            ('parent_state', '=', 'posted'), ('date', '<=', date_to),
        ], order='date, move_id, id', limit=2001)
        if len(lines) > 2000:
            raise UserError('This customer has more than 2,000 posted receivable entries. An accountant must review the full native ledger; this screen will not truncate the statement.')
        lines.check_access_rights('read')
        lines.check_access_rule('read')
        for records in (lines.move_id, lines.account_id, lines.currency_id, lines.journal_id):
            records.check_access_rights('read')
            records.check_access_rule('read')
        if lines.move_id._get_unbalanced_moves({'records': lines.move_id}):
            raise UserError('A linked customer journal is unbalanced. Ask your accountant to review it before using this statement.')
        currency = invoice.company_id.currency_id
        opening = currency.round(sum(line.balance for line in lines if line.date < dates[0]))
        balance = opening
        rows = []
        for line in lines.filtered(lambda item: item.date >= dates[0]):
            balance = currency.round(balance + line.balance)
            rows.append({'id': line.id, 'move_id': line.move_id.id, 'date': str(line.date),
                'document': line.move_id.name, 'move_type': line.move_id.move_type,
                'reference': line.move_id.ref or False, 'label': line.name or False,
                'journal': line.journal_id.display_name, 'account': line.account_id.display_name,
                'debit': line.debit, 'credit': line.credit, 'balance': balance,
                'currency': [line.currency_id.id, line.currency_id.name], 'amount_currency': line.amount_currency})
        return {'invoice_id': invoice.id, 'customer': customer.display_name,
            'company': invoice.company_id.display_name, 'currency': [currency.id, currency.name],
            'date_from': date_from, 'date_to': date_to, 'opening': opening,
            'debit': currency.round(sum(row['debit'] for row in rows)),
            'credit': currency.round(sum(row['credit'] for row in rows)), 'closing': balance, 'rows': rows}
