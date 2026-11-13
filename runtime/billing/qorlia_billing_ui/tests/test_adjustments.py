# SPDX-License-Identifier: LGPL-3.0-or-later
from odoo import Command, fields
from odoo.exceptions import UserError, ValidationError
from odoo.tests import TransactionCase, tagged


@tagged('post_install', '-at_install')
class InvoiceAdjustmentTest(TransactionCase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.customer = cls.env['res.partner'].create({'name': 'QorliaQA Adjustment customer'})
        cls.income = cls.env['account.account'].search([
            ('company_id', '=', cls.env.company.id), ('account_type', '=', 'income')], limit=1)
        cls.adjustment = cls.env['account.account'].search([
            ('company_id', '=', cls.env.company.id), ('account_type', '=', 'income_other')], limit=1)
        cls.tax = cls.env['account.tax'].create({'name': 'QorliaQA Adjustment arithmetic tax',
            'amount': 5, 'type_tax_use': 'sale', 'company_id': cls.env.company.id})

    def invoice(self, **values):
        return self.env['account.move'].create({
            'move_type': 'out_invoice', 'partner_id': self.customer.id,
            'invoice_date': fields.Date.today(), 'discount_type': 'fixed', 'discount': 25,
            'disc_acc_id': self.adjustment.id,
            'invoice_line_ids': [Command.create({'name': 'QorliaQA Consultation',
                'account_id': self.income.id, 'quantity': 2, 'price_unit': 500,
                'discount': 10, 'tax_ids': [Command.set(self.tax.ids)]})], **values})

    def assert_ledger(self, invoice, amount):
        self.assertEqual(invoice.state, 'posted')
        self.assertAlmostEqual(invoice.amount_total, amount, places=2)
        self.assertAlmostEqual(invoice.invoice_total, amount, places=2)
        self.assertAlmostEqual(invoice.amount_residual, amount, places=2)
        self.assertAlmostEqual(invoice.amount_tax, 45, places=2)
        self.assertAlmostEqual(sum(invoice.line_ids.mapped('balance')), 0, places=2)
        self.assertEqual(invoice.payment_state, 'not_paid')
        self.assertFalse(invoice._get_reconciled_payments())

    def test_fixed_discount_posts_counterpart_without_changing_tax(self):
        invoice = self.invoice()
        invoice.action_post()
        self.assert_ledger(invoice, 920)
        adjustment = invoice.line_ids.filtered('qorlia_adjustment_kind')
        self.assertEqual(len(adjustment), 1)
        self.assertEqual(adjustment.account_id, self.adjustment)
        self.assertEqual(adjustment.balance, 25)
        self.assertEqual(invoice.qorlia_item_subtotal, 900)
        self.assertFalse(adjustment.tax_ids)

    def test_percentage_discount_and_credit_note(self):
        for move_type in ('out_invoice', 'out_refund'):
            invoice = self.invoice(move_type=move_type, discount_type='percentage',
                discount_percentage=10, discount=94.5)
            invoice.action_post()
            self.assert_ledger(invoice, 850.5)
            line = invoice.line_ids.filtered('qorlia_adjustment_kind')
            self.assertEqual(line.balance, 94.5 if move_type == 'out_invoice' else -94.5)

    def test_rounding_uses_explicit_account_for_both_signs(self):
        self.env.company.qorlia_rounding_account_id = self.adjustment
        for move_type in ('out_invoice', 'out_refund'):
            for rounding in (0.25, -0.25):
                invoice = self.invoice(move_type=move_type, round_off_amount=rounding)
                invoice.action_post()
                self.assert_ledger(invoice, 920 + rounding)
                lines = invoice.line_ids.filtered('qorlia_adjustment_kind')
                self.assertEqual(len(lines), 2)
                self.assertFalse(lines.tax_ids)

    def test_missing_rounding_account_rolls_back(self):
        self.env.company.qorlia_rounding_account_id = False
        invoice = self.invoice(round_off_amount=0.25)
        with self.assertRaisesRegex(ValidationError, 'rounding account'), self.env.cr.savepoint():
            invoice.action_post()
        invoice.invalidate_recordset()
        self.assertEqual(invoice.state, 'draft')
        self.assertFalse(invoice.line_ids.filtered('qorlia_adjustment_kind'))
        self.assertAlmostEqual(sum(invoice.line_ids.mapped('balance')), 0, places=2)

    def test_installments_are_split_by_native_payment_terms(self):
        term = self.env['account.payment.term'].create({'name': 'QorliaQA Two installments',
            'line_ids': [Command.create({'value': 'percent', 'value_amount': 50, 'days': 0}),
                         Command.create({'value': 'balance', 'days': 30})]})
        invoice = self.invoice(invoice_payment_term_id=term.id)
        invoice.action_post()
        self.assert_ledger(invoice, 920)
        terms = invoice.line_ids.filtered(lambda line: line.display_type == 'payment_term')
        self.assertEqual(len(terms), 2)
        self.assertEqual(sorted(terms.mapped('amount_currency')), [460, 460])

    def test_reset_and_repost_updates_adjustments_without_duplicates(self):
        invoice = self.invoice()
        invoice.action_post()
        invoice.button_draft()
        invoice.write({'discount': 50})
        invoice.action_post()
        self.assert_ledger(invoice, 895)
        self.assertEqual(len(invoice.line_ids.filtered('qorlia_adjustment_kind')), 1)

    def test_invalid_discount_cannot_post(self):
        for values in ({'discount': 946}, {'disc_acc_id': False}):
            invoice = self.invoice(**values)
            with self.assertRaises(ValidationError), self.env.cr.savepoint():
                invoice.action_post()
            invoice.invalidate_recordset()
            self.assertEqual(invoice.state, 'draft')

    def test_foreign_currency_invoice_and_credit_note_keep_both_ledgers_balanced(self):
        currency = self.env['res.currency'].search([('name', '=', 'USD')], limit=1)
        if currency == self.env.company.currency_id:
            currency = self.env['res.currency'].search([('name', '=', 'EUR')], limit=1)
        currency.active = True
        self.env['res.currency.rate'].create({'currency_id': currency.id,
            'company_id': self.env.company.id, 'name': fields.Date.today(), 'rate': 0.5})
        self.env.company.qorlia_rounding_account_id = self.adjustment
        for move_type in ('out_invoice', 'out_refund'):
            invoice = self.invoice(move_type=move_type, currency_id=currency.id, round_off_amount=-0.25)
            invoice.action_post()
            self.assert_ledger(invoice, 919.75)
            terms = invoice.line_ids.filtered(lambda line: line.display_type == 'payment_term')
            sign = 1 if move_type == 'out_invoice' else -1
            self.assertAlmostEqual(sum(terms.mapped('amount_currency')), sign * 919.75, places=2)
            self.assertAlmostEqual(sum(terms.mapped('balance')), currency._convert(
                sign * 919.75, self.env.company.currency_id, self.env.company, invoice.date), places=2)
            self.assertAlmostEqual(sum(invoice.line_ids.mapped('amount_currency')), 0, places=2)

    def test_native_reverse_post_preserves_discount_exactly_once(self):
        invoice = self.invoice()
        invoice.action_post()
        reverse = invoice._reverse_moves([{'invoice_date': fields.Date.today(), 'date': fields.Date.today()}])
        reverse._post(soft=False)
        self.assert_ledger(reverse, 920)
        self.assertEqual(reverse.move_type, 'out_refund')
        self.assertEqual(len(reverse.line_ids.filtered('qorlia_adjustment_kind')), 1)

    def test_draft_onchange_does_not_discount_adjustment_lines_again(self):
        invoice = self.invoice(discount_type='percentage', discount_percentage=10, discount=94.5)
        invoice.action_post()
        invoice.button_draft()
        invoice.onchange_invoice_lines()
        self.assertAlmostEqual(invoice.discount, 94.5, places=2)
        invoice.onchange_discount()
        self.assertAlmostEqual(invoice.discount, 94.5, places=2)
        invoice.action_post()
        self.assert_ledger(invoice, 850.5)

    def test_wrong_company_and_deprecated_accounts_cannot_post(self):
        other = self.env['res.company'].create({'name': 'QorliaQA Other adjustment company'})
        foreign = self.env['account.account'].create({'name': 'QorliaQA Foreign adjustment',
            'code': 'QORLIAQA', 'account_type': 'income_other', 'company_id': other.id})
        invoice = self.invoice(disc_acc_id=foreign.id)
        with self.assertRaisesRegex(ValidationError, 'discount account'), self.env.cr.savepoint():
            invoice.action_post()
        self.adjustment.deprecated = True
        invoice = self.invoice()
        with self.assertRaisesRegex(ValidationError, 'discount account'), self.env.cr.savepoint():
            invoice.action_post()

    def test_existing_unbalanced_ledger_is_not_silently_repaired(self):
        invoice = self.invoice()
        receivable = invoice.line_ids.filtered(lambda line: line.display_type == 'payment_term')
        self.env.flush_all()
        self.env.cr.execute('UPDATE account_move_line SET debit = debit + 1, balance = balance + 1 '
                            'WHERE id = %s', [receivable.id])
        receivable.invalidate_recordset()
        with self.assertRaisesRegex(UserError, 'already has unbalanced'), self.env.cr.savepoint():
            invoice.action_post()
        invoice.invalidate_recordset()
        self.assertEqual(invoice.state, 'draft')
        self.assertFalse(invoice.line_ids.filtered('qorlia_adjustment_kind'))
