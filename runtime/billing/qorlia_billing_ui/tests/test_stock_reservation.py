# SPDX-License-Identifier: LGPL-3.0-or-later
# Copyright 2026 Qorlia contributors.
import uuid
from unittest.mock import patch

from odoo.exceptions import AccessError, UserError, ValidationError
from odoo.tests import TransactionCase, tagged


@tagged('post_install', '-at_install')
class StockReservationTest(TransactionCase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.customer = cls.env['res.partner'].create({'name': 'QorliaQA Reservation customer'})
        cls.product = cls.env['product.product'].create({'name': 'QorliaQA Reservation medicine',
            'type': 'product', 'tracking': 'lot', 'taxes_id': [(6, 0, [])]})
        cls.shop = cls.env['sale.shop'].search([('company_id', '=', cls.env.company.id)], limit=1)
        cls.warehouse = cls.shop.warehouse_id
        cls.warehouse.out_type_id.reservation_method = 'manual'
        cls.order = cls.env['sale.order'].create({'partner_id': cls.customer.id, 'shop_id': cls.shop.id})
        cls.sale_line = cls.env['sale.order.line'].create({'order_id': cls.order.id,
            'product_id': cls.product.id, 'product_uom_qty': 5, 'price_unit': 10})
        cls.group = cls.env['procurement.group'].create({'name': 'QorliaQA Reservation group', 'sale_id': cls.order.id})
        cls.picking = cls.env['stock.picking'].create({'picking_type_id': cls.warehouse.out_type_id.id,
            'partner_id': cls.customer.id, 'location_id': cls.warehouse.lot_stock_id.id,
            'location_dest_id': cls.customer.property_stock_customer.id, 'origin': cls.order.name})
        cls.move = cls.env['stock.move'].create({'name': cls.product.name, 'picking_id': cls.picking.id,
            'product_id': cls.product.id, 'product_uom': cls.product.uom_id.id, 'product_uom_qty': 5,
            'sale_line_id': cls.sale_line.id, 'group_id': cls.group.id,
            'location_id': cls.picking.location_id.id, 'location_dest_id': cls.picking.location_dest_id.id})
        cls.lot = cls.env['stock.lot'].create({'name': 'QorliaQA Reservation batch', 'product_id': cls.product.id,
            'company_id': cls.env.company.id, 'expiration_date': '2027-01-01 00:00:00'})
        cls.env['stock.quant']._update_available_quantity(cls.product, cls.picking.location_id, 10, lot_id=cls.lot)
        cls.picking.action_confirm()
        cls.quant = cls.env['stock.quant'].search([('product_id', '=', cls.product.id), ('lot_id', '=', cls.lot.id)])
        assert cls.picking.state == 'confirmed' and not cls.move.reserved_availability
        cls.user = cls.env['res.users'].with_context(no_reset_password=True).create({
            'name': 'QorliaQA Reservation staff', 'login': 'qorliaqa-reservation-staff',
            'company_id': cls.env.company.id, 'company_ids': [(6, 0, cls.env.company.ids)],
            'groups_id': [(6, 0, [cls.env.ref('sales_team.group_sale_manager').id, cls.env.ref('stock.group_stock_user').id])],
        })

    def api(self):
        return self.env['stock.picking'].with_user(self.user)

    def load(self):
        return self.api().qorlia_transfer_load(self.order.id, self.picking.id)

    def review(self, action='assign'):
        current = self.load()
        return self.api().qorlia_transfer_preview(self.order.id, self.picking.id, current['version'], action)

    def request(self, review):
        return {key: review[key] for key in ('order_id', 'transfer_id', 'version', 'action', 'review_version')} | {'request_key': str(uuid.uuid4())}

    def test_load_native_visibility_and_unavailable_draft_or_finished_actions(self):
        current = self.load()
        self.assertFalse(current['reasons']['assign'])
        self.assertTrue(current['reasons']['unreserve'])
        self.move.state = 'draft'
        self.assertTrue(self.load()['reasons']['assign'])
        self.move.state = 'done'
        self.assertTrue(self.load()['reasons']['assign'])
        self.assertTrue(self.load()['reasons']['unreserve'])

    def test_preview_native_reservation_is_rolled_back_with_no_callbacks(self):
        before = self.load()
        counts = {name: self.env[name].search_count([]) for name in ('stock.move.line', 'account.move', 'mail.message')}
        hooks = {name: getattr(self.env.cr, name) for name in ('postcommit', 'prerollback', 'postrollback')}
        reviewed = self.review()
        self.assertEqual(reviewed['after']['transfer']['state'], 'assigned')
        self.assertEqual(reviewed['after']['transfer']['moves'][0]['reserved'], 5)
        self.assertEqual(reviewed['after']['transfer']['operations'][0]['lot'][0], self.lot.id)
        self.assertFalse(reviewed['after']['transfer']['operations'][0]['id'])
        self.assertEqual(reviewed['quant_after'][0]['reserved_quantity'], 5)
        self.assertEqual(reviewed['quant_after'][0]['unit'][0], self.product.uom_id.id)
        self.assertEqual(before, self.load())
        self.assertEqual(counts, {name: self.env[name].search_count([]) for name in counts})
        self.assertEqual(self.quant.quantity, 10)
        for name, callbacks in hooks.items():
            self.assertIs(getattr(self.env.cr, name), callbacks)

    def test_save_is_idempotent_and_status_recovers_exact_author_request(self):
        self.env.flush_all()
        self.env.cr.execute("UPDATE stock_picking SET write_date = '2026-01-01' WHERE id = %s", [self.picking.id])
        self.env.invalidate_all()
        request = self.request(self.review())
        self.assertFalse(self.api().qorlia_transfer_status(**request)['accepted'])
        accepted = self.api().qorlia_transfer_run(**request)
        self.assertTrue(accepted['accepted'])
        self.assertEqual(self.move.reserved_availability, 5)
        self.assertEqual(self.quant.quantity, 10)
        self.assertEqual(self.quant.reserved_quantity, 5)
        self.assertEqual(self.picking.state, 'assigned')
        self.assertEqual(self.api().qorlia_transfer_run(**request), accepted)
        self.assertEqual(self.api().qorlia_transfer_status(**request), accepted)
        self.env.flush_all()
        self.env.invalidate_all()
        self.assertEqual(self.api().qorlia_transfer_status(**request), accepted)
        self.assertEqual(len(self.picking.move_line_ids), 1)
        with self.assertRaises(ValidationError):
            self.api().qorlia_transfer_run(**{**request, 'action': 'unreserve'})

    def test_unreserve_preserves_entered_done_quantities_without_delivering_or_invoicing(self):
        self.api().qorlia_transfer_run(**self.request(self.review()))
        self.picking.move_line_ids.qty_done = 2
        before = {name: self.env[name].search_count([]) for name in ('account.move', 'account.payment', 'stock.valuation.layer')}
        reviewed = self.review('unreserve')
        self.assertEqual(reviewed['after']['transfer']['operations'][0]['done'], 2)
        accepted = self.api().qorlia_transfer_run(**self.request(reviewed))
        self.assertTrue(accepted['accepted'])
        self.assertEqual(self.picking.move_line_ids.qty_done, 2)
        self.assertEqual(self.quant.reserved_quantity, 0)
        self.assertEqual(self.quant.quantity, 10)
        self.assertNotEqual(self.picking.state, 'done')
        self.assertEqual(self.sale_line.qty_delivered, 0)
        self.assertEqual(before, {name: self.env[name].search_count([]) for name in before})

    def test_inventory_or_demand_changes_reject_stale_load_and_review(self):
        current = self.load()
        self.env['stock.quant']._update_available_quantity(self.product, self.picking.location_id, 1, lot_id=self.lot)
        with self.assertRaises(UserError):
            self.api().qorlia_transfer_preview(self.order.id, self.picking.id, current['version'], 'assign')
        request = self.request(self.review())
        self.move.product_uom_qty = 4
        with self.assertRaises(UserError):
            self.api().qorlia_transfer_run(**request)
        self.assertFalse(self.picking.qorlia_reservation_receipts)
        self.assertEqual(self.quant.reserved_quantity, 0)

    def test_hidden_quant_fails_closed_before_any_reservation(self):
        rule = self.env['ir.rule'].create({'name': 'QorliaQA Hidden reservation quant',
            'model_id': self.env['ir.model']._get_id('stock.quant'),
            'domain_force': "[('id', '!=', %d)]" % self.quant.id})
        current = self.load()
        self.assertTrue(current['reasons']['assign'])
        with self.assertRaises(AccessError):
            self.api().qorlia_transfer_preview(self.order.id, self.picking.id, current['version'], 'assign')
        self.assertEqual(self.quant.reserved_quantity, 0)
        rule.unlink()

    def test_read_only_transfer_rule_disables_actions_and_blocks_direct_preview(self):
        self.env['ir.rule'].create({'name': 'QorliaQA Read-only reservation transfer',
            'model_id': self.env['ir.model']._get_id('stock.picking'),
            'domain_force': "[('id', '!=', %d)]" % self.picking.id,
            'perm_read': False, 'perm_write': True, 'perm_create': False, 'perm_unlink': False})
        current = self.load()
        self.assertTrue(current['reasons']['assign'])
        with self.assertRaises(AccessError):
            self.api().qorlia_transfer_preview(self.order.id, self.picking.id, current['version'], 'assign')
        self.assertEqual(self.quant.reserved_quantity, 0)

    def test_invalid_foreign_and_public_requests_are_denied(self):
        for action in (None, [], {}, True, 1, 'validate'):
            with self.assertRaises(ValidationError):
                self.api().qorlia_transfer_preview(self.order.id, self.picking.id, 'a' * 64, action)
        for identifier in (True, 0, -1, '1', 1.5):
            with self.assertRaises(ValidationError):
                self.api().qorlia_transfer_load(self.order.id, identifier)
        other = self.env['sale.order'].create({'partner_id': self.customer.id, 'shop_id': self.shop.id})
        with self.assertRaises(UserError):
            self.api().qorlia_transfer_load(other.id, self.picking.id)
        with self.assertRaises(AccessError):
            self.env['stock.picking'].with_user(self.env.ref('base.public_user')).qorlia_transfer_load(self.order.id, self.picking.id)
        request = self.request(self.review())
        for change, error in (({'request_key': 'invalid'}, ValidationError), ({'action': 'validate'}, ValidationError),
                ({'review_version': 'f' * 64}, UserError), ({'version': []}, ValidationError)):
            with self.assertRaises(error):
                self.api().qorlia_transfer_run(**{**request, **change})

    def test_receipts_cannot_be_forged_written_or_copied(self):
        with self.assertRaises(AccessError):
            self.picking.write({'qorlia_reservation_receipts': {'forged': {}}})
        with self.assertRaises(AccessError):
            self.env['stock.picking'].create({'qorlia_reservation_receipts': {}})
        with self.assertRaises(AccessError):
            self.env['stock.picking'].with_context(default_qorlia_reservation_receipts={}).create({})
        self.api().qorlia_transfer_run(**self.request(self.review()))
        self.assertFalse(self.picking.copy().qorlia_reservation_receipts)

    def test_receipt_status_is_not_available_to_another_author(self):
        request = self.request(self.review())
        self.api().qorlia_transfer_run(**request)
        other = self.user.copy({'name': 'QorliaQA Other reservation author', 'login': 'qorliaqa-reservation-other'})
        with self.assertRaises(ValidationError):
            self.env['stock.picking'].with_user(other).qorlia_transfer_status(**request)

    def test_unreviewed_actual_effects_roll_back_inventory_and_receipts(self):
        request = self.request(self.review())
        original = type(self.picking).action_assign
        calls = []
        def changed(picking):
            result = original(picking)
            calls.append(True)
            if len(calls) == 2:
                picking.move_line_ids.qty_done = 3
            return result
        with patch.object(type(self.picking), 'action_assign', changed):
            with self.assertRaises(UserError):
                self.api().qorlia_transfer_run(**request)
        self.assertEqual(self.quant.reserved_quantity, 0)
        self.assertFalse(self.picking.qorlia_reservation_receipts)
        self.assertFalse(self.picking.move_line_ids)

    def test_set_clear_quantities_preview_save_recovery_without_delivery_or_finance(self):
        self.api().qorlia_transfer_run(**self.request(self.review()))
        counts = {name: self.env[name].search_count([]) for name in ('account.move', 'account.payment', 'stock.valuation.layer')}
        before = self.load()
        self.assertFalse(before['reasons']['set_quantities'])
        self.assertTrue(before['reasons']['clear_quantities'])
        reviewed = self.review('set_quantities')
        self.assertEqual(self.load(), before)
        self.assertEqual(reviewed['after']['transfer']['moves'][0]['done'], 5)
        self.assertEqual(reviewed['after']['transfer']['operations'][0]['done'], 5)
        self.assertEqual(reviewed['quant_after'], reviewed['quant_before'])
        request = self.request(reviewed)
        saved = self.api().qorlia_transfer_run(**request)
        self.assertTrue(saved['accepted'])
        self.env.flush_all()
        self.env.invalidate_all()
        self.assertEqual(self.api().qorlia_transfer_status(**request), saved)
        self.assertEqual(self.api().qorlia_transfer_run(**request), saved)
        self.assertTrue(saved['current']['reasons']['set_quantities'])
        self.assertFalse(saved['current']['reasons']['clear_quantities'])
        clear = self.request(self.review('clear_quantities'))
        accepted = self.api().qorlia_transfer_run(**clear)
        self.assertEqual(self.api().qorlia_transfer_run(**clear), accepted)
        self.assertEqual(self.picking.move_line_ids.qty_done, 0)
        self.assertEqual(self.quant.reserved_quantity, 5)
        self.assertEqual(self.quant.quantity, 10)
        self.assertEqual(self.picking.state, 'assigned')
        self.assertEqual(self.sale_line.qty_delivered, 0)
        self.assertEqual(counts, {name: self.env[name].search_count([]) for name in counts})

    def test_set_and_clear_keep_partially_entered_moves_while_changing_eligible_moves(self):
        other = self.move.copy({'picking_id': self.picking.id, 'state': 'draft'})
        other._action_confirm(merge=False)
        self.api().qorlia_transfer_run(**self.request(self.review()))
        self.move.move_line_ids.qty_done = 2
        self.assertFalse(self.load()['reasons']['set_quantities'])
        self.api().qorlia_transfer_run(**self.request(self.review('set_quantities')))
        self.assertEqual(self.move.quantity_done, 2)
        self.assertEqual(other.quantity_done, 5)
        self.api().qorlia_transfer_run(**self.request(self.review('clear_quantities')))
        self.assertEqual(self.move.quantity_done, 2)
        self.assertEqual(other.quantity_done, 0)
        self.assertEqual(self.quant.quantity, 10)
        self.assertEqual(self.quant.reserved_quantity, 10)

    def test_set_quantities_preserves_detailed_operation_dozen_unit_and_batch(self):
        self.move.product_uom_qty = 12
        self.env['stock.quant']._update_available_quantity(self.product, self.picking.location_id, 4, lot_id=self.lot)
        self.api().qorlia_transfer_run(**self.request(self.review()))
        operation = self.picking.move_line_ids
        dozen = self.env.ref('uom.product_uom_dozen')
        operation.write({'product_uom_id': dozen.id, 'reserved_uom_qty': 1})
        review = self.review('set_quantities')
        self.assertEqual(review['after']['transfer']['moves'][0]['done'], 12)
        self.assertEqual(review['after']['transfer']['operations'][0]['done'], 1)
        self.assertEqual(review['after']['transfer']['operations'][0]['unit'][0], dozen.id)
        self.assertEqual(review['after']['transfer']['operations'][0]['lot'][0], self.lot.id)
        self.api().qorlia_transfer_run(**self.request(review))
        self.assertEqual(operation.qty_done, 1)
        self.assertEqual(self.quant.quantity, 14)
        self.assertEqual(self.quant.reserved_quantity, 12)

    def test_tracked_operation_without_batch_does_not_invent_done_quantity(self):
        self.env['stock.quant']._update_available_quantity(self.product, self.picking.location_id, -10, lot_id=self.lot)
        self.env['stock.quant']._update_available_quantity(self.product, self.picking.location_id, 10)
        self.api().qorlia_transfer_run(**self.request(self.review()))
        self.assertFalse(self.picking.move_line_ids.lot_id)
        review = self.review('set_quantities')
        self.assertEqual(review['after']['transfer']['moves'][0]['done'], 0)
        self.assertEqual(review['after']['transfer']['operations'][0]['done'], 0)
        self.api().qorlia_transfer_run(**self.request(review))
        self.assertEqual(self.move.quantity_done, 0)
        self.assertEqual(sum(self.env['stock.quant'].search([('product_id', '=', self.product.id)]).mapped('quantity')), 10)

    def test_quantity_actions_require_native_group_and_reject_hidden_or_finished_operations(self):
        self.api().qorlia_transfer_run(**self.request(self.review()))
        original = type(self.user).has_group
        def group(user, name):
            return False if name == 'stock.group_stock_user' else original(user, name)
        with patch.object(type(self.user), 'has_group', group):
            current = self.load()
            self.assertIn('Stock User', current['reasons']['set_quantities'])
            with self.assertRaises(AccessError):
                self.api().qorlia_transfer_preview(self.order.id, self.picking.id, current['version'], 'set_quantities')
        rule = self.env['ir.rule'].create({'name': 'QorliaQA Hidden detailed quantity operation',
            'model_id': self.env['ir.model']._get_id('stock.move.line'),
            'domain_force': "[('picking_id', '!=', %d)]" % self.picking.id})
        with self.assertRaises(AccessError):
            self.load()
        rule.unlink()
        self.move.state = 'done'
        for action in ('set_quantities', 'clear_quantities'):
            current = self.load()
            self.assertTrue(current['reasons'][action])
            with self.assertRaises(UserError):
                self.api().qorlia_transfer_preview(self.order.id, self.picking.id, current['version'], action)

    def test_package_graph_relations_are_labelled_and_hidden_packages_fail_closed(self):
        self.api().qorlia_transfer_run(**self.request(self.review()))
        package = self.env['stock.quant.package'].create({'name': 'QorliaQA Labelled package'})
        self.picking.move_line_ids.result_package_id = package
        level = self.env['stock.package_level'].create({'picking_id': self.picking.id,
            'package_id': package.id, 'location_id': self.picking.location_id.id,
            'location_dest_id': self.picking.location_dest_id.id,
            'company_id': self.picking.company_id.id, 'move_line_ids': [(6, 0, self.picking.move_line_ids.ids)]})
        row = self.load()['graph']['packages'][0]
        self.assertEqual(row['id'], level.id)
        self.assertEqual(row['package_id'], [package.id, package.display_name])
        self.assertEqual(row['company_id'], [self.env.company.id, self.env.company.display_name])
        self.assertEqual(self.review('set_quantities')['after']['packages'][0]['package_id'][0], package.id)
        self.env['ir.rule'].create({'name': 'QorliaQA Hidden destination package',
            'model_id': self.env['ir.model']._get_id('stock.quant.package'),
            'domain_force': "[('id', '!=', %d)]" % package.id})
        with self.assertRaises(AccessError):
            self.load()

    def paged_data(self, action='assign'):
        loaded = self.api().qorlia_reservation_paged_load(self.order.id, self.picking.id)
        return {key: loaded[key] for key in ('order_id', 'transfer_id', 'version')} | {'action': action}

    def paged_pages(self, data=None, limit=100):
        data = data or self.paged_data()
        pages = [self.api().qorlia_reservation_paged_review(data, limit=limit)]
        while pages[-1]['next_after'] is not False:
            prior = pages[-1]
            pages.append(self.api().qorlia_reservation_paged_review(data, prior['next_after'],
                prior['review_version'], prior['continuation_token'], limit))
        return pages

    def paged_exact(self, data=None, limit=100):
        data = data or self.paged_data()
        last = self.paged_pages(data, limit)[-1]
        return {**data, 'review_version': last['review_version'],
            'review_complete_token': last['review_complete_token'], 'request_key': str(uuid.uuid4())}

    def test_paged_all_four_native_actions_save_recover_and_preserve_finance_and_physical_stock(self):
        finance = self.picking._qorlia_confirmation_stamp(['account_move', 'account_move_line', 'account_payment',
            'stock_valuation_layer', 'account_bank_statement', 'account_bank_statement_line'])
        requests = []
        for action, state, reserved, done in (('assign', 'assigned', 5, 0),
                ('set_quantities', 'assigned', 5, 5), ('clear_quantities', 'assigned', 5, 0),
                ('unreserve', 'confirmed', 0, 0)):
            request = self.paged_exact(self.paged_data(action))
            self.assertFalse(self.api().qorlia_reservation_paged_status(request)['accepted'])
            accepted = self.api().qorlia_reservation_paged_save(request)
            self.assertTrue(accepted['accepted'])
            self.assertEqual(accepted['state_after'], state)
            self.assertEqual(accepted['action'], action)
            self.assertEqual(self.api().qorlia_reservation_paged_status(request), accepted)
            self.assertEqual(self.api().qorlia_reservation_paged_save(request), accepted)
            self.assertEqual(self.quant.reserved_quantity, reserved)
            self.assertEqual(sum(self.picking.move_line_ids.mapped('qty_done')), done)
            self.assertEqual(self.quant.quantity, 10)
            self.assertEqual(self.sale_line.qty_delivered, 0)
            requests.append(request)
        for request in requests:
            status = self.api().qorlia_reservation_paged_status(request)
            self.assertTrue(status['accepted'])
            self.assertEqual(status, self.api().qorlia_reservation_paged_save(request))
        self.assertEqual(finance, self.picking._qorlia_confirmation_stamp(list(finance)))
        self.assertEqual(len(self.picking.qorlia_reservation_receipts), 4)

    def test_paged_complete_sequential_effects_preview_rollback_and_terminal_proof(self):
        data = self.paged_data()
        before = self.picking._qorlia_confirmation_stamp(self.picking._qorlia_operation_paged_tables())
        hooks = {name: getattr(self.env.cr, name) for name in ('precommit', 'postcommit', 'prerollback', 'postrollback')}
        pages = self.paged_pages(data, 1)
        rows = [(model, kind, row.get('id', row.get('key'))) for page in pages
            for kind in ('created', 'updated', 'deleted') for model, values in page['effects'][kind].items() for row in values]
        self.assertGreater(len(pages), 1)
        self.assertEqual(len(rows), pages[0]['total_count'])
        self.assertEqual(len(rows), len(set(rows)))
        for index, page in enumerate(pages):
            self.assertEqual(page['after'], index)
            self.assertEqual(page['review_version'], pages[0]['review_version'])
            self.assertEqual(bool(page['review_complete_token']), index == len(pages) - 1)
        self.assertEqual(before, self.picking._qorlia_confirmation_stamp(list(before)))
        self.assertFalse(self.picking.move_line_ids)
        for name, hook in hooks.items():
            self.assertIs(getattr(self.env.cr, name), hook)
        first = pages[0]
        with self.assertRaises(UserError):
            self.api().qorlia_reservation_paged_review(data, first['next_after'] + 1,
                first['review_version'], first['continuation_token'], 1)
        with self.assertRaises(UserError):
            self.api().qorlia_reservation_paged_save({**data, 'review_version': first['review_version'],
                'review_complete_token': first['continuation_token'], 'request_key': str(uuid.uuid4())})

    def test_paged_bounds_exact_payloads_and_unaccepted_references_are_rejected(self):
        data = self.paged_data()
        for options in ({'after': True}, {'after': -1}, {'limit': True}, {'limit': 0}, {'limit': 101},
                {'after': 1}, {'review_version': 'a' * 64}, {'continuation_token': 'a' * 64}):
            with self.assertRaises(ValidationError):
                self.api().qorlia_reservation_paged_review(data, **options)
        for change in ({'context': {}}, {'action': []}, {'action': 'validate'}, {'order_id': True}, {'version': []}):
            with self.assertRaises(ValidationError):
                self.api().qorlia_reservation_paged_review({**data, **change})
        request = self.paged_exact(data)
        with self.assertRaises(UserError):
            self.api().qorlia_reservation_paged_references(request)
        for change in ({'context': {}}, {'request_key': 'bad'}, {'review_complete_token': 'bad'}):
            with self.assertRaises(ValidationError):
                self.api().qorlia_reservation_paged_save({**request, **change})
        self.assertEqual(self.quant.reserved_quantity, 0)

    def test_paged_inventory_demand_configuration_and_permission_changes_require_fresh_review(self):
        request = self.paged_exact()
        self.move.product_uom_qty = 4
        with self.assertRaises(UserError):
            self.api().qorlia_reservation_paged_save(request)
        request = self.paged_exact()
        self.env['ir.config_parameter'].set_param('qorliaqa.reservation.changed', 'yes')
        with self.assertRaises(UserError):
            self.api().qorlia_reservation_paged_save(request)
        request = self.paged_exact()
        self.env['stock.quant']._update_available_quantity(self.product, self.picking.location_id, 1, lot_id=self.lot)
        with self.assertRaises(UserError):
            self.api().qorlia_reservation_paged_save(request)
        request = self.paged_exact()
        self.env['ir.rule'].create({'name': 'QorliaQA Paged reservation write denied',
            'model_id': self.env['ir.model']._get_id('stock.picking'),
            'domain_force': "[('id', '!=', %d)]" % self.picking.id,
            'perm_read': False, 'perm_write': True, 'perm_create': False, 'perm_unlink': False})
        with self.assertRaises(AccessError):
            self.api().qorlia_reservation_paged_save(request)
        self.assertFalse(self.picking.qorlia_reservation_receipts)
        self.assertEqual(self.quant.reserved_quantity, 0)

    def test_paged_unreviewed_actual_effects_and_all_callbacks_roll_back(self):
        request = self.paged_exact()
        original, calls = type(self.picking)._qorlia_reservation_apply, []
        hooks = {name: (getattr(self.env.cr, name), list(getattr(self.env.cr, name)._funcs))
            for name in ('precommit', 'postcommit', 'prerollback', 'postrollback')}
        def altered(records, action):
            result = original(records, action)
            calls.append(True)
            if len(calls) == 2:
                records.move_line_ids.qty_done = 3
                for name in hooks:
                    getattr(self.env.cr, name).add(lambda: None)
            return result
        with patch.object(type(self.picking), '_qorlia_reservation_apply', altered), self.assertRaises(UserError):
            self.api().qorlia_reservation_paged_save(request)
        self.assertFalse(self.picking.qorlia_reservation_receipts)
        self.assertFalse(self.picking.move_line_ids)
        self.assertEqual(self.quant.reserved_quantity, 0)
        for name, (hook, functions) in hooks.items():
            self.assertIs(getattr(self.env.cr, name), hook)
            self.assertEqual(list(hook._funcs), functions)

    def test_paged_physical_financial_tax_link_and_configuration_effects_fail_closed(self):
        tax = self.env['account.tax'].create({'name': 'QorliaQA Reservation guard tax', 'amount': 0,
            'type_tax_use': 'sale', 'company_id': self.env.company.id})
        original = type(self.picking)._qorlia_reservation_apply
        actions = (lambda: self.env['stock.quant']._update_available_quantity(self.product, self.picking.location_id, 1, lot_id=self.lot),
            lambda: self.sale_line.write({'price_unit': 99}),
            lambda: self.sale_line.write({'tax_id': [(6, 0, tax.ids)]}),
            lambda: self.env['ir.config_parameter'].set_param('qorliaqa.reservation.unreviewed', 'write'))
        for action in actions:
            data = self.paged_data()
            stamp = self.picking._qorlia_confirmation_stamp(self.picking._qorlia_operation_paged_tables())
            def altered(records, selected):
                result = original(records, selected)
                action()
                return result
            with patch.object(type(self.picking), '_qorlia_reservation_apply', altered), self.assertRaises(UserError):
                self.paged_pages(data)
            self.assertEqual(stamp, self.picking._qorlia_confirmation_stamp(list(stamp)))

    def test_paged_hidden_quant_or_unrelated_business_effect_cannot_be_omitted(self):
        rule = self.env['ir.rule'].create({'name': 'QorliaQA Hidden paged reservation quant',
            'model_id': self.env['ir.model']._get_id('stock.quant'), 'domain_force': "[('id', '!=', %d)]" % self.quant.id})
        with self.assertRaises(AccessError):
            self.paged_pages()
        rule.unlink()
        other = self.move.copy({'picking_id': False, 'sale_line_id': False, 'group_id': False})
        self.env['ir.rule'].create({'name': 'QorliaQA Hidden paged reservation side effect',
            'model_id': self.env['ir.model']._get_id('stock.move'), 'domain_force': "[('id', '!=', %d)]" % other.id})
        original = type(self.picking)._qorlia_reservation_apply
        def altered(records, selected):
            result = original(records, selected)
            other.sudo().product_uom_qty += 1
            return result
        with patch.object(type(self.picking), '_qorlia_reservation_apply', altered), self.assertRaises(AccessError):
            self.paged_pages()
        self.assertEqual(other.product_uom_qty, 5)

    def test_paged_receipt_rejects_other_author_role_intent_and_legacy_protocol(self):
        request = self.paged_exact()
        saved = self.api().qorlia_reservation_paged_save(request)
        other = self.user.copy({'login': 'qorliaqa-paged-reservation-other'})
        with self.assertRaises(ValidationError):
            self.env['stock.picking'].with_user(other).qorlia_reservation_paged_status(request)
        with self.assertRaises(AccessError):
            self.env['stock.picking'].with_user(self.env.ref('base.public_user')).qorlia_reservation_paged_status(request)
        with self.assertRaises(ValidationError):
            self.api().qorlia_reservation_paged_status({**request, 'action': 'unreserve'})
        with self.assertRaises(ValidationError):
            self.api().qorlia_transfer_status(**{key: value for key, value in request.items() if key != 'review_complete_token'})
        self.assertEqual(saved, self.api().qorlia_reservation_paged_save(request))
        self.assertFalse(self.picking.copy().qorlia_reservation_receipts)

    def test_paged_created_references_are_snapshot_bound_and_remain_private_after_unreserve(self):
        self.env['stock.quant']._update_available_quantity(self.product, self.picking.location_id, -8, lot_id=self.lot)
        other = self.lot.copy({'name': 'QorliaQA Paged reservation second batch'})
        self.env['stock.quant']._update_available_quantity(self.product, self.picking.location_id, 8, lot_id=other)
        request = self.paged_exact()
        accepted = self.api().qorlia_reservation_paged_save(request)
        self.assertEqual(accepted['reference_count'], 2)
        first = self.api().qorlia_reservation_paged_references(request, limit=1)
        second = self.api().qorlia_reservation_paged_references(request, first['next_after'], first['version'], 1)
        self.assertFalse(second['next_after'])
        self.assertEqual({first['rows'][0]['id'], second['rows'][0]['id']}, set(self.picking.move_line_ids.ids))
        self.api().qorlia_reservation_paged_save(self.paged_exact(self.paged_data('unreserve')))
        with self.assertRaises(UserError):
            self.api().qorlia_reservation_paged_references(request, first['next_after'], first['version'], 1)
        unavailable = self.api().qorlia_reservation_paged_references(request)
        self.assertTrue(all(not row['available'] and row['id'] is False and row['name'] is False for row in unavailable['rows']))
        self.assertTrue(self.api().qorlia_reservation_paged_save(request)['accepted'])
        self.assertFalse(self.picking.move_line_ids)

    def test_paged_large_move_scope_reserves_without_legacy_graph_or_lost_sibling_rows(self):
        extra = self.env['stock.move'].create([dict(self.move.copy_data()[0], picking_id=self.picking.id,
            state='draft', product_uom_qty=1) for _index in range(500)])
        extra._action_confirm(merge=False)
        before = {move.id: move.product_uom_qty for move in self.picking.move_ids}
        with patch.object(type(self.env['sale.order']), '_qorlia_delivery_data', side_effect=AssertionError('No legacy graph.')):
            saved = self.api().qorlia_reservation_paged_save(self.paged_exact())
            self.assertEqual(saved['current']['transfer']['move_count'], 501)
            self.assertNotIn('moves', saved['current']['transfer'])
        self.assertEqual({move.id: move.product_uom_qty for move in self.picking.move_ids}, before)
        self.assertEqual(self.quant.reserved_quantity, 10)
        self.assertEqual(self.quant.quantity, 10)
        self.assertEqual(self.sale_line.qty_delivered, 0)

    def test_paged_large_operation_scope_sets_clears_and_recovers_beyond_legacy_cap(self):
        self.picking.action_assign()
        self.env['stock.move.line'].create([{'picking_id': self.picking.id, 'move_id': self.move.id,
            'product_id': self.product.id, 'product_uom_id': self.product.uom_id.id,
            'location_id': self.picking.location_id.id, 'location_dest_id': self.picking.location_dest_id.id,
            'lot_id': self.lot.id, 'qty_done': 0} for _index in range(2000)])
        operations = set(self.picking.move_line_ids.ids)
        self.assertEqual(len(operations), 2001)
        with patch.object(type(self.env['sale.order']), '_qorlia_delivery_data', side_effect=AssertionError('No legacy graph.')):
            request = self.paged_exact(self.paged_data('set_quantities'))
            accepted = self.api().qorlia_reservation_paged_save(request)
            self.assertEqual(accepted['current']['transfer']['operation_count'], 2001)
            self.assertEqual(self.move.quantity_done, 5)
            self.assertEqual(self.api().qorlia_reservation_paged_status(request), accepted)
            self.api().qorlia_reservation_paged_save(self.paged_exact(self.paged_data('clear_quantities')))
        self.assertEqual(set(self.picking.move_line_ids.ids), operations)
        self.assertEqual(self.move.quantity_done, 0)
        self.assertEqual(self.quant.reserved_quantity, 5)
        self.assertEqual(self.quant.quantity, 10)

    def test_paged_native_unavailable_actions_and_inventory_limit_remain_closed(self):
        for action in ('unreserve', 'set_quantities', 'clear_quantities'):
            with self.assertRaises(UserError):
                self.paged_pages(self.paged_data(action))
        with patch.object(type(self.picking), '_qorlia_reservation_scope', side_effect=UserError('Full inventory paging required.')):
            current = self.api().qorlia_reservation_paged_load(self.order.id, self.picking.id)
            self.assertFalse(current['write_ready'])
            self.assertTrue(all(current['reasons'].values()))
            with self.assertRaises(UserError):
                self.paged_pages()
        self.assertFalse(self.picking.qorlia_reservation_receipts)

    def test_preexisting_native_precommit_tracking_is_baselined_before_rollback_preview(self):
        self.env.cr.flush()
        called = []
        def pending():
            self.env['mail.message'].create({'body': 'QorliaQA Earlier native audit',
                'model': 'stock.picking', 'res_id': self.picking.id, 'message_type': 'comment'})
            called.append(True)
        self.env.cr.precommit.add(pending)
        picking = self.picking.with_user(self.user)
        picking._qorlia_stock_preparation_preview(lambda: picking._qorlia_reservation_paged_native('assign'),
            picking._qorlia_operation_paged_tables())
        self.assertEqual(called, [True])
        self.assertEqual(self.env['mail.message'].search_count([('body', 'like', 'QorliaQA Earlier native audit'),
            ('model', '=', 'stock.picking'), ('res_id', '=', self.picking.id)]), 1)
        self.assertEqual(self.quant.reserved_quantity, 0)
        self.assertFalse(self.picking.move_line_ids)
        self.assertFalse(self.picking.qorlia_reservation_receipts)

    def grow_inventory(self):
        lots = self.env['stock.lot'].create([{'name': 'QorliaQA Inventory page %s' % index,
            'product_id': self.product.id, 'company_id': self.env.company.id,
            'expiration_date': '2027-01-01 00:00:00'} for index in range(2000)])
        quants = self.env['stock.quant'].create([{'product_id': self.product.id,
            'location_id': self.picking.location_id.id, 'lot_id': lot.id, 'quantity': 1} for lot in lots])
        self.env.cr.flush()
        return quants

    def test_complete_inventory_scope_pages_every_quant_without_changing_legacy_cap(self):
        quants = self.grow_inventory() | self.quant
        model = type(self.picking)
        original = model._qorlia_reservation_read_scope
        seen, sizes = [], []
        def bounded(records, values, lock=False):
            page = values.get('stock.quant', self.env['stock.quant'])
            seen.extend(page.ids)
            sizes.append(len(page))
            return original(records, values, lock)
        with self.assertRaises(UserError):
            self.picking.with_user(self.user)._qorlia_reservation_scope()
        with patch.object(model, '_qorlia_reservation_read_scope', bounded):
            scope = self.picking.with_user(self.user)._qorlia_reservation_scope(complete=True)
        self.assertEqual(scope['kind'], 'qorlia.inventory-scope.v1')
        self.assertEqual(scope['quant_count'], 2001)
        self.assertEqual(set(seen), set(quants.ids))
        self.assertEqual(len(seen), 2001)
        self.assertEqual(sizes, [0, 500, 500, 500, 500, 1])
        self.assertEqual(scope, self.picking.with_user(self.user)._qorlia_reservation_scope(complete=True))
        self.assertNotIn('stock.quant', scope)
        self.assertTrue(self.load()['reasons']['assign'])
        self.assertFalse(self.api().qorlia_reservation_paged_load(self.order.id, self.picking.id)['reasons']['assign'])

    def test_complete_inventory_scope_binds_tail_quantity_lot_and_removal_configuration(self):
        quants = self.grow_inventory()
        picking = self.picking.with_user(self.user)
        scope = picking._qorlia_reservation_scope(complete=True)
        data = self.paged_data()
        quants[-1].quantity = 2
        self.assertNotEqual(scope, picking._qorlia_reservation_scope(complete=True))
        with self.assertRaises(UserError):
            self.paged_pages(data)
        scope = picking._qorlia_reservation_scope(complete=True)
        quants[-1].lot_id.expiration_date = '2028-01-01 00:00:00'
        self.assertNotEqual(scope, picking._qorlia_reservation_scope(complete=True))
        scope = picking._qorlia_reservation_scope(complete=True)
        fifo = self.env.ref('stock.removal_fifo')
        self.product.categ_id.removal_strategy_id = self.env.ref('stock.removal_lifo') if self.product.categ_id.removal_strategy_id == fifo else fifo
        self.assertNotEqual(scope, picking._qorlia_reservation_scope(complete=True))
        self.assertFalse(self.picking.qorlia_reservation_receipts)

    def test_complete_inventory_hidden_tail_quant_fails_closed_without_partial_summary(self):
        quants = self.grow_inventory()
        self.env['ir.rule'].create({'name': 'QorliaQA Hidden inventory tail',
            'model_id': self.env['ir.model']._get_id('stock.quant'),
            'domain_force': "[('id', '!=', %s)]" % quants[-1].id})
        with self.assertRaises(AccessError):
            self.picking.with_user(self.user)._qorlia_reservation_scope(complete=True)
        loaded = self.api().qorlia_reservation_paged_load(self.order.id, self.picking.id)
        self.assertFalse(loaded['write_ready'])
        self.assertTrue(all(loaded['reasons'].values()))
        self.assertNotIn('configuration', loaded)
        self.assertFalse(self.picking.qorlia_reservation_receipts)

    def test_complete_inventory_hidden_tail_lot_and_owner_are_checked(self):
        quants = self.grow_inventory()
        rule = self.env['ir.rule'].create({'name': 'QorliaQA Hidden inventory tail lot',
            'model_id': self.env['ir.model']._get_id('stock.lot'),
            'domain_force': "[('id', '!=', %s)]" % quants[-1].lot_id.id})
        with self.assertRaises(AccessError):
            self.picking.with_user(self.user)._qorlia_reservation_scope(complete=True)
        rule.unlink()
        owner = self.env['res.partner'].create({'name': 'QorliaQA Hidden inventory owner'})
        quants[-1].owner_id = owner
        self.env['ir.rule'].create({'name': 'QorliaQA Hidden inventory tail owner',
            'model_id': self.env['ir.model']._get_id('res.partner'),
            'domain_force': "[('id', '!=', %s)]" % owner.id})
        with self.assertRaises(AccessError):
            self.picking.with_user(self.user)._qorlia_reservation_scope(complete=True)

    def test_complete_inventory_field_access_is_checked_on_every_page(self):
        self.grow_inventory()
        model = type(self.env['stock.quant'])
        original = model.check_field_access_rights
        checked = []
        def fields(records, operation, names=None):
            if operation == 'read' and names and 'reserved_quantity' in names and 'write_date' not in names:
                checked.append(len(records))
                if len(checked) == 6:
                    raise AccessError('QorliaQA Tail stock field is inaccessible.')
            return original(records, operation, names)
        with patch.object(model, 'check_field_access_rights', fields):
            with self.assertRaises(AccessError):
                self.picking.with_user(self.user)._qorlia_reservation_scope(complete=True)
        self.assertEqual(checked, [0, 500, 500, 500, 500, 1])

    def test_complete_inventory_keeps_native_product_and_source_subtree(self):
        child = self.env['stock.location'].create({'name': 'QorliaQA Inventory child',
            'location_id': self.picking.location_id.id, 'usage': 'internal', 'company_id': self.env.company.id})
        outside = self.env['stock.location'].create({'name': 'QorliaQA Inventory outside',
            'usage': 'internal', 'company_id': self.env.company.id})
        self.env['stock.quant']._update_available_quantity(self.product, child, 2, lot_id=self.lot)
        self.env['stock.quant']._update_available_quantity(self.product, outside, 3, lot_id=self.lot)
        other = self.env['product.product'].create({'name': 'QorliaQA Unrelated inventory product',
            'type': 'product', 'taxes_id': [(6, 0, [])]})
        self.env['stock.quant']._update_available_quantity(other, self.picking.location_id, 4)
        picking = self.picking.with_user(self.user)
        scope = picking._qorlia_reservation_scope(complete=True)
        self.assertEqual(scope['quant_count'], 2)
        outside_quant = self.env['stock.quant'].search([('product_id', '=', self.product.id), ('location_id', '=', outside.id)])
        outside_quant.quantity = 4
        self.assertEqual(scope, picking._qorlia_reservation_scope(complete=True))
        self.env['stock.quant']._update_available_quantity(self.product, child, 1, lot_id=self.lot)
        self.assertNotEqual(scope, picking._qorlia_reservation_scope(complete=True))

    def test_complete_inventory_reservation_review_save_and_recovery_beyond_legacy_cap(self):
        self.grow_inventory()
        picking = self.picking.with_user(self.user)
        before = picking._qorlia_confirmation_stamp(picking._qorlia_operation_paged_tables())
        request = self.paged_exact()
        self.assertEqual(before, picking._qorlia_confirmation_stamp(picking._qorlia_operation_paged_tables()))
        accepted = self.api().qorlia_reservation_paged_save(request)
        self.assertTrue(accepted['accepted'])
        self.assertEqual(self.move.reserved_availability, 5)
        self.assertEqual(sum(self.env['stock.quant'].search([('product_id', '=', self.product.id)]).mapped('quantity')), 2010)
        self.assertEqual(self.sale_line.qty_delivered, 0)
        self.assertEqual(accepted, self.api().qorlia_reservation_paged_status(request))
        self.assertEqual(accepted, self.api().qorlia_reservation_paged_save(request))
        self.assertEqual(len(self.picking.qorlia_reservation_receipts), 1)

    def test_complete_inventory_preserves_accepted_previous_scope_request_recovery(self):
        model = type(self.picking)
        original = model._qorlia_reservation_scope
        def legacy_scope(records, lock=False, complete=False):
            return original(records, lock=lock, complete=False)
        with patch.object(model, '_qorlia_reservation_scope', legacy_scope):
            request = self.paged_exact()
            accepted = self.api().qorlia_reservation_paged_save(request)
        with patch.object(model, '_qorlia_reservation_scope', side_effect=AssertionError('Accepted recovery must not rescan or reserve.')):
            self.assertEqual(self.api().qorlia_reservation_paged_status(request), accepted)
            self.assertEqual(self.api().qorlia_reservation_paged_save(request), accepted)
        self.assertEqual(self.quant.reserved_quantity, 5)
        self.assertEqual(len(self.picking.qorlia_reservation_receipts), 1)
