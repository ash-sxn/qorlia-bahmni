# SPDX-License-Identifier: LGPL-3.0-or-later
import base64
from unittest.mock import patch
from lxml import html
from odoo import Command, fields
from odoo.exceptions import AccessError, UserError, ValidationError
from odoo.tests import TransactionCase, tagged
from . import test_document_reports as report_tests


@tagged('post_install', '-at_install')
class CustomerStatementTest(TransactionCase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.payments = cls.env['account.payment']
        cls.reports = cls.env['ir.actions.report']
        cls.customer = cls.env['res.partner'].create({'name': 'QorliaQA Statement customer', 'is_company': True})
        cls.journal = cls.env['account.journal'].create({'name': 'QorliaQA Statement cash', 'code': 'QSTM',
            'type': 'cash', 'company_id': cls.env.company.id})
        cls.journal.inbound_payment_method_line_ids.payment_account_id = cls.journal.default_account_id
        cls.journal.outbound_payment_method_line_ids.payment_account_id = cls.journal.default_account_id

    invoice = report_tests.DocumentReportTest.invoice
    payment = report_tests.DocumentReportTest.payment
    reader = report_tests.DocumentReportTest.reader
    allocate = report_tests.DocumentReportTest.allocate
    money = report_tests.DocumentReportTest.money

    def rendered_statement(self, invoice, start, end, user=None):
        result = self.reports.with_user(user or self.reader())._render_qweb_html(
            'qorlia_billing_ui.action_customer_statement', [invoice.id],
            data={'date_from': start, 'date_to': end})[0]
        return html.fromstring(result)

    def test_statement_report_uses_requested_period_not_current_residuals(self):
        self.invoice(200, invoice_date='2026-01-01', date='2026-01-01')
        invoice = self.invoice(500, invoice_date='2026-01-02', date='2026-01-02')
        payment = self.payment(amount=100, date='2026-01-03')
        self.allocate(payment, invoice)
        future = self.invoice(999, invoice_date='2026-02-01', date='2026-02-01')
        before = (invoice | payment.move_id).read(['write_date', 'state', 'amount_residual'])
        document = self.rendered_statement(invoice, '2026-01-02', '2026-01-31')
        text = document.text_content().replace('\xa0', ' ')
        for value in ['2026-01-02 to 2026-01-31', self.customer.display_name,
                      invoice.name, payment.move_id.name, self.money(invoice, 200), self.money(invoice, 600)]:
            self.assertIn(value, text)
        self.assertNotIn(future.name, text)
        table = document.xpath("//table[@aria-label='Posted customer receivable entries']")[0]
        self.assertEqual(len(table.xpath('./tbody/tr')), 4)
        self.assertIn(self.money(invoice, 600), table.xpath('./tbody/tr[last()]/td[4]')[0].text_content().replace('\xa0', ' '))
        self.assertEqual((invoice | payment.move_id).read(['write_date', 'state', 'amount_residual']), before)

    def test_statement_report_keeps_opening_and_empty_period(self):
        invoice = self.invoice(500, invoice_date='2026-01-01', date='2026-01-01')
        document = self.rendered_statement(invoice, '2026-02-01', '2026-02-28')
        text = document.text_content().replace('\xa0', ' ')
        self.assertIn('No posted receivable entries in this period', text)
        self.assertIn(self.money(invoice, 500), text)
        self.assertNotIn(invoice.name, document.xpath("//table[@aria-label='Posted customer receivable entries']")[0].text_content())

    def test_statement_report_foreign_amount_does_not_change_company_totals(self):
        currency = self.env['res.currency'].create({'name': 'QSP', 'symbol': 'QP', 'rounding': 0.01,
            'rate_ids': [Command.create({'name': fields.Date.today(), 'rate': 2, 'company_id': self.env.company.id})]})
        invoice = self.invoice(500, currency_id=currency.id)
        document = self.rendered_statement(invoice, str(fields.Date.today()), str(fields.Date.today()))
        row = document.xpath("//table[@aria-label='Posted customer receivable entries']/tbody/tr[2]/td")
        self.assertIn('QSP', row[6].text_content())
        self.assertIn('500.00', row[6].text_content())
        self.assertIn('250.00', row[5].text_content())

    def test_statement_pdf_fixed_template_identity_and_date_data(self):
        invoice = self.invoice()
        reader = self.reader()
        moves = self.env['account.move'].with_user(reader)
        pdf = b'%PDF-1.4\nQorlia statement'
        with patch.object(type(self.reports), '_render_qweb_pdf', return_value=(pdf, 'pdf')) as render:
            result = moves.qorlia_customer_statement_download(invoice.id, '2026-01-01', '2026-01-31')
        self.assertEqual(render.call_args.args, (self.env.ref('qorlia_billing_ui.action_customer_statement').id,))
        self.assertEqual(render.call_args.kwargs, {'res_ids': invoice.ids, 'data': {'date_from': '2026-01-01', 'date_to': '2026-01-31'}})
        self.assertEqual(result['invoice_id'], invoice.id)
        self.assertEqual(result['date_from'], '2026-01-01')
        self.assertEqual(result['date_to'], '2026-01-31')
        self.assertEqual(base64.b64decode(result['content']), pdf)
        self.assertIn('2026-01-01_2026-01-31', result['filename'])
        report = self.env.ref('qorlia_billing_ui.action_customer_statement')
        self.assertFalse(report.attachment_use)
        self.assertFalse(report.attachment)

    def test_statement_pdf_rejects_permissions_and_invalid_range_before_render(self):
        invoice = self.invoice()
        reader = self.reader()
        with patch.object(type(self.reports), '_render_qweb_pdf') as render:
            with self.assertRaises(ValidationError):
                self.env['account.move'].with_user(reader).qorlia_customer_statement_download(invoice.id, '2026-02-02', '2026-02-01')
            reader.groups_id = [Command.set(self.env.ref('base.group_user').ids)]
            with self.assertRaises(AccessError):
                self.env['account.move'].with_user(reader).qorlia_customer_statement_download(invoice.id, '2026-01-01', '2026-01-31')
            render.assert_not_called()

    def test_direct_report_revalidates_scope_and_rejects_caller_rows(self):
        invoice = self.invoice()
        reader = self.reader()
        report = self.env['report.qorlia_billing_ui.customer_statement_document'].with_user(reader)
        data = {'date_from': '2026-01-01', 'date_to': '2026-01-31'}
        for ids, values in [([], data), ([True], data), (invoice.ids * 2, data),
                            (invoice.ids, {}), (invoice.ids, dict(data, statement={'closing': 0}))]:
            with self.assertRaises(ValidationError):
                report._get_report_values(ids, values)
        other = self.env['res.company'].create({'name': 'QorliaQA Denied statement report company'})
        reader.write({'company_id': other.id, 'company_ids': [Command.set(other.ids)]})
        with self.assertRaises(AccessError):
            report._get_report_values(invoice.ids, data)

    def test_statement_pdf_output_validation(self):
        invoice = self.invoice()
        moves = self.env['account.move'].with_user(self.reader())
        for output in [(b'not PDF', 'pdf'), (b'%PDF-test', 'html'), (b'%PDF-' + b'0' * (10 * 1024 * 1024), 'pdf')]:
            with patch.object(type(self.reports), '_render_qweb_pdf', return_value=output):
                with self.assertRaises(UserError):
                    moves.qorlia_customer_statement_download(invoice.id, '2026-01-01', '2026-01-31')

    def test_statement_report_escapes_reference_and_honours_hidden_lines(self):
        invoice = self.invoice(ref='<script>QorliaQA</script>')
        reader = self.reader()
        day = str(fields.Date.today())
        document = self.rendered_statement(invoice, day, day, reader)
        self.assertFalse(document.xpath("//script[contains(text(), 'QorliaQA')]"))
        self.assertIn('<script>QorliaQA</script>', document.text_content())
        self.env['ir.rule'].create({'name': 'QorliaQA statement PDF hidden entry',
            'model_id': self.env['ir.model']._get_id('account.move.line'),
            'domain_force': "[('move_id', '!=', %s)]" % invoice.id})
        document = self.rendered_statement(invoice, day, day, reader)
        self.assertIn('No posted receivable entries in this period', document.text_content())

    def statement(self, invoice, start='2026-01-02', end='2026-01-31', user=None):
        return self.env['account.move'].with_user(user or self.reader()).qorlia_customer_statement(invoice.id, start, end)

    def test_opening_period_credit_payment_and_future_draft_exclusion(self):
        opening = self.invoice(200, invoice_date='2026-01-01', date='2026-01-01')
        invoice = self.invoice(500, invoice_date='2026-01-02', date='2026-01-02')
        credit = self.invoice(50, move_type='out_refund', invoice_date='2026-01-03', date='2026-01-03')
        payment = self.payment(amount=100, date='2026-01-04')
        self.allocate(payment, invoice)
        future = self.invoice(999, invoice_date='2026-02-01', date='2026-02-01')
        draft = self.invoice(333, invoice_date='2026-01-05', date='2026-01-05')
        draft.button_draft()
        records = opening | invoice | credit | future | draft | payment.move_id
        before = records.read(['write_date', 'state', 'amount_residual'])
        statement = self.statement(invoice, user=self.reader())
        self.assertEqual((statement['opening'], statement['debit'], statement['credit'], statement['closing']), (200, 500, 150, 550))
        self.assertEqual([row['move_id'] for row in statement['rows']], [invoice.id, credit.id, payment.move_id.id])
        self.assertEqual([row['balance'] for row in statement['rows']], [700, 650, 550])
        self.assertEqual(invoice.amount_residual, 400)
        self.assertEqual(records.read(['write_date', 'state', 'amount_residual']), before)
        unrelated = self.env['res.partner'].create({'name': 'QorliaQA Other statement customer'})
        self.invoice(777, partner_id=unrelated.id, invoice_date='2026-01-03', date='2026-01-03')
        self.assertEqual(self.statement(invoice)['closing'], 550)

    def test_paid_invoices_unallocated_receipts_and_commercial_contacts(self):
        contact = self.env['res.partner'].create({'name': 'QorliaQA Statement contact', 'parent_id': self.customer.id})
        invoice = self.invoice(500, partner_id=contact.id)
        payment = self.payment(amount=600)
        self.allocate(payment, invoice)
        statement = self.statement(invoice, start=str(fields.Date.today()), end=str(fields.Date.today()))
        self.assertEqual(invoice.amount_residual, 0)
        self.assertEqual(statement['customer'], self.customer.display_name)
        self.assertEqual((statement['debit'], statement['credit'], statement['closing']), (500, 600, -100))
        empty = self.statement(invoice, start='2025-01-01', end='2025-01-31')
        self.assertEqual((empty['opening'], empty['closing'], empty['rows']), (0, 0, []))

    def test_company_currency_preserves_foreign_document_amount(self):
        currency = self.env['res.currency'].create({'name': 'QST', 'symbol': 'Q', 'rounding': 0.01,
            'rate_ids': [Command.create({'name': fields.Date.today(), 'rate': 2, 'company_id': self.env.company.id})]})
        invoice = self.invoice(500, currency_id=currency.id)
        statement = self.statement(invoice, start=str(fields.Date.today()), end=str(fields.Date.today()))
        line = invoice.line_ids.filtered(lambda item: item.account_type == 'asset_receivable')
        self.assertEqual(statement['currency'][0], self.env.company.currency_id.id)
        self.assertAlmostEqual(statement['closing'], line.balance)
        self.assertEqual(statement['rows'][0]['currency'][0], currency.id)
        self.assertEqual(statement['rows'][0]['amount_currency'], 500)

    def test_invalid_dates_accounting_permission_company_and_line_rules(self):
        invoice = self.invoice()
        for start, end in [(True, '2026-01-01'), ('20260101', '2026-01-02'),
                           ('2026-02-30', '2026-03-01'), ('2026-02-02', '2026-02-01')]:
            with self.assertRaises(ValidationError):
                self.statement(invoice, start, end)
        reader = self.reader()
        reader.groups_id = [Command.set(self.env.ref('base.group_user').ids)]
        with self.assertRaises(AccessError):
            self.statement(invoice, user=reader)
        reader = self.reader()
        rule = self.env['ir.rule'].create({'name': 'QorliaQA statement denied journal',
            'model_id': self.env['ir.model']._get_id('account.move'),
            'domain_force': "[('id', '!=', %s)]" % invoice.id})
        with self.assertRaises(AccessError):
            self.statement(invoice, user=reader)
        rule.unlink()
        rule = self.env['ir.rule'].create({'name': 'QorliaQA statement denied line',
            'model_id': self.env['ir.model']._get_id('account.move.line'),
            'domain_force': "[('move_id', '!=', %s)]" % invoice.id})
        # Native line rules are honoured, so hidden rows do not enter the totals.
        self.assertEqual(self.statement(invoice, str(fields.Date.today()), str(fields.Date.today()), reader)['rows'], [])

    def test_cross_company_and_unbalanced_ledger_fail_closed(self):
        invoice = self.invoice()
        reader = self.reader()
        other = self.env['res.company'].create({'name': 'QorliaQA Other statement company'})
        reader.write({'company_id': other.id, 'company_ids': [Command.set(other.ids)]})
        with self.assertRaises(AccessError):
            self.statement(invoice, user=reader)
        self.env.flush_all()
        line = invoice.line_ids.filtered(lambda item: item.credit > 0)[0]
        self.env.cr.execute('UPDATE account_move_line SET credit = credit + 1, balance = balance - 1 WHERE id = %s', [line.id])
        invoice.line_ids.invalidate_recordset()
        with self.assertRaises(UserError):
            self.statement(invoice, str(fields.Date.today()), str(fields.Date.today()))

    def test_limit_fails_instead_of_truncating_or_claiming_zero_balance(self):
        invoice = self.invoice()
        lines = invoice.line_ids.filtered(lambda line: line.account_type == 'asset_receivable')
        with patch.object(type(lines), 'search', return_value=lines):
            with patch.object(type(lines), '__len__', return_value=2001):
                with self.assertRaises(UserError):
                    self.statement(invoice)
