# SPDX-License-Identifier: LGPL-3.0-or-later
# Copyright 2026 Qorlia contributors.
import json
from datetime import timedelta
from unittest.mock import patch

from odoo import fields
from odoo.exceptions import UserError, ValidationError
from odoo.tests import TransactionCase, tagged

from . import test_document_reports as report_tests


@tagged('post_install', '-at_install')
class NativeCutoffContractTest(TransactionCase):
    """Pin the installed Cut-Off behavior before exposing its financial action."""

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.customer = cls.env['res.partner'].create({'name': 'QorliaQA Native Cut-Off customer'})
        cls.journal = cls.env['account.journal'].create({'name': 'QorliaQA Cut-Off journal',
            'code': 'QCOF', 'type': 'general', 'company_id': cls.env.company.id})
        cls.accrual = cls.env['account.account'].create({'name': 'QorliaQA Cut-Off accrual',
            'code': 'QCOAC', 'account_type': 'asset_current', 'company_id': cls.env.company.id})
        cls.old_accrual = cls.env['account.account'].create({'name': 'QorliaQA Cut-Off old accrual',
            'code': 'QCOOLD', 'account_type': 'asset_current', 'company_id': cls.env.company.id})
        cls.env.company.revenue_accrual_account_id = cls.old_accrual
        cls.defaults = ('automatic_entry_default_journal_id', 'revenue_accrual_account_id',
                        'expense_accrual_account_id')

    invoice = report_tests.DocumentReportTest.invoice

    def wizard_model(self, line):
        return self.env['account.automatic.entry.wizard'].with_context(
            active_model='account.move.line', active_ids=line.ids,
            hide_automatic_options=1, default_action='change_period')

    def values(self, line, **values):
        model = self.wizard_model(line)
        return {**model.default_get(['move_line_ids', 'company_id', 'action', 'date']),
            'journal_id': self.journal.id, 'revenue_accrual_account': self.accrual.id,
            'date': fields.Date.today() - timedelta(days=1), 'percentage': 50, **values}

    def test_native_virtual_preview_is_readonly_and_keeps_currency_rounding(self):
        currency = self.env['res.currency'].create({'name': 'QCO', 'symbol': 'QCO',
            'rounding': 0.01, 'active': True})
        self.env['res.currency.rate'].create({'currency_id': currency.id,
            'company_id': self.env.company.id, 'name': fields.Date.today(), 'rate': 2})
        invoice = self.invoice(333.33, currency_id=currency.id)
        line = invoice.invoice_line_ids[0]
        before = invoice.read(['write_date', 'state', 'amount_total', 'amount_residual'])
        defaults = self.env.company.read(list(self.defaults))
        counts = {model: self.env[model].search_count([]) for model in
            ('account.move', 'account.move.line', 'account.automatic.entry.wizard', 'mail.message')}
        wizard = self.wizard_model(line).new(self.values(line, percentage=37.5))
        wizard._constraint_percentage()
        wizard._check_date()
        moves = json.loads(wizard.move_data)
        self.assertEqual(len(moves), 2)
        self.assertEqual(wizard.account_type, 'income')
        self.assertEqual(wizard.total_amount, invoice.company_currency_id.round(line.balance * 0.375))
        for move in moves:
            self.assertEqual(move['journal_id'], self.journal.id)
            self.assertEqual(len(move['line_ids']), 2)
            entries = [command[2] for command in move['line_ids']]
            self.assertEqual(sum(entry['debit'] for entry in entries), sum(entry['credit'] for entry in entries))
            self.assertEqual({entry['currency_id'] for entry in entries}, {currency.id})
            self.assertEqual(sum(entry['amount_currency'] for entry in entries), 0)
            self.assertEqual(abs(entries[0]['amount_currency']), currency.round(abs(line.amount_currency) * 0.375))
            self.assertEqual({entry['account_id'] for entry in entries}, {line.account_id.id, self.accrual.id})
        self.assertEqual(invoice.read(['write_date', 'state', 'amount_total', 'amount_residual']), before)
        self.assertEqual(self.env.company.read(list(self.defaults)), defaults)
        self.assertEqual({model: self.env[model].search_count([]) for model in counts}, counts)

    def test_native_creation_posts_two_entries_and_changes_company_defaults(self):
        invoice = self.invoice()
        line = invoice.invoice_line_ids[0]
        before = invoice.read(['state', 'amount_total', 'amount_tax', 'amount_residual', 'payment_state'])
        ledger = invoice.line_ids.read(['id', 'account_id', 'debit', 'credit', 'amount_currency',
            'amount_residual', 'amount_residual_currency', 'matched_debit_ids', 'matched_credit_ids'])
        model = self.wizard_model(line)
        values = self.values(line)
        native_preview = json.loads(model.new(values).move_data)
        wizard = model.create(values)
        self.assertEqual(self.env.company.automatic_entry_default_journal_id, self.journal)
        self.assertEqual(self.env.company.revenue_accrual_account_id, self.accrual)
        action = wizard.do_action()
        generated = self.env['account.move'].search(action['domain'])
        self.assertEqual(len(generated), 2)
        self.assertEqual(set(generated.mapped('state')), {'posted'})
        self.assertEqual(set(generated.mapped('date')), {invoice.date, values['date']})
        self.assertEqual(set(generated.mapped('journal_id').ids), {self.journal.id})
        for move in generated:
            self.assertFalse(move._get_unbalanced_moves({'records': move}))
            expected = next(item for item in native_preview if item['date'] == str(move.date))
            self.assertEqual(sum(move.line_ids.mapped('debit')), sum(item[2]['debit'] for item in expected['line_ids']))
            self.assertEqual(sum(move.line_ids.mapped('credit')), sum(item[2]['credit'] for item in expected['line_ids']))
        self.assertEqual(invoice.read(['state', 'amount_total', 'amount_tax', 'amount_residual', 'payment_state']), before)
        self.assertEqual(invoice.line_ids.read(['id', 'account_id', 'debit', 'credit', 'amount_currency',
            'amount_residual', 'amount_residual_currency', 'matched_debit_ids', 'matched_credit_ids']), ledger)

    def test_future_recognition_is_scheduled_and_native_action_is_not_idempotent(self):
        invoice = self.invoice()
        line = invoice.invoice_line_ids[0]
        future_date = fields.Date.today() + timedelta(days=30)
        wizard = self.wizard_model(line).create(self.values(line, date=future_date))
        first = self.env['account.move'].search(wizard.do_action()['domain'])
        future = first.filtered(lambda move: move.date == future_date)
        current = first - future
        self.assertEqual(len(future), 1)
        self.assertEqual(future.state, 'draft')
        self.assertEqual(future.auto_post, 'at_date')
        self.assertEqual(len(current), 1)
        self.assertEqual(current.state, 'posted')
        second = self.env['account.move'].search(wizard.do_action()['domain'])
        self.assertEqual(len(second), 2)
        self.assertFalse(first & second)
        self.assertEqual(invoice.state, 'posted')
        self.assertEqual(invoice.amount_total, 500)
        self.assertEqual(invoice.amount_residual, 500)

    def test_native_amount_onchange_and_constraints_need_explicit_preview_checks(self):
        invoice = self.invoice()
        line = invoice.invoice_line_ids[0]
        model = self.wizard_model(line)
        values = self.values(line)
        spec = {name: '1' for name in ('move_line_ids', 'company_id', 'action', 'date', 'percentage',
            'total_amount', 'journal_id', 'revenue_accrual_account', 'expense_accrual_account', 'account_type')}
        amount_values = {**values, 'date': str(values['date']), 'total_amount': -125}
        changed = model.onchange(amount_values, ['total_amount'], spec)['value']
        self.assertEqual(changed['percentage'], 25)
        for percentage in (0, -1, 100.01):
            with self.assertRaises(UserError):
                model.new({**values, 'percentage': percentage})._constraint_percentage()
        # Only fixture creation bypasses the company setter's unrelated draft check.
        with patch.object(type(self.env.company), '_validate_fiscalyear_lock', return_value=None):
            self.env.company.fiscalyear_lock_date = fields.Date.today()
        with self.assertRaises(ValidationError):
            model.new(values)._check_date()

    def test_native_source_selection_rejects_draft_and_reconciled_items(self):
        invoice = self.invoice()
        invoice.button_draft()
        with self.assertRaisesRegex(UserError, 'posted'):
            self.values(invoice.invoice_line_ids[0])
        invoice.action_post()
        credit = invoice.copy({'move_type': 'out_refund'})
        credit.action_post()
        terms = (invoice | credit).line_ids.filtered(lambda line: line.account_type == 'asset_receivable')
        terms.reconcile()
        with self.assertRaisesRegex(UserError, 'reconciled'):
            self.values(terms[0])
