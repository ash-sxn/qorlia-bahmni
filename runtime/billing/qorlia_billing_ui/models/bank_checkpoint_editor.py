# SPDX-License-Identifier: LGPL-3.0-or-later
# Copyright 2026 Qorlia contributors.
from contextlib import closing
import copy
import hashlib
import math
import uuid

from psycopg2.errors import UniqueViolation

from odoo import api, fields, models, tools
from odoo.exceptions import AccessError, UserError, ValidationError

from .bank_checkpoint import CHECKPOINT_FIELDS
from .invoice_draft import _digest


EDIT_FIELDS = ('name', 'reference', 'balance_start', 'balance_end_real')
RECEIPT_FIELDS = ('qorlia_checkpoint_creation_key', 'qorlia_checkpoint_creation_hash',
    'qorlia_checkpoint_edit_receipts')
_RECEIPT_TOKEN = object()


class BankCheckpointEditor(models.Model):
    _inherit = 'account.bank.statement'

    qorlia_checkpoint_creation_key = fields.Char(copy=False, readonly=True, index=True)
    qorlia_checkpoint_creation_hash = fields.Char(copy=False, readonly=True)
    qorlia_checkpoint_edit_receipts = fields.Json(copy=False, readonly=True)
    _sql_constraints = [('qorlia_checkpoint_creation_key_unique', 'unique(qorlia_checkpoint_creation_key)',
        'This statement creation request has already been saved.')]

    @api.model_create_multi
    def create(self, values_list):
        if (any(set(values) & set(RECEIPT_FIELDS) for values in values_list)
                or any('default_' + name in self.env.context for name in RECEIPT_FIELDS)):
            if self.env.context.get('qorlia_checkpoint_receipt_token') is not _RECEIPT_TOKEN:
                raise AccessError('Statement save receipts require a reviewed checkpoint save.')
        return super().create(values_list)

    def write(self, values):
        if (set(values) & set(RECEIPT_FIELDS)
                and self.env.context.get('qorlia_checkpoint_receipt_token') is not _RECEIPT_TOKEN):
            raise AccessError('Statement save receipts require a reviewed checkpoint save.')
        return super().write(values)

    def _qorlia_checkpoint_editor_inputs(self, checkpoint_id, entry_ids, split_line_id):
        if (checkpoint_id is not False and (type(checkpoint_id) is not int or checkpoint_id <= 0)
                or not isinstance(entry_ids, list)
                or any(type(identifier) is not int or identifier <= 0 for identifier in entry_ids)
                or len(set(entry_ids)) != len(entry_ids)
                or split_line_id is not False and (type(split_line_id) is not int or split_line_id <= 0)
                or checkpoint_id and (entry_ids or split_line_id)
                or not checkpoint_id and not entry_ids
                or split_line_id and (len(entry_ids) != 1 or split_line_id != entry_ids[0])):
            raise ValidationError('Select a saved checkpoint or distinct native transactions to group.')

    def _qorlia_checkpoint_editor_scope(self, checkpoint_id, entry_ids, split_line_id, lock=False):
        self._qorlia_checkpoint_editor_inputs(checkpoint_id, entry_ids, split_line_id)
        if (self.env.context.get('check_move_validity') is False
                or any(self.env.context.get(name) for name in ('force_delete',
                    'skip_account_move_synchronization', 'skip_invoice_sync',
                    'no_exchange_difference', 'no_exchange_difference_no_recursive', 'no_cash_basis'))
                or any(name.startswith('default_') for name in self.env.context)):
            raise ValidationError('Statement editing requires native accounting validation and transaction selection.')
        self._qorlia_checkpoint_access()
        origin = self.browse(checkpoint_id).exists() if checkpoint_id else self.browse()
        if checkpoint_id and not origin:
            raise UserError('This statement checkpoint is no longer available.')
        origin._qorlia_checkpoint_access()
        self.check_access_rights('write' if origin else 'create')
        origin.check_access_rule('write')
        selected = self.env['account.bank.statement.line'].browse(entry_ids).exists()
        if len(selected) != len(entry_ids):
            raise UserError('A selected statement transaction is no longer available.')
        selected._qorlia_bank_access()
        journal = origin.journal_id if origin else selected.journal_id
        if len(journal) > 1:
            raise ValidationError('A statement should only contain lines from the same journal.')
        company = journal.company_id or self.env.company
        if lock:
            self.env.cr.execute('SELECT id FROM res_company WHERE id = %s FOR UPDATE', [company.id])
            self.env.cr.execute('SELECT id FROM account_journal WHERE id IN %s ORDER BY id FOR UPDATE',
                [tuple(journal.ids) or (0,)])
        # Native defaults/continuity use transactions outside the selected rows. Never silently omit hidden rows.
        self.env.flush_all()
        self.env.cr.execute('SELECT line.id FROM account_bank_statement_line line '
            'JOIN account_move move ON move.id = line.move_id WHERE move.journal_id IN %s ORDER BY line.id' +
            (' FOR UPDATE OF line, move' if lock else ''), [tuple(journal.ids) or (0,)])
        journal_lines = self.env['account.bank.statement.line'].browse([row[0] for row in self.env.cr.fetchall()])
        self.env.cr.execute('SELECT id FROM account_bank_statement WHERE journal_id IN %s OR id IN %s ORDER BY id' +
            (' FOR UPDATE' if lock else ''), [tuple(journal.ids) or (0,), tuple(origin.ids) or (0,)])
        checkpoints = self.browse([row[0] for row in self.env.cr.fetchall()])
        if lock:
            self.env.invalidate_all()
        journal_lines._qorlia_bank_access()
        checkpoints._qorlia_checkpoint_access()
        for checkpoint in checkpoints:
            checkpoint._qorlia_checkpoint_lines()
        native_context = {'active_ids': entry_ids, 'st_line_id': entry_ids[0] if entry_ids else False,
            'split_line_id': split_line_id}
        model = self.with_company(company).with_context(**native_context)
        defaults = model.default_get(['line_ids']) if not origin else {}
        lines = (origin._qorlia_checkpoint_lines() if origin else
            model.new(defaults).line_ids._origin)
        lines._qorlia_bank_access()
        if not origin:
            lines.check_access_rights('write')
            lines.check_access_rule('write')
        graph = self._qorlia_checkpoint_editor_graph(lines)
        if lock:
            for name in sorted(graph):
                records = graph[name]
                self.env.cr.execute('SELECT id FROM %s WHERE id IN %%s ORDER BY id FOR UPDATE' % records._table,
                    [tuple(records.ids) or (0,)])
                records.invalidate_recordset()
        version = _digest({'author': self.env.uid, 'companies': self.env.companies.ids,
            'checkpoint_id': checkpoint_id, 'entry_ids': entry_ids, 'split_line_id': split_line_id,
            'checkpoints': [{'write_date': item.write_date, 'first_line_index': item.first_line_index,
                **item._qorlia_checkpoint_row()} for item in checkpoints],
            'lines': journal_lines.read(['write_date', 'internal_index', 'statement_id', 'move_id', 'state',
                'amount', 'date', 'journal_id', 'payment_ref']),
            'journal': journal.read(['write_date', 'code', 'type', 'currency_id', 'company_id']),
            'company': company.read(['write_date', 'currency_id']),
            'currency': (journal.currency_id | company.currency_id).read(['write_date', 'rounding']),
            'graph': {name: records.sorted('id').read(['write_date']) for name, records in graph.items()},
            'financial': self._qorlia_checkpoint_editor_financial(lines, graph)})
        return model, origin, defaults, lines, checkpoints, graph, version

    def _qorlia_checkpoint_editor_values(self, values):
        if not isinstance(values, dict) or set(values) != set(EDIT_FIELDS):
            raise ValidationError('Review the complete statement reference and balances.')
        for name in ('name', 'reference'):
            if values[name] is not False and (not isinstance(values[name], str) or len(values[name]) > 200):
                raise ValidationError('Use a statement reference of at most 200 characters.')
        for name in ('balance_start', 'balance_end_real'):
            if type(values[name]) not in (int, float) or not math.isfinite(values[name]):
                raise ValidationError('Enter finite statement starting and ending balances.')
        return dict(values)

    def _qorlia_checkpoint_editor_graph(self, lines, witnesses=None):
        graph = {}
        for entry in lines:
            for name, records in entry._qorlia_bank_match_graph(witnesses=witnesses).items():
                graph[name] = graph.get(name, self.env[name]) | records
        return graph

    def _qorlia_checkpoint_editor_financial(self, lines, graph):
        origin = {name: set(records.ids) for name, records in graph.items()}
        # Rewalk relationships so unexpected native hooks cannot hide new/removed accounting records.
        current = self._qorlia_checkpoint_editor_graph(lines, origin)
        financial = lines[:1]._qorlia_bank_match_snapshot(current, origin) if lines else {}
        for row in financial.get('account.bank.statement.line', {}).get('rows', []):
            row['values'].pop('statement_id', None)
        return financial

    def _qorlia_checkpoint_editor_result(self, saved, checkpoints, lines, graph, new=False):
        reader = self.env['sale.order']._qorlia_read_fields
        financial = self._qorlia_checkpoint_editor_financial(lines, graph)
        affected = checkpoints | saved
        rows = []
        for item in affected.sorted('id'):
            data = item._qorlia_checkpoint_row()
            data['id'] = 'new' if new and item == saved else item.id
            rows.append({'checkpoint': data, 'entry_ids': item._qorlia_checkpoint_lines().ids})
        return {'values': reader(saved, EDIT_FIELDS), 'checkpoint': {
            key: value for key, value in saved._qorlia_checkpoint_row().items() if key != 'id'},
            'entry_ids': saved._qorlia_checkpoint_lines().ids, 'affected': rows, 'financial': financial}

    def _qorlia_checkpoint_editor_simulate(self, scope, values=None):
        model, origin, defaults, lines, checkpoints, graph, _version = scope
        before = model._qorlia_checkpoint_editor_financial(lines, graph)
        cr = self.env.cr
        cr.flush()
        hooks = {name: getattr(cr, name) for name in ('postcommit', 'prerollback', 'postrollback')}
        try:
            for name in hooks:
                setattr(cr, name, tools.Callbacks())
            with closing(cr.savepoint()):
                if origin:
                    saved = origin
                    if values is not None:
                        saved.write(values)
                else:
                    saved = model.create({**defaults, **(values or {})})
                cr.flush()
                saved.check_access_rule('write' if origin else 'create')
                result = model._qorlia_checkpoint_editor_result(saved, checkpoints, lines, graph, not origin)
                if result['financial'] != before:
                    raise UserError('Statement grouping changed accounting. Nothing was saved.')
                return result
        finally:
            for name, callbacks in hooks.items():
                setattr(cr, name, callbacks)

    @api.model
    def qorlia_checkpoint_editor_load(self, checkpoint_id=False, entry_ids=None, split_line_id=False):
        entry_ids = [] if entry_ids is None else entry_ids
        scope = self._qorlia_checkpoint_editor_scope(checkpoint_id, entry_ids, split_line_id)
        result = self._qorlia_checkpoint_editor_simulate(scope)
        return {'checkpoint_id': checkpoint_id, 'entry_ids': entry_ids, 'split_line_id': split_line_id,
            'version': scope[-1], **{name: result[name] for name in ('values', 'checkpoint')},
            'selected_entry_ids': result['entry_ids']}

    def _qorlia_checkpoint_editor_payload(self, payload, lock=False):
        if (not isinstance(payload, dict) or set(payload) !=
                {'checkpoint_id', 'entry_ids', 'split_line_id', 'version', 'values'}
                or not isinstance(payload['version'], str) or len(payload['version']) != 64
                or any(char not in '0123456789abcdef' for char in payload['version'])):
            raise ValidationError('Reload a complete native statement editing request.')
        values = self._qorlia_checkpoint_editor_values(payload['values'])
        scope = self._qorlia_checkpoint_editor_scope(payload['checkpoint_id'], payload['entry_ids'],
            payload['split_line_id'], lock)
        if scope[-1] != payload['version']:
            raise UserError('The statement, transactions or accounting configuration changed. Reload before editing.')
        return scope, values

    @api.model
    def qorlia_checkpoint_editor_preview(self, payload):
        scope, values = self._qorlia_checkpoint_editor_payload(payload)
        result = self._qorlia_checkpoint_editor_simulate(scope, values)
        result['review_version'] = _digest({'payload': payload, 'result': result, 'author': self.env.uid})
        return result

    def _qorlia_checkpoint_editor_request(self, payload, review_version, request_key):
        if (not isinstance(payload, dict) or set(payload) !=
                {'checkpoint_id', 'entry_ids', 'split_line_id', 'version', 'values'}
                or not isinstance(review_version, str) or len(review_version) != 64
                or any(char not in '0123456789abcdef' for char in review_version)):
            raise ValidationError('Use an exact reviewed statement save request.')
        # Validate structure without rejecting an accepted request whose original version is now stale.
        self._qorlia_checkpoint_editor_values(payload['values'])
        self._qorlia_checkpoint_editor_inputs(payload['checkpoint_id'], payload['entry_ids'], payload['split_line_id'])
        if (not isinstance(payload['version'], str) or len(payload['version']) != 64
                or any(char not in '0123456789abcdef' for char in payload['version'])):
            raise ValidationError('Use an exact statement source version.')
        try:
            if not isinstance(request_key, str) or str(uuid.UUID(request_key)) != request_key:
                raise ValueError()
        except (ValueError, TypeError, AttributeError):
            raise ValidationError('Use a valid statement save identifier.')
        return _digest({'payload': payload, 'review': review_version, 'author': self.env.uid})

    def _qorlia_checkpoint_editor_receipt(self, payload, request_key, digest):
        if payload['checkpoint_id'] is False:
            self.env.cr.execute('SELECT id FROM account_bank_statement WHERE qorlia_checkpoint_creation_key = %s', [request_key])
            row = self.env.cr.fetchone()
            checkpoint = self.browse(row[0]).exists() if row else self.browse()
            checkpoint._qorlia_checkpoint_access()
            if checkpoint and checkpoint.qorlia_checkpoint_creation_hash != digest:
                raise ValidationError('This identifier belongs to a different statement request.')
            return checkpoint, bool(checkpoint)
        checkpoint = self.browse(payload['checkpoint_id']).exists()
        if not checkpoint:
            raise UserError('This statement checkpoint is no longer available.')
        checkpoint._qorlia_checkpoint_access()
        receipt = (checkpoint.qorlia_checkpoint_edit_receipts or {}).get(request_key)
        if receipt and (receipt['hash'] != digest or receipt['author'] != self.env.uid):
            raise ValidationError('This identifier belongs to a different statement request.')
        return checkpoint, bool(receipt)

    @api.model
    def qorlia_checkpoint_editor_status(self, payload, review_version, request_key):
        digest = self._qorlia_checkpoint_editor_request(payload, review_version, request_key)
        checkpoint, accepted = self._qorlia_checkpoint_editor_receipt(payload, request_key, digest)
        return {'accepted': accepted, 'checkpoint': checkpoint._qorlia_checkpoint_row() if accepted else False}

    @api.model
    def qorlia_checkpoint_editor_save(self, payload, review_version, request_key):
        digest = self._qorlia_checkpoint_editor_request(payload, review_version, request_key)
        lock = int.from_bytes(hashlib.sha256(('statement-checkpoint:' + request_key).encode()).digest()[:8], 'big', signed=True)
        self.env.cr.execute('SELECT pg_advisory_xact_lock(%s)', [lock])
        checkpoint, accepted = self._qorlia_checkpoint_editor_receipt(payload, request_key, digest)
        if accepted:
            return self.qorlia_checkpoint_editor_status(payload, review_version, request_key)
        scope, values = self._qorlia_checkpoint_editor_payload(payload, lock=True)
        model, origin, defaults, lines, checkpoints, graph, _version = scope
        review = self._qorlia_checkpoint_editor_simulate(scope, values)
        if _digest({'payload': payload, 'result': review, 'author': self.env.uid}) != review_version:
            raise UserError('Review the complete native statement effects again before saving.')
        hooks = {name: (getattr(self.env.cr, name), list(getattr(self.env.cr, name)._funcs),
            copy.deepcopy(getattr(self.env.cr, name).data)) for name in ('postcommit', 'prerollback', 'postrollback')}
        try:
            with self.env.cr.savepoint():
                if origin:
                    origin.write(values)
                    saved = origin
                else:
                    saved = model.with_context(qorlia_checkpoint_receipt_token=_RECEIPT_TOKEN).create({
                        **defaults, **values, 'qorlia_checkpoint_creation_key': request_key,
                        'qorlia_checkpoint_creation_hash': digest})
                self.env.cr.flush()
                saved.check_access_rule('write' if origin else 'create')
                if model._qorlia_checkpoint_editor_result(saved, checkpoints, lines, graph, not origin) != review:
                    raise UserError('Native Billing changed unreviewed statement effects. Nothing was saved.')
                if origin:
                    receipts = dict(saved.qorlia_checkpoint_edit_receipts or {})
                    receipts[request_key] = {'hash': digest, 'author': self.env.uid}
                    saved.with_context(qorlia_checkpoint_receipt_token=_RECEIPT_TOKEN).write({
                        'qorlia_checkpoint_edit_receipts': receipts})
                if model._qorlia_checkpoint_editor_result(saved, checkpoints, lines, graph, not origin) != review:
                    raise UserError('Recording the statement receipt changed accounting. Nothing was saved.')
                return self.qorlia_checkpoint_editor_status(payload, review_version, request_key)
        except Exception as error:
            for name, (callbacks, functions, data) in hooks.items():
                setattr(self.env.cr, name, callbacks)
                callbacks.clear()
                for function in functions:
                    callbacks.add(function)
                callbacks.data.update(data)
            if (isinstance(error, UniqueViolation)
                    and error.diag.constraint_name == 'account_bank_statement_qorlia_checkpoint_creation_key_unique'):
                self.env.cr.execute("DO $$ BEGIN RAISE EXCEPTION 'Concurrent statement creation' USING ERRCODE = '40001'; END $$")
            raise
