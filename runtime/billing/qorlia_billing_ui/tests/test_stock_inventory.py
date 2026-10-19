# SPDX-License-Identifier: LGPL-3.0-or-later
# Copyright 2026 Qorlia contributors.
from unittest.mock import patch

from odoo.exceptions import AccessError, UserError, ValidationError
from odoo.tests import TransactionCase, tagged

from .test_stock_validation_contract import StockValidationFixture


class StockInventoryFixture(StockValidationFixture):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.reader = cls.env['res.users'].with_context(no_reset_password=True).create({
            'name': 'QorliaQA Inventory stock reader', 'login': 'qorliaqa-inventory-stock-reader',
            'company_id': cls.env.company.id, 'company_ids': [(6, 0, cls.env.company.ids)],
            'groups_id': [(6, 0, [cls.env.ref('stock.group_stock_user').id])]})

    def page(self, **kwargs):
        return self.env['stock.picking'].with_user(self.reader).qorlia_inventory_transfers(**kwargs)

    def empty(self, kind=None, **values):
        kind = kind or self.internal_type
        return self.env['stock.picking'].create({'picking_type_id': kind.id,
            'location_id': self.warehouse.lot_stock_id.id, 'location_dest_id': self.warehouse.lot_stock_id.id,
            'origin': 'QorliaQA Inventory', **values})

    def stamp(self):
        self.env.cr.flush()
        return self.env['stock.picking']._qorlia_confirmation_stamp(
            self.env['stock.picking']._qorlia_return_paged_tables())


@tagged('post_install', '-at_install')
class StockInventoryReadTest(StockInventoryFixture, TransactionCase):
    def test_native_menu_access_and_stock_only_reader(self):
        self.assertTrue(self.reader.has_group('stock.group_stock_user'))
        self.assertFalse(self.reader.has_group('sales_team.group_sale_salesman'))
        menu = self.env.ref('stock.all_picking')
        self.assertIn(self.env.ref('stock.group_stock_user'), menu.groups_id)
        self.assertEqual(menu.action.res_model, 'stock.picking')
        self.assertFalse(menu.action.domain)
        self.empty()
        self.assertTrue(self.page(search='QorliaQA Inventory')['rows'])

    def test_all_three_unlinked_operation_types_and_no_mutation(self):
        transfers = [self.empty(kind) for kind in (self.in_type, self.out_type, self.internal_type)]
        self.assertTrue(all(not row.sale_id for row in transfers))
        before = self.stamp()
        for kind, transfer in zip(('incoming', 'outgoing', 'internal'), transfers):
            result = self.page(search='QorliaQA Inventory', operation=kind)
            self.assertEqual([row['id'] for row in result['rows']], transfer.ids)
            self.assertEqual(result['rows'][0], self.env['sale.order'].with_user(self.reader)._qorlia_delivery_header(transfer.with_user(self.reader)))
            self.assertTrue(result['read_only'])
            self.assertEqual(result['filters'], {'search': 'QorliaQA Inventory', 'operation': kind, 'state': 'all'})
        self.assertEqual(self.stamp(), before)

    def test_complete_offset_pages_use_native_order_and_counts(self):
        for index in range(56):
            self.empty(priority=str(index % 2), scheduled_date='2026-10-19 10:00:00')
        native = self.env['stock.picking'].with_user(self.reader).search([
            ('company_id', 'in', self.reader.company_ids.ids), ('origin', 'ilike', 'QorliaQA Inventory')])
        rows = []
        for offset, expected_next in ((0, 25), (25, 50), (50, False)):
            page = self.page(search='QorliaQA Inventory', offset=offset)
            self.assertEqual(page['total_count'], 56)
            self.assertEqual(page['next_offset'], expected_next)
            rows += [row['id'] for row in page['rows']]
        self.assertEqual(rows, native.ids)
        self.assertEqual(self.page(search='QorliaQA Inventory', offset=75)['rows'], [])

    def test_search_uses_reference_or_origin_without_treating_text_as_a_domain(self):
        row = self.empty(origin='QorliaQA Inventory unique source %_[]')
        self.assertEqual([item['id'] for item in self.page(search=row.name)['rows']], row.ids)
        self.assertEqual(self.page(search="[('id', '>', 0)]")['rows'], [])
        self.assertEqual([item['id'] for item in self.page(search='  unique source  ')['rows']], row.ids)

    def test_waiting_filter_preserves_native_confirmed_and_waiting_states(self):
        origin = self.picking()
        target = self.picking()
        origin.move_ids.move_dest_ids = target.move_ids
        origin.action_confirm()
        target.action_confirm()
        self.assertEqual((origin.state, target.state), ('confirmed', 'waiting'))
        rows = self.page(search='QorliaQA Validation native contract', state='waiting')['rows']
        self.assertEqual({row['id'] for row in rows}, set((origin | target).ids))

    def test_hidden_transfers_are_excluded_as_in_native_browse_not_disclosed_in_counts(self):
        visible, hidden = self.empty(), self.empty()
        self.env['ir.rule'].create({'name': 'QorliaQA Inventory hidden transfer',
            'model_id': self.env['ir.model']._get_id('stock.picking'), 'domain_force': "[('id', '!=', %s)]" % hidden.id,
            'perm_read': True, 'perm_create': False, 'perm_write': False, 'perm_unlink': False})
        result = self.page(search='QorliaQA Inventory')
        self.assertEqual(result['total_count'], 1)
        self.assertEqual([row['id'] for row in result['rows']], visible.ids)

    def test_nonstock_and_portal_accounts_cannot_enumerate_inventory(self):
        self.empty()
        for index, group in enumerate(('base.group_user', 'base.group_portal')):
            actor = self.env['res.users'].with_context(no_reset_password=True).create({
                'name': 'QorliaQA Inventory denied', 'login': 'qorliaqa-inventory-denied-%s' % index,
                'company_id': self.env.company.id, 'company_ids': [(6, 0, self.env.company.ids)],
                'groups_id': [(6, 0, [self.env.ref(group).id])]})
            with self.assertRaises(AccessError):
                self.env['stock.picking'].with_user(actor).qorlia_inventory_transfers()
        other = self.env['res.company'].create({'name': 'QorliaQA Inventory inactive company'})
        with self.assertRaises(AccessError):
            self.env['stock.picking'].with_user(self.reader).with_context(allowed_company_ids=[other.id]).qorlia_inventory_transfers()

    def test_invalid_filters_reject_before_search(self):
        for values in ({'offset': True}, {'offset': -1}, {'offset': 2147483648}, {'search': []},
                {'search': 'x' * 161}, {'operation': 'sudo'}, {'operation': []}, {'state': 'confirmed'}, {'state': {}}):
            with self.assertRaises(ValidationError):
                self.page(**values)

    def test_only_active_companies_are_listed_even_when_the_actor_can_use_both(self):
        local = self.empty()
        other = self.env['res.company'].create({'name': 'QorliaQA Inventory second company'})
        warehouse = self.env['stock.warehouse'].search([('company_id', '=', other.id)], limit=1)
        if not warehouse:
            warehouse = self.env['stock.warehouse'].create({'name': 'QorliaQA Inventory second warehouse',
                'code': 'QGI', 'company_id': other.id})
        foreign = self.env['stock.picking'].with_company(other).create({'picking_type_id': warehouse.int_type_id.id,
            'location_id': warehouse.lot_stock_id.id, 'location_dest_id': warehouse.lot_stock_id.id,
            'origin': 'QorliaQA Inventory'})
        self.reader.company_ids = [(4, other.id)]
        model = self.env['stock.picking'].with_user(self.reader)
        for company, expected in ((self.env.company, local), (other, foreign)):
            result = model.with_context(allowed_company_ids=company.ids).qorlia_inventory_transfers(search='QorliaQA Inventory')
            self.assertEqual(result['total_count'], 1)
            self.assertEqual([row['id'] for row in result['rows']], expected.ids)
            active = model.with_context(allowed_company_ids=company.ids)
            self.assertEqual(active.qorlia_inventory_transfer_load(expected.id)['transfer']['id'], expected.id)
            inactive = foreign if expected == local else local
            with self.assertRaises(AccessError):
                active.qorlia_inventory_transfer_load(inactive.id)


@tagged('post_install', '-at_install')
class StockInventoryDetailTest(StockInventoryFixture, TransactionCase):
    def load(self, picking, actor=None):
        return self.env['stock.picking'].with_user(actor or self.reader).qorlia_inventory_transfer_load(picking.id)

    def detail(self, picking, section='moves', after=0, version=False, actor=None, limit=50):
        return self.env['stock.picking'].with_user(actor or self.reader).qorlia_inventory_transfer_detail_page(
            picking.id, section, after, version, limit)

    def operation(self, picking):
        return self.env['stock.move.line'].create({'picking_id': picking.id, 'move_id': picking.move_ids[0].id,
            'product_id': self.product.id, 'product_uom_id': self.product.uom_id.id, 'lot_id': self.lot.id,
            'location_id': picking.location_id.id, 'location_dest_id': picking.location_dest_id.id,
            'qty_done': 0})

    def deny(self, model, identifier):
        return self.env['ir.rule'].create({'name': 'QorliaQA Inventory detail hidden %s' % model,
            'model_id': self.env['ir.model']._get_id(model), 'domain_force': "[('id', '!=', %s)]" % identifier,
            'perm_read': True, 'perm_create': False, 'perm_write': False, 'perm_unlink': False})

    def assert_denied_without_changes(self, picking):
        before = self.stamp()
        with self.assertRaises(AccessError):
            self.load(picking)
        with self.assertRaises(AccessError):
            self.detail(picking)
        self.assertEqual(self.stamp(), before)

    def test_empty_unlinked_transfer_has_complete_zero_pages_for_all_operation_types(self):
        for kind in (self.in_type, self.out_type, self.internal_type):
            picking = self.empty(kind)
            self.assertFalse(picking.sale_id)
            loaded = self.load(picking)
            self.assertEqual((loaded['transfer']['move_count'], loaded['transfer']['operation_count']), (0, 0))
            for section in ('moves', 'operations'):
                page = self.detail(picking, section, version=loaded['version'])
                self.assertEqual((page['rows'], page['total_count'], page['position'], page['next_after']), ([], 0, 0, False))
                self.assertEqual(page['transfer'], loaded['transfer'])
                self.assertNotIn('order_id', page)

    def test_stock_only_actor_reads_complete_native_values_without_sales_access(self):
        picking = self.picking(self.in_type)
        line = self.operation(picking)
        self.assertFalse(picking.sale_id)
        self.assertFalse(self.reader.has_group('sales_team.group_sale_salesman'))
        # Deny even accidental attempts to resolve sales data; global stock has no such dependency.
        self.env['ir.rule'].create({'name': 'QorliaQA Inventory forbid sales lines',
            'model_id': self.env['ir.model']._get_id('sale.order.line'), 'domain_force': "[('id', '=', 0)]",
            'perm_read': True, 'perm_create': False, 'perm_write': False, 'perm_unlink': False})
        before = self.stamp()
        loaded = self.load(picking)
        moves = self.detail(picking, version=loaded['version'])
        operations = self.detail(picking, 'operations', version=loaded['version'])
        self.assertEqual(moves['rows'][0], {'id': picking.move_ids.id, 'state': picking.move_ids.state,
            'product': [self.product.id, self.product.display_name], 'unit': [self.product.uom_id.id, self.product.uom_id.display_name],
            'demand': 5, 'reserved': 0, 'done': 0})
        self.assertEqual(operations['rows'][0], self.env['sale.order'].with_user(self.reader)._qorlia_delivery_operation(line.with_user(self.reader)))
        self.assertNotIn('order_line', moves['rows'][0])
        self.assertEqual(self.stamp(), before)

    def test_501_moves_and_2001_operations_are_complete_and_bounded_without_legacy_caps(self):
        picking = self.picking(self.in_type)
        move = picking.move_ids
        moves = move | self.env['stock.move'].create([dict(move.copy_data()[0], picking_id=picking.id) for _index in range(500)])
        first = self.operation(picking)
        lines = first | self.env['stock.move.line'].create([dict(first.copy_data()[0], picking_id=picking.id, move_id=move.id) for _index in range(2000)])
        before = self.stamp()
        loaded = self.load(picking)
        self.assertEqual((loaded['transfer']['move_count'], loaded['transfer']['operation_count']), (501, 2001))
        for section, expected in (('moves', moves), ('operations', lines)):
            seen, after = [], 0
            while True:
                page = self.detail(picking, section, after, loaded['version'], limit=100)
                self.assertLessEqual(len(page['rows']), 100)
                self.assertEqual(page['position'], len(seen))
                seen += [row['id'] for row in page['rows']]
                if page['next_after'] is False:
                    break
                after = page['next_after']
            self.assertEqual(seen, expected.sorted('id').ids)
        self.assertEqual(self.stamp(), before)

    def test_hidden_tail_move_rejects_details_instead_of_returning_a_partial_graph(self):
        picking = self.picking(self.in_type)
        tail = self.env['stock.move'].create([dict(picking.move_ids.copy_data()[0], picking_id=picking.id) for _index in range(50)])[-1]
        self.deny('stock.move', tail.id)
        self.assert_denied_without_changes(picking)
        self.assertIn(picking.id, [row['id'] for row in self.page(search=picking.name)['rows']])

    def test_hidden_tail_operation_rejects_complete_scope(self):
        picking = self.picking(self.in_type)
        first = self.operation(picking)
        tail = self.env['stock.move.line'].create([dict(first.copy_data()[0], picking_id=picking.id) for _index in range(50)])[-1]
        self.deny('stock.move.line', tail.id)
        self.assert_denied_without_changes(picking)

    def test_hidden_lot_rejects_before_disclosing_batch_labels(self):
        picking = self.picking(self.in_type)
        self.operation(picking)
        self.deny('stock.lot', self.lot.id)
        self.assert_denied_without_changes(picking)

    def test_hidden_owner_rejects_before_disclosing_partner_labels(self):
        picking = self.picking(self.in_type)
        line = self.operation(picking)
        owner = self.env['res.partner'].create({'name': 'QorliaQA PRIVATE Inventory owner'})
        line.owner_id = owner
        self.deny('res.partner', owner.id)
        self.assert_denied_without_changes(picking)

    def test_hidden_product_rejects_even_when_prefetched_by_another_actor(self):
        picking = self.picking(self.in_type)
        self.assertTrue(picking.move_ids.product_id.display_name)
        self.deny('product.product', self.product.id)
        self.assert_denied_without_changes(picking)

    def test_operation_field_read_permission_is_checked(self):
        picking = self.picking(self.in_type)
        self.operation(picking)
        original = type(self.env['stock.move.line']).check_field_access_rights
        def denied(records, operation, fields=None):
            if operation == 'read' and fields and 'qty_done' in fields:
                raise AccessError('QorliaQA denied operation quantity field')
            return original(records, operation, fields)
        with patch.object(type(self.env['stock.move.line']), 'check_field_access_rights', denied):
            self.assert_denied_without_changes(picking)

    def test_cross_transfer_operation_link_rejects_without_repairing_data(self):
        picking, other = self.picking(self.in_type), self.picking(self.in_type)
        line = self.operation(picking)
        self.env.flush_all()
        self.env.cr.execute('UPDATE stock_move_line SET move_id = %s WHERE id = %s', [other.move_ids.id, line.id])
        self.env.invalidate_all()
        self.assert_denied_without_changes(picking)

    def test_move_quantity_operation_batch_and_labels_invalidate_old_pages(self):
        picking = self.picking(self.in_type)
        line = self.operation(picking)
        mutations = ((picking.move_ids, 'product_uom_qty', 7), (line, 'qty_done', 1),
            (self.lot, 'expiration_date', '2028-01-01 00:00:00'), (self.product, 'name', 'QorliaQA Renamed inventory medicine'),
            (picking, 'origin', 'QorliaQA Changed source'))
        for record, field, value in mutations:
            loaded = self.load(picking)
            record.with_user(self.env.user).write({field: value})
            before = self.stamp()
            with self.assertRaises(UserError):
                self.detail(picking, version=loaded['version'])
            self.assertNotEqual(self.load(picking)['version'], loaded['version'])
            self.assertEqual(self.stamp(), before)
        self.assertEqual(self.source_stock(), 10)

    def test_scope_is_bound_to_author_timezone_and_access_policy(self):
        picking = self.picking(self.in_type)
        loaded = self.load(picking)
        another = self.reader.copy({'name': 'QorliaQA Other Inventory reader', 'login': 'qorliaqa-other-inventory-reader'})
        with self.assertRaises(UserError):
            self.detail(picking, version=loaded['version'], actor=another)
        with self.assertRaises(UserError):
            self.env['stock.picking'].with_user(self.reader).with_context(tz='Asia/Kolkata').qorlia_inventory_transfer_detail_page(
                picking.id, 'moves', version=loaded['version'])
        self.env['ir.rule'].create({'name': 'QorliaQA Inventory unchanged access policy',
            'model_id': self.env['ir.model']._get_id('stock.move'), 'domain_force': "[('id', '>', 0)]",
            'perm_read': True, 'perm_create': False, 'perm_write': False, 'perm_unlink': False})
        with self.assertRaises(UserError):
            self.detail(picking, version=loaded['version'])

    def test_hidden_transfer_cannot_be_loaded_by_known_identifier(self):
        picking = self.picking(self.in_type)
        self.deny('stock.picking', picking.id)
        self.assert_denied_without_changes(picking)

    def test_unrelated_transfer_updates_do_not_invalidate_this_graph(self):
        picking, other = self.empty(self.in_type), self.empty(self.in_type)
        loaded = self.load(picking)
        other.origin = 'QorliaQA Unrelated changed origin'
        self.assertEqual(self.load(picking)['version'], loaded['version'])

    def test_invalid_identifiers_sections_versions_and_cross_scope_cursors_reject(self):
        picking, other = self.picking(self.in_type), self.picking(self.in_type)
        for identifier in (False, 0, -1, '1'):
            with self.assertRaises(ValidationError):
                self.env['stock.picking'].with_user(self.reader).qorlia_inventory_transfer_load(identifier)
        for kwargs in ({'section': 'stock.quant'}, {'section': []}, {'section':'moves', 'after':-1},
                {'section':'moves', 'after':picking.move_ids.id}, {'section':'moves', 'limit':True},
                {'section':'moves', 'limit':101}, {'section':'moves', 'version':'bad'}):
            with self.assertRaises(ValidationError):
                self.env['stock.picking'].with_user(self.reader).qorlia_inventory_transfer_detail_page(picking.id, **kwargs)
        loaded = self.load(picking)
        with self.assertRaises(ValidationError):
            self.detail(picking, after=other.move_ids.id, version=loaded['version'])

    def test_nonstock_actor_cannot_use_load_or_detail_readers(self):
        picking = self.empty(self.in_type)
        actor = self.env['res.users'].with_context(no_reset_password=True).create({'name':'QorliaQA Denied detail reader',
            'login':'qorliaqa-denied-inventory-detail', 'company_id':self.env.company.id,
            'company_ids':[(6,0,self.env.company.ids)], 'groups_id':[(6,0,[self.env.ref('base.group_user').id])]})
        with self.assertRaises(AccessError):
            self.load(picking, actor=actor)
        with self.assertRaises(AccessError):
            self.detail(picking, actor=actor)
