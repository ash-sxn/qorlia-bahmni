# SPDX-License-Identifier: LGPL-3.0-or-later
# Copyright 2026 Qorlia contributors.
from contextlib import closing
import copy
import hmac
import uuid

from psycopg2 import sql
from odoo import api, models, tools
from odoo.exceptions import AccessError, UserError, ValidationError

from .invoice_draft import _digest
from .stock_validation import _RECEIPT_TOKEN


class StockValidationStep(models.Model):
    _inherit = 'stock.picking'

    def _qorlia_step_request(self, payload):
        if not isinstance(payload, dict) or set(payload) != {
                'order_id', 'transfer_id', 'version', 'decisions', 'review_version',
                'request_key', 'continuation_key'}:
            raise ValidationError('Use the exact reviewed native validation step.')
        request = copy.deepcopy(payload)
        continuation = request.pop('continuation_key')
        self._qorlia_validation_request(request)
        try:
            if continuation is not False and (not isinstance(continuation, str)
                    or str(uuid.UUID(continuation)) != continuation or continuation == request['request_key']):
                raise ValueError()
            if len(request['decisions']) != (1 if continuation else 0):
                raise ValueError()
        except (ValueError, TypeError, AttributeError):
            raise ValidationError('Review exactly one native step with its original continuation.')
        request['continuation_key'] = continuation
        return request, _digest({'request': request, 'author': self.env.uid, 'companies': self.env.companies.ids})

    def _qorlia_step_action(self, order_id, continuation, receipts, kind='validation_step'):
        if continuation is False:
            return None
        receipt = receipts.get(continuation)
        if (not receipt or receipt.get('kind') != kind
                or receipt['author'] != self.env.uid or receipt['companies'] != self.env.companies.ids
                or receipt['order_id'] != order_id):
            raise AccessError('This native continuation belongs to another validation workflow.')
        if receipt.get('consumed_by'):
            raise UserError('This native step was already processed. Recover its exact request.')
        if not receipt['next_action']:
            raise UserError('Native validation has no further prompt to process.')
        action = receipt['next_action']
        if not action.get('res_id') or not self.env[action['res_model']].browse(action['res_id']).exists():
            raise UserError('The saved native prompt is unavailable. Reload validation.')
        return receipt['next_action']

    def _qorlia_step_signature(self, request, effects, private, state, next_step):
        return self._qorlia_confirmation_signature(request['version'],
            {'action': 'validation_step', 'continuation_key': request['continuation_key'],
                'decisions': request['decisions'], 'effects': effects, 'next_step': next_step}, private, state)

    @api.model
    def qorlia_validation_step_preview(self, order_id, transfer_id, version, continuation_key, decisions):
        self = self.with_context({key: self.env.context[key] for key in ('allowed_company_ids', 'lang', 'tz') if key in self.env.context})
        # Reuse the strict request/decision checks before touching native business records.
        request, _digest_value = self._qorlia_step_request({'order_id': order_id, 'transfer_id': transfer_id,
            'version': version, 'decisions': decisions, 'continuation_key': continuation_key,
            'review_version': '0' * 64, 'request_key': str(uuid.uuid4())})
        picking, _order = self._qorlia_reservation_transfer(order_id, transfer_id, lock=True)
        picking._qorlia_validation_access()
        if self.qorlia_validation_load(order_id, transfer_id)['version'] != version:
            raise UserError('The transfer, inventory or native configuration changed. Reload it.')
        self.env.cr.execute('SELECT qorlia_validation_receipts FROM stock_picking WHERE id = %s', [picking.id])
        receipts = self.env.cr.fetchone()[0] or {}
        action = self._qorlia_step_action(order_id, continuation_key, receipts)
        if action is not None:
            wizard, descriptor = picking._qorlia_validation_wizard(action)
            if not action.get('res_id') or wizard.id != action['res_id']:
                raise UserError('The saved native prompt is unavailable. Reload validation.')
            if descriptor['kind'] != decisions[0]['kind']:
                raise ValidationError('Use the decision for this exact native prompt.')
        tables = picking._qorlia_validation_tables()
        stamp = picking._qorlia_confirmation_stamp(tables)
        cr = self.env.cr
        hooks = {name: getattr(cr, name) for name in ('precommit', 'postcommit', 'prerollback', 'postrollback')}
        try:
            for name in hooks:
                setattr(cr, name, tools.Callbacks())
            with closing(cr.savepoint()):
                effects, private, state, next_step, _references, _action = picking._qorlia_validation_native(
                    decisions, start_action=action, include_action=True)
                if next_step and next_step['blocked_reason']:
                    raise UserError(next_step['blocked_reason'])
                result = {'order_id': order_id, 'transfer_id': transfer_id, 'version': version,
                    'continuation_key': continuation_key, 'decisions': decisions,
                    'next_step': next_step, 'terminal': next_step is False, 'state_after': state,
                    'effects': effects, 'write_ready': True,
                    'review_version': picking._qorlia_step_signature(request, effects, private, state, next_step)}
        finally:
            for name, callbacks in hooks.items():
                setattr(cr, name, callbacks)
            self.env.invalidate_all()
        if picking._qorlia_confirmation_stamp(tables) != stamp:
            raise UserError('Native state changed during step preview. Reload it.')
        return result

    @api.model
    def qorlia_validation_step_status(self, payload):
        self = self.with_context({key: self.env.context[key] for key in ('allowed_company_ids', 'lang', 'tz') if key in self.env.context})
        request, digest = self._qorlia_step_request(payload)
        picking, _order = self._qorlia_reservation_transfer(request['order_id'], request['transfer_id'])
        receipt, _receipts = picking._qorlia_validation_receipt(request, digest)
        result = self._qorlia_validation_response(request, picking, receipt)
        next_step, reason = False, False
        if receipt and receipt['next_action'] and not receipt.get('consumed_by'):
            try:
                picking._qorlia_validation_access()
                action = self._qorlia_step_action(request['order_id'], request['request_key'], _receipts)
                _wizard, next_step = picking._qorlia_validation_wizard(action)
            except (AccessError, UserError):
                reason = 'The saved native prompt is unavailable or no longer permitted. Reload validation.'
        elif receipt and receipt.get('consumed_by'):
            reason = 'This native prompt was already processed. Recover the later exact request if its outcome is unknown.'
        result.update(next_step=next_step, continuation_key=request['request_key'] if next_step else False,
            continuation_reason=reason, terminal=not receipt['next_action'] if receipt else False)
        return result

    @api.model
    def qorlia_validation_step_save(self, payload):
        self = self.with_context({key: self.env.context[key] for key in ('allowed_company_ids', 'lang', 'tz') if key in self.env.context})
        request, digest = self._qorlia_step_request(payload)
        picking, _order = self._qorlia_reservation_transfer(request['order_id'], request['transfer_id'])
        if picking._qorlia_validation_receipt(request, digest)[0]:
            return self.qorlia_validation_step_status(request)
        self.env.cr.flush()
        for table in picking._qorlia_validation_tables():
            self.env.cr.execute(sql.SQL('LOCK TABLE {} IN SHARE ROW EXCLUSIVE MODE').format(sql.Identifier(table)))
        self.env.invalidate_all()
        picking, _order = self._qorlia_reservation_transfer(request['order_id'], request['transfer_id'])
        receipt, receipts = picking._qorlia_validation_receipt(request, digest)
        if receipt:
            return self.qorlia_validation_step_status(request)
        review = self.qorlia_validation_step_preview(request['order_id'], request['transfer_id'], request['version'],
            request['continuation_key'], request['decisions'])
        if not hmac.compare_digest(review['review_version'], request['review_version']):
            raise UserError('Native step effects changed. Review them again before saving.')
        action = self._qorlia_step_action(request['order_id'], request['continuation_key'], receipts)
        cr = self.env.cr
        hooks = {name: (getattr(cr, name), list(getattr(cr, name)._funcs), copy.deepcopy(getattr(cr, name).data))
            for name in ('precommit', 'postcommit', 'prerollback', 'postrollback')}
        try:
            with cr.savepoint():
                effects, private, state, next_step, references, next_action = picking._qorlia_validation_native(
                    request['decisions'], start_action=action, include_action=True)
                actual = picking._qorlia_step_signature(request, effects, private, state, next_step)
                if not hmac.compare_digest(actual, request['review_version']):
                    raise UserError('Native step changed unreviewed effects. Nothing was saved.')
                if request['continuation_key']:
                    receipts[request['continuation_key']]['consumed_by'] = request['request_key']
                receipts[request['request_key']] = {'hash': digest, 'author': self.env.uid,
                    'companies': self.env.companies.ids, 'order_id': request['order_id'],
                    'kind': 'validation_step', 'state': state, 'references': references, 'next_action': next_action}
                picking.with_context(qorlia_validation_receipt_token=_RECEIPT_TOKEN)._qorlia_validation_record_receipt(receipts)
                cr.flush()
                self.env.invalidate_all()
                response = self.qorlia_validation_step_status(request)
            return response
        except Exception:
            for name, (callbacks, functions, data) in hooks.items():
                setattr(cr, name, callbacks)
                callbacks.clear()
                for function in functions:
                    callbacks.add(function)
                callbacks.data.update(data)
            raise
