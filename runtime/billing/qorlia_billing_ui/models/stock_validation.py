# SPDX-License-Identifier: LGPL-3.0-or-later
# Copyright 2026 Qorlia contributors.
from contextlib import closing
import copy
import hmac
import logging
import uuid

from psycopg2 import sql
from psycopg2.extras import Json
from odoo import api, fields, models, tools
from odoo.exceptions import AccessError, UserError, ValidationError

from .order_deliveries import _label
from .invoice_draft import _digest
from .stock_confirmation import GRAPH_MODELS, CONFIG_MODELS, FINANCIAL_MODELS, AUDIT_MODELS


VALIDATION_MODELS = tuple(dict.fromkeys((*GRAPH_MODELS, 'product.template', 'ir.property',
    *FINANCIAL_MODELS, 'account.full.reconcile', 'account.analytic.line')))
VALIDATION_CONFIG = tuple(dict.fromkeys((*CONFIG_MODELS, 'account.journal', 'account.account',
    'account.analytic.plan', 'account.analytic.account', 'account.analytic.distribution.model')))
WIZARDS = {'stock.picking.validate.wizard': 'receipt', 'stock.immediate.transfer': 'immediate',
    'stock.backorder.confirmation': 'backorder', 'expiry.picking.confirmation': 'expiry',
    'confirm.stock.sms': 'sms'}
_PREVIEW_TOKEN = object()
_RECEIPT_TOKEN = object()
_logger = logging.getLogger(__name__)


class StockValidation(models.Model):
    _inherit = 'stock.picking'

    # shortcut: per-transfer receipts; move to indexed storage before high-volume fulfillment.
    qorlia_validation_receipts = fields.Json(copy=False, readonly=True, groups='base.group_system')

    @api.model_create_multi
    def create(self, values_list):
        if any('qorlia_validation_receipts' in row for row in values_list) or 'default_qorlia_validation_receipts' in self.env.context:
            raise AccessError('Validation receipts can only be recorded by a reviewed action.')
        return super().create(values_list)

    def write(self, values):
        if 'qorlia_validation_receipts' in values:
            raise AccessError('Validation receipts can only be recorded by a reviewed action.')
        return super().write(values)

    def _qorlia_validation_tables(self):
        tables = set(self._qorlia_confirmation_tables())
        for name in (*VALIDATION_MODELS, *VALIDATION_CONFIG,
                *WIZARDS, 'stock.immediate.transfer.line', 'stock.backorder.confirmation.line'):
            if name not in self.env:
                continue
            model = self.env[name]
            tables.add(model._table)
            tables.update(field.relation for field in model._fields.values()
                if field.type == 'many2many' and field.store and field.relation)
        return sorted(tables)

    def _qorlia_validation_access(self):
        self._qorlia_confirmation_access()
        if not self.env.user.has_group('stock.group_stock_user'):
            raise AccessError('Validation requires the native Stock User role.')
        self.check_field_access_rights('read', ['show_validate'])
        if not self.show_validate:
            raise UserError('Validate is not available in the current native transfer state.')

    @api.model
    def qorlia_validation_load(self, order_id, transfer_id):
        self = self.with_context({key: self.env.context[key] for key in ('allowed_company_ids', 'lang', 'tz') if key in self.env.context})
        self.env.flush_all()
        self.env.cr.flush()
        picking, _order = self._qorlia_reservation_transfer(order_id, transfer_id)
        reason = False
        try:
            picking._qorlia_validation_access()
        except (AccessError, UserError) as error:
            reason = str(error)
        graph = picking._qorlia_reservation_graph(order_id)
        self.env.flush_all()
        self.env.cr.flush()
        stamp = picking._qorlia_confirmation_stamp(picking._qorlia_validation_tables())
        return {'order_id': order_id, 'transfer_id': transfer_id, 'graph': graph,
            'version': picking._qorlia_confirmation_version(order_id, graph, stamp),
            'reason': reason, 'write_ready': True}

    def _send_confirmation_email(self):
        if self.env.context.get('qorlia_validation_preview_token') is _PREVIEW_TOKEN:
            # Native force-send email and immediate SMS cannot be undone by a database rollback.
            for picking in self:
                if picking.picking_type_id.code != 'outgoing':
                    continue
                company = picking.company_id
                if company.stock_move_email_validation or ('stock_move_sms_validation' in company._fields
                        and company.stock_move_sms_validation and (picking.partner_id.mobile or picking.partner_id.phone)):
                    raise UserError('External delivery notifications require a separately reviewed send contract. Nothing was sent or saved.')
        return super()._send_confirmation_email()

    def _qorlia_validation_wizard(self, action):
        if not isinstance(action, dict) or action.get('type') != 'ir.actions.act_window' or action.get('target') != 'new':
            raise UserError('This native validation action needs an additional integration before review.')
        name = action.get('res_model')
        if name not in WIZARDS or name not in self.env or not isinstance(action.get('context', {}), dict):
            raise UserError('This native validation wizard needs an additional integration before review.')
        context = dict(action.get('context', {}), qorlia_validation_preview_token=_PREVIEW_TOKEN)
        model = self.env[name].with_context(context)
        if action.get('res_id'):
            wizard = model.browse(action['res_id']).exists()
        else:
            wizard = model.create({})
        wizard.ensure_one()
        wizard.check_access_rights('read')
        wizard.check_access_rule('read')
        kind = WIZARDS[name]
        descriptor = {'kind': kind, 'title': str(action.get('name') or model._description),
            'transfers': [], 'lots': [], 'operations': [], 'blocked_reason': False}
        if kind == 'receipt':
            wizard.check_field_access_rights('read', ['picking_id', 'picking_code', 'move_lines', 'source_location', 'destination_location'])
            if wizard.picking_id != self:
                raise AccessError('The native validation review belongs to another transfer.')
            descriptor.update(source=_label(wizard.source_location), destination=_label(wizard.destination_location),
                picking_code=wizard.picking_code)
            lines = wizard.move_lines
            columns = ['product_id', 'product_uom_id', 'qty_done', 'lot_id', 'lot_name',
                'expiration_date', 'cost_price', 'sale_price', 'mrp', 'balance', 'is_move_line_lot_expiring_soon']
            if any(name not in lines._fields for name in columns):
                raise UserError('Installed receipt review fields differ from the reviewed native contract.')
            lines.check_access_rights('read')
            lines.check_access_rule('read')
            lines.check_field_access_rights('read', columns)
            if any(line.picking_id != self or line.company_id != self.company_id for line in lines):
                raise AccessError('A reviewed native operation belongs to another transfer or company.')
            for line in lines:
                row = {'id': line.id}
                for field_name in columns:
                    field = lines._fields[field_name]
                    value = line[field_name]
                    row[field_name] = _label(value) if field.type == 'many2one' else (
                        value.isoformat() if field.type in ('date', 'datetime') and value else value)
                if line.is_move_line_lot_expiring_soon:
                    warning = line.move_line_warning()
                    if warning.get('type') != 'ir.actions.client' or warning.get('tag') != 'display_notification':
                        raise UserError('This native batch warning requires an additional integration.')
                    row['expiry_warning'] = {key: warning['params'][key] for key in ('title', 'type', 'message')}
                else:
                    row['expiry_warning'] = False
                descriptor['operations'].append(row)
        elif kind in ('immediate', 'backorder'):
            relation, flag = ('immediate_transfer_line_ids', 'to_immediate') if kind == 'immediate' else ('backorder_confirmation_line_ids', 'to_backorder')
            wizard.check_field_access_rights('read', ['pick_ids', relation])
            lines = wizard[relation]
            lines.check_access_rights('read')
            lines.check_access_rule('read')
            lines.check_field_access_rights('read', ['picking_id', flag])
            if wizard.pick_ids != self or lines.picking_id != self or len(lines) != 1:
                raise UserError('Multi-transfer validation needs an additional scoped review.')
            descriptor['transfers'] = [{'transfer': _label(line.picking_id), 'selected': line[flag]} for line in lines]
        elif kind == 'expiry':
            wizard.check_field_access_rights('read', ['picking_ids', 'lot_ids', 'description'])
            if wizard.picking_ids != self:
                raise AccessError('The native expiry decision belongs to another transfer.')
            descriptor['lots'] = [_label(lot) for lot in wizard.lot_ids]
            descriptor['description'] = wizard.description
        else:
            descriptor['blocked_reason'] = 'This native choice changes company-wide SMS settings and may incur sending charges. Notification integration is not yet accepted.'
        return wizard, descriptor

    def _qorlia_validation_choose(self, wizard, descriptor, decision):
        kind = descriptor['kind']
        field = {'receipt': 'confirm', 'expiry': 'proceed', 'immediate': 'selected', 'backorder': 'selected'}.get(kind)
        if (not isinstance(decision, dict) or not field or set(decision) != {'kind', field}
                or decision['kind'] != kind or type(decision[field]) is not bool):
            raise ValidationError('Use the exact next native validation decision, without model, method, context or wizard identifiers.')
        if kind == 'receipt':
            if not decision[field]:
                raise ValidationError('Close the review to decline it. Do not replay an unconfirmed receipt.')
            return wizard.btn_confirm()
        if kind == 'expiry':
            return wizard.process() if decision[field] else wizard.process_no_expired()
        relation, flag = ('immediate_transfer_line_ids', 'to_immediate') if kind == 'immediate' else ('backorder_confirmation_line_ids', 'to_backorder')
        wizard[relation].write({flag: decision[field]})
        return wizard.process()

    def _qorlia_validation_prompt_label_access(self, wizard, descriptor):
        related = []
        if descriptor['kind'] == 'receipt':
            related = [wizard.source_location, wizard.destination_location,
                wizard.move_lines.product_id, wizard.move_lines.product_uom_id, wizard.move_lines.lot_id]
        elif descriptor['kind'] == 'expiry':
            related = [wizard.lot_ids]
        for records in related:
            records.check_access_rights('read')
            records.check_access_rule('read')
            records.check_field_access_rights('read', ['display_name'])

    def _qorlia_validation_native(self, decisions, *, start_action=None, include_action=False):
        # Apply the same external-send guard during preview and the exact reviewed save.
        self = self.with_context(qorlia_validation_preview_token=_PREVIEW_TOKEN)
        self._track_prepare(self._fields)
        config_tables = sorted({self.env[name]._table for name in VALIDATION_CONFIG if name not in VALIDATION_MODELS})
        configuration = self._qorlia_confirmation_stamp(config_tables, semantic=True)
        before = self._qorlia_confirmation_capture(VALIDATION_MODELS)
        started = fields.Datetime.now()
        action = self.button_validate() if start_action is None else copy.deepcopy(start_action)
        next_step = False
        for index in range(len(decisions) + 1):
            if action is True or action is None or action is False:
                if index < len(decisions):
                    raise ValidationError('Native validation has no further decision to apply.')
                break
            wizard, descriptor = self._qorlia_validation_wizard(action)
            if index == len(decisions):
                next_step = descriptor
                if include_action:
                    action = dict(action, res_id=wizard.id,
                        context={key: value for key, value in action.get('context', {}).items()
                            if key != 'qorlia_validation_preview_token'})
            else:
                action = self._qorlia_validation_choose(wizard, descriptor, decisions[index])
        self.env.flush_all()
        self.env.cr.flush()
        if self._qorlia_confirmation_stamp(config_tables, semantic=True) != configuration:
            raise UserError('Validation changed unreviewed native configuration. Nothing was saved.')
        after = self._qorlia_confirmation_capture(VALIDATION_MODELS)
        assigned = self._qorlia_validation_assigned(before, after, started, fields.Datetime.now())
        effects, private = self._qorlia_confirmation_effects(before, after, VALIDATION_MODELS,
            private_models=AUDIT_MODELS | set(FINANCIAL_MODELS) | {'account.full.reconcile', 'account.analytic.line'},
            private_counts_key='private_effect_counts', assigned_fields=assigned)
        references = {'new:%s:%s' % (name, index): {'model': name, 'id': identifier}
            for name in VALIDATION_MODELS if name not in AUDIT_MODELS
            for index, identifier in enumerate(sorted(set(after[0][name]) - set(before[0][name])))}
        result = effects, private, self.state, next_step, references
        return (*result, action if next_step else False) if include_action else result

    def _qorlia_validation_assigned(self, before, after, started, finished):
        original, current = before[0], after[0]
        assignments = {}
        prior_dates = {row.get('in_date') for row in original['stock.quant'].values()}
        for name, field in (('stock.picking', 'date_done'), ('stock.move', 'date'),
                ('stock.move.line', 'date'), ('stock.quant', 'in_date'), ('sale.order', 'effective_date')):
            for identifier, row in current[name].items():
                done = row.get('state') == 'done'
                if name == 'stock.move.line':
                    done = current['stock.move'].get(row.get('move_id'), {}).get('state') == 'done'
                if name == 'stock.quant':
                    done = row.get(field) not in prior_dates
                if name == 'sale.order':
                    done = any(picking.get('sale_id') == identifier and picking.get('state') == 'done'
                        and picking.get('date_done') == row.get(field) for picking in current['stock.picking'].values())
                try:
                    value = fields.Datetime.to_datetime(row[field].replace('T', ' ')) if row.get(field) else None
                except (TypeError, ValueError):
                    value = None
                if done and value and started <= value <= finished:
                    assignments.setdefault((name, identifier), set()).add(field)
        for identifier in set(current['account.move']) - set(original['account.move']):
            assignments.setdefault(('account.move', identifier), set()).add('name')
        return assignments

    def _qorlia_validation_signature(self, version, decisions, effects, private, state):
        return self._qorlia_confirmation_signature(version,
            {'action': 'validate', 'decisions': decisions, 'effects': effects}, private, state)

    @api.model
    def qorlia_validation_preview(self, order_id, transfer_id, version, decisions):
        self = self.with_context({key: self.env.context[key] for key in ('allowed_company_ids', 'lang', 'tz') if key in self.env.context})
        if (not isinstance(version, str) or len(version) != 64 or any(char not in '0123456789abcdef' for char in version)
                or not isinstance(decisions, list) or len(decisions) > 16):
            raise ValidationError('Reload the transfer and provide an ordered native validation review.')
        picking, _order = self._qorlia_reservation_transfer(order_id, transfer_id, lock=True)
        picking._qorlia_validation_access()
        current = self.qorlia_validation_load(order_id, transfer_id)
        if current['version'] != version:
            raise UserError('The transfer, inventory or native configuration changed. Reload it.')
        tables = picking._qorlia_validation_tables()
        stamp = picking._qorlia_confirmation_stamp(tables)
        cr = self.env.cr
        cr.flush()
        hooks = {name: getattr(cr, name) for name in ('precommit', 'postcommit', 'prerollback', 'postrollback')}
        try:
            for name in hooks:
                setattr(cr, name, tools.Callbacks())
            with closing(cr.savepoint()):
                effects, private, state, next_step, _references = picking._qorlia_validation_native(decisions)
                result = {'order_id': order_id, 'transfer_id': transfer_id, 'version': version,
                    'decisions': decisions, 'next_step': next_step, 'terminal': next_step is False,
                    'state_after': state, 'effects': effects, 'write_ready': next_step is False,
                    'review_version': picking._qorlia_validation_signature(version, decisions, effects, private, state)
                        if next_step is False else False}
        finally:
            for name, callbacks in hooks.items():
                setattr(cr, name, callbacks)
            self.env.invalidate_all()
        restored = picking._qorlia_confirmation_stamp(tables)
        if restored != stamp:
            _logger.warning('Validation preview rollback mismatch in tables: %s',
                ', '.join(name for name in tables if restored[name] != stamp[name]))
            raise UserError('Native state changed during validation preview. Reload it.')
        return result

    def _qorlia_validation_request(self, payload, allow_inventory=False):
        if not isinstance(payload, dict) or set(payload) != {'order_id', 'transfer_id', 'version', 'decisions', 'review_version', 'request_key'}:
            raise ValidationError('Use the exact reviewed validation request.')
        try:
            if ((not (allow_inventory and payload['order_id'] is False)
                    and (type(payload['order_id']) is not int or payload['order_id'] <= 0))
                    or type(payload['transfer_id']) is not int or payload['transfer_id'] <= 0
                    or any(not isinstance(payload[name], str) or len(payload[name]) != 64 or any(c not in '0123456789abcdef'
                        for c in payload[name]) for name in ('version', 'review_version'))
                    or not isinstance(payload['decisions'], list) or len(payload['decisions']) > 16
                    or str(uuid.UUID(payload['request_key'])) != payload['request_key']):
                raise ValueError()
            for decision in payload['decisions']:
                if not isinstance(decision, dict):
                    raise ValueError()
                field = {'receipt': 'confirm', 'expiry': 'proceed', 'immediate': 'selected', 'backorder': 'selected'}.get(decision.get('kind'))
                if (not field or set(decision) != {'kind', field} or type(decision[field]) is not bool
                        or decision['kind'] == 'receipt' and not decision[field]):
                    raise ValueError()
        except (ValueError, TypeError, AttributeError):
            raise ValidationError('Use valid identifiers, decisions and the exact validation request key.')
        request = copy.deepcopy(payload)
        return request, _digest({'request': request, 'author': self.env.uid, 'companies': self.env.companies.ids})

    def _qorlia_validation_receipt(self, request, digest):
        self.ensure_one()
        # Native scope is checked by the caller; the protected receipt field is not a client-readable document.
        self.env.cr.execute('SELECT qorlia_validation_receipts FROM stock_picking WHERE id = %s', [self.id])
        receipts = self.env.cr.fetchone()[0] or {}
        receipt = receipts.get(request['request_key'])
        if receipt and (receipt['hash'] != digest or receipt['author'] != self.env.uid):
            raise ValidationError('This identifier belongs to another validation request.')
        return receipt, receipts

    def _qorlia_validation_record_receipt(self, receipts):
        self.ensure_one()
        if self.env.context.get('qorlia_validation_receipt_token') is not _RECEIPT_TOKEN:
            raise AccessError('Validation receipts can only be recorded by a reviewed action.')
        # Fixed internal metadata update only, never an elevated stock/accounting write.
        self.env.cr.execute('UPDATE stock_picking SET qorlia_validation_receipts = %s, write_uid = %s, '
            'write_date = (now() at time zone \'UTC\') WHERE id = %s', [Json(receipts), self.env.uid, self.id])
        self.invalidate_recordset(['qorlia_validation_receipts', 'write_uid', 'write_date'])
        self.modified(['qorlia_validation_receipts'])

    @api.model
    def qorlia_validation_status(self, payload):
        self = self.with_context({key: self.env.context[key] for key in ('allowed_company_ids', 'lang', 'tz') if key in self.env.context})
        request, digest = self._qorlia_validation_request(payload)
        picking, _order = self._qorlia_reservation_transfer(request['order_id'], request['transfer_id'])
        receipt, _receipts = picking._qorlia_validation_receipt(request, digest)
        return self._qorlia_validation_response(request, picking, receipt)

    def _qorlia_validation_response(self, request, picking, receipt):
        references = {}
        for key, item in (receipt['references'].items() if receipt else []):
            record = self.env[item['model']].browse(item['id']).exists()
            available = False
            if record and record.check_access_rights('read', raise_exception=False):
                try:
                    record.check_access_rule('read')
                    available = True
                except AccessError:
                    pass
            references[key] = {'model': item['model'], 'id': item['id'] if available else False,
                'name': record.display_name if available else False, 'available': available}
        return {'accepted': bool(receipt), 'request_key': request['request_key'], 'references': references,
            'state_after': receipt['state'] if receipt else False,
            'current': self.qorlia_validation_load(request['order_id'], request['transfer_id'])}

    @api.model
    def qorlia_validation_save(self, payload):
        self = self.with_context({key: self.env.context[key] for key in ('allowed_company_ids', 'lang', 'tz') if key in self.env.context})
        request, digest = self._qorlia_validation_request(payload)
        picking, _order = self._qorlia_reservation_transfer(request['order_id'], request['transfer_id'])
        if picking._qorlia_validation_receipt(request, digest)[0]:
            return self.qorlia_validation_status(request)
        self.env.cr.flush()
        # shortcut: coarse locks cover graph phantoms; refine before concurrent hospital-scale fulfillment.
        for table in picking._qorlia_validation_tables():
            self.env.cr.execute(sql.SQL('LOCK TABLE {} IN SHARE ROW EXCLUSIVE MODE').format(sql.Identifier(table)))
        self.env.invalidate_all()
        picking, _order = self._qorlia_reservation_transfer(request['order_id'], request['transfer_id'])
        if picking._qorlia_validation_receipt(request, digest)[0]:
            return self.qorlia_validation_status(request)
        review = self.qorlia_validation_preview(request['order_id'], request['transfer_id'], request['version'], request['decisions'])
        if not review['terminal'] or not hmac.compare_digest(review['review_version'], request['review_version']):
            raise UserError('Native validation effects changed. Review them again before saving.')
        cr = self.env.cr
        hooks = {name: (getattr(cr, name), list(getattr(cr, name)._funcs), copy.deepcopy(getattr(cr, name).data))
            for name in ('precommit', 'postcommit', 'prerollback', 'postrollback')}
        try:
            with cr.savepoint():
                effects, private, state, next_step, references = picking._qorlia_validation_native(request['decisions'])
                actual = picking._qorlia_validation_signature(request['version'], request['decisions'], effects, private, state)
                if next_step is not False or not hmac.compare_digest(actual, request['review_version']):
                    raise UserError('Native validation changed unreviewed effects. Nothing was saved.')
                _receipt, receipts = picking._qorlia_validation_receipt(request, digest)
                receipts[request['request_key']] = {'hash': digest, 'author': self.env.uid, 'state': state, 'references': references}
                picking.with_context(qorlia_validation_receipt_token=_RECEIPT_TOKEN)._qorlia_validation_record_receipt(receipts)
                cr.flush()
                self.env.invalidate_all()
                response = self.qorlia_validation_status(request)
            return response
        except Exception:
            for name, (callbacks, functions, data) in hooks.items():
                setattr(cr, name, callbacks)
                callbacks.clear()
                for function in functions:
                    callbacks.add(function)
                callbacks.data.update(data)
            raise
