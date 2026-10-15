# SPDX-License-Identifier: LGPL-3.0-or-later
# Copyright 2026 Qorlia contributors.
import copy
from datetime import datetime
import uuid
from unittest.mock import patch

from odoo import fields
from odoo.exceptions import AccessError, UserError, ValidationError
from odoo.tests import TransactionCase, tagged

from . import test_stock_return_contract as native_contract
from . import test_stock_validation_preview as preview_contract
from . import test_stock_validation_step as step_contract
from .test_stock_validation_contract import StockValidationFixture


@tagged('post_install', '-at_install')
class StockReturnSaveTest(StockValidationFixture, TransactionCase):
    prepared = preview_contract.StockValidationPreviewTest.prepared
    load = preview_contract.StockValidationPreviewTest.load
    delivered = native_contract.StockReturnContractTest.delivered
    automatic_valuation = native_contract.StockReturnContractTest.automatic_valuation

    def request(self, picking, quantity=2):
        loaded = picking.qorlia_return_load(self.order.id, picking.id)
        review = picking.qorlia_return_preview(self.order.id, picking.id, loaded['version'],
            loaded['form']['location'][0], [{'move_id': picking.move_ids.id, 'quantity': quantity}])
        self.assertTrue(review['write_ready'])
        return {key: copy.deepcopy(review[key]) for key in (
            'order_id', 'transfer_id', 'version', 'location_id', 'lines', 'review_version')} | {
            'request_key': str(uuid.uuid4())}

    def receipts(self, picking):
        self.env.cr.execute('SELECT qorlia_validation_receipts FROM stock_picking WHERE id = %s', [picking.id])
        return self.env.cr.fetchone()[0] or {}

    def validation_request(self, returned):
        returned.move_line_ids.write({'qty_done': 2, 'lot_id': self.lot.id})
        loaded = returned.qorlia_validation_load(self.order.id, returned.id)
        first = returned.qorlia_validation_preview(self.order.id, returned.id, loaded['version'], [])
        self.assertEqual(first['next_step']['kind'], 'receipt')
        reviewed = returned.qorlia_validation_preview(self.order.id, returned.id, loaded['version'],
            [{'kind': 'receipt', 'confirm': True}])
        self.assertTrue(reviewed['terminal'])
        self.assertEqual(reviewed['state_after'], 'done')
        self.assertEqual(returned.state, 'assigned')
        self.assertEqual(self.source_stock(), 5)
        self.assertEqual(self.sale_line.qty_delivered, 5)
        return {key: copy.deepcopy(reviewed[key]) for key in (
            'order_id', 'transfer_id', 'version', 'decisions', 'review_version')} | {
            'request_key': str(uuid.uuid4())}

    def test_created_return_completes_through_separate_validation_api_once_without_a_financial_refund(self):
        picking = self.delivered()
        request = self.request(picking)
        created = picking.qorlia_return_save(request)
        returned = picking.browse(created['return_transfer']['id'])
        finance = {name: self.env[name].search_count([]) for name in (
            'account.move', 'account.payment', 'account.partial.reconcile')}
        validation = self.validation_request(returned)
        accepted = returned.qorlia_validation_save(validation)
        self.assertTrue(accepted['accepted'])
        self.assertEqual(accepted['state_after'], 'done')
        self.assertEqual(returned.state, 'done')
        self.assertEqual(self.source_stock(), 7)
        self.assertEqual(self.sale_line.qty_delivered, 3)
        valuation = self.env['stock.valuation.layer'].search([('stock_move_id', 'in', returned.move_ids.ids)])
        self.assertEqual((valuation.quantity, valuation.value), (2, 8))
        self.assertFalse(valuation.account_move_id)
        self.assertEqual(finance, {name: self.env[name].search_count([]) for name in finance})
        count = self.env['stock.valuation.layer'].search_count([])
        self.assertEqual(returned.qorlia_validation_status(validation), accepted)
        self.assertEqual(returned.qorlia_validation_save(validation), accepted)
        recovered = picking.qorlia_return_status(request)
        self.assertTrue(recovered['accepted'])
        self.assertEqual(recovered['state_after'], created['state_after'])
        self.assertEqual(recovered['return_transfer']['id'], returned.id)
        self.assertEqual(picking.qorlia_return_save(request), recovered)
        self.assertEqual(self.env['stock.valuation.layer'].search_count([]), count)
        self.assertEqual(len(self.receipts(picking)), 1)
        self.assertEqual(len(self.receipts(returned)), 1)

    def test_completed_return_api_posts_one_native_balanced_journal_with_mandatory_analytics(self):
        self.automatic_valuation()
        picking = self.delivered().with_user(self.env.user)
        request = self.request(picking)
        returned = picking.browse(picking.qorlia_return_save(request)['return_transfer']['id'])
        count = self.env['account.move'].search_count([])
        payments = self.env['account.payment'].search_count([])
        validation = self.validation_request(returned)
        accepted = returned.qorlia_validation_save(validation)
        valuation = self.env['stock.valuation.layer'].search([('stock_move_id', 'in', returned.move_ids.ids)])
        self.assertEqual((valuation.quantity, valuation.value), (2, 8))
        entry = valuation.account_move_id
        self.assertEqual(len(entry), 1)
        self.assertEqual(entry.state, 'posted')
        self.assertEqual(sorted(entry.line_ids.mapped('balance')), [-8, 8])
        self.assertTrue(entry.line_ids.analytic_line_ids)
        self.assertEqual(self.source_stock(), 7)
        self.assertEqual(self.sale_line.qty_delivered, 3)
        self.assertEqual(returned.qorlia_validation_save(validation), accepted)
        self.assertEqual(self.env['account.move'].search_count([]), count + 1)
        self.assertEqual(self.env['account.payment'].search_count([]), payments)
        self.assertEqual(picking.qorlia_return_status(request)['return_transfer']['id'], returned.id)

    def test_return_completion_uses_reviewed_steps_and_consumes_the_receipt_prompt_once(self):
        picking = self.delivered()
        request = self.request(picking)
        created = picking.qorlia_return_save(request)
        returned = picking.browse(created['return_transfer']['id'])
        returned.move_line_ids.write({'qty_done': 2, 'lot_id': self.lot.id})
        opening = step_contract.StockValidationStepTest.request(self, returned)
        opened = returned.qorlia_validation_step_save(opening)
        self.assertFalse(opened['terminal'])
        self.assertEqual(opened['next_step']['kind'], 'receipt')
        self.assertEqual(self.source_stock(), 5)
        confirm = step_contract.StockValidationStepTest.request(self, returned, opening,
            {'kind': 'receipt', 'confirm': True})
        self.assertEqual(returned.state, 'assigned')
        accepted = returned.qorlia_validation_step_save(confirm)
        self.assertTrue(accepted['accepted'])
        self.assertTrue(accepted['terminal'])
        self.assertEqual(accepted['state_after'], 'done')
        self.assertEqual(returned.qorlia_validation_step_status(confirm), accepted)
        self.assertEqual(returned.qorlia_validation_step_save(confirm), accepted)
        receipts = self.receipts(returned)
        self.assertEqual(len(receipts), 2)
        self.assertEqual(receipts[opening['request_key']]['consumed_by'], confirm['request_key'])
        with self.assertRaises(UserError):
            returned.qorlia_validation_step_save(dict(confirm, request_key=str(uuid.uuid4())))
        valuation = self.env['stock.valuation.layer'].search([('stock_move_id', 'in', returned.move_ids.ids)])
        self.assertEqual((valuation.quantity, valuation.value), (2, 8))
        self.assertEqual(self.source_stock(), 7)
        self.assertEqual(self.sale_line.qty_delivered, 3)
        self.assertEqual(picking.qorlia_return_save(request)['return_transfer']['id'], returned.id)

    def test_cancelled_return_receipt_recovers_original_creation_without_reactivating_it(self):
        picking = self.delivered()
        request = self.request(picking)
        accepted = picking.qorlia_return_save(request)
        returned = picking.browse(accepted['return_transfer']['id'])
        returned.action_cancel()
        count = self.env['stock.picking'].search_count([])
        recovered = picking.qorlia_return_status(request)
        self.assertTrue(recovered['accepted'])
        self.assertEqual(recovered['state_after'], accepted['state_after'])
        self.assertEqual(recovered['return_transfer']['id'], returned.id)
        self.assertEqual(recovered['current']['form']['lines'][0]['quantity'], 5)
        self.assertEqual(picking.qorlia_return_save(request), recovered)
        self.assertEqual(returned.state, 'cancel')
        self.assertEqual(self.env['stock.picking'].search_count([]), count)
        self.assertEqual(self.source_stock(), 5)
        self.assertEqual(self.sale_line.qty_delivered, 5)

    def test_deleted_return_is_reported_unavailable_and_never_recreated_from_its_receipt(self):
        picking = self.delivered()
        request = self.request(picking)
        accepted = picking.qorlia_return_save(request)
        returned = picking.browse(accepted['return_transfer']['id']).with_user(self.env.user)
        removed = {key: row['model'] for key, row in accepted['references'].items()
            if row['model'] in ('stock.picking', 'stock.move', 'stock.move.line')}
        self.assertTrue(removed)
        returned.action_cancel()
        returned.unlink()
        self.env.flush_all()
        self.env.invalidate_all()
        count = self.env['stock.picking'].search_count([])
        recovered = picking.qorlia_return_status(request)
        self.assertTrue(recovered['accepted'])
        self.assertEqual(recovered['return_transfer'], {
            'model': 'stock.picking', 'id': False, 'name': False, 'available': False})
        for key, model in removed.items():
            self.assertEqual(recovered['references'][key], {
                'model': model, 'id': False, 'name': False, 'available': False})
        self.assertEqual(picking.qorlia_return_save(request), recovered)
        self.assertEqual(self.env['stock.picking'].search_count([]), count)
        self.assertEqual(len(self.receipts(picking)), 1)
        self.assertEqual(self.source_stock(), 5)

    def test_revoked_original_transfer_access_denies_status_and_retry_without_new_creation(self):
        picking = self.delivered()
        request = self.request(picking)
        picking.qorlia_return_save(request)
        count = self.env['stock.picking'].search_count([])
        self.env['ir.rule'].create({'name': 'QorliaQA Revoked original return access',
            'model_id': self.env['ir.model']._get_id('stock.picking'),
            'domain_force': "[('id', '!=', %d)]" % picking.id})
        with self.assertRaises(AccessError):
            picking.qorlia_return_status(request)
        with self.assertRaises(AccessError):
            picking.qorlia_return_save(request)
        self.assertEqual(self.env['stock.picking'].search_count([]), count)
        self.assertEqual(len(self.receipts(picking)), 1)

    def test_two_explicit_reviews_use_native_remaining_quantity_and_old_replay_creates_nothing(self):
        picking = self.delivered()
        first_request = self.request(picking, 2)
        first = picking.qorlia_return_save(first_request)
        remaining = picking.qorlia_return_load(self.order.id, picking.id)
        self.assertEqual(remaining['form']['lines'][0]['quantity'], 3)
        second_request = self.request(picking, 3)
        self.assertEqual(picking.browse(first['return_transfer']['id']).move_ids.reserved_availability, 2)
        second = picking.qorlia_return_save(second_request)
        self.assertNotEqual(first['return_transfer']['id'], second['return_transfer']['id'])
        self.assertEqual(picking.browse(first['return_transfer']['id']).move_ids.reserved_availability, 0)
        self.assertEqual(picking.browse(second['return_transfer']['id']).move_ids.reserved_availability, 3)
        self.assertEqual(second['current']['form']['lines'][0]['quantity'], 2)
        count = self.env['stock.picking'].search_count([])
        self.assertEqual(picking.qorlia_return_save(first_request)['return_transfer'], first['return_transfer'])
        self.assertEqual(picking.qorlia_return_save(second_request), second)
        self.assertEqual(self.env['stock.picking'].search_count([]), count)
        self.assertEqual(len(self.receipts(picking)), 2)
        self.assertEqual(self.source_stock(), 5)
        self.assertEqual(self.sale_line.qty_delivered, 5)

    def test_create_status_and_identical_retry_create_one_linked_return_without_receiving_stock(self):
        picking = self.delivered()
        request = self.request(picking)
        unknown = picking.qorlia_return_status(request)
        self.assertFalse(unknown['accepted'])
        self.assertFalse(unknown['return_transfer'])
        self.assertEqual(unknown['references'], {})
        accepted = picking.qorlia_return_save(request)
        self.assertTrue(accepted['accepted'])
        self.assertTrue(accepted['return_transfer']['available'])
        returned = picking.browse(accepted['return_transfer']['id'])
        self.assertEqual(returned.move_ids.origin_returned_move_id, picking.move_ids)
        self.assertEqual(returned.move_ids.product_uom_qty, 2)
        self.assertEqual(returned.sale_id, self.order)
        self.assertNotIn(returned.state, ('done', 'cancel'))
        self.assertEqual(self.source_stock(), 5)
        self.assertEqual(self.sale_line.qty_delivered, 5)
        counts = {name: self.env[name].search_count([]) for name in (
            'stock.picking', 'stock.move', 'stock.move.line', 'mail.message', 'stock.valuation.layer', 'account.move')}
        self.assertEqual(picking.qorlia_return_status(request), accepted)
        self.assertEqual(picking.qorlia_return_save(request), accepted)
        self.assertEqual(counts, {name: self.env[name].search_count([]) for name in counts})
        receipt = self.receipts(picking)[request['request_key']]
        self.assertEqual(receipt['kind'], 'return')
        self.assertEqual(receipt['author'], self.user.id)
        self.assertEqual(receipt['companies'], self.user.company_ids.ids)
        self.assertEqual(receipt['return_id'], returned.id)

    def test_review_is_stable_across_creation_clock_and_save_keeps_actual_native_dates(self):
        picking = self.delivered()
        loaded = picking.qorlia_return_load(self.order.id, picking.id)
        selection = {'order_id': self.order.id, 'transfer_id': picking.id, 'version': loaded['version'],
            'location_id': loaded['form']['location'][0], 'lines': [{'move_id': picking.move_ids.id, 'quantity': 2}]}
        with patch.object(fields.Datetime, 'now', return_value=datetime(2026, 10, 15, 14, 0)):
            first = picking.qorlia_return_preview(**selection)
        with patch.object(fields.Datetime, 'now', return_value=datetime(2026, 10, 15, 14, 5)):
            second = picking.qorlia_return_preview(**selection)
        self.assertEqual(first, second)
        self.assertIn('scheduled_date', first['effects']['created']['stock.picking'][0]['assigned_on_save'])
        self.assertIn('date', first['effects']['created']['stock.move'][0]['assigned_on_save'])
        with patch.object(fields.Datetime, 'now', return_value=datetime(2026, 10, 15, 14, 10)):
            accepted = picking.qorlia_return_save({**selection, 'review_version': first['review_version'],
                'request_key': str(uuid.uuid4())})
        returned = picking.browse(accepted['return_transfer']['id'])
        self.assertEqual(returned.move_ids.date, datetime(2026, 10, 15, 14, 10))
        self.assertEqual(returned.scheduled_date, datetime(2026, 10, 15, 14, 10))

    def test_changed_quantities_or_native_stock_cannot_reuse_a_review(self):
        picking = self.delivered()
        request = self.request(picking)
        changed = copy.deepcopy(request)
        changed['lines'][0]['quantity'] = 3
        with self.assertRaises(UserError):
            picking.qorlia_return_save(changed)
        self.env['stock.quant']._update_available_quantity(self.product, self.warehouse.lot_stock_id, 1, lot_id=self.lot)
        with self.assertRaises(UserError):
            picking.qorlia_return_save(request)
        self.assertFalse(self.receipts(picking))

    def test_malformed_requests_reject_before_native_creation(self):
        picking = self.delivered()
        request = self.request(picking)
        count = self.env['stock.picking'].search_count([])
        for changed in (dict(request, arbitrary_context={}), dict(request, order_id=True),
                dict(request, request_key=False), dict(request, location_id=False),
                dict(request, lines=[{'move_id': picking.move_ids.id, 'quantity': float('inf')}]),
                dict(request, lines=[{'move_id': picking.move_ids.id, 'quantity': 10 ** 400}]),
                dict(request, lines=[dict(request['lines'][0], to_refund=False)])):
            with self.assertRaises(ValidationError):
                picking.qorlia_return_save(changed)
        self.assertEqual(self.env['stock.picking'].search_count([]), count)
        self.assertFalse(self.receipts(picking))

    def test_receipt_binds_request_author_and_cannot_be_forged_by_generic_writes(self):
        picking = self.delivered()
        request = self.request(picking)
        picking.qorlia_return_save(request)
        with self.assertRaises(ValidationError):
            picking.qorlia_return_status(dict(request, review_version='0' * 64))
        with self.assertRaises(ValidationError):
            picking.with_user(self.env.user).qorlia_return_status(request)
        with self.assertRaises(AccessError):
            picking.read(['qorlia_validation_receipts'])
        with self.assertRaises(AccessError):
            picking.write({'qorlia_validation_receipts': {'forged': {}}})
        self.assertEqual(len(self.receipts(picking)), 1)

    def test_validation_receipt_namespace_cannot_be_used_as_a_return_receipt(self):
        picking = self.prepared(5)
        loaded = picking.qorlia_validation_load(self.order.id, picking.id)
        review = picking.qorlia_validation_preview(self.order.id, picking.id, loaded['version'], [])
        validation = {key: copy.deepcopy(review[key]) for key in (
            'order_id', 'transfer_id', 'version', 'decisions', 'review_version')} | {'request_key': str(uuid.uuid4())}
        picking.qorlia_validation_save(validation)
        request = dict(self.request(picking), request_key=validation['request_key'])
        with self.assertRaises(ValidationError):
            picking.qorlia_return_status(request)
        with self.assertRaises(ValidationError):
            picking.qorlia_return_save(request)
        self.assertTrue(picking.qorlia_validation_status(validation)['accepted'])
        self.assertEqual(len(self.receipts(picking)), 1)

    def test_actual_effect_change_rolls_back_return_and_callbacks(self):
        picking = self.delivered()
        request = self.request(picking)
        original = type(picking)._qorlia_return_native
        calls = []
        hooks = {name: getattr(self.env.cr, name) for name in ('precommit', 'postcommit', 'prerollback', 'postrollback')}
        count = self.env['stock.picking'].search_count([])
        def changed(record, form):
            result = original(record, form)
            calls.append(True)
            if len(calls) == 2:
                effects, private, state, return_id, references = copy.deepcopy(result)
                effects['labels']['unreviewed'] = 'Unreviewed native change'
                record.env.cr.postcommit.add(lambda: self.fail('Rejected return callback escaped.'))
                return effects, private, state, return_id, references
            return result
        with patch.object(type(picking), '_qorlia_return_native', changed):
            with self.assertRaisesRegex(UserError, 'unreviewed effects'):
                picking.qorlia_return_save(request)
        self.assertEqual(len(calls), 2)
        self.assertEqual(self.env['stock.picking'].search_count([]), count)
        self.assertFalse(self.receipts(picking))
        self.assertEqual(self.source_stock(), 5)
        for name, queue in hooks.items():
            self.assertIs(getattr(self.env.cr, name), queue)

    def test_unexpected_native_schedule_is_not_hidden_by_date_normalization(self):
        picking = self.delivered()
        request = self.request(picking)
        native = type(self.env['stock.return.picking']).create_returns
        calls = []
        def changed(wizard):
            action = native(wizard)
            calls.append(True)
            if len(calls) == 2:
                wizard.env['stock.picking'].browse(action['res_id']).move_ids.date = datetime(2030, 1, 1)
            return action
        with patch.object(type(self.env['stock.return.picking']), 'create_returns', changed):
            with self.assertRaisesRegex(UserError, 'unreviewed effects'):
                picking.qorlia_return_save(request)
        self.assertFalse(self.receipts(picking))

    def test_incoming_return_save_remains_linked_without_issuing_credit_or_moving_stock(self):
        picking = self.picking(self.in_type).with_user(self.env.user)
        group = self.env['procurement.group'].create({'name': 'QorliaQA Return saved incoming group',
            'sale_id': self.order.id, 'partner_id': self.customer.id})
        picking.move_ids.group_id = group
        picking.action_confirm()
        picking.action_assign()
        picking.move_line_ids.write({'qty_done': 5, 'lot_id': self.lot.id})
        self.assertIs(self.wizard(picking.button_validate(), 'stock.picking.validate.wizard').btn_confirm(), True)
        before = {name: self.env[name].search_count([]) for name in ('account.move', 'account.payment', 'stock.valuation.layer')}
        accepted = picking.qorlia_return_save(self.request(picking))
        returned = picking.browse(accepted['return_transfer']['id'])
        self.assertEqual(returned.location_id, picking.location_dest_id)
        self.assertEqual(returned.location_dest_id, picking.location_id)
        self.assertEqual(returned.sale_id, self.order)
        self.assertEqual(self.source_stock(), 15)
        self.assertEqual(self.sale_line.qty_delivered, 0)
        self.assertEqual(before, {name: self.env[name].search_count([]) for name in before})

    def test_new_queued_mail_is_rejected_before_commit_or_external_dispatch(self):
        picking = self.delivered().with_user(self.env.user)
        self.assertTrue(picking.env['mail.mail'].check_access_rights('create', raise_exception=False))
        request = self.request(picking)
        native = type(self.env['stock.return.picking']).create_returns
        def queued(wizard):
            self.assertFalse(wizard.env.context['mail_notify_force_send'])
            action = native(wizard)
            wizard.env['mail.mail'].create({'subject': 'QorliaQA Return notification',
                'body_html': '<p>Synthetic only</p>', 'email_to': 'nobody@example.invalid'})
            return action
        count = self.env['mail.mail'].search_count([])
        with patch.object(type(self.env['stock.return.picking']), 'create_returns', queued):
            with self.assertRaisesRegex(UserError, 'notifications'):
                picking.qorlia_return_save(request)
        self.assertEqual(self.env['mail.mail'].search_count([]), count)
        self.assertFalse(self.receipts(picking))

    def test_chained_return_reviews_and_saves_native_downstream_unreservation(self):
        output = self.env['stock.location'].create({'name': 'QorliaQA Saved return chain output',
            'usage': 'internal', 'location_id': self.warehouse.lot_stock_id.id})
        picking = self.picking(self.internal_type, destination=output)
        group = self.env['procurement.group'].create({'name': 'QorliaQA Saved return chain group',
            'sale_id': self.order.id, 'partner_id': self.customer.id})
        picking.group_id = group
        picking.move_ids.group_id = group
        self.reserve(picking, 5)
        self.assertIs(self.wizard(picking.button_validate(), 'stock.picking.validate.wizard').btn_confirm(), True)
        successor = self.picking()
        successor.location_id = output
        successor.move_ids.location_id = output
        successor.move_ids.move_orig_ids = [(4, picking.move_ids.id)]
        successor.action_confirm()
        successor.action_assign()
        self.assertEqual(successor.move_ids.reserved_availability, 5)
        loaded = picking.qorlia_return_load(self.order.id, picking.id)
        self.assertTrue(loaded['form']['chained_move_warning'])
        request = self.request(picking)
        self.assertEqual(successor.move_ids.reserved_availability, 5)
        accepted = picking.qorlia_return_save(request)
        self.assertTrue(accepted['accepted'])
        self.assertEqual(successor.move_ids.reserved_availability, 0)
        self.assertNotIn(successor.state, ('done', 'cancel'))
        self.assertEqual(self.source_stock(), 5)
        self.assertEqual(self.sale_line.qty_delivered, 0)
        self.assertEqual(picking.qorlia_return_save(request), accepted)
