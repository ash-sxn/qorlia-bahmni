# SPDX-License-Identifier: LGPL-3.0-or-later
# Copyright 2026 Qorlia contributors.
from odoo import api, models
from odoo.exceptions import AccessError, UserError, ValidationError
from psycopg2 import sql

from .invoice_draft import _digest
from .stock_confirmation_paged import _hash


HEADER_FIELDS = ['name', 'origin', 'state', 'company_id', 'partner_id', 'picking_type_id',
    'location_id', 'location_dest_id', 'scheduled_date', 'date_done', 'backorder_id', 'priority']


class StockInventory(models.Model):
    _inherit = 'stock.picking'

    def _qorlia_inventory_context(self):
        self = self.with_context({key: self.env.context[key] for key in ('allowed_company_ids', 'lang', 'tz')
            if key in self.env.context})
        if (not self.env.user.has_group('base.group_user')
                or not (self.env.user.has_group('stock.group_stock_user')
                    or self.env.user.has_group('stock.group_stock_manager'))):
            raise AccessError('Inventory requires an internal stock account.')
        self.check_access_rights('read')
        self.check_field_access_rights('read', HEADER_FIELDS)
        self.env.cr.flush()
        return self

    def _qorlia_inventory_transfer_scope(self, transfer_id):
        if type(transfer_id) is not int or transfer_id <= 0:
            raise ValidationError('Select a saved inventory transfer.')
        picking = self.browse(transfer_id).exists()
        if not picking:
            raise UserError('This inventory transfer is no longer available.')
        picking.check_access_rule('read')
        if picking.company_id not in self.env.companies:
            raise AccessError('Open a transfer in your active Billing companies.')
        self.env.flush_all()
        definitions = (
            ('stock.picking', 'id = %s', HEADER_FIELDS),
            ('stock.move', 'picking_id = %s', ['product_id', 'product_uom', 'product_uom_qty',
                'reserved_availability', 'quantity_done', 'state', 'company_id']),
            ('stock.move.line', 'picking_id = %s', ['move_id', 'product_id', 'product_uom_id',
                'reserved_uom_qty', 'qty_done', 'lot_id', 'lot_name', 'location_id', 'location_dest_id',
                'package_id', 'result_package_id', 'owner_id', 'company_id', 'expiration_date']),
            ('stock.lot', 'id IN (SELECT lot_id FROM stock_move_line WHERE picking_id = %s)',
                ['name', 'product_id', 'company_id', 'expiration_date']),
        )
        scopes, related = {}, {}
        # shortcut: complete linked scope, not bounded total ORM cache or preview CPU; measure hospital scale.
        for name, domain, fields in definitions:
            model = self.env[name]
            model.check_access_rights('read')
            model.check_field_access_rights('read', fields)
            records, after = model, 0
            while True:
                self.env.cr.execute(sql.SQL('SELECT id FROM {} WHERE ({}) AND id > %s ORDER BY id LIMIT 200')
                    .format(sql.Identifier(model._table), sql.SQL(domain)), [picking.id, after])
                ids = [row[0] for row in self.env.cr.fetchall()]
                if not ids:
                    break
                batch = model.browse(ids)
                batch.check_access_rule('read')
                if any(record.company_id and record.company_id != picking.company_id for record in batch):
                    raise AccessError('A linked inventory record is outside this transfer company.')
                for field in fields:
                    if model._fields[field].type == 'many2one':
                        target = batch.mapped(field)
                        if target:
                            target.check_access_rights('read')
                            target.check_access_rule('read')
                            related[target._name] = related.get(target._name, self.env[target._name]) | target
                records |= batch
                after = ids[-1]
            scopes[name] = records
        self.env.cr.execute('SELECT 1 FROM stock_move_line line LEFT JOIN stock_move move ON move.id = line.move_id '
            'WHERE line.picking_id = %s AND line.move_id IS NOT NULL AND move.picking_id IS DISTINCT FROM line.picking_id LIMIT 1',
            [picking.id])
        if self.env.cr.fetchone():
            raise AccessError('A detailed operation belongs to another inventory transfer.')
        products = related.get('product.product', self.env['product.product'])
        products.check_field_access_rights('read', ['product_tmpl_id'])
        templates = products.product_tmpl_id
        templates.check_access_rights('read')
        templates.check_access_rule('read')
        related['product.template'] = templates
        related['res.users'] = self.env.user
        formatter = self.env['sale.order']
        stamps = {name: formatter._qorlia_delivery_stamp(records) for name, records in scopes.items()}
        stamps.update({'related:' + name: formatter._qorlia_delivery_stamp(records) for name, records in related.items()})
        labels = {name: [(record.id, record.display_name) for record in records.sorted('id')]
            for name, records in related.items()}
        policy = self._qorlia_confirmation_stamp([self.env[name]._table for name in
            ('ir.rule', 'ir.model.access', 'ir.model.fields', 'ir.module.module')])
        version = _digest({'purpose': 'qorlia.inventory-transfer-read.v1', 'database': self.env.cr.dbname,
            'transfer': picking.id, 'author': self.env.uid, 'companies': self.env.companies.ids,
            'groups': sorted(self.env.user.groups_id.ids), 'lang': self.env.context.get('lang'),
            'tz': self.env.context.get('tz'), 'stamps': stamps, 'labels': labels, 'policy': policy})
        return picking, scopes, version

    def _qorlia_inventory_transfer_header(self, picking, scopes):
        return dict(self.env['sale.order']._qorlia_delivery_header(picking),
            move_count=len(scopes['stock.move']), operation_count=len(scopes['stock.move.line']))

    @api.model
    def qorlia_inventory_transfer_load(self, transfer_id):
        self = self._qorlia_inventory_context()
        picking, scopes, version = self._qorlia_inventory_transfer_scope(transfer_id)
        return {'read_only': True, 'version': version, 'timezone': self.env.context.get('tz') or self.env.user.tz or 'UTC',
            'transfer': self._qorlia_inventory_transfer_header(picking, scopes)}

    @api.model
    def qorlia_inventory_transfer_detail_page(self, transfer_id, section, after=0, version=False, limit=50):
        if (not isinstance(section, str) or section not in ('moves', 'operations')
                or type(after) is not int or after < 0 or type(limit) is not int or not 1 <= limit <= 100
                or not (version is False or _hash(version)) or after and version is False):
            raise ValidationError('Use a bounded inventory detail page and its original version.')
        self = self._qorlia_inventory_context()
        picking, scopes, current = self._qorlia_inventory_transfer_scope(transfer_id)
        if version is not False and version != current:
            raise UserError('The inventory transfer, linked records or access changed. Reload its details.')
        model_name = 'stock.move' if section == 'moves' else 'stock.move.line'
        records = scopes[model_name]
        if after and after not in records.ids:
            raise ValidationError('This cursor does not belong to the inventory transfer section.')
        remaining = records.filtered(lambda record: record.id > after)
        page = remaining[:limit]
        formatter = self.env['sale.order']
        return {'read_only': True, 'version': current, 'timezone': self.env.context.get('tz') or self.env.user.tz or 'UTC',
            'transfer': self._qorlia_inventory_transfer_header(picking, scopes), 'section': section,
            'after': after, 'position': len(records) - len(remaining), 'total_count': len(records),
            'next_after': page[-1].id if len(remaining) > limit else False,
            'rows': [formatter._qorlia_delivery_move(record, include_order_line=False) if section == 'moves'
                else formatter._qorlia_delivery_operation(record) for record in page]}

    @api.model
    def qorlia_inventory_transfers(self, search='', operation='all', state='all', offset=0):
        if (not isinstance(search, str) or len(search) > 160
                or not isinstance(operation, str) or operation not in ('all', 'incoming', 'outgoing', 'internal')
                or not isinstance(state, str) or state not in ('all', 'draft', 'waiting', 'assigned', 'done', 'cancel')
                or type(offset) is not int or not 0 <= offset <= 2147483647):
            raise ValidationError('Use a valid inventory search, operation, status and page.')
        self = self._qorlia_inventory_context()
        domain = [('company_id', 'in', self.env.companies.ids)]
        if operation != 'all':
            domain.append(('picking_type_id.code', '=', operation))
        if state != 'all':
            # The native Waiting search includes both waiting-on-origin and waiting-on-availability.
            domain.append(('state', 'in', ['waiting', 'confirmed'] if state == 'waiting' else [state]))
        if search.strip():
            domain += ['|', ('name', 'ilike', search.strip()), ('origin', 'ilike', search.strip())]
        records = self.search(domain, offset=offset, limit=25, order=self._order)
        records.check_access_rule('read')
        total = self.search_count(domain)
        return {'read_only': True, 'filters': {'search': search.strip(), 'operation': operation, 'state': state},
            'offset': offset, 'total_count': total, 'next_offset': offset + 25 if offset + 25 < total else False,
            'timezone': self.env.context.get('tz') or self.env.user.tz or 'UTC',
            'rows': [self.env['sale.order']._qorlia_delivery_header(record) for record in records]}
