# SPDX-License-Identifier: LGPL-3.0-or-later
# Copyright 2026 Qorlia contributors.
import copy
import hashlib
import hmac
import json
import re
import uuid

from psycopg2.errors import UniqueViolation
from psycopg2.extras import Json

from odoo import models
from odoo.exceptions import AccessError, UserError, ValidationError

from .invoice_draft import _digest
from .stock_confirmation_paged import _hash
from .stock_inventory_draft import _seed_payload
from .stock_inventory_save import _SAVE_GRAPH, _SAVE_PRIVATE


_TABLE = 'qorlia_inventory_create_request'
_PRIMARY_KEY = _TABLE + '_pkey'
_PURPOSE = 'qorlia.inventory-create-request.v1'
_COLUMNS = {
    'request_key': ('uuid', True), 'request_hash': ('text', True),
    'author_id': ('integer', True), 'company_scope': ('jsonb', True),
    'outcome': ('text', True), 'result': ('jsonb', False),
    'created_at': ('timestamp with time zone', True),
}


class StockInventoryCreateJournal(models.Model):
    _inherit = 'stock.picking'

    def _qorlia_inventory_creation_journal_ready(self):
        cr = self.env.cr
        cr.execute('SELECT attname, format_type(atttypid, atttypmod), attnotnull FROM pg_attribute '
            'WHERE attrelid = to_regclass(%s) AND attnum > 0 AND NOT attisdropped', [_TABLE])
        columns = {name: (kind, required) for name, kind, required in cr.fetchall()}
        cr.execute('SELECT constraint_row.conname FROM pg_constraint constraint_row '
            'JOIN pg_index index_row ON index_row.indexrelid = constraint_row.conindid '
            'JOIN pg_attribute field_row ON field_row.attrelid = constraint_row.conrelid AND field_row.attname = %s '
            'WHERE constraint_row.conrelid = to_regclass(%s) AND constraint_row.contype = %s '
            'AND constraint_row.conkey = ARRAY[field_row.attnum]::smallint[] '
            'AND NOT constraint_row.condeferrable AND constraint_row.convalidated '
            'AND index_row.indisvalid AND index_row.indisready', ['request_key', _TABLE, 'p'])
        if columns != _COLUMNS or cr.fetchall() != [(_PRIMARY_KEY,)]:
            raise UserError('Native creation recovery is not installed or its schema is incompatible. Contact your administrator.')

    def _qorlia_inventory_creation_journal_setup(self):
        if not self.env.su:
            raise AccessError('Creation recovery schema installation requires the native system operator.')
        self.env.cr.execute('CREATE TABLE IF NOT EXISTS qorlia_inventory_create_request ('
            'request_key uuid PRIMARY KEY, '
            "request_hash text NOT NULL CHECK (request_hash ~ '^[0-9a-f]{64}$'), "
            'author_id integer NOT NULL CHECK (author_id > 0), '
            "company_scope jsonb NOT NULL CHECK (jsonb_typeof(company_scope) = 'array' AND jsonb_array_length(company_scope) > 0), "
            "outcome text NOT NULL CHECK (outcome IN ('pending', 'accepted', 'stopped')), "
            'result jsonb, created_at timestamp with time zone NOT NULL DEFAULT now(), '
            "CHECK ((outcome = 'accepted' AND result IS NOT NULL AND jsonb_typeof(result) = 'object') "
            "OR (outcome IN ('pending', 'stopped') AND result IS NULL)))")
        self.env.cr.execute('REVOKE ALL ON qorlia_inventory_create_request FROM PUBLIC')
        self._qorlia_inventory_creation_journal_ready()

    def _qorlia_inventory_creation_request(self, payload):
        if not isinstance(payload, dict) or set(payload) != {'seed', 'edits', 'review_version', 'review_complete_token', 'request_key'}:
            raise ValidationError('Keep the exact native creation request and its original request key.')
        seed = payload['seed']
        _seed_payload(seed)
        if any(not _hash(payload[name]) for name in ('review_version', 'review_complete_token')):
            raise ValidationError('Keep the original signed defaults and creation review tokens.')
        self._qorlia_inventory_edit_ledger(payload['edits'])
        if any(not isinstance(edit, dict) or set(edit) != {'node', 'value'}
                or type(edit['node']) is not int or edit['node'] < 0 for edit in payload['edits']):
            raise ValidationError('Keep the exact ordered native creation edits.')
        try:
            if str(uuid.UUID(payload['request_key'])) != payload['request_key'] or len(json.dumps(payload, allow_nan=False)) > 4_000_000:
                raise ValueError()
        except (ValueError, TypeError, AttributeError):
            raise ValidationError('Keep a bounded finite creation request with a valid original key.')
        request = copy.deepcopy(payload)
        return request, _digest({'purpose': _PURPOSE, 'database': self.env.cr.dbname,
            'author': self.env.uid, 'companies': self.env.companies.ids, 'request': request})

    def _qorlia_inventory_creation_result(self, result):
        if (not isinstance(result, dict) or set(result) != {'transfer_id', 'state_after', 'references'}
                or type(result['transfer_id']) is not int or result['transfer_id'] <= 0
                or result['state_after'] not in ('draft', 'waiting', 'confirmed', 'assigned')
                or not isinstance(result['references'], dict)):
            raise UserError('Native creation recovery has an invalid accepted result. Keep the original request.')
        for key, reference in result['references'].items():
            if (not isinstance(key, str) or not isinstance(reference, dict) or set(reference) != {'model', 'id'}
                    or not isinstance(reference['model'], str)
                    or reference['model'] not in set(_SAVE_GRAPH) - _SAVE_PRIVATE
                    or not re.fullmatch(r'new:' + re.escape(reference['model']) + r':(0|[1-9][0-9]*)', key)
                    or type(reference['id']) is not int or reference['id'] <= 0):
                raise UserError('Native creation recovery has invalid reference metadata. Keep the original request.')
        if not any(ref == {'model': 'stock.picking', 'id': result['transfer_id']} for ref in result['references'].values()):
            raise UserError('The created transfer is missing from recovery references. Nothing was accepted.')
        return copy.deepcopy(result)

    def _qorlia_inventory_creation_journal_read(self, request, digest):
        self.env.cr.execute('SELECT request_hash, author_id, company_scope, outcome, result '
            'FROM qorlia_inventory_create_request WHERE request_key = %s', [request['request_key']])
        row = self.env.cr.fetchone()
        response = {'request_key': request['request_key'], 'accepted': False, 'stopped': False, 'result': False}
        if not row:
            return response
        original, author, companies, outcome, result = row
        if author != self.env.uid or companies != self.env.companies.ids or not hmac.compare_digest(original, digest):
            raise ValidationError('This request key belongs to another creation request or account scope.')
        if outcome == 'accepted':
            return dict(response, accepted=True, result=self._qorlia_inventory_creation_result(result))
        if outcome == 'stopped' and result is None:
            return dict(response, stopped=True)
        raise UserError('Creation recovery has an incomplete internal outcome. Keep the original request and contact your administrator.')

    def _qorlia_inventory_create_status(self, payload):
        self = self._qorlia_inventory_context()
        request, digest = self._qorlia_inventory_creation_request(payload)
        self._qorlia_inventory_creation_journal_ready()
        return self._qorlia_inventory_creation_journal_read(request, digest)

    def _qorlia_inventory_creation_journal_apply(self, payload, stop=False):
        self = self._qorlia_inventory_context()
        request, digest = self._qorlia_inventory_creation_request(payload)
        self._qorlia_inventory_creation_journal_ready()
        current = self._qorlia_inventory_creation_journal_read(request, digest)
        if current['accepted'] or current['stopped']:
            return current
        cr = self.env.cr
        cr.flush()
        hooks = {name: (getattr(cr, name), list(getattr(cr, name)._funcs), copy.deepcopy(getattr(cr, name).data))
            for name in ('precommit', 'postcommit', 'prerollback', 'postrollback')}
        lock = int.from_bytes(hashlib.sha256((_PURPOSE + ':' + request['request_key']).encode()).digest()[:8], 'big', signed=True)
        try:
            with cr.savepoint():
                cr.execute('SELECT pg_advisory_xact_lock(%s)', [lock])
                current = self._qorlia_inventory_creation_journal_read(request, digest)
                if current['accepted'] or current['stopped']:
                    return current
                try:
                    with cr.savepoint():
                        cr.execute('INSERT INTO qorlia_inventory_create_request '
                            '(request_key, request_hash, author_id, company_scope, outcome) VALUES (%s, %s, %s, %s, %s)',
                            [request['request_key'], digest, self.env.uid, Json(self.env.companies.ids), 'stopped' if stop else 'pending'])
                except UniqueViolation as error:
                    if error.diag.constraint_name != _PRIMARY_KEY:
                        raise
                    # A waiter can hold an old repeatable-read snapshot. Native retry must start a fresh transaction.
                    cr.execute("DO $$ BEGIN RAISE EXCEPTION 'Concurrent inventory creation request' USING ERRCODE = '40001'; END $$")
                if not stop:
                    _effects, _private, state, references, picking, _current = self._qorlia_inventory_create_native(request['seed'], request['edits'])
                    result = self._qorlia_inventory_creation_result({'transfer_id': picking.id,
                        'state_after': state, 'references': references})
                    cr.execute('UPDATE qorlia_inventory_create_request SET outcome = %s, result = %s '
                        'WHERE request_key = %s AND request_hash = %s AND author_id = %s AND outcome = %s',
                        ['accepted', Json(result), request['request_key'], digest, self.env.uid, 'pending'])
                    if cr.rowcount != 1:
                        raise UserError('Creation recovery changed during native Save. Nothing was accepted.')
                return self._qorlia_inventory_creation_journal_read(request, digest)
        except Exception:
            for name, (callbacks, functions, data) in hooks.items():
                setattr(cr, name, callbacks)
                callbacks.clear()
                for function in functions:
                    callbacks.add(function)
                callbacks.data.update(data)
            raise

    def _qorlia_inventory_create_once(self, payload):
        """Private journal execution, not a public Save or review-proof validator."""
        return self._qorlia_inventory_creation_journal_apply(payload)

    def _qorlia_inventory_create_stop(self, payload):
        return self._qorlia_inventory_creation_journal_apply(payload, stop=True)
