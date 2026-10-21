# SPDX-License-Identifier: LGPL-3.0-or-later
# Copyright 2026 Qorlia contributors.
import copy
import uuid
from unittest.mock import patch

from psycopg2 import sql
from odoo.exceptions import UserError
from odoo.tests import TransactionCase, tagged

from . import test_stock_inventory as inventory
from ..models.sequence_read_guard import _MARKER, _TOKEN


@tagged('post_install', '-at_install')
class StockInventorySequenceReadGuardTest(inventory.StockInventoryFixture, TransactionCase):
    api = inventory.StockInventoryConfirmationTest.api

    def new_sequence(self, implementation='standard', dated=False):
        return self.env['ir.sequence'].create({'name': 'QorliaQA Inventory read boundary',
            'code': 'qorliaqa.inventory.read.' + uuid.uuid4().hex, 'implementation': implementation,
            'prefix': 'QorliaQA86/', 'padding': 4, 'number_next': 41, 'number_increment': 3,
            'use_date_range': dated, 'company_id': self.env.company.id})

    def sequence_state(self, sequence):
        self.env.cr.flush()
        sequence.invalidate_recordset()
        cr = self.env.cr
        cr.execute('SELECT to_jsonb(record)::text FROM ir_sequence record WHERE id = %s', [sequence.id])
        root = cr.fetchone()[0]
        cr.execute('SELECT id,to_jsonb(record)::text FROM ir_sequence_date_range record '
            'WHERE sequence_id = %s ORDER BY id', [sequence.id])
        ranges = cr.fetchall()
        names = ['ir_sequence_%03d' % sequence.id] + ['ir_sequence_%03d_%03d' % (sequence.id, row[0]) for row in ranges]
        physical = {}
        for name in names:
            cr.execute('SELECT to_regclass(%s)', [name])
            if cr.fetchone()[0] is not None:
                cr.execute(sql.SQL('SELECT last_value,is_called FROM {}').format(sql.Identifier(name)))
                physical[name] = cr.fetchone()
        return root, ranges, physical

    def read(self, action):
        return self.api()._qorlia_inventory_form_read(action)

    def blocked(self, sequence, action):
        before = self.sequence_state(sequence)
        with self.assertRaisesRegex(UserError, 'read-only inventory form'):
            self.read(action)
        self.assertEqual(self.sequence_state(sequence), before)
        self.assertFalse(hasattr(self.env.cr, _MARKER))

    def tearDown(self):
        try:
            self.assertFalse(hasattr(self.env.cr, _MARKER))
        finally:
            super().tearDown()

    def test_standard_next_by_id_rejects_before_the_physical_counter_advances(self):
        sequence = self.new_sequence()
        self.blocked(sequence, sequence.next_by_id)

    def test_standard_next_by_code_rejects_before_the_physical_counter_advances(self):
        sequence = self.new_sequence()
        self.blocked(sequence, lambda: self.env['ir.sequence'].next_by_code(sequence.code))

    def test_no_gap_allocators_leave_the_native_counter_row_unchanged(self):
        sequence = self.new_sequence('no_gap')
        for action in (sequence.next_by_id, lambda: self.env['ir.sequence'].next_by_code(sequence.code)):
            self.blocked(sequence, action)

    def test_existing_date_range_allocators_preserve_both_physical_counters(self):
        sequence = self.new_sequence(dated=True)
        sequence._create_date_range_seq('2026-10-21')
        self.blocked(sequence, lambda: sequence.next_by_id(sequence_date='2026-10-21'))
        self.blocked(sequence, lambda: self.env['ir.sequence'].with_context(ir_sequence_date='2026-10-21')
            .next_by_code(sequence.code))

    def test_missing_date_range_is_not_created_by_allocation_or_current_sequence_lookup(self):
        sequence = self.new_sequence(dated=True)
        self.assertFalse(sequence.date_range_ids)
        for action in (lambda: sequence.next_by_id(sequence_date='2026-10-21'),
                lambda: sequence._get_current_sequence(sequence_date='2026-10-21'),
                lambda: self.env['ir.sequence'].with_context(ir_sequence_date='2026-10-21').next_by_code(sequence.code)):
            self.blocked(sequence, action)
        self.assertFalse(sequence.date_range_ids)

    def test_private_and_legacy_allocation_entries_cannot_bypass_the_boundary(self):
        sequence = self.new_sequence()
        for action in (sequence._next_do, sequence._next,
                lambda: self.env['ir.sequence'].get_id(sequence.id), lambda: self.env['ir.sequence'].get(sequence.code)):
            self.blocked(sequence, action)

    def test_direct_date_range_next_is_guarded_for_standard_and_no_gap(self):
        for implementation in ('standard', 'no_gap'):
            sequence = self.new_sequence(implementation, dated=True)
            date_range = sequence._create_date_range_seq('2026-10-21')
            self.blocked(sequence, date_range._next)

    def test_sudo_and_caller_context_cannot_disable_the_cursor_boundary(self):
        sequence = self.new_sequence()
        for value in (False, True, 'disabled'):
            self.blocked(sequence, lambda: sequence.sudo().with_context(**{_MARKER: value}).next_by_id())

    def test_nested_read_does_not_remove_the_outer_sequence_guard(self):
        sequence = self.new_sequence()
        def outer():
            self.assertEqual(self.read(lambda: 'QorliaQA Nested read'), 'QorliaQA Nested read')
            self.assertIs(getattr(self.env.cr, _MARKER), _TOKEN)
            return sequence.next_by_id()
        self.blocked(sequence, outer)

    def test_success_and_exception_restore_any_preexisting_cursor_attribute_exactly(self):
        cr = self.env.cr
        for original in (None, object()):
            setattr(cr, _MARKER, original)
            try:
                self.assertTrue(self.read(lambda: getattr(cr, _MARKER) is _TOKEN))
                self.assertIs(getattr(cr, _MARKER), original)
                def fail():
                    self.assertIs(getattr(cr, _MARKER), _TOKEN)
                    raise UserError('QorliaQA Injected read failure')
                with self.assertRaisesRegex(UserError, 'Injected read failure'):
                    self.read(fail)
                self.assertIs(getattr(cr, _MARKER), original)
            finally:
                delattr(cr, _MARKER)

    def test_all_callback_objects_and_business_rows_survive_an_allocation_failure(self):
        sequence, cr = self.new_sequence(), self.env.cr
        cr.flush()
        before = self.env['stock.picking']._qorlia_confirmation_stamp(self.env['stock.picking']._qorlia_inventory_saved_tables())
        reached = []
        cr.postcommit.add(lambda: reached.append('original'))
        hooks = {name: (getattr(cr, name), list(getattr(cr, name)._funcs), copy.deepcopy(getattr(cr, name).data))
            for name in ('precommit', 'postcommit', 'prerollback', 'postrollback')}
        def fail():
            cr.postcommit.add(lambda: reached.append('unexpected'))
            cr.postcommit.data['qorliaqa-sequence'] = True
            return sequence.next_by_id()
        self.blocked(sequence, fail)
        self.assertEqual(reached, [])
        self.assertEqual(self.env['stock.picking']._qorlia_confirmation_stamp(
            self.env['stock.picking']._qorlia_inventory_saved_tables()), before)
        for name, (callbacks, functions, data) in hooks.items():
            self.assertIs(getattr(cr, name), callbacks)
            self.assertEqual(list(callbacks._funcs), functions)
            self.assertEqual(callbacks.data, data)

    def test_a_linked_native_default_hook_cannot_allocate_while_loading_a_draft(self):
        sequence, reached = self.new_sequence(), []
        original = type(self.api()).onchange
        def onchange(records, *args, **kwargs):
            result = original(records, *args, **kwargs)
            reached.append(True)
            records.env['ir.sequence'].sudo().next_by_code(sequence.code)
            return result
        with patch.object(type(self.api()), 'onchange', onchange):
            self.blocked(sequence, lambda: self.api().qorlia_inventory_draft_load(self.out_type.id))
        self.assertEqual(reached, [True])

    def test_a_native_prepare_hook_cannot_allocate_during_complete_values_review(self):
        sequence = self.new_sequence()
        current = self.api().qorlia_inventory_draft_load(self.out_type.id)
        original = type(self.api())._qorlia_inventory_save_fields
        reached = []
        def prepare(records, *args, **kwargs):
            result = original(records, *args, **kwargs)
            reached.append(True)
            records.env['ir.sequence'].sudo().next_by_code(sequence.code)
            return result
        with patch.object(type(self.api()), '_qorlia_inventory_save_fields', prepare):
            self.blocked(sequence, lambda: self.api().qorlia_inventory_create_values_review(current['seed'], []))
        self.assertEqual(reached, [True])

    def test_root_sequence_configuration_mutations_are_rejected_before_native_work(self):
        sequence = self.new_sequence()
        for action in (lambda: sequence.write({'number_next': 91}), sequence._set_number_next_actual,
                sequence.unlink, sequence.copy,
                lambda: self.env['ir.sequence'].create({'name': 'QorliaQA Forbidden new sequence'})):
            self.blocked(sequence, action)

    def test_date_range_configuration_and_direct_alter_are_rejected_before_native_work(self):
        sequence = self.new_sequence(dated=True)
        date_range = sequence._create_date_range_seq('2026-10-21')
        for action in (lambda: date_range.write({'number_next': 91}), date_range._set_number_next_actual, date_range.unlink,
                lambda: date_range._alter_sequence(number_next=91),
                lambda: self.env['ir.sequence.date_range'].create({'sequence_id': sequence.id,
                    'date_from': '2027-01-01', 'date_to': '2027-12-31'})):
            self.blocked(sequence, action)

    def test_ordinary_native_allocation_and_read_only_formatting_are_unchanged_outside_the_boundary(self):
        for implementation in ('standard', 'no_gap'):
            sequence = self.new_sequence(implementation)
            self.assertEqual(self.read(lambda: sequence.number_next_actual), 41)
            self.assertEqual(self.read(lambda: sequence.get_next_char(41)), 'QorliaQA86/0041')
            self.assertEqual(sequence.next_by_id(), 'QorliaQA86/0041')
            self.assertEqual(self.env['ir.sequence'].next_by_code(sequence.code), 'QorliaQA86/0044')
            ranged = self.new_sequence(implementation, dated=True)
            self.assertEqual(ranged.next_by_id(sequence_date='2026-10-21'), 'QorliaQA86/0001')
            self.assertEqual(ranged.with_context(ir_sequence_date='2026-10-21').next_by_id(), 'QorliaQA86/0004')
