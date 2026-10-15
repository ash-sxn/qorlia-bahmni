# SPDX-License-Identifier: LGPL-3.0-or-later
# Copyright 2026 Qorlia contributors.
from contextlib import closing
import logging

from odoo import api, models, tools
from odoo.exceptions import AccessError, UserError, ValidationError

from .order_deliveries import _label
from .stock_confirmation import GRAPH_MODELS, CONFIG_MODELS, FINANCIAL_MODELS, AUDIT_MODELS


VALIDATION_MODELS = tuple(dict.fromkeys((*GRAPH_MODELS, 'product.template', 'ir.property',
    *FINANCIAL_MODELS, 'account.full.reconcile', 'account.analytic.line')))
VALIDATION_CONFIG = tuple(dict.fromkeys((*CONFIG_MODELS, 'account.journal', 'account.account',
    'account.analytic.plan', 'account.analytic.account', 'account.analytic.distribution.model')))
WIZARDS = {'stock.picking.validate.wizard': 'receipt', 'stock.immediate.transfer': 'immediate',
    'stock.backorder.confirmation': 'backorder', 'expiry.picking.confirmation': 'expiry',
    'confirm.stock.sms': 'sms'}
_PREVIEW_TOKEN = object()
_logger = logging.getLogger(__name__)


class StockValidation(models.Model):
    _inherit = 'stock.picking'

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
            'reason': reason, 'write_ready': False}

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
                picking = picking.with_context(qorlia_validation_preview_token=_PREVIEW_TOKEN)
                picking._track_prepare(picking._fields)
                config_tables = sorted({self.env[name]._table for name in VALIDATION_CONFIG if name not in VALIDATION_MODELS})
                configuration = picking._qorlia_confirmation_stamp(config_tables, semantic=True)
                before = picking._qorlia_confirmation_capture(VALIDATION_MODELS)
                action = picking.button_validate()
                next_step = False
                for index in range(len(decisions) + 1):
                    if action is True or action is None or action is False:
                        if index < len(decisions):
                            raise ValidationError('Native validation has no further decision to apply.')
                        break
                    wizard, descriptor = picking._qorlia_validation_wizard(action)
                    if index == len(decisions):
                        next_step = descriptor
                    else:
                        action = picking._qorlia_validation_choose(wizard, descriptor, decisions[index])
                self.env.flush_all()
                cr.flush()
                if picking._qorlia_confirmation_stamp(config_tables, semantic=True) != configuration:
                    raise UserError('Validation changed unreviewed native configuration. Nothing was saved.')
                after = picking._qorlia_confirmation_capture(VALIDATION_MODELS)
                effects, _private = picking._qorlia_confirmation_effects(before, after, VALIDATION_MODELS,
                    private_models=AUDIT_MODELS | set(FINANCIAL_MODELS) | {'account.full.reconcile', 'account.analytic.line'},
                    private_counts_key='private_effect_counts')
                result = {'order_id': order_id, 'transfer_id': transfer_id, 'version': version,
                    'decisions': decisions, 'next_step': next_step, 'terminal': next_step is False,
                    'state_after': picking.state, 'effects': effects, 'write_ready': False}
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
