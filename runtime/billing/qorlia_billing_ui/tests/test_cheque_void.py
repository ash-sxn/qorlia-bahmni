# SPDX-License-Identifier: LGPL-3.0-or-later
import uuid
from datetime import timedelta
from unittest.mock import patch

from odoo import Command, fields
from odoo.exceptions import AccessError, UserError, ValidationError
from odoo.tests import TransactionCase, tagged


@tagged('post_install', '-at_install')
class ChequeVoidWorkflowTest(TransactionCase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.payments = cls.env['account.payment']
        cls.moves = cls.env['account.move']
        cls.customer = cls.env['res.partner'].create({'name': 'QorliaQA Void customer'})
        cls.income = cls.env['account.account'].search([('company_id', '=', cls.env.company.id), ('account_type', '=', 'income')], limit=1)
        cls.journal = cls.env['account.journal'].create({'name': 'QorliaQA Void bank', 'code': 'QVOID', 'type': 'bank'})
        cls.journal.inbound_payment_method_line_ids.payment_account_id = cls.journal.default_account_id
        cls.journal.outbound_payment_method_line_ids.payment_account_id = cls.journal.default_account_id
        cls.method = cls.journal.outbound_payment_method_line_ids.filtered(lambda row: row.code == 'check_printing')
        if not cls.method:
            cls.method = cls.env['account.payment.method.line'].create({'journal_id': cls.journal.id,
                'payment_method_id': cls.env.ref('account_check_printing.account_payment_method_check').id,
                'payment_account_id': cls.journal.default_account_id.id})

    def invoice(self, amount=500, **values):
        invoice = self.moves.create({'move_type': 'out_refund', 'partner_id': self.customer.id,
            'invoice_date': fields.Date.today(), 'invoice_line_ids': [Command.create({
                'name': 'QorliaQA Void service', 'account_id': self.income.id, 'price_unit': amount,
                'quantity': 1, 'tax_ids': [Command.clear()]})], **values})
        invoice.action_post()
        return invoice

    def payment(self, invoice=None):
        payment = self.payments.create({'partner_id': self.customer.id, 'partner_type': 'customer',
            'payment_type': 'outbound', 'amount': 100, 'date': fields.Date.today(),
            'journal_id': self.journal.id, 'payment_method_line_id': self.method.id,
            'bank_reference': 'QorliaQA Void bank ref', 'cheque_reference': 'QorliaQA Void cheque ref'})
        payment.action_post()
        if invoice:
            (payment.move_id.line_ids | invoice.line_ids).filtered(
                lambda line: line.account_id.account_type == 'asset_receivable').reconcile()
        payment.write({'check_number': '004321', 'is_move_sent': True})
        return payment

    def request(self, payment):
        loaded = self.payments.qorlia_cheque_void_load(payment.id)
        review = self.payments.qorlia_cheque_void_preview(payment.id, loaded['version'])
        return {'payment_id': payment.id, 'version': loaded['version'], 'review_version': review['review_version'],
                'request_key': str(uuid.uuid4())}

    def test_native_void_reopens_refund_and_exact_retry_never_cancels_twice(self):
        invoice = self.invoice()
        payment = self.payment(invoice)
        count = self.payments.search_count([])
        request = self.request(payment)
        self.assertFalse(self.payments.qorlia_cheque_void_status(**request)['accepted'])
        result = self.payments.qorlia_cheque_void_run(**request)
        self.assertTrue(result['accepted'])
        self.assertEqual(result['payment']['state'], 'cancel')
        self.assertEqual(payment.check_number, '004321')
        self.assertFalse(payment.is_move_sent)
        self.assertEqual(invoice.amount_residual, 500)
        self.assertEqual(invoice.state, 'posted')
        self.assertEqual(self.payments.search_count([]), count)
        self.assertFalse((invoice | payment.move_id)._get_unbalanced_moves({'records': invoice | payment.move_id}))
        with patch.object(type(payment), 'action_void_check') as native:
            retry = self.payments.qorlia_cheque_void_run(**request)
            native.assert_not_called()
        self.assertEqual(retry['payment']['state'], 'cancel')
        self.assertEqual(len(payment.qorlia_cheque_void_receipts), 1)

    def selected_credit(self, payment, invoice, credit):
        payment.credit_invoice_lines = [Command.create({'invoice_id': credit.id, 'selected': True, 'allocated_amount': credit.amount_total})]
        payment.outstanding_invoice_lines = [Command.create({'invoice_id': invoice.id, 'selected': True, 'allocated_amount': credit.amount_total})]
        invoice.js_assign_outstanding_line(credit.line_ids.filtered(lambda line: line.display_type == 'payment_term').id)

    def test_void_reviews_and_reopens_selected_credit_graph_not_linked_to_cheque(self):
        payment = self.payment()
        invoice, credit = self.invoice(move_type='out_invoice'), self.invoice(100)
        unrelated = self.invoice(move_type='out_invoice')
        self.selected_credit(payment, invoice, credit)
        self.assertFalse(payment.reconciled_invoice_ids)
        loaded = self.payments.qorlia_cheque_void_load(payment.id)
        self.assertTrue({invoice.id, credit.id}.issubset({row['id'] for row in loaded['documents']}))
        self.payments.qorlia_cheque_void_run(**self.request(payment))
        self.assertEqual(invoice.amount_residual, 500)
        self.assertEqual(credit.amount_residual, 100)
        self.assertEqual(unrelated.amount_residual, 500)
        self.assertTrue(payment.credit_invoice_lines.selected)

    def test_selected_credit_edit_or_new_reconciliation_invalidates_review(self):
        payment = self.payment()
        invoice, credit = self.invoice(move_type='out_invoice'), self.invoice(100)
        self.selected_credit(payment, invoice, credit)
        request = self.request(payment)
        credit.ref = 'QorliaQA Concurrent credit update'
        with self.assertRaises(UserError):
            self.payments.qorlia_cheque_void_run(**request)
        request = self.request(payment)
        payment.credit_invoice_lines.selected = False
        with self.assertRaises(UserError):
            self.payments.qorlia_cheque_void_run(**request)
        self.assertEqual(payment.state, 'posted')
        self.assertEqual(invoice.amount_residual, 400)

    def test_void_foreign_selected_credit_reverses_exchange_entries(self):
        currency = self.env.ref('base.USD')
        currency.active = True
        yesterday = fields.Date.today() - timedelta(days=1)
        self.env['res.currency.rate'].create([
            {'currency_id': currency.id, 'company_id': self.env.company.id, 'name': yesterday, 'rate': 0.5},
            {'currency_id': currency.id, 'company_id': self.env.company.id, 'name': fields.Date.today(), 'rate': 1.0}])
        payment = self.payment()
        invoice = self.invoice(move_type='out_invoice', currency_id=currency.id, invoice_date=yesterday, date=yesterday)
        credit = self.invoice(currency_id=currency.id)
        self.selected_credit(payment, invoice, credit)
        partials = invoice.line_ids.matched_debit_ids | invoice.line_ids.matched_credit_ids
        exchange = partials.exchange_move_id | invoice.line_ids.full_reconcile_id.exchange_move_id
        self.assertTrue(exchange)
        self.payments.qorlia_cheque_void_run(**self.request(payment))
        self.assertEqual(invoice.amount_residual, 500)
        self.assertEqual(credit.amount_residual, 500)
        reversal = self.moves.search([('reversed_entry_id', 'in', exchange.ids)])
        self.assertTrue(reversal)
        self.assertFalse((exchange | reversal)._get_unbalanced_moves({'records': exchange | reversal}))

    def test_void_readonly_is_denied(self):
        payment = self.payment()
        reader = self.env['res.users'].with_context(no_reset_password=True).create({
            'name': 'QorliaQA Void reader', 'login': 'qorliaqa-void-' + str(uuid.uuid4()),
            'company_id': self.env.company.id, 'company_ids': [Command.set(self.env.company.ids)],
            'groups_id': [Command.set(self.env.ref('account.group_account_readonly').ids)]})
        self.assertFalse(self.payments.with_user(reader).qorlia_cheque_void_load(payment.id)['can_void'])
        with self.assertRaises(UserError):
            self.payments.with_user(reader).qorlia_cheque_void_run(**self.request(payment))
        self.assertEqual(payment.state, 'posted')

    def test_unreconciled_draft_selection_does_not_block_native_void(self):
        payment = self.payment()
        draft = self.moves.create({'move_type': 'out_invoice', 'partner_id': self.customer.id,
            'invoice_line_ids': [Command.create({'name': 'QorliaQA Unreconciled draft',
                'account_id': self.income.id, 'price_unit': 500, 'tax_ids': [Command.clear()]})]})
        payment.outstanding_invoice_lines = [Command.create({'invoice_id': draft.id, 'selected': True,
                                                             'allocated_amount': 100})]
        before = draft.line_ids.read(['debit', 'credit', 'amount_currency'])
        self.assertTrue(self.payments.qorlia_cheque_void_load(payment.id)['can_void'])
        self.payments.qorlia_cheque_void_run(**self.request(payment))
        self.assertEqual(draft.state, 'draft')
        self.assertEqual(draft.line_ids.read(['debit', 'credit', 'amount_currency']), before)
        self.assertEqual(payment.state, 'cancel')

    def test_void_reverses_cash_basis_tax_and_preserves_original_entries(self):
        company = self.env.company
        waiting = self.env['account.account'].create({'name': 'QorliaQA Void tax waiting', 'code': 'QVWAIT',
            'account_type': 'liability_current', 'reconcile': True, 'company_id': company.id})
        final = self.env['account.account'].create({'name': 'QorliaQA Void tax final', 'code': 'QVFINAL',
            'account_type': 'liability_current', 'company_id': company.id})
        general = self.env['account.journal'].create({'name': 'QorliaQA Void cash basis', 'code': 'QVCAB',
            'type': 'general', 'company_id': company.id})
        company.write({'tax_exigibility': True, 'tax_cash_basis_journal_id': general.id,
                       'account_cash_basis_base_account_id': self.income.id})
        tax = self.env['account.tax'].create({'name': 'QorliaQA Void cash tax', 'amount': 20,
            'type_tax_use': 'sale', 'company_id': company.id, 'tax_exigibility': 'on_payment',
            'cash_basis_transition_account_id': waiting.id,
            'invoice_repartition_line_ids': [Command.create({'repartition_type': 'base'}),
                Command.create({'repartition_type': 'tax', 'account_id': final.id})],
            'refund_repartition_line_ids': [Command.create({'repartition_type': 'base'}),
                Command.create({'repartition_type': 'tax', 'account_id': final.id})]})
        refund = self.invoice(100, invoice_line_ids=[Command.create({'name': 'QorliaQA Void taxed service',
            'account_id': self.income.id, 'quantity': 1, 'price_unit': 100, 'tax_ids': [Command.set(tax.ids)]})])
        payment = self.payment(refund)
        partials = refund.line_ids.matched_debit_ids | refund.line_ids.matched_credit_ids
        entries = self.moves.search([('tax_cash_basis_rec_id', 'in', partials.ids)])
        self.assertTrue(entries)
        request = self.request(payment)
        before = entries.line_ids.read(['debit', 'credit', 'amount_currency'])
        self.payments.qorlia_cheque_void_run(**request)
        reversal = self.moves.search([('reversed_entry_id', 'in', entries.ids)])
        self.assertTrue(reversal)
        self.assertEqual(refund.amount_residual, 120)
        self.assertEqual(payment.state, 'cancel')
        self.assertEqual(entries.line_ids.read(['debit', 'credit', 'amount_currency']), before)
        self.assertFalse((entries | reversal)._get_unbalanced_moves({'records': entries | reversal}))
        result = self.payments.qorlia_cheque_void_status(**request)
        self.assertTrue(set(reversal.ids).issubset({row['id'] for row in result['payment']['documents']}))

    def test_hidden_selected_credit_cannot_be_voided_through_payment_access(self):
        payment = self.payment()
        invoice, credit = self.invoice(move_type='out_invoice'), self.invoice(100)
        self.selected_credit(payment, invoice, credit)
        cashier = self.env['res.users'].with_context(no_reset_password=True).create({
            'name': 'QorliaQA Void cashier', 'login': 'qorliaqa-void-cashier-' + str(uuid.uuid4()),
            'company_id': self.env.company.id, 'company_ids': [Command.set(self.env.company.ids)],
            'groups_id': [Command.set(self.env.ref('account.group_account_invoice').ids)]})
        self.env['ir.rule'].create({'name': 'QorliaQA Hidden selected credit',
            'model_id': self.env['ir.model']._get_id('account.move'),
            'domain_force': "[('id', '!=', %s)]" % credit.id})
        with self.assertRaises(AccessError):
            self.payments.with_user(cashier).qorlia_cheque_void_load(payment.id)
        self.assertEqual(payment.state, 'posted')
        self.assertEqual(invoice.amount_residual, 400)

    def test_void_requires_native_sent_printing_state_and_matching_request(self):
        payment = self.payment()
        request = self.request(payment)
        with self.assertRaises(UserError):
            self.payments.qorlia_cheque_void_run(**{**request, 'review_version': 'b' * 64})
        payment.is_move_sent = False
        loaded = self.payments.qorlia_cheque_void_load(payment.id)
        self.assertFalse(loaded['can_void'])
        with self.assertRaises(UserError):
            self.payments.qorlia_cheque_void_run(**request)
        with self.assertRaises(ValidationError):
            self.payments.qorlia_cheque_void_load(True)
        self.assertFalse(payment.qorlia_cheque_void_receipts)

    def test_void_request_conflict_does_not_mutate_cancelled_payment(self):
        payment = self.payment()
        request = self.request(payment)
        self.payments.qorlia_cheque_void_run(**request)
        with self.assertRaises(ValidationError):
            self.payments.qorlia_cheque_void_status(**{**request, 'version': 'c' * 64})
        self.assertEqual(payment.state, 'cancel')

    def test_void_unexpected_financial_change_rolls_back_everything(self):
        invoice = self.invoice()
        payment = self.payment(invoice)
        request = self.request(payment)
        native = type(payment).action_void_check
        def unsafe(record):
            native(record)
            record.ref = 'QorliaQA unexpected void write'
        with patch.object(type(payment), 'action_void_check', unsafe):
            with self.assertRaises(UserError), self.env.cr.savepoint():
                self.payments.qorlia_cheque_void_run(**request)
        self.env.invalidate_all()
        self.assertEqual(payment.state, 'posted')
        self.assertTrue(payment.is_move_sent)
        self.assertEqual(invoice.amount_residual, 400)
        self.assertFalse(payment.qorlia_cheque_void_receipts)
