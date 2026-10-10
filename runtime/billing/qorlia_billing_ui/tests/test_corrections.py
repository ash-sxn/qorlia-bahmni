# SPDX-License-Identifier: LGPL-3.0-or-later
from odoo import Command, fields
from datetime import timedelta
from unittest.mock import patch
from odoo.exceptions import AccessError, UserError, ValidationError
from odoo.tests import TransactionCase, tagged


@tagged('post_install', '-at_install')
class InvoiceCorrectionTest(TransactionCase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.moves = cls.env['account.move']
        cls.customer = cls.env['res.partner'].create({'name': 'QorliaQA Correction customer'})
        cls.income = cls.env['account.account'].search([
            ('company_id', '=', cls.env.company.id), ('account_type', '=', 'income')], limit=1)

    def invoice(self, posted=True, **values):
        invoice = self.moves.create({'move_type': 'out_invoice', 'partner_id': self.customer.id,
            'invoice_date': fields.Date.today(), 'invoice_line_ids': [Command.create({
                'name': 'QorliaQA Correction service', 'account_id': self.income.id,
                'quantity': 1, 'price_unit': 500, 'tax_ids': [Command.clear()]})], **values})
        if posted:
            invoice.action_post()
        return invoice

    def correct(self, invoice, action, review=None):
        review = review or self.moves.qorlia_correction_load(invoice.id)
        return self.moves.qorlia_correction_run(invoice.id, review['version'], action)

    def test_reset_cancel_restore_and_repost_preserve_invoice_and_balance(self):
        invoice = self.invoice()
        review = self.moves.qorlia_correction_load(invoice.id)
        self.assertTrue(review['can_reset'])
        self.assertFalse(review['can_cancel'])
        self.assertTrue(review['posted_before'])
        original_name = invoice.name
        draft = self.correct(invoice, 'reset', review)
        self.assertEqual(draft['state'], 'draft')
        self.assertEqual(draft['name'], original_name)
        self.assertEqual(self.correct(invoice, 'cancel')['state'], 'cancel')
        self.assertEqual(self.correct(invoice, 'reset')['state'], 'draft')
        invoice.action_post()
        self.assertEqual(invoice.amount_residual, 500)
        self.assertFalse(invoice._get_unbalanced_moves({'records': invoice}))

    def test_cancel_only_draft_and_disable_scheduled_posting(self):
        invoice = self.invoice(posted=False, auto_post='at_date')
        result = self.correct(invoice, 'cancel')
        self.assertEqual(result['state'], 'cancel')
        self.assertEqual(invoice.auto_post, 'no')
        review = self.moves.qorlia_correction_load(invoice.id)
        self.assertFalse(review['can_cancel'])
        with self.assertRaises(UserError):
            self.correct(invoice, 'cancel', review)
        posted = self.invoice()
        with self.assertRaises(UserError):
            self.correct(posted, 'cancel')

    def test_reset_releases_receipt_without_deleting_or_refunding_payment(self):
        invoice = self.invoice()
        journal = self.env['account.journal'].create({'name': 'QorliaQA Correction cash', 'code': 'QCOR',
            'type': 'cash', 'company_id': self.env.company.id})
        journal.inbound_payment_method_line_ids.payment_account_id = journal.default_account_id
        payment = self.env['account.payment.register'].with_context(active_model='account.move',
            active_ids=invoice.ids).create({'journal_id': journal.id, 'amount': 100})._create_payments()
        review = self.moves.qorlia_correction_load(invoice.id)
        self.assertEqual(len(review['allocations']), 1)
        self.assertEqual(review['allocations'][0]['amount'], 100)
        self.assertEqual(review['invoice']['open_amount'], 400)
        count = self.env['account.payment'].search_count([])
        result = self.correct(invoice, 'reset', review)
        self.assertEqual(result['state'], 'draft')
        self.assertEqual(payment.state, 'posted')
        self.assertFalse(payment.reconciled_invoice_ids)
        self.assertEqual(self.env['account.payment'].search_count([]), count)
        invoice.action_post()
        self.assertEqual(invoice.amount_residual, 500)
        self.assertTrue(self.moves.qorlia_credit_load(invoice.id)['credits'])

    def test_stale_source_config_and_repeat_are_rejected(self):
        invoice = self.invoice()
        credit = self.invoice(move_type='out_refund')
        credits = self.moves.qorlia_credit_load(invoice.id)
        self.moves.qorlia_credit_apply(invoice.id, credits['credits'][0]['id'], credits['version'])
        review = self.moves.qorlia_correction_load(invoice.id)
        credit.ref = 'QorliaQA Correction concurrent source'
        with self.assertRaises(UserError):
            self.correct(invoice, 'reset', review)
        review = self.moves.qorlia_correction_load(invoice.id)
        invoice.journal_id.restrict_mode_hash_table = True
        with self.assertRaises(UserError):
            self.correct(invoice, 'reset', review)
        invoice.journal_id.restrict_mode_hash_table = False
        review = self.moves.qorlia_correction_load(invoice.id)
        self.correct(invoice, 'reset', review)
        with self.assertRaises(UserError):
            self.correct(invoice, 'reset', review)

    def test_strict_journal_and_locked_period_do_not_allow_reset(self):
        journal = self.env['account.journal'].create({'name': 'QorliaQA Secure corrections', 'code': 'QSEC',
            'type': 'sale', 'company_id': self.env.company.id, 'restrict_mode_hash_table': True})
        invoice = self.invoice(journal_id=journal.id)
        self.assertFalse(self.moves.qorlia_correction_load(invoice.id)['can_reset'])
        with self.assertRaises(UserError):
            self.correct(invoice, 'reset')
        invoice = self.invoice()
        self.moves.search([('company_id', '=', self.env.company.id), ('state', '=', 'draft'),
                           ('date', '<=', invoice.date)]).button_cancel()
        # Arrange the invoice lock without resolving unrelated staged bank transactions.
        with patch.object(type(self.env.company), '_validate_fiscalyear_lock', return_value=None):
            self.env.company.fiscalyear_lock_date = invoice.date
        with self.assertRaises(UserError), self.env.cr.savepoint():
            self.correct(invoice, 'reset')
        invoice.invalidate_recordset()
        self.assertEqual(invoice.state, 'posted')

    def test_native_cashier_permissions_and_invalid_requests(self):
        invoice = self.invoice(move_type='out_refund')
        cashier = self.env['res.users'].with_context(no_reset_password=True).create({
            'name': 'QorliaQA Correction cashier', 'login': 'qorliaqa-correction-cashier',
            'groups_id': [Command.set(self.env.ref('account.group_account_invoice').ids)],
            'company_id': self.env.company.id, 'company_ids': [Command.set(self.env.company.ids)]})
        moves = self.moves.with_user(cashier)
        review = moves.qorlia_correction_load(invoice.id)
        self.assertTrue(review['can_reset'])
        self.assertEqual(moves.qorlia_correction_run(invoice.id, review['version'], 'reset')['state'], 'draft')
        for action in ('delete', 'post', True):
            with self.assertRaises(ValidationError):
                self.moves.qorlia_correction_run(invoice.id, review['version'], action)
        for invalid in (True, -1, '1'):
            with self.assertRaises(ValidationError):
                self.moves.qorlia_correction_load(invalid)
        user = self.env['res.users'].with_context(no_reset_password=True).create({
            'name': 'QorliaQA No correction rights', 'login': 'qorliaqa-no-correction-rights',
            'groups_id': [Command.set(self.env.ref('base.group_user').ids)]})
        with self.assertRaises(AccessError):
            self.moves.with_user(user).qorlia_correction_run(invoice.id, review['version'], 'cancel')

    def test_readonly_and_other_company_rules_are_not_bypassed(self):
        invoice = self.invoice()
        user = self.env['res.users'].with_context(no_reset_password=True).create({
            'name': 'QorliaQA Correction readonly', 'login': 'qorliaqa-correction-readonly',
            'groups_id': [Command.set(self.env.ref('account.group_account_readonly').ids)],
            'company_id': self.env.company.id, 'company_ids': [Command.set(self.env.company.ids)]})
        review = self.moves.with_user(user).qorlia_correction_load(invoice.id)
        self.assertFalse(review['can_reset'])
        with self.assertRaises(AccessError):
            self.moves.with_user(user).qorlia_correction_run(invoice.id, review['version'], 'reset')
        other = self.env['res.company'].create({'name': 'QorliaQA Correction other company'})
        user.write({'groups_id': [Command.set(self.env.ref('account.group_account_invoice').ids)],
            'company_id': other.id, 'company_ids': [Command.set(other.ids)]})
        with self.assertRaises(AccessError):
            self.moves.with_user(user).qorlia_correction_load(invoice.id)

    def test_reset_full_foreign_reconciliation_reverses_exchange_without_changing_credit(self):
        currency = self.env.ref('base.USD')
        currency.active = True
        yesterday = fields.Date.today() - timedelta(days=1)
        self.env['res.currency.rate'].create([
            {'currency_id': currency.id, 'company_id': self.env.company.id, 'name': yesterday, 'rate': 0.5},
            {'currency_id': currency.id, 'company_id': self.env.company.id, 'name': fields.Date.today(), 'rate': 1}])
        invoice = self.invoice(currency_id=currency.id, invoice_date=yesterday, date=yesterday)
        credit = self.invoice(move_type='out_refund', currency_id=currency.id)
        review = self.moves.qorlia_credit_load(invoice.id)
        self.moves.qorlia_credit_apply(invoice.id, review['credits'][0]['id'], review['version'])
        partials = invoice.line_ids.matched_debit_ids | invoice.line_ids.matched_credit_ids
        exchange = partials.exchange_move_id | invoice.line_ids.full_reconcile_id.exchange_move_id
        self.assertTrue(exchange)
        self.correct(invoice, 'reset')
        self.assertEqual(credit.state, 'posted')
        self.assertEqual(credit.amount_residual, 500)
        reversal = self.moves.search([('reversed_entry_id', 'in', exchange.ids)])
        self.assertTrue(reversal)
        self.assertFalse((exchange | reversal | credit | invoice)._get_unbalanced_moves(
            {'records': exchange | reversal | credit | invoice}))

    def test_reset_keeps_other_receipt_allocations_and_cancel_never_repairs_unbalanced_ledger(self):
        invoice, other = self.invoice(), self.invoice()
        journal = self.env['account.journal'].create({'name': 'QorliaQA Shared correction cash', 'code': 'QSCC',
            'type': 'cash', 'company_id': self.env.company.id})
        journal.inbound_payment_method_line_ids.payment_account_id = journal.default_account_id
        payment = self.env['account.payment.register'].with_context(active_model='account.move',
            active_ids=invoice.ids).create({'journal_id': journal.id, 'amount': 600})._create_payments()
        credits = self.moves.qorlia_credit_load(other.id)
        self.moves.qorlia_credit_apply(other.id, credits['credits'][0]['id'], credits['version'])
        self.correct(invoice, 'reset')
        self.assertEqual(other.amount_residual, 400)
        self.assertEqual(payment.reconciled_invoice_ids, other)
        self.assertEqual(payment.state, 'posted')
        draft = self.invoice(posted=False)
        receivable = draft.line_ids.filtered(lambda line: line.display_type == 'payment_term')
        self.env.flush_all()
        self.env.cr.execute('UPDATE account_move_line SET debit = debit + 1, balance = balance + 1 WHERE id = %s',
                            [receivable.id])
        receivable.invalidate_recordset()
        self.assertFalse(self.moves.qorlia_correction_load(draft.id)['can_cancel'])
        with self.assertRaises(UserError):
            self.correct(draft, 'cancel')
        self.assertEqual(draft.state, 'draft')
