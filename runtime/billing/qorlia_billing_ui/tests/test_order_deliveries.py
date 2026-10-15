# SPDX-License-Identifier: LGPL-3.0-or-later
# Copyright 2026 Qorlia contributors.
import uuid

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

    def page(self, after=0, version=False, limit=25):
        return self.env['sale.order'].with_user(self.user).qorlia_order_delivery_page(self.order.id, after, version, limit)

    def many(self, count):
        pickings = self.env['stock.picking'].create([{'picking_type_id': self.warehouse.out_type_id.id,
            'group_id': self.group.id, 'partner_id': self.customer.id, 'origin': 'QorliaQA Paged transfer',
            'location_id': self.warehouse.lot_stock_id.id,
            'location_dest_id': self.customer.property_stock_customer.id,
            'move_ids': [(0, 0, dict(self.move.copy_data()[0], picking_id=False))]} for _index in range(count)])
        self.assertEqual(pickings.sale_id, self.order)
        return pickings

    def test_paged_headers_match_legacy_values_without_inventing_empty_detail_rows(self):
        legacy = self.load()['rows'][0]
        page = self.page()
        self.assertEqual(page, self.page())
        self.assertEqual((page['total_count'], page['position'], page['after'], page['next_after']), (1, 0, 0, False))
        expected = {key: value for key, value in legacy.items() if key not in ('moves', 'operations')}
        self.assertEqual(page['rows'], [dict(expected, move_count=1, operation_count=1)])

    def test_more_than_one_hundred_transfers_page_in_native_identity_order(self):
        extra = self.many(100)
        with self.assertRaises(UserError):
            self.load()
        first = self.page(limit=17)
        ids, page = [], first
        while True:
            self.assertEqual(page['position'], len(ids))
            self.assertEqual(page['total_count'], 101)
            self.assertLessEqual(len(page['rows']), 17)
            ids.extend(row['id'] for row in page['rows'])
            if page['next_after'] is False:
                break
            page = self.page(page['next_after'], first['version'], 17)
        self.assertEqual(ids, sorted((self.picking | extra).ids))
        self.assertEqual(len(set(ids)), 101)
        end = self.page(ids[-1], first['version'], 17)
        self.assertEqual((end['position'], end['rows'], end['next_after']), (101, [], False))

    def test_selected_transfer_confirmation_and_exact_recovery_work_beyond_legacy_order_cap(self):
        self.many(100)
        model = self.env['stock.picking'].with_user(self.user)
        loaded = model.qorlia_transfer_load(self.order.id, self.picking.id)
        self.assertEqual(loaded['graph']['transfer']['id'], self.picking.id)
        loaded = model.qorlia_confirmation_load(self.order.id, self.picking.id)
        self.assertFalse(loaded['reason'])
        review = model.qorlia_confirmation_preview(self.order.id, self.picking.id, loaded['version'])
        request = {'order_id': self.order.id, 'transfer_id': self.picking.id,
            'version': loaded['version'], 'review_version': review['review_version'], 'request_key': str(uuid.uuid4())}
        accepted = model.qorlia_confirmation_save(request)
        self.assertTrue(accepted['accepted'])
        self.assertEqual(model.qorlia_confirmation_status(request), accepted)
        self.assertEqual(model.qorlia_confirmation_save(request), accepted)
        self.assertNotEqual(self.picking.state, 'done')

    def test_page_versions_detect_off_page_operation_batch_and_related_label_changes(self):
        self.many(1)
        for record, values in ((self.operation, {'qty_done': 1.5}),
                (self.lot, {'expiration_date': '2029-01-01 00:00:00'}),
                (self.product, {'name': 'QorliaQA Renamed paged medicine'}),
                (self.customer, {'name': 'QorliaQA Renamed paged customer'})):
            before = self.page(limit=1)
            record.write(values)
            with self.assertRaises(UserError):
                self.page(before['next_after'], before['version'], 1)

    def test_hidden_off_page_transfers_operations_batches_and_products_fail_closed(self):
        other = self.picking.copy()
        line = self.operation.copy({'picking_id': other.id, 'move_id': other.move_ids.id})
        for model, record in (('stock.picking', other), ('stock.move', other.move_ids),
                ('stock.move.line', line), ('stock.lot', self.lot), ('product.product', self.product)):
            rule = self.env['ir.rule'].create({'name': 'QorliaQA Hidden paged '+model,
                'model_id': self.env['ir.model']._get_id(model), 'domain_force': "[('id', '!=', %d)]" % record.id})
            with self.assertRaises(AccessError):
                self.page(limit=1)
            rule.unlink()

    def test_native_inherited_display_label_changes_invalidate_a_page(self):
        self.many(1)
        for record in (self.warehouse, self.warehouse.view_location_id):
            first = self.page(limit=1)
            record.name = 'QorliaQA Paged renamed ' + record.name
            self.env.flush_all()
            self.env.invalidate_all()
            current = self.page(limit=1)
            self.assertNotEqual(first['rows'], current['rows'])
            with self.assertRaises(UserError):
                self.page(first['next_after'], first['version'], 1)

    def test_summary_counts_large_detail_without_silently_truncating_or_enabling_oversized_actions(self):
        self.env['stock.move'].create([dict(self.move.copy_data()[0], picking_id=self.picking.id) for _index in range(500)])
        page = self.page()
        self.assertEqual(page['rows'][0]['move_count'], 501)
        self.assertNotIn('moves', page['rows'][0])
        with self.assertRaises(UserError):
            self.env['stock.picking'].with_user(self.user).qorlia_transfer_load(self.order.id, self.picking.id)

    def test_page_bounds_foreign_cursor_unknown_order_and_public_access_reject(self):
        model = self.env['sale.order'].with_user(self.user)
        for args in ((True, False, 25), (-1, False, 25), (0, True, 25), (0, 'wrong', 25),
                (0, False, True), (0, False, 0), (0, False, 101), (self.picking.id, False, 25)):
            with self.assertRaises(ValidationError):
                model.qorlia_order_delivery_page(self.order.id, *args)
        with self.assertRaises(ValidationError):
            self.page(2147483647, self.page()['version'])
        with self.assertRaises(UserError):
            model.qorlia_order_delivery_page(2147483647)
        with self.assertRaises(AccessError):
            self.env['sale.order'].with_user(self.env.ref('base.public_user')).qorlia_order_delivery_page(self.order.id)

    def test_empty_page_and_new_linked_transfer_invalidate_existing_cursor(self):
        other = self.env['sale.order'].create({'partner_id': self.customer.id, 'shop_id': self.shop.id})
        empty = self.env['sale.order'].with_user(self.user).qorlia_order_delivery_page(other.id)
        self.assertEqual((empty['rows'], empty['position'], empty['total_count'], empty['next_after']), ([], 0, 0, False))
        first = self.page()
        self.many(1)
        with self.assertRaises(UserError):
            self.page(self.picking.id, first['version'])

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
