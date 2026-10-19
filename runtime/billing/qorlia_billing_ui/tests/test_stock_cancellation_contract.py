# SPDX-License-Identifier: LGPL-3.0-or-later
# Copyright 2026 Qorlia contributors.
import json

from lxml import etree
from odoo.exceptions import UserError
from odoo.tests import TransactionCase, tagged

from .test_stock_validation_contract import StockValidationFixture
from . import test_stock_return_contract as return_contract


@tagged('post_install', '-at_install')
class StockCancellationContractTest(StockValidationFixture, TransactionCase):
    """Installed cancellation behaviour, not a Qorlia cancellation API."""

    prepared = return_contract.StockReturnContractTest.prepared
    delivered = return_contract.StockReturnContractTest.delivered
    return_form = return_contract.StockReturnContractTest.return_form
    return_wizard = return_contract.StockReturnContractTest.return_wizard
    create_return = return_contract.StockReturnContractTest.create_return

    def finance(self, picking):
        return picking._qorlia_confirmation_stamp(['account_move', 'account_move_line',
            'account_payment', 'account_partial_reconcile', 'stock_valuation_layer'])

    def chain(self, propagate=True, sibling=False):
        buffer = self.env['stock.location'].create({'name': 'QorliaQA Cancellation buffer',
            'usage': 'internal', 'location_id': self.warehouse.lot_stock_id.id})
        first = self.picking(self.internal_type, destination=buffer)
        successor = self.picking()
        successor.location_id = buffer
        successor.move_ids.location_id = buffer
        first.move_ids.write({'move_dest_ids': [(4, successor.move_ids.id)], 'propagate_cancel': propagate})
        other = self.env['stock.picking']
        if sibling:
            other = self.picking(self.internal_type, destination=buffer)
            other.move_ids.write({'move_dest_ids': [(4, successor.move_ids.id)], 'propagate_cancel': propagate})
        (first | other | successor).action_confirm()
        first.action_assign()
        if other:
            other.action_assign()
        return first, other, successor

    def test_native_form_exposes_cancel_only_in_its_configured_unfinished_states(self):
        view = self.env['stock.picking'].with_user(self.user).get_view(
            view_id=self.env.ref('stock.view_picking_form').id, view_type='form')
        nodes = etree.fromstring(view['arch'].encode()).xpath('.//button[@name="action_cancel"]')
        self.assertTrue(nodes)
        domains = [json.loads(node.attrib['modifiers'])['invisible'] for node in nodes]
        self.assertTrue(any(['state', 'not in', ['assigned', 'confirmed', 'draft', 'waiting']] in domain
            for domain in domains))

    def test_draft_cancellation_locks_transfer_without_receipt_or_financial_effect(self):
        picking = self.picking()
        finance = self.finance(picking)
        self.assertIs(picking.action_cancel(), True)
        self.assertEqual(picking.state, 'cancel')
        self.assertTrue(picking.is_locked)
        self.assertEqual(picking.move_ids.mapped('state'), ['cancel'])
        self.assertEqual((self.source_stock(), self.sale_line.qty_delivered), (10, 0))
        self.assertEqual(finance, self.finance(picking))

    def test_reserved_zero_done_lines_are_deleted_and_reservations_released(self):
        picking = self.picking()
        lines = self.reserve(picking)
        finance = self.finance(picking)
        self.assertEqual(lines.reserved_uom_qty, 5)
        self.assertIs(picking.action_cancel(), True)
        self.assertEqual(picking.state, 'cancel')
        self.assertFalse(lines.exists())
        self.assertFalse(picking.move_line_ids)
        self.assertEqual(picking.move_ids.reserved_availability, 0)
        quants = self.env['stock.quant'].search([('product_id', '=', self.product.id)])
        self.assertEqual(sum(quants.mapped('reserved_quantity')), 0)
        self.assertEqual((self.source_stock(), self.sale_line.qty_delivered), (10, 0))
        self.assertEqual(finance, self.finance(picking))

    def test_recorded_done_quantity_is_retained_but_does_not_become_physical_receipt(self):
        picking = self.picking()
        lines = self.reserve(picking, 2)
        finance = self.finance(picking)
        self.assertIs(picking.action_cancel(), True)
        self.assertEqual(picking.state, 'cancel')
        self.assertEqual(picking.move_line_ids, lines)
        self.assertEqual((lines.qty_done, lines.reserved_uom_qty), (2, 0))
        self.assertEqual((self.source_stock(), self.sale_line.qty_delivered), (10, 0))
        self.assertEqual(finance, self.finance(picking))

    def test_completed_delivery_rejects_cancellation_and_preserves_every_guarded_table(self):
        picking = self.delivered()
        tables = picking._qorlia_return_paged_tables()
        # Savepoint entry drains earlier delivery tracking before its own rollback boundary.
        self.env.cr.flush()
        before = picking._qorlia_confirmation_stamp(tables)
        with self.assertRaisesRegex(UserError, 'Done'), self.env.cr.savepoint():
            picking.action_cancel()
        self.env.invalidate_all()
        self.assertEqual(picking.state, 'done')
        self.assertEqual((self.source_stock(), self.sale_line.qty_delivered), (5, 5))
        after = picking._qorlia_confirmation_stamp(tables)
        self.assertEqual(before, after, 'Changed tables: %s' % [name for name in tables if before[name] != after[name]])

    def test_propagation_waits_for_all_sibling_origins_before_cancelling_successor(self):
        first, other, successor = self.chain(sibling=True)
        finance = self.finance(first)
        self.assertTrue(first.move_ids.propagate_cancel)
        first.action_cancel()
        self.assertEqual(first.state, 'cancel')
        self.assertNotIn(successor.state, ('done', 'cancel'))
        self.assertNotIn(other.state, ('done', 'cancel'))
        other.action_cancel()
        self.assertEqual(successor.state, 'cancel')
        self.assertFalse(successor.move_ids.move_orig_ids)
        self.assertEqual(self.source_stock(), 10)
        self.assertEqual(finance, self.finance(first))

    def test_nonpropagating_cancellation_detaches_origin_without_cancelling_successor(self):
        first, _other, successor = self.chain(propagate=False)
        self.assertIn(first.move_ids, successor.move_ids.move_orig_ids)
        first.action_cancel()
        self.assertEqual(first.state, 'cancel')
        self.assertNotIn(successor.state, ('done', 'cancel'))
        self.assertFalse(successor.move_ids.move_orig_ids)
        self.assertEqual(successor.move_ids.procure_method, 'make_to_stock')
        self.assertEqual(self.source_stock(), 10)

    def test_cancelling_backorder_preserves_completed_delivery_and_delivered_quantity(self):
        picking = self.delivered(2)
        backorder = self.env['stock.picking'].with_user(self.user).search([('backorder_id', '=', picking.id)])
        self.assertEqual(len(backorder), 1)
        finance = self.finance(picking)
        backorder.action_cancel()
        self.assertEqual(backorder.state, 'cancel')
        self.assertEqual(picking.state, 'done')
        self.assertEqual((self.source_stock(), self.sale_line.qty_delivered), (8, 2))
        self.assertEqual(finance, self.finance(picking))

    def test_cancelling_unreceived_return_restores_native_default_without_refund(self):
        original = self.delivered()
        returned = self.create_return(original, 2)
        self.assertEqual(self.return_wizard(original).product_return_moves.quantity, 3)
        finance = self.finance(original)
        returned.action_cancel()
        self.assertEqual(returned.state, 'cancel')
        self.assertEqual(original.state, 'done')
        self.assertEqual(self.return_wizard(original).product_return_moves.quantity, 5)
        self.assertEqual((self.source_stock(), self.sale_line.qty_delivered), (5, 5))
        self.assertEqual(finance, self.finance(original))

    def test_native_stock_account_override_removes_move_analytic_line_without_posting_ledger(self):
        picking = self.picking().with_user(self.env.user)
        self.reserve(picking)
        plan = self.env['account.analytic.plan'].create({'name': 'QorliaQA Cancellation analytics'})
        account = self.env['account.analytic.account'].create({'name': 'QorliaQA Cancellation allocation',
            'plan_id': plan.id, 'company_id': self.env.company.id})
        analytic = self.env['account.analytic.line'].create({'name': 'QorliaQA Cancellation native analytic line',
            'account_id': account.id, 'amount': -8, 'company_id': self.env.company.id})
        picking.move_ids.analytic_account_line_id = analytic
        finance = self.finance(picking)
        picking.action_cancel()
        self.assertFalse(analytic.exists())
        self.assertEqual(picking.state, 'cancel')
        self.assertEqual(finance, self.finance(picking))
