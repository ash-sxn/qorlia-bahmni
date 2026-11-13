# SPDX-License-Identifier: LGPL-3.0-or-later
# Copyright 2026 Qorlia contributors.
from unittest.mock import patch

from odoo.exceptions import AccessError, UserError
from odoo.tests import TransactionCase, tagged

from .test_stock_validation_contract import StockValidationFixture
from . import test_stock_cancellation as api_contract
from . import test_stock_cancellation_contract as native_contract


@tagged('post_install', '-at_install')
class StockCancellationMatrixTest(StockValidationFixture, TransactionCase):
    """Native permission and mixed-state contracts, with all fixtures rolled back."""

    prepared = native_contract.StockCancellationContractTest.prepared
    delivered = native_contract.StockCancellationContractTest.delivered
    finance = native_contract.StockCancellationContractTest.finance
    selection = api_contract.StockCancellationAPITest.selection
    reviewed = api_contract.StockCancellationAPITest.reviewed

    def stamp(self, picking):
        self.env.cr.flush()
        return picking._qorlia_confirmation_stamp(picking._qorlia_return_paged_tables())

    def deny(self, model, identifier, operation):
        return self.env['ir.rule'].create({'name': 'QorliaQA Cancellation matrix deny %s %s' % (model, operation),
            'model_id': self.env['ir.model']._get_id(model),
            'domain_force': "[('id', '!=', %s)]" % identifier,
            **{'perm_' + name: name == operation for name in ('read', 'write', 'create', 'unlink')}})

    def analytic(self, picking):
        plan = self.env['account.analytic.plan'].create({'name': 'QorliaQA Cancellation matrix plan'})
        account = self.env['account.analytic.account'].create({'name': 'QorliaQA Cancellation matrix account',
            'plan_id': plan.id, 'company_id': self.env.company.id})
        entry = self.env['account.analytic.line'].create({'name': 'QorliaQA PRIVATE cancellation analytic entry',
            'account_id': account.id, 'amount': -8, 'company_id': self.env.company.id})
        picking.with_user(self.env.user).move_ids.analytic_account_line_id = entry
        return entry

    def accountant(self, entries):
        actor = self.env['res.users'].with_context(no_reset_password=True).create({
            'name': 'QorliaQA Cancellation stock accountant', 'login': 'qorliaqa-cancellation-stock-accountant',
            'company_id': self.env.company.id, 'company_ids': [(6, 0, self.env.company.ids)],
            'groups_id': [(6, 0, [self.env.ref(name).id for name in ('stock.group_stock_user',
                'sales_team.group_sale_manager', 'account.group_account_manager')])]})
        for entry in entries:
            self.deny('account.analytic.line', entry.id, 'read')
        return actor

    def scrapped(self, picking):
        location = self.env['stock.location'].create({'name': 'QorliaQA Cancellation scrap',
            'usage': 'inventory', 'scrap_location': True, 'company_id': self.env.company.id})
        scrap = self.env['stock.scrap'].with_user(self.user).create({'product_id': self.product.id,
            'product_uom_id': self.product.uom_id.id, 'scrap_qty': 1, 'lot_id': self.lot.id,
            'location_id': self.warehouse.lot_stock_id.id, 'scrap_location_id': location.id,
            'picking_id': picking.id})
        self.assertIs(scrap.action_validate(), True)
        self.assertEqual(scrap.move_id.state, 'done')
        self.assertTrue(scrap.move_id.scrapped)
        return scrap

    def test_completed_nonscrapped_move_rejects_mixed_transfer_cancellation(self):
        picking = self.delivered()
        completed = picking.move_ids
        unfinished = completed.with_user(self.env.user).copy({'state': 'draft',
            'product_uom_qty': 1, 'move_line_ids': [], 'quantity_done': 0})
        unfinished.with_user(self.user)._action_confirm()
        unfinished.with_user(self.user)._action_assign()
        self.assertEqual(completed.state, 'done')
        self.assertFalse(completed.scrapped)
        self.assertEqual(picking.state, 'assigned')
        before = self.stamp(picking)
        with self.assertRaisesRegex(UserError, 'Done'), self.env.cr.savepoint():
            picking.action_cancel()
        self.assertEqual(self.stamp(picking), before)
        with self.assertRaisesRegex(UserError, 'Done'):
            picking.qorlia_cancellation_paged_review(self.selection(picking))
        self.assertEqual(self.stamp(picking), before)
        self.assertEqual((self.source_stock(), self.sale_line.qty_delivered), (5, 5))
        self.assertEqual(completed.state, 'done')
        self.assertEqual(unfinished.state, 'assigned')

    def test_completed_scrap_survives_cancellation_of_ordinary_unfinished_moves(self):
        picking = self.prepared()
        ordinary = picking.move_ids
        scrap = self.scrapped(picking)
        self.assertEqual(picking.state, 'assigned')
        finance = self.finance(picking)
        request, pages = self.reviewed(picking)
        self.assertTrue(all(page['state_after'] == 'cancel' for page in pages))
        result = picking.qorlia_cancellation_paged_save(request)
        self.assertEqual(result['state_after'], 'cancel')
        self.assertEqual(ordinary.state, 'cancel')
        self.assertEqual(scrap.move_id.state, 'done')
        self.assertEqual((self.source_stock(), self.sale_line.qty_delivered), (9, 0))
        self.assertEqual(self.finance(picking), finance)

    def test_scrap_only_mixed_transfer_preserves_native_done_aggregate(self):
        picking = self.prepared()
        unfinished = picking.move_ids
        scrap = self.scrapped(picking)
        # scrapped is a stored native relation to the destination, never a forged terminal state.
        unfinished.with_user(self.env.user).location_dest_id = scrap.scrap_location_id
        self.assertTrue(unfinished.scrapped)
        self.assertEqual(picking.state, 'assigned')
        finance = self.finance(picking)
        request, pages = self.reviewed(picking)
        self.assertTrue(all(page['state_after'] == 'done' for page in pages))
        result = picking.qorlia_cancellation_paged_save(request)
        self.assertEqual(result['state_after'], 'done')
        self.assertEqual(unfinished.state, 'cancel')
        self.assertEqual(scrap.move_id.state, 'done')
        self.assertEqual((self.source_stock(), self.sale_line.qty_delivered), (9, 0))
        self.assertEqual(self.finance(picking), finance)

    def test_denied_move_write_disables_load_and_preserves_all_state(self):
        picking = self.prepared()
        request, _pages = self.reviewed(picking)
        self.deny('stock.move', picking.move_ids.id, 'write')
        before = self.stamp(picking)
        loaded = picking.qorlia_cancellation_paged_load(self.order.id, picking.id)
        self.assertFalse(loaded['write_ready'])
        self.assertTrue(loaded['reason'])
        for suffix in ('review', 'save', 'stop'):
            payload = self.selection(picking) if suffix == 'review' else request
            with self.assertRaises(AccessError):
                getattr(picking, 'qorlia_cancellation_paged_' + suffix)(payload)
        self.assertEqual(self.stamp(picking), before)
        self.assertEqual(picking.state, 'assigned')
        self.assertEqual(picking.move_line_ids.reserved_uom_qty, 5)

    def test_denied_operation_unlink_rejects_cancellation_but_not_exact_request_stop(self):
        picking = self.prepared()
        request, _pages = self.reviewed(picking)
        line = picking.move_line_ids
        self.deny('stock.move.line', line.id, 'unlink')
        before = self.stamp(picking)
        with self.assertRaises(AccessError), self.env.cr.savepoint():
            picking.action_cancel()
        self.assertEqual(self.stamp(picking), before)
        with self.assertRaises(AccessError):
            picking.qorlia_cancellation_paged_review(self.selection(picking))
        self.assertEqual(self.stamp(picking), before)
        stopped = picking.qorlia_cancellation_paged_stop(request)
        self.assertTrue(stopped['stopped'])
        self.assertFalse(stopped['accepted'])
        self.assertEqual(picking.state, 'assigned')
        self.assertEqual(line.reserved_uom_qty, 5)
        self.assertEqual(self.source_stock(), 10)

    def test_denied_analytic_unlink_rejects_review_without_losing_linked_entry(self):
        picking = self.prepared()
        entry = self.analytic(picking)
        self.deny('account.analytic.line', entry.id, 'unlink')
        before = self.stamp(picking)
        with self.assertRaises(AccessError), self.env.cr.savepoint():
            picking.action_cancel()
        self.assertEqual(self.stamp(picking), before)
        with self.assertRaises(AccessError):
            picking.qorlia_cancellation_paged_review(self.selection(picking))
        self.assertEqual(self.stamp(picking), before)
        self.assertTrue(entry.exists())
        self.assertEqual(picking.state, 'assigned')

    def test_allowed_private_analytic_deletion_matches_native_without_exposing_entry(self):
        picking = self.prepared()
        entry = self.analytic(picking)
        actor = self.accountant(entry)
        picking = picking.with_user(actor)
        self.assertTrue(entry.with_user(actor).check_access_rights('unlink', raise_exception=False))
        with self.assertRaises(AccessError):
            entry.with_user(actor).check_access_rule('read')
        before = self.stamp(picking)
        self.assertIs(picking._qorlia_stock_preparation_preview(picking.action_cancel,
            picking._qorlia_return_paged_tables()), True)
        self.assertEqual(self.stamp(picking), before)
        self.assertTrue(entry.exists())
        request, pages = self.reviewed(picking)
        self.assertEqual(pages[0]['effects']['private_effect_counts']['account.analytic.line'],
            {'created': 0, 'updated': 0, 'deleted': 1})
        self.assertTrue(all('account.analytic.line' not in page['effects']['schema'] for page in pages))
        self.assertNotIn(entry.name, str(pages))
        picking.qorlia_cancellation_paged_save(request)
        self.assertFalse(entry.exists())
        self.assertEqual(picking.qorlia_cancellation_paged_status(request)['state_after'], 'cancel')
        self.assertEqual(picking.qorlia_cancellation_paged_references(request)['rows'], [])
        self.assertEqual((self.source_stock(), self.sale_line.qty_delivered), (10, 0))

    def test_private_analytic_relationship_swap_rejects_equal_public_effects_and_rolls_back(self):
        picking = self.prepared()
        first = picking.move_ids
        first_entry = self.analytic(picking)
        second = first.with_user(self.env.user).copy({'state': 'draft', 'product_uom_qty': 1,
            'move_line_ids': [], 'quantity_done': 0, 'analytic_account_line_id': False})
        second.with_user(self.user)._action_confirm(merge=False)
        second.with_user(self.user)._action_assign()
        second_entry = self.analytic(picking)
        first.with_user(self.env.user).analytic_account_line_id = first_entry
        picking = picking.with_user(self.accountant(first_entry | second_entry))
        request, _pages = self.reviewed(picking)
        before = self.stamp(picking)
        original = type(picking)._qorlia_cancellation_native
        outcomes = []

        def swapped(records):
            if outcomes:
                first.with_user(self.env.user).analytic_account_line_id = second_entry
                second.with_user(self.env.user).analytic_account_line_id = first_entry
            result = original(records)
            outcomes.append(result)
            return result

        with patch.object(type(picking), '_qorlia_cancellation_native', swapped):
            with self.assertRaisesRegex(UserError, 'unreviewed effects'):
                picking.qorlia_cancellation_paged_save(request)
        self.assertEqual(len(outcomes), 2)
        self.assertEqual(outcomes[0][0], outcomes[1][0])
        witness = '__private_analytic_references'
        self.assertNotEqual(outcomes[0][1][witness], outcomes[1][1][witness])
        self.assertEqual({key: value for key, value in outcomes[0][1].items() if key != witness},
            {key: value for key, value in outcomes[1][1].items() if key != witness})
        self.assertEqual(self.stamp(picking), before)
        self.assertEqual(first.with_user(self.env.user).analytic_account_line_id, first_entry)
        self.assertEqual(second.with_user(self.env.user).analytic_account_line_id, second_entry)
        self.assertTrue((first_entry | second_entry).exists())
        self.assertFalse(picking.qorlia_cancellation_paged_status(request)['accepted'])

    def test_noninternal_account_cannot_load_or_cancel_native_transfer(self):
        picking = self.prepared()
        actor = self.env['res.users'].with_context(no_reset_password=True).create({
            'name': 'QorliaQA Cancellation portal user', 'login': 'qorliaqa-cancellation-portal',
            'company_id': self.env.company.id, 'company_ids': [(6, 0, self.env.company.ids)],
            'groups_id': [(6, 0, [self.env.ref('base.group_portal').id])]})
        self.assertFalse(actor.has_group('base.group_user'))
        before = self.stamp(picking)
        with self.assertRaises(AccessError), self.env.cr.savepoint():
            picking.with_user(actor).action_cancel()
        with self.assertRaises(AccessError):
            picking.with_user(actor).qorlia_cancellation_paged_load(self.order.id, picking.id)
        self.assertEqual(self.stamp(picking), before)
        self.assertEqual(picking.state, 'assigned')

    def test_loss_of_transfer_read_permission_blocks_receipt_and_reference_disclosure(self):
        picking = self.prepared()
        request, _pages = self.reviewed(picking)
        picking.qorlia_cancellation_paged_save(request)
        self.deny('stock.picking', picking.id, 'read')
        before = self.stamp(picking)
        for suffix in ('status', 'references'):
            with self.assertRaises(AccessError):
                getattr(picking, 'qorlia_cancellation_paged_' + suffix)(request)
        with self.assertRaises(AccessError):
            picking.qorlia_cancellation_paged_load(self.order.id, picking.id)
        self.assertEqual(self.stamp(picking), before)
        self.assertEqual(picking.with_user(self.env.user).state, 'cancel')
