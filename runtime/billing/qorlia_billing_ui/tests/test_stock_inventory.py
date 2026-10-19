# SPDX-License-Identifier: LGPL-3.0-or-later
# Copyright 2026 Qorlia contributors.
from unittest.mock import patch
import uuid

from odoo.exceptions import AccessError, UserError, ValidationError
from odoo.tests import TransactionCase, tagged

from .test_stock_validation_contract import StockValidationFixture


class StockInventoryFixture(StockValidationFixture):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.reader = cls.env['res.users'].with_context(no_reset_password=True).create({
            'name': 'QorliaQA Inventory stock reader', 'login': 'qorliaqa-inventory-stock-reader',
            'company_id': cls.env.company.id, 'company_ids': [(6, 0, cls.env.company.ids)],
            'groups_id': [(6, 0, [cls.env.ref('stock.group_stock_user').id])]})

    def page(self, **kwargs):
        return self.env['stock.picking'].with_user(self.reader).qorlia_inventory_transfers(**kwargs)

    def empty(self, kind=None, **values):
        kind = kind or self.internal_type
        return self.env['stock.picking'].create({'picking_type_id': kind.id,
            'location_id': self.warehouse.lot_stock_id.id, 'location_dest_id': self.warehouse.lot_stock_id.id,
            'origin': 'QorliaQA Inventory', **values})

    def stamp(self):
        self.env.cr.flush()
        return self.env['stock.picking']._qorlia_confirmation_stamp(
            self.env['stock.picking']._qorlia_return_paged_tables())


@tagged('post_install', '-at_install')
class StockInventoryConfirmationTest(StockInventoryFixture, TransactionCase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.reader.email = 'qorliaqa-inventory-stock-reader@example.invalid'

    def unlinked(self, kind=None):
        picking = self.picking(kind).with_env(self.env)
        if kind and kind.code == 'internal':
            destination = self.env['stock.location'].create({'name': 'QorliaQA Inventory internal destination',
                'usage': 'internal', 'location_id': self.warehouse.view_location_id.id,
                'company_id': self.env.company.id})
            self.assertEqual(destination.usage, 'internal')
            picking.location_dest_id = destination
            picking.move_ids.location_dest_id = destination
        picking.move_ids.sale_line_id = False
        self.assertFalse(picking.sale_id)
        return picking.with_user(self.reader)

    def api(self):
        return self.env['stock.picking'].with_user(self.reader)

    def review_request(self, picking, limit=100, actor=None):
        api = self.env['stock.picking'].with_user(actor or self.reader)
        loaded = api.qorlia_confirmation_paged_load(False, picking.id)
        self.assertIs(loaded['order_id'], False)
        self.assertFalse(loaded['reason'])
        self.assertTrue(loaded['write_ready'])
        after, version, token = 0, False, False
        pages = []
        while True:
            page = api.qorlia_confirmation_paged_review(False, picking.id,
                loaded['version'], after, version, token, limit)
            self.assertIs(page['order_id'], False)
            pages.append(page)
            if page['next_after'] is False:
                break
            after, version, token = page['next_after'], page['review_version'], page['continuation_token']
        request = {key: pages[-1][key] for key in
            ('order_id', 'transfer_id', 'version', 'review_version', 'review_complete_token')}
        request['request_key'] = str(uuid.uuid4())
        return loaded, pages, request

    def test_receipt_delivery_and_internal_confirm_without_a_sales_order(self):
        for kind in (self.in_type, self.out_type, self.internal_type):
            with self.subTest(kind=kind.code):
                picking = self.unlinked(kind)
                loaded, pages, request = self.review_request(picking)
                self.assertEqual(loaded, self.api().qorlia_confirmation_paged_load(False, picking.id))
                self.assertEqual(picking.state, 'draft')
                self.assertTrue(pages[-1]['review_complete_token'])
                self.assertFalse(self.api().qorlia_confirmation_paged_status(request)['accepted'])
                accepted = self.api().qorlia_confirmation_paged_save(request)
                self.assertTrue(accepted['accepted'])
                self.assertEqual(picking.state, accepted['state_after'])
                self.assertIs(accepted['current']['order_id'], False)
                self.assertEqual(self.api().qorlia_confirmation_paged_save(request), accepted)
                self.assertEqual(self.api().qorlia_confirmation_paged_status(request), accepted)
                self.assertFalse(picking.sale_id)
                self.assertNotIn(picking.state, ('draft', 'done', 'cancel'))
                self.assertEqual(sum(picking.move_ids.mapped('quantity_done')), 0)
        self.assertEqual(self.source_stock(), 10)
        self.assertEqual(self.sale_line.qty_delivered, 0)

    def test_at_confirm_reservation_and_complete_generated_reference_recovery(self):
        self.out_type.reservation_method = 'at_confirm'
        picking = self.unlinked()
        _loaded, _pages, request = self.review_request(picking)
        accepted = self.api().qorlia_confirmation_paged_save(request)
        self.assertEqual(accepted['state_after'], 'assigned')
        self.assertEqual(sum(picking.move_line_ids.mapped('reserved_uom_qty')), 5)
        self.assertEqual(picking.move_line_ids.lot_id, self.lot)
        references = self.api().qorlia_confirmation_paged_references(request, limit=1)
        self.assertEqual(references['total_count'], 1)
        self.assertIs(references['next_after'], False)
        self.assertEqual(references['rows'][0]['id'], picking.move_line_ids.id)
        self.assertEqual(self.api().qorlia_confirmation_paged_stop(request),
            {'request_key': request['request_key'], 'stopped': False, 'accepted': True})
        self.assertEqual(self.source_stock(), 10)
        self.assertEqual(self.sale_line.qty_delivered, 0)

    def test_stop_is_exact_idempotent_and_does_not_confirm_or_undo_stock(self):
        picking = self.unlinked()
        _loaded, _pages, request = self.review_request(picking)
        stopped = self.api().qorlia_confirmation_paged_stop(request)
        self.assertEqual(stopped, {'request_key': request['request_key'], 'stopped': True, 'accepted': False})
        self.assertEqual(self.api().qorlia_confirmation_paged_stop(request), stopped)
        for name in ('qorlia_confirmation_paged_save', 'qorlia_confirmation_paged_status'):
            with self.assertRaises(UserError):
                getattr(self.api(), name)(request)
        self.assertEqual(picking.state, 'draft')
        self.assertEqual(self.source_stock(), 10)

    def test_false_is_the_only_orderless_identity_and_legacy_paths_stay_order_scoped(self):
        picking = self.unlinked()
        _loaded, _pages, request = self.review_request(picking)
        for invalid in (0, True, None, '', [], {}, -1):
            with self.subTest(invalid=invalid), self.assertRaises(ValidationError):
                self.api().qorlia_confirmation_paged_status(dict(request, order_id=invalid))
        with self.assertRaises(ValidationError):
            self.api()._qorlia_confirmation_request({key: value for key, value in request.items()
                if key != 'review_complete_token'})
        for name in ('qorlia_transfer_load', 'qorlia_confirmation_load'):
            with self.assertRaises(ValidationError):
                getattr(self.api(), name)(False, picking.id)

    def test_order_and_global_proofs_cannot_be_swapped_even_for_a_linked_transfer(self):
        picking = self.picking()
        group = self.env['procurement.group'].create({'name': 'QorliaQA Inventory linked order',
            'sale_id': self.order.id, 'partner_id': self.customer.id})
        picking.with_env(self.env).group_id = group
        picking.move_ids.with_env(self.env).group_id = group
        self.assertEqual(picking.sale_id, self.order)
        loaded = self.env['stock.picking'].with_user(self.user).qorlia_confirmation_paged_load(self.order.id, picking.id)
        api = self.env['stock.picking'].with_user(self.user)
        global_loaded = api.qorlia_confirmation_paged_load(False, picking.id)
        self.assertNotEqual(loaded['version'], global_loaded['version'])
        with self.assertRaises(UserError):
            api.qorlia_confirmation_paged_review(False, picking.id, loaded['version'])
        _loaded, _pages, request = self.review_request(picking, actor=self.user)
        with self.assertRaises(UserError):
            self.env['stock.picking'].with_user(self.user).qorlia_confirmation_paged_save(
                dict(request, order_id=self.order.id))
        self.assertEqual(picking.state, 'draft')

    def test_changed_inventory_and_configuration_reject_review_without_mutation(self):
        picking = self.unlinked()
        _loaded, _pages, request = self.review_request(picking)
        self.env['stock.quant']._update_available_quantity(self.product, picking.location_id, 1, lot_id=self.lot)
        before = self.stamp()
        with self.assertRaises(UserError):
            self.api().qorlia_confirmation_paged_save(request)
        self.assertEqual(self.stamp(), before)
        _loaded, _pages, request = self.review_request(picking)
        self.out_type.reservation_method = 'at_confirm'
        before = self.stamp()
        with self.assertRaises(UserError):
            self.api().qorlia_confirmation_paged_save(request)
        self.assertEqual(self.stamp(), before)

    def test_stock_role_and_write_denials_are_preserved(self):
        picking = self.unlinked()
        for group in ('base.group_user', 'base.group_portal'):
            denied = self.env['res.users'].with_context(no_reset_password=True).create({
                'name': 'QorliaQA Inventory denied', 'login': 'qorliaqa-confirmation-' + group,
                'groups_id': [(6, 0, self.env.ref(group).ids)]})
            with self.assertRaises(AccessError):
                self.env['stock.picking'].with_user(denied).qorlia_confirmation_paged_load(False, picking.id)
        _loaded, _pages, request = self.review_request(picking)
        self.env['ir.rule'].create({'name': 'QorliaQA Inventory no confirmation writes',
            'model_id': self.env['ir.model']._get_id('stock.picking'),
            'domain_force': "[('id', '!=', %s)]" % picking.id,
            'perm_read': False, 'perm_create': False, 'perm_write': True, 'perm_unlink': False})
        loaded = self.api().qorlia_confirmation_paged_load(False, picking.id)
        self.assertTrue(loaded['reason'])
        for name in ('qorlia_confirmation_paged_save', 'qorlia_confirmation_paged_stop'):
            with self.assertRaises(AccessError):
                getattr(self.api(), name)(request)
        self.assertEqual(picking.state, 'draft')

    def test_operation_field_denial_prevents_load_and_review(self):
        picking = self.unlinked()
        loaded = self.api().qorlia_confirmation_paged_load(False, picking.id)
        original = type(self.env['stock.move.line']).check_field_access_rights
        def denied(records, operation, fields=None):
            if operation == 'read' and fields and 'qty_done' in fields:
                raise AccessError('QorliaQA denied operation quantity field')
            return original(records, operation, fields)
        with patch.object(type(self.env['stock.move.line']), 'check_field_access_rights', denied):
            for run in (lambda: self.api().qorlia_confirmation_paged_load(False, picking.id),
                    lambda: self.api().qorlia_confirmation_paged_review(False, picking.id, loaded['version'])):
                with self.assertRaises(AccessError):
                    run()
        self.assertEqual(picking.state, 'draft')

    def test_hidden_move_rejects_the_entire_confirmation_scope(self):
        picking = self.unlinked()
        self.env['ir.rule'].create({'name': 'QorliaQA Inventory hidden confirmation move',
            'model_id': self.env['ir.model']._get_id('stock.move'),
            'domain_force': "[('id', '!=', %s)]" % picking.move_ids.id,
            'perm_read': True, 'perm_create': False, 'perm_write': False, 'perm_unlink': False})
        with self.assertRaises(AccessError):
            self.api().qorlia_confirmation_paged_load(False, picking.id)

    def test_pages_require_the_original_continuation_before_save(self):
        picking = self.unlinked()
        loaded, pages, request = self.review_request(picking, limit=1)
        self.assertGreater(len(pages), 1)
        with self.assertRaises(UserError):
            self.api().qorlia_confirmation_paged_save(dict(request, review_complete_token='a' * 64))
        with self.assertRaises(UserError):
            self.api().qorlia_confirmation_paged_review(False, picking.id, loaded['version'],
                1, pages[0]['review_version'], 'a' * 64, 1)
        self.assertEqual(picking.state, 'draft')

    def test_foreign_company_and_other_authors_cannot_recover_the_request(self):
        picking = self.unlinked()
        _loaded, _pages, request = self.review_request(picking)
        accepted = self.api().qorlia_confirmation_paged_save(request)
        with self.assertRaises(ValidationError):
            self.env['stock.picking'].with_user(self.user).qorlia_confirmation_paged_status(request)
        self.assertTrue(accepted['accepted'])
        other = self.env['res.company'].create({'name': 'QorliaQA Inventory other company'})
        warehouse = self.env['stock.warehouse'].search([('company_id', '=', other.id)], limit=1)
        if not warehouse:
            warehouse = self.env['stock.warehouse'].create({'name': 'QorliaQA Inventory other warehouse',
                'code': 'QGC', 'company_id': other.id})
        foreign = self.env['stock.picking'].with_company(other).create({'picking_type_id': warehouse.int_type_id.id,
            'location_id': warehouse.lot_stock_id.id, 'location_dest_id': warehouse.lot_stock_id.id})
        with self.assertRaises(AccessError):
            self.api().qorlia_confirmation_paged_load(False, foreign.id)


@tagged('post_install', '-at_install')
class StockInventoryPreparationTest(StockInventoryFixture, TransactionCase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.reader.email = 'qorliaqa-inventory-stock-reader@example.invalid'

    unlinked = StockInventoryConfirmationTest.unlinked
    api = StockInventoryConfirmationTest.api

    def request(self, picking, action='assign', limit=100):
        loaded = self.api().qorlia_reservation_paged_load(False, picking.id)
        self.assertIs(loaded['order_id'], False)
        self.assertFalse(loaded['reasons'][action])
        data = {'order_id': False, 'transfer_id': picking.id, 'version': loaded['version'], 'action': action}
        after, version, token, pages = 0, False, False, []
        while True:
            page = self.api().qorlia_reservation_paged_review(data, after, version, token, limit)
            pages.append(page)
            if page['next_after'] is False:
                break
            after, version, token = page['next_after'], page['review_version'], page['continuation_token']
        return pages, dict(data, review_version=pages[-1]['review_version'],
            review_complete_token=pages[-1]['review_complete_token'], request_key=str(uuid.uuid4()))

    def test_outgoing_and_internal_full_preparation_cycle_preserves_physical_stock(self):
        for kind in (self.out_type, self.internal_type):
            picking = self.unlinked(kind)
            picking.action_confirm()
            for action in ('assign', 'set_quantities', 'clear_quantities', 'unreserve'):
                with self.subTest(operation=kind.code, action=action):
                    state = picking.state
                    _pages, request = self.request(picking, action)
                    self.assertEqual(picking.state, state)
                    self.assertFalse(self.api().qorlia_reservation_paged_status(request)['accepted'])
                    accepted = self.api().qorlia_reservation_paged_save(request)
                    self.assertTrue(accepted['accepted'])
                    self.assertIs(accepted['current']['order_id'], False)
                    self.assertEqual(accepted, self.api().qorlia_reservation_paged_status(request))
                    self.assertEqual(accepted, self.api().qorlia_reservation_paged_save(request))
                    references = self.api().qorlia_reservation_paged_references(request)
                    self.assertEqual(references['total_count'], accepted['reference_count'])
                    self.assertEqual(sum(picking.move_line_ids.mapped('qty_done')), 5 if action == 'set_quantities' else 0)
                    self.assertFalse(picking.sale_id)
                    self.assertNotIn(picking.state, ('done', 'cancel'))
                    self.assertEqual(self.source_stock(), 10)
                    self.assertEqual(self.sale_line.qty_delivered, 0)

    def test_receipt_uses_native_action_availability_not_an_outgoing_assumption(self):
        picking = self.unlinked(self.in_type)
        picking.action_confirm()
        loaded = self.api().qorlia_reservation_paged_load(False, picking.id)
        self.assertTrue(loaded['reasons']['unreserve'])
        self.assertEqual(loaded['reasons'], picking._qorlia_reservation_reasons())
        picking.action_set_quantities_to_reservation()
        native_done = sum(picking.move_line_ids.mapped('qty_done'))
        self.assertEqual(native_done, 0)
        _pages, request = self.request(picking, 'set_quantities')
        self.assertTrue(self.api().qorlia_reservation_paged_save(request)['accepted'])
        # Native tracked receipts without prepared batches do not invent received quantities.
        self.assertEqual(sum(picking.move_line_ids.mapped('qty_done')), native_done)
        self.assertEqual(self.source_stock(), 10)

    def test_unaccepted_stop_and_accepted_stop_are_exact_and_idempotent(self):
        picking = self.unlinked()
        picking.action_confirm()
        _pages, request = self.request(picking)
        stopped = self.api().qorlia_reservation_paged_stop(request)
        self.assertTrue(stopped['stopped'])
        self.assertEqual(self.api().qorlia_reservation_paged_stop(request), stopped)
        with self.assertRaises(UserError):
            self.api().qorlia_reservation_paged_save(request)
        _pages, second = self.request(picking)
        self.api().qorlia_reservation_paged_save(second)
        self.assertEqual(self.api().qorlia_reservation_paged_stop(second),
            {'request_key': second['request_key'], 'stopped': False, 'accepted': True})

    def test_only_explicit_false_is_accepted_and_legacy_identity_stays_strict(self):
        picking = self.unlinked()
        picking.action_confirm()
        _pages, request = self.request(picking)
        for invalid in (0, True, None, '', [], {}, -1):
            with self.subTest(value=invalid), self.assertRaises(ValidationError):
                self.api().qorlia_reservation_paged_status(dict(request, order_id=invalid))
        with self.assertRaises(ValidationError):
            self.api()._qorlia_reservation_request(**{key: value for key, value in request.items() if key != 'review_complete_token'})
        with self.assertRaises(ValidationError):
            self.api().qorlia_transfer_load(False, picking.id)

    def test_stale_inventory_and_incomplete_review_cannot_reserve(self):
        picking = self.unlinked()
        picking.action_confirm()
        _pages, request = self.request(picking, limit=1)
        with self.assertRaises(UserError):
            self.api().qorlia_reservation_paged_save(dict(request, review_complete_token='a' * 64))
        self.env['stock.quant']._update_available_quantity(self.product, picking.location_id, 1, lot_id=self.lot)
        before = self.stamp()
        with self.assertRaises(UserError):
            self.api().qorlia_reservation_paged_save(request)
        self.assertEqual(self.stamp(), before)

    def test_hidden_source_quant_rejects_without_reserving_a_visible_subset(self):
        picking = self.unlinked()
        picking.action_confirm()
        quant = self.env['stock.quant'].search([('product_id', '=', self.product.id), ('lot_id', '=', self.lot.id)])
        self.env['ir.rule'].create({'name': 'QorliaQA Hidden preparation quant',
            'model_id': self.env['ir.model']._get_id('stock.quant'), 'domain_force': "[('id', '!=', %s)]" % quant.id,
            'perm_read': True, 'perm_create': False, 'perm_write': False, 'perm_unlink': False})
        before = self.stamp()
        loaded = self.api().qorlia_reservation_paged_load(False, picking.id)
        self.assertFalse(loaded['write_ready'])
        self.assertTrue(all(loaded['reasons'].values()))
        self.assertEqual(self.stamp(), before)

    def test_write_denial_cannot_be_bypassed_by_review_or_stop(self):
        picking = self.unlinked()
        picking.action_confirm()
        _pages, request = self.request(picking)
        self.env['ir.rule'].create({'name': 'QorliaQA Denied preparation writes',
            'model_id': self.env['ir.model']._get_id('stock.picking'), 'domain_force': "[('id', '!=', %s)]" % picking.id,
            'perm_read': False, 'perm_create': False, 'perm_write': True, 'perm_unlink': False})
        for name in ('qorlia_reservation_paged_save', 'qorlia_reservation_paged_stop'):
            with self.assertRaises(AccessError):
                getattr(self.api(), name)(request)

    def test_foreign_author_and_changed_action_cannot_recover_an_exact_receipt(self):
        picking = self.unlinked()
        picking.action_confirm()
        _pages, request = self.request(picking)
        self.api().qorlia_reservation_paged_save(request)
        with self.assertRaises(ValidationError):
            self.env['stock.picking'].with_user(self.user).qorlia_reservation_paged_status(request)
        with self.assertRaises(ValidationError):
            self.api().qorlia_reservation_paged_status(dict(request, action='unreserve'))


@tagged('post_install', '-at_install')
class StockInventoryValidationTest(StockInventoryFixture, TransactionCase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.reader.email = 'qorliaqa-inventory-validation@example.invalid'

    unlinked = StockInventoryConfirmationTest.unlinked
    api = StockInventoryConfirmationTest.api

    def prepared(self, kind=None, done=None):
        picking = self.unlinked(kind)
        picking.action_confirm()
        picking.action_assign()
        self.assertEqual(picking.state, 'assigned')
        if done is not None:
            picking.move_line_ids.qty_done = done
        return picking

    def selection(self, picking, previous=None, decision=None):
        loaded = self.api().qorlia_validation_paged_load(False, picking.id)
        self.assertIs(loaded['order_id'], False)
        return {'order_id': False, 'transfer_id': picking.id, 'version': loaded['version'],
            'continuation_key': previous['request_key'] if previous else False,
            'decisions': [decision] if decision else []}

    def exact(self, picking, previous=None, decision=None, limit=100):
        data = self.selection(picking, previous, decision)
        after, version, token = 0, False, False
        while True:
            page = self.api().qorlia_validation_paged_review(data, after, version, token, limit)
            self.assertIs(page['order_id'], False)
            if page['next_after'] is False:
                return dict(data, review_version=page['review_version'],
                    review_complete_token=page['review_complete_token'], request_key=str(uuid.uuid4()))
            after, version, token = page['next_after'], page['review_version'], page['continuation_token']

    def test_delivery_and_internal_validation_move_real_stock_without_sales_access(self):
        self.assertFalse(self.reader.has_group('sales_team.group_sale_salesman'))
        for kind in (self.out_type, self.internal_type):
            with self.subTest(operation=kind.code):
                before = self.source_stock()
                picking = self.prepared(kind, 5)
                request = self.exact(picking)
                self.assertFalse(self.api().qorlia_validation_paged_status(request)['accepted'])
                saved = self.api().qorlia_validation_paged_save(request)
                self.assertIs(saved['current']['order_id'], False)
                self.assertTrue(saved['receipt']['terminal'])
                self.assertEqual((picking.state, self.source_stock()), ('done', before - 5))
                self.assertEqual(self.sale_line.qty_delivered, 0)
                self.assertFalse(picking.sale_id)
                self.assertEqual(saved, self.api().qorlia_validation_paged_save(request))
                self.assertEqual(saved, self.api().qorlia_validation_paged_status(request))
                self.assertEqual(saved, self.api().qorlia_validation_paged_stop(request))
                refs = self.api().qorlia_validation_paged_reference_page(request)
                self.assertEqual(refs['total_count'], saved['receipt']['reference_count'])

    def test_receipt_retains_native_prompt_prices_batch_and_real_references(self):
        picking = self.prepared(self.in_type, 5)
        picking.move_line_ids.write({'lot_id': False, 'lot_name': 'QorliaQA Global validation receiving batch',
            'expiration_date': '2027-02-01 00:00:00', 'cost_price': 2.5, 'sale_price': 5, 'mrp': 7})
        opening = self.exact(picking)
        accepted = self.api().qorlia_validation_paged_save(opening)
        self.assertEqual(accepted['receipt']['next_step']['kind'], 'receipt')
        prompt = self.api().qorlia_validation_paged_prompt_page(opening)
        self.assertEqual(prompt['rows'][0]['value']['qty_done'], 5)
        self.assertEqual(self.source_stock(), 10)
        finish = self.exact(picking, opening, {'kind': 'receipt', 'confirm': True}, limit=1)
        saved = self.api().qorlia_validation_paged_save(finish)
        self.assertTrue(saved['receipt']['terminal'])
        self.assertEqual(self.source_stock(), 15)
        batch = picking.with_env(self.env).move_line_ids.lot_id
        self.assertEqual((batch.cost_price, batch.sale_price, batch.mrp), (2.5, 5, 7))
        refs = self.api().qorlia_validation_paged_reference_page(finish)
        self.assertTrue(any(row['model'] == 'stock.lot' and row['id'] == batch.id for row in refs['rows']))
        self.assertEqual(saved, self.api().qorlia_validation_paged_save(finish))

    def test_immediate_preparation_survives_declining_later_expiry(self):
        self.lot.expiration_date = '2000-01-01 00:00:00'
        picking = self.prepared()
        opening = self.exact(picking)
        self.api().qorlia_validation_paged_save(opening)
        immediate = self.exact(picking, opening, {'kind': 'immediate', 'selected': True})
        result = self.api().qorlia_validation_paged_save(immediate)
        self.assertEqual(result['receipt']['next_step']['kind'], 'expiry')
        self.assertEqual((picking.move_line_ids.qty_done, self.source_stock()), (5, 10))
        declined = self.exact(picking, immediate, {'kind': 'expiry', 'proceed': False})
        terminal = self.api().qorlia_validation_paged_save(declined)
        self.assertTrue(terminal['receipt']['terminal'])
        self.assertEqual((picking.state, picking.move_line_ids.qty_done, self.source_stock()), ('assigned', 5, 10))

    def test_partial_validation_creates_the_native_orderless_backorder(self):
        picking = self.prepared(done=2)
        opening = self.exact(picking)
        self.api().qorlia_validation_paged_save(opening)
        finish = self.exact(picking, opening, {'kind': 'backorder', 'selected': True})
        self.assertTrue(self.api().qorlia_validation_paged_save(finish)['receipt']['terminal'])
        remainder = self.env['stock.picking'].search([('backorder_id', '=', picking.id)])
        self.assertEqual((len(remainder), sum(remainder.move_ids.mapped('product_uom_qty'))), (1, 3))
        self.assertFalse(remainder.sale_id)
        self.assertEqual((self.source_stock(), self.sale_line.qty_delivered), (8, 0))

    def test_stopped_continuation_preserves_the_accepted_parent_prompt(self):
        picking = self.prepared()
        opening = self.exact(picking)
        self.api().qorlia_validation_paged_save(opening)
        child = self.exact(picking, opening, {'kind': 'immediate', 'selected': True})
        stopped = self.api().qorlia_validation_paged_stop(child)
        self.assertTrue(stopped['stopped'])
        self.assertFalse(stopped['accepted'])
        self.assertEqual(stopped['receipt']['request_key'], opening['request_key'])
        self.assertEqual(stopped['receipt']['next_step']['kind'], 'immediate')
        self.assertEqual(self.api().qorlia_validation_paged_prompt_page(child)['receipt_key'], opening['request_key'])
        self.assertEqual(self.api().qorlia_validation_paged_reference_page(child)['receipt_key'], opening['request_key'])
        self.assertEqual(stopped, self.api().qorlia_validation_paged_stop(child))
        with self.assertRaises(UserError):
            self.api().qorlia_validation_paged_save(child)
        self.assertEqual((picking.move_line_ids.qty_done, self.source_stock()), (0, 10))

    def test_global_identity_is_literal_false_and_legacy_validation_stays_strict(self):
        picking = self.prepared()
        for value in (0, True, None, '', [], {}, -1):
            with self.subTest(value=value), self.assertRaises(ValidationError):
                self.api().qorlia_validation_paged_load(value, picking.id)
        request = self.exact(picking)
        legacy = {key: value for key, value in request.items() if key != 'review_complete_token'}
        with self.assertRaises(ValidationError):
            self.api().qorlia_validation_step_save(legacy)
        with self.assertRaises(ValidationError):
            self.api().qorlia_validation_save({key: value for key, value in legacy.items() if key != 'continuation_key'})

    def test_linked_transfer_global_and_order_proofs_cannot_be_swapped(self):
        picking = self.prepared(done=5)
        group = self.env['procurement.group'].create({'name': 'QorliaQA Global validation linked order',
            'sale_id': self.order.id, 'partner_id': self.customer.id})
        picking.with_env(self.env).group_id = group
        picking.move_ids.with_env(self.env).write({'group_id': group.id, 'sale_line_id': self.sale_line.id})
        loaded = self.api().qorlia_validation_paged_load(False, picking.id)
        ordered = self.env['stock.picking'].with_user(self.user).qorlia_validation_paged_load(self.order.id, picking.id)
        self.assertIs(loaded['order_id'], False)
        self.assertNotEqual(loaded['version'], ordered['version'])
        request = self.exact(picking)
        before = self.stamp()
        with self.assertRaises(UserError):
            self.env['stock.picking'].with_user(self.user).qorlia_validation_paged_save(dict(request, order_id=self.order.id))
        self.assertEqual(self.stamp(), before)

    def test_changed_scope_and_incomplete_proof_cannot_validate(self):
        picking = self.prepared(done=5)
        request = self.exact(picking, limit=1)
        with self.assertRaises(UserError):
            self.api().qorlia_validation_paged_save(dict(request, review_complete_token='a' * 64))
        picking.with_env(self.env).origin = 'QorliaQA Changed global validation source'
        before = self.stamp()
        with self.assertRaises(UserError):
            self.api().qorlia_validation_paged_save(request)
        self.assertEqual(self.stamp(), before)
        self.assertEqual(self.source_stock(), 10)

    def test_hidden_move_and_denied_transfer_writes_are_not_bypassed(self):
        picking = self.prepared(done=5)
        request = self.exact(picking)
        rule = self.env['ir.rule'].create({'name': 'QorliaQA Global validation hidden move',
            'model_id': self.env['ir.model']._get_id('stock.move'),
            'domain_force': "[('id', '!=', %s)]" % picking.move_ids.id,
            'perm_read': True, 'perm_write': False, 'perm_create': False, 'perm_unlink': False})
        with self.assertRaises(AccessError):
            self.api().qorlia_validation_paged_load(False, picking.id)
        rule.unlink()
        self.env['ir.rule'].create({'name': 'QorliaQA Global validation write denial',
            'model_id': self.env['ir.model']._get_id('stock.picking'),
            'domain_force': "[('id', '!=', %s)]" % picking.id,
            'perm_read': False, 'perm_write': True, 'perm_create': False, 'perm_unlink': False})
        with self.assertRaises(UserError):
            self.api().qorlia_validation_paged_save(request)
        with self.assertRaises(AccessError):
            self.api().qorlia_validation_paged_stop(request)

    def test_other_author_cannot_recover_the_accepted_global_receipt(self):
        picking = self.prepared(done=5)
        request = self.exact(picking)
        self.api().qorlia_validation_paged_save(request)
        with self.assertRaises(ValidationError):
            self.env['stock.picking'].with_user(self.user).qorlia_validation_paged_status(request)


@tagged('post_install', '-at_install')
class StockInventoryOperationTest(StockInventoryFixture, TransactionCase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.reader.write({'email': 'qorliaqa-inventory-operation@example.invalid',
            'groups_id': [(4, cls.env.ref('stock.group_production_lot').id)]})

    unlinked = StockInventoryConfirmationTest.unlinked
    api = StockInventoryConfirmationTest.api

    def load_form(self, picking, operation=False, move=None, actor=None):
        return self.env['stock.picking'].with_user(actor or self.reader).qorlia_operation_paged_load(
            False, picking.id, (move or picking.move_ids).id, operation)

    def exact(self, picking, edits, operation=False, action='save', limit=100):
        loaded = self.load_form(picking, operation)
        data = {key: loaded[key] for key in ('order_id', 'transfer_id', 'move_id', 'operation_id', 'version')}
        data.update(edits=edits, action=action)
        after, version, token = 0, False, False
        while True:
            page = self.api().qorlia_operation_paged_review(data, after, version, token, limit)
            self.assertIs(page['order_id'], False)
            self.assertIs(page['form']['order_id'], False)
            if page['next_after'] is False:
                return dict(data, review_version=page['review_version'],
                    review_complete_token=page['review_complete_token'], request_key=str(uuid.uuid4()))
            after, version, token = page['next_after'], page['review_version'], page['continuation_token']

    def test_create_edit_remove_all_three_operation_types_without_sales_access(self):
        self.assertFalse(self.reader.has_group('sales_team.group_sale_salesman'))
        for kind in (self.in_type, self.out_type, self.internal_type):
            with self.subTest(operation=kind.code):
                picking = self.unlinked(kind)
                picking.action_confirm()
                loaded = self.load_form(picking)
                self.assertIs(loaded['order_id'], False)
                edits = [{'field': 'qty_done', 'value': 1}]
                edits.append({'field': 'lot_name', 'value': 'QorliaQA New receiving batch'} if loaded['rules']['lot_name']['visible']
                    else {'field': 'lot_id', 'value': self.lot.id})
                request = self.exact(picking, edits)
                self.assertFalse(self.api().qorlia_operation_paged_status(request)['accepted'])
                saved = self.api().qorlia_operation_paged_save(request)
                self.assertTrue(saved['accepted'])
                line = self.env['stock.move.line'].browse(saved['operation_id'])
                self.assertEqual(line.qty_done, 1)
                self.assertEqual(saved, self.api().qorlia_operation_paged_save(request))
                self.assertEqual(saved, self.api().qorlia_operation_paged_status(request))
                refs = self.api().qorlia_operation_paged_references(request)
                self.assertEqual(refs['total_count'], saved['reference_count'])
                self.assertTrue(any(row['id'] == line.id for row in refs['rows']))
                changed = self.exact(picking, [{'field': 'qty_done', 'value': 2}], operation=line.id)
                self.assertTrue(self.api().qorlia_operation_paged_save(changed)['accepted'])
                self.assertEqual(line.qty_done, 2)
                deleted = self.exact(picking, [], operation=line.id, action='delete')
                self.assertTrue(self.api().qorlia_operation_paged_save(deleted)['accepted'])
                self.assertFalse(line.exists())
                self.assertFalse(picking.sale_id)
                self.assertEqual(self.source_stock(), 10)
                self.assertEqual(self.sale_line.qty_delivered, 0)

    def test_native_onchange_and_choices_keep_false_identity_and_do_not_persist(self):
        picking = self.unlinked()
        picking.action_confirm()
        loaded = self.load_form(picking)
        selection = {key: loaded[key] for key in ('order_id', 'transfer_id', 'move_id', 'operation_id', 'version')}
        before = self.stamp()
        changed = self.api().qorlia_operation_paged_onchange(**selection,
            edits=[{'field': 'lot_id', 'value': self.lot.id}, {'field': 'qty_done', 'value': 2}])
        self.assertIs(changed['order_id'], False)
        self.assertEqual(changed['values']['qty_done'], 2)
        choices = self.api().qorlia_operation_paged_choices(**selection, edits=[], field='lot_id', search=self.lot.name)
        self.assertEqual([row[0] for row in choices['rows']], self.lot.ids)
        self.assertEqual(self.stamp(), before)

    def test_linked_transfer_still_echoes_requested_global_identity(self):
        picking = self.picking()
        group = self.env['procurement.group'].create({'name': 'QorliaQA Global operation linked order',
            'sale_id': self.order.id, 'partner_id': self.customer.id})
        picking.with_env(self.env).group_id = group
        picking.move_ids.with_env(self.env).group_id = group
        global_form = self.load_form(picking)
        self.assertIs(global_form['order_id'], False)
        legacy_form = self.env['stock.picking'].with_user(self.user).qorlia_operation_paged_load(
            self.order.id, picking.id, picking.move_ids.id)
        self.assertEqual(legacy_form['order_id'], self.order.id)
        self.assertNotEqual(global_form['version'], legacy_form['version'])

    def test_explicit_false_is_not_zero_and_legacy_forms_remain_order_scoped(self):
        picking = self.unlinked()
        for value in (0, True, None, '', [], {}, -1):
            with self.subTest(value=value), self.assertRaises(ValidationError):
                self.api().qorlia_operation_paged_load(value, picking.id, picking.move_ids.id)
        with self.assertRaises(ValidationError):
            self.api().qorlia_operation_load(False, picking.id, picking.move_ids.id)

    def test_foreign_move_and_operation_identifiers_reject(self):
        picking, other = self.unlinked(), self.unlinked()
        other.action_confirm()
        other.action_assign()
        with self.assertRaises(ValidationError):
            self.load_form(picking, move=other.move_ids)
        with self.assertRaises(ValidationError):
            self.load_form(picking, operation=other.move_line_ids.id)

    def test_stale_stock_and_wrong_completion_token_reject_without_writes(self):
        picking = self.unlinked()
        picking.action_confirm()
        request = self.exact(picking, [{'field': 'qty_done', 'value': 1}], limit=1)
        with self.assertRaises(UserError):
            self.api().qorlia_operation_paged_save(dict(request, review_complete_token='a' * 64))
        picking.with_env(self.env).origin = 'QorliaQA Changed global operation source'
        before = self.stamp()
        with self.assertRaises(UserError):
            self.api().qorlia_operation_paged_save(request)
        self.assertEqual(self.stamp(), before)

    def test_stop_is_exact_and_does_not_create_an_operation(self):
        picking = self.unlinked()
        request = self.exact(picking, [{'field': 'qty_done', 'value': 1}])
        stopped = self.api().qorlia_operation_paged_stop(request)
        self.assertTrue(stopped['stopped'])
        self.assertEqual(stopped, self.api().qorlia_operation_paged_stop(request))
        with self.assertRaises(UserError):
            self.api().qorlia_operation_paged_save(request)
        self.assertFalse(picking.move_line_ids)

    def test_hidden_move_cannot_be_opened_by_its_known_identifier(self):
        picking = self.unlinked()
        move_id = picking.move_ids.id
        self.env['ir.rule'].create({'name': 'QorliaQA Hidden global operation move',
            'model_id': self.env['ir.model']._get_id('stock.move'),
            'domain_force': "[('id', '!=', %s)]" % move_id,
            'perm_read': True, 'perm_write': False, 'perm_create': False, 'perm_unlink': False})
        with self.assertRaises(AccessError):
            self.load_form(picking, move=self.env['stock.move'].browse(move_id))

    def test_other_authors_cannot_recover_accepted_operation(self):
        picking = self.unlinked()
        request = self.exact(picking, [{'field': 'qty_done', 'value': 1}])
        self.assertTrue(self.api().qorlia_operation_paged_save(request)['accepted'])
        with self.assertRaises(ValidationError):
            self.env['stock.picking'].with_user(self.user).qorlia_operation_paged_status(request)

    def test_stock_write_denial_blocks_review_save_and_stop(self):
        picking = self.unlinked()
        request = self.exact(picking, [{'field': 'qty_done', 'value': 1}])
        self.env['ir.rule'].create({'name': 'QorliaQA Denied global operation writes',
            'model_id': self.env['ir.model']._get_id('stock.picking'),
            'domain_force': "[('id', '!=', %s)]" % picking.id,
            'perm_read': False, 'perm_write': True, 'perm_create': False, 'perm_unlink': False})
        for method in ('qorlia_operation_paged_save', 'qorlia_operation_paged_stop'):
            with self.assertRaises((AccessError if method.endswith('stop') else UserError)):
                getattr(self.api(), method)(request)


@tagged('post_install', '-at_install')
class StockInventoryReadTest(StockInventoryFixture, TransactionCase):
    def test_native_menu_access_and_stock_only_reader(self):
        self.assertTrue(self.reader.has_group('stock.group_stock_user'))
        self.assertFalse(self.reader.has_group('sales_team.group_sale_salesman'))
        menu = self.env.ref('stock.all_picking')
        self.assertIn(self.env.ref('stock.group_stock_user'), menu.groups_id)
        self.assertEqual(menu.action.res_model, 'stock.picking')
        self.assertFalse(menu.action.domain)
        self.empty()
        self.assertTrue(self.page(search='QorliaQA Inventory')['rows'])

    def test_all_three_unlinked_operation_types_and_no_mutation(self):
        transfers = [self.empty(kind) for kind in (self.in_type, self.out_type, self.internal_type)]
        self.assertTrue(all(not row.sale_id for row in transfers))
        before = self.stamp()
        for kind, transfer in zip(('incoming', 'outgoing', 'internal'), transfers):
            result = self.page(search='QorliaQA Inventory', operation=kind)
            self.assertEqual([row['id'] for row in result['rows']], transfer.ids)
            self.assertEqual(result['rows'][0], self.env['sale.order'].with_user(self.reader)._qorlia_delivery_header(transfer.with_user(self.reader)))
            self.assertTrue(result['read_only'])
            self.assertEqual(result['filters'], {'search': 'QorliaQA Inventory', 'operation': kind, 'state': 'all'})
        self.assertEqual(self.stamp(), before)

    def test_complete_offset_pages_use_native_order_and_counts(self):
        for index in range(56):
            self.empty(priority=str(index % 2), scheduled_date='2026-10-19 10:00:00')
        native = self.env['stock.picking'].with_user(self.reader).search([
            ('company_id', 'in', self.reader.company_ids.ids), ('origin', 'ilike', 'QorliaQA Inventory')])
        rows = []
        for offset, expected_next in ((0, 25), (25, 50), (50, False)):
            page = self.page(search='QorliaQA Inventory', offset=offset)
            self.assertEqual(page['total_count'], 56)
            self.assertEqual(page['next_offset'], expected_next)
            rows += [row['id'] for row in page['rows']]
        self.assertEqual(rows, native.ids)
        self.assertEqual(self.page(search='QorliaQA Inventory', offset=75)['rows'], [])

    def test_search_uses_reference_or_origin_without_treating_text_as_a_domain(self):
        row = self.empty(origin='QorliaQA Inventory unique source %_[]')
        self.assertEqual([item['id'] for item in self.page(search=row.name)['rows']], row.ids)
        self.assertEqual(self.page(search="[('id', '>', 0)]")['rows'], [])
        self.assertEqual([item['id'] for item in self.page(search='  unique source  ')['rows']], row.ids)

    def test_waiting_filter_preserves_native_confirmed_and_waiting_states(self):
        origin = self.picking()
        target = self.picking()
        origin.move_ids.move_dest_ids = target.move_ids
        origin.action_confirm()
        target.action_confirm()
        self.assertEqual((origin.state, target.state), ('confirmed', 'waiting'))
        rows = self.page(search='QorliaQA Validation native contract', state='waiting')['rows']
        self.assertEqual({row['id'] for row in rows}, set((origin | target).ids))

    def test_hidden_transfers_are_excluded_as_in_native_browse_not_disclosed_in_counts(self):
        visible, hidden = self.empty(), self.empty()
        self.env['ir.rule'].create({'name': 'QorliaQA Inventory hidden transfer',
            'model_id': self.env['ir.model']._get_id('stock.picking'), 'domain_force': "[('id', '!=', %s)]" % hidden.id,
            'perm_read': True, 'perm_create': False, 'perm_write': False, 'perm_unlink': False})
        result = self.page(search='QorliaQA Inventory')
        self.assertEqual(result['total_count'], 1)
        self.assertEqual([row['id'] for row in result['rows']], visible.ids)

    def test_nonstock_and_portal_accounts_cannot_enumerate_inventory(self):
        self.empty()
        for index, group in enumerate(('base.group_user', 'base.group_portal')):
            actor = self.env['res.users'].with_context(no_reset_password=True).create({
                'name': 'QorliaQA Inventory denied', 'login': 'qorliaqa-inventory-denied-%s' % index,
                'company_id': self.env.company.id, 'company_ids': [(6, 0, self.env.company.ids)],
                'groups_id': [(6, 0, [self.env.ref(group).id])]})
            with self.assertRaises(AccessError):
                self.env['stock.picking'].with_user(actor).qorlia_inventory_transfers()
        other = self.env['res.company'].create({'name': 'QorliaQA Inventory inactive company'})
        with self.assertRaises(AccessError):
            self.env['stock.picking'].with_user(self.reader).with_context(allowed_company_ids=[other.id]).qorlia_inventory_transfers()

    def test_invalid_filters_reject_before_search(self):
        for values in ({'offset': True}, {'offset': -1}, {'offset': 2147483648}, {'search': []},
                {'search': 'x' * 161}, {'operation': 'sudo'}, {'operation': []}, {'state': 'confirmed'}, {'state': {}}):
            with self.assertRaises(ValidationError):
                self.page(**values)

    def test_only_active_companies_are_listed_even_when_the_actor_can_use_both(self):
        local = self.empty()
        other = self.env['res.company'].create({'name': 'QorliaQA Inventory second company'})
        warehouse = self.env['stock.warehouse'].search([('company_id', '=', other.id)], limit=1)
        if not warehouse:
            warehouse = self.env['stock.warehouse'].create({'name': 'QorliaQA Inventory second warehouse',
                'code': 'QGI', 'company_id': other.id})
        foreign = self.env['stock.picking'].with_company(other).create({'picking_type_id': warehouse.int_type_id.id,
            'location_id': warehouse.lot_stock_id.id, 'location_dest_id': warehouse.lot_stock_id.id,
            'origin': 'QorliaQA Inventory'})
        self.reader.company_ids = [(4, other.id)]
        model = self.env['stock.picking'].with_user(self.reader)
        for company, expected in ((self.env.company, local), (other, foreign)):
            result = model.with_context(allowed_company_ids=company.ids).qorlia_inventory_transfers(search='QorliaQA Inventory')
            self.assertEqual(result['total_count'], 1)
            self.assertEqual([row['id'] for row in result['rows']], expected.ids)
            active = model.with_context(allowed_company_ids=company.ids)
            self.assertEqual(active.qorlia_inventory_transfer_load(expected.id)['transfer']['id'], expected.id)
            inactive = foreign if expected == local else local
            with self.assertRaises(AccessError):
                active.qorlia_inventory_transfer_load(inactive.id)


@tagged('post_install', '-at_install')
class StockInventoryDetailTest(StockInventoryFixture, TransactionCase):
    def load(self, picking, actor=None):
        return self.env['stock.picking'].with_user(actor or self.reader).qorlia_inventory_transfer_load(picking.id)

    def detail(self, picking, section='moves', after=0, version=False, actor=None, limit=50):
        return self.env['stock.picking'].with_user(actor or self.reader).qorlia_inventory_transfer_detail_page(
            picking.id, section, after, version, limit)

    def operation(self, picking):
        return self.env['stock.move.line'].create({'picking_id': picking.id, 'move_id': picking.move_ids[0].id,
            'product_id': self.product.id, 'product_uom_id': self.product.uom_id.id, 'lot_id': self.lot.id,
            'location_id': picking.location_id.id, 'location_dest_id': picking.location_dest_id.id,
            'qty_done': 0})

    def deny(self, model, identifier):
        return self.env['ir.rule'].create({'name': 'QorliaQA Inventory detail hidden %s' % model,
            'model_id': self.env['ir.model']._get_id(model), 'domain_force': "[('id', '!=', %s)]" % identifier,
            'perm_read': True, 'perm_create': False, 'perm_write': False, 'perm_unlink': False})

    def assert_denied_without_changes(self, picking):
        before = self.stamp()
        with self.assertRaises(AccessError):
            self.load(picking)
        with self.assertRaises(AccessError):
            self.detail(picking)
        self.assertEqual(self.stamp(), before)

    def test_empty_unlinked_transfer_has_complete_zero_pages_for_all_operation_types(self):
        for kind in (self.in_type, self.out_type, self.internal_type):
            picking = self.empty(kind)
            self.assertFalse(picking.sale_id)
            loaded = self.load(picking)
            self.assertEqual((loaded['transfer']['move_count'], loaded['transfer']['operation_count']), (0, 0))
            for section in ('moves', 'operations'):
                page = self.detail(picking, section, version=loaded['version'])
                self.assertEqual((page['rows'], page['total_count'], page['position'], page['next_after']), ([], 0, 0, False))
                self.assertEqual(page['transfer'], loaded['transfer'])
                self.assertNotIn('order_id', page)

    def test_stock_only_actor_reads_complete_native_values_without_sales_access(self):
        picking = self.picking(self.in_type)
        line = self.operation(picking)
        self.assertFalse(picking.sale_id)
        self.assertFalse(self.reader.has_group('sales_team.group_sale_salesman'))
        # Deny even accidental attempts to resolve sales data; global stock has no such dependency.
        self.env['ir.rule'].create({'name': 'QorliaQA Inventory forbid sales lines',
            'model_id': self.env['ir.model']._get_id('sale.order.line'), 'domain_force': "[('id', '=', 0)]",
            'perm_read': True, 'perm_create': False, 'perm_write': False, 'perm_unlink': False})
        before = self.stamp()
        loaded = self.load(picking)
        moves = self.detail(picking, version=loaded['version'])
        operations = self.detail(picking, 'operations', version=loaded['version'])
        self.assertEqual(moves['rows'][0], {'id': picking.move_ids.id, 'state': picking.move_ids.state,
            'product': [self.product.id, self.product.display_name], 'unit': [self.product.uom_id.id, self.product.uom_id.display_name],
            'demand': 5, 'reserved': 0, 'done': 0})
        self.assertEqual(operations['rows'][0], self.env['sale.order'].with_user(self.reader)._qorlia_delivery_operation(line.with_user(self.reader)))
        self.assertNotIn('order_line', moves['rows'][0])
        self.assertEqual(self.stamp(), before)

    def test_501_moves_and_2001_operations_are_complete_and_bounded_without_legacy_caps(self):
        picking = self.picking(self.in_type)
        move = picking.move_ids
        moves = move | self.env['stock.move'].create([dict(move.copy_data()[0], picking_id=picking.id) for _index in range(500)])
        first = self.operation(picking)
        lines = first | self.env['stock.move.line'].create([dict(first.copy_data()[0], picking_id=picking.id, move_id=move.id) for _index in range(2000)])
        before = self.stamp()
        loaded = self.load(picking)
        self.assertEqual((loaded['transfer']['move_count'], loaded['transfer']['operation_count']), (501, 2001))
        for section, expected in (('moves', moves), ('operations', lines)):
            seen, after = [], 0
            while True:
                page = self.detail(picking, section, after, loaded['version'], limit=100)
                self.assertLessEqual(len(page['rows']), 100)
                self.assertEqual(page['position'], len(seen))
                seen += [row['id'] for row in page['rows']]
                if page['next_after'] is False:
                    break
                after = page['next_after']
            self.assertEqual(seen, expected.sorted('id').ids)
        self.assertEqual(self.stamp(), before)

    def test_hidden_tail_move_rejects_details_instead_of_returning_a_partial_graph(self):
        picking = self.picking(self.in_type)
        tail = self.env['stock.move'].create([dict(picking.move_ids.copy_data()[0], picking_id=picking.id) for _index in range(50)])[-1]
        self.deny('stock.move', tail.id)
        self.assert_denied_without_changes(picking)
        self.assertIn(picking.id, [row['id'] for row in self.page(search=picking.name)['rows']])

    def test_hidden_tail_operation_rejects_complete_scope(self):
        picking = self.picking(self.in_type)
        first = self.operation(picking)
        tail = self.env['stock.move.line'].create([dict(first.copy_data()[0], picking_id=picking.id) for _index in range(50)])[-1]
        self.deny('stock.move.line', tail.id)
        self.assert_denied_without_changes(picking)

    def test_hidden_lot_rejects_before_disclosing_batch_labels(self):
        picking = self.picking(self.in_type)
        self.operation(picking)
        self.deny('stock.lot', self.lot.id)
        self.assert_denied_without_changes(picking)

    def test_hidden_owner_rejects_before_disclosing_partner_labels(self):
        picking = self.picking(self.in_type)
        line = self.operation(picking)
        owner = self.env['res.partner'].create({'name': 'QorliaQA PRIVATE Inventory owner'})
        line.owner_id = owner
        self.deny('res.partner', owner.id)
        self.assert_denied_without_changes(picking)

    def test_hidden_product_rejects_even_when_prefetched_by_another_actor(self):
        picking = self.picking(self.in_type)
        self.assertTrue(picking.move_ids.product_id.display_name)
        self.deny('product.product', self.product.id)
        self.assert_denied_without_changes(picking)

    def test_operation_field_read_permission_is_checked(self):
        picking = self.picking(self.in_type)
        self.operation(picking)
        original = type(self.env['stock.move.line']).check_field_access_rights
        def denied(records, operation, fields=None):
            if operation == 'read' and fields and 'qty_done' in fields:
                raise AccessError('QorliaQA denied operation quantity field')
            return original(records, operation, fields)
        with patch.object(type(self.env['stock.move.line']), 'check_field_access_rights', denied):
            self.assert_denied_without_changes(picking)

    def test_cross_transfer_operation_link_rejects_without_repairing_data(self):
        picking, other = self.picking(self.in_type), self.picking(self.in_type)
        line = self.operation(picking)
        self.env.flush_all()
        self.env.cr.execute('UPDATE stock_move_line SET move_id = %s WHERE id = %s', [other.move_ids.id, line.id])
        self.env.invalidate_all()
        self.assert_denied_without_changes(picking)

    def test_move_quantity_operation_batch_and_labels_invalidate_old_pages(self):
        picking = self.picking(self.in_type)
        line = self.operation(picking)
        mutations = ((picking.move_ids, 'product_uom_qty', 7), (line, 'qty_done', 1),
            (self.lot, 'expiration_date', '2028-01-01 00:00:00'), (self.product, 'name', 'QorliaQA Renamed inventory medicine'),
            (picking, 'origin', 'QorliaQA Changed source'))
        for record, field, value in mutations:
            loaded = self.load(picking)
            record.with_user(self.env.user).write({field: value})
            before = self.stamp()
            with self.assertRaises(UserError):
                self.detail(picking, version=loaded['version'])
            self.assertNotEqual(self.load(picking)['version'], loaded['version'])
            self.assertEqual(self.stamp(), before)
        self.assertEqual(self.source_stock(), 10)

    def test_scope_is_bound_to_author_timezone_and_access_policy(self):
        picking = self.picking(self.in_type)
        loaded = self.load(picking)
        another = self.reader.copy({'name': 'QorliaQA Other Inventory reader', 'login': 'qorliaqa-other-inventory-reader'})
        with self.assertRaises(UserError):
            self.detail(picking, version=loaded['version'], actor=another)
        with self.assertRaises(UserError):
            self.env['stock.picking'].with_user(self.reader).with_context(tz='Asia/Kolkata').qorlia_inventory_transfer_detail_page(
                picking.id, 'moves', version=loaded['version'])
        self.env['ir.rule'].create({'name': 'QorliaQA Inventory unchanged access policy',
            'model_id': self.env['ir.model']._get_id('stock.move'), 'domain_force': "[('id', '>', 0)]",
            'perm_read': True, 'perm_create': False, 'perm_write': False, 'perm_unlink': False})
        with self.assertRaises(UserError):
            self.detail(picking, version=loaded['version'])

    def test_hidden_transfer_cannot_be_loaded_by_known_identifier(self):
        picking = self.picking(self.in_type)
        self.deny('stock.picking', picking.id)
        self.assert_denied_without_changes(picking)

    def test_unrelated_transfer_updates_do_not_invalidate_this_graph(self):
        picking, other = self.empty(self.in_type), self.empty(self.in_type)
        loaded = self.load(picking)
        other.origin = 'QorliaQA Unrelated changed origin'
        self.assertEqual(self.load(picking)['version'], loaded['version'])

    def test_invalid_identifiers_sections_versions_and_cross_scope_cursors_reject(self):
        picking, other = self.picking(self.in_type), self.picking(self.in_type)
        for identifier in (False, 0, -1, '1'):
            with self.assertRaises(ValidationError):
                self.env['stock.picking'].with_user(self.reader).qorlia_inventory_transfer_load(identifier)
        for kwargs in ({'section': 'stock.quant'}, {'section': []}, {'section':'moves', 'after':-1},
                {'section':'moves', 'after':picking.move_ids.id}, {'section':'moves', 'limit':True},
                {'section':'moves', 'limit':101}, {'section':'moves', 'version':'bad'}):
            with self.assertRaises(ValidationError):
                self.env['stock.picking'].with_user(self.reader).qorlia_inventory_transfer_detail_page(picking.id, **kwargs)
        loaded = self.load(picking)
        with self.assertRaises(ValidationError):
            self.detail(picking, after=other.move_ids.id, version=loaded['version'])

    def test_nonstock_actor_cannot_use_load_or_detail_readers(self):
        picking = self.empty(self.in_type)
        actor = self.env['res.users'].with_context(no_reset_password=True).create({'name':'QorliaQA Denied detail reader',
            'login':'qorliaqa-denied-inventory-detail', 'company_id':self.env.company.id,
            'company_ids':[(6,0,self.env.company.ids)], 'groups_id':[(6,0,[self.env.ref('base.group_user').id])]})
        with self.assertRaises(AccessError):
            self.load(picking, actor=actor)
        with self.assertRaises(AccessError):
            self.detail(picking, actor=actor)
