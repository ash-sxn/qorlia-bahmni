# SPDX-License-Identifier: LGPL-3.0-or-later
# Copyright 2026 Qorlia contributors.
import copy
import uuid
from contextlib import closing

from odoo import api, fields, models, tools
from odoo.exceptions import AccessError, UserError, ValidationError

from .invoice_draft import _digest
from .order_deliveries import _label


_RECEIPT_TOKEN = object()
_ACTIONS = {'assign': 'action_assign', 'unreserve': 'do_unreserve',
    'set_quantities': 'action_set_quantities_to_reservation', 'clear_quantities': 'action_clear_quantities_to_zero'}


class StockReservation(models.Model):
    _inherit = 'stock.picking'

    # shortcut: per-transfer JSON receipts; use a receipt table before high-volume fulfillment.
    qorlia_reservation_receipts = fields.Json(copy=False, readonly=True)

    @api.model_create_multi
    def create(self, values_list):
        if (any('qorlia_reservation_receipts' in values for values in values_list)
                or 'default_qorlia_reservation_receipts' in self.env.context):
            raise AccessError('Reservation receipts can only be recorded by a reviewed action.')
        return super().create(values_list)

    def write(self, values):
        if ('qorlia_reservation_receipts' in values
                and self.env.context.get('qorlia_reservation_receipt_token') is not _RECEIPT_TOKEN):
            raise AccessError('Reservation receipts can only be recorded by a reviewed action.')
        return super().write(values)

    def _qorlia_reservation_transfer(self, order_id, transfer_id, lock=False):
        if type(transfer_id) is not int or transfer_id <= 0:
            raise ValidationError('Select a saved stock transfer.')
        order = self.env['sale.order']._qorlia_order_transfer_data(order_id, transfer_id)
        if not any(row['id'] == transfer_id for row in order['rows']):
            raise UserError('This transfer is no longer linked to this order.')
        picking = self.browse(transfer_id).exists()
        if lock:
            self.env.cr.execute('SELECT id FROM res_company WHERE id = %s FOR UPDATE', [picking.company_id.id])
            self.env.cr.execute('SELECT id FROM stock_picking WHERE id = %s FOR UPDATE', [picking.id])
            self.env.invalidate_all()
            order = self.env['sale.order']._qorlia_order_transfer_data(order_id, transfer_id)
            if not any(row['id'] == transfer_id for row in order['rows']):
                raise UserError('The transfer order changed while locking. Reload it.')
        return picking, order

    def _qorlia_reservation_write_access(self, action='assign'):
        self.ensure_one()
        for records in (self, self.move_ids, self.move_line_ids):
            records.check_access_rights('write')
            records.check_access_rule('write')
        if action in ('set_quantities', 'clear_quantities'):
            if not self.env.user.has_group('stock.group_stock_user'):
                raise AccessError('Recorded stock quantity actions require the native Stock User role.')
            self.move_line_ids.check_field_access_rights('write', ['qty_done'])
        else:
            self.package_level_ids.check_access_rights('write')
            self.package_level_ids.check_access_rule('write')
            for records, operation in ((self.env['stock.move.line'], 'create'),
                    (self.move_line_ids, 'unlink'), (self.package_level_ids, 'unlink')):
                records.check_access_rights(operation)
                records.check_access_rule(operation)

    def _qorlia_reservation_apply(self, action):
        getattr(self, _ACTIONS[action])()

    def _qorlia_reservation_scope(self, lock=False):
        self.ensure_one()
        products = self.move_ids.product_id
        sources = self.move_ids.location_id | self.move_line_ids.location_id
        locations = sources
        for location in list(locations):
            parent = location.location_id
            while parent:
                locations |= parent
                parent = parent.location_id
        self.env.flush_all()
        # Match native source sublocations while detecting hidden quants before applying record rules.
        self.env.cr.execute('SELECT quant.id FROM stock_quant quant JOIN stock_location location ON location.id = quant.location_id '
            'WHERE quant.product_id IN %s AND (quant.company_id IS NULL OR quant.company_id = %s) '
            'AND (quant.location_id IN %s OR location.parent_path LIKE ANY(%s)) ORDER BY quant.id LIMIT 2001',
            [tuple(products.ids) or (0,), self.company_id.id, tuple(sources.ids) or (0,),
                [location.parent_path + '%' for location in sources if location.parent_path] or ['NO_SOURCE']])
        quants = self.env['stock.quant'].browse([row[0] for row in self.env.cr.fetchall()])
        if len(quants) > 2000:
            raise UserError('These products need full inventory paging before reservation review.')
        records = {'product.product': products, 'uom.uom': products.uom_id | self.move_ids.product_uom,
            'product.category': products.categ_id, 'stock.location': locations | quants.location_id,
            'stock.lot': quants.lot_id | self.move_line_ids.lot_id,
            'stock.quant': quants, 'stock.picking.type': self.picking_type_id}
        fields_by_model = {
            'product.product': ['type', 'tracking', 'uom_id', 'categ_id', 'active'],
            'uom.uom': ['rounding', 'factor', 'category_id', 'active'],
            'product.category': ['removal_strategy_id'],
            'stock.location': ['location_id', 'parent_path', 'usage', 'removal_strategy_id', 'company_id'],
            'stock.lot': ['product_id', 'company_id', 'expiration_date', 'removal_date', 'name'],
            'stock.quant': ['product_id', 'location_id', 'lot_id', 'package_id', 'owner_id', 'quantity', 'reserved_quantity', 'in_date', 'company_id'],
            'stock.picking.type': ['code', 'reservation_method', 'company_id', 'use_existing_lots', 'use_create_lots'],
        }
        result = {}
        for name, items in records.items():
            items = items.sorted('id')
            items.check_access_rights('read')
            items.check_access_rule('read')
            items.check_field_access_rights('read', fields_by_model[name])
            if lock and items:
                self.env.cr.execute('SELECT id FROM %s WHERE id IN %%s ORDER BY id FOR UPDATE' % items._table, [tuple(items.ids)])
                items.invalidate_recordset()
            for field_name in fields_by_model[name]:
                if items._fields[field_name].type == 'many2one':
                    related = items.mapped(field_name)
                    if related:
                        related.check_access_rights('read')
                        related.check_access_rule('read')
            result[name] = items.read(['write_date', *fields_by_model[name]])
            if name == 'stock.quant':
                for item, row in zip(items, result[name]):
                    row['unit'] = _label(item.product_id.uom_id)
        return result

    def _qorlia_reservation_graph(self, order_id, original_lines=None, original_packages=None):
        data = self.env['sale.order']._qorlia_order_transfer_data(order_id, self.id)
        row = next((row for row in data['rows'] if row['id'] == self.id), None)
        if row is None:
            raise UserError('This transfer is no longer linked to the order.')
        if original_lines is not None:
            for operation in row['operations']:
                if operation['id'] not in original_lines:
                    operation['id'] = False
            row['operations'].sort(key=lambda item: _digest(item))
        packages = self.package_level_ids
        packages.check_access_rights('read')
        packages.check_access_rule('read')
        package_fields = ['package_id', 'location_id', 'location_dest_id', 'state', 'company_id']
        packages.check_field_access_rights('read', package_fields)
        if any(item.company_id != self.company_id for item in packages):
            raise AccessError('A linked package operation belongs to another company.')
        packages = [{'id': item.id if original_packages is None or item.id in original_packages else False,
            'state': item.state, **{name: _label(item[name]) for name in package_fields if name != 'state'}} for item in packages]
        packages.sort(key=lambda item: _digest(item))
        return {'transfer': row, 'packages': packages}

    @api.model
    def qorlia_transfer_load(self, order_id, transfer_id):
        picking, order = self._qorlia_reservation_transfer(order_id, transfer_id)
        reason = False
        configuration = {}
        try:
            configuration = picking._qorlia_reservation_scope()
        except (AccessError, UserError) as error:
            reason = str(error)
        graph = picking._qorlia_reservation_graph(order_id)
        available = {'assign': picking.show_check_availability,
            'unreserve': not picking.immediate_transfer and picking.picking_type_id.code != 'incoming'
                and (picking.state == 'assigned' if picking.move_type != 'one' else picking.state in ('assigned', 'confirmed')),
            'set_quantities': picking.show_set_qty_button, 'clear_quantities': picking.show_clear_qty_button}
        labels = {'assign': 'Check availability', 'unreserve': 'Unreserve',
            'set_quantities': 'Set quantities', 'clear_quantities': 'Clear quantities'}
        reasons = {}
        for action in _ACTIONS:
            denied = reason
            if not denied:
                try:
                    picking._qorlia_reservation_write_access(action)
                except AccessError as error:
                    denied = str(error)
            reasons[action] = denied or (False if available[action]
                else '%s is not available in the current native transfer state.' % labels[action])
        return {'order_id': order_id, 'transfer_id': transfer_id, 'graph': graph,
            'version': _digest({'order_version': order['version'], 'graph': graph, 'configuration': configuration,
                'author': self.env.uid, 'companies': self.env.companies.ids}),
            'reasons': reasons}

    def _qorlia_reservation_prepare(self, order_id, transfer_id, version, action):
        if not isinstance(action, str) or action not in _ACTIONS or not isinstance(version, str) or len(version) != 64:
            raise ValidationError('Select a supported reservation action and reload the transfer.')
        picking, _order = self._qorlia_reservation_transfer(order_id, transfer_id, lock=True)
        picking._qorlia_reservation_write_access(action)
        configuration = picking._qorlia_reservation_scope(lock=True)
        for items in (picking.move_ids, picking.move_line_ids, picking.package_level_ids):
            if items:
                self.env.cr.execute('SELECT id FROM %s WHERE id IN %%s ORDER BY id FOR UPDATE' % items._table, [tuple(sorted(items.ids))])
        self.env.invalidate_all()
        current = self.qorlia_transfer_load(order_id, transfer_id)
        if current['version'] != version:
            raise UserError('The transfer or inventory changed. Reload and review it again.')
        if current['reasons'][action]:
            raise UserError(current['reasons'][action])
        original_lines = set(picking.move_line_ids.ids)
        original_packages = set(picking.package_level_ids.ids)
        before = picking._qorlia_reservation_graph(order_id, original_lines, original_packages)
        cr = self.env.cr
        cr.flush()
        hooks = {name: getattr(cr, name) for name in ('postcommit', 'prerollback', 'postrollback')}
        try:
            for name in hooks:
                setattr(cr, name, tools.Callbacks())
            with closing(cr.savepoint()):
                picking._qorlia_reservation_apply(action)
                cr.flush()
                after = picking._qorlia_reservation_graph(order_id, original_lines, original_packages)
                stock = picking._qorlia_reservation_scope()
                quantities = lambda scope: [(row['id'], row['quantity']) for row in scope['stock.quant']]
                if quantities(stock) != quantities(configuration) or picking.state in ('done', 'cancel'):
                    raise UserError('This native action changed unreviewed stock quantities or completed the transfer. Nothing was saved.')
                values = lambda scope: [{key: value for key, value in row.items() if key != 'write_date'}
                    for row in scope['stock.quant']]
                effect = {'before': before, 'after': after,
                    'quant_before': values(configuration), 'quant_after': values(stock)}
        finally:
            for name, callbacks in hooks.items():
                setattr(cr, name, callbacks)
            self.env.invalidate_all()
        review = {'order_id': order_id, 'transfer_id': transfer_id, 'version': version,
            'action': action, **effect, 'review_version': _digest({'version': version, 'action': action, 'effect': effect, 'author': self.env.uid})}
        return picking, review, original_lines, original_packages

    @api.model
    def qorlia_transfer_preview(self, order_id, transfer_id, version, action):
        return self._qorlia_reservation_prepare(order_id, transfer_id, version, action)[1]

    def _qorlia_reservation_request(self, order_id, transfer_id, version, action, review_version, request_key):
        try:
            if (action not in _ACTIONS or type(order_id) is not int or order_id <= 0
                    or type(transfer_id) is not int or transfer_id <= 0
                    or any(not isinstance(value, str) or len(value) != 64 or any(char not in '0123456789abcdef' for char in value)
                        for value in (version, review_version)) or str(uuid.UUID(request_key)) != request_key):
                raise ValueError()
        except (ValueError, TypeError, AttributeError):
            raise ValidationError('Use an exact reviewed reservation request.')
        return _digest({'order_id': order_id, 'transfer_id': transfer_id, 'version': version,
            'action': action, 'review_version': review_version, 'author': self.env.uid, 'companies': self.env.companies.ids})

    def _qorlia_reservation_receipt(self, key, digest):
        receipt = (self.qorlia_reservation_receipts or {}).get(key)
        if receipt and (receipt['hash'] != digest or receipt['author'] != self.env.uid):
            raise ValidationError('This identifier belongs to another reservation request.')
        return receipt

    @api.model
    def qorlia_transfer_status(self, order_id, transfer_id, version, action, review_version, request_key):
        digest = self._qorlia_reservation_request(order_id, transfer_id, version, action, review_version, request_key)
        picking, _order = self._qorlia_reservation_transfer(order_id, transfer_id)
        return {'accepted': bool(picking._qorlia_reservation_receipt(request_key, digest)),
            'request_key': request_key, 'action': action, 'current': self.qorlia_transfer_load(order_id, transfer_id)}

    @api.model
    def qorlia_transfer_run(self, order_id, transfer_id, version, action, review_version, request_key):
        digest = self._qorlia_reservation_request(order_id, transfer_id, version, action, review_version, request_key)
        picking, _order = self._qorlia_reservation_transfer(order_id, transfer_id, lock=True)
        if picking._qorlia_reservation_receipt(request_key, digest):
            return self.qorlia_transfer_status(order_id, transfer_id, version, action, review_version, request_key)
        picking, review, original_lines, original_packages = self._qorlia_reservation_prepare(order_id, transfer_id, version, action)
        if review['review_version'] != review_version:
            raise UserError('Review the current native reservation effects again before saving.')
        hooks = {name: (getattr(self.env.cr, name), list(getattr(self.env.cr, name)._funcs), copy.deepcopy(getattr(self.env.cr, name).data))
            for name in ('postcommit', 'prerollback', 'postrollback')}
        try:
            with self.env.cr.savepoint():
                picking._qorlia_reservation_apply(action)
                self.env.cr.flush()
                after = picking._qorlia_reservation_graph(order_id, original_lines, original_packages)
                stock = [{key: value for key, value in row.items() if key != 'write_date'}
                    for row in picking._qorlia_reservation_scope()['stock.quant']]
                if after != review['after'] or stock != review['quant_after']:
                    raise UserError('Native reservation changed unreviewed effects. Nothing was saved.')
                receipts = dict(picking.qorlia_reservation_receipts or {})
                receipts[request_key] = {'hash': digest, 'author': self.env.uid}
                picking.with_context(qorlia_reservation_receipt_token=_RECEIPT_TOKEN).write({'qorlia_reservation_receipts': receipts})
                # The receipt write can defer write_date; return the flushed version used by the next HTTP request.
                self.env.flush_all()
                self.env.invalidate_all()
                response = self.qorlia_transfer_status(order_id, transfer_id, version, action, review_version, request_key)
            return response
        except Exception:
            for name, (callbacks, functions, data) in hooks.items():
                setattr(self.env.cr, name, callbacks)
                callbacks.clear()
                for function in functions:
                    callbacks.add(function)
                callbacks.data.update(data)
            raise
