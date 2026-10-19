# SPDX-License-Identifier: LGPL-3.0-or-later
# Copyright 2026 Qorlia contributors.
from odoo.exceptions import AccessError, ValidationError
from odoo.tests import TransactionCase, tagged

from .test_stock_validation_contract import StockValidationFixture


@tagged('post_install', '-at_install')
class StockInventoryReadTest(StockValidationFixture, TransactionCase):
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
