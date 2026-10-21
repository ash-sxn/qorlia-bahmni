# SPDX-License-Identifier: LGPL-3.0-or-later
# Copyright 2026 Qorlia contributors.
from contextlib import closing
import copy
from datetime import datetime
import uuid
from unittest.mock import patch

from psycopg2.errors import SerializationFailure, UniqueViolation
from psycopg2.extras import Json

from odoo import Command
from odoo.exceptions import AccessError, UserError, ValidationError
from odoo.tests import TransactionCase, tagged

from . import test_stock_inventory as inventory
from ..hooks import post_init_hook
from ..models.stock_inventory_create_journal import _TABLE, _PRIMARY_KEY


@tagged('post_install', '-at_install')
class StockInventoryCreateJournalTest(inventory.StockInventoryFixture, TransactionCase):
    api = inventory.StockInventoryConfirmationTest.api

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.env.cr.execute('SELECT to_regclass(%s)', [_TABLE])
        if cls.env.cr.fetchone()[0] is not None:
            raise AssertionError('Use an isolated database without an installed creation journal for this rollback-only class.')
        # TransactionCase closes this class cursor without committing, including the test-only DDL.
        cls.env['stock.picking']._qorlia_inventory_creation_journal_setup()

    def setUp(self):
        super().setUp()
        for model, name in (('stock.picking', 'scheduled_date'), ('stock.move', 'date')):
            clock = patch.object(self.env[model]._fields[name], 'default', lambda records: datetime(2026, 10, 21, 10))
            clock.start()
            self.addCleanup(clock.stop)

    def payload(self):
        loaded = self.api().qorlia_inventory_draft_load(self.out_type.id)
        # Opaque proof-shaped bindings only: this class tests the private journal, not public review authorization.
        return {'seed': loaded['seed'], 'edits': [], 'review_version': 'a' * 64,
            'review_complete_token': 'b' * 64, 'request_key': str(uuid.uuid4())}

    def rows(self):
        self.env.cr.execute('SELECT count(*) FROM qorlia_inventory_create_request')
        return self.env.cr.fetchone()[0]

    def stamp(self):
        return self.env['stock.picking']._qorlia_confirmation_stamp(
            self.env['stock.picking']._qorlia_inventory_saved_tables())

    def test_schema_setup_is_privileged_idempotent_and_not_an_orm_record_model(self):
        with self.assertRaises(AccessError):
            self.api()._qorlia_inventory_creation_journal_setup()
        before = self.stamp()
        post_init_hook(self.env.cr, self.registry)
        self.api()._qorlia_inventory_creation_journal_ready()
        self.assertEqual(self.stamp(), before)
        self.assertEqual(self.rows(), 0)
        self.assertNotIn('qorlia.inventory.create.request', self.env)
        self.assertFalse(self.env['ir.model'].search([('model', '=', 'qorlia.inventory.create.request')]))
        self.env.cr.execute('SELECT count(*) FROM pg_class table_row, '
            "LATERAL aclexplode(COALESCE(table_row.relacl, acldefault('r', table_row.relowner))) permission "
            'WHERE table_row.oid = to_regclass(%s) AND permission.grantee = 0', [_TABLE])
        self.assertEqual(self.env.cr.fetchone()[0], 0)

    def test_native_create_replay_stop_and_deleted_document_keep_one_accepted_outcome(self):
        payload = self.payload()
        accepted = self.api()._qorlia_inventory_create_once(payload)
        self.assertTrue(accepted['accepted'])
        self.assertFalse(accepted['stopped'])
        picking = self.env['stock.picking'].browse(accepted['result']['transfer_id'])
        self.assertTrue(picking.exists())
        self.assertEqual(picking.create_uid, self.reader)
        self.assertNotEqual(picking.name, '/')
        self.assertEqual(self.rows(), 1)
        self.env.cr.execute('SELECT author_id, company_scope, outcome, result FROM qorlia_inventory_create_request WHERE request_key = %s',
            [payload['request_key']])
        author, companies, outcome, result = self.env.cr.fetchone()
        self.assertEqual((author, companies, outcome, result), (self.reader.id, self.api().env.companies.ids, 'accepted', accepted['result']))
        calls = []
        def forbidden(records, *args):
            calls.append(True)
            raise AssertionError('Duplicate native creation')
        with patch.object(type(self.api()), '_qorlia_inventory_create_native', forbidden):
            self.assertEqual(self.api()._qorlia_inventory_create_once(payload), accepted)
            self.assertEqual(self.api()._qorlia_inventory_create_status(payload), accepted)
            self.assertEqual(self.api()._qorlia_inventory_create_stop(payload), accepted)
            picking.unlink()
            self.assertFalse(picking.exists())
            self.assertEqual(self.api()._qorlia_inventory_create_once(payload), accepted)
            self.assertEqual(self.api()._qorlia_inventory_create_status(payload), accepted)
        self.assertEqual(self.rows(), 1)
        self.assertEqual(calls, [])

    def test_stop_before_creation_is_terminal_without_changing_business_rows(self):
        payload, before = self.payload(), self.stamp()
        with patch.object(type(self.api()), '_qorlia_inventory_create_native', side_effect=AssertionError('Stopped creation ran')):
            stopped = self.api()._qorlia_inventory_create_stop(payload)
            self.assertTrue(stopped['stopped'])
            self.assertFalse(stopped['accepted'])
            self.assertIs(stopped['result'], False)
            self.assertEqual(self.api()._qorlia_inventory_create_once(payload), stopped)
            self.assertEqual(self.api()._qorlia_inventory_create_status(payload), stopped)
            self.assertEqual(self.api()._qorlia_inventory_create_stop(payload), stopped)
        self.assertEqual(self.rows(), 1)
        self.assertEqual(self.stamp(), before)

    def test_reused_key_cannot_change_body_seed_edits_or_review_bindings(self):
        payload = self.payload()
        accepted = self.api()._qorlia_inventory_create_once(payload)
        variants = []
        for name in ('review_version', 'review_complete_token'):
            variants.append(dict(copy.deepcopy(payload), **{name: 'c' * 64}))
        changed = copy.deepcopy(payload)
        changed['seed']['values']['origin'] = 'QorliaQA Another body'
        variants.append(changed)
        variants.append(dict(copy.deepcopy(payload), edits=[{'node': 0, 'value': 'QorliaQA Another edit'}]))
        before = self.stamp()
        with patch.object(type(self.api()), '_qorlia_inventory_create_native', side_effect=AssertionError('Changed request ran')):
            for changed in variants:
                for method in ('_qorlia_inventory_create_once', '_qorlia_inventory_create_status', '_qorlia_inventory_create_stop'):
                    with self.subTest(method=method), self.assertRaises(ValidationError):
                        getattr(self.api(), method)(changed)
        self.assertEqual(self.rows(), 1)
        self.assertEqual(self.stamp(), before)
        self.assertEqual(self.api()._qorlia_inventory_create_status(payload), accepted)

    def test_other_actor_cannot_read_reuse_or_stop_the_original_request(self):
        other = self.env['res.users'].with_context(no_reset_password=True).create({
            'name': 'QorliaQA Other creation actor', 'login': 'qorliaqa-create-journal-other',
            'company_id': self.env.company.id, 'company_ids': [Command.set(self.env.company.ids)],
            'groups_id': [Command.set([self.env.ref('stock.group_stock_user').id])]})
        payload = self.payload()
        self.api()._qorlia_inventory_create_once(payload)
        before = self.stamp()
        for method in ('_qorlia_inventory_create_once', '_qorlia_inventory_create_status', '_qorlia_inventory_create_stop'):
            with self.subTest(method=method), self.assertRaises(ValidationError):
                getattr(self.env['stock.picking'].with_user(other), method)(payload)
            with self.assertRaises(AccessError):
                getattr(self.env['stock.picking'].with_user(self.env.ref('base.public_user')), method)(payload)
        self.assertEqual(self.rows(), 1)
        self.assertEqual(self.stamp(), before)

    def test_changed_active_company_scope_is_not_reinterpreted(self):
        company = self.env['res.company'].create({'name': 'QorliaQA Journal second company'})
        self.reader.company_ids = [Command.link(company.id)]
        payload = self.payload()
        accepted = self.api()._qorlia_inventory_create_once(payload)
        changed = self.api().with_context(allowed_company_ids=[self.env.company.id, company.id])
        before = self.stamp()
        for method in ('_qorlia_inventory_create_once', '_qorlia_inventory_create_status', '_qorlia_inventory_create_stop'):
            with self.subTest(method=method), self.assertRaises(ValidationError):
                getattr(changed, method)(payload)
        self.assertEqual(self.stamp(), before)
        self.assertEqual(self.api()._qorlia_inventory_create_status(payload), accepted)

    def test_malformed_requests_are_rejected_before_claiming_or_running_native_creation(self):
        payload = self.payload()
        variants = [None, [], {}, dict(payload, unexpected=True), dict(payload, request_key='invalid'),
            dict(payload, request_key=42), dict(payload, review_version='invalid'),
            dict(payload, edits=[{'node': True, 'value': False}]), dict(payload, edits=[{'node': -1, 'value': False}]),
            dict(payload, edits=[{'node': 1, 'value': float('nan')}])]
        for name, value in (('warning', []), ('picking_type_id', True), ('signature', 1)):
            changed = copy.deepcopy(payload)
            changed['seed'][name] = value
            variants.append(changed)
        before = self.stamp()
        with patch.object(type(self.api()), '_qorlia_inventory_create_native', side_effect=AssertionError('Malformed request ran')):
            for value in variants:
                with self.subTest(value_type=type(value).__name__), self.assertRaises(ValidationError):
                    self.api()._qorlia_inventory_create_once(value)
        self.assertEqual(self.rows(), 0)
        self.assertEqual(self.stamp(), before)

    def test_bad_signature_rolls_back_its_claim_and_does_not_poison_the_key(self):
        payload = self.payload()
        changed = copy.deepcopy(payload)
        changed['seed']['signature'] = '0' * 64
        before = self.stamp()
        with self.assertRaises(UserError):
            self.api()._qorlia_inventory_create_once(changed)
        self.assertEqual(self.rows(), 0)
        self.assertEqual(self.stamp(), before)
        self.assertTrue(self.api()._qorlia_inventory_create_once(payload)['accepted'])
        self.assertEqual(self.rows(), 1)

    def test_native_or_metadata_failure_restores_claim_business_rows_and_callbacks(self):
        native = type(self.api())._qorlia_inventory_create_native
        for phase in ('native', 'metadata'):
            payload, before = self.payload(), self.stamp()
            original_rows = self.rows()
            cr, marker = self.env.cr, []
            cr.postcommit.add(lambda: marker.append('original'))
            hooks = {name: (getattr(cr, name), list(getattr(cr, name)._funcs), copy.deepcopy(getattr(cr, name).data))
                for name in ('precommit', 'postcommit', 'prerollback', 'postrollback')}
            def fail(records, *args):
                if phase == 'native':
                    native(records, *args)
                cr.postcommit.add(lambda: marker.append('unexpected'))
                cr.postcommit.data['qorliaqa-journal'] = 'unexpected'
                raise UserError('QorliaQA Injected journal execution failure')
            method = '_qorlia_inventory_create_native' if phase == 'native' else '_qorlia_inventory_creation_result'
            with self.subTest(phase=phase), patch.object(type(self.api()), method, fail), self.assertRaisesRegex(UserError, 'Injected journal'):
                self.api()._qorlia_inventory_create_once(payload)
            self.assertEqual(self.rows(), original_rows)
            self.assertEqual(self.stamp(), before)
            self.assertEqual(marker, [])
            for name, (callbacks, functions, data) in hooks.items():
                self.assertIs(getattr(cr, name), callbacks)
                self.assertEqual(list(callbacks._funcs), functions)
                self.assertEqual(callbacks.data, data)
            accepted = self.api()._qorlia_inventory_create_once(payload)
            self.assertTrue(accepted['accepted'])
            self.assertEqual(self.rows(), original_rows + 1)

    def test_forced_stale_read_uses_real_unique_constraint_and_retryable_sqlstate_before_business(self):
        payload = self.payload()
        accepted = self.api()._qorlia_inventory_create_once(payload)
        before = self.stamp()
        unknown = {'request_key': payload['request_key'], 'accepted': False, 'stopped': False, 'result': False}
        with patch.object(type(self.api()), '_qorlia_inventory_creation_journal_read', return_value=unknown), patch.object(
                type(self.api()), '_qorlia_inventory_create_native', side_effect=AssertionError('Duplicate business action')):
            with self.assertRaises(SerializationFailure) as raised:
                self.api()._qorlia_inventory_create_once(payload)
        self.assertEqual(raised.exception.pgcode, '40001')
        self.assertEqual(self.rows(), 1)
        self.assertEqual(self.stamp(), before)
        self.assertEqual(self.api()._qorlia_inventory_create_status(payload), accepted)

    def test_unrelated_native_unique_violation_is_not_relabelled_as_a_retry(self):
        payload, before = self.payload(), self.stamp()
        def duplicate(records, *args):
            records.env.cr.execute('CREATE TEMP TABLE qorliaqa_journal_native_unique (value integer UNIQUE) ON COMMIT DROP')
            records.env.cr.execute('INSERT INTO qorliaqa_journal_native_unique VALUES (1), (1)')
        with patch.object(type(self.api()), '_qorlia_inventory_create_native', duplicate), self.assertRaises(UniqueViolation) as raised:
            self.api()._qorlia_inventory_create_once(payload)
        self.assertEqual(raised.exception.pgcode, '23505')
        self.assertNotEqual(raised.exception.diag.constraint_name, _PRIMARY_KEY)
        self.assertEqual(self.rows(), 0)
        self.assertEqual(self.stamp(), before)

    def test_incomplete_committed_shape_is_not_blindly_replayed_or_stopped(self):
        payload = self.payload()
        request, digest = self.api()._qorlia_inventory_creation_request(payload)
        self.env.cr.execute('INSERT INTO qorlia_inventory_create_request '
            '(request_key, request_hash, author_id, company_scope, outcome) VALUES (%s, %s, %s, %s, %s)',
            [request['request_key'], digest, self.reader.id, Json(self.api().env.companies.ids), 'pending'])
        before = self.stamp()
        with patch.object(type(self.api()), '_qorlia_inventory_create_native', side_effect=AssertionError('Incomplete claim replayed')):
            for method in ('_qorlia_inventory_create_once', '_qorlia_inventory_create_status', '_qorlia_inventory_create_stop'):
                with self.subTest(method=method), self.assertRaisesRegex(UserError, 'incomplete internal'):
                    getattr(self.api(), method)(payload)
        self.assertEqual(self.rows(), 1)
        self.assertEqual(self.stamp(), before)

    def test_missing_or_deferred_primary_key_fails_closed_before_business(self):
        payload, before = self.payload(), self.stamp()
        for deferred in (False, True):
            with self.subTest(deferred=deferred), closing(self.env.cr.savepoint()):
                self.env.cr.execute('ALTER TABLE qorlia_inventory_create_request DROP CONSTRAINT qorlia_inventory_create_request_pkey')
                if deferred:
                    self.env.cr.execute('ALTER TABLE qorlia_inventory_create_request '
                        'ADD CONSTRAINT qorlia_inventory_create_request_pkey PRIMARY KEY (request_key) DEFERRABLE INITIALLY DEFERRED')
                with patch.object(type(self.api()), '_qorlia_inventory_create_native', side_effect=AssertionError('Unsafe schema used')):
                    with self.assertRaisesRegex(UserError, 'schema is incompatible'):
                        self.api()._qorlia_inventory_create_once(payload)
        self.api()._qorlia_inventory_creation_journal_ready()
        self.assertEqual(self.rows(), 0)
        self.assertEqual(self.stamp(), before)

    def test_mutating_returned_metadata_does_not_change_stored_acceptance_or_input(self):
        payload = self.payload()
        original = copy.deepcopy(payload)
        accepted = self.api()._qorlia_inventory_create_once(payload)
        stored = copy.deepcopy(accepted)
        accepted['result']['references'].clear()
        accepted['result']['transfer_id'] = -1
        self.assertEqual(payload, original)
        self.assertEqual(self.api()._qorlia_inventory_create_status(payload), stored)

    def test_invalid_stored_accepted_reference_metadata_is_not_exposed_as_success(self):
        payload = self.payload()
        accepted = self.api()._qorlia_inventory_create_once(payload)
        result = copy.deepcopy(accepted['result'])
        result['references'] = {'new:stock.picking:0': {'model': [], 'id': result['transfer_id']}}
        self.env.cr.execute('UPDATE qorlia_inventory_create_request SET result = %s WHERE request_key = %s',
            [Json(result), payload['request_key']])
        with self.assertRaisesRegex(UserError, 'invalid reference metadata'):
            self.api()._qorlia_inventory_create_status(payload)
        self.assertEqual(self.rows(), 1)
