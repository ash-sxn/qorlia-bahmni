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

    def request(self, payload=None):
        payload = payload or self.payload()
        return {'payload': payload, 'review_version': self.payments.qorlia_customer_payment_draft_preview(payload)['review_version'],
                'request_key': str(uuid.uuid4())}

    def test_create_saves_reviewed_draft_and_native_balanced_ledger_without_reconciliation(self):
        invoice, credit = self.invoice(), self.invoice(100, move_type='out_refund')
        request = self.request()
        review = self.payments.qorlia_customer_payment_draft_preview(request['payload'])
        with patch.object(type(self.payments), 'action_post') as post:
            result = self.payments.qorlia_customer_payment_draft_save(**request)
        post.assert_not_called()
        self.assertTrue(result['accepted'])
        payment = self.payments.browse(result['payment']['payment_id'])
        self.assertEqual(payment.state, 'draft')
        self.assertFalse(payment.move_id._get_unbalanced_moves({'records': payment.move_id}))
        self.assertEqual((invoice.amount_residual, credit.amount_residual), (500, 100))
        saved = self.payments.qorlia_customer_payment_draft_load(payment.id)
        self.assertEqual(saved['values'], review['values'])
        self.assertEqual(saved['allocations'], review['allocations'])
        self.assertEqual(saved['totals'], review['totals'])

    def test_exact_creation_retry_and_status_do_not_duplicate_or_restore_old_state(self):
        self.invoice()
        request = self.request()
        self.assertFalse(self.payments.qorlia_customer_payment_draft_status(**request)['accepted'])
        first = self.payments.qorlia_customer_payment_draft_save(**request)
        payment = self.payments.browse(first['payment']['payment_id'])
        payment.ref = 'QorliaQA Later reference'
        payment.with_context(default_partner_type='customer').action_post()
        before = self.payments.search_count([])
        retry = self.payments.qorlia_customer_payment_draft_save(**request)
        status = self.payments.qorlia_customer_payment_draft_status(**request)
        self.assertEqual(retry, status)
        self.assertEqual(status['payment']['state'], 'posted')
        self.assertEqual(self.payments.search_count([]), before)
        self.assertEqual(payment.ref, 'QorliaQA Later reference')
        changed = {**request, 'payload': {**request['payload'], 'values': {**request['payload']['values'], 'amount': 101}}}
        with self.assertRaises(ValidationError):
            self.payments.qorlia_customer_payment_draft_status(**changed)
        with self.assertRaises(ValidationError):
            self.payments.qorlia_customer_payment_draft_save(**changed)

    def test_edit_draft_uses_native_write_and_exact_recovery(self):
        self.invoice()
        created = self.payments.qorlia_customer_payment_draft_save(**self.request())
        payment = self.payments.browse(created['payment']['payment_id'])
        loaded = self.payments.qorlia_customer_payment_draft_load(payment.id)
        request = self.request({'id': payment.id, 'version': loaded['version'],
                                'values': {**loaded['values'], 'amount': 150, 'bank_reference': 'QorliaQA Bank'}})
        with patch.object(type(payment), 'action_post') as post:
            result = self.payments.qorlia_customer_payment_draft_save(**request)
        post.assert_not_called()
        self.assertEqual(result['payment']['amount'], 150)
        self.assertEqual(payment.bank_reference, 'QorliaQA Bank')
        self.assertEqual(payment.outstanding_invoice_lines.allocated_amount, 150)
        payment.ref = 'QorliaQA Further edit'
        status = self.payments.qorlia_customer_payment_draft_status(**request)
        self.assertTrue(status['accepted'])
        self.assertEqual(self.payments.qorlia_customer_payment_draft_save(**request), status)
        self.assertEqual(payment.ref, 'QorliaQA Further edit')

    def test_stale_creation_review_is_denied_before_any_payment_is_created(self):
        invoice = self.invoice()
        request = self.request()
        invoice.ref = 'QorliaQA Invoice changed after review'
        before = self.payments.search_count([])
        with self.assertRaises(UserError):
            self.payments.qorlia_customer_payment_draft_save(**request)
        self.assertEqual(self.payments.search_count([]), before)
        self.assertFalse(self.payments.qorlia_customer_payment_draft_status(**request)['accepted'])

    def test_same_transaction_journal_configuration_change_invalidates_review(self):
        self.invoice()
        request = self.request()
        self.journal.active = False
        with self.assertRaises(UserError):
            self.payments.qorlia_customer_payment_draft_save(**request)

    def test_unknown_invalid_and_missing_request_values_are_denied(self):
        self.invoice()
        request = self.request()
        for changed in ({'request_key': 'invalid'}, {'review_version': False}, {'payload': []},
                        {'payload': {**request['payload'], 'id': True}}):
            with self.assertRaises(ValidationError):
                self.payments.qorlia_customer_payment_draft_save(**{**request, **changed})
        values = dict(request['payload']['values'])
        values.pop('ref')
        with self.assertRaises(ValidationError):
            self.payments.qorlia_customer_payment_draft_preview({**request['payload'], 'values': values})

    def test_choices_use_native_company_journal_method_and_bank_domains(self):
        values = self.payload()['values']
        choices = self.payments.qorlia_customer_payment_draft_choices
        self.assertIn(self.journal.id, [item[0] for item in choices(values, 'journal')])
        self.assertIn(self.method.id, [item[0] for item in choices(values, 'method')])
        outbound = self.journal.outbound_payment_method_line_ids.filtered(lambda row: row.code == 'manual')[:1]
        self.assertNotIn(outbound.id, [item[0] for item in choices(values, 'method')])
        self.assertIn(self.customer.id, [item[0] for item in choices(values, 'customer', 'Draft payment customer')])
        self.assertEqual(choices(values, 'bank'), [])
        for kind in ('unsafe', []):
            with self.assertRaises(ValidationError):
                choices(values, kind)

    def test_native_auto_date_is_locked_but_effective_date_is_editable(self):
        self.invoice()
        with self.assertRaisesRegex(ValidationError, 'accounting date'):
            self.preview(date='2026-01-02')
        preview = self.preview(effective_date='2026-12-01')
        self.assertTrue(preview['date_readonly'])
        self.assertEqual(preview['values']['effective_date'], '2026-12-01')
        self.env['ir.config_parameter'].set_param('bahmni_auto_payment_reconciliation.enabled', '')
        self.assertFalse(self.preview(date='2026-01-02')['date_readonly'])

    def test_new_request_cannot_edit_posted_or_stale_draft(self):
        self.invoice()
        created = self.payments.qorlia_customer_payment_draft_save(**self.request())
        payment = self.payments.browse(created['payment']['payment_id'])
        loaded = self.payments.qorlia_customer_payment_draft_load(payment.id)
        request = self.request({'id': payment.id, 'version': loaded['version'], 'values': loaded['values']})
        payment.ref = 'QorliaQA Concurrent change'
        with self.assertRaises(UserError):
            self.payments.qorlia_customer_payment_draft_save(**request)
        payment.with_context(default_partner_type='customer').action_post()
        with self.assertRaises(UserError):
            self.payments.qorlia_customer_payment_draft_save(**request)

    def test_creation_key_cannot_be_replayed_by_another_author(self):
        self.invoice()
        request = self.request()
        self.payments.qorlia_customer_payment_draft_save(**request)
        user = self.env['res.users'].with_context(no_reset_password=True).create({'name': 'QorliaQA Other draft author',
            'login': 'qorliaqa-draft-author-' + str(uuid.uuid4()), 'company_id': self.env.company.id,
            'company_ids': [Command.set(self.env.company.ids)],
            'groups_id': [Command.set(self.env.ref('account.group_account_invoice').ids)]})
        with self.assertRaises(ValidationError):
            self.payments.with_user(user).qorlia_customer_payment_draft_status(**request)

    def test_hidden_creation_receipt_does_not_allow_duplicate_creation(self):
        self.invoice()
        request = self.request()
        result = self.payments.qorlia_customer_payment_draft_save(**request)
        self.env['ir.rule'].create({'name': 'QorliaQA Hidden payment receipt', 'model_id': self.env['ir.model']._get_id('account.payment'),
            'domain_force': "[('id', '!=', %s)]" % result['payment']['payment_id']})
        user = self.env['res.users'].with_context(no_reset_password=True).create({'name': 'QorliaQA Receipt reader',
            'login': 'qorliaqa-draft-hidden-' + str(uuid.uuid4()), 'company_id': self.env.company.id,
            'company_ids': [Command.set(self.env.company.ids)],
            'groups_id': [Command.set(self.env.ref('account.group_account_invoice').ids)]})
        with self.assertRaises(AccessError):
            self.payments.with_user(user).qorlia_customer_payment_draft_save(**request)

    def test_previously_posted_draft_keeps_its_journal_and_original_auto_date(self):
        self.invoice()
        result = self.payments.qorlia_customer_payment_draft_save(**self.request())
        payment = self.payments.browse(result['payment']['payment_id']).with_context(default_partner_type='customer')
        payment.action_post()
        payment.action_draft()
        self.assertTrue(payment.posted_before)
        loaded = self.payments.qorlia_customer_payment_draft_load(payment.id)
        self.assertTrue(loaded['journal_readonly'])
        self.assertTrue(loaded['date_readonly'])
        other = self.env['account.journal'].create({'name': 'QorliaQA Replacement bank', 'code': 'QDRP', 'type': 'bank'})
        method = other.inbound_payment_method_line_ids.filtered(lambda row: row.code == 'manual')[:1]
        with self.assertRaisesRegex(ValidationError, 'original journal'):
            self.payments.qorlia_customer_payment_draft_preview({'id': payment.id, 'version': loaded['version'],
                'values': {**loaded['values'], 'journal_id': other.id, 'payment_method_line_id': method.id}})
        reviewed = self.payments.qorlia_customer_payment_draft_preview({'id': payment.id, 'version': loaded['version'],
            'values': {**loaded['values'], 'amount': 150}})
        self.assertEqual(reviewed['values']['date'], loaded['values']['date'])

    def test_unexpected_native_creation_detail_rolls_back_the_draft_and_move(self):
        self.invoice()
        request = self.request()
        before = (self.payments.search_count([]), self.env['account.move'].search_count([]))
        create = type(self.payments).create

        def unexpected(model, values):
            saved = create(model, values)
            saved.bank_reference = 'QorliaQA Unexpected native detail'
            return saved

        with patch.object(type(self.payments), 'create', unexpected), self.assertRaisesRegex(UserError, 'unreviewed detail'):
            self.payments.qorlia_customer_payment_draft_save(**request)
        self.assertEqual((self.payments.search_count([]), self.env['account.move'].search_count([])), before)
        self.assertFalse(self.payments.qorlia_customer_payment_draft_status(**request)['accepted'])

    def test_readonly_role_cannot_save_a_new_or_existing_draft(self):
        self.invoice()
        request = self.request()
        created = self.payments.qorlia_customer_payment_draft_save(**request)
        loaded = self.payments.qorlia_customer_payment_draft_load(created['payment']['payment_id'])
        edit = self.request({'id': loaded['id'], 'version': loaded['version'], 'values': {**loaded['values'], 'amount': 150}})
        reader = self.env['res.users'].with_context(no_reset_password=True).create({'name': 'QorliaQA Save reader',
            'login': 'qorliaqa-save-reader-' + str(uuid.uuid4()), 'company_id': self.env.company.id,
            'company_ids': [Command.set(self.env.company.ids)],
            'groups_id': [Command.set(self.env.ref('account.group_account_readonly').ids)]})
        for pending in ({**request, 'request_key': str(uuid.uuid4())}, edit):
            with self.assertRaises(AccessError):
                self.payments.with_user(reader).qorlia_customer_payment_draft_save(**pending)

    def test_new_load_uses_native_computed_form_defaults(self):
        loaded = self.payments.qorlia_customer_payment_draft_load()
        self.assertTrue(loaded['values']['journal_id'])
        self.assertTrue(loaded['values']['payment_method_line_id'])
        self.assertEqual(loaded['values']['currency_id'], self.env.company.currency_id.id)
        self.assertFalse(loaded['values']['partner_id'])

    def test_journal_onchange_uses_native_method_currency_and_bank_without_write(self):
        currency = self.env.ref('base.EUR')
        currency.active = True
        other = self.env['account.journal'].create({'name': 'QorliaQA Form currency bank', 'code': 'QDCU',
            'type': 'bank', 'currency_id': currency.id})
        bank = self.env['res.partner.bank'].create({'acc_number': 'QorliaQA-Form-Bank',
            'partner_id': self.env.company.partner_id.id, 'company_id': self.env.company.id})
        other.bank_account_id = bank
        payload = self.payload(journal_id=other.id, amount=0, partner_id=False)
        before = (self.payments.search_count([]), self.env['account.move'].search_count([]))
        form = self.payments.qorlia_customer_payment_draft_onchange(payload, 'journal_id')
        method = other.inbound_payment_method_line_ids[:1]
        self.assertEqual(form['values']['journal_id'], other.id)
        self.assertEqual(form['values']['payment_method_line_id'], method.id)
        self.assertEqual(form['values']['currency_id'], currency.id)
        self.assertEqual(form['values']['partner_bank_id'], bank.id)
        self.assertEqual((self.payments.search_count([]), self.env['account.move'].search_count([])), before)
        self.assertNotIn('ledger', form)

    def test_direction_onchange_uses_outbound_method_and_customer_bank(self):
        self.invoice()
        bank = self.env['res.partner.bank'].create({'acc_number': 'QorliaQA-Customer-Bank', 'partner_id': self.customer.id})
        form = self.payments.qorlia_customer_payment_draft_onchange(self.payload(payment_type='outbound'), 'payment_type')
        self.assertEqual(form['values']['payment_type'], 'outbound')
        self.assertEqual(form['values']['payment_method_line_id'], self.journal.outbound_payment_method_line_ids[:1].id)
        self.assertEqual(form['values']['partner_bank_id'], bank.id)
        native = self.payments.new({**form['values'], 'partner_type': 'customer', 'is_internal_transfer': False})
        self.assertEqual(form['show_bank'], native.show_partner_bank_account)
        self.assertEqual(form['require_bank'], native.require_partner_bank_account)

    def test_saved_customer_onchange_never_unlinks_native_allocation_rows(self):
        invoice = self.invoice()
        saved = self.payments.qorlia_customer_payment_draft_save(**self.request())
        payment = self.payments.browse(saved['payment']['payment_id'])
        rows = payment.outstanding_invoice_lines
        original = rows.read(['invoice_id', 'allocated_amount', 'remaining_amt', 'selected'])
        customer = self.env['res.partner'].create({'name': 'QorliaQA Different form customer'})
        loaded = self.payments.qorlia_customer_payment_draft_load(payment.id)
        form = self.payments.qorlia_customer_payment_draft_onchange({'id': payment.id, 'version': loaded['version'],
            'values': {**loaded['values'], 'partner_id': customer.id, 'amount': 0}}, 'partner_id')
        self.env.flush_all()
        self.assertEqual(rows.read(['invoice_id', 'allocated_amount', 'remaining_amt', 'selected']), original)
        self.assertEqual(payment.partner_id, self.customer)
        self.assertEqual(invoice.amount_residual, 500)
        self.assertFalse(form['allocations']['outstanding'])
        self.assertEqual(form['values']['partner_id'], customer.id)
        self.assertEqual(form['totals']['current_outstanding'], 0)

    def test_onchange_rejects_unsupported_field_and_stale_saved_form(self):
        payload = self.payload()
        for field in (False, 'outstanding_invoice_lines', 'partner_type', 'state'):
            with self.assertRaises(ValidationError):
                self.payments.qorlia_customer_payment_draft_onchange(payload, field)
        self.invoice()
        saved = self.payments.qorlia_customer_payment_draft_save(**self.request())
        loaded = self.payments.qorlia_customer_payment_draft_load(saved['payment']['payment_id'])
        self.payments.browse(loaded['id']).ref = 'QorliaQA Changed form'
        with self.assertRaisesRegex(UserError, 'changed'):
            self.payments.qorlia_customer_payment_draft_onchange({'id': loaded['id'], 'version': loaded['version'],
                'values': loaded['values']}, 'ref')

    def test_onchange_rejects_native_auto_date_and_previously_posted_journal_edits(self):
        with self.assertRaisesRegex(ValidationError, 'accounting date'):
            self.payments.qorlia_customer_payment_draft_onchange(self.payload(date='2026-01-01'), 'date')
        self.invoice()
        saved = self.payments.qorlia_customer_payment_draft_save(**self.request())
        payment = self.payments.browse(saved['payment']['payment_id']).with_context(default_partner_type='customer')
        payment.action_post()
        payment.action_draft()
        loaded = self.payments.qorlia_customer_payment_draft_load(payment.id)
        other = self.env['account.journal'].create({'name': 'QorliaQA Wrong form journal', 'code': 'QDWF', 'type': 'cash'})
        with self.assertRaisesRegex(ValidationError, 'original journal'):
            self.payments.qorlia_customer_payment_draft_onchange({'id': payment.id, 'version': loaded['version'],
                'values': {**loaded['values'], 'journal_id': other.id}}, 'journal_id')

    def test_onchange_preserves_native_amount_limit_and_effective_date(self):
        self.invoice(50)
        with self.assertRaises(ValidationError):
            self.payments.qorlia_customer_payment_draft_onchange(self.payload(amount=100), 'amount')
        form = self.payments.qorlia_customer_payment_draft_onchange(
            self.payload(amount=20, effective_date='2026-10-20'), 'effective_date')
        self.assertEqual(form['values']['effective_date'], '2026-10-20')
        self.assertEqual(form['totals']['balance_outstanding'], 30)

    def test_readonly_role_cannot_run_payment_form_onchange(self):
        reader = self.env['res.users'].with_context(no_reset_password=True).create({'name': 'QorliaQA Form reader',
            'login': 'qorliaqa-form-reader-' + str(uuid.uuid4()), 'company_id': self.env.company.id,
            'company_ids': [Command.set(self.env.company.ids)],
            'groups_id': [Command.set(self.env.ref('account.group_account_readonly').ids)]})
        with self.assertRaises(AccessError):
            self.payments.with_user(reader).qorlia_customer_payment_draft_onchange(self.payload(), 'partner_id')
