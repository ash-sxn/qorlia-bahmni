# SPDX-License-Identifier: LGPL-3.0-or-later
# Copyright 2026 Qorlia contributors.
import copy
import uuid
from unittest.mock import patch

from odoo.exceptions import AccessError, UserError, ValidationError
from odoo.tests import TransactionCase, tagged

from .test_stock_validation_contract import StockValidationFixture
from . import test_stock_return_paged as review_contract
from . import test_stock_return_save as legacy_contract


@tagged('post_install', '-at_install')
class StockReturnPagedWriteTest(StockValidationFixture, TransactionCase):
    prepared = review_contract.StockReturnPagedTest.prepared
    delivered = review_contract.StockReturnPagedTest.delivered
    selection = review_contract.StockReturnPagedTest.selection
    pages = review_contract.StockReturnPagedTest.pages
    large_delivered = review_contract.StockReturnPagedTest.large_delivered
    receipts = legacy_contract.StockReturnSaveTest.receipts

    def request(self, picking, lines=None):
        data = self.selection(picking, lines)
        last = self.pages(picking, data, 100)[-1]
        return dict(data, review_version=last['review_version'],
            review_complete_token=last['review_complete_token'], request_key=str(uuid.uuid4()))

    def references(self, picking, request, limit=50):
        rows, after, version = [], 0, False
        while True:
            page = picking.qorlia_return_paged_references(request, after, version, limit)
            self.assertLessEqual(len(page['rows']), limit)
            rows.extend(page['rows'])
            if page['next_after'] is False:
                return rows
            after, version = page['next_after'], page['version']

    def test_exact_creation_recovers_once_without_receiving_stock_or_refunding_money(self):
        picking = self.delivered()
        request = self.request(picking)
        unknown = picking.qorlia_return_paged_status(request)
        self.assertFalse(unknown['accepted'])
        self.assertFalse(unknown['stopped'])
        self.assertFalse(unknown['return_transfer'])
        self.assertFalse(unknown['reference_count'])
        finance = {name: self.env[name].search_count([]) for name in ('account.move', 'account.payment', 'stock.valuation.layer')}
        result = picking.qorlia_return_paged_save(request)
        self.assertTrue(result['accepted'])
        self.assertFalse(result['stopped'])
        returned = picking.browse(result['return_transfer']['id'])
        self.assertEqual(returned.move_ids.origin_returned_move_id, picking.move_ids)
        self.assertEqual(returned.move_ids.product_uom_qty, 2)
        self.assertNotIn(returned.state, ('done', 'cancel'))
        self.assertEqual((self.source_stock(), self.sale_line.qty_delivered), (5, 5))
        self.assertEqual(finance, {name: self.env[name].search_count([]) for name in finance})
        self.assertEqual(result, picking.qorlia_return_paged_status(request))
        self.assertEqual(result, picking.qorlia_return_paged_save(request))
        self.assertEqual(result, picking.qorlia_return_paged_stop(request))
        self.assertEqual(result['reference_count'], len(self.references(picking, request, 1)))
        self.assertEqual(len(self.receipts(picking)), 1)

    def test_pending_stop_is_exact_idempotent_and_changes_no_other_guarded_state(self):
        picking = self.delivered()
        request = self.request(picking)
        tables = picking._qorlia_return_paged_tables()
        before = picking._qorlia_paged_stop_stamp(tables, 'qorlia_validation_receipts')
        result = picking.qorlia_return_paged_stop(request)
        self.assertTrue(result['stopped'])
        self.assertFalse(result['accepted'])
        self.assertFalse(result['return_transfer'])
        self.assertEqual(before, picking._qorlia_paged_stop_stamp(tables, 'qorlia_validation_receipts'))
        self.assertEqual(result, picking.qorlia_return_paged_stop(request))
        self.assertEqual(result, picking.qorlia_return_paged_status(request))
        with self.assertRaisesRegex(UserError, 'stopped'):
            picking.qorlia_return_paged_save(request)
        with self.assertRaises(UserError):
            picking.qorlia_return_paged_references(request)
        self.assertNotIn(request['request_key'], self.receipts(picking))
        self.assertIn('stop:%s:%s' % (self.user.id, request['request_key']), self.receipts(picking))

    def test_incomplete_or_foreign_purpose_proof_cannot_create_a_return(self):
        picking = self.delivered()
        data = self.selection(picking)
        first = picking.qorlia_return_paged_review(data, limit=1)
        request = dict(data, review_version=first['review_version'],
            review_complete_token=first['continuation_token'], request_key=str(uuid.uuid4()))
        with self.assertRaisesRegex(UserError, 'Complete the current'):
            picking.qorlia_return_paged_save(request)
        request['review_complete_token'] = data['version']
        with self.assertRaises(UserError):
            picking.qorlia_return_paged_save(request)
        self.assertFalse(self.receipts(picking))

    def test_malformed_request_is_rejected_without_stripping_extra_fields_or_old_limits(self):
        picking = self.delivered()
        request = self.request(picking)
        for change in ({'context': {}}, {'complete': True}, {'request_key': False}, {'request_key': 'bad'},
                {'review_complete_token': False}, {'location_id': True},
                {'lines': [dict(request['lines'][0], to_refund=False)]},
                {'lines': [{'move_id': picking.move_ids.id, 'quantity': 10 ** 1000}]}):
            for method in ('save', 'status', 'stop', 'references'):
                with self.assertRaises(ValidationError):
                    getattr(picking, 'qorlia_return_paged_' + method)(dict(request, **change))
        self.assertFalse(self.receipts(picking))

    def test_changed_selection_and_inventory_cannot_save_a_stale_review(self):
        picking = self.delivered()
        request = self.request(picking)
        with self.assertRaises(UserError):
            picking.qorlia_return_paged_save(dict(request, lines=[dict(request['lines'][0], quantity=3)]))
        self.env['stock.quant']._update_available_quantity(self.product, picking.location_dest_id, 1, lot_id=self.lot)
        with self.assertRaises(UserError):
            picking.qorlia_return_paged_save(request)
        self.assertFalse(self.receipts(picking))

    def test_accepted_nonce_is_bound_to_request_author_companies_and_protocol(self):
        picking = self.delivered()
        request = self.request(picking)
        picking.qorlia_return_paged_save(request)
        for change in ({'review_version': '0' * 64}, {'review_complete_token': '0' * 64},
                {'lines': [dict(request['lines'][0], quantity=3)]}):
            with self.assertRaises(ValidationError):
                picking.qorlia_return_paged_status(dict(request, **change))
        with self.assertRaises(ValidationError):
            picking.with_user(self.env.user).qorlia_return_paged_status(request)
        legacy = {key: value for key, value in request.items() if key != 'review_complete_token'}
        with self.assertRaises(ValidationError):
            picking.qorlia_return_status(legacy)
        with self.assertRaises(AccessError):
            picking.write({'qorlia_validation_receipts': {'forged': {}}})

    def test_legacy_receipt_cannot_be_converted_to_new_return_protocol(self):
        picking = self.delivered()
        legacy = legacy_contract.StockReturnSaveTest.request(self, picking)
        picking.qorlia_return_save(legacy)
        request = dict(self.request(picking), request_key=legacy['request_key'])
        with self.assertRaises(ValidationError):
            picking.qorlia_return_paged_status(request)
        self.assertTrue(picking.qorlia_return_status(legacy)['accepted'])

    def test_unknown_and_accepted_recovery_do_not_depend_on_editable_form_or_legacy_graph(self):
        picking = self.delivered()
        request = self.request(picking)
        with patch.object(type(picking), '_qorlia_return_paged_source', side_effect=AssertionError('Editable load used')):
            self.assertFalse(picking.qorlia_return_paged_status(request)['accepted'])
        picking.qorlia_return_paged_save(request)
        with patch.object(type(picking), '_qorlia_return_paged_source', side_effect=AssertionError('Editable load used')):
            self.assertTrue(picking.qorlia_return_paged_status(request)['accepted'])
            self.assertTrue(self.references(picking, request))

    def test_reference_pages_pin_labels_and_hide_unreadable_return_records(self):
        picking = self.delivered()
        request = self.request(picking)
        result = picking.qorlia_return_paged_save(request)
        page = picking.qorlia_return_paged_references(request, limit=1)
        returned = picking.browse(result['return_transfer']['id'])
        returned.name = 'QorliaQA Changed saved return label'
        with self.assertRaises(UserError):
            picking.qorlia_return_paged_references(request, page['next_after'], page['version'], 1)
        self.env['ir.rule'].create({'name': 'QorliaQA Hidden returned child',
            'model_id': self.env['ir.model']._get_id('stock.picking'),
            'domain_force': "[('id', '!=', %d)]" % returned.id})
        # Complete native order scope denies an inaccessible linked transfer, not a partial recovery.
        with self.assertRaises(AccessError):
            picking.qorlia_return_paged_status(request)

    def test_actual_effect_change_rolls_back_return_and_every_callback_queue(self):
        picking = self.delivered()
        request = self.request(picking)
        original = type(picking)._qorlia_return_paged_native
        count = self.env['stock.picking'].search_count([])
        hooks = {name: (getattr(self.env.cr, name), list(getattr(self.env.cr, name)._funcs),
            copy.deepcopy(getattr(self.env.cr, name).data))
            for name in ('precommit', 'postcommit', 'prerollback', 'postrollback')}
        calls = []
        def changed(record, form):
            result = original(record, form)
            calls.append(True)
            if len(calls) == 2:
                result = copy.deepcopy(result)
                result[0]['labels']['unreviewed'] = 'Unreviewed effect'
                record.env.cr.postcommit.add(lambda: self.fail('Callback escaped rejected return.'))
            return result
        with patch.object(type(picking), '_qorlia_return_paged_native', changed):
            with self.assertRaisesRegex(UserError, 'unreviewed effects'):
                picking.qorlia_return_paged_save(request)
        self.assertEqual(len(calls), 2)
        self.assertEqual(self.env['stock.picking'].search_count([]), count)
        self.assertFalse(self.receipts(picking))
        for name, (callbacks, functions, data) in hooks.items():
            self.assertIs(getattr(self.env.cr, name), callbacks)
            self.assertEqual(list(callbacks._funcs), functions)
            self.assertEqual(callbacks.data, data)

    def test_lost_receipt_response_rolls_back_creation_before_any_retry(self):
        picking = self.delivered()
        request = self.request(picking)
        count = self.env['stock.picking'].search_count([])
        with patch.object(type(picking), 'qorlia_return_paged_status', side_effect=UserError('Response rejected')):
            with self.assertRaises(UserError):
                picking.qorlia_return_paged_save(request)
        self.assertEqual(self.env['stock.picking'].search_count([]), count)
        self.assertFalse(self.receipts(picking))
        self.assertTrue(picking.qorlia_return_paged_save(request)['accepted'])

    def test_stop_rejects_unreviewed_configuration_side_effects(self):
        picking = self.delivered()
        request = self.request(picking)
        original = type(picking)._qorlia_validation_record_receipt
        before = self.lot.name
        def changed(record, receipts):
            result = original(record, receipts)
            self.lot.name = 'QorliaQA Unreviewed stop write'
            return result
        with patch.object(type(picking), '_qorlia_validation_record_receipt', changed):
            with self.assertRaisesRegex(UserError, 'unreviewed state'):
                picking.qorlia_return_paged_stop(request)
        self.assertEqual(self.lot.name, before)
        self.assertFalse(self.receipts(picking))

    def test_stock_role_and_parent_write_rule_remain_required_for_stop_and_save(self):
        picking = self.delivered()
        request = self.request(picking)
        with self.assertRaises(AccessError):
            picking.with_user(self.env.ref('base.public_user')).qorlia_return_paged_status(request)
        self.env['ir.rule'].create({'name': 'QorliaQA Block return parent write',
            'model_id': self.env['ir.model']._get_id('stock.picking'),
            'domain_force': "[('id', '!=', %d)]" % picking.id,
            'perm_read': False, 'perm_write': True, 'perm_create': False, 'perm_unlink': False})
        self.assertFalse(picking.qorlia_return_paged_status(request)['accepted'])
        for method in ('save', 'stop'):
            with self.assertRaises(AccessError):
                getattr(picking, 'qorlia_return_paged_' + method)(request)

    def test_receipt_hook_cannot_mutate_prior_receipts_native_stock_or_deferred_work(self):
        picking = self.delivered()
        first = self.request(picking)
        picking.qorlia_return_paged_save(first)
        request = self.request(picking)
        before = copy.deepcopy(self.receipts(picking))
        count = self.env['stock.picking'].search_count([])
        original = type(picking)._qorlia_validation_record_receipt
        for mode in ('receipt', 'lot', 'callback'):
            def changed(record, receipts):
                if mode == 'receipt':
                    receipts[first['request_key']]['hash'] = '0' * 64
                result = original(record, receipts)
                if mode == 'lot':
                    self.lot.name = 'QorliaQA Unreviewed metadata effect'
                if mode == 'callback':
                    record.env.cr.postcommit.add(lambda: self.fail('Metadata callback escaped.'))
                return result
            with patch.object(type(picking), '_qorlia_validation_record_receipt', changed):
                with self.assertRaisesRegex(UserError, 'unreviewed receipt state'):
                    picking.qorlia_return_paged_save(request)
            self.assertEqual(self.receipts(picking), before)
            self.assertEqual(self.env['stock.picking'].search_count([]), count)
            self.assertTrue(picking.qorlia_return_paged_status(first)['accepted'])

    def test_reference_page_bounds_and_original_version_remain_required(self):
        picking = self.delivered()
        request = self.request(picking)
        picking.qorlia_return_paged_save(request)
        for kwargs in ({'after': -1}, {'after': True}, {'after': 1}, {'limit': 0}, {'limit': 101},
                {'version': 'bad'}, {'after': 100000, 'version': 'a' * 64}):
            with self.assertRaises(UserError if kwargs.get('version') == 'a' * 64 else ValidationError):
                picking.qorlia_return_paged_references(request, **kwargs)

    def test_all_501_positive_native_rows_create_once_and_recover_every_business_reference(self):
        picking, _original = self.large_delivered()
        lines = [{'move_id': identifier, 'quantity': 1} for identifier in sorted(picking.move_ids.ids)]
        request = self.request(picking, lines)
        with self.assertRaises(ValidationError):
            picking._qorlia_return_edited_form(request['location_id'], lines)
        result = picking.qorlia_return_paged_save(request)
        self.assertTrue(result['accepted'])
        returned = picking.browse(result['return_transfer']['id'])
        self.assertEqual(len(returned.move_ids), 501)
        self.assertEqual(sum(returned.move_ids.mapped('product_uom_qty')), 501)
        rows = self.references(picking, request, 100)
        self.assertEqual(result['reference_count'], len(rows))
        self.assertGreater(len(rows), 500)
        self.assertEqual(len({row['key'] for row in rows}), len(rows))
        self.assertEqual(result, picking.qorlia_return_paged_save(request))
        self.assertEqual(result, picking.qorlia_return_paged_status(request))
        self.assertEqual(self.sale_line.qty_delivered, 501)
        self.assertEqual(self.source_stock(), 0)
        self.assertNotEqual(returned.state, 'done')
        self.assertEqual(len(self.receipts(picking)), 1)
