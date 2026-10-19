# SPDX-License-Identifier: LGPL-3.0-or-later
# Copyright 2026 Qorlia contributors.
from odoo import api, models
from odoo.exceptions import AccessError, ValidationError


class StockInventory(models.Model):
    _inherit = 'stock.picking'

    @api.model
    def qorlia_inventory_transfers(self, search='', operation='all', state='all', offset=0):
        if (not isinstance(search, str) or len(search) > 160
                or not isinstance(operation, str) or operation not in ('all', 'incoming', 'outgoing', 'internal')
                or not isinstance(state, str) or state not in ('all', 'draft', 'waiting', 'assigned', 'done', 'cancel')
                or type(offset) is not int or not 0 <= offset <= 2147483647):
            raise ValidationError('Use a valid inventory search, operation, status and page.')
        self = self.with_context({key: self.env.context[key] for key in ('allowed_company_ids', 'lang', 'tz')
            if key in self.env.context})
        if (not self.env.user.has_group('base.group_user')
                or not (self.env.user.has_group('stock.group_stock_user')
                    or self.env.user.has_group('stock.group_stock_manager'))):
            raise AccessError('Inventory requires an internal stock account.')
        self.check_access_rights('read')
        self.check_field_access_rights('read', ['name', 'origin', 'state', 'company_id', 'partner_id',
            'picking_type_id', 'location_id', 'location_dest_id', 'scheduled_date', 'date_done', 'backorder_id', 'priority'])
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
