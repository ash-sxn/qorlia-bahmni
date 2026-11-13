# SPDX-License-Identifier: LGPL-3.0-or-later
# Copyright 2026 Qorlia contributors.
import copy
import uuid
from unittest.mock import patch

from odoo.exceptions import AccessError, UserError, ValidationError
from odoo.tests import TransactionCase, tagged


@tagged('post_install', '-at_install')
class StockRequestStopTest(TransactionCase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.customer = cls.env['res.partner'].create({'name': 'QorliaQA Request stop customer'})
        cls.product = cls.env['product.product'].create({'name': 'QorliaQA Request stop medicine',
            'type': 'product', 'tracking': 'lot', 'taxes_id': [(6, 0, [])]})
        cls.shop = cls.env['sale.shop'].search([('company_id', '=', cls.env.company.id)], limit=1)
        cls.warehouse = cls.shop.warehouse_id
        cls.warehouse.out_type_id.reservation_method = 'manual'
        cls.order = cls.env['sale.order'].create({'partner_id': cls.customer.id, 'shop_id': cls.shop.id})
        cls.sale_line = cls.env['sale.order.line'].create({'order_id': cls.order.id,
            'product_id': cls.product.id, 'product_uom_qty': 5, 'price_unit': 10})
        cls.group = cls.env['procurement.group'].create({'name': 'QorliaQA Request stop group', 'sale_id': cls.order.id})
        cls.picking = cls.env['stock.picking'].create({'picking_type_id': cls.warehouse.out_type_id.id,
            'partner_id': cls.customer.id, 'location_id': cls.warehouse.lot_stock_id.id,
            'location_dest_id': cls.customer.property_stock_customer.id, 'origin': cls.order.name})
        cls.move = cls.env['stock.move'].create({'name': cls.product.name, 'picking_id': cls.picking.id,
            'product_id': cls.product.id, 'product_uom': cls.product.uom_id.id, 'product_uom_qty': 5,
            'sale_line_id': cls.sale_line.id, 'group_id': cls.group.id,
            'location_id': cls.picking.location_id.id, 'location_dest_id': cls.picking.location_dest_id.id})
        cls.lot = cls.env['stock.lot'].create({'name': 'QorliaQA Request stop batch', 'product_id': cls.product.id,
            'company_id': cls.env.company.id, 'expiration_date': '2027-01-01 00:00:00'})
        cls.env['stock.quant']._update_available_quantity(cls.product, cls.picking.location_id, 10, lot_id=cls.lot)
        cls.user = cls.env['res.users'].with_context(no_reset_password=True).create({
            'name': 'QorliaQA Request stop staff', 'login': 'qorliaqa-request-stop-staff',
            'company_id': cls.env.company.id, 'company_ids': [(6, 0, cls.env.company.ids)],
            'groups_id': [(6, 0, [cls.env.ref(name).id for name in ('sales_team.group_sale_manager',
                'stock.group_stock_user', 'stock.group_production_lot')])],
        })

    def api(self, user=None):
        return self.env['stock.picking'].with_user(user or self.user)

    def method(self, kind, action, user=None):
        return getattr(self.api(user), 'qorlia_%s_paged_%s' % (kind, action))

    def request(self, kind):
        if kind != 'confirmation':
            self.picking.action_confirm()
        if kind == 'operation':
            self.picking.action_assign()
            view = self.method(kind, 'load')(self.order.id, self.picking.id, self.move.id, self.picking.move_line_ids.id)
            data = {key: view[key] for key in ('order_id', 'transfer_id', 'move_id', 'operation_id', 'version')}
            data.update(action='save', edits=[{'field': 'qty_done', 'value': 1}])
        else:
            view = self.method(kind, 'load')(self.order.id, self.picking.id)
            data = {key: view[key] for key in ('order_id', 'transfer_id', 'version')}
            if kind == 'reservation':
                data['action'] = 'assign'
        page = self.method(kind, 'review')(**data) if kind == 'confirmation' else self.method(kind, 'review')(data)
        while page['next_after'] is not False:
            kwargs = {'after': page['next_after'], 'review_version': page['review_version'],
                'continuation_token': page['continuation_token']}
            page = self.method(kind, 'review')(**data, **kwargs) if kind == 'confirmation' else self.method(kind, 'review')(data, **kwargs)
        return {**data, 'review_version': page['review_version'], 'review_complete_token': page['review_complete_token'],
            'request_key': str(uuid.uuid4())}

    def stamp(self):
        self.env.cr.flush()
        return self.picking._qorlia_confirmation_stamp(sorted(set(self.picking._qorlia_operation_paged_tables())
            | {'account_analytic_applicability'}))

    def row(self):
        self.env.cr.execute('SELECT to_jsonb(record) FROM stock_picking record WHERE id = %s', [self.picking.id])
        return self.env.cr.fetchone()[0]

    def stop_only(self, kind):
        request = self.request(kind)
        before = self.stamp()
        row = self.row()
        result = self.method(kind, 'stop')(request)
        self.assertEqual(result, {'request_key': request['request_key'], 'stopped': True, 'accepted': False})
        self.assertEqual(before | {'stock_picking': self.stamp()['stock_picking']}, self.stamp())
        current = self.row()
        field = 'qorlia_%s_receipts' % kind
        expected = {**row, field: current[field], 'write_uid': current['write_uid'], 'write_date': current['write_date']}
        self.assertEqual(current, expected)
        marker = current[field]['stop:%s:%s' % (self.user.id, request['request_key'])]
        self.assertEqual(marker['kind'], 'qorlia.paged-%s.v1.stopped' % kind)
        self.assertEqual(marker['author'], self.user.id)
        self.assertNotIn(request['request_key'], current[field])
        stopped = self.stamp()
        self.assertEqual(self.method(kind, 'stop')(request), result)
        for action in ('save', 'status', 'references'):
            with self.assertRaises(UserError):
                self.method(kind, action)(request)
        self.assertEqual(self.stamp(), stopped)
        self.assertEqual(self.sale_line.qty_delivered, 0)

    def test_stop_confirmation_is_metadata_only_and_prevents_late_dispatch(self):
        self.stop_only('confirmation')

    def test_stop_reservation_is_metadata_only_and_prevents_late_dispatch(self):
        self.stop_only('reservation')

    def test_stop_operation_is_metadata_only_and_prevents_late_dispatch(self):
        self.stop_only('operation')

    def accepted(self, kind):
        request = self.request(kind)
        saved = self.method(kind, 'save')(request)
        before = self.stamp()
        self.assertEqual(self.method(kind, 'stop')(request),
            {'request_key': request['request_key'], 'stopped': False, 'accepted': True})
        self.assertEqual(self.method(kind, 'save')(request), saved)
        self.assertEqual(self.stamp(), before)

    def test_stop_cannot_reverse_accepted_confirmation(self):
        self.accepted('confirmation')

    def test_stop_cannot_reverse_accepted_reservation(self):
        self.accepted('reservation')

    def test_stop_cannot_reverse_accepted_operation(self):
        self.accepted('operation')

    def test_stale_or_invalid_proof_can_be_stopped_without_replaying_native_action(self):
        request = self.request('confirmation')
        self.move.product_uom_qty = 7
        request['review_complete_token'] = '0' * 64
        with patch.object(type(self.picking), '_qorlia_confirmation_native', side_effect=AssertionError('Do not apply stock.')):
            self.assertTrue(self.method('confirmation', 'stop')(request)['stopped'])
        self.assertEqual(self.move.state, 'draft')
        self.assertEqual(self.move.product_uom_qty, 7)

    def test_another_authors_guessed_nonce_does_not_retire_the_original_authors_nonce(self):
        request = self.request('confirmation')
        other = self.user.copy({'login': 'qorliaqa-request-stop-other', 'name': 'QorliaQA Other stop author'})
        self.assertTrue(self.method('confirmation', 'stop', other)(request)['stopped'])
        self.assertFalse(self.method('confirmation', 'status')(request)['accepted'])
        # Receipt metadata changes snapshot versions, but cannot retire another author's nonce.
        fresh = {**self.request('confirmation'), 'request_key': request['request_key']}
        self.assertTrue(self.method('confirmation', 'save')(fresh)['accepted'])
        # The other author sees only its own stopped request, not the accepted receipt.
        self.assertTrue(self.method('confirmation', 'stop', other)(request)['stopped'])
        with self.assertRaises(UserError):
            self.method('confirmation', 'status', other)(request)

    def test_changed_intent_with_same_actor_key_cannot_reinterpret_a_stop(self):
        request = self.request('reservation')
        self.method('reservation', 'stop')(request)
        for changed in ({'action': 'unreserve'}, {'review_version': '0' * 64}, {'review_complete_token': '1' * 64}):
            with self.assertRaises(ValidationError):
                self.method('reservation', 'stop')({**request, **changed})
            with self.assertRaises(ValidationError):
                self.method('reservation', 'save')({**request, **changed})

    def test_exact_shape_and_caller_context_cannot_select_receipt_storage(self):
        request = self.request('operation')
        for changed in ({'context': {}}, {'receipt_field': 'qorlia_confirmation_receipts'}, {'request_key': 'bad'}):
            with self.assertRaises(ValidationError):
                self.method('operation', 'stop')({**request, **changed})
        caller = self.api().with_context(default_qty_done=99, tracking_disable=True,
            qorlia_operation_receipt_token=True, default_qorlia_operation_receipts={})
        self.assertTrue(caller.qorlia_operation_paged_stop(request)['stopped'])
        self.assertEqual(self.picking.move_line_ids.qty_done, 0)

    def test_stop_checks_role_write_rule_company_and_transfer_scope(self):
        request = self.request('confirmation')
        with self.assertRaises(AccessError):
            self.method('confirmation', 'stop', self.env.ref('base.public_user'))(request)
        users, has_group = type(self.user), type(self.user).has_group
        def without_stock(records, group):
            return False if group == 'stock.group_stock_user' else has_group(records, group)
        with patch.object(users, 'has_group', without_stock):
            with self.assertRaises(AccessError):
                self.method('confirmation', 'stop')(request)
        company = self.env['res.company'].create({'name': 'QorliaQA Stop foreign company'})
        with self.assertRaises(AccessError):
            self.api().with_context(allowed_company_ids=company.ids).qorlia_confirmation_paged_stop(request)
        model = type(self.picking)
        original = model.check_access_rule
        def denied(records, operation):
            if operation == 'write':
                raise AccessError('QorliaQA Stop write denied.')
            return original(records, operation)
        with patch.object(model, 'check_access_rule', denied):
            with self.assertRaises(AccessError):
                self.method('confirmation', 'stop')(request)
        foreign = self.order.copy()
        with self.assertRaisesRegex(UserError, 'no longer linked to this order'):
            self.method('confirmation', 'stop')({**request, 'order_id': foreign.id})
        self.assertFalse(self.picking.qorlia_confirmation_receipts)

    def test_unreviewed_stock_write_rolls_back_the_stop_and_all_business_changes(self):
        request = self.request('confirmation')
        before = self.stamp()
        model, original = type(self.picking), type(self.picking).write
        def noisy(records, values):
            result = original(records, values)
            if 'qorlia_confirmation_receipts' in values:
                self.env['stock.quant'].search([('product_id', '=', self.product.id)]).quantity = 99
            return result
        with patch.object(model, 'write', noisy):
            with self.assertRaises(UserError):
                self.method('confirmation', 'stop')(request)
        self.assertEqual(self.stamp(), before)

    def test_deferred_callbacks_cannot_escape_a_stop_and_original_queues_are_restored(self):
        request = self.request('confirmation')
        before = self.stamp()
        cr = self.env.cr
        hooks = {name: getattr(cr, name) for name in ('precommit', 'postcommit', 'prerollback', 'postrollback')}
        model, original = type(self.picking), type(self.picking).write
        called = []
        def noisy(records, values):
            result = original(records, values)
            if 'qorlia_confirmation_receipts' in values:
                cr.postcommit.add(lambda: called.append(True))
            return result
        with patch.object(model, 'write', noisy):
            with self.assertRaises(UserError):
                self.method('confirmation', 'stop')(request)
        self.assertFalse(called)
        self.assertEqual(self.stamp(), before)
        for name, callbacks in hooks.items():
            self.assertIs(getattr(cr, name), callbacks)

    def test_receipt_write_exception_preserves_original_queues_and_rows(self):
        request = self.request('confirmation')
        before = self.stamp()
        cr = self.env.cr
        hooks = {name: (getattr(cr, name), list(getattr(cr, name)._funcs), copy.deepcopy(getattr(cr, name).data))
            for name in ('precommit', 'postcommit', 'prerollback', 'postrollback')}
        model, original = type(self.picking), type(self.picking).write
        def failing(records, values):
            original(records, values)
            if 'qorlia_confirmation_receipts' in values:
                cr.postcommit.add(lambda: None)
                raise UserError('QorliaQA Stop write failed.')
        with patch.object(model, 'write', failing):
            with self.assertRaises(UserError):
                self.method('confirmation', 'stop')(request)
        self.assertEqual(self.stamp(), before)
        for name, (callbacks, functions, data) in hooks.items():
            self.assertIs(getattr(cr, name), callbacks)
            self.assertEqual(list(callbacks._funcs), functions)
            self.assertEqual(callbacks.data, data)

    def test_large_inventory_stop_does_not_need_a_fresh_native_preview(self):
        request = self.request('operation')
        lots = self.env['stock.lot'].create([{'name': 'QorliaQA Stop tail %s' % index,
            'product_id': self.product.id, 'company_id': self.env.company.id} for index in range(2000)])
        self.env['stock.quant'].create([{'product_id': self.product.id, 'location_id': self.picking.location_id.id,
            'lot_id': lot.id, 'quantity': 1} for lot in lots])
        with patch.object(type(self.picking), '_qorlia_operation_paged_preview', side_effect=AssertionError('Do not re-preview.')):
            self.assertTrue(self.method('operation', 'stop')(request)['stopped'])
        self.assertEqual(sum(self.env['stock.quant'].search([('product_id', '=', self.product.id)]).mapped('quantity')), 2010)

    def test_an_accepted_legacy_collision_is_not_overwritten_by_stop(self):
        request = self.request('reservation')
        loaded = self.api().qorlia_transfer_load(self.order.id, self.picking.id)
        reviewed = self.api().qorlia_transfer_preview(self.order.id, self.picking.id, loaded['version'], 'assign')
        legacy = {key: reviewed[key] for key in ('order_id', 'transfer_id', 'version', 'action', 'review_version')}
        legacy['request_key'] = request['request_key']
        self.api().qorlia_transfer_run(**legacy)
        before = self.stamp()
        with self.assertRaises(ValidationError):
            self.method('reservation', 'stop')(request)
        self.assertEqual(self.stamp(), before)
