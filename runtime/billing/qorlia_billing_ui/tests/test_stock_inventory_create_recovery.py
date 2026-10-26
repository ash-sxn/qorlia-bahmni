# SPDX-License-Identifier: LGPL-3.0-or-later
# Copyright 2026 Qorlia contributors.
from contextlib import closing
import copy
from unittest.mock import patch

from odoo import Command
from odoo.exceptions import AccessError, UserError, ValidationError
from odoo.tests import TransactionCase, tagged

from .test_stock_inventory_create_journal import StockInventoryCreateJournalFixture


@tagged('post_install', '-at_install')
class StockInventoryCreateRecoveryTest(StockInventoryCreateJournalFixture, TransactionCase):
    def accepted(self, children=0):
        original = type(self.api()).default_get
        def defaults(records, names):
            values = original(records, names)
            if children and 'move_ids_without_package' in names:
                values['move_ids_without_package'] = [Command.create({
                    'name': 'QorliaQA Recovery medicine %s' % index,
                    'product_id': self.product.id, 'product_uom': self.product.uom_id.id, 'product_uom_qty': 2,
                    'location_id': self.warehouse.lot_stock_id.id,
                    'location_dest_id': self.customer.property_stock_customer.id}) for index in range(children)]
            return values
        with patch.object(type(self.api()), 'default_get', defaults):
            payload = self.payload()
            outcome = self.api()._qorlia_inventory_create_once(payload)
        return payload, outcome

    def hide(self, model, identifier):
        return self.env['ir.rule'].create({'name': 'QorliaQA Hide creation reference',
            'model_id': self.env['ir.model']._get_id(model),
            'domain_force': "[('id', '!=', %s)]" % identifier})

    def test_read_sandbox_rolls_back_audit_only_native_work_and_restores_all_callbacks(self):
        # The boundary drains earlier native tracking before taking its read-only baseline.
        self.env.cr.flush()
        before, cr = self.stamp(), self.env.cr
        hooks = {name: (getattr(cr, name), list(getattr(cr, name)._funcs), copy.deepcopy(getattr(cr, name).data))
            for name in ('precommit', 'postcommit', 'prerollback', 'postrollback')}
        reached = []
        def audit_only():
            cr.execute('UPDATE product_product SET write_uid = %s WHERE id = %s', [self.reader.id, self.product.id])
            cr.postcommit.add(lambda: reached.append('unexpected'))
            return {'read': True}
        self.assertEqual(self.api()._qorlia_inventory_form_read(audit_only), {'read': True})
        self.assertEqual(self.stamp(), before)
        self.assertEqual(reached, [])
        for name, (callbacks, functions, data) in hooks.items():
            self.assertIs(getattr(cr, name), callbacks)
            self.assertEqual(list(callbacks._funcs), functions)
            self.assertEqual(callbacks.data, data)

    def test_read_sandbox_still_rejects_business_changes_and_restores_full_rows(self):
        before = self.stamp()
        def changed():
            self.product.write({'default_code': 'QorliaQA Forbidden read-side business change'})
            return True
        with self.assertRaisesRegex(UserError, 'changed stored data'):
            self.api()._qorlia_inventory_form_read(changed)
        self.assertEqual(self.stamp(), before)

    def test_unknown_status_is_compact_without_a_record_anchor_or_business_write(self):
        payload, before = self.payload(), self.stamp()
        self.assertEqual(self.api().qorlia_inventory_create_status(payload), {
            'request_key': payload['request_key'], 'accepted': False, 'stopped': False,
            'state_after': False, 'reference_count': 0, 'transfer': False})
        with self.assertRaises(UserError):
            self.api().qorlia_inventory_create_references(payload)
        self.assertEqual(self.rows(), 0)
        self.assertEqual(self.stamp(), before)

    def test_stop_is_terminal_and_idempotent_without_native_business_creation(self):
        payload, before = self.payload(), self.stamp()
        def forbidden(records, *args):
            raise AssertionError('Public Stop executed native creation')
        with patch.object(type(self.api()), '_qorlia_inventory_create_native', forbidden):
            stopped = self.api().qorlia_inventory_create_stop(payload)
            self.assertEqual(stopped, {'request_key': payload['request_key'], 'accepted': False, 'stopped': True,
                'state_after': False, 'reference_count': 0, 'transfer': False})
            self.assertEqual(self.api().qorlia_inventory_create_stop(payload), stopped)
            self.assertEqual(self.api().qorlia_inventory_create_status(payload), stopped)
            self.assertTrue(self.api()._qorlia_inventory_create_once(payload)['stopped'])
        with self.assertRaises(UserError):
            self.api().qorlia_inventory_create_references(payload)
        self.assertEqual(self.rows(), 1)
        self.assertEqual(self.stamp(), before)

    def test_accepted_status_returns_only_currently_readable_root_and_bounded_references(self):
        payload, accepted = self.accepted()
        picking = self.env['stock.picking'].browse(accepted['result']['transfer_id'])
        before = self.stamp()
        status = self.api().qorlia_inventory_create_status(payload)
        self.assertEqual(set(status), {'request_key', 'accepted', 'stopped', 'state_after', 'reference_count', 'transfer'})
        self.assertTrue(status['accepted'])
        self.assertEqual(status['state_after'], accepted['result']['state_after'])
        self.assertEqual(status['transfer'], {'model': 'stock.picking', 'id': picking.id,
            'name': picking.display_name, 'available': True})
        self.assertEqual(status['reference_count'], len(accepted['result']['references']))
        page = self.api().qorlia_inventory_create_references(payload, limit=1)
        self.assertEqual(page['total_count'], status['reference_count'])
        self.assertEqual(len(page['rows']), 1)
        self.assertEqual(self.api().qorlia_inventory_create_stop(payload), status)
        self.assertEqual(self.stamp(), before)

    def test_deleted_root_retains_acceptance_without_disclosing_deleted_ids_or_recreating(self):
        payload, accepted = self.accepted()
        picking = self.env['stock.picking'].browse(accepted['result']['transfer_id'])
        picking.unlink()
        before = self.stamp()
        def forbidden(records, *args):
            raise AssertionError('Deleted creation was replayed')
        with patch.object(type(self.api()), '_qorlia_inventory_create_native', forbidden):
            status = self.api().qorlia_inventory_create_status(payload)
            self.assertTrue(status['accepted'])
            self.assertEqual(status['transfer'], {'model': 'stock.picking', 'id': False, 'name': False, 'available': False})
            self.assertEqual(self.api().qorlia_inventory_create_stop(payload), status)
            page = self.api().qorlia_inventory_create_references(payload)
            self.assertTrue(all(row['id'] is False and row['name'] is False and not row['available'] for row in page['rows']))
        self.assertEqual(self.stamp(), before)
        self.assertEqual(self.api()._qorlia_inventory_create_status(payload), accepted)

    def test_current_record_rule_hides_root_identity_without_erasing_acceptance(self):
        payload, accepted = self.accepted()
        first = self.api().qorlia_inventory_create_references(payload)
        self.hide('stock.picking', accepted['result']['transfer_id'])
        status = self.api().qorlia_inventory_create_status(payload)
        self.assertTrue(status['accepted'])
        self.assertFalse(status['transfer']['available'])
        self.assertIs(status['transfer']['id'], False)
        page = self.api().qorlia_inventory_create_references(payload)
        self.assertIs(page['rows'][0]['name'], False)
        self.assertNotEqual(page['version'], first['version'])

    def test_hidden_child_is_unavailable_while_the_root_stays_readable(self):
        payload, accepted = self.accepted(children=1)
        picking = self.env['stock.picking'].browse(accepted['result']['transfer_id'])
        self.assertEqual(len(picking.move_ids), 1)
        first = self.api().qorlia_inventory_create_references(payload, limit=1)
        self.assertTrue(first['next_after'])
        self.hide('stock.move', picking.move_ids.id)
        self.assertTrue(self.api().qorlia_inventory_create_status(payload)['transfer']['available'])
        with self.assertRaises(UserError):
            self.api().qorlia_inventory_create_references(payload, first['next_after'], first['version'], 1)
        rows = self.api().qorlia_inventory_create_references(payload)['rows']
        hidden = next(row for row in rows if row['model'] == 'stock.move')
        self.assertEqual({key: hidden[key] for key in ('id', 'name', 'available')}, {'id': False, 'name': False, 'available': False})

    def test_field_level_label_permission_is_checked_before_returning_an_id(self):
        payload, _accepted = self.accepted()
        with patch.object(self.env['stock.picking']._fields['display_name'], 'groups', 'base.group_system'):
            status = self.api().qorlia_inventory_create_status(payload)
            self.assertTrue(status['accepted'])
            self.assertIs(status['transfer']['id'], False)
            self.assertIs(status['transfer']['name'], False)
            self.assertFalse(status['transfer']['available'])

    def test_reference_moved_outside_active_companies_is_not_disclosed(self):
        payload, accepted = self.accepted()
        company = self.env['res.company'].create({'name': 'QorliaQA Recovery foreign company'})
        warehouse = self.env['stock.warehouse'].search([('company_id', '=', company.id)], limit=1)
        if not warehouse:
            warehouse = self.env['stock.warehouse'].create({'name': 'QorliaQA Recovery foreign warehouse',
                'code': 'QJR', 'company_id': company.id})
        self.env['stock.picking'].browse(accepted['result']['transfer_id']).write({
            'company_id': company.id, 'picking_type_id': warehouse.out_type_id.id,
            'location_id': warehouse.lot_stock_id.id, 'location_dest_id': self.env.ref('stock.stock_location_customers').id})
        status = self.api().qorlia_inventory_create_status(payload)
        self.assertTrue(status['accepted'])
        self.assertFalse(status['transfer']['available'])
        self.assertIs(status['transfer']['id'], False)

    def test_all_actual_child_references_page_in_order_without_loss_or_duplicates(self):
        payload, accepted = self.accepted(children=2)
        keys, after, version = [], 0, False
        while True:
            page = self.api().qorlia_inventory_create_references(payload, after, version, 1)
            self.assertEqual(page['after'], after)
            self.assertEqual(len(page['rows']), 1)
            self.assertTrue(page['rows'][0]['available'])
            keys.extend(row['key'] for row in page['rows'])
            if page['next_after'] is False:
                break
            after, version = page['next_after'], page['version']
        self.assertEqual(keys, sorted(accepted['result']['references']))
        self.assertEqual(len(keys), len(set(keys)))
        self.assertEqual(page['total_count'], len(keys))
        self.assertGreaterEqual(len(keys), 3)

    def test_reference_name_changes_require_restarting_the_original_paging_version(self):
        payload, accepted = self.accepted(children=1)
        page = self.api().qorlia_inventory_create_references(payload, limit=1)
        self.env['stock.picking'].browse(accepted['result']['transfer_id']).name = 'QorliaQA Renamed accepted transfer'
        with self.assertRaises(UserError):
            self.api().qorlia_inventory_create_references(payload, page['next_after'], page['version'], 1)
        self.assertNotEqual(self.api().qorlia_inventory_create_references(payload)['version'], page['version'])

    def test_other_actor_changed_body_and_company_scope_cannot_read_or_stop_history(self):
        payload, _accepted = self.accepted()
        other = self.env['res.users'].with_context(no_reset_password=True).create({
            'name': 'QorliaQA Other recovery reader', 'login': 'qorliaqa-other-recovery-reader',
            'company_id': self.env.company.id, 'company_ids': [Command.set(self.env.company.ids)],
            'groups_id': [Command.set([self.env.ref('stock.group_stock_user').id])]})
        company = self.env['res.company'].create({'name': 'QorliaQA Other recovery scope'})
        self.reader.company_ids = [Command.link(company.id)]
        for method in ('qorlia_inventory_create_status', 'qorlia_inventory_create_references', 'qorlia_inventory_create_stop'):
            with self.subTest(method=method):
                with self.assertRaises(ValidationError):
                    getattr(self.env['stock.picking'].with_user(other), method)(payload)
                with self.assertRaises(ValidationError):
                    getattr(self.api(), method)(dict(payload, review_version='c' * 64))
                with self.assertRaises(ValidationError):
                    getattr(self.api().with_context(allowed_company_ids=[self.env.company.id, company.id]), method)(payload)
                with self.assertRaises(AccessError):
                    getattr(self.env['stock.picking'].with_user(self.env.ref('base.public_user')), method)(payload)
        self.assertEqual(self.rows(), 1)

    def test_reference_cursors_and_limits_reject_invalid_or_unpinned_requests(self):
        payload, _accepted = self.accepted()
        before = self.stamp()
        cases = [((-1, False, 1), ValidationError), ((True, False, 1), ValidationError),
            ((1, False, 1), ValidationError), ((0, False, 0), ValidationError),
            ((0, False, 101), ValidationError), ((0, False, True), ValidationError),
            ((0, 'bad', 1), ValidationError), ((1000, 'a' * 64, 1), UserError)]
        for args, exception in cases:
            with self.subTest(args=args), self.assertRaises(exception):
                self.api().qorlia_inventory_create_references(payload, *args)
        self.assertEqual(self.stamp(), before)
        self.assertEqual(self.rows(), 1)

    def test_missing_journal_schema_fails_closed_without_an_incidental_install(self):
        payload, before = self.payload(), self.stamp()
        with closing(self.env.cr.savepoint()):
            self.env.cr.execute('ALTER TABLE qorlia_inventory_create_request RENAME TO qorliaqa_hidden_creation_journal')
            for method in ('qorlia_inventory_create_status', 'qorlia_inventory_create_references', 'qorlia_inventory_create_stop'):
                with self.subTest(method=method), self.assertRaisesRegex(UserError, 'not installed'):
                    getattr(self.api(), method)(payload)
        self.assertEqual(self.rows(), 0)
        self.assertEqual(self.stamp(), before)

    def test_mutating_public_results_never_changes_original_input_or_journal_history(self):
        payload, accepted = self.accepted()
        original = copy.deepcopy(payload)
        status = self.api().qorlia_inventory_create_status(payload)
        status['transfer'].clear()
        page = self.api().qorlia_inventory_create_references(payload)
        page['rows'][0]['id'] = -1
        self.assertEqual(self.api()._qorlia_inventory_create_status(payload), accepted)
        self.assertEqual(payload, original)
        self.assertGreater(self.api().qorlia_inventory_create_status(payload)['transfer']['id'], 0)
