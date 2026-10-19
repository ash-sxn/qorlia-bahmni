# SPDX-License-Identifier: LGPL-3.0-or-later
# Copyright 2026 Qorlia contributors.
import copy
import hmac

from psycopg2 import sql
from odoo import api, fields, models
from odoo.exceptions import AccessError, UserError, ValidationError

from .invoice_draft import _digest
from .stock_confirmation_paged import _hash, _effect_rows
from .stock_validation import _RECEIPT_TOKEN
from .stock_validation_paged import _PURPOSE
from .stock_validation_recovery import _page_parameters, _prompt_parts


class StockValidationPagedWrite(models.Model):
    _inherit = 'stock.picking'

    def _qorlia_validation_paged_request(self, payload):
        if (not isinstance(payload, dict) or set(payload) != {'order_id', 'transfer_id', 'version',
                'continuation_key', 'decisions', 'review_version', 'review_complete_token', 'request_key'}
                or not _hash(payload['review_complete_token'])):
            raise ValidationError('Use the exact completely reviewed validation request.')
        self._qorlia_step_request({key: value for key, value in payload.items() if key != 'review_complete_token'}, allow_inventory=True)
        request = copy.deepcopy(payload)
        return request, _digest({'purpose': _PURPOSE, 'request': request,
            'author': self.env.uid, 'companies': self.env.companies.ids})

    def _qorlia_validation_paged_receipt(self, request, digest):
        receipt, receipts = self._qorlia_validation_receipt(request, digest)
        marker = receipts.get('stop:%s:%s' % (self.env.uid, request['request_key']))
        if receipt and receipt.get('kind') != _PURPOSE:
            raise ValidationError('This identifier belongs to another validation protocol.')
        if marker and (marker.get('kind') != _PURPOSE + '.stopped'
                or marker.get('hash') != digest or marker.get('author') != self.env.uid):
            raise ValidationError('This stopped identifier belongs to another exact request.')
        if receipt and marker:
            raise ValidationError('Conflicting validation outcomes. Keep the exact recovery request.')
        return receipt, receipts, marker

    def _qorlia_validation_paged_recovery(self, payload):
        request, digest = self._qorlia_validation_paged_request(payload)
        picking, order, scope = self._qorlia_confirmation_paged_transfer(request['order_id'], request['transfer_id'], inventory=True)
        receipt, receipts, marker = picking._qorlia_validation_paged_receipt(request, digest)
        key, target = request['request_key'], receipt
        if marker:
            target = picking._qorlia_validation_paged_parent(request, receipts)
            key = request['continuation_key']
        return request, digest, picking, order, scope, receipt, receipts, marker, key, target

    def _qorlia_validation_paged_prompt(self, request, digest, key, receipts, scope):
        self._qorlia_validation_access()
        action = self._qorlia_validation_paged_action(dict(request, continuation_key=key), receipts)
        if action is None:
            raise UserError('There is no saved native prompt to read.')
        wizard, descriptor = self._qorlia_validation_wizard(action)
        if wizard.id != action['res_id']:
            raise UserError('The saved native prompt is unavailable. No prompt was recreated.')
        self._qorlia_validation_prompt_label_access(wizard, descriptor)
        metadata, rows = _prompt_parts(descriptor)
        version = _digest({'purpose': _PURPOSE + '.prompt', 'request': digest, 'receipt_key': key,
            'scope': scope, 'descriptor': metadata, 'rows': rows})
        return metadata, rows, version

    @api.model
    def qorlia_validation_paged_status(self, payload):
        self = self._qorlia_operation_paged_context()
        request, digest, picking, order, scope, receipt, receipts, marker, key, target = self._qorlia_validation_paged_recovery(payload)
        outcome = False
        if target:
            metadata, rows, version, reason = False, [], False, False
            if target.get('consumed_by'):
                reason = 'The saved prompt was already processed. Recover the later exact request if its outcome is unknown.'
            elif target['next_action']:
                try:
                    metadata, rows, version = picking._qorlia_validation_paged_prompt(request, digest, key, receipts, scope)
                except (AccessError, UserError):
                    reason = 'The saved native prompt is unavailable or no longer permitted. Keep the exact recovery request.'
            outcome = {'request_key': key, 'state_after': target['state'], 'reference_count': len(target['references']),
                'next_step': metadata, 'prompt_count': len(rows), 'prompt_version': version,
                'continuation_key': key if metadata else False, 'continuation_reason': reason,
                'terminal': not target['next_action']}
        self.env.cr.execute('SELECT (SELECT count(*) FROM stock_move WHERE picking_id = %s), '
            '(SELECT count(*) FROM stock_move_line WHERE picking_id = %s)', [picking.id, picking.id])
        moves, operations = self.env.cr.fetchone()
        return {'accepted': bool(receipt), 'stopped': bool(marker), 'request_key': request['request_key'], 'receipt': outcome,
            'current': {'order_id': order.id, 'transfer_id': picking.id, 'version': scope,
                'transfer': dict(order._qorlia_delivery_header(picking), move_count=moves, operation_count=operations)}}

    @api.model
    def qorlia_validation_paged_prompt_page(self, payload, after=0, version=False, limit=50):
        self = self._qorlia_operation_paged_context()
        _page_parameters(after, version, limit)
        request, digest, picking, _order, scope, _receipt, receipts, _marker, key, target = self._qorlia_validation_paged_recovery(payload)
        if not target:
            raise UserError('No accepted native action is recoverable. Keep the exact request and check its status.')
        metadata, rows, current = picking._qorlia_validation_paged_prompt(request, digest, key, receipts, scope)
        if version is not False and not hmac.compare_digest(version, current):
            raise UserError('The saved validation prompt or its access changed. Reload its pages.')
        if after > len(rows):
            raise ValidationError('The prompt cursor is outside this saved native action.')
        return {'request_key': request['request_key'], 'receipt_key': key, 'version': current, 'descriptor': metadata,
            'after': after, 'total_count': len(rows), 'next_after': after + limit if after + limit < len(rows) else False,
            'rows': rows[after:after + limit]}

    @api.model
    def qorlia_validation_paged_reference_page(self, payload, after=0, version=False, limit=50):
        self = self._qorlia_operation_paged_context()
        _page_parameters(after, version, limit)
        request, digest, picking, _order, scope, _receipt, _receipts, _marker, key, target = self._qorlia_validation_paged_recovery(payload)
        if not target:
            raise UserError('No accepted native action is recoverable. Keep the exact request and check its status.')
        references = picking._qorlia_confirmation_reference_labels(target)
        current = _digest({'purpose': _PURPOSE + '.references', 'request': digest, 'receipt_key': key,
            'source': target['hash'], 'scope': scope, 'references': references})
        if version is not False and not hmac.compare_digest(version, current):
            raise UserError('Validation references or their access changed. Reload their pages.')
        keys = sorted(references)
        if after > len(keys):
            raise ValidationError('The reference cursor is outside this saved native action.')
        return {'request_key': request['request_key'], 'receipt_key': key, 'version': current, 'after': after,
            'total_count': len(keys), 'next_after': after + limit if after + limit < len(keys) else False,
            'rows': [{'key': key, **references[key]} for key in keys[after:after + limit]]}

    def _qorlia_validation_paged_lock(self):
        self.env.cr.flush()
        for table in self._qorlia_validation_paged_tables():
            self.env.cr.execute(sql.SQL('LOCK TABLE {} IN SHARE ROW EXCLUSIVE MODE').format(sql.Identifier(table)))
        self.env.invalidate_all()

    @api.model
    def qorlia_validation_paged_save(self, payload):
        self = self._qorlia_operation_paged_context()
        request, digest = self._qorlia_validation_paged_request(payload)
        picking, _order, _scope = self._qorlia_confirmation_paged_transfer(request['order_id'], request['transfer_id'], inventory=True)
        receipt, _receipts, marker = picking._qorlia_validation_paged_receipt(request, digest)
        if receipt:
            return self.qorlia_validation_paged_status(request)
        if marker:
            raise UserError('This exact request was stopped. It cannot be applied. Recover its stopped outcome.')
        picking._qorlia_validation_paged_lock()
        picking, _order, _scope = self._qorlia_confirmation_paged_transfer(request['order_id'], request['transfer_id'], inventory=True)
        receipt, receipts, marker = picking._qorlia_validation_paged_receipt(request, digest)
        if receipt:
            return self.qorlia_validation_paged_status(request)
        if marker:
            raise UserError('This exact request was stopped. It cannot be applied. Recover its stopped outcome.')
        data = {key: value for key, value in request.items() if key not in ('review_version', 'review_complete_token', 'request_key')}
        picking, preview, input_prompt, reviewed = self._qorlia_validation_paged_preview(data)
        total = len(_effect_rows(preview[0])) + (len(_prompt_parts(input_prompt)[1]) if input_prompt else 0)
        if (not hmac.compare_digest(reviewed, request['review_version']) or not hmac.compare_digest(
                picking._qorlia_validation_paged_token(data, reviewed, total, 'complete'), request['review_complete_token'])):
            raise UserError('Complete the current native validation review before saving. Nothing was saved.')
        action, actual_input = picking._qorlia_validation_paged_input(data, receipts)
        cr = self.env.cr
        hooks = {name: (getattr(cr, name), list(getattr(cr, name)._funcs), copy.deepcopy(getattr(cr, name).data))
            for name in ('precommit', 'postcommit', 'prerollback', 'postrollback')}
        try:
            with cr.savepoint():
                actual = picking._qorlia_validation_paged_native(data, action)
                if not hmac.compare_digest(picking._qorlia_validation_paged_signature(data, actual, actual_input), reviewed):
                    raise UserError('Native validation changed unreviewed effects. Nothing was saved.')
                if request['continuation_key']:
                    receipts[request['continuation_key']]['consumed_by'] = request['request_key']
                receipts[request['request_key']] = {'kind': _PURPOSE, 'hash': digest, 'author': self.env.uid,
                    'companies': self.env.companies.ids, 'order_id': request['order_id'], 'state': actual[2],
                    'references': actual[4], 'next_action': actual[5]}
                picking.with_context(qorlia_validation_receipt_token=_RECEIPT_TOKEN)._qorlia_validation_record_receipt(receipts)
                cr.flush()
                self.env.invalidate_all()
                response = self.qorlia_validation_paged_status(request)
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
    def qorlia_validation_paged_stop(self, payload):
        self = self._qorlia_operation_paged_context()
        request, digest = self._qorlia_validation_paged_request(payload)
        picking, _order, _scope = self._qorlia_confirmation_paged_transfer(request['order_id'], request['transfer_id'], inventory=True)
        picking.check_access_rights('write')
        picking.check_access_rule('write')
        receipt, _receipts, marker = picking._qorlia_validation_paged_receipt(request, digest)
        if receipt or marker:
            return self.qorlia_validation_paged_status(request)
        picking._qorlia_validation_paged_lock()
        picking, _order, _scope = self._qorlia_confirmation_paged_transfer(request['order_id'], request['transfer_id'], inventory=True)
        picking.check_access_rights('write')
        picking.check_access_rule('write')
        receipt, receipts, marker = picking._qorlia_validation_paged_receipt(request, digest)
        if receipt or marker:
            return self.qorlia_validation_paged_status(request)
        picking._qorlia_validation_paged_parent(request, receipts)
        tables = picking._qorlia_validation_paged_tables()
        before = picking._qorlia_paged_stop_stamp(tables, 'qorlia_validation_receipts')
        receipts['stop:%s:%s' % (self.env.uid, request['request_key'])] = {'kind': _PURPOSE + '.stopped',
            'hash': digest, 'author': self.env.uid, 'stopped_at': fields.Datetime.to_string(fields.Datetime.now())}
        cr = self.env.cr
        hooks = {name: (getattr(cr, name), list(getattr(cr, name)._funcs), copy.deepcopy(getattr(cr, name).data))
            for name in ('precommit', 'postcommit', 'prerollback', 'postrollback')}
        try:
            with cr.savepoint():
                picking.with_context(qorlia_validation_receipt_token=_RECEIPT_TOKEN)._qorlia_validation_record_receipt(receipts)
                cr.flush()
                self.env.invalidate_all()
                response = self.qorlia_validation_paged_status(request)
                cr.flush()
                self.env.invalidate_all()
                self.env.cr.execute('SELECT qorlia_validation_receipts FROM stock_picking WHERE id = %s', [picking.id])
                if (self.env.cr.fetchone()[0] != receipts
                        or picking._qorlia_paged_stop_stamp(tables, 'qorlia_validation_receipts') != before
                        or any(list(getattr(cr, name)._funcs) != functions or getattr(cr, name).data != values
                            for name, (_callbacks, functions, values) in hooks.items() if name != 'precommit')):
                    raise UserError('Stopping validation changed unreviewed state or deferred work. Nothing was stopped.')
            return response
        except Exception:
            for name, (callbacks, functions, values) in hooks.items():
                setattr(cr, name, callbacks)
                callbacks.clear()
                for function in functions:
                    callbacks.add(function)
                callbacks.data.update(values)
            raise
