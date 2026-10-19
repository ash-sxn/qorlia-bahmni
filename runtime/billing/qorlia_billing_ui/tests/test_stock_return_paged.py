# SPDX-License-Identifier: LGPL-3.0-or-later
# Copyright 2026 Qorlia contributors.
import copy
import json
from unittest.mock import patch

from odoo.exceptions import AccessError, UserError, ValidationError
from odoo.tests import TransactionCase, tagged

from ..models.stock_confirmation_paged import _effect_rows
from . import test_stock_return_contract as native_contract
from . import test_stock_validation_preview as preview_contract
from .test_stock_validation_contract import StockValidationFixture


@tagged('post_install', '-at_install')
class StockReturnPagedTest(StockValidationFixture, TransactionCase):
    prepared = preview_contract.StockValidationPreviewTest.prepared
    delivered = native_contract.StockReturnContractTest.delivered
    return_form = native_contract.StockReturnContractTest.return_form
    return_wizard = native_contract.StockReturnContractTest.return_wizard

    def selection(self, picking, lines=None, location=None):
        loaded = picking.qorlia_return_paged_load(self.order.id, picking.id)
        return {'order_id': self.order.id, 'transfer_id': picking.id, 'version': loaded['version'],
            'location_id': location or loaded['form']['location'][0],
            'lines': lines if lines is not None else [{'move_id': picking.move_ids.id, 'quantity': 2}]}

    def pages(self, picking, data, limit=50):
        pages, after, version, token = [], 0, False, False
        while True:
            page = picking.qorlia_return_paged_review(data, after, version, token, limit)
            pages.append(page)
            self.assertFalse(page['write_ready'])
            self.assertNotIn('lines', page)
            self.assertEqual(len(page['line_rows']) + len(_effect_rows(page['effects'])),
                min(limit, page['total_count'] - after))
            self.assertNotIn('lines', page['form'])
            if page['next_after'] is False:
                self.assertEqual(len(page['review_complete_token']), 64)
                self.assertFalse(page['continuation_token'])
                break
            self.assertFalse(page['review_complete_token'])
            after, version, token = page['next_after'], page['review_version'], page['continuation_token']
        json.dumps(pages, allow_nan=False)
        return pages

    def test_compact_load_matches_native_defaults_and_preserves_every_guarded_table(self):
        picking = self.delivered()
        native = self.return_wizard(picking)
        tables = picking._qorlia_return_paged_tables()
        self.env.cr.flush()
        before = picking._qorlia_confirmation_stamp(tables)
        loaded = picking.qorlia_return_paged_load(self.order.id, picking.id)
        self.assertNotIn('graph', loaded)
        self.assertNotIn('lines', loaded['form'])
        self.assertFalse(loaded['write_ready'])
        self.assertFalse(loaded['reason'])
        self.assertEqual(loaded['line_count'], 1)
        page = picking.qorlia_return_paged_lines(self.order.id, picking.id, loaded['version'])
        row = page['rows'][0]
        self.assertEqual((row['move_id'], row['product'][0], row['unit'][0], row['quantity']),
            (native.product_return_moves.move_id.id, self.product.id, self.product.uom_id.id, 5))
        self.assertTrue(row['updates_order_quantities'])
        self.assertEqual(loaded['form']['location'][0], native.location_id.id)
        self.assertEqual(before, picking._qorlia_confirmation_stamp(tables))

    def test_501_native_completed_moves_and_selected_return_rows_have_complete_paging(self):
        picking = self.picking(quantity=1)
        picking.group_id = self.env['procurement.group'].create({'name': 'QorliaQA Complete return group',
            'sale_id': self.order.id, 'partner_id': self.customer.id})
        picking.move_ids.group_id = picking.group_id
        self.env['stock.quant']._update_available_quantity(self.product, self.warehouse.lot_stock_id, 491, lot_id=self.lot)
        original = picking.move_ids
        self.env['stock.move'].create([{'name': 'QorliaQA Complete return %s' % index,
            'picking_id': picking.id, 'group_id': picking.group_id.id,
            'product_id': self.product.id, 'product_uom': self.product.uom_id.id,
            'product_uom_qty': 1, 'sale_line_id': self.sale_line.id, 'location_id': picking.location_id.id,
            'location_dest_id': picking.location_dest_id.id} for index in range(500)])
        picking.move_ids._action_confirm(merge=False)
        picking.action_assign()
        self.assertEqual(len(picking.move_line_ids), 501)
        picking.move_line_ids.write({'qty_done': 1})
        self.assertIs(picking.button_validate(), True)
        self.assertEqual(self.sale_line.qty_delivered, 501)
        self.assertEqual(picking.sale_id, self.order)
        loaded = picking.qorlia_return_paged_load(self.order.id, picking.id)
        self.assertEqual(loaded['line_count'], 501)
        self.assertEqual(loaded['transfer']['move_count'], 501)
        with self.assertRaises(UserError):
            picking.qorlia_return_load(self.order.id, picking.id)
        rows = []
        for after in range(0, 501, 100):
            page = picking.qorlia_return_paged_lines(self.order.id, picking.id, loaded['version'], after, 100)
            self.assertLessEqual(len(page['rows']), 100)
            rows.extend(page['rows'])
        self.assertEqual([row['move_id'] for row in rows], sorted(picking.move_ids.ids))
        lines = [{'move_id': row['move_id'], 'quantity': 1 if index == 500 else 0} for index, row in enumerate(rows)]
        data = self.selection(picking, lines)
        with self.assertRaises(ValidationError):
            picking._qorlia_return_edited_form(data['location_id'], lines)
        before = picking._qorlia_confirmation_stamp(picking._qorlia_return_paged_tables())
        pages = self.pages(picking, data, 100)
        self.assertEqual([row['move_id'] for page in pages for row in page['line_rows']], sorted(picking.move_ids.ids))
        created = [row for page in pages for row in page['effects']['created'].get('stock.move', [])]
        self.assertEqual(len(created), 1)
        self.assertEqual(created[0]['values']['origin_returned_move_id'], rows[-1]['move_id'])
        self.assertNotEqual(rows[-1]['move_id'], original.id)
        self.assertEqual(before, picking._qorlia_confirmation_stamp(picking._qorlia_return_paged_tables()))
        self.env['ir.rule'].create({'name': 'QorliaQA Hidden last original return move',
            'model_id': self.env['ir.model']._get_id('stock.move'),
            'domain_force': "[('id', '!=', %d)]" % rows[-1]['move_id']})
        with self.assertRaises(AccessError):
            picking.qorlia_return_paged_load(self.order.id, picking.id)

    def test_review_binds_form_rows_effects_and_complete_ordered_proofs_without_creation(self):
        picking = self.delivered()
        data = self.selection(picking)
        before = picking._qorlia_confirmation_stamp(picking._qorlia_return_paged_tables())
        first = picking.qorlia_return_paged_review(data, limit=1)
        self.assertEqual(first['line_rows'][0]['quantity'], 2)
        self.assertFalse(first['review_complete_token'])
        self.assertFalse(_effect_rows(first['effects']))
        with self.assertRaises(UserError):
            picking.qorlia_return_paged_review(data, 2, first['review_version'], first['continuation_token'], 1)
        with self.assertRaises(UserError):
            picking.qorlia_return_paged_review(data, 1, first['review_version'], data['version'], 1)
        changed = copy.deepcopy(data)
        changed['lines'][0]['quantity'] = 3
        with self.assertRaises(UserError):
            picking.qorlia_return_paged_review(changed, 1, first['review_version'], first['continuation_token'], 1)
        pages = self.pages(picking, data, 1)
        self.assertTrue(any(page['effects']['created'].get('stock.picking') for page in pages))
        self.assertEqual(before, picking._qorlia_confirmation_stamp(picking._qorlia_return_paged_tables()))
        self.assertEqual((self.source_stock(), self.sale_line.qty_delivered), (5, 5))

    def test_stale_form_inventory_and_native_configuration_cannot_mix_pages(self):
        picking = self.delivered()
        data = self.selection(picking)
        self.lot.write({'name': 'QorliaQA Changed return label'})
        with self.assertRaises(UserError):
            picking.qorlia_return_paged_lines(self.order.id, picking.id, data['version'])
        with self.assertRaises(UserError):
            picking.qorlia_return_paged_review(data)
        data = self.selection(picking)
        self.env['stock.quant']._update_available_quantity(self.product, picking.location_dest_id, 1, lot_id=self.lot)
        with self.assertRaises(UserError):
            picking.qorlia_return_paged_review(data)

    def test_nonfinite_duplicate_foreign_and_hidden_quantity_update_edits_are_denied(self):
        picking = self.delivered()
        foreign_move = self.picking().move_ids.id
        data = self.selection(picking)
        for lines in ([{'move_id': picking.move_ids.id, 'quantity': amount}]
                for amount in (True, '1', float('nan'), float('inf'), 10 ** 1000)):
            with self.assertRaises(ValidationError):
                picking.qorlia_return_paged_review(dict(data, lines=lines))
        for lines in (data['lines'] * 2, [{'move_id': foreign_move, 'quantity': 1}],
                [dict(data['lines'][0], to_refund=False)]):
            with self.assertRaises(ValidationError):
                picking.qorlia_return_paged_review(dict(data, lines=lines))
        with self.assertRaises(ValidationError):
            picking.qorlia_return_paged_review(dict(data, complete=True))

    def test_native_zero_removal_and_over_return_rules_are_not_replaced(self):
        picking = self.delivered()
        data = self.selection(picking)
        for lines in ([], [dict(data['lines'][0], quantity=0)]):
            with self.assertRaisesRegex(UserError, 'non-zero quantity'):
                picking.qorlia_return_paged_review(dict(data, lines=lines))
        pages = self.pages(picking, dict(data, lines=[dict(data['lines'][0], quantity=6)]))
        moves = [row for page in pages for row in page['effects']['created'].get('stock.move', [])]
        self.assertEqual(moves[0]['values']['product_uom_qty'], 6)
        self.assertEqual((self.source_stock(), self.sale_line.qty_delivered), (5, 5))

    def test_native_location_role_domain_search_and_changed_snapshot(self):
        picking = self.delivered()
        alternate = self.env['stock.location'].create({'name': 'QorliaQA Paged return alternative',
            'usage': 'internal', 'return_location': True, 'company_id': self.env.company.id})
        data = self.selection(picking)
        page = picking.qorlia_return_paged_locations(self.order.id, picking.id, data['version'], alternate.name, limit=1)
        self.assertEqual(page['rows'], [[alternate.id, alternate.display_name]])
        pages = self.pages(picking, dict(data, location_id=alternate.id))
        self.assertEqual(pages[0]['form']['location'][0], alternate.id)
        invalid = self.env['stock.location'].create({'name': 'QorliaQA Not return location', 'usage': 'internal'})
        with self.assertRaises(ValidationError):
            picking.qorlia_return_paged_review(dict(self.selection(picking), location_id=invalid.id))
        role = self.env.ref('stock.group_stock_multi_locations')
        self.env['res.groups'].search([('implied_ids', 'in', role.ids)]).write({'implied_ids': [(3, role.id)]})
        self.user.write({'groups_id': [(3, role.id)]})
        data = self.selection(picking)
        with self.assertRaises(AccessError):
            picking.qorlia_return_paged_locations(self.order.id, picking.id, data['version'])
        with self.assertRaises(AccessError):
            picking.qorlia_return_paged_review(dict(data, location_id=alternate.id))

    def test_hidden_original_moves_or_wrong_order_are_not_a_partial_visible_form(self):
        picking = self.delivered()
        other = self.env['sale.order'].create({'partner_id': self.customer.id, 'shop_id': self.shop.id})
        with self.assertRaises(UserError):
            picking.qorlia_return_paged_load(other.id, picking.id)
        with self.assertRaises(AccessError):
            picking.with_user(self.env.ref('base.public_user')).qorlia_return_paged_load(self.order.id, picking.id)
        self.env['ir.rule'].create({'name': 'QorliaQA Paged hidden return source',
            'model_id': self.env['ir.model']._get_id('stock.move'),
            'domain_force': "[('id', '!=', %d)]" % picking.move_ids.id})
        with self.assertRaises(AccessError):
            picking.qorlia_return_paged_load(self.order.id, picking.id)

    def test_page_bounds_versions_and_client_context_are_not_capability_flags(self):
        picking = self.delivered()
        data = self.selection(picking)
        for kwargs in ({'after': -1}, {'after': True}, {'limit': 0}, {'limit': 101},
                {'after': 1}, {'review_version': 'a' * 64}, {'continuation_token': 'bad'}):
            with self.assertRaises(ValidationError):
                picking.qorlia_return_paged_review(data, **kwargs)
        for kwargs in ({'after': 2}, {'after': -1}, {'limit': True}):
            with self.assertRaises(ValidationError):
                picking.qorlia_return_paged_lines(self.order.id, picking.id, data['version'], **kwargs)
        loaded = picking.with_context(complete_inventory=True, write_ready=True).qorlia_return_paged_load(self.order.id, picking.id)
        self.assertEqual(loaded['version'], data['version'])
        self.assertFalse(loaded['write_ready'])

    def test_uncompleted_transfer_retains_native_reason_without_writable_form(self):
        picking = self.prepared()
        loaded = picking.qorlia_return_paged_load(self.order.id, picking.id)
        self.assertFalse(loaded['form'])
        self.assertFalse(loaded['line_count'])
        self.assertFalse(loaded['write_ready'])
        self.assertTrue(loaded['reason'])
        with self.assertRaises(UserError):
            picking.qorlia_return_paged_lines(self.order.id, picking.id, loaded['version'])

    def test_native_non_base_unit_defaults_and_quantities_remain_in_product_units(self):
        picking = self.picking(quantity=0.5)
        picking.group_id = self.env['procurement.group'].create({'name': 'QorliaQA Return unit group',
            'sale_id': self.order.id, 'partner_id': self.customer.id})
        picking.move_ids.group_id = picking.group_id
        picking.move_ids.product_uom = self.env.ref('uom.product_uom_dozen')
        picking.action_confirm()
        picking.action_assign()
        picking.move_line_ids.write({'qty_done': 0.5})
        self.assertIs(picking.button_validate(), True)
        loaded = picking.qorlia_return_paged_load(self.order.id, picking.id)
        row = picking.qorlia_return_paged_lines(self.order.id, picking.id, loaded['version'])['rows'][0]
        self.assertEqual((row['quantity'], row['unit'][0]), (6, self.product.uom_id.id))
        pages = self.pages(picking, self.selection(picking, [{'move_id': picking.move_ids.id, 'quantity': 7}]))
        self.assertEqual(pages[0]['line_rows'][0]['quantity'], 7)

    def test_all_native_callback_queues_are_restored_after_preview(self):
        picking = self.delivered()
        data = self.selection(picking)
        hooks = {name: (getattr(self.env.cr, name), list(getattr(self.env.cr, name)._funcs))
            for name in ('precommit', 'postcommit', 'prerollback', 'postrollback')}
        model = type(self.env['stock.return.picking'])
        original = model.create_returns
        def native(wizard):
            result = original(wizard)
            for name in hooks:
                getattr(self.env.cr, name).add(lambda: None)
            return result
        with patch.object(model, 'create_returns', native):
            self.pages(picking, data)
        for name, (callbacks, functions) in hooks.items():
            self.assertIs(getattr(self.env.cr, name), callbacks)
            self.assertEqual(list(callbacks._funcs), functions)
