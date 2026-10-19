# SPDX-License-Identifier: LGPL-3.0-or-later
# Copyright 2026 Qorlia contributors.
import uuid
from unittest.mock import patch

from odoo.exceptions import AccessError, UserError, ValidationError
from odoo.tests import TransactionCase, tagged

from .test_stock_validation_contract import StockValidationFixture
from . import test_stock_cancellation_contract as contract


@tagged('post_install', '-at_install')
class StockCancellationAPITest(StockValidationFixture, TransactionCase):
    prepared = contract.StockCancellationContractTest.prepared
    delivered = contract.StockCancellationContractTest.delivered
    chain = contract.StockCancellationContractTest.chain

    def selection(self, picking):
        loaded = picking.qorlia_cancellation_paged_load(self.order.id, picking.id)
        return {key: loaded[key] for key in ('order_id', 'transfer_id', 'version')} | {'action': 'cancel_transfer'}

    def reviewed(self, picking, data=None, limit=50):
        data = data or self.selection(picking)
        tables = picking._qorlia_return_paged_tables()
        before = picking._qorlia_confirmation_stamp(tables)
        pages, after, version, token = [], 0, False, False
        while True:
            page = picking.qorlia_cancellation_paged_review(data, after, version, token, limit)
            pages.append(page)
            self.assertTrue(page['write_ready'])
            self.assertLessEqual(sum(len(rows) for kind in ('created', 'updated', 'deleted')
                for rows in page['effects'][kind].values()), limit)
            if page['next_after'] is False:
                self.assertEqual(len(page['review_complete_token']), 64)
                self.assertFalse(page['continuation_token'])
                break
            self.assertFalse(page['review_complete_token'])
            after, version, token = page['next_after'], page['review_version'], page['continuation_token']
        self.assertEqual(before, picking._qorlia_confirmation_stamp(tables))
        return dict(data, review_version=page['review_version'], review_complete_token=page['review_complete_token'],
            request_key=str(uuid.uuid4())), pages

    def test_complete_review_rolls_back_native_cancellation_and_all_guarded_state(self):
        picking = self.prepared()
        loaded = picking.qorlia_cancellation_paged_load(self.order.id, picking.id)
        self.assertTrue(loaded['write_ready'])
        self.assertFalse(loaded['reason'])
        self.assertNotIn('graph', loaded)
        _request, pages = self.reviewed(picking, limit=1)
        self.assertGreater(len(pages), 1)
        self.assertTrue(all(page['state_after'] == 'cancel' for page in pages))
        self.assertEqual(picking.state, 'assigned')
        self.assertEqual((self.source_stock(), self.sale_line.qty_delivered), (10, 0))

    def test_save_recovers_exactly_once_and_stop_cannot_undo_accepted_cancellation(self):
        picking = self.prepared()
        request, _pages = self.reviewed(picking)
        unknown = picking.qorlia_cancellation_paged_status(request)
        self.assertFalse(unknown['accepted'])
        self.assertFalse(unknown['stopped'])
        result = picking.qorlia_cancellation_paged_save(request)
        self.assertTrue(result['accepted'])
        self.assertFalse(result['stopped'])
        self.assertEqual(result['state_after'], 'cancel')
        self.assertEqual(picking.state, 'cancel')
        self.assertFalse(self.order.delivery_status)
        self.assertEqual((self.source_stock(), self.sale_line.qty_delivered), (10, 0))
        before = picking._qorlia_confirmation_stamp(picking._qorlia_return_paged_tables())
        with patch.object(type(picking), '_qorlia_cancellation_native', side_effect=AssertionError('Cancellation replayed')):
            self.assertEqual(picking.qorlia_cancellation_paged_status(request), result)
            self.assertEqual(picking.qorlia_cancellation_paged_save(request), result)
            self.assertEqual(picking.qorlia_cancellation_paged_stop(request), result)
        refs = picking.qorlia_cancellation_paged_references(request, limit=1)
        self.assertEqual(refs['total_count'], result['reference_count'])
        self.assertEqual(len(refs['rows']), result['reference_count'])
        self.assertEqual(before, picking._qorlia_confirmation_stamp(picking._qorlia_return_paged_tables()))

    def test_stop_only_records_exact_pending_request_without_cancelling_transfer(self):
        picking = self.prepared()
        request, _pages = self.reviewed(picking)
        tables = picking._qorlia_return_paged_tables()
        before = picking._qorlia_paged_stop_stamp(tables, 'qorlia_validation_receipts')
        stopped = picking.qorlia_cancellation_paged_stop(request)
        self.assertTrue(stopped['stopped'])
        self.assertFalse(stopped['accepted'])
        self.assertFalse(stopped['state_after'])
        self.assertEqual(picking.state, 'assigned')
        self.assertEqual(before, picking._qorlia_paged_stop_stamp(tables, 'qorlia_validation_receipts'))
        self.assertEqual(picking.qorlia_cancellation_paged_stop(request), stopped)
        with self.assertRaisesRegex(UserError, 'stopped'):
            picking.qorlia_cancellation_paged_save(request)
        with self.assertRaises(UserError):
            picking.qorlia_cancellation_paged_references(request)

    def test_incomplete_or_wrong_purpose_proof_cannot_cancel_transfer(self):
        picking = self.prepared()
        data = self.selection(picking)
        first = picking.qorlia_cancellation_paged_review(data, limit=1)
        self.assertFalse(first['review_complete_token'])
        request = dict(data, review_version=first['review_version'],
            review_complete_token=first['continuation_token'], request_key=str(uuid.uuid4()))
        for proof in (request['review_complete_token'], '0' * 64):
            with self.assertRaises(UserError):
                picking.qorlia_cancellation_paged_save(dict(request, review_complete_token=proof))
        self.assertEqual(picking.state, 'assigned')

    def test_malformed_action_identifiers_and_extra_context_reject_before_dispatch(self):
        picking = self.prepared()
        request, _pages = self.reviewed(picking)
        for changes in ({'action': 'cancel'}, {'action': 'unreserve'}, {'context': {}}, {'order_id': True},
                {'transfer_id': 0}, {'version': False}, {'review_version': 'bad'},
                {'review_complete_token': False}, {'request_key': False}, {'request_key': 'bad'}):
            for suffix in ('save', 'status', 'stop', 'references'):
                with self.assertRaises(ValidationError):
                    getattr(picking, 'qorlia_cancellation_paged_' + suffix)(dict(request, **changes))
        self.assertEqual(picking.state, 'assigned')

    def test_native_changes_and_skipped_review_pages_invalidate_old_proofs(self):
        picking = self.prepared()
        data = self.selection(picking)
        page = picking.qorlia_cancellation_paged_review(data, limit=1)
        with self.assertRaises(UserError):
            picking.qorlia_cancellation_paged_review(data, page['next_after'] + 1,
                page['review_version'], page['continuation_token'], 1)
        request, _pages = self.reviewed(picking, data)
        self.env['stock.quant']._update_available_quantity(self.product, self.warehouse.lot_stock_id, 1, lot_id=self.lot)
        with self.assertRaises(UserError):
            picking.qorlia_cancellation_paged_save(request)
        self.assertEqual(picking.state, 'assigned')
        self.assertEqual(self.source_stock(), 11)

    def test_request_identity_is_bound_to_author_and_exact_payload(self):
        picking = self.prepared()
        request, _pages = self.reviewed(picking)
        picking.qorlia_cancellation_paged_save(request)
        for change in ({'review_version': '0' * 64}, {'review_complete_token': '0' * 64}):
            with self.assertRaises(ValidationError):
                picking.qorlia_cancellation_paged_status(dict(request, **change))
        with self.assertRaises(ValidationError):
            picking.with_user(self.env.user).qorlia_cancellation_paged_status(request)
        with self.assertRaises(AccessError):
            picking.write({'qorlia_validation_receipts': {'forged': {}}})

    def test_completed_transfer_is_not_offered_and_rejected_review_preserves_it(self):
        picking = self.delivered()
        loaded = picking.qorlia_cancellation_paged_load(self.order.id, picking.id)
        self.assertFalse(loaded['write_ready'])
        self.assertTrue(loaded['reason'])
        before = picking._qorlia_confirmation_stamp(picking._qorlia_return_paged_tables())
        with self.assertRaises(UserError):
            picking.qorlia_cancellation_paged_review(self.selection(picking))
        self.assertEqual(before, picking._qorlia_confirmation_stamp(picking._qorlia_return_paged_tables()))
        self.assertEqual(picking.state, 'done')

    def test_denied_write_rule_cannot_review_or_stop_but_can_read_accepted_outcome(self):
        picking = self.prepared()
        request, _pages = self.reviewed(picking)
        result = picking.qorlia_cancellation_paged_save(request)
        self.env['ir.rule'].create({'name': 'QorliaQA Deny cancellation write',
            'model_id': self.env['ir.model']._get_id('stock.picking'),
            'domain_force': "[('id', '!=', %s)]" % picking.id,
            'perm_read': False, 'perm_write': True, 'perm_create': False, 'perm_unlink': False})
        self.assertEqual(picking.qorlia_cancellation_paged_status(request)['state_after'], result['state_after'])
        with self.assertRaises(AccessError):
            picking.qorlia_cancellation_paged_stop(request)

    def test_recorded_quantities_and_linked_analytic_deletion_remain_native(self):
        picking = self.prepared(2).with_user(self.env.user)
        plan = self.env['account.analytic.plan'].create({'name': 'QorliaQA Cancellation API analytics'})
        account = self.env['account.analytic.account'].create({'name': 'QorliaQA Cancellation API allocation',
            'plan_id': plan.id, 'company_id': self.env.company.id})
        analytic = self.env['account.analytic.line'].create({'name': 'QorliaQA Cancellation API analytic line',
            'account_id': account.id, 'amount': -8, 'company_id': self.env.company.id})
        picking.move_ids.analytic_account_line_id = analytic
        request, pages = self.reviewed(picking)
        self.assertEqual(sum(len(page['effects']['deleted'].get('account.analytic.line', [])) for page in pages), 1)
        self.assertNotIn('account.analytic.line', pages[0]['effects']['private_effect_counts'])
        picking.qorlia_cancellation_paged_save(request)
        self.assertFalse(analytic.exists())
        self.assertEqual(picking.move_line_ids.qty_done, 2)
        self.assertEqual(picking.move_line_ids.reserved_uom_qty, 0)
        self.assertEqual((self.source_stock(), self.sale_line.qty_delivered), (10, 0))

    def test_propagation_and_detachment_follow_native_linked_move_rules(self):
        first, _other, successor = self.chain(propagate=False)
        first.group_id = self.env['procurement.group'].create({'name': 'QorliaQA Cancellation API chain',
            'sale_id': self.order.id, 'partner_id': self.customer.id})
        first.move_ids.group_id = first.group_id
        request, _pages = self.reviewed(first)
        first.qorlia_cancellation_paged_save(request)
        self.assertEqual(first.state, 'cancel')
        self.assertNotIn(successor.state, ('done', 'cancel'))
        self.assertFalse(successor.move_ids.move_orig_ids)
        self.assertEqual(self.source_stock(), 10)

    def test_unexpected_financial_change_is_rejected_and_rolled_back(self):
        picking = self.prepared()
        data = self.selection(picking)
        original = type(picking).action_cancel
        def unexpected(records):
            result = original(records)
            records.env['sale.order.line'].browse(self.sale_line.id).write({'price_unit': 11})
            return result
        before = picking._qorlia_confirmation_stamp(picking._qorlia_return_paged_tables())
        with patch.object(type(picking), 'action_cancel', unexpected), self.assertRaisesRegex(UserError, 'financial'):
            picking.qorlia_cancellation_paged_review(data)
        self.assertEqual(before, picking._qorlia_confirmation_stamp(picking._qorlia_return_paged_tables()))
        self.assertEqual(picking.state, 'assigned')

    def test_changed_actual_effects_and_receipt_side_effects_roll_back_save(self):
        picking = self.prepared()
        request, _pages = self.reviewed(picking)
        original = type(picking)._qorlia_validation_record_receipt
        def unexpected(records, receipts):
            result = original(records, receipts)
            records.env['sale.order.line'].browse(self.sale_line.id).write({'name': 'QorliaQA Unreviewed metadata side effect'})
            return result
        before = picking._qorlia_confirmation_stamp(picking._qorlia_return_paged_tables())
        with patch.object(type(picking), '_qorlia_validation_record_receipt', unexpected), self.assertRaisesRegex(UserError, 'unreviewed'):
            picking.qorlia_cancellation_paged_save(request)
        self.assertEqual(before, picking._qorlia_confirmation_stamp(picking._qorlia_return_paged_tables()))
        self.assertFalse(picking.qorlia_cancellation_paged_status(request)['accepted'])
        self.assertEqual(picking.state, 'assigned')

    def test_reference_pages_are_pinned_and_foreign_cursors_reject(self):
        picking = self.prepared()
        request, _pages = self.reviewed(picking)
        with self.assertRaises(UserError):
            picking.qorlia_cancellation_paged_references(request)
        picking.qorlia_cancellation_paged_save(request)
        refs = picking.qorlia_cancellation_paged_references(request)
        self.assertEqual(refs['rows'], [])
        self.assertEqual(refs['total_count'], 0)
        with self.assertRaises(UserError):
            picking.qorlia_cancellation_paged_references(request, version='0' * 64)
        with self.assertRaises(ValidationError):
            picking.qorlia_cancellation_paged_references(request, after=1, version=refs['version'])

    def test_old_validation_receipt_cannot_be_consumed_as_cancellation(self):
        from .test_stock_validation_paged_review import StockValidationPagedReviewTest
        picking = self.prepared()
        loaded = picking.qorlia_validation_paged_load(self.order.id, picking.id)
        data = {key: loaded[key] for key in ('order_id', 'transfer_id', 'version')}
        data.update(continuation_key=False, decisions=[])
        last = StockValidationPagedReviewTest.pages(self, picking, data)[-1]
        old = dict(data, review_version=last['review_version'],
            review_complete_token=last['review_complete_token'], request_key=str(uuid.uuid4()))
        picking.qorlia_validation_paged_save(old)
        request, _pages = self.reviewed(picking)
        request['request_key'] = old['request_key']
        with self.assertRaises(ValidationError):
            picking.qorlia_cancellation_paged_status(request)

    def test_orphaned_empty_transfer_is_not_silently_linked_to_the_selected_order(self):
        picking = self.prepared()
        picking.move_ids._action_cancel()
        picking.move_ids.unlink()
        self.assertFalse(picking.move_ids)
        self.assertFalse(picking.sale_id)
        picking.env.cr.flush()
        before = picking._qorlia_confirmation_stamp(picking._qorlia_return_paged_tables())
        with self.assertRaisesRegex(UserError, 'no longer linked'):
            picking.qorlia_cancellation_paged_load(self.order.id, picking.id)
        self.assertEqual(before, picking._qorlia_confirmation_stamp(picking._qorlia_return_paged_tables()))
        self.assertEqual((self.source_stock(), self.sale_line.qty_delivered), (10, 0))

    def test_denied_fresh_cancellation_cannot_review_save_or_record_a_stop(self):
        picking = self.prepared()
        request, _pages = self.reviewed(picking)
        self.env['ir.rule'].create({'name': 'QorliaQA Deny fresh cancellation write',
            'model_id': self.env['ir.model']._get_id('stock.picking'),
            'domain_force': "[('id', '!=', %s)]" % picking.id,
            'perm_read': False, 'perm_write': True, 'perm_create': False, 'perm_unlink': False})
        before = picking._qorlia_confirmation_stamp(picking._qorlia_return_paged_tables())
        self.assertFalse(picking.qorlia_cancellation_paged_load(self.order.id, picking.id)['write_ready'])
        for suffix in ('review', 'save', 'stop'):
            payload = self.selection(picking) if suffix == 'review' else request
            with self.assertRaises(AccessError):
                getattr(picking, 'qorlia_cancellation_paged_' + suffix)(payload)
        self.assertEqual(before, picking._qorlia_confirmation_stamp(picking._qorlia_return_paged_tables()))

    def test_changed_actual_native_physical_effect_rolls_back_cancel_and_receipt(self):
        picking = self.prepared()
        request, _pages = self.reviewed(picking)
        original = type(picking).action_cancel
        calls = 0
        def unexpected(records):
            nonlocal calls
            calls += 1
            value = original(records)
            if calls == 2:
                records.env['stock.quant']._update_available_quantity(self.product,
                    self.warehouse.lot_stock_id, 1, lot_id=self.lot)
            return value
        before = picking._qorlia_confirmation_stamp(picking._qorlia_return_paged_tables())
        with patch.object(type(picking), 'action_cancel', unexpected), self.assertRaisesRegex(UserError, 'physical'):
            picking.qorlia_cancellation_paged_save(request)
        self.assertEqual(calls, 2)
        self.assertEqual(before, picking._qorlia_confirmation_stamp(picking._qorlia_return_paged_tables()))
        self.assertFalse(picking.qorlia_cancellation_paged_status(request)['accepted'])

    def test_501_positive_moves_and_2001_operations_cancel_without_legacy_caps(self):
        picking = self.picking(quantity=1)
        picking.group_id = self.env['procurement.group'].create({'name': 'QorliaQA Cancellation large group',
            'sale_id': self.order.id, 'partner_id': self.customer.id})
        picking.move_ids.group_id = picking.group_id
        self.env['stock.quant']._update_available_quantity(self.product, self.warehouse.lot_stock_id, 491, lot_id=self.lot)
        self.env['stock.move'].create([{'name': 'QorliaQA Cancellation move %s' % i,
            'picking_id': picking.id, 'group_id': picking.group_id.id, 'sale_line_id': self.sale_line.id,
            'product_id': self.product.id, 'product_uom': self.product.uom_id.id, 'product_uom_qty': 1,
            'location_id': picking.location_id.id, 'location_dest_id': picking.location_dest_id.id} for i in range(500)])
        picking.move_ids._action_confirm(merge=False)
        picking.action_assign()
        first = picking.move_ids.sorted('id')[0]
        self.env['stock.move.line'].create([{'picking_id': picking.id, 'move_id': first.id,
            'product_id': self.product.id, 'product_uom_id': self.product.uom_id.id, 'qty_done': 0,
            'lot_id': self.lot.id, 'location_id': picking.location_id.id,
            'location_dest_id': picking.location_dest_id.id} for _ in range(1500)])
        self.assertEqual((len(picking.move_ids), len(picking.move_line_ids)), (501, 2001))
        loaded = picking.qorlia_cancellation_paged_load(self.order.id, picking.id)
        self.assertEqual((loaded['transfer']['move_count'], loaded['transfer']['operation_count']), (501, 2001))
        request, pages = self.reviewed(picking, limit=100)
        self.assertGreater(len(pages), 20)
        self.assertEqual(sum(len(page['effects']['deleted'].get('stock.move.line', [])) for page in pages), 2001)
        result = picking.qorlia_cancellation_paged_save(request)
        self.assertTrue(result['accepted'])
        self.assertEqual(picking.state, 'cancel')
        self.assertFalse(picking.move_line_ids)
        self.assertEqual((self.source_stock(), self.sale_line.qty_delivered), (501, 0))
        self.assertEqual(picking.qorlia_cancellation_paged_save(request), result)
