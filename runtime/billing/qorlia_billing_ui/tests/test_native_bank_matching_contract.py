# SPDX-License-Identifier: LGPL-3.0-or-later
# Copyright 2026 Qorlia contributors.
import uuid
from unittest.mock import patch

from odoo import Command, fields
from odoo.exceptions import UserError
from odoo.tests import TransactionCase, tagged


@tagged('post_install', '-at_install')
class NativeBankMatchingContractTest(TransactionCase):
    """Pin native reconciliation, currencies and undo before exposing reviewed bank saves."""

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.prefix = 'QorliaQA Bank match ' + uuid.uuid4().hex[:8]
        cls.partner = cls.env['res.partner'].create({'name': cls.prefix})

        def account(kind, reconcile=False):
            return cls.env['account.account'].create({'name': cls.prefix + ' ' + kind,
                'code': 'QM' + uuid.uuid4().hex[:8], 'account_type': kind, 'reconcile': reconcile})

        cls.bank = account('asset_cash')
        cls.suspense = account('asset_current', True)
        cls.receivable = account('asset_receivable', True)
        cls.payable = account('liability_payable', True)
        cls.income = account('income')
        cls.expense = account('expense')
        cls.journal = cls.env['account.journal'].create({'name': cls.prefix,
            'code': uuid.uuid4().hex[:5], 'type': 'bank',
            'default_account_id': cls.bank.id, 'suspense_account_id': cls.suspense.id})
        cls.exchange = cls.env['account.journal'].create({'name': cls.prefix + ' FX',
            'code': uuid.uuid4().hex[:5], 'type': 'general'})
        cls.env.company.write({'currency_exchange_journal_id': cls.exchange.id,
            'income_currency_exchange_account_id': cls.income.id,
            'expense_currency_exchange_account_id': cls.expense.id})
        cls.foreign = cls.env['res.currency'].create({'name': 'QBC', 'symbol': 'QBC',
            'rounding': 0.01, 'active': True})
        cls.third = cls.env['res.currency'].create({'name': 'QBT', 'symbol': 'QBT',
            'rounding': 0.01, 'active': True})
        for currency, rate in ((cls.foreign, 2), (cls.third, 4)):
            cls.env['res.currency.rate'].create({'currency_id': currency.id,
                'company_id': cls.env.company.id, 'name': fields.Date.today(), 'rate': rate})

    def entry(self, amount=100, **values):
        return self.env['account.bank.statement.line'].create({'journal_id': self.journal.id,
            'date': fields.Date.today(), 'payment_ref': self.prefix, 'amount': amount,
            'partner_id': self.partner.id, **values})

    def candidate(self, amount=100, currency=False, balance=None, outgoing=False, account=False):
        currency = currency or self.env.company.currency_id
        balance = balance if balance is not None else currency._convert(amount,
            self.env.company.currency_id, self.env.company, fields.Date.today())
        sign = -1 if outgoing else 1
        account = account or (self.payable if outgoing else self.receivable)
        move = self.env['account.move'].create({'move_type': 'entry', 'ref': self.prefix,
            'line_ids': [Command.create({'name': self.prefix, 'account_id': account.id,
                'partner_id': self.partner.id, 'currency_id': currency.id,
                'amount_currency': amount * sign, 'balance': balance * sign}),
                Command.create({'name': self.prefix, 'account_id': self.income.id,
                    'currency_id': currency.id, 'amount_currency': -amount * sign,
                    'balance': -balance * sign})]})
        move.action_post()
        return move.line_ids.filtered(lambda line: line.account_id == account)

    def apply(self, entry, allocations, fee_model=False, preserve=True):
        """Exercise native primitives only; this is not a public save endpoint."""
        liquidity, suspense, other = entry._seek_for_lines()
        self.assertEqual(len(liquidity), 1)
        self.assertEqual(len(suspense), 1)
        original = entry.read(['amount', 'amount_currency', 'foreign_currency_id'])[0]
        original_liquidity = liquidity.read(['balance', 'amount_currency', 'currency_id'])[0]
        transaction_currency = entry._get_accounting_amounts_and_currencies()[1]
        values = []
        for source, amount in allocations:
            sign = -1 if source.amount_residual_currency > 0 else 1
            company_amount = source.amount_residual * amount / abs(source.amount_residual_currency)
            amounts = entry._prepare_counterpart_amounts_using_st_line_rate(
                source.currency_id, -company_amount, amount * sign)
            values.append({'name': self.prefix + ' match ' + str(source.id),
                'account_id': source.account_id.id, 'partner_id': source.partner_id.id,
                'currency_id': transaction_currency.id, **amounts})
        remaining_balance = suspense.balance - sum(row['balance'] for row in values)
        remaining_amount = suspense.amount_currency - sum(row['amount_currency'] for row in values)
        if fee_model:
            fee_values = fee_model._apply_lines_for_bank_widget(remaining_amount, entry.partner_id, entry)
            for row in fee_values:
                row.pop('journal_id', None)
                currency = self.env['res.currency'].browse(row['currency_id'])
                amounts = entry._prepare_counterpart_amounts_using_st_line_rate(currency,
                    currency._convert(row['amount_currency'], entry.company_currency_id,
                        entry.company_id, entry.date), row['amount_currency'])
                row = {**row, **amounts, 'currency_id': transaction_currency.id}
                taxes = self.env['account.tax'].browse(row['tax_ids'][0][2])
                if taxes:
                    # Pin the native company-currency tax helper before adapting foreign tax bases.
                    self.assertEqual(transaction_currency, entry.company_currency_id)
                    tax_rows = fee_model._get_taxes_move_lines_dict(taxes, row)
                    row['amount_currency'] = row['balance']
                    for tax_row in tax_rows:
                        tax_row.pop('journal_id', None)
                        tax_row.update({'currency_id': transaction_currency.id,
                            'amount_currency': tax_row['balance']})
                    values.extend(tax_rows)
                values.append(row)
            remaining_balance = suspense.balance - sum(row['balance'] for row in values)
            remaining_amount = suspense.amount_currency - sum(row['amount_currency'] for row in values)
        commands = [Command.create(row) for row in values]
        if entry.company_currency_id.is_zero(remaining_balance) and transaction_currency.is_zero(remaining_amount):
            commands.append(Command.delete(suspense.id))
        else:
            commands.append(Command.update(suspense.id,
                {'balance': remaining_balance, 'amount_currency': remaining_amount}))
        before_ids = set(entry.move_id.line_ids.ids)
        # Native bank undo uses force_delete for suspense replacement; balance, tax and lock checks stay enabled.
        move = entry.move_id.with_context(skip_account_move_synchronization=preserve, force_delete=True)
        move.write({'line_ids': commands})
        created = move.line_ids.filtered(lambda line: line.id not in before_ids).sorted('id')
        for source, _amount in allocations:
            counterpart = created.filtered(lambda line: line.name == self.prefix + ' match ' + str(source.id))
            self.assertEqual(len(counterpart), 1)
            (source | counterpart).reconcile()
        self.env.flush_all()
        self.assertFalse(move._get_unbalanced_moves({'records': move}))
        if preserve:
            self.assertEqual(entry.read(['amount', 'amount_currency', 'foreign_currency_id'])[0], original)
            self.assertEqual(liquidity.read(['balance', 'amount_currency', 'currency_id'])[0], original_liquidity)
        return created

    def fee_model(self, amount='2', amount_type='fixed'):
        return self.env['account.reconcile.model'].create({'name': self.prefix + uuid.uuid4().hex[:5],
            'rule_type': 'writeoff_button', 'line_ids': [Command.create({
                'label': self.prefix + ' fee', 'account_id': self.expense.id,
                'amount_type': amount_type, 'amount_string': amount})]})

    def test_full_inbound_matches_native_receivable(self):
        entry, source = self.entry(), self.candidate()
        self.apply(entry, [(source, 100)])
        self.assertTrue(entry.is_reconciled)
        self.assertTrue(source.reconciled)
        self.assertEqual(entry.amount_residual, 0)
        self.assertEqual(len(entry._seek_for_lines()[1]), 0)

    def test_full_outbound_matches_native_payable(self):
        entry, source = self.entry(-100), self.candidate(outgoing=True)
        self.apply(entry, [(source, 100)])
        self.assertTrue(entry.is_reconciled)
        self.assertTrue(source.reconciled)
        self.assertEqual(entry.amount, -100)

    def test_partial_invoice_keeps_real_source_residual(self):
        entry, source = self.entry(40), self.candidate()
        self.apply(entry, [(source, 40)])
        self.assertTrue(entry.is_reconciled)
        self.assertFalse(source.reconciled)
        self.assertEqual(source.amount_residual, 60)
        self.assertEqual(source.amount_residual_currency, 60)

    def test_partial_bank_keeps_suspense_then_finishes_in_second_step(self):
        entry, first, second = self.entry(), self.candidate(40), self.candidate(60)
        self.apply(entry, [(first, 40)])
        self.assertFalse(entry.is_reconciled)
        self.assertEqual(entry.amount_residual, -60)
        self.assertTrue(first.reconciled)
        self.assertFalse(second.reconciled)
        self.apply(entry, [(second, 60)])
        self.assertTrue(entry.is_reconciled)
        self.assertTrue(second.reconciled)
        self.assertEqual(entry.amount, 100)

    def test_multiple_sources_receive_requested_partial_allocations(self):
        entry, first, second = self.entry(), self.candidate(), self.candidate()
        self.apply(entry, [(first, 30), (second, 70)])
        self.assertTrue(entry.is_reconciled)
        self.assertEqual(first.amount_residual, 70)
        self.assertEqual(second.amount_residual, 30)
        self.assertEqual(len(first.matched_credit_ids), 1)
        self.assertEqual(len(second.matched_credit_ids), 1)

    def test_net_invoice_and_refund_match_preserves_both_native_allocations(self):
        entry = self.entry(80)
        invoice = self.candidate()
        refund = self.candidate(20, outgoing=True, account=self.receivable)
        self.apply(entry, [(invoice, 100), (refund, 20)])
        self.assertTrue(invoice.reconciled and refund.reconciled)
        self.assertTrue(entry.is_reconciled)
        self.assertEqual(entry.amount, 80)
        self.assertEqual(len(invoice.matched_credit_ids), 1)
        self.assertEqual(len(refund.matched_debit_ids), 1)

    def test_batch_deposit_preserves_each_sources_native_partner(self):
        entry, first, second = self.entry(), self.candidate(40), self.candidate(60)
        other = self.env['res.partner'].create({'name': self.prefix + ' second payer'})
        second.partner_id = other
        self.apply(entry, [(first, 40), (second, 60)])
        self.assertTrue(first.reconciled and second.reconciled)
        self.assertTrue(entry.is_reconciled)
        counterparts = entry._seek_for_lines()[2]
        self.assertEqual(counterparts.filtered(lambda line: line.partner_id == self.partner).balance, -40)
        self.assertEqual(counterparts.filtered(lambda line: line.partner_id == other).balance, -60)

    def test_native_sync_would_overwrite_foreign_original_on_partial_match(self):
        entry = self.entry(50, foreign_currency_id=self.foreign.id, amount_currency=100)
        source = self.candidate(40, currency=self.foreign)
        self.apply(entry, [(source, 40)], preserve=False)
        self.assertEqual(entry.amount, 50)
        self.assertEqual(entry.amount_currency, 60)

    def test_foreign_transaction_partial_preserves_original_and_bank_rate(self):
        entry = self.entry(50, foreign_currency_id=self.foreign.id, amount_currency=100)
        first, second = self.candidate(40, currency=self.foreign), self.candidate(60, currency=self.foreign)
        self.apply(entry, [(first, 40)])
        suspense = entry._seek_for_lines()[1]
        self.assertEqual(suspense.balance, -30)
        self.assertEqual(suspense.amount_currency, -60)
        self.assertEqual(entry.amount_residual, -60)
        self.apply(entry, [(second, 60)])
        self.assertTrue(entry.is_reconciled)
        self.assertTrue(first.reconciled and second.reconciled)
        self.assertEqual(entry.amount_currency, 100)

    def test_foreign_journal_partial_matches_company_currency_source(self):
        self.journal.currency_id = self.foreign
        entry = self.entry(100, foreign_currency_id=self.env.company.currency_id.id, amount_currency=50)
        first, second = self.candidate(20), self.candidate(30)
        self.apply(entry, [(first, 20)])
        self.assertEqual(entry.amount_residual, -30)
        self.apply(entry, [(second, 30)])
        self.assertTrue(entry.is_reconciled)
        self.assertEqual(entry.amount, 100)
        self.assertEqual(entry.amount_currency, 50)

    def test_third_currency_source_uses_native_historical_residual_conversion(self):
        self.journal.currency_id = self.foreign
        entry = self.entry(100)
        source = self.candidate(200, currency=self.third)
        self.apply(entry, [(source, 80)])
        self.assertEqual(entry.amount_residual, -60)
        self.assertEqual(source.amount_residual, 30)
        self.assertEqual(source.amount_residual_currency, 120)

    def test_native_exchange_difference_reconciles_without_changing_bank_amount(self):
        entry = self.entry(50, foreign_currency_id=self.foreign.id, amount_currency=100)
        source = self.candidate(100, currency=self.foreign, balance=60)
        self.assertEqual(source.amount_residual, 60)
        self.apply(entry, [(source, 100)])
        self.assertTrue(source.reconciled)
        self.assertTrue(entry.is_reconciled)
        exchange = source.full_reconcile_id.exchange_move_id | source.matched_credit_ids.exchange_move_id
        self.assertTrue(exchange)
        self.assertEqual(exchange.journal_id, self.exchange)
        self.assertFalse(exchange._get_unbalanced_moves({'records': exchange}))

    def test_native_fixed_fee_finishes_short_payment(self):
        entry, source = self.entry(98), self.candidate()
        self.apply(entry, [(source, 100)], fee_model=self.fee_model())
        self.assertTrue(entry.is_reconciled)
        self.assertTrue(source.reconciled)
        fee = entry._seek_for_lines()[2].filtered(lambda line: line.account_id == self.expense)
        self.assertEqual(fee.balance, 2)
        self.assertEqual(fee.reconcile_model_id.rule_type, 'writeoff_button')

    def test_native_percentage_writeoff_consumes_remaining_suspense(self):
        entry = self.entry(-10)
        self.apply(entry, [], fee_model=self.fee_model('100', 'percentage'))
        self.assertTrue(entry.is_reconciled)
        self.assertEqual(entry._seek_for_lines()[2].balance, 10)

    def test_statement_percentage_fee_uses_original_journal_amount(self):
        entry, source = self.entry(-100), self.candidate(98, outgoing=True)
        self.apply(entry, [(source, 98)], fee_model=self.fee_model('2', 'percentage_st_line'))
        self.assertTrue(entry.is_reconciled)
        self.assertTrue(source.reconciled)
        self.assertEqual(entry._seek_for_lines()[2].filtered(
            lambda line: line.account_id == self.expense).balance, 2)

    def test_regex_fee_uses_native_label_extraction(self):
        entry, source = self.entry(98, payment_ref=self.prefix + ' FEE:2.00'), self.candidate()
        self.apply(entry, [(source, 100)], fee_model=self.fee_model(r'FEE:(\d+\.\d+)', 'regex'))
        self.assertTrue(entry.is_reconciled)
        self.assertTrue(source.reconciled)
        self.assertEqual(entry._seek_for_lines()[2].filtered(
            lambda line: line.account_id == self.expense).balance, 2)

    def test_tax_exclusive_fee_uses_native_tax_lines_and_remaining_suspense(self):
        tax = self.env['account.tax'].create({'name': self.prefix + ' fee tax',
            'amount_type': 'percent', 'amount': 10, 'type_tax_use': 'purchase'})
        model = self.fee_model()
        model.line_ids.tax_ids = tax
        entry, source = self.entry(97.8), self.candidate()
        self.apply(entry, [(source, 100)], fee_model=model)
        self.assertTrue(source.reconciled)
        self.assertTrue(entry.is_reconciled)
        tax_rows = entry.move_id.line_ids.filtered(lambda line: line.tax_repartition_line_id)
        self.assertEqual(len(tax_rows), 1)
        self.assertAlmostEqual(tax_rows.balance, 0.2)
        self.assertEqual(tax_rows.tax_line_id, tax)

    def test_outbound_foreign_partial_preserves_original_until_fully_matched(self):
        entry = self.entry(-50, foreign_currency_id=self.foreign.id, amount_currency=-100)
        first = self.candidate(40, currency=self.foreign, outgoing=True)
        second = self.candidate(60, currency=self.foreign, outgoing=True)
        self.apply(entry, [(first, 40)])
        self.assertEqual(entry.amount_residual, 60)
        self.assertEqual(entry._seek_for_lines()[1].balance, 30)
        self.apply(entry, [(second, 60)])
        self.assertTrue(first.reconciled and second.reconciled)
        self.assertTrue(entry.is_reconciled)
        self.assertEqual(entry.amount_currency, -100)

    def test_second_bank_entry_finishes_one_partially_paid_invoice(self):
        first, second, source = self.entry(30), self.entry(70), self.candidate()
        self.apply(first, [(source, 30)])
        self.assertEqual(source.amount_residual, 70)
        self.apply(second, [(source, 70)])
        self.assertTrue(first.is_reconciled and second.is_reconciled)
        self.assertTrue(source.reconciled)
        self.assertEqual(len(source.matched_credit_ids), 2)

    def test_native_undo_clears_all_matches_not_only_latest_partial(self):
        entry, first, second = self.entry(), self.candidate(40), self.candidate(60)
        self.apply(entry, [(first, 40)])
        self.apply(entry, [(second, 60)])
        entry.action_undo_reconciliation()
        self.env.flush_all()
        self.assertEqual(first.amount_residual, 40)
        self.assertEqual(second.amount_residual, 60)
        self.assertEqual(entry.amount_residual, -100)
        self.assertFalse(first.matched_credit_ids | second.matched_credit_ids)

    def test_native_undo_deletes_generated_payment_records_not_external_payments(self):
        entry, source = self.entry(), self.candidate()
        self.apply(entry, [(source, 100)])
        payment = self.env['account.payment'].create({'payment_type': 'inbound',
            'partner_type': 'customer', 'partner_id': self.partner.id,
            'journal_id': self.journal.id, 'amount': 10})
        unrelated = payment.copy()
        entry.payment_ids = payment
        entry.action_undo_reconciliation()
        self.env.flush_all()
        self.assertFalse(payment.exists())
        self.assertTrue(unrelated.exists())
        self.assertFalse(entry.payment_ids)
        self.assertEqual(source.amount_residual, 100)

    def test_native_simulation_savepoint_rolls_back_matching_and_undo(self):
        from contextlib import closing
        entry, source = self.entry(), self.candidate()
        before = entry.move_id.line_ids.read(['write_date', 'balance', 'amount_currency'])
        self.env.flush_all()
        with closing(self.env.cr.savepoint()):
            self.apply(entry, [(source, 100)])
            self.assertTrue(entry.is_reconciled)
        self.assertEqual(entry.move_id.line_ids.read(['write_date', 'balance', 'amount_currency']), before)
        self.assertEqual(source.amount_residual, 100)
        self.apply(entry, [(source, 100)])
        self.env.flush_all()
        with closing(self.env.cr.savepoint()):
            entry.action_undo_reconciliation()
            self.env.flush_all()
            self.assertFalse(entry.is_reconciled)
        self.assertTrue(entry.is_reconciled)
        self.assertTrue(source.reconciled)

    def test_native_undo_restores_source_and_original_foreign_statement(self):
        entry = self.entry(50, foreign_currency_id=self.foreign.id, amount_currency=100)
        source = self.candidate(100, currency=self.foreign, balance=60)
        self.apply(entry, [(source, 100)])
        entry.action_undo_reconciliation()
        self.env.flush_all()
        self.assertFalse(entry.is_reconciled)
        self.assertEqual(entry.amount, 50)
        self.assertEqual(entry.amount_currency, 100)
        self.assertEqual(source.amount_residual, 60)
        self.assertEqual(source.amount_residual_currency, 100)
        self.assertFalse(source.matched_credit_ids)
        self.assertFalse(source.full_reconcile_id)
        self.assertEqual(len(entry.move_id.line_ids), 2)

    def test_fiscal_lock_remains_native_guard_even_with_business_sync_suppressed(self):
        entry, source = self.entry(), self.candidate()
        before = entry.move_id.line_ids.read(['balance', 'amount_currency'])
        # Existing unrelated draft fixtures must not prevent arranging this lock test.
        with patch.object(type(self.env.company), '_validate_fiscalyear_lock', return_value=None):
            self.env.company.fiscalyear_lock_date = fields.Date.today()
        with self.assertRaises(UserError), self.env.cr.savepoint():
            self.apply(entry, [(source, 100)])
        self.assertEqual(entry.move_id.line_ids.read(['balance', 'amount_currency']), before)
        self.assertEqual(source.amount_residual, 100)
