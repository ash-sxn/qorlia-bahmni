# SPDX-License-Identifier: LGPL-3.0-or-later
# Copyright 2026 Qorlia contributors.
import base64
import re

from odoo import api, models
from odoo.exceptions import AccessError, UserError, ValidationError


REPORTS = {
    'invoice': ('account.account_invoices', 'account.report_invoice_with_payments'),
    'invoice_without_payments': ('account.account_invoices_without_payment', 'account.report_invoice'),
}
MAX_PDF_BYTES = 10 * 1024 * 1024


class AccountMove(models.Model):
    _inherit = 'account.move'

    def _qorlia_invoice_report(self, key):
        if not isinstance(key, str) or key not in REPORTS:
            raise ValidationError('Select an available invoice report.')
        xmlid, template = REPORTS[key]
        report = self.env.ref(xmlid, raise_if_not_found=False)
        if (not report or report.model != 'account.move' or report.report_type != 'qweb-pdf'
                or report.report_name != template):
            raise UserError('The native invoice report is not configured correctly.')
        report.check_access_rights('read')
        report.check_access_rule('read')
        if report.groups_id and not (report.groups_id & self.env.user.groups_id) and not self.env.su:
            raise AccessError('Your Billing account cannot print this report.')
        return report

    @api.model
    def qorlia_invoice_report_list(self, invoice_id):
        self._qorlia_invoice(invoice_id)
        reports = []
        for key in REPORTS:
            try:
                report = self._qorlia_invoice_report(key)
            except AccessError:
                continue
            reports.append({'key': key, 'name': report.name})
        return {'invoice_id': invoice_id, 'reports': reports}

    @api.model
    def qorlia_invoice_report_download(self, invoice_id, report_key):
        invoice = self._qorlia_invoice(invoice_id, lock=True)
        report = self._qorlia_invoice_report(report_key)
        snapshot = invoice._qorlia_invoice_snapshot()
        if not snapshot['ledger_balanced'] or not invoice.currency_id.is_zero(invoice.amount_total - invoice.invoice_total):
            raise UserError('Review and save the invoice adjustments and journal balance before printing.')
        # Delegate layout, taxes, payments and native attachment creation to the installed report engine.
        pdf, output_type = self.env['ir.actions.report']._render_qweb_pdf(report.id, res_ids=invoice.ids)
        if output_type != 'pdf' or not isinstance(pdf, bytes) or not pdf.startswith(b'%PDF-'):
            raise UserError('Native Billing did not produce a PDF. Ask your Billing administrator to check reporting.')
        if len(pdf) > MAX_PDF_BYTES:
            raise UserError('This PDF exceeds the download limit. Open it in native Billing.')
        label = re.sub(r'[^A-Za-z0-9_-]+', '_', invoice._get_report_base_filename()).strip('_')[:100] or 'Invoice'
        return {'invoice_id': invoice.id, 'filename': '%s_%s_%s.pdf' % (label, invoice.id, report_key),
                'mimetype': 'application/pdf', 'byte_count': len(pdf), 'content': base64.b64encode(pdf).decode('ascii')}
