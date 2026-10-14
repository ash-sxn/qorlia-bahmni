# SPDX-License-Identifier: LGPL-3.0-or-later
# Copyright 2026 Qorlia contributors.
from contextlib import closing

from odoo import tools
from odoo.exceptions import UserError
from odoo.tests import TransactionCase, tagged


@tagged('post_install', '-at_install')
class StockConfirmationContractTest(TransactionCase):
    """Native effects the reviewed confirmation API must preserve, not an API acceptance test."""

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.customer = cls.env['res.partner'].create({'name': 'QorliaQA Confirmation customer'})
        cls.product = cls.env['product.product'].create({'name': 'QorliaQA Confirmation medicine',
            'type': 'product', 'tracking': 'lot', 'taxes_id': [(6, 0, [])]})
        cls.shop = cls.env['sale.shop'].search([('company_id', '=', cls.env.company.id)], limit=1)
        cls.warehouse = cls.shop.warehouse_id
        cls.warehouse.out_type_id.reservation_method = 'manual'
        cls.order = cls.env['sale.order'].create({'partner_id': cls.customer.id, 'shop_id': cls.shop.id})
        cls.sale_line = cls.env['sale.order.line'].create({'order_id': cls.order.id,
            'product_id': cls.product.id, 'product_uom_qty': 5, 'price_unit': 10})
        cls.group = cls.env['procurement.group'].create({'name': 'QorliaQA Confirmation group',
            'sale_id': cls.order.id, 'partner_id': cls.customer.id})
        cls.picking = cls.env['stock.picking'].create({'picking_type_id': cls.warehouse.out_type_id.id,
            'partner_id': cls.customer.id, 'location_id': cls.warehouse.lot_stock_id.id,
            'location_dest_id': cls.customer.property_stock_customer.id, 'origin': cls.order.name})
        cls.move = cls.env['stock.move'].create({'name': cls.product.name, 'picking_id': cls.picking.id,
            'product_id': cls.product.id, 'product_uom': cls.product.uom_id.id, 'product_uom_qty': 5,
            'sale_line_id': cls.sale_line.id, 'group_id': cls.group.id,
            'location_id': cls.picking.location_id.id, 'location_dest_id': cls.picking.location_dest_id.id})
        cls.lot = cls.env['stock.lot'].create({'name': 'QorliaQA Confirmation batch',
            'product_id': cls.product.id, 'company_id': cls.env.company.id,
            'expiration_date': '2027-01-01 00:00:00'})
        cls.env['stock.quant']._update_available_quantity(cls.product, cls.picking.location_id, 10, lot_id=cls.lot)
        cls.quant = cls.env['stock.quant'].search([('product_id', '=', cls.product.id), ('lot_id', '=', cls.lot.id)])
        cls.user = cls.env['res.users'].with_context(no_reset_password=True).create({
            'name': 'QorliaQA Confirmation staff', 'login': 'qorliaqa-confirmation-staff',
            'email': 'qorliaqa-confirmation@example.invalid',
            'company_id': cls.env.company.id, 'company_ids': [(6, 0, cls.env.company.ids)],
            'groups_id': [(6, 0, [cls.env.ref('sales_team.group_sale_manager').id,
                cls.env.ref('stock.group_stock_user').id])],
        })

    def confirm(self):
        return self.picking.with_user(self.user).action_confirm()

    def finance(self):
        return {name: self.env[name].search_count([]) for name in
            ('account.move', 'account.payment', 'stock.valuation.layer', 'purchase.order')}

    def assert_not_delivered(self):
        self.assertEqual(self.quant.quantity, 10)
        self.assertEqual(self.sale_line.qty_delivered, 0)
        self.assertEqual(self.move.quantity_done, 0)
        self.assertNotIn(self.picking.state, ('done', 'cancel'))

    def pull_route(self):
        route = self.env['stock.route'].create({'name': 'QorliaQA Confirmation supply',
            'product_selectable': True, 'company_id': self.env.company.id})
        self.env['stock.rule'].create({'name': 'QorliaQA Confirmation pull', 'route_id': route.id,
            'action': 'pull', 'procure_method': 'make_to_stock',
            'location_src_id': self.env.ref('stock.stock_location_suppliers').id,
            'location_dest_id': self.warehouse.lot_stock_id.id,
            'picking_type_id': self.warehouse.in_type_id.id, 'warehouse_id': self.warehouse.id,
            'company_id': self.env.company.id, 'group_propagation_option': 'propagate'})
        return route

    def test_manual_confirmation_changes_state_without_reservation_or_finance(self):
        before = self.finance()
        self.assertTrue(self.picking.show_mark_as_todo)
        self.confirm()
        self.assertEqual(self.picking.state, 'confirmed')
        self.assertFalse(self.picking.show_mark_as_todo)
        self.assertEqual(self.quant.reserved_quantity, 0)
        self.assertFalse(self.picking.move_line_ids)
        self.assertEqual(before, self.finance())
        self.assert_not_delivered()

    def test_at_confirm_reserves_native_batch_without_recording_done(self):
        self.warehouse.out_type_id.reservation_method = 'at_confirm'
        before = self.finance()
        self.confirm()
        self.assertEqual(self.picking.state, 'assigned')
        self.assertEqual(self.quant.reserved_quantity, 5)
        self.assertEqual(self.move.reserved_availability, 5)
        self.assertEqual(self.move.move_line_ids.lot_id, self.lot)
        self.assertEqual(self.move.move_line_ids.qty_done, 0)
        self.assertEqual(before, self.finance())
        self.assert_not_delivered()

    def test_confirmation_merges_compatible_draft_moves(self):
        self.move.copy({'picking_id': self.picking.id, 'state': 'draft', 'product_uom_qty': 2})
        self.confirm()
        self.assertEqual(len(self.picking.move_ids), 1)
        self.assertEqual(self.picking.move_ids.product_uom_qty, 7)
        self.assert_not_delivered()

    def test_native_merge_requires_sender_configuration_and_rolls_back_on_error(self):
        self.user.email = False
        self.move.copy({'picking_id': self.picking.id, 'state': 'draft', 'product_uom_qty': 2})
        with self.assertRaisesRegex(UserError, "configure the sender's email"), self.env.cr.savepoint():
            self.confirm()
        self.assertEqual(len(self.picking.move_ids), 2)
        self.assertEqual(self.picking.state, 'draft')
        self.assertEqual(self.quant.reserved_quantity, 0)
        self.assert_not_delivered()

    def test_preceding_move_produces_waiting_state(self):
        upstream = self.move.copy({'picking_id': False, 'sale_line_id': False, 'state': 'confirmed',
            'location_id': self.env.ref('stock.stock_location_suppliers').id,
            'location_dest_id': self.picking.location_id.id})
        self.move.move_orig_ids = upstream
        self.confirm()
        self.assertEqual(self.move.state, 'waiting')
        self.assertEqual(self.picking.state, 'waiting')
        self.assertEqual(self.quant.reserved_quantity, 0)
        self.assert_not_delivered()

    def test_make_to_order_confirmation_creates_upstream_native_transfer(self):
        route = self.pull_route()
        self.move.write({'procure_method': 'make_to_order', 'route_ids': [(6, 0, route.ids)]})
        before = self.finance()
        self.confirm()
        upstream = self.move.move_orig_ids
        self.assertEqual(len(upstream), 1)
        self.assertEqual(upstream.product_id, self.product)
        self.assertEqual(upstream.product_uom_qty, 5)
        self.assertEqual(upstream.location_dest_id, self.picking.location_id)
        self.assertEqual(upstream.picking_id.picking_type_id, self.warehouse.in_type_id)
        self.assertEqual(upstream.move_dest_ids, self.move)
        self.assertEqual(self.picking.state, 'waiting')
        self.assertEqual(before, self.finance())
        self.assert_not_delivered()

    def test_make_to_order_missing_rule_rejects_without_partial_confirmation(self):
        self.move.write({'procure_method': 'make_to_order', 'route_ids': [(5, 0, 0)]})
        before = self.finance()
        with self.assertRaises(UserError), self.env.cr.savepoint():
            self.confirm()
        self.assertEqual(self.move.state, 'draft')
        self.assertEqual(self.picking.state, 'draft')
        self.assertFalse(self.move.move_orig_ids)
        self.assertEqual(before, self.finance())
        self.assert_not_delivered()

    def test_automatic_orderpoint_can_replenish_make_to_stock_confirmation(self):
        self.env['ir.config_parameter'].set_param('stock.no_auto_scheduler', False)
        route = self.pull_route()
        self.product.route_ids = route
        self.env['stock.warehouse.orderpoint'].create({'name': 'QorliaQA Confirmation replenishment',
            'product_id': self.product.id, 'location_id': self.warehouse.lot_stock_id.id,
            'warehouse_id': self.warehouse.id, 'route_id': route.id, 'trigger': 'auto',
            'product_min_qty': 10, 'product_max_qty': 15})
        before = self.finance()
        self.confirm()
        supply = self.env['stock.move'].search([('product_id', '=', self.product.id),
            ('location_id', '=', self.env.ref('stock.stock_location_suppliers').id)])
        self.assertEqual(len(supply), 1)
        self.assertEqual(supply.product_uom_qty, 10)
        self.assertEqual(supply.picking_id.picking_type_id, self.warehouse.in_type_id)
        self.assertEqual(self.move.procure_method, 'make_to_stock')
        self.assertEqual(before, self.finance())
        self.assert_not_delivered()

    def test_immediate_transfer_hides_native_mark_as_todo(self):
        self.picking.immediate_transfer = True
        self.assertFalse(self.picking.show_mark_as_todo)
        self.assertEqual(self.picking.state, 'draft')

    def test_buy_procurement_creates_vendor_rfq_without_posting_accounting(self):
        vendor = self.env['res.partner'].create({'name': 'QorliaQA Confirmation vendor'})
        self.env['product.supplierinfo'].create({'partner_id': vendor.id,
            'product_tmpl_id': self.product.product_tmpl_id.id, 'product_id': self.product.id,
            'min_qty': 0, 'price': 1, 'company_id': self.env.company.id})
        route = self.env['stock.route'].create({'name': 'QorliaQA Confirmation buy',
            'product_selectable': True, 'company_id': self.env.company.id})
        self.env['stock.rule'].create({'name': 'QorliaQA Confirmation vendor rule', 'route_id': route.id,
            'action': 'buy', 'location_dest_id': self.picking.location_id.id,
            'picking_type_id': self.warehouse.in_type_id.id, 'warehouse_id': self.warehouse.id,
            'company_id': self.env.company.id})
        self.move.write({'procure_method': 'make_to_order', 'route_ids': [(6, 0, route.ids)]})
        before = self.finance()
        self.confirm()
        purchase = self.env['purchase.order'].search([('partner_id', '=', vendor.id)])
        self.assertEqual(len(purchase), 1)
        self.assertEqual(purchase.state, 'draft')
        self.assertEqual(purchase.order_line.product_id, self.product)
        self.assertEqual(purchase.order_line.product_qty, 5)
        self.assertEqual(purchase.order_line.move_dest_ids, self.move)
        self.assertEqual(self.picking.state, 'waiting')
        after = self.finance()
        self.assertEqual(after.pop('purchase.order') - before.pop('purchase.order'), 1)
        self.assertEqual(before, after)
        self.assert_not_delivered()

    def test_whole_package_confirmation_generates_native_moves(self):
        package = self.env['stock.quant.package'].create({'name': 'QorliaQA Confirmation package'})
        self.quant.package_id = package
        self.picking.picking_type_id.show_entire_packs = True
        level = self.env['stock.package_level'].create({'picking_id': self.picking.id,
            'package_id': package.id, 'location_dest_id': self.picking.location_dest_id.id,
            'company_id': self.env.company.id})
        self.assertEqual(level.state, 'draft')
        self.assertFalse(level.move_ids)
        self.confirm()
        self.assertEqual(len(level.move_ids), 1)
        self.assertEqual(level.move_ids.product_id, self.product)
        self.assertEqual(level.move_ids.product_uom_qty, 10)
        self.assertEqual(level.move_ids.package_level_id, level)
        self.assertEqual(level.move_ids.state, 'confirmed')
        self.assert_not_delivered()

    def test_native_confirmation_preview_rolls_back_upstream_and_callback_queues(self):
        route = self.pull_route()
        self.move.write({'procure_method': 'make_to_order', 'route_ids': [(6, 0, route.ids)]})
        self.env.flush_all()
        counts = {name: self.env[name].search_count([]) for name in
            ('stock.picking', 'stock.move', 'stock.move.line', 'mail.message', 'mail.mail', 'mail.activity')}
        before = self.finance()
        cr = self.env.cr
        hooks = {name: getattr(cr, name) for name in ('postcommit', 'prerollback', 'postrollback')}
        original_lengths = {name: len(callbacks._funcs) for name, callbacks in hooks.items()}
        try:
            for name in hooks:
                setattr(cr, name, tools.Callbacks())
            with closing(cr.savepoint()):
                self.confirm()
                cr.flush()
                self.assertEqual(len(self.move.move_orig_ids), 1)
                self.assertEqual(self.move.state, 'waiting')
                cr.postcommit.add(lambda: self.fail('A rolled-back preview callback escaped.'))
        finally:
            for name, callbacks in hooks.items():
                setattr(cr, name, callbacks)
            self.env.invalidate_all()
        self.assertEqual(counts, {name: self.env[name].search_count([]) for name in counts})
        self.assertEqual(before, self.finance())
        self.assertEqual(self.move.state, 'draft')
        self.assertFalse(self.move.move_orig_ids)
        for name, callbacks in hooks.items():
            self.assertIs(getattr(cr, name), callbacks)
            self.assertEqual(len(callbacks._funcs), original_lengths[name])
        self.assert_not_delivered()

    def test_push_rule_confirmation_creates_downstream_native_transfer(self):
        dispatch = self.env['stock.location'].create({'name': 'QorliaQA Confirmation dispatch',
            'usage': 'internal', 'location_id': self.warehouse.view_location_id.id,
            'company_id': self.env.company.id})
        route = self.env['stock.route'].create({'name': 'QorliaQA Confirmation dispatch route',
            'product_selectable': True, 'company_id': self.env.company.id})
        self.env['stock.rule'].create({'name': 'QorliaQA Confirmation push', 'route_id': route.id,
            'action': 'push', 'auto': 'manual', 'procure_method': 'make_to_stock',
            'location_src_id': dispatch.id,
            'location_dest_id': self.customer.property_stock_customer.id,
            'picking_type_id': self.warehouse.out_type_id.id, 'warehouse_id': self.warehouse.id,
            'company_id': self.env.company.id})
        self.product.route_ids = route
        self.picking.location_dest_id = dispatch
        self.move.location_dest_id = dispatch
        before = self.finance()
        self.confirm()
        downstream = self.move.move_dest_ids
        self.assertEqual(len(downstream), 1)
        self.assertEqual(downstream.location_id, dispatch)
        self.assertEqual(downstream.location_dest_id, self.customer.property_stock_customer)
        self.assertEqual(downstream.product_uom_qty, 5)
        self.assertEqual(downstream.move_orig_ids, self.move)
        self.assertNotEqual(downstream.picking_id, self.picking)
        self.assertEqual(downstream.state, 'waiting')
        self.assertEqual(before, self.finance())
        self.assert_not_delivered()
