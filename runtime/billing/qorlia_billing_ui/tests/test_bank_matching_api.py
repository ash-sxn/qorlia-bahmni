# SPDX-License-Identifier: LGPL-3.0-or-later
# Copyright 2026 Qorlia contributors.
import copy
import uuid
from unittest.mock import patch

from odoo import Command, fields
from odoo.exceptions import AccessError, UserError, ValidationError
from odoo.tests import tagged

from . import test_bank_matching as simulation_tests
from . import test_native_bank_matching_contract as native_tests


@tagged('post_install', '-at_install')
class BankMatchingAPITest(native_tests.NativeBankMatchingContractTest):
    """Replay the native contracts through reviewed public saves, then test recovery and guards."""

    allocations = simulation_tests.BankMatchingTest.allocations
    unchanged = simulation_tests.BankMatchingTest.unchanged
    user = simulation_tests.BankMatchingTest.user
    test_foreign_fee_tax_preserves_original_and_native_transaction_tax_amounts = (
        simulation_tests.BankMatchingTest.test_foreign_fee_tax_preserves_original_and_native_transaction_tax_amounts)
    test_native_mandatory_analytics_requires_and_preserves_fee_allocation = (
        simulation_tests.BankMatchingTest.test_native_mandatory_analytics_requires_and_preserves_fee_allocation)
    test_cash_basis_generated_entries_and_undo_are_in_complete_native_graph = (
        simulation_tests.BankMatchingTest.test_cash_basis_generated_entries_and_undo_are_in_complete_native_graph)

    def request(self, entry, allocations=None, model=False, action='match', api=None):
        api = api if api is not None else self.env['account.bank.statement.line']
        allocations = allocations or []
        self.env.cr.flush()
        payload = {'statement_line_id': entry.id, 'version': api.qorlia_bank_match_load(entry.id)['version'],
            'action': action, 'allocations': self.allocations(allocations), 'fee_model_id': model.id if model else False}
        sources = self.env['account.move.line'].browse([line.id for line, _amount in allocations])
        before = self.unchanged(entry, sources)
        review = api.qorlia_bank_match_preview(payload)
        self.assertEqual(self.unchanged(entry, sources), before)
        return {'payload': payload, 'review_version': review['review_version'], 'request_key': str(uuid.uuid4())}, review

    def apply(self, entry, allocations, fee_model=False, preserve=True):
        if not preserve:
            return super().apply(entry, allocations, fee_model, preserve)
        previous = set(entry.move_id.line_ids.ids)
        request, _review = self.request(entry, allocations, fee_model)
        entry.qorlia_bank_match_save(**request)
        return entry.move_id.line_ids.filtered(lambda line: line.id not in previous).sorted('id')

    def prove(self, entry, allocations=None, model=False, undo=False):
        allocations = allocations or []
        sources = self.env['account.move.line'].browse([line.id for line, _amount in allocations])
        request, review = self.request(entry, allocations, model, 'undo' if undo else 'match')
        graph = entry._qorlia_bank_match_graph(sources)
        origin = {name: set(items.ids) for name, items in graph.items()}
        entry.qorlia_bank_match_save(**request)
        self.assertEqual(entry._qorlia_bank_match_snapshot(entry._qorlia_bank_match_graph(sources.exists(), origin), origin),
            review['after'])
        return review

    def test_review_save_status_retry_and_reviewed_undo(self):
        entry, source = self.entry(), self.candidate()
        request, review = self.request(entry, [(source, 100)])
        self.assertIs(entry.qorlia_bank_match_status(**request), False)
        saved = entry.qorlia_bank_match_save(**request)
        self.assertTrue(saved['accepted'] and saved['can_undo'])
        self.assertFalse(saved['can_match'])
        self.assertTrue(source.reconciled)
        self.assertEqual(len(entry.qorlia_bank_match_receipts), 1)
        before = self.unchanged(entry, source)
        self.assertEqual(entry.qorlia_bank_match_save(**request), saved)
        self.assertEqual(self.unchanged(entry, source), before)
        undo, review = self.request(entry, action='undo')
        self.assertTrue(review['after']['account.partial.reconcile']['removed_ids'])
        entry.qorlia_bank_match_save(**undo)
        self.assertEqual(source.amount_residual, 100)
        self.assertTrue(entry.qorlia_bank_match_load(entry.id)['can_match'])
        before = self.unchanged(entry, source)
        # Recovery returns current state; an old accepted match must not execute again after undo.
        self.assertTrue(entry.qorlia_bank_match_save(**request)['accepted'])
        self.assertTrue(entry.qorlia_bank_match_save(**undo)['accepted'])
        self.assertEqual(self.unchanged(entry, source), before)
        self.assertEqual(len(entry.qorlia_bank_match_receipts), 2)

    def test_undo_receipt_survives_generated_payment_deletion(self):
        entry, source = self.entry(), self.candidate()
        self.apply(entry, [(source, 100)])
        payment = self.env['account.payment'].create({'payment_type': 'inbound', 'partner_type': 'customer',
            'partner_id': self.partner.id, 'journal_id': self.journal.id, 'amount': 10})
        other = payment.copy()
        entry.payment_ids = payment
        request, review = self.request(entry, action='undo')
        self.assertIn(payment.id, review['after']['account.payment']['removed_ids'])
        saved = entry.qorlia_bank_match_save(**request)
        self.assertFalse(payment.exists())
        self.assertTrue(other.exists())
        before = self.unchanged(entry, source)
        self.assertEqual(entry.qorlia_bank_match_save(**request), saved)
        self.assertEqual(self.unchanged(entry, source), before)

    def test_selected_source_changed_after_review_is_rejected(self):
        entry, source = self.entry(), self.candidate()
        request, _ = self.request(entry, [(source, 100)])
        source.name = self.prefix + ' changed source'
        before = self.unchanged(entry, source)
        with self.assertRaises(UserError):
            entry.qorlia_bank_match_save(**request)
        self.assertEqual(self.unchanged(entry, source), before)
        self.assertFalse(entry.qorlia_bank_match_receipts)

    def test_fee_values_changed_without_timestamp_require_review(self):
        entry, source, model = self.entry(98), self.candidate(), self.fee_model()
        request, _ = self.request(entry, [(source, 100)], model)
        stamp = model.line_ids.write_date
        self.env.cr.execute("UPDATE account_reconcile_model_line SET amount_string = '3', amount = 3 WHERE id = %s",
            [model.line_ids.id])
        model.line_ids.invalidate_recordset()
        self.assertEqual(model.line_ids.write_date, stamp)
        before = self.unchanged(entry, source)
        with self.assertRaises(UserError):
            entry.qorlia_bank_match_save(**request)
        self.assertEqual(self.unchanged(entry, source), before)

    def test_automatic_fiscal_position_changes_are_bound(self):
        entry, source, model = self.entry(98), self.candidate(), self.fee_model()
        position = self.env['account.fiscal.position'].create({'name': self.prefix + ' automatic',
            'auto_apply': True, 'company_id': self.env.company.id})
        request, _ = self.request(entry, [(source, 100)], model)
        position.sequence += 1
        before = self.unchanged(entry, source)
        with self.assertRaises(UserError):
            entry.qorlia_bank_match_save(**request)
        self.assertEqual(self.unchanged(entry, source), before)

    def test_rate_and_analytic_configuration_changes_are_bound(self):
        entry, source = self.entry(), self.candidate()
        rate = self.env['res.currency.rate'].create({'currency_id': self.env.company.currency_id.id,
            'company_id': self.env.company.id, 'name': fields.Date.today(), 'rate': 1})
        for configuration, changes in (
                (rate, {'rate': 1.01}),
                (self.env['account.analytic.plan'].create({'name': self.prefix + ' plan'}), {'default_applicability': 'unavailable'})):
            self.assertTrue(configuration)
            request, _ = self.request(entry, [(source, 100)])
            configuration.write(changes)
            before = self.unchanged(entry, source)
            with self.assertRaises(UserError):
                entry.qorlia_bank_match_save(**request)
            self.assertEqual(self.unchanged(entry, source), before)

    def test_fee_suggestions_respect_native_filters_and_paging(self):
        entry, source = self.entry(98), self.candidate()
        manual = self.fee_model()
        manual.match_nature = 'amount_paid'
        suggestion = self.fee_model()
        suggestion.write({'rule_type': 'writeoff_suggestion', 'match_nature': 'amount_paid'})
        choices = entry.qorlia_bank_fee_choices(entry.id, self.prefix)
        self.assertIn(manual.id, [row['id'] for row in choices['rows']])
        self.assertNotIn(suggestion.id, [row['id'] for row in choices['rows']])
        with self.assertRaises(ValidationError):
            self.request(entry, [(source, 100)], suggestion)
        suggestion.match_nature = 'amount_received'
        self.request(entry, [(source, 100)], suggestion)
        for index in range(26):
            self.fee_model()
        first = entry.qorlia_bank_fee_choices(entry.id, self.prefix)
        second = entry.qorlia_bank_fee_choices(entry.id, self.prefix, 25)
        self.assertEqual(len(first['rows']), 25)
        self.assertTrue(first['has_more'])
        self.assertFalse(set(row['id'] for row in first['rows']) & set(row['id'] for row in second['rows']))

    def test_native_accountant_can_review_save_and_recover_without_sudo(self):
        entry, source = self.entry(), self.candidate()
        api = entry.with_user(self.user())
        self.assertFalse(api.env.su)
        request, _ = self.request(entry, [(source, 100)], api=api)
        self.assertTrue(api.qorlia_bank_match_save(**request)['accepted'])
        self.assertTrue(source.reconciled)
        self.assertTrue(api.qorlia_bank_match_status(**request)['accepted'])

    def test_readonly_user_can_load_but_cannot_match(self):
        entry, source = self.entry(), self.candidate()
        api = entry.with_user(self.user('account.group_account_readonly'))
        loaded = api.qorlia_bank_match_load(entry.id)
        self.assertFalse(loaded['can_match'] or loaded['can_undo'])
        self.assertTrue(loaded['reason'])
        request, _ = self.request(entry, [(source, 100)])
        before = self.unchanged(entry, source)
        with self.assertRaises(AccessError):
            api.qorlia_bank_match_preview(request['payload'])
        with self.assertRaises(AccessError):
            api.qorlia_bank_match_save(**request)
        self.assertEqual(self.unchanged(entry, source), before)

    def test_hidden_source_and_fee_rows_fail_complete_review(self):
        entry, source, model = self.entry(98), self.candidate(), self.fee_model()
        api = entry.with_user(self.user())
        payload = {'statement_line_id': entry.id, 'version': api.qorlia_bank_match_load(entry.id)['version'],
            'action': 'match', 'allocations': self.allocations([(source, 100)]), 'fee_model_id': model.id}
        for name, identifier in (('account.move.line', (source.move_id.line_ids - source).id),
                ('account.reconcile.model.line', model.line_ids.id)):
            rule = self.env['ir.rule'].create({'name': self.prefix + ' hidden ' + name,
                'model_id': self.env['ir.model']._get(name).id, 'domain_force': "[('id', '!=', %s)]" % identifier})
            before = self.unchanged(entry, source)
            with self.assertRaises(AccessError):
                api.qorlia_bank_match_preview(payload)
            self.assertEqual(self.unchanged(entry, source), before)
            rule.unlink()

    def test_hidden_group_tax_child_fails_complete_configuration(self):
        entry, source, model = self.entry(98), self.candidate(), self.fee_model()
        child = self.env['account.tax'].create({'name': self.prefix + ' child', 'amount': 10, 'type_tax_use': 'purchase'})
        group = self.env['account.tax'].create({'name': self.prefix + ' grouped', 'amount_type': 'group',
            'type_tax_use': 'purchase', 'children_tax_ids': [Command.set(child.ids)]})
        model.line_ids.tax_ids = group
        api = entry.with_user(self.user())
        payload = {'statement_line_id': entry.id, 'version': api.qorlia_bank_match_load(entry.id)['version'],
            'action': 'match', 'allocations': self.allocations([(source, 100)]), 'fee_model_id': model.id}
        self.env['ir.rule'].create({'name': self.prefix + ' hidden child',
            'model_id': self.env.ref('account.model_account_tax').id, 'domain_force': "[('id', '!=', %s)]" % child.id})
        before = self.unchanged(entry, source)
        with self.assertRaises(AccessError):
            api.qorlia_bank_match_preview(payload)
        self.assertEqual(self.unchanged(entry, source), before)

    def test_malformed_payload_and_request_identifiers_rejected(self):
        entry, source = self.entry(), self.candidate()
        request, _ = self.request(entry, [(source, 100)])
        cases = [None, {}, {**request['payload'], 'account_id': self.receivable.id},
            {**request['payload'], 'statement_line_id': True}, {**request['payload'], 'version': 'not-a-version'},
            {**request['payload'], 'action': 'delete'}, {**request['payload'], 'action': 'undo'},
            {**request['payload'], 'fee_model_id': True}, {**request['payload'], 'allocations': {}}]
        before = self.unchanged(entry, source)
        for payload in cases:
            with self.assertRaises(ValidationError):
                entry.qorlia_bank_match_preview(payload)
        for key in (None, True, 'bad', request['request_key'].upper()):
            with self.assertRaises(ValidationError):
                entry.qorlia_bank_match_status(request['payload'], request['review_version'], key)
        with self.assertRaises(ValidationError):
            entry.qorlia_bank_match_save(request['payload'], 'bad', request['request_key'])
        self.assertEqual(self.unchanged(entry, source), before)

    def test_receipt_is_bound_to_exact_request_and_author(self):
        entry, source = self.entry(), self.candidate()
        request, _ = self.request(entry, [(source, 100)])
        entry.qorlia_bank_match_save(**request)
        before = self.unchanged(entry, source)
        changed = copy.deepcopy(request)
        changed['payload']['allocations'][0]['amount'] = 99
        with self.assertRaises(ValidationError):
            entry.qorlia_bank_match_status(**changed)
        with self.assertRaises(ValidationError):
            entry.qorlia_bank_match_save(**changed)
        with self.assertRaises(ValidationError):
            entry.with_user(self.user()).qorlia_bank_match_status(**request)
        self.assertEqual(self.unchanged(entry, source), before)

    def test_unreviewed_native_save_effects_roll_back(self):
        entry, source = self.entry(), self.candidate()
        request, _ = self.request(entry, [(source, 100)])
        original = type(entry)._qorlia_bank_match_apply

        def apply(record, allocations, model=False):
            result = original(record, allocations, model)
            if not record.env.context.get('tracking_disable'):
                record.move_id.narration = 'QorliaQA Unreviewed native change'
            return result

        before = self.unchanged(entry, source)
        with patch.object(type(entry), '_qorlia_bank_match_apply', apply):
            with self.assertRaisesRegex(UserError, 'unreviewed'):
                entry.qorlia_bank_match_save(**request)
        self.assertEqual(self.unchanged(entry, source), before)
        self.assertFalse(entry.qorlia_bank_match_receipts)

    def test_receipt_side_effect_and_response_failure_roll_back_financial_action(self):
        entry, source = self.entry(), self.candidate()
        request, _ = self.request(entry, [(source, 100)])
        original = type(entry).write

        def write(record, values):
            result = original(record, values)
            if 'qorlia_bank_match_receipts' in values:
                record.move_id.narration = 'QorliaQA Receipt changed native journal'
            return result

        before = self.unchanged(entry, source)
        with patch.object(type(entry), 'write', write):
            with self.assertRaisesRegex(UserError, 'receipt changed accounting'):
                entry.qorlia_bank_match_save(**request)
        self.assertEqual(self.unchanged(entry, source), before)
        self.assertFalse(entry.qorlia_bank_match_receipts)
        with patch.object(type(entry), 'qorlia_bank_match_status', side_effect=UserError('QorliaQA Response failed')):
            with self.assertRaisesRegex(UserError, 'Response failed'):
                entry.qorlia_bank_match_save(**request)
        self.assertEqual(self.unchanged(entry, source), before)
        self.assertFalse(entry.qorlia_bank_match_receipts)

    def test_caller_accounting_bypasses_fail_before_review_or_save(self):
        entry, source = self.entry(), self.candidate()
        request, _ = self.request(entry, [(source, 100)])
        before = self.unchanged(entry, source)
        for context in ({'check_move_validity': False}, {'force_delete': True},
                {'skip_account_move_synchronization': True}, {'no_cash_basis': True}):
            with self.assertRaises(ValidationError):
                entry.with_context(**context).qorlia_bank_match_preview(request['payload'])
            with self.assertRaises(ValidationError):
                entry.with_context(**context).qorlia_bank_match_save(**request)
        self.assertEqual(self.unchanged(entry, source), before)

    def test_raw_native_writes_cannot_forge_or_erase_save_receipts(self):
        entry, source = self.entry(), self.candidate()
        request, _ = self.request(entry, [(source, 100)])
        before = self.unchanged(entry, source)
        for token in (None, True, 'trusted', {}):
            with self.assertRaises(AccessError):
                entry.with_context(qorlia_bank_receipt_token=token).write({'qorlia_bank_match_receipts': {}})
        with self.assertRaises(AccessError):
            self.entry(qorlia_bank_match_receipts={request['request_key']: {'author': self.env.uid, 'hash': 'forged'}})
        with self.assertRaises(AccessError):
            self.env['account.bank.statement.line'].with_context(default_qorlia_bank_match_receipts={'forged': {}}).create({
                'journal_id': self.journal.id, 'date': fields.Date.today(), 'payment_ref': self.prefix, 'amount': 100})
        self.assertEqual(self.unchanged(entry, source), before)
        entry.qorlia_bank_match_save(**request)
        receipt = copy.deepcopy(entry.qorlia_bank_match_receipts)
        with self.assertRaises(AccessError):
            entry.write({'qorlia_bank_match_receipts': False})
        self.assertEqual(entry.qorlia_bank_match_receipts, receipt)

    def test_failed_save_restores_callbacks_and_data_but_success_preserves_native_callbacks(self):
        entry, source = self.entry(), self.candidate()
        request, _ = self.request(entry, [(source, 100)])
        hooks = {name: getattr(self.env.cr, name) for name in ('postcommit', 'prerollback', 'postrollback')}
        for queue in hooks.values():
            queue.data['qorlia.bank.test'] = ['earlier real action']
        functions = {name: list(queue._funcs) for name, queue in hooks.items()}
        original = type(entry)._qorlia_bank_match_apply
        added = []

        def apply(record, allocations, model=False):
            result = original(record, allocations, model)
            if not record.env.context.get('tracking_disable'):
                for name in hooks:
                    callback = lambda: None
                    added.append(callback)
                    getattr(record.env.cr, name).add(callback)
                    getattr(record.env.cr, name).data['qorlia.bank.test'].append('native bank action')
            return result

        before = self.unchanged(entry, source)
        with patch.object(type(entry), '_qorlia_bank_match_apply', apply):
            with patch.object(type(entry), 'qorlia_bank_match_status', side_effect=UserError('QorliaQA Callback response failure')):
                with self.assertRaises(UserError):
                    entry.qorlia_bank_match_save(**request)
            self.assertEqual(self.unchanged(entry, source), before)
            self.assertEqual(len(added), 3)
            for name, queue in hooks.items():
                self.assertIs(getattr(self.env.cr, name), queue)
                self.assertEqual(list(queue._funcs), functions[name])
                self.assertEqual(queue.data['qorlia.bank.test'], ['earlier real action'])
            self.assertTrue(entry.qorlia_bank_match_save(**request)['accepted'])
            self.assertEqual(len(added), 6)
            for name, queue in hooks.items():
                self.assertEqual(queue.data['qorlia.bank.test'], ['earlier real action', 'native bank action'])
                self.assertEqual(len(queue._funcs), len(functions[name]) + 1)
                self.assertTrue(any(callback in queue._funcs for callback in added[3:]))
                self.assertFalse(any(callback in queue._funcs for callback in added[:3]))
