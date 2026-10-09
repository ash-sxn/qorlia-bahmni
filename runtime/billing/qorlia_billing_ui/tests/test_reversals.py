# SPDX-License-Identifier: LGPL-3.0-or-later
from datetime import timedelta

from odoo import Command, fields
from odoo.exceptions import AccessError, UserError, ValidationError
from odoo.tests import TransactionCase, tagged


@tagged('post_install', '-at_install')
class InvoiceReversalTest(TransactionCase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.moves = cls.env['account.move']
        cls.customer = cls.env['res.partner'].create({'name': 'QorliaQA Reversal customer'})
        cls.income = cls.env['account.account'].search([
            ('company_id', '=', cls.env.company.id), ('account_type', '=', 'income')], limit=1)

    def invoice(self, posted=True, **values):
        invoice = self.moves.create({'move_type': 'out_invoice', 'partner_id': self.customer.id,
            'invoice_date': fields.Date.today(), 'invoice_line_ids': [Command.create({
                'name': 'QorliaQA Reversal service', 'account_id': self.income.id,
                'quantity': 1, 'price_unit': 500, 'tax_ids': [Command.clear()]})], **values})
        if posted:
            invoice.action_post()
        return invoice

    def review(self, invoice, **values):
        loaded = self.moves.qorlia_reversal_load(invoice.id)
        return self.moves.qorlia_reversal_preview(invoice.id, loaded['source_version'], {**loaded['values'], **values})

    def reverse(self, invoice, review):
        return self.moves.qorlia_reversal_run(invoice.id, review['version'], review['values'])

    def test_review_has_no_persistent_wizard_or_record_mutation(self):
        invoice = self.invoice()
        stamp = invoice.write_date
        count = self.env['account.move.reversal'].search_count([])
        review = self.review(invoice, reason='QorliaQA review only')
        self.assertTrue(review['can_reverse'])
        self.assertEqual(review['values']['refund_method'], 'refund')
        self.assertEqual(len(review['methods']), 3)
        self.assertEqual(invoice.write_date, stamp)
        self.assertEqual(self.env['account.move.reversal'].search_count([]), count)
        self.assertFalse(invoice.reversal_move_id)

    def test_editable_credit_is_draft_and_stale_repeat_rejected(self):
        invoice = self.invoice()
        review = self.review(invoice, reason='QorliaQA draft credit')
        result = self.reverse(invoice, review)
        credit = self.moves.browse(result['credits'][0]['id'])
        self.assertEqual(credit.state, 'draft')
        self.assertEqual(credit.reversed_entry_id, invoice)
        self.assertEqual(credit.amount_total, 500)
        self.assertIn('QorliaQA draft credit', credit.ref)
        self.assertEqual(invoice.amount_residual, 500)
        self.assertFalse(result['replacements'])
        self.assertFalse(credit._get_unbalanced_moves({'records': credit}))
        with self.assertRaises(UserError):
            self.reverse(invoice, review)
        self.assertEqual(len(invoice.reversal_move_id), 1)
        fresh = self.review(invoice)
        self.assertEqual(len(fresh['history']), 1)
        self.reverse(invoice, fresh)
        self.assertEqual(len(invoice.reversal_move_id), 2)

    def test_full_reversal_posts_and_reconciles_without_cash_payment(self):
        invoice = self.invoice()
        payment_count = self.env['account.payment'].search_count([])
        result = self.reverse(invoice, self.review(invoice, refund_method='cancel'))
        credit = self.moves.browse(result['credits'][0]['id'])
        self.assertEqual(credit.state, 'posted')
        self.assertEqual(credit.amount_residual, 0)
        self.assertEqual(invoice.amount_residual, 0)
        self.assertEqual(invoice.state, 'posted')
        self.assertEqual(self.env['account.payment'].search_count([]), payment_count)
        self.assertFalse((invoice | credit)._get_unbalanced_moves({'records': invoice | credit}))

    def test_modify_creates_posted_credit_and_editable_replacement(self):
        invoice = self.invoice()
        result = self.reverse(invoice, self.review(invoice, refund_method='modify'))
        credit = self.moves.browse(result['credits'][0]['id'])
        replacement = self.moves.browse(result['replacements'][0]['id'])
        self.assertEqual(credit.state, 'posted')
        self.assertEqual(invoice.amount_residual, 0)
        self.assertEqual(replacement.state, 'draft')
        self.assertEqual(replacement.move_type, 'out_invoice')
        self.assertEqual(replacement.partner_id, invoice.partner_id)
        self.assertEqual(replacement.amount_total, 500)
        self.assertFalse(replacement.reversed_entry_id)

    def test_future_reversal_is_scheduled_and_entry_date_uses_original(self):
        invoice = self.invoice()
        tomorrow = fields.Date.today() + timedelta(days=1)
        result = self.reverse(invoice, self.review(invoice, date=str(tomorrow), refund_method='modify'))
        credit = self.moves.browse(result['credits'][0]['id'])
        self.assertTrue(result['scheduled'])
        self.assertEqual(credit.state, 'draft')
        self.assertEqual(credit.auto_post, 'at_date')
        self.assertEqual(credit.date, tomorrow)
        self.assertEqual(invoice.amount_residual, 500)
        self.assertEqual(result['replacements'][0]['state'], 'draft')
        yesterday = fields.Date.today() - timedelta(days=1)
        invoice = self.invoice(invoice_date=yesterday, date=yesterday)
        result = self.reverse(invoice, self.review(invoice, date_mode='entry', date=str(tomorrow), refund_method='cancel'))
        self.assertFalse(result['scheduled'])
        self.assertEqual(result['effective_date'], str(yesterday))
        self.assertEqual(result['credits'][0]['state'], 'posted')

    def test_allocated_invoice_restriction_and_partial_receipt_release(self):
        invoice = self.invoice()
        journal = self.env['account.journal'].create({'name': 'QorliaQA Reversal cash', 'code': 'QREV',
            'type': 'cash', 'company_id': self.env.company.id})
        journal.inbound_payment_method_line_ids.payment_account_id = journal.default_account_id
        payment = self.env['account.payment.register'].with_context(active_model='account.move',
            active_ids=invoice.ids).create({'journal_id': journal.id, 'amount': 100})._create_payments()
        result = self.reverse(invoice, self.review(invoice, refund_method='cancel'))
        self.assertEqual(invoice.amount_residual, 0)
        self.assertEqual(result['credits'][0]['open_amount'], 0)
        self.assertEqual(payment.state, 'posted')
        self.assertFalse(payment.reconciled_invoice_ids)
        review = self.review(invoice, refund_method='modify')
        self.assertFalse(review['can_reverse'])
        self.assertEqual(len(review['methods']), 1)
        with self.assertRaises(UserError):
            self.reverse(invoice, review)
        refund = self.review(invoice)
        self.assertTrue(refund['can_reverse'])
        self.assertEqual(self.reverse(invoice, refund)['credits'][0]['state'], 'draft')

    def test_invalid_fields_journals_stale_configuration_and_invoice(self):
        invoice = self.invoice()
        for values in ({'date': '2026-2-01'}, {'date': False}, {'date_mode': 'today'},
                       {'refund_method': 'delete'}, {'journal_id': True}, {'reason': 'x' * 501},
                       {'company_id': 1}):
            with self.assertRaises(ValidationError):
                self.review(invoice, **values)
        wrong = self.env['account.journal'].search([('type', '=', 'cash')], limit=1)
        with self.assertRaises(ValidationError):
            self.review(invoice, journal_id=wrong.id)
        review = self.review(invoice)
        invoice.ref = 'QorliaQA concurrent change'
        with self.assertRaises(UserError):
            self.reverse(invoice, review)
        review = self.review(invoice)
        invoice.journal_id.restrict_mode_hash_table = not invoice.journal_id.restrict_mode_hash_table
        with self.assertRaises(UserError):
            self.reverse(invoice, review)

    def test_readonly_company_boundary_and_native_cashier(self):
        invoice = self.invoice()
        user = self.env['res.users'].with_context(no_reset_password=True).create({
            'name': 'QorliaQA Reversal readonly', 'login': 'qorliaqa-reversal-readonly',
            'groups_id': [Command.set(self.env.ref('account.group_account_readonly').ids)],
            'company_id': self.env.company.id, 'company_ids': [Command.set(self.env.company.ids)]})
        self.assertFalse(self.moves.with_user(user).qorlia_reversal_load(invoice.id)['can_reverse'])
        review = self.review(invoice)
        with self.assertRaises(AccessError):
            self.moves.with_user(user).qorlia_reversal_run(invoice.id, review['version'], review['values'])
        user.groups_id = [Command.set(self.env.ref('account.group_account_invoice').ids)]
        moves = self.moves.with_user(user)
        review = moves.qorlia_reversal_load(invoice.id)
        result = moves.qorlia_reversal_run(invoice.id, review['version'], review['values'])
        self.assertEqual(result['credits'][0]['state'], 'draft')
        other = self.env['res.company'].create({'name': 'QorliaQA Reversal other company'})
        user.write({'company_id': other.id, 'company_ids': [Command.set(other.ids)]})
        with self.assertRaises(AccessError):
            moves.qorlia_reversal_load(invoice.id)

    def test_discount_rounding_and_foreign_currency_preserve_native_ledger(self):
        adjustment = self.env['account.account'].search([
            ('company_id', '=', self.env.company.id), ('account_type', '=', 'expense')], limit=1)
        self.env.company.qorlia_rounding_account_id = adjustment
        currency = self.env.ref('base.USD')
        currency.active = True
        self.env['res.currency.rate'].create({'currency_id': currency.id,
            'company_id': self.env.company.id, 'name': fields.Date.today(), 'rate': 0.5})
        invoice = self.invoice(currency_id=currency.id, discount_type='fixed', discount=20,
            disc_acc_id=adjustment.id, round_off_amount=0.5)
        result = self.reverse(invoice, self.review(invoice, refund_method='modify'))
        credit = self.moves.browse(result['credits'][0]['id'])
        replacement = self.moves.browse(result['replacements'][0]['id'])
        replacement.action_post()
        for move in (credit, replacement):
            self.assertEqual(move.invoice_total, 480.5)
            self.assertEqual(len(move.invoice_line_ids.filtered('qorlia_adjustment_kind')), 2)
            self.assertFalse(move._get_unbalanced_moves({'records': move}))
        self.assertEqual(invoice.amount_residual, 0)

    def test_draft_credit_note_and_unbalanced_sources_cannot_reverse(self):
        for invoice in (self.invoice(posted=False), self.invoice(move_type='out_refund')):
            self.assertFalse(self.moves.qorlia_reversal_load(invoice.id)['can_reverse'])
        invoice = self.invoice()
        line = invoice.line_ids.filtered(lambda line: line.display_type == 'payment_term')
        self.env.flush_all()
        self.env.cr.execute('UPDATE account_move_line SET debit = debit + 1, balance = balance + 1 WHERE id = %s', [line.id])
        line.invalidate_recordset()
        self.assertFalse(self.moves.qorlia_reversal_load(invoice.id)['can_reverse'])
