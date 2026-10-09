# SPDX-License-Identifier: LGPL-3.0-or-later
import copy

from odoo import Command, fields
from odoo.exceptions import AccessError, UserError, ValidationError
from odoo.tests import TransactionCase, tagged


@tagged('post_install', '-at_install')
class InvoiceDraftTest(TransactionCase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.moves = cls.env['account.move']
        cls.customer = cls.env['res.partner'].create({'name': 'QorliaQA Invoice draft customer'})
        cls.income = cls.env['account.account'].search([
            ('company_id', '=', cls.env.company.id), ('account_type', '=', 'income')], limit=1)
        cls.adjustment = cls.env['account.account'].search([
            ('company_id', '=', cls.env.company.id), ('account_type', '=', 'income_other')], limit=1)
        cls.tax = cls.env['account.tax'].create({'name': 'QorliaQA Draft tax',
            'amount': 5, 'type_tax_use': 'sale', 'company_id': cls.env.company.id})
        cls.product = cls.env['product.product'].create({'name': 'QorliaQA Draft service', 'type': 'service',
            'list_price': 700, 'property_account_income_id': cls.income.id, 'taxes_id': [Command.set(cls.tax.ids)]})

    def invoice(self, **values):
        return self.moves.create({'move_type': 'out_invoice', 'partner_id': self.customer.id,
            'invoice_date': fields.Date.today(), 'invoice_line_ids': [Command.create({
                'name': 'QorliaQA Initial service', 'account_id': self.income.id,
                'quantity': 2, 'price_unit': 500, 'tax_ids': [Command.set(self.tax.ids)]})], **values})

    def payload(self, snapshot):
        return {key: copy.deepcopy(snapshot[key]) for key in ('id', 'version', 'values', 'lines')}

    def preview(self, invoice, change=False, mutate=None):
        payload = self.payload(self.moves.qorlia_invoice_draft_load(invoice.id))
        if mutate:
            mutate(payload)
        return self.moves.qorlia_invoice_draft_preview(payload, change)

    def save(self, preview):
        return self.moves.qorlia_invoice_draft_save(self.payload(preview), preview['review_version'])

    def test_preview_is_readonly_and_save_recalculates_native_taxes(self):
        invoice = self.invoice()
        original = invoice.write_date
        count = self.moves.search_count([])
        line_count = self.env['account.move.line'].search_count([])
        preview = self.preview(invoice, {'field': 'quantity', 'line': 0},
            lambda payload: payload['lines'][0]['values'].update(quantity=1))
        self.assertEqual(preview['totals']['invoice_total'], 525)
        self.assertEqual(invoice.amount_total, 1050)
        self.assertEqual(invoice.write_date, original)
        self.assertEqual(self.moves.search_count([]), count)
        self.assertEqual(self.env['account.move.line'].search_count([]), line_count)
        saved = self.save(preview)
        self.assertEqual(saved['totals']['invoice_total'], 525)
        self.assertEqual(invoice.state, 'draft')
        self.assertFalse(invoice._get_unbalanced_moves({'records': invoice}))
        with self.assertRaises(UserError):
            self.save(preview)

    def test_native_product_onchange_and_manual_tax_preservation(self):
        invoice = self.invoice()
        preview = self.preview(invoice, {'field': 'product_id', 'line': 0},
            lambda payload: payload['lines'][0]['values'].update(product_id=self.product.id))
        self.assertEqual(preview['lines'][0]['values']['product_uom_id'], self.product.uom_id.id)
        self.assertEqual(preview['lines'][0]['values']['price_unit'], 700)
        self.assertEqual(preview['lines'][0]['values']['tax_ids'], self.tax.ids)
        self.save(preview)
        invoice.invoice_line_ids.tax_ids = False
        preview = self.preview(invoice, {'field': 'ref'},
            lambda payload: payload['values'].update(ref='QorliaQA metadata only'))
        self.assertFalse(preview['lines'][0]['values']['tax_ids'])
        self.save(preview)
        self.assertFalse(invoice.invoice_line_ids.tax_ids)
        self.assertEqual(invoice.invoice_line_ids.price_unit, 700)

    def test_partial_credit_preserves_source_and_generates_adjustments_once(self):
        invoice = self.invoice(discount_type='percentage', discount_percentage=10, discount=105)
        self.env.company.qorlia_rounding_account_id = self.adjustment
        invoice.disc_acc_id = self.adjustment
        invoice.round_off_amount = -0.25
        invoice.action_post()
        loaded = self.moves.qorlia_reversal_load(invoice.id)
        review = self.moves.qorlia_reversal_preview(invoice.id, loaded['source_version'], loaded['values'])
        credit = self.moves.browse(self.moves.qorlia_reversal_run(invoice.id, review['version'], review['values'])['credits'][0]['id'])
        payment_count = self.env['account.payment'].search_count([])
        preview = self.preview(credit, {'field': 'quantity', 'line': 0},
            lambda payload: payload['lines'][0]['values'].update(quantity=1))
        self.assertEqual(preview['values']['discount'], 52.5)
        self.assertEqual(preview['totals']['invoice_total'], 472.25)
        self.assertEqual(len(preview['generated_adjustments']), 2)
        self.save(preview)
        credit.action_post()
        self.assertEqual(credit.invoice_total, 472.25)
        self.assertEqual(len(credit.invoice_line_ids.filtered('qorlia_adjustment_kind')), 2)
        self.assertEqual(invoice.amount_residual, 944.75)
        self.assertEqual(self.env['account.payment'].search_count([]), payment_count)
        self.assertFalse((invoice | credit)._get_unbalanced_moves({'records': invoice | credit}))

    def test_native_payment_terms_and_foreign_currency(self):
        invoice = self.invoice()
        term = self.env['account.payment.term'].create({'name': 'QorliaQA Draft installments',
            'line_ids': [Command.create({'value': 'percent', 'value_amount': 50, 'days': 0}),
                         Command.create({'value': 'balance', 'days': 30})]})
        currency = self.env['res.currency'].search([('name', '=', 'USD')], limit=1)
        currency.active = True
        self.env['res.currency.rate'].create({'currency_id': currency.id,
            'company_id': self.env.company.id, 'name': fields.Date.today(), 'rate': 0.5})
        preview = self.preview(invoice, {'field': 'currency_id'},
            lambda payload: payload['values'].update(currency_id=currency.id, invoice_payment_term_id=term.id))
        self.save(preview)
        invoice.action_post()
        terms = invoice.line_ids.filtered(lambda line: line.display_type == 'payment_term')
        self.assertEqual(len(terms), 2)
        self.assertEqual(sorted(terms.mapped('amount_currency')), [525, 525])
        self.assertFalse(invoice._get_unbalanced_moves({'records': invoice}))

    def test_rejects_posted_stale_foreign_line_and_arbitrary_fields(self):
        invoice, other = self.invoice(), self.invoice()
        payload = self.payload(self.moves.qorlia_invoice_draft_load(invoice.id))
        payload['lines'][0]['id'] = other.invoice_line_ids.id
        with self.assertRaises(ValidationError):
            self.moves.qorlia_invoice_draft_preview(payload)
        for name, value in (('state', 'posted'), ('company_id', self.env.company.id), ('invoice_date', '2026-2-01'), ('to_check', 1)):
            payload = self.payload(self.moves.qorlia_invoice_draft_load(invoice.id))
            payload['values'][name] = value
            with self.assertRaises(ValidationError):
                self.moves.qorlia_invoice_draft_preview(payload)
        preview = self.preview(invoice)
        invoice.ref = 'QorliaQA another editor'
        with self.assertRaises(UserError):
            self.save(preview)
        preview = self.preview(invoice)
        self.tax.amount = 6
        with self.assertRaises(UserError):
            self.save(preview)
        invoice.action_post()
        with self.assertRaises(UserError):
            self.moves.qorlia_invoice_draft_load(invoice.id)

    def test_native_permissions_and_company_boundary(self):
        invoice = self.invoice()
        user = self.env['res.users'].with_context(no_reset_password=True).create({
            'name': 'QorliaQA Draft readonly', 'login': 'qorliaqa-draft-readonly',
            'groups_id': [Command.set(self.env.ref('account.group_account_readonly').ids)],
            'company_id': self.env.company.id, 'company_ids': [Command.set(self.env.company.ids)]})
        loaded = self.moves.with_user(user).qorlia_invoice_draft_load(invoice.id)
        self.assertFalse(loaded['can_edit'])
        with self.assertRaises(AccessError):
            self.moves.with_user(user).qorlia_invoice_draft_preview(self.payload(loaded))
        other = self.env['res.company'].create({'name': 'QorliaQA Draft other company'})
        with self.assertRaises(AccessError):
            invoice.with_user(user).with_company(other)._qorlia_draft_invoice(invoice.id)

    def test_add_remove_sections_notes_and_manual_services(self):
        invoice = self.invoice()
        payload = self.payload(self.moves.qorlia_invoice_draft_load(invoice.id))
        source = payload['lines'].pop()
        for display, name in (('line_section', 'QorliaQA Replacement section'), ('line_note', 'QorliaQA Note'),
                              ('product', 'QorliaQA Replacement service')):
            item = {**source['values'], 'name': name, 'display_type': display, 'sequence': len(payload['lines']) + 1}
            if display != 'product':
                item.update(account_id=False, product_id=False, product_uom_id=False,
                            quantity=0, price_unit=0, discount=0, tax_ids=[], analytic_distribution=False)
            else:
                item.update(quantity=1, price_unit=200)
            payload['lines'].append({'id': False, 'values': item})
        preview = self.moves.qorlia_invoice_draft_preview(payload, {'field': 'invoice_line_ids'})
        self.assertEqual(preview['totals']['invoice_total'], 210)
        saved = self.save(preview)
        self.assertEqual(len(saved['lines']), 3)
        self.assertNotIn(source['id'], [line['id'] for line in saved['lines']])
        self.assertEqual([line['values']['display_type'] for line in saved['lines']], ['line_section', 'line_note', 'product'])
        self.assertFalse(invoice._get_unbalanced_moves({'records': invoice}))

    def test_replacement_edit_keeps_original_reversal_and_receipt_history(self):
        invoice = self.invoice()
        invoice.action_post()
        loaded = self.moves.qorlia_reversal_load(invoice.id)
        review = self.moves.qorlia_reversal_preview(invoice.id, loaded['source_version'],
            {**loaded['values'], 'refund_method': 'modify'})
        result = self.moves.qorlia_reversal_run(invoice.id, review['version'], review['values'])
        replacement = self.moves.browse(result['replacements'][0]['id'])
        credit = self.moves.browse(result['credits'][0]['id'])
        preview = self.preview(replacement, {'field': 'price_unit', 'line': 0},
            lambda payload: payload['lines'][0]['values'].update(price_unit=400))
        self.save(preview)
        self.assertEqual(replacement.state, 'draft')
        self.assertEqual(replacement.invoice_total, 840)
        self.assertEqual(invoice.state, 'posted')
        self.assertEqual(invoice.amount_residual, 0)
        self.assertEqual(credit.state, 'posted')
        self.assertEqual(credit.invoice_total, 1050)

    def test_native_cashier_can_edit_and_tampered_review_is_rejected(self):
        invoice = self.invoice()
        user = self.env['res.users'].with_context(no_reset_password=True).create({
            'name': 'QorliaQA Draft cashier', 'login': 'qorliaqa-draft-cashier',
            'groups_id': [Command.set(self.env.ref('account.group_account_invoice').ids)],
            'company_id': self.env.company.id, 'company_ids': [Command.set(self.env.company.ids)]})
        moves = self.moves.with_user(user)
        payload = self.payload(moves.qorlia_invoice_draft_load(invoice.id))
        payload['values']['ref'] = 'QorliaQA cashier correction'
        preview = moves.qorlia_invoice_draft_preview(payload, {'field': 'ref'})
        with self.assertRaises(UserError):
            moves.qorlia_invoice_draft_save(self.payload(preview), '0' * 64)
        saved = moves.qorlia_invoice_draft_save(self.payload(preview), preview['review_version'])
        self.assertEqual(saved['values']['ref'], 'QorliaQA cashier correction')

    def test_generated_lines_and_numeric_or_unit_injections_are_rejected(self):
        invoice = self.invoice()
        for name, value in (('price_unit', float('nan')), ('quantity', True), ('debit', 1),
                            ('product_uom_id', True), ('display_type', 'payment_term')):
            payload = self.payload(self.moves.qorlia_invoice_draft_load(invoice.id))
            payload['lines'][0]['values'][name] = value
            with self.assertRaises(ValidationError):
                self.moves.qorlia_invoice_draft_preview(payload)
        payload = self.payload(self.moves.qorlia_invoice_draft_load(invoice.id))
        payload['lines'][0]['values'].update(product_id=self.product.id,
            product_uom_id=self.env.ref('uom.product_uom_hour').id)
        with self.assertRaises(ValidationError):
            self.moves.qorlia_invoice_draft_preview(payload)
        invoice.write({'discount_type': 'fixed', 'discount': 25, 'disc_acc_id': self.adjustment.id})
        invoice._qorlia_prepare_adjustment_lines()
        payload = self.payload(self.moves.qorlia_invoice_draft_load(invoice.id))
        payload['lines'][0]['id'] = invoice.invoice_line_ids.filtered('qorlia_adjustment_kind').id
        with self.assertRaises(ValidationError):
            self.moves.qorlia_invoice_draft_preview(payload)

    def test_native_cash_rounding_and_included_tax(self):
        self.tax.price_include = True
        rounding = self.env['account.cash.rounding'].create({'name': 'QorliaQA Draft round',
            'rounding': 1, 'rounding_method': 'HALF-UP', 'strategy': 'add_invoice_line',
            'profit_account_id': self.adjustment.id, 'loss_account_id': self.adjustment.id})
        invoice = self.invoice(invoice_cash_rounding_id=rounding.id)
        preview = self.preview(invoice, {'field': 'price_unit', 'line': 0},
            lambda payload: payload['lines'][0]['values'].update(price_unit=105.12))
        self.assertEqual(preview['totals']['invoice_total'], 210)
        self.save(preview)
        invoice.action_post()
        self.assertEqual(invoice.amount_total, 210)
        self.assertFalse(invoice._get_unbalanced_moves({'records': invoice}))

    def test_global_rounding_and_early_discount_follow_native_engine(self):
        self.env.company.tax_calculation_rounding_method = 'round_globally'
        term = self.env['account.payment.term'].create({'name': 'QorliaQA Draft early discount',
            'line_ids': [Command.create({'value': 'balance', 'days': 30,
                                         'discount_percentage': 2, 'discount_days': 10})]})
        invoice = self.invoice(invoice_payment_term_id=term.id)
        preview = self.preview(invoice, {'field': 'price_unit', 'line': 0},
            lambda payload: payload['lines'][0]['values'].update(price_unit=501.13))
        self.save(preview)
        invoice.action_post()
        self.assertTrue(invoice.line_ids.filtered(lambda line: line.display_type == 'payment_term').discount_date)
        self.assertEqual(invoice.invoice_total, preview['totals']['invoice_total'])
        self.assertFalse(invoice._get_unbalanced_moves({'records': invoice}))

    def test_choices_are_company_scoped_and_new_tax_review_rejects_config_change(self):
        invoice = self.invoice()
        choices = self.moves.qorlia_invoice_draft_choices(invoice.id, 'journal')
        for journal in self.env['account.journal'].browse([item[0] for item in choices]):
            self.assertEqual(journal.company_id, invoice.company_id)
            self.assertEqual(journal.type, 'sale')
        units = self.moves.qorlia_invoice_draft_choices(invoice.id, 'unit', product_id=self.product.id)
        self.assertTrue(units)
        for unit in self.env['uom.uom'].browse([item[0] for item in units]):
            self.assertEqual(unit.category_id, self.product.uom_id.category_id)
        for kind in ('customer', 'shipping', 'product', 'currency', 'account', 'discount_account', 'tax',
                     'payment_term', 'fiscal_position', 'bank', 'incoterm', 'cash_rounding', 'salesperson', 'analytic'):
            self.moves.qorlia_invoice_draft_choices(invoice.id, kind)
        with self.assertRaises(ValidationError):
            self.moves.qorlia_invoice_draft_choices(invoice.id, 'res.users')
        with self.assertRaises(ValidationError):
            self.moves.qorlia_invoice_draft_choices(invoice.id, 'unit', product_id=True)
        candidate = self.tax.copy({'name': 'QorliaQA Draft candidate tax', 'amount': 10})
        preview = self.preview(invoice, {'field': 'tax_ids', 'line': 0},
            lambda payload: payload['lines'][0]['values'].update(tax_ids=candidate.ids))
        candidate.amount = 11
        with self.assertRaises(UserError):
            self.save(preview)
