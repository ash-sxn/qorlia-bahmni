# SPDX-License-Identifier: LGPL-3.0-or-later
# Copyright 2026 Qorlia contributors.
from odoo import api, models
from odoo.exceptions import UserError, ValidationError

from .native_reports import native_report, report_menu, report_pdf
from .invoice_draft import _digest

REPORTS = {
    'payment_receipt': ('account.action_report_payment_receipt', 'account.report_payment_receipt'),
    'receipt': ('bahmni_auto_payment_reconciliation.account_payment_invoices_receipt',
                'bahmni_auto_payment_reconciliation.report_payment_invoice'),
    'receipt_summary': ('bahmni_auto_payment_reconciliation.account_payment_summary_receipt',
                        'bahmni_auto_payment_reconciliation.report_payment_summary'),
}


class AccountPayment(models.Model):
    _inherit = 'account.payment'

    def _qorlia_receipt_payment(self, payment_id, lock=False):
        if type(payment_id) is not int or payment_id <= 0:
            raise ValidationError('Select a valid saved customer payment.')
        payment = self.browse(payment_id).exists()
        if not payment:
            raise UserError('The customer payment is no longer available.')
        payment.check_access_rights('read')
        payment.check_access_rule('read')
        if lock:
            self.env.cr.execute('SELECT id FROM account_payment WHERE id = %s FOR UPDATE', [payment.id])
            payment.invalidate_recordset()
            payment.check_access_rule('read')
        if payment.partner_type != 'customer' or payment.is_internal_transfer or payment.state != 'posted':
            raise UserError('Receipts are available for posted customer payments and refunds, not draft, cancelled or internal payments.')
        moves = payment.move_id | payment.reconciled_invoice_ids
        moves.check_access_rights('read')
        moves.check_access_rule('read')
        moves.line_ids.check_access_rights('read')
        moves.line_ids.check_access_rule('read')
        if lock and moves._get_unbalanced_moves({'records': moves}):
            raise UserError('Review the payment and invoice journal balance before printing a receipt.')
        if lock and any(not invoice.currency_id.is_zero(invoice.amount_total - invoice.invoice_total)
                        for invoice in payment.reconciled_invoice_ids):
            raise UserError('Review and save the linked invoice adjustments before printing a receipt.')
        return payment

    def _qorlia_receipt_rows(self):
        self.ensure_one()
        payment = self._qorlia_receipt_payment(self.id)
        rows = []
        # Native partial amounts are in each invoice's currency, not necessarily the payment currency.
        for invoice in payment.reconciled_invoice_ids.sorted('id'):
            items = invoice.invoice_line_ids.filtered(lambda line: not line.qorlia_adjustment_kind)
            sales = items.sale_line_ids
            orders = sales.order_id | invoice.order_id
            for records in (sales, orders, sales.lot_id):
                if records:
                    records.check_access_rights('read')
                    records.check_access_rule('read')
            partials, _ = invoice._get_reconciled_invoices_partials()
            rows.append({'invoice': invoice, 'items': items, 'orders': orders,
                'allocated': sum(amount for _, amount, line in partials if line.move_id == payment.move_id)})
        return rows

    def _qorlia_receipt_archive_name(self, variant):
        if variant not in ('receipt', 'summary'):
            raise ValidationError('Select an available receipt archive.')
        rows = self._qorlia_receipt_rows()
        # Keep prior archives, but never reuse a pre-fix or outdated reconciliation snapshot.
        snapshot = [str(self.write_date), str(self.partner_id.write_date), str(self.company_id.write_date)]
        for row in rows:
            invoice = row['invoice']
            snapshot.append([invoice.id, str(invoice.write_date), invoice.amount_residual, row['allocated'],
                invoice.line_ids.read(['write_date', 'matched_debit_ids', 'matched_credit_ids']),
                row['orders'].read(['write_date']), row['items'].sale_line_ids.read(['write_date', 'expiry_date']),
                row['items'].sale_line_ids.lot_id.read(['write_date'])])
        return 'Qorlia_%s_%s_v1_%s.pdf' % (self.id, variant, _digest(snapshot)[:24])

    @api.model
    def qorlia_payment_report_list(self, payment_id):
        self._qorlia_receipt_payment(payment_id)
        return {'payment_id': payment_id, 'reports': report_menu(self.env, REPORTS, 'account.payment', 'payment')}

    @api.model
    def qorlia_payment_report_download(self, payment_id, report_key):
        payment = self._qorlia_receipt_payment(payment_id, lock=True)
        report = native_report(self.env, report_key, REPORTS, 'account.payment', 'payment')
        return report_pdf(report, payment, report_key, 'payment_id', payment.name)
