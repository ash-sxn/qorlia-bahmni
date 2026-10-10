# SPDX-License-Identifier: LGPL-3.0-or-later
# Copyright 2026 Qorlia contributors.
import uuid
from unittest.mock import patch

from odoo import Command, fields
from odoo.exceptions import AccessError, UserError, ValidationError
from odoo.tests import tagged

from . import test_native_bank_matching_contract as native_tests


@tagged('post_install', '-at_install')
class BankMatchingTest(native_tests.NativeBankMatchingContractTest):
    """Run the independent native contract against the private adapter, then prove simulation."""

    def allocations(self, sources):
        return [{'line_id': line.id, 'amount': amount} for line, amount in sources]

    def apply(self, entry, allocations, fee_model=False, preserve=True):
        if not preserve:
            return super().apply(entry, allocations, fee_model, preserve)
        return entry._qorlia_bank_match_apply(self.allocations(allocations), fee_model.id if fee_model else False)

    def unchanged(self, entry, sources):
        self.env.flush_all()
        moves = entry.move_id | sources.move_id | entry.payment_ids.move_id
        return {'entry': entry.read(['write_date', 'amount', 'amount_currency', 'amount_residual', 'is_reconciled', 'payment_ids']),
            'moves': moves.sorted('id').read(['write_date', 'state', 'amount_total', 'amount_residual']),
            'lines': moves.line_ids.sorted('id').read(['write_date', 'balance', 'amount_currency', 'amount_residual',
                'amount_residual_currency', 'matched_debit_ids', 'matched_credit_ids', 'full_reconcile_id']),
            'counts': {name: self.env[name].search_count([]) for name in
                ('account.move', 'account.move.line', 'account.partial.reconcile', 'account.full.reconcile',
                 'account.payment', 'account.analytic.line', 'stock.picking', 'mail.message', 'mail.mail',
                 'mail.notification', 'mail.followers')}}

    def prove(self, entry, allocations=None, model=False, undo=False):
        allocations = allocations or []
        sources = self.env['account.move.line'].browse([line.id for line, _amount in allocations])
        # Review flushes earlier real writes; their queued tracking belongs to the baseline, not the preview.
        self.env.cr.flush()
        graph = entry._qorlia_bank_match_graph(sources)
        origin = {name: set(items.ids) for name, items in graph.items()}
        before = self.unchanged(entry, sources)
        preview = entry._qorlia_bank_match_simulate(self.allocations(allocations), model.id if model else False, undo)
        self.assertEqual(self.unchanged(entry, sources), before)
        self.assertEqual(preview['before'], entry._qorlia_bank_match_snapshot(graph, origin))
        if undo:
            entry._qorlia_bank_match_undo()
        else:
            self.apply(entry, allocations, model)
        self.env.flush_all()
        actual = entry._qorlia_bank_match_graph(sources.exists(), origin)
        self.assertEqual(entry._qorlia_bank_match_snapshot(actual, origin), preview['after'])
        return preview

    def user(self, group='account.group_account_user'):
        return self.env['res.users'].with_context(no_reset_password=True).create({'name': self.prefix + ' reviewer',
            'login': uuid.uuid4().hex, 'groups_id': [Command.set(self.env.ref(group).ids)]})

    def test_native_full_and_partial_simulation_match_saved_graph_without_side_effects(self):
        for amount in (30, 100):
            entry, source = self.entry(amount), self.candidate()
            result = self.prove(entry, [(source, amount)])
            self.assertTrue(result['after']['account.partial.reconcile']['rows'])
            self.assertEqual(source.amount_residual, 100 - amount)
            self.assertTrue(entry.is_reconciled)

    def test_foreign_exchange_simulation_tracks_partial_exchange_moves_and_undo(self):
        entry = self.entry(50, foreign_currency_id=self.foreign.id, amount_currency=100)
        source = self.candidate(100, currency=self.foreign, balance=60)
        result = self.prove(entry, [(source, 100)])
        self.assertGreater(len(result['after']['account.move']['rows']), len(result['before']['account.move']['rows']))
        self.assertTrue(source.matched_credit_ids.exchange_move_id)
        self.prove(entry, undo=True)
        self.assertEqual(source.amount_residual, 60)
        self.assertEqual(entry.amount_currency, 100)

    def test_undo_simulation_discloses_generated_payment_deletion(self):
        entry, source = self.entry(), self.candidate()
        self.apply(entry, [(source, 100)])
        payment = self.env['account.payment'].create({'payment_type': 'inbound', 'partner_type': 'customer',
            'partner_id': self.partner.id, 'journal_id': self.journal.id, 'amount': 10})
        unrelated = payment.copy()
        entry.payment_ids = payment
        preview = self.prove(entry, undo=True)
        self.assertIn(payment.id, preview['after']['account.payment']['removed_ids'])
        self.assertFalse(payment.exists())
        self.assertTrue(unrelated.exists())

    def test_callbacks_are_quarantined_on_success_and_native_failure(self):
        entry, source = self.entry(), self.candidate()
        self.env.cr.flush()
        hooks = {name: getattr(self.env.cr, name) for name in ('postcommit', 'prerollback', 'postrollback')}
        pending = {name: list(callbacks._funcs) for name, callbacks in hooks.items()}
        original, seen, added = type(entry.move_id).write, [], []
        fail = False

        def write(move, values):
            if move.env.context.get('tracking_disable') and 'line_ids' in values:
                for name in hooks:
                    callback = lambda: seen.append('escaped')
                    added.append(callback)
                    getattr(move.env.cr, name).add(callback)
                if fail:
                    raise UserError('QorliaQA Native calculation failure')
            return original(move, values)

        before = self.unchanged(entry, source)
        with patch.object(type(entry.move_id), 'write', write):
            entry._qorlia_bank_match_simulate(self.allocations([(source, 100)]))
            fail = True
            with self.assertRaisesRegex(UserError, 'Native calculation failure'):
                entry._qorlia_bank_match_simulate(self.allocations([(source, 100)]))
        self.assertEqual(self.unchanged(entry, source), before)
        self.assertFalse(seen)
        self.assertGreaterEqual(len(added), 6)
        for name, callbacks in hooks.items():
            self.assertIs(getattr(self.env.cr, name), callbacks)
            self.assertEqual(list(callbacks._funcs), pending[name])
            self.assertFalse(any(callback in callbacks._funcs for callback in added))

    def test_permissions_and_caller_accounting_bypasses_rejected(self):
        entry, source = self.entry(), self.candidate()
        before = self.unchanged(entry, source)
        for group in ('account.group_account_readonly', 'account.group_account_invoice'):
            with self.assertRaises(AccessError):
                entry.with_user(self.user(group))._qorlia_bank_match_simulate(self.allocations([(source, 100)]))
        for context in ({'check_move_validity': False}, {'force_delete': True}, {'skip_account_move_synchronization': True},
                {'skip_invoice_sync': True}, {'no_exchange_difference': True}, {'no_cash_basis': True}):
            with self.assertRaises(ValidationError):
                entry.with_context(**context)._qorlia_bank_match_simulate(self.allocations([(source, 100)]))
        self.assertEqual(self.unchanged(entry, source), before)

    def test_hidden_connected_source_row_fails_complete_graph_not_partial_review(self):
        entry, source = self.entry(), self.candidate()
        denied = source.move_id.line_ids - source
        user = self.user()
        self.env['ir.rule'].create({'name': self.prefix + ' hidden connected row',
            'model_id': self.env.ref('account.model_account_move_line').id,
            'domain_force': "[('id', '!=', %s)]" % denied.id})
        before = self.unchanged(entry, source)
        with self.assertRaises(AccessError):
            entry.with_user(user)._qorlia_bank_match_simulate(self.allocations([(source, 100)]))
        self.assertEqual(self.unchanged(entry, source), before)

    def test_malformed_or_excess_allocations_and_unavailable_rule_rejected(self):
        entry, source = self.entry(), self.candidate()
        cases = [None, {}, [], self.allocations([(source, 100), (source, 1)]),
            [{'line_id': True, 'amount': 1}], [{'line_id': source.id, 'amount': 1, 'account_id': self.expense.id}]]
        cases += [[{'line_id': source.id, 'amount': value}] for value in
            (True, '1', 0, -1, float('nan'), float('inf'), 101, 0.001, 1.001, 100.004)]
        before = self.unchanged(entry, source)
        for values in cases:
            with self.assertRaises(ValidationError):
                entry._qorlia_bank_match_simulate(values)
        for identifier in (True, '1', 0, -1, 2147483647):
            with self.assertRaises(ValidationError):
                entry._qorlia_bank_match_simulate(self.allocations([(source, 100)]), identifier)
        self.assertEqual(self.unchanged(entry, source), before)
        model = self.fee_model()
        model.active = False
        before = self.unchanged(entry, source)
        with self.assertRaises(ValidationError):
            entry._qorlia_bank_match_simulate(self.allocations([(source, 100)]), model.id)
        self.assertEqual(self.unchanged(entry, source), before)

    def test_hashed_journal_remains_guarded_during_simulation(self):
        entry, source = self.entry(), self.candidate()
        entry.move_id.button_draft()
        self.journal.restrict_mode_hash_table = True
        entry.move_id.action_post()
        self.assertTrue(entry.move_id.inalterable_hash)
        before = self.unchanged(entry, source)
        with self.assertRaises(UserError):
            entry._qorlia_bank_match_simulate(self.allocations([(source, 100)]))
        self.assertEqual(self.unchanged(entry, source), before)

    def test_company_fee_tax_included_and_forced_included_match_native_save(self):
        for included, force in ((True, False), (False, True)):
            tax = self.env['account.tax'].create({'name': self.prefix + uuid.uuid4().hex[:5], 'amount': 10,
                'type_tax_use': 'purchase', 'price_include': included})
            model = self.fee_model('2.2')
            model.line_ids.write({'tax_ids': [Command.set(tax.ids)], 'force_tax_included': force})
            entry, source = self.entry(97.8), self.candidate()
            self.prove(entry, [(source, 100)], model)
            tax_rows = entry.move_id.line_ids.filtered(lambda line: line.tax_repartition_line_id)
            self.assertAlmostEqual(tax_rows.balance, 0.2)
            self.assertFalse(tax_rows.tax_repartition_line_id.refund_tax_id)
            self.assertTrue(entry.is_reconciled)

    def test_foreign_fee_tax_preserves_original_and_native_transaction_tax_amounts(self):
        for included, force, fee in ((False, False, '2'), (True, False, '2.2'), (False, True, '2.2')):
            tax = self.env['account.tax'].create({'name': self.prefix + uuid.uuid4().hex[:5], 'amount': 10,
                'type_tax_use': 'purchase', 'price_include': included})
            model = self.fee_model(fee)
            model.line_ids.write({'tax_ids': [Command.set(tax.ids)], 'force_tax_included': force})
            entry = self.entry(48.9, foreign_currency_id=self.foreign.id, amount_currency=97.8)
            source = self.candidate(100, currency=self.foreign)
            self.prove(entry, [(source, 100)], model)
            tax_rows = entry.move_id.line_ids.filtered(lambda line: line.tax_repartition_line_id)
            self.assertAlmostEqual(tax_rows.amount_currency, 0.2)
            self.assertAlmostEqual(tax_rows.balance, 0.1)
            self.assertTrue(entry.is_reconciled)
            self.assertEqual(entry.amount_currency, 97.8)

    def test_native_mandatory_analytics_requires_and_preserves_fee_allocation(self):
        plan = self.env['account.analytic.plan'].create({'name': self.prefix + ' mandatory fee',
            'company_id': self.env.company.id, 'default_applicability': 'optional',
            'applicability_ids': [Command.create({'business_domain': 'general',
                'account_prefix': self.expense.code, 'applicability': 'mandatory'})]})
        account = self.env['account.analytic.account'].create({'name': self.prefix + ' department',
            'plan_id': plan.id, 'company_id': self.env.company.id})
        entry, model = self.entry(-2), self.fee_model()
        before = self.unchanged(entry, self.env['account.move.line'])
        with self.assertRaises(ValidationError):
            entry._qorlia_bank_match_simulate([], model.id)
        self.assertEqual(self.unchanged(entry, self.env['account.move.line']), before)
        model.line_ids.analytic_distribution = {str(account.id): 100}
        preview = self.prove(entry, model=model)
        self.assertTrue(preview['after']['account.analytic.line']['rows'])
        self.assertTrue(entry.is_reconciled)

    def test_cash_basis_generated_entries_and_undo_are_in_complete_native_graph(self):
        self.env.company.write({'tax_cash_basis_journal_id': self.exchange.id, 'tax_exigibility': True})
        transition = self.env['account.account'].create({'name': self.prefix + ' CABA transition',
            'code': 'QC' + uuid.uuid4().hex[:8], 'account_type': 'liability_current', 'reconcile': True})
        tax = self.env['account.tax'].create({'name': self.prefix + ' CABA', 'amount': 10,
            'type_tax_use': 'sale', 'tax_exigibility': 'on_payment', 'cash_basis_transition_account_id': transition.id})
        tax.invoice_repartition_line_ids.filtered(lambda line: line.repartition_type == 'tax').account_id = self.income
        invoice = self.env['account.move'].create({'move_type': 'out_invoice', 'partner_id': self.partner.id,
            'invoice_date': fields.Date.today(), 'invoice_line_ids': [Command.create({'name': self.prefix,
                'account_id': self.income.id, 'quantity': 1, 'price_unit': 100, 'tax_ids': [Command.set(tax.ids)]})]})
        invoice.action_post()
        source = invoice.line_ids.filtered(lambda line: line.account_type == 'asset_receivable')
        entry = self.entry(110)
        result = self.prove(entry, [(source, 110)])
        self.assertTrue(any(row['values']['tax_cash_basis_rec_id'] for row in result['after']['account.move']['rows']))
        self.prove(entry, undo=True)
        self.assertEqual(source.amount_residual, 110)

    def test_hidden_prior_partial_reconciliation_fails_complete_graph(self):
        first, second, source = self.entry(30), self.entry(70), self.candidate()
        self.apply(first, [(source, 30)])
        partial = source.matched_credit_ids
        user = self.user()
        self.env['ir.rule'].create({'name': self.prefix + ' hidden prior partial',
            'model_id': self.env.ref('account.model_account_partial_reconcile').id,
            'domain_force': "[('id', '!=', %s)]" % partial.id})
        before = self.unchanged(second, source)
        with self.assertRaises(AccessError):
            second.with_user(user)._qorlia_bank_match_simulate(self.allocations([(source, 70)]))
        self.assertEqual(self.unchanged(second, source), before)
