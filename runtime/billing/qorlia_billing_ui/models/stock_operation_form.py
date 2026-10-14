# SPDX-License-Identifier: LGPL-3.0-or-later
# Copyright 2026 Qorlia contributors.
from contextlib import closing

from odoo import api, fields, models, tools
from odoo.exceptions import AccessError, UserError, ValidationError

from .invoice_draft import _digest
from .order_deliveries import _label


OPERATION_FIELDS = ('qty_done', 'product_uom_id', 'lot_id', 'lot_name', 'existing_lot_id',
    'expiration_date', 'location_id', 'location_dest_id', 'package_id', 'result_package_id',
    'owner_id', 'cost_price', 'sale_price', 'mrp')
IDENTITY_FIELDS = ('picking_id', 'move_id', 'product_id', 'company_id')
GROUPS = {'units': 'uom.group_uom', 'lots': 'stock.group_production_lot',
    'locations': 'stock.group_stock_multi_locations', 'packages': 'stock.group_tracking_lot',
    'owners': 'stock.group_tracking_owner'}


class StockOperationForm(models.Model):
    _inherit = 'stock.picking'

    def _qorlia_operation_source(self, order_id, transfer_id, move_id, operation_id=False):
        if (type(move_id) is not int or move_id <= 0 or operation_id is not False
                and (type(operation_id) is not int or operation_id <= 0)):
            raise ValidationError('Select a native stock move and operation.')
        if not self.env.user.has_group('stock.group_stock_user'):
            raise AccessError('Stock operation forms require the native Stock User role.')
        picking, _order = self._qorlia_reservation_transfer(order_id, transfer_id)
        loaded = self.qorlia_transfer_load(order_id, transfer_id)
        picking._qorlia_reservation_scope()
        if not any(item['id'] == move_id for item in loaded['graph']['transfer']['moves']):
            raise ValidationError('This move does not belong to the selected order transfer.')
        move = self.env['stock.move'].browse(move_id)
        line = self.env['stock.move.line'].browse(operation_id).exists() if operation_id else self.env['stock.move.line']
        for records in (move, line):
            records.check_access_rights('read')
            records.check_access_rule('read')
        if operation_id and (not line or line.picking_id != picking or line.move_id != move):
            raise ValidationError('This operation does not belong to the selected move and transfer.')
        line.check_field_access_rights('read', OPERATION_FIELDS + IDENTITY_FIELDS + ('reserved_uom_qty', 'balance'))
        groups = {name: self.env.user.has_group(group) for name, group in GROUPS.items()}
        # Mirror stock.move.action_show_details context without its serial-number write.
        tracked = move.product_id.tracking != 'none'
        context = dict(default_picking_id=picking.id, default_move_id=move.id,
            default_product_id=move.product_id.id, default_company_id=picking.company_id.id,
            default_product_uom_id=move.product_uom.id, default_location_id=move.location_id.id,
            default_location_dest_id=move.location_dest_id.id,
            show_lots_m2o=tracked and bool(move.picking_type_id.use_existing_lots or move.state == 'done' or move.origin_returned_move_id),
            show_lots_text=tracked and move.picking_type_id.use_create_lots and not move.picking_type_id.use_existing_lots
                and move.state != 'done' and not move.origin_returned_move_id,
            show_owner=move.picking_type_id.code != 'incoming',
            show_source_location=move.picking_type_id.code != 'incoming',
            show_destination_location=move.picking_type_id.code != 'outgoing',
            show_package=move.location_id.usage != 'supplier')
        model = line.with_context(**context)
        values = self.env['sale.order']._qorlia_read_fields(line, OPERATION_FIELDS) if line else model.default_get(OPERATION_FIELDS)
        identity = {'picking_id': picking.id, 'move_id': move.id, 'product_id': move.product_id.id, 'company_id': picking.company_id.id}
        form = model.new({**identity, **values}, origin=line if line else None)
        values = self.env['sale.order']._qorlia_read_fields(form, OPERATION_FIELDS)
        values['balance'] = line.balance if line else 0
        configuration = {'groups': groups, 'context': context, 'picking': picking.read(['write_date', 'is_locked']),
            'move': move.read(['write_date', 'state', 'origin_returned_move_id']),
            'product': move.product_id.read(['write_date', 'tracking', 'use_expiration_date', 'expiration_time']),
            'type': move.picking_type_id.read(['write_date', 'use_existing_lots', 'use_create_lots', 'show_entire_packs'])}
        version = _digest({'source': loaded['version'], 'operation_id': operation_id,
            'values': values, 'configuration': configuration})
        return picking, move, line, model, identity, values, groups, version

    def _qorlia_operation_rules(self, picking, move, line, form, groups, context):
        packed = bool(line.package_level_id and move.picking_type_entire_packs)
        visible = {name: True for name in OPERATION_FIELDS}
        visible.update(product_uom_id=groups['units'], lot_id=groups['lots'] and context['show_lots_m2o'],
            lot_name=groups['lots'] and context['show_lots_text'], existing_lot_id=groups['lots'] and context['show_lots_text'],
            expiration_date=bool(move.product_id.use_expiration_date and move.picking_type_id.code == 'incoming'),
            location_id=groups['locations'] and context['show_source_location'],
            location_dest_id=groups['locations'] and context['show_destination_location'],
            package_id=groups['packages'] and context['show_package'], result_package_id=groups['packages'],
            owner_id=groups['owners'] and context['show_owner'])
        for name in ('cost_price', 'sale_price', 'mrp'):
            visible[name] = context['show_lots_text']
        reason = False
        if move.state in ('done', 'cancel'):
            reason = 'Completed or cancelled operations need a separate native stock correction workflow.'
        try:
            for records in (picking, move):
                records.check_access_rights('write')
                records.check_access_rule('write')
            model = line if line else self.env['stock.move.line']
            model.check_access_rights('write' if line else 'create')
            model.check_access_rule('write' if line else 'create')
        except AccessError as error:
            reason = str(error)
        package_locked = {'qty_done', 'product_uom_id', 'lot_id', 'lot_name', 'location_id',
            'location_dest_id', 'package_id', 'result_package_id', 'owner_id'}
        rules = {name: {'visible': bool(visible[name]), 'readonly': bool(reason or not visible[name]
                or packed and name in package_locked)}
            for name in OPERATION_FIELDS}
        rules['product_uom_id']['readonly'] |= bool(line and line.reserved_uom_qty)
        rules['lot_name']['readonly'] |= bool(form.existing_lot_id)
        rules['expiration_date']['readonly'] |= bool(move.picking_type_id.use_existing_lots or form.existing_lot_id)
        for name in OPERATION_FIELDS:
            try:
                model = line if line else self.env['stock.move.line']
                model.check_field_access_rights('write', [name])
            except AccessError:
                rules[name]['readonly'] = True
        return rules, reason

    def _qorlia_operation_snapshot(self, source, form, warning=False):
        picking, move, line, model, identity, values, groups, version = source
        labels = {}
        for name in OPERATION_FIELDS:
            if form._fields[name].type == 'many2one' and form[name]:
                record = form[name]._origin or form[name]
                labels[name] = _label(record)
        rules, reason = self._qorlia_operation_rules(picking, move, line, form, groups, model.env.context)
        return {'order_id': picking.sale_id.id, 'transfer_id': picking.id, 'move_id': move.id,
            'operation_id': line.id or False, 'version': version, 'product': _label(move.product_id),
            'state': move.state, 'tracking': move.product_id.tracking,
            'values': self.env['sale.order']._qorlia_read_fields(form, OPERATION_FIELDS),
            'rules': rules, 'labels': labels, 'reserved': line.reserved_uom_qty if line else 0,
            'balance': form.balance, 'expiry_warning': bool(form.is_move_line_lot_expiring_soon),
            'warning': warning, 'reason': reason, 'write_ready': False}

    @api.model
    def qorlia_operation_load(self, order_id, transfer_id, move_id, operation_id=False):
        source = self._qorlia_operation_source(order_id, transfer_id, move_id, operation_id)
        _picking, _move, line, model, identity, values, _groups, _version = source
        return self._qorlia_operation_snapshot(source, model.new({**identity, **values}, origin=line if line else None))

    def _qorlia_operation_form(self, source, version, edits):
        picking, move, line, model, identity, values, groups, current_version = source
        if not isinstance(version, str) or version != current_version:
            raise UserError('The transfer, operation or its configuration changed. Reload the stock form.')
        if not isinstance(edits, list) or len(edits) > 100:
            raise ValidationError('Use at most 100 stock form edits before reloading.')
        warning = False
        for edit in edits:
            if (not isinstance(edit, dict) or set(edit) != {'field', 'value'}
                    or not isinstance(edit['field'], str) or edit['field'] not in OPERATION_FIELDS):
                raise ValidationError('Select a supported stock operation field.')
            name = edit['field']
            form = model.new({**identity, **values}, origin=line if line else None)
            rules, reason = self._qorlia_operation_rules(picking, move, line, form, groups, model.env.context)
            if rules[name]['readonly']:
                raise AccessError(reason or 'This stock field is hidden or read-only in the native operation form.')
            changed = self.env['sale.order']._qorlia_values(model, {name: edit['value']}, OPERATION_FIELDS)
            if name == 'expiration_date' and edit['value'] is not False:
                try:
                    if fields.Datetime.to_string(fields.Datetime.to_datetime(edit['value'])) != edit['value']:
                        raise ValueError()
                except (ValueError, TypeError):
                    raise ValidationError('Enter an exact UTC expiry date and time.')
            values = {**values, **changed}
            self._qorlia_operation_domains(picking, move, values)
            onchange_values = {**identity, **values, **({'id': line.id} if line else {})}
            result = model.onchange(onchange_values, [name], {key: '1' for key in OPERATION_FIELDS + IDENTITY_FIELDS + ('balance',)})
            values.update(self.env['sale.order']._qorlia_from_onchange(model, result.get('value', {}), OPERATION_FIELDS + ('balance',)))
            warning = result.get('warning', {}).get('message', False)
        form = model.new({**identity, **values}, origin=line if line else None)
        form._check_company()
        self._qorlia_operation_domains(picking, move, values)
        return self._qorlia_operation_snapshot(source, form, warning)

    def _qorlia_operation_domain(self, picking, move, field, values):
        company = ['|', ('company_id', '=', False), ('company_id', '=', picking.company_id.id)]
        if field == 'product_uom_id':
            return 'uom.uom', [('category_id', '=', move.product_id.uom_id.category_id.id)]
        if field in ('lot_id', 'existing_lot_id'):
            return 'stock.lot', [('product_id', '=', move.product_id.id), ('company_id', '=', picking.company_id.id)]
        if field in ('location_id', 'location_dest_id'):
            parent = move.location_id if field == 'location_id' else move.location_dest_id
            return 'stock.location', [('id', 'child_of', parent.id), ('usage', '!=', 'view'), *company]
        if field == 'package_id':
            return 'stock.quant.package', [('location_id', '=', values['location_id']), *company]
        if field == 'result_package_id':
            return 'stock.quant.package', ['|', '|', ('location_id', '=', False),
                ('location_id', '=', values['location_dest_id']), ('id', '=', values['package_id']), *company]
        if field == 'owner_id':
            return 'res.partner', company
        raise ValidationError('Unsupported stock operation search.')

    def _qorlia_operation_domains(self, picking, move, values):
        for name in OPERATION_FIELDS:
            if self.env['stock.move.line']._fields[name].type == 'many2one' and values.get(name):
                model_name, domain = self._qorlia_operation_domain(picking, move, name, values)
                record = self.env[model_name].browse(values[name]).exists()
                record.check_access_rights('read')
                record.check_access_rule('read')
                if not record or not record.filtered_domain(domain):
                    raise ValidationError('Select a %s offered for this product, location and company.' % name)

    @api.model
    def qorlia_operation_onchange(self, order_id, transfer_id, move_id, version, edits, operation_id=False):
        source = self._qorlia_operation_source(order_id, transfer_id, move_id, operation_id)
        # Native onchange hooks may evolve. Always discard writes and transaction callbacks.
        cr = self.env.cr
        cr.flush()
        callbacks = {name: getattr(cr, name) for name in ('postcommit', 'prerollback', 'postrollback')}
        try:
            for name in callbacks:
                setattr(cr, name, tools.Callbacks())
            with closing(cr.savepoint()):
                result = self._qorlia_operation_form(source, version, edits)
                cr.flush()
            return result
        finally:
            for name, original in callbacks.items():
                setattr(cr, name, original)
            self.env.invalidate_all()

    @api.model
    def qorlia_operation_choices(self, order_id, transfer_id, move_id, version, edits, field, search='', offset=0, operation_id=False):
        if (not isinstance(search, str) or len(search) > 200 or type(offset) is not int or offset < 0
                or offset > 100000 or not isinstance(field, str) or field not in OPERATION_FIELDS):
            raise ValidationError('Use a supported stock field and search page.')
        view = self.qorlia_operation_onchange(order_id, transfer_id, move_id, version, edits, operation_id)
        if view['rules'][field]['readonly']:
            raise AccessError('This stock field is hidden or read-only.')
        picking, move, *_rest = self._qorlia_operation_source(order_id, transfer_id, move_id, operation_id)
        model_name, domain = self._qorlia_operation_domain(picking, move, field, view['values'])
        model = self.env[model_name]
        model.check_access_rights('read')
        # shortcut: native name_search has no offset; fetch the prefix until large catalog paging is implemented.
        matches = model.name_search(name=search, args=domain, operator='ilike', limit=offset + 26)
        records = model.browse([row[0] for row in matches[offset:offset + 26]])
        return {'rows': [_label(item) for item in records[:25]], 'has_more': len(records) > 25, 'offset': offset}
