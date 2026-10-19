# SPDX-License-Identifier: LGPL-3.0-or-later
# Copyright 2026 Qorlia contributors.
import copy
import hmac
import uuid

from psycopg2 import sql
from odoo import api, fields, models
from odoo.exceptions import AccessError, UserError, ValidationError

from .invoice_draft import _digest
from .stock_confirmation_paged import _hash, _effect_rows
from .stock_return_paged import _PURPOSE
from .stock_validation import _RECEIPT_TOKEN
from .stock_validation_recovery import _page_parameters


class StockReturnPagedWrite(models.Model):
    _inherit = 'stock.picking'

    def _qorlia_return_paged_access(self):
        if not self.env.user.has_group('stock.group_stock_user'):
            raise AccessError('Creating or stopping returns requires the native Stock User role.')
        self.check_access_rights('write')
        self.check_access_rule('write')

    def _qorlia_return_paged_request(self, payload):
        if (not isinstance(payload, dict) or set(payload) != {'order_id', 'transfer_id', 'version',
                'location_id', 'lines', 'review_version', 'review_complete_token', 'request_key'}
                or not _hash(payload['review_version']) or not _hash(payload['review_complete_token'])):
            raise ValidationError('Use the exact completely reviewed native return request.')
        data = self._qorlia_return_paged_selection({key: value for key, value in payload.items()
            if key not in ('review_version', 'review_complete_token', 'request_key')})
        try:
            if str(uuid.UUID(payload['request_key'])) != payload['request_key']:
                raise ValueError()
        except (ValueError, TypeError, AttributeError):
            raise ValidationError('Keep the original native return request key.')
        request = dict(data, **{key: payload[key] for key in ('review_version', 'review_complete_token', 'request_key')})
        return request, _digest({'purpose': _PURPOSE, 'request': request,
            'author': self.env.uid, 'companies': self.env.companies.ids})

    def _qorlia_return_paged_receipt(self, request, digest):
        receipt, receipts = self._qorlia_validation_receipt(request, digest)
        marker = receipts.get('stop:%s:%s' % (self.env.uid, request['request_key']))
        if receipt and (receipt.get('kind') != _PURPOSE or receipt.get('companies') != self.env.companies.ids
                or receipt.get('order_id') != request['order_id']):
            raise ValidationError('This identifier belongs to another stock protocol or scope.')
        if marker and (marker.get('kind') != _PURPOSE + '.stopped' or marker.get('hash') != digest
                or marker.get('author') != self.env.uid):
            raise ValidationError('This stopped identifier belongs to another exact return request.')
        if receipt and marker:
            raise ValidationError('Conflicting return outcomes. Keep the exact recovery request.')
        return receipt, receipts, marker

    def _qorlia_return_paged_recovery(self, payload):
        request, digest = self._qorlia_return_paged_request(payload)
        picking, order, scope = self._qorlia_confirmation_paged_transfer(request['order_id'], request['transfer_id'])
        receipt, receipts, marker = picking._qorlia_return_paged_receipt(request, digest)
        return request, digest, picking, order, scope, receipt, receipts, marker

    @api.model
    def qorlia_return_paged_status(self, payload):
        self = self._qorlia_operation_paged_context()
        request, _digest_value, picking, order, scope, receipt, _receipts, marker = self._qorlia_return_paged_recovery(payload)
        returned = False
        if receipt:
            # Label only the one return reference here; remaining references have a bounded reader.
            key = next((key for key, row in receipt['references'].items()
                if row['model'] == 'stock.picking' and row['id'] == receipt['return_id']), None)
            if key is None:
                raise UserError('The saved return reference is incomplete. Keep the exact recovery request.')
            returned = picking._qorlia_confirmation_reference_labels({'references': {key: receipt['references'][key]}})[key]
        self.env.cr.execute('SELECT (SELECT count(*) FROM stock_move WHERE picking_id = %s), '
            '(SELECT count(*) FROM stock_move_line WHERE picking_id = %s)', [picking.id, picking.id])
        moves, operations = self.env.cr.fetchone()
        return {'accepted': bool(receipt), 'stopped': bool(marker), 'request_key': request['request_key'],
            'state_after': receipt['state'] if receipt else False, 'return_transfer': returned,
            'reference_count': len(receipt['references']) if receipt else 0,
            'current': {'order_id': order.id, 'transfer_id': picking.id, 'version': scope,
                'transfer': dict(order._qorlia_delivery_header(picking), move_count=moves, operation_count=operations)}}

    @api.model
    def qorlia_return_paged_references(self, payload, after=0, version=False, limit=50):
        self = self._qorlia_operation_paged_context()
        _page_parameters(after, version, limit)
        request, digest, picking, _order, scope, receipt, _receipts, _marker = self._qorlia_return_paged_recovery(payload)
        if not receipt:
            raise UserError('This return has not been accepted. Keep the exact request and check its status.')
        references = picking._qorlia_confirmation_reference_labels(receipt)
        current = _digest({'purpose': _PURPOSE + '.references', 'request': digest,
            'scope': scope, 'references': references})
        if version is not False and not hmac.compare_digest(version, current):
            raise UserError('Return references or their access changed. Reload all reference pages.')
        keys = sorted(references)
        if after > len(keys):
            raise ValidationError('The cursor is outside this accepted return.')
        return {'request_key': request['request_key'], 'version': current, 'after': after,
            'total_count': len(keys), 'next_after': after + limit if after + limit < len(keys) else False,
            'rows': [{'key': key, **references[key]} for key in keys[after:after + limit]]}

    def _qorlia_return_paged_lock(self):
        self.env.cr.flush()
        # shortcut: ordered coarse locks cover native stock/configuration phantoms; measure hospital concurrency.
        for table in self._qorlia_return_paged_tables():
            self.env.cr.execute(sql.SQL('LOCK TABLE {} IN SHARE ROW EXCLUSIVE MODE').format(sql.Identifier(table)))
        self.env.invalidate_all()

    @api.model
    def qorlia_return_paged_save(self, payload):
        self = self._qorlia_operation_paged_context()
        request, _digest_value, picking, _order, _scope, receipt, _receipts, marker = self._qorlia_return_paged_recovery(payload)
        if receipt:
            return self.qorlia_return_paged_status(request)
        if marker:
            raise UserError('This exact return request was stopped. Recover its stopped outcome.')
        picking._qorlia_return_paged_lock()
        request, digest, picking, _order, _scope, receipt, receipts, marker = self._qorlia_return_paged_recovery(request)
        if receipt:
            return self.qorlia_return_paged_status(request)
        if marker:
            raise UserError('This exact return request was stopped. Recover its stopped outcome.')
        picking._qorlia_return_paged_access()
        data = {key: value for key, value in request.items() if key not in ('review_version', 'review_complete_token', 'request_key')}
        picking, form, native = picking._qorlia_return_paged_preview(data)
        reviewed = picking._qorlia_return_paged_signature(data, form, native)
        total = len(form['lines']) + len(_effect_rows(native[0]))
        if (not hmac.compare_digest(reviewed, request['review_version']) or not hmac.compare_digest(
                picking._qorlia_return_paged_token(data, reviewed, total, 'complete'), request['review_complete_token'])):
            raise UserError('Complete the current native return review before saving. Nothing was saved.')
        cr = self.env.cr
        hooks = {name: (getattr(cr, name), list(getattr(cr, name)._funcs), copy.deepcopy(getattr(cr, name).data))
            for name in ('precommit', 'postcommit', 'prerollback', 'postrollback')}
        try:
            with cr.savepoint():
                edited = picking._qorlia_return_edited_form(data['location_id'], data['lines'], complete=True)
                actual_form = picking._qorlia_return_snapshot(edited)
                actual_form['lines'].sort(key=lambda row: row['move_id'])
                actual = picking._qorlia_return_paged_native(edited)
                if not hmac.compare_digest(picking._qorlia_return_paged_signature(data, actual_form, actual), reviewed):
                    raise UserError('Native return creation changed unreviewed effects. Nothing was saved.')
                _receipt, receipts, _marker = picking._qorlia_return_paged_receipt(request, digest)
                receipts[request['request_key']] = {'kind': _PURPOSE, 'hash': digest, 'author': self.env.uid,
                    'companies': self.env.companies.ids, 'order_id': request['order_id'],
                    'state': actual[2], 'return_id': actual[3], 'references': actual[4]}
                tables = picking._qorlia_return_paged_tables()
                metadata_before = picking._qorlia_paged_stop_stamp(tables, 'qorlia_validation_receipts')
                metadata_hooks = {name: (list(getattr(cr, name)._funcs), copy.deepcopy(getattr(cr, name).data))
                    for name in ('postcommit', 'prerollback', 'postrollback')}
                picking.with_context(qorlia_validation_receipt_token=_RECEIPT_TOKEN)._qorlia_validation_record_receipt(copy.deepcopy(receipts))
                cr.flush()
                self.env.invalidate_all()
                response = self.qorlia_return_paged_status(request)
                cr.flush()
                self.env.invalidate_all()
                self.env.cr.execute('SELECT qorlia_validation_receipts FROM stock_picking WHERE id = %s', [picking.id])
                if (self.env.cr.fetchone()[0] != receipts
                        or picking._qorlia_paged_stop_stamp(tables, 'qorlia_validation_receipts') != metadata_before
                        or any(list(getattr(cr, name)._funcs) != functions or getattr(cr, name).data != values
                            for name, (functions, values) in metadata_hooks.items())):
                    raise UserError('Recording the return changed unreviewed receipt state or deferred work. Nothing was saved.')
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
    def qorlia_return_paged_stop(self, payload):
        self = self._qorlia_operation_paged_context()
        request, _digest_value, picking, _order, _scope, receipt, _receipts, marker = self._qorlia_return_paged_recovery(payload)
        picking._qorlia_return_paged_access()
        if receipt or marker:
            return self.qorlia_return_paged_status(request)
        picking._qorlia_return_paged_lock()
        request, digest, picking, _order, _scope, receipt, receipts, marker = self._qorlia_return_paged_recovery(request)
        picking._qorlia_return_paged_access()
        if receipt or marker:
            return self.qorlia_return_paged_status(request)
        tables = picking._qorlia_return_paged_tables()
        before = picking._qorlia_paged_stop_stamp(tables, 'qorlia_validation_receipts')
        receipts['stop:%s:%s' % (self.env.uid, request['request_key'])] = {'kind': _PURPOSE + '.stopped',
            'hash': digest, 'author': self.env.uid, 'stopped_at': fields.Datetime.to_string(fields.Datetime.now())}
        cr = self.env.cr
        hooks = {name: (getattr(cr, name), list(getattr(cr, name)._funcs), copy.deepcopy(getattr(cr, name).data))
            for name in ('precommit', 'postcommit', 'prerollback', 'postrollback')}
        try:
            with cr.savepoint():
                # The protected receipt cannot be written through ordinary stock.picking.write().
                picking.with_context(qorlia_validation_receipt_token=_RECEIPT_TOKEN)._qorlia_validation_record_receipt(copy.deepcopy(receipts))
                cr.flush()
                self.env.invalidate_all()
                response = self.qorlia_return_paged_status(request)
                cr.flush()
                self.env.invalidate_all()
                self.env.cr.execute('SELECT qorlia_validation_receipts FROM stock_picking WHERE id = %s', [picking.id])
                if (self.env.cr.fetchone()[0] != receipts
                        or picking._qorlia_paged_stop_stamp(tables, 'qorlia_validation_receipts') != before
                        or any(list(getattr(cr, name)._funcs) != functions or getattr(cr, name).data != values
                            for name, (_callbacks, functions, values) in hooks.items() if name != 'precommit')):
                    raise UserError('Stopping this return changed unreviewed state or deferred work. Nothing was stopped.')
            return response
        except Exception:
            for name, (callbacks, functions, values) in hooks.items():
                setattr(cr, name, callbacks)
                callbacks.clear()
                for function in functions:
                    callbacks.add(function)
                callbacks.data.update(values)
            raise
