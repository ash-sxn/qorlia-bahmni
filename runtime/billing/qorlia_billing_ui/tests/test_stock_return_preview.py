# SPDX-License-Identifier: LGPL-3.0-or-later
# Copyright 2026 Qorlia contributors.
import copy
import json

from odoo.exceptions import AccessError, UserError, ValidationError
from odoo.tests import TransactionCase, tagged

from . import test_stock_return_contract as native_contract
from . import test_stock_validation_preview as preview_contract
from .test_stock_validation_contract import StockValidationFixture


@tagged('post_install', '-at_install')
class StockReturnPreviewTest(StockValidationFixture, TransactionCase):
    prepared = preview_contract.StockValidationPreviewTest.prepared
    delivered = native_contract.StockReturnContractTest.delivered
    return_form = native_contract.StockReturnContractTest.return_form
    return_wizard = native_contract.StockReturnContractTest.return_wizard

    def load(self, picking):
        return picking.qorlia_return_load(self.order.id, picking.id)

    def preview(self, picking, quantity=2, loaded=None):
        loaded = loaded or self.load(picking)
        return picking.qorlia_return_preview(self.order.id, picking.id, loaded['version'],
            loaded['form']['location'][0], [{'move_id': picking.move_ids.id, 'quantity': quantity}])

    def test_load_matches_native_form_without_transient_or_business_writes(self):
        picking = self.delivered()
        native = self.return_wizard(picking)
        self.env.flush_all()
        self.env.cr.flush()
        counts = {name: self.env[name].search_count([]) for name in (
            'stock.return.picking', 'stock.return.picking.line', 'stock.picking', 'mail.message')}
        loaded = self.load(picking)
        row = loaded['form']['lines'][0]
        self.assertEqual(row['quantity'], native.product_return_moves.quantity)
        self.assertEqual(row['unit'][0], native.product_return_moves.uom_id.id)
        self.assertEqual(row['product'][0], native.product_return_moves.product_id.id)
        self.assertEqual(row['updates_order_quantities'], native.product_return_moves.to_refund)
        self.assertEqual(loaded['form']['location'][0], native.location_id.id)
        self.assertTrue(loaded['write_ready'])
        self.assertFalse(loaded['reason'])
        self.assertEqual(counts, {name: self.env[name].search_count([]) for name in counts})
        self.assertEqual(loaded, self.load(picking))
        json.dumps(loaded, allow_nan=False)

    def test_preview_creates_native_return_in_rollback_not_delivery_or_finance(self):
        picking = self.delivered()
        before = self.load(picking)
        counts = {name: self.env[name].search_count([]) for name in (
            'stock.picking', 'stock.move', 'stock.move.line', 'stock.return.picking',
            'stock.return.picking.line', 'mail.message', 'stock.valuation.layer', 'account.move')}
        reviewed = self.preview(picking, loaded=before)
        created = reviewed['effects']['created']
        self.assertEqual(len(created['stock.picking']), 1)
        self.assertEqual(len(created['stock.move']), 1)
        self.assertEqual(created['stock.move'][0]['values']['origin_returned_move_id'], picking.move_ids.id)
        self.assertEqual(created['stock.move'][0]['values']['product_uom_qty'], 2)
        self.assertEqual(reviewed['form']['lines'][0]['quantity'], 2)
        self.assertNotIn(reviewed['return_state'], ('done', 'cancel'))
        self.assertTrue(reviewed['write_ready'])
        self.assertEqual(before, self.load(picking))
        self.assertEqual(counts, {name: self.env[name].search_count([]) for name in counts})
        self.assertEqual(self.source_stock(), 5)
        self.assertEqual(self.sale_line.qty_delivered, 5)
        json.dumps(reviewed, allow_nan=False)

    def test_preview_restores_every_native_callback_queue(self):
        picking = self.delivered()
        before = self.load(picking)
        self.env.flush_all()
        self.env.cr.flush()
        callbacks = {name: (getattr(self.env.cr, name), list(getattr(self.env.cr, name)._funcs),
            copy.deepcopy(getattr(self.env.cr, name).data))
            for name in ('precommit', 'postcommit', 'prerollback', 'postrollback')}
        self.preview(picking, loaded=before)
        for name, (original, functions, data) in callbacks.items():
            self.assertIs(getattr(self.env.cr, name), original)
            self.assertEqual(list(original._funcs), functions)
            self.assertEqual(original.data, data)

    def test_uncompleted_transfer_reports_native_reason_and_cannot_preview(self):
        picking = self.prepared()
        loaded = self.load(picking)
        self.assertTrue(loaded['reason'])
        self.assertFalse(loaded['form'])
        with self.assertRaises(UserError):
            picking.qorlia_return_preview(self.order.id, picking.id, loaded['version'],
                picking.location_id.id, [])

    def test_stale_inventory_and_native_defaults_invalidate_review(self):
        picking = self.delivered()
        before = self.load(picking)
        self.env['stock.quant']._update_available_quantity(self.product, self.warehouse.lot_stock_id, 1, lot_id=self.lot)
        with self.assertRaises(UserError):
            self.preview(picking, loaded=before)
        self.assertNotEqual(before['version'], self.load(picking)['version'])

    def test_foreign_duplicate_nonfinite_and_hidden_flag_edits_are_rejected(self):
        picking = self.delivered()
        loaded = self.load(picking)
        valid = {'move_id': picking.move_ids.id, 'quantity': 2}
        for lines in ([dict(valid, move_id=2147483647)], [valid, valid],
                [dict(valid, quantity=True)], [dict(valid, quantity=float('nan'))],
                [dict(valid, quantity=float('inf'))], [dict(valid, quantity=10 ** 400)],
                [dict(valid, to_refund=False)],
                [dict(valid, product_id=self.product.id)]):
            with self.assertRaises(ValidationError):
                picking.qorlia_return_preview(self.order.id, picking.id, loaded['version'],
                    loaded['form']['location'][0], lines)
        self.assertEqual(self.load(picking), loaded)

    def test_zero_quantities_preserve_native_error_and_rollback(self):
        picking = self.delivered()
        before = self.load(picking)
        with self.assertRaisesRegex(UserError, 'non-zero quantity'):
            self.preview(picking, 0, loaded=before)
        self.assertEqual(self.load(picking), before)

    def test_unknown_identity_wrong_order_and_public_user_are_denied(self):
        picking = self.delivered()
        for identity in (False, 0, -1, True, '1'):
            with self.assertRaises(ValidationError):
                picking.qorlia_return_load(self.order.id, identity)
        other = self.env['sale.order'].create({'partner_id': self.customer.id, 'shop_id': self.shop.id})
        with self.assertRaises(UserError):
            picking.qorlia_return_load(other.id, picking.id)
        with self.assertRaises(AccessError):
            picking.with_user(self.env.ref('base.public_user')).qorlia_return_load(self.order.id, picking.id)

    def test_locations_require_native_role_and_domain_with_bounded_paging(self):
        picking = self.delivered()
        model = picking.with_user(self.env.user)
        loaded = self.load(model)
        location = self.env['stock.location'].create({'name': 'QorliaQA Return alternative',
            'usage': 'internal', 'return_location': True, 'company_id': self.env.company.id})
        loaded = self.load(model)
        result = model.qorlia_return_locations(self.order.id, picking.id, loaded['version'],
            'QorliaQA Return alternative', limit=1)
        self.assertEqual(result['rows'], [[location.id, location.display_name]])
        self.assertFalse(result['next_after'])
        # This installation enables locations through Internal User; model a single-location setup transactionally.
        location_role = self.env.ref('stock.group_stock_multi_locations')
        self.env['res.groups'].search([('implied_ids', 'in', location_role.ids)]).write({
            'implied_ids': [(3, location_role.id)]})
        self.user.write({'groups_id': [(3, location_role.id)]})
        self.assertFalse(self.user.has_group('stock.group_stock_multi_locations'))
        self.assertTrue(self.user.has_group('stock.group_stock_user'))
        self.assertTrue(self.user.has_group('sales_team.group_sale_manager'))
        own = self.load(picking)
        self.assertFalse(own['form']['location_editable'])
        with self.assertRaises(AccessError):
            picking.qorlia_return_locations(self.order.id, picking.id, own['version'])
        with self.assertRaises(AccessError):
            picking.qorlia_return_preview(self.order.id, picking.id, own['version'], location.id,
                [{'move_id': picking.move_ids.id, 'quantity': 2}])
        self.assertEqual(self.preview(picking, loaded=own)['form']['location'], own['form']['location'])
        for limits in ({'limit': True}, {'limit': 101}, {'after': -1}, {'query': ['bad']}):
            with self.assertRaises(ValidationError):
                model.qorlia_return_locations(self.order.id, picking.id, loaded['version'], **limits)

    def test_native_alternative_location_is_preserved_in_projected_return(self):
        picking = self.delivered()
        location = self.env['stock.location'].create({'name': 'QorliaQA Reviewed return destination',
            'usage': 'internal', 'return_location': True, 'company_id': self.env.company.id})
        loaded = self.load(picking)
        reviewed = picking.qorlia_return_preview(self.order.id, picking.id, loaded['version'], location.id,
            [{'move_id': picking.move_ids.id, 'quantity': 2}])
        self.assertEqual(reviewed['form']['location'], [location.id, location.display_name])
        created = reviewed['effects']['created']
        self.assertEqual(created['stock.picking'][0]['values']['location_id'], picking.location_dest_id.id)
        self.assertEqual(created['stock.picking'][0]['values']['location_dest_id'], location.id)
        self.assertEqual(created['stock.move'][0]['values']['location_dest_id'], location.id)
        self.assertEqual(self.load(picking), loaded)

    def test_out_of_domain_and_foreign_company_locations_reject_without_writes(self):
        picking = self.delivered()
        invalid = self.env['stock.location'].create({'name': 'QorliaQA Not a return destination',
            'usage': 'internal', 'return_location': False, 'company_id': self.env.company.id})
        other_company = self.env['res.company'].create({'name': 'QorliaQA Return other company'})
        foreign = self.env['stock.location'].create({'name': 'QorliaQA Other company return destination',
            'usage': 'internal', 'return_location': True, 'company_id': other_company.id})
        loaded = self.load(picking)
        for location, error in ((invalid, ValidationError), (foreign, AccessError)):
            with self.assertRaises(error):
                picking.qorlia_return_preview(self.order.id, picking.id, loaded['version'], location.id,
                    [{'move_id': picking.move_ids.id, 'quantity': 2}])
        self.assertEqual(self.load(picking), loaded)

    def test_removed_rows_and_native_over_return_are_not_replaced_with_invented_rules(self):
        picking = self.delivered()
        loaded = self.load(picking)
        with self.assertRaisesRegex(UserError, 'non-zero quantity'):
            picking.qorlia_return_preview(self.order.id, picking.id, loaded['version'],
                loaded['form']['location'][0], [])
        reviewed = self.preview(picking, 6, loaded=loaded)
        self.assertEqual(reviewed['effects']['created']['stock.move'][0]['values']['product_uom_qty'], 6)
        self.assertEqual(self.load(picking), loaded)

    def test_hidden_completed_move_fails_closed_without_partial_form(self):
        picking = self.delivered()
        self.env['ir.rule'].create({'name': 'QorliaQA Hidden return source',
            'model_id': self.env['ir.model']._get_id('stock.move'),
            'domain_force': "[('id', '!=', %d)]" % picking.move_ids.id})
        with self.assertRaises(AccessError):
            self.load(picking)
