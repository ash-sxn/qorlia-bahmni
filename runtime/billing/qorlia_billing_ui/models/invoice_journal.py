# SPDX-License-Identifier: LGPL-3.0-or-later
# Copyright 2026 Qorlia contributors.
import hashlib
import json

from odoo import api, models
from odoo.exceptions import AccessError, UserError, ValidationError


class InvoiceJournal(models.Model):
    _inherit = 'account.move'

    @api.model
    def qorlia_invoice_journal(self, invoice_id, after=False, version=False):
        if not self.env.user.has_group('base.group_user'):
            raise AccessError('Journal items require an internal Billing account.')
        if after is not False and (type(after) is not int or after <= 0):
            raise ValidationError('Use a valid journal item cursor.')
        if version is not False and (not isinstance(version, str) or len(version) != 64
                                     or any(char not in '0123456789abcdef' for char in version)):
            raise ValidationError('Reload the current journal items.')
        if after and not version:
            raise ValidationError('Reload the journal before reading another page.')
        invoice = self._qorlia_invoice(invoice_id)
        # One2many reads can filter denied rows; check every ID before exposing full totals.
        self.env['account.move.line'].flush_model(['move_id', 'display_type'])
        self.env.cr.execute("SELECT id FROM account_move_line WHERE move_id = %s "
                            "AND COALESCE(display_type, '') NOT IN ('line_section', 'line_note') ORDER BY id",
                            [invoice.id])
        lines = self.env['account.move.line'].browse([row[0] for row in self.env.cr.fetchall()])
        lines.check_access_rights('read')
        lines.check_access_rule('read')
        stamps = lines.sorted('id').read(['write_date'])
        current = hashlib.sha256(json.dumps(
            [invoice.id, str(invoice.write_date), invoice.state, stamps],
            sort_keys=True, default=str).encode()).hexdigest()
        if version and version != current:
            raise UserError('The journal changed. Reload all journal items before continuing.')
        if after and after not in lines.ids:
            raise ValidationError('This journal cursor does not belong to the invoice.')
        page = lines.filtered(lambda line: not after or line.id > after).sorted('id')[:101]
        selected = page[:100]
        fields = ['name', 'account_id', 'partner_id', 'date', 'date_maturity', 'debit', 'credit',
                  'balance', 'currency_id', 'amount_currency', 'amount_residual',
                  'amount_residual_currency', 'reconciled', 'matching_number', 'tax_ids',
                  'tax_tag_ids', 'display_type', 'qorlia_adjustment_kind']
        analytics = self.env.user.has_group('analytic.group_analytic_accounting')
        if analytics:
            fields.append('analytic_distribution')
        rows = selected.read(fields)
        # Tax and grid records have different models; read each with native ACLs.
        for records in (selected.tax_ids, selected.tax_tag_ids):
            records.check_access_rights('read')
            records.check_access_rule('read')
        tax_names = dict(selected.tax_ids.name_get())
        grid_names = dict(selected.tax_tag_ids.name_get())
        for row in rows:
            row['tax_ids'] = [[identifier, tax_names[identifier]] for identifier in row['tax_ids']]
            row['tax_tag_ids'] = [[identifier, grid_names[identifier]] for identifier in row['tax_tag_ids']]
            if not analytics:
                row['analytic_distribution'] = False
        debit, credit = sum(lines.mapped('debit')), sum(lines.mapped('credit'))
        currency = invoice.company_currency_id
        return {
            'invoice_id': invoice.id, 'name': invoice.name or False, 'state': invoice.state,
            'journal': invoice.journal_id.display_name, 'company': invoice.company_id.display_name,
            'currency': [currency.id, currency.name], 'date': str(invoice.date) if invoice.date else False,
            'version': current, 'after': after, 'next_after': selected[-1].id if len(page) > 100 else False,
            'total_count': len(lines), 'debit': debit, 'credit': credit,
            'balanced': currency.is_zero(debit - credit), 'analytics_visible': analytics, 'rows': rows,
        }
