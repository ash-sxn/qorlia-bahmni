# SPDX-License-Identifier: LGPL-3.0-or-later
# Copyright 2026 Qorlia contributors.
from odoo import api, fields, models
from psycopg2 import sql
from odoo.exceptions import AccessError, UserError, ValidationError

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
        return self._qorlia_delivery_data(order, pickings)

    def _qorlia_delivery_data(self, order, pickings):
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

    def _qorlia_delivery_header(self, picking):
        return {
            'id': picking.id, 'name': picking.name, 'state': picking.state,
            'operation_type': _label(picking.picking_type_id),
            'company': _label(picking.company_id), 'customer': _label(picking.partner_id),
            'source': _label(picking.location_id), 'destination': _label(picking.location_dest_id),
            'scheduled_date': _date(picking.scheduled_date), 'date_done': _date(picking.date_done),
            'origin': picking.origin or False, 'backorder': _label(picking.backorder_id),
        }

    def _qorlia_delivery_stamp(self, records):
        self.env.cr.execute(sql.SQL(
            "SELECT encode(sha256(convert_to(COALESCE(string_agg(value, ',' ORDER BY id), ''), 'UTF8')), 'hex') "
            "FROM (SELECT id, encode(sha256(convert_to(row_to_json(record)::text, 'UTF8')), 'hex') AS value "
            "FROM {} record WHERE id = ANY(%s)) fingerprint").format(sql.Identifier(records._table)), [records.ids])
        return self.env.cr.fetchone()[0]

    def _qorlia_delivery_scope(self, order_id):
        if not self.env.user.has_group('base.group_user'):
            raise AccessError('Stock transfers require an internal Billing account.')
        order = self._qorlia_order(order_id, states=None)
        order.check_field_access_rights('read', ['name', 'state', 'company_id', 'write_date'])
        if order.company_id not in self.env.companies:
            raise AccessError('Open a charge order in your active companies.')
        self.env.flush_all()
        definitions = (
            ('stock.picking', 'sale_id = %s', ['name','state','company_id','partner_id','picking_type_id',
                'location_id','location_dest_id','scheduled_date','date_done','backorder_id','origin','move_ids','move_line_ids']),
            ('stock.move', 'picking_id IN (SELECT id FROM stock_picking WHERE sale_id = %s)',
                ['product_id','product_uom','product_uom_qty','reserved_availability','quantity_done','state','sale_line_id','company_id']),
            ('stock.move.line', 'picking_id IN (SELECT id FROM stock_picking WHERE sale_id = %s)',
                ['move_id','product_id','product_uom_id','reserved_uom_qty','qty_done','lot_id','lot_name','location_id',
                'location_dest_id','package_id','result_package_id','owner_id','company_id','expiration_date']),
            ('stock.lot', 'id IN (SELECT lot_id FROM stock_move_line WHERE picking_id IN '
                '(SELECT id FROM stock_picking WHERE sale_id = %s))', ['name','product_id','company_id','expiration_date']),
        )
        scopes, related = {}, {}
        # shortcut: linked-graph checks bound payload size, not work; measure realistic scale before release.
        for model_name, domain, names in definitions:
            model = self.env[model_name]
            model.check_access_rights('read')
            model.check_field_access_rights('read', ['write_date', *names])
            records, after = model, 0
            while True:
                self.env.cr.execute(sql.SQL('SELECT id FROM {} WHERE ({}) AND id > %s ORDER BY id LIMIT 200')
                    .format(sql.Identifier(model._table), sql.SQL(domain)), [order.id, after])
                ids = [row[0] for row in self.env.cr.fetchall()]
                if not ids:
                    break
                batch = model.browse(ids)
                batch.check_access_rule('read')
                if any(record.company_id and record.company_id != order.company_id for record in batch):
                    raise AccessError('A linked stock record is outside this order company.')
                for name in names:
                    if model._fields[name].type == 'many2one':
                        target = batch.mapped(name)
                        if target:
                            target.check_access_rights('read')
                            target.check_access_rule('read')
                            related[target._name] = related.get(target._name, self.env[target._name]) | target
                records |= batch
                after = ids[-1]
            scopes[model_name] = records
        self.env.cr.execute('SELECT 1 FROM stock_move_line line JOIN stock_picking picking ON picking.id = line.picking_id '
            'LEFT JOIN stock_move move ON move.id = line.move_id WHERE picking.sale_id = %s AND line.move_id IS NOT NULL '
            'AND move.picking_id IS DISTINCT FROM line.picking_id LIMIT 1', [order.id])
        if self.env.cr.fetchone():
            raise AccessError('A detailed operation belongs to another transfer.')
        products = related.get('product.product', self.env['product.product'])
        templates = products.product_tmpl_id
        templates.check_access_rights('read')
        templates.check_access_rule('read')
        related['product.template'] = templates
        related['res.users'] = self.env.user
        related['res.partner'] = related.get('res.partner', self.env['res.partner']) | self.env.user.partner_id
        stamps = {name: self._qorlia_delivery_stamp(records) for name, records in scopes.items()}
        stamps.update({'related:' + name: self._qorlia_delivery_stamp(records) for name, records in related.items()})
        # Native display labels can depend on a warehouse or location's ancestors, not just the referenced row.
        labels = {name: [(record.id, record.display_name) for record in records.sorted('id')]
            for name, records in related.items()}
        policy = self.env['stock.picking']._qorlia_confirmation_stamp([
            self.env[name]._table for name in ('ir.rule','ir.model.access','ir.model.fields','ir.module.module')])
        version = _digest({'database': self.env.cr.dbname, 'order': order.read(['name','state','company_id','write_date']),
            'author': self.env.uid, 'companies': self.env.companies.ids, 'groups': sorted(self.env.user.groups_id.ids),
            'lang': self.env.context.get('lang'), 'tz': self.env.context.get('tz'),
            'stamps': stamps, 'labels': labels, 'policy': policy})
        return order, scopes['stock.picking'], version

    def _qorlia_order_transfer_data(self, order_id, transfer_id):
        order, pickings, version = self._qorlia_delivery_scope(order_id)
        picking = pickings.filtered(lambda record: record.id == transfer_id)
        if not picking:
            raise UserError('This transfer is no longer linked to this order.')
        result = self._qorlia_delivery_data(order, picking)
        result['version'] = _digest({'index': version, 'data': result['version']})
        return result

    @api.model
    def qorlia_order_delivery_page(self, order_id, after=0, version=False, limit=25):
        if (type(after) is not int or after < 0 or type(limit) is not int or not 1 <= limit <= 100
                or not (version is False or isinstance(version, str) and len(version) == 64
                    and all(char in '0123456789abcdef' for char in version)) or after and version is False):
            raise ValidationError('Use a bounded transfer page and its original version.')
        self = self.with_context({key: self.env.context[key] for key in ('allowed_company_ids','lang','tz') if key in self.env.context})
        order, pickings, current = self._qorlia_delivery_scope(order_id)
        if version is not False and version != current:
            raise UserError('The order, linked stock records or access configuration changed. Reload transfer pages.')
        if after and after not in pickings.ids:
            raise ValidationError('The transfer cursor does not belong to this order.')
        remaining = pickings.filtered(lambda record: record.id > after)
        page = remaining[:limit]
        self.env.cr.execute('SELECT picking.id, (SELECT count(*) FROM stock_move WHERE picking_id = picking.id), '
            '(SELECT count(*) FROM stock_move_line WHERE picking_id = picking.id) FROM stock_picking picking '
            'WHERE picking.id = ANY(%s)', [page.ids])
        counts = {identifier: (moves, lines) for identifier, moves, lines in self.env.cr.fetchall()}
        return {'order_id': order.id, 'order_name': order.name, 'order_state': order.state, 'read_only': True,
            'version': current, 'after': after, 'position': len(pickings) - len(remaining), 'total_count': len(pickings),
            'next_after': page[-1].id if len(remaining) > limit else False,
            'rows': [dict(self._qorlia_delivery_header(picking), move_count=counts[picking.id][0],
                operation_count=counts[picking.id][1]) for picking in page]}
