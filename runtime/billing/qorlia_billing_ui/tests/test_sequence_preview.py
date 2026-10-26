# SPDX-License-Identifier: LGPL-3.0-or-later
# Copyright 2026 Qorlia contributors.
import copy
from datetime import datetime
from unittest.mock import patch

from psycopg2 import sql
from odoo import Command
from odoo.exceptions import AccessError, UserError
from odoo.tests import TransactionCase, tagged

from . import test_stock_inventory as inventory
from . import test_stock_inventory_create as creation
from . import test_sequence_read_guard as guards
from ..models.sequence_preview import _preview_sequence_boundary, _preview_for, _STATE
from ..models.sequence_read_guard import _PREVIEW_MARKER, _RANGE_MARKER


@tagged('post_install', '-at_install')
class StockInventorySequencePreviewTest(inventory.StockInventoryFixture, TransactionCase):
    api = inventory.StockInventoryConfirmationTest.api
    new_sequence = guards.StockInventorySequenceReadGuardTest.new_sequence
    sequence_state = guards.StockInventorySequenceReadGuardTest.sequence_state
    load = creation.StockInventoryCreatePreparationTest.load
    edit = creation.StockInventoryCreatePreparationTest.edit
    node = creation.StockInventoryCreatePreparationTest.node

    def setUp(self):
        super().setUp()
        for model, name in (('stock.picking', 'scheduled_date'), ('stock.move', 'date')):
            clock = patch.object(self.env[model]._fields[name], 'default', lambda records: datetime(2026, 10, 21, 10))
            clock.start()
            self.addCleanup(clock.stop)

    def tearDown(self):
        try:
            self.assertIsNone(_preview_for(self.env.cr))
            self.env.cr.execute("SELECT count(*) FROM pg_class WHERE relnamespace=pg_my_temp_schema() "
                "AND relname LIKE 'ir_sequence_qorliapreview_%'")
            self.assertEqual(self.env.cr.fetchone()[0], 0)
        finally:
            super().tearDown()

    def stamp(self):
        return self.env['stock.picking']._qorlia_confirmation_stamp(
            sorted(set(self.api()._qorlia_inventory_saved_tables()) | {'ir_sequence', 'ir_sequence_date_range'}))

    def preview(self, loaded):
        return self.api()._qorlia_inventory_create_preview(loaded['seed'], loaded['edits'])

    def no_temporary_counters(self, names):
        for name in names:
            self.env.cr.execute('SELECT to_regclass(%s) IS NULL', ['pg_temp.ir_sequence_' + name])
            self.assertTrue(self.env.cr.fetchone()[0])
        self.assertIsNone(_preview_for(self.env.cr))

    def test_standard_and_no_gap_native_allocators_and_predictors_are_isolated(self):
        for implementation in ('standard', 'no_gap'):
            sequence = self.new_sequence(implementation)
            before = self.sequence_state(sequence)
            with _preview_sequence_boundary(self.env) as state:
                self.assertEqual(sequence.number_next_actual, 41)
                self.assertEqual(sequence.next_by_id(), 'QorliaQA86/0041')
                sequence.invalidate_recordset()
                self.assertEqual(sequence.number_next_actual, 44)
                self.assertEqual(self.env['ir.sequence'].next_by_code(sequence.code), 'QorliaQA86/0044')
                names = list(state.counters.values())
            self.assertEqual(self.sequence_state(sequence), before)
            self.no_temporary_counters(names)

    def test_existing_and_missing_date_ranges_use_native_resolution_without_persisting(self):
        for implementation in ('standard', 'no_gap'):
            for existing in (False, True):
                sequence = self.new_sequence(implementation, dated=True)
                if existing:
                    sequence._create_date_range_seq('2026-10-21')
                before = self.sequence_state(sequence)
                with _preview_sequence_boundary(self.env) as state:
                    self.assertEqual(sequence.next_by_id(sequence_date='2026-10-21'), 'QorliaQA86/0001')
                    self.assertEqual(sequence.with_context(ir_sequence_date='2026-10-21').next_by_id(), 'QorliaQA86/0004')
                    current = sequence._get_current_sequence('2026-10-21')
                    current.invalidate_recordset()
                    self.assertEqual(current.number_next_actual, 7)
                    names = list(state.counters.values())
                self.assertEqual(self.sequence_state(sequence), before)
                self.no_temporary_counters(names)

    def test_sequence_configuration_cannot_be_changed_inside_preview(self):
        sequence = self.new_sequence(dated=True)
        date_range = sequence._create_date_range_seq('2026-10-21')
        before = self.sequence_state(sequence)
        for action in (lambda: sequence.write({'number_next': 90}), sequence.unlink, sequence.copy,
                lambda: self.env['ir.sequence'].create({'name': 'QorliaQA Forbidden preview sequence'}),
                lambda: date_range.write({'number_next': 90}), date_range.unlink,
                lambda: date_range._alter_sequence(number_next=90),
                lambda: self.env['ir.sequence.date_range'].create({'sequence_id': sequence.id,
                    'date_from': '2027-01-01', 'date_to': '2027-12-31'})):
            with self.assertRaisesRegex(UserError, 'document number'):
                with _preview_sequence_boundary(self.env):
                    action()
            self.assertEqual(self.sequence_state(sequence), before)
        original = type(date_range).create
        def mutate_existing(records, values):
            date_range.write({'number_next': 71})
            return original(records, values)
        with patch.object(type(date_range), 'create', mutate_existing), self.assertRaisesRegex(UserError, 'document number'):
            with _preview_sequence_boundary(self.env):
                sequence._create_date_range_seq('2027-10-21')
        self.assertEqual(self.sequence_state(sequence), before)

    def test_nested_form_reads_still_reject_allocation_and_context_does_not_disable_it(self):
        sequence = self.new_sequence()
        before = self.sequence_state(sequence)
        with _preview_sequence_boundary(self.env) as state:
            sequence.next_by_id()
            for value in (True, False, 'enabled'):
                with self.assertRaisesRegex(UserError, 'read-only inventory form'):
                    self.api()._qorlia_inventory_form_read(lambda: sequence.sudo().with_context(
                        **{_PREVIEW_MARKER: value}).next_by_id())
            self.assertEqual(sequence.next_by_id(), 'QorliaQA86/0044')
            names = list(state.counters.values())
            with self.assertRaises(UserError):
                with _preview_sequence_boundary(self.env):
                    self.fail('Nested effect preview must not silently replace the active boundary.')
        self.assertEqual(self.sequence_state(sequence), before)
        self.no_temporary_counters(names)

    def test_success_and_exception_restore_prior_cursor_and_callback_objects(self):
        cr, reached = self.env.cr, []
        cr.flush()
        cr.postcommit.add(lambda: reached.append('original'))
        callbacks = {name: (getattr(cr, name), list(getattr(cr, name)._funcs), copy.deepcopy(getattr(cr, name).data))
            for name in ('precommit', 'postcommit', 'prerollback', 'postrollback')}
        originals = {name: object() for name in (_STATE, _PREVIEW_MARKER, _RANGE_MARKER)}
        for name, value in originals.items():
            setattr(cr, name, value)
        try:
            for fail in (False, True):
                def run():
                    with _preview_sequence_boundary(self.env):
                        cr.postcommit.add(lambda: reached.append('unexpected'))
                        cr.postcommit.data['qorliaqa-preview'] = True
                        if fail:
                            raise UserError('QorliaQA Preview failure')
                if fail:
                    with self.assertRaisesRegex(UserError, 'Preview failure'):
                        run()
                else:
                    run()
                for name, value in originals.items():
                    self.assertIs(getattr(cr, name), value)
                for name, (original, functions, data) in callbacks.items():
                    self.assertIs(getattr(cr, name), original)
                    self.assertEqual(list(original._funcs), functions)
                    self.assertEqual(original.data, data)
                self.assertEqual(reached, [])
        finally:
            for name in originals:
                delattr(cr, name)

    def test_three_native_creation_effects_rollback_without_consuming_real_references(self):
        for kind in (self.in_type, self.out_type, self.internal_type):
            loaded = self.load(kind)
            before, numbering = self.stamp(), self.sequence_state(kind.sequence_id)
            effects, _private, state, current = self.preview(loaded)
            self.assertEqual(len(effects['created']['stock.picking']), 1)
            self.assertIn(state, ('draft', 'confirmed', 'waiting', 'assigned'))
            self.assertEqual(current, loaded)
            self.assertEqual(self.stamp(), before)
            self.assertEqual(self.sequence_state(kind.sequence_id), numbering)

    def test_actual_default_child_create_and_autoconfirm_are_in_preview_effects(self):
        original = type(self.api()).default_get
        def defaults(records, names):
            values = original(records, names)
            if 'move_ids_without_package' in names:
                values['move_ids_without_package'] = [Command.create({'name': 'QorliaQA Preview native child',
                    'product_id': self.product.id, 'product_uom': self.product.uom_id.id, 'product_uom_qty': 2,
                    'location_id': self.warehouse.lot_stock_id.id,
                    'location_dest_id': self.customer.property_stock_customer.id})]
            return values
        with patch.object(type(self.api()), 'default_get', defaults):
            loaded = self.load(self.out_type)
            before, numbering = self.stamp(), self.sequence_state(self.out_type.sequence_id)
            effects, _private, state, _current = self.preview(loaded)
            self.assertEqual(len(effects['created']['stock.move']), 1)
            self.assertNotEqual(state, 'done')
            self.assertEqual(self.stamp(), before)
            self.assertEqual(self.sequence_state(self.out_type.sequence_id), numbering)

    def test_preview_effects_match_actual_native_save_with_current_fixture_reference(self):
        loaded = self.edit(self.load(self.out_type), 'origin', 'QorliaQA Native preview and Save')
        preview = self.preview(loaded)
        saved = self.api()._qorlia_inventory_create_native(loaded['seed'], loaded['edits'])
        self.assertEqual(preview[:3], saved[:3])
        self.assertEqual(preview[3], saved[5])
        self.assertTrue(saved[4].exists())

    def test_native_failure_after_create_restores_rows_counters_and_deferred_work(self):
        loaded = self.load(self.out_type)
        before, numbering = self.stamp(), self.sequence_state(self.out_type.sequence_id)
        original = type(self.api()).create
        def fail(records, values):
            original(records, values)
            records.env.cr.postcommit.add(lambda: self.fail('Rolled-back work escaped.'))
            raise UserError('QorliaQA Injected preview creation failure')
        with patch.object(type(self.api()), 'create', fail), self.assertRaisesRegex(UserError, 'Injected preview'):
            self.preview(loaded)
        self.assertEqual(self.stamp(), before)
        self.assertEqual(self.sequence_state(self.out_type.sequence_id), numbering)
        self.assertIsNone(_preview_for(self.env.cr))

    def test_tampered_seed_and_denied_actor_cannot_reach_native_create(self):
        loaded = self.load(self.out_type)
        seed = dict(loaded['seed'], signature='0' * 64)
        before = self.stamp()
        with patch.object(type(self.api()), 'create', side_effect=AssertionError('Unexpected native create')):
            with self.assertRaises(UserError):
                self.api()._qorlia_inventory_create_preview(seed, loaded['edits'])
            with self.assertRaises(AccessError):
                self.env['stock.picking'].with_user(self.env.ref('base.public_user'))._qorlia_inventory_create_preview(
                    loaded['seed'], loaded['edits'])
        self.assertEqual(self.stamp(), before)

    def test_nonstandard_native_cache_requires_an_adapter_without_advancing_the_counter(self):
        sequence = self.new_sequence()
        name = 'ir_sequence_%03d' % sequence.id
        self.env.cr.execute(sql.SQL('ALTER SEQUENCE {} CACHE 5').format(sql.Identifier(name)))
        before = self.sequence_state(sequence)
        with self.assertRaisesRegex(UserError, 'additional safe preview adapter'):
            with _preview_sequence_boundary(self.env):
                sequence.next_by_id()
        self.assertEqual(self.sequence_state(sequence), before)
