# SPDX-License-Identifier: LGPL-3.0-or-later
# Copyright 2026 Qorlia contributors.
from contextlib import closing
from datetime import timedelta

from odoo import fields, tools
from odoo.exceptions import UserError
from odoo.tests import TransactionCase, tagged


class StockValidationFixture:
    """Synthetic native fixture shared by direct contracts and adapter review tests."""

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.customer = cls.env['res.partner'].create({'name': 'QorliaQA Validation customer'})
        cls.category = cls.env['product.category'].create({'name': 'QorliaQA Validation stock',
            'property_cost_method': 'standard', 'property_valuation': 'manual_periodic'})
        cls.product = cls.env['product.product'].create({'name': 'QorliaQA Validation medicine',
            'type': 'product', 'tracking': 'lot', 'standard_price': 4, 'categ_id': cls.category.id,
            'taxes_id': [(6, 0, [])]})
        cls.shop = cls.env['sale.shop'].search([('company_id', '=', cls.env.company.id)], limit=1)
        cls.warehouse = cls.shop.warehouse_id
        cls.out_type = cls.warehouse.out_type_id.copy({'name': 'QorliaQA Validation delivery',
            'sequence_code': 'QVCD', 'reservation_method': 'manual', 'create_backorder': 'ask'})
        # The installed Bahmni batch-price hook matches the native Receipts name.
        cls.in_type = cls.warehouse.in_type_id.copy({'name': 'Receipts',
            'sequence_code': 'QVCR', 'create_backorder': 'ask'})
        cls.internal_type = cls.warehouse.int_type_id.copy({'name': 'QorliaQA Validation internal',
            'sequence_code': 'QVCI', 'reservation_method': 'manual', 'create_backorder': 'ask'})
        cls.order = cls.env['sale.order'].create({'partner_id': cls.customer.id, 'shop_id': cls.shop.id})
        cls.sale_line = cls.env['sale.order.line'].create({'order_id': cls.order.id,
            'product_id': cls.product.id, 'product_uom_qty': 5, 'price_unit': 10})
        cls.lot = cls.env['stock.lot'].create({'name': 'QorliaQA Validation batch',
            'product_id': cls.product.id, 'company_id': cls.env.company.id,
            'expiration_date': '2027-01-01 00:00:00'})
        cls.env['stock.quant']._update_available_quantity(cls.product, cls.warehouse.lot_stock_id, 10, lot_id=cls.lot)
        cls.user = cls.env['res.users'].with_context(no_reset_password=True).create({
            'name': 'QorliaQA Validation stock staff', 'login': 'qorliaqa-validation-stock-staff',
            'email': 'qorliaqa-validation-stock@example.invalid', 'company_id': cls.env.company.id,
            'company_ids': [(6, 0, cls.env.company.ids)],
            'groups_id': [(6, 0, [cls.env.ref('stock.group_stock_user').id,
                cls.env.ref('sales_team.group_sale_manager').id])],
        })

    def picking(self, kind=None, quantity=5, destination=None):
        kind = kind or self.out_type
        source = self.env.ref('stock.stock_location_suppliers') if kind.code == 'incoming' else self.warehouse.lot_stock_id
        destination = destination or (self.warehouse.lot_stock_id if kind.code == 'incoming' else self.customer.property_stock_customer)
        picking = self.env['stock.picking'].create({'picking_type_id': kind.id, 'partner_id': self.customer.id,
            'location_id': source.id, 'location_dest_id': destination.id,
            'origin': 'QorliaQA Validation native contract'})
        self.env['stock.move'].create({'name': self.product.name, 'picking_id': picking.id,
            'product_id': self.product.id, 'product_uom': self.product.uom_id.id,
            'product_uom_qty': quantity, 'sale_line_id': self.sale_line.id if kind.code == 'outgoing' else False,
            'location_id': source.id, 'location_dest_id': destination.id})
        return picking.with_user(self.user)

    def reserve(self, picking, done=None):
        picking.action_confirm()
        picking.action_assign()
        self.assertEqual(picking.state, 'assigned')
        self.assertEqual(sum(picking.move_line_ids.mapped('reserved_uom_qty')), 5)
        if done is not None:
            self.assertEqual(len(picking.move_line_ids), 1)
            picking.move_line_ids.qty_done = done
        return picking.move_line_ids

    def wizard(self, action, model):
        self.assertIsInstance(action, dict)
        self.assertEqual(action['type'], 'ir.actions.act_window')
        self.assertEqual(action['res_model'], model)
        self.assertEqual(action['target'], 'new')
        return self.env[model].with_user(self.user).with_context(action['context']).create({})

    def source_stock(self):
        return sum(self.env['stock.quant'].search([('product_id', '=', self.product.id),
            ('location_id', '=', self.warehouse.lot_stock_id.id)]).mapped('quantity'))

    def assert_delivered(self, picking, quantity):
        self.env.flush_all()
        self.assertEqual(picking.state, 'done')
        self.assertEqual(sum(picking.move_ids.mapped('quantity_done')), quantity)
        self.assertEqual(self.sale_line.qty_delivered, quantity)
        self.assertEqual(self.source_stock(), 10 - quantity)


@tagged('post_install', '-at_install')
class StockValidationContractTest(StockValidationFixture, TransactionCase):
    """Installed native validation/wizard effects, not Qorlia API acceptance."""

    def test_validate_without_reserved_or_done_quantities_rejects(self):
        picking = self.picking()
        picking.action_confirm()
        with self.assertRaises(UserError), self.env.cr.savepoint():
            picking.button_validate()
        self.assertEqual(picking.state, 'confirmed')
        self.assertEqual(self.source_stock(), 10)
        self.assertEqual(self.sale_line.qty_delivered, 0)

    def test_full_outgoing_validation_moves_stock_and_creates_native_valuation(self):
        picking = self.picking()
        self.reserve(picking, 5)
        finance = self.env['account.move'].search_count([])
        self.assertIs(picking.button_validate(), True)
        self.assert_delivered(picking, 5)
        valuation = self.env['stock.valuation.layer'].search([('stock_move_id', 'in', picking.move_ids.ids)])
        self.assertEqual(sum(valuation.mapped('quantity')), -5)
        self.assertEqual(sum(valuation.mapped('value')), -20)
        self.assertFalse(valuation.account_move_id)
        self.assertEqual(self.env['account.move'].search_count([]), finance)

    def test_zero_done_requires_immediate_wizard_before_moving_stock(self):
        picking = self.picking()
        self.reserve(picking)
        wizard = self.wizard(picking.button_validate(), 'stock.immediate.transfer')
        self.assertEqual(wizard.pick_ids, picking)
        self.assertEqual(wizard.immediate_transfer_line_ids.picking_id, picking)
        self.assertTrue(wizard.immediate_transfer_line_ids.to_immediate)
        self.assertEqual(self.source_stock(), 10)
        self.assertEqual(self.sale_line.qty_delivered, 0)
        self.assertIs(wizard.process(), True)
        self.assert_delivered(picking, 5)

    def test_deselecting_immediate_transfer_does_not_deliver_it(self):
        picking = self.picking()
        self.reserve(picking)
        wizard = self.wizard(picking.button_validate(), 'stock.immediate.transfer')
        wizard.immediate_transfer_line_ids.to_immediate = False
        self.assertIs(wizard.process(), True)
        self.assertEqual(picking.state, 'assigned')
        self.assertEqual(self.source_stock(), 10)
        self.assertEqual(self.sale_line.qty_delivered, 0)

    def test_partial_delivery_backorder_choice_preserves_remainder(self):
        picking = self.picking()
        self.reserve(picking, 2)
        wizard = self.wizard(picking.button_validate(), 'stock.backorder.confirmation')
        self.assertTrue(wizard.backorder_confirmation_line_ids.to_backorder)
        self.assertEqual(self.source_stock(), 10)
        self.assertIs(wizard.process(), True)
        self.assert_delivered(picking, 2)
        backorder = self.env['stock.picking'].search([('backorder_id', '=', picking.id)])
        self.assertEqual(len(backorder), 1)
        self.assertEqual(sum(backorder.move_ids.mapped('product_uom_qty')), 3)
        self.assertNotIn(backorder.state, ('done', 'cancel'))
        self.assertEqual(backorder.move_ids.sale_line_id, self.sale_line)

    def test_partial_delivery_without_backorder_cancels_only_remaining_demand(self):
        picking = self.picking()
        self.reserve(picking, 2)
        wizard = self.wizard(picking.button_validate(), 'stock.backorder.confirmation')
        self.assertIs(wizard.process_cancel_backorder(), True)
        self.assert_delivered(picking, 2)
        self.assertFalse(self.env['stock.picking'].search([('backorder_id', '=', picking.id)]))
        self.assertEqual(sum(self.env['stock.quant'].search([('product_id', '=', self.product.id)]).mapped('reserved_quantity')), 0)

    def test_always_backorder_policy_does_not_show_choice_wizard(self):
        self.out_type.create_backorder = 'always'
        picking = self.picking()
        self.reserve(picking, 2)
        self.assertIs(picking.button_validate(), True)
        self.assert_delivered(picking, 2)
        backorder = self.env['stock.picking'].search([('backorder_id', '=', picking.id)])
        self.assertEqual(len(backorder), 1)
        self.assertEqual(sum(backorder.move_ids.mapped('product_uom_qty')), 3)

    def test_never_backorder_policy_does_not_show_choice_or_create_remainder(self):
        self.out_type.create_backorder = 'never'
        picking = self.picking()
        self.reserve(picking, 2)
        self.assertIs(picking.button_validate(), True)
        self.assert_delivered(picking, 2)
        self.assertFalse(self.env['stock.picking'].search([('backorder_id', '=', picking.id)]))

    def test_missing_batch_rejects_without_moving_stock(self):
        picking = self.picking()
        picking.action_confirm()
        self.env['stock.move.line'].with_user(self.user).create({'picking_id': picking.id,
            'move_id': picking.move_ids.id, 'product_id': self.product.id, 'product_uom_id': self.product.uom_id.id,
            'qty_done': 5, 'location_id': picking.location_id.id, 'location_dest_id': picking.location_dest_id.id})
        with self.assertRaises(UserError), self.env.cr.savepoint():
            picking.button_validate()
        self.assertNotEqual(picking.state, 'done')
        self.assertEqual(self.source_stock(), 10)

    def test_negative_recorded_done_quantity_cannot_be_validated(self):
        picking = self.picking()
        self.reserve(picking)
        with self.assertRaises(UserError), self.env.cr.savepoint():
            picking.move_line_ids.qty_done = -1
            picking.button_validate()
        self.assertEqual(self.source_stock(), 10)
        self.assertEqual(self.sale_line.qty_delivered, 0)

    def test_done_quantity_must_respect_native_unit_rounding(self):
        whole = self.product.uom_id.copy({'name': 'QorliaQA Validation whole units',
            'rounding': 1, 'uom_type': 'bigger', 'factor': 1})
        self.assertTrue(whole)
        self.product.write({'uom_id': whole.id, 'uom_po_id': whole.id})
        picking = self.picking()
        self.reserve(picking)
        picking.move_line_ids.qty_done = 1.25
        backorder = self.wizard(picking.button_validate(), 'stock.backorder.confirmation')
        with self.assertRaises(UserError), self.env.cr.savepoint():
            backorder.process()
        self.assertEqual(self.source_stock(), 10)
        self.assertEqual(self.sale_line.qty_delivered, 0)

    def automatic_valuation(self):
        plans = self.env['account.analytic.plan'].search([('default_applicability', '=', 'mandatory')])
        if not plans:
            plans = self.env['account.analytic.plan'].create({'name': 'QorliaQA Validation analytics'})
        roots = self.env['account.analytic.plan']
        for plan in plans:
            while plan.parent_id:
                plan = plan.parent_id
            roots |= plan
        distribution = {}
        for plan in roots:
            analytic = self.env['account.analytic.account'].create({'name': 'QorliaQA Validation allocation',
                'plan_id': plan.id, 'company_id': self.env.company.id})
            distribution[str(analytic.id)] = 100
        self.env['account.analytic.distribution.model'].create({'product_id': self.product.id,
            'company_id': self.env.company.id, 'analytic_distribution': distribution})
        accounts = {}
        for key, code in (('valuation', 'QAVAL'), ('input', 'QAVIN'), ('output', 'QAVOUT')):
            accounts[key] = self.env['account.account'].create({'name': 'QorliaQA Validation ' + key,
                'code': code, 'account_type': 'asset_current', 'company_id': self.env.company.id})
        journal = self.env['account.journal'].create({'name': 'QorliaQA Stock valuation', 'code': 'QAV',
            'type': 'general', 'company_id': self.env.company.id})
        self.category.write({'property_stock_journal': journal.id,
            'property_stock_valuation_account_id': accounts['valuation'].id,
            'property_stock_account_input_categ_id': accounts['input'].id,
            'property_stock_account_output_categ_id': accounts['output'].id,
            'property_valuation': 'real_time'})
        return accounts, journal

    def test_automatic_valuation_posts_native_balanced_stock_journal(self):
        accounts, journal = self.automatic_valuation()
        picking = self.picking()
        self.reserve(picking, 5)
        self.assertIs(picking.button_validate(), True)
        self.assert_delivered(picking, 5)
        valuation = self.env['stock.valuation.layer'].search([('stock_move_id', 'in', picking.move_ids.ids)])
        self.assertEqual(sum(valuation.mapped('quantity')), -5)
        self.assertEqual(sum(valuation.mapped('value')), -20)
        entry = valuation.account_move_id
        self.assertEqual(len(entry), 1)
        self.assertEqual(entry.state, 'posted')
        self.assertEqual(entry.move_type, 'entry')
        self.assertEqual(entry.journal_id, journal)
        self.assertEqual(sum(entry.line_ids.mapped('balance')), 0)
        self.assertEqual(sum(entry.line_ids.filtered(lambda line: line.account_id == accounts['valuation']).mapped('balance')), -20)
        self.assertEqual(sum(entry.line_ids.filtered(lambda line: line.account_id == accounts['output']).mapped('balance')), 20)

    def test_automatic_stock_journal_and_analytics_roll_back_with_validation_preview(self):
        self.automatic_valuation()
        picking = self.picking()
        self.reserve(picking, 5)
        self.env.flush_all()
        counts = {name: self.env[name].search_count([]) for name in
            ('stock.valuation.layer', 'account.move', 'account.move.line', 'account.analytic.line', 'mail.message')}
        cr = self.env.cr
        hooks = {name: getattr(cr, name) for name in ('precommit', 'postcommit', 'prerollback', 'postrollback')}
        try:
            for name in hooks:
                setattr(cr, name, tools.Callbacks())
            with closing(cr.savepoint()):
                self.assertIs(picking.button_validate(), True)
                cr.flush()
                self.assertEqual(picking.state, 'done')
                self.assertGreater(self.env['account.move'].search_count([]), counts['account.move'])
        finally:
            for name, callbacks in hooks.items():
                setattr(cr, name, callbacks)
            self.env.invalidate_all()
        self.assertEqual(counts, {name: self.env[name].search_count([]) for name in counts})
        self.assertEqual(picking.state, 'assigned')
        self.assertEqual(self.source_stock(), 10)
        self.assertEqual(self.sale_line.qty_delivered, 0)

    def test_bahmni_receipt_review_precedes_new_batch_and_price_updates(self):
        picking = self.picking(self.in_type)
        picking.action_confirm()
        picking.action_assign()
        line = picking.move_line_ids
        self.assertEqual(len(line), 1)
        line.write({'qty_done': 5, 'lot_name': 'QorliaQA Validation new receipt batch',
            'cost_price': 2.5, 'sale_price': 5, 'mrp': 7, 'expiration_date': '2027-02-01 00:00:00'})
        wizard = self.wizard(picking.button_validate(), 'stock.picking.validate.wizard')
        self.assertEqual(wizard.picking_id, picking)
        self.assertEqual(wizard.move_lines, line)
        self.assertFalse(line.lot_id)
        self.assertEqual(self.source_stock(), 10)
        self.assertIs(wizard.btn_confirm(), True)
        self.assertEqual(picking.state, 'done')
        self.assertEqual(self.source_stock(), 15)
        self.assertEqual(line.lot_id.name, 'QorliaQA Validation new receipt batch')
        self.assertEqual(line.lot_id.cost_price, 2.5)
        self.assertEqual(line.lot_id.sale_price, 5)
        self.assertEqual(line.lot_id.mrp, 7)
        self.assertEqual(line.lot_id.expiration_date, fields.Datetime.to_datetime('2027-02-01 00:00:00'))

    def test_receipt_can_require_bahmni_then_immediate_wizard(self):
        picking = self.picking(self.in_type)
        picking.action_confirm()
        picking.action_assign()
        picking.move_line_ids.write({'lot_id': self.lot.id, 'lot_name': self.lot.name, 'cost_price': 2.5,
            'sale_price': 5, 'mrp': 7, 'expiration_date': '2027-02-01 00:00:00'})
        bahmni = self.wizard(picking.button_validate(), 'stock.picking.validate.wizard')
        self.assertFalse(bahmni.move_lines)
        immediate = self.wizard(bahmni.btn_confirm(), 'stock.immediate.transfer')
        self.assertEqual(self.source_stock(), 10)
        self.assertIs(immediate.process(), True)
        self.assertEqual(picking.state, 'done')
        self.assertEqual(self.source_stock(), 15)
        self.assertEqual(self.lot.cost_price, 2.5)

    def test_creation_only_receipt_without_batch_name_can_chain_a_backorder_wizard(self):
        picking = self.picking(self.in_type)
        self.assertTrue(self.in_type.use_create_lots)
        self.assertFalse(self.in_type.use_existing_lots)
        picking.action_confirm()
        picking.action_assign()
        picking.move_line_ids.write({'lot_id': self.lot.id, 'cost_price': 2.5, 'sale_price': 5, 'mrp': 7})
        bahmni = self.wizard(picking.button_validate(), 'stock.picking.validate.wizard')
        immediate = self.wizard(bahmni.btn_confirm(), 'stock.immediate.transfer')
        backorder = self.wizard(immediate.process(), 'stock.backorder.confirmation')
        self.assertEqual(backorder.pick_ids, picking)
        self.assertEqual(picking.move_ids.quantity_done, 0)
        self.assertEqual(self.source_stock(), 10)
        # Bahmni updates batch metadata even when its parent returns another wizard.
        self.assertEqual(self.lot.cost_price, 2.5)

    def test_expired_batch_decline_does_not_complete_delivery(self):
        self.lot.expiration_date = fields.Datetime.now() - timedelta(days=1)
        picking = self.picking()
        self.reserve(picking, 5)
        warning = self.wizard(picking.button_validate(), 'expiry.picking.confirmation')
        self.assertEqual(warning.lot_ids, self.lot)
        self.assertEqual(warning.picking_ids, picking)
        self.assertIs(warning.process_no_expired(), True)
        self.assertEqual(picking.state, 'assigned')
        self.assertEqual(self.source_stock(), 10)
        self.assertEqual(self.sale_line.qty_delivered, 0)

    def test_expired_batch_requires_explicit_native_confirmation(self):
        self.lot.expiration_date = fields.Datetime.now() - timedelta(days=1)
        picking = self.picking()
        self.reserve(picking, 5)
        warning = self.wizard(picking.button_validate(), 'expiry.picking.confirmation')
        self.assertEqual(self.source_stock(), 10)
        self.assertIs(warning.process(), True)
        self.assert_delivered(picking, 5)

    def test_immediate_flow_can_require_an_additional_expired_batch_decision(self):
        self.lot.expiration_date = fields.Datetime.now() - timedelta(days=1)
        picking = self.picking()
        self.reserve(picking)
        immediate = self.wizard(picking.button_validate(), 'stock.immediate.transfer')
        warning = self.wizard(immediate.process(), 'expiry.picking.confirmation')
        self.assertEqual(warning.picking_ids, picking)
        self.assertEqual(picking.move_ids.quantity_done, 5)
        self.assertEqual(self.source_stock(), 10)
        self.assertIs(warning.process_no_expired(), True)
        self.assertEqual(self.sale_line.qty_delivered, 0)

    def test_backorder_choice_does_not_bypass_expired_batch_decision(self):
        self.lot.expiration_date = fields.Datetime.now() - timedelta(days=1)
        picking = self.picking()
        self.reserve(picking, 2)
        backorder = self.wizard(picking.button_validate(), 'stock.backorder.confirmation')
        warning = self.wizard(backorder.process_cancel_backorder(), 'expiry.picking.confirmation')
        self.assertEqual(self.source_stock(), 10)
        self.assertIs(warning.process_no_expired(), True)
        self.assertEqual(picking.state, 'assigned')
        self.assertEqual(self.sale_line.qty_delivered, 0)
        self.assertFalse(self.env['stock.picking'].search([('backorder_id', '=', picking.id)]))

    def test_internal_batch_shortage_is_rejected_before_bahmni_review(self):
        destination = self.env['stock.location'].create({'name': 'QorliaQA Validation ward',
            'usage': 'internal', 'company_id': self.env.company.id})
        picking = self.picking(self.internal_type, quantity=11, destination=destination)
        picking.action_confirm()
        self.env['stock.move.line'].with_user(self.user).create({'picking_id': picking.id,
            'move_id': picking.move_ids.id, 'product_id': self.product.id, 'product_uom_id': self.product.uom_id.id,
            'qty_done': 11, 'lot_id': self.lot.id, 'location_id': picking.location_id.id,
            'location_dest_id': picking.location_dest_id.id})
        with self.assertRaisesRegex(UserError, 'Insufficient batch'), self.env.cr.savepoint():
            picking.button_validate()
        self.assertEqual(self.source_stock(), 10)

    def test_complete_wizard_flow_can_be_previewed_without_stock_or_callback_commit(self):
        picking = self.picking()
        self.reserve(picking)
        self.env.flush_all()
        counts = {name: self.env[name].search_count([]) for name in
            ('stock.picking', 'stock.move', 'stock.move.line', 'stock.quant', 'stock.valuation.layer', 'account.move',
                'stock.immediate.transfer', 'stock.immediate.transfer.line', 'mail.message')}
        cr = self.env.cr
        hooks = {name: getattr(cr, name) for name in ('precommit', 'postcommit', 'prerollback', 'postrollback')}
        lengths = {name: len(callbacks._funcs) for name, callbacks in hooks.items()}
        try:
            for name in hooks:
                setattr(cr, name, tools.Callbacks())
            with closing(cr.savepoint()):
                wizard = self.wizard(picking.button_validate(), 'stock.immediate.transfer')
                wizard.process()
                cr.flush()
                self.assertEqual(picking.state, 'done')
                self.assertEqual(self.source_stock(), 5)
                cr.postcommit.add(lambda: self.fail('A rolled-back validation callback escaped.'))
        finally:
            for name, callbacks in hooks.items():
                setattr(cr, name, callbacks)
            self.env.invalidate_all()
        self.assertEqual(counts, {name: self.env[name].search_count([]) for name in counts})
        self.assertEqual(picking.state, 'assigned')
        self.assertEqual(self.source_stock(), 10)
        self.assertEqual(self.sale_line.qty_delivered, 0)
        for name, callbacks in hooks.items():
            self.assertIs(getattr(cr, name), callbacks)
            self.assertEqual(len(callbacks._funcs), lengths[name])
