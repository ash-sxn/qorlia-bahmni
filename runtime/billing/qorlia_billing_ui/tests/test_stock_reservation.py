# SPDX-License-Identifier: LGPL-3.0-or-later
# Copyright 2026 Qorlia contributors.
import uuid
from unittest.mock import patch

from odoo.exceptions import AccessError, UserError, ValidationError
from odoo.tests import TransactionCase, tagged


@tagged('post_install', '-at_install')
class StockReservationTest(TransactionCase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.customer = cls.env['res.partner'].create({'name': 'QorliaQA Reservation customer'})
        cls.product = cls.env['product.product'].create({'name': 'QorliaQA Reservation medicine',
            'type': 'product', 'tracking': 'lot', 'taxes_id': [(6, 0, [])]})
        cls.shop = cls.env['sale.shop'].search([('company_id', '=', cls.env.company.id)], limit=1)
        cls.warehouse = cls.shop.warehouse_id
        cls.warehouse.out_type_id.reservation_method = 'manual'
        cls.order = cls.env['sale.order'].create({'partner_id': cls.customer.id, 'shop_id': cls.shop.id})
        cls.sale_line = cls.env['sale.order.line'].create({'order_id': cls.order.id,
            'product_id': cls.product.id, 'product_uom_qty': 5, 'price_unit': 10})
        cls.group = cls.env['procurement.group'].create({'name': 'QorliaQA Reservation group', 'sale_id': cls.order.id})
        cls.picking = cls.env['stock.picking'].create({'picking_type_id': cls.warehouse.out_type_id.id,
            'partner_id': cls.customer.id, 'location_id': cls.warehouse.lot_stock_id.id,
            'location_dest_id': cls.customer.property_stock_customer.id, 'origin': cls.order.name})
        cls.move = cls.env['stock.move'].create({'name': cls.product.name, 'picking_id': cls.picking.id,
            'product_id': cls.product.id, 'product_uom': cls.product.uom_id.id, 'product_uom_qty': 5,
            'sale_line_id': cls.sale_line.id, 'group_id': cls.group.id,
            'location_id': cls.picking.location_id.id, 'location_dest_id': cls.picking.location_dest_id.id})
        cls.lot = cls.env['stock.lot'].create({'name': 'QorliaQA Reservation batch', 'product_id': cls.product.id,
            'company_id': cls.env.company.id, 'expiration_date': '2027-01-01 00:00:00'})
        cls.env['stock.quant']._update_available_quantity(cls.product, cls.picking.location_id, 10, lot_id=cls.lot)
        cls.picking.action_confirm()
        cls.quant = cls.env['stock.quant'].search([('product_id', '=', cls.product.id), ('lot_id', '=', cls.lot.id)])
        assert cls.picking.state == 'confirmed' and not cls.move.reserved_availability
        cls.user = cls.env['res.users'].with_context(no_reset_password=True).create({
            'name': 'QorliaQA Reservation staff', 'login': 'qorliaqa-reservation-staff',
            'company_id': cls.env.company.id, 'company_ids': [(6, 0, cls.env.company.ids)],
            'groups_id': [(6, 0, [cls.env.ref('sales_team.group_sale_manager').id, cls.env.ref('stock.group_stock_user').id])],
        })

    def api(self):
        return self.env['stock.picking'].with_user(self.user)

    def load(self):
        return self.api().qorlia_transfer_load(self.order.id, self.picking.id)

    def review(self, action='assign'):
        current = self.load()
        return self.api().qorlia_transfer_preview(self.order.id, self.picking.id, current['version'], action)

    def request(self, review):
        return {key: review[key] for key in ('order_id', 'transfer_id', 'version', 'action', 'review_version')} | {'request_key': str(uuid.uuid4())}

    def test_load_native_visibility_and_unavailable_draft_or_finished_actions(self):
        current = self.load()
        self.assertFalse(current['reasons']['assign'])
        self.assertTrue(current['reasons']['unreserve'])
        self.move.state = 'draft'
        self.assertTrue(self.load()['reasons']['assign'])
        self.move.state = 'done'
        self.assertTrue(self.load()['reasons']['assign'])
        self.assertTrue(self.load()['reasons']['unreserve'])

    def test_preview_native_reservation_is_rolled_back_with_no_callbacks(self):
        before = self.load()
        counts = {name: self.env[name].search_count([]) for name in ('stock.move.line', 'account.move', 'mail.message')}
        hooks = {name: getattr(self.env.cr, name) for name in ('postcommit', 'prerollback', 'postrollback')}
        reviewed = self.review()
        self.assertEqual(reviewed['after']['transfer']['state'], 'assigned')
        self.assertEqual(reviewed['after']['transfer']['moves'][0]['reserved'], 5)
        self.assertEqual(reviewed['after']['transfer']['operations'][0]['lot'][0], self.lot.id)
        self.assertFalse(reviewed['after']['transfer']['operations'][0]['id'])
        self.assertEqual(reviewed['quant_after'][0]['reserved_quantity'], 5)
        self.assertEqual(reviewed['quant_after'][0]['unit'][0], self.product.uom_id.id)
        self.assertEqual(before, self.load())
        self.assertEqual(counts, {name: self.env[name].search_count([]) for name in counts})
        self.assertEqual(self.quant.quantity, 10)
        for name, callbacks in hooks.items():
            self.assertIs(getattr(self.env.cr, name), callbacks)

    def test_save_is_idempotent_and_status_recovers_exact_author_request(self):
        self.env.flush_all()
        self.env.cr.execute("UPDATE stock_picking SET write_date = '2026-01-01' WHERE id = %s", [self.picking.id])
        self.env.invalidate_all()
        request = self.request(self.review())
        self.assertFalse(self.api().qorlia_transfer_status(**request)['accepted'])
        accepted = self.api().qorlia_transfer_run(**request)
        self.assertTrue(accepted['accepted'])
        self.assertEqual(self.move.reserved_availability, 5)
        self.assertEqual(self.quant.quantity, 10)
        self.assertEqual(self.quant.reserved_quantity, 5)
        self.assertEqual(self.picking.state, 'assigned')
        self.assertEqual(self.api().qorlia_transfer_run(**request), accepted)
        self.assertEqual(self.api().qorlia_transfer_status(**request), accepted)
        self.env.flush_all()
        self.env.invalidate_all()
        self.assertEqual(self.api().qorlia_transfer_status(**request), accepted)
        self.assertEqual(len(self.picking.move_line_ids), 1)
        with self.assertRaises(ValidationError):
            self.api().qorlia_transfer_run(**{**request, 'action': 'unreserve'})

    def test_unreserve_preserves_entered_done_quantities_without_delivering_or_invoicing(self):
        self.api().qorlia_transfer_run(**self.request(self.review()))
        self.picking.move_line_ids.qty_done = 2
        before = {name: self.env[name].search_count([]) for name in ('account.move', 'account.payment', 'stock.valuation.layer')}
        reviewed = self.review('unreserve')
        self.assertEqual(reviewed['after']['transfer']['operations'][0]['done'], 2)
        accepted = self.api().qorlia_transfer_run(**self.request(reviewed))
        self.assertTrue(accepted['accepted'])
        self.assertEqual(self.picking.move_line_ids.qty_done, 2)
        self.assertEqual(self.quant.reserved_quantity, 0)
        self.assertEqual(self.quant.quantity, 10)
        self.assertNotEqual(self.picking.state, 'done')
        self.assertEqual(self.sale_line.qty_delivered, 0)
        self.assertEqual(before, {name: self.env[name].search_count([]) for name in before})

    def test_inventory_or_demand_changes_reject_stale_load_and_review(self):
        current = self.load()
        self.env['stock.quant']._update_available_quantity(self.product, self.picking.location_id, 1, lot_id=self.lot)
        with self.assertRaises(UserError):
            self.api().qorlia_transfer_preview(self.order.id, self.picking.id, current['version'], 'assign')
        request = self.request(self.review())
        self.move.product_uom_qty = 4
        with self.assertRaises(UserError):
            self.api().qorlia_transfer_run(**request)
        self.assertFalse(self.picking.qorlia_reservation_receipts)
        self.assertEqual(self.quant.reserved_quantity, 0)

    def test_hidden_quant_fails_closed_before_any_reservation(self):
        rule = self.env['ir.rule'].create({'name': 'QorliaQA Hidden reservation quant',
            'model_id': self.env['ir.model']._get_id('stock.quant'),
            'domain_force': "[('id', '!=', %d)]" % self.quant.id})
        current = self.load()
        self.assertTrue(current['reasons']['assign'])
        with self.assertRaises(AccessError):
            self.api().qorlia_transfer_preview(self.order.id, self.picking.id, current['version'], 'assign')
        self.assertEqual(self.quant.reserved_quantity, 0)
        rule.unlink()

    def test_read_only_transfer_rule_disables_actions_and_blocks_direct_preview(self):
        self.env['ir.rule'].create({'name': 'QorliaQA Read-only reservation transfer',
            'model_id': self.env['ir.model']._get_id('stock.picking'),
            'domain_force': "[('id', '!=', %d)]" % self.picking.id,
            'perm_read': False, 'perm_write': True, 'perm_create': False, 'perm_unlink': False})
        current = self.load()
        self.assertTrue(current['reasons']['assign'])
        with self.assertRaises(AccessError):
            self.api().qorlia_transfer_preview(self.order.id, self.picking.id, current['version'], 'assign')
        self.assertEqual(self.quant.reserved_quantity, 0)

    def test_invalid_foreign_and_public_requests_are_denied(self):
        for identifier in (True, 0, -1, '1', 1.5):
            with self.assertRaises(ValidationError):
                self.api().qorlia_transfer_load(self.order.id, identifier)
        other = self.env['sale.order'].create({'partner_id': self.customer.id, 'shop_id': self.shop.id})
        with self.assertRaises(UserError):
            self.api().qorlia_transfer_load(other.id, self.picking.id)
        with self.assertRaises(AccessError):
            self.env['stock.picking'].with_user(self.env.ref('base.public_user')).qorlia_transfer_load(self.order.id, self.picking.id)
        request = self.request(self.review())
        for change, error in (({'request_key': 'invalid'}, ValidationError), ({'action': 'validate'}, ValidationError),
                ({'review_version': 'f' * 64}, UserError), ({'version': []}, ValidationError)):
            with self.assertRaises(error):
                self.api().qorlia_transfer_run(**{**request, **change})

    def test_receipts_cannot_be_forged_written_or_copied(self):
        with self.assertRaises(AccessError):
            self.picking.write({'qorlia_reservation_receipts': {'forged': {}}})
        with self.assertRaises(AccessError):
            self.env['stock.picking'].create({'qorlia_reservation_receipts': {}})
        with self.assertRaises(AccessError):
            self.env['stock.picking'].with_context(default_qorlia_reservation_receipts={}).create({})
        self.api().qorlia_transfer_run(**self.request(self.review()))
        self.assertFalse(self.picking.copy().qorlia_reservation_receipts)

    def test_receipt_status_is_not_available_to_another_author(self):
        request = self.request(self.review())
        self.api().qorlia_transfer_run(**request)
        other = self.user.copy({'name': 'QorliaQA Other reservation author', 'login': 'qorliaqa-reservation-other'})
        with self.assertRaises(ValidationError):
            self.env['stock.picking'].with_user(other).qorlia_transfer_status(**request)

    def test_unreviewed_actual_effects_roll_back_inventory_and_receipts(self):
        request = self.request(self.review())
        original = type(self.picking).action_assign
        calls = []
        def changed(picking):
            result = original(picking)
            calls.append(True)
            if len(calls) == 2:
                picking.move_line_ids.qty_done = 3
            return result
        with patch.object(type(self.picking), 'action_assign', changed):
            with self.assertRaises(UserError):
                self.api().qorlia_transfer_run(**request)
        self.assertEqual(self.quant.reserved_quantity, 0)
        self.assertFalse(self.picking.qorlia_reservation_receipts)
        self.assertFalse(self.picking.move_line_ids)
