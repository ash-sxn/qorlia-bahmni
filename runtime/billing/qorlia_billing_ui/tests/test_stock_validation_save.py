# SPDX-License-Identifier: LGPL-3.0-or-later
# Copyright 2026 Qorlia contributors.
import copy
from datetime import datetime, timedelta
import uuid
from unittest.mock import patch

from odoo import fields
from odoo.exceptions import AccessError, UserError, ValidationError
from odoo.tests import TransactionCase, tagged

from . import test_stock_validation_contract as native_contract
from . import test_stock_validation_preview as preview_contract


@tagged('post_install', '-at_install')
class StockValidationSaveTest(native_contract.StockValidationFixture, TransactionCase):
    prepared = preview_contract.StockValidationPreviewTest.prepared
    load = preview_contract.StockValidationPreviewTest.load
    preview = preview_contract.StockValidationPreviewTest.preview
    automatic_valuation = native_contract.StockValidationContractTest.automatic_valuation

    def request(self, picking, decisions=None):
        review = self.preview(picking, decisions)
        self.assertTrue(review['terminal'])
        self.assertTrue(review['write_ready'])
        return {key: copy.deepcopy(review[key]) for key in ('order_id', 'transfer_id', 'version', 'decisions', 'review_version')} | {
            'request_key': str(uuid.uuid4())}

    def receipts(self, picking):
        self.env.cr.execute('SELECT qorlia_validation_receipts FROM stock_picking WHERE id = %s', [picking.id])
        return self.env.cr.fetchone()[0] or {}

    def test_full_stock_user_save_status_and_identical_retry_do_not_duplicate(self):
        picking = self.prepared(5)
        request = self.request(picking)
        before = picking.qorlia_validation_status(request)
        self.assertFalse(before['accepted'])
        accepted = picking.qorlia_validation_save(request)
        self.assertTrue(accepted['accepted'])
        self.assertEqual(accepted['state_after'], 'done')
        self.assert_delivered(picking, 5)
        counts = {name: self.env[name].search_count([]) for name in ('stock.valuation.layer', 'stock.picking', 'mail.message')}
        self.assertEqual(accepted, picking.qorlia_validation_save(request))
        self.assertEqual(accepted, picking.qorlia_validation_status(request))
        self.assertEqual(counts, {name: self.env[name].search_count([]) for name in counts})
        self.assertEqual(len(self.receipts(picking)), 1)
        valuation = [row for row in accepted['references'].values() if row['model'] == 'stock.valuation.layer']
        self.assertTrue(valuation)
        self.assertTrue(all(row == {'model': 'stock.valuation.layer', 'id': False, 'name': False, 'available': False} for row in valuation))

    def test_native_immediate_decision_is_replayed_for_the_save(self):
        picking = self.prepared()
        request = self.request(picking, [{'kind': 'immediate', 'selected': True}])
        self.assertEqual(picking.move_line_ids.qty_done, 0)
        accepted = picking.qorlia_validation_save(request)
        self.assertTrue(accepted['accepted'])
        self.assert_delivered(picking, 5)

    def test_backorder_is_created_once_with_its_actual_saved_reference(self):
        picking = self.prepared(2)
        request = self.request(picking, [{'kind': 'backorder', 'selected': True}])
        accepted = picking.qorlia_validation_save(request)
        self.assert_delivered(picking, 2)
        backorder = self.env['stock.picking'].search([('backorder_id', '=', picking.id)])
        self.assertEqual(len(backorder), 1)
        self.assertEqual(sum(backorder.move_ids.mapped('product_uom_qty')), 3)
        self.assertTrue(any(row['id'] == backorder.id and row['model'] == 'stock.picking' for row in accepted['references'].values()))
        self.assertEqual(picking.qorlia_validation_save(request), accepted)
        self.assertEqual(len(self.env['stock.picking'].search([('backorder_id', '=', picking.id)])), 1)

    def test_cancel_remaining_demand_does_not_create_backorder(self):
        picking = self.prepared(2)
        request = self.request(picking, [{'kind': 'backorder', 'selected': False}])
        self.assertTrue(picking.qorlia_validation_save(request)['accepted'])
        self.assert_delivered(picking, 2)
        self.assertFalse(self.env['stock.picking'].search([('backorder_id', '=', picking.id)]))

    def test_declined_expiry_acceptance_reports_preparation_not_delivery(self):
        self.lot.expiration_date = fields.Datetime.now() - timedelta(days=1)
        picking = self.prepared()
        request = self.request(picking, [{'kind': 'immediate', 'selected': True}, {'kind': 'expiry', 'proceed': False}])
        result = picking.qorlia_validation_save(request)
        self.assertTrue(result['accepted'])
        self.assertEqual(result['state_after'], 'assigned')
        self.assertEqual(picking.move_line_ids.qty_done, 5)
        self.assertEqual(self.source_stock(), 10)
        self.assertEqual(self.sale_line.qty_delivered, 0)
        self.assertEqual(picking.qorlia_validation_save(request), result)

    def test_automatic_valuation_posts_one_balanced_journal_and_native_analytics(self):
        self.automatic_valuation()
        picking = self.prepared(5).with_user(self.env.user)
        request = self.request(picking)
        accepted = picking.qorlia_validation_save(request)
        self.assertTrue(accepted['accepted'])
        self.assert_delivered(picking, 5)
        valuation = self.env['stock.valuation.layer'].search([('stock_move_id', 'in', picking.move_ids.ids)])
        entry = valuation.account_move_id
        self.assertEqual(len(entry), 1)
        self.assertEqual(entry.state, 'posted')
        self.assertEqual(sorted(entry.line_ids.mapped('balance')), [-20, 20])
        self.assertTrue(entry.line_ids.analytic_line_ids)
        self.assertEqual(picking.qorlia_validation_save(request), accepted)
        self.assertEqual(len(valuation.account_move_id), 1)

    def test_terminal_review_is_stable_across_server_clock_changes(self):
        picking = self.prepared(5).with_user(self.env.user)
        version = self.load(picking)['version']
        with patch.object(fields.Datetime, 'now', return_value=datetime(2026, 10, 15, 14, 0)):
            first = self.preview(picking, version=version)
        with patch.object(fields.Datetime, 'now', return_value=datetime(2026, 10, 15, 14, 5)):
            second = self.preview(picking, version=version)
        def differences(left, right, path=''):
            if isinstance(left, dict) and isinstance(right, dict):
                return [item for key in set(left) | set(right) for item in differences(left.get(key), right.get(key), path + '/' + str(key))]
            if isinstance(left, list) and isinstance(right, list) and len(left) == len(right):
                return [item for index, (a, b) in enumerate(zip(left, right)) for item in differences(a, b, path + '/' + str(index))]
            return [path] if left != right else []
        self.assertFalse(differences(first, second), differences(first, second))
        self.assertEqual(first, second)
        changed = first['effects']['updated']['stock.picking'][0]
        self.assertIn('date_done', changed['assigned_on_save'])
        self.assertEqual(changed['after']['scheduled_date'], changed['before']['scheduled_date'])
        request = {key: copy.deepcopy(first[key]) for key in ('order_id', 'transfer_id', 'version', 'decisions', 'review_version')}
        request['request_key'] = str(uuid.uuid4())
        with patch.object(fields.Datetime, 'now', return_value=datetime(2026, 10, 15, 14, 10)):
            self.assertTrue(picking.qorlia_validation_save(request)['accepted'])
        self.assertEqual(picking.date_done, datetime(2026, 10, 15, 14, 10))

    def test_stale_stock_and_changed_decisions_cannot_save_the_old_review(self):
        picking = self.prepared()
        request = self.request(picking, [{'kind': 'immediate', 'selected': True}])
        changed = copy.deepcopy(request)
        changed['decisions'][0]['selected'] = False
        with self.assertRaises(UserError):
            picking.qorlia_validation_save(changed)
        self.assertFalse(self.receipts(picking))
        self.env['stock.quant']._update_available_quantity(self.product, self.warehouse.lot_stock_id, 1, lot_id=self.lot)
        with self.assertRaises(UserError):
            picking.qorlia_validation_save(request)
        self.assertEqual(self.sale_line.qty_delivered, 0)
        self.assertFalse(self.receipts(picking))

    def test_receipt_identity_rejects_altered_request_and_other_author(self):
        picking = self.prepared(5)
        request = self.request(picking)
        picking.qorlia_validation_save(request)
        changed = dict(request, review_version='0' * 64)
        with self.assertRaises(ValidationError):
            picking.qorlia_validation_status(changed)
        with self.assertRaises(ValidationError):
            picking.with_user(self.env.user).qorlia_validation_status(request)
        self.assertEqual(len(self.receipts(picking)), 1)

    def test_receipt_storage_is_not_generic_client_readable_or_writable(self):
        picking = self.prepared(5)
        with self.assertRaises(AccessError):
            picking.read(['qorlia_validation_receipts'])
        for account in (picking, picking.with_user(self.env.user)):
            with self.assertRaises(AccessError):
                account.write({'qorlia_validation_receipts': {'forged': {}}})
            with self.assertRaises(AccessError):
                account._qorlia_validation_record_receipt({'forged': {}})
        with self.assertRaises(AccessError):
            self.env['stock.picking'].with_context(default_qorlia_validation_receipts={}).create({})

    def test_nonterminal_or_malformed_requests_are_rejected_before_saving(self):
        picking = self.prepared()
        review = self.preview(picking)
        self.assertFalse(review['terminal'])
        self.assertFalse(review['review_version'])
        self.assertFalse(review['write_ready'])
        request = self.request(picking, [{'kind': 'immediate', 'selected': True}])
        for changed in (dict(request, arbitrary_context={}), dict(request, request_key=False),
                dict(request, order_id=True), dict(request, decisions=[{'kind': 'sms', 'selected': True}])):
            with self.assertRaises(ValidationError):
                picking.qorlia_validation_save(changed)
        self.assertFalse(self.receipts(picking))
        self.assertEqual(self.source_stock(), 10)

    def test_private_actual_effect_change_rejects_and_rolls_back_movement(self):
        picking = self.prepared(5)
        request = self.request(picking)
        original = type(picking)._qorlia_validation_native
        calls = []
        hooks = {name: getattr(self.env.cr, name) for name in ('precommit', 'postcommit', 'prerollback', 'postrollback')}

        def changed_private(record, decisions):
            result = original(record, decisions)
            calls.append(True)
            if len(calls) == 2:
                effects, private, state, step, references = copy.deepcopy(result)
                private['stock.valuation.layer'][0]['after']['value'] += 1
                record.env.cr.postcommit.add(lambda: self.fail('A rejected validation callback escaped.'))
                return effects, private, state, step, references
            return result

        with patch.object(type(picking), '_qorlia_validation_native', changed_private):
            with self.assertRaisesRegex(UserError, 'unreviewed effects'):
                picking.qorlia_validation_save(request)
        self.assertEqual(len(calls), 2)
        self.assertEqual(self.source_stock(), 10)
        self.assertEqual(self.sale_line.qty_delivered, 0)
        self.assertEqual(picking.state, 'assigned')
        self.assertFalse(self.receipts(picking))
        for name, callback in hooks.items():
            self.assertIs(getattr(self.env.cr, name), callback)

    def test_incoming_receipt_saves_exact_batch_prices_expiry_and_quantity(self):
        picking = self.picking(self.in_type).with_user(self.env.user)
        group = self.env['procurement.group'].create({'name': 'QorliaQA Validation saved receipt group',
            'sale_id': self.order.id, 'partner_id': self.customer.id})
        picking.move_ids.group_id = group
        picking.action_confirm()
        picking.action_assign()
        picking.move_line_ids.write({'qty_done': 5, 'lot_name': 'QorliaQA Saved native receipt batch',
            'cost_price': 2.5, 'sale_price': 5, 'mrp': 7, 'expiration_date': '2027-02-01 00:00:00'})
        request = self.request(picking, [{'kind': 'receipt', 'confirm': True}])
        accepted = picking.qorlia_validation_save(request)
        self.assertTrue(accepted['accepted'])
        self.assertEqual(picking.state, 'done')
        self.assertEqual(self.source_stock(), 15)
        lot = picking.move_line_ids.lot_id
        self.assertEqual(lot.name, 'QorliaQA Saved native receipt batch')
        self.assertEqual((lot.cost_price, lot.sale_price, lot.mrp), (2.5, 5, 7))
        self.assertEqual(lot.expiration_date, fields.Datetime.to_datetime('2027-02-01 00:00:00'))
        self.assertEqual(picking.qorlia_validation_save(request), accepted)

    def test_stock_user_can_validate_automatic_value_without_financial_read_access(self):
        self.automatic_valuation()
        picking = self.prepared(5)
        request = self.request(picking)
        result = picking.qorlia_validation_save(request)
        self.assertTrue(result['accepted'])
        self.assert_delivered(picking, 5)
        private_journals = [row for row in result['references'].values() if row['model'] == 'account.move']
        self.assertEqual(len(private_journals), 1)
        self.assertFalse(private_journals[0]['available'])
        self.assertFalse(private_journals[0]['id'])
        self.assertFalse(private_journals[0]['name'])

    def test_automatic_review_normalizes_generated_journal_reference_not_its_amounts(self):
        self.automatic_valuation()
        picking = self.prepared(5).with_user(self.env.user)
        version = self.load(picking)['version']
        with patch.object(fields.Datetime, 'now', return_value=datetime(2026, 10, 15, 14, 0)):
            first = self.preview(picking, version=version)
        with patch.object(fields.Datetime, 'now', return_value=datetime(2026, 10, 15, 14, 5)):
            second = self.preview(picking, version=version)
        self.assertEqual(first, second)
        entry = first['effects']['created']['account.move'][0]
        self.assertIn('name', entry['assigned_on_save'])
        self.assertFalse(entry['values']['name'])
        self.assertEqual(sorted(row['values']['balance'] for row in first['effects']['created']['account.move.line']), [-20, 20])

    def test_backorder_keeps_native_scheduling_date_in_its_review(self):
        picking = self.prepared(2)
        planned = datetime(2026, 12, 1, 10, 0)
        picking.move_ids.date = planned
        request = self.request(picking, [{'kind': 'backorder', 'selected': True}])
        review = self.preview(picking, request['decisions'], request['version'])
        move = review['effects']['created']['stock.move'][0]
        self.assertEqual(fields.Datetime.to_datetime(move['values']['date'].replace('T', ' ')), planned)
        self.assertNotIn('date', move['assigned_on_save'])
        picking.qorlia_validation_save(request)
        backorder = self.env['stock.picking'].search([('backorder_id', '=', picking.id)])
        self.assertEqual(backorder.move_ids.date, planned)

    def test_unreviewed_completion_timestamp_outside_native_execution_window_rejects(self):
        picking = self.prepared(5)
        request = self.request(picking)
        original = type(picking).button_validate
        calls = []

        def change_timestamp(record):
            result = original(record)
            calls.append(True)
            if len(calls) == 2:
                record.date_done = datetime(2030, 1, 1)
            return result

        with patch.object(type(picking), 'button_validate', change_timestamp):
            with self.assertRaisesRegex(UserError, 'unreviewed effects'):
                picking.qorlia_validation_save(request)
        self.assertFalse(self.receipts(picking))
        self.assertEqual(self.source_stock(), 10)
        self.assertEqual(picking.state, 'assigned')
