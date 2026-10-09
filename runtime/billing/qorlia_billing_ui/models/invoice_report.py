# SPDX-License-Identifier: LGPL-3.0-or-later
# Copyright 2026 Qorlia contributors.
from odoo import api, models
from odoo.exceptions import UserError

from .native_reports import native_report, report_menu, report_pdf


REPORTS = {
    'invoice': ('account.account_invoices', 'account.report_invoice_with_payments'),
    'invoice_without_payments': ('account.account_invoices_without_payment', 'account.report_invoice'),
}


class AccountMove(models.Model):
    _inherit = 'account.move'

    def _qorlia_invoice_report(self, key):
        return native_report(self.env, key, REPORTS, 'account.move', 'invoice')

    @api.model
    def qorlia_invoice_report_list(self, invoice_id):
        self._qorlia_invoice(invoice_id)
        return {'invoice_id': invoice_id, 'reports': report_menu(self.env, REPORTS, 'account.move', 'invoice')}

    @api.model
    def qorlia_invoice_report_download(self, invoice_id, report_key):
        invoice = self._qorlia_invoice(invoice_id, lock=True)
        report = self._qorlia_invoice_report(report_key)
        snapshot = invoice._qorlia_invoice_snapshot()
        if not snapshot['ledger_balanced'] or not invoice.currency_id.is_zero(invoice.amount_total - invoice.invoice_total):
            raise UserError('Review and save the invoice adjustments and journal balance before printing.')
        return report_pdf(report, invoice, report_key, 'invoice_id', invoice._get_report_base_filename())
