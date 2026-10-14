# SPDX-License-Identifier: LGPL-3.0-or-later
# Copyright 2026 Qorlia contributors.
from odoo import api, fields, models
from odoo.exceptions import AccessError, UserError

from .invoice_draft import _digest


def _label(record):
    if not record:
        return False
    record.check_access_rights('read')
    record.check_access_rule('read')
    return [record.id, record.display_name]


def _date(value):
    return fields.Datetime.to_string(value) or False


class OrderDeliveries(models.Model):
    _inherit = 'sale.order'

    @api.model
    def qorlia_order_deliveries(self, order_id):
        if not self.env.user.has_group('base.group_user'):
            raise AccessError('Stock transfers require an internal Billing account.')
        order = self._qorlia_order(order_id, states=None)
        order.check_field_access_rights('read', ['name', 'state', 'company_id'])
        if order.company_id not in self.env.companies:
            raise AccessError('Open a charge order in your active companies.')
        pickings = self.env['stock.picking']
        pickings.check_access_rights('read')
        pickings.flush_model(['sale_id'])
        # Read every linked transfer before applying rules, never display a misleading visible subset.
        self.env.cr.execute('SELECT id FROM stock_picking WHERE sale_id = %s ORDER BY id LIMIT 101', [order.id])
        pickings = pickings.browse([row[0] for row in self.env.cr.fetchall()])
        if len(pickings) > 100:
            raise UserError('This order has more than 100 transfers. Full transfer paging is required.')
        pickings.check_access_rule('read')
        pickings.check_field_access_rights('read', ['name', 'state', 'company_id', 'partner_id',
            'picking_type_id', 'location_id', 'location_dest_id', 'scheduled_date', 'date_done',
            'backorder_id', 'origin', 'move_ids', 'move_line_ids'])
        rows = []
        stamps = []
        total_moves = total_lines = 0
        for picking in pickings:
            if picking.company_id != order.company_id:
                raise AccessError('A linked transfer is outside this order company.')
            moves = self.env['stock.move']
            lines = self.env['stock.move.line']
            moves.flush_model(['picking_id'])
            lines.flush_model(['picking_id'])
            self.env.cr.execute('SELECT id FROM stock_move WHERE picking_id = %s ORDER BY id LIMIT 501', [picking.id])
            moves = moves.browse([row[0] for row in self.env.cr.fetchall()])
            self.env.cr.execute('SELECT id FROM stock_move_line WHERE picking_id = %s ORDER BY id LIMIT 2001', [picking.id])
            lines = lines.browse([row[0] for row in self.env.cr.fetchall()])
            total_moves += len(moves)
            total_lines += len(lines)
            if total_moves > 500 or total_lines > 2000:
                raise UserError('This transfer needs full operation paging before it can be displayed.')
            move_fields = ['product_id', 'product_uom', 'product_uom_qty', 'reserved_availability',
                'quantity_done', 'state', 'sale_line_id', 'company_id']
            line_fields = ['move_id', 'product_id', 'product_uom_id', 'reserved_uom_qty', 'qty_done',
                'lot_id', 'lot_name', 'location_id', 'location_dest_id', 'package_id', 'result_package_id',
                'owner_id', 'company_id', 'expiration_date']
            for records, names in ((moves, move_fields), (lines, line_fields)):
                records.check_access_rights('read')
                records.check_access_rule('read')
                records.check_field_access_rights('read', names)
                if any(item.company_id != order.company_id for item in records):
                    raise AccessError('A linked operation is outside this order company.')
            lot_fields = ['name', 'product_id', 'company_id', 'expiration_date']
            lots = lines.lot_id
            if lots:
                lots.check_access_rights('read')
                lots.check_access_rule('read')
                lots.check_field_access_rights('read', lot_fields)
            if any(lot.company_id and lot.company_id != order.company_id for lot in lots):
                raise AccessError('A linked batch is outside this order company.')
            if any(line.move_id and line.move_id not in moves for line in lines):
                raise AccessError('A detailed operation belongs to another transfer.')
            rows.append({
                'id': picking.id, 'name': picking.name, 'state': picking.state,
                'operation_type': _label(picking.picking_type_id),
                'company': _label(picking.company_id), 'customer': _label(picking.partner_id),
                'source': _label(picking.location_id), 'destination': _label(picking.location_dest_id),
                'scheduled_date': _date(picking.scheduled_date), 'date_done': _date(picking.date_done),
                'origin': picking.origin or False, 'backorder': _label(picking.backorder_id),
                'moves': [{
                    'id': move.id, 'state': move.state, 'product': _label(move.product_id),
                    'unit': _label(move.product_uom), 'demand': move.product_uom_qty,
                    'reserved': move.reserved_availability, 'done': move.quantity_done,
                    'order_line': _label(move.sale_line_id),
                } for move in moves],
                'operations': [{
                    'id': line.id, 'move_id': line.move_id.id or False,
                    'product': _label(line.product_id), 'unit': _label(line.product_uom_id),
                    'reserved': line.reserved_uom_qty, 'done': line.qty_done,
                    'lot': _label(line.lot_id), 'lot_name': line.lot_name or False,
                    'expiry_date': _date(line.expiration_date),
                    'source': _label(line.location_id), 'destination': _label(line.location_dest_id),
                    'source_package': _label(line.package_id), 'destination_package': _label(line.result_package_id),
                    'owner': _label(line.owner_id),
                } for line in lines],
            })
            stamps.append({'picking': picking.read(['write_date']),
                'moves': moves.read(['write_date']), 'lines': lines.read(['write_date']),
                'lots': lots.read(['write_date'])})
        result = {'order_id': order.id, 'order_name': order.name, 'order_state': order.state,
            'rows': rows, 'read_only': True}
        result['version'] = _digest({'author': self.env.uid, 'companies': self.env.companies.ids,
            'order_stamp': order.read(['write_date']), 'data': result, 'stamps': stamps})
        return result
