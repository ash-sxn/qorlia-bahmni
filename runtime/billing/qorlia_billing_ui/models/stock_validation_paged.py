# SPDX-License-Identifier: LGPL-3.0-or-later
# Copyright 2026 Qorlia contributors.
from contextlib import closing
import copy
import hmac
import uuid

from odoo import api, models, tools
from odoo.exceptions import AccessError, UserError, ValidationError

from .invoice_draft import _digest
from .stock_confirmation_paged import _hash, _effect_rows, _effect_page
from .stock_validation_recovery import _prompt_parts


_PURPOSE = 'qorlia.paged-validation.v1'


class StockValidationPaged(models.Model):
    _inherit = 'stock.picking'

    def _qorlia_validation_paged_selection(self, payload):
        if not isinstance(payload, dict) or set(payload) != {
                'order_id', 'transfer_id', 'version', 'continuation_key', 'decisions'}:
            raise ValidationError('Use the exact native validation step and its saved continuation.')
        request = dict(payload, review_version='0' * 64, request_key=str(uuid.uuid4()))
        self._qorlia_step_request(request)
        return copy.deepcopy(payload)

    @api.model
    def qorlia_validation_paged_load(self, order_id, transfer_id):
        self = self._qorlia_operation_paged_context()
        picking, order, scope = self._qorlia_confirmation_paged_transfer(order_id, transfer_id)
        reason = False
        try:
            picking._qorlia_validation_access()
        except (AccessError, UserError) as error:
            reason = str(error)
        inventory = picking._qorlia_reservation_scope(complete=True)
        packages = picking._qorlia_reservation_package_graph()
        self.env.cr.execute('SELECT (SELECT count(*) FROM stock_move WHERE picking_id = %s), '
            '(SELECT count(*) FROM stock_move_line WHERE picking_id = %s)', [picking.id, picking.id])
        moves, operations = self.env.cr.fetchone()
        transfer = dict(order._qorlia_delivery_header(picking), move_count=moves, operation_count=operations)
        graph = {'purpose': _PURPOSE, 'scope': scope, 'transfer': transfer,
            'inventory': inventory, 'packages': _digest(packages), 'reason': reason}
        stamp = picking._qorlia_confirmation_stamp(picking._qorlia_validation_tables())
        return {'order_id': order.id, 'transfer_id': picking.id, 'transfer': transfer,
            'inventory_quant_count': inventory['quant_count'], 'package_count': len(packages),
            'reason': reason, 'write_ready': False,
            'version': picking._qorlia_confirmation_version(order.id, graph, stamp)}

    def _qorlia_validation_paged_signature(self, data, native, input_prompt):
        return self._qorlia_confirmation_signature(_digest({'purpose': _PURPOSE, 'request': data}),
            {'effects': native[0], 'input_prompt': input_prompt, 'next_step': native[3]}, native[1], native[2])

    def _qorlia_validation_paged_token(self, data, review, position, purpose):
        return self._qorlia_confirmation_signature(_digest({'purpose': _PURPOSE + '.' + purpose, 'request': data}),
            {'review_version': review, 'position': position}, {}, False)

    def _qorlia_validation_paged_preview(self, data):
        picking, _order, _scope = self._qorlia_confirmation_paged_transfer(
            data['order_id'], data['transfer_id'], lock=True)
        picking._qorlia_validation_access()
        picking._qorlia_reservation_scope(lock=True, complete=True)
        current = self.qorlia_validation_paged_load(data['order_id'], data['transfer_id'])
        if current['version'] != data['version'] or current['reason']:
            raise UserError(current['reason'] or 'The transfer, inventory or native configuration changed. Reload it.')
        self.env.cr.execute('SELECT qorlia_validation_receipts FROM stock_picking WHERE id = %s', [picking.id])
        receipts = self.env.cr.fetchone()[0] or {}
        action = self._qorlia_step_action(data['order_id'], data['continuation_key'], receipts)
        input_prompt = False
        if action is not None:
            wizard, input_prompt = picking._qorlia_validation_wizard(action)
            if wizard.id != action['res_id']:
                raise UserError('The saved native prompt is unavailable. No prompt was recreated.')
            picking._qorlia_validation_prompt_label_access(wizard, input_prompt)
            if input_prompt['kind'] != data['decisions'][0]['kind']:
                raise ValidationError('Use the decision for this exact saved native prompt.')
        tables = picking._qorlia_validation_tables()
        stamp = picking._qorlia_confirmation_stamp(tables)
        cr = self.env.cr
        hooks = {name: getattr(cr, name) for name in ('precommit', 'postcommit', 'prerollback', 'postrollback')}
        try:
            for name in hooks:
                setattr(cr, name, tools.Callbacks())
            with closing(cr.savepoint()):
                native = picking._qorlia_validation_native(data['decisions'], start_action=action, include_action=True)
                if native[3]:
                    if native[3]['blocked_reason']:
                        raise UserError(native[3]['blocked_reason'])
                    wizard, descriptor = picking._qorlia_validation_wizard(native[5])
                    picking._qorlia_validation_prompt_label_access(wizard, descriptor)
                reviewed = picking._qorlia_validation_paged_signature(data, native, input_prompt)
        finally:
            for name, callbacks in hooks.items():
                setattr(cr, name, callbacks)
            self.env.invalidate_all()
        if picking._qorlia_confirmation_stamp(tables) != stamp:
            raise UserError('Native state changed during validation review. Reload it.')
        return picking, native, input_prompt, reviewed

    @api.model
    def qorlia_validation_paged_review(self, payload, after=0, review_version=False, continuation_token=False, limit=50):
        self = self._qorlia_operation_paged_context()
        data = self._qorlia_validation_paged_selection(payload)
        if (type(after) is not int or after < 0 or type(limit) is not int or not 1 <= limit <= 100
                or (after == 0 and (review_version is not False or continuation_token is not False))
                or (after > 0 and (not _hash(review_version) or not _hash(continuation_token)))):
            raise ValidationError('Review bounded native validation pages in order with their original tokens.')
        picking, native, input_prompt, reviewed = self._qorlia_validation_paged_preview(data)
        effects = _effect_rows(native[0])
        metadata, rows = _prompt_parts(input_prompt) if input_prompt else (False, [])
        next_metadata = _prompt_parts(native[3])[0] if native[3] else False
        count = len(rows) + len(effects)
        if after > count:
            raise ValidationError('The validation cursor is outside this review.')
        if after and (not hmac.compare_digest(reviewed, review_version) or not hmac.compare_digest(
                picking._qorlia_validation_paged_token(data, reviewed, after, 'continue'), continuation_token)):
            raise UserError('Validation review changed or a page was skipped. Review it again from the start.')
        # shortcut: each page repeats all native effects in a rollback preview; measure scale before release.
        end = min(after + limit, count)
        more = end < count
        return {**data, 'review_version': reviewed, 'state_after': native[2], 'write_ready': False,
            'input_prompt': metadata, 'prompt_rows': rows[after:min(end, len(rows))],
            'next_step': next_metadata, 'terminal': native[3] is False,
            'after': after, 'total_count': count, 'prompt_count': len(rows), 'effect_count': len(effects),
            'next_after': end if more else False,
            'effects': _effect_page(native[0], effects[max(0, after - len(rows)):max(0, end - len(rows))],
                private_counts_key='private_effect_counts'),
            'continuation_token': picking._qorlia_validation_paged_token(data, reviewed, end, 'continue') if more else False,
            'review_complete_token': False if more else picking._qorlia_validation_paged_token(data, reviewed, count, 'complete')}
