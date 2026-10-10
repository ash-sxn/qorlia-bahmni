# SPDX-License-Identifier: LGPL-3.0-or-later
# Copyright 2026 Qorlia contributors.
import copy
import uuid
from unittest.mock import patch

from odoo import Command, fields
from odoo.exceptions import AccessError, UserError, ValidationError
from odoo.tests import TransactionCase, tagged

from . import test_invoice_journal_money as simulation_tests


@tagged('post_install', '-at_install')
class InvoiceJournalMoneyAPITest(TransactionCase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.customer = cls.env['res.partner'].create({'name': 'QorliaQA Monetary API customer'})
        cls.currency = cls.env['res.currency'].create({'name': 'QJMA', 'symbol': 'QJMA',
            'rounding': 0.01, 'active': True})
        cls.env['res.currency.rate'].create({'currency_id': cls.currency.id,
            'company_id': cls.env.company.id, 'name': fields.Date.today(), 'rate': 2})
        cls.moves = cls.env['account.move']

    invoice = simulation_tests.InvoiceJournalMoneyTest.invoice
    reader = simulation_tests.InvoiceJournalMoneyTest.reader
    unchanged = simulation_tests.InvoiceJournalMoneyTest.unchanged

    def payload(self, invoice, changes=None, **values):
        loaded = self.moves.qorlia_journal_money_load(invoice.id)
        return {'invoice_id': invoice.id, 'version': loaded['version'],
            'changes': changes if changes is not None else [{'id': invoice.invoice_line_ids[0].id, 'values': values}]}

    def request(self, invoice, changes=None, **values):
        payload = self.payload(invoice, changes, **values)
        before = self.unchanged(invoice)
        review = self.moves.qorlia_journal_money_preview(payload)
        self.assertEqual(self.unchanged(invoice), before)
        return {'payload': payload, 'review_version': review['review_version'], 'request_key': str(uuid.uuid4())}, review

    def test_posted_invoice_and_credit_amounts_match_review_and_native_totals(self):
        for move_type in ('out_invoice', 'out_refund'):
            invoice = self.invoice(move_type=move_type)
            request, review = self.request(invoice, debit=600 if move_type == 'out_refund' else 0,
                credit=600 if move_type == 'out_invoice' else 0)
            self.assertEqual(review['totals']['amount_total'], 600)
            self.assertIs(self.moves.qorlia_journal_money_status(**request), False)
            saved = self.moves.qorlia_journal_money_save(**request)
            self.assertEqual(saved['totals'], review['totals'])
            self.assertEqual(saved['totals']['state'], 'posted')
            self.assertEqual(invoice.invoice_line_ids.price_unit, 500)
            self.assertFalse(invoice._get_unbalanced_moves({'records': invoice}))

    def test_foreign_amounts_and_installments_are_native(self):
        term = self.env['account.payment.term'].create({'name': 'QorliaQA API installments',
            'line_ids': [Command.create({'value': 'percent', 'value_amount': 50}),
                         Command.create({'value': 'balance', 'days': 30})]})
        invoice = self.invoice(currency_id=self.currency.id, invoice_payment_term_id=term.id)
        request, review = self.request(invoice, amount_currency=-600)
        self.assertEqual(review['totals']['amount_total'], 600)
        saved = self.moves.qorlia_journal_money_save(**request)
        terms = [row for row in saved['rows'] if row['values']['display_type'] == 'payment_term']
        self.assertEqual([row['values']['amount_currency'] for row in terms], [300, 300])
        self.assertEqual(saved['totals'], review['totals'])

    def test_draft_tax_and_added_accounting_row_use_native_defaults(self):
        invoice = self.invoice()
        invoice.button_draft()
        tax = self.env['account.tax'].create({'name': 'QorliaQA Monetary API tax',
            'amount': 5, 'type_tax_use': 'sale', 'company_id': invoice.company_id.id})
        request, review = self.request(invoice, [
            {'id': invoice.invoice_line_ids.id, 'values': {'tax_ids': tax.ids}},
            {'id': False, 'values': {'name': 'QorliaQA Added monetary row',
                'account_id': invoice.invoice_line_ids.account_id.id, 'credit': 100, 'debit': 0, 'tax_ids': tax.ids}}])
        source_ids = set(invoice.line_ids.ids)
        saved = self.moves.qorlia_journal_money_save(**request)
        self.assertEqual(saved['totals'], review['totals'])
        self.assertTrue(any(row['values']['display_type'] == 'tax' for row in saved['rows']))
        added = invoice.line_ids.filtered(lambda line: line.id not in source_ids and line.display_type == 'product')
        self.assertEqual(len(added), 1)
        self.assertEqual(added.partner_id, invoice.commercial_partner_id)
        self.assertEqual(added.currency_id, invoice.currency_id)
        self.assertFalse(invoice._get_unbalanced_moves({'records': invoice}))

    def test_delete_retry_survives_deleted_row_and_later_state(self):
        invoice = self.invoice()
        invoice.button_draft()
        request, review = self.request(invoice, [{'id': invoice.invoice_line_ids.id, 'delete': True}])
        saved = self.moves.qorlia_journal_money_save(**request)
        self.assertEqual(saved['totals']['amount_total'], 0)
        stamp = invoice.write_date
        self.assertEqual(self.moves.qorlia_journal_money_save(**request), saved)
        self.assertEqual(invoice.write_date, stamp)
        invoice.button_cancel()
        self.assertEqual(self.moves.qorlia_journal_money_status(**request)['totals']['state'], 'cancel')
        self.assertEqual(self.moves.qorlia_journal_money_save(**request)['totals']['state'], 'cancel')
        changed = copy.deepcopy(request)
        changed['payload']['changes'][0]['delete'] = False
        with self.assertRaises(ValidationError):
            self.moves.qorlia_journal_money_save(**changed)

    def test_source_and_target_configuration_changes_require_new_review(self):
        invoice = self.invoice()
        request, _ = self.request(invoice, credit=600)
        invoice.ref = 'QorliaQA Changed after review'
        with self.assertRaises(UserError):
            self.moves.qorlia_journal_money_save(**request)
        invoice.button_draft()
        tax = self.env['account.tax'].create({'name': 'QorliaQA Changed target tax',
            'amount': 5, 'type_tax_use': 'sale', 'company_id': invoice.company_id.id})
        request, _ = self.request(invoice, tax_ids=tax.ids)
        tax.amount = 10
        with self.assertRaises(UserError):
            self.moves.qorlia_journal_money_save(**request)
        self.assertFalse(invoice.invoice_line_ids.tax_ids)

    def test_analytic_plan_change_rejects_review_without_modifying_amounts(self):
        invoice = self.invoice()
        plan = self.env['account.analytic.plan'].create({'name': 'QorliaQA Monetary API plan',
            'company_id': invoice.company_id.id, 'default_applicability': 'optional'})
        analytic = self.env['account.analytic.account'].create({'name': 'QorliaQA Monetary API allocation',
            'plan_id': plan.id, 'company_id': invoice.company_id.id})
        request, _ = self.request(invoice, analytic_distribution={str(analytic.id): 100}, credit=600)
        plan.default_applicability = 'mandatory'
        with self.assertRaises(UserError):
            self.moves.qorlia_journal_money_save(**request)
        self.assertEqual(invoice.amount_total, 500)
        self.assertFalse(invoice.invoice_line_ids.analytic_distribution)

    def test_readonly_and_denied_rows_are_not_editable_or_visible(self):
        invoice = self.invoice()
        reader = self.reader()
        readonly = self.moves.with_user(reader)
        loaded = readonly.qorlia_journal_money_load(invoice.id)
        self.assertFalse(loaded['can_edit'])
        with self.assertRaises(AccessError):
            readonly.qorlia_journal_money_preview({'invoice_id': invoice.id, 'version': loaded['version'],
                'changes': [{'id': invoice.invoice_line_ids.id, 'values': {'credit': 600}}]})
        self.env['ir.rule'].create({'name': 'QorliaQA Monetary denied line',
            'model_id': self.env.ref('account.model_account_move_line').id,
            'domain_force': repr([('id', '!=', invoice.invoice_line_ids.id)])})
        with self.assertRaises(AccessError):
            readonly.qorlia_journal_money_load(invoice.id)

    def test_strict_requests_reject_cross_invoice_duplicate_and_unsupported_fields(self):
        invoice = self.invoice()
        other = self.invoice()
        row = invoice.invoice_line_ids.id
        for changes in [[], [{'id': other.invoice_line_ids.id, 'values': {'credit': 600}}],
                [{'id': row, 'values': {'credit': 600}}, {'id': row, 'delete': True}],
                [{'id': row, 'values': {'move_id': other.id}}],
                [{'id': row, 'values': {'credit': -1}}],
                [{'id': row, 'values': {'debit': True}}],
                [{'id': False, 'delete': True}], [{'id': 0, 'values': {'credit': 600}}],
                [{'id': row, 'values': {'credit': float('nan')}}],
                [{'id': row, 'values': {'date_maturity': '2026-13-40'}}]]:
            with self.assertRaises(ValidationError):
                self.moves.qorlia_journal_money_preview(self.payload(invoice, changes))
        request, _ = self.request(invoice, credit=600)
        for key in ['not-a-uuid', False, str(uuid.uuid4()).upper()]:
            with self.assertRaises(ValidationError):
                self.moves.qorlia_journal_money_save(**{**request, 'request_key': key})

    def test_native_unbalanced_posted_delete_hash_and_fiscal_guards_apply(self):
        invoice = self.invoice()
        term = invoice.line_ids.filtered(lambda line: line.display_type == 'payment_term')
        before = self.unchanged(invoice)
        for changes in [[{'id': term.id, 'values': {'debit': 600}}],
                [{'id': invoice.invoice_line_ids.id, 'delete': True}]]:
            with self.assertRaises(UserError):
                self.moves.qorlia_journal_money_preview(self.payload(invoice, changes))
            self.assertEqual(self.unchanged(invoice), before)
        journal = self.env['account.journal'].create({'name': 'QorliaQA Monetary hashed',
            'code': 'QJMH', 'type': 'sale', 'company_id': self.env.company.id, 'restrict_mode_hash_table': True})
        hashed = self.invoice(journal_id=journal.id)
        with self.assertRaisesRegex(UserError, 'hashed'):
            self.moves.qorlia_journal_money_preview(self.payload(hashed, credit=600))
        with patch.object(type(self.env.company), '_validate_fiscalyear_lock', return_value=None):
            self.env.company.fiscalyear_lock_date = fields.Date.today()
        with self.assertRaises(UserError):
            self.moves.qorlia_journal_money_preview(self.payload(invoice, credit=600))

    def test_native_validation_context_cannot_be_bypassed(self):
        invoice = self.invoice()
        payload = self.payload(invoice, credit=600)
        for context in [{'check_move_validity': False}, {'skip_invoice_sync': True},
                {'skip_account_move_synchronization': True}]:
            with self.assertRaises(ValidationError):
                self.moves.with_context(**context).qorlia_journal_money_preview(payload)

    def test_unexpected_native_outcome_rolls_back_amounts_and_receipt(self):
        invoice = self.invoice()
        request, _ = self.request(invoice, credit=600)
        before = self.unchanged(invoice)
        original = type(invoice).write

        def write(document, values):
            result = original(document, values)
            if 'line_ids' in values and not document.env.context.get('tracking_disable'):
                original(document, {'ref': 'QorliaQA Unexpected native hook'})
                document.invoice_line_ids.credit = 700
            return result

        with patch.object(type(invoice), 'write', write):
            with self.assertRaisesRegex(UserError, 'reviewed ledger'):
                self.moves.qorlia_journal_money_save(**request)
        self.assertEqual(self.unchanged(invoice), before)
        self.assertIs(self.moves.qorlia_journal_money_status(**request), False)

    def test_response_failure_rolls_back_save_and_receipt(self):
        invoice = self.invoice()
        request, _ = self.request(invoice, credit=600)
        before = self.unchanged(invoice)
        with patch.object(type(invoice), '_qorlia_journal_money_view', side_effect=AccessError('QorliaQA Response denied')):
            with self.assertRaises(AccessError):
                self.moves.qorlia_journal_money_save(**request)
        self.assertEqual(self.unchanged(invoice), before)
        self.assertIs(self.moves.qorlia_journal_money_status(**request), False)

    def test_choices_are_company_scoped_and_unknown_searches_fail(self):
        invoice = self.invoice()
        choices = self.moves.qorlia_journal_money_choices(invoice.id, 'account', 'QorliaQA')
        self.assertTrue(all(self.env['account.account'].browse(identifier).company_id == invoice.company_id
            for identifier, _ in choices))
        for kind in ['write', False, []]:
            with self.assertRaises(ValidationError):
                self.moves.qorlia_journal_money_choices(invoice.id, kind)
        with self.assertRaises(ValidationError):
            self.moves.qorlia_journal_money_choices(invoice.id, 'account', search='x' * 201)

    def test_new_and_saved_row_analytics_use_native_plans_and_names(self):
        invoice = self.invoice()
        plan = self.env['account.analytic.plan'].create({'name': 'QorliaQA Money Departments',
            'company_id': invoice.company_id.id, 'default_applicability': 'optional'})
        other_plan = self.env['account.analytic.plan'].create({'name': 'QorliaQA Money Projects',
            'company_id': invoice.company_id.id, 'default_applicability': 'optional'})
        account = self.env['account.analytic.account'].create({'name': 'QorliaQA Money OPD',
            'plan_id': plan.id, 'company_id': invoice.company_id.id})
        other = self.env['account.analytic.account'].create({'name': 'QorliaQA Money Pilot',
            'plan_id': other_plan.id, 'company_id': invoice.company_id.id})
        for identifier in [False, invoice.invoice_line_ids.id]:
            metadata = self.moves.qorlia_journal_money_analytics(invoice.id, identifier,
                invoice.invoice_line_ids.account_id.id, [account.id, other.id])
            self.assertEqual(metadata['line_id'], identifier)
            self.assertEqual({item['id'] for item in metadata['accounts']}, {account.id, other.id})
            choices = self.moves.qorlia_journal_money_choices(invoice.id, 'analytic', 'QorliaQA Money',
                identifier, invoice.invoice_line_ids.account_id.id, plan.id, [account.id, other.id])
            self.assertEqual([item[0] for item in choices], [account.id])
        request, review = self.request(invoice, credit=600, analytic_distribution={str(account.id): 100})
        self.assertEqual(review['labels']['account.analytic.account:%s' % account.id], account.display_name)
        self.assertEqual(review['labels']['account.account:%s' % invoice.invoice_line_ids.account_id.id],
            invoice.invoice_line_ids.account_id.display_name)
        self.assertEqual(self.moves.qorlia_journal_money_save(**request)['totals'], review['totals'])

    def test_money_analytic_scope_rejects_denied_cross_invoice_and_invalid_inputs(self):
        invoice = self.invoice()
        other = self.invoice()
        account_id = invoice.invoice_line_ids.account_id.id
        with self.assertRaises(AccessError):
            self.moves.with_user(self.reader()).qorlia_journal_money_analytics(invoice.id, False, account_id, [])
        for identifier, account_ids in [(other.invoice_line_ids.id, []), (False, [True]), (False, [1, 1])]:
            with self.assertRaises(ValidationError):
                self.moves.qorlia_journal_money_analytics(invoice.id, identifier, account_id, account_ids)
        with self.assertRaises(ValidationError):
            self.moves.qorlia_journal_money_choices(invoice.id, 'analytic', account_id=account_id,
                plan_id=-1, account_ids=[])
        with self.assertRaises(ValidationError):
            self.moves.qorlia_journal_money_choices(invoice.id, 'tax', account_id=account_id)
