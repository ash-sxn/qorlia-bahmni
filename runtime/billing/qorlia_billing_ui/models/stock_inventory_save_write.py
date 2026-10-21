# SPDX-License-Identifier: LGPL-3.0-or-later
# Copyright 2026 Qorlia contributors.
import copy
import hmac
import uuid

from psycopg2 import sql
from odoo import api, fields, models
from odoo.exceptions import UserError, ValidationError

from .invoice_draft import _digest
from .stock_inventory_save import _PURPOSE
from .stock_confirmation_paged import _hash, _effect_rows
from .stock_validation import _RECEIPT_TOKEN
from .stock_validation_recovery import _page_parameters


class StockInventorySaveWrite(models.Model):
    _inherit = 'stock.picking'

    def _qorlia_inventory_saved_request(self, payload):
        if (not isinstance(payload, dict) or set(payload) != {'transfer_id', 'version', 'edits',
                'review_version', 'review_complete_token', 'request_key'}
                or type(payload['transfer_id']) is not int or payload['transfer_id'] <= 0
                or any(not _hash(payload[name]) for name in ('version', 'review_version', 'review_complete_token'))):
            raise ValidationError('Keep the exact completely reviewed transfer save request.')
        self._qorlia_inventory_edit_ledger(payload['edits'])
        if any(not isinstance(edit, dict) or set(edit) != {'node', 'value'} or
                type(edit['node']) is not int or edit['node'] < 0 for edit in payload['edits']):
            raise ValidationError('Keep the original ordered native field edits.')
        try:
            if str(uuid.UUID(payload['request_key'])) != payload['request_key']:
                raise ValueError()
        except (ValueError, TypeError, AttributeError):
            raise ValidationError('Keep the original transfer save request key.')
        request = copy.deepcopy(payload)
        return request, _digest({'purpose': _PURPOSE, 'database': self.env.cr.dbname, 'request': request,
            'author': self.env.uid, 'companies': self.env.companies.ids})

    def _qorlia_inventory_saved_recovery(self, payload):
        request, digest = self._qorlia_inventory_saved_request(payload)
        picking, _records, scope = self._qorlia_inventory_transfer_scope(request['transfer_id'])
        receipt, receipts = picking._qorlia_validation_receipt(request, digest)
        marker = receipts.get('stop:%s:%s' % (self.env.uid, request['request_key']))
        if receipt and (receipt.get('kind') != _PURPOSE or receipt.get('companies') != self.env.companies.ids):
            raise ValidationError('This identifier belongs to another stock request or company scope.')
        if marker and (marker.get('kind') != _PURPOSE + '.stopped' or marker.get('hash') != digest
                or marker.get('author') != self.env.uid):
            raise ValidationError('This identifier belongs to another stopped transfer request.')
        if receipt and marker:
            raise ValidationError('Conflicting transfer outcomes. Keep the original recovery request.')
        return request, digest, picking, scope, receipt, receipts, marker

    def _qorlia_inventory_saved_lock(self):
        self.env.cr.flush()
        # shortcut: ordered coarse locks prevent stock/configuration phantoms; benchmark hospital concurrency before release.
        for table in self._qorlia_inventory_saved_tables():
            self.env.cr.execute(sql.SQL('LOCK TABLE {} IN SHARE ROW EXCLUSIVE MODE').format(sql.Identifier(table)))
        self.env.invalidate_all()

    @api.model
    def qorlia_inventory_edit_save_status(self, payload):
        self = self._qorlia_inventory_context()
        request, _digest_value, picking, _scope, receipt, _receipts, marker = self._qorlia_inventory_saved_recovery(payload)
        return {'request_key': request['request_key'], 'accepted': bool(receipt), 'stopped': bool(marker),
            'state_after': receipt['state'] if receipt else False,
            'changed_fields': receipt['changed_fields'] if receipt else [],
            'reference_count': len(receipt['references']) if receipt else 0,
            'current': self.qorlia_inventory_transfer_load(picking.id)}

    @api.model
    def qorlia_inventory_edit_save_references(self, payload, after=0, version=False, limit=50):
        self = self._qorlia_inventory_context()
        _page_parameters(after, version, limit)
        request, digest, picking, scope, receipt, _receipts, _marker = self._qorlia_inventory_saved_recovery(payload)
        if not receipt:
            raise UserError('This save has not been accepted. Keep the exact request and check its status.')
        references = picking._qorlia_confirmation_reference_labels(receipt)
        current = _digest({'purpose': _PURPOSE + '.references', 'request': digest, 'scope': scope, 'references': references})
        if version is not False and not hmac.compare_digest(version, current):
            raise UserError('Saved references or their access changed. Reload all reference pages.')
        keys = sorted(references)
        if after > len(keys):
            raise ValidationError('The cursor is outside this transfer save result.')
        return {'request_key': request['request_key'], 'version': current, 'after': after, 'total_count': len(keys),
            'next_after': after + limit if after + limit < len(keys) else False,
            'rows': [{'key': key, **references[key]} for key in keys[after:after + limit]]}

    def _qorlia_inventory_saved_record(self, request, picking, receipts):
        cr = self.env.cr
        tables = picking._qorlia_inventory_saved_tables()
        before = picking._qorlia_paged_stop_stamp(tables, 'qorlia_validation_receipts')
        pending = {name: (list(getattr(cr, name)._funcs), copy.deepcopy(getattr(cr, name).data))
            for name in ('postcommit', 'prerollback', 'postrollback')}
        picking.with_context(qorlia_validation_receipt_token=_RECEIPT_TOKEN)._qorlia_validation_record_receipt(copy.deepcopy(receipts))
        cr.flush()
        self.env.invalidate_all()
        response = self.qorlia_inventory_edit_save_status(request)
        cr.flush()
        self.env.invalidate_all()
        cr.execute('SELECT qorlia_validation_receipts FROM stock_picking WHERE id = %s', [picking.id])
        if (cr.fetchone()[0] != receipts or picking._qorlia_paged_stop_stamp(tables, 'qorlia_validation_receipts') != before
                or any(list(getattr(cr, name)._funcs) != functions or getattr(cr, name).data != values
                    for name, (functions, values) in pending.items())):
            raise UserError('Recording this request changed unreviewed state or deferred work. Nothing was saved.')
        return response

    @api.model
    def qorlia_inventory_edit_save(self, payload):
        self = self._qorlia_inventory_context()
        request, _digest_value, picking, _scope, receipt, _receipts, marker = self._qorlia_inventory_saved_recovery(payload)
        if receipt:
            return self.qorlia_inventory_edit_save_status(request)
        if marker:
            raise UserError('This exact save request was stopped. Recover its stopped outcome.')
        picking._qorlia_inventory_saved_lock()
        request, digest, picking, _scope, receipt, receipts, marker = self._qorlia_inventory_saved_recovery(request)
        if receipt:
            return self.qorlia_inventory_edit_save_status(request)
        if marker:
            raise UserError('This exact save request was stopped. Recover its stopped outcome.')
        picking.check_access_rights('write')
        picking.check_access_rule('write')
        preview, effects = self._qorlia_inventory_saved_preview(request['transfer_id'], request['version'], request['edits'])
        if (not hmac.compare_digest(preview['review_version'], request['review_version']) or not hmac.compare_digest(
                self._qorlia_inventory_saved_token(request['transfer_id'], request['version'], request['edits'],
                    request['review_version'], len(_effect_rows(effects)), 'complete'), request['review_complete_token'])):
            raise UserError('Complete the current transfer review before saving. Nothing was saved.')
        source, baseline, spec, initial = self._qorlia_inventory_edit_source(request['transfer_id'])
        if not hmac.compare_digest(baseline['version'], request['version']):
            raise UserError('The transfer changed. Reload and review the original request.')
        stamp = picking._qorlia_confirmation_stamp(picking._qorlia_inventory_saved_tables())
        cr = self.env.cr
        hooks = {name: (getattr(cr, name), list(getattr(cr, name)._funcs), copy.deepcopy(getattr(cr, name).data))
            for name in ('precommit', 'postcommit', 'prerollback', 'postrollback')}
        try:
            with cr.savepoint():
                effects, private_audit, state, references, current = self._qorlia_inventory_saved_native(
                    source, baseline, spec, initial, request['edits'])
                basis = self._qorlia_inventory_saved_basis(request['transfer_id'], request['version'], request['edits'], current, stamp)
                actual = picking._qorlia_confirmation_signature(basis, effects, private_audit, state)
                if not hmac.compare_digest(actual, request['review_version']):
                    raise UserError('Native save changed unreviewed effects. Nothing was saved.')
                _request, _digest_value, _picking, _scope, _receipt, receipts, _marker = self._qorlia_inventory_saved_recovery(request)
                receipts[request['request_key']] = {'kind': _PURPOSE, 'hash': digest, 'author': self.env.uid,
                    'companies': self.env.companies.ids, 'state': state, 'references': references,
                    'changed_fields': current['changed_fields']}
                response = self._qorlia_inventory_saved_record(request, picking, receipts)
            return response
        except Exception:
            for name, (callbacks, functions, values) in hooks.items():
                setattr(cr, name, callbacks)
                callbacks.clear()
                for function in functions:
                    callbacks.add(function)
                callbacks.data.update(values)
            raise

    @api.model
    def qorlia_inventory_edit_save_stop(self, payload):
        self = self._qorlia_inventory_context()
        request, _digest_value, picking, _scope, receipt, _receipts, marker = self._qorlia_inventory_saved_recovery(payload)
        picking.check_access_rights('write')
        picking.check_access_rule('write')
        if receipt or marker:
            return self.qorlia_inventory_edit_save_status(request)
        picking._qorlia_inventory_saved_lock()
        request, digest, picking, _scope, receipt, receipts, marker = self._qorlia_inventory_saved_recovery(request)
        picking.check_access_rights('write')
        picking.check_access_rule('write')
        if receipt or marker:
            return self.qorlia_inventory_edit_save_status(request)
        cr = self.env.cr
        hooks = {name: (getattr(cr, name), list(getattr(cr, name)._funcs), copy.deepcopy(getattr(cr, name).data))
            for name in ('precommit', 'postcommit', 'prerollback', 'postrollback')}
        try:
            with cr.savepoint():
                receipts['stop:%s:%s' % (self.env.uid, request['request_key'])] = {'kind': _PURPOSE + '.stopped',
                    'hash': digest, 'author': self.env.uid, 'stopped_at': fields.Datetime.to_string(fields.Datetime.now())}
                response = self._qorlia_inventory_saved_record(request, picking, receipts)
            return response
        except Exception:
            for name, (callbacks, functions, values) in hooks.items():
                setattr(cr, name, callbacks)
                callbacks.clear()
                for function in functions:
                    callbacks.add(function)
                callbacks.data.update(values)
            raise
