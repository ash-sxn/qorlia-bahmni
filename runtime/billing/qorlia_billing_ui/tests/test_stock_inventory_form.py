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
        self.env.flush_all()
        public = self.env['stock.picking'].with_user(self.env.ref('base.public_user'))
        for args in ((), (picking.id,), (False, self.in_type.id)):
            with self.assertRaises(AccessError):
                public.qorlia_inventory_form_load(*args)

    def node(self, loaded, field):
        return next(index for index, row in enumerate(loaded['layout'])
            if row['field'] == field and row['rules']['visible'] and not row['rules']['readonly'])

    def choices(self, picking, field, **kwargs):
        loaded = self.load(picking)
        return self.api().qorlia_inventory_form_choices(picking.id, node=self.node(loaded, field), **kwargs)

    def test_separate_labels_widgets_options_help_and_ancestor_conditions_match_merged_xml(self):
        picking = self.unlinked()
        loaded = self.load(picking)
        root = etree.fromstring(self.api().get_view(view_id=self.env.ref('stock.view_picking_form').id,
            view_type='form')['arch'])
        nodes = root.xpath('.//field[not(ancestor::field)]')
        for row, node in zip(loaded['layout'], nodes):
            self.assertEqual(row['attributes'], {key: node.get(key) for key in
                ('id', 'widget', 'options', 'help', 'nolabel', 'placeholder', 'force_save', 'on_change')
                if node.get(key) is not None})
            self.assertEqual(row['ancestor_modifiers'], [json.loads(parent.get('modifiers'))
                for parent in reversed(list(node.iterancestors())) if parent.get('modifiers')])
        partner_labels = [row for row in loaded['label_nodes'] if row['target'] == 'partner_id']
        self.assertEqual([row['label'] for row in partner_labels], ['Delivery Address', 'Receive From', 'Contact'])
        self.assertEqual([row['label'] for row in partner_labels if row['visible']], ['Delivery Address'])
        self.assertEqual(next(row for row in loaded['layout'] if row['field'] == 'priority')['attributes']['widget'], 'priority')
        self.assertEqual(loaded['fields']['scheduled_date']['help'],
            self.api().fields_get(['scheduled_date'], attributes=['help'])['scheduled_date']['help'])

    def test_direction_labels_and_editable_scalar_rules_match_native_form(self):
        for kind, label in ((self.in_type, 'Receive From'), (self.out_type, 'Delivery Address'),
                (self.internal_type, 'Contact')):
            picking = self.unlinked(kind)
            native = Form(picking)
            loaded = self.load(picking)
            self.assertEqual([row['label'] for row in loaded['label_nodes']
                if row['target'] == 'partner_id' and row['visible']], [label])
            for name in ('partner_id', 'picking_type_id', 'location_id', 'location_dest_id',
                    'scheduled_date', 'move_type', 'user_id', 'origin', 'note'):
                row = next(row for row in loaded['layout'] if row['field'] == name)
                for modifier in ('readonly', 'required'):
                    self.assertEqual(row['rules'][modifier], native._get_modifier(name, modifier), (kind.code, name, modifier))
                self.assertEqual(row['rules']['visible'], not native._get_modifier(name, 'invisible'), (kind.code, name))

    def test_relation_pages_match_native_name_search_order_and_do_not_change_data(self):
        picking = self.unlinked()
        self.env['res.partner'].create([{'name': 'QorliaQA Choice contact %02d' % index,
            'company_id': self.env.company.id} for index in range(30)])
        expected = self.env['res.partner'].with_user(self.reader).name_search(name='QorliaQA Choice contact',
            args=[('company_id', 'in', [self.env.company.id, False])], operator='ilike', limit=51)
        before = self.stamp()
        first = self.choices(picking, 'partner_id', search='QorliaQA Choice contact')
        second = self.choices(picking, 'partner_id', search='QorliaQA Choice contact', offset=25)
        self.assertEqual(first['rows'], [list(item) for item in expected[:25]])
        self.assertEqual(second['rows'], [list(item) for item in expected[25:]])
        self.assertTrue(first['has_more'])
        self.assertFalse(second['has_more'])
        self.assertEqual(first['form_version'], second['form_version'])
        self.assertEqual(first['transfer_id'], picking.id)
        self.assertIs(first['picking_type_id'], False)
        self.assertTrue(first['read_only'])
        self.assertEqual(before, self.stamp())

    def test_view_domain_replaces_model_domain_like_native_web_responsible_search(self):
        picking = self.unlinked()
        internal = self.env['res.users'].with_context(no_reset_password=True).create({
            'name': 'QorliaQA Choice nonstock colleague', 'login': 'qorliaqa-choice-nonstock',
            'company_id': self.env.company.id, 'company_ids': [(6, 0, self.env.company.ids)],
            'groups_id': [(6, 0, [self.env.ref('base.group_user').id])]})
        self.assertFalse(internal.has_group('stock.group_stock_user'))
        loaded = self.load(picking)
        row = loaded['layout'][self.node(loaded, 'user_id')]
        self.assertEqual(row['domain'], "[('share', '=', False)]")
        result = self.choices(picking, 'user_id', search='QorliaQA Choice nonstock colleague')
        expected = self.env['res.users'].with_user(self.reader).name_search(name='QorliaQA Choice nonstock colleague',
            args=[('share', '=', False)], operator='ilike', limit=26)
        self.assertEqual(result['rows'], [list(item) for item in expected])
        self.assertIn(internal.id, [row[0] for row in result['rows']])

    def test_new_form_choices_use_native_default_company_type_and_location_domain(self):
        loaded = self.load(kind=self.internal_type)
        node = self.node(loaded, 'location_dest_id')
        before = self.stamp()
        original = type(self.env['stock.location']).name_search
        observed = []
        def capture(records, *args, **kwargs):
            observed.append(dict(records.env.context))
            return original(records, *args, **kwargs)
        with patch.object(type(self.env['stock.location']), 'name_search', capture):
            result = self.api().qorlia_inventory_form_choices(False, self.internal_type.id, node, 'WH')
        expected = self.env['stock.location'].with_user(self.reader).name_search(name='WH',
            args=[('company_id', 'in', [self.env.company.id, False])], operator='ilike', limit=26)
        self.assertIs(result['transfer_id'], False)
        self.assertEqual(result['picking_type_id'], self.internal_type.id)
        self.assertEqual(result['rows'], [list(item) for item in expected[:25]])
        self.assertEqual(len(observed), 1)
        self.assertEqual(observed[0]['default_picking_type_id'], self.internal_type.id)
        self.assertEqual(before, self.stamp())

    def test_hidden_readonly_nonrelation_and_malformed_choice_requests_fail_closed(self):
        picking = self.unlinked()
        loaded = self.load(picking)
        for index, row in enumerate(loaded['layout']):
            if loaded['fields'][row['field']]['type'] == 'many2one' and (
                    not row['rules']['visible'] or row['rules']['readonly']):
                with self.assertRaises(AccessError):
                    self.api().qorlia_inventory_form_choices(picking.id, node=index)
        scalar = next(index for index, row in enumerate(loaded['layout']) if row['field'] == 'origin')
        with self.assertRaises(ValidationError):
            self.api().qorlia_inventory_form_choices(picking.id, node=scalar)
        for kwargs in ({'node': True}, {'node': -1}, {'node': '1'}, {'node': len(loaded['layout'])},
                {'offset': True}, {'offset': -1}, {'offset': 100001}, {'search': None}, {'search': 'x' * 201}):
            with self.subTest(kwargs=kwargs), self.assertRaises(ValidationError):
                self.api().qorlia_inventory_form_choices(picking.id, **kwargs)
        public = self.env['stock.picking'].with_user(self.env.ref('base.public_user'))
        with self.assertRaises(AccessError):
            public.qorlia_inventory_form_choices(picking.id)

    def test_choice_results_keep_native_record_and_label_field_permissions(self):
        picking = self.unlinked()
        contact = self.env['res.partner'].create({'name': 'QorliaQA Choice denied contact'})
        self.deny('res.partner', contact.id)
        self.assertEqual(self.choices(picking, 'partner_id', search=contact.name)['rows'], [])
        original = type(self.env['res.partner']).check_field_access_rights
        def deny_label(records, operation, fields=None):
            if operation == 'read' and fields and 'display_name' in fields:
                raise AccessError('QorliaQA Choice label denied')
            return original(records, operation, fields)
        with patch.object(type(self.env['res.partner']), 'check_field_access_rights', deny_label):
            with self.assertRaises(AccessError):
                self.choices(picking, 'partner_id', search=contact.name)

    def test_native_field_context_is_applied_without_accepting_caller_defaults(self):
        picking = self.unlinked()
        self.env['ir.ui.view'].create({'name': 'QorliaQA Choice context', 'model': 'stock.picking',
            'inherit_id': self.env.ref('stock.view_picking_form').id,
            'arch': '<data><xpath expr="//field[@name=\'partner_id\']" position="attributes">'
                '<attribute name="context">{\'qorlia_native_choice_marker\': picking_type_code, '
                '\'allowed_company_ids\': [-1]}</attribute></xpath></data>'})
        original = type(self.env['res.partner']).name_search
        observed = []
        def capture(records, *args, **kwargs):
            observed.append(dict(records.env.context))
            return original(records, *args, **kwargs)
        with patch.object(type(self.env['res.partner']), 'name_search', capture):
            self.api().with_context(default_picking_type_id=-1, default_company_id=-1).qorlia_inventory_form_choices(
                picking.id, node=self.node(self.load(picking), 'partner_id'))
        self.assertEqual(len(observed), 1)
        self.assertEqual(observed[0]['qorlia_native_choice_marker'], 'outgoing')
        self.assertEqual(observed[0]['allowed_company_ids'], self.env.company.ids)
        self.assertNotIn('default_company_id', observed[0])
        self.assertNotIn('default_picking_type_id', observed[0])

    def test_ancestor_invisibility_blocks_search_even_when_field_itself_is_visible(self):
        picking = self.unlinked()
        self.env['ir.ui.view'].create({'name': 'QorliaQA Choice ancestor', 'model': 'stock.picking',
            'inherit_id': self.env.ref('stock.view_picking_form').id,
            'arch': '<data><xpath expr="//field[@name=\'partner_id\']/.." position="attributes">'
                '<attribute name="attrs">{\'invisible\': [(\'state\', \'=\', \'draft\')]}</attribute></xpath></data>'})
        loaded = self.load(picking)
        index = next(index for index, row in enumerate(loaded['layout']) if row['field'] == 'partner_id')
        self.assertFalse(loaded['layout'][index]['rules']['visible'])
        with self.assertRaises(AccessError):
            self.api().qorlia_inventory_form_choices(picking.id, node=index)

    def test_search_side_effects_are_rejected_rolled_back_and_callbacks_restored(self):
        picking = self.unlinked()
        node = self.node(self.load(picking), 'partner_id')
        before = self.stamp()
        callbacks = {name: getattr(self.env.cr, name) for name in ('precommit', 'postcommit', 'prerollback', 'postrollback')}
        original = type(self.env['res.partner']).name_search
        marker = []
        def malicious(records, *args, **kwargs):
            records.env['stock.picking'].browse(picking.id).write({'origin': 'QorliaQA Forbidden search side effect'})
            records.env.cr.postcommit.add(lambda: marker.append('sent'))
            return original(records, *args, **kwargs)
        with patch.object(type(self.env['res.partner']), 'name_search', malicious):
            with self.assertRaisesRegex(UserError, 'changed stored data'):
                self.api().qorlia_inventory_form_choices(picking.id, node=node)
        self.assertEqual(before, self.stamp())
        self.assertEqual(marker, [])
        for name, callback in callbacks.items():
            self.assertIs(getattr(self.env.cr, name), callback)
