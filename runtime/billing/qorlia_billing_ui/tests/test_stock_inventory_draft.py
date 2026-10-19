# SPDX-License-Identifier: LGPL-3.0-or-later
# Copyright 2026 Qorlia contributors.
import copy
import json
from datetime import datetime
from unittest.mock import patch

from odoo import Command, fields
from odoo.exceptions import AccessError, UserError, ValidationError
from odoo.tests import Form, TransactionCase, tagged

from . import test_stock_inventory as inventory
from . import test_stock_inventory_form as forms


@tagged('post_install', '-at_install')
class StockInventoryDraftTest(inventory.StockInventoryFixture, TransactionCase):
    api = inventory.StockInventoryConfirmationTest.api
    unlinked = inventory.StockInventoryConfirmationTest.unlinked
    node = forms.StockInventoryFormTest.node

    def load(self, kind=False):
        return self.api().qorlia_inventory_draft_load(kind.id if kind else False)

    def edit(self, current, name, value):
        edits = [*current['edits'], {'node': self.node(current['form'], name), 'value': value}]
        return self.api().qorlia_inventory_draft_onchange(current['seed'], edits)

    def native_equal(self, current, native):
        for name, actual in current['form']['values'].items():
            if name == 'id':
                self.assertIs(actual, False)
                continue
            expected = native._values[name]
            kind = current['form']['fields'][name]['type']
            if kind == 'datetime':
                expected = fields.Datetime.to_string(fields.Datetime.to_datetime(expected)) or False
            elif kind == 'date':
                expected = fields.Date.to_string(fields.Date.to_date(expected)) or False
            self.assertEqual(actual, expected, name)

    def test_native_defaults_match_all_three_types_and_unspecified_action(self):
        for kind in (False, self.in_type, self.out_type, self.internal_type):
            with self.subTest(kind=kind.code if kind else False), patch.object(
                    self.env['stock.picking']._fields['scheduled_date'], 'default', lambda model: datetime(2026, 10, 20, 10)):
                native = Form(self.api().with_context(**({'default_picking_type_id': kind.id} if kind else {})))
                before = self.stamp()
                current = self.load(kind)
                self.assertTrue(current['read_only'])
                self.assertFalse(current['write_ready'])
                self.assertEqual(current['edits'], [])
                self.assertEqual(len(current['seed']['signature']), 64)
                self.native_equal(current, native)
                self.assertEqual(before, self.stamp())

    def test_clock_defaults_are_pinned_without_reloading_them_during_edit_replay(self):
        definition = self.env['stock.picking']._fields['scheduled_date']
        with patch.object(definition, 'default', lambda model: datetime(2026, 10, 20, 10)):
            current = self.load(self.out_type)
        with patch.object(definition, 'default', lambda model: datetime(2026, 10, 20, 11)):
            edited = self.edit(current, 'origin', 'QorliaQA Pinned clock')
            fresh = self.load(self.out_type)
        self.assertEqual(edited['seed'], current['seed'])
        self.assertEqual(edited['version'], current['version'])
        self.assertEqual(edited['form']['values']['scheduled_date'], '2026-10-20 10:00:00')
        self.assertEqual(fresh['form']['values']['scheduled_date'], '2026-10-20 11:00:00')
        self.assertEqual(fresh['version'], current['version'])

    def test_ordered_type_contact_dates_policy_and_note_edits_match_native_form(self):
        contact = self.env['res.partner'].create({'name': 'QorliaQA Native new-transfer contact'})
        with patch.object(self.env['stock.picking']._fields['scheduled_date'], 'default', lambda model: datetime(2026, 10, 20, 10)):
            native = Form(self.api())
            current = self.load()
            for name, value in (('picking_type_id', self.in_type.id), ('partner_id', contact.id),
                    ('scheduled_date', '2026-10-22 12:34:56'), ('picking_type_id', self.out_type.id), ('move_type', 'one'),
                    ('origin', 'QorliaQA Ordered new header'), ('note', '<p>QorliaQA Native note ' + 'n' * 12000 + '</p>')):
                descriptor = current['form']['fields'][name]
                native_value = self.env[descriptor['relation']].browse(value) if descriptor['type'] == 'many2one' else value
                setattr(native, name, native_value)
                current = self.edit(current, name, value)
                self.native_equal(current, native)
        self.assertEqual(len(current['edits']), 7)
        self.assertEqual(current, self.api().qorlia_inventory_draft_onchange(current['seed'], current['edits']))

    def test_native_blocking_contact_warning_and_cleared_value_are_preserved(self):
        contact = self.env['res.partner'].create({'name': 'QorliaQA Blocked new-transfer contact',
            'picking_warn': 'block', 'picking_warn_msg': 'QorliaQA Contact requires a new review'})
        current = self.load(self.out_type)
        result = self.edit(current, 'partner_id', contact.id)
        self.assertFalse(result['form']['values']['partner_id'])
        self.assertEqual(result['form']['warning']['message'], contact.picking_warn_msg)
        self.assertFalse(result['write_ready'])

    def test_onchange_domains_constrain_both_choice_search_and_selected_values(self):
        contact = self.env['res.partner'].create({'name': 'QorliaQA Domain trigger contact'})
        colleague = self.env['res.users'].with_context(no_reset_password=True).create({
            'name': 'QorliaQA Excluded new-transfer colleague', 'login': 'qorliaqa-draft-excluded',
            'company_id': self.env.company.id, 'company_ids': [(6, 0, self.env.company.ids)],
            'groups_id': [(6, 0, [self.env.ref('base.group_user').id])]})
        original = type(self.api()).onchange
        def native_domain(records, values, names, spec):
            result = original(records, values, names, spec)
            if 'partner_id' in names:
                result['domain'] = {'user_id': [('id', '=', self.reader.id)]}
            return result
        with patch.object(type(self.api()), 'onchange', native_domain):
            current = self.edit(self.load(self.out_type), 'partner_id', contact.id)
            node = self.node(current['form'], 'user_id')
            page = self.api().qorlia_inventory_draft_choices(current['seed'], current['edits'], node,
                search='QorliaQA')
            self.assertEqual(page['page']['rows'], [[self.reader.id, self.reader.display_name]])
            self.assertEqual(page['edits'], current['edits'])
            self.assertEqual(page['version'], current['version'])
            with self.assertRaisesRegex(ValidationError, 'native field domain'):
                self.edit(current, 'user_id', colleague.id)
        original_search = type(self.env['res.users']).name_search
        def restricted_search(records, *args, **kwargs):
            return [row for row in original_search(records, *args, **kwargs) if row[0] != colleague.id]
        with patch.object(type(self.env['res.users']), 'name_search', restricted_search):
            current = self.load(self.out_type)
            with self.assertRaisesRegex(ValidationError, 'native field domain'):
                self.edit(current, 'user_id', colleague.id)

    def test_tampered_seed_values_domains_warning_version_type_and_signature_are_rejected(self):
        current = self.load(self.out_type)
        wire_seed = json.loads(json.dumps(current['seed'], allow_nan=False))
        replayed = self.api().qorlia_inventory_draft_onchange(wire_seed, [])
        self.assertEqual(replayed['form']['values'], current['form']['values'])
        self.assertEqual(replayed['version'], current['version'])
        for mutate in (lambda item: item['values'].update(origin='QorliaQA Forged seed'),
                lambda item: item['domains'].update(user_id=[]),
                lambda item: item.update(warning={'message': 'forged'}),
                lambda item: item.update(version='0' * 64),
                lambda item: item.update(picking_type_id=self.in_type.id),
                lambda item: item.update(signature='0' * 64)):
            seed = copy.deepcopy(current['seed'])
            mutate(seed)
            with self.assertRaises(UserError):
                self.api().qorlia_inventory_draft_onchange(seed, [])
        malformed = copy.deepcopy(current['seed'])
        malformed['values']['origin'] = float('nan')
        with self.assertRaises(ValidationError):
            self.api().qorlia_inventory_draft_onchange(malformed, [])

    def test_actor_locale_and_caller_defaults_do_not_change_the_signed_scope(self):
        current = self.load(self.out_type)
        other = self.env['res.users'].with_context(no_reset_password=True).create({
            'name': 'QorliaQA Other draft actor', 'login': 'qorliaqa-other-draft-actor',
            'company_id': self.env.company.id, 'company_ids': [(6, 0, self.env.company.ids)],
            'groups_id': [(6, 0, [self.env.ref('stock.group_stock_user').id])]})
        # User creation changes the guarded baseline too; both stale scope and cross-actor use must fail.
        current = self.load(self.out_type)
        with self.assertRaises(UserError):
            self.env['stock.picking'].with_user(other).qorlia_inventory_draft_onchange(current['seed'], [])
        with self.assertRaises(UserError):
            self.api().with_context(tz='Asia/Kolkata').qorlia_inventory_draft_onchange(current['seed'], [])
        result = self.api().with_context(default_company_id=-1, default_picking_type_id=-1,
            qorlia_allow_save=True).qorlia_inventory_draft_onchange(current['seed'], [])
        self.assertEqual(result['seed'], current['seed'])
        self.env.flush_all()
        with self.assertRaises(AccessError):
            self.env['stock.picking'].with_user(self.env.ref('base.public_user')).qorlia_inventory_draft_load()

    def test_changed_native_view_or_configuration_invalidates_the_original_seed(self):
        current = self.load(self.out_type)
        self.env['ir.ui.view'].create({'name': 'QorliaQA Draft relabel', 'model': 'stock.picking',
            'inherit_id': self.env.ref('stock.view_picking_form').id,
            'arch': '<data><xpath expr="//field[@name=\'origin\']" position="attributes">'
                '<attribute name="string">QorliaQA New source</attribute></xpath></data>'})
        with self.assertRaises(UserError):
            self.api().qorlia_inventory_draft_onchange(current['seed'], [])

        current = self.load(self.out_type)
        self.out_type.sequence_code = 'QorliaQA changed operation configuration'
        with self.assertRaises(UserError):
            self.api().qorlia_inventory_draft_onchange(current['seed'], [])

    def test_active_company_transition_matches_native_form_without_premature_save_validation(self):
        company = self.env['res.company'].create({'name': 'QorliaQA Draft second active company'})
        warehouse = self.env['stock.warehouse'].search([('company_id', '=', company.id)], limit=1)
        if not warehouse:
            warehouse = self.env['stock.warehouse'].create({'name': 'QorliaQA Draft second warehouse',
                'code': 'QDC', 'company_id': company.id})
        contact = self.env['res.partner'].create({'name': 'QorliaQA Original company contact',
            'company_id': self.env.company.id})
        self.reader.company_ids = [(4, company.id)]
        api = self.api().with_context(allowed_company_ids=[self.env.company.id, company.id])
        with patch.object(self.env['stock.picking']._fields['scheduled_date'], 'default', lambda model: datetime(2026, 10, 20, 10)):
            native = Form(api)
            current = api.qorlia_inventory_draft_load()
            for name, value, native_value in (('picking_type_id', self.out_type.id, self.out_type), ('partner_id', contact.id, contact),
                    ('picking_type_id', warehouse.out_type_id.id, warehouse.out_type_id), ('partner_id', False, api.env['res.partner'])):
                setattr(native, name, native_value)
                edits = [*current['edits'], {'node': self.node(current['form'], name), 'value': value}]
                current = api.qorlia_inventory_draft_onchange(current['seed'], edits)
                self.native_equal(current, native)
        self.assertEqual(current['form']['values']['company_id'], company.id)
        self.assertFalse(current['form']['values']['partner_id'])

    def test_invalid_dates_selections_relations_and_edit_shapes_are_rejected(self):
        current = self.load(self.out_type)
        for name, value in (('scheduled_date', '2026-02-31 10:00:00'),
                ('scheduled_date', '2026-10-20T10:00:00Z'), ('move_type', 'invented'),
                ('move_type', []), ('move_type', {}), ('move_type', True),
                ('partner_id', True), ('partner_id', -1), ('origin', 42)):
            with self.subTest(name=name, value=value), self.assertRaises(ValidationError):
                self.edit(current, name, value)
        for edits in (None, {}, [{'node': True, 'value': False}], [{'node': 0}],
                [{'node': 99999, 'value': False}], [{'node': 0, 'value': False}] * 101):
            with self.assertRaises(ValidationError):
                self.api().qorlia_inventory_draft_onchange(current['seed'], edits)

    def test_hidden_readonly_and_collection_nodes_cannot_be_edited(self):
        current = self.load(self.out_type)
        for index, row in enumerate(current['form']['layout']):
            kind = current['form']['fields'][row['field']]['type']
            if row['field'] == 'id' or kind in ('one2many', 'many2many'):
                expected = ValidationError
            elif row['rules']['readonly'] or not row['rules']['visible']:
                expected = AccessError
            else:
                continue
            with self.subTest(field=row['field']), self.assertRaises(expected):
                self.api().qorlia_inventory_draft_onchange(current['seed'], [{'node': index, 'value': False}])

    def test_native_default_child_rows_and_their_type_onchange_are_kept_in_the_signed_seed(self):
        definition = self.env['stock.picking']._fields['move_ids_without_package']
        default = lambda model: [Command.create({'product_id': self.product.id, 'name': 'QorliaQA Default demand',
            'product_uom_qty': 2, 'product_uom': self.product.uom_id.id,
            'location_id': self.warehouse.lot_stock_id.id, 'location_dest_id': self.warehouse.lot_stock_id.id})]
        with patch.object(definition, 'default', default), patch.object(
                self.env['stock.picking']._fields['scheduled_date'], 'default', lambda model: datetime(2026, 10, 20, 10)):
            native = Form(self.api())
            current = self.load()
            self.assertTrue(current['seed']['values']['move_ids_without_package'])
            native.picking_type_id = self.internal_type
            current = self.edit(current, 'picking_type_id', self.internal_type.id)
            self.native_equal(current, native)
            self.assertTrue(current['seed']['values']['move_ids_without_package'])

    def test_onchange_writes_are_rejected_rolled_back_and_callbacks_do_not_escape(self):
        picking = self.unlinked()
        contact = self.env['res.partner'].create({'name': 'QorliaQA Guarded draft contact'})
        current = self.load(self.out_type)
        before = self.stamp()
        callbacks = {name: getattr(self.env.cr, name) for name in ('precommit', 'postcommit', 'prerollback', 'postrollback')}
        marker = []
        original = type(self.api()).onchange
        def malicious(records, *args, **kwargs):
            records.env['stock.picking'].browse(picking.id).write({'origin': 'QorliaQA Forbidden draft write'})
            records.env.cr.postcommit.add(lambda: marker.append('sent'))
            return original(records, *args, **kwargs)
        with patch.object(type(self.api()), 'onchange', malicious):
            with self.assertRaisesRegex(UserError, 'changed stored data'):
                self.edit(current, 'partner_id', contact.id)
        self.assertEqual(before, self.stamp())
        self.assertEqual(marker, [])
        for name, callback in callbacks.items():
            self.assertIs(getattr(self.env.cr, name), callback)
