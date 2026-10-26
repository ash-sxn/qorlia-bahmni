# SPDX-License-Identifier: LGPL-3.0-or-later
# Copyright 2026 Qorlia contributors.
import copy
from datetime import timedelta
import uuid
from unittest.mock import patch

from odoo import fields
from odoo.exceptions import AccessError, UserError, ValidationError
from odoo.tests import TransactionCase, tagged

from .test_stock_validation_contract import StockValidationFixture
from . import test_stock_validation_paged_review as review_contract


@tagged('post_install', '-at_install')
class StockValidationPagedWriteTest(StockValidationFixture, TransactionCase):
    prepared = review_contract.StockValidationPagedReviewTest.prepared
    load = review_contract.StockValidationPagedReviewTest.load
    receipts = review_contract.StockValidationPagedReviewTest.receipts
    selection = review_contract.StockValidationPagedReviewTest.selection
    pages = review_contract.StockValidationPagedReviewTest.pages
    automatic_valuation = review_contract.StockValidationPagedReviewTest.automatic_valuation

    def exact(self, picking, previous=None, decision=None):
        data = self.selection(picking, previous, decision)
        last = self.pages(picking, data)[-1]
        return dict(data, review_version=last['review_version'], review_complete_token=last['review_complete_token'], request_key=str(uuid.uuid4()))

    def test_native_delivery_saves_once_and_recovers_without_editable_graph(self):
        picking = self.prepared(5)
        request = self.exact(picking)
        unknown = picking.qorlia_validation_paged_status(request)
        self.assertFalse(unknown['accepted'])
        self.assertFalse(unknown['stopped'])
        self.assertFalse(unknown['receipt'])
        accepted = picking.qorlia_validation_paged_save(request)
        self.assertTrue(accepted['accepted'])
        self.assertFalse(accepted['stopped'])
        self.assertTrue(accepted['receipt']['terminal'])
        self.assertEqual(accepted['receipt']['state_after'], 'done')
        self.assert_delivered(picking, 5)
        self.assertEqual(accepted, picking.qorlia_validation_paged_status(request))
        self.assertEqual(accepted, picking.qorlia_validation_paged_save(request))
        self.assertEqual(accepted, picking.qorlia_validation_paged_stop(request))
        self.assertEqual(len(self.receipts(picking)), 1)
        refs = picking.qorlia_validation_paged_reference_page(request)
        self.assertEqual(refs['receipt_key'], request['request_key'])
        self.assertEqual(refs['total_count'], accepted['receipt']['reference_count'])
        self.assertEqual(self.source_stock(), 5)

    def test_large_move_and_operation_scope_saves_opening_and_exact_decline_without_legacy_caps(self):
        picking = self.prepared()
        move = picking.move_ids
        self.env['stock.move'].create([{'name': 'QorliaQA Paged write tail %s' % i, 'picking_id': picking.id,
            'product_id': self.product.id, 'product_uom': self.product.uom_id.id, 'product_uom_qty': 0,
            'state': move.state, 'location_id': picking.location_id.id, 'location_dest_id': picking.location_dest_id.id} for i in range(500)])
        self.env['stock.move.line'].create([{'picking_id': picking.id, 'move_id': move.id,
            'product_id': self.product.id, 'product_uom_id': self.product.uom_id.id, 'qty_done': 0,
            'lot_id': self.lot.id, 'location_id': picking.location_id.id, 'location_dest_id': picking.location_dest_id.id} for _ in range(2000)])
        opening = self.exact(picking)
        accepted = picking.qorlia_validation_paged_save(opening)
        self.assertEqual((accepted['current']['transfer']['move_count'], accepted['current']['transfer']['operation_count']), (501, 2001))
        self.assertEqual(accepted['receipt']['next_step']['kind'], 'immediate')
        page = picking.qorlia_validation_paged_prompt_page(opening)
        self.assertEqual(page['rows'][0]['value']['transfer'][0], picking.id)
        declined = self.exact(picking, opening, {'kind': 'immediate', 'selected': False})
        result = picking.qorlia_validation_paged_save(declined)
        self.assertTrue(result['receipt']['terminal'])
        self.assertEqual(result['receipt']['state_after'], 'assigned')
        self.assertEqual(self.source_stock(), 10)
        self.assertFalse(sum(picking.move_line_ids.mapped('qty_done')))
        self.assertEqual(result, picking.qorlia_validation_paged_save(declined))
        self.assertEqual(self.receipts(picking)[opening['request_key']]['consumed_by'], declined['request_key'])

    def test_preparation_expiry_and_backorder_choices_are_individual_native_commits(self):
        self.lot.expiration_date = fields.Datetime.now() - timedelta(days=1)
        picking = self.prepared()
        opening = self.exact(picking)
        picking.qorlia_validation_paged_save(opening)
        immediate = self.exact(picking, opening, {'kind': 'immediate', 'selected': True})
        accepted = picking.qorlia_validation_paged_save(immediate)
        self.assertEqual(accepted['receipt']['next_step']['kind'], 'expiry')
        self.assertEqual(picking.move_line_ids.qty_done, 5)
        self.assertEqual(self.source_stock(), 10)
        declined = self.exact(picking, immediate, {'kind': 'expiry', 'proceed': False})
        result = picking.qorlia_validation_paged_save(declined)
        self.assertTrue(result['receipt']['terminal'])
        self.assertEqual(result['receipt']['state_after'], 'assigned')
        self.assertEqual((picking.move_line_ids.qty_done, self.source_stock()), (5, 10))
        self.lot.expiration_date = '2027-01-01 00:00:00'
        partial = self.prepared(2)
        start = self.exact(partial)
        partial.qorlia_validation_paged_save(start)
        finish = self.exact(partial, start, {'kind': 'backorder', 'selected': True})
        partial.qorlia_validation_paged_save(finish)
        self.assert_delivered(partial, 2)
        self.assertEqual(len(self.env['stock.picking'].search([('backorder_id', '=', partial.id)])), 1)

    def test_receipt_creates_one_priced_batch_and_valuation_and_recovers_real_references(self):
        picking = self.picking(self.in_type)
        picking.action_confirm()
        picking.action_assign()
        picking.move_ids.group_id = self.env['procurement.group'].create({'name': 'QorliaQA Paged receipt',
            'sale_id': self.order.id, 'partner_id': self.customer.id})
        picking.move_line_ids.write({'qty_done': 5, 'lot_id': False, 'lot_name': 'QorliaQA Paged new batch',
            'expiration_date': '2027-02-01 00:00:00', 'cost_price': 2.5, 'sale_price': 5, 'mrp': 7})
        opening = self.exact(picking)
        picking.qorlia_validation_paged_save(opening)
        finish = self.exact(picking, opening, {'kind': 'receipt', 'confirm': True})
        self.assertFalse(self.env['stock.lot'].search([('name', '=', 'QorliaQA Paged new batch')]))
        accepted = picking.qorlia_validation_paged_save(finish)
        batch = picking.move_line_ids.lot_id
        self.assertEqual((batch.cost_price, batch.sale_price, batch.mrp), (2.5, 5, 7))
        self.assertEqual(self.source_stock(), 15)
        self.assertEqual(self.sale_line.qty_delivered, 0)
        references = picking.qorlia_validation_paged_reference_page(finish)
        self.assertTrue(any(row['model'] == 'stock.lot' and row['id'] == batch.id for row in references['rows']))
        self.assertEqual(accepted, picking.qorlia_validation_paged_save(finish))
        self.assertEqual(self.env['stock.lot'].search_count([('name', '=', batch.name)]), 1)

    def test_automatic_accounting_saves_one_balanced_posted_entry_with_analytics(self):
        _accounts, journal = self.automatic_valuation()
        picking = self.prepared(5).with_user(self.env.user)
        request = self.exact(picking)
        result = picking.qorlia_validation_paged_save(request)
        self.assertTrue(result['receipt']['terminal'])
        layer = self.env['stock.valuation.layer'].search([('stock_move_id', 'in', picking.move_ids.ids)])
        entry = layer.account_move_id
        self.assertEqual((len(entry), entry.state, entry.journal_id), (1, 'posted', journal))
        self.assertEqual(sum(entry.line_ids.mapped('balance')), 0)
        self.assertTrue(all(entry.line_ids.mapped('analytic_distribution')))
        self.assertTrue(entry.line_ids.analytic_line_ids)
        self.assertEqual(result, picking.qorlia_validation_paged_save(request))
        self.assertEqual(self.env['stock.valuation.layer'].search([('stock_move_id', 'in', picking.move_ids.ids)]), layer)

    def test_complete_proof_stale_configuration_and_changed_actual_effects_cannot_save(self):
        picking = self.prepared(5)
        request = self.exact(picking)
        with self.assertRaises(UserError):
            picking.qorlia_validation_paged_save(dict(request, review_complete_token='0' * 64))
        original = type(picking)._qorlia_validation_paged_native
        calls = []
        def unexpected(records, data, action):
            calls.append(1)
            native = original(records, data, action)
            if len(calls) == 2:
                records.origin = 'QorliaQA unexpected write'
                native = (*native[:2], 'assigned', *native[3:])
            return native
        with patch.object(type(picking), '_qorlia_validation_paged_native', unexpected):
            with self.assertRaises(UserError):
                picking.qorlia_validation_paged_save(request)
        self.assertEqual((self.source_stock(), self.sale_line.qty_delivered), (10, 0))
        self.assertFalse(self.receipts(picking))
        self.assertNotEqual(picking.origin, 'QorliaQA unexpected write')
        self.lot.expiration_date = fields.Datetime.now() - timedelta(days=1)
        with self.assertRaises(UserError):
            picking.qorlia_validation_paged_save(request)

    def test_stop_opening_is_exact_idempotent_and_never_applies_late_save(self):
        picking = self.prepared(5)
        request = self.exact(picking)
        before = picking._qorlia_paged_stop_stamp(picking._qorlia_validation_paged_tables(), 'qorlia_validation_receipts')
        stopped = picking.qorlia_validation_paged_stop(request)
        self.assertTrue(stopped['stopped'])
        self.assertFalse(stopped['accepted'])
        self.assertFalse(stopped['receipt'])
        self.assertEqual(stopped, picking.qorlia_validation_paged_stop(request))
        self.assertEqual(stopped, picking.qorlia_validation_paged_status(request))
        self.assertEqual(before, picking._qorlia_paged_stop_stamp(picking._qorlia_validation_paged_tables(), 'qorlia_validation_receipts'))
        with self.assertRaises(UserError):
            picking.qorlia_validation_paged_save(request)
        with self.assertRaises(ValidationError):
            picking.qorlia_validation_paged_stop(dict(request, review_version='0' * 64))
        self.assertEqual(self.source_stock(), 10)

    def test_stop_continuation_retains_the_prior_prompt_and_all_accepted_preparation(self):
        self.lot.expiration_date = fields.Datetime.now() - timedelta(days=1)
        picking = self.prepared()
        opening = self.exact(picking)
        picking.qorlia_validation_paged_save(opening)
        immediate = self.exact(picking, opening, {'kind': 'immediate', 'selected': True})
        picking.qorlia_validation_paged_save(immediate)
        child = self.exact(picking, immediate, {'kind': 'expiry', 'proceed': False})
        stopped = picking.qorlia_validation_paged_stop(child)
        self.assertTrue(stopped['stopped'])
        self.assertFalse(stopped['accepted'])
        self.assertEqual(stopped['receipt']['request_key'], immediate['request_key'])
        self.assertEqual(stopped['receipt']['next_step']['kind'], 'expiry')
        self.assertEqual((picking.move_line_ids.qty_done, self.source_stock()), (5, 10))
        prompt = picking.qorlia_validation_paged_prompt_page(child)
        refs = picking.qorlia_validation_paged_reference_page(child)
        self.assertEqual(prompt['receipt_key'], immediate['request_key'])
        self.assertEqual(refs['receipt_key'], immediate['request_key'])
        self.assertFalse(self.receipts(picking)[immediate['request_key']].get('consumed_by'))
        with self.assertRaises(UserError):
            picking.qorlia_validation_paged_save(child)
        replacement = self.exact(picking, immediate, {'kind': 'expiry', 'proceed': False})
        result = picking.qorlia_validation_paged_save(replacement)
        self.assertTrue(result['receipt']['terminal'])
        self.assertEqual(result['receipt']['state_after'], 'assigned')

    def test_saved_prompts_cannot_be_consumed_twice_or_recreated(self):
        picking = self.prepared()
        opening = self.exact(picking)
        picking.qorlia_validation_paged_save(opening)
        child = self.exact(picking, opening, {'kind': 'immediate', 'selected': False})
        picking.qorlia_validation_paged_save(child)
        with self.assertRaises(UserError):
            self.exact(picking, opening, {'kind': 'immediate', 'selected': False})
        previous = picking.qorlia_validation_paged_status(opening)
        self.assertTrue(previous['accepted'])
        self.assertFalse(previous['receipt']['terminal'])
        self.assertTrue(previous['receipt']['continuation_reason'])
        with self.assertRaises(UserError):
            picking.qorlia_validation_paged_prompt_page(opening)
        other = self.prepared()
        missing = self.exact(other)
        other.qorlia_validation_paged_save(missing)
        receipt = self.receipts(other)[missing['request_key']]
        wizard = self.env[receipt['next_action']['res_model']].browse(receipt['next_action']['res_id'])
        wizard.immediate_transfer_line_ids.unlink()
        wizard.unlink()
        status = other.qorlia_validation_paged_status(missing)
        self.assertTrue(status['accepted'])
        self.assertFalse(status['receipt']['next_step'])
        self.assertTrue(status['receipt']['continuation_reason'])

    def test_legacy_parent_can_be_continued_explicitly_but_payloads_are_never_converted(self):
        picking = self.prepared()
        legacy = review_contract.StockValidationPagedReviewTest.request(self, picking)
        picking.qorlia_validation_step_save(legacy)
        request = self.exact(picking, legacy, {'kind': 'immediate', 'selected': False})
        result = picking.qorlia_validation_paged_save(request)
        self.assertTrue(result['receipt']['terminal'])
        with self.assertRaises(ValidationError):
            picking.qorlia_validation_step_save(request)
        with self.assertRaises(ValidationError):
            picking.qorlia_validation_paged_save(legacy)
        self.assertEqual(self.receipts(picking)[legacy['request_key']]['consumed_by'], request['request_key'])

    def test_author_role_context_bounds_and_wrong_request_family_reject(self):
        picking = self.prepared()
        request = self.exact(picking)
        picking.qorlia_validation_paged_save(request)
        for name in ('save', 'status', 'stop', 'prompt_page', 'reference_page'):
            method = 'qorlia_validation_paged_' + name
            with self.assertRaises(ValidationError):
                getattr(picking.with_user(self.env.user), method)(request)
            with self.assertRaises(AccessError):
                getattr(picking.with_user(self.env.ref('base.public_user')), method)(request)
            for changed in ({'context': {}}, {'order_id': True}, {'review_complete_token': False}, {'unknown': True}):
                with self.assertRaises(ValidationError):
                    getattr(picking, method)(dict(request, **changed))
        for name in ('prompt_page', 'reference_page'):
            for options in ({'after': True}, {'after': -1}, {'after': 1}, {'limit': 101}, {'limit': True}):
                with self.assertRaises(ValidationError):
                    getattr(picking, 'qorlia_validation_paged_' + name)(request, **options)

    def test_reference_pages_are_snapshot_bound_and_unreadable_labels_stay_private(self):
        picking = self.prepared(5)
        request = self.exact(picking)
        picking.qorlia_validation_paged_save(request)
        first = picking.qorlia_validation_paged_reference_page(request, limit=1)
        self.assertTrue(first['rows'])
        for row in first['rows']:
            if not row['available']:
                self.assertFalse(row['name'])
                self.assertFalse(row['id'])
        with self.assertRaises(UserError):
            picking.qorlia_validation_paged_reference_page(request, version='0' * 64)
        for method in ('prompt_page', 'reference_page'):
            with self.assertRaises(ValidationError):
                getattr(picking, 'qorlia_validation_paged_' + method)(dict(request, review_complete_token='0' * 64))

    def test_stop_side_effect_or_deferred_callback_rolls_back_the_marker(self):
        picking = self.prepared(5)
        request = self.exact(picking)
        original = type(picking)._qorlia_validation_record_receipt
        cr = self.env.cr
        hooks = {name: (getattr(cr, name), list(getattr(cr, name)._funcs), copy.deepcopy(getattr(cr, name).data))
            for name in ('precommit', 'postcommit', 'prerollback', 'postrollback')}
        def unsafe(records, receipts):
            original(records, receipts)
            records.origin = 'QorliaQA unexpected stop'
            cr.postcommit.add(lambda: None)
        with patch.object(type(picking), '_qorlia_validation_record_receipt', unsafe):
            with self.assertRaises(UserError):
                picking.qorlia_validation_paged_stop(request)
        self.assertFalse(self.receipts(picking))
        self.assertNotEqual(picking.origin, 'QorliaQA unexpected stop')
        for name, (callbacks, functions, values) in hooks.items():
            self.assertIs(getattr(cr, name), callbacks)
            self.assertEqual(list(callbacks._funcs), functions)
            self.assertEqual(callbacks.data, values)

    def test_stop_response_cannot_hide_a_late_native_side_effect(self):
        picking = self.prepared(5)
        request = self.exact(picking)
        original = type(picking).qorlia_validation_paged_status
        def unsafe_status(records, payload):
            response = original(records, payload)
            records.browse(payload['transfer_id']).origin = 'QorliaQA late stop response'
            return response
        with patch.object(type(picking), 'qorlia_validation_paged_status', unsafe_status):
            with self.assertRaises(UserError):
                picking.qorlia_validation_paged_stop(request)
        self.assertFalse(self.receipts(picking))
        self.assertNotEqual(picking.origin, 'QorliaQA late stop response')
