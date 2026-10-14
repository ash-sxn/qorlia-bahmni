# SPDX-License-Identifier: LGPL-3.0-or-later
# Copyright 2026 Qorlia contributors.
from odoo.exceptions import AccessError, UserError, ValidationError
from odoo.tests import TransactionCase, tagged


@tagged('post_install', '-at_install')
class OrderDeliveryReadTest(TransactionCase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.customer = cls.env['res.partner'].create({'name': 'QorliaQA Transfer customer'})
        cls.product = cls.env['product.product'].create({'name': 'QorliaQA Transfer medicine',
            'type': 'product', 'tracking': 'lot', 'taxes_id': [(6, 0, [])]})
        cls.shop = cls.env['sale.shop'].search([('company_id', '=', cls.env.company.id)], limit=1)
        cls.order = cls.env['sale.order'].create({'partner_id': cls.customer.id, 'shop_id': cls.shop.id})
        cls.sale_line = cls.env['sale.order.line'].create({'order_id': cls.order.id,
            'product_id': cls.product.id, 'product_uom_qty': 2, 'price_unit': 10})
        cls.warehouse = cls.env['stock.warehouse'].search([('company_id', '=', cls.env.company.id)], limit=1)
        cls.group = cls.env['procurement.group'].create({'name': 'QorliaQA Transfer group', 'sale_id': cls.order.id})
        cls.picking = cls.env['stock.picking'].create({'picking_type_id': cls.warehouse.out_type_id.id,
            'group_id': cls.group.id, 'partner_id': cls.customer.id,
            'location_id': cls.warehouse.lot_stock_id.id,
            'location_dest_id': cls.customer.property_stock_customer.id,
            'scheduled_date': '2026-10-14 10:00:00', 'origin': cls.order.name})
        cls.move = cls.env['stock.move'].create({'name': cls.product.name, 'picking_id': cls.picking.id,
            'product_id': cls.product.id, 'product_uom': cls.product.uom_id.id,
            'product_uom_qty': 2, 'sale_line_id': cls.sale_line.id, 'group_id': cls.group.id,
            'date': '2026-10-14 10:00:00',
            'location_id': cls.picking.location_id.id, 'location_dest_id': cls.picking.location_dest_id.id})
        cls.lot = cls.env['stock.lot'].create({'name': 'QorliaQA LOT-2026', 'product_id': cls.product.id,
            'company_id': cls.env.company.id, 'expiration_date': '2027-01-01 00:00:00'})
        cls.operation = cls.env['stock.move.line'].create({'picking_id': cls.picking.id, 'move_id': cls.move.id,
            'product_id': cls.product.id, 'product_uom_id': cls.product.uom_id.id,
            'location_id': cls.picking.location_id.id, 'location_dest_id': cls.picking.location_dest_id.id,
            'lot_id': cls.lot.id, 'qty_done': 1})
        assert cls.picking.sale_id == cls.order
        cls.user = cls.env['res.users'].with_context(no_reset_password=True).create({
            'name': 'QorliaQA Transfer reviewer', 'login': 'qorliaqa-transfer-reviewer',
            'company_id': cls.env.company.id, 'company_ids': [(6, 0, cls.env.company.ids)],
            'groups_id': [(6, 0, [cls.env.ref('sales_team.group_sale_manager').id,
                cls.env.ref('stock.group_stock_user').id])],
        })

    def load(self):
        return self.env['sale.order'].with_user(self.user).qorlia_order_deliveries(self.order.id)

    def test_matches_native_demands_operations_batches_and_does_not_transfer_stock(self):
        before = self.picking.read(['state', 'write_date', 'date_done'])
        counts = {model: self.env[model].search_count([]) for model in
            ('stock.quant', 'stock.move', 'stock.move.line', 'account.move', 'account.payment')}
        result = self.load()
        self.assertEqual((result['order_id'], result['order_name'], result['read_only']),
            (self.order.id, self.order.name, True))
        row = result['rows'][0]
        self.assertEqual(row['id'], self.picking.id)
        self.assertEqual(row['scheduled_date'], '2026-10-14 10:00:00')
        self.assertFalse(row['date_done'])
        self.assertFalse(row['backorder'])
        self.assertEqual(row['moves'][0]['demand'], self.move.product_uom_qty)
        self.assertEqual(row['moves'][0]['reserved'], self.move.reserved_availability)
        self.assertEqual(row['moves'][0]['done'], self.move.quantity_done)
        operation = row['operations'][0]
        self.assertEqual(operation['lot'], [self.lot.id, self.lot.display_name])
        self.assertEqual(operation['expiry_date'], '2027-01-01 00:00:00')
        self.assertEqual(operation['reserved'], self.operation.reserved_uom_qty)
        self.assertEqual(operation['done'], 1)
        self.assertEqual(result, self.load())
        self.assertEqual(self.picking.read(['state', 'write_date', 'date_done']), before)
        self.assertEqual(counts, {model: self.env[model].search_count([]) for model in counts})

    def test_empty_service_order_has_no_invented_delivery(self):
        order = self.env['sale.order'].create({'partner_id': self.customer.id, 'shop_id': self.shop.id})
        result = self.env['sale.order'].with_user(self.user).qorlia_order_deliveries(order.id)
        self.assertEqual(result['rows'], [])
        self.assertEqual(len(result['version']), 64)

    def test_backorder_and_native_cancelled_state_and_version_changes(self):
        before = self.load()
        backorder = self.picking.copy({'backorder_id': self.picking.id})
        backorder.action_cancel()
        after = self.load()
        self.assertNotEqual(before['version'], after['version'])
        self.assertEqual(len(after['rows']), 2)
        self.assertEqual(after['rows'][1]['state'], 'cancel')
        self.assertEqual(after['rows'][1]['backorder'], [self.picking.id, self.picking.display_name])
        self.lot.write({'expiration_date': '2028-01-01 00:00:00'})
        self.assertNotEqual(after['version'], self.load()['version'])

    def test_invalid_identity_missing_order_portal_and_inactive_company_denied(self):
        api = self.env['sale.order'].with_user(self.user)
        for value in (True, 0, -1, '1', 1.5):
            with self.assertRaises(ValidationError):
                api.qorlia_order_deliveries(value)
        with self.assertRaises(UserError):
            api.qorlia_order_deliveries(2147483647)
        with self.assertRaises(AccessError):
            self.env['sale.order'].with_user(self.env.ref('base.public_user')).qorlia_order_deliveries(self.order.id)
        other = self.env['res.company'].create({'name': 'QorliaQA Other transfer company'})
        with self.assertRaises(AccessError):
            api.with_context(allowed_company_ids=[other.id]).qorlia_order_deliveries(self.order.id)

    def test_hidden_transfer_operation_or_batch_fails_closed(self):
        for model, record in (('stock.picking', self.picking), ('stock.move.line', self.operation), ('stock.lot', self.lot)):
            rule = self.env['ir.rule'].create({'name': 'QorliaQA Hidden ' + model,
                'model_id': self.env['ir.model']._get_id(model),
                'domain_force': "[('id', '!=', %d)]" % record.id})
            with self.assertRaises(AccessError):
                self.load()
            rule.unlink()

    def test_operations_preserve_their_native_unit_instead_of_product_base_quantity(self):
        dozen = self.env.ref('uom.product_uom_dozen')
        self.operation.write({'product_uom_id': dozen.id, 'qty_done': 0.5})
        result = self.load()['rows'][0]['operations'][0]
        self.assertEqual(result['unit'], [dozen.id, dozen.display_name])
        self.assertEqual(result['done'], 0.5)
        self.assertEqual(self.operation.product_uom_id._compute_quantity(result['done'], self.product.uom_id), 6)

    def test_pending_lot_name_preserves_native_operation_expiration_without_saved_lot(self):
        self.operation.write({'lot_id': False, 'lot_name': 'QorliaQA Pending serial',
            'expiration_date': '2028-02-01 00:00:00'})
        operation = self.load()['rows'][0]['operations'][0]
        self.assertFalse(operation['lot'])
        self.assertEqual(operation['lot_name'], self.operation.lot_name)
        self.assertEqual(operation['expiry_date'], '2028-02-01 00:00:00')
