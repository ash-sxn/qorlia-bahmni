# SPDX-License-Identifier: LGPL-3.0-or-later
from odoo import Command, fields
from odoo.exceptions import AccessError, UserError, ValidationError
from odoo.tests import TransactionCase, tagged
from datetime import timedelta


@tagged('post_install', '-at_install')
class PaymentWorkflowTest(TransactionCase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.moves = cls.env['account.move']
        cls.customer = cls.env['res.partner'].create({'name': 'QorliaQA Payment customer'})
        cls.income = cls.env['account.account'].search([('company_id', '=', cls.env.company.id),
                                                      ('account_type', '=', 'income')], limit=1)
        cls.adjustment = cls.env['account.account'].search([('company_id', '=', cls.env.company.id),
                                                          ('account_type', '=', 'income_other')], limit=1)
        cls.journal = cls.env['account.journal'].create({'name': 'QorliaQA Manual cash', 'code': 'QPAY',
                                                       'type': 'cash', 'company_id': cls.env.company.id})
        cls.journal.inbound_payment_method_line_ids.payment_account_id = cls.journal.default_account_id
        cls.journal.outbound_payment_method_line_ids.payment_account_id = cls.journal.default_account_id

    def invoice(self, **values):
        invoice = self.moves.create({'move_type': 'out_invoice', 'partner_id': self.customer.id,
            'invoice_date': fields.Date.today(), 'discount_type': 'fixed', 'discount': 25,
            'disc_acc_id': self.adjustment.id,
            'invoice_line_ids': [Command.create({'name': 'QorliaQA Payment consultation',
                'account_id': self.income.id, 'quantity': 1, 'price_unit': 500,
                'tax_ids': [Command.clear()]})], **values})
        invoice.action_post()
        return invoice

    def review(self, invoice, amount=None):
        result = self.moves.qorlia_payment_load(invoice.id)
        result['values']['journal_id'] = self.journal.id
        result = self.moves.qorlia_payment_preview(invoice.id, result['invoice']['version'], result['values'], 'journal_id')
        if amount is not None:
            result['values']['amount'] = amount
            result = self.moves.qorlia_payment_preview(invoice.id, result['invoice']['version'], result['values'])
        return result

    def record(self, invoice, review):
        return self.moves.qorlia_payment_record(invoice.id, review['version'], review['values'])

    def test_preview_has_no_payment_and_full_payment_is_balanced(self):
        invoice = self.invoice()
        before = self.env['account.payment'].search_count([])
        review = self.review(invoice)
        self.assertTrue(review['can_record'])
        self.assertEqual(review['values']['amount'], 475)
        self.assertEqual(review['difference'], 0)
        self.assertEqual(self.env['account.payment'].search_count([]), before)
        result = self.record(invoice, review)
        self.assertEqual(result['invoice']['open_amount'], 0)
        self.assertEqual(result['invoice']['payment_state'], 'paid')
        self.assertFalse(result['can_record'])
        self.assertEqual(len(result['payments']), 1)
        payment = self.env['account.payment'].browse(result['payments'][0]['id'])
        self.assertEqual(payment.amount, 475)
        self.assertEqual(payment.state, 'posted')
        self.assertAlmostEqual(sum(payment.move_id.line_ids.mapped('balance')), 0)
        self.assertEqual(payment.reconciled_invoice_ids, invoice)
        with self.assertRaises(UserError):
            self.record(invoice, review)
        self.assertEqual(self.env['account.payment'].search_count([]), before + 1)

    def test_partial_payment_keeps_difference_open_and_replay_is_rejected(self):
        invoice = self.invoice()
        review = self.review(invoice, 100)
        self.assertEqual(review['difference'], 375)
        self.assertEqual(review['values']['payment_difference_handling'], 'open')
        result = self.record(invoice, review)
        self.assertEqual(result['invoice']['open_amount'], 375)
        self.assertEqual(result['invoice']['payment_state'], 'partial')
        with self.assertRaises(UserError):
            self.record(invoice, review)
        self.assertEqual(len(invoice._get_reconciled_payments()), 1)
        result = self.record(invoice, self.review(invoice))
        self.assertEqual(result['invoice']['open_amount'], 0)
        self.assertEqual(len(result['payments']), 2)

    def test_credit_note_refund_is_native_outbound_payment(self):
        invoice = self.invoice(move_type='out_refund')
        review = self.review(invoice, 100)
        self.assertEqual(review['payment_type'], 'outbound')
        result = self.record(invoice, review)
        self.assertEqual(result['invoice']['open_amount'], 375)
        payment = self.env['account.payment'].browse(result['payments'][0]['id'])
        self.assertEqual(payment.payment_type, 'outbound')
        self.assertEqual(payment.reconciled_invoice_ids, invoice)
        self.assertAlmostEqual(sum(payment.move_id.line_ids.mapped('balance')), 0)

    def test_writeoff_requires_account_then_uses_native_reconciliation(self):
        invoice = self.invoice()
        review = self.review(invoice, 470)
        review['values']['payment_difference_handling'] = 'reconcile'
        review = self.moves.qorlia_payment_preview(invoice.id, review['invoice']['version'], review['values'])
        self.assertFalse(review['can_record'])
        with self.assertRaises(UserError):
            self.record(invoice, review)
        review['values']['writeoff_account_id'] = self.adjustment.id
        review['values']['writeoff_label'] = 'QorliaQA Agreed settlement difference'
        review = self.moves.qorlia_payment_preview(invoice.id, review['invoice']['version'], review['values'])
        result = self.record(invoice, review)
        self.assertEqual(result['invoice']['open_amount'], 0)
        payment = self.env['account.payment'].browse(result['payments'][0]['id'])
        self.assertEqual(payment.amount, 470)
        self.assertEqual(payment.move_id.line_ids.filtered(lambda l: l.account_id == self.adjustment).balance, 5)

    def test_instalments_use_one_native_payment(self):
        term = self.env['account.payment.term'].create({'name': 'QorliaQA Payment installments',
            'line_ids': [Command.create({'value': 'percent', 'value_amount': 50, 'days': 0}),
                         Command.create({'value': 'balance', 'days': 30})]})
        invoice = self.invoice(invoice_payment_term_id=term.id)
        result = self.record(invoice, self.review(invoice, 100))
        self.assertEqual(result['invoice']['open_amount'], 375)
        self.assertEqual(len(result['payments']), 1)

    def test_stale_invoice_or_journal_config_cannot_record(self):
        invoice = self.invoice()
        review = self.review(invoice)
        invoice.ref = 'QorliaQA concurrent invoice edit'
        with self.assertRaises(UserError):
            self.record(invoice, review)
        with self.assertRaises(UserError):
            self.moves.qorlia_payment_preview(invoice.id, review['invoice']['version'], review['values'])
        review = self.review(invoice)
        self.journal.write({'name': 'QorliaQA Changed cash configuration'})
        with self.assertRaises(UserError):
            self.record(invoice, review)
        self.assertFalse(invoice._get_reconciled_payments())

    def test_invalid_inputs_and_unprivileged_direct_calls(self):
        invoice = self.invoice()
        review = self.review(invoice)
        for patch in ({'amount': 0}, {'amount': float('nan')}, {'amount': True}, {'journal_id': True},
                      {'payment_date': 'not-a-date'}, {'sudo': True}, {'communication': 'x' * 501}):
            with self.assertRaises(ValidationError):
                self.moves.qorlia_payment_preview(invoice.id, review['invoice']['version'], {**review['values'], **patch})
        user = self.env['res.users'].with_context(no_reset_password=True).create({
            'name': 'QorliaQA No payment rights', 'login': 'qorlia-qa-no-payment',
            'groups_id': [Command.set(self.env.ref('base.group_user').ids)],
            'company_id': self.env.company.id, 'company_ids': [Command.set(self.env.company.ids)]})
        with self.assertRaises(AccessError):
            self.moves.with_user(user).qorlia_payment_load(invoice.id)
        with self.assertRaises(AccessError):
            self.moves.with_user(user).qorlia_payment_record(invoice.id, review['version'], review['values'])

    def test_foreign_currency_payment_uses_native_conversion(self):
        currency = self.env['res.currency'].search([('name', '=', 'USD')], limit=1)
        if currency == self.env.company.currency_id:
            currency = self.env['res.currency'].search([('name', '=', 'EUR')], limit=1)
        currency.active = True
        self.env['res.currency.rate'].create({'currency_id': currency.id, 'company_id': self.env.company.id,
                                             'name': fields.Date.today(), 'rate': 0.5})
        self.journal.currency_id = currency
        invoice = self.invoice(currency_id=currency.id)
        result = self.record(invoice, self.review(invoice, 100))
        self.assertEqual(result['invoice']['open_amount'], 375)
        payment = self.env['account.payment'].browse(result['payments'][0]['id'])
        self.assertEqual(payment.currency_id, currency)
        self.assertEqual(payment.amount, 100)
        self.assertAlmostEqual(sum(payment.move_id.line_ids.mapped('balance')), 0)
        self.assertAlmostEqual(sum(payment.move_id.line_ids.mapped('amount_currency')), 0)

    def test_overpayment_does_not_allocate_to_another_invoice(self):
        invoice, unrelated = self.invoice(), self.invoice()
        review = self.review(invoice, 500)
        self.assertEqual(review['difference'], -25)
        result = self.record(invoice, review)
        self.assertEqual(result['invoice']['open_amount'], 0)
        payment = self.env['account.payment'].browse(result['payments'][0]['id'])
        self.assertEqual(payment.reconciled_invoice_ids, invoice)
        receivable = payment.move_id.line_ids.filtered(lambda l: l.account_id.account_type == 'asset_receivable')
        self.assertEqual(abs(receivable.amount_residual), 25)
        self.assertEqual(unrelated.amount_residual, 475)
        self.assertFalse(unrelated._get_reconciled_payments())

    def test_bank_matching_is_separate_from_native_invoice_payment_state(self):
        outstanding = self.env['account.account'].create({'name': 'QorliaQA Outstanding receipts',
            'code': 'QOROUT', 'account_type': 'asset_current', 'reconcile': True,
            'company_id': self.env.company.id})
        bank = self.env['account.journal'].create({'name': 'QorliaQA Bank awaiting clearance',
            'code': 'QBNK', 'type': 'bank', 'company_id': self.env.company.id})
        bank.inbound_payment_method_line_ids.payment_account_id = outstanding
        invoice = self.invoice()
        review = self.moves.qorlia_payment_load(invoice.id)
        review['values']['journal_id'] = bank.id
        review = self.moves.qorlia_payment_preview(invoice.id, review['invoice']['version'], review['values'], 'journal_id')
        result = self.record(invoice, review)
        self.assertEqual(result['invoice']['open_amount'], 0)
        self.assertEqual(result['invoice']['payment_state'], invoice._get_invoice_in_payment_state())
        self.assertEqual(result['payments'][0]['journal_type'], 'bank')
        self.assertFalse(result['payments'][0]['is_matched'])
        self.assertFalse(self.env['account.payment'].browse(result['payments'][0]['id']).is_matched)

    def test_drafts_and_unbalanced_invoices_cannot_record_payments(self):
        invoice = self.invoice()
        invoice.button_draft()
        result = self.moves.qorlia_payment_load(invoice.id)
        self.assertFalse(result['can_record'])
        self.assertFalse(result['values'])
        with self.assertRaises(UserError):
            self.record(invoice, {**result, 'version': 'a' * 64, 'values': {}})
        invoice.action_post()
        self.env.flush_all()
        self.env.cr.execute('UPDATE account_move_line SET debit = debit + 1, balance = balance + 1 '
                            'WHERE id = %s', [invoice.line_ids.filtered(lambda l: l.display_type == 'payment_term').id])
        invoice.line_ids.invalidate_recordset()
        result = self.moves.qorlia_payment_load(invoice.id)
        self.assertFalse(result['invoice']['ledger_balanced'])
        self.assertFalse(result['can_record'])
        self.assertFalse(invoice._get_reconciled_payments())

    def test_billing_cashier_uses_native_rights_without_admin_privileges(self):
        invoice = self.invoice()
        cashier = self.env['res.users'].with_context(no_reset_password=True).create({
            'name': 'QorliaQA Native cashier', 'login': 'qorlia-qa-native-cashier',
            'groups_id': [Command.set(self.env.ref('account.group_account_invoice').ids)],
            'company_id': self.env.company.id, 'company_ids': [Command.set(self.env.company.ids)]})
        moves = self.moves.with_user(cashier)
        review = moves.qorlia_payment_load(invoice.id)
        review['values']['journal_id'] = self.journal.id
        review = moves.qorlia_payment_preview(invoice.id, review['invoice']['version'], review['values'], 'journal_id')
        result = moves.qorlia_payment_record(invoice.id, review['version'], review['values'])
        self.assertEqual(result['invoice']['open_amount'], 0)
        self.assertEqual(len(result['payments']), 1)

    def cheque_review(self, invoice, method_ref, journal_code='QCHQ', **values):
        outstanding = self.env['account.account'].create({'name': 'QorliaQA Cheque outstanding',
            'code': journal_code + 'OUT', 'account_type': 'asset_current', 'reconcile': True,
            'company_id': self.env.company.id})
        bank = self.env['account.journal'].create({'name': 'QorliaQA Cheque bank', 'code': journal_code,
            'type': 'bank', 'company_id': self.env.company.id})
        method = self.env.ref(method_ref)
        line = self.env['account.payment.method.line'].create({'journal_id': bank.id,
            'payment_method_id': method.id, 'payment_account_id': outstanding.id})
        result = self.moves.qorlia_payment_load(invoice.id)
        result['values']['journal_id'] = bank.id
        result = self.moves.qorlia_payment_preview(invoice.id, result['invoice']['version'], result['values'], 'journal_id')
        result['values'].update({'payment_method_line_id': line.id, **values})
        return self.moves.qorlia_payment_preview(invoice.id, result['invoice']['version'], result['values'], 'payment_method_line_id')

    def test_pdc_requires_effective_date_and_cannot_record_incomplete_review(self):
        invoice = self.invoice()
        review = self.cheque_review(invoice, 'base_accounting_kit.account_payment_method_pdc_in')
        self.assertEqual(review['method_code'], 'pdc')
        self.assertFalse(review['can_record'])
        self.assertIn('effective date', review['reason'])
        with self.assertRaises(UserError):
            self.record(invoice, review)
        self.assertFalse(invoice._get_reconciled_payments())

    def test_sent_status_preserves_real_pdc_invoice_allocation(self):
        from uuid import uuid4
        invoice = self.invoice()
        review = self.cheque_review(invoice, 'base_accounting_kit.account_payment_method_pdc_in',
            amount=100, effective_date=str(fields.Date.today() + timedelta(days=30)),
            bank_reference='QorliaQA sent bank', cheque_reference='QorliaQA sent cheque')
        result = self.record(invoice, review)
        payments = self.env['account.payment']
        payment = payments.browse(result['payments'][0]['id'])
        before = payments._qorlia_cheque_financial_state(payment)
        residual = invoice.amount_residual
        for action in ('mark_sent', 'unmark_sent'):
            loaded = payments.qorlia_cheque_sent_load(payment.id)
            prepared = payments.qorlia_cheque_sent_preview(payment.id, loaded['version'], action)
            payments.qorlia_cheque_sent_run(payment.id, loaded['version'], prepared['review_version'], str(uuid4()), action)
            self.assertEqual(before, payments._qorlia_cheque_financial_state(payment))
            self.assertEqual(invoice.amount_residual, residual)
            self.assertEqual(payment.reconciled_invoice_ids, invoice)
            self.assertFalse(payment.is_matched)

    def test_inbound_pdc_records_native_references_without_deferring_posting(self):
        invoice, unrelated = self.invoice(), self.invoice()
        payment_date = fields.Date.today()
        effective_date = payment_date + timedelta(days=30)
        before = self.env['account.payment'].search_count([])
        review = self.cheque_review(invoice, 'base_accounting_kit.account_payment_method_pdc_in',
            amount=100, payment_date=str(payment_date), effective_date=str(effective_date),
            cheque_reference='QorliaQA PDC 001', bank_reference='QorliaQA Bank reference')
        self.assertTrue(review['can_record'])
        self.assertEqual(self.env['account.payment'].search_count([]), before)
        result = self.record(invoice, review)
        payment = invoice._get_reconciled_payments()
        self.assertEqual(payment.effective_date, effective_date)
        self.assertEqual(payment.date, payment_date)
        self.assertEqual(payment.move_id.date, payment_date)
        self.assertEqual(payment.cheque_reference, 'QorliaQA PDC 001')
        self.assertEqual(payment.bank_reference, 'QorliaQA Bank reference')
        self.assertEqual(payment.state, 'posted')
        self.assertFalse(payment.is_matched)
        self.assertAlmostEqual(sum(payment.move_id.line_ids.mapped('balance')), 0)
        self.assertEqual(result['invoice']['open_amount'], 375)
        self.assertEqual(unrelated.amount_residual, 475)
        self.assertFalse(unrelated._get_reconciled_payments())
        saved = self.moves.qorlia_payment_load(invoice.id)['payments'][0]
        for field in ('bank_reference', 'cheque_reference', 'effective_date'):
            self.assertEqual(saved[field], review['values'][field])
        self.assertEqual(saved['method_code'], 'pdc')
        self.assertFalse(saved['is_matched'])
        with self.assertRaises(UserError):
            self.record(invoice, review)
        self.assertEqual(self.env['account.payment'].search_count([]), before + 1)

    def test_outbound_cheque_and_pdc_use_native_refund_method(self):
        for index, method_ref in enumerate(('account_check_printing.account_payment_method_check',
                           'base_accounting_kit.account_payment_method_pdc_out')):
            with self.subTest(method=method_ref), self.cr.savepoint():
                invoice = self.invoice(move_type='out_refund')
                review = self.cheque_review(invoice, method_ref, journal_code='QCH%s' % index, amount=100,
                    effective_date=str(fields.Date.today() + timedelta(days=30)),
                    cheque_reference='QorliaQA Refund cheque', bank_reference='QorliaQA Refund bank')
                self.assertTrue(review['can_record'])
                self.assertEqual(review['payment_type'], 'outbound')
                result = self.record(invoice, review)
                payment = invoice._get_reconciled_payments()
                self.assertEqual(payment.payment_method_id, self.env.ref(method_ref))
                self.assertEqual(payment.cheque_reference, review['values']['cheque_reference'])
                self.assertEqual(result['payments'][0]['method_code'], self.env.ref(method_ref).code)
                self.assertEqual(result['invoice']['open_amount'], 375)
                self.assertFalse(payment.is_matched)
                self.assertAlmostEqual(sum(payment.move_id.line_ids.mapped('balance')), 0)

    def test_cashier_records_pdc_with_native_rights_and_no_admin_escalation(self):
        invoice = self.invoice()
        review = self.cheque_review(invoice, 'base_accounting_kit.account_payment_method_pdc_in',
            amount=100, effective_date=str(fields.Date.today() + timedelta(days=30)))
        cashier = self.env['res.users'].with_context(no_reset_password=True).create({
            'name': 'QorliaQA Cheque cashier', 'login': 'qorlia-qa-cheque-cashier',
            'groups_id': [Command.set(self.env.ref('account.group_account_invoice').ids)],
            'company_id': self.env.company.id, 'company_ids': [Command.set(self.env.company.ids)]})
        moves = self.moves.with_user(cashier)
        review = moves.qorlia_payment_preview(invoice.id, review['invoice']['version'], review['values'])
        result = moves.qorlia_payment_record(invoice.id, review['version'], review['values'])
        self.assertEqual(result['invoice']['open_amount'], 375)
        self.assertEqual(result['payments'][0]['method_code'], 'pdc')

    def test_cheque_metadata_rejects_invalid_dates_text_and_foreign_journal_method(self):
        invoice = self.invoice()
        review = self.cheque_review(invoice, 'base_accounting_kit.account_payment_method_pdc_in',
            effective_date=str(fields.Date.today()))
        for patch in ({'effective_date': '2026-02-30'}, {'effective_date': True},
                      {'effective_date': ''}, {'cheque_reference': 123}, {'bank_reference': 'x' * 501},
                      {'payment_method_line_id': self.journal.inbound_payment_method_line_ids[0].id}):
            with self.assertRaises(ValidationError):
                self.moves.qorlia_payment_preview(invoice.id, review['invoice']['version'], {**review['values'], **patch})
        self.assertFalse(invoice._get_reconciled_payments())

    def test_changed_method_code_invalidates_review_and_unsupported_method_cannot_record(self):
        invoice = self.invoice()
        review = self.review(invoice)
        method = self.journal.inbound_payment_method_line_ids.payment_method_id
        method.code = 'qorlia_unsupported'
        with self.assertRaises(UserError):
            self.record(invoice, review)
        result = self.moves.qorlia_payment_preview(invoice.id, review['invoice']['version'], review['values'])
        self.assertFalse(result['can_record'])
        self.assertIn('separate collection workflow', result['reason'])
        with self.assertRaises(UserError):
            self.record(invoice, result)
        self.assertFalse(invoice._get_reconciled_payments())
