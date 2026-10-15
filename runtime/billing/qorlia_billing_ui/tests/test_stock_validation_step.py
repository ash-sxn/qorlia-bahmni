# SPDX-License-Identifier: LGPL-3.0-or-later
# Copyright 2026 Qorlia contributors.
import copy
from datetime import timedelta
import json
import uuid
from unittest.mock import patch

from odoo import fields
from odoo.exceptions import AccessError, UserError, ValidationError
from odoo.tests import TransactionCase, tagged

from . import test_stock_validation_contract as native_contract
from . import test_stock_validation_preview as preview_contract


@tagged('post_install', '-at_install')
class StockValidationStepTest(native_contract.StockValidationFixture, TransactionCase):
    prepared = preview_contract.StockValidationPreviewTest.prepared
    load = preview_contract.StockValidationPreviewTest.load

    def request(self, picking, previous=None, decision=None):
        version = self.load(picking)['version']
        review = picking.qorlia_validation_step_preview(self.order.id, picking.id, version,
            previous['request_key'] if previous else False, [decision] if decision else [])
        self.assertTrue(review['write_ready'])
        self.assertEqual(len(review['review_version']), 64)
        return {key: copy.deepcopy(review[key]) for key in (
            'order_id', 'transfer_id', 'version', 'continuation_key', 'decisions', 'review_version')} | {
                'request_key': str(uuid.uuid4())}

    def receipts(self, picking):
        self.env.cr.execute('SELECT qorlia_validation_receipts FROM stock_picking WHERE id = %s', [picking.id])
        return self.env.cr.fetchone()[0] or {}

    def test_immediate_preparation_persists_before_expiry_prompt_is_closed(self):
        self.lot.expiration_date = fields.Datetime.now() - timedelta(days=1)
        picking = self.prepared()
        opening = self.request(picking)
        self.assertEqual(picking.move_line_ids.qty_done, 0)
        result = picking.qorlia_validation_step_save(opening)
        self.assertEqual(result['next_step']['kind'], 'immediate')
        self.assertFalse(result['terminal'])
        self.assertEqual(picking.move_line_ids.qty_done, 0)
        immediate = self.request(picking, opening, {'kind': 'immediate', 'selected': True})
        self.assertEqual(picking.move_line_ids.qty_done, 0, 'Preview must roll preparation back')
        result = picking.qorlia_validation_step_save(immediate)
        self.assertEqual(result['next_step']['kind'], 'expiry')
        self.assertEqual(result['state_after'], 'assigned')
        self.assertEqual(picking.move_line_ids.qty_done, 5)
        self.assertEqual(self.source_stock(), 10)
        self.assertEqual(self.sale_line.qty_delivered, 0)
        self.assertNotIn('next_action', result)
        json.dumps(result, allow_nan=False)
        self.assertEqual(result, picking.qorlia_validation_step_status(immediate))
        self.assertEqual(result, picking.qorlia_validation_step_save(immediate))
        self.assertEqual(len(self.receipts(picking)), 2)
        declined = self.request(picking, immediate, {'kind': 'expiry', 'proceed': False})
        result = picking.qorlia_validation_step_save(declined)
        self.assertTrue(result['terminal'])
        self.assertFalse(result['next_step'])
        self.assertEqual(picking.move_line_ids.qty_done, 5)
        self.assertEqual(self.source_stock(), 10)

    def test_receipt_prices_persist_before_backorder_prompt_is_closed(self):
        picking = self.picking(self.in_type)
        picking.action_confirm()
        picking.action_assign()
        picking.move_ids.group_id = self.env['procurement.group'].create({
            'name': 'QorliaQA Step receipt', 'sale_id': self.order.id, 'partner_id': self.customer.id})
        picking.move_line_ids.write({'qty_done': 2, 'lot_id': self.lot.id,
            'cost_price': 2.5, 'sale_price': 5, 'mrp': 7})
        opening = self.request(picking)
        result = picking.qorlia_validation_step_save(opening)
        self.assertEqual(result['next_step']['kind'], 'receipt')
        confirm = self.request(picking, opening, {'kind': 'receipt', 'confirm': True})
        self.assertEqual(self.lot.cost_price, 0)
        result = picking.qorlia_validation_step_save(confirm)
        self.assertEqual(result['next_step']['kind'], 'backorder')
        self.assertEqual((self.lot.cost_price, self.lot.sale_price, self.lot.mrp), (2.5, 5, 7))
        self.assertEqual(picking.state, 'assigned')
        self.assertEqual(self.source_stock(), 10)
        self.assertEqual(self.sale_line.qty_delivered, 0)
        self.assertFalse(self.env['stock.valuation.layer'].search([('stock_move_id', 'in', picking.move_ids.ids)]))
        finish = self.request(picking, confirm, {'kind': 'backorder', 'selected': True})
        accepted = picking.qorlia_validation_step_save(finish)
        self.assertTrue(accepted['terminal'])
        self.assertEqual(picking.state, 'done')
        self.assertEqual(self.source_stock(), 12)
        backorder = self.env['stock.picking'].search([('backorder_id', '=', picking.id)])
        self.assertEqual(len(backorder), 1)
        self.assertEqual(sum(backorder.move_ids.mapped('product_uom_qty')), 3)
        self.assertEqual(accepted, picking.qorlia_validation_step_save(finish))

    def test_full_delivery_and_declined_immediate_keep_native_terminal_states(self):
        picking = self.prepared(5)
        request = self.request(picking)
        result = picking.qorlia_validation_step_save(request)
        self.assertTrue(result['terminal'])
        self.assert_delivered(picking, 5)
        self.assertEqual(result, picking.qorlia_validation_step_status(request))

    def test_false_immediate_choice_does_not_move_or_prepare_stock(self):
        picking = self.prepared()
        opening = self.request(picking)
        picking.qorlia_validation_step_save(opening)
        request = self.request(picking, opening, {'kind': 'immediate', 'selected': False})
        result = picking.qorlia_validation_step_save(request)
        self.assertTrue(result['terminal'])
        self.assertEqual(result['state_after'], 'assigned')
        self.assertEqual(picking.move_line_ids.qty_done, 0)
        self.assertEqual(self.source_stock(), 10)

    def test_consumed_prompt_cannot_be_processed_with_another_nonce(self):
        self.lot.expiration_date = fields.Datetime.now() - timedelta(days=1)
        picking = self.prepared()
        opening = self.request(picking)
        picking.qorlia_validation_step_save(opening)
        request = self.request(picking, opening, {'kind': 'immediate', 'selected': True})
        picking.qorlia_validation_step_save(request)
        repeated = dict(request, request_key=str(uuid.uuid4()))
        with self.assertRaises(UserError):
            picking.qorlia_validation_step_save(repeated)
        with self.assertRaises(UserError):
            self.request(picking, opening, {'kind': 'immediate', 'selected': True})
        status = picking.qorlia_validation_step_status(opening)
        self.assertTrue(status['accepted'])
        self.assertTrue(status['continuation_reason'])
        self.assertFalse(status['next_step'])
        self.assertEqual(len(self.receipts(picking)), 2)

    def test_invalid_or_cross_author_continuation_and_context_are_rejected(self):
        picking = self.prepared()
        opening = self.request(picking)
        picking.qorlia_validation_step_save(opening)
        with self.assertRaises(AccessError):
            self.request(picking.with_user(self.env.user), opening, {'kind': 'immediate', 'selected': True})
        with self.assertRaises(AccessError):
            self.request(picking, {'request_key': str(uuid.uuid4())}, {'kind': 'immediate', 'selected': True})
        for change in ({'continuation_key': True}, {'continuation_key': str(uuid.uuid4())},
                {'context': {'skip_expired': True}}, {'decisions': [{'kind': 'immediate', 'selected': True}]}):
            with self.assertRaises(ValidationError):
                picking.qorlia_validation_step_save(dict(opening, **change, request_key=str(uuid.uuid4())))
        with self.assertRaises(AccessError):
            picking.with_user(self.env.ref('base.public_user')).qorlia_validation_step_status(opening)

    def test_missing_transient_does_not_recreate_a_saved_prompt(self):
        picking = self.prepared()
        opening = self.request(picking)
        picking.qorlia_validation_step_save(opening)
        receipt = self.receipts(picking)[opening['request_key']]
        wizard = self.env[receipt['next_action']['res_model']].browse(receipt['next_action']['res_id'])
        wizard.immediate_transfer_line_ids.unlink()
        wizard.unlink()
        status = picking.qorlia_validation_step_status(opening)
        self.assertTrue(status['accepted'])
        self.assertTrue(status['continuation_reason'])
        self.assertFalse(status['terminal'])
        self.assertFalse(status['next_step'])
        with self.assertRaises(UserError):
            self.request(picking, opening, {'kind': 'immediate', 'selected': True})
        self.assertFalse(wizard.exists())

    def test_stale_or_tampered_review_cannot_commit_a_step(self):
        picking = self.prepared()
        request = self.request(picking)
        with self.assertRaises(UserError):
            picking.qorlia_validation_step_save(dict(request, review_version='0' * 64))
        self.assertFalse(self.receipts(picking))
        picking.move_line_ids.qty_done = 2
        with self.assertRaises(UserError):
            picking.qorlia_validation_step_save(request)
        self.assertFalse(self.receipts(picking))

    def test_actual_effect_mismatch_rolls_back_step_and_receipt(self):
        picking = self.prepared()
        request = self.request(picking)
        original = type(picking)._qorlia_validation_native
        calls = []

        def changed(record, *args, **kwargs):
            result = original(record, *args, **kwargs)
            calls.append(True)
            if len(calls) == 2:
                result[0]['labels']['unreviewed'] = 'Unexpected native effect'
            return result

        count = self.env['stock.immediate.transfer'].search_count([])
        with patch.object(type(picking), '_qorlia_validation_native', changed):
            with self.assertRaises(UserError):
                picking.qorlia_validation_step_save(request)
        self.assertEqual(self.env['stock.immediate.transfer'].search_count([]), count)
        self.assertFalse(self.receipts(picking))
        self.assertEqual(picking.move_line_ids.qty_done, 0)

    def test_external_notification_is_still_blocked_before_dispatch(self):
        picking = self.prepared(5)
        self.env.company.stock_move_email_validation = True
        with patch.object(type(picking), 'message_post_with_template') as send:
            with self.assertRaisesRegex(UserError, 'External delivery notifications'):
                self.request(picking)
            send.assert_not_called()
        self.assertFalse(self.receipts(picking))
        self.assertEqual(self.source_stock(), 10)
