# SPDX-License-Identifier: LGPL-3.0-or-later
# Copyright 2026 Qorlia contributors.
from odoo import api, models
from odoo.exceptions import UserError, ValidationError

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
        invoice._qorlia_check_invoice_printable()
        return report_pdf(report, invoice, report_key, 'invoice_id', invoice._get_report_base_filename())

    def _qorlia_check_invoice_printable(self):
        for invoice in self:
            snapshot = invoice._qorlia_invoice_snapshot()
            if not snapshot['ledger_balanced'] or not invoice.currency_id.is_zero(invoice.amount_total - invoice.invoice_total):
                raise UserError('Review and save the invoice adjustments and journal balance before printing.')

    def _qorlia_invoice_report_batch(self, invoice_ids, lock=False):
        # shortcut: one table page per synchronous PDF; add queued generation for larger batches.
        if (not isinstance(invoice_ids, list) or not 1 <= len(invoice_ids) <= 25
                or any(type(item) is not int or item <= 0 for item in invoice_ids)
                or len(set(invoice_ids)) != len(invoice_ids)):
            raise ValidationError('Select between 1 and 25 distinct customer invoices or credit notes.')
        # Stable lock order prevents two overlapping print requests from deadlocking.
        for invoice_id in sorted(invoice_ids):
            self._qorlia_invoice(invoice_id, lock=lock)
        return self.browse(invoice_ids)

    @api.model
    def qorlia_invoice_batch_report_list(self, invoice_ids):
        invoices = self._qorlia_invoice_report_batch(invoice_ids)
        return {'invoice_ids': invoices.ids, 'reports': report_menu(self.env, REPORTS, 'account.move', 'invoice')}

    @api.model
    def qorlia_invoice_batch_report_download(self, invoice_ids, report_key):
        invoices = self._qorlia_invoice_report_batch(invoice_ids, lock=True)
        report = self._qorlia_invoice_report(report_key)
        invoices._qorlia_check_invoice_printable()
        return report_pdf(report, invoices, report_key, 'invoice_ids', 'Invoice_batch', multiple=True)
