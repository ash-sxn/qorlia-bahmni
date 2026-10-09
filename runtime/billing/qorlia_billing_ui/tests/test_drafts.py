# SPDX-License-Identifier: LGPL-3.0-or-later
import copy
import uuid

from odoo.exceptions import AccessError, UserError, ValidationError
from odoo.tests import TransactionCase, tagged


@tagged('post_install', '-at_install')
class DraftAdapterTest(TransactionCase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.orders = cls.env['sale.order']
        cls.customer = cls.env['res.partner'].create({'name': 'QorliaQA Adapter customer', 'customer_rank': 1})
        cls.product = cls.env['product.product'].create({'name': 'QorliaQA Adapter consultation',
            'type': 'service', 'list_price': 500, 'invoice_policy': 'order', 'taxes_id': [(6, 0, [])]})
        cls.shop = cls.env['sale.shop'].search([('company_id', '=', cls.env.company.id)], limit=1)
        if not cls.shop:
            warehouse = cls.env['stock.warehouse'].search([('company_id', '=', cls.env.company.id)], limit=1)
            term = cls.env['account.payment.term'].search([], limit=1)
            pricelist = cls.env['product.pricelist'].search([], limit=1)
            cls.shop = cls.env['sale.shop'].create({'name': 'QorliaQA Adapter shop',
                'company_id': cls.env.company.id, 'warehouse_id': warehouse.id,
                'location_id': warehouse.lot_stock_id.id, 'payment_default_id': term.id,
                'pricelist_id': pricelist.id})

    def payload(self, snapshot):
        return {key: snapshot[key] for key in ('id', 'version', 'values', 'lines')}

    def draft(self):
        draft = self.orders.qorlia_draft_load()
        draft['values']['partner_id'] = self.customer.id
        draft = self.orders.qorlia_draft_preview(self.payload(draft), {'field': 'partner_id'})
        draft['values']['shop_id'] = self.shop.id
        draft = self.orders.qorlia_draft_preview(self.payload(draft), {'field': 'shop_id'})
        draft['lines'].append({'id': False, 'values': {'product_id': self.product.id,
            'name': '', 'product_uom_qty': 1, 'discount': 0, 'display_type': False, 'sequence': 10}})
        return self.orders.qorlia_draft_preview(self.payload(draft), {'field': 'product_id', 'line': 0})

    def test_native_defaults_preview_save_and_retry(self):
        before = self.orders.search_count([])
        draft = self.draft()
        self.assertEqual(self.orders.search_count([]), before)
        self.assertEqual(draft['values']['warehouse_id'], self.shop.warehouse_id.id)
        self.assertEqual(draft['values']['payment_term_id'], self.shop.payment_default_id.id)
        self.assertEqual(draft['lines'][0]['values']['price_unit'], 500)
        self.assertEqual(draft['totals']['amount_total'], 500)
        draft['lines'][0]['values']['product_uom_qty'] = 2
        draft['lines'][0]['values']['discount'] = 10
        draft = self.orders.qorlia_draft_preview(self.payload(draft), {'field': 'discount', 'line': 0})
        self.assertEqual(draft['totals']['amount_total'], 900)
        key = str(uuid.uuid4())
        saved = self.orders.qorlia_draft_save(self.payload(draft), key)
        retry = self.orders.qorlia_draft_save(self.payload(draft), key)
        self.assertEqual(saved['id'], retry['id'])
        self.assertEqual(self.orders.search_count([]), before + 1)
        order = self.orders.browse(saved['id'])
        self.assertEqual(order.state, 'draft')
        self.assertFalse(order.invoice_ids)
        self.assertFalse(order.picking_ids)
        self.assertEqual(order.amount_total, 900)
        different = copy.deepcopy(self.payload(draft))
        different['values']['provider_name'] = 'Another request'
        with self.assertRaises(ValidationError):
            self.orders.qorlia_draft_save(different, key)

    def test_version_conflicts_and_confirmed_state(self):
        saved = self.orders.qorlia_draft_save(self.payload(self.draft()), str(uuid.uuid4()))
        order = self.orders.browse(saved['id'])
        edited = self.payload(saved)
        edited['values']['provider_name'] = 'QorliaQA Edited provider'
        updated = self.orders.qorlia_draft_save(edited, str(uuid.uuid4()))
        self.assertEqual(order.provider_name, 'QorliaQA Edited provider')
        with self.assertRaises(UserError):
            self.orders.qorlia_draft_save(edited, str(uuid.uuid4()))
        with self.assertRaises(UserError):
            self.orders.qorlia_draft_preview(edited, {'field': 'provider_name'})
        order.order_line.write({'name': 'External line edit'})
        with self.assertRaises(UserError):
            self.orders.qorlia_draft_save(self.payload(updated), str(uuid.uuid4()))
        fresh = self.orders.qorlia_draft_load(order.id)
        order.write({'state': 'sale'})
        with self.assertRaises(UserError):
            self.orders.qorlia_draft_save(self.payload(fresh), str(uuid.uuid4()))

    def test_rejects_foreign_items_and_unsafe_fields(self):
        first = self.orders.qorlia_draft_save(self.payload(self.draft()), str(uuid.uuid4()))
        second = self.orders.qorlia_draft_save(self.payload(self.draft()), str(uuid.uuid4()))
        payload = self.payload(first)
        payload['lines'][0]['id'] = second['lines'][0]['id']
        with self.assertRaises(ValidationError):
            self.orders.qorlia_draft_save(payload, str(uuid.uuid4()))
        payload = self.payload(self.draft())
        payload['values']['state'] = 'sale'
        with self.assertRaises(ValidationError):
            self.orders.qorlia_draft_save(payload, str(uuid.uuid4()))
        payload = self.payload(self.draft())
        payload['lines'][0]['values']['price_unit'] = float('nan')
        with self.assertRaises(ValidationError):
            self.orders.qorlia_draft_save(payload, str(uuid.uuid4()))
        payload = self.payload(self.draft())
        payload['lines'][0]['values']['product_uom'] = self.env.ref('uom.product_uom_hour').id
        with self.assertRaises(ValidationError):
            self.orders.qorlia_draft_save(payload, str(uuid.uuid4()))
        payload = self.payload(self.draft())
        payload['values']['chargeable_amount'] = -1
        with self.assertRaises(ValidationError):
            self.orders.qorlia_draft_save(payload, str(uuid.uuid4()))

    def test_native_permissions_apply_to_direct_calls(self):
        user = self.env['res.users'].with_context(no_reset_password=True).create({
            'name': 'QorliaQA No billing rights', 'login': 'qorlia-qa-no-billing',
            'groups_id': [(6, 0, [self.env.ref('base.group_user').id])],
            'company_id': self.env.company.id, 'company_ids': [(6, 0, self.env.company.ids)],
        })
        with self.assertRaises(AccessError):
            self.orders.with_user(user).qorlia_draft_load()
        with self.assertRaises(AccessError):
            self.orders.with_user(user).qorlia_draft_save(self.payload(self.draft()), str(uuid.uuid4()))
