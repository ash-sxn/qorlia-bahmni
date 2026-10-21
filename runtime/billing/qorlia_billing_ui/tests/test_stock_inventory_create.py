# SPDX-License-Identifier: LGPL-3.0-or-later
# Copyright 2026 Qorlia contributors.
import copy
from datetime import datetime
from unittest.mock import patch

from odoo import Command
from odoo.exceptions import AccessError, UserError, ValidationError
from odoo.tests import Form, TransactionCase, tagged

from . import test_stock_inventory as inventory
from . import test_stock_inventory_form as forms
from ..models.stock_inventory_draft import _wire


@tagged('post_install', '-at_install')
class StockInventoryCreatePreparationTest(inventory.StockInventoryFixture, TransactionCase):
    api = inventory.StockInventoryConfirmationTest.api
    node = forms.StockInventoryFormTest.node

    def load(self, kind=False):
        return self.api().qorlia_inventory_draft_load(kind.id if kind else False)

    def edit(self, current, name, value):
        return self.api().qorlia_inventory_draft_onchange(current['seed'],
            [*current['edits'], {'node': self.node(current['form'], name), 'value': value}])

    def prepare(self, current):
        return self.api()._qorlia_inventory_draft_prepare(current['seed'], current['edits'])

    def stamp(self):
        return self.env['stock.picking']._qorlia_confirmation_stamp(
            self.env['stock.picking']._qorlia_inventory_saved_tables())

    def test_receipt_delivery_internal_default_fields_match_native_form_without_creating(self):
        for kind in (self.in_type, self.out_type, self.internal_type):
            with self.subTest(kind=kind.code), patch.object(self.env['stock.picking']._fields['scheduled_date'],
                    'default', lambda model: datetime(2026, 10, 21, 10)):
                native = Form(self.api().with_context(default_picking_type_id=kind.id))
                loaded = self.load(kind)
                before = self.stamp()
                current, values = self.prepare(loaded)
                self.assertEqual(values, _wire(native._values_to_save()))
                self.assertEqual(current, loaded)
                self.assertFalse(current['write_ready'])
                self.assertIs(current['form']['transfer_id'], False)
                self.assertEqual(self.stamp(), before)
                self.assertNotIn('id', values)

    def test_ordered_header_changes_and_native_html_normalization_match_native_create_values(self):
        contact = self.env['res.partner'].create({'name': 'QorliaQA New creation contact'})
        with patch.object(self.env['stock.picking']._fields['scheduled_date'],
                'default', lambda model: datetime(2026, 10, 21, 10)):
            native = Form(self.api())
            current = self.load()
            for name, value in (('picking_type_id', self.in_type.id), ('partner_id', contact.id),
                    ('scheduled_date', '2026-10-23 12:34:56'), ('picking_type_id', self.out_type.id),
                    ('move_type', 'one'), ('origin', 'QorliaQA Create values'), ('note', 'QorliaQA Native plain note')):
                kind = current['form']['fields'][name]
                setattr(native, name, self.env[kind['relation']].browse(value) if kind['type'] == 'many2one' else value)
                current = self.edit(current, name, value)
            before = self.stamp()
            prepared, values = self.prepare(current)
            self.assertEqual(values, _wire(native._values_to_save()))
            self.assertEqual(prepared['seed'], current['seed'])
            self.assertEqual(prepared['edits'], current['edits'])
            self.assertEqual(self.stamp(), before)

    def test_defaults_remain_pinned_when_the_native_clock_changes(self):
        field = self.env['stock.picking']._fields['scheduled_date']
        with patch.object(field, 'default', lambda model: datetime(2026, 10, 21, 10)):
            native = Form(self.api().with_context(default_picking_type_id=self.out_type.id))
            loaded = self.load(self.out_type)
        with patch.object(field, 'default', lambda model: datetime(2026, 10, 21, 11)):
            _current, values = self.prepare(loaded)
            self.assertEqual(values, _wire(native._values_to_save()))
            self.assertEqual(str(values['scheduled_date']), '2026-10-21 10:00:00')

    def test_required_empty_operation_type_is_rejected_without_creating_a_record(self):
        loaded = self.load()
        self.assertFalse(loaded['form']['values']['picking_type_id'])
        before = self.stamp()
        with self.assertRaises(ValidationError):
            self.prepare(loaded)
        self.assertEqual(self.stamp(), before)

    def test_seed_edits_and_identity_cannot_be_replaced_during_preparation(self):
        loaded = self.load(self.out_type)
        for key, value in (('signature', '0' * 64), ('version', '0' * 64),
                ('picking_type_id', self.in_type.id), ('values', {})):
            seed = dict(copy.deepcopy(loaded['seed']), **{key: value})
            with self.subTest(key=key), self.assertRaises(UserError):
                self.api()._qorlia_inventory_draft_prepare(seed, [])
        for edits in ([{'node': -1, 'value': 'bad'}], [{'node': True, 'value': 1}]):
            with self.subTest(edits=edits), self.assertRaises(ValidationError):
                self.api()._qorlia_inventory_draft_prepare(loaded['seed'], edits)
        with self.assertRaises(ValidationError):
            self.api()._qorlia_inventory_draft_prepare(loaded['seed'],
                [{'node': next(index for index, row in enumerate(loaded['form']['layout'])
                    if row['field'] == 'id'), 'value': 123}])

    def test_default_readonly_values_follow_the_native_force_save_rule(self):
        for forced in (False, True):
            view = self.env['ir.ui.view'].create({'name': 'QorliaQA Creation readonly priority', 'model': 'stock.picking',
                'inherit_id': self.env.ref('stock.view_picking_form').id,
                'arch': '<data><xpath expr="//field[@name=\'priority\']" position="attributes">'
                    '<attribute name="readonly">1</attribute><attribute name="force_save">%s</attribute></xpath></data>' % ('1' if forced else '')})
            with patch.object(self.env['stock.picking']._fields['scheduled_date'],
                    'default', lambda model: datetime(2026, 10, 21, 10)):
                native = Form(self.api().with_context(default_picking_type_id=self.out_type.id))
                loaded = self.load(self.out_type)
                before = self.stamp()
                _current, values = self.prepare(loaded)
                self.assertEqual(values, _wire(native._values_to_save()))
                self.assertEqual('priority' in values, forced)
                self.assertEqual(self.stamp(), before)
            view.unlink()

    def test_native_default_child_rows_are_preserved_without_a_scalar_child_edit(self):
        original = type(self.api()).default_get
        def child_defaults(records, names):
            result = original(records, names)
            if 'move_ids_without_package' in names:
                result['move_ids_without_package'] = [Command.create({'name': 'QorliaQA Default medicine',
                    'product_id': self.product.id, 'product_uom': self.product.uom_id.id, 'product_uom_qty': 2,
                    'location_id': self.warehouse.lot_stock_id.id, 'location_dest_id': self.customer.property_stock_customer.id})]
            return result
        with patch.object(type(self.api()), 'default_get', child_defaults), patch.object(
                self.env['stock.picking']._fields['scheduled_date'], 'default', lambda model: datetime(2026, 10, 21, 10)), patch.object(
                self.env['stock.move']._fields['date'], 'default', lambda model: datetime(2026, 10, 21, 10)):
            native = Form(self.api().with_context(default_picking_type_id=self.out_type.id))
            loaded = self.load(self.out_type)
            before = self.stamp()
            current, values = self.prepare(loaded)
            self.assertEqual(current['edits'], [])
            self.assertEqual(current['seed'], loaded['seed'])
            self.assertTrue(values.get('move_ids_without_package'))
            self.assertEqual(values, _wire(native._values_to_save()))
            self.assertEqual(self.stamp(), before)

    def test_changed_native_source_must_reload_instead_of_rebasing_the_seed(self):
        loaded = self.load(self.out_type)
        self.out_type.name = 'QorliaQA Changed create source'
        with self.assertRaises(UserError):
            self.prepare(loaded)

    def test_public_actor_cannot_prepare_another_accounts_seed(self):
        loaded = self.load(self.out_type)
        self.env.cr.flush()
        before = self.stamp()
        with self.assertRaises(AccessError):
            self.env['stock.picking'].with_user(self.env.ref('base.public_user'))._qorlia_inventory_draft_prepare(loaded['seed'], [])
        self.assertEqual(self.stamp(), before)

    def test_preparation_cannot_call_native_create_or_consume_a_reference(self):
        loaded = self.load(self.out_type)
        with patch.object(type(self.api()), 'create', side_effect=AssertionError('Unexpected native create')), \
                patch.object(type(self.env['ir.sequence']), 'next_by_id', side_effect=AssertionError('Unexpected sequence assignment')):
            _current, values = self.prepare(loaded)
        self.assertTrue(values)

    def test_unexpected_native_follower_write_and_deferred_work_are_rolled_back(self):
        picking = self.picking()
        loaded = self.load(self.out_type)
        before = self.stamp()
        cr = self.env.cr
        hooks = {name: (getattr(cr, name), list(getattr(cr, name)._funcs), copy.deepcopy(getattr(cr, name).data))
            for name in ('precommit', 'postcommit', 'prerollback', 'postrollback')}
        original = type(self.api())._qorlia_inventory_save_fields
        reached = []
        def unexpected(records, *args, **kwargs):
            reached.append(True)
            result = original(records, *args, **kwargs)
            records.env['mail.followers'].sudo().create({'res_model': 'stock.picking', 'res_id': picking.id,
                'partner_id': self.reader.partner_id.id})
            cr.postcommit.add(lambda: None)
            return result
        with patch.object(type(self.api()), '_qorlia_inventory_save_fields', unexpected), self.assertRaises(UserError):
            self.prepare(loaded)
        self.assertEqual(reached, [True])
        self.assertEqual(self.stamp(), before)
        for name, (callbacks, functions, values) in hooks.items():
            self.assertIs(getattr(cr, name), callbacks)
            self.assertEqual(list(callbacks._funcs), functions)
            self.assertEqual(callbacks.data, values)
