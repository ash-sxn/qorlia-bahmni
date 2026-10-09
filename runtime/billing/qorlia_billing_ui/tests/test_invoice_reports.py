# SPDX-License-Identifier: LGPL-3.0-or-later
import base64
import uuid
from unittest.mock import patch

from odoo import Command, fields
from odoo.exceptions import AccessError, UserError, ValidationError
from odoo.tests import TransactionCase, tagged


@tagged('post_install', '-at_install')
class InvoiceReportTest(TransactionCase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.moves = cls.env['account.move']
        cls.reports = cls.env['ir.actions.report']
        cls.customer = cls.env['res.partner'].create({'name': 'QorliaQA Report customer'})
        cls.income = cls.env['account.account'].search([
            ('company_id', '=', cls.env.company.id), ('account_type', '=', 'income')], limit=1)

    def invoice(self, **values):
        return self.moves.create({'move_type': 'out_invoice', 'partner_id': self.customer.id,
            'invoice_date': fields.Date.today(), 'invoice_line_ids': [Command.create({
                'name': 'QorliaQA Report service', 'account_id': self.income.id,
                'quantity': 2, 'price_unit': 500, 'tax_ids': [Command.clear()]})], **values})

    def test_native_customer_reports_only_and_readonly_listing(self):
        invoice = self.invoice()
        before = invoice._qorlia_invoice_snapshot()
        result = self.moves.qorlia_invoice_report_list(invoice.id)
        self.assertEqual(result['invoice_id'], invoice.id)
        self.assertEqual({report['key'] for report in result['reports']}, {'invoice', 'invoice_without_payments'})
        self.assertEqual(invoice._qorlia_invoice_snapshot(), before)

    def test_native_render_delegation_and_financial_state_unchanged(self):
        for move_type in ('out_invoice', 'out_refund'):
            invoice = self.invoice(move_type=move_type)
            before = invoice._qorlia_invoice_snapshot()
            payments = self.env['account.payment'].search_count([])
            pdf = b'%PDF-1.4\nQorliaQA native report test\n'
            with patch.object(type(self.reports), '_render_qweb_pdf', return_value=(pdf, 'pdf')) as render:
                result = self.moves.qorlia_invoice_report_download(invoice.id, 'invoice_without_payments')
                self.assertEqual(render.call_args.args[0], self.env.ref('account.account_invoices_without_payment').id)
                self.assertEqual(render.call_args.kwargs, {'res_ids': invoice.ids})
            self.assertEqual(base64.b64decode(result['content']), pdf)
            self.assertEqual(result['byte_count'], len(pdf))
            self.assertTrue(result['filename'].endswith('_%s_invoice_without_payments.pdf' % invoice.id))
            self.assertEqual(invoice._qorlia_invoice_snapshot(), before)
            self.assertEqual(self.env['account.payment'].search_count([]), payments)

    def test_invalid_report_ids_vendor_and_missing_invoice_rejected(self):
        invoice = self.invoice()
        for key in (False, 215, 'account.report_invoice', 'original_vendor_bill', '../invoice'):
            with self.assertRaises(ValidationError):
                self.moves.qorlia_invoice_report_download(invoice.id, key)
        for invoice_id in (True, False, 0, -1, '1'):
            with self.assertRaises(ValidationError):
                self.moves.qorlia_invoice_report_list(invoice_id)
        with self.assertRaises(UserError):
            self.moves.qorlia_invoice_report_list(2147483647)
        vendor = self.invoice(move_type='in_invoice')
        with self.assertRaises(UserError):
            self.moves.qorlia_invoice_report_list(vendor.id)

    def test_report_groups_and_native_readonly_user(self):
        invoice = self.invoice()
        user = self.env['res.users'].with_context(no_reset_password=True).create({
            'name': 'QorliaQA Report reader', 'login': 'qorliaqa-report-' + str(uuid.uuid4()),
            'groups_id': [Command.set(self.env.ref('account.group_account_readonly').ids)],
            'company_id': self.env.company.id, 'company_ids': [Command.set(self.env.company.ids)]})
        moves = self.moves.with_user(user)
        self.assertEqual(len(moves.qorlia_invoice_report_list(invoice.id)['reports']), 2)
        restricted = self.env.ref('account.account_invoices')
        restricted.groups_id = [Command.set(self.env.ref('base.group_system').ids)]
        self.assertEqual([report['key'] for report in moves.qorlia_invoice_report_list(invoice.id)['reports']],
                         ['invoice_without_payments'])
        with self.assertRaises(AccessError):
            moves.qorlia_invoice_report_download(invoice.id, 'invoice')
        with patch.object(type(self.reports), '_render_qweb_pdf', return_value=(b'%PDF-1.4\n', 'pdf')):
            self.assertEqual(moves.qorlia_invoice_report_download(invoice.id, 'invoice_without_payments')['invoice_id'], invoice.id)
        foreign = self.env['res.company'].create({'name': 'QorliaQA Report foreign company'})
        user.write({'company_ids': [Command.set(foreign.ids)], 'company_id': foreign.id})
        with self.assertRaises(AccessError):
            self.moves.with_user(user).qorlia_invoice_report_list(invoice.id)

    def test_unbalanced_or_unapplied_adjustments_never_render(self):
        invoice = self.invoice()
        invoice.discount = 10
        with patch.object(type(self.reports), '_render_qweb_pdf') as render:
            with self.assertRaises(UserError):
                self.moves.qorlia_invoice_report_download(invoice.id, 'invoice')
            render.assert_not_called()
        invoice.discount = 0
        # Simulate a pre-existing damaged ledger without Odoo automatically rebalancing its counterpart.
        self.env.flush_all()
        line = invoice.line_ids.filtered(lambda item: item.credit > 0)[0]
        self.env.cr.execute('UPDATE account_move_line SET credit = credit + 1, balance = balance - 1 WHERE id = %s', [line.id])
        invoice.line_ids.invalidate_recordset()
        with self.assertRaises(UserError):
            self.moves.qorlia_invoice_report_download(invoice.id, 'invoice')

    def test_non_pdf_oversize_and_modified_template_rejected(self):
        invoice = self.invoice()
        for output in ((b'<html>test mode</html>', 'html'), (b'not a PDF', 'pdf'),
                       (b'%PDF-' + b'x' * (10 * 1024 * 1024), 'pdf')):
            with patch.object(type(self.reports), '_render_qweb_pdf', return_value=output):
                with self.assertRaises(UserError):
                    self.moves.qorlia_invoice_report_download(invoice.id, 'invoice')
        self.env.ref('account.account_invoices').report_name = 'account.report_original_vendor_bill'
        with self.assertRaises(UserError):
            self.moves.qorlia_invoice_report_download(invoice.id, 'invoice')
