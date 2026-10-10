# SPDX-License-Identifier: LGPL-3.0-or-later
from contextlib import closing
import copy
import uuid
from unittest.mock import patch

from odoo import Command
from odoo.exceptions import AccessError, UserError, ValidationError
from odoo.tests import TransactionCase, tagged

from . import test_bank_checkpoints as checkpoint_tests


@tagged('post_install', '-at_install')
class BankCheckpointEditorTest(TransactionCase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.entries = cls.env['account.bank.statement.line']
        cls.checkpoints = cls.env['account.bank.statement']
        cls.prefix = 'QorliaQA Checkpoint editor ' + uuid.uuid4().hex[:8]
        cls.partner = cls.env['res.partner'].create({'name': cls.prefix})
        cls.bank = cls.env['account.account'].create({'name': cls.prefix + ' bank',
            'code': 'QE' + uuid.uuid4().hex[:8], 'account_type': 'asset_cash'})
        cls.suspense = cls.env['account.account'].create({'name': cls.prefix + ' suspense',
            'code': 'QS' + uuid.uuid4().hex[:8], 'account_type': 'asset_current', 'reconcile': True})
        cls.journal = cls.env['account.journal'].create({'name': cls.prefix, 'code': uuid.uuid4().hex[:5],
            'type': 'bank', 'default_account_id': cls.bank.id, 'suspense_account_id': cls.suspense.id})

    entry = checkpoint_tests.BankCheckpointTest.entry
    checkpoint = checkpoint_tests.BankCheckpointTest.checkpoint

    def request(self, checkpoint=False, entries=None, split=False, values=None, api=None):
        api = api if api is not None else self.checkpoints
        loaded = api.qorlia_checkpoint_editor_load(checkpoint.id if checkpoint else False,
            entries.ids if entries is not None else [], split.id if split else False)
        payload = {name: copy.deepcopy(loaded[name]) for name in
            ('checkpoint_id', 'entry_ids', 'split_line_id', 'version', 'values')}
        payload['values'].update(values or {})
        before = self.entries.search([('journal_id', '=', self.journal.id)]).read([
            'write_date', 'statement_id', 'amount', 'move_id'])
        review = api.qorlia_checkpoint_editor_preview(payload)
        self.assertEqual(self.entries.search([('journal_id', '=', self.journal.id)]).read([
            'write_date', 'statement_id', 'amount', 'move_id']), before)
        return {'payload': payload, 'review_version': review['review_version'], 'request_key': str(uuid.uuid4())}, review

    def test_single_creation_uses_native_defaults_and_exact_retry(self):
        entry = self.entry(amount=100)
        model = self.checkpoints.with_context(active_ids=entry.ids, st_line_id=entry.id, split_line_id=False)
        with closing(self.env.cr.savepoint()):
            native = model.create(model.default_get(['line_ids']))
            expected = self.env['sale.order']._qorlia_read_fields(native,
                ('name', 'reference', 'balance_start', 'balance_end_real'))
        request, review = self.request(entries=entry)
        self.assertEqual(review['values'], expected)
        self.assertFalse(self.checkpoints.qorlia_checkpoint_editor_status(**request)['accepted'])
        before = entry._qorlia_bank_match_snapshot(entry._qorlia_bank_match_graph())
        saved = self.checkpoints.qorlia_checkpoint_editor_save(**request)
        self.assertTrue(saved['accepted'])
        checkpoint = self.checkpoints.browse(saved['checkpoint']['id'])
        self.assertEqual(checkpoint.line_ids, entry)
        self.assertEqual(checkpoint.balance_start, expected['balance_start'])
        self.assertEqual(checkpoint.balance_end_real, expected['balance_end_real'])
        after = entry._qorlia_bank_match_snapshot(entry._qorlia_bank_match_graph())
        before['account.bank.statement.line']['rows'][0]['values']['statement_id'] = checkpoint.id
        self.assertEqual(after, before)
        stamp = checkpoint.write_date
        self.assertEqual(self.checkpoints.qorlia_checkpoint_editor_save(**request), saved)
        self.assertEqual(self.checkpoints.qorlia_checkpoint_editor_status(**request), saved)
        self.assertEqual(checkpoint.write_date, stamp)
        self.assertEqual(self.checkpoints.search_count([('qorlia_checkpoint_creation_key', '=', request['request_key'])]), 1)

    def test_contiguous_multi_creation_and_native_gap_rejection(self):
        first, middle, last = self.entry(date='2026-02-01'), self.entry(date='2026-02-02'), self.entry(date='2026-02-03')
        with self.assertRaises(UserError):
            self.checkpoints.qorlia_checkpoint_editor_load(entry_ids=(first | last).ids)
        request, review = self.request(entries=first | middle | last,
            values={'name': self.prefix + ' multi', 'reference': 'External bank document',
                'balance_start': 10, 'balance_end_real': 310})
        saved = self.checkpoints.qorlia_checkpoint_editor_save(**request)
        self.assertEqual(set(self.checkpoints.browse(saved['checkpoint']['id']).line_ids.ids), {first.id, middle.id, last.id})
        self.assertTrue(saved['checkpoint']['is_complete'])
        self.assertEqual(saved['checkpoint']['balance_end'], 310)

    def test_split_uses_native_selection_and_reviews_reparented_checkpoint(self):
        previous = self.checkpoint(self.entry(date='2026-02-01'), balance_end_real=100)
        first, middle, last = self.entry(date='2026-02-02'), self.entry(date='2026-02-03'), self.entry(date='2026-02-04')
        origin = self.checkpoint(first | middle | last, balance_start=100, balance_end_real=400)
        request, review = self.request(entries=middle, split=middle)
        self.assertEqual(set(review['entry_ids']), {first.id, middle.id})
        old = next(row for row in review['affected'] if row['checkpoint']['id'] == origin.id)
        self.assertEqual(old['entry_ids'], last.ids)
        saved = self.checkpoints.qorlia_checkpoint_editor_save(**request)
        self.assertEqual(set(self.checkpoints.browse(saved['checkpoint']['id']).line_ids.ids), {first.id, middle.id})
        self.assertEqual(origin.line_ids, last)
        self.assertEqual(previous.line_ids.amount, 100)

    def test_balances_edit_reviews_later_continuity_and_preserves_ledger(self):
        checkpoint = self.checkpoint(self.entry(date='2026-03-01'), balance_end_real=100)
        later = self.checkpoint(self.entry(date='2026-03-02'), balance_start=100, balance_end_real=200)
        request, review = self.request(checkpoint=checkpoint,
            values={'name': self.prefix + ' corrected', 'balance_end_real': 101})
        self.assertFalse(next(row for row in review['affected'] if row['checkpoint']['id'] == later.id)['checkpoint']['is_valid'])
        saved = self.checkpoints.qorlia_checkpoint_editor_save(**request)
        self.assertEqual(saved['checkpoint']['balance_end_real'], 101)
        self.assertFalse(saved['checkpoint']['is_complete'])
        self.assertFalse(self.checkpoints.qorlia_checkpoint_detail(later.id)['checkpoint']['is_valid'])
        self.assertEqual(checkpoint.name, self.prefix + ' corrected')

    def test_accepted_edit_recovery_returns_current_state_without_repeating_edit(self):
        checkpoint = self.checkpoint()
        request, _ = self.request(checkpoint=checkpoint, values={'reference': 'First accepted reference'})
        self.checkpoints.qorlia_checkpoint_editor_save(**request)
        checkpoint.reference = 'Later native edit'
        stamp = checkpoint.write_date
        retry = self.checkpoints.qorlia_checkpoint_editor_save(**request)
        self.assertEqual(retry['checkpoint']['reference'], 'Later native edit')
        self.assertEqual(checkpoint.write_date, stamp)

    def test_changed_source_configuration_values_and_review_fail_closed(self):
        checkpoint = self.checkpoint()
        request, _ = self.request(checkpoint=checkpoint, values={'reference': 'Changed reference'})
        attempted = copy.deepcopy(request)
        attempted['payload']['values']['balance_start'] += 1
        with self.assertRaises(UserError):
            self.checkpoints.qorlia_checkpoint_editor_save(**attempted)
        self.journal.code = 'ALTER'
        with self.assertRaises(UserError):
            self.checkpoints.qorlia_checkpoint_editor_save(**request)
        self.assertFalse(checkpoint.reference)
        self.assertFalse(checkpoint.qorlia_checkpoint_edit_receipts)

    def test_creation_retries_reject_changed_values_or_author(self):
        entry = self.entry()
        request, _ = self.request(entries=entry)
        self.checkpoints.qorlia_checkpoint_editor_save(**request)
        changed = copy.deepcopy(request)
        changed['payload']['values']['reference'] = 'Different request'
        with self.assertRaises(ValidationError):
            self.checkpoints.qorlia_checkpoint_editor_save(**changed)
        user = self.env['res.users'].with_context(no_reset_password=True).create({'name': self.prefix,
            'login': uuid.uuid4().hex, 'groups_id': [Command.set(self.env.ref('account.group_account_user').ids)]})
        with self.assertRaises(ValidationError):
            self.checkpoints.with_user(user).qorlia_checkpoint_editor_status(**request)

    def test_invalid_payloads_nonfinite_balances_and_forged_receipts_rejected(self):
        entry = self.entry()
        for kwargs in ({'entry_ids': [True]}, {'entry_ids': [entry.id, entry.id]},
                {'entry_ids': False}, {'entry_ids': '1'}, {'checkpoint_id': True},
                {'entry_ids': entry.ids, 'split_line_id': entry.id + 1}, {}):
            with self.assertRaises(ValidationError):
                self.checkpoints.qorlia_checkpoint_editor_load(**kwargs)
        request, _ = self.request(entries=entry)
        for value in (True, False, '100', float('nan'), float('inf'), -float('inf')):
            payload = copy.deepcopy(request['payload'])
            payload['values']['balance_start'] = value
            with self.assertRaises(ValidationError):
                self.checkpoints.qorlia_checkpoint_editor_preview(payload)
        with self.assertRaises(AccessError):
            self.checkpoints.create({'qorlia_checkpoint_creation_key': str(uuid.uuid4())})
        with self.assertRaises(AccessError):
            self.checkpoints.with_context(default_qorlia_checkpoint_edit_receipts={}).create({})
        checkpoint = self.checkpoint(entry)
        with self.assertRaises(AccessError):
            checkpoint.write({'qorlia_checkpoint_edit_receipts': {}})

    def test_native_readonly_public_hidden_rows_and_foreign_company_are_denied(self):
        checkpoint = self.checkpoint()
        user = self.env['res.users'].with_context(no_reset_password=True).create({'name': self.prefix,
            'login': uuid.uuid4().hex, 'groups_id': [Command.set(self.env.ref('account.group_account_readonly').ids)]})
        with self.assertRaises(AccessError):
            self.checkpoints.with_user(user).qorlia_checkpoint_editor_load(checkpoint.id)
        with self.assertRaises(AccessError):
            self.checkpoints.with_user(self.env.ref('base.public_user')).qorlia_checkpoint_editor_load(checkpoint.id)
        other = self.env['res.company'].create({'name': self.prefix + ' foreign'})
        with self.assertRaises(AccessError):
            self.checkpoints.with_context(allowed_company_ids=[other.id]).qorlia_checkpoint_editor_load(checkpoint.id)
        writer = user.copy({'login': uuid.uuid4().hex, 'groups_id': [Command.set(self.env.ref('account.group_account_user').ids)]})
        hidden = self.entry(date='2025-01-01')
        self.env['ir.rule'].create({'name': self.prefix + ' hidden balance source',
            'model_id': self.env.ref('account.model_account_bank_statement_line').id,
            'domain_force': "[('id', '!=', %s)]" % hidden.id})
        with self.assertRaises(AccessError):
            self.checkpoints.with_user(writer).qorlia_checkpoint_editor_load(entry_ids=checkpoint.line_ids.ids)

    def test_multi_journal_selection_is_rejected(self):
        entry = self.entry()
        other = self.journal.copy({'code': uuid.uuid4().hex[:5]})
        second = self.entries.create({'journal_id': other.id, 'payment_ref': self.prefix,
            'date': '2026-03-01', 'amount': 1})
        with self.assertRaises(ValidationError):
            self.checkpoints.qorlia_checkpoint_editor_load(entry_ids=(entry | second).ids)

    def test_simulation_quarantines_callbacks_and_rolls_back_on_failure(self):
        entry = self.entry()
        callbacks = self.env.cr.postcommit
        callback = lambda: None
        callbacks.add(callback)
        count = self.checkpoints.search_count([])
        try:
            with patch.object(type(self.checkpoints), '_qorlia_checkpoint_editor_result', side_effect=UserError('Injected review failure')):
                with self.assertRaises(UserError):
                    self.checkpoints.qorlia_checkpoint_editor_load(entry_ids=entry.ids)
            self.assertIs(self.env.cr.postcommit, callbacks)
            self.assertIn(callback, callbacks._funcs)
            self.assertEqual(self.checkpoints.search_count([]), count)
            self.assertFalse(entry.statement_id)
        finally:
            callbacks._funcs.remove(callback)

    def test_context_cannot_override_native_selection_or_accounting_validation(self):
        entry = self.entry()
        for context in ({'default_line_ids': [Command.set(entry.ids)]},
                {'check_move_validity': False}, {'force_delete': True},
                {'skip_account_move_synchronization': True}, {'skip_invoice_sync': True},
                {'no_exchange_difference': True}, {'no_exchange_difference_no_recursive': True},
                {'no_cash_basis': True}):
            with self.assertRaises(ValidationError):
                self.checkpoints.with_context(**context).qorlia_checkpoint_editor_load(entry_ids=entry.ids)

    def test_unexpected_related_accounting_creation_is_detected_and_rolled_back(self):
        entry = self.entry()
        original = type(self.checkpoints).create
        before = self.env['account.analytic.line'].search_count([])
        plan = self.env['account.analytic.plan'].create({'name': self.prefix})
        analytic = self.env['account.analytic.account'].create({'name': self.prefix, 'plan_id': plan.id})

        def create_with_financial_hook(records, values):
            result = original(records, values)
            self.env['account.analytic.line'].create({'name': self.prefix, 'account_id': analytic.id,
                'move_line_id': entry.move_id.line_ids[0].id, 'amount': 1})
            return result

        with patch.object(type(self.checkpoints), 'create', create_with_financial_hook):
            with self.assertRaisesRegex(UserError, 'changed accounting'):
                self.checkpoints.qorlia_checkpoint_editor_load(entry_ids=entry.ids)
        self.assertEqual(self.env['account.analytic.line'].search_count([]), before)
        self.assertFalse(entry.statement_id)
