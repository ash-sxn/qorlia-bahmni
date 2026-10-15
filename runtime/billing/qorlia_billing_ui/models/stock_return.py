# SPDX-License-Identifier: LGPL-3.0-or-later
# Copyright 2026 Qorlia contributors.
from contextlib import closing
import math

from odoo import api, models, tools
from odoo.exceptions import AccessError, UserError, ValidationError

from .order_deliveries import _label
from .stock_confirmation import AUDIT_MODELS, FINANCIAL_MODELS
from .stock_validation import VALIDATION_MODELS, VALIDATION_CONFIG


class StockReturn(models.Model):
    _inherit = 'stock.picking'

    def _qorlia_return_tables(self):
        return sorted(set(self._qorlia_validation_tables()) | {
            self.env[name]._table for name in ('stock.return.picking', 'stock.return.picking.line')})

    def _qorlia_return_form(self):
        self.ensure_one()
        if self.state != 'done':
            raise UserError('Only a completed native transfer can be returned.')
        model = self.env['stock.return.picking'].with_context(
            active_model='stock.picking', active_id=self.id, active_ids=self.ids)
        model.check_access_rights('create')
        model.check_field_access_rights('read', ['picking_id', 'location_id',
            'original_location_id', 'move_dest_exists', 'product_return_moves'])
        line_model = self.env['stock.return.picking.line']
        line_model.check_access_rights('create')
        line_model.check_field_access_rights('read', ['product_id', 'quantity', 'uom_id', 'move_id', 'to_refund'])
        form = model.new(model.default_get(['picking_id', 'product_return_moves', 'location_id']))
        # Use the installed native default/onchange chain, not the original order's demand.
        form._onchange_picking_id()
        return form

    def _qorlia_return_snapshot(self, form):
        return {'location': _label(form.location_id),
            'location_editable': self.env.user.has_group('stock.group_stock_multi_locations'),
            'show_units': self.env.user.has_group('uom.group_uom'),
            'chained_move_warning': bool(form.move_dest_exists),
            'lines': [{'move_id': row.move_id.id, 'product': _label(row.product_id),
                'quantity': row.quantity, 'unit': _label(row.uom_id),
                'updates_order_quantities': bool(row.to_refund)} for row in form.product_return_moves]}

    @api.model
    def qorlia_return_load(self, order_id, transfer_id):
        self = self.with_context({key: self.env.context[key]
            for key in ('allowed_company_ids', 'lang', 'tz') if key in self.env.context})
        picking, _order = self._qorlia_reservation_transfer(order_id, transfer_id)
        self.env.flush_all()
        self.env.cr.flush()
        view, reason = False, False
        try:
            view = picking._qorlia_return_snapshot(picking._qorlia_return_form())
        except (AccessError, UserError) as error:
            reason = str(error)
        graph = picking._qorlia_reservation_graph(order_id)
        stamp = picking._qorlia_confirmation_stamp(picking._qorlia_return_tables())
        version = picking._qorlia_confirmation_version(order_id, {'graph': graph, 'form': view}, stamp)
        return {'order_id': order_id, 'transfer_id': transfer_id, 'graph': graph,
            'form': view, 'reason': reason, 'version': version, 'write_ready': False}

    def _qorlia_return_location_domain(self, form):
        return ['|', ('id', '=', form.original_location_id.id), '&', ('return_location', '=', True),
            '|', ('company_id', '=', False), ('company_id', '=', self.company_id.id)]

    @api.model
    def qorlia_return_locations(self, order_id, transfer_id, version, query='', after=0, limit=25):
        self = self.with_context({key: self.env.context[key]
            for key in ('allowed_company_ids', 'lang', 'tz') if key in self.env.context})
        if (not isinstance(query, str) or len(query) > 200 or type(after) is not int or after < 0
                or type(limit) is not int or not 1 <= limit <= 100):
            raise ValidationError('Use a bounded native return-location search.')
        loaded = self.qorlia_return_load(order_id, transfer_id)
        if loaded['reason']:
            raise UserError(loaded['reason'])
        if loaded['version'] != version:
            raise UserError('The transfer or return configuration changed. Reload the form.')
        picking, _order = self._qorlia_reservation_transfer(order_id, transfer_id)
        if not self.env.user.has_group('stock.group_stock_multi_locations'):
            raise AccessError('Changing return locations requires the native multi-location role.')
        form = picking._qorlia_return_form()
        model = self.env['stock.location']
        model.check_access_rights('read')
        model.check_field_access_rights('read', ['complete_name', 'company_id', 'return_location'])
        rows = model.search(picking._qorlia_return_location_domain(form) +
            [('id', '>', after), ('complete_name', 'ilike', query)], order='id', limit=limit + 1)
        return {'rows': [_label(row) for row in rows[:limit]],
            'next_after': rows[limit - 1].id if len(rows) > limit else False}

    def _qorlia_return_edited_form(self, location_id, lines):
        if (type(location_id) is not int or location_id <= 0 or not isinstance(lines, list)
                or len(lines) > 500):
            raise ValidationError('Use saved return moves, a native location and finite quantities.')
        form = self._qorlia_return_form()
        default_location = form.location_id.id
        if (location_id != default_location and
                not self.env.user.has_group('stock.group_stock_multi_locations')):
            raise AccessError('This account cannot change the native return location.')
        location = self.env['stock.location'].browse(location_id).exists()
        location.check_access_rights('read')
        location.check_access_rule('read')
        location.check_field_access_rights('read', ['company_id', 'return_location'])
        if not location or not self.env['stock.location'].search_count(
                self._qorlia_return_location_domain(form) + [('id', '=', location_id)]):
            raise ValidationError('Select a location from the native return-location domain.')
        by_move = {row.move_id.id: row for row in form.product_return_moves}
        quantities = {}
        for row in lines:
            if (not isinstance(row, dict) or set(row) != {'move_id', 'quantity'}
                    or type(row['move_id']) is not int or row['move_id'] not in by_move
                    or row['move_id'] in quantities or type(row['quantity']) not in (int, float)):
                raise ValidationError('Use each original return move at most once with its native quantity.')
            try:
                finite = math.isfinite(row['quantity'])
            except OverflowError:
                finite = False
            if not finite:
                raise ValidationError('Use a finite native return quantity.')
            quantities[row['move_id']] = row['quantity']
        form.location_id = location
        form.product_return_moves = form.product_return_moves.filtered(lambda row: row.move_id.id in quantities)
        for row in form.product_return_moves:
            row.quantity = quantities[row.move_id.id]
        form._check_company()
        return form

    def _qorlia_return_native_preview(self, form):
        self._track_prepare(self._fields)
        before = self._qorlia_confirmation_capture(VALIDATION_MODELS)
        config_tables = sorted({self.env[name]._table for name in VALIDATION_CONFIG if name not in VALIDATION_MODELS})
        config = self._qorlia_confirmation_stamp(config_tables, semantic=True)
        finance_tables = [self.env[name]._table for name in FINANCIAL_MODELS
            if name not in ('sale.order', 'sale.order.line')]
        finance = self._qorlia_confirmation_stamp(finance_tables, semantic=True)
        wizard = form.create(form._convert_to_write(form._cache))
        action = wizard.create_returns()
        if (not isinstance(action, dict) or action.get('type') != 'ir.actions.act_window'
                or action.get('res_model') != 'stock.picking' or type(action.get('res_id')) is not int):
            raise UserError('This native return action needs an additional integration.')
        returned = self.browse(action['res_id']).exists()
        returned.check_access_rights('read')
        returned.check_access_rule('read')
        if not returned or returned.company_id != self.company_id or returned.state in ('done', 'cancel'):
            raise UserError('Native return creation produced an unexpected transfer state or company.')
        self.env.flush_all()
        self.env.cr.flush()
        after = self._qorlia_confirmation_capture(VALIDATION_MODELS)
        if config != self._qorlia_confirmation_stamp(config_tables, semantic=True):
            raise UserError('Creating the return changed unreviewed native configuration.')
        if finance != self._qorlia_confirmation_stamp(finance_tables, semantic=True):
            raise UserError('Creating the return changed financial records before its validation.')
        delivered = lambda snapshot: {identifier: row['qty_delivered']
            for identifier, row in snapshot[0]['sale.order.line'].items()}
        if delivered(before) != delivered(after):
            raise UserError('Creating the return changed delivered quantities before its validation.')
        physical = lambda snapshot: {identifier: (row['product_id'], row['location_id'], row['lot_id'],
            row['package_id'], row['owner_id'], row['quantity'])
            for identifier, row in snapshot[0]['stock.quant'].items() if row['quantity']}
        if physical(before) != physical(after):
            raise UserError('Creating the return moved physical stock before its validation.')
        effects, _private = self._qorlia_confirmation_effects(before, after, VALIDATION_MODELS,
            private_models=AUDIT_MODELS | set(FINANCIAL_MODELS) | {'account.full.reconcile', 'account.analytic.line'},
            private_counts_key='private_effect_counts')
        return effects, returned.state

    @api.model
    def qorlia_return_preview(self, order_id, transfer_id, version, location_id, lines):
        self = self.with_context({key: self.env.context[key]
            for key in ('allowed_company_ids', 'lang', 'tz') if key in self.env.context})
        if not isinstance(version, str) or len(version) != 64 or any(c not in '0123456789abcdef' for c in version):
            raise ValidationError('Reload and review the native return form.')
        picking, _order = self._qorlia_reservation_transfer(order_id, transfer_id, lock=True)
        loaded = self.qorlia_return_load(order_id, transfer_id)
        if loaded['version'] != version:
            raise UserError('The transfer, inventory or return configuration changed. Reload it.')
        if loaded['reason']:
            raise UserError(loaded['reason'])
        form = picking._qorlia_return_edited_form(location_id, lines)
        reviewed_form = picking._qorlia_return_snapshot(form)
        tables = picking._qorlia_return_tables()
        stamp = picking._qorlia_confirmation_stamp(tables)
        cr = self.env.cr
        hooks = {name: getattr(cr, name) for name in ('precommit', 'postcommit', 'prerollback', 'postrollback')}
        try:
            for name in hooks:
                setattr(cr, name, tools.Callbacks())
            with closing(cr.savepoint()):
                effects, state = picking._qorlia_return_native_preview(form)
        finally:
            for name, callbacks in hooks.items():
                setattr(cr, name, callbacks)
            self.env.invalidate_all()
        if picking._qorlia_confirmation_stamp(tables) != stamp:
            raise UserError('Native state changed during return preview. Reload the form.')
        return {'order_id': order_id, 'transfer_id': transfer_id, 'version': version,
            'form': reviewed_form, 'location_id': location_id, 'lines': lines,
            'return_state': state, 'effects': effects, 'write_ready': False}
