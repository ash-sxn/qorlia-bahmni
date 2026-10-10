# SPDX-License-Identifier: LGPL-3.0-or-later
# Copyright 2026 Qorlia contributors.
import json
from unittest.mock import patch

from lxml import etree
from odoo import Command, fields
from odoo.exceptions import UserError, ValidationError
from odoo.tests import TransactionCase, tagged

from . import test_document_reports as report_tests


@tagged('post_install', '-at_install')
class NativeJournalMoneyContractTest(TransactionCase):
    """Pin installed journal calculations before exposing monetary controls."""

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.customer = cls.env['res.partner'].create({'name': 'QorliaQA Native journal money customer'})
        cls.currency = cls.env['res.currency'].create({'name': 'QJMC', 'symbol': 'QJMC',
            'rounding': 0.01, 'active': True})
        cls.env['res.currency.rate'].create({'currency_id': cls.currency.id,
            'company_id': cls.env.company.id, 'name': fields.Date.today(), 'rate': 2})

    invoice = report_tests.DocumentReportTest.invoice
    money_fields = ('state', 'amount_untaxed', 'amount_tax', 'amount_total', 'amount_residual')
    row_fields = ('display_type', 'price_unit', 'quantity', 'amount_currency', 'debit', 'credit',
                  'balance', 'currency_id', 'matched_debit_ids', 'matched_credit_ids', 'full_reconcile_id')

    def snapshot(self, invoice):
        self.env.flush_all()
        return invoice.read(list(self.money_fields)), invoice.line_ids.read(list(self.row_fields))

    def test_installed_desktop_and_mobile_expose_different_monetary_controls(self):
        view = self.env['account.move'].get_view(view_id=self.env.ref('account.view_move_form').id, view_type='form')
        arch = etree.fromstring(view['arch'])
        tree = arch.xpath("//page[@id='aml_tab']//field[@name='line_ids']/tree")[0]
        for name in ('debit', 'credit'):
            modifiers = json.loads(tree.xpath("./field[@name='%s']" % name)[0].get('modifiers'))
            readonly = modifiers['readonly']
            self.assertIn(['display_type', 'in', ['line_section', 'line_note', 'product']], readonly)
            self.assertTrue(any(isinstance(item, list) and item[0] == 'parent.move_type'
                and 'out_invoice' in item[2] for item in readonly))
        mobile = arch.xpath("//page[@id='aml_tab']//field[@name='line_ids']/form")[0]
        self.assertTrue(mobile.xpath(".//field[@name='amount_currency']"))
        for name in ('debit', 'credit'):
            modifiers = json.loads(mobile.xpath(".//field[@name='%s']" % name)[0].get('modifiers', '{}'))
            self.assertFalse(modifiers.get('readonly'))

    def test_company_currency_amount_write_is_native_noop_for_product_rows(self):
        for state in ('draft', 'posted'):
            invoice = self.invoice()
            if state == 'draft':
                invoice.button_draft()
            before = self.snapshot(invoice)
            invoice.write({'line_ids': [Command.update(invoice.invoice_line_ids.id, {'amount_currency': -600})]})
            self.assertEqual(self.snapshot(invoice), before)

    def test_foreign_amount_updates_native_balance_and_terms_not_invoice_price(self):
        for state in ('draft', 'posted'):
            invoice = self.invoice(currency_id=self.currency.id)
            if state == 'draft':
                invoice.button_draft()
            product = invoice.invoice_line_ids
            invoice.write({'line_ids': [Command.update(product.id, {'amount_currency': -600})]})
            self.env.flush_all()
            term = invoice.line_ids.filtered(lambda line: line.display_type == 'payment_term')
            self.assertEqual(invoice.state, state)
            self.assertEqual(invoice.amount_total, 600)
            self.assertEqual(invoice.amount_residual, 600)
            self.assertEqual(product.price_unit, 500)
            self.assertEqual(product.price_subtotal, 500)
            self.assertEqual(product.balance, -300)
            self.assertEqual(term.amount_currency, 600)
            self.assertEqual(term.balance, 300)
            self.assertFalse(invoice._get_unbalanced_moves({'records': invoice}))

    def test_company_credit_write_changes_document_total_without_repricing(self):
        invoice = self.invoice()
        product = invoice.invoice_line_ids
        invoice.write({'line_ids': [Command.update(product.id, {'debit': 0, 'credit': 600})]})
        self.env.flush_all()
        self.assertEqual(invoice.state, 'posted')
        self.assertEqual(product.price_unit, 500)
        self.assertEqual(product.amount_currency, -600)
        self.assertEqual(invoice.amount_total, 600)
        self.assertEqual(invoice.amount_residual, 600)
        self.assertFalse(invoice._get_unbalanced_moves({'records': invoice}))

    def test_foreign_credit_write_changes_company_ledger_not_transaction_total(self):
        invoice = self.invoice(currency_id=self.currency.id)
        product = invoice.invoice_line_ids
        invoice.write({'line_ids': [Command.update(product.id, {'debit': 0, 'credit': 600})]})
        self.env.flush_all()
        term = invoice.line_ids.filtered(lambda line: line.display_type == 'payment_term')
        self.assertEqual(product.balance, -600)
        self.assertEqual(term.balance, 600)
        self.assertEqual(product.amount_currency, -500)
        self.assertEqual(term.amount_currency, 500)
        self.assertEqual(invoice.amount_total, 500)
        self.assertEqual(invoice.amount_residual, 500)
        self.assertFalse(invoice._get_unbalanced_moves({'records': invoice}))

    def test_unbalanced_payment_term_edits_are_rejected_atomically(self):
        for currency in (self.env.company.currency_id, self.currency):
            invoice = self.invoice(currency_id=currency.id)
            term = invoice.line_ids.filtered(lambda line: line.display_type == 'payment_term')
            before = self.snapshot(invoice)
            for values in ({'amount_currency': 600}, {'debit': 600, 'credit': 0}):
                with self.assertRaises(UserError), self.env.cr.savepoint():
                    invoice.write({'line_ids': [Command.update(term.id, values)]})
                self.assertEqual(self.snapshot(invoice), before)

    def test_reconciled_and_fiscal_locked_money_changes_preserve_native_guards(self):
        invoice = self.invoice(currency_id=self.currency.id)
        credit = self.invoice(currency_id=self.currency.id, move_type='out_refund')
        terms = (invoice | credit).line_ids.filtered(lambda line: line.account_type == 'asset_receivable')
        terms.reconcile()
        before = self.snapshot(invoice)
        with self.assertRaises(UserError), self.env.cr.savepoint():
            invoice.write({'line_ids': [Command.update(terms.filtered(lambda line: line.move_id == invoice).id,
                {'amount_currency': 600})]})
        self.assertEqual(self.snapshot(invoice), before)
        with patch.object(type(self.env.company), '_validate_fiscalyear_lock', return_value=None):
            self.env.company.fiscalyear_lock_date = fields.Date.today()
        with self.assertRaises(UserError), self.env.cr.savepoint():
            invoice.write({'line_ids': [Command.update(invoice.invoice_line_ids.id, {'amount_currency': -600})]})
        self.assertEqual(self.snapshot(invoice), before)

    def test_product_deletion_recalculates_draft_and_protects_posted_and_term_rows(self):
        invoice = self.invoice()
        before = self.snapshot(invoice)
        with self.assertRaises(UserError), self.env.cr.savepoint():
            invoice.write({'line_ids': [Command.delete(invoice.invoice_line_ids.id)]})
        self.assertEqual(self.snapshot(invoice), before)
        invoice.button_draft()
        term = invoice.line_ids.filtered(lambda line: line.display_type == 'payment_term')
        with self.assertRaises(ValidationError), self.env.cr.savepoint():
            invoice.write({'line_ids': [Command.delete(term.id)]})
        invoice.write({'line_ids': [Command.delete(invoice.invoice_line_ids.id)]})
        self.env.flush_all()
        self.assertEqual(invoice.amount_total, 0)
        self.assertFalse(invoice.invoice_line_ids)
        self.assertFalse(invoice._get_unbalanced_moves({'records': invoice}))

    def test_native_money_onchange_is_virtual_and_does_not_write_saved_records(self):
        reader = self.env['sale.order']._qorlia_read_fields
        headers = ('state', 'company_id', 'move_type', 'currency_id', 'invoice_date', 'date', 'partner_id')
        names = ('name', 'account_id', 'display_type', 'currency_id', 'partner_id', 'quantity',
                 'price_unit', 'discount', 'tax_ids', 'date_maturity', 'amount_currency', 'balance', 'debit', 'credit')
        for currency in (self.env.company.currency_id, self.currency):
            for field, value in (('amount_currency', -600), ('credit', 600)):
                invoice = self.invoice(currency_id=currency.id)
                commands = [Command.update(line.id, reader(line, names)) for line in invoice.line_ids]
                product = next(command for command in commands if command[1] == invoice.invoice_line_ids.id)
                product[2][field] = value
                spec = {name: '1' for name in headers + ('line_ids', 'amount_total', 'amount_tax')}
                spec.update({'line_ids.' + name: '1' for name in names})
                before = self.snapshot(invoice)
                counts = {model: self.env[model].search_count([]) for model in
                    ('account.move', 'account.move.line', 'account.partial.reconcile', 'mail.message')}
                result = invoice.onchange({**reader(invoice, headers), 'id': invoice.id,
                    'line_ids': commands}, ['line_ids'], spec)
                self.assertEqual(result['value']['amount_total'], 600 if field == 'amount_currency' else 500)
                self.assertEqual(self.snapshot(invoice), before)
                self.assertEqual({model: self.env[model].search_count([]) for model in counts}, counts)
                invoice.write({'line_ids': [Command.update(invoice.invoice_line_ids.id, {field: value})]})
                self.env.flush_all()
                saved_total = (600 if field == 'credit' else 500) if currency == self.env.company.currency_id else (
                    600 if field == 'amount_currency' else 500)
                self.assertEqual(invoice.amount_total, saved_total)
                # Native onchange alone is not a trustworthy monetary save preview.
                if currency == self.env.company.currency_id:
                    self.assertNotEqual(result['value']['amount_total'], invoice.amount_total)
