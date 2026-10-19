# SPDX-License-Identifier: LGPL-3.0-or-later
# Copyright 2026 Qorlia contributors.
import copy
from datetime import timedelta
import json

from odoo import fields
from odoo.exceptions import AccessError, UserError, ValidationError
from odoo.tests import TransactionCase, tagged

from ..models.stock_validation import _RECEIPT_TOKEN
from .test_stock_validation_contract import StockValidationFixture
from . import test_stock_validation_step as step_contract


@tagged('post_install', '-at_install')
class StockValidationRecoveryTest(StockValidationFixture, TransactionCase):
    prepared = step_contract.StockValidationStepTest.prepared
    load = step_contract.StockValidationStepTest.load
    request = step_contract.StockValidationStepTest.request
    receipts = step_contract.StockValidationStepTest.receipts

    def opening(self, picking=None):
        picking = picking if picking is not None else self.prepared()
        request = self.request(picking)
        picking.qorlia_validation_step_save(request)
        return picking, request

    def test_compact_unknown_request_is_read_only_and_has_no_prompt_or_references(self):
        picking = self.prepared()
        request = self.request(picking)
        result = picking.qorlia_validation_step_compact_status(request)
        self.assertFalse(result['accepted'])
        self.assertFalse(result['terminal'])
        self.assertFalse(result['next_step'])
        self.assertFalse(result['continuation_key'])
        self.assertEqual((result['prompt_count'], result['reference_count']), (0, 0))
        self.assertEqual(result['current']['transfer']['id'], picking.id)
        self.assertNotIn('graph', result['current'])
        for method in ('qorlia_validation_step_prompt_page', 'qorlia_validation_step_reference_page'):
            with self.assertRaises(UserError):
                getattr(picking, method)(request)
        self.assertFalse(self.receipts(picking))
        self.assertEqual(self.source_stock(), 10)

    def test_acceptance_survives_growth_above_legacy_move_and_operation_limits(self):
        picking, request = self.opening()
        move = picking.move_ids
        self.env['stock.move'].create([{
            'name': 'QorliaQA Recovery tail %s' % index, 'picking_id': picking.id,
            'product_id': self.product.id, 'product_uom': self.product.uom_id.id,
            'product_uom_qty': 0, 'state': move.state, 'location_id': picking.location_id.id,
            'location_dest_id': picking.location_dest_id.id,
        } for index in range(500)])
        self.env['stock.move.line'].create([{
            'picking_id': picking.id, 'move_id': move.id, 'product_id': self.product.id,
            'product_uom_id': self.product.uom_id.id, 'qty_done': 0,
            'location_id': picking.location_id.id, 'location_dest_id': picking.location_dest_id.id,
        } for _index in range(2000)])
        with self.assertRaises(UserError):
            picking.qorlia_validation_step_status(request)
        result = picking.qorlia_validation_step_compact_status(request)
        self.assertTrue(result['accepted'])
        self.assertEqual(result['next_step']['kind'], 'immediate')
        self.assertEqual(result['current']['transfer']['move_count'], 501)
        self.assertEqual(result['current']['transfer']['operation_count'], 2001)
        self.assertNotIn('operations', result['next_step'])
        page = picking.qorlia_validation_step_prompt_page(request, limit=1)
        self.assertEqual(len(page['rows']), 1)
        self.assertEqual(page['rows'][0]['value']['transfer'][0], picking.id)
        self.assertEqual(len(self.receipts(picking)), 1)
        self.assertEqual((self.source_stock(), self.sale_line.qty_delivered), (10, 0))

    def test_saved_receipt_prompt_retains_every_native_operation_price_unit_and_warning(self):
        picking = self.picking(self.in_type, quantity=101)
        picking.action_confirm()
        picking.action_assign()
        picking.move_ids.group_id = self.env['procurement.group'].create({
            'name': 'QorliaQA Recovery receipt', 'sale_id': self.order.id, 'partner_id': self.customer.id})
        picking.move_line_ids.unlink()
        self.env['stock.move.line'].create([{
            'picking_id': picking.id, 'move_id': picking.move_ids.id,
            'product_id': self.product.id, 'product_uom_id': self.product.uom_id.id,
            'qty_done': 1, 'lot_name': 'QorliaQA Recovery batch %s' % index,
            'expiration_date': '2027-02-01 00:00:00', 'cost_price': 2.5,
            'sale_price': 5, 'mrp': 7, 'location_id': picking.location_id.id,
            'location_dest_id': picking.location_dest_id.id,
        } for index in range(101)])
        picking, request = self.opening(picking)
        original_state = picking.state
        status = picking.qorlia_validation_step_compact_status(request)
        self.assertEqual(status['next_step']['counts'], {'transfers': 0, 'lots': 0, 'operations': 101})
        self.assertEqual(status['prompt_count'], 101)
        pages, after, version = [], 0, False
        while True:
            page = picking.qorlia_validation_step_prompt_page(request, after, version, 50)
            self.assertLessEqual(len(page['rows']), 50)
            pages.extend(page['rows'])
            self.assertNotIn('next_action', page)
            version = page['version']
            if page['next_after'] is False:
                break
            after = page['next_after']
        self.assertEqual(len(pages), 101)
        self.assertEqual({row['value']['id'] for row in pages}, set(picking.move_line_ids.ids))
        for row in pages:
            self.assertEqual(row['section'], 'operations')
            self.assertEqual((row['value']['qty_done'], row['value']['cost_price'], row['value']['sale_price'], row['value']['mrp']), (1, 2.5, 5, 7))
            self.assertEqual(row['value']['product_uom_id'][0], self.product.uom_id.id)
        self.assertEqual(status['prompt_version'], version)
        self.assertEqual(self.source_stock(), 10)
        self.assertEqual(picking.state, original_state)
        json.dumps(pages, allow_nan=False)

    def test_prompt_changes_invalidate_a_pinned_page(self):
        picking, request = self.opening()
        page = picking.qorlia_validation_step_prompt_page(request)
        receipt = self.receipts(picking)[request['request_key']]
        wizard = self.env[receipt['next_action']['res_model']].browse(receipt['next_action']['res_id'])
        wizard.immediate_transfer_line_ids.to_immediate = False
        with self.assertRaises(UserError):
            picking.qorlia_validation_step_prompt_page(request, 0, page['version'])
        fresh = picking.qorlia_validation_step_prompt_page(request)
        self.assertFalse(fresh['rows'][0]['value']['selected'])
        self.assertNotEqual(page['version'], fresh['version'])

    def test_expiry_recovery_keeps_the_native_lot_and_description(self):
        self.lot.expiration_date = fields.Datetime.now() - timedelta(days=1)
        picking, opening = self.opening()
        request = self.request(picking, opening, {'kind': 'immediate', 'selected': True})
        picking.qorlia_validation_step_save(request)
        status = picking.qorlia_validation_step_compact_status(request)
        page = picking.qorlia_validation_step_prompt_page(request)
        self.assertEqual(status['next_step']['kind'], 'expiry')
        self.assertEqual(status['next_step']['counts'], {'transfers': 0, 'lots': 1, 'operations': 0})
        self.assertIsInstance(status['next_step']['description'], str)
        self.assertEqual(page['rows'], [{'section': 'lots', 'value': [self.lot.id, self.lot.display_name]}])
        self.assertEqual((self.source_stock(), self.sale_line.qty_delivered), (10, 0))

    def test_consumed_and_missing_prompts_never_get_recreated(self):
        picking, opening = self.opening()
        request = self.request(picking, opening, {'kind': 'immediate', 'selected': False})
        picking.qorlia_validation_step_save(request)
        status = picking.qorlia_validation_step_compact_status(opening)
        self.assertTrue(status['accepted'])
        self.assertFalse(status['terminal'])
        self.assertTrue(status['continuation_reason'])
        self.assertFalse(status['next_step'])
        with self.assertRaises(UserError):
            picking.qorlia_validation_step_prompt_page(opening)
        terminal = picking.qorlia_validation_step_compact_status(request)
        self.assertTrue(terminal['terminal'])
        self.assertFalse(terminal['next_step'])
        other, missing = self.opening()
        receipt = self.receipts(other)[missing['request_key']]
        wizard = self.env[receipt['next_action']['res_model']].browse(receipt['next_action']['res_id'])
        wizard.immediate_transfer_line_ids.unlink()
        wizard.unlink()
        count = self.env['stock.immediate.transfer'].search_count([])
        result = other.qorlia_validation_step_compact_status(missing)
        self.assertTrue(result['accepted'])
        self.assertTrue(result['continuation_reason'])
        with self.assertRaises(UserError):
            other.qorlia_validation_step_prompt_page(missing)
        self.assertEqual(self.env['stock.immediate.transfer'].search_count([]), count)

    def test_seeded_large_reference_receipt_is_complete_and_pinned(self):
        picking, request = self.opening()
        lots = self.env['stock.lot'].create([{'name': 'QorliaQA Recovery reference %s' % index,
            'product_id': self.product.id, 'company_id': self.env.company.id} for index in range(101)])
        receipts = self.receipts(picking)
        receipts[request['request_key']]['references'] = {'new:stock.lot:%s' % index: {'model': 'stock.lot', 'id': lot.id}
            for index, lot in enumerate(lots)}
        picking.with_context(qorlia_validation_receipt_token=_RECEIPT_TOKEN)._qorlia_validation_record_receipt(receipts)
        rows, after, version = [], 0, False
        while True:
            page = picking.qorlia_validation_step_reference_page(request, after, version, 50)
            rows.extend(page['rows'])
            version = page['version']
            if page['next_after'] is False:
                break
            after = page['next_after']
        self.assertEqual(len(rows), 101)
        self.assertEqual({row['id'] for row in rows}, set(lots.ids))
        self.assertEqual(picking.qorlia_validation_step_compact_status(request)['reference_count'], 101)
        lots[-1].unlink()
        with self.assertRaises(UserError):
            picking.qorlia_validation_step_reference_page(request, 0, version)
        fresh = picking.qorlia_validation_step_reference_page(request, limit=100)
        tail = picking.qorlia_validation_step_reference_page(request, fresh['next_after'], fresh['version'], 100)
        hidden = [row for row in fresh['rows'] + tail['rows'] if not row['available']]
        self.assertEqual(len(hidden), 1)
        self.assertFalse(hidden[0]['id'])
        self.assertFalse(hidden[0]['name'])

    def test_readers_reject_foreign_author_scope_payload_and_client_context(self):
        picking, request = self.opening()
        for method in ('qorlia_validation_step_compact_status', 'qorlia_validation_step_prompt_page', 'qorlia_validation_step_reference_page'):
            with self.assertRaises(ValidationError):
                getattr(picking.with_user(self.env.user), method)(request)
            with self.assertRaises(AccessError):
                getattr(picking.with_user(self.env.ref('base.public_user')), method)(request)
            for changed in ({'context': {}}, {'continuation_key': True}, {'order_id': True}, {'decisions': [{'kind': 'sms', 'send': True}]}):
                with self.assertRaises(ValidationError):
                    getattr(picking, method)(dict(request, **changed))
        injected = picking.with_context(skip_immediate=True, skip_backorder=True, skip_expired=True).qorlia_validation_step_compact_status(request)
        self.assertEqual(injected, picking.qorlia_validation_step_compact_status(request))

    def test_page_bounds_and_snapshot_tokens_fail_closed(self):
        picking, request = self.opening()
        for method in ('qorlia_validation_step_prompt_page', 'qorlia_validation_step_reference_page'):
            current = getattr(picking, method)(request)
            for after, version, limit in ((True, False, 50), (-1, False, 50), (1, False, 50), (0, False, True),
                    (0, False, 0), (0, False, 101), (0, 'x' * 64, 50)):
                with self.assertRaises(ValidationError):
                    getattr(picking, method)(request, after, version, limit)
            with self.assertRaises(UserError):
                getattr(picking, method)(request, 0, 'a' * 64)
            with self.assertRaises(ValidationError):
                getattr(picking, method)(request, 100000, current['version'])

    def test_hidden_tail_is_not_returned_as_a_complete_prompt(self):
        picking, request = self.opening()
        self.env['ir.rule'].create({'name': 'QorliaQA Recovery hidden original operation',
            'model_id': self.env['ir.model']._get_id('stock.move.line'),
            'domain_force': repr([('id', 'not in', picking.move_line_ids.ids)]), 'global': True})
        for method in ('qorlia_validation_step_compact_status', 'qorlia_validation_step_prompt_page', 'qorlia_validation_step_reference_page'):
            with self.assertRaises(AccessError):
                getattr(picking, method)(request)

    def test_exact_request_and_receipts_survive_reads_without_business_or_deferred_writes(self):
        picking, request = self.opening()
        original = copy.deepcopy(self.receipts(picking))
        tables = sorted(set(picking._qorlia_validation_tables()) | set(picking._qorlia_operation_paged_tables()) | {'account_analytic_applicability'})
        self.env.cr.flush()
        before = picking._qorlia_confirmation_stamp(tables)
        hooks = {name: (getattr(self.env.cr, name), list(getattr(self.env.cr, name)._funcs))
            for name in ('precommit', 'postcommit', 'prerollback', 'postrollback')}
        result = picking.qorlia_validation_step_compact_status(request)
        picking.qorlia_validation_step_prompt_page(request, version=result['prompt_version'])
        picking.qorlia_validation_step_reference_page(request)
        self.env.cr.flush()
        self.assertEqual(before, picking._qorlia_confirmation_stamp(tables))
        self.assertEqual(original, self.receipts(picking))
        self.assertEqual(request['request_key'], result['continuation_key'])
        for name, (callbacks, functions) in hooks.items():
            self.assertIs(callbacks, getattr(self.env.cr, name))
            self.assertEqual(functions, list(getattr(self.env.cr, name)._funcs))
