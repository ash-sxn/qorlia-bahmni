# SPDX-License-Identifier: LGPL-3.0-or-later
import uuid
from unittest.mock import patch

from odoo import Command, fields
from odoo.exceptions import AccessError, UserError, ValidationError
from odoo.tests import TransactionCase, tagged


@tagged('post_install', '-at_install')
class PaymentLifecycleTest(TransactionCase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.payments = cls.env['account.payment']
        cls.moves = cls.env['account.move']
        cls.customer = cls.env['res.partner'].create({'name': 'QorliaQA Lifecycle customer'})
        cls.income = cls.env['account.account'].search([('company_id', '=', cls.env.company.id), ('account_type', '=', 'income')], limit=1)
        cls.journal = cls.env['account.journal'].create({'name': 'QorliaQA Lifecycle bank', 'code': 'QLIFE', 'type': 'bank'})
        cls.journal.inbound_payment_method_line_ids.payment_account_id = cls.journal.default_account_id
        cls.journal.outbound_payment_method_line_ids.payment_account_id = cls.journal.default_account_id
        cls.method = cls.journal.inbound_payment_method_line_ids.filtered(lambda row: row.code == 'manual')[:1]

    def payment(self, **values):
        return self.payments.create({'partner_id': self.customer.id, 'partner_type': 'customer',
            'payment_type': 'inbound', 'amount': 100, 'date': fields.Date.today(),
            'journal_id': self.journal.id, 'payment_method_line_id': self.method.id,
            'bank_reference': 'QorliaQA Lifecycle bank ref', 'cheque_reference': 'QorliaQA Lifecycle cheque ref', **values})

    def invoice(self, amount=500, **values):
        invoice = self.moves.create({'move_type': 'out_invoice', 'partner_id': self.customer.id,
            'invoice_date': fields.Date.today(), 'invoice_line_ids': [Command.create({'name': 'QorliaQA Lifecycle service',
                'account_id': self.income.id, 'price_unit': amount, 'quantity': 1, 'tax_ids': [Command.clear()]})], **values})
        invoice.action_post()
        return invoice

    def request(self, payment, action):
        loaded = self.payments.qorlia_payment_state_load(payment.id)
        review = self.payments.qorlia_payment_state_preview(payment.id, loaded['version'], action)
        return {'payment_id': payment.id, 'version': loaded['version'], 'review_version': review['review_version'],
                'action': action, 'request_key': str(uuid.uuid4())}

    def run_action(self, payment, action):
        return self.payments.qorlia_payment_state_run(**self.request(payment, action))

    def test_native_confirm_reset_cancel_and_reset_cancelled_payment(self):
        payment = self.payment()
        self.assertEqual(self.run_action(payment, 'post')['payment']['state'], 'posted')
        self.assertEqual(self.run_action(payment, 'reset')['payment']['state'], 'draft')
        self.assertEqual(self.run_action(payment, 'cancel')['payment']['state'], 'cancel')
        self.assertEqual(self.run_action(payment, 'reset')['payment']['state'], 'draft')
        self.assertEqual(payment.amount, 100)
        self.assertEqual(len(payment.qorlia_payment_state_receipts), 4)

    def test_reset_reopens_invoice_and_keeps_payment_in_history(self):
        invoice, payment = self.invoice(), self.payment()
        payment.action_post()
        (payment.move_id.line_ids | invoice.line_ids).filtered(lambda line: line.account_id.account_type == 'asset_receivable').reconcile()
        self.assertEqual(invoice.amount_residual, 400)
        self.run_action(payment, 'reset')
        self.assertEqual(invoice.amount_residual, 500)
        self.assertFalse(payment.reconciled_invoice_ids)
        self.assertEqual(self.payments.qorlia_payment_history(search='QorliaQA Lifecycle customer', state='draft')['rows'][0]['payment_id'], payment.id)
        self.run_action(payment, 'cancel')
        self.assertEqual(self.payments.qorlia_payment_history(state='cancel')['rows'][0]['payment_id'], payment.id)

    def test_selected_credit_reset_reopens_independent_credit_allocation(self):
        payment = self.payment()
        invoice, credit = self.invoice(), self.invoice(100, move_type='out_refund')
        payment.action_post()
        payment.credit_invoice_lines = [Command.create({'invoice_id': credit.id, 'selected': True, 'allocated_amount': 100})]
        payment.outstanding_invoice_lines = [Command.create({'invoice_id': invoice.id, 'selected': True, 'allocated_amount': 100})]
        invoice.js_assign_outstanding_line(credit.line_ids.filtered(lambda line: line.display_type == 'payment_term').id)
        review = self.payments.qorlia_payment_state_load(payment.id)
        self.assertTrue({invoice.id, credit.id}.issubset({row['id'] for row in review['documents']}))
        self.run_action(payment, 'reset')
        self.assertEqual(invoice.amount_residual, 500)
        self.assertEqual(credit.amount_residual, 100)

    def test_confirm_preserves_native_customer_context_and_auto_allocations(self):
        self.env['ir.config_parameter'].set_param('bahmni_auto_payment_reconciliation.enabled', 'True')
        payment, invoice, credit = self.payment(), self.invoice(), self.invoice(100, move_type='out_refund')
        payment.credit_invoice_lines = [Command.create({'invoice_id': credit.id, 'selected': True, 'allocated_amount': 100})]
        payment.outstanding_invoice_lines = [Command.create({'invoice_id': invoice.id, 'selected': True, 'allocated_amount': 200})]
        payment.write({'current_outstanding': 400, 'balance_outstanding': 300})
        self.assertTrue(self.payments.qorlia_payment_state_load(payment.id)['auto_allocate'])
        self.run_action(payment, 'post')
        self.assertEqual(invoice.amount_residual, 300)
        self.assertEqual(credit.amount_residual, 0)
        self.assertTrue(payment.reconciled_invoice_ids)

    def test_native_context_compute_cache_does_not_change_review_after_lock(self):
        self.env['ir.config_parameter'].set_param('bahmni_auto_payment_reconciliation.enabled', 'True')
        payment = self.payment()
        self.assertFalse(payment.with_context(default_partner_type=False).is_auto_reconciliation_applicable)
        request = self.request(payment, 'post')
        self.assertTrue(self.payments.qorlia_payment_state_load(payment.id)['auto_allocate'])
        self.assertTrue(self.payments.qorlia_payment_state_run(**request)['accepted'])
        self.assertEqual(payment.state, 'posted')

    def test_confirm_assigns_native_manual_cheque_sequence_only_once(self):
        method = self.journal.outbound_payment_method_line_ids.filtered(lambda row: row.code == 'check_printing')
        if not method:
            method = self.env['account.payment.method.line'].create({'journal_id': self.journal.id,
                'payment_method_id': self.env.ref('account_check_printing.account_payment_method_check').id,
                'payment_account_id': self.journal.default_account_id.id})
        self.journal.check_manual_sequencing = True
        payment = self.payment(payment_type='outbound', payment_method_line_id=method.id)
        request = self.request(payment, 'post')
        self.payments.qorlia_payment_state_run(**request)
        number = payment.check_number
        self.assertTrue(number)
        with patch.object(type(payment), 'action_post') as native:
            self.payments.qorlia_payment_state_run(**request)
            native.assert_not_called()
        self.assertEqual(payment.check_number, number)

    def test_pdc_uses_generic_native_lifecycle_not_cheque_void(self):
        method = self.env['account.payment.method.line'].create({'journal_id': self.journal.id,
            'payment_method_id': self.env.ref('base_accounting_kit.account_payment_method_pdc_in').id,
            'payment_account_id': self.journal.default_account_id.id})
        payment = self.payment(payment_method_line_id=method.id, effective_date=fields.Date.today())
        self.run_action(payment, 'post')
        self.run_action(payment, 'reset')
        self.run_action(payment, 'cancel')
        self.assertEqual(payment.state, 'cancel')
        self.assertFalse(payment.qorlia_cheque_void_receipts)

    def test_exact_receipt_after_later_transition_does_not_restore_old_state(self):
        payment = self.payment()
        request = self.request(payment, 'post')
        self.payments.qorlia_payment_state_run(**request)
        self.run_action(payment, 'reset')
        self.run_action(payment, 'cancel')
        with patch.object(type(payment), 'action_post') as native:
            result = self.payments.qorlia_payment_state_run(**request)
            native.assert_not_called()
        self.assertTrue(result['accepted'])
        self.assertEqual(result['payment']['state'], 'cancel')

    def test_cancel_posted_is_denied_before_native_write(self):
        payment = self.payment()
        payment.action_post()
        self.assertTrue(self.payments.qorlia_payment_state_load(payment.id)['reasons']['cancel'])
        with self.assertRaises(UserError):
            self.request(payment, 'cancel')
        self.assertEqual(payment.state, 'posted')

    def test_stale_connected_document_and_payment_reject_review(self):
        invoice, payment = self.invoice(), self.payment()
        payment.outstanding_invoice_lines = [Command.create({'invoice_id': invoice.id, 'selected': True, 'allocated_amount': 100})]
        request = self.request(payment, 'post')
        invoice.ref = 'QorliaQA Lifecycle changed'
        with self.assertRaises(UserError):
            self.payments.qorlia_payment_state_run(**request)
        request = self.request(payment, 'post')
        payment.bank_reference = 'Changed'
        with self.assertRaises(UserError):
            self.payments.qorlia_payment_state_run(**request)
        self.assertEqual(payment.state, 'draft')

    def test_conflicting_uuid_invalid_action_and_bad_review_are_denied(self):
        payment = self.payment()
        request = self.request(payment, 'post')
        with self.assertRaises(UserError):
            self.payments.qorlia_payment_state_run(**{**request, 'review_version': 'b' * 64})
        self.payments.qorlia_payment_state_run(**request)
        with self.assertRaises(ValidationError):
            self.payments.qorlia_payment_state_status(**{**request, 'action': 'reset'})
        with self.assertRaises(ValidationError):
            self.payments.qorlia_payment_state_status(**{**request, 'action': 'unlink'})
        with self.assertRaises(ValidationError):
            self.payments.qorlia_payment_state_load(True)

    def test_readonly_user_can_list_but_cannot_change_payment(self):
        payment = self.payment()
        reader = self.env['res.users'].with_context(no_reset_password=True).create({'name': 'QorliaQA Lifecycle reader',
            'login': 'qorliaqa-life-reader-' + str(uuid.uuid4()), 'company_id': self.env.company.id,
            'company_ids': [Command.set(self.env.company.ids)],
            'groups_id': [Command.set(self.env.ref('account.group_account_readonly').ids)]})
        model = self.payments.with_user(reader)
        self.assertTrue(model.qorlia_payment_history(search='QorliaQA Lifecycle customer')['rows'])
        self.assertTrue(all(model.qorlia_payment_state_load(payment.id)['reasons'].values()))
        with self.assertRaises(UserError):
            model.qorlia_payment_state_run(**self.request(payment, 'post'))
        self.assertEqual(payment.state, 'draft')

    def test_hidden_connected_document_is_not_exposed_or_mutated(self):
        invoice, payment = self.invoice(), self.payment()
        payment.outstanding_invoice_lines = [Command.create({'invoice_id': invoice.id, 'selected': True, 'allocated_amount': 100})]
        cashier = self.env['res.users'].with_context(no_reset_password=True).create({'name': 'QorliaQA Lifecycle cashier',
            'login': 'qorliaqa-life-cashier-' + str(uuid.uuid4()), 'company_id': self.env.company.id,
            'company_ids': [Command.set(self.env.company.ids)],
            'groups_id': [Command.set(self.env.ref('account.group_account_invoice').ids)]})
        self.env['ir.rule'].create({'name': 'QorliaQA Lifecycle hidden invoice',
            'model_id': self.env['ir.model']._get_id('account.move'), 'domain_force': "[('id', '!=', %s)]" % invoice.id})
        with self.assertRaises(AccessError):
            self.payments.with_user(cashier).qorlia_payment_state_load(payment.id)

    def test_vendor_internal_and_invalid_history_filters_are_rejected(self):
        vendor = self.payment(partner_type='supplier')
        with self.assertRaises(UserError):
            self.payments.qorlia_payment_state_load(vendor.id)
        for kwargs in ({'offset': True}, {'offset': -1}, {'state': 'sent'}, {'search': 'x' * 161}):
            with self.assertRaises(ValidationError):
                self.payments.qorlia_payment_history(**kwargs)
        self.assertNotIn(vendor.id, [row['payment_id'] for row in self.payments.qorlia_payment_history()['rows']])

    def test_history_paginates_without_duplicates_and_includes_unallocated_drafts(self):
        payments = self.payments.browse()
        for _ in range(27):
            payments |= self.payment()
        first = self.payments.qorlia_payment_history(search='QorliaQA Lifecycle customer')
        second = self.payments.qorlia_payment_history(search='QorliaQA Lifecycle customer', offset=25)
        self.assertTrue(first['has_more'])
        self.assertFalse(second['has_more'])
        self.assertEqual({row['payment_id'] for row in first['rows'] + second['rows']}, set(payments.ids))

    def test_strict_posted_journal_denies_reset(self):
        payment = self.payment()
        self.journal.restrict_mode_hash_table = True
        payment.action_post()
        self.assertTrue(self.payments.qorlia_payment_state_load(payment.id)['reasons']['reset'])
        with self.assertRaises(UserError):
            self.request(payment, 'reset')

    def test_unexpected_financial_change_rolls_back_payment_and_receipt(self):
        payment = self.payment()
        request = self.request(payment, 'post')
        native = type(payment).action_post
        def changed(record):
            native(record)
            record.bank_reference = 'QorliaQA Unreviewed change'
        with self.assertRaises(UserError), self.env.cr.savepoint(), patch.object(type(payment), 'action_post', changed):
            self.payments.qorlia_payment_state_run(**request)
        payment.invalidate_recordset()
        self.assertEqual(payment.state, 'draft')
        self.assertFalse(payment.qorlia_payment_state_receipts)
