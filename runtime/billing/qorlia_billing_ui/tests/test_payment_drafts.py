# SPDX-License-Identifier: LGPL-3.0-or-later
import uuid
from unittest.mock import patch

from odoo import Command, fields
from odoo.exceptions import AccessError, UserError, ValidationError
from odoo.tests import TransactionCase, tagged


@tagged('post_install', '-at_install')
class PaymentDraftTest(TransactionCase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.payments = cls.env['account.payment']
        cls.customer = cls.env['res.partner'].create({'name': 'QorliaQA Draft payment customer'})
        cls.income = cls.env['account.account'].search([('company_id', '=', cls.env.company.id), ('account_type', '=', 'income')], limit=1)
        cls.journal = cls.env['account.journal'].create({'name': 'QorliaQA Draft bank', 'code': 'QDRAF', 'type': 'bank'})
        cls.method = cls.journal.inbound_payment_method_line_ids.filtered(lambda row: row.code == 'manual')[:1]
        cls.env['ir.config_parameter'].set_param('bahmni_auto_payment_reconciliation.enabled', 'True')

    def invoice(self, amount=500, **values):
        invoice = self.env['account.move'].create({'move_type': 'out_invoice', 'partner_id': self.customer.id,
            'invoice_date': fields.Date.today(), 'invoice_line_ids': [Command.create({'name': 'QorliaQA Draft service',
                'account_id': self.income.id, 'price_unit': amount, 'quantity': 1, 'tax_ids': [Command.clear()]})], **values})
        invoice.action_post()
        return invoice

    def payload(self, **values):
        loaded = self.payments.qorlia_customer_payment_draft_load()
        return {'id': False, 'version': False, 'values': {**loaded['values'], 'partner_id': self.customer.id,
            'journal_id': self.journal.id, 'payment_method_line_id': self.method.id,
            'currency_id': self.env.company.currency_id.id, 'amount': 100, **values}}

    def preview(self, **values):
        return self.payments.qorlia_customer_payment_draft_preview(self.payload(**values))

    def test_new_preview_uses_native_readonly_allocation_without_financial_write(self):
        invoice, credit = self.invoice(), self.invoice(100, move_type='out_refund')
        models = ('account.payment', 'account.move', 'account.move.line', 'account.partial.reconcile',
                  'account.payment.outstanding.invoice.line', 'account.payment.credit.invoice.line')
        before = {model: self.env[model].search_count([]) for model in models}
        preview = self.preview()
        self.env.flush_all()
        self.assertEqual({model: self.env[model].search_count([]) for model in models}, before)
        self.assertTrue(preview['auto_allocate'])
        self.assertEqual(preview['totals'], {'current_outstanding': 400, 'balance_outstanding': 300})
        outstanding, credits = preview['allocations']['outstanding'], preview['allocations']['credits']
        self.assertEqual([(row['invoice_id'], row['allocated_amount'], row['remaining_amount'], row['selected'])
                          for row in outstanding], [(invoice.id, 200, 300, True)])
        self.assertEqual([(row['invoice_id'], row['allocated_amount']) for row in credits], [(credit.id, 100)])
        self.assertEqual((invoice.amount_residual, credit.amount_residual), (500, 100))
        self.assertEqual(len(preview['review_version']), 64)

    def test_preview_existing_draft_preserves_saved_allocation_rows(self):
        invoice = self.invoice()
        payment = self.payments.create({**self.payload()['values'], 'partner_type': 'customer',
            'outstanding_invoice_lines': [Command.create({'invoice_id': invoice.id, 'partner_id': self.customer.id,
                'invoice_amt': 500, 'selected': True, 'allocated_amount': 100, 'remaining_amt': 400})]})
        loaded = self.payments.qorlia_customer_payment_draft_load(payment.id)
        line = payment.outstanding_invoice_lines
        before = line.read(['invoice_id', 'selected', 'allocated_amount', 'remaining_amt'])
        with patch.object(type(payment), 'action_post') as post:
            preview = self.payments.qorlia_customer_payment_draft_preview({
                'id': payment.id, 'version': loaded['version'], 'values': {**loaded['values'], 'amount': 150}})
            post.assert_not_called()
        self.env.flush_all()
        self.assertEqual(line.read(['invoice_id', 'selected', 'allocated_amount', 'remaining_amt']), before)
        self.assertEqual(payment.amount, 100)
        self.assertEqual(payment.state, 'draft')
        self.assertEqual(preview['allocations']['outstanding'][0]['allocated_amount'], 150)

    def test_review_changes_when_document_balance_or_payment_amount_changes(self):
        invoice = self.invoice()
        first = self.preview()
        self.assertEqual(self.preview()['review_version'], first['review_version'])
        self.assertNotEqual(self.preview(amount=150)['review_version'], first['review_version'])
        invoice.ref = 'QorliaQA Updated document'
        self.assertNotEqual(self.preview()['review_version'], first['review_version'])

    def test_other_company_balances_do_not_enter_native_onchange(self):
        self.invoice()
        other = self.env['res.company'].create({'name': 'QorliaQA Other payment company', 'currency_id': self.env.company.currency_id.id})
        context = {'allowed_company_ids': [self.env.company.id, other.id]}
        income = self.env['account.account'].with_context(**context).create({'name': 'QorliaQA Other income',
            'code': 'QOI', 'account_type': 'income', 'company_id': other.id})
        receivable = self.env['account.account'].with_context(**context).create({'name': 'QorliaQA Other receivable',
            'code': 'QOR', 'account_type': 'asset_receivable', 'reconcile': True, 'company_id': other.id})
        self.customer.with_company(other).property_account_receivable_id = receivable
        journal = self.env['account.journal'].with_context(**context).create({'name': 'QorliaQA Other sales', 'code': 'QOS',
            'type': 'sale', 'company_id': other.id})
        foreign = self.env['account.move'].with_context(**context).with_company(other).create({
            'move_type': 'out_refund', 'partner_id': self.customer.id, 'company_id': other.id,
            'journal_id': journal.id, 'invoice_date': fields.Date.today(),
            'invoice_line_ids': [Command.create({'name': 'QorliaQA Foreign credit', 'account_id': income.id,
                'quantity': 1, 'price_unit': 900, 'tax_ids': [Command.clear()]})]})
        foreign.action_post()
        preview = self.payments.with_context(**context).qorlia_customer_payment_draft_preview(self.payload())
        self.assertEqual(preview['totals'], {'current_outstanding': 500, 'balance_outstanding': 400})
        self.assertFalse(preview['allocations']['credits'])
        self.assertEqual(foreign.amount_residual, 900)

    def test_hidden_documents_are_not_in_balances_or_allocations(self):
        visible, hidden = self.invoice(), self.invoice(900)
        cashier = self.env['res.users'].with_context(no_reset_password=True).create({'name': 'QorliaQA Draft cashier',
            'login': 'qorliaqa-draft-' + str(uuid.uuid4()), 'company_id': self.env.company.id,
            'company_ids': [Command.set(self.env.company.ids)],
            'groups_id': [Command.set(self.env.ref('account.group_account_invoice').ids)]})
        self.env['ir.rule'].create({'name': 'QorliaQA Hidden draft payment invoice',
            'model_id': self.env['ir.model']._get_id('account.move'), 'domain_force': "[('id', '!=', %s)]" % hidden.id})
        preview = self.payments.with_user(cashier).qorlia_customer_payment_draft_preview(self.payload())
        self.assertEqual(preview['totals']['current_outstanding'], 500)
        self.assertEqual([row['invoice_id'] for row in preview['allocations']['outstanding']], [visible.id])

    def test_invalid_or_caller_controlled_fields_are_rejected(self):
        self.invoice()
        for values in ({'amount': -1}, {'amount': float('nan')}, {'amount': True}, {'date': '2026-02-31'},
                       {'effective_date': 'not-a-date'}, {'payment_type': 'transfer'}, {'company_id': True},
                       {'outstanding_invoice_lines': []}, {'partner_type': 'supplier'}, {'is_internal_transfer': True}):
            with self.assertRaises(UserError):
                self.preview(**values)

    def test_excess_amount_is_native_rejection_without_posting(self):
        self.invoice(50)
        with self.assertRaises(ValidationError), patch.object(type(self.payments), 'action_post') as post:
            self.preview(amount=100)
        post.assert_not_called()

    def test_stale_draft_or_posted_payment_cannot_be_previewed(self):
        payment = self.payments.create({**self.payload()['values'], 'partner_type': 'customer'})
        loaded = self.payments.qorlia_customer_payment_draft_load(payment.id)
        payment.ref = 'QorliaQA Changed'
        with self.assertRaises(UserError):
            self.payments.qorlia_customer_payment_draft_preview({
                'id': payment.id, 'version': loaded['version'], 'values': loaded['values']})
        payment.action_post()
        with self.assertRaises(UserError):
            self.payments.qorlia_customer_payment_draft_load(payment.id)

    def test_journal_direction_mismatch_is_rejected(self):
        self.invoice()
        other = self.env['account.journal'].create({'name': 'QorliaQA Another bank', 'code': 'QDB2', 'type': 'bank'})
        with self.assertRaises(ValidationError):
            self.preview(journal_id=other.id)
        with self.assertRaises(ValidationError):
            self.preview(payment_type='outbound')

    def test_disabled_native_auto_allocation_does_not_invent_rows_or_balances(self):
        self.invoice()
        self.env['ir.config_parameter'].set_param('bahmni_auto_payment_reconciliation.enabled', '')
        preview = self.preview(amount=900)
        self.assertFalse(preview['auto_allocate'])
        self.assertEqual(preview['allocations'], {'outstanding': [], 'credits': []})

    def test_readonly_account_cannot_create_or_preview_an_edit(self):
        payment = self.payments.create({**self.payload()['values'], 'partner_type': 'customer'})
        reader = self.env['res.users'].with_context(no_reset_password=True).create({'name': 'QorliaQA Draft reader',
            'login': 'qorliaqa-draft-reader-' + str(uuid.uuid4()), 'company_id': self.env.company.id,
            'company_ids': [Command.set(self.env.company.ids)],
            'groups_id': [Command.set(self.env.ref('account.group_account_readonly').ids)]})
        model = self.payments.with_user(reader)
        with self.assertRaises(AccessError):
            model.qorlia_customer_payment_draft_load()
        loaded = model.qorlia_customer_payment_draft_load(payment.id)
        with self.assertRaises(AccessError):
            model.qorlia_customer_payment_draft_preview({'id': payment.id, 'version': loaded['version'], 'values': loaded['values']})

    def test_mixed_currency_auto_allocation_is_not_silently_added(self):
        currency = self.env['res.currency'].search([('id', '!=', self.env.company.currency_id.id)], limit=1)
        self.assertTrue(currency)
        currency.active = True
        invoice = self.invoice(currency_id=currency.id)
        with self.assertRaisesRegex(UserError, 'Mixed-currency'):
            self.preview()
        self.assertEqual(invoice.amount_residual, 500)

    def test_payment_company_outside_active_companies_is_denied(self):
        foreign = self.env['res.company'].create({'name': 'QorliaQA Inactive draft company'})
        with self.assertRaises(AccessError):
            self.payments.with_context(allowed_company_ids=[self.env.company.id]).qorlia_customer_payment_draft_preview(
                self.payload(company_id=foreign.id))
