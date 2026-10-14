# SPDX-License-Identifier: LGPL-3.0-or-later
# Copyright 2026 Qorlia contributors.
from unittest.mock import patch

from odoo import Command, fields
from odoo.exceptions import AccessError, UserError, ValidationError
from odoo.tests import TransactionCase, tagged

from . import test_document_reports as report_tests


@tagged('post_install', '-at_install')
class InvoiceJournalMoneyTest(TransactionCase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.customer = cls.env['res.partner'].create({'name': 'QorliaQA Journal simulation customer'})
        cls.currency = cls.env['res.currency'].create({'name': 'QJMS', 'symbol': 'QJMS',
            'rounding': 0.01, 'active': True})
        cls.env['res.currency.rate'].create({'currency_id': cls.currency.id,
            'company_id': cls.env.company.id, 'name': fields.Date.today(), 'rate': 2})

    invoice = report_tests.DocumentReportTest.invoice
    reader = report_tests.DocumentReportTest.reader

    def unchanged(self, invoice):
        self.env.cr.flush()
        return {'document': invoice.read(['write_date', 'state', 'payment_state', 'amount_total',
                    'invoice_total', 'amount_residual']),
            'rows': invoice.line_ids.read(['write_date', 'name', 'account_id', 'debit', 'credit',
                'amount_currency', 'price_unit', 'tax_ids', 'matched_debit_ids', 'matched_credit_ids']),
            'counts': {model: self.env[model].search_count([]) for model in
                ('account.move', 'account.move.line', 'account.payment', 'account.partial.reconcile',
                 'account.full.reconcile', 'account.analytic.line', 'stock.picking', 'mail.message',
                 'mail.mail', 'mail.notification', 'mail.followers')}}

    def prove(self, invoice, commands):
        before = self.unchanged(invoice)
        source_ids = set(invoice.line_ids.ids)
        preview = invoice._qorlia_journal_money_simulate(commands)
        self.assertEqual(self.unchanged(invoice), before)
        invoice.write({'line_ids': commands})
        self.env.flush_all()
        self.assertEqual(invoice._qorlia_journal_money_snapshot(source_ids), preview)
        self.assertFalse(invoice._get_unbalanced_moves({'records': invoice}))
        return preview

    def test_company_money_preview_matches_write_not_misleading_onchange(self):
        for move_type in ('out_invoice', 'out_refund'):
            for posted in (False, True):
                invoice = self.invoice(move_type=move_type)
                if not posted:
                    invoice.button_draft()
                sign = -1 if move_type == 'out_invoice' else 1
                preview = self.prove(invoice, [Command.update(invoice.invoice_line_ids.id,
                    {'amount_currency': sign * 600})])
                self.assertEqual(preview['totals']['amount_total'], 500)
                invoice = self.invoice(move_type=move_type)
                if not posted:
                    invoice.button_draft()
                preview = self.prove(invoice, [Command.update(invoice.invoice_line_ids.id,
                    {'debit': 0 if sign == -1 else 600, 'credit': 600 if sign == -1 else 0})])
                self.assertEqual(preview['totals']['amount_total'], 600)

    def test_foreign_money_preview_matches_write_for_invoices_and_credits(self):
        for move_type in ('out_invoice', 'out_refund'):
            for posted in (False, True):
                invoice = self.invoice(move_type=move_type, currency_id=self.currency.id)
                if not posted:
                    invoice.button_draft()
                sign = -1 if move_type == 'out_invoice' else 1
                preview = self.prove(invoice, [Command.update(invoice.invoice_line_ids.id,
                    {'amount_currency': sign * 600})])
                self.assertEqual(preview['totals']['amount_total'], 600)
                invoice = self.invoice(move_type=move_type, currency_id=self.currency.id)
                if not posted:
                    invoice.button_draft()
                preview = self.prove(invoice, [Command.update(invoice.invoice_line_ids.id,
                    {'debit': 0 if sign == -1 else 600, 'credit': 600 if sign == -1 else 0})])
                self.assertEqual(preview['totals']['amount_total'], 500)

    def test_tax_and_new_rows_preview_roll_back_and_match_native_saved_rows(self):
        invoice = self.invoice()
        invoice.button_draft()
        tax = self.env['account.tax'].create({'name': 'QorliaQA Journal simulation tax',
            'amount': 5, 'type_tax_use': 'sale', 'company_id': self.env.company.id})
        account = invoice.invoice_line_ids.account_id
        preview = self.prove(invoice, [Command.update(invoice.invoice_line_ids.id,
            {'tax_ids': [Command.set(tax.ids)]}), Command.create({'name': 'QorliaQA Added journal service',
                'account_id': account.id, 'quantity': 1, 'price_unit': 100, 'tax_ids': [Command.set(tax.ids)]})])
        self.assertEqual(preview['totals']['amount_total'], 630)
        self.assertTrue(any(row['id'] is False for row in preview['rows']))
        self.assertTrue(any(row['values']['display_type'] == 'tax' for row in preview['rows']))

    def test_deleted_product_preview_rolls_back_then_matches_native_term_recalculation(self):
        invoice = self.invoice()
        invoice.button_draft()
        preview = self.prove(invoice, [Command.delete(invoice.invoice_line_ids.id)])
        self.assertEqual(preview['totals']['amount_total'], 0)
        self.assertFalse(any(row['values']['display_type'] == 'product' for row in preview['rows']))

    def test_installment_recalculation_preview_matches_native_write(self):
        term = self.env['account.payment.term'].create({'name': 'QorliaQA Journal simulation installments',
            'line_ids': [Command.create({'value': 'percent', 'value_amount': 50, 'days': 0}),
                         Command.create({'value': 'balance', 'days': 30})]})
        invoice = self.invoice(currency_id=self.currency.id, invoice_payment_term_id=term.id)
        preview = self.prove(invoice, [Command.update(invoice.invoice_line_ids.id, {'amount_currency': -600})])
        terms = [row for row in preview['rows'] if row['values']['display_type'] == 'payment_term']
        self.assertEqual(len(terms), 2)
        self.assertEqual([row['values']['amount_currency'] for row in terms], [300, 300])

    def test_failed_simulation_restores_records_and_preserves_earlier_transaction_writes(self):
        invoice = self.invoice()
        invoice.ref = 'QorliaQA Earlier request work'
        before = self.unchanged(invoice)
        term = invoice.line_ids.filtered(lambda line: line.display_type == 'payment_term')
        with self.assertRaises(UserError):
            invoice._qorlia_journal_money_simulate([Command.update(term.id, {'debit': 600, 'credit': 0})])
        self.assertEqual(self.unchanged(invoice), before)
        self.assertEqual(invoice.ref, 'QorliaQA Earlier request work')
        with self.assertRaises(ValidationError):
            invoice._qorlia_journal_money_simulate([Command.delete(term.id)])
        self.assertEqual(self.unchanged(invoice), before)

    def test_simulation_drops_its_commit_callbacks_and_preserves_original_hooks(self):
        invoice = self.invoice()
        self.env.cr.flush()
        callbacks = {name: getattr(self.env.cr, name) for name in ('postcommit', 'prerollback', 'postrollback')}
        pending = {name: list(queue._funcs) for name, queue in callbacks.items()}
        original = type(invoice).write
        seen = []
        added = []

        def write(document, values):
            if document.env.context.get('tracking_disable'):
                for name in callbacks:
                    callback = lambda: seen.append('simulation escaped')
                    added.append(callback)
                    getattr(document.env.cr, name).add(callback)
            return original(document, values)

        with patch.object(type(invoice), 'write', write):
            invoice._qorlia_journal_money_simulate([Command.update(invoice.invoice_line_ids.id, {'credit': 600})])
            term = invoice.line_ids.filtered(lambda line: line.display_type == 'payment_term')
            with self.assertRaises(UserError):
                invoice._qorlia_journal_money_simulate([Command.update(term.id, {'debit': 600})])
        self.assertFalse(seen)
        self.assertGreaterEqual(len(added), 6)
        self.assertEqual(len(added) % len(callbacks), 0)
        for name, queue in callbacks.items():
            self.assertIs(getattr(self.env.cr, name), queue)
            self.assertEqual(list(queue._funcs), pending[name])
            self.assertFalse(any(callback in queue._funcs for callback in added))

    def test_native_hash_and_fiscal_guards_reject_simulation_without_bypass(self):
        journal = self.env['account.journal'].create({'name': 'QorliaQA Hashed simulation',
            'code': 'QJSH', 'type': 'sale', 'company_id': self.env.company.id,
            'restrict_mode_hash_table': True})
        invoice = self.invoice(journal_id=journal.id)
        before = self.unchanged(invoice)
        with self.assertRaisesRegex(UserError, 'hashed'):
            invoice._qorlia_journal_money_simulate([Command.update(invoice.invoice_line_ids.id, {'credit': 600})])
        self.assertEqual(self.unchanged(invoice), before)
        invoice = self.invoice(currency_id=self.currency.id)
        with patch.object(type(self.env.company), '_validate_fiscalyear_lock', return_value=None):
            self.env.company.fiscalyear_lock_date = fields.Date.today()
        before = self.unchanged(invoice)
        with self.assertRaises(UserError):
            invoice._qorlia_journal_money_simulate([Command.update(invoice.invoice_line_ids.id, {'amount_currency': -600})])
        self.assertEqual(self.unchanged(invoice), before)

    def test_native_permissions_apply_to_private_simulation(self):
        invoice = self.invoice()
        before = self.unchanged(invoice)
        with self.assertRaises(AccessError):
            invoice.with_user(self.reader())._qorlia_journal_money_simulate([
                Command.update(invoice.invoice_line_ids.id, {'credit': 600})])
        self.assertEqual(self.unchanged(invoice), before)
