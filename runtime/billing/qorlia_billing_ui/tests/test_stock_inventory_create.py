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


@tagged('post_install', '-at_install')
class StockInventoryCreateExecutionTest(inventory.StockInventoryFixture, TransactionCase):
    api = inventory.StockInventoryConfirmationTest.api
    load = StockInventoryCreatePreparationTest.load
    edit = StockInventoryCreatePreparationTest.edit
    node = StockInventoryCreatePreparationTest.node
    stamp = StockInventoryCreatePreparationTest.stamp

    def setUp(self):
        super().setUp()
        for model, name in (('stock.picking', 'scheduled_date'), ('stock.move', 'date')):
            clock = patch.object(self.env[model]._fields[name], 'default', lambda records: datetime(2026, 10, 21, 10))
            clock.start()
            self.addCleanup(clock.stop)

    def execute(self, current, actor=None):
        return self.env['stock.picking'].with_user(actor or self.reader)._qorlia_inventory_create_native(
            current['seed'], current['edits'])

    def assert_native_header(self, picking, expected):
        for name in ('origin', 'partner_id', 'picking_type_id', 'company_id', 'location_id',
                'location_dest_id', 'scheduled_date', 'move_type', 'state', 'priority', 'note'):
            self.assertEqual(picking[name], expected[name], name)
        self.assertNotEqual(picking.id, expected.id)
        self.assertNotEqual(picking.name, expected.name)
        self.assertTrue(picking.name)
        self.assertNotEqual(picking.name, '/')
        self.assertEqual(picking.create_uid, self.reader)
        self.assertFalse(picking.env.su)

    def test_three_native_empty_transfers_match_native_form_save_and_use_real_references(self):
        for kind in (self.in_type, self.out_type, self.internal_type):
            with self.subTest(kind=kind.code):
                native = Form(self.api().with_context(default_picking_type_id=kind.id))
                native.origin = 'QorliaQA Native create execution'
                native.partner_id = self.customer
                expected = native.save()
                loaded = self.edit(self.load(kind), 'origin', 'QorliaQA Native create execution')
                loaded = self.edit(loaded, 'partner_id', self.customer.id)
                effects, _private, state, references, picking, current = self.execute(loaded)
                self.assert_native_header(picking, expected)
                self.assertEqual(state, picking.state)
                self.assertEqual(current, loaded)
                self.assertEqual([ref for ref in references.values() if ref['model'] == 'stock.picking'],
                    [{'model': 'stock.picking', 'id': picking.id}])
                self.assertEqual(len(effects['created']['stock.picking']), 1)
                self.assertNotIn('mail.followers', effects['schema'])
                if kind.code in ('incoming', 'outgoing'):
                    self.assertGreater(effects['private_audit_counts']['mail.followers']['created'], 0)
                self.assertEqual(self.source_stock(), 10)
                self.assertEqual(self.sale_line.qty_delivered, 0)

    def test_default_child_values_follow_native_create_and_autoconfirm(self):
        original = type(self.api()).default_get
        def child_defaults(records, names):
            values = original(records, names)
            if 'move_ids_without_package' in names:
                values['move_ids_without_package'] = [Command.create({'name': 'QorliaQA Native default child',
                    'product_id': self.product.id, 'product_uom': self.product.uom_id.id, 'product_uom_qty': 2,
                    'location_id': self.warehouse.lot_stock_id.id,
                    'location_dest_id': self.customer.property_stock_customer.id})]
            return values
        with patch.object(type(self.api()), 'default_get', child_defaults):
            expected = Form(self.api().with_context(default_picking_type_id=self.out_type.id)).save()
            loaded = self.load(self.out_type)
            effects, _private, state, references, picking, _current = self.execute(loaded)
        self.assert_native_header(picking, expected)
        self.assertEqual(state, expected.state)
        self.assertEqual(len(picking.move_ids), len(expected.move_ids))
        self.assertEqual(len(picking.move_ids), 1)
        for name in ('name', 'product_id', 'product_uom', 'product_uom_qty', 'location_id',
                'location_dest_id', 'state', 'reserved_availability', 'quantity_done'):
            self.assertEqual(picking.move_ids[name], expected.move_ids[name], name)
        self.assertEqual(len(effects['created']['stock.move']), 1)
        self.assertIn({'model': 'stock.move', 'id': picking.move_ids.id}, references.values())
        self.assertEqual(self.source_stock(), 10)
        self.assertEqual(self.sale_line.qty_delivered, 0)

    def test_creation_effects_use_the_selected_active_company_not_an_empty_or_default_company(self):
        company = self.env['res.company'].create({'name': 'QorliaQA Create second company'})
        warehouse = self.env['stock.warehouse'].search([('company_id', '=', company.id)], limit=1)
        if not warehouse:
            warehouse = self.env['stock.warehouse'].create({'name': 'QorliaQA Creation second warehouse',
                'code': 'QCC', 'company_id': company.id})
        self.reader.company_ids = [Command.link(company.id)]
        api = self.api().with_context(allowed_company_ids=[self.env.company.id, company.id])
        expected = Form(api.with_context(default_picking_type_id=warehouse.out_type_id.id)).save()
        loaded = api.qorlia_inventory_draft_load(warehouse.out_type_id.id)
        effects, _private, state, references, picking, _current = api._qorlia_inventory_create_native(
            loaded['seed'], loaded['edits'])
        self.assert_native_header(picking, expected)
        self.assertEqual(picking.company_id, company)
        self.assertEqual(api.env.company, self.env.company)
        self.assertEqual(state, expected.state)
        self.assertEqual(effects['created']['stock.picking'][0]['values']['company_id'], company.id)
        self.assertIn({'model': 'stock.picking', 'id': picking.id}, references.values())

        loaded = api.qorlia_inventory_draft_load(self.out_type.id)
        before, original = self.stamp(), type(api).create
        def create(records, values):
            primary = original(records, values)
            original(records.with_context(default_picking_type_id=warehouse.out_type_id.id), {
                'picking_type_id': warehouse.out_type_id.id, 'company_id': company.id,
                'location_id': warehouse.lot_stock_id.id,
                'location_dest_id': self.customer.property_stock_customer.id})
            return primary
        with patch.object(type(api), 'create', create), self.assertRaisesRegex(AccessError, 'outside this transfer company'):
            api._qorlia_inventory_create_native(loaded['seed'], loaded['edits'])
        self.assertEqual(self.stamp(), before)

    def test_native_creation_cannot_change_protected_configuration(self):
        loaded = self.load(self.out_type)
        before, original = self.stamp(), type(self.api()).create
        def create(records, values):
            picking = original(records, values)
            records.env['stock.picking.type'].browse(self.out_type.id).sudo().write({'sequence_code': 'QorliaQA Unexpected'})
            return picking
        with patch.object(type(self.api()), 'create', create), self.assertRaisesRegex(UserError, 'configuration'):
            self.execute(loaded)
        self.assertEqual(self.stamp(), before)

    def test_native_creation_cannot_move_physical_stock_or_complete_a_transfer(self):
        original = type(self.api()).create
        for mode in ('physical', 'terminal'):
            loaded, before = self.load(self.out_type), self.stamp()
            def create(records, values):
                picking = original(records, values)
                if mode == 'physical':
                    records.env['stock.quant'].sudo()._update_available_quantity(
                        self.product, self.warehouse.lot_stock_id, 1, lot_id=self.lot)
                else:
                    picking.write({'state': 'done'})
                return picking
            with self.subTest(mode=mode), patch.object(type(self.api()), 'create', create), self.assertRaises(UserError):
                self.execute(loaded)
            self.assertEqual(self.stamp(), before)

    def test_native_creation_cannot_change_financial_records(self):
        loaded = self.load(self.out_type)
        before, original = self.stamp(), type(self.api()).create
        def create(records, values):
            picking = original(records, values)
            self.sale_line.sudo().write({'price_unit': 99})
            return picking
        with patch.object(type(self.api()), 'create', create), self.assertRaisesRegex(UserError, 'financial'):
            self.execute(loaded)
        self.assertEqual(self.stamp(), before)

    def test_wrong_or_existing_native_result_is_rejected(self):
        existing = self.empty()
        loaded, before = self.load(self.out_type), self.stamp()
        for result in (existing.with_user(self.reader), self.api(), self.customer,
                self.api().browse(2147483647)):
            def wrong(records, values):
                return result
            with self.subTest(model=result._name, ids=result.ids), patch.object(
                    type(self.api()), 'create', wrong), self.assertRaisesRegex(UserError, 'new transfer'):
                self.execute(loaded)
            self.assertEqual(self.stamp(), before)

    def test_native_exception_rolls_back_created_rows_and_restores_deferred_callbacks(self):
        loaded, before = self.load(self.out_type), self.stamp()
        cr, marker = self.env.cr, []
        cr.postcommit.add(lambda: marker.append('original'))
        hooks = {name: (getattr(cr, name), list(getattr(cr, name)._funcs), copy.deepcopy(getattr(cr, name).data))
            for name in ('precommit', 'postcommit', 'prerollback', 'postrollback')}
        original = type(self.api()).create
        def create(records, values):
            original(records, values)
            cr.postcommit.add(lambda: marker.append('unexpected'))
            cr.postcommit.data['qorliaqa-create-execution'] = 'unexpected'
            raise UserError('QorliaQA Injected native creation failure')
        with patch.object(type(self.api()), 'create', create), self.assertRaisesRegex(UserError, 'Injected native'):
            self.execute(loaded)
        self.assertEqual(self.stamp(), before)
        self.assertEqual(marker, [])
        for name, (callbacks, functions, data) in hooks.items():
            self.assertIs(getattr(cr, name), callbacks)
            self.assertEqual(list(callbacks._funcs), functions)
            self.assertEqual(callbacks.data, data)

    def test_creation_rejects_tampered_seed_and_denied_actor_before_calling_create(self):
        loaded, before = self.load(self.out_type), self.stamp()
        tampered = copy.deepcopy(loaded)
        tampered['seed']['signature'] = '0' * 64
        with patch.object(type(self.api()), 'create', side_effect=AssertionError('Unexpected native create')):
            with self.assertRaises(UserError):
                self.execute(tampered)
            with self.assertRaises(AccessError):
                self.execute(loaded, self.env.ref('base.public_user'))
        self.assertEqual(self.stamp(), before)

    def test_creation_mode_cannot_reuse_an_existing_transfer_identity(self):
        from ..models.stock_inventory_save import _SAVE_GRAPH, _SAVE_PRIVATE
        from ..models.stock_operation_paged import _FINANCE, _CONFIG
        picking = self.empty().with_user(self.reader)
        before, called = self.stamp(), []
        with self.assertRaisesRegex(UserError, 'existing transfer identity'):
            picking._qorlia_stock_preparation_native(lambda: called.append(True), _FINANCE, _CONFIG,
                graph_models=_SAVE_GRAPH, private_models=_SAVE_PRIVATE,
                private_always={'mail.followers'}, creation=True)
        self.assertEqual(called, [])
        self.assertEqual(self.stamp(), before)
