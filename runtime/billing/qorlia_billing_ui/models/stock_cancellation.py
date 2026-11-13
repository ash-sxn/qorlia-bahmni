# SPDX-License-Identifier: LGPL-3.0-or-later
# Copyright 2026 Qorlia contributors.
import copy
import hmac
import uuid

from odoo import api, fields, models
from odoo.exceptions import AccessError, UserError, ValidationError

from .invoice_draft import _digest
from .stock_confirmation import AUDIT_MODELS, FINANCIAL_MODELS
from .stock_confirmation_paged import _effect_page, _effect_rows, _hash
from .stock_validation import VALIDATION_CONFIG, VALIDATION_MODELS, _RECEIPT_TOKEN
from .stock_validation_recovery import _page_parameters


_PURPOSE = 'qorlia.paged-cancellation.v1'
_ACTION = 'cancel_transfer'
_STATES = ('assigned', 'confirmed', 'draft', 'waiting')


class StockCancellation(models.Model):
    _inherit = 'stock.picking'

    def _qorlia_cancellation_access(self):
        self.ensure_one()
        if not self.env.user.has_group('base.group_user'):
            raise AccessError('Transfer cancellation requires an internal Billing account.')
        self.check_access_rights('write')
        self.check_access_rule('write')
        self.move_ids.check_access_rights('write')
        self.move_ids.check_access_rule('write')

    @api.model
    def qorlia_cancellation_paged_load(self, order_id, transfer_id):
        self = self._qorlia_operation_paged_context()
        self.env.invalidate_all()
        picking, order, scope = self._qorlia_confirmation_paged_transfer(order_id, transfer_id, inventory=True)
        reason = False
        try:
            picking._qorlia_cancellation_access()
        except AccessError as error:
            reason = str(error)
        if not reason and picking.state not in _STATES:
            reason = 'Cancel transfer is not available in the current native state.'
        self.env.cr.execute('SELECT (SELECT count(*) FROM stock_move WHERE picking_id = %s), '
            '(SELECT count(*) FROM stock_move_line WHERE picking_id = %s)', [picking.id, picking.id])
        moves, operations = self.env.cr.fetchone()
        transfer = dict(order._qorlia_delivery_header(picking), move_count=moves, operation_count=operations)
        stamp = picking._qorlia_confirmation_stamp(picking._qorlia_return_paged_tables())
        graph = {'purpose': _PURPOSE, 'scope': scope, 'transfer': transfer,
            'packages': _digest(picking._qorlia_reservation_package_graph())}
        return {'order_id': order.id, 'transfer_id': picking.id, 'transfer': transfer,
            'reason': reason, 'write_ready': not bool(reason),
            'version': picking._qorlia_confirmation_version(order.id, graph, stamp)}

    def _qorlia_cancellation_selection(self, data):
        if (not isinstance(data, dict) or set(data) != {'order_id', 'transfer_id', 'version', 'action'}
                or (data['order_id'] is not False and (type(data['order_id']) is not int or data['order_id'] <= 0))
                or type(data['transfer_id']) is not int or data['transfer_id'] <= 0
                or not _hash(data['version']) or data['action'] != _ACTION):
            raise ValidationError('Use the exact native transfer cancellation selection.')
        return dict(data)

    def _qorlia_cancellation_money(self):
        names = tuple(name for name in FINANCIAL_MODELS if name != 'sale.order') + ('account.full.reconcile',)
        tables = {self.env[name]._table for name in names}
        tables.update(field.relation for name in names for field in self.env[name]._fields.values()
            if field.type == 'many2many' and field.store and field.relation)
        result = self._qorlia_confirmation_stamp(sorted(tables), semantic=True)
        # Native cancellation recomputes delivery_status; no other order business field is exempt.
        self.env.cr.execute("SELECT encode(sha256(convert_to(COALESCE(string_agg(value, ',' ORDER BY value), ''), 'UTF8')), 'hex') "
            "FROM (SELECT (to_jsonb(record) - ARRAY['create_date','create_uid','write_date','write_uid','delivery_status'])::text value "
            "FROM sale_order record) fingerprint")
        result['sale_order'] = self.env.cr.fetchone()[0]
        return result

    def _qorlia_cancellation_native(self):
        self._track_prepare(self._fields)
        config_names = tuple(name for name in VALIDATION_CONFIG if name not in VALIDATION_MODELS)
        config_tables = {self.env[name]._table for name in config_names}
        config_tables.update(field.relation for name in config_names for field in self.env[name]._fields.values()
            if field.type == 'many2many' and field.store and field.relation)
        configuration = self._qorlia_confirmation_stamp(sorted(config_tables), semantic=True)
        money = self._qorlia_cancellation_money()
        before = self._qorlia_confirmation_capture(VALIDATION_MODELS)
        value = self.action_cancel()
        if value is not True:
            raise UserError('This native cancellation result requires an additional integration.')
        self.env.flush_all()
        self.env.cr.flush()
        after = self._qorlia_confirmation_capture(VALIDATION_MODELS)
        if configuration != self._qorlia_confirmation_stamp(sorted(config_tables), semantic=True):
            raise UserError('Cancellation changed unreviewed native configuration. Nothing was saved.')
        if money != self._qorlia_cancellation_money():
            raise UserError('Cancellation changed protected financial records. Nothing was saved.')
        physical = lambda snapshot: {identifier: (row['product_id'], row['location_id'], row['lot_id'],
            row['package_id'], row['owner_id'], row['quantity'])
            for identifier, row in snapshot[0]['stock.quant'].items() if row['quantity']}
        if physical(before) != physical(after):
            raise UserError('Cancellation changed physical stock. Nothing was saved.')
        effects, private = self._qorlia_confirmation_effects(before, after, VALIDATION_MODELS,
            private_models=AUDIT_MODELS | set(FINANCIAL_MODELS) | {'account.full.reconcile', 'account.analytic.line'},
            private_counts_key='private_effect_counts', private_analytic_deletions=True)
        references = {'new:%s:%s' % (name, index): {'model': name, 'id': identifier}
            for name in VALIDATION_MODELS if name not in AUDIT_MODELS
            for index, identifier in enumerate(sorted(set(after[0][name]) - set(before[0][name])))}
        return effects, private, self.state, references

    def _qorlia_cancellation_signature(self, data, native):
        return self._qorlia_confirmation_signature(_digest({'purpose': _PURPOSE, 'selection': data}),
            native[0], native[1], native[2])

    def _qorlia_cancellation_token(self, data, reviewed, position, purpose):
        return self._qorlia_confirmation_signature(_digest({'purpose': _PURPOSE + '.' + purpose, 'selection': data}),
            {'review_version': reviewed, 'position': position}, {}, False)

    def _qorlia_cancellation_preview(self, data):
        picking, _order, _scope = self._qorlia_confirmation_paged_transfer(data['order_id'], data['transfer_id'], inventory=True)
        picking._qorlia_cancellation_access()
        picking._qorlia_return_paged_lock()
        picking, _order, _scope = self._qorlia_confirmation_paged_transfer(data['order_id'], data['transfer_id'], lock=True, inventory=True)
        current = self.qorlia_cancellation_paged_load(data['order_id'], data['transfer_id'])
        if current['version'] != data['version']:
            raise UserError('The transfer, inventory or native configuration changed. Reload it.')
        if current['reason']:
            raise UserError(current['reason'])
        native = picking._qorlia_stock_preparation_preview(picking._qorlia_cancellation_native,
            picking._qorlia_return_paged_tables())
        return picking, native

    @api.model
    def qorlia_cancellation_paged_review(self, payload, after=0, review_version=False, continuation_token=False, limit=50):
        self = self._qorlia_operation_paged_context()
        data = self._qorlia_cancellation_selection(payload)
        if (type(after) is not int or after < 0 or type(limit) is not int or not 1 <= limit <= 100
                or after == 0 and (review_version is not False or continuation_token is not False)
                or after > 0 and (not _hash(review_version) or not _hash(continuation_token))):
            raise ValidationError('Review cancellation effects in order with their original proofs.')
        picking, native = self._qorlia_cancellation_preview(data)
        reviewed = picking._qorlia_cancellation_signature(data, native)
        rows = _effect_rows(native[0])
        if after > len(rows):
            raise ValidationError('The cursor is outside this cancellation review.')
        if after and (not hmac.compare_digest(reviewed, review_version) or not hmac.compare_digest(
                picking._qorlia_cancellation_token(data, reviewed, after, 'continue'), continuation_token)):
            raise UserError('Cancellation review changed or a page was skipped. Review it again from the start.')
        # shortcut: each page repeats the complete rollback review; measure hospital latency before release.
        end = min(after + limit, len(rows))
        more = end < len(rows)
        return {**data, 'review_version': reviewed, 'state_after': native[2], 'write_ready': True,
            'after': after, 'total_count': len(rows), 'next_after': end if more else False,
            'effects': _effect_page(native[0], rows[after:end], 'private_effect_counts'),
            'continuation_token': picking._qorlia_cancellation_token(data, reviewed, end, 'continue') if more else False,
            'review_complete_token': False if more else picking._qorlia_cancellation_token(data, reviewed, len(rows), 'complete')}

    def _qorlia_cancellation_request(self, payload):
        if (not isinstance(payload, dict) or set(payload) != {'order_id', 'transfer_id', 'version', 'action',
                'review_version', 'review_complete_token', 'request_key'}
                or not _hash(payload['review_version']) or not _hash(payload['review_complete_token'])):
            raise ValidationError('Use the exact completely reviewed transfer cancellation request.')
        data = self._qorlia_cancellation_selection({key: value for key, value in payload.items()
            if key not in ('review_version', 'review_complete_token', 'request_key')})
        try:
            if str(uuid.UUID(payload['request_key'])) != payload['request_key']:
                raise ValueError()
        except (ValueError, TypeError, AttributeError):
            raise ValidationError('Keep the original transfer cancellation request key.')
        request = dict(data, **{key: payload[key] for key in ('review_version', 'review_complete_token', 'request_key')})
        return request, _digest({'purpose': _PURPOSE, 'request': request,
            'author': self.env.uid, 'companies': self.env.companies.ids})

    def _qorlia_cancellation_recovery(self, payload):
        request, digest = self._qorlia_cancellation_request(payload)
        picking, order, scope = self._qorlia_confirmation_paged_transfer(request['order_id'], request['transfer_id'], inventory=True)
        receipt, receipts = picking._qorlia_validation_receipt(request, digest)
        marker = receipts.get('stop:%s:%s' % (self.env.uid, request['request_key']))
        if receipt and (receipt.get('kind') != _PURPOSE or receipt.get('companies') != self.env.companies.ids
                or receipt.get('order_id') != order.id):
            raise ValidationError('This identifier belongs to another stock protocol or scope.')
        if marker and (marker.get('kind') != _PURPOSE + '.stopped' or marker.get('hash') != digest
                or marker.get('author') != self.env.uid):
            raise ValidationError('This stopped identifier belongs to another cancellation request.')
        if receipt and marker:
            raise ValidationError('Conflicting cancellation outcomes. Keep the exact recovery request.')
        return request, digest, picking, order, scope, receipt, receipts, marker

    @api.model
    def qorlia_cancellation_paged_status(self, payload):
        self = self._qorlia_operation_paged_context()
        request, _digest_value, picking, order, scope, receipt, _receipts, marker = self._qorlia_cancellation_recovery(payload)
        self.env.cr.execute('SELECT (SELECT count(*) FROM stock_move WHERE picking_id = %s), '
            '(SELECT count(*) FROM stock_move_line WHERE picking_id = %s)', [picking.id, picking.id])
        moves, operations = self.env.cr.fetchone()
        return {'accepted': bool(receipt), 'stopped': bool(marker), 'request_key': request['request_key'],
            'state_after': receipt['state'] if receipt else False,
            'reference_count': len(receipt['references']) if receipt else 0,
            'current': {'order_id': order.id, 'transfer_id': picking.id, 'version': scope,
                'transfer': dict(order._qorlia_delivery_header(picking), move_count=moves, operation_count=operations)}}

    @api.model
    def qorlia_cancellation_paged_references(self, payload, after=0, version=False, limit=50):
        self = self._qorlia_operation_paged_context()
        _page_parameters(after, version, limit)
        request, digest, picking, _order, scope, receipt, _receipts, _marker = self._qorlia_cancellation_recovery(payload)
        if not receipt:
            raise UserError('Cancellation has not been accepted. Keep the exact request and check its status.')
        references = picking._qorlia_confirmation_reference_labels(receipt)
        current = _digest({'purpose': _PURPOSE + '.references', 'request': digest, 'scope': scope, 'references': references})
        if version is not False and not hmac.compare_digest(version, current):
            raise UserError('Cancellation references or their access changed. Reload all reference pages.')
        keys = sorted(references)
        if after > len(keys):
            raise ValidationError('The cursor is outside this accepted cancellation.')
        return {'request_key': request['request_key'], 'version': current, 'after': after,
            'total_count': len(keys), 'next_after': after + limit if after + limit < len(keys) else False,
            'rows': [{'key': key, **references[key]} for key in keys[after:after + limit]]}

    def _qorlia_cancellation_record(self, receipts, response):
        tables = self._qorlia_return_paged_tables()
        before = self._qorlia_paged_stop_stamp(tables, 'qorlia_validation_receipts')
        cr = self.env.cr
        hooks = {name: (list(getattr(cr, name)._funcs), copy.deepcopy(getattr(cr, name).data))
            for name in ('postcommit', 'prerollback', 'postrollback')}
        self.with_context(qorlia_validation_receipt_token=_RECEIPT_TOKEN)._qorlia_validation_record_receipt(copy.deepcopy(receipts))
        cr.flush()
        self.env.invalidate_all()
        result = response()
        cr.flush()
        self.env.invalidate_all()
        cr.execute('SELECT qorlia_validation_receipts FROM stock_picking WHERE id = %s', [self.id])
        if (cr.fetchone()[0] != receipts or self._qorlia_paged_stop_stamp(tables, 'qorlia_validation_receipts') != before
                or any(list(getattr(cr, name)._funcs) != functions or getattr(cr, name).data != values
                    for name, (functions, values) in hooks.items())):
            raise UserError('Recording cancellation recovery changed unreviewed state or deferred work. Nothing was saved.')
        return result

    def _qorlia_cancellation_execute(self, request, stop=False):
        request, _digest_value, picking, _order, _scope, receipt, _receipts, marker = self._qorlia_cancellation_recovery(request)
        if stop:
            picking._qorlia_cancellation_access()
        if receipt or marker:
            if marker and not stop:
                raise UserError('This exact cancellation request was stopped. Recover its stopped outcome.')
            return self.qorlia_cancellation_paged_status(request)
        picking._qorlia_cancellation_access()
        picking._qorlia_return_paged_lock()
        request, digest, picking, _order, _scope, receipt, receipts, marker = self._qorlia_cancellation_recovery(request)
        if receipt or marker:
            return self._qorlia_cancellation_execute(request, stop)
        data = {key: value for key, value in request.items() if key not in ('review_version', 'review_complete_token', 'request_key')}
        if not stop:
            picking, native = self._qorlia_cancellation_preview(data)
            reviewed = picking._qorlia_cancellation_signature(data, native)
            if (not hmac.compare_digest(reviewed, request['review_version']) or not hmac.compare_digest(
                    picking._qorlia_cancellation_token(data, reviewed, len(_effect_rows(native[0])), 'complete'),
                    request['review_complete_token'])):
                raise UserError('Complete the current native cancellation review before saving. Nothing was saved.')
        cr = self.env.cr
        hooks = {name: (getattr(cr, name), list(getattr(cr, name)._funcs), copy.deepcopy(getattr(cr, name).data))
            for name in ('precommit', 'postcommit', 'prerollback', 'postrollback')}
        try:
            with cr.savepoint():
                if stop:
                    receipts['stop:%s:%s' % (self.env.uid, request['request_key'])] = {'kind': _PURPOSE + '.stopped',
                        'hash': digest, 'author': self.env.uid, 'stopped_at': fields.Datetime.to_string(fields.Datetime.now())}
                else:
                    actual = picking._qorlia_cancellation_native()
                    if not hmac.compare_digest(picking._qorlia_cancellation_signature(data, actual), reviewed):
                        raise UserError('Native cancellation changed unreviewed effects. Nothing was saved.')
                    _receipt, receipts = picking._qorlia_validation_receipt(request, digest)
                    receipts[request['request_key']] = {'kind': _PURPOSE, 'hash': digest, 'author': self.env.uid,
                        'companies': self.env.companies.ids, 'order_id': request['order_id'],
                        'state': actual[2], 'references': actual[3]}
                return picking._qorlia_cancellation_record(receipts, lambda: self.qorlia_cancellation_paged_status(request))
        except Exception:
            for name, (callbacks, functions, values) in hooks.items():
                setattr(cr, name, callbacks)
                callbacks.clear()
                for function in functions:
                    callbacks.add(function)
                callbacks.data.update(values)
            raise

    @api.model
    def qorlia_cancellation_paged_save(self, payload):
        return self._qorlia_operation_paged_context()._qorlia_cancellation_execute(payload)

    @api.model
    def qorlia_cancellation_paged_stop(self, payload):
        return self._qorlia_operation_paged_context()._qorlia_cancellation_execute(payload, stop=True)
