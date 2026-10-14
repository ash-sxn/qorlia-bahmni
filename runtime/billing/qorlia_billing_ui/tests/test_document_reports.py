# SPDX-License-Identifier: LGPL-3.0-or-later
import base64
import uuid
from unittest.mock import patch
from lxml import html

from odoo import Command, fields
from odoo.exceptions import AccessError, UserError, ValidationError
from odoo.tests import TransactionCase, tagged
from odoo.tools.misc import formatLang


@tagged('post_install', '-at_install')
class DocumentReportTest(TransactionCase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.orders = cls.env['sale.order']
        cls.payments = cls.env['account.payment']
        cls.reports = cls.env['ir.actions.report']
        cls.customer = cls.env['res.partner'].create({'name': 'QorliaQA Document report customer', 'customer_rank': 1})
        cls.product = cls.env['product.product'].create({'name': 'QorliaQA Report service', 'type': 'service', 'list_price': 500, 'invoice_policy': 'order', 'taxes_id': [Command.clear()]})
        cls.shop = cls.env['sale.shop'].search([('company_id', '=', cls.env.company.id)], limit=1)
        cls.journal = cls.env['account.journal'].create({'name': 'QorliaQA Report cash', 'code': 'QRPT', 'type': 'cash', 'company_id': cls.env.company.id})
        cls.journal.inbound_payment_method_line_ids.payment_account_id = cls.journal.default_account_id
        cls.journal.outbound_payment_method_line_ids.payment_account_id = cls.journal.default_account_id
        cls.transfer_journal = cls.env['account.journal'].create({'name': 'QorliaQA Report transfer', 'code': 'QRTR', 'type': 'cash', 'company_id': cls.env.company.id})
        cls.transfer_journal.inbound_payment_method_line_ids.payment_account_id = cls.transfer_journal.default_account_id
        cls.transfer_journal.outbound_payment_method_line_ids.payment_account_id = cls.transfer_journal.default_account_id
        cls.env.company.transfer_account_id = cls.env['account.account'].create({'name': 'QorliaQA Report transfers', 'code': 'QRPTR', 'account_type': 'asset_current', 'reconcile': True, 'company_id': cls.env.company.id})

    def order(self):
        def payload(value):
            return {key: value[key] for key in ('id', 'version', 'values', 'lines')}
        draft = self.orders.qorlia_draft_load()
        draft['values']['partner_id'] = self.customer.id
        draft = self.orders.qorlia_draft_preview(payload(draft), {'field': 'partner_id'})
        draft['values']['shop_id'] = self.shop.id
        draft = self.orders.qorlia_draft_preview(payload(draft), {'field': 'shop_id'})
        draft['lines'].append({'id': False, 'values': {'product_id': self.product.id, 'name': '', 'product_uom_qty': 1, 'discount': 0, 'display_type': False, 'sequence': 10}})
        draft = self.orders.qorlia_draft_preview(payload(draft), {'field': 'product_id', 'line': 0})
        return self.orders.browse(self.orders.qorlia_draft_save(payload(draft), str(uuid.uuid4()))['id'])

    def payment(self, posted=True, **values):
        payment = self.payments.create({'partner_id': self.customer.id, 'partner_type': 'customer', 'payment_type': 'inbound', 'amount': 100, 'date': fields.Date.today(), 'journal_id': self.journal.id, **values})
        if posted:
            payment.action_post()
        return payment

    def reader(self):
        return self.env['res.users'].with_context(no_reset_password=True).create({'name': 'QorliaQA Report reader', 'login': 'qorliaqa-doc-' + str(uuid.uuid4()), 'groups_id': [Command.set((self.env.ref('account.group_account_readonly') | self.env.ref('sales_team.group_sale_salesman')).ids)], 'company_id': self.env.company.id, 'company_ids': [Command.set(self.env.company.ids)]})

    def invoice(self, amount=500, **values):
        income = self.env['account.account'].search([('company_id', '=', self.env.company.id), ('account_type', '=', 'income')], limit=1)
        invoice = self.env['account.move'].create({'move_type': 'out_invoice', 'partner_id': self.customer.id,
            'invoice_date': fields.Date.today(), 'invoice_line_ids': [Command.create({'name': 'QorliaQA Receipt consultation',
                'account_id': income.id, 'quantity': 1, 'price_unit': amount, 'tax_ids': [Command.clear()]})], **values})
        invoice.action_post()
        return invoice

    def allocate(self, payment, invoices):
        (payment.move_id.line_ids | invoices.line_ids).filtered(lambda line: line.account_type == 'asset_receivable').reconcile()

    def rendered(self, xmlid, record):
        return html.fromstring(self.reports._render_qweb_html(xmlid, record.ids)[0])

    def money(self, record, value):
        return ' '.join(formatLang(self.env, value, currency_obj=record.currency_id).split())

    def test_actual_order_templates_show_saved_discount_override_tax_and_rounding(self):
        order = self.order()
        tax = self.env['account.tax'].create({'name': 'QorliaQA Report tax', 'amount': 5, 'type_tax_use': 'sale', 'company_id': self.env.company.id})
        order.order_line.write({'product_uom_qty': 2, 'price_unit': 500, 'discount': 10, 'tax_id': [Command.set(tax.ids)]})
        for values, discount in [({'discount_type': 'fixed', 'discount': 25, 'chargeable_amount': 0}, 25),
                                 ({'discount_type': 'percentage', 'discount_percentage': 10}, 94.5),
                                 ({'chargeable_amount': 900}, 45)]:
            with patch.object(type(self.env['rounding.off']), 'round_off_value_to_nearest', return_value=0.25):
                order.write(values)
                order._compute_amounts()
                self.env.flush_all()
            self.assertAlmostEqual(order.amount_total, 945 - discount + 0.25)
            before = order.read(['write_date', 'state', 'amount_total', 'invoice_ids', 'picking_ids'])
            for xmlid in ('sale.action_report_saleorder', 'sale.action_report_pro_forma_invoice'):
                document = self.rendered(xmlid, order)
                total = ' '.join(document.xpath('//tr[contains(@class, "o_total")]/td[2]')[0].text_content().split())
                self.assertEqual(total, self.money(order, order.amount_total))
                self.assertIn('Document discount', document.text_content())
                self.assertIn(self.money(order, discount), ' '.join(document.text_content().split()))
                self.assertIn('Rounding', document.text_content())
                self.assertEqual(order.read(['write_date', 'state', 'amount_total', 'invoice_ids', 'picking_ids']), before)

    def test_actual_receipts_use_reconciled_not_latest_invoice_and_refresh_archive(self):
        invoice, payment = self.invoice(), self.payment()
        self.allocate(payment, invoice)
        unrelated = self.invoice(999)
        rows = payment._qorlia_receipt_rows()
        self.assertEqual([row['invoice'].id for row in rows], invoice.ids)
        self.assertEqual(rows[0]['allocated'], 100)
        self.assertEqual(invoice.amount_residual, 400)
        archive = payment._qorlia_receipt_archive_name('receipt')
        for key in ('receipt', 'receipt_summary'):
            xmlid = {'receipt': 'bahmni_auto_payment_reconciliation.account_payment_invoices_receipt', 'receipt_summary': 'bahmni_auto_payment_reconciliation.account_payment_summary_receipt'}[key]
            document = self.rendered(xmlid, payment)
            text = ' '.join(document.text_content().split())
            self.assertIn(invoice.name, text)
            self.assertNotIn(unrelated.name, text)
            for amount in (500, 100, 400):
                self.assertIn(self.money(invoice, amount), text)
            self.assertIn('QorliaQA Receipt consultation', text)
            self.assertEqual(bool(document.xpath('//th[contains(text(), "Quantity")]')), key == 'receipt')
        self.allocate(self.payment(), invoice)
        self.assertEqual(invoice.amount_residual, 300)
        self.assertNotEqual(payment._qorlia_receipt_archive_name('receipt'), archive)
        self.assertEqual(payment._qorlia_receipt_rows()[0]['allocated'], 100)
        payment.move_id.line_ids.remove_move_reconcile()
        self.assertEqual(payment._qorlia_receipt_rows(), [])
        self.assertIn('no current invoice allocation', self.rendered('bahmni_auto_payment_reconciliation.account_payment_invoices_receipt', payment).text_content())

    def test_refund_and_multi_invoice_receipts_preserve_document_scope(self):
        credit, refund = self.invoice(move_type='out_refund'), self.payment(payment_type='outbound')
        self.allocate(refund, credit)
        self.assertEqual(refund._qorlia_receipt_rows()[0]['allocated'], 100)
        text = ' '.join(self.rendered('bahmni_auto_payment_reconciliation.account_payment_invoices_receipt', refund).text_content().split())
        self.assertIn('Refund receipt', text)
        self.assertIn('Credit note', text)
        self.assertIn(self.money(credit, 400), text)
        invoices, payment = self.invoice(200) | self.invoice(300), self.payment(amount=300)
        self.allocate(payment, invoices)
        rows = payment._qorlia_receipt_rows()
        self.assertEqual({row['invoice'].id for row in rows}, set(invoices.ids))
        self.assertEqual(sum(row['allocated'] for row in rows), 300)
        self.assertEqual(sum(invoices.mapped('amount_residual')), 200)

    def test_foreign_currency_allocation_uses_invoice_currency(self):
        currency = self.env['res.currency'].create({'name': 'QRP', 'symbol': 'QRP', 'rounding': 0.01, 'active': True})
        self.env['res.currency.rate'].create({'currency_id': currency.id, 'company_id': self.env.company.id, 'name': fields.Date.today(), 'rate': 2})
        for payment_currency, allocated in ((currency, 100), (self.env.company.currency_id, 200)):
            invoice = self.invoice(currency_id=currency.id)
            payment = self.payment(currency_id=payment_currency.id)
            self.allocate(payment, invoice)
            rows = payment._qorlia_receipt_rows()
            self.assertEqual(rows[0]['allocated'], allocated)
            self.assertEqual(invoice.amount_residual, 500 - allocated)
            text = ' '.join(self.rendered('bahmni_auto_payment_reconciliation.account_payment_summary_receipt', payment).text_content().split())
            self.assertIn(self.money(invoice, 500 - allocated), text)

    def test_archive_keeps_prior_files_and_permissions_and_rejects_unsaved_adjustments(self):
        invoice, payment = self.invoice(), self.payment()
        self.allocate(payment, invoice)
        attachment = self.env['ir.attachment'].create({'name': payment.name.replace('/', '_') + '_receipt.pdf',
            'type': 'binary', 'raw': b'%PDF-old', 'res_model': 'account.payment', 'res_id': payment.id})
        report = self.env.ref('bahmni_auto_payment_reconciliation.account_payment_invoices_receipt')
        self.assertFalse(report.retrieve_attachment(payment))
        self.assertTrue(attachment.exists())
        self.assertTrue(report.attachment_use)
        reader = self.reader()
        self.assertEqual(payment.with_user(reader)._qorlia_receipt_rows()[0]['invoice'], invoice.with_user(reader))
        invoice.write({'discount_type': 'fixed', 'discount': 25})
        self.assertNotEqual(invoice.amount_total, invoice.invoice_total)
        with patch.object(type(self.reports), '_render_qweb_pdf') as render:
            with self.assertRaises(UserError):
                self.payments.qorlia_payment_report_download(payment.id, 'receipt')
            render.assert_not_called()

    def test_native_menus_and_read_only_lists(self):
        order, payment = self.order(), self.payment()
        before = order.read(['state', 'amount_total', 'invoice_ids', 'picking_ids', 'write_date'])
        self.assertEqual({r['key'] for r in self.orders.qorlia_order_report_list(order.id)['reports']}, {'quotation', 'proforma', 'discount_summary'})
        self.assertEqual({r['key'] for r in self.payments.qorlia_payment_report_list(payment.id)['reports']}, {'payment_receipt', 'receipt', 'receipt_summary'})
        self.assertEqual(order.read(['state', 'amount_total', 'invoice_ids', 'picking_ids', 'write_date']), before)

    def test_order_variants_use_native_renderer_without_confirm_or_invoice(self):
        order = self.order()
        for state in ('draft', 'sent', 'sale', 'done', 'cancel'):
            order.state = state
            before = order.read(['state', 'amount_total', 'invoice_ids', 'picking_ids', 'write_date'])
            for key, xmlid in [('quotation', 'sale.action_report_saleorder'), ('proforma', 'sale.action_report_pro_forma_invoice'), ('discount_summary', 'bahmni_sale.sale_summarized_discount_head')]:
                with patch.object(type(self.reports), '_render_qweb_pdf', return_value=(b'%PDF-1.4\n', 'pdf')) as render:
                    result = self.orders.qorlia_order_report_download(order.id, key)
                    self.assertEqual(render.call_args.args[0], self.env.ref(xmlid).id)
                    self.assertEqual(render.call_args.kwargs, {'res_ids': order.ids})
                    self.assertEqual(base64.b64decode(result['content']), b'%PDF-1.4\n')
                    self.assertEqual(result['order_id'], order.id)
                self.assertEqual(order.read(['state', 'amount_total', 'invoice_ids', 'picking_ids', 'write_date']), before)

    def test_customer_payment_and_refund_variants_do_not_create_payments(self):
        for direction in ('inbound', 'outbound'):
            payment = self.payment(payment_type=direction)
            before = payment.read(['state', 'amount', 'move_id', 'write_date'])
            lines = payment.move_id.line_ids.read(['balance', 'amount_residual', 'write_date'])
            count = self.payments.search_count([])
            for key, xmlid in [('payment_receipt', 'account.action_report_payment_receipt'), ('receipt', 'bahmni_auto_payment_reconciliation.account_payment_invoices_receipt'), ('receipt_summary', 'bahmni_auto_payment_reconciliation.account_payment_summary_receipt')]:
                with patch.object(type(self.reports), '_render_qweb_pdf', return_value=(b'%PDF-1.4\n', 'pdf')) as render:
                    result = self.payments.qorlia_payment_report_download(payment.id, key)
                    self.assertEqual(render.call_args.args[0], self.env.ref(xmlid).id)
                    self.assertEqual(render.call_args.kwargs, {'res_ids': payment.ids})
                    self.assertEqual(result['payment_id'], payment.id)
                self.assertEqual(payment.read(['state', 'amount', 'move_id', 'write_date']), before)
                self.assertEqual(payment.move_id.line_ids.read(['balance', 'amount_residual', 'write_date']), lines)
                self.assertEqual(self.payments.search_count([]), count)

    def test_invalid_ids_keys_and_payment_scope_fail_closed(self):
        order, payment = self.order(), self.payment()
        for model, prefix, record, wrong in [(self.orders, 'order', order, 'receipt'), (self.payments, 'payment', payment, 'quotation')]:
            for bad in (True, False, 0, -1, '1'):
                with self.assertRaises(ValidationError):
                    getattr(model, 'qorlia_%s_report_list' % prefix)(bad)
            with self.assertRaises(UserError):
                getattr(model, 'qorlia_%s_report_list' % prefix)(2147483647)
            for key in (wrong, False, 3, '../report'):
                with self.assertRaises(ValidationError):
                    getattr(model, 'qorlia_%s_report_download' % prefix)(record.id, key)
        internal = self.payment(is_internal_transfer=True, payment_type='outbound', destination_journal_id=self.transfer_journal.id)
        self.assertTrue(internal.is_internal_transfer)
        self.assertEqual(internal.state, 'posted')
        for invalid in (self.payment(posted=False), self.payment(partner_type='supplier'), internal):
            with self.assertRaises(UserError):
                self.payments.qorlia_payment_report_list(invalid.id)

    def test_native_groups_acl_and_company_boundaries(self):
        order, payment, user = self.order(), self.payment(), self.reader()
        order.user_id = user
        orders, payments = self.orders.with_user(user), self.payments.with_user(user)
        restricted = self.env.ref('sale.action_report_saleorder')
        restricted.groups_id = [Command.set(self.env.ref('base.group_system').ids)]
        self.assertNotIn('quotation', [r['key'] for r in orders.qorlia_order_report_list(order.id)['reports']])
        with self.assertRaises(AccessError):
            orders.qorlia_order_report_download(order.id, 'quotation')
        self.env.ref('account.action_report_payment_receipt').groups_id = [Command.set(self.env.ref('base.group_system').ids)]
        self.assertNotIn('payment_receipt', [r['key'] for r in payments.qorlia_payment_report_list(payment.id)['reports']])
        with self.assertRaises(AccessError):
            payments.qorlia_payment_report_download(payment.id, 'payment_receipt')
        user.groups_id = [Command.set(self.env.ref('base.group_user').ids)]
        for model, prefix, record in [(self.orders, 'order', order), (self.payments, 'payment', payment)]:
            with self.assertRaises(AccessError):
                getattr(model.with_user(user), 'qorlia_%s_report_list' % prefix)(record.id)
        user.groups_id = [Command.set((self.env.ref('account.group_account_readonly') | self.env.ref('sales_team.group_sale_salesman')).ids)]
        foreign = self.env['res.company'].create({'name': 'QorliaQA Report foreign company'})
        user.write({'company_id': foreign.id, 'company_ids': [Command.set(foreign.ids)]})
        for model, prefix, record in [(self.orders, 'order', order), (self.payments, 'payment', payment)]:
            with self.assertRaises(AccessError):
                getattr(model.with_user(user), 'qorlia_%s_report_list' % prefix)(record.id)

    def test_bad_pdf_and_changed_native_template_fail_closed(self):
        order, payment = self.order(), self.payment()
        for model, prefix, record, key, xmlid in [(self.orders, 'order', order, 'quotation', 'sale.action_report_saleorder'), (self.payments, 'payment', payment, 'receipt', 'bahmni_auto_payment_reconciliation.account_payment_invoices_receipt')]:
            for output in ((b'<html>error</html>', 'html'), (b'notpdf', 'pdf'), (b'%PDF-' + b'x' * (10 * 1024 * 1024), 'pdf')):
                with patch.object(type(self.reports), '_render_qweb_pdf', return_value=output):
                    with self.assertRaises(UserError):
                        getattr(model, 'qorlia_%s_report_download' % prefix)(record.id, key)
            self.env.ref(xmlid).report_name = 'account.report_original_vendor_bill'
            with self.assertRaises(UserError):
                getattr(model, 'qorlia_%s_report_download' % prefix)(record.id, key)

    def test_unbalanced_payment_ledger_never_renders(self):
        payment = self.payment()
        self.env.flush_all()
        line = payment.move_id.line_ids.filtered(lambda item: item.credit > 0)[0]
        self.env.cr.execute('UPDATE account_move_line SET credit = credit + 1, balance = balance - 1 WHERE id = %s', [line.id])
        payment.move_id.line_ids.invalidate_recordset()
        with patch.object(type(self.reports), '_render_qweb_pdf') as render:
            with self.assertRaises(UserError):
                self.payments.qorlia_payment_report_download(payment.id, 'receipt')
            render.assert_not_called()
