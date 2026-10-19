# SPDX-License-Identifier: LGPL-3.0-or-later
# Copyright 2026 Qorlia contributors.
from datetime import datetime
import json
from unittest.mock import patch

from lxml import etree
from odoo import fields
from odoo.exceptions import AccessError, UserError, ValidationError
from odoo.tests import Form, TransactionCase, tagged

from . import test_stock_inventory as inventory


@tagged('post_install', '-at_install')
class StockInventoryFormTest(inventory.StockInventoryFixture, TransactionCase):
    unlinked = inventory.StockInventoryConfirmationTest.unlinked
    api = inventory.StockInventoryConfirmationTest.api
    deny = inventory.StockInventoryDetailTest.deny
    delivered = inventory.StockInventoryReturnTest.delivered

    def load(self, picking=False, kind=False):
        return self.api().qorlia_inventory_form_load(picking.id if picking else False, kind.id if kind else False)

    def test_new_receipt_delivery_and_internal_defaults_match_the_installed_native_form(self):
        self.assertFalse(self.reader.has_group('sales_team.group_sale_salesman'))
        for kind in (False, self.in_type, self.out_type, self.internal_type):
            with self.subTest(operation=kind.code if kind else 'default'), patch.object(
                    self.env['stock.picking']._fields['scheduled_date'], 'default', lambda model: datetime(2026, 10, 20, 10)):
                native = Form(self.api().with_context(**({'default_picking_type_id': kind.id} if kind else {})))
                before = self.stamp()
                loaded = self.load(kind=kind)
                self.assertTrue(loaded['read_only'])
                self.assertIs(loaded['transfer_id'], False)
                self.assertIs(loaded['values']['id'], False)
                self.assertEqual(loaded['picking_type_id'], kind.id if kind else False)
                for name in ('picking_type_id', 'picking_type_code', 'location_id', 'location_dest_id',
                        'scheduled_date', 'state', 'partner_id', 'company_id', 'user_id', 'move_type', 'priority', 'note'):
                    expected = fields.Datetime.to_string(native._values[name]) if name == 'scheduled_date' else native._values[name]
                    self.assertEqual(loaded['values'][name], expected, name)
                self.assertEqual(before, self.stamp())
                json.dumps(loaded, allow_nan=False)

    def test_existing_draft_ready_done_and_cancelled_forms_use_native_values_and_state_modifiers(self):
        pickings = [self.unlinked(), self.unlinked(), self.delivered(), self.unlinked()]
        pickings[1].action_confirm()
        pickings[1].action_assign()
        pickings[3].action_cancel()
        for picking in pickings:
            with self.subTest(state=picking.state):
                before = self.stamp()
                loaded = self.load(picking)
                self.assertTrue(loaded['read_only'])
                self.assertEqual(loaded['values']['state'], picking.state)
                self.assertEqual(loaded['values']['id'], picking.id)
                self.assertEqual(loaded['labels']['picking_type_id'][0], picking.picking_type_id.id)
                self.assertEqual(loaded['values']['scheduled_date'], fields.Datetime.to_string(picking.scheduled_date))
                self.assertEqual(next(row for row in loaded['layout'] if row['field'] == 'picking_type_id')
                    ['modifiers']['readonly'], [['state', '!=', 'draft']])
                self.assertEqual(before, self.stamp())

    def test_merged_root_layout_preserves_nodes_labels_rules_and_collection_boundaries(self):
        picking = self.unlinked()
        loaded = self.load(picking)
        view = self.api().get_view(view_id=self.env.ref('stock.view_picking_form').id, view_type='form')
        nodes = etree.fromstring(view['arch']).xpath('.//field[not(ancestor::field)]')
        self.assertEqual([row['field'] for row in loaded['layout']], [node.get('name') for node in nodes])
        self.assertEqual(set(loaded['fields']), {node.get('name') for node in nodes})
        for node, row in zip(nodes, loaded['layout']):
            self.assertEqual(row['modifiers'], json.loads(node.get('modifiers') or '{}'))
        self.assertIn('move_ids_without_package', loaded['collections'])
        self.assertNotIn('move_ids_without_package', loaded['values'])
        self.assertNotIn('move_line_ids_without_package', loaded['values'])
        self.assertNotIn('qty_done', loaded['fields'])
        self.assertEqual(loaded['unsupported'], [])

    def test_owner_group_fields_appear_only_when_the_native_view_permits_them(self):
        picking = self.unlinked()
        self.assertNotIn('owner_id', self.load(picking)['fields'])
        self.reader.groups_id = [(4, self.env.ref('stock.group_tracking_owner').id)]
        loaded = self.load(picking)
        self.assertIn('owner_id', loaded['fields'])
        row = next(row for row in loaded['layout'] if row['field'] == 'owner_id')
        self.assertEqual(row['modifiers']['invisible'], [['picking_type_code', '!=', 'incoming']])

    def test_read_version_changes_for_header_labels_access_context_and_merged_view(self):
        picking = self.unlinked()
        first = self.load(picking)
        self.assertEqual(first, self.load(picking))
        picking.with_env(self.env).note = 'QorliaQA Native transfer note'
        changed = self.load(picking)
        self.assertNotEqual(first['version'], changed['version'])
        self.assertIn('QorliaQA Native transfer note', changed['values']['note'])
        tz = self.api().with_context(tz='Asia/Kolkata').qorlia_inventory_form_load(picking.id)
        self.assertNotEqual(changed['version'], tz['version'])
        self.env['ir.ui.view'].create({'name': 'QorliaQA Inventory native note label', 'model': 'stock.picking',
            'inherit_id': self.env.ref('stock.view_picking_form').id,
            'arch': '<data><xpath expr="//field[@name=\'note\']" position="attributes"><attribute name="string">QorliaQA Transfer notes</attribute></xpath></data>'})
        relabelled = self.load(picking)
        self.assertNotEqual(changed['version'], relabelled['version'])
        self.assertEqual(next(row for row in relabelled['layout'] if row['field'] == 'note')['label'], 'QorliaQA Transfer notes')

    def test_invalid_identifiers_and_untrusted_default_context_do_not_change_scope(self):
        picking = self.unlinked()
        for invalid in (0, True, None, -1, '1', 1.5):
            with self.assertRaises(ValidationError):
                self.api().qorlia_inventory_form_load(invalid)
            with self.assertRaises(ValidationError):
                self.api().qorlia_inventory_form_load(False, invalid)
        with self.assertRaises(ValidationError):
            self.api().qorlia_inventory_form_load(picking.id, self.in_type.id)
        self.in_type.active = False
        with self.assertRaises(ValidationError):
            self.load(kind=self.in_type)
        self.assertIs(self.api().with_context(default_company_id=-1, default_picking_type_id=-1,
            qorlia_allow_save=True).qorlia_inventory_form_load(picking.id)['read_only'], True)
        other = self.env['res.company'].create({'name': 'QorliaQA Foreign form company'})
        warehouse = self.env['stock.warehouse'].search([('company_id', '=', other.id)], limit=1)
        if not warehouse:
            warehouse = self.env['stock.warehouse'].create({'name': 'QorliaQA Foreign form warehouse',
                'code': 'QFF', 'company_id': other.id})
        with self.assertRaises(AccessError):
            self.load(kind=warehouse.int_type_id)

    def test_hidden_moves_and_transfer_rules_do_not_expose_partial_forms(self):
        picking = self.unlinked()
        rule = self.deny('stock.move', picking.move_ids.id)
        before = self.stamp()
        with self.assertRaises(AccessError):
            self.load(picking)
        self.assertEqual(before, self.stamp())
        rule.unlink()
        self.deny('stock.picking', picking.id)
        with self.assertRaises(AccessError):
            self.load(picking)

    def test_root_field_and_related_label_read_permissions_are_enforced(self):
        picking = self.unlinked()
        original = type(self.api()).check_field_access_rights
        def deny_note(records, operation, fields=None):
            if operation == 'read' and fields and 'note' in fields:
                raise AccessError('QorliaQA Denied native note field')
            return original(records, operation, fields)
        with patch.object(type(self.api()), 'check_field_access_rights', deny_note):
            with self.assertRaises(AccessError):
                self.load(picking)
        picking.with_env(self.env).user_id = self.user
        self.deny('res.users', self.user.id)
        with self.assertRaises(AccessError):
            self.load(picking)

    def test_onchange_side_effects_roll_back_and_do_not_escape_through_callbacks(self):
        picking = self.unlinked()
        original = type(self.api()).onchange
        self.env.flush_all()
        self.env.cr.flush()
        before = self.stamp()
        callbacks = {name: getattr(self.env.cr, name) for name in ('precommit', 'postcommit', 'prerollback', 'postrollback')}
        marker = []
        def malicious(records, *args, **kwargs):
            records.env['stock.picking'].browse(picking.id).write({'origin': 'QorliaQA Forbidden form side effect'})
            records.env.cr.postcommit.add(lambda: marker.append('sent'))
            return original(records, *args, **kwargs)
        with patch.object(type(self.api()), 'onchange', malicious):
            with self.assertRaisesRegex(UserError, 'changed stored data'):
                self.load(kind=self.in_type)
        self.assertEqual(before, self.stamp())
        self.assertEqual(marker, [])
        for name, callback in callbacks.items():
            self.assertIs(getattr(self.env.cr, name), callback)

    def test_nonstock_actor_cannot_open_a_new_or_existing_transfer_form(self):
        picking = self.unlinked()
        public = self.env['stock.picking'].with_user(self.env.ref('base.public_user'))
        for args in ((), (picking.id,), (False, self.in_type.id)):
            with self.assertRaises(AccessError):
                public.qorlia_inventory_form_load(*args)
