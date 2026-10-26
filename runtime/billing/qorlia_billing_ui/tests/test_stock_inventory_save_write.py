# SPDX-License-Identifier: LGPL-3.0-or-later
# Copyright 2026 Qorlia contributors.
import copy
import uuid
from unittest.mock import patch

from odoo.exceptions import AccessError, UserError, ValidationError
from odoo.tests import TransactionCase, tagged

from . import test_stock_inventory as inventory
from . import test_stock_inventory_form as forms
from ..models.stock_validation import _RECEIPT_TOKEN


@tagged('post_install', '-at_install')
class StockInventorySaveWriteTest(inventory.StockInventoryFixture, TransactionCase):
    api = inventory.StockInventoryConfirmationTest.api
    unlinked = inventory.StockInventoryConfirmationTest.unlinked
    delivered = inventory.StockInventoryReturnTest.delivered
    node = forms.StockInventoryFormTest.node

    def request(self, picking, changes=None):
        loaded = self.api().qorlia_inventory_edit_load(picking.id)
        edits = [{'node': self.node(loaded['form'], name), 'value': value}
            for name, value in (changes if changes is not None else [('note', 'QorliaQA Durable saved note')])]
        page = self.api().qorlia_inventory_edit_save_review(picking.id, loaded['version'], edits)
        while page['next_after'] is not False:
            page = self.api().qorlia_inventory_edit_save_review(picking.id, loaded['version'], edits,
                page['next_after'], page['review_version'], page['continuation_token'])
        self.assertTrue(page['write_ready'])
        self.assertEqual(len(page['review_complete_token']), 64)
        return {'transfer_id': picking.id, 'version': loaded['version'], 'edits': edits,
            'review_version': page['review_version'], 'review_complete_token': page['review_complete_token'],
            'request_key': str(uuid.uuid4())}

    def saved(self, picking, request):
        self.env.flush_all()
        self.env.cr.flush()
        self.env.cr.execute('SELECT qorlia_validation_receipts FROM stock_picking WHERE id = %s', [picking.id])
        return (self.env.cr.fetchone()[0] or {}).get(request['request_key'])

    def test_scalar_save_readback_and_exact_retry_never_overwrite_a_later_edit(self):
        picking = self.unlinked()
        request = self.request(picking, [('origin', 'QorliaQA Saved origin'), ('note', '<p>QorliaQA Saved once</p>')])
        original = copy.deepcopy(request)
        pending = self.api().qorlia_inventory_edit_save_status(request)
        self.assertFalse(pending['accepted'])
        self.assertFalse(pending['stopped'])
        accepted = self.api().qorlia_inventory_edit_save(request)
        self.assertTrue(accepted['accepted'])
        self.assertFalse(accepted['stopped'])
        self.assertEqual(picking.origin, 'QorliaQA Saved origin')
        self.assertEqual(picking.note, '<p>QorliaQA Saved once</p>')
        self.assertEqual(accepted['changed_fields'], ['note', 'origin'])
        self.assertEqual(self.api().qorlia_inventory_edit_save(request), accepted)
        picking.with_env(self.env).note = '<p>QorliaQA Later independent edit</p>'
        recovered = self.api().qorlia_inventory_edit_save(request)
        self.assertTrue(recovered['accepted'])
        self.assertEqual(recovered, self.api().qorlia_inventory_edit_save_status(request))
        self.assertEqual(picking.note, '<p>QorliaQA Later independent edit</p>')
        self.assertEqual(request, original)

    def test_contact_and_date_save_for_each_native_type_without_sales_role(self):
        contact = self.env['res.partner'].create({'name': 'QorliaQA Durable new contact'})
        self.assertFalse(self.reader.has_group('sales_team.group_sale_salesman'))
        for kind in (self.in_type, self.out_type, self.internal_type):
            with self.subTest(kind=kind.code):
                picking = self.unlinked(kind)
                original_moves = picking.move_ids.ids
                request = self.request(picking, [('partner_id', contact.id), ('scheduled_date', '2026-10-24 11:22:33')])
                accepted = self.api().qorlia_inventory_edit_save(request)
                self.assertTrue(accepted['accepted'])
                self.assertEqual(picking.partner_id, contact.with_user(self.reader))
                self.assertEqual(str(picking.scheduled_date), '2026-10-24 11:22:33')
                self.assertEqual(picking.move_ids.ids, original_moves)
                self.assertTrue(all(move.product_id == self.product.with_user(self.reader) for move in picking.move_ids))
                self.assertEqual(self.api().qorlia_inventory_edit_save(request), accepted)

    def test_empty_edit_save_is_idempotent_without_inventing_field_changes(self):
        picking = self.unlinked()
        request = self.request(picking, [])
        accepted = self.api().qorlia_inventory_edit_save(request)
        self.assertTrue(accepted['accepted'])
        self.assertEqual(accepted['changed_fields'], [])
        self.assertEqual(self.api().qorlia_inventory_edit_save(request), accepted)

    def test_terminal_notes_do_not_repeat_validation_or_cancellation(self):
        done, cancelled = self.delivered(), self.unlinked()
        cancelled.with_env(self.env).action_cancel()
        for picking in (done, cancelled):
            with self.subTest(state=picking.state):
                state = picking.state
                request = self.request(picking)
                self.assertTrue(self.api().qorlia_inventory_edit_save(request)['accepted'])
                self.assertEqual(picking.state, state)

    def test_stop_before_save_is_durable_and_never_applies_the_business_edit(self):
        picking = self.unlinked()
        request = self.request(picking)
        old_note = picking.note
        stopped = self.api().qorlia_inventory_edit_save_stop(request)
        self.assertTrue(stopped['stopped'])
        self.assertFalse(stopped['accepted'])
        self.assertEqual(self.api().qorlia_inventory_edit_save_stop(request), stopped)
        self.assertEqual(self.api().qorlia_inventory_edit_save_status(request), stopped)
        with self.assertRaises(UserError):
            self.api().qorlia_inventory_edit_save(request)
        self.assertEqual(picking.note, old_note)
        self.assertFalse(self.saved(picking, request))

    def test_stop_after_save_recovers_acceptance_instead_of_claiming_undo(self):
        picking = self.unlinked()
        request = self.request(picking)
        accepted = self.api().qorlia_inventory_edit_save(request)
        self.assertEqual(self.api().qorlia_inventory_edit_save_stop(request), accepted)
        self.assertFalse(accepted['stopped'])
        self.assertEqual(picking.note, '<p>QorliaQA Durable saved note</p>')

    def test_complete_proof_is_required_and_cannot_be_replaced_by_a_continuation(self):
        picking = self.unlinked()
        contact = self.env['res.partner'].create({'name': 'QorliaQA Complete proof contact'})
        request = self.request(picking, [('partner_id', contact.id)])
        first = self.api().qorlia_inventory_edit_save_review(picking.id, request['version'], request['edits'], limit=1)
        self.assertIsNot(first['next_after'], False)
        self.assertFalse(first['review_complete_token'])
        before = self.stamp()
        for token in (first['continuation_token'], '0' * 64):
            with self.assertRaises(UserError):
                self.api().qorlia_inventory_edit_save(dict(request, review_complete_token=token))
        self.assertFalse(self.saved(picking, request))
        self.assertEqual(before, self.stamp())

    def test_stale_record_or_review_cannot_save_or_create_receipts(self):
        picking = self.unlinked()
        request = self.request(picking)
        before = self.stamp()
        with self.assertRaises(UserError):
            self.api().qorlia_inventory_edit_save(dict(request, review_version='0' * 64))
        self.assertEqual(before, self.stamp())
        picking.with_env(self.env).note = 'QorliaQA Changed outside editor'
        before = self.stamp()
        with self.assertRaises(UserError):
            self.api().qorlia_inventory_edit_save(request)
        self.assertFalse(self.saved(picking, request))
        self.assertEqual(before, self.stamp())

    def test_native_write_denial_and_nonstock_actor_are_not_bypassed(self):
        picking = self.unlinked()
        request = self.request(picking)
        self.env['ir.rule'].create({'name': 'QorliaQA Deny durable save',
            'model_id': self.env['ir.model']._get_id('stock.picking'), 'domain_force': "[('id','!=',%s)]" % picking.id,
            'perm_read': False, 'perm_write': True, 'perm_create': False, 'perm_unlink': False})
        before = self.stamp()
        for method in ('qorlia_inventory_edit_save', 'qorlia_inventory_edit_save_stop'):
            with self.assertRaises(AccessError):
                getattr(self.api(), method)(request)
        public = self.env['stock.picking'].with_user(self.env.ref('base.public_user'))
        with self.assertRaises(AccessError):
            public.qorlia_inventory_edit_save_status(request)
        self.assertEqual(before, self.stamp())

    def test_changed_request_cannot_reuse_an_accepted_nonce(self):
        picking = self.unlinked()
        request = self.request(picking)
        self.api().qorlia_inventory_edit_save(request)
        changed = copy.deepcopy(request)
        changed['edits'][0]['value'] = 'QorliaQA Different body with same nonce'
        before = self.stamp()
        for method in ('qorlia_inventory_edit_save', 'qorlia_inventory_edit_save_status', 'qorlia_inventory_edit_save_stop'):
            with self.assertRaises(ValidationError):
                getattr(self.api(), method)(changed)
        self.assertEqual(before, self.stamp())

    def test_actual_unreviewed_write_effects_and_callbacks_are_rolled_back(self):
        picking = self.unlinked()
        request = self.request(picking)
        original = type(picking).write
        calls, marker = [], []
        self.env.cr.flush()
        hooks = {name: getattr(self.env.cr, name) for name in ('precommit', 'postcommit', 'prerollback', 'postrollback')}
        before = self.stamp()
        def changed(records, values):
            result = original(records, values)
            if values.get('note') == 'QorliaQA Durable saved note':
                calls.append(1)
                if len(calls) == 2:
                    original(records, {'origin': 'QorliaQA Unexpected actual effect'})
                    records.env.cr.postcommit.add(lambda: marker.append('sent'))
            return result
        with patch.object(type(picking), 'write', changed), self.assertRaises(UserError):
            self.api().qorlia_inventory_edit_save(request)
        self.assertEqual(len(calls), 2)
        self.assertEqual(marker, [])
        for name, callback in hooks.items():
            self.assertIs(getattr(self.env.cr, name), callback)
        self.assertFalse(self.saved(picking, request))
        self.assertEqual(before, self.stamp())

    def test_receipt_side_effects_roll_back_the_native_save(self):
        picking = self.unlinked()
        request = self.request(picking)
        original = type(picking)._qorlia_validation_record_receipt
        before = self.stamp()
        def changed(records, receipts):
            original(records, receipts)
            records.env.cr.postcommit.add(lambda: None)
        with patch.object(type(picking), '_qorlia_validation_record_receipt', changed), self.assertRaises(UserError):
            self.api().qorlia_inventory_edit_save(request)
        self.assertFalse(self.saved(picking, request))
        self.assertEqual(before, self.stamp())

    def test_protected_receipt_is_not_an_ordinary_writable_or_readable_stock_field(self):
        picking = self.unlinked()
        request = self.request(picking)
        self.api().qorlia_inventory_edit_save(request)
        with self.assertRaises(AccessError):
            picking.read(['qorlia_validation_receipts'])
        with self.assertRaises(AccessError):
            picking.write({'qorlia_validation_receipts': {}})
        request_data, digest = self.api()._qorlia_inventory_saved_request(request)
        receipt, receipts = picking._qorlia_validation_receipt(request_data, digest)
        self.assertTrue(receipt)
        receipts[request['request_key']]['kind'] = 'qorlia.other-protocol'
        picking.with_context(qorlia_validation_receipt_token=_RECEIPT_TOKEN)._qorlia_validation_record_receipt(receipts)
        with self.assertRaises(ValidationError):
            self.api().qorlia_inventory_edit_save_status(request)

    def test_empty_reference_pages_are_bounded_and_only_follow_accepted_saves(self):
        picking = self.unlinked()
        request = self.request(picking)
        with self.assertRaises(UserError):
            self.api().qorlia_inventory_edit_save_references(request)
        self.api().qorlia_inventory_edit_save(request)
        page = self.api().qorlia_inventory_edit_save_references(request, limit=1)
        self.assertEqual(page['rows'], [])
        self.assertEqual(page['total_count'], 0)
        self.assertFalse(page['next_after'])
        for kwargs in ({'after': True}, {'limit': 101}, {'after': 1}, {'version': '0' * 64}):
            with self.assertRaises(UserError if 'version' in kwargs else ValidationError):
                self.api().qorlia_inventory_edit_save_references(request, **kwargs)

    def test_invalid_requests_fail_without_native_effects(self):
        picking = self.unlinked()
        request = self.request(picking)
        invalid = [None, {}, dict(request, transfer_id=True), dict(request, request_key='bad'),
            dict(request, review_complete_token=False), dict(request, version='bad'),
            dict(request, edits=[{'node': True, 'value': 'bad'}]), dict(request, extra=True)]
        before = self.stamp()
        for payload in invalid:
            with self.assertRaises(ValidationError):
                self.api().qorlia_inventory_edit_save(payload)
        self.assertEqual(before, self.stamp())

    def test_save_and_stop_use_the_same_full_ordered_table_lock_scope(self):
        self.api()._qorlia_inventory_saved_lock()
        tables = self.api()._qorlia_inventory_saved_tables()
        self.env.cr.execute("SELECT relation::regclass::text FROM pg_locks WHERE pid=pg_backend_pid() "
            "AND mode='ShareRowExclusiveLock' AND granted ORDER BY relation::regclass::text")
        self.assertEqual(sorted(row[0] for row in self.env.cr.fetchall()), tables)
