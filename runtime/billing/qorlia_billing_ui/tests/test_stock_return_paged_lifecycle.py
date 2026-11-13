# SPDX-License-Identifier: LGPL-3.0-or-later
# Copyright 2026 Qorlia contributors.
import copy
import uuid

from odoo.exceptions import UserError
from odoo.tests import TransactionCase, tagged

from ..models.stock_confirmation_paged import _effect_rows
from .test_stock_validation_contract import StockValidationFixture
from . import test_stock_return_contract as native_contract
from . import test_stock_return_paged as return_contract
from . import test_stock_return_save as legacy_contract
from . import test_stock_validation_preview as validation_contract


@tagged('post_install', '-at_install')
class StockReturnPagedLifecycleTest(StockValidationFixture, TransactionCase):
    """The same complete protocols used by Qorlia, through separate physical receipt."""

    prepared = validation_contract.StockValidationPreviewTest.prepared
    delivered = native_contract.StockReturnContractTest.delivered
    automatic_valuation = native_contract.StockReturnContractTest.automatic_valuation
    large_delivered = return_contract.StockReturnPagedTest.large_delivered
    receipts = legacy_contract.StockReturnSaveTest.receipts

    def reviewed(self, picking, kind, data):
        tables = picking._qorlia_return_paged_tables()
        before = picking._qorlia_confirmation_stamp(tables)
        pages, after, version, token = [], 0, False, False
        method = getattr(picking, 'qorlia_%s_paged_review' % kind)
        while True:
            page = method(data, after, version, token, 50)
            pages.append(page)
            self.assertTrue(page['write_ready'])
            visible = len(page.get('line_rows', [])) + len(page.get('prompt_rows', [])) + len(_effect_rows(page['effects']))
            self.assertEqual(visible, min(50, page['total_count'] - after))
            if page['next_after'] is False:
                self.assertEqual(len(page['review_complete_token']), 64)
                self.assertFalse(page['continuation_token'])
                break
            self.assertFalse(page['review_complete_token'])
            self.assertGreater(page['next_after'], after)
            after, version, token = page['next_after'], page['review_version'], page['continuation_token']
        self.assertEqual(before, picking._qorlia_confirmation_stamp(tables), 'Complete review must roll back, including the final page.')
        request = {**copy.deepcopy(data), 'review_version': page['review_version'],
            'review_complete_token': page['review_complete_token'], 'request_key': str(uuid.uuid4())}
        return request, pages

    def create_return(self, picking, quantity=2, every_move=False):
        loaded = picking.qorlia_return_paged_load(self.order.id, picking.id)
        rows, after = [], 0
        while True:
            page = picking.qorlia_return_paged_lines(self.order.id, picking.id, loaded['version'], after, 50)
            rows.extend(page['rows'])
            if page['next_after'] is False:
                break
            after = page['next_after']
        self.assertEqual(len(rows), loaded['line_count'])
        self.assertEqual([row['move_id'] for row in rows], sorted(picking.move_ids.ids))
        data = {'order_id': self.order.id, 'transfer_id': picking.id, 'version': loaded['version'],
            'location_id': loaded['form']['location'][0],
            'lines': [{'move_id': row['move_id'], 'quantity': quantity} for row in rows] if every_move else
                [{'move_id': rows[0]['move_id'], 'quantity': quantity}]}
        request, pages = self.reviewed(picking, 'return', data)
        self.assertEqual(len([row for page in pages for row in page['line_rows']]), len(data['lines']))
        result = picking.qorlia_return_paged_save(request)
        self.assertTrue(result['accepted'])
        returned = picking.browse(result['return_transfer']['id'])
        self.assertNotIn(returned.state, ('done', 'cancel'))
        self.assertEqual(returned.sale_id, self.order)
        self.saved_references(picking, 'return', request, result['reference_count'])
        return returned, request, result

    def saved_references(self, picking, kind, request, total):
        method = getattr(picking, 'qorlia_%s_paged_%s' % (kind, 'reference_page' if kind == 'validation' else 'references'))
        rows, after, version = [], 0, False
        while True:
            page = method(request, after, version, 50)
            self.assertEqual(page['total_count'], total)
            self.assertEqual(page['after'], after)
            if version is not False:
                self.assertEqual(page['version'], version)
            version = page['version']
            rows.extend(page['rows'])
            if page['next_after'] is False:
                break
            self.assertEqual(page['next_after'], len(rows))
            after = page['next_after']
        self.assertEqual(len(rows), total)
        self.assertEqual([row['key'] for row in rows], sorted(set(row['key'] for row in rows)))
        return rows

    def saved_prompt(self, returned, request, receipt):
        rows, after = [], 0
        while True:
            page = returned.qorlia_validation_paged_prompt_page(request, after, receipt['prompt_version'], 50)
            self.assertEqual(page['receipt_key'], receipt['request_key'])
            self.assertEqual(page['version'], receipt['prompt_version'])
            self.assertEqual(page['descriptor'], receipt['next_step'])
            self.assertEqual(page['total_count'], receipt['prompt_count'])
            rows.extend(page['rows'])
            if page['next_after'] is False:
                break
            self.assertEqual(page['next_after'], len(rows))
            after = page['next_after']
        self.assertEqual(len(rows), receipt['prompt_count'])
        if receipt['next_step']['kind'] == 'receipt':
            operations = [row['value']['id'] for row in rows if row['section'] == 'operations']
            self.assertEqual(set(operations), set(returned.move_line_ids.ids))
        return rows

    def operation(self, returned, quantity):
        line = returned.move_line_ids
        self.assertEqual(len(line), 1)
        self.assertEqual(line.lot_id, self.lot)
        loaded = returned.qorlia_operation_paged_load(self.order.id, returned.id, line.move_id.id, line.id)
        data = {key: loaded[key] for key in ('order_id', 'transfer_id', 'move_id', 'operation_id', 'version')}
        data.update(action='save', edits=[{'field': 'qty_done', 'value': quantity}])
        changed = returned.qorlia_operation_paged_onchange(self.order.id, returned.id, line.move_id.id,
            loaded['version'], data['edits'], line.id)
        self.assertTrue(changed['write_ready'])
        self.assertEqual(changed['version'], loaded['version'])
        self.assertEqual(changed['values']['qty_done'], quantity)
        request, _pages = self.reviewed(returned, 'operation', data)
        result = returned.qorlia_operation_paged_save(request)
        self.assertTrue(result['accepted'])
        self.assertEqual(line.qty_done, quantity)
        self.assertEqual(returned.qorlia_operation_paged_status(request), result)
        self.assertEqual(returned.qorlia_operation_paged_save(request), result)
        return request

    def preparation(self, returned, action='set_quantities'):
        loaded = returned.qorlia_reservation_paged_load(self.order.id, returned.id)
        self.assertFalse(loaded['reasons'][action])
        data = {key: loaded[key] for key in ('order_id', 'transfer_id', 'version')}
        request, _pages = self.reviewed(returned, 'reservation', dict(data, action=action))
        result = returned.qorlia_reservation_paged_save(request)
        self.assertTrue(result['accepted'])
        return request

    def validation(self, returned, previous=None, decision=None):
        loaded = returned.qorlia_validation_paged_load(self.order.id, returned.id)
        self.assertTrue(loaded['write_ready'])
        data = {key: loaded[key] for key in ('order_id', 'transfer_id', 'version')}
        data.update(continuation_key=previous['request_key'] if previous else False, decisions=[decision] if decision else [])
        return self.reviewed(returned, 'validation', data)[0]

    def finish_receipt(self, returned, opening=None):
        opening = opening or self.validation(returned)
        result = returned.qorlia_validation_paged_save(opening)
        self.assertTrue(result['accepted'])
        self.assertFalse(result['receipt']['terminal'])
        self.assertEqual(result['receipt']['next_step']['kind'], 'receipt')
        self.saved_prompt(returned, opening, result['receipt'])
        self.saved_references(returned, 'validation', opening, result['receipt']['reference_count'])
        request = self.validation(returned, opening, {'kind': 'receipt', 'confirm': True})
        accepted = returned.qorlia_validation_paged_save(request)
        self.assertTrue(accepted['accepted'])
        self.assertTrue(accepted['receipt']['terminal'])
        self.assertEqual(accepted['receipt']['state_after'], 'done')
        self.assertEqual(returned.state, 'done')
        self.saved_references(returned, 'validation', request, accepted['receipt']['reference_count'])
        return request, accepted

    def test_new_return_operation_and_receipt_protocols_complete_one_native_lifecycle(self):
        original = self.delivered()
        finance = original._qorlia_confirmation_stamp(['account_move', 'account_move_line', 'account_payment', 'account_partial_reconcile'])
        returned, creation, created = self.create_return(original)
        self.assertEqual((self.source_stock(), self.sale_line.qty_delivered), (5, 5))
        operation = self.operation(returned, 2)
        self.assertEqual((self.source_stock(), self.sale_line.qty_delivered), (5, 5))
        received, accepted = self.finish_receipt(returned)
        self.assertEqual((self.source_stock(), self.sale_line.qty_delivered), (7, 3))
        layer = self.env['stock.valuation.layer'].search([('stock_move_id', 'in', returned.move_ids.ids)])
        self.assertEqual((len(layer), layer.quantity, layer.value), (1, 2, 8))
        self.assertFalse(layer.account_move_id)
        self.assertEqual(finance, original._qorlia_confirmation_stamp(['account_move', 'account_move_line', 'account_payment', 'account_partial_reconcile']))
        before = original._qorlia_confirmation_stamp(original._qorlia_return_paged_tables())
        self.assertEqual(returned.qorlia_validation_paged_save(received), accepted)
        self.assertEqual(returned.qorlia_validation_paged_stop(received), accepted)
        self.assertTrue(returned.qorlia_operation_paged_status(operation)['accepted'])
        recovered = original.qorlia_return_paged_status(creation)
        self.assertEqual(recovered['state_after'], created['state_after'])
        self.assertEqual(recovered['return_transfer']['id'], returned.id)
        self.assertTrue(original.qorlia_return_paged_save(creation)['accepted'])
        self.assertEqual(before, original._qorlia_confirmation_stamp(original._qorlia_return_paged_tables()))
        self.assertEqual(len(self.receipts(original)), 1)
        self.assertEqual(len(self.receipts(returned)), 2)

    def test_partial_return_receipt_preserves_native_backorder_and_quantity_balance(self):
        original = self.delivered()
        returned, creation, _created = self.create_return(original)
        self.operation(returned, 1)
        opening = self.validation(returned)
        opened = returned.qorlia_validation_paged_save(opening)
        self.assertEqual(opened['receipt']['next_step']['kind'], 'receipt')
        self.saved_prompt(returned, opening, opened['receipt'])
        confirm = self.validation(returned, opening, {'kind': 'receipt', 'confirm': True})
        confirmed = returned.qorlia_validation_paged_save(confirm)
        self.assertEqual(confirmed['receipt']['next_step']['kind'], 'backorder')
        self.saved_prompt(returned, confirm, confirmed['receipt'])
        self.assertEqual((self.source_stock(), self.sale_line.qty_delivered), (5, 5))
        finish = self.validation(returned, confirm, {'kind': 'backorder', 'selected': True})
        accepted = returned.qorlia_validation_paged_save(finish)
        self.assertTrue(accepted['receipt']['terminal'])
        self.assertEqual((self.source_stock(), self.sale_line.qty_delivered), (6, 4))
        backorder = self.env['stock.picking'].search([('backorder_id', '=', returned.id)])
        self.assertEqual(len(backorder), 1)
        self.assertEqual(sum(backorder.move_ids.mapped('product_uom_qty')), 1)
        self.assertNotIn(backorder.state, ('done', 'cancel'))
        self.assertEqual(backorder.sale_id, self.order)
        self.assertEqual(original.qorlia_return_paged_status(creation)['return_transfer']['id'], returned.id)
        self.assertEqual(self.receipts(returned)[opening['request_key']]['consumed_by'], confirm['request_key'])
        self.assertEqual(self.receipts(returned)[confirm['request_key']]['consumed_by'], finish['request_key'])
        self.assertEqual(returned.qorlia_validation_paged_save(finish), accepted)

    def test_automatic_return_valuation_posts_balanced_journal_with_mandatory_analytics(self):
        self.automatic_valuation()
        original = self.delivered().with_user(self.env.user)
        returned, creation, _created = self.create_return(original)
        self.operation(returned, 2)
        payments = self.env['account.payment'].search_count([])
        credits = self.env['account.move'].search_count([('move_type', '=', 'out_refund')])
        count = self.env['account.move'].search_count([])
        request, accepted = self.finish_receipt(returned)
        layer = self.env['stock.valuation.layer'].search([('stock_move_id', 'in', returned.move_ids.ids)])
        self.assertEqual((len(layer), layer.quantity, layer.value), (1, 2, 8))
        entry = layer.account_move_id
        self.assertEqual((len(entry), entry.state), (1, 'posted'))
        self.assertEqual(sorted(entry.line_ids.mapped('balance')), [-8, 8])
        self.assertTrue(all(entry.line_ids.mapped('analytic_distribution')))
        self.assertTrue(entry.line_ids.analytic_line_ids)
        self.assertEqual((self.source_stock(), self.sale_line.qty_delivered), (7, 3))
        self.assertEqual(returned.qorlia_validation_paged_save(request), accepted)
        self.assertEqual(original.qorlia_return_paged_status(creation)['return_transfer']['id'], returned.id)
        self.assertEqual(self.env['account.move'].search_count([]), count + 1)
        self.assertEqual(self.env['account.payment'].search_count([]), payments)
        self.assertEqual(self.env['account.move'].search_count([('move_type', '=', 'out_refund')]), credits)

    def test_stopped_receipt_continuation_keeps_accepted_preparation_and_original_creation(self):
        original = self.delivered()
        returned, creation, _created = self.create_return(original)
        self.preparation(returned)
        self.assertEqual(sum(returned.move_line_ids.mapped('qty_done')), 2)
        opening = self.validation(returned)
        opened = returned.qorlia_validation_paged_save(opening)
        self.assertEqual(opened['receipt']['next_step']['kind'], 'receipt')
        self.saved_prompt(returned, opening, opened['receipt'])
        child = self.validation(returned, opening, {'kind': 'receipt', 'confirm': True})
        stopped = returned.qorlia_validation_paged_stop(child)
        self.assertTrue(stopped['stopped'])
        self.assertFalse(stopped['accepted'])
        self.assertEqual(stopped['receipt']['request_key'], opening['request_key'])
        self.assertEqual((self.source_stock(), self.sale_line.qty_delivered), (5, 5))
        self.assertEqual(sum(returned.move_line_ids.mapped('qty_done')), 2)
        self.assertTrue(original.qorlia_return_paged_status(creation)['accepted'])
        with self.assertRaisesRegex(UserError, 'stopped'):
            returned.qorlia_validation_paged_save(child)
        self.assertFalse(self.receipts(returned)[opening['request_key']].get('consumed_by'))
        replacement = self.validation(returned, opening, {'kind': 'receipt', 'confirm': True})
        result = returned.qorlia_validation_paged_save(replacement)
        self.assertTrue(result['receipt']['terminal'])
        self.assertEqual((self.source_stock(), self.sale_line.qty_delivered), (7, 3))
        self.assertEqual(returned.qorlia_validation_paged_status(child)['receipt']['request_key'], opening['request_key'])

    def test_501_positive_return_moves_complete_without_legacy_caps_or_missing_tail(self):
        original, _first = self.large_delivered()
        returned, creation, created = self.create_return(original, quantity=1, every_move=True)
        self.assertEqual(len(returned.move_ids), 501)
        self.assertEqual(set(returned.move_ids.origin_returned_move_id.ids), set(original.move_ids.ids))
        self.assertEqual((self.source_stock(), self.sale_line.qty_delivered), (0, 501))
        self.preparation(returned)
        self.assertEqual(len(returned.move_line_ids), 501)
        self.assertEqual(sum(returned.move_line_ids.mapped('qty_done')), 501)
        opening = self.validation(returned)
        opened = returned.qorlia_validation_paged_save(opening)
        self.assertEqual(opened['receipt']['next_step']['counts']['operations'], 501)
        request, accepted = self.finish_receipt(returned, opening)
        self.assertEqual((self.source_stock(), self.sale_line.qty_delivered), (501, 0))
        layers = self.env['stock.valuation.layer'].search([('stock_move_id', 'in', returned.move_ids.ids)])
        self.assertEqual(len(layers), 501)
        self.assertEqual(sum(layers.mapped('quantity')), 501)
        self.assertEqual(sum(layers.mapped('value')), 2004)
        self.assertFalse(layers.account_move_id)
        before = original._qorlia_confirmation_stamp(original._qorlia_return_paged_tables())
        self.assertEqual(returned.qorlia_validation_paged_save(request), accepted)
        self.assertEqual(original.qorlia_return_paged_save(creation)['state_after'], created['state_after'])
        self.assertEqual(before, original._qorlia_confirmation_stamp(original._qorlia_return_paged_tables()))
