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

    def paged_data(self, edits=None, action='save', new=False):
        loaded = self.api().qorlia_operation_paged_load(self.order.id, self.picking.id, self.move.id, False if new else self.line.id)
        return {key: loaded[key] for key in ('order_id', 'transfer_id', 'move_id', 'operation_id', 'version')} | {
            'action': action, 'edits': edits if edits is not None else [{'field': 'qty_done', 'value': 2}]}

    def paged_pages(self, data=None, limit=100):
        data = data or self.paged_data()
        pages, after, reviewed, token = [], 0, False, False
        while True:
            page = self.api().qorlia_operation_paged_review(data, after, reviewed, token, limit)
            pages.append(page)
            if page['next_after'] is False:
                return pages
            after, reviewed, token = page['next_after'], page['review_version'], page['continuation_token']

    def paged_exact(self, data=None, limit=100):
        page = self.paged_pages(data, limit)[-1]
        return {key: page[key] for key in ('order_id', 'transfer_id', 'move_id', 'operation_id', 'version',
            'edits', 'action', 'review_version', 'review_complete_token')} | {'request_key': str(uuid.uuid4())}

    def test_paged_operation_changes_save_once_without_delivering_or_accounting(self):
        tables = self.picking._qorlia_operation_paged_tables()
        before = self.picking._qorlia_confirmation_stamp(tables)
        request = self.paged_exact(limit=1)
        self.assertEqual(self.picking._qorlia_confirmation_stamp(tables), before)
        self.assertFalse(self.api().qorlia_operation_paged_status(request)['accepted'])
        saved = self.api().qorlia_operation_paged_save(request)
        self.assertTrue(saved['accepted'])
        self.assertEqual(saved['operation_id'], self.line.id)
        self.assertEqual(self.line.qty_done, 2)
        self.assertEqual(self.line.reserved_uom_qty, 5)
        self.assertEqual(self.sale_line.qty_delivered, 0)
        self.assertEqual(self.env['stock.quant'].search([('product_id', '=', self.product.id)]).quantity, 10)
        self.assertEqual(saved, self.api().qorlia_operation_paged_status(request))
        self.assertEqual(saved, self.api().qorlia_operation_paged_save(request))
        self.assertEqual(len(self.picking.qorlia_operation_receipts), 1)
        self.assertEqual(self.picking.qorlia_operation_receipts[request['request_key']]['kind'], 'qorlia.paged-operation.v1')
        self.assertNotIn('operations', saved['current']['transfer'])

    def test_paged_new_operation_has_virtual_identity_and_recovers_real_id_and_reference(self):
        data = self.paged_data([{'field': 'qty_done', 'value': 1}, {'field': 'lot_id', 'value': self.lot.id}], new=True)
        pages = self.paged_pages(data, 1)
        self.assertEqual(pages[-1]['operation_key'], 'new:stock.move.line:0')
        request = self.paged_exact(data, 1)
        saved = self.api().qorlia_operation_paged_save(request)
        self.assertNotEqual(saved['operation_id'], self.line.id)
        self.assertEqual(self.env['stock.move.line'].browse(saved['operation_id']).qty_done, 1)
        references = self.api().qorlia_operation_paged_references(request, limit=1)
        self.assertEqual(references['total_count'], saved['reference_count'])
        self.assertIn({'key': 'new:stock.move.line:0', 'model': 'stock.move.line', 'id': saved['operation_id'],
            'name': self.env['stock.move.line'].browse(saved['operation_id']).display_name, 'available': True}, references['rows'])
        self.assertEqual(saved, self.api().qorlia_operation_paged_save(request))
        self.assertEqual(len(self.picking.move_line_ids), 2)

    def test_paged_delete_recovers_after_original_operation_is_gone(self):
        request = self.paged_exact(self.paged_data([], 'delete'), 1)
        self.assertTrue(self.line.exists())
        saved = self.api().qorlia_operation_paged_save(request)
        self.assertFalse(saved['operation_id'])
        self.assertFalse(self.line.exists())
        self.assertEqual(saved['current']['transfer']['operation_count'], 0)
        self.assertEqual(self.env['stock.quant'].search([('product_id', '=', self.product.id)]).reserved_quantity, 0)
        self.assertEqual(saved, self.api().qorlia_operation_paged_save(request))
        self.assertEqual(saved, self.api().qorlia_operation_paged_status(request))

    def test_paged_review_proof_cannot_skip_pages_complete_early_or_change_intent(self):
        data = self.paged_data()
        first = self.api().qorlia_operation_paged_review(data, limit=1)
        self.assertIsNot(first['next_after'], False)
        self.assertFalse(first['review_complete_token'])
        with self.assertRaises(ValidationError):
            self.api().qorlia_operation_paged_save({**data, 'review_version': first['review_version'],
                'review_complete_token': False, 'request_key': str(uuid.uuid4())})
        for offset, review, token in ((first['next_after'] + 1, first['review_version'], first['continuation_token']),
                (first['next_after'], 'a' * 64, first['continuation_token']),
                (first['next_after'], first['review_version'], 'b' * 64)):
            with self.assertRaises(UserError):
                self.api().qorlia_operation_paged_review(data, offset, review, token, 1)
        request = self.paged_exact(data)
        with self.assertRaises(UserError):
            self.api().qorlia_operation_paged_save({**request, 'edits': [{'field': 'qty_done', 'value': 3}]})
        self.assertEqual(self.line.qty_done, 0)
        self.assertFalse(self.picking.qorlia_operation_receipts)

    def test_paged_review_rejects_stale_source_and_unrelated_configuration_changes(self):
        request = self.paged_exact()
        self.env['ir.config_parameter'].set_param('qorliaqa.operation.review.config', 'changed')
        with self.assertRaises(UserError):
            self.api().qorlia_operation_paged_save(request)
        request = self.paged_exact()
        self.env['stock.quant']._update_available_quantity(self.product, self.picking.location_id, 1, lot_id=self.lot)
        with self.assertRaises(UserError):
            self.api().qorlia_operation_paged_save(request)
        self.assertEqual(self.line.qty_done, 0)
        self.assertFalse(self.picking.qorlia_operation_receipts)

    def test_paged_unreviewed_actual_effect_and_all_callbacks_roll_back(self):
        request = self.paged_exact()
        original, calls = type(self.picking)._qorlia_operation_apply, []
        hooks = {name: (getattr(self.env.cr, name), list(getattr(self.env.cr, name)._funcs))
            for name in ('precommit', 'postcommit', 'prerollback', 'postrollback')}
        def altered(records, *args):
            result = original(records, *args)
            calls.append(True)
            if len(calls) == 2:
                self.line.qty_done = 3
                for name in hooks:
                    getattr(self.env.cr, name).add(lambda: None)
            return result
        with patch.object(type(self.picking), '_qorlia_operation_apply', altered), self.assertRaises(UserError):
            self.api().qorlia_operation_paged_save(request)
        self.assertEqual(self.line.qty_done, 0)
        self.assertFalse(self.picking.qorlia_operation_receipts)
        for name, (hook, functions) in hooks.items():
            self.assertIs(getattr(self.env.cr, name), hook)
            self.assertEqual(list(hook._funcs), functions)

    def test_paged_physical_financial_and_configuration_side_effects_are_rejected(self):
        original = type(self.picking)._qorlia_operation_apply
        # A zero-rate tax changes the relation without changing stored monetary totals.
        tax = self.env['account.tax'].create({'name': 'QorliaQA Operation guard tax', 'amount': 0,
            'type_tax_use': 'sale', 'company_id': self.env.company.id})
        actions = (lambda: self.env['stock.quant']._update_available_quantity(self.product, self.picking.location_id, 1, lot_id=self.lot),
            lambda: self.sale_line.write({'price_unit': 99}),
            lambda: self.sale_line.write({'tax_id': [(6, 0, tax.ids)]}),
            lambda: self.env['ir.config_parameter'].set_param('qorliaqa.operation.unreviewed', 'write'))
        for action in actions:
            data = self.paged_data()
            before = self.picking._qorlia_confirmation_stamp(self.picking._qorlia_operation_paged_tables())
            def altered(records, *args):
                result = original(records, *args)
                action()
                return result
            with patch.object(type(self.picking), '_qorlia_operation_apply', altered), self.assertRaises(UserError):
                self.paged_pages(data)
            self.assertEqual(before, self.picking._qorlia_confirmation_stamp(self.picking._qorlia_operation_paged_tables()))

    def test_paged_hidden_unrelated_native_effect_cannot_be_silently_omitted(self):
        other = self.move.copy({'picking_id': False, 'sale_line_id': False, 'group_id': False})
        self.env['ir.rule'].create({'name': 'QorliaQA Hidden operation side effect',
            'model_id': self.env['ir.model']._get_id('stock.move'),
            'domain_force': "[('id', '!=', %d)]" % other.id})
        original = type(self.picking)._qorlia_operation_apply
        def altered(records, *args):
            result = original(records, *args)
            other.sudo().product_uom_qty += 1
            return result
        with patch.object(type(self.picking), '_qorlia_operation_apply', altered), self.assertRaises(AccessError):
            self.paged_pages()
        self.assertEqual(other.product_uom_qty, 5)
        self.assertEqual(self.line.qty_done, 0)

    def test_paged_receipt_rejects_another_author_role_nonce_intent_or_legacy_protocol(self):
        request = self.paged_exact()
        saved = self.api().qorlia_operation_paged_save(request)
        other = self.user.copy({'login': 'qorliaqa-paged-operation-other'})
        with self.assertRaises(ValidationError):
            self.env['stock.picking'].with_user(other).qorlia_operation_paged_status(request)
        with self.assertRaises(AccessError):
            self.env['stock.picking'].with_user(self.env.ref('base.public_user')).qorlia_operation_paged_status(request)
        with self.assertRaises(ValidationError):
            self.api().qorlia_operation_paged_status({**request, 'edits': [{'field': 'qty_done', 'value': 3}]})
        legacy = {key: value for key, value in request.items() if key != 'review_complete_token'}
        with self.assertRaises(ValidationError):
            self.api().qorlia_operation_status(legacy)
        self.assertEqual(saved, self.api().qorlia_operation_paged_save(request))
        self.assertFalse(self.picking.copy().qorlia_operation_receipts)

    def test_paged_bounds_strict_payloads_and_reference_state_are_enforced(self):
        data = self.paged_data()
        for options in ({'after': True}, {'after': -1}, {'limit': True}, {'limit': 0}, {'limit': 101},
                {'after': 1}, {'review_version': 'a' * 64}, {'continuation_token': 'a' * 64}):
            with self.assertRaises(ValidationError):
                self.api().qorlia_operation_paged_review(data, **options)
        for change in ({'context': {}}, {'edits': [None]}, {'action': []}, {'move_id': True}):
            with self.assertRaises(ValidationError):
                self.api().qorlia_operation_paged_review({**data, **change})
        request = self.paged_exact(data)
        with self.assertRaises(UserError):
            self.api().qorlia_operation_paged_references(request)
        for change in ({'context': {}}, {'request_key': 'bad'}, {'review_complete_token': 'bad'}):
            with self.assertRaises(ValidationError):
                self.api().qorlia_operation_paged_save({**request, **change})
        self.assertEqual(self.line.qty_done, 0)

    def test_paged_private_audit_is_hidden_but_bound_to_the_actual_save(self):
        message = self.env['mail.message'].create({'body': 'QorliaQA audit before',
            'model': 'stock.picking', 'res_id': self.picking.id, 'message_type': 'comment'})
        self.env['ir.rule'].create({'name': 'QorliaQA Private operation audit',
            'model_id': self.env['ir.model']._get_id('mail.message'),
            'domain_force': "[('id', '!=', %d)]" % message.id})
        original, calls = type(self.picking)._qorlia_operation_apply, []
        def altered(records, *args):
            result = original(records, *args)
            calls.append(True)
            message.sudo().body = 'QorliaQA hidden native audit %d' % len(calls)
            return result
        with patch.object(type(self.picking), '_qorlia_operation_apply', altered):
            pages = self.paged_pages()
            self.assertEqual(pages[-1]['effects']['private_audit_counts']['mail.message']['updated'], 1)
            self.assertNotIn('QorliaQA hidden native audit', str(pages))
            calls.clear()
            request = self.paged_exact()
            calls.clear()
            with self.assertRaises(UserError):
                self.api().qorlia_operation_paged_save(request)
        self.assertIn('QorliaQA audit before', message.body)
        self.assertEqual(self.line.qty_done, 0)
        self.assertFalse(self.picking.qorlia_operation_receipts)

    def test_paged_incoming_operation_keeps_native_receiving_prices_expiry_and_no_delivery(self):
        self.incoming()
        data = self.paged_data([{'field': 'lot_name', 'value': 'QorliaQA Paged receiving batch'},
            {'field': 'cost_price', 'value': 100}, {'field': 'mrp', 'value': 160},
            {'field': 'sale_price', 'value': 123}, {'field': 'expiration_date', 'value': '2030-01-01 00:00:00'},
            {'field': 'qty_done', 'value': 1}], new=True)
        saved = self.api().qorlia_operation_paged_save(self.paged_exact(data))
        operation = self.env['stock.move.line'].browse(saved['operation_id'])
        self.assertEqual((operation.cost_price, operation.mrp, operation.sale_price), (100, 160, 123))
        self.assertEqual(str(operation.expiration_date), '2030-01-01 00:00:00')
        self.assertEqual(operation.lot_name, 'QorliaQA Paged receiving batch')
        self.assertNotEqual(self.picking.state, 'done')
        self.assertEqual(self.sale_line.qty_delivered, 0)

    def test_paged_large_move_scope_saves_without_legacy_graph_or_lost_sibling_rows(self):
        self.env['stock.move'].create([dict(self.move.copy_data()[0], picking_id=self.picking.id) for _index in range(500)])
        before = {move.id: move.product_uom_qty for move in self.picking.move_ids}
        with patch.object(type(self.env['sale.order']), '_qorlia_delivery_data', side_effect=AssertionError('No legacy full graph.')):
            data = self.paged_data()
            form = self.api().qorlia_operation_paged_onchange(self.order.id, self.picking.id, self.move.id,
                data['version'], data['edits'], self.line.id)
            self.assertTrue(form['write_ready'])
            saved = self.api().qorlia_operation_paged_save(self.paged_exact(data, 1))
            self.assertEqual(saved['current']['transfer']['move_count'], 501)
            self.assertNotIn('moves', saved['current']['transfer'])
        self.assertEqual({move.id: move.product_uom_qty for move in self.picking.move_ids}, before)
        self.assertEqual(self.line.qty_done, 2)
        with self.assertRaises(UserError):
            self.edit_review([{'field': 'qty_done', 'value': 3}])

    def test_paged_large_operation_scope_creates_edits_deletes_and_recovers_beyond_legacy_limit(self):
        extra = self.env['stock.move.line'].create([{'picking_id': self.picking.id, 'move_id': self.move.id,
            'product_id': self.product.id, 'product_uom_id': self.product.uom_id.id,
            'location_id': self.move.location_id.id, 'location_dest_id': self.move.location_dest_id.id,
            'lot_id': self.lot.id} for _index in range(2000)])
        original = set(self.picking.move_line_ids.ids)
        with patch.object(type(self.env['sale.order']), '_qorlia_delivery_data', side_effect=AssertionError('No legacy full graph.')):
            request = self.paged_exact(self.paged_data([{'field': 'qty_done', 'value': 1}, {'field': 'lot_id', 'value': self.lot.id}], new=True))
            created = self.api().qorlia_operation_paged_save(request)
            self.assertEqual(created['current']['transfer']['operation_count'], 2002)
            self.assertEqual(created, self.api().qorlia_operation_paged_save(request))
            self.line = extra[-1]
            edited = self.api().qorlia_operation_paged_save(self.paged_exact())
            self.assertEqual(edited['operation_id'], extra[-1].id)
            self.assertEqual(extra[-1].qty_done, 2)
            self.line = self.env['stock.move.line'].browse(created['operation_id'])
            removal = self.paged_exact(self.paged_data([], 'delete'))
            deleted = self.api().qorlia_operation_paged_save(removal)
            self.assertEqual(deleted['current']['transfer']['operation_count'], 2001)
            self.assertEqual(deleted, self.api().qorlia_operation_paged_status(removal))
            self.assertEqual(deleted, self.api().qorlia_operation_paged_save(removal))
        self.assertEqual(set(self.picking.move_line_ids.ids), original)
        self.assertEqual(self.sale_line.qty_delivered, 0)
        self.assertEqual(self.env['stock.quant'].search([('product_id', '=', self.product.id)]).quantity, 10)

    def test_paged_generated_effects_and_reference_pages_are_complete_and_snapshot_bound(self):
        original = type(self.picking)._qorlia_operation_apply
        def expanded(records, *args):
            result = original(records, *args)
            self.env['stock.move.line'].with_user(self.user).create([{'picking_id': self.picking.id,
                'move_id': self.move.id, 'product_id': self.product.id, 'product_uom_id': self.product.uom_id.id,
                'location_id': self.move.location_id.id, 'location_dest_id': self.move.location_dest_id.id,
                'lot_id': self.lot.id} for _index in range(3)])
            return result
        with patch.object(type(self.picking), '_qorlia_operation_apply', expanded):
            data = self.paged_data()
            pages = self.paged_pages(data, 1)
            keys = [row['key'] for page in pages for row in page['effects']['created'].get('stock.move.line', [])]
            self.assertEqual(len(keys), 3)
            self.assertEqual(len(set(keys)), 3)
            request = self.paged_exact(data, 1)
            saved = self.api().qorlia_operation_paged_save(request)
        self.assertEqual(saved['reference_count'], 3)
        page = self.api().qorlia_operation_paged_references(request, limit=1)
        first = page
        rows = list(page['rows'])
        while page['next_after'] is not False:
            page = self.api().qorlia_operation_paged_references(request, page['next_after'], page['version'], 1)
            rows.extend(page['rows'])
        self.assertEqual({row['key'] for row in rows}, set(keys))
        self.assertTrue(all(row['available'] for row in rows))
        self.line.qty_done = 3
        with self.assertRaises(UserError):
            self.api().qorlia_operation_paged_references(request, first['next_after'], first['version'], 1)

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

    def grow_inventory(self):
        lots = self.env['stock.lot'].create([{'name': 'QorliaQA Operation inventory %s' % index,
            'product_id': self.product.id, 'company_id': self.env.company.id,
            'expiration_date': '2027-01-01 00:00:00'} for index in range(2000)])
        quants = self.env['stock.quant'].create([{'product_id': self.product.id,
            'location_id': self.picking.location_id.id, 'lot_id': lot.id, 'quantity': 1} for lot in lots])
        self.env.cr.flush()
        return quants

    def paged_choices(self, loaded, field='lot_id', edits=None, **extra):
        return self.api().qorlia_operation_paged_choices(self.order.id, self.picking.id, self.move.id,
            loaded['version'], edits or [], field, operation_id=loaded['operation_id'], **extra)

    def test_complete_inventory_form_onchange_choices_preserve_legacy_guard(self):
        quants = self.grow_inventory()
        before = self.picking._qorlia_confirmation_stamp(self.picking._qorlia_operation_paged_tables())
        with self.assertRaises(UserError):
            self.load()
        form = self.api().qorlia_operation_paged_load(self.order.id, self.picking.id, self.move.id, self.line.id)
        self.assertTrue(form['write_ready'])
        self.assertEqual(form['reserved'], 5)
        self.assertNotIn('quants', form)
        changed = self.api().qorlia_operation_paged_onchange(self.order.id, self.picking.id, self.move.id,
            form['version'], [{'field': 'qty_done', 'value': 2}], self.line.id)
        self.assertEqual(changed['values']['qty_done'], 2)
        choices = self.paged_choices(form, search=quants[-1].lot_id.name)
        self.assertEqual([row[0] for row in choices['rows']], [quants[-1].lot_id.id])
        self.assertEqual(self.line.qty_done, 0)
        self.assertEqual(before, self.picking._qorlia_confirmation_stamp(self.picking._qorlia_operation_paged_tables()))

    def test_complete_inventory_tail_changes_reject_onchange_choices_and_review(self):
        quants = self.grow_inventory()
        data = self.paged_data()
        quants[-1].quantity = 2
        with self.assertRaises(UserError):
            self.api().qorlia_operation_paged_onchange(self.order.id, self.picking.id, self.move.id,
                data['version'], data['edits'], self.line.id)
        with self.assertRaises(UserError):
            self.paged_choices(data)
        with self.assertRaises(UserError):
            self.paged_pages(data)
        self.assertFalse(self.picking.qorlia_operation_receipts)

    def test_complete_inventory_hidden_tail_and_field_access_cannot_be_bypassed(self):
        quants = self.grow_inventory()
        loaded = self.api().qorlia_operation_paged_load(self.order.id, self.picking.id, self.move.id, self.line.id)
        for model, identifier in (('stock.quant', quants[-1].id), ('stock.lot', quants[-1].lot_id.id)):
            rule = self.env['ir.rule'].create({'name': 'QorliaQA Operation hidden inventory tail',
                'model_id': self.env['ir.model']._get_id(model), 'domain_force': "[('id', '!=', %s)]" % identifier})
            with self.assertRaises(AccessError):
                self.api().qorlia_operation_paged_load(self.order.id, self.picking.id, self.move.id, self.line.id)
            with self.assertRaises(AccessError):
                self.paged_choices(loaded)
            rule.unlink()
        model = type(self.env['stock.quant'])
        original = model.check_field_access_rights
        def restricted(records, operation, names=None):
            if operation == 'read' and names and 'reserved_quantity' in names:
                raise AccessError('QorliaQA Inventory field access denied.')
            return original(records, operation, names)
        with patch.object(model, 'check_field_access_rights', restricted):
            with self.assertRaises(AccessError):
                self.api().qorlia_operation_paged_load(self.order.id, self.picking.id, self.move.id, self.line.id)
            with self.assertRaises(AccessError):
                self.paged_choices(loaded)

    def test_complete_inventory_edit_create_delete_recovery_preserves_stock_and_finance(self):
        self.grow_inventory()
        originals = set(self.picking.move_line_ids.ids)
        for quantity in (2, 0):
            request = self.paged_exact(self.paged_data([{'field': 'qty_done', 'value': quantity}]))
            accepted = self.api().qorlia_operation_paged_save(request)
            self.assertEqual(accepted, self.api().qorlia_operation_paged_status(request))
            self.assertEqual(accepted, self.api().qorlia_operation_paged_save(request))
            self.assertEqual(self.line.qty_done, quantity)
        created_request = self.paged_exact(self.paged_data([
            {'field': 'qty_done', 'value': 1}, {'field': 'lot_id', 'value': self.lot.id}], new=True))
        created = self.api().qorlia_operation_paged_save(created_request)
        form = self.api().qorlia_operation_paged_load(self.order.id, self.picking.id, self.move.id, created['operation_id'])
        data = {key: form[key] for key in ('order_id', 'transfer_id', 'move_id', 'operation_id', 'version')} | {'edits': [], 'action': 'delete'}
        self.api().qorlia_operation_paged_save(self.paged_exact(data))
        self.assertEqual(set(self.picking.move_line_ids.ids), originals)
        self.assertEqual(self.line.qty_done, 0)
        self.assertEqual(self.line.reserved_uom_qty, 5)
        self.assertEqual(sum(self.env['stock.quant'].search([('product_id', '=', self.product.id)]).mapped('quantity')), 2010)
        self.assertEqual(self.sale_line.qty_delivered, 0)
        self.assertEqual(len(self.picking.qorlia_operation_receipts), 4)
        before = self.picking._qorlia_confirmation_stamp(self.picking._qorlia_operation_paged_tables())
        self.assertTrue(self.api().qorlia_operation_paged_save(created_request)['accepted'])
        refs = self.api().qorlia_operation_paged_references(created_request)
        self.assertTrue(any(row['model'] == 'stock.move.line' and not row['available'] and row['id'] is False for row in refs['rows']))
        self.assertEqual(before, self.picking._qorlia_confirmation_stamp(self.picking._qorlia_operation_paged_tables()))

    def test_complete_inventory_accepted_prior_scope_request_recovery_does_not_rescan(self):
        model = type(self.picking)
        original = model._qorlia_operation_source
        def legacy_source(records, *args, **kwargs):
            return original(records, *args, **{**kwargs, 'complete_inventory': False})
        with patch.object(model, '_qorlia_operation_source', legacy_source):
            request = self.paged_exact()
            accepted = self.api().qorlia_operation_paged_save(request)
        with patch.object(model, '_qorlia_operation_source', side_effect=AssertionError('Accepted recovery must not rescan.')):
            self.assertEqual(self.api().qorlia_operation_paged_status(request), accepted)
            self.assertEqual(self.api().qorlia_operation_paged_save(request), accepted)
        self.assertEqual(self.line.qty_done, 2)
        self.assertEqual(len(self.picking.qorlia_operation_receipts), 1)

    def test_complete_inventory_choices_keep_native_domains_groups_and_bounds(self):
        self.grow_inventory()
        loaded = self.api().qorlia_operation_paged_load(self.order.id, self.picking.id, self.move.id, self.line.id)
        page = self.paged_choices(loaded, search='QorliaQA Operation inventory', offset=25)
        native = self.env['stock.lot'].with_user(self.user).name_search(name='QorliaQA Operation inventory',
            args=[('product_id', '=', self.product.id), ('company_id', '=', self.env.company.id)], operator='ilike', limit=51)
        self.assertEqual([row[0] for row in page['rows']], [row[0] for row in native[25:50]])
        self.assertTrue(page['has_more'])
        for extra in ({'offset': True}, {'offset': 100001}, {'search': 'x' * 201}):
            with self.assertRaises(ValidationError):
                self.paged_choices(loaded, **extra)
        with self.assertRaises(AccessError):
            self.paged_choices(loaded, field='product_uom_id')
        feature = self.env.ref('stock.group_production_lot')
        self.env.ref('base.group_user').implied_ids -= feature
        self.user.groups_id -= feature
        self.assertFalse(self.user.has_group('stock.group_production_lot'))
        hidden = self.api().qorlia_operation_paged_load(self.order.id, self.picking.id, self.move.id, self.line.id)
        self.assertTrue(hidden['rules']['lot_id']['readonly'])
        with self.assertRaises(AccessError):
            self.paged_choices(hidden)

    def test_complete_inventory_caller_defaults_cannot_select_another_scope(self):
        self.grow_inventory()
        plain = self.api().qorlia_operation_paged_load(self.order.id, self.picking.id, self.move.id, self.line.id)
        caller = self.api().with_context(default_qty_done=99, default_lot_id=False,
            tracking_disable=True, complete_inventory=False, active_test=False)
        self.assertEqual(caller.qorlia_operation_paged_load(self.order.id, self.picking.id, self.move.id, self.line.id), plain)
        self.assertEqual(caller.qorlia_operation_paged_choices(self.order.id, self.picking.id, self.move.id,
            plain['version'], [], 'lot_id', operation_id=self.line.id), self.paged_choices(plain))

    def test_complete_inventory_onchange_and_choices_discard_writes_and_callbacks(self):
        self.grow_inventory()
        loaded = self.api().qorlia_operation_paged_load(self.order.id, self.picking.id, self.move.id, self.line.id)
        self.env.cr.flush()
        before = self.picking._qorlia_confirmation_stamp(self.picking._qorlia_operation_paged_tables())
        cr = self.env.cr
        hooks = {name: getattr(cr, name) for name in ('precommit', 'postcommit', 'prerollback', 'postrollback')}
        model = type(self.env['stock.move.line'])
        original = model.onchange
        called = []
        def noisy(records, *args, **kwargs):
            self.env['mail.message'].create({'body': 'QorliaQA Operation onchange rolled back', 'message_type': 'comment'})
            for name in hooks:
                getattr(cr, name).add(lambda kind=name: called.append(kind))
            return original(records, *args, **kwargs)
        with patch.object(model, 'onchange', noisy):
            self.api().qorlia_operation_paged_onchange(self.order.id, self.picking.id, self.move.id,
                loaded['version'], [{'field': 'qty_done', 'value': 2}], self.line.id)
            self.paged_choices(loaded, edits=[{'field': 'qty_done', 'value': 2}])
        # Precommit flushes inside the savepoint; only deferred callbacks must not execute.
        self.assertEqual(called, ['precommit', 'precommit'])
        self.assertEqual(before, self.picking._qorlia_confirmation_stamp(self.picking._qorlia_operation_paged_tables()))
        for name, callbacks in hooks.items():
            self.assertIs(getattr(cr, name), callbacks)

