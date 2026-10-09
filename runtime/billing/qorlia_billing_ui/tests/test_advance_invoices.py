# SPDX-License-Identifier: LGPL-3.0-or-later
import uuid

from odoo import Command
from odoo.exceptions import AccessError, UserError, ValidationError
from odoo.tests import TransactionCase, tagged


@tagged('post_install', '-at_install')
class AdvanceInvoiceTest(TransactionCase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.orders = cls.env['sale.order']
        cls.customer = cls.env['res.partner'].create({
            'name': 'QorliaQA Advance customer', 'customer_rank': 1})
        cls.product = cls.env['product.product'].create({'name': 'QorliaQA Advance consultation',
            'type': 'service', 'list_price': 500, 'invoice_policy': 'order', 'taxes_id': [Command.clear()]})
        cls.account = cls.env['account.account'].search([
            ('company_id', '=', cls.env.company.id), ('deprecated', '=', False),
            ('account_type', '=', 'income')], limit=1)
        assert cls.account
        cls.deposit = cls.env['product.product'].create({'name': 'QorliaQA Advance deposit',
            'type': 'service', 'invoice_policy': 'order', 'taxes_id': [Command.clear()],
            'property_account_income_id': cls.account.id})
        cls.shop = cls.env['sale.shop'].search([('company_id', '=', cls.env.company.id)], limit=1)
        assert cls.shop and cls.shop.pricelist_id
        cls.env['ir.config_parameter'].set_param('sale.default_deposit_product_id', cls.deposit.id)
        cls.env['ir.config_parameter'].set_param('bahmni_sale.is_invoice_automated', False)

    def order(self, tax=False):
        order = self.orders.create({'partner_id': self.customer.id, 'shop_id': self.shop.id,
            'pricelist_id': self.shop.pricelist_id.id, 'warehouse_id': self.shop.warehouse_id.id,
            'payment_term_id': self.shop.payment_default_id.id,
            'order_line': [Command.create({'product_id': self.product.id, 'name': self.product.name,
                'product_uom_qty': 1, 'price_unit': 500, 'tax_id': [Command.set(tax.ids if tax else [])]})]})
        order.action_confirm()
        self.assertFalse(order.invoice_ids)
        return order

    def values(self, **changes):
        return {'advance_payment_method': 'percentage', 'amount': 50.0, 'fixed_amount': 0.0,
                'deposit_account_id': False, 'deposit_taxes_id': [], **changes}

    def save(self, order, values=None):
        values = self.values() if values is None else values
        review = self.orders.qorlia_advance_preview(order.id, values)
        key = str(uuid.uuid4())
        return review, key, self.orders.qorlia_advance_save(order.id, values, review['review_version'], key)

    def user(self, groups, suffix):
        return self.env['res.users'].with_context(no_reset_password=True).create({
            'name': 'QorliaQA Advance ' + suffix, 'login': 'qorliaqa-advance-' + suffix,
            'email': 'qorliaqa-advance-' + suffix + '@example.invalid',
            'company_id': self.env.company.id, 'company_ids': [Command.set(self.env.company.ids)],
            'groups_id': [Command.set([self.env.ref(name).id for name in groups])]})

    def test_percentage_read_only_review_balanced_draft_and_exact_retry(self):
        order = self.order()
        counts = {name: self.env[name].search_count([]) for name in (
            'account.move', 'sale.order.line', 'product.product', 'sale.advance.payment.inv', 'account.payment')}
        version = order._qorlia_workflow_snapshot()['version']
        review = self.orders.qorlia_advance_preview(order.id, self.values())
        self.assertEqual(review['invoice']['totals']['invoice_total'], 250)
        self.assertEqual(review['review_version'], self.orders.qorlia_advance_preview(order.id, self.values())['review_version'])
        self.assertEqual(order._qorlia_workflow_snapshot()['version'], version)
        for name, count in counts.items():
            self.assertEqual(self.env[name].search_count([]), count, name)
        key = str(uuid.uuid4())
        saved = self.orders.qorlia_advance_save(order.id, self.values(), review['review_version'], key)
        self.assertEqual(saved['invoice']['state'], 'draft')
        self.assertEqual(saved['invoice']['total'], 250)
        self.assertTrue(saved['invoice']['ledger_balanced'])
        retry = self.orders.qorlia_advance_save(order.id, self.values(), review['review_version'], key)
        status = self.orders.qorlia_advance_status(order.id, self.values(), review['review_version'], key)
        self.assertEqual(retry, saved)
        self.assertEqual(status, saved)
        self.assertEqual(self.env['account.move'].search_count([]), counts['account.move'] + 1)
        self.assertEqual(self.env['account.payment'].search_count([]), counts['account.payment'])
        self.assertFalse(order.picking_ids)
        invoice = self.env['account.move'].browse(saved['invoice']['id'])
        self.assertEqual(invoice.invoice_line_ids.sale_line_ids.order_id, order)
        self.assertEqual(invoice.qorlia_advance_order_id, order)
        self.assertFalse(invoice._get_reconciled_payments())

    def test_fixed_and_percentage_above_one_hundred_follow_native_wizard(self):
        for values, total in ((self.values(advance_payment_method='fixed', fixed_amount=123.45), 123.45),
                              (self.values(amount=125), 625)):
            order = self.order()
            review, key, saved = self.save(order, values)
            self.assertEqual(review['invoice']['totals']['invoice_total'], total)
            self.assertEqual(saved['invoice']['total'], total)

    def test_tax_exclusive_and_inclusive_percentage_and_fiscal_mapping(self):
        for included in (False, True):
            tax = self.env['account.tax'].create({'name': 'QorliaQA Deposit tax', 'amount': 10,
                'price_include': included, 'type_tax_use': 'sale', 'company_id': self.env.company.id})
            self.deposit.taxes_id = tax
            order = self.order(tax)
            review, key, saved = self.save(order)
            self.assertAlmostEqual(saved['invoice']['total'], 250 if included else 275, places=2)
            self.assertAlmostEqual(review['invoice']['totals']['amount_tax'], 22.73 if included else 25, places=2)
            zero = self.env['account.tax'].create({'name': 'QorliaQA Mapped zero tax', 'amount': 0,
                'type_tax_use': 'sale', 'company_id': self.env.company.id})
            fiscal = self.env['account.fiscal.position'].create({'name': 'QorliaQA Deposit mapping',
                'company_id': self.env.company.id,
                'tax_ids': [Command.create({'tax_src_id': tax.id, 'tax_dest_id': zero.id})]})
            mapped = self.order(tax)
            mapped.fiscal_position_id = fiscal
            reviewed, key, result = self.save(mapped)
            self.assertEqual(reviewed['invoice']['totals']['amount_tax'], 0)
            self.assertEqual(result['invoice']['total'], mapped.currency_id.round(mapped.amount_untaxed / 2))

    def test_missing_deposit_product_uses_read_only_native_setup_then_persists_once(self):
        self.env['ir.config_parameter'].set_param('sale.default_deposit_product_id', False)
        order = self.order()
        values = self.values(deposit_account_id=self.account.id)
        before = self.env['product.product'].search_count([])
        review = self.orders.qorlia_advance_preview(order.id, values)
        self.assertFalse(review['product'])
        self.assertEqual(self.env['product.product'].search_count([]), before)
        self.assertEqual(review['review_version'], self.orders.qorlia_advance_preview(order.id, values)['review_version'])
        key = str(uuid.uuid4())
        result = self.orders.qorlia_advance_save(order.id, values, review['review_version'], key)
        self.assertEqual(result['invoice']['total'], 250)
        self.assertEqual(self.env['product.product'].search_count([]), before + 1)
        self.assertTrue(self.env['ir.config_parameter'].get_param('sale.default_deposit_product_id'))
        self.assertEqual(self.orders.qorlia_advance_save(order.id, values, review['review_version'], key), result)

    def test_first_setup_invalidates_other_order_review_without_duplicate_product(self):
        self.env['ir.config_parameter'].set_param('sale.default_deposit_product_id', False)
        first, second = self.order(), self.order()
        values = self.values(deposit_account_id=self.account.id)
        first_review = self.orders.qorlia_advance_preview(first.id, values)
        second_review = self.orders.qorlia_advance_preview(second.id, values)
        before = self.env['product.product'].search_count([])
        self.orders.qorlia_advance_save(first.id, values, first_review['review_version'], str(uuid.uuid4()))
        with self.assertRaises(ValidationError), self.env.cr.savepoint():
            self.orders.qorlia_advance_save(second.id, values, second_review['review_version'], str(uuid.uuid4()))
        self.assertFalse(second.invoice_ids)
        self.assertEqual(self.env['product.product'].search_count([]), before + 1)

    def test_order_product_and_configuration_changes_reject_stale_reviews(self):
        for change in ('order', 'product', 'default'):
            order = self.order()
            review = self.orders.qorlia_advance_preview(order.id, self.values())
            if change == 'order':
                order.order_line.price_unit = 650
            elif change == 'product':
                self.deposit.name = 'QorliaQA Changed default deposit'
            else:
                self.env['ir.config_parameter'].set_param('sale.default_deposit_product_id', False)
            with self.assertRaises(UserError), self.env.cr.savepoint():
                self.orders.qorlia_advance_save(order.id, self.values(), review['review_version'], str(uuid.uuid4()))
            self.assertFalse(order.invoice_ids)
            self.env['ir.config_parameter'].set_param('sale.default_deposit_product_id', self.deposit.id)

    def test_failed_native_save_rolls_back_order_lines_invoice_and_request(self):
        order = self.order()
        review = self.orders.qorlia_advance_preview(order.id, self.values())
        from unittest.mock import patch
        moves = type(self.env['account.move'])
        before = self.env['sale.order.line'].search_count([])
        with patch.object(moves, '_qorlia_prepare_adjustment_lines', side_effect=UserError('QorliaQA failure')):
            with self.assertRaises(UserError), self.env.cr.savepoint():
                self.orders.qorlia_advance_save(order.id, self.values(), review['review_version'], str(uuid.uuid4()))
        order.invalidate_recordset()
        self.assertFalse(order.invoice_ids)
        self.assertEqual(self.env['sale.order.line'].search_count([]), before)

    def test_request_identity_rejects_changed_values_or_another_order(self):
        order = self.order()
        review, key, result = self.save(order)
        for other_id, values in ((order.id, self.values(amount=60)), (self.order().id, self.values())):
            with self.assertRaises(ValidationError):
                self.orders.qorlia_advance_save(other_id, values, review['review_version'], key)
            with self.assertRaises(ValidationError):
                self.orders.qorlia_advance_status(other_id, values, review['review_version'], key)
        self.assertFalse(self.orders.qorlia_advance_status(order.id, self.values(), review['review_version'], str(uuid.uuid4())))

    def test_permissions_company_and_manager_only_deposit_account(self):
        order = self.order()
        user = self.user(['base.group_user'], 'no-finance')
        with self.assertRaises(AccessError):
            self.orders.with_user(user).qorlia_advance_load(order.id)
        salesperson = self.user(['sales_team.group_sale_salesman', 'account.group_account_readonly'], 'readonly')
        order.user_id = salesperson
        self.assertFalse(self.orders.with_user(salesperson).qorlia_advance_load(order.id)['order']['can_advance'])
        with self.assertRaises(AccessError):
            self.orders.with_user(salesperson).qorlia_advance_preview(order.id, self.values())
        self.env['ir.config_parameter'].set_param('sale.default_deposit_product_id', False)
        clerk = self.user(['sales_team.group_sale_salesman', 'account.group_account_invoice'], 'clerk')
        order.user_id = clerk
        self.assertTrue(self.orders.with_user(clerk).qorlia_advance_load(order.id)['order']['can_advance'])
        with self.assertRaises(AccessError):
            self.orders.with_user(clerk).qorlia_advance_preview(order.id, self.values(deposit_account_id=self.account.id))
        with self.assertRaises(AccessError):
            self.orders.with_user(clerk).qorlia_advance_choices(order.id, 'account')
        company = self.env['res.company'].create({'name': 'QorliaQA Other advance company'})
        account = self.env['account.account'].create({'name': 'QorliaQA Other income', 'code': 'QAADV',
            'company_id': company.id, 'account_type': 'income'})
        with self.assertRaises(ValidationError):
            self.orders.qorlia_advance_preview(order.id, self.values(deposit_account_id=account.id))

    def test_invalid_amounts_fields_product_and_state(self):
        order = self.order()
        for changes in ({'amount': 0}, {'amount': -1}, {'amount': True}, {'amount': float('nan')},
                        {'fixed_amount': float('inf')}, {'advance_payment_method': 'delivered'},
                        {'deposit_taxes_id': [True]}, {'deposit_taxes_id': [1, 1]}, {'uid': 1}):
            with self.assertRaises(UserError):
                self.orders.qorlia_advance_preview(order.id, self.values(**changes))
        self.deposit.invoice_policy = 'delivery'
        with self.assertRaises(UserError):
            self.orders.qorlia_advance_preview(order.id, self.values())
        self.deposit.invoice_policy = 'order'
        order.state = 'draft'
        with self.assertRaises(UserError):
            self.orders.qorlia_advance_preview(order.id, self.values())

    def test_posted_advance_is_deducted_by_native_regular_invoice(self):
        order = self.order()
        review, key, saved = self.save(order)
        invoice = self.env['account.move'].browse(saved['invoice']['id'])
        invoice.action_post()
        workflow = self.orders.qorlia_order_workflow_load(order.id)
        result = self.orders.qorlia_order_workflow_run(order.id, workflow['version'], 'invoice')
        final = order.invoice_ids - invoice
        self.assertEqual(len(final), 1)
        self.assertEqual(final.invoice_total, 250)
        self.assertTrue(final.company_id.currency_id.is_zero(sum(final.line_ids.mapped('balance'))))
        self.assertEqual(len(result['invoices']), 2)
        self.assertFalse(final._get_reconciled_payments())
