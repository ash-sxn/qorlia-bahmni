# SPDX-License-Identifier: LGPL-3.0-or-later
import uuid
from odoo import Command, fields
from odoo.exceptions import AccessError, UserError, ValidationError
from odoo.tests import TransactionCase, tagged


@tagged('post_install', '-at_install')
class BankStatementsTest(TransactionCase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.entries = cls.env['account.bank.statement.line']
        cls.prefix = 'QorliaQA Bank ' + uuid.uuid4().hex[:8]
        cls.partner = cls.env['res.partner'].create({'name': cls.prefix})
        cls.bank = cls.env['account.account'].create({'name': cls.prefix + ' cash',
            'code': 'QB' + uuid.uuid4().hex[:8], 'account_type': 'asset_cash'})
        cls.suspense = cls.env['account.account'].create({'name': cls.prefix + ' suspense',
            'code': 'QS' + uuid.uuid4().hex[:8], 'account_type': 'asset_current', 'reconcile': True})
        cls.journal = cls.env['account.journal'].create({'name': cls.prefix, 'code': uuid.uuid4().hex[:5],
            'type': 'bank', 'default_account_id': cls.bank.id, 'suspense_account_id': cls.suspense.id})

    def entry(self, **values):
        return self.entries.create({'journal_id': self.journal.id, 'date': fields.Date.today(),
            'payment_ref': self.prefix, 'amount': 100, 'partner_id': self.partner.id, **values})

    def candidate(self, posted=True):
        receivable = self.env['account.account'].search([('company_id', '=', self.env.company.id),
            ('account_type', '=', 'asset_receivable')], limit=1)
        income = self.env['account.account'].search([('company_id', '=', self.env.company.id),
            ('account_type', '=', 'income')], limit=1)
        move = self.env['account.move'].create({'move_type': 'entry', 'ref': self.prefix,
            'line_ids': [Command.create({'name': self.prefix, 'account_id': receivable.id,
                'partner_id': self.partner.id, 'debit': 100}),
                Command.create({'name': self.prefix, 'account_id': income.id, 'credit': 100})]})
        if posted:
            move.action_post()
        return move.line_ids.filtered(lambda line: line.account_id == receivable)

    def test_history_detail_are_native_readonly_and_separate_currencies(self):
        entry = self.entry()
        before = entry.move_id.line_ids.read(['write_date', 'debit', 'credit', 'amount_residual'])
        result = self.entries.qorlia_bank_history(self.prefix)
        self.assertEqual(result['rows'][0]['id'], entry.id)
        detail = self.entries.qorlia_bank_detail(entry.id)
        self.assertEqual(detail['total_count'], 2)
        self.assertTrue(detail['balanced'])
        self.assertEqual({row['kind'] for row in detail['rows']}, {'liquidity', 'suspense'})
        self.assertEqual(detail['company_currency'][0], self.env.company.currency_id.id)
        self.assertEqual(detail['entry']['currency_id'][0], entry.currency_id.id)
        self.assertEqual(entry.move_id.line_ids.read(['write_date', 'debit', 'credit', 'amount_residual']), before)

    def test_invalid_ids_search_page_and_state_rejected(self):
        for identifier in (False, True, 0, -1, '1'):
            with self.assertRaises(ValidationError):
                self.entries.qorlia_bank_detail(identifier)
        with self.assertRaises(UserError):
            self.entries.qorlia_bank_detail(2147483647)
        for kwargs in ({'search': False}, {'search': 'x' * 161}, {'offset': True}, {'offset': -1}, {'state': 'posted'}):
            with self.assertRaises(ValidationError):
                self.entries.qorlia_bank_history(**kwargs)

    def test_unmatched_history_pagination_does_not_drop_sentinel(self):
        entries = self.entries.browse()
        for index in range(26):
            entries |= self.entry(payment_ref=self.prefix + str(index))
        page = self.entries.qorlia_bank_history(self.prefix, state='unmatched')
        self.assertEqual(len(page['rows']), 25)
        self.assertTrue(page['has_more'])
        next_page = self.entries.qorlia_bank_history(self.prefix, state='unmatched', offset=25)
        self.assertEqual(len(next_page['rows']), 1)
        self.assertFalse(next_page['has_more'])
        self.assertFalse(self.entries.qorlia_bank_history(self.prefix, state='matched')['rows'])

    def test_changed_entry_or_invalid_cursor_rejects_candidates_and_detail(self):
        entry = self.entry()
        original = self.entries.qorlia_bank_detail(entry.id)
        for kwargs in ({'after': True}, {'after': entry.move_id.line_ids[0].id}, {'version': 'invalid'}):
            with self.assertRaises(ValidationError):
                self.entries.qorlia_bank_detail(entry.id, **kwargs)
        with self.assertRaises(ValidationError):
            self.entries.qorlia_bank_detail(entry.id, after=2147483647, version=original['version'])
        entry.payment_ref = self.prefix + ' changed'
        with self.assertRaises(UserError):
            self.entries.qorlia_bank_detail(entry.id, version=original['version'])
        with self.assertRaises(UserError):
            self.entries.qorlia_bank_candidates(entry.id, original['version'])

    def test_candidates_use_native_domain_excluding_own_move_and_drafts(self):
        entry = self.entry()
        posted = self.candidate()
        draft = self.candidate(posted=False)
        version = self.entries.qorlia_bank_detail(entry.id)['version']
        result = self.entries.qorlia_bank_candidates(entry.id, version, search=self.prefix)
        ids = [row['id'] for row in result['rows']]
        self.assertIn(posted.id, ids)
        self.assertNotIn(draft.id, ids)
        self.assertFalse(set(entry.move_id.line_ids.ids) & set(ids))
        self.assertEqual(result['version'], version)
        self.assertTrue(all(not row['reconciled'] for row in result['rows']))

    def test_denied_ledger_item_fails_instead_of_reporting_partial_totals(self):
        entry = self.entry()
        user = self.env['res.users'].with_context(no_reset_password=True).create({
            'name': self.prefix + ' reader', 'login': uuid.uuid4().hex,
            'groups_id': [Command.set(self.env.ref('account.group_account_readonly').ids)]})
        denied = entry.move_id.line_ids[0]
        self.env['ir.rule'].create({'name': self.prefix + ' hide item',
            'model_id': self.env.ref('account.model_account_move_line').id,
            'domain_force': "[('id', '!=', %s)]" % denied.id})
        with self.assertRaises(AccessError):
            self.entries.with_user(user).qorlia_bank_detail(entry.id)

    def test_native_readonly_account_can_read_without_write_access(self):
        entry = self.entry()
        user = self.env['res.users'].with_context(no_reset_password=True).create({
            'name': self.prefix + ' reader', 'login': uuid.uuid4().hex,
            'groups_id': [Command.set(self.env.ref('account.group_account_readonly').ids)]})
        reader = self.entries.with_user(user)
        self.assertFalse(reader.check_access_rights('write', raise_exception=False))
        self.assertEqual(reader.qorlia_bank_detail(entry.id)['statement_line_id'], entry.id)
        self.assertEqual(reader.qorlia_bank_history(self.prefix)['rows'][0]['id'], entry.id)

    def test_candidate_pagination_keeps_all_native_rows(self):
        entry = self.entry()
        ids = {self.candidate().id for _ in range(26)}
        version = self.entries.qorlia_bank_detail(entry.id)['version']
        first = self.entries.qorlia_bank_candidates(entry.id, version, search=self.prefix)
        second = self.entries.qorlia_bank_candidates(entry.id, version, search=self.prefix, offset=25)
        self.assertEqual(len(first['rows']), 25)
        self.assertTrue(first['has_more'])
        self.assertEqual(len(second['rows']), 1)
        self.assertFalse(second['has_more'])
        self.assertEqual({row['id'] for row in first['rows'] + second['rows']}, ids)
        for invalid in (False, True, 'bad', 'X' * 64):
            with self.assertRaises(ValidationError):
                self.entries.qorlia_bank_candidates(entry.id, invalid)

    def test_foreign_journal_and_transaction_currencies_keep_native_values(self):
        foreign = self.env.ref('base.USD')
        if foreign == self.env.company.currency_id:
            foreign = self.env.ref('base.EUR')
        foreign.active = True
        self.journal.currency_id = foreign
        entry = self.entry(foreign_currency_id=self.env.company.currency_id.id, amount_currency=8500)
        detail = self.entries.qorlia_bank_detail(entry.id)
        self.assertEqual(detail['entry']['currency_id'][0], foreign.id)
        self.assertEqual(detail['entry']['foreign_currency_id'][0], self.env.company.currency_id.id)
        self.assertEqual(detail['entry']['amount_currency'], 8500)
        self.assertEqual(detail['company_currency'][0], self.env.company.currency_id.id)
        self.assertEqual(detail['debit'], sum(entry.move_id.line_ids.mapped('debit')))
        self.assertEqual(detail['credit'], sum(entry.move_id.line_ids.mapped('credit')))
        self.assertTrue(detail['balanced'])

    def test_inactive_company_entry_is_not_exposed(self):
        entry = self.entry()
        company = self.env['res.company'].create({'name': self.prefix + ' other'})
        user = self.env['res.users'].with_context(no_reset_password=True).create({
            'name': self.prefix + ' multico', 'login': uuid.uuid4().hex,
            'company_ids': [Command.set([self.env.company.id, company.id])],
            'company_id': company.id,
            'groups_id': [Command.set(self.env.ref('account.group_account_readonly').ids)]})
        reader = self.entries.with_user(user).with_context(allowed_company_ids=[company.id])
        with self.assertRaises(AccessError):
            reader.qorlia_bank_detail(entry.id)
        self.assertFalse(reader.qorlia_bank_history(self.prefix)['rows'])

    def test_full_ledger_totals_and_versioned_cursor_keep_every_row(self):
        entry = self.entry()
        commands = []
        for index in range(50):
            commands.extend([Command.create({'name': self.prefix + str(index),
                'account_id': self.suspense.id, 'debit': 1}),
                Command.create({'name': self.prefix + str(index),
                'account_id': self.suspense.id, 'credit': 1})])
        entry.move_id.with_context(skip_account_move_synchronization=True).write({'line_ids': commands})
        detail = self.entries.qorlia_bank_detail(entry.id)
        self.assertEqual(detail['total_count'], 102)
        self.assertEqual(len(detail['rows']), 100)
        self.assertEqual(detail['debit'], 150)
        self.assertEqual(detail['credit'], 150)
        next_page = self.entries.qorlia_bank_detail(entry.id, after=detail['next_after'], version=detail['version'])
        self.assertEqual(len(next_page['rows']), 2)
        self.assertFalse(next_page['next_after'])
        self.assertEqual(next_page['version'], detail['version'])
        self.assertEqual({row['id'] for row in detail['rows'] + next_page['rows']}, set(entry.move_id.line_ids.ids))

    def test_record_rules_and_noninternal_account_block_entry(self):
        entry = self.entry()
        user = self.env['res.users'].with_context(no_reset_password=True).create({
            'name': self.prefix + ' reader', 'login': uuid.uuid4().hex,
            'groups_id': [Command.set(self.env.ref('account.group_account_readonly').ids)]})
        self.env['ir.rule'].create({'name': self.prefix + ' hide entry',
            'model_id': self.env.ref('account.model_account_bank_statement_line').id,
            'domain_force': "[('id', '!=', %s)]" % entry.id})
        with self.assertRaises(AccessError):
            self.entries.with_user(user).qorlia_bank_detail(entry.id)
        self.assertFalse(self.entries.with_user(user).qorlia_bank_history(self.prefix)['rows'])
        with self.assertRaises(AccessError):
            self.entries.with_user(self.env.ref('base.public_user')).qorlia_bank_history()
