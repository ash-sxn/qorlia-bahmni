# SPDX-License-Identifier: LGPL-3.0-or-later
# Copyright 2026 Qorlia contributors.
import hmac

from odoo import api, models
from odoo.exceptions import AccessError, UserError, ValidationError

from .invoice_draft import _digest
from .stock_confirmation_paged import _hash


_SECTIONS = ('transfers', 'lots', 'operations')
_PURPOSE = 'qorlia.validation-step-recovery.v1'


def _prompt_parts(descriptor):
    metadata = {key: value for key, value in descriptor.items() if key not in _SECTIONS}
    metadata['counts'] = {section: len(descriptor[section]) for section in _SECTIONS}
    rows = [{'section': section, 'value': row} for section in _SECTIONS for row in descriptor[section]]
    return metadata, rows


def _page_parameters(after, version, limit):
    if (type(after) is not int or after < 0 or type(limit) is not int or not 1 <= limit <= 100
            or not (version is False or _hash(version)) or after and version is False):
        raise ValidationError('Read a bounded saved-validation page with its original version.')


class StockValidationRecovery(models.Model):
    _inherit = 'stock.picking'

    def _qorlia_validation_recovery_request(self, payload):
        request, digest = self._qorlia_step_request(payload)
        picking, order, scope = self._qorlia_confirmation_paged_transfer(request['order_id'], request['transfer_id'])
        receipt, receipts = picking._qorlia_validation_receipt(request, digest)
        if receipt and receipt.get('kind') != 'validation_step':
            raise ValidationError('This identifier belongs to a different validation protocol.')
        return request, digest, picking, order, scope, receipt, receipts

    def _qorlia_validation_recovery_prompt(self, request, digest, receipts, scope):
        self._qorlia_validation_access()
        action = self._qorlia_step_action(request['order_id'], request['request_key'], receipts)
        if action is None:
            raise UserError('This validation has no saved prompt to read.')
        wizard, descriptor = self._qorlia_validation_wizard(action)
        if wizard.id != action['res_id']:
            raise UserError('The saved native prompt is unavailable. No prompt was recreated.')
        # Related labels must not disclose records hidden from this reader.
        self._qorlia_validation_prompt_label_access(wizard, descriptor)
        metadata, rows = _prompt_parts(descriptor)
        version = _digest({'purpose': _PURPOSE + '.prompt', 'request': digest, 'scope': scope,
            'descriptor': metadata, 'rows': rows})
        return metadata, rows, version

    @api.model
    def qorlia_validation_step_compact_status(self, payload):
        self = self._qorlia_operation_paged_context()
        request, digest, picking, order, scope, receipt, receipts = self._qorlia_validation_recovery_request(payload)
        metadata, rows, version, reason = False, [], False, False
        if receipt and receipt['next_action'] and not receipt.get('consumed_by'):
            try:
                metadata, rows, version = picking._qorlia_validation_recovery_prompt(request, digest, receipts, scope)
            except (AccessError, UserError):
                reason = 'The saved native prompt is unavailable or no longer permitted. Keep the exact recovery request.'
        elif receipt and receipt.get('consumed_by'):
            reason = 'This native prompt was already processed. Recover the later exact request if its outcome is unknown.'
        self.env.cr.execute('SELECT (SELECT count(*) FROM stock_move WHERE picking_id = %s), '
            '(SELECT count(*) FROM stock_move_line WHERE picking_id = %s)', [picking.id, picking.id])
        moves, operations = self.env.cr.fetchone()
        return {'accepted': bool(receipt), 'request_key': request['request_key'],
            'state_after': receipt['state'] if receipt else False, 'reference_count': len(receipt['references']) if receipt else 0,
            'current': {'order_id': order.id, 'transfer_id': picking.id, 'version': scope,
                'transfer': dict(order._qorlia_delivery_header(picking), move_count=moves, operation_count=operations)},
            'next_step': metadata, 'prompt_count': len(rows), 'prompt_version': version,
            'continuation_key': request['request_key'] if metadata else False, 'continuation_reason': reason,
            'terminal': not receipt['next_action'] if receipt else False}

    @api.model
    def qorlia_validation_step_prompt_page(self, payload, after=0, version=False, limit=50):
        self = self._qorlia_operation_paged_context()
        _page_parameters(after, version, limit)
        request, digest, picking, _order, scope, receipt, receipts = self._qorlia_validation_recovery_request(payload)
        if not receipt:
            raise UserError('This validation step has not been accepted. Check its exact request status.')
        metadata, rows, current = picking._qorlia_validation_recovery_prompt(request, digest, receipts, scope)
        if version is not False and not hmac.compare_digest(version, current):
            raise UserError('The saved validation prompt or its access changed. Reload its pages.')
        if after > len(rows):
            raise ValidationError('The prompt cursor is outside this saved validation step.')
        # shortcut: response pages are bounded, but the native descriptor is still materialised in memory.
        return {'request_key': request['request_key'], 'version': current, 'descriptor': metadata,
            'after': after, 'total_count': len(rows), 'next_after': after + limit if after + limit < len(rows) else False,
            'rows': rows[after:after + limit]}

    @api.model
    def qorlia_validation_step_reference_page(self, payload, after=0, version=False, limit=50):
        self = self._qorlia_operation_paged_context()
        _page_parameters(after, version, limit)
        request, digest, picking, _order, scope, receipt, _receipts = self._qorlia_validation_recovery_request(payload)
        if not receipt:
            raise UserError('This validation step has not been accepted. Check its exact request status.')
        references = picking._qorlia_confirmation_reference_labels(receipt)
        current = _digest({'purpose': _PURPOSE + '.references', 'request': digest, 'scope': scope, 'references': references})
        if version is not False and not hmac.compare_digest(version, current):
            raise UserError('Validation references or their access changed. Reload their pages.')
        keys = sorted(references)
        if after > len(keys):
            raise ValidationError('The reference cursor is outside this validation step.')
        return {'request_key': request['request_key'], 'version': current, 'after': after,
            'total_count': len(keys), 'next_after': after + limit if after + limit < len(keys) else False,
            'rows': [{'key': key, **references[key]} for key in keys[after:after + limit]]}
