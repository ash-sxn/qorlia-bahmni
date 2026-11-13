# SPDX-License-Identifier: LGPL-3.0-or-later
import copy
import uuid
from datetime import timedelta
from unittest.mock import patch

from odoo import fields
from odoo.exceptions import AccessError, UserError, ValidationError
from odoo.tests import TransactionCase, tagged

from . import test_document_reports as report_tests


@tagged('post_install', '-at_install')
class InvoiceCutoffTest(TransactionCase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.customer = cls.env['res.partner'].create({'name': 'QorliaQA Reviewed Cut-Off customer'})
        cls.journal = cls.env['account.journal'].create({'name': 'QorliaQA Reviewed Cut-Off journal',
            'code': 'QCUT', 'type': 'general', 'company_id': cls.env.company.id})
        cls.accrual = cls.env['account.account'].create({'name': 'QorliaQA Reviewed Cut-Off accrual',
            'code': 'QCUTAC', 'account_type': 'asset_current', 'company_id': cls.env.company.id})
        cls.moves = cls.env['account.move']

    invoice = report_tests.DocumentReportTest.invoice
    reader = report_tests.DocumentReportTest.reader

    def request(self, invoice, line=None, **changes):
        line = line or invoice.invoice_line_ids[0]
        loaded = self.moves.qorlia_cutoff_load(invoice.id, line.id)
        active = 'revenue_accrual_account' if loaded['account_type'] == 'income' else 'expense_accrual_account'
        values = {**loaded['values'], 'date': str(fields.Date.today() - timedelta(days=1)),
            'journal_id': self.journal.id, active: self.accrual.id, 'percentage': 50,
            'total_amount': invoice.company_currency_id.round(line.balance / 2), **changes}
        reviewed = self.moves.qorlia_cutoff_preview(invoice.id, line.id, loaded['version'], values)
        return {'invoice_id': invoice.id, 'line_id': line.id, 'version': loaded['version'],
            'values': reviewed['values'], 'review_version': reviewed['review_version'], 'request_key': str(uuid.uuid4())}

    def test_preview_is_readonly_and_uses_native_generated_values(self):
        invoice = self.invoice()
        before = invoice.read(['write_date', 'state', 'amount_total', 'amount_residual'])
        defaults = self.env.company.read(
            ['automatic_entry_default_journal_id', 'revenue_accrual_account_id', 'expense_accrual_account_id'])
        counts = {name: self.env[name].search_count([]) for name in ('account.move', 'account.move.line',
            'account.automatic.entry.wizard', 'mail.message')}
        request = self.request(invoice)
        preview = self.moves.qorlia_cutoff_preview(**{name: request[name] for name in ('invoice_id', 'line_id', 'version', 'values')})
        self.assertEqual(len(preview['entries']), 2)
        self.assertEqual(preview['default_changes']['journal'][0], self.journal.id)
        self.assertEqual(preview['default_changes']['account'][0], self.accrual.id)
        self.assertEqual(preview['values']['total_amount'], -250)
        self.assertEqual(invoice.read(['write_date', 'state', 'amount_total', 'amount_residual']), before)
        self.assertEqual(self.env.company.read(list(defaults[0].keys() - {'id'})), defaults)
        self.assertEqual({name: self.env[name].search_count([]) for name in counts}, counts)

    def test_native_amount_onchange_recalculates_percentage_without_writing(self):
        invoice = self.invoice()
        line = invoice.invoice_line_ids[0]
        loaded = self.moves.qorlia_cutoff_load(invoice.id, line.id)
        result = self.moves.qorlia_cutoff_onchange(invoice.id, line.id, loaded['version'],
            {**loaded['values'], 'total_amount': -125}, 'total_amount')
        self.assertEqual(result['values']['percentage'], 25)
        self.assertEqual(result['values']['total_amount'], -125)
        result = self.moves.qorlia_cutoff_onchange(invoice.id, line.id, loaded['version'],
            {**result['values'], 'percentage': 37.5}, 'percentage')
        self.assertEqual(result['values']['total_amount'], -187.5)
        self.assertEqual(invoice.amount_total, 500)

    def test_save_posts_native_entries_and_exact_retry_cannot_duplicate(self):
        invoice = self.invoice()
        request = self.request(invoice)
        self.assertIs(self.moves.qorlia_cutoff_status(**request), False)
        count = self.moves.search_count([])
        saved = self.moves.qorlia_cutoff_save(**request)
        self.assertEqual(self.moves.search_count([]), count + 2)
        self.assertEqual({entry['state'] for entry in saved['entries']}, {'posted'})
        self.assertEqual(self.moves.qorlia_cutoff_save(**request), saved)
        self.assertEqual(self.moves.qorlia_cutoff_status(**request), saved)
        self.assertEqual(self.moves.search_count([]), count + 2)
        self.assertEqual(self.env.company.automatic_entry_default_journal_id, self.journal)
        self.assertEqual(self.env.company.revenue_accrual_account_id, self.accrual)
        self.assertEqual(invoice.amount_residual, 500)
        self.assertEqual(invoice.amount_total, 500)

    def test_future_recognition_stays_native_scheduled_draft(self):
        invoice = self.invoice()
        future = fields.Date.today() + timedelta(days=10)
        saved = self.moves.qorlia_cutoff_save(**self.request(invoice, date=str(future)))
        deferred = next(entry for entry in saved['entries'] if entry['date'] == future)
        self.assertEqual((deferred['state'], deferred['auto_post']), ('draft', 'at_date'))

    def test_reconcilable_accrual_matches_only_new_rows_and_is_disclosed(self):
        invoice = self.invoice()
        self.accrual.reconcile = True
        request = self.request(invoice)
        preview_args = {name: request[name] for name in ('invoice_id', 'line_id', 'version', 'values')}
        self.assertTrue(self.moves.qorlia_cutoff_preview(**preview_args)['reconcile_accrual_rows'])
        saved = self.moves.qorlia_cutoff_save(**request)
        entries = self.moves.browse([entry['id'] for entry in saved['entries']])
        accrual_rows = entries.line_ids.filtered(lambda row: row.account_id == self.accrual)
        self.assertEqual(len(accrual_rows), 2)
        self.assertTrue(all(accrual_rows.mapped('reconciled')))
        partials = accrual_rows.matched_debit_ids | accrual_rows.matched_credit_ids
        self.assertEqual(len(partials), 1)
        self.assertEqual(set((partials.debit_move_id | partials.credit_move_id).ids), set(accrual_rows.ids))
        self.assertFalse(invoice.line_ids.matched_debit_ids | invoice.line_ids.matched_credit_ids)
        self.assertEqual(invoice.amount_residual, 500)
        future = self.request(invoice, date=str(fields.Date.today() + timedelta(days=10)))
        self.assertFalse(self.moves.qorlia_cutoff_preview(**{
            name: future[name] for name in preview_args})['reconcile_accrual_rows'])

    def test_credit_note_preserves_positive_native_amount_and_source_matching(self):
        invoice = self.invoice(move_type='out_refund')
        line = invoice.invoice_line_ids[0]
        request = self.request(invoice)
        self.assertEqual(request['values']['total_amount'], 250)
        self.assertEqual(self.moves.qorlia_cutoff_load(invoice.id, line.id)['account_type'], 'expense')
        self.moves.qorlia_cutoff_save(**request)
        self.assertEqual(invoice.amount_residual, 500)
        self.assertEqual(self.env.company.expense_accrual_account_id, self.accrual)

    def test_recovery_does_not_require_source_to_remain_eligible(self):
        invoice = self.invoice()
        request = self.request(invoice)
        first = self.moves.qorlia_cutoff_save(**request)
        invoice.button_draft()
        with self.assertRaises(UserError):
            self.moves.qorlia_cutoff_load(invoice.id, request['line_id'])
        self.assertEqual(self.moves.qorlia_cutoff_status(**request), first)
        self.assertEqual(self.moves.qorlia_cutoff_save(**request), first)

    def test_changed_source_or_selected_configuration_requires_new_review(self):
        invoice = self.invoice()
        request = self.request(invoice)
        invoice.ref = 'QorliaQA Changed source'
        with self.assertRaisesRegex(UserError, 'changed'):
            self.moves.qorlia_cutoff_save(**request)
        request = self.request(invoice)
        self.accrual.name = 'QorliaQA Renamed after review'
        self.env.flush_all()
        with self.assertRaisesRegex(UserError, 'Review'):
            self.moves.qorlia_cutoff_save(**request)
        self.assertIs(self.moves.qorlia_cutoff_status(**request), False)

    def test_identity_access_and_company_scope_are_enforced(self):
        invoice, other = self.invoice(), self.invoice()
        line = invoice.invoice_line_ids[0]
        with self.assertRaises(ValidationError):
            self.moves.qorlia_cutoff_load(invoice.id, other.invoice_line_ids[0].id)
        reader = self.moves.with_user(self.reader())
        self.assertFalse(reader.qorlia_cutoff_load(invoice.id, line.id)['can_create'])
        loaded = reader.qorlia_cutoff_load(invoice.id, line.id)
        with self.assertRaises(AccessError):
            reader.qorlia_cutoff_preview(invoice.id, line.id, loaded['version'], loaded['values'])
        foreign = self.env['res.company'].create({'name': 'QorliaQA Foreign Cut-Off company'})
        foreign_journal = self.env['account.journal'].create({'name': 'QorliaQA Foreign Cut-Off journal',
            'code': 'QFOR', 'type': 'general', 'company_id': foreign.id})
        with self.assertRaises(ValidationError):
            self.request(invoice, journal_id=foreign_journal.id)

    def test_only_native_revenue_expense_posted_items_are_eligible(self):
        invoice = self.invoice()
        receivable = invoice.line_ids.filtered(lambda line: line.account_type == 'asset_receivable')[0]
        with self.assertRaises(UserError):
            self.moves.qorlia_cutoff_load(invoice.id, receivable.id)
        invoice.button_draft()
        with self.assertRaises(UserError):
            self.moves.qorlia_cutoff_load(invoice.id, invoice.invoice_line_ids[0].id)

    def test_invalid_fields_percentage_amount_and_date_fail_closed(self):
        invoice = self.invoice()
        loaded = self.moves.qorlia_cutoff_load(invoice.id, invoice.invoice_line_ids[0].id)
        for values in ({**loaded['values'], 'destination_account_id': self.accrual.id},
                       {**loaded['values'], 'date': '2026-99-01'},
                       {**loaded['values'], 'percentage': True},
                       {**loaded['values'], 'expense_accrual_account': self.accrual.id}):
            with self.assertRaises(ValidationError):
                self.moves.qorlia_cutoff_onchange(invoice.id, loaded['line_id'], loaded['version'], values, 'percentage')
        for changes in ({'percentage': 0}, {'percentage': 101}):
            with self.assertRaises(UserError):
                self.request(invoice, **changes)
        with self.assertRaises(ValidationError):
            self.request(invoice, total_amount=-1)
        with patch.object(type(self.env.company), '_validate_fiscalyear_lock', return_value=None):
            self.env.company.fiscalyear_lock_date = fields.Date.today()
        with self.assertRaises(ValidationError):
            self.request(invoice)

    def test_request_key_is_bound_to_author_and_exact_payload(self):
        invoice = self.invoice()
        request = self.request(invoice)
        self.moves.qorlia_cutoff_save(**request)
        changed = copy.deepcopy(request)
        changed['values']['percentage'] = 25
        with self.assertRaises(ValidationError):
            self.moves.qorlia_cutoff_status(**changed)
        with self.assertRaises(ValidationError):
            self.moves.qorlia_cutoff_status(**{**request, 'request_key': 'bad-key'})
        with self.assertRaises(ValidationError):
            self.moves.with_user(self.reader()).qorlia_cutoff_status(**request)

    def test_unexpected_native_change_rolls_back_created_entries_and_receipt(self):
        invoice = self.invoice()
        request = self.request(invoice)
        native = type(self.env['account.automatic.entry.wizard']).do_action
        count = self.moves.search_count([])
        def changed(wizard):
            action = native(wizard)
            invoice.invoice_line_ids[0].name = 'QorliaQA Unexpected source change'
            return action
        with self.assertRaisesRegex(UserError, 'source invoice'), self.env.cr.savepoint(), patch.object(
                type(self.env['account.automatic.entry.wizard']), 'do_action', changed):
            self.moves.qorlia_cutoff_save(**request)
        self.assertEqual(self.moves.search_count([]), count)
        self.assertIs(self.moves.qorlia_cutoff_status(**request), False)

    def test_review_hash_and_choice_kinds_are_not_client_controlled(self):
        invoice = self.invoice()
        request = self.request(invoice)
        with self.assertRaises(UserError):
            self.moves.qorlia_cutoff_save(**{**request, 'review_version': 'a' * 64})
        self.assertIn(self.journal.id, [item[0] for item in self.moves.qorlia_cutoff_choices(
            invoice.id, request['line_id'], 'journal', 'QorliaQA Reviewed Cut-Off')])
        with self.assertRaises(ValidationError):
            self.moves.qorlia_cutoff_choices(invoice.id, request['line_id'], 'res.users')
