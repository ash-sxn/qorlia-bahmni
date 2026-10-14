# SPDX-License-Identifier: LGPL-3.0-or-later
import copy
import uuid
from datetime import date
from unittest.mock import patch

from odoo import Command
from odoo.exceptions import AccessError, UserError, ValidationError
from odoo.tests import TransactionCase, tagged
from . import test_document_reports as report_tests


@tagged('post_install', '-at_install')
class InvoiceJournalEditTest(TransactionCase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.customer = cls.env['res.partner'].create({'name': 'QorliaQA Journal edit customer'})
        cls.moves = cls.env['account.move']

    invoice = report_tests.DocumentReportTest.invoice
    reader = report_tests.DocumentReportTest.reader

    def draft(self):
        invoice = self.invoice()
        invoice.button_draft()
        return invoice

    def request(self, invoice, line=False, **values):
        line = line or invoice.invoice_line_ids[0]
        loaded = self.moves.qorlia_journal_edit_load(invoice.id, line.id)
        data = {**loaded['values'], **values}
        preview = self.moves.qorlia_journal_edit_preview(invoice.id, line.id, loaded['version'], data)
        return {'invoice_id': invoice.id, 'line_id': line.id, 'version': loaded['version'],
                'values': data, 'review_version': preview['review_version'], 'request_key': str(uuid.uuid4())}

    def test_preview_is_read_only_and_save_preserves_native_money_and_state(self):
        invoice = self.draft()
        before = invoice.read(['write_date', 'state', 'amount_total', 'amount_tax', 'amount_residual'])
        ledger = invoice.line_ids.read(['id', 'debit', 'credit', 'amount_currency'])
        counts = {model: self.env[model].search_count([]) for model in
                  ('account.move', 'account.move.line', 'account.payment', 'stock.move')}
        request = self.request(invoice, name='QorliaQA Renamed consultation')
        self.assertEqual(invoice.read(['write_date', 'state', 'amount_total', 'amount_tax', 'amount_residual']), before)
        self.assertIs(self.moves.qorlia_journal_edit_status(**request), False)
        saved = self.moves.qorlia_journal_edit_save(**request)
        self.assertEqual(saved['values']['name'], request['values']['name'])
        self.assertEqual(invoice.state, 'draft')
        self.assertEqual(invoice.line_ids.read(['id', 'debit', 'credit', 'amount_currency']), ledger)
        self.assertEqual({model: self.env[model].search_count([]) for model in counts}, counts)
        self.assertTrue(self.moves.qorlia_journal_edit_status(**request))

    def test_exact_retry_is_idempotent_and_key_cannot_be_reused_for_changed_request(self):
        invoice = self.draft()
        request = self.request(invoice, name='QorliaQA Exact journal retry')
        first = self.moves.qorlia_journal_edit_save(**request)
        self.env.flush_all()
        stamp = invoice.write_date
        self.assertEqual(self.moves.qorlia_journal_edit_save(**request), first)
        self.assertEqual(invoice.write_date, stamp)
        altered = copy.deepcopy(request)
        altered['values']['name'] = 'QorliaQA Different text'
        with self.assertRaises(ValidationError):
            self.moves.qorlia_journal_edit_save(**altered)
        invoice.action_post()
        self.assertEqual(self.moves.qorlia_journal_edit_save(**request)['state'], 'posted')
        self.assertTrue(self.moves.qorlia_journal_edit_status(**request))

    def test_account_choices_are_native_company_scoped_and_save_native_reclassification(self):
        invoice = self.draft()
        account = self.env['account.account'].create({'name': 'QorliaQA Journal alternate income',
            'code': 'QJEDIT', 'account_type': 'income', 'company_id': invoice.company_id.id})
        line = invoice.invoice_line_ids[0]
        choices = self.moves.qorlia_journal_edit_choices(invoice.id, line.id, 'account', 'QorliaQA Journal alternate')
        self.assertIn((account.id, account.display_name), choices)
        saved = self.moves.qorlia_journal_edit_save(**self.request(invoice, account_id=account.id))
        self.assertEqual(saved['account'][0], account.id)
        self.assertEqual(line.account_id, account)
        self.assertEqual(invoice.amount_total, 500)
        self.assertFalse(invoice._get_unbalanced_moves({'records': invoice}))

    def test_receivable_due_date_and_early_discount_details_remain_native(self):
        invoice = self.draft()
        line = invoice.line_ids.filtered(lambda item: item.account_type == 'asset_receivable')[0]
        saved = self.moves.qorlia_journal_edit_save(**self.request(invoice, line,
            date_maturity='2026-12-31', discount_date='2026-11-30', discount_amount_currency=10))
        self.assertEqual(saved['values']['date_maturity'], '2026-12-31')
        self.assertEqual(saved['values']['discount_date'], '2026-11-30')
        self.assertEqual(saved['values']['discount_amount_currency'], 10)
        self.assertEqual(invoice.amount_total, 500)

    def test_readonly_cross_invoice_and_denied_line_requests_fail(self):
        posted = self.invoice()
        invoice = self.draft()
        reader = self.reader()
        read_only = self.moves.with_user(reader)
        self.assertFalse(read_only.qorlia_journal_edit_load(posted.id, posted.invoice_line_ids[0].id)['can_edit'])
        loaded = read_only.qorlia_journal_edit_load(invoice.id, invoice.invoice_line_ids[0].id)
        self.assertFalse(loaded['can_edit'])
        with self.assertRaises(AccessError):
            read_only.qorlia_journal_edit_preview(invoice.id, invoice.invoice_line_ids[0].id,
                loaded['version'], {**loaded['values'], 'name': 'Denied'})
        with self.assertRaises(ValidationError):
            self.moves.qorlia_journal_edit_load(invoice.id, posted.invoice_line_ids[0].id)
        self.env['ir.rule'].create({'name': 'QorliaQA Journal edit denied item',
            'model_id': self.env.ref('account.model_account_move_line').id,
            'domain_force': repr([('id', '!=', invoice.line_ids[0].id)])})
        with self.assertRaises(AccessError):
            read_only.qorlia_journal_edit_load(invoice.id, invoice.invoice_line_ids[0].id)

    def test_posted_invoice_and_credit_metadata_preserve_state_money_and_exact_retry(self):
        for move_type in ('out_invoice', 'out_refund'):
            invoice = self.invoice()
            if move_type == 'out_refund':
                invoice = invoice.copy({'move_type': move_type})
                invoice.action_post()
            before = invoice.read(['state', 'amount_total', 'amount_tax', 'amount_residual', 'payment_state'])
            ledger = invoice.line_ids.read(['id', 'debit', 'credit', 'amount_currency', 'amount_residual'])
            request = self.request(invoice, name='QorliaQA Posted reviewed label')
            self.assertEqual(invoice.read(['state', 'amount_total', 'amount_tax', 'amount_residual', 'payment_state']), before)
            saved = self.moves.qorlia_journal_edit_save(**request)
            self.assertEqual(saved['state'], 'posted')
            self.assertEqual(saved['values']['name'], request['values']['name'])
            self.assertEqual(invoice.read(['state', 'amount_total', 'amount_tax', 'amount_residual', 'payment_state']), before)
            self.assertEqual(invoice.line_ids.read(['id', 'debit', 'credit', 'amount_currency', 'amount_residual']), ledger)
            self.assertEqual(self.moves.qorlia_journal_edit_save(**request), saved)
            self.assertTrue(self.moves.qorlia_journal_edit_status(**request))

    def test_posted_reclassification_keeps_native_fiscal_lock_and_review_staleness(self):
        invoice = self.invoice()
        line = invoice.invoice_line_ids[0]
        original_account = line.account_id
        account = self.env['account.account'].create({'name': 'QorliaQA Posted alternate income',
            'code': 'QPOSTLOCK', 'account_type': 'income', 'company_id': invoice.company_id.id})
        request = self.request(invoice, account_id=account.id)
        # Seed a pre-existing lock despite unrelated staging drafts; the actual line-write guard stays native.
        with patch.object(type(invoice.company_id), '_validate_fiscalyear_lock', return_value=None):
            invoice.company_id.fiscalyear_lock_date = max(invoice.date, date.today())
        with self.assertRaisesRegex(UserError, 'changed'):
            self.moves.qorlia_journal_edit_save(**request)
        locked_request = self.request(invoice, account_id=account.id)
        with self.assertRaises(UserError), self.env.cr.savepoint():
            self.moves.qorlia_journal_edit_save(**locked_request)
        self.assertEqual(line.account_id, original_account)
        self.assertIs(self.moves.qorlia_journal_edit_status(**locked_request), False)

    def test_posted_hashed_journal_keeps_native_integrity_protection(self):
        invoice = self.draft()
        invoice.journal_id.restrict_mode_hash_table = True
        invoice.action_post()
        self.assertTrue(invoice.inalterable_hash)
        line = invoice.invoice_line_ids[0]
        original_account = line.account_id
        account = self.env['account.account'].create({'name': 'QorliaQA Hashed alternate income',
            'code': 'QPOSTHASH', 'account_type': 'income', 'company_id': invoice.company_id.id})
        request = self.request(invoice, account_id=account.id)
        with self.assertRaisesRegex(UserError, 'hashed'), self.env.cr.savepoint():
            self.moves.qorlia_journal_edit_save(**request)
        self.assertEqual(line.account_id, original_account)
        self.assertTrue(invoice.inalterable_hash)
        self.assertIs(self.moves.qorlia_journal_edit_status(**request), False)

    def test_paid_posted_label_preserves_reconciliation_and_rejects_account_change(self):
        invoice = self.invoice()
        credit = invoice.copy({'move_type': 'out_refund'})
        credit.action_post()
        terms = (invoice | credit).line_ids.filtered(lambda line: line.account_type == 'asset_receivable')
        terms.reconcile()
        names = ['id', 'amount_residual', 'amount_residual_currency', 'reconciled',
                 'matched_debit_ids', 'matched_credit_ids', 'full_reconcile_id']
        before = terms.read(names)
        self.moves.qorlia_journal_edit_save(**self.request(invoice, name='QorliaQA Paid posted label'))
        self.assertEqual(terms.read(names), before)
        line = invoice.line_ids.filtered(lambda item: item.account_type == 'asset_receivable')[0]
        account = self.env['account.account'].create({'name': 'QorliaQA Alternate receivable',
            'code': 'QPOSTRECV', 'account_type': 'asset_receivable', 'reconcile': True,
            'company_id': invoice.company_id.id})
        request = self.request(invoice, line, account_id=account.id)
        with self.assertRaises(UserError), self.env.cr.savepoint():
            self.moves.qorlia_journal_edit_save(**request)
        self.assertEqual(terms.read(names), before)

    def test_cancelled_journal_is_readonly_and_posted_transition_invalidates_review(self):
        invoice = self.draft()
        request = self.request(invoice, name='QorliaQA Before posting')
        invoice.action_post()
        with self.assertRaisesRegex(UserError, 'changed'):
            self.moves.qorlia_journal_edit_save(**request)
        invoice.button_draft()
        invoice.button_cancel()
        loaded = self.moves.qorlia_journal_edit_load(invoice.id, invoice.invoice_line_ids[0].id)
        self.assertEqual(loaded['state'], 'cancel')
        self.assertFalse(loaded['can_edit'])
        with self.assertRaises(UserError):
            self.request(invoice, name='QorliaQA Cancelled cannot edit')

    def test_transaction_currency_is_distinct_from_company_currency(self):
        invoice = self.draft()
        currency = self.env.ref('base.USD')
        currency.active = True
        invoice.currency_id = currency
        line = invoice.line_ids.filtered(lambda item: item.account_type == 'asset_receivable')[0]
        saved = self.moves.qorlia_journal_edit_save(**self.request(invoice, line,
            discount_date='2026-11-30', discount_amount_currency=10))
        self.assertEqual(saved['transaction_currency'], [currency.id, currency.name])
        self.assertEqual(saved['currency'], [invoice.company_currency_id.id, invoice.company_currency_id.name])
        self.assertEqual(saved['values']['discount_amount_currency'], 10)

    def test_stale_review_and_unsupported_monetary_or_context_fields_are_rejected(self):
        invoice = self.draft()
        request = self.request(invoice, name='QorliaQA Stale journal review')
        invoice.invoice_line_ids[0].name = 'QorliaQA Other writer'
        with self.assertRaises(UserError):
            self.moves.qorlia_journal_edit_save(**request)
        loaded = self.moves.qorlia_journal_edit_load(invoice.id, invoice.invoice_line_ids[0].id)
        for field in ('debit', 'credit', 'amount_currency', 'move_id', 'context'):
            with self.assertRaises(ValidationError):
                self.moves.qorlia_journal_edit_preview(invoice.id, loaded['line_id'], loaded['version'],
                    {**loaded['values'], field: 100})

    def test_invalid_dates_accounts_grids_distribution_and_keys_are_rejected(self):
        invoice = self.draft()
        loaded = self.moves.qorlia_journal_edit_load(invoice.id, invoice.invoice_line_ids[0].id)
        receivable = invoice.line_ids.filtered(lambda line: line.account_type == 'asset_receivable')[0].account_id
        bad = ({'date_maturity': '2026-02-31'}, {'discount_date': 'not a date'},
               {'discount_amount_currency': -1}, {'account_id': receivable.id},
               {'account_id': True}, {'analytic_distribution': {'0': 100}})
        for values in bad:
            with self.assertRaises(ValidationError):
                self.moves.qorlia_journal_edit_preview(invoice.id, loaded['line_id'], loaded['version'],
                    {**loaded['values'], **values})
        request = self.request(invoice, name='QorliaQA Key validation')
        with self.assertRaises(ValidationError):
            self.moves.qorlia_journal_edit_save(**{**request, 'request_key': 'invalid'})
        with self.assertRaises(UserError):
            self.moves.qorlia_journal_edit_save(**{**request, 'review_version': 'x' * 64})

    def test_native_analytic_permission_and_country_tax_grid_validation(self):
        self.env.user.groups_id |= self.env.ref('analytic.group_analytic_accounting')
        invoice = self.draft()
        plan = self.env['account.analytic.plan'].create({'name': 'QorliaQA Journal plan'})
        analytic = self.env['account.analytic.account'].create({'name': 'QorliaQA Journal analytic',
            'plan_id': plan.id, 'company_id': invoice.company_id.id})
        tag = self.env['account.account.tag'].create({'name': 'QorliaQA Journal tax grid', 'applicability': 'taxes'})
        request = self.request(invoice, analytic_distribution={str(analytic.id): 100}, tax_tag_ids=tag.ids)
        saved = self.moves.qorlia_journal_edit_save(**request)
        self.assertEqual(saved['values']['analytic_distribution'], {str(analytic.id): 100})
        self.assertEqual(saved['values']['tax_tag_ids'], tag.ids)
        reader = self.reader()
        reader.groups_id -= self.env.ref('analytic.group_analytic_accounting')
        self.assertIs(self.moves.with_user(reader).qorlia_journal_edit_load(invoice.id, request['line_id'])['values']['analytic_distribution'], False)
        with self.assertRaises(AccessError):
            self.moves.with_user(reader).qorlia_journal_edit_choices(invoice.id, request['line_id'], 'analytic')
        wrong = self.env['account.account.tag'].create({'name': 'QorliaQA Not tax grid', 'applicability': 'accounts'})
        with self.assertRaises(ValidationError):
            self.request(invoice, tax_tag_ids=wrong.ids)

    def test_generated_adjustments_are_not_arbitrary_editable_journal_rows(self):
        invoice = self.draft()
        line = invoice.invoice_line_ids[0]
        line.qorlia_adjustment_kind = 'discount'
        self.assertFalse(self.moves.qorlia_journal_edit_load(invoice.id, line.id)['can_edit'])
        with self.assertRaises(UserError):
            self.request(invoice, line, name='QorliaQA Generated row')

    def test_native_monetary_side_effect_rolls_back_instead_of_silently_charging_patient(self):
        invoice = self.draft()
        line = invoice.invoice_line_ids[0]
        request = self.request(invoice, name='QorliaQA Must roll back')
        original = type(invoice).write
        def monetary_side_effect(record, values):
            result = original(record, values)
            if 'line_ids' in values:
                original(record, {'invoice_line_ids': [Command.update(line.id, {'price_unit': 999})]})
            return result
        with self.assertRaises(UserError), self.env.cr.savepoint(), patch.object(type(invoice), 'write', monetary_side_effect):
            self.moves.qorlia_journal_edit_save(**request)
        invoice.invalidate_recordset()
        line.invalidate_recordset()
        self.assertEqual(invoice.amount_total, 500)
        self.assertNotEqual(line.name, request['values']['name'])
        self.assertFalse(invoice.qorlia_journal_receipts)

    def test_due_date_change_invalidates_review_even_with_fixed_transaction_timestamp(self):
        invoice = self.draft()
        request = self.request(invoice, name='QorliaQA Date-sensitive review')
        invoice.line_ids.filtered(lambda line: line.account_type == 'asset_receivable').date_maturity = '2026-12-31'
        with self.assertRaises(UserError):
            self.moves.qorlia_journal_edit_save(**request)

    def test_changed_candidate_account_label_invalidates_review(self):
        invoice = self.draft()
        account = self.env['account.account'].create({'name': 'QorliaQA Candidate income',
            'code': 'QJCAND', 'account_type': 'income', 'company_id': invoice.company_id.id})
        request = self.request(invoice, account_id=account.id)
        account.name = 'QorliaQA Changed candidate income'
        with self.assertRaises(UserError):
            self.moves.qorlia_journal_edit_save(**request)

    def analytic(self, invoice, name, applicability='optional', parent=False):
        plan = self.env['account.analytic.plan'].create({'name': 'QorliaQA ' + name,
            'default_applicability': applicability, 'company_id': invoice.company_id.id,
            'parent_id': parent.id if parent else False})
        account = self.env['account.analytic.account'].create({'name': 'QorliaQA ' + name,
            'plan_id': plan.id, 'company_id': invoice.company_id.id})
        return plan, account

    def test_analytic_plans_and_search_use_native_applicability_and_root_plan(self):
        self.env.user.groups_id |= self.env.ref('analytic.group_analytic_accounting')
        invoice = self.draft()
        line = invoice.invoice_line_ids[0]
        plan, account = self.analytic(invoice, 'Departments', 'mandatory')
        child, child_account = self.analytic(invoice, 'Outpatient', parent=plan)
        unavailable, hidden = self.analytic(invoice, 'Unavailable', 'unavailable')
        data = self.moves.qorlia_journal_edit_analytics(invoice.id, line.id, line.account_id.id, child_account.ids)
        self.assertIn({'id': plan.id, 'name': plan.name, 'applicability': 'mandatory'}, data['plans'])
        self.assertNotIn(unavailable.id, [item['id'] for item in data['plans']])
        self.assertEqual(data['accounts'], [{'id': child_account.id, 'name': child_account.display_name, 'plan_id': plan.id}])
        choices = self.moves.qorlia_journal_edit_choices(invoice.id, line.id, 'analytic', 'QorliaQA',
            account_id=line.account_id.id, plan_id=plan.id, account_ids=[])
        self.assertIn((account.id, account.display_name), choices)
        self.assertIn((child_account.id, child_account.display_name), choices)
        self.assertNotIn((hidden.id, hidden.display_name), choices)
        with self.assertRaises(ValidationError):
            self.moves.qorlia_journal_edit_choices(invoice.id, line.id, 'analytic', plan_id=unavailable.id)
        forced = self.moves.qorlia_journal_edit_analytics(invoice.id, line.id, line.account_id.id, hidden.ids)
        self.assertIn({'id': unavailable.id, 'name': unavailable.name, 'applicability': 'optional'}, forced['plans'])

    def test_combined_analytic_keys_keep_both_names_and_exact_saved_values(self):
        self.env.user.groups_id |= self.env.ref('analytic.group_analytic_accounting')
        invoice = self.draft()
        _plan, account = self.analytic(invoice, 'Department')
        _project, project = self.analytic(invoice, 'Project')
        values = {str(account.id) + ',' + str(project.id): 100}
        request = self.request(invoice, analytic_distribution=values)
        saved = self.moves.qorlia_journal_edit_save(**request)
        self.assertEqual(saved['values']['analytic_distribution'], values)
        self.assertEqual({item['id'] for item in saved['analytic_accounts']}, {account.id, project.id})
        self.assertEqual(invoice.amount_total, 500)

    def test_analytic_lookups_fail_closed_for_missing_foreign_or_denied_accounts_and_no_group(self):
        self.env.user.groups_id |= self.env.ref('analytic.group_analytic_accounting')
        invoice = self.draft()
        line = invoice.invoice_line_ids[0]
        _plan, account = self.analytic(invoice, 'Access test')
        for ids in ([account.id, account.id], [True], [0], [account.id + 10000000]):
            with self.assertRaises(ValidationError):
                self.moves.qorlia_journal_edit_analytics(invoice.id, line.id, line.account_id.id, ids)
        company = self.env['res.company'].create({'name': 'QorliaQA Foreign analytics'})
        foreign_plan = self.env['account.analytic.plan'].create({'name': 'QorliaQA Foreign', 'company_id': company.id})
        foreign = self.env['account.analytic.account'].create({'name': 'QorliaQA Foreign',
            'plan_id': foreign_plan.id, 'company_id': company.id})
        with self.assertRaises(ValidationError):
            self.moves.qorlia_journal_edit_analytics(invoice.id, line.id, line.account_id.id, foreign.ids)
        reader = self.reader()
        reader.groups_id -= self.env.ref('analytic.group_analytic_accounting')
        hidden = self.moves.with_user(reader).qorlia_journal_edit_load(invoice.id, line.id)
        self.assertEqual(hidden['analytic_accounts'], [])
        self.assertEqual(hidden['analytic_plans'], [])
        with self.assertRaises(AccessError):
            self.moves.with_user(reader).qorlia_journal_edit_analytics(invoice.id, line.id, line.account_id.id, account.ids)
        reader.groups_id |= self.env.ref('analytic.group_analytic_accounting')
        self.env['ir.rule'].create({'name': 'QorliaQA Denied analytic account',
            'model_id': self.env.ref('analytic.model_account_analytic_account').id,
            'domain_force': repr([('id', '!=', account.id)])})
        with self.assertRaises(AccessError):
            self.moves.with_user(reader).qorlia_journal_edit_analytics(invoice.id, line.id, line.account_id.id, account.ids)

    def test_changed_analytic_plan_or_name_invalidates_review(self):
        self.env.user.groups_id |= self.env.ref('analytic.group_analytic_accounting')
        invoice = self.draft()
        plan, account = self.analytic(invoice, 'Review plan')
        request = self.request(invoice, analytic_distribution={str(account.id): 100})
        plan.default_applicability = 'mandatory'
        with self.assertRaises(UserError):
            self.moves.qorlia_journal_edit_save(**request)
        request = self.request(invoice, analytic_distribution={str(account.id): 100})
        account.name = 'QorliaQA Changed analytic name'
        with self.assertRaises(UserError):
            self.moves.qorlia_journal_edit_save(**request)

    def test_selected_account_controls_native_plan_applicability_and_rejects_other_search_scope(self):
        self.env.user.groups_id |= self.env.ref('analytic.group_analytic_accounting')
        invoice = self.draft()
        line = invoice.invoice_line_ids[0]
        plan, _account = self.analytic(invoice, 'Account prefix plan')
        alternate = self.env['account.account'].create({'name': 'QorliaQA Analytic context',
            'code': 'QJANCTX', 'account_type': 'income', 'company_id': invoice.company_id.id})
        self.env['account.analytic.applicability'].create({'analytic_plan_id': plan.id,
            'business_domain': 'invoice', 'account_prefix': alternate.code, 'applicability': 'mandatory'})
        native = self.moves.qorlia_journal_edit_analytics(invoice.id, line.id, line.account_id.id, [])
        selected = self.moves.qorlia_journal_edit_analytics(invoice.id, line.id, alternate.id, [])
        self.assertEqual(next(item['applicability'] for item in native['plans'] if item['id'] == plan.id), 'optional')
        self.assertEqual(next(item['applicability'] for item in selected['plans'] if item['id'] == plan.id), 'mandatory')
        with self.assertRaises(ValidationError):
            self.moves.qorlia_journal_edit_choices(invoice.id, line.id, 'grid', plan_id=plan.id)

    def test_existing_deprecated_posted_account_remains_readable_but_cannot_be_selected_new(self):
        self.env.user.groups_id |= self.env.ref('analytic.group_analytic_accounting')
        invoice = self.invoice()
        line = invoice.invoice_line_ids[0]
        line.account_id.deprecated = True
        loaded = self.moves.qorlia_journal_edit_load(invoice.id, line.id)
        self.assertTrue(loaded['can_edit'])
        self.moves.qorlia_journal_edit_save(**self.request(invoice, line, name='QorliaQA Deprecated historical label'))
        self.assertEqual(line.name, 'QorliaQA Deprecated historical label')
        data = self.moves.qorlia_journal_edit_analytics(invoice.id, line.id, line.account_id.id, [])
        self.assertEqual(data['account_id'], line.account_id.id)
        other = invoice.line_ids.filtered(lambda item: item.account_type == 'asset_receivable')[0]
        with self.assertRaises(ValidationError):
            self.moves.qorlia_journal_edit_analytics(invoice.id, other.id, line.account_id.id, [])
