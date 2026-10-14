# SPDX-License-Identifier: LGPL-3.0-or-later
# Copyright 2026 Qorlia contributors.
import json
from unittest.mock import patch

from odoo import fields
from odoo.exceptions import AccessError, UserError, ValidationError
from odoo.tests import TransactionCase, tagged
from . import test_stock_confirmation_contract as native_contract


@tagged('post_install', '-at_install')
class StockConfirmationPreviewTest(TransactionCase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.customer = cls.env['res.partner'].create({'name': 'QorliaQA Confirmation preview customer'})
        cls.product = cls.env['product.product'].create({'name': 'QorliaQA Confirmation preview medicine',
            'type': 'product', 'tracking': 'lot', 'taxes_id': [(6, 0, [])]})
        cls.shop = cls.env['sale.shop'].search([('company_id', '=', cls.env.company.id)], limit=1)
        cls.warehouse = cls.shop.warehouse_id
        cls.warehouse.out_type_id.reservation_method = 'manual'
        cls.order = cls.env['sale.order'].create({'partner_id': cls.customer.id, 'shop_id': cls.shop.id})
        cls.sale_line = cls.env['sale.order.line'].create({'order_id': cls.order.id,
            'product_id': cls.product.id, 'product_uom_qty': 5, 'price_unit': 10})
        cls.group = cls.env['procurement.group'].create({'name': 'QorliaQA Confirmation preview group',
            'sale_id': cls.order.id, 'partner_id': cls.customer.id})
        cls.picking = cls.env['stock.picking'].create({'picking_type_id': cls.warehouse.out_type_id.id,
            'partner_id': cls.customer.id, 'location_id': cls.warehouse.lot_stock_id.id,
            'location_dest_id': cls.customer.property_stock_customer.id, 'origin': cls.order.name})
        cls.move = cls.env['stock.move'].create({'name': cls.product.name, 'picking_id': cls.picking.id,
            'product_id': cls.product.id, 'product_uom': cls.product.uom_id.id, 'product_uom_qty': 5,
            'sale_line_id': cls.sale_line.id, 'group_id': cls.group.id,
            'location_id': cls.picking.location_id.id, 'location_dest_id': cls.picking.location_dest_id.id})
        cls.lot = cls.env['stock.lot'].create({'name': 'QorliaQA Confirmation preview batch',
            'product_id': cls.product.id, 'company_id': cls.env.company.id,
            'expiration_date': '2027-01-01 00:00:00'})
        cls.env['stock.quant']._update_available_quantity(cls.product, cls.picking.location_id, 10, lot_id=cls.lot)
        cls.quant = cls.env['stock.quant'].search([('product_id', '=', cls.product.id), ('lot_id', '=', cls.lot.id)])
        cls.user = cls.env['res.users'].with_context(no_reset_password=True).create({
            'name': 'QorliaQA Confirmation preview staff', 'login': 'qorliaqa-confirmation-preview-staff',
            'email': 'qorliaqa-confirmation-preview@example.invalid', 'company_id': cls.env.company.id,
            'company_ids': [(6, 0, cls.env.company.ids)],
            'groups_id': [(6, 0, [cls.env.ref('sales_team.group_sale_manager').id,
                cls.env.ref('stock.group_stock_user').id, cls.env.ref('purchase.group_purchase_manager').id])],
        })

    pull_route = native_contract.StockConfirmationContractTest.pull_route

    def api(self):
        return self.env['stock.picking'].with_user(self.user)

    def load(self):
        return self.api().qorlia_confirmation_load(self.order.id, self.picking.id)

    def preview(self, version=None):
        return self.api().qorlia_confirmation_preview(self.order.id, self.picking.id, version or self.load()['version'])

    def test_manual_preview_is_serializable_complete_and_rolled_back(self):
        before = self.load()
        self.assertFalse(before['reason'])
        self.assertFalse(before['write_ready'])
        reviewed = self.preview(before['version'])
        self.assertEqual(reviewed['state_after'], 'confirmed')
        self.assertFalse(reviewed['write_ready'])
        self.assertEqual(reviewed['effects']['updated']['stock.move'][0]['after']['state'], 'confirmed')
        json.dumps(reviewed, allow_nan=False)
        self.assertEqual(before, self.load())
        self.assertEqual(self.picking.state, 'draft')
        self.assertEqual(self.quant.quantity, 10)

    def test_at_confirm_preview_includes_native_batch_reservation(self):
        self.warehouse.out_type_id.reservation_method = 'at_confirm'
        before = self.load()
        reviewed = self.preview(before['version'])
        self.assertEqual(reviewed['state_after'], 'assigned')
        operation = reviewed['effects']['created']['stock.move.line'][0]['values']
        self.assertEqual(operation['lot_id'], self.lot.id)
        self.assertEqual(operation['qty_done'], 0)
        quant = reviewed['effects']['updated']['stock.quant'][0]['after']
        self.assertEqual(quant['reserved_quantity'], 5)
        self.assertEqual(before, self.load())
        self.assertEqual(self.quant.reserved_quantity, 0)

    def test_merging_includes_removed_move_and_survivor_with_stable_review(self):
        other = self.move.copy({'picking_id': self.picking.id, 'state': 'draft', 'product_uom_qty': 2})
        before = self.load()
        reviewed = self.preview(before['version'])
        removed = reviewed['effects']['deleted']['stock.move']
        self.assertEqual([row['id'] for row in removed], other.ids)
        survivor = reviewed['effects']['updated']['stock.move'][0]
        self.assertEqual(survivor['after']['product_uom_qty'], 7)
        self.assertEqual(reviewed, self.preview(before['version']))
        self.assertEqual(len(self.picking.move_ids), 2)
        self.assertEqual(before, self.load())

    def test_make_to_order_preview_has_stable_generated_ids_and_dependency_links(self):
        route = self.pull_route()
        self.move.write({'procure_method': 'make_to_order', 'route_ids': [(6, 0, route.ids)]})
        before = self.load()
        reviewed = self.preview(before['version'])
        self.assertEqual(reviewed['state_after'], 'waiting')
        upstream = reviewed['effects']['created']['stock.move'][0]
        self.assertEqual(upstream['values']['product_uom_qty'], 5)
        self.assertEqual(upstream['values']['move_dest_ids'], self.move.ids)
        original = reviewed['effects']['updated']['stock.move'][0]
        self.assertEqual(original['after']['move_orig_ids'], [upstream['key']])
        transfer = reviewed['effects']['created']['stock.picking'][0]
        self.assertEqual(transfer['assigned_on_save'], ['date', 'name'])
        self.assertFalse(transfer['values']['date'])
        self.assertEqual(fields.Datetime.to_datetime(transfer['values']['scheduled_date'].replace('T', ' ')), self.move.date)
        self.assertEqual(reviewed, self.preview(before['version']))
        self.assertEqual(before, self.load())
        self.assertFalse(self.move.move_orig_ids)

    def test_buy_preview_includes_rfq_vendor_price_quantity_and_links(self):
        vendor = self.env['res.partner'].create({'name': 'QorliaQA Confirmation preview vendor'})
        self.env['product.supplierinfo'].create({'partner_id': vendor.id,
            'product_tmpl_id': self.product.product_tmpl_id.id, 'product_id': self.product.id,
            'min_qty': 0, 'price': 1, 'company_id': self.env.company.id})
        route = self.pull_route()
        route.rule_ids.action = 'buy'
        self.move.write({'procure_method': 'make_to_order', 'route_ids': [(6, 0, route.ids)]})
        before = self.load()
        reviewed = self.preview(before['version'])
        purchase = reviewed['effects']['created']['purchase.order'][0]
        line = reviewed['effects']['created']['purchase.order.line'][0]
        self.assertEqual(purchase['values']['partner_id'], vendor.id)
        self.assertEqual(purchase['values']['state'], 'draft')
        self.assertFalse(purchase['values']['name'])
        self.assertEqual(line['values']['order_id'], purchase['key'])
        self.assertEqual(line['values']['product_qty'], 5)
        self.assertEqual(line['values']['price_unit'], 1)
        self.assertEqual(reviewed, self.preview(before['version']))
        self.assertEqual(before, self.load())
        self.assertFalse(self.env['purchase.order'].search([('partner_id', '=', vendor.id)]))

    def test_whole_package_preview_includes_generated_moves(self):
        package = self.env['stock.quant.package'].create({'name': 'QorliaQA Confirmation preview package'})
        self.quant.package_id = package
        level = self.env['stock.package_level'].create({'picking_id': self.picking.id,
            'package_id': package.id, 'location_dest_id': self.picking.location_dest_id.id,
            'company_id': self.env.company.id})
        before = self.load()
        reviewed = self.preview(before['version'])
        moves = reviewed['effects']['created']['stock.move']
        self.assertEqual(len(moves), 1)
        self.assertEqual(moves[0]['values']['package_level_id'], level.id)
        self.assertEqual(moves[0]['values']['product_uom_qty'], 10)
        self.assertEqual(before, self.load())
        self.assertFalse(level.move_ids)

    def test_changed_inventory_or_rule_rejects_stale_preview(self):
        before = self.load()
        self.warehouse.out_type_id.reservation_method = 'at_confirm'
        with self.assertRaises(UserError):
            self.preview(before['version'])
        before = self.load()
        self.env['stock.quant']._update_available_quantity(self.product, self.picking.location_id, 1, lot_id=self.lot)
        with self.assertRaises(UserError):
            self.preview(before['version'])
        self.assertEqual(self.picking.state, 'draft')

    def test_public_foreign_invalid_and_unavailable_requests_are_denied(self):
        with self.assertRaises(AccessError):
            self.env['stock.picking'].with_user(self.env.ref('base.public_user')).qorlia_confirmation_load(self.order.id, self.picking.id)
        for version in (False, 1, [], 'x' * 64, 'a'):
            with self.assertRaises(ValidationError):
                self.api().qorlia_confirmation_preview(self.order.id, self.picking.id, version)
        other = self.env['sale.order'].create({'partner_id': self.customer.id, 'shop_id': self.shop.id})
        with self.assertRaises(UserError):
            self.api().qorlia_confirmation_load(other.id, self.picking.id)
        self.picking.action_confirm()
        self.assertTrue(self.load()['reason'])
        with self.assertRaises(UserError):
            self.preview()

    def test_hidden_changed_quant_fails_closed_and_restores_reservation(self):
        self.warehouse.out_type_id.reservation_method = 'at_confirm'
        self.env['ir.rule'].create({'name': 'QorliaQA Hidden confirmation preview quant',
            'model_id': self.env['ir.model']._get_id('stock.quant'),
            'domain_force': "[('id', '!=', %d)]" % self.quant.id})
        with self.assertRaises(AccessError):
            self.preview()
        self.assertEqual(self.quant.reserved_quantity, 0)
        self.assertEqual(self.picking.state, 'draft')

    def test_native_config_changes_during_preview_fail_closed_with_rollback(self):
        before = self.load()
        original = type(self.picking).action_confirm
        def changed(picking):
            result = original(picking)
            picking.picking_type_id.reservation_method = 'at_confirm'
            return result
        with patch.object(type(self.picking), 'action_confirm', changed), self.assertRaises(UserError):
            self.preview(before['version'])
        self.assertEqual(before, self.load())
        self.assertEqual(self.warehouse.out_type_id.reservation_method, 'manual')

    def test_native_failure_restores_callback_queues_and_documents(self):
        before = self.load()
        hooks = {name: getattr(self.env.cr, name) for name in ('precommit', 'postcommit', 'prerollback', 'postrollback')}
        original = type(self.picking).action_confirm
        def failed(picking):
            original(picking)
            picking.env.cr.postcommit.add(lambda: self.fail('A preview callback escaped.'))
            raise UserError('QorliaQA injected confirmation failure')
        with patch.object(type(self.picking), 'action_confirm', failed), self.assertRaises(UserError):
            self.preview(before['version'])
        for name, callbacks in hooks.items():
            self.assertIs(getattr(self.env.cr, name), callbacks)
        self.assertEqual(before, self.load())

    def test_client_default_and_tracking_context_cannot_change_native_preview(self):
        before = self.load()
        expected = self.preview(before['version'])
        injected = self.api().with_context(default_state='done', default_qty_done=99,
            tracking_disable=True, mail_notrack=True, mail_create_nolog=True)
        self.assertEqual(injected.qorlia_confirmation_load(self.order.id, self.picking.id), before)
        self.assertEqual(injected.qorlia_confirmation_preview(self.order.id, self.picking.id, before['version']), expected)
        self.assertEqual(self.picking.state, 'draft')

    def test_hidden_audit_is_counted_without_content_and_bound_to_signed_review(self):
        before = self.load()
        reviewed = self.preview(before['version'])
        counts = reviewed['effects']['private_audit_counts']
        self.assertGreater(counts['mail.tracking.value']['created'], 0)
        self.assertNotIn('mail.tracking.value', reviewed['effects']['created'])
        original = type(self.picking).action_confirm
        def changed(picking):
            result = original(picking)
            picking.env.cr.flush()
            audit = picking.env['mail.tracking.value'].sudo().search([
                ('mail_message_id.model', '=', 'stock.picking'),
                ('mail_message_id.res_id', '=', picking.id)], order='id desc', limit=1)
            self.assertTrue(audit)
            audit.new_value_char = 'QorliaQA private audit content'
            return result
        with patch.object(type(self.picking), 'action_confirm', changed):
            different = self.preview(before['version'])
        self.assertEqual(reviewed['effects'], different['effects'])
        self.assertNotEqual(reviewed['review_version'], different['review_version'])
        self.assertNotIn('QorliaQA private audit content', json.dumps(different))
        self.assertEqual(before, self.load())

    def test_missing_native_signing_configuration_fails_after_rollback(self):
        before = self.load()
        original = type(self.env['ir.config_parameter']).get_param
        def missing(parameters, key, *args, **kwargs):
            return False if key == 'database.secret' else original(parameters, key, *args, **kwargs)
        with patch.object(type(self.env['ir.config_parameter']), 'get_param', missing), self.assertRaises(UserError):
            self.preview(before['version'])
        self.assertEqual(before, self.load())

    def test_orderpoint_preview_includes_native_replenishment(self):
        self.env['ir.config_parameter'].set_param('stock.no_auto_scheduler', False)
        route = self.pull_route()
        self.product.route_ids = route
        self.env['stock.warehouse.orderpoint'].create({'name': 'QorliaQA Confirmation preview replenishment',
            'product_id': self.product.id, 'location_id': self.warehouse.lot_stock_id.id,
            'warehouse_id': self.warehouse.id, 'route_id': route.id, 'trigger': 'auto',
            'product_min_qty': 10, 'product_max_qty': 15})
        before = self.load()
        reviewed = self.preview(before['version'])
        supplies = reviewed['effects']['created']['stock.move']
        self.assertEqual(len(supplies), 1)
        self.assertEqual(supplies[0]['values']['product_uom_qty'], 10)
        self.assertEqual(supplies[0]['values']['location_dest_id'], self.picking.location_id.id)
        self.assertEqual(before, self.load())

    def test_push_preview_preserves_new_downstream_transfer_and_dependencies(self):
        dispatch = self.env['stock.location'].create({'name': 'QorliaQA Confirmation preview dispatch',
            'usage': 'internal', 'location_id': self.warehouse.view_location_id.id,
            'company_id': self.env.company.id})
        route = self.env['stock.route'].create({'name': 'QorliaQA Confirmation preview push route',
            'product_selectable': True, 'company_id': self.env.company.id})
        self.env['stock.rule'].create({'name': 'QorliaQA Confirmation preview push', 'route_id': route.id,
            'action': 'push', 'auto': 'manual', 'procure_method': 'make_to_stock',
            'location_src_id': dispatch.id, 'location_dest_id': self.customer.property_stock_customer.id,
            'picking_type_id': self.warehouse.out_type_id.id, 'warehouse_id': self.warehouse.id,
            'company_id': self.env.company.id})
        self.product.route_ids = route
        self.picking.location_dest_id = dispatch
        self.move.location_dest_id = dispatch
        before = self.load()
        reviewed = self.preview(before['version'])
        downstream = reviewed['effects']['created']['stock.move'][0]
        self.assertEqual(downstream['values']['move_orig_ids'], self.move.ids)
        self.assertEqual(downstream['values']['state'], 'waiting')
        self.assertEqual(downstream['values']['location_id'], dispatch.id)
        self.assertEqual(reviewed, self.preview(before['version']))
        self.assertEqual(before, self.load())
