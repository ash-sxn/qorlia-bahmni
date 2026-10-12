# SPDX-License-Identifier: LGPL-3.0-or-later
import uuid
from odoo import Command
from odoo.exceptions import AccessError, UserError, ValidationError
from odoo.tests import TransactionCase, tagged

from . import test_bank_statements


@tagged('post_install', '-at_install')
class BankCheckpointTest(TransactionCase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.entries = cls.env['account.bank.statement.line']
        cls.checkpoints = cls.env['account.bank.statement']
        cls.prefix = 'QorliaQA Checkpoint ' + uuid.uuid4().hex[:8]
        cls.partner = cls.env['res.partner'].create({'name': cls.prefix})
        cls.bank = cls.env['account.account'].create({'name': cls.prefix + ' bank',
            'code': 'QC' + uuid.uuid4().hex[:8], 'account_type': 'asset_cash'})
        cls.suspense = cls.env['account.account'].create({'name': cls.prefix + ' suspense',
            'code': 'QX' + uuid.uuid4().hex[:8], 'account_type': 'asset_current', 'reconcile': True})
        cls.journal = cls.env['account.journal'].create({'name': cls.prefix, 'code': uuid.uuid4().hex[:5],
            'type': 'bank', 'default_account_id': cls.bank.id, 'suspense_account_id': cls.suspense.id})

    entry = test_bank_statements.BankStatementsTest.entry

    def checkpoint(self, entries=None, **values):
        return self.checkpoints.create({'name': self.prefix,
            'line_ids': [Command.set((entries if entries is not None else self.entry()).ids)], **values})

    def test_native_checkpoint_balances_completeness_and_readonly(self):
        lines = self.entry(amount=100) | self.entry(amount=-20)
        checkpoint = self.checkpoint(lines, balance_start=50, balance_end_real=130)
        before = lines.read(['write_date', 'amount', 'statement_id', 'move_id'])
        result = self.checkpoints.qorlia_checkpoint_detail(checkpoint.id)
        row = result['checkpoint']
        self.assertEqual((row['balance_start'], row['balance_end'], row['balance_end_real']), (50, 130, 130))
        self.assertTrue(row['is_complete'])
        self.assertTrue(row['is_valid'])
        self.assertEqual([item['id'] for item in result['rows']], checkpoint.line_ids.sorted('internal_index', reverse=True).ids)
        self.assertEqual(result['total_count'], 2)
        self.assertEqual(lines.read(['write_date', 'amount', 'statement_id', 'move_id']), before)
        self.assertEqual(self.checkpoints.qorlia_checkpoint_history(self.prefix)['rows'][0]['id'], checkpoint.id)

    def test_native_invalid_continuity_and_incomplete_filters(self):
        first = self.checkpoint(self.entry(date='2026-01-01'), balance_start=0, balance_end_real=100)
        second = self.checkpoint(self.entry(date='2026-01-02'), balance_start=80, balance_end_real=180)
        second_row = self.checkpoints.qorlia_checkpoint_detail(second.id)['checkpoint']
        self.assertTrue(second_row['is_complete'])
        self.assertFalse(second_row['is_valid'])
        self.assertEqual(second_row['problem_description'], second.problem_description)
        result = self.checkpoints.qorlia_checkpoint_history(self.prefix, state='invalid')
        self.assertIn(second.id, [row['id'] for row in result['rows']])
        self.assertNotIn(first.id, [row['id'] for row in result['rows']])
        second.balance_end_real = 999
        self.assertFalse(self.checkpoints.qorlia_checkpoint_detail(second.id)['checkpoint']['is_complete'])

    def test_empty_checkpoint_keeps_false_journal_currency_and_date(self):
        checkpoint = self.checkpoint(self.entries.browse())
        result = self.checkpoints.qorlia_checkpoint_detail(checkpoint.id)
        self.assertEqual(result['rows'], [])
        self.assertEqual(result['total_count'], 0)
        self.assertFalse(result['checkpoint']['date'])
        self.assertFalse(result['checkpoint']['currency_id'])
        self.assertFalse(result['checkpoint']['journal_id'])
        self.assertFalse(result['checkpoint']['is_complete'])
        self.assertIn(checkpoint.id, [row['id'] for row in self.checkpoints.qorlia_checkpoint_history(self.prefix, state='empty')['rows']])

    def test_history_pages_and_bank_cash_journal_filters(self):
        ids = {self.checkpoint().id for _ in range(26)}
        first = self.checkpoints.qorlia_checkpoint_history(self.prefix, journal_type='bank')
        second = self.checkpoints.qorlia_checkpoint_history(self.prefix, journal_type='bank', offset=25)
        self.assertEqual(len(first['rows']), 25)
        self.assertTrue(first['has_more'])
        self.assertEqual(len(second['rows']), 1)
        self.assertFalse(second['has_more'])
        self.assertEqual({row['id'] for row in first['rows'] + second['rows']}, ids)
        self.assertFalse(self.checkpoints.qorlia_checkpoint_history(self.prefix, journal_type='cash')['rows'])

    def test_entry_pages_do_not_drop_lines_and_stale_page_is_rejected(self):
        lines = self.entries.browse()
        for index in range(101):
            lines |= self.entry(payment_ref=self.prefix + str(index))
        checkpoint = self.checkpoint(lines)
        first = self.checkpoints.qorlia_checkpoint_detail(checkpoint.id)
        self.assertEqual(len(first['rows']), 100)
        self.assertEqual(first['next_after'], first['rows'][-1]['id'])
        second = self.checkpoints.qorlia_checkpoint_detail(checkpoint.id, after=first['next_after'], version=first['version'])
        self.assertEqual(len(second['rows']), 1)
        self.assertFalse(second['next_after'])
        self.assertEqual({row['id'] for row in first['rows'] + second['rows']}, set(lines.ids))
        lines[0].payment_ref = 'Changed native label'
        with self.assertRaises(UserError):
            self.checkpoints.qorlia_checkpoint_detail(checkpoint.id, after=first['next_after'], version=first['version'])

    def test_invalid_search_identifiers_versions_and_cursors_rejected(self):
        checkpoint = self.checkpoint()
        for kwargs in ({'search': False}, {'search': 'x' * 161}, {'offset': True}, {'offset': -1},
                {'state': 'posted'}, {'journal_type': 'sale'}):
            with self.assertRaises(ValidationError):
                self.checkpoints.qorlia_checkpoint_history(**kwargs)
        for identifier in (False, True, 0, -1, '1'):
            with self.assertRaises(ValidationError):
                self.checkpoints.qorlia_checkpoint_detail(identifier)
        for kwargs in ({'after': True}, {'version': 'bad'}, {'after': checkpoint.line_ids[0].id},
                {'after': 2147483647, 'version': self.checkpoints.qorlia_checkpoint_detail(checkpoint.id)['version']}):
            with self.assertRaises(ValidationError):
                self.checkpoints.qorlia_checkpoint_detail(checkpoint.id, **kwargs)
        with self.assertRaises(UserError):
            self.checkpoints.qorlia_checkpoint_detail(2147483647)

    def test_hidden_checkpoint_entry_fails_instead_of_partial_balances(self):
        checkpoint = self.checkpoint()
        user = self.env['res.users'].with_context(no_reset_password=True).create({'name': self.prefix,
            'login': uuid.uuid4().hex, 'groups_id': [Command.set(self.env.ref('account.group_account_readonly').ids)]})
        self.env['ir.rule'].create({'name': self.prefix + ' hidden entry',
            'model_id': self.env.ref('account.model_account_bank_statement_line').id,
            'domain_force': "[('id', '!=', %s)]" % checkpoint.line_ids[0].id})
        with self.assertRaises(AccessError):
            self.checkpoints.with_user(user).qorlia_checkpoint_detail(checkpoint.id)
        with self.assertRaises(AccessError):
            self.checkpoints.with_user(user).qorlia_checkpoint_history(self.prefix)

    def test_readonly_internal_access_and_cross_company_rejection(self):
        checkpoint = self.checkpoint()
        user = self.env['res.users'].with_context(no_reset_password=True).create({'name': self.prefix,
            'login': uuid.uuid4().hex, 'groups_id': [Command.set(self.env.ref('account.group_account_readonly').ids)]})
        reader = self.checkpoints.with_user(user)
        self.assertFalse(reader.check_access_rights('write', raise_exception=False))
        self.assertEqual(reader.qorlia_checkpoint_detail(checkpoint.id)['checkpoint_id'], checkpoint.id)
        other = self.env['res.company'].create({'name': self.prefix + ' other'})
        with self.assertRaises(AccessError):
            self.checkpoints.with_context(allowed_company_ids=[other.id]).qorlia_checkpoint_detail(checkpoint.id)
        with self.assertRaises(AccessError):
            self.checkpoints.with_user(self.env.ref('base.public_user')).qorlia_checkpoint_history()

    def test_previous_balance_change_invalidates_entry_page_version(self):
        previous = self.checkpoint(self.entry(date='2026-01-01'), balance_end_real=100)
        checkpoint = self.checkpoint(self.entry(date='2026-01-02'), balance_start=100, balance_end_real=200)
        before = self.checkpoints.qorlia_checkpoint_detail(checkpoint.id)
        self.assertTrue(before['checkpoint']['is_valid'])
        previous.balance_end_real = 50
        with self.assertRaises(UserError):
            self.checkpoints.qorlia_checkpoint_detail(checkpoint.id, version=before['version'])
        self.assertFalse(self.checkpoints.qorlia_checkpoint_detail(checkpoint.id)['checkpoint']['is_valid'])

    def test_hidden_previous_checkpoint_does_not_make_continuity_valid(self):
        previous = self.checkpoint(self.entry(date='2026-01-01'), balance_end_real=100)
        checkpoint = self.checkpoint(self.entry(date='2026-01-02'), balance_start=80, balance_end_real=180)
        user = self.env['res.users'].with_context(no_reset_password=True).create({'name': self.prefix,
            'login': uuid.uuid4().hex, 'groups_id': [Command.set(self.env.ref('account.group_account_readonly').ids)]})
        self.env['ir.rule'].create({'name': self.prefix + ' hidden predecessor',
            'model_id': self.env.ref('account.model_account_bank_statement').id,
            'domain_force': "[('id', '!=', %s)]" % previous.id})
        with self.assertRaises(AccessError):
            self.checkpoints.with_user(user).qorlia_checkpoint_detail(checkpoint.id)

    def test_analysis_native_monthly_balances_count_and_inclusive_dates(self):
        first = self.checkpoint(self.entry(date='2026-01-03', amount=100), balance_start=50, balance_end_real=150)
        second = self.checkpoint(self.entry(date='2026-01-20', amount=20), balance_start=150, balance_end_real=170)
        third = self.checkpoint(self.entry(date='2026-02-10', amount=-10), balance_start=170, balance_end_real=160)
        before = (first | second | third).read(['write_date', 'balance_start', 'balance_end', 'balance_end_real'])
        result = self.checkpoints.qorlia_checkpoint_analysis(self.prefix)
        self.assertEqual(result['total_count'], 3)
        self.assertEqual(len(result['rows']), 2)
        january, february = result['rows']
        self.assertEqual(january['period_from'], '2026-01-01')
        self.assertEqual(january['period_to'], '2026-02-01')
        self.assertEqual((january['count'], january['balance_start'], january['balance_end'], january['balance_end_real']), (2, 200, 320, 320))
        self.assertEqual(february['count'], 1)
        self.assertEqual(self.checkpoints.qorlia_checkpoint_analysis(self.prefix, date_from='2026-02-10', date_to='2026-02-10')['total_count'], 1)
        self.assertEqual((first | second | third).read(['write_date', 'balance_start', 'balance_end', 'balance_end_real']), before)

    def test_analysis_all_native_date_granularities_and_journal_only(self):
        self.checkpoint(self.entry(date='2026-02-10'))
        for period in ('day', 'week', 'month', 'quarter', 'year', 'journal'):
            result = self.checkpoints.qorlia_checkpoint_analysis(self.prefix, period=period)
            self.assertEqual(result['period'], period)
            self.assertEqual(result['total_count'], 1)
            self.assertEqual(result['rows'][0]['journal_id'][0], self.journal.id)
            self.assertEqual(result['rows'][0]['currency_id'][0], self.env.company.currency_id.id)
            self.assertEqual(bool(result['rows'][0]['period_from']), period != 'journal')

    def test_analysis_empty_and_status_filters_do_not_invent_currency_or_sample_data(self):
        empty = self.checkpoint(self.entries.browse())
        result = self.checkpoints.qorlia_checkpoint_analysis(self.prefix, state='empty')
        self.assertEqual(result['total_count'], 1)
        row = result['rows'][0]
        self.assertFalse(row['journal_id'])
        self.assertFalse(row['currency_id'])
        self.assertFalse(row['period_from'])
        self.assertEqual(row['period_label'], 'No posted date')
        self.assertFalse(self.checkpoints.qorlia_checkpoint_analysis('No matching ' + self.prefix)['rows'])
        self.assertEqual(self.checkpoints.qorlia_checkpoint_analysis(self.prefix, state='invalid')['total_count'], 1)
        self.assertEqual(empty.balance_start, row['balance_start'])

    def test_analysis_rejects_invalid_grouping_calendar_dates_and_filters(self):
        for kwargs in ({'period': False}, {'period': 'partner_id'}, {'period': 'date:month'},
                {'date_from': True}, {'date_from': '2026-02-30'}, {'date_to': '2026-2-1'},
                {'date_from': '2026-03-01', 'date_to': '2026-02-01'}, {'search': False},
                {'state': 'posted'}, {'journal_type': 'sale'}):
            with self.assertRaises(ValidationError):
                self.checkpoints.qorlia_checkpoint_analysis(**kwargs)

    def test_analysis_readonly_and_hidden_entry_prevent_partial_balances(self):
        checkpoint = self.checkpoint()
        user = self.env['res.users'].with_context(no_reset_password=True).create({'name': self.prefix,
            'login': uuid.uuid4().hex, 'groups_id': [Command.set(self.env.ref('account.group_account_readonly').ids)]})
        reader = self.checkpoints.with_user(user)
        self.assertFalse(reader.check_access_rights('write', raise_exception=False))
        self.assertEqual(reader.qorlia_checkpoint_analysis(self.prefix)['total_count'], 1)
        with self.assertRaises(AccessError):
            self.checkpoints.with_user(self.env.ref('base.public_user')).qorlia_checkpoint_analysis()
        self.env['ir.rule'].create({'name': self.prefix + ' hide analysis entry',
            'model_id': self.env.ref('account.model_account_bank_statement_line').id,
            'domain_force': "[('id', '!=', %s)]" % checkpoint.line_ids[0].id})
        with self.assertRaises(AccessError):
            reader.qorlia_checkpoint_analysis(self.prefix)

    def test_analysis_keeps_journals_currencies_and_inactive_companies_separate(self):
        self.checkpoint(self.entry(amount=100))
        foreign = self.env.ref('base.USD')
        if foreign == self.env.company.currency_id:
            foreign = self.env.ref('base.EUR')
        foreign.active = True
        journal = self.env['account.journal'].create({'name': self.prefix + ' foreign',
            'code': uuid.uuid4().hex[:5], 'type': 'cash', 'currency_id': foreign.id,
            'default_account_id': self.bank.id, 'suspense_account_id': self.suspense.id})
        self.checkpoint(self.entry(journal_id=journal.id, amount=25))
        rows = self.checkpoints.qorlia_checkpoint_analysis(self.prefix, period='journal')['rows']
        self.assertEqual(len(rows), 2)
        self.assertEqual({row['journal_id'][0] for row in rows}, {self.journal.id, journal.id})
        self.assertEqual({row['currency_id'][0] for row in rows}, {foreign.id, self.env.company.currency_id.id})
        self.assertEqual(self.checkpoints.qorlia_checkpoint_analysis(self.prefix, journal_type='cash')['total_count'], 1)
        other = self.env['res.company'].create({'name': self.prefix + ' other'})
        self.assertFalse(self.checkpoints.with_context(allowed_company_ids=[other.id]).qorlia_checkpoint_analysis(self.prefix)['rows'])
