# SPDX-License-Identifier: LGPL-3.0-or-later
# Copyright 2026 Qorlia contributors.
import copy
from datetime import timedelta
import json
from unittest.mock import patch

from odoo import fields
from odoo.exceptions import AccessError, UserError, ValidationError
from odoo.tests import TransactionCase, tagged

from ..models.stock_confirmation_paged import _effect_rows
from .test_stock_validation_contract import StockValidationFixture
from . import test_stock_validation_step as step_contract


@tagged('post_install', '-at_install')
class StockValidationPagedReviewTest(StockValidationFixture, TransactionCase):
    prepared = step_contract.StockValidationStepTest.prepared
    load = step_contract.StockValidationStepTest.load
    request = step_contract.StockValidationStepTest.request
    receipts = step_contract.StockValidationStepTest.receipts
    automatic_valuation = step_contract.StockValidationStepTest.automatic_valuation

    def selection(self, picking, previous=None, decision=None):
        loaded = picking.qorlia_validation_paged_load(self.order.id, picking.id)
        return {'order_id': self.order.id, 'transfer_id': picking.id, 'version': loaded['version'],
            'continuation_key': previous['request_key'] if previous else False, 'decisions': [decision] if decision else []}

    def pages(self, picking, data, limit=50):
        pages, after, version, token = [], 0, False, False
        while True:
            page = picking.qorlia_validation_paged_review(data, after, version, token, limit)
            pages.append(page)
            count = len(page['prompt_rows']) + len(_effect_rows(page['effects']))
            self.assertEqual(count, min(limit, page['total_count'] - after))
            self.assertFalse(page['write_ready'], 'The new write contract is not implemented in this review checkpoint')
            self.assertNotIn('next_action', page)
            self.assertNotIn('res_model', page)
            if page['next_after'] is False:
                self.assertFalse(page['continuation_token'])
                self.assertEqual(len(page['review_complete_token']), 64)
                break
            self.assertFalse(page['review_complete_token'])
            self.assertGreater(page['next_after'], after)
            after, version, token = page['next_after'], page['review_version'], page['continuation_token']
        json.dumps(pages, allow_nan=False)
        return pages

    def test_compact_load_and_review_exceed_both_legacy_transfer_limits(self):
        picking = self.prepared()
        move = picking.move_ids
        self.env['stock.move'].create([{'name': 'QorliaQA Paged validation tail %s' % index,
            'picking_id': picking.id, 'product_id': self.product.id, 'product_uom': self.product.uom_id.id,
            'product_uom_qty': 0, 'state': move.state, 'location_id': picking.location_id.id,
            'location_dest_id': picking.location_dest_id.id} for index in range(500)])
        self.env['stock.move.line'].create([{'picking_id': picking.id, 'move_id': move.id,
            'product_id': self.product.id, 'product_uom_id': self.product.uom_id.id, 'qty_done': 0,
            'lot_id': self.lot.id,
            'location_id': picking.location_id.id, 'location_dest_id': picking.location_dest_id.id} for _ in range(2000)])
        with self.assertRaises(UserError):
            picking.qorlia_validation_load(self.order.id, picking.id)
        loaded = picking.qorlia_validation_paged_load(self.order.id, picking.id)
        self.assertEqual((loaded['transfer']['move_count'], loaded['transfer']['operation_count']), (501, 2001))
        self.assertNotIn('graph', loaded)
        self.assertFalse(loaded['reason'])
        self.assertFalse(loaded['write_ready'])
        page = self.pages(picking, self.selection(picking))[0]
        self.assertEqual(page['next_step']['kind'], 'immediate')
        self.assertFalse(page['input_prompt'])
        self.assertEqual(page['prompt_rows'], [])
        self.assertEqual((self.source_stock(), self.sale_line.qty_delivered), (10, 0))
        self.assertFalse(self.receipts(picking))

    def test_every_input_receipt_row_and_effect_is_reviewed_in_one_ordered_proof_chain(self):
        picking = self.picking(self.in_type, quantity=101)
        picking.action_confirm()
        picking.action_assign()
        picking.move_ids.group_id = self.env['procurement.group'].create({
            'name': 'QorliaQA Paged receipt', 'sale_id': self.order.id, 'partner_id': self.customer.id})
        picking.move_line_ids.unlink()
        self.env['stock.move.line'].create([{'picking_id': picking.id, 'move_id': picking.move_ids.id,
            'product_id': self.product.id, 'product_uom_id': self.product.uom_id.id, 'qty_done': 1,
            'lot_id': self.lot.id, 'cost_price': 2.5, 'sale_price': 5, 'mrp': 7,
            'location_id': picking.location_id.id, 'location_dest_id': picking.location_dest_id.id} for _ in range(101)])
        previous = self.request(picking)
        picking.qorlia_validation_step_save(previous)
        data = self.selection(picking, previous, {'kind': 'receipt', 'confirm': True})
        before = picking._qorlia_confirmation_stamp(picking._qorlia_validation_tables())
        pages = self.pages(picking, data)
        self.assertGreaterEqual(len(pages), 3)
        self.assertEqual(pages[0]['prompt_count'], 101)
        rows = [row for page in pages for row in page['prompt_rows']]
        effects = [row for page in pages for row in _effect_rows(page['effects'])]
        self.assertEqual(len(rows), 101)
        self.assertEqual({row['value']['id'] for row in rows}, set(picking.move_line_ids.ids))
        self.assertEqual(len(effects), pages[0]['effect_count'])
        self.assertEqual(len(rows) + len(effects), pages[0]['total_count'])
        for page in pages:
            self.assertEqual(page['input_prompt']['counts']['operations'], 101)
            self.assertEqual(page['review_version'], pages[0]['review_version'])
        for row in rows:
            self.assertEqual(row['section'], 'operations')
            self.assertEqual((row['value']['qty_done'], row['value']['cost_price'], row['value']['sale_price'], row['value']['mrp']), (1, 2.5, 5, 7))
        self.assertEqual(before, picking._qorlia_confirmation_stamp(picking._qorlia_validation_tables()))
        self.assertEqual((self.source_stock(), self.lot.cost_price), (10, 0))
        self.assertEqual(len(self.receipts(picking)), 1)

    def test_review_proofs_reject_skipped_changed_and_cross_purpose_pages(self):
        picking = self.prepared(5).with_user(self.env.user)
        data = self.selection(picking)
        first = picking.qorlia_validation_paged_review(data, limit=1)
        self.assertGreater(first['total_count'], 1)
        self.assertFalse(first['review_complete_token'])
        for after, version, token in ((first['next_after'] + 1, first['review_version'], first['continuation_token']),
                (first['next_after'], '0' * 64, first['continuation_token']),
                (first['next_after'], first['review_version'], '0' * 64)):
            with self.assertRaises(UserError):
                picking.qorlia_validation_paged_review(data, after, version, token, 1)
        complete = self.pages(picking, data)[-1]
        self.assertNotEqual(complete['review_complete_token'], first['continuation_token'])
        with self.assertRaises(UserError):
            picking.qorlia_validation_paged_review(data, first['next_after'], first['review_version'], complete['review_complete_token'], 1)
        old_load = self.load(picking)
        with self.assertRaises(UserError):
            picking.qorlia_validation_step_preview(self.order.id, picking.id, data['version'], False, [])
        self.assertNotEqual(data['version'], old_load['version'])
        self.assertEqual(self.source_stock(), 10)

    def test_native_terminal_valuation_and_private_counts_are_not_truncated_or_exposed(self):
        picking = self.prepared(5)
        pages = self.pages(picking, self.selection(picking), 1)
        self.assertTrue(pages[-1]['terminal'])
        self.assertEqual(pages[-1]['state_after'], 'done')
        self.assertFalse(pages[-1]['next_step'])
        for page in pages:
            self.assertNotIn('stock.valuation.layer', page['effects']['schema'])
            self.assertEqual(page['effects']['private_effect_counts']['stock.valuation.layer'], {'created': 1, 'updated': 0, 'deleted': 0})
        self.assertEqual(self.source_stock(), 10)
        self.assertEqual(self.sale_line.qty_delivered, 0)
        self.assertFalse(self.receipts(picking))

    def test_native_automatic_accounting_review_keeps_mandatory_analytics_and_rolls_back(self):
        self.automatic_valuation()
        picking = self.prepared(5).with_user(self.env.user)
        data = self.selection(picking)
        before = picking._qorlia_confirmation_stamp(picking._qorlia_validation_tables())
        pages = self.pages(picking, data)
        entries = [row for page in pages for row in page['effects']['created'].get('account.move', [])]
        self.assertEqual(len(entries), 1)
        self.assertEqual(entries[0]['values']['state'], 'posted')
        after = picking._qorlia_confirmation_stamp(picking._qorlia_validation_tables())
        self.assertEqual(before, after, 'Changed tables: %s' % [name for name in before if before[name] != after[name]])
        self.assertEqual(self.source_stock(), 10)

    def test_preparation_expiry_decline_and_consumed_prompts_remain_distinct(self):
        self.lot.expiration_date = fields.Datetime.now() - timedelta(days=1)
        picking = self.prepared()
        opening = self.request(picking)
        picking.qorlia_validation_step_save(opening)
        data = self.selection(picking, opening, {'kind': 'immediate', 'selected': True})
        reviewed = self.pages(picking, data)[-1]
        self.assertEqual(reviewed['next_step']['kind'], 'expiry')
        self.assertFalse(reviewed['terminal'])
        self.assertEqual(picking.move_line_ids.qty_done, 0)
        immediate = self.request(picking, opening, {'kind': 'immediate', 'selected': True})
        picking.qorlia_validation_step_save(immediate)
        declined = self.pages(picking, self.selection(picking, immediate, {'kind': 'expiry', 'proceed': False}))[-1]
        self.assertTrue(declined['terminal'])
        self.assertEqual(declined['state_after'], 'assigned')
        self.assertEqual(declined['input_prompt']['kind'], 'expiry')
        self.assertEqual(picking.move_line_ids.qty_done, 5)
        with self.assertRaises(UserError):
            picking.qorlia_validation_paged_review(self.selection(picking, opening, {'kind': 'immediate', 'selected': True}))
        self.assertEqual((self.source_stock(), self.sale_line.qty_delivered), (10, 0))

    def test_selection_paging_and_author_context_boundaries_are_strict(self):
        picking = self.prepared(5)
        data = self.selection(picking)
        for changed in ({'context': {}}, {'order_id': True}, {'decisions': [{'kind': 'sms', 'send': True}]},
                {'continuation_key': True}, {'version': 'bad'}, {'request_key': 'extra'}):
            with self.assertRaises(ValidationError):
                picking.qorlia_validation_paged_review(dict(data, **changed))
        for options in ({'after': True}, {'after': -1}, {'after': 99999, 'review_version': 'a' * 64, 'continuation_token': 'b' * 64},
                {'limit': 0}, {'limit': 101}, {'limit': True}, {'review_version': 'a' * 64}, {'after': 1}):
            with self.assertRaises(ValidationError):
                picking.qorlia_validation_paged_review(data, **options)
        with self.assertRaises(AccessError):
            picking.with_user(self.env.ref('base.public_user')).qorlia_validation_paged_load(self.order.id, picking.id)
        opening_pick = self.prepared()
        opening = self.request(opening_pick)
        opening_pick.qorlia_validation_step_save(opening)
        changed_author = opening_pick.with_user(self.env.user)
        with self.assertRaises(AccessError):
            changed_author.qorlia_validation_paged_review(self.selection(changed_author, opening, {'kind': 'immediate', 'selected': True}))
        fresh = self.selection(picking)
        self.assertEqual(self.pages(picking.with_context(skip_expired=True, skip_backorder=True, uid=1), fresh)[-1]['state_after'], 'done')

    def test_inventory_configuration_and_hidden_tails_invalidate_complete_review(self):
        picking = self.prepared(5)
        data = self.selection(picking)
        self.lot.expiration_date = fields.Datetime.now() - timedelta(days=1)
        with self.assertRaises(UserError):
            picking.qorlia_validation_paged_review(data)
        self.lot.expiration_date = '2027-01-01 00:00:00'
        data = self.selection(picking)
        self.env['ir.rule'].create({'name': 'QorliaQA Paged validation hidden quant', 'model_id': self.env.ref('stock.model_stock_quant').id,
            'domain_force': "[('product_id', '!=', %s)]" % self.product.id})
        with self.assertRaises(AccessError):
            picking.qorlia_validation_paged_load(self.order.id, picking.id)
        self.assertEqual(self.source_stock(), 10)

    def test_missing_prompt_is_not_recreated_and_all_callbacks_restore_after_preview_failure(self):
        picking = self.prepared()
        previous = self.request(picking)
        picking.qorlia_validation_step_save(previous)
        data = self.selection(picking, previous, {'kind': 'immediate', 'selected': True})
        receipt = self.receipts(picking)[previous['request_key']]
        wizard = self.env[receipt['next_action']['res_model']].browse(receipt['next_action']['res_id'])
        wizard.immediate_transfer_line_ids.unlink()
        wizard.unlink()
        with self.assertRaises(UserError):
            picking.qorlia_validation_paged_review(self.selection(picking, previous, {'kind': 'immediate', 'selected': True}))
        self.assertEqual(len(self.receipts(picking)), 1)
        other = self.prepared(5)
        data = self.selection(other)
        cr = self.env.cr
        hooks = {name: (getattr(cr, name), list(getattr(cr, name)._funcs), copy.deepcopy(getattr(cr, name).data))
            for name in ('precommit', 'postcommit', 'prerollback', 'postrollback')}
        original = type(other)._qorlia_validation_native
        def fail_after(records, *args, **kwargs):
            original(records, *args, **kwargs)
            cr.postcommit.add(lambda: None)
            raise UserError('QorliaQA after native review')
        with patch.object(type(other), '_qorlia_validation_native', fail_after):
            with self.assertRaisesRegex(UserError, 'after native review'):
                other.qorlia_validation_paged_review(data)
        for name, (callbacks, functions, values) in hooks.items():
            self.assertIs(getattr(cr, name), callbacks)
            self.assertEqual(list(callbacks._funcs), functions)
            self.assertEqual(callbacks.data, values)
        self.assertEqual(self.source_stock(), 10)

    def test_external_notifications_remain_blocked_before_any_send_or_business_write(self):
        picking = self.prepared(5).with_user(self.env.user)
        self.env.company.stock_move_email_validation = True
        data = self.selection(picking)
        before = picking._qorlia_confirmation_stamp(picking._qorlia_validation_tables())
        with self.assertRaisesRegex(UserError, 'External delivery notifications'):
            picking.qorlia_validation_paged_review(data)
        self.assertEqual(before, picking._qorlia_confirmation_stamp(picking._qorlia_validation_tables()))
        self.assertFalse(self.receipts(picking))
        self.assertEqual(self.source_stock(), 10)
