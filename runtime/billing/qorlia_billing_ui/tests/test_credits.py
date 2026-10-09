# SPDX-License-Identifier: LGPL-3.0-or-later
from odoo import Command, fields
from odoo.exceptions import AccessError, UserError, ValidationError
from odoo.tests import TransactionCase, tagged


@tagged('post_install', '-at_install')
class CreditWorkflowTest(TransactionCase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.moves = cls.env['account.move']
        cls.customer = cls.env['res.partner'].create({'name': 'QorliaQA Credit allocation'})
        cls.income = cls.env['account.account'].search([('company_id', '=', cls.env.company.id),
                                                      ('account_type', '=', 'income')], limit=1)

    def invoice(self, amount=500, **values):
        invoice = self.moves.create({'move_type': 'out_invoice', 'partner_id': self.customer.id,
            'invoice_date': fields.Date.today(), 'invoice_line_ids': [Command.create({
                'name': 'QorliaQA Credit service', 'account_id': self.income.id,
                'quantity': 1, 'price_unit': amount, 'tax_ids': [Command.clear()]})], **values})
        invoice.action_post()
        return invoice

    def apply(self, invoice, review, line=None):
        return self.moves.qorlia_credit_apply(invoice.id, line or review['credits'][0]['id'], review['version'])

    def test_partial_credit_note_then_remaining_credit_and_history(self):
        invoice = self.invoice()
        credit = self.invoice(100, move_type='out_refund')
        review = self.moves.qorlia_credit_load(invoice.id)
        self.assertEqual(len(review['credits']), 1)
        self.assertEqual(review['credits'][0]['amount'], 100)
        self.assertFalse(review['history'])
        self.assertEqual(invoice.amount_residual, 500)
        result = self.apply(invoice, review)
        self.assertEqual(result['invoice']['open_amount'], 400)
        self.assertEqual(result['invoice']['payment_state'], 'partial')
        self.assertEqual(credit.amount_residual, 0)
        self.assertEqual(result['history'][0]['amount'], 100)
        self.assertFalse(result['credits'])
        with self.assertRaises(UserError):
            self.apply(invoice, review)
        self.invoice(600, move_type='out_refund')
        result = self.apply(invoice, self.moves.qorlia_credit_load(invoice.id))
        self.assertEqual(result['invoice']['open_amount'], 0)
        self.assertEqual(len(result['history']), 2)
        self.assertFalse(invoice._get_reconciled_payments())

    def test_credit_review_is_read_only_and_version_stable_across_cache_resets(self):
        invoice = self.invoice()
        self.invoice(100, move_type='out_refund')
        self.env.flush_all()
        before = invoice.write_date
        review = self.moves.qorlia_credit_load(invoice.id)
        self.env.flush_all()
        self.env.invalidate_all()
        again = self.moves.qorlia_credit_load(invoice.id)
        self.env.flush_all()
        self.assertEqual(invoice.write_date, before)
        self.assertEqual(again['version'], review['version'])

    def test_outstanding_debit_on_credit_note(self):
        credit = self.invoice(100, move_type='out_refund')
        invoice = self.invoice(500)
        review = self.moves.qorlia_credit_load(credit.id)
        self.assertEqual(review['credits'][0]['amount'], 500)
        result = self.apply(credit, review)
        self.assertEqual(result['invoice']['open_amount'], 0)
        self.assertEqual(invoice.amount_residual, 400)

    def test_excess_receipt_applies_without_another_payment(self):
        original, invoice = self.invoice(), self.invoice()
        journal = self.env['account.journal'].create({'name': 'QorliaQA Credit cash', 'code': 'QCRD',
            'type': 'cash', 'company_id': self.env.company.id})
        journal.inbound_payment_method_line_ids.payment_account_id = journal.default_account_id
        wizard = self.env['account.payment.register'].with_context(active_model='account.move',
            active_ids=original.ids).create({'journal_id': journal.id, 'amount': 600})
        payment = wizard._create_payments()
        before = self.env['account.payment'].search_count([])
        review = self.moves.qorlia_credit_load(invoice.id)
        self.assertEqual(review['credits'][0]['amount'], 100)
        result = self.apply(invoice, review)
        self.assertEqual(result['invoice']['open_amount'], 400)
        self.assertEqual(original.amount_residual, 0)
        self.assertEqual(payment.reconciled_invoice_ids, original | invoice)
        self.assertEqual(self.env['account.payment'].search_count([]), before)
        self.assertEqual(result['history'][0]['amount'], 100)

    def test_foreign_currency_uses_native_widget_amount_and_rate_staleness(self):
        currency = self.env.ref('base.USD')
        if currency == self.env.company.currency_id:
            currency = self.env.ref('base.EUR')
        currency.active = True
        rate = self.env['res.currency.rate'].create({'currency_id': currency.id,
            'company_id': self.env.company.id, 'name': fields.Date.today(), 'rate': 0.5})
        invoice = self.invoice(currency_id=currency.id)
        credit = self.invoice(100, move_type='out_refund')
        review = self.moves.qorlia_credit_load(invoice.id)
        expected = self.env.company.currency_id._convert(100, currency, self.env.company, credit.date)
        self.assertEqual(review['credits'][0]['amount'], expected)
        rate.rate = 0.25
        with self.assertRaises(UserError):
            self.apply(invoice, review)
        review = self.moves.qorlia_credit_load(invoice.id)
        result = self.apply(invoice, review)
        self.assertAlmostEqual(result['invoice']['open_amount'], 500 - review['credits'][0]['amount'])
        self.assertFalse(invoice._get_unbalanced_moves({'records': invoice}))
        self.assertFalse(credit._get_unbalanced_moves({'records': credit}))

    def test_cashier_uses_native_credit_rights_without_admin(self):
        invoice = self.invoice()
        self.invoice(100, move_type='out_refund')
        cashier = self.env['res.users'].with_context(no_reset_password=True).create({
            'name': 'QorliaQA Credit cashier', 'login': 'qorliaqa-credit-cashier',
            'groups_id': [Command.set(self.env.ref('account.group_account_invoice').ids)],
            'company_id': self.env.company.id, 'company_ids': [Command.set(self.env.company.ids)]})
        moves = self.moves.with_user(cashier)
        review = moves.qorlia_credit_load(invoice.id)
        result = moves.qorlia_credit_apply(invoice.id, review['credits'][0]['id'], review['version'])
        self.assertEqual(result['invoice']['open_amount'], 400)

    def test_other_customer_or_non_receivable_cannot_be_assigned(self):
        invoice = self.invoice()
        other = self.env['res.partner'].create({'name': 'QorliaQA Other credit customer'})
        credit = self.invoice(100, move_type='out_refund', partner_id=other.id)
        review = self.moves.qorlia_credit_load(invoice.id)
        self.assertFalse(review['credits'])
        for line in credit.line_ids:
            with self.assertRaises(UserError):
                self.apply(invoice, review, line.id)
        self.assertEqual(invoice.amount_residual, 500)
        self.assertEqual(credit.amount_residual, 100)

    def test_stale_source_or_target_and_consumed_credit_cannot_apply(self):
        invoice = self.invoice()
        credit = self.invoice(100, move_type='out_refund')
        review = self.moves.qorlia_credit_load(invoice.id)
        credit.ref = 'QorliaQA concurrent credit edit'
        with self.assertRaises(UserError):
            self.apply(invoice, review)
        review = self.moves.qorlia_credit_load(invoice.id)
        invoice.ref = 'QorliaQA concurrent invoice edit'
        with self.assertRaises(UserError):
            self.apply(invoice, review)
        review = self.moves.qorlia_credit_load(invoice.id)
        competing = self.invoice()
        self.apply(competing, self.moves.qorlia_credit_load(competing.id))
        with self.assertRaises(UserError):
            self.apply(invoice, review)
        self.assertEqual(invoice.amount_residual, 500)

    def test_invalid_ids_and_permission_checks(self):
        invoice = self.invoice()
        self.invoice(100, move_type='out_refund')
        review = self.moves.qorlia_credit_load(invoice.id)
        for line in (True, -1, '1'):
            with self.assertRaises(ValidationError):
                self.apply(invoice, review, line)
        user = self.env['res.users'].with_context(no_reset_password=True).create({
            'name': 'QorliaQA No credit rights', 'login': 'qorliaqa-no-credit-rights',
            'groups_id': [Command.set([self.env.ref('base.group_user').id])]})
        with self.assertRaises(AccessError):
            self.moves.with_user(user).qorlia_credit_load(invoice.id)
        with self.assertRaises(AccessError):
            self.moves.with_user(user).qorlia_credit_apply(invoice.id, review['credits'][0]['id'], review['version'])

    def test_draft_invoice_and_unbalanced_source_have_no_action(self):
        invoice = self.invoice()
        invoice.button_draft()
        self.invoice(100, move_type='out_refund')
        self.assertFalse(self.moves.qorlia_credit_load(invoice.id)['credits'])
        invoice.action_post()
        credit = self.invoice(100, move_type='out_refund')
        credit.line_ids.flush_recordset()
        debit = credit.line_ids.filtered(lambda line: line.debit > 0)[0]
        self.env.cr.execute('UPDATE account_move_line SET debit = debit + 1, balance = balance + 1 WHERE id = %s', [debit.id])
        debit.invalidate_recordset()
        review = self.moves.qorlia_credit_load(invoice.id)
        invalid = next(row for row in review['credits'] if row['source_id'] == credit.id)
        self.assertFalse(invalid['can_apply'])
        with self.assertRaises(UserError):
            self.apply(invoice, review, invalid['id'])
