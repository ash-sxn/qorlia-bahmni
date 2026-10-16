# SPDX-License-Identifier: LGPL-3.0-or-later
# Copyright 2026 Qorlia contributors.
import copy
import hmac

from psycopg2 import sql
from odoo import api, models
from odoo.exceptions import AccessError, UserError, ValidationError

from .invoice_draft import _digest
from .stock_confirmation import FINANCIAL_MODELS
from .stock_confirmation_paged import _hash, _effect_rows, _effect_page
from .stock_operation_edit import _RECEIPT_TOKEN
from .stock_validation import VALIDATION_CONFIG


_PURPOSE = 'qorlia.paged-operation.v1'
_FINANCE = (*FINANCIAL_MODELS, 'account.full.reconcile', 'account.analytic.line',
    'account.bank.statement', 'account.bank.statement.line')
_CONFIG = (*VALIDATION_CONFIG, 'price.markup.table')


class StockOperationPaged(models.Model):
    _inherit = 'stock.picking'

    def _qorlia_operation_paged_context(self):
        if not self.env.user.has_group('stock.group_stock_user'):
            raise AccessError('Stock operation review and recovery require the native Stock User role.')
        return self._qorlia_confirmation_context()

    def _qorlia_operation_paged_tables(self):
        tables = set(self._qorlia_confirmation_tables())
        for name in (*_FINANCE, *_CONFIG):
            model = self.env[name]
            tables.add(model._table)
            tables.update(field.relation for field in model._fields.values()
                if field.type == 'many2many' and field.store and field.relation)
        return sorted(tables)

    def _qorlia_operation_paged_ready(self, view):
        source = self._qorlia_operation_source(**{key: view[key]
            for key in ('order_id', 'transfer_id', 'move_id', 'operation_id')})
        picking, move, line, model, identity, _values, groups, version = source
        if version != view['version']:
            raise UserError('The stock form changed. Reload it before continuing.')
        form = model.new({**identity, **view['values']}, origin=line if line else None)
        rules, reason = self._qorlia_operation_rules(picking, move, line, form, groups, model.env.context)
        return dict(view, rules=rules, reason=reason, write_ready=not bool(reason),
            can_delete=self._qorlia_operation_can_delete(picking, move, line))

    @api.model
    def qorlia_operation_paged_load(self, order_id, transfer_id, move_id, operation_id=False):
        self = self._qorlia_operation_paged_context()
        return self._qorlia_operation_paged_ready(self.qorlia_operation_load(
            order_id, transfer_id, move_id, operation_id))

    @api.model
    def qorlia_operation_paged_onchange(self, order_id, transfer_id, move_id, version, edits, operation_id=False):
        self = self._qorlia_operation_paged_context()
        return self._qorlia_operation_paged_ready(self.qorlia_operation_onchange(
            order_id, transfer_id, move_id, version, edits, operation_id))

    def _qorlia_operation_paged_native(self, source, form, action):
        result = self._qorlia_stock_preparation_native(
            lambda: self._qorlia_operation_apply(source, form, action), _FINANCE, _CONFIG)
        effects, private_audit, state, references, identifier = result
        picking, move, line, *_rest = source
        if action == 'delete':
            if identifier is not False or line.exists():
                raise UserError('Native removal did not remove the selected operation. Nothing was saved.')
            key = False
        else:
            record = self.env['stock.move.line'].browse(identifier).exists() if type(identifier) is int else self.env['stock.move.line']
            if (not record or record.picking_id != picking or record.move_id != move
                    or line and record != line):
                raise UserError('Native save returned another operation. Nothing was saved.')
            record.check_access_rights('read')
            record.check_access_rule('read')
            key = line.id if line else next((key for key, ref in references.items()
                if ref == {'model': 'stock.move.line', 'id': identifier}), None)
            if key is None:
                raise UserError('The created operation is missing from native effects. Nothing was saved.')
        return effects, private_audit, state, references, identifier, key

    def _qorlia_operation_paged_preview(self, data):
        picking, _order, _scope = self._qorlia_confirmation_paged_transfer(
            data['order_id'], data['transfer_id'], lock=True)
        picking._qorlia_reservation_scope(lock=True)
        selection = {key: data[key] for key in ('order_id', 'transfer_id', 'move_id', 'operation_id')}
        form = self.qorlia_operation_paged_onchange(**selection, version=data['version'], edits=data['edits'])
        self._qorlia_operation_selected(form, lock=True)
        self.env.invalidate_all()
        form = self.qorlia_operation_paged_onchange(**selection, version=data['version'], edits=data['edits'])
        source = self._qorlia_operation_source(**selection)
        related = self._qorlia_operation_selected(form)
        tables = self._qorlia_operation_paged_tables()
        basis = _digest({'purpose': _PURPOSE, 'request': data, 'form': form, 'related': related,
            'stamp': self._qorlia_confirmation_stamp(tables), 'companies': self.env.companies.ids})
        native = picking._qorlia_stock_preparation_preview(
            lambda: picking._qorlia_operation_paged_native(source, form, data['action']), tables)
        return picking, source, form, basis, native

    def _qorlia_operation_paged_signature(self, basis, native):
        effects, private_audit, state, _references, _identifier, key = native
        return self._qorlia_confirmation_signature(basis, effects, private_audit,
            {'state': state, 'operation_key': key})

    def _qorlia_operation_paged_token(self, data, review, position, purpose):
        return self._qorlia_confirmation_signature(_digest({'purpose': _PURPOSE + '.' + purpose, 'request': data}),
            {'review_version': review, 'position': position}, {}, False)

    @api.model
    def qorlia_operation_paged_review(self, payload, after=0, review_version=False, continuation_token=False, limit=50):
        self = self._qorlia_operation_paged_context()
        data = self._qorlia_operation_request(payload)
        if (type(after) is not int or after < 0 or type(limit) is not int or not 1 <= limit <= 100
                or (after == 0 and (review_version is not False or continuation_token is not False))
                or (after > 0 and (not _hash(review_version) or not _hash(continuation_token)))):
            raise ValidationError('Review bounded operation pages in order with their original tokens.')
        picking, _source, form, basis, native = self._qorlia_operation_paged_preview(data)
        reviewed = picking._qorlia_operation_paged_signature(basis, native)
        rows = _effect_rows(native[0])
        if after > len(rows):
            raise ValidationError('The operation cursor is outside this review.')
        if after and (not hmac.compare_digest(reviewed, review_version) or not hmac.compare_digest(
                picking._qorlia_operation_paged_token(data, reviewed, after, 'continue'), continuation_token)):
            raise UserError('Operation review changed or a page was skipped. Review it again from the start.')
        # shortcut: pages repeat complete rollback previews; measure realistic load before hospital release.
        end = min(after + limit, len(rows))
        more = end < len(rows)
        return {**data, 'form': form, 'review_version': reviewed, 'state_after': native[2],
            'operation_key': native[5], 'write_ready': True, 'after': after, 'total_count': len(rows),
            'next_after': end if more else False, 'effects': _effect_page(native[0], rows[after:end]),
            'continuation_token': picking._qorlia_operation_paged_token(data, reviewed, end, 'continue') if more else False,
            'review_complete_token': False if more else picking._qorlia_operation_paged_token(data, reviewed, len(rows), 'complete')}

    def _qorlia_operation_paged_request(self, payload):
        if not isinstance(payload, dict) or 'review_complete_token' not in payload or not _hash(payload['review_complete_token']):
            raise ValidationError('Complete every operation review page before saving.')
        data = self._qorlia_operation_request({key: value for key, value in payload.items()
            if key != 'review_complete_token'}, receipt=True)
        data['review_complete_token'] = payload['review_complete_token']
        return data, _digest({'purpose': _PURPOSE, 'request': data,
            'author': self.env.uid, 'companies': self.env.companies.ids})

    def _qorlia_operation_paged_receipt(self, request, digest):
        receipt = self._qorlia_operation_receipt(request['request_key'], digest)
        if receipt and receipt.get('kind') != _PURPOSE:
            raise ValidationError('This identifier belongs to another stock operation request.')
        return receipt

    @api.model
    def qorlia_operation_paged_status(self, payload):
        self = self._qorlia_operation_paged_context()
        request, digest = self._qorlia_operation_paged_request(payload)
        picking, order, scope = self.env['sale.order']._qorlia_delivery_transfer_scope(
            request['order_id'], request['transfer_id'])
        receipt = picking._qorlia_operation_paged_receipt(request, digest)
        self.env.cr.execute('SELECT (SELECT count(*) FROM stock_move WHERE picking_id = %s), '
            '(SELECT count(*) FROM stock_move_line WHERE picking_id = %s)', [picking.id, picking.id])
        moves, operations = self.env.cr.fetchone()
        return {'accepted': bool(receipt), 'request_key': request['request_key'], 'action': request['action'],
            'operation_id': receipt['operation_id'] if receipt else False, 'state_after': receipt['state'] if receipt else False,
            'reference_count': len(receipt['references']) if receipt else 0,
            'current': {'order_id': order.id, 'transfer_id': picking.id, 'version': scope,
                'transfer': dict(order._qorlia_delivery_header(picking), move_count=moves, operation_count=operations)}}

    @api.model
    def qorlia_operation_paged_references(self, payload, after=0, version=False, limit=50):
        self = self._qorlia_operation_paged_context()
        if (type(after) is not int or after < 0 or type(limit) is not int or not 1 <= limit <= 100
                or not (version is False or _hash(version)) or after and version is False):
            raise ValidationError('Use a bounded operation reference page and its original version.')
        request, digest = self._qorlia_operation_paged_request(payload)
        picking, _order, scope = self.env['sale.order']._qorlia_delivery_transfer_scope(
            request['order_id'], request['transfer_id'])
        receipt = picking._qorlia_operation_paged_receipt(request, digest)
        if not receipt:
            raise UserError('This operation has not been accepted. Check the original request status.')
        references = picking._qorlia_confirmation_reference_labels(receipt)
        current = _digest({'purpose': _PURPOSE + '.references', 'receipt': digest, 'scope': scope, 'references': references})
        if version is not False and not hmac.compare_digest(version, current):
            raise UserError('Operation references or their access changed. Reload the reference pages.')
        if after > len(references):
            raise ValidationError('The reference cursor is outside this operation.')
        keys = sorted(references)
        return {'request_key': request['request_key'], 'version': current, 'after': after,
            'total_count': len(keys), 'next_after': after + limit if after + limit < len(keys) else False,
            'rows': [{'key': key, **references[key]} for key in keys[after:after + limit]]}

    @api.model
    def qorlia_operation_paged_save(self, payload):
        self = self._qorlia_operation_paged_context()
        request, digest = self._qorlia_operation_paged_request(payload)
        picking, _order, _scope = self.env['sale.order']._qorlia_delivery_transfer_scope(
            request['order_id'], request['transfer_id'])
        if picking._qorlia_operation_paged_receipt(request, digest):
            return self.qorlia_operation_paged_status(request)
        self.env.cr.flush()
        for table in picking._qorlia_operation_paged_tables():
            self.env.cr.execute(sql.SQL('LOCK TABLE {} IN SHARE ROW EXCLUSIVE MODE').format(sql.Identifier(table)))
        self.env.invalidate_all()
        picking, _order, _scope = self.env['sale.order']._qorlia_delivery_transfer_scope(
            request['order_id'], request['transfer_id'])
        if picking._qorlia_operation_paged_receipt(request, digest):
            return self.qorlia_operation_paged_status(request)
        data = {key: value for key, value in request.items()
            if key not in ('review_version', 'review_complete_token', 'request_key')}
        picking, source, form, basis, native = self._qorlia_operation_paged_preview(data)
        reviewed = picking._qorlia_operation_paged_signature(basis, native)
        if (not hmac.compare_digest(reviewed, request['review_version']) or not hmac.compare_digest(
                picking._qorlia_operation_paged_token(data, reviewed, len(_effect_rows(native[0])), 'complete'),
                request['review_complete_token'])):
            raise UserError('Complete the current operation review before saving. Nothing was saved.')
        cr = self.env.cr
        hooks = {name: (getattr(cr, name), list(getattr(cr, name)._funcs), copy.deepcopy(getattr(cr, name).data))
            for name in ('precommit', 'postcommit', 'prerollback', 'postrollback')}
        try:
            with cr.savepoint():
                actual = picking._qorlia_operation_paged_native(source, form, request['action'])
                if not hmac.compare_digest(picking._qorlia_operation_paged_signature(basis, actual), reviewed):
                    raise UserError('Native operation changed unreviewed effects. Nothing was saved.')
                receipts = dict(picking.qorlia_operation_receipts or {})
                receipts[request['request_key']] = {'kind': _PURPOSE, 'hash': digest, 'author': self.env.uid,
                    'operation_id': actual[4], 'state': actual[2], 'references': actual[3]}
                picking.with_context(qorlia_operation_receipt_token=_RECEIPT_TOKEN).write({'qorlia_operation_receipts': receipts})
                cr.flush()
                self.env.invalidate_all()
                response = self.qorlia_operation_paged_status(request)
            return response
        except Exception:
            for name, (callbacks, functions, data) in hooks.items():
                setattr(cr, name, callbacks)
                callbacks.clear()
                for function in functions:
                    callbacks.add(function)
                callbacks.data.update(data)
            raise
