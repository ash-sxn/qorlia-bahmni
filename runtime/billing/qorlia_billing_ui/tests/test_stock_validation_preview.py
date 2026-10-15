# SPDX-License-Identifier: LGPL-3.0-or-later
# Copyright 2026 Qorlia contributors.
from datetime import timedelta
import json
from unittest.mock import patch

from odoo import fields
from odoo.exceptions import AccessError, UserError, ValidationError
from odoo.tests import TransactionCase, tagged

from . import test_stock_validation_contract as native_contract


@tagged('post_install', '-at_install')
class StockValidationPreviewTest(native_contract.StockValidationFixture, TransactionCase):
    automatic_valuation = native_contract.StockValidationContractTest.automatic_valuation

    def prepared(self, done=None):
        picking = self.picking()
        picking.group_id = self.env['procurement.group'].create({'name': 'QorliaQA Validation preview group',
            'sale_id': self.order.id, 'partner_id': self.customer.id})
        picking.move_ids.group_id = picking.group_id
        self.reserve(picking, done)
        return picking

    def load(self, picking):
        return picking.qorlia_validation_load(self.order.id, picking.id)

    def preview(self, picking, decisions=None, version=None):
        return picking.qorlia_validation_preview(self.order.id, picking.id,
            version or self.load(picking)['version'], decisions or [])

    def test_full_delivery_preview_captures_valuation_and_rolls_back(self):
        picking = self.prepared(5).with_user(self.env.user)
        before = self.load(picking)
        result = self.preview(picking)
        self.assertTrue(result['terminal'])
        self.assertTrue(result['write_ready'])
        self.assertEqual(result['state_after'], 'done')
        valuation = result['effects']['created']['stock.valuation.layer'][0]['values']
        self.assertEqual(valuation['quantity'], -5)
        self.assertEqual(valuation['value'], -20)
        self.assertEqual(result['effects']['updated']['sale.order.line'][0]['after']['qty_delivered'], 5)
        self.assertEqual(self.load(picking), before)
        self.assertEqual(self.source_stock(), 10)
        self.assertEqual(self.sale_line.qty_delivered, 0)
        json.dumps(result, allow_nan=False)

    def test_stock_user_gets_private_valuation_counts_not_accounting_rows(self):
        picking = self.prepared(5)
        result = self.preview(picking)
        self.assertEqual(result['state_after'], 'done')
        self.assertNotIn('stock.valuation.layer', result['effects']['created'])
        self.assertEqual(result['effects']['private_effect_counts']['stock.valuation.layer'],
            {'created': 1, 'updated': 0, 'deleted': 0})
        self.assertEqual(self.source_stock(), 10)

    def test_immediate_choices_replay_without_mutating_done_quantity(self):
        picking = self.prepared()
        before = self.load(picking)
        step = self.preview(picking)
        self.assertEqual(step['next_step']['kind'], 'immediate')
        self.assertEqual(step['next_step']['transfers'], [{'transfer': [picking.id, picking.display_name], 'selected': True}])
        result = self.preview(picking, [{'kind': 'immediate', 'selected': True}])
        self.assertTrue(result['terminal'])
        self.assertEqual(result['state_after'], 'done')
        declined = self.preview(picking, [{'kind': 'immediate', 'selected': False}])
        self.assertTrue(declined['terminal'])
        self.assertEqual(declined['state_after'], 'assigned')
        self.assertEqual(picking.move_line_ids.qty_done, 0)
        self.assertEqual(self.load(picking), before)

    def test_partial_backorder_choices_capture_generated_remainder(self):
        picking = self.prepared(2)
        self.assertEqual(self.preview(picking)['next_step']['kind'], 'backorder')
        kept = self.preview(picking, [{'kind': 'backorder', 'selected': True}])
        backorders = kept['effects']['created']['stock.picking']
        self.assertEqual(len(backorders), 1)
        self.assertEqual(backorders[0]['values']['backorder_id'], picking.id)
        cancelled = self.preview(picking, [{'kind': 'backorder', 'selected': False}])
        self.assertFalse(cancelled['effects']['created'].get('stock.picking'))
        self.assertEqual(cancelled['state_after'], 'done')
        self.assertEqual(self.source_stock(), 10)
        self.assertFalse(self.env['stock.picking'].search([('backorder_id', '=', picking.id)]))

    def test_immediate_then_expiry_decline_remains_uncompleted_and_rolled_back(self):
        self.lot.expiration_date = fields.Datetime.now() - timedelta(days=1)
        picking = self.prepared()
        first = {'kind': 'immediate', 'selected': True}
        step = self.preview(picking, [first])
        self.assertEqual(step['next_step']['kind'], 'expiry')
        self.assertEqual(step['next_step']['lots'], [[self.lot.id, self.lot.display_name]])
        declined = self.preview(picking, [first, {'kind': 'expiry', 'proceed': False}])
        self.assertTrue(declined['terminal'])
        self.assertEqual(declined['state_after'], 'assigned')
        accepted = self.preview(picking, [first, {'kind': 'expiry', 'proceed': True}])
        self.assertEqual(accepted['state_after'], 'done')
        self.assertEqual(self.source_stock(), 10)
        self.assertEqual(picking.move_line_ids.qty_done, 0)

    def test_receipt_review_preserves_native_columns_and_new_batch_effects(self):
        picking = self.picking(self.in_type).with_user(self.env.user)
        picking.action_confirm()
        picking.action_assign()
        picking.move_line_ids.write({'qty_done': 5, 'lot_name': 'QorliaQA adapter receipt batch',
            'cost_price': 2.5, 'sale_price': 5, 'mrp': 7, 'expiration_date': '2027-02-01 00:00:00'})
        # Link this native incoming fixture to its order without using Bahmni's origin override.
        picking.group_id = self.env['procurement.group'].create({'name': 'QorliaQA Validation receipt group',
            'sale_id': self.order.id, 'partner_id': self.customer.id})
        step = self.preview(picking)
        self.assertEqual(step['next_step']['kind'], 'receipt')
        row = step['next_step']['operations'][0]
        self.assertEqual(row['qty_done'], 5)
        self.assertEqual(row['cost_price'], 2.5)
        self.assertEqual(row['mrp'], 7)
        result = self.preview(picking, [{'kind': 'receipt', 'confirm': True}])
        self.assertEqual(result['state_after'], 'done')
        batch = result['effects']['created']['stock.lot'][0]['values']
        self.assertEqual(batch['cost_price'], 2.5)
        self.assertFalse(picking.move_line_ids.lot_id)
        self.assertEqual(self.source_stock(), 10)

    def test_changed_configuration_or_stock_rejects_stale_review(self):
        picking = self.prepared(5)
        version = self.load(picking)['version']
        self.out_type.create_backorder = 'never'
        with self.assertRaises(UserError):
            self.preview(picking, version=version)
        version = self.load(picking)['version']
        self.env['stock.quant']._update_available_quantity(self.product, self.warehouse.lot_stock_id, 1, lot_id=self.lot)
        with self.assertRaises(UserError):
            self.preview(picking, version=version)

    def test_context_flags_arbitrary_wizard_and_extra_decisions_are_not_accepted(self):
        picking = self.prepared()
        forced = picking.with_context(skip_immediate=True, skip_sanity_check=True, validation_confirmed=True)
        self.assertEqual(self.preview(forced)['next_step']['kind'], 'immediate')
        for decision in ({'kind': 'immediate', 'selected': 1},
                {'kind': 'expiry', 'proceed': True},
                {'kind': 'immediate', 'selected': True, 'context': {'skip_expired': True}},
                {'kind': 'immediate', 'selected': True, 'res_id': 1}):
            with self.assertRaises(ValidationError):
                self.preview(picking, [decision])
        with self.assertRaises(ValidationError):
            self.preview(picking, [{'kind': 'immediate', 'selected': False}, {'kind': 'expiry', 'proceed': True}])
        with self.assertRaises(ValidationError):
            self.preview(picking, [{}] * 17)
        self.assertEqual(self.source_stock(), 10)

    def test_denied_role_foreign_order_and_completed_transfer_are_rejected(self):
        picking = self.prepared(5)
        with self.assertRaises(AccessError):
            self.preview(picking.with_user(self.env.ref('base.public_user')))
        other = self.env['sale.order'].create({'partner_id': self.customer.id, 'shop_id': self.shop.id})
        with self.assertRaises(UserError):
            picking.qorlia_validation_load(other.id, picking.id)
        picking.button_validate()
        self.assertTrue(self.load(picking)['reason'])
        with self.assertRaises(UserError):
            self.preview(picking)

    def test_preview_restores_transients_and_all_callback_queues(self):
        picking = self.prepared()
        models = ('stock.immediate.transfer', 'stock.immediate.transfer.line', 'account.move', 'stock.valuation.layer', 'mail.message')
        version = self.load(picking)['version']
        counts = {name: self.env[name].search_count([]) for name in models}
        hooks = {name: getattr(self.env.cr, name) for name in ('precommit', 'postcommit', 'prerollback', 'postrollback')}
        for name in hooks:
            if name != 'precommit':
                hooks[name].add(lambda: None)
        functions = {name: list(callbacks._funcs) for name, callbacks in hooks.items()}
        original = type(picking).button_validate

        def native_callbacks(record):
            record.env.cr.postcommit.add(lambda: self.fail('A rolled-back delivery notification escaped.'))
            record.env.cr.prerollback.add(lambda: self.fail('A scoped rollback callback escaped.'))
            record.env.cr.postrollback.add(lambda: self.fail('A scoped rollback callback escaped.'))
            return original(record)

        with patch.object(type(picking), 'button_validate', native_callbacks):
            self.preview(picking, [{'kind': 'immediate', 'selected': True}], version=version)
        self.assertEqual(counts, {name: self.env[name].search_count([]) for name in models})
        for name, callbacks in hooks.items():
            self.assertIs(getattr(self.env.cr, name), callbacks)
            self.assertEqual(list(callbacks._funcs), functions[name])

    def test_external_email_or_sms_stops_before_native_dispatch(self):
        picking = self.prepared(5)
        self.env.company.stock_move_email_validation = True
        with patch.object(type(picking), 'message_post_with_template') as send:
            with self.assertRaisesRegex(UserError, 'External delivery notifications'):
                self.preview(picking)
            send.assert_not_called()
        self.env.company.stock_move_email_validation = False
        self.customer.phone = '0000000000'
        self.env.company.stock_move_sms_validation = True
        with patch.object(type(picking), '_message_sms_with_template') as send:
            with self.assertRaisesRegex(UserError, 'External delivery notifications'):
                self.preview(picking)
            send.assert_not_called()
        self.assertEqual(self.source_stock(), 10)

    def test_automatic_valuation_preview_includes_balanced_journal_and_analytics(self):
        self.automatic_valuation()
        picking = self.prepared(5).with_user(self.env.user)
        before = self.load(picking)
        counts = {name: self.env[name].search_count([]) for name in ('account.move', 'account.move.line', 'account.analytic.line')}
        result = self.preview(picking)
        journal = result['effects']['created']['account.move'][0]['values']
        self.assertEqual(journal['state'], 'posted')
        entries = result['effects']['created']['account.move.line']
        self.assertEqual(sum(row['values']['balance'] for row in entries), 0)
        self.assertEqual(sorted(row['values']['balance'] for row in entries), [-20, 20])
        self.assertTrue(result['effects']['created'].get('account.analytic.line'))
        self.assertEqual(self.load(picking), before)
        self.assertEqual(counts, {name: self.env[name].search_count([]) for name in counts})
        self.assertEqual(self.source_stock(), 10)

    def test_unsupported_native_action_rolls_back_instead_of_claiming_success(self):
        picking = self.prepared(5)
        action = {'type': 'ir.actions.client', 'tag': 'unknown_native_extension'}
        with patch.object(type(picking), 'button_validate', return_value=action):
            with self.assertRaisesRegex(UserError, 'additional integration'):
                self.preview(picking)
        self.assertEqual(self.source_stock(), 10)
        self.assertEqual(picking.state, 'assigned')

    def test_native_sms_setup_prompt_is_returned_but_not_automatically_decided(self):
        picking = self.prepared(5)
        counts = self.env['confirm.stock.sms'].search_count([])
        with patch.object(type(picking), '_check_warn_sms', return_value=picking):
            result = self.preview(picking)
            self.assertEqual(result['next_step']['kind'], 'sms')
            self.assertTrue(result['next_step']['blocked_reason'])
            self.assertFalse(result['terminal'])
            with self.assertRaises(ValidationError):
                self.preview(picking, [{'kind': 'sms', 'selected': True}])
        self.assertEqual(self.env['confirm.stock.sms'].search_count([]), counts)
        self.assertEqual(self.source_stock(), 10)

    def test_unreviewed_configuration_mutation_is_rejected_and_rolled_back(self):
        picking = self.prepared(5).with_user(self.env.user)
        original = type(picking).button_validate
        company_name = self.env.company.name

        def mutate_configuration(record):
            record.company_id.name = 'QorliaQA unreviewed native configuration'
            return original(record)

        with patch.object(type(picking), 'button_validate', mutate_configuration):
            with self.assertRaisesRegex(UserError, 'unreviewed native configuration'):
                self.preview(picking)
        self.assertEqual(self.env.company.name, company_name)
        self.assertEqual(self.source_stock(), 10)
