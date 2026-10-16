# SPDX-License-Identifier: LGPL-3.0-or-later
# Copyright 2026 Qorlia contributors.
import copy
import hmac

from psycopg2 import sql
from odoo import api, fields, models
from odoo.exceptions import AccessError, UserError, ValidationError

from .invoice_draft import _digest
from .stock_confirmation import _RECEIPT_TOKEN


_KINDS = ('created', 'updated', 'deleted')
_PURPOSE = 'qorlia.paged-confirmation.v1'


def _hash(value):
    return isinstance(value, str) and len(value) == 64 and all(char in '0123456789abcdef' for char in value)


def _effect_rows(effects):
    return [(model, kind, row) for model in sorted(effects['schema']) for kind in _KINDS
        for row in effects[kind][model]]


def _effect_page(effects, rows):
    """Keep every native value of the selected records, without unrelated labels."""
    page = {kind: {} for kind in _KINDS}
    page.update(labels={}, schema={}, private_audit_counts=effects['private_audit_counts'])
    for model, kind, row in rows:
        if model not in page['schema']:
            page['schema'][model] = effects['schema'][model]
            for collection in _KINDS:
                page[collection][model] = []
        page[kind][model].append(row)
        for values in ([row['before'], row['after']] if kind == 'updated' else [row['values']]):
            for field, value in values.items():
                metadata = effects['schema'][model][field]
                ids = value if metadata['type'] == 'many2many' else [value] if metadata['type'] == 'many2one' else []
                for identifier in ids:
                    key = '%s:%s' % (metadata['relation'], identifier)
                    if key in effects['labels']:
                        page['labels'][key] = effects['labels'][key]
    return page


class StockConfirmationPaged(models.Model):
    _inherit = 'stock.picking'

    def _qorlia_confirmation_context(self):
        scoped = self.with_context({key: self.env.context[key] for key in ('allowed_company_ids', 'lang', 'tz')
            if key in self.env.context})
        # Drain the caller's earlier native audit work before pinning a review version.
        scoped.env.cr.flush()
        return scoped

    def _qorlia_confirmation_paged_transfer(self, order_id, transfer_id, lock=False):
        picking, order, version = self.env['sale.order']._qorlia_delivery_transfer_scope(order_id, transfer_id)
        if lock:
            self.env.cr.execute('SELECT id FROM res_company WHERE id = %s FOR UPDATE', [picking.company_id.id])
            self.env.cr.execute('SELECT id FROM stock_picking WHERE id = %s FOR UPDATE', [picking.id])
            self.env.invalidate_all()
            return self._qorlia_confirmation_paged_transfer(order_id, transfer_id)
        return picking, order, version

    @api.model
    def qorlia_confirmation_paged_load(self, order_id, transfer_id):
        self = self._qorlia_confirmation_context()
        picking, order, scope = self._qorlia_confirmation_paged_transfer(order_id, transfer_id)
        packages = picking._qorlia_reservation_package_graph()
        picking.check_field_access_rights('read', ['show_mark_as_todo'])
        self.env.cr.execute('SELECT (SELECT count(*) FROM stock_move WHERE picking_id = %s), '
            '(SELECT count(*) FROM stock_move_line WHERE picking_id = %s)', [picking.id, picking.id])
        moves, operations = self.env.cr.fetchone()
        transfer = dict(order._qorlia_delivery_header(picking), move_count=moves, operation_count=operations)
        reason = False
        try:
            picking._qorlia_confirmation_access()
        except AccessError as error:
            reason = str(error)
        if not reason and not picking.show_mark_as_todo:
            reason = 'Mark as Todo is not available in the current native transfer state.'
        graph = {'purpose': _PURPOSE, 'scope': scope, 'transfer': transfer, 'packages': _digest(packages)}
        stamp = picking._qorlia_confirmation_stamp(picking._qorlia_confirmation_tables())
        return {'order_id': order.id, 'transfer_id': picking.id, 'transfer': transfer,
            'package_count': len(packages), 'reason': reason, 'write_ready': True,
            'version': picking._qorlia_confirmation_version(order.id, graph, stamp)}

    def _qorlia_confirmation_paged_signature(self, version, effects, private_audit, state):
        return self._qorlia_confirmation_signature(_digest({'purpose': _PURPOSE, 'version': version}),
            effects, private_audit, state)

    def _qorlia_confirmation_page_token(self, version, review, position, purpose):
        return self._qorlia_confirmation_signature(
            _digest({'purpose': _PURPOSE + '.' + purpose, 'version': version}),
            {'review_version': review, 'position': position}, {}, False)

    def _qorlia_confirmation_paged_preview(self, order_id, transfer_id, version):
        picking, _order, _scope = self._qorlia_confirmation_paged_transfer(order_id, transfer_id, lock=True)
        picking._qorlia_confirmation_access()
        current = self.qorlia_confirmation_paged_load(order_id, transfer_id)
        if current['version'] != version:
            raise UserError('The transfer, inventory or native configuration changed. Reload it.')
        if current['reason']:
            raise UserError(current['reason'])
        effects, private_audit, state = picking._qorlia_confirmation_preview_effects()
        return picking, effects, state, picking._qorlia_confirmation_paged_signature(version, effects, private_audit, state)

    @api.model
    def qorlia_confirmation_paged_review(self, order_id, transfer_id, version, after=0,
            review_version=False, continuation_token=False, limit=50):
        self = self._qorlia_confirmation_context()
        if (not _hash(version) or type(after) is not int or after < 0 or type(limit) is not int or not 1 <= limit <= 100
                or (after == 0 and (review_version is not False or continuation_token is not False))
                or (after > 0 and (not _hash(review_version) or not _hash(continuation_token)))):
            raise ValidationError('Review bounded confirmation pages in order with their original tokens.')
        picking, effects, state, reviewed = self._qorlia_confirmation_paged_preview(order_id, transfer_id, version)
        rows = _effect_rows(effects)
        if after > len(rows):
            raise ValidationError('The confirmation cursor is outside this review.')
        if after and (not hmac.compare_digest(reviewed, review_version) or not hmac.compare_digest(
                picking._qorlia_confirmation_page_token(version, reviewed, after, 'continue'), continuation_token)):
            raise UserError('Confirmation review changed or a page was skipped. Review it again from the start.')
        # shortcut: each page recomputes all native effects in memory; measure scale before hospital release.
        end = min(after + limit, len(rows))
        more = end < len(rows)
        return {'order_id': order_id, 'transfer_id': transfer_id, 'version': version,
            'review_version': reviewed, 'state_after': state, 'write_ready': True,
            'after': after, 'total_count': len(rows), 'next_after': end if more else False,
            'effects': _effect_page(effects, rows[after:end]),
            'continuation_token': picking._qorlia_confirmation_page_token(version, reviewed, end, 'continue') if more else False,
            'review_complete_token': False if more else picking._qorlia_confirmation_page_token(version, reviewed, len(rows), 'complete')}

    def _qorlia_confirmation_paged_request(self, payload):
        if not isinstance(payload, dict) or set(payload) != {
                'order_id', 'transfer_id', 'version', 'review_version', 'review_complete_token', 'request_key'}:
            raise ValidationError('Use the exact completely reviewed confirmation request.')
        if not _hash(payload['review_complete_token']):
            raise ValidationError('Complete every confirmation review page before saving.')
        self._qorlia_confirmation_request({key: value for key, value in payload.items() if key != 'review_complete_token'})
        return dict(payload), _digest({'purpose': _PURPOSE, 'request': payload,
            'author': self.env.uid, 'companies': self.env.companies.ids})

    def _qorlia_confirmation_paged_receipt(self, request, digest):
        self._qorlia_paged_request_not_stopped(request, digest, _PURPOSE, 'qorlia_confirmation_receipts')
        receipt = self._qorlia_confirmation_receipt(request, digest)
        if receipt and receipt.get('kind') != _PURPOSE:
            raise ValidationError('This identifier belongs to another confirmation request.')
        return receipt

    def _qorlia_paged_stop_marker(self, request, digest, purpose, receipt_field):
        self.ensure_one()
        # A different author's guessed nonce cannot stop this author's request.
        key = 'stop:%s:%s' % (self.env.uid, request['request_key'])
        marker = (self[receipt_field] or {}).get(key)
        if marker and (marker.get('kind') != purpose + '.stopped'
                or marker.get('hash') != digest or marker.get('author') != self.env.uid):
            raise ValidationError('This stopped request key belongs to a different exact request.')
        return key, marker

    def _qorlia_paged_request_not_stopped(self, request, digest, purpose, receipt_field):
        if self._qorlia_paged_stop_marker(request, digest, purpose, receipt_field)[1]:
            raise UserError('This exact request was stopped. It will not be applied. Recover its stop result before starting another request.')

    def _qorlia_paged_stop_stamp(self, tables, receipt_field):
        result = self._qorlia_confirmation_stamp([name for name in tables if name != 'stock_picking'])
        # Ignore only this transfer's targeted receipt field and normal write metadata.
        self.env.cr.execute("SELECT encode(sha256(convert_to(COALESCE(string_agg(value, ',' ORDER BY value), ''), 'UTF8')), 'hex') "
            "FROM (SELECT (CASE WHEN record.id = %s THEN to_jsonb(record) - ARRAY[%s,'write_uid','write_date'] "
            "ELSE to_jsonb(record) END)::text value FROM stock_picking record) fingerprint", [self.id, receipt_field])
        result['stock_picking'] = self.env.cr.fetchone()[0]
        return result

    def _qorlia_paged_stop(self, request, digest, purpose, receipt_field, token_name, token):
        self.ensure_one()
        if not self.env.user.has_group('stock.group_stock_user'):
            raise AccessError('Stopping stock requests requires the native Stock User role.')
        self.check_access_rights('write')
        self.check_access_rule('write')
        key, marker = self._qorlia_paged_stop_marker(request, digest, purpose, receipt_field)
        result = lambda stopped: {'request_key': request['request_key'], 'stopped': stopped, 'accepted': not stopped}
        if marker:
            return result(True)
        receipt = (self[receipt_field] or {}).get(request['request_key'])
        if receipt:
            if receipt.get('hash') != digest or receipt.get('author') != self.env.uid or receipt.get('kind') != purpose:
                raise ValidationError('This identifier belongs to another stock request.')
            return result(False)
        tables = sorted(set(self._qorlia_operation_paged_tables()) | {'account_analytic_applicability'})
        cr = self.env.cr
        cr.flush()
        # Same ordered stock/finance locks as save, before any company/transfer row lock.
        for table in tables:
            cr.execute(sql.SQL('LOCK TABLE {} IN SHARE ROW EXCLUSIVE MODE').format(sql.Identifier(table)))
        self.env.invalidate_all()
        picking, _order, _scope = self._qorlia_confirmation_paged_transfer(request['order_id'], request['transfer_id'])
        picking.check_access_rights('write')
        picking.check_access_rule('write')
        key, marker = picking._qorlia_paged_stop_marker(request, digest, purpose, receipt_field)
        receipts = dict(picking[receipt_field] or {})
        if marker:
            return result(True)
        receipt = receipts.get(request['request_key'])
        if receipt:
            if receipt.get('hash') != digest or receipt.get('author') != self.env.uid or receipt.get('kind') != purpose:
                raise ValidationError('This identifier belongs to another stock request.')
            return result(False)
        before = picking._qorlia_paged_stop_stamp(tables, receipt_field)
        receipts[key] = {'kind': purpose + '.stopped', 'hash': digest, 'author': self.env.uid,
            'stopped_at': fields.Datetime.to_string(fields.Datetime.now())}
        hooks = {name: (getattr(cr, name), list(getattr(cr, name)._funcs), copy.deepcopy(getattr(cr, name).data))
            for name in ('precommit', 'postcommit', 'prerollback', 'postrollback')}
        try:
            with cr.savepoint():
                picking.with_context(**{token_name: token}).write({receipt_field: receipts})
                cr.flush()
                self.env.invalidate_all()
                if (picking[receipt_field] != receipts or picking._qorlia_paged_stop_stamp(tables, receipt_field) != before
                        or any(list(getattr(cr, name)._funcs) != functions or getattr(cr, name).data != data
                            for name, (_callbacks, functions, data) in hooks.items() if name != 'precommit')):
                    raise UserError('Stopping this request changed unreviewed state or deferred work. Nothing was stopped.')
            return result(True)
        except Exception:
            for name, (callbacks, functions, data) in hooks.items():
                setattr(cr, name, callbacks)
                callbacks.clear()
                for function in functions:
                    callbacks.add(function)
                callbacks.data.update(data)
            raise

    @api.model
    def qorlia_confirmation_paged_stop(self, payload):
        self = self._qorlia_confirmation_context()
        request, digest = self._qorlia_confirmation_paged_request(payload)
        picking, _order, _scope = self._qorlia_confirmation_paged_transfer(request['order_id'], request['transfer_id'])
        return picking._qorlia_paged_stop(request, digest, _PURPOSE, 'qorlia_confirmation_receipts',
            'qorlia_confirmation_receipt_token', _RECEIPT_TOKEN)

    @api.model
    def qorlia_confirmation_paged_status(self, payload):
        self = self._qorlia_confirmation_context()
        request, digest = self._qorlia_confirmation_paged_request(payload)
        picking, _order, _scope = self._qorlia_confirmation_paged_transfer(request['order_id'], request['transfer_id'])
        receipt = picking._qorlia_confirmation_paged_receipt(request, digest)
        return {'accepted': bool(receipt), 'request_key': request['request_key'],
            'state_after': receipt['state'] if receipt else False,
            'reference_count': len(receipt['references']) if receipt else 0,
            'current': self.qorlia_confirmation_paged_load(request['order_id'], request['transfer_id'])}

    @api.model
    def qorlia_confirmation_paged_references(self, payload, after=0, version=False, limit=50):
        self = self._qorlia_confirmation_context()
        if (type(after) is not int or after < 0 or type(limit) is not int or not 1 <= limit <= 100
                or not (version is False or _hash(version)) or after and version is False):
            raise ValidationError('Use a bounded confirmation reference page and its original version.')
        request, digest = self._qorlia_confirmation_paged_request(payload)
        picking, _order, scope = self._qorlia_confirmation_paged_transfer(request['order_id'], request['transfer_id'])
        receipt = picking._qorlia_confirmation_paged_receipt(request, digest)
        if not receipt:
            raise UserError('This confirmation has not been accepted. Check the original request status.')
        references = picking._qorlia_confirmation_reference_labels(receipt)
        current = _digest({'purpose': _PURPOSE + '.references', 'receipt': digest,
            'scope': scope, 'references': references})
        if version is not False and not hmac.compare_digest(version, current):
            raise UserError('Confirmation references or their access changed. Reload the reference pages.')
        if after > len(references):
            raise ValidationError('The reference cursor is outside this confirmation.')
        keys = sorted(references)
        return {'request_key': request['request_key'], 'version': current, 'after': after,
            'total_count': len(keys), 'next_after': after + limit if after + limit < len(keys) else False,
            'rows': [{'key': key, **references[key]} for key in keys[after:after + limit]]}

    @api.model
    def qorlia_confirmation_paged_save(self, payload):
        self = self._qorlia_confirmation_context()
        request, digest = self._qorlia_confirmation_paged_request(payload)
        picking, _order, _scope = self._qorlia_confirmation_paged_transfer(request['order_id'], request['transfer_id'])
        if picking._qorlia_confirmation_paged_receipt(request, digest):
            return self.qorlia_confirmation_paged_status(request)
        self.env.cr.flush()
        # Match the existing native confirmation's phantom protection and lock ordering.
        for table in picking._qorlia_confirmation_tables():
            self.env.cr.execute(sql.SQL('LOCK TABLE {} IN SHARE ROW EXCLUSIVE MODE').format(sql.Identifier(table)))
        self.env.invalidate_all()
        picking, _order, _scope = self._qorlia_confirmation_paged_transfer(request['order_id'], request['transfer_id'])
        if picking._qorlia_confirmation_paged_receipt(request, digest):
            return self.qorlia_confirmation_paged_status(request)
        picking, effects, _state, reviewed = self._qorlia_confirmation_paged_preview(
            request['order_id'], request['transfer_id'], request['version'])
        if (not hmac.compare_digest(reviewed, request['review_version']) or not hmac.compare_digest(
                picking._qorlia_confirmation_page_token(request['version'], reviewed, len(_effect_rows(effects)), 'complete'),
                request['review_complete_token'])):
            raise UserError('Complete the current confirmation review before saving. Nothing was saved.')
        cr = self.env.cr
        hooks = {name: (getattr(cr, name), list(getattr(cr, name)._funcs), copy.deepcopy(getattr(cr, name).data))
            for name in ('precommit', 'postcommit', 'prerollback', 'postrollback')}
        try:
            with cr.savepoint():
                effects, private_audit, state, references = picking._qorlia_confirmation_native()
                actual = picking._qorlia_confirmation_paged_signature(request['version'], effects, private_audit, state)
                if not hmac.compare_digest(actual, request['review_version']):
                    raise UserError('Native confirmation changed unreviewed effects. Nothing was saved.')
                receipts = dict(picking.qorlia_confirmation_receipts or {})
                receipts[request['request_key']] = {'kind': _PURPOSE, 'hash': digest, 'author': self.env.uid,
                    'state': state, 'references': references}
                picking.with_context(qorlia_confirmation_receipt_token=_RECEIPT_TOKEN).write({'qorlia_confirmation_receipts': receipts})
                cr.flush()
                self.env.invalidate_all()
                response = self.qorlia_confirmation_paged_status(request)
            return response
        except Exception:
            for name, (callbacks, functions, data) in hooks.items():
                setattr(cr, name, callbacks)
                callbacks.clear()
                for function in functions:
                    callbacks.add(function)
                callbacks.data.update(data)
            raise
