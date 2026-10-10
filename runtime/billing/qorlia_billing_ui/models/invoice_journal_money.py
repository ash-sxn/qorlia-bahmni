# SPDX-License-Identifier: LGPL-3.0-or-later
# Copyright 2026 Qorlia contributors.
from contextlib import closing

from odoo import models, tools

from .invoice_draft import _digest


MONEY_TOTALS = ('state', 'payment_state', 'amount_untaxed', 'amount_tax', 'amount_total',
                'invoice_total', 'amount_residual')
MONEY_ROWS = ('name', 'account_id', 'partner_id', 'date_maturity', 'currency_id',
              'amount_currency', 'debit', 'credit', 'balance', 'tax_ids', 'tax_tag_ids',
              'discount_date', 'discount_amount_currency', 'product_id', 'product_uom_id',
              'quantity', 'price_unit', 'price_subtotal', 'price_total', 'discount', 'sequence',
              'display_type', 'qorlia_adjustment_kind', 'amount_residual',
              'amount_residual_currency', 'reconciled', 'matched_debit_ids',
              'matched_credit_ids', 'full_reconcile_id')


class InvoiceJournalMoney(models.Model):
    _inherit = 'account.move'

    def _qorlia_journal_money_snapshot(self, source_ids):
        self.ensure_one()
        self.env['account.move.line'].flush_model(['move_id'])
        self.env.cr.execute('SELECT id FROM account_move_line WHERE move_id = %s ORDER BY id', [self.id])
        lines = self.env['account.move.line'].browse([row[0] for row in self.env.cr.fetchall()])
        lines.check_access_rights('read')
        lines.check_access_rule('read')
        names = MONEY_ROWS + (('analytic_distribution',) if self.env.user.has_group(
            'analytic.group_analytic_accounting') else ())
        reader = self.env['sale.order']._qorlia_read_fields
        rows = [{'id': line.id if line.id in source_ids else False, 'values': reader(line, names)}
                for line in lines]
        for row in rows:
            for name in ('tax_ids', 'tax_tag_ids', 'matched_debit_ids', 'matched_credit_ids'):
                row['values'][name] = sorted(row['values'][name])
        rows.sort(key=lambda row: (row['id'] is False, row['id'] or 0, _digest(row['values'])))
        return {'invoice_id': self.id, 'totals': reader(self, MONEY_TOTALS), 'rows': rows}

    def _qorlia_journal_money_simulate(self, commands):
        self.ensure_one()
        invoice = self._qorlia_journal_document(self.id, 'write', True)
        source_ids = set(invoice.line_ids.ids)
        cr = self.env.cr
        cr.flush()
        hooks = {name: getattr(cr, name) for name in ('postcommit', 'prerollback', 'postrollback')}
        try:
            for name in hooks:
                setattr(cr, name, tools.Callbacks())
            # Native onchange differs from write; always roll back the native calculation and its hooks.
            with closing(cr.savepoint()):
                document = invoice.with_context(tracking_disable=True, mail_create_nosubscribe=True,
                    mail_notify_force_send=False)
                document.write({'line_ids': commands})
                cr.flush()
                return document._qorlia_journal_money_snapshot(source_ids)
        finally:
            for name, callbacks in hooks.items():
                setattr(cr, name, callbacks)
