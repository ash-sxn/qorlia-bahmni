# SPDX-License-Identifier: LGPL-3.0-or-later
# Copyright 2026 Qorlia contributors.
import copy
import hmac
import math

from odoo import api, models
from odoo.exceptions import AccessError, UserError, ValidationError

from .invoice_draft import _digest
from .order_deliveries import _label
from .stock_confirmation_paged import _hash, _effect_rows, _effect_page


_PURPOSE = 'qorlia.paged-return.v1'


class StockReturnPaged(models.Model):
    _inherit = 'stock.picking'

    def _qorlia_return_paged_tables(self):
        return sorted(set(self._qorlia_return_tables()) | set(self._qorlia_validation_paged_tables()))

    def _qorlia_return_paged_source(self, order_id, transfer_id):
        self.env.invalidate_all()
        picking, order, scope = self._qorlia_confirmation_paged_transfer(order_id, transfer_id, inventory=True)
        form, reason = False, False
        try:
            picking._qorlia_return_paged_access()
            form = picking._qorlia_return_snapshot(picking._qorlia_return_form())
            form['lines'].sort(key=lambda row: row['move_id'])
        except (AccessError, UserError) as error:
            reason = str(error)
        self.env.cr.execute('SELECT (SELECT count(*) FROM stock_move WHERE picking_id = %s), '
            '(SELECT count(*) FROM stock_move_line WHERE picking_id = %s)', [picking.id, picking.id])
        moves, operations = self.env.cr.fetchone()
        header = dict(order._qorlia_delivery_header(picking), move_count=moves, operation_count=operations)
        graph = {'purpose': _PURPOSE, 'scope': scope, 'transfer': header, 'form': form, 'reason': reason}
        version = picking._qorlia_confirmation_version(order.id, graph,
            picking._qorlia_confirmation_stamp(picking._qorlia_return_paged_tables()))
        return picking, {'order_id': order.id, 'transfer_id': picking.id, 'version': version,
            'transfer': header, 'form': {key: value for key, value in form.items() if key != 'lines'} if form else False,
            'line_count': len(form['lines']) if form else 0, 'reason': reason, 'write_ready': bool(form)}, form

    @api.model
    def qorlia_return_paged_load(self, order_id, transfer_id):
        self = self._qorlia_confirmation_context()
        return self._qorlia_return_paged_source(order_id, transfer_id)[1]

    def _qorlia_return_paged_page(self, after, limit):
        if type(after) is not int or after < 0 or type(limit) is not int or not 1 <= limit <= 100:
            raise ValidationError('Use a bounded native return page.')

    @api.model
    def qorlia_return_paged_lines(self, order_id, transfer_id, version, after=0, limit=50):
        self = self._qorlia_confirmation_context()
        self._qorlia_return_paged_page(after, limit)
        if not _hash(version):
            raise ValidationError('Use the original native return-form version.')
        _picking, loaded, form = self._qorlia_return_paged_source(order_id, transfer_id)
        if loaded['version'] != version or not form:
            raise UserError(loaded['reason'] or 'The return form changed. Reload all its pages.')
        if after > len(form['lines']):
            raise ValidationError('The return cursor is outside this native form.')
        return {'order_id': order_id, 'transfer_id': transfer_id, 'version': version, 'form': loaded['form'],
            'after': after, 'total_count': len(form['lines']),
            'next_after': after + limit if after + limit < len(form['lines']) else False,
            'rows': form['lines'][after:after + limit]}

    @api.model
    def qorlia_return_paged_locations(self, order_id, transfer_id, version, query='', after=0, limit=25):
        self = self._qorlia_confirmation_context()
        self._qorlia_return_paged_page(after, limit)
        if not _hash(version) or not isinstance(query, str) or len(query) > 200:
            raise ValidationError('Use the pinned native return-location search.')
        picking, loaded, form = self._qorlia_return_paged_source(order_id, transfer_id)
        if loaded['version'] != version or not form:
            raise UserError(loaded['reason'] or 'The native return form changed. Reload it.')
        if not loaded['form']['location_editable']:
            raise AccessError('Changing return locations requires the native multi-location role.')
        native = picking._qorlia_return_form()
        model = self.env['stock.location']
        model.check_access_rights('read')
        model.check_field_access_rights('read', ['complete_name', 'company_id', 'return_location'])
        rows = model.search(picking._qorlia_return_location_domain(native) +
            [('id', '>', after), ('complete_name', 'ilike', query)], order='id', limit=limit + 1)
        return {'order_id': order_id, 'transfer_id': transfer_id, 'version': version, 'query': query,
            'after': after, 'rows': [_label(row) for row in rows[:limit]],
            'next_after': rows[limit - 1].id if len(rows) > limit else False}

    def _qorlia_return_paged_selection(self, payload):
        if (not isinstance(payload, dict) or set(payload) != {'order_id', 'transfer_id', 'version', 'location_id', 'lines'}
                or not (payload['order_id'] is False or type(payload['order_id']) is int and payload['order_id'] > 0)
                or any(type(payload[key]) is not int or payload[key] <= 0
                    for key in ('transfer_id', 'location_id'))
                or not _hash(payload['version']) or not isinstance(payload['lines'], list)):
            raise ValidationError('Use the exact native return selection and its original version.')
        seen = set()
        for row in payload['lines']:
            if (not isinstance(row, dict) or set(row) != {'move_id', 'quantity'}
                    or type(row['move_id']) is not int or row['move_id'] <= 0 or row['move_id'] in seen
                    or type(row['quantity']) not in (int, float)):
                raise ValidationError('Use original native moves once with finite return quantities.')
            try:
                finite = math.isfinite(row['quantity'])
            except OverflowError:
                finite = False
            if not finite:
                raise ValidationError('Use finite native return quantities.')
            seen.add(row['move_id'])
        return copy.deepcopy(payload)

    def _qorlia_return_paged_native(self, form):
        extra = sorted(set(self._qorlia_return_paged_tables()) - set(self._qorlia_return_tables()))
        before = self._qorlia_confirmation_stamp(extra)
        result = self._qorlia_return_native(form)
        if self._qorlia_confirmation_stamp(extra) != before:
            raise UserError('Return creation changed unreviewed native configuration. Nothing was saved.')
        return result

    def _qorlia_return_paged_signature(self, data, form, native):
        return self._qorlia_confirmation_signature(_digest({'purpose': _PURPOSE, 'request': data}),
            {'form': form, 'effects': native[0]}, native[1], native[2])

    def _qorlia_return_paged_token(self, data, review, position, purpose):
        return self._qorlia_confirmation_signature(_digest({'purpose': _PURPOSE + '.' + purpose, 'request': data}),
            {'review_version': review, 'position': position}, {}, False)

    def _qorlia_return_paged_preview(self, data):
        picking, _order, _scope = self._qorlia_confirmation_paged_transfer(
            data['order_id'], data['transfer_id'], lock=True, inventory=True)
        picking._qorlia_reservation_scope(lock=True, complete=True)
        picking, loaded, _original = self._qorlia_return_paged_source(data['order_id'], data['transfer_id'])
        if loaded['version'] != data['version'] or loaded['reason']:
            raise UserError(loaded['reason'] or 'The native return form, stock or configuration changed. Reload it.')
        native = picking._qorlia_return_edited_form(data['location_id'], data['lines'], complete=True)
        form = picking._qorlia_return_snapshot(native)
        form['lines'].sort(key=lambda row: row['move_id'])
        result = picking._qorlia_stock_preparation_preview(
            lambda: picking._qorlia_return_paged_native(native), picking._qorlia_return_paged_tables())
        return picking, form, result

    @api.model
    def qorlia_return_paged_review(self, payload, after=0, review_version=False, continuation_token=False, limit=50):
        self = self._qorlia_confirmation_context()
        data = self._qorlia_return_paged_selection(payload)
        self._qorlia_return_paged_page(after, limit)
        if (after == 0 and (review_version is not False or continuation_token is not False)
                or after > 0 and (not _hash(review_version) or not _hash(continuation_token))):
            raise ValidationError('Review native return rows and effects in order with their original proofs.')
        picking, form, native = self._qorlia_return_paged_preview(data)
        reviewed = picking._qorlia_return_paged_signature(data, form, native)
        effects = _effect_rows(native[0])
        count = len(form['lines']) + len(effects)
        if after > count:
            raise ValidationError('The cursor is outside this native return review.')
        if after and (not hmac.compare_digest(reviewed, review_version) or not hmac.compare_digest(
                picking._qorlia_return_paged_token(data, reviewed, after, 'continue'), continuation_token)):
            raise UserError('Return review changed or a page was skipped. Review again from the start.')
        # shortcut: each page repeats complete native rollback; measure load before a hospital release.
        end = min(after + limit, count)
        more = end < count
        return {**{key: value for key, value in data.items() if key != 'lines'},
            'form': {key: value for key, value in form.items() if key != 'lines'},
            'line_count': len(form['lines']), 'return_state': native[2], 'write_ready': True,
            'review_version': reviewed, 'after': after, 'total_count': count, 'effect_count': len(effects),
            'next_after': end if more else False, 'line_rows': form['lines'][after:min(end, len(form['lines']))],
            'effects': _effect_page(native[0], effects[max(0, after - len(form['lines'])):max(0, end - len(form['lines']))],
                private_counts_key='private_effect_counts'),
            'continuation_token': picking._qorlia_return_paged_token(data, reviewed, end, 'continue') if more else False,
            'review_complete_token': False if more else picking._qorlia_return_paged_token(data, reviewed, count, 'complete')}
