# SPDX-License-Identifier: LGPL-3.0-or-later
# Copyright 2026 Qorlia contributors.
from odoo.exceptions import UserError
from odoo.tests import Form, TransactionCase, tagged

from . import test_stock_validation_contract as native_contract
from . import test_stock_validation_preview as preview_contract


@tagged('post_install', '-at_install')
class StockReturnContractTest(native_contract.StockValidationFixture, TransactionCase):
    """Installed return form and native actions, not acceptance of a Qorlia return API."""

    prepared = preview_contract.StockValidationPreviewTest.prepared
    automatic_valuation = native_contract.StockValidationContractTest.automatic_valuation

    def delivered(self, quantity=5):
        picking = self.prepared(quantity)
        action = picking.button_validate()
        if isinstance(action, dict):
            wizard = self.wizard(action, 'stock.backorder.confirmation')
            action = wizard.process()
        self.assertIs(action, True)
        self.assert_delivered(picking, quantity)
        return picking

    def return_form(self, picking):
        return Form(self.env['stock.return.picking'].with_user(self.user).with_context(
            active_model='stock.picking', active_id=picking.id, active_ids=picking.ids))

    def return_wizard(self, picking, quantity=None):
        form = self.return_form(picking)
        if quantity is not None:
            with form.product_return_moves.edit(0) as line:
                line.quantity = quantity
        return form.save()

    def create_return(self, picking, quantity=2):
        wizard = self.return_wizard(picking, quantity)
        action = wizard.create_returns()
        self.assertEqual(action['res_model'], 'stock.picking')
        self.assertEqual(action['type'], 'ir.actions.act_window')
        return self.env['stock.picking'].with_user(self.user).browse(action['res_id'])

    def complete_return(self, returned, quantity=2):
        self.assertEqual(len(returned.move_line_ids), 1)
        returned.move_line_ids.write({'qty_done': quantity, 'lot_id': self.lot.id})
        action = returned.button_validate()
        if isinstance(action, dict):
            action = self.wizard(action, 'stock.picking.validate.wizard').btn_confirm()
        self.assertIs(action, True)
        self.assertEqual(returned.state, 'done')

    def test_only_done_pickings_open_native_return_form(self):
        picking = self.prepared()
        with self.assertRaisesRegex(UserError, 'Done pickings'):
            self.return_form(picking)

    def test_native_defaults_keep_move_product_base_unit_and_return_location(self):
        picking = self.delivered()
        wizard = self.return_wizard(picking)
        self.assertEqual(wizard.picking_id, picking)
        self.assertEqual(wizard.location_id, picking.location_id)
        line = wizard.product_return_moves
        self.assertEqual(len(line), 1)
        self.assertEqual(line.move_id, picking.move_ids)
        self.assertEqual(line.product_id, self.product)
        self.assertEqual(line.uom_id, self.product.uom_id)
        self.assertEqual(line.quantity, 5)
        self.assertTrue(line.to_refund)

    def test_creation_is_a_separate_linked_transfer_not_stock_receipt_or_refund(self):
        picking = self.delivered()
        counts = {name: self.env[name].search_count([]) for name in (
            'account.move', 'account.payment', 'stock.valuation.layer')}
        returned = self.create_return(picking)
        self.assertNotIn(returned.state, ('done', 'cancel'))
        self.assertEqual(returned.company_id, picking.company_id)
        self.assertEqual(returned.location_id, picking.location_dest_id)
        self.assertEqual(returned.location_dest_id, picking.location_id)
        self.assertEqual(returned.move_ids.origin_returned_move_id, picking.move_ids)
        self.assertEqual(returned.move_ids.sale_line_id, self.sale_line)
        self.assertEqual(returned.sale_id, self.order)
        self.assertEqual(returned.move_ids.product_uom_qty, 2)
        self.assertEqual(self.sale_line.qty_delivered, 5)
        self.assertEqual(self.source_stock(), 5)
        self.assertEqual(counts, {name: self.env[name].search_count([]) for name in counts})

    def test_zero_return_rolls_back_created_transfer_and_audit(self):
        picking = self.delivered()
        wizard = self.return_wizard(picking, 0)
        count = self.env['stock.picking'].search_count([])
        with self.assertRaisesRegex(UserError, 'non-zero quantity'), self.env.cr.savepoint():
            wizard.create_returns()
        self.assertEqual(self.env['stock.picking'].search_count([]), count)
        self.assertEqual(self.source_stock(), 5)
        self.assertEqual(self.sale_line.qty_delivered, 5)

    def test_reserved_return_reduces_default_and_cancellation_restores_it(self):
        picking = self.delivered()
        returned = self.create_return(picking)
        self.assertEqual(returned.state, 'assigned')
        self.assertEqual(self.return_wizard(picking).product_return_moves.quantity, 3)
        returned.action_cancel()
        self.assertEqual(self.return_wizard(picking).product_return_moves.quantity, 5)
        self.assertEqual(self.source_stock(), 5)

    def test_second_native_return_unreserves_prior_return_and_recomputes_remaining_quantity(self):
        picking = self.delivered()
        first = self.create_return(picking, 2)
        self.assertEqual(first.move_ids.reserved_availability, 2)
        second = self.create_return(picking, 3)
        self.assertEqual(first.move_ids.reserved_availability, 0)
        self.assertNotIn(first.state, ('done', 'cancel'))
        self.assertEqual(second.move_ids.reserved_availability, 3)
        self.assertEqual(self.return_wizard(picking).product_return_moves.quantity, 2)
        self.assertEqual(self.source_stock(), 5)
        self.assertEqual(self.sale_line.qty_delivered, 5)

    def test_completed_return_updates_stock_and_native_delivered_quantity(self):
        picking = self.delivered()
        returned = self.create_return(picking)
        self.complete_return(returned)
        self.assertEqual(self.source_stock(), 7)
        self.assertEqual(self.sale_line.qty_delivered, 3)
        self.assertEqual(self.return_wizard(picking).product_return_moves.quantity, 3)
        valuation = self.env['stock.valuation.layer'].search([('stock_move_id', 'in', returned.move_ids.ids)])
        self.assertEqual((valuation.quantity, valuation.value), (2, 8))
        self.assertFalse(valuation.account_move_id)

    def test_native_quantity_update_flag_is_distinct_from_financial_refund(self):
        picking = self.delivered()
        wizard = self.return_wizard(picking, 2)
        wizard.product_return_moves.to_refund = False
        returned = self.env['stock.picking'].with_user(self.user).browse(wizard.create_returns()['res_id'])
        self.complete_return(returned)
        self.assertFalse(returned.move_ids.to_refund)
        self.assertEqual(self.source_stock(), 7)
        self.assertEqual(self.sale_line.qty_delivered, 5)
        self.assertFalse(self.order.invoice_ids)

    def test_partial_delivery_returns_only_completed_move_not_backorder_demand(self):
        picking = self.delivered(2)
        wizard = self.return_wizard(picking)
        self.assertEqual(wizard.product_return_moves.quantity, 2)
        backorder = self.env['stock.picking'].search([('backorder_id', '=', picking.id)])
        self.assertEqual(backorder.move_ids.product_uom_qty, 3)
        self.assertEqual(wizard.product_return_moves.move_id, picking.move_ids)

    def test_native_form_converts_non_base_delivery_units(self):
        picking = self.picking(quantity=0.5)
        picking.move_ids.product_uom = self.env.ref('uom.product_uom_dozen')
        picking.action_confirm()
        picking.action_assign()
        picking.move_line_ids.qty_done = 0.5
        self.assertIs(picking.button_validate(), True)
        line = self.return_wizard(picking).product_return_moves
        self.assertEqual(line.quantity, 6)
        self.assertEqual(line.uom_id, self.product.uom_id)

    def test_return_creation_does_not_invent_a_cap_at_the_default_quantity(self):
        picking = self.delivered()
        returned = self.create_return(picking, 6)
        self.assertEqual(returned.move_ids.product_uom_qty, 6)
        self.assertNotEqual(returned.state, 'done')
        self.assertEqual(self.source_stock(), 5)
        self.assertEqual(self.sale_line.qty_delivered, 5)

    def test_automatic_return_valuation_waits_for_native_validation(self):
        _accounts, _journal = self.automatic_valuation()
        picking = self.delivered()
        count = self.env['account.move'].search_count([])
        returned = self.create_return(picking)
        self.assertEqual(self.env['account.move'].search_count([]), count)
        self.complete_return(returned)
        valuation = self.env['stock.valuation.layer'].search([('stock_move_id', 'in', returned.move_ids.ids)])
        self.assertEqual((valuation.quantity, valuation.value), (2, 8))
        self.assertEqual(valuation.account_move_id.state, 'posted')
        self.assertEqual(sum(valuation.account_move_id.line_ids.mapped('balance')), 0)
        self.assertEqual(self.env['account.move'].search_count([]), count + 1)

    def test_return_creation_unreserves_unfinished_chained_destination(self):
        output = self.env['stock.location'].create({'name': 'QorliaQA Return chain output',
            'usage': 'internal', 'location_id': self.warehouse.lot_stock_id.id})
        picking = self.picking(self.internal_type, destination=output)
        self.reserve(picking, 5)
        review = self.wizard(picking.button_validate(), 'stock.picking.validate.wizard')
        self.assertIs(review.btn_confirm(), True)
        successor = self.picking()
        successor.location_id = output
        successor.move_ids.location_id = output
        successor.move_ids.move_orig_ids = [(4, picking.move_ids.id)]
        successor.action_confirm()
        successor.action_assign()
        self.assertEqual(successor.move_ids.reserved_availability, 5)
        self.assertTrue(self.return_form(picking).move_dest_exists)
        self.create_return(picking)
        self.assertEqual(successor.move_ids.reserved_availability, 0)
        self.assertNotIn(successor.state, ('done', 'cancel'))
        self.assertEqual(self.source_stock(), 5)
