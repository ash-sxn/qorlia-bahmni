# SPDX-License-Identifier: LGPL-3.0-or-later
# Copyright 2026 Qorlia contributors.
import uuid
from unittest.mock import patch

from odoo.exceptions import AccessError, UserError, ValidationError
from odoo.tests import TransactionCase, tagged


@tagged('post_install', '-at_install')
class StockOperationFormTest(TransactionCase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.customer = cls.env['res.partner'].create({'name': 'QorliaQA Stock form customer'})
        cls.product = cls.env['product.product'].create({'name': 'QorliaQA Stock form medicine',
            'type': 'product', 'tracking': 'lot', 'use_expiration_date': True, 'expiration_time': 90,
            'taxes_id': [(6, 0, [])]})
        cls.shop = cls.env['sale.shop'].search([('company_id', '=', cls.env.company.id)], limit=1)
        cls.warehouse = cls.shop.warehouse_id
        cls.warehouse.out_type_id.reservation_method = 'manual'
        cls.order = cls.env['sale.order'].create({'partner_id': cls.customer.id, 'shop_id': cls.shop.id})
        cls.sale_line = cls.env['sale.order.line'].create({'order_id': cls.order.id,
            'product_id': cls.product.id, 'product_uom_qty': 5, 'price_unit': 10})
        cls.group = cls.env['procurement.group'].create({'name': 'QorliaQA Stock form group', 'sale_id': cls.order.id})
        cls.picking = cls.env['stock.picking'].create({'picking_type_id': cls.warehouse.out_type_id.id,
            'partner_id': cls.customer.id, 'location_id': cls.warehouse.lot_stock_id.id,
            'location_dest_id': cls.customer.property_stock_customer.id, 'origin': cls.order.name})
        cls.move = cls.env['stock.move'].create({'name': cls.product.name, 'picking_id': cls.picking.id,
            'product_id': cls.product.id, 'product_uom': cls.product.uom_id.id, 'product_uom_qty': 5,
            'sale_line_id': cls.sale_line.id, 'group_id': cls.group.id,
            'location_id': cls.picking.location_id.id, 'location_dest_id': cls.picking.location_dest_id.id})
        cls.lot = cls.env['stock.lot'].create({'name': 'QorliaQA Stock form batch', 'product_id': cls.product.id,
            'company_id': cls.env.company.id, 'expiration_date': '2027-01-01 00:00:00'})
        cls.env['stock.quant']._update_available_quantity(cls.product, cls.picking.location_id, 10, lot_id=cls.lot)
        cls.picking.action_confirm()
        cls.picking.action_assign()
        cls.line = cls.move.move_line_ids
        assert len(cls.line) == 1 and cls.line.reserved_uom_qty == 5
        cls.user = cls.env['res.users'].with_context(no_reset_password=True).create({
            'name': 'QorliaQA Stock form staff', 'login': 'qorliaqa-stock-form-staff',
            'company_id': cls.env.company.id, 'company_ids': [(6, 0, cls.env.company.ids)],
            'groups_id': [(6, 0, [cls.env.ref(name).id for name in ('sales_team.group_sale_manager',
                'stock.group_stock_user', 'stock.group_production_lot', 'stock.group_stock_multi_locations',
                'stock.group_tracking_lot', 'stock.group_tracking_owner', 'uom.group_uom')])],
        })

    def api(self):
        return self.env['stock.picking'].with_user(self.user)

    def load(self, line=True):
        return self.api().qorlia_operation_load(self.order.id, self.picking.id, self.move.id, self.line.id if line else False)

    def change(self, edits, loaded=None):
        loaded = loaded or self.load()
        return self.api().qorlia_operation_onchange(self.order.id, self.picking.id, self.move.id,
            loaded['version'], edits, loaded['operation_id'])

    def choices(self, field, **extra):
        loaded = self.load()
        return self.api().qorlia_operation_choices(self.order.id, self.picking.id, self.move.id,
            loaded['version'], [], field, operation_id=self.line.id, **extra)

    def incoming(self):
        self.warehouse.in_type_id.write({'use_create_lots': True, 'use_existing_lots': False})
        self.picking = self.env['stock.picking'].create({'picking_type_id': self.warehouse.in_type_id.id,
            'partner_id': self.customer.id, 'location_id': self.customer.property_stock_supplier.id,
            'location_dest_id': self.warehouse.lot_stock_id.id, 'origin': self.order.name})
        self.move = self.env['stock.move'].create({'name': self.product.name, 'picking_id': self.picking.id,
            'product_id': self.product.id, 'product_uom': self.product.uom_id.id, 'product_uom_qty': 5,
            'sale_line_id': self.sale_line.id, 'group_id': self.group.id,
            'location_id': self.picking.location_id.id, 'location_dest_id': self.picking.location_dest_id.id})
        self.picking.action_confirm()
        return self.load(False)

    def test_existing_form_identity_labels_and_native_reserved_unit_rules(self):
        loaded = self.load()
        self.assertEqual((loaded['order_id'], loaded['transfer_id'], loaded['move_id'], loaded['operation_id']),
            (self.order.id, self.picking.id, self.move.id, self.line.id))
        self.assertEqual(loaded['reserved'], 5)
        self.assertEqual(loaded['labels']['lot_id'][0], self.lot.id)
        self.assertFalse(loaded['rules']['qty_done']['readonly'])
        self.assertTrue(loaded['rules']['product_uom_id']['readonly'])
        self.assertFalse(loaded['rules']['lot_name']['visible'])
        self.assertFalse(loaded['rules']['cost_price']['visible'])
        self.assertTrue(loaded['write_ready'])
        self.assertTrue(loaded['can_delete'])

    def test_qty_onchange_native_balance_and_no_writes(self):
        before = self.load()
        counts = {name: self.env[name].search_count([]) for name in ('stock.move.line', 'stock.quant', 'account.move', 'stock.valuation.layer')}
        changed = self.change([{'field': 'qty_done', 'value': 2}])
        expected = sum(self.env['stock.quant'].search([('product_id', '=', self.product.id),
            ('location_id', '=', self.picking.location_id.id)]).mapped('inventory_quantity_auto_apply')) - 2
        self.assertEqual(changed['values']['qty_done'], 2)
        self.assertEqual(changed['balance'], expected)
        self.assertEqual(self.load(), before)
        self.assertEqual(counts, {name: self.env[name].search_count([]) for name in counts})
        self.assertEqual(self.line.qty_done, 0)

    def test_new_operation_uses_native_defaults_without_creating_rows(self):
        before = self.env['stock.move.line'].search_count([])
        loaded = self.load(False)
        self.assertFalse(loaded['operation_id'])
        self.assertEqual(loaded['values']['product_uom_id'], self.move.product_uom.id)
        self.assertEqual(loaded['values']['location_id'], self.move.location_id.id)
        changed = self.change([{'field': 'qty_done', 'value': 1}], loaded)
        self.assertEqual(changed['values']['qty_done'], 1)
        self.assertEqual(before, self.env['stock.move.line'].search_count([]))

    def test_edit_history_preserves_native_cost_then_manual_sale_price_order(self):
        loaded = self.incoming()
        self.assertTrue(loaded['rules']['cost_price']['visible'])
        changes = [{'field': 'cost_price', 'value': 100}, {'field': 'sale_price', 'value': 123}]
        changed = self.change(changes, loaded)
        self.assertEqual(changed['values']['sale_price'], 123)
        reversed_edit = self.change(changes[::-1], loaded)
        self.assertEqual(reversed_edit['values']['sale_price'], self.env['price.markup.table'].with_user(self.user).calculate_price_with_markup(100))
        self.assertFalse(loaded['operation_id'])

    def test_incoming_existing_lot_native_name_expiry_and_readonly(self):
        loaded = self.incoming()
        changed = self.change([{'field': 'existing_lot_id', 'value': self.lot.id}], loaded)
        self.assertEqual(changed['values']['lot_name'], self.lot.name)
        self.assertEqual(changed['values']['expiration_date'], '2027-01-01 00:00:00')
        self.assertTrue(changed['rules']['lot_name']['readonly'])
        self.assertTrue(changed['rules']['expiration_date']['readonly'])
        with self.assertRaises(AccessError):
            self.change([{'field': 'existing_lot_id', 'value': self.lot.id}, {'field': 'lot_name', 'value': 'tamper'}], loaded)

    def test_stale_operation_and_product_config_denied(self):
        loaded = self.load()
        self.product.expiration_time += 1
        with self.assertRaises(UserError):
            self.change([{'field': 'qty_done', 'value': 2}], loaded)

    def test_foreign_move_operation_and_public_access_denied(self):
        for value in (True, 0, -1, '1'):
            with self.assertRaises(ValidationError):
                self.api().qorlia_operation_load(self.order.id, self.picking.id, value)
        other = self.move.copy({'picking_id': self.picking.id})
        with self.assertRaises(ValidationError):
            self.api().qorlia_operation_load(self.order.id, self.picking.id, other.id, self.line.id)
        with self.assertRaises(AccessError):
            self.env['stock.picking'].with_user(self.env.ref('base.public_user')).qorlia_operation_load(
                self.order.id, self.picking.id, self.move.id, self.line.id)

    def test_readonly_hidden_and_unknown_field_edits_denied(self):
        for name, value in [('product_uom_id', self.product.uom_id.id), ('cost_price', 1), ('lot_name', 'hidden')]:
            with self.assertRaises(AccessError):
                self.change([{'field': name, 'value': value}])
        for edits in ({}, [{}], [{'field': 'reserved_uom_qty', 'value': 1}], [{'field': [], 'value': 1}], [None], [0] * 101):
            with self.assertRaises(ValidationError):
                self.change(edits)
        for value in (True, float('nan'), float('inf'), '2'):
            with self.assertRaises(ValidationError):
                self.change([{'field': 'qty_done', 'value': value}])

    def test_lot_and_location_domains_apply_to_choices_and_submitted_edits(self):
        other_product = self.env['product.product'].create({'name': 'QorliaQA Other product', 'type': 'product'})
        other_lot = self.env['stock.lot'].create({'name': 'QorliaQA Other product batch',
            'product_id': other_product.id, 'company_id': self.env.company.id})
        self.assertIn(self.lot.id, [row[0] for row in self.choices('lot_id')['rows']])
        self.assertNotIn(other_lot.id, [row[0] for row in self.choices('lot_id')['rows']])
        with self.assertRaises(ValidationError):
            self.change([{'field': 'lot_id', 'value': other_lot.id}])
        with self.assertRaises(ValidationError):
            self.change([{'field': 'location_id', 'value': self.picking.location_dest_id.id}])

    def test_paged_choices_do_not_silently_truncate_lots(self):
        self.env['stock.lot'].create([{'name': 'QorliaQA Paged lot %02d' % index,
            'product_id': self.product.id, 'company_id': self.env.company.id} for index in range(30)])
        first = self.choices('lot_id', search='QorliaQA Paged lot')
        second = self.choices('lot_id', search='QorliaQA Paged lot', offset=25)
        self.assertEqual((len(first['rows']), first['has_more']), (25, True))
        self.assertEqual((len(second['rows']), second['has_more']), (5, False))
        self.assertFalse(set(row[0] for row in first['rows']) & set(row[0] for row in second['rows']))

    def test_single_form_over_500_moves_uses_complete_scope_not_legacy_graph(self):
        extra = self.env['stock.move'].create([
            dict(self.move.copy_data()[0], picking_id=self.picking.id) for _index in range(500)])
        self.assertEqual(len(self.picking.move_ids), 501)
        with patch.object(type(self.env['sale.order']), '_qorlia_delivery_data',
                side_effect=AssertionError('A single form must not load the full transfer graph.')):
            loaded = self.load()
            changed = self.change([{'field': 'qty_done', 'value': 2}], loaded)
            self.assertEqual(changed['values']['qty_done'], 2)
            self.assertIn(self.lot.id, [row[0] for row in self.choices('lot_id')['rows']])
            self.assertFalse(self.load(False)['operation_id'])
            self.assertFalse({'graph', 'moves', 'operations'} & set(loaded))
            self.assertFalse(loaded['write_ready'])
            self.assertFalse(loaded['can_delete'])
            self.assertIn('complete paged operation effects', loaded['reason'])
            extra[-1].product_uom_qty += 1
            with self.assertRaises(UserError):
                self.change([{'field': 'qty_done', 'value': 2}], loaded)
        # The legacy effects/save protocol still rejects oversized graphs, never a partial review.
        with self.assertRaises(UserError):
            self.edit_review([{'field': 'qty_done', 'value': 2}])
        self.assertEqual(self.line.qty_done, 0)
        self.assertFalse(self.picking.qorlia_operation_receipts)

    def test_single_form_over_2000_operations_preserves_off_page_identity_and_no_writes(self):
        extra = self.env['stock.move.line'].create([{
            'picking_id': self.picking.id, 'move_id': self.move.id, 'product_id': self.product.id,
            'product_uom_id': self.product.uom_id.id, 'location_id': self.move.location_id.id,
            'location_dest_id': self.move.location_dest_id.id, 'lot_id': self.lot.id,
        } for _index in range(2000)])
        self.assertEqual(len(self.picking.move_line_ids), 2001)
        self.line = extra[-1]
        self.env.flush_all()
        tables = ['stock_picking', 'stock_move', 'stock_move_line', 'stock_quant', 'stock_lot',
            'stock_package_level', 'product_product', 'product_template', 'sale_order', 'sale_order_line',
            'account_move', 'account_move_line', 'account_payment', 'account_analytic_line', 'stock_valuation_layer']
        before = self.picking._qorlia_confirmation_stamp(tables)
        with patch.object(type(self.env['sale.order']), '_qorlia_delivery_data',
                side_effect=AssertionError('A single form must not load the full transfer graph.')):
            loaded = self.load()
            self.assertEqual(loaded['operation_id'], extra[-1].id)
            self.assertFalse(loaded['write_ready'])
            self.assertFalse(loaded['can_delete'])
            self.assertEqual(self.change([{'field': 'qty_done', 'value': 2}], loaded)['values']['qty_done'], 2)
            self.assertIn(self.lot.id, [row[0] for row in self.choices('lot_id')['rows']])
        self.env.flush_all()
        self.assertEqual(self.picking._qorlia_confirmation_stamp(tables), before)
        with self.assertRaises(UserError):
            self.edit_review([{'field': 'qty_done', 'value': 2}], loaded=loaded)
        self.assertFalse(self.picking.qorlia_operation_receipts)

    def test_form_version_binds_sibling_operation_inventory_and_package_changes(self):
        sibling = self.line.copy({'reserved_uom_qty': 0})
        loaded = self.load()
        sibling.qty_done = 1
        with self.assertRaises(UserError):
            self.change([{'field': 'qty_done', 'value': 2}], loaded)
        loaded = self.load()
        self.env['stock.quant']._update_available_quantity(self.product, self.picking.location_id, 1, lot_id=self.lot)
        with self.assertRaises(UserError):
            self.change([{'field': 'qty_done', 'value': 2}], loaded)
        package = self.env['stock.quant.package'].create({'name': 'QorliaQA Form scope package'})
        level = self.env['stock.package_level'].create({'package_id': package.id,
            'picking_id': self.picking.id, 'company_id': self.env.company.id,
            'location_id': self.move.location_id.id, 'location_dest_id': self.move.location_dest_id.id})
        loaded = self.load()
        level.state = 'confirmed'
        with self.assertRaises(UserError):
            self.change([{'field': 'qty_done', 'value': 2}], loaded)

    def test_form_rejects_hidden_sibling_without_returning_selected_partial_form(self):
        sibling = self.line.copy({'reserved_uom_qty': 0})
        self.env['ir.rule'].create({'name': 'QorliaQA Hidden sibling operation form scope',
            'model_id': self.env['ir.model']._get_id('stock.move.line'),
            'domain_force': "[('id', '!=', %d)]" % sibling.id})
        with self.assertRaises(AccessError):
            self.load()
        with self.assertRaises(AccessError):
            self.load(False)

    def test_form_rejects_foreign_missing_moves_and_malformed_transfer_identity(self):
        foreign = self.picking.copy()
        for move_id in (foreign.move_ids[0].id, 2147483647):
            with self.assertRaises(ValidationError):
                self.api().qorlia_operation_load(self.order.id, self.picking.id, move_id)
        for transfer_id in (True, False, 0, -1, '1'):
            with self.assertRaises(ValidationError):
                self.api().qorlia_operation_load(self.order.id, transfer_id, self.move.id)

    def test_onchange_discards_unexpected_native_write_and_callbacks(self):
        native = type(self.line).onchange
        def writing(records, *args, **kwargs):
            self.line.qty_done = 3
            self.env.cr.postcommit.add(lambda: None)
            return native(records, *args, **kwargs)
        callbacks = self.env.cr.postcommit
        original = list(callbacks._funcs)
        with patch.object(type(self.line), 'onchange', writing):
            changed = self.change([{'field': 'qty_done', 'value': 2}])
        self.assertEqual(changed['values']['qty_done'], 2)
        self.assertEqual(self.line.qty_done, 0)
        self.assertIs(self.env.cr.postcommit, callbacks)
        self.assertEqual(list(callbacks._funcs), original)

    def test_group_hidden_record_and_done_operation_are_not_editable(self):
        loaded = self.load()
        self.move.state = 'done'
        done = self.load()
        self.assertTrue(done['reason'])
        self.assertTrue(all(rule['readonly'] for rule in done['rules'].values()))
        self.move.state = 'assigned'
        self.env['ir.rule'].create({'name': 'QorliaQA Hidden form operation',
            'model_id': self.env['ir.model']._get_id('stock.move.line'),
            'domain_force': "[('id', '!=', %d)]" % self.line.id})
        with self.assertRaises(AccessError):
            self.load()

    def test_hidden_inventory_fails_closed_instead_of_showing_partial_balance(self):
        quant = self.env['stock.quant'].search([('product_id', '=', self.product.id)], limit=1)
        self.env['ir.rule'].create({'name': 'QorliaQA Hidden form quant',
            'model_id': self.env['ir.model']._get_id('stock.quant'),
            'domain_force': "[('id', '!=', %d)]" % quant.id})
        with self.assertRaises(AccessError):
            self.load()

    def test_serial_warning_follows_latest_edit_without_saving_quantities(self):
        self.product.tracking = 'serial'
        loaded = self.load()
        changed = self.change([{'field': 'qty_done', 'value': 2}], loaded)
        self.assertTrue(changed['warning'])
        corrected = self.change([{'field': 'qty_done', 'value': 2}, {'field': 'qty_done', 'value': 1}], loaded)
        self.assertFalse(corrected['warning'])
        self.assertEqual(corrected['values']['qty_done'], 1)
        self.assertEqual(self.line.qty_done, 0)

    def test_internal_account_without_stock_role_cannot_open_form(self):
        account = self.env['res.users'].with_context(no_reset_password=True).create({
            'name': 'QorliaQA No stock form role', 'login': 'qorliaqa-no-stock-form-role',
            'company_id': self.env.company.id, 'company_ids': [(6, 0, self.env.company.ids)],
            'groups_id': [(6, 0, self.env.ref('base.group_user').ids)],
        })
        self.assertFalse(account.has_group('stock.group_stock_user'))
        with self.assertRaises(AccessError):
            self.env['stock.picking'].with_user(account).qorlia_operation_load(
                self.order.id, self.picking.id, self.move.id, self.line.id)

    def test_entire_package_locks_native_quantity_fields_not_bahmni_receiving_prices(self):
        self.incoming()
        self.picking.picking_type_id.show_entire_packs = True
        package = self.env['stock.quant.package'].create({'name': 'QorliaQA Form whole package'})
        level = self.env['stock.package_level'].create({'package_id': package.id,
            'picking_id': self.picking.id, 'company_id': self.env.company.id,
            'location_id': self.move.location_id.id, 'location_dest_id': self.move.location_dest_id.id})
        self.line = self.env['stock.move.line'].create({'picking_id': self.picking.id, 'move_id': self.move.id,
            'product_id': self.product.id, 'product_uom_id': self.product.uom_id.id,
            'location_id': self.move.location_id.id, 'location_dest_id': self.move.location_dest_id.id,
            'package_level_id': level.id, 'qty_done': 0})
        loaded = self.load()
        self.assertTrue(loaded['rules']['qty_done']['readonly'])
        self.assertTrue(loaded['rules']['product_uom_id']['readonly'])
        self.assertFalse(loaded['rules']['cost_price']['readonly'])
        self.assertFalse(loaded['rules']['existing_lot_id']['readonly'])
        self.assertFalse(loaded['rules']['expiration_date']['readonly'])

    def edit_review(self, edits, action='save', loaded=None):
        loaded = loaded or self.load()
        return self.api().qorlia_operation_preview({key: loaded[key] for key in
            ('order_id', 'transfer_id', 'move_id', 'operation_id', 'version')} | {'edits': edits, 'action': action})

    def edit_request(self, reviewed):
        return {key: reviewed[key] for key in ('order_id', 'transfer_id', 'move_id', 'operation_id', 'version', 'edits', 'action', 'review_version')} | {'request_key': str(uuid.uuid4())}

    def test_edit_preview_rolls_back_quantities_inventory_and_callbacks(self):
        before = self.load()
        counts = {name: self.env[name].search_count([]) for name in ('stock.move.line', 'account.move', 'stock.valuation.layer')}
        callbacks = self.env.cr.postcommit
        reviewed = self.edit_review([{'field': 'qty_done', 'value': 2}])
        self.assertEqual(reviewed['after']['transfer']['operations'][0]['done'], 2)
        self.assertEqual(reviewed['after']['form_rows'][0]['values']['qty_done'], 2)
        self.assertEqual(reviewed['quant_before'], reviewed['quant_after'])
        self.assertEqual(self.load(), before)
        self.assertEqual(counts, {name: self.env[name].search_count([]) for name in counts})
        self.assertIs(self.env.cr.postcommit, callbacks)

    def test_edit_save_recovers_identical_request_without_delivery_or_finance(self):
        counts = {name: self.env[name].search_count([]) for name in ('account.move', 'account.payment', 'stock.valuation.layer')}
        exact = self.edit_request(self.edit_review([{'field': 'qty_done', 'value': 2}]))
        self.assertFalse(self.api().qorlia_operation_status(exact)['accepted'])
        saved = self.api().qorlia_operation_save(exact)
        self.assertTrue(saved['accepted'])
        self.assertEqual(saved['operation_id'], self.line.id)
        self.env.flush_all()
        self.env.invalidate_all()
        self.assertEqual(self.api().qorlia_operation_status(exact), saved)
        self.assertEqual(self.api().qorlia_operation_save(exact), saved)
        self.assertEqual(self.line.qty_done, 2)
        self.assertEqual(self.line.reserved_uom_qty, 5)
        self.assertEqual(self.sale_line.qty_delivered, 0)
        self.assertNotEqual(self.picking.state, 'done')
        self.assertEqual(counts, {name: self.env[name].search_count([]) for name in counts})

    def test_new_operation_save_has_one_identity_and_no_duplicate_after_retry(self):
        loaded = self.load(False)
        reviewed = self.edit_review([{'field': 'qty_done', 'value': 1}, {'field': 'lot_id', 'value': self.lot.id}], loaded=loaded)
        self.assertEqual(len(reviewed['after']['form_rows']), 2)
        self.assertEqual(sum(row['id'] is False for row in reviewed['after']['form_rows']), 1)
        exact = self.edit_request(reviewed)
        saved = self.api().qorlia_operation_save(exact)
        self.assertTrue(saved['operation_id'])
        self.assertNotEqual(saved['operation_id'], self.line.id)
        self.assertEqual(self.api().qorlia_operation_save(exact), saved)
        self.assertEqual(len(self.move.move_line_ids), 2)
        self.assertEqual(self.env['stock.move.line'].browse(saved['operation_id']).qty_done, 1)

    def test_delete_releases_reservation_and_recovers_after_operation_disappears(self):
        reviewed = self.edit_review([], 'delete')
        self.assertFalse(reviewed['after']['transfer']['operations'])
        self.assertEqual(reviewed['quant_after'][0]['reserved_quantity'], 0)
        self.assertTrue(self.line.exists())
        exact = self.edit_request(reviewed)
        saved = self.api().qorlia_operation_save(exact)
        self.assertTrue(saved['accepted'])
        self.assertFalse(saved['operation_id'])
        self.assertFalse(self.line.exists())
        self.assertEqual(self.api().qorlia_operation_save(exact), saved)
        self.assertEqual(self.api().qorlia_operation_status(exact), saved)
        self.assertEqual(len(self.picking.qorlia_operation_receipts), 1)
        self.assertEqual(self.sale_line.qty_delivered, 0)

    def test_change_batch_reviews_and_saves_native_reservation_reallocation(self):
        other = self.env['stock.lot'].create({'name': 'QorliaQA Alternate form batch',
            'product_id': self.product.id, 'company_id': self.env.company.id, 'expiration_date': '2027-02-01 00:00:00'})
        self.env['stock.quant']._update_available_quantity(self.product, self.picking.location_id, 6, lot_id=other)
        reviewed = self.edit_review([{'field': 'lot_id', 'value': other.id}])
        expected = {row['lot_id'][0]: row['reserved_quantity'] for row in reviewed['quant_after']}
        self.assertEqual(expected, {self.lot.id: 0, other.id: 5})
        self.api().qorlia_operation_save(self.edit_request(reviewed))
        self.assertEqual(self.line.lot_id, other)
        self.assertEqual(self.line.expiration_date.strftime('%Y-%m-%d'), '2027-02-01')
        quants = self.env['stock.quant'].search([('product_id', '=', self.product.id)])
        self.assertEqual(sum(quants.mapped('quantity')), 16)
        self.assertEqual(sum(quants.mapped('reserved_quantity')), 5)

    def test_inventory_change_after_review_denies_save_without_receipt(self):
        exact = self.edit_request(self.edit_review([{'field': 'qty_done', 'value': 2}]))
        self.env['stock.quant']._update_available_quantity(self.product, self.picking.location_id, 1, lot_id=self.lot)
        with self.assertRaises(UserError):
            self.api().qorlia_operation_save(exact)
        self.assertEqual(self.line.qty_done, 0)
        self.assertFalse(self.picking.qorlia_operation_receipts)

    def test_unreviewed_save_effects_and_callbacks_roll_back(self):
        exact = self.edit_request(self.edit_review([{'field': 'qty_done', 'value': 2}]))
        original = type(self.picking)._qorlia_operation_apply
        calls = []
        callbacks = self.env.cr.postcommit
        functions = list(callbacks._funcs)
        def altered(records, *args):
            result = original(records, *args)
            calls.append(True)
            if len(calls) == 2:
                self.line.qty_done = 3
                self.env.cr.postcommit.add(lambda: None)
            return result
        with patch.object(type(self.picking), '_qorlia_operation_apply', altered):
            with self.assertRaises(UserError):
                self.api().qorlia_operation_save(exact)
        self.assertEqual(self.line.qty_done, 0)
        self.assertFalse(self.picking.qorlia_operation_receipts)
        self.assertIs(self.env.cr.postcommit, callbacks)
        self.assertEqual(list(callbacks._funcs), functions)

    def test_negative_quantities_and_price_above_mrp_reject_preview(self):
        with self.assertRaises(ValidationError):
            self.edit_review([{'field': 'qty_done', 'value': -1}])
        loaded = self.incoming()
        with self.assertRaises(ValidationError):
            self.edit_review([{'field': 'mrp', 'value': 100}, {'field': 'sale_price', 'value': 101}], loaded=loaded)

    def test_malformed_delete_and_reused_nonce_intent_are_denied(self):
        reviewed = self.edit_review([{'field': 'qty_done', 'value': 2}])
        exact = self.edit_request(reviewed)
        for patch_values in ({'action': []}, {'operation_id': True}, {'context': {}}, {'edits': [None]}, {'action': 'delete'}):
            with self.assertRaises(ValidationError):
                self.api().qorlia_operation_save({**exact, **patch_values})
        self.api().qorlia_operation_save(exact)
        with self.assertRaises(ValidationError):
            self.api().qorlia_operation_status({**exact, 'edits': [{'field': 'qty_done', 'value': 3}]})

    def test_receipts_cannot_be_forged_copied_or_read_by_another_author(self):
        with self.assertRaises(AccessError):
            self.picking.write({'qorlia_operation_receipts': {}})
        with self.assertRaises(AccessError):
            self.env['stock.picking'].with_context(default_qorlia_operation_receipts={}).create({})
        exact = self.edit_request(self.edit_review([{'field': 'qty_done', 'value': 2}]))
        self.api().qorlia_operation_save(exact)
        other = self.user.copy({'login': 'qorliaqa-form-other-author'})
        with self.assertRaises(ValidationError):
            self.env['stock.picking'].with_user(other).qorlia_operation_status(exact)
        self.assertFalse(self.picking.copy().qorlia_operation_receipts)

    def test_unlink_record_rule_disables_delete_and_denies_preview(self):
        self.env['ir.rule'].create({'name': 'QorliaQA Cannot remove stock operation',
            'model_id': self.env['ir.model']._get_id('stock.move.line'),
            'domain_force': "[('id', '!=', %d)]" % self.line.id,
            'perm_read': False, 'perm_write': False, 'perm_create': False, 'perm_unlink': True})
        self.assertFalse(self.load()['can_delete'])
        with self.assertRaises(AccessError):
            self.edit_review([], 'delete')

    def test_unreserved_operation_unit_conversion_is_native_and_not_delivery(self):
        self.picking.do_unreserve()
        self.line = self.env['stock.move.line'].create({'picking_id': self.picking.id,
            'move_id': self.move.id, 'product_id': self.product.id, 'product_uom_id': self.product.uom_id.id,
            'location_id': self.move.location_id.id, 'location_dest_id': self.move.location_dest_id.id, 'lot_id': self.lot.id})
        dozen = self.env.ref('uom.product_uom_dozen')
        reviewed = self.edit_review([{'field': 'product_uom_id', 'value': dozen.id}, {'field': 'qty_done', 'value': 1}])
        self.assertEqual(reviewed['after']['transfer']['operations'][0]['done'], 1)
        self.assertEqual(reviewed['after']['transfer']['moves'][0]['done'], 12)
        self.api().qorlia_operation_save(self.edit_request(reviewed))
        self.assertEqual(self.line.product_uom_id, dozen)
        self.assertEqual(self.line.qty_done, 1)
        self.assertEqual(self.sale_line.qty_delivered, 0)

