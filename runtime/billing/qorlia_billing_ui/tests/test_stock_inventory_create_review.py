# SPDX-License-Identifier: LGPL-3.0-or-later
# Copyright 2026 Qorlia contributors.
import copy
from datetime import datetime
from unittest.mock import patch

from odoo import Command
from odoo.exceptions import AccessError, UserError, ValidationError
from odoo.tests import Form, TransactionCase, tagged

from . import test_stock_inventory as inventory
from . import test_stock_inventory_create as creation
from ..models.stock_inventory_draft import _wire


@tagged('post_install', '-at_install')
class StockInventoryCreateValuesReviewTest(inventory.StockInventoryFixture, TransactionCase):
    api = inventory.StockInventoryConfirmationTest.api
    load = creation.StockInventoryCreatePreparationTest.load
    edit = creation.StockInventoryCreatePreparationTest.edit
    node = creation.StockInventoryCreatePreparationTest.node
    stamp = creation.StockInventoryCreatePreparationTest.stamp

    def setUp(self):
        super().setUp()
        for model, name in (('stock.picking', 'scheduled_date'), ('stock.move', 'date')):
            clock = patch.object(self.env[model]._fields[name], 'default', lambda records: datetime(2026, 10, 21, 10))
            clock.start()
            self.addCleanup(clock.stop)

    def review(self, current):
        return self.api().qorlia_inventory_create_values_review(current['seed'], current['edits'])

    def test_complete_receipt_delivery_and_internal_values_match_native_form(self):
        for kind in (self.in_type, self.out_type, self.internal_type):
            with self.subTest(kind=kind.code):
                native = Form(self.api().with_context(default_picking_type_id=kind.id))
                loaded = self.load(kind)
                before = self.stamp()
                result = self.review(loaded)
                self.assertEqual(set(result), set(loaded) | {'review_kind', 'prepared_values', 'values_version'})
                self.assertEqual(result['review_kind'], 'native_create_values')
                self.assertTrue(result['read_only'])
                self.assertFalse(result['write_ready'])
                self.assertIs(result['form']['transfer_id'], False)
                self.assertEqual(result['prepared_values'], _wire(native._values_to_save()))
                self.assertNotIn('id', result['prepared_values'])
                self.assertEqual(self.stamp(), before)

    def test_ordered_edits_and_html_normalization_match_complete_native_save_values(self):
        current = self.load(self.out_type)
        native = Form(self.api().with_context(default_picking_type_id=self.out_type.id))
        for name, value in (('origin', 'QorliaQA Values review'), ('move_type', 'one'),
                ('note', 'QorliaQA Native plain note'), ('scheduled_date', '2026-10-24 11:12:13')):
            setattr(native, name, value)
            current = self.edit(current, name, value)
        original = copy.deepcopy(current)
        result = self.review(current)
        self.assertEqual(result['prepared_values'], _wire(native._values_to_save()))
        self.assertEqual(result['edits'], current['edits'])
        self.assertEqual(current, original)

    def test_default_child_commands_are_complete_without_allocating_native_references(self):
        original = type(self.api()).default_get
        def defaults(records, names):
            values = original(records, names)
            if 'move_ids_without_package' in names:
                values['move_ids_without_package'] = [Command.create({'name': 'QorliaQA Review child',
                    'product_id': self.product.id, 'product_uom': self.product.uom_id.id, 'product_uom_qty': 3,
                    'location_id': self.warehouse.lot_stock_id.id,
                    'location_dest_id': self.customer.property_stock_customer.id})]
            return values
        def forbidden(records, *args, **kwargs):
            raise AssertionError('Prepared-values review called create or allocated a native reference')
        with patch.object(type(self.api()), 'default_get', defaults):
            native = Form(self.api().with_context(default_picking_type_id=self.out_type.id))
            loaded = self.load(self.out_type)
            before = self.stamp()
            with patch.object(type(self.api()), 'create', forbidden), \
                    patch.object(type(self.env['ir.sequence']), 'next_by_id', forbidden), \
                    patch.object(type(self.env['ir.sequence']), 'next_by_code', forbidden):
                result = self.review(loaded)
            self.assertEqual(result['prepared_values'], _wire(native._values_to_save()))
            self.assertTrue(result['prepared_values']['move_ids_without_package'])
            self.assertEqual(self.stamp(), before)

    def test_values_version_is_stable_opaque_and_not_a_save_proof(self):
        current = self.load(self.out_type)
        first, second = self.review(current), self.review(current)
        self.assertEqual(first, second)
        self.assertRegex(first['values_version'], r'^[a-f0-9]{64}$')
        for name in ('stamp', 'effects', 'state_after', 'review_version', 'review_complete_token', 'request_key'):
            self.assertNotIn(name, first)
        self.assertFalse(first['write_ready'])
        self.env.cr.execute("SELECT to_regclass('qorlia_inventory_create_request') IS NULL")
        self.assertTrue(self.env.cr.fetchone()[0])

    def test_values_binding_changes_when_ordered_edits_change(self):
        current = self.load(self.out_type)
        first = self.review(current)
        edited = self.edit(current, 'origin', 'QorliaQA Different reviewed origin')
        second = self.review(edited)
        self.assertNotEqual(first['values_version'], second['values_version'])
        self.assertEqual(second['prepared_values']['origin'], 'QorliaQA Different reviewed origin')

    def test_reordered_noop_edits_do_not_share_a_values_binding(self):
        current = self.load(self.out_type)
        origin = self.node(current['form'], 'origin')
        note = self.node(current['form'], 'note')
        edits = [{'node': origin, 'value': False}, {'node': note, 'value': False}]
        first = self.api().qorlia_inventory_create_values_review(current['seed'], edits)
        second = self.api().qorlia_inventory_create_values_review(current['seed'], list(reversed(edits)))
        self.assertEqual(first['prepared_values'], second['prepared_values'])
        self.assertNotEqual(first['values_version'], second['values_version'])

    def test_mutated_or_stale_seed_cannot_be_reviewed(self):
        current = self.load(self.out_type)
        for name, value in (('signature', '0' * 64), ('version', '0' * 64),
                ('payload', '{"values":{},"domains":{},"warning":false}')):
            changed = copy.deepcopy(current)
            changed['seed'][name] = value
            with self.subTest(name=name), self.assertRaises(UserError):
                self.review(changed)
        self.out_type.name = 'QorliaQA Changed values review source'
        with self.assertRaises(UserError):
            self.review(current)

    def test_missing_required_operation_type_and_invalid_edits_fail_closed(self):
        with self.assertRaises(ValidationError):
            self.review(self.load())
        loaded = self.load(self.out_type)
        for edits in ([{'node': -1, 'value': 'bad'}], [{'node': True, 'value': 1}]):
            with self.subTest(edits=edits), self.assertRaises(ValidationError):
                self.api().qorlia_inventory_create_values_review(loaded['seed'], edits)

    def test_public_actor_cannot_review_another_accounts_seed(self):
        loaded = self.load(self.out_type)
        with self.assertRaises(AccessError):
            self.env['stock.picking'].with_user(self.env.ref('base.public_user')).qorlia_inventory_create_values_review(
                loaded['seed'], loaded['edits'])

    def test_native_create_permission_is_required_without_creating(self):
        loaded = self.load(self.out_type)
        original = type(self.api()).check_access_rights
        def denied(records, operation, *args, **kwargs):
            if operation == 'create':
                raise AccessError('QorliaQA Native create denied')
            return original(records, operation, *args, **kwargs)
        with patch.object(type(self.api()), 'check_access_rights', denied), self.assertRaises(AccessError):
            self.review(loaded)

    def test_oversized_complete_review_rejects_instead_of_truncating(self):
        loaded = self.load(self.out_type)
        before = self.stamp()
        original = type(self.api())._qorlia_inventory_draft_prepare
        def oversized(records, *args):
            current, values = original(records, *args)
            values['note'] = 'x' * 4_000_001
            return current, values
        with patch.object(type(self.api()), '_qorlia_inventory_draft_prepare', oversized), \
                self.assertRaisesRegex(UserError, 'paged contract'):
            self.review(loaded)
        self.assertEqual(self.stamp(), before)

    def test_mutating_returned_form_or_values_never_mutates_the_original_seed(self):
        loaded = self.load(self.out_type)
        original = copy.deepcopy(loaded)
        result = self.review(loaded)
        result['seed']['payload'] = '{}'
        result['prepared_values'].clear()
        result['form']['values'].clear()
        self.assertEqual(loaded, original)
        self.assertTrue(self.review(loaded)['prepared_values'])
