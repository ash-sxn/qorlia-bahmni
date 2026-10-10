# SPDX-License-Identifier: LGPL-3.0-or-later
import uuid

from odoo import Command, fields
from odoo.exceptions import AccessError, UserError, ValidationError
from odoo.tests import TransactionCase, tagged
from . import test_document_reports as report_tests


@tagged('post_install', '-at_install')
class InvoiceJournalTest(TransactionCase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.customer = cls.env['res.partner'].create({'name': 'QorliaQA Journal customer'})
        cls.moves = cls.env['account.move']

    invoice = report_tests.DocumentReportTest.invoice
    reader = report_tests.DocumentReportTest.reader

    def test_native_posted_entries_match_ledger_without_financial_writes(self):
        invoice = self.invoice()
        before = invoice.read(['write_date', 'state', 'amount_total', 'amount_residual'])
        lines = invoice.line_ids.read(['write_date', 'debit', 'credit', 'balance', 'amount_residual'])
        payments = self.env['account.payment'].search_count([])
        journal = self.moves.qorlia_invoice_journal(invoice.id)
        self.assertEqual(journal['invoice_id'], invoice.id)
        self.assertEqual(journal['state'], 'posted')
        self.assertEqual(journal['total_count'], len(invoice.line_ids))
        self.assertEqual([row['id'] for row in journal['rows']], sorted(invoice.line_ids.ids))
        self.assertEqual(journal['debit'], sum(invoice.line_ids.mapped('debit')))
        self.assertEqual(journal['credit'], sum(invoice.line_ids.mapped('credit')))
        self.assertTrue(journal['balanced'])
        self.assertEqual(journal['currency'], [invoice.company_currency_id.id, invoice.company_currency_id.name])
        for row in journal['rows']:
            line = self.env['account.move.line'].browse(row['id'])
            self.assertEqual(row['account_id'][0], line.account_id.id)
            self.assertEqual(row['partner_id'][0], self.customer.id)
            for field in ('debit', 'credit', 'balance', 'amount_currency', 'amount_residual', 'reconciled'):
                self.assertEqual(row[field], line[field])
        self.assertEqual(invoice.read(['write_date', 'state', 'amount_total', 'amount_residual']), before)
        self.assertEqual(invoice.line_ids.read(['write_date', 'debit', 'credit', 'balance', 'amount_residual']), lines)
        self.assertEqual(self.env['account.payment'].search_count([]), payments)

    def test_more_than_one_hundred_rows_page_without_omission_or_duplicate(self):
        income = self.env['account.account'].search([('company_id', '=', self.env.company.id), ('account_type', '=', 'income')], limit=1)
        invoice = self.invoice(invoice_line_ids=[Command.create({'name': 'QorliaQA Journal %s' % number,
            'account_id': income.id, 'quantity': 1, 'price_unit': 1, 'tax_ids': [Command.clear()]}) for number in range(105)])
        first = self.moves.qorlia_invoice_journal(invoice.id)
        self.assertEqual(len(first['rows']), 100)
        self.assertEqual(first['next_after'], first['rows'][-1]['id'])
        second = self.moves.qorlia_invoice_journal(invoice.id, first['next_after'], first['version'])
        ids = [row['id'] for row in first['rows'] + second['rows']]
        self.assertEqual(ids, sorted(invoice.line_ids.ids))
        self.assertEqual(len(ids), len(set(ids)))
        self.assertIs(second['next_after'], False)
        for field in ('version', 'total_count', 'debit', 'credit', 'balanced'):
            self.assertEqual(first[field], second[field])

    def test_changed_line_or_document_rejects_old_version_and_allows_fresh_reload(self):
        invoice = self.invoice()
        self.env.flush_all()
        first = self.moves.qorlia_invoice_journal(invoice.id)
        # Transaction timestamps are fixed, so invalidate the historical snapshot explicitly.
        self.env.cr.execute('UPDATE account_move_line SET write_date = write_date + interval \'1 second\' WHERE id = %s', [invoice.line_ids[0].id])
        invoice.line_ids.invalidate_recordset(['write_date'])
        with self.assertRaises(UserError):
            self.moves.qorlia_invoice_journal(invoice.id, invoice.line_ids[0].id, first['version'])
        fresh = self.moves.qorlia_invoice_journal(invoice.id)
        self.assertNotEqual(first['version'], fresh['version'])
        invoice.button_draft()
        with self.assertRaises(UserError):
            self.moves.qorlia_invoice_journal(invoice.id, version=fresh['version'])
        self.assertEqual(self.moves.qorlia_invoice_journal(invoice.id)['state'], 'draft')

    def test_invalid_invoice_cursor_and_version_are_rejected(self):
        invoice = self.invoice()
        version = self.moves.qorlia_invoice_journal(invoice.id)['version']
        for invalid in (True, 0, -1, '1'):
            with self.assertRaises(ValidationError):
                self.moves.qorlia_invoice_journal(invalid)
            with self.assertRaises(ValidationError):
                self.moves.qorlia_invoice_journal(invoice.id, after=invalid, version=version)
        for invalid in (True, '', 'a' * 63, 'G' * 64):
            with self.assertRaises(ValidationError):
                self.moves.qorlia_invoice_journal(invoice.id, version=invalid)
        with self.assertRaises(ValidationError):
            self.moves.qorlia_invoice_journal(invoice.id, after=invoice.line_ids[0].id)

    def test_other_invoice_cursor_and_non_customer_moves_are_rejected(self):
        invoice, other = self.invoice(), self.invoice()
        version = self.moves.qorlia_invoice_journal(invoice.id)['version']
        with self.assertRaises(ValidationError):
            self.moves.qorlia_invoice_journal(invoice.id, after=other.line_ids[0].id, version=version)
        other.button_draft()
        other.move_type = 'in_invoice'
        with self.assertRaises(UserError):
            self.moves.qorlia_invoice_journal(other.id)

    def test_readonly_user_and_company_rules_remain_native(self):
        invoice, reader = self.invoice(), self.reader()
        readonly = self.moves.with_user(reader)
        self.assertEqual(readonly.qorlia_invoice_journal(invoice.id)['total_count'], len(invoice.line_ids))
        company = self.env['res.company'].create({'name': 'QorliaQA Journal other company'})
        reader.write({'company_ids': [Command.set(company.ids)], 'company_id': company.id})
        with self.assertRaises(AccessError):
            readonly.qorlia_invoice_journal(invoice.id)

    def test_line_rule_denial_does_not_return_partial_totals_or_rows(self):
        invoice, reader = self.invoice(), self.reader()
        self.env['ir.rule'].create({'name': 'QorliaQA Restrict journal line',
            'model_id': self.env.ref('account.model_account_move_line').id,
            'domain_force': repr([('id', '!=', invoice.line_ids[0].id)])})
        with self.assertRaises(AccessError):
            self.moves.with_user(reader).qorlia_invoice_journal(invoice.id)

    def test_portal_user_cannot_read_journal(self):
        portal = self.env['res.users'].with_context(no_reset_password=True).create({
            'name': 'QorliaQA Journal portal', 'login': 'qorliaqa-journal-' + str(uuid.uuid4()),
            'groups_id': [Command.set(self.env.ref('base.group_portal').ids)]})
        with self.assertRaises(AccessError):
            self.moves.with_user(portal).qorlia_invoice_journal(self.invoice().id)

    def test_tax_grid_and_analytic_distribution_obey_native_visibility(self):
        tax = self.env['account.tax'].create({'name': 'QorliaQA Journal tax', 'amount': 5,
            'type_tax_use': 'sale', 'company_id': self.env.company.id})
        invoice = self.invoice()
        invoice.button_draft()
        invoice.invoice_line_ids.tax_ids = tax
        invoice.action_post()
        reader = self.reader()
        reader.groups_id -= self.env.ref('analytic.group_analytic_accounting')
        result = self.moves.with_user(reader).qorlia_invoice_journal(invoice.id)
        self.assertFalse(result['analytics_visible'])
        self.assertTrue(all(row['analytic_distribution'] is False for row in result['rows']))
        self.assertTrue(any([tax.id, tax.name_get()[0][1]] in row['tax_ids'] for row in result['rows']))
        reader.groups_id |= self.env.ref('analytic.group_analytic_accounting')
        self.assertTrue(self.moves.with_user(reader).qorlia_invoice_journal(invoice.id)['analytics_visible'])

    def test_company_and_foreign_transaction_currencies_are_distinct(self):
        currency = self.env['res.currency'].create({'name': 'QJRN', 'symbol': 'QJRN', 'rounding': 0.01, 'active': True})
        self.env['res.currency.rate'].create({'currency_id': currency.id, 'company_id': self.env.company.id,
                                            'name': fields.Date.today(), 'rate': 2})
        invoice = self.invoice(currency_id=currency.id)
        result = self.moves.qorlia_invoice_journal(invoice.id)
        self.assertEqual(result['currency'][0], self.env.company.currency_id.id)
        self.assertTrue(all(row['currency_id'][0] == currency.id for row in result['rows']))
        self.assertTrue(result['balanced'])
        self.assertTrue(any(row['amount_currency'] != row['balance'] for row in result['rows']))

    def test_credit_draft_and_sections_do_not_masquerade_as_posted_items(self):
        invoice = self.invoice(move_type='out_refund')
        self.assertEqual(self.moves.qorlia_invoice_journal(invoice.id)['state'], 'posted')
        invoice.button_draft()
        invoice.write({'invoice_line_ids': [Command.create({'display_type': 'line_section', 'name': 'QorliaQA Section'}),
                                            Command.create({'display_type': 'line_note', 'name': 'QorliaQA Note'})]})
        result = self.moves.qorlia_invoice_journal(invoice.id)
        self.assertEqual(result['state'], 'draft')
        self.assertTrue(all(row['display_type'] not in ('line_section', 'line_note') for row in result['rows']))
        self.assertEqual(result['total_count'], len(invoice.line_ids) - 2)
