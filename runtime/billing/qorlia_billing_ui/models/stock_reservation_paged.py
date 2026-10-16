# SPDX-License-Identifier: LGPL-3.0-or-later
# Copyright 2026 Qorlia contributors.
import copy
import hmac

from psycopg2 import sql
from odoo import api, models
from odoo.exceptions import UserError, ValidationError

from .invoice_draft import _digest
from .stock_confirmation_paged import _hash, _effect_rows, _effect_page
from .stock_operation_paged import _FINANCE, _CONFIG
from .stock_reservation import _ACTIONS, _RECEIPT_TOKEN


_PURPOSE = 'qorlia.paged-reservation.v1'


class StockReservationPaged(models.Model):
    _inherit = 'stock.picking'

    @api.model
    def qorlia_reservation_paged_load(self, order_id, transfer_id):
        self = self._qorlia_operation_paged_context()
        picking, order, scope = self._qorlia_confirmation_paged_transfer(order_id, transfer_id)
        configuration = {}
        reason = False
        try:
            configuration = picking._qorlia_reservation_scope(complete=True)
        except UserError as error:
            reason = str(error)
        reasons = picking._qorlia_reservation_reasons(reason)
        packages = picking._qorlia_reservation_package_graph()
        self.env.cr.execute('SELECT (SELECT count(*) FROM stock_move WHERE picking_id = %s), '
            '(SELECT count(*) FROM stock_move_line WHERE picking_id = %s)', [picking.id, picking.id])
        moves, operations = self.env.cr.fetchone()
        transfer = dict(order._qorlia_delivery_header(picking), move_count=moves, operation_count=operations)
        graph = {'purpose': _PURPOSE, 'scope': scope, 'transfer': transfer,
            'packages': _digest(packages), 'configuration': configuration, 'reasons': reasons}
        stamp = picking._qorlia_confirmation_stamp(picking._qorlia_operation_paged_tables())
        return {'order_id': order.id, 'transfer_id': picking.id, 'transfer': transfer,
            'package_count': len(packages), 'reasons': reasons, 'write_ready': not bool(reason),
            'version': picking._qorlia_confirmation_version(order.id, graph, stamp)}

    def _qorlia_reservation_paged_selection(self, payload):
        if (not isinstance(payload, dict) or set(payload) != {'order_id', 'transfer_id', 'version', 'action'}
                or any(type(payload[name]) is not int or payload[name] <= 0 for name in ('order_id', 'transfer_id'))
                or not _hash(payload['version']) or not isinstance(payload['action'], str) or payload['action'] not in _ACTIONS):
            raise ValidationError('Use an exact native reservation selection and action.')
        return dict(payload)

    def _qorlia_reservation_paged_native(self, action):
        self._qorlia_reservation_write_access(action)
        return self._qorlia_stock_preparation_native(
            lambda: self._qorlia_reservation_apply(action), _FINANCE, _CONFIG)[:4]

    def _qorlia_reservation_paged_preview(self, data):
        picking, _order, _scope = self._qorlia_confirmation_paged_transfer(
            data['order_id'], data['transfer_id'], lock=True)
        picking._qorlia_reservation_write_access(data['action'])
        picking._qorlia_reservation_scope(lock=True, complete=True)
        current = self.qorlia_reservation_paged_load(data['order_id'], data['transfer_id'])
        if current['version'] != data['version']:
            raise UserError('The transfer, inventory or native configuration changed. Reload and review it.')
        if current['reasons'][data['action']]:
            raise UserError(current['reasons'][data['action']])
        native = picking._qorlia_stock_preparation_preview(
            lambda: picking._qorlia_reservation_paged_native(data['action']), picking._qorlia_operation_paged_tables())
        return picking, native, picking._qorlia_reservation_paged_signature(data, native)

    def _qorlia_reservation_paged_signature(self, data, native):
        return self._qorlia_confirmation_signature(_digest({'purpose': _PURPOSE, 'request': data}),
            native[0], native[1], native[2])

    def _qorlia_reservation_paged_token(self, data, review, position, purpose):
        return self._qorlia_confirmation_signature(_digest({'purpose': _PURPOSE + '.' + purpose, 'request': data}),
            {'review_version': review, 'position': position}, {}, False)

    @api.model
    def qorlia_reservation_paged_review(self, payload, after=0, review_version=False, continuation_token=False, limit=50):
        self = self._qorlia_operation_paged_context()
        data = self._qorlia_reservation_paged_selection(payload)
        if (type(after) is not int or after < 0 or type(limit) is not int or not 1 <= limit <= 100
                or (after == 0 and (review_version is not False or continuation_token is not False))
                or (after > 0 and (not _hash(review_version) or not _hash(continuation_token)))):
            raise ValidationError('Review bounded reservation pages in order with their original tokens.')
        picking, native, reviewed = self._qorlia_reservation_paged_preview(data)
        rows = _effect_rows(native[0])
        if after > len(rows):
            raise ValidationError('The reservation cursor is outside this review.')
        if after and (not hmac.compare_digest(reviewed, review_version) or not hmac.compare_digest(
                picking._qorlia_reservation_paged_token(data, reviewed, after, 'continue'), continuation_token)):
            raise UserError('Reservation review changed or a page was skipped. Review it again from the start.')
        # shortcut: pages repeat a complete rollback preview; measure load before hospital release.
        end = min(after + limit, len(rows))
        more = end < len(rows)
        return {**data, 'review_version': reviewed, 'state_after': native[2], 'write_ready': True,
            'after': after, 'total_count': len(rows), 'next_after': end if more else False,
            'effects': _effect_page(native[0], rows[after:end]),
            'continuation_token': picking._qorlia_reservation_paged_token(data, reviewed, end, 'continue') if more else False,
            'review_complete_token': False if more else picking._qorlia_reservation_paged_token(data, reviewed, len(rows), 'complete')}

    def _qorlia_reservation_paged_request(self, payload):
        if (not isinstance(payload, dict) or set(payload) != {'order_id', 'transfer_id', 'version', 'action',
                'review_version', 'review_complete_token', 'request_key'} or not _hash(payload['review_complete_token'])):
            raise ValidationError('Use the exact completely reviewed reservation request.')
        self._qorlia_reservation_request(**{name: value for name, value in payload.items() if name != 'review_complete_token'})
        return dict(payload), _digest({'purpose': _PURPOSE, 'request': payload,
            'author': self.env.uid, 'companies': self.env.companies.ids})

    def _qorlia_reservation_paged_receipt(self, request, digest):
        receipt = self._qorlia_reservation_receipt(request['request_key'], digest)
        if receipt and receipt.get('kind') != _PURPOSE:
            raise ValidationError('This identifier belongs to another reservation request.')
        return receipt

    @api.model
    def qorlia_reservation_paged_status(self, payload):
        self = self._qorlia_operation_paged_context()
        request, digest = self._qorlia_reservation_paged_request(payload)
        picking, order, scope = self.env['sale.order']._qorlia_delivery_transfer_scope(request['order_id'], request['transfer_id'])
        receipt = picking._qorlia_reservation_paged_receipt(request, digest)
        self.env.cr.execute('SELECT (SELECT count(*) FROM stock_move WHERE picking_id = %s), '
            '(SELECT count(*) FROM stock_move_line WHERE picking_id = %s)', [picking.id, picking.id])
        moves, operations = self.env.cr.fetchone()
        return {'accepted': bool(receipt), 'request_key': request['request_key'], 'action': request['action'],
            'state_after': receipt['state'] if receipt else False, 'reference_count': len(receipt['references']) if receipt else 0,
            'current': {'order_id': order.id, 'transfer_id': picking.id, 'version': scope,
                'transfer': dict(order._qorlia_delivery_header(picking), move_count=moves, operation_count=operations)}}

    @api.model
    def qorlia_reservation_paged_references(self, payload, after=0, version=False, limit=50):
        self = self._qorlia_operation_paged_context()
        if (type(after) is not int or after < 0 or type(limit) is not int or not 1 <= limit <= 100
                or not (version is False or _hash(version)) or after and version is False):
            raise ValidationError('Use a bounded reservation reference page and its original version.')
        request, digest = self._qorlia_reservation_paged_request(payload)
        picking, _order, scope = self.env['sale.order']._qorlia_delivery_transfer_scope(request['order_id'], request['transfer_id'])
        receipt = picking._qorlia_reservation_paged_receipt(request, digest)
        if not receipt:
            raise UserError('This reservation action has not been accepted. Check its original request status.')
        references = picking._qorlia_confirmation_reference_labels(receipt)
        current = _digest({'purpose': _PURPOSE + '.references', 'receipt': digest, 'scope': scope, 'references': references})
        if version is not False and not hmac.compare_digest(version, current):
            raise UserError('Reservation references or their access changed. Reload the reference pages.')
        if after > len(references):
            raise ValidationError('The reference cursor is outside this reservation action.')
        keys = sorted(references)
        return {'request_key': request['request_key'], 'version': current, 'after': after,
            'total_count': len(keys), 'next_after': after + limit if after + limit < len(keys) else False,
            'rows': [{'key': key, **references[key]} for key in keys[after:after + limit]]}

    @api.model
    def qorlia_reservation_paged_save(self, payload):
        self = self._qorlia_operation_paged_context()
        request, digest = self._qorlia_reservation_paged_request(payload)
        picking, _order, _scope = self._qorlia_confirmation_paged_transfer(request['order_id'], request['transfer_id'])
        if picking._qorlia_reservation_paged_receipt(request, digest):
            return self.qorlia_reservation_paged_status(request)
        self.env.cr.flush()
        for table in picking._qorlia_operation_paged_tables():
            self.env.cr.execute(sql.SQL('LOCK TABLE {} IN SHARE ROW EXCLUSIVE MODE').format(sql.Identifier(table)))
        self.env.invalidate_all()
        picking, _order, _scope = self._qorlia_confirmation_paged_transfer(request['order_id'], request['transfer_id'])
        if picking._qorlia_reservation_paged_receipt(request, digest):
            return self.qorlia_reservation_paged_status(request)
        data = {key: value for key, value in request.items() if key not in ('review_version', 'review_complete_token', 'request_key')}
        picking, native, reviewed = self._qorlia_reservation_paged_preview(data)
        if (not hmac.compare_digest(reviewed, request['review_version']) or not hmac.compare_digest(
                picking._qorlia_reservation_paged_token(data, reviewed, len(_effect_rows(native[0])), 'complete'), request['review_complete_token'])):
            raise UserError('Complete the current reservation review before saving. Nothing was saved.')
        cr = self.env.cr
        hooks = {name: (getattr(cr, name), list(getattr(cr, name)._funcs), copy.deepcopy(getattr(cr, name).data))
            for name in ('precommit', 'postcommit', 'prerollback', 'postrollback')}
        try:
            with cr.savepoint():
                actual = picking._qorlia_reservation_paged_native(request['action'])
                if not hmac.compare_digest(picking._qorlia_reservation_paged_signature(data, actual), reviewed):
                    raise UserError('Native reservation changed unreviewed effects. Nothing was saved.')
                receipts = dict(picking.qorlia_reservation_receipts or {})
                receipts[request['request_key']] = {'kind': _PURPOSE, 'hash': digest, 'author': self.env.uid,
                    'state': actual[2], 'references': actual[3]}
                picking.with_context(qorlia_reservation_receipt_token=_RECEIPT_TOKEN).write({'qorlia_reservation_receipts': receipts})
                cr.flush()
                self.env.invalidate_all()
                response = self.qorlia_reservation_paged_status(request)
            return response
        except Exception:
            for name, (callbacks, functions, data) in hooks.items():
                setattr(cr, name, callbacks)
                callbacks.clear()
                for function in functions:
                    callbacks.add(function)
                callbacks.data.update(data)
            raise
