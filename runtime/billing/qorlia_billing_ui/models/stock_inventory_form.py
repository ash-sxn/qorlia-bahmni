# SPDX-License-Identifier: LGPL-3.0-or-later
# Copyright 2026 Qorlia contributors.
from contextlib import closing
import json

from lxml import etree
from odoo import api, models, tools
from odoo.exceptions import AccessError, UserError, ValidationError

from .invoice_draft import _digest
from .order_deliveries import _label


_SCALARS = {'char', 'text', 'html', 'selection', 'boolean', 'float', 'monetary',
    'integer', 'datetime', 'date', 'many2one'}
_ATTRIBUTES = ['string', 'type', 'readonly', 'required', 'states', 'domain', 'selection', 'relation']


class StockInventoryForm(models.Model):
    _inherit = 'stock.picking'

    def _qorlia_inventory_form_source(self, transfer_id, picking_type_id):
        if (transfer_id is not False and (type(transfer_id) is not int or transfer_id <= 0)
                or picking_type_id is not False and (type(picking_type_id) is not int or picking_type_id <= 0)
                or transfer_id is not False and picking_type_id is not False):
            raise ValidationError('Select a saved transfer or a native operation type for a new form.')
        model, picking, scope = self, self.browse(), False
        if transfer_id is not False:
            picking, _records, scope = self._qorlia_inventory_transfer_scope(transfer_id)
        else:
            model.check_access_rights('create')
            if picking_type_id is not False:
                kind = self.env['stock.picking.type'].browse(picking_type_id).exists()
                kind.check_access_rights('read')
                kind.check_access_rule('read')
                kind.check_field_access_rights('read', ['active', 'code', 'company_id'])
                if not kind or not kind.active or kind.code not in ('incoming', 'outgoing', 'internal'):
                    raise ValidationError('Choose an active native receipt, delivery or internal operation type.')
                if kind.company_id not in self.env.companies:
                    raise AccessError('Choose an operation type in your active Billing companies.')
                model = model.with_context(default_picking_type_id=kind.id)
        return model, picking, scope

    def _qorlia_inventory_form_snapshot(self, transfer_id, picking_type_id):
        model, picking, scope = self._qorlia_inventory_form_source(transfer_id, picking_type_id)
        view = model.get_view(view_id=self.env.ref('stock.view_picking_form').id, view_type='form')
        root = etree.fromstring(view['arch'])
        nodes = root.xpath('.//field[not(ancestor::field)]')
        names = sorted({node.get('name') for node in nodes})
        metadata = model.fields_get(names, attributes=_ATTRIBUTES)
        if set(metadata) != set(names):
            raise AccessError('The native transfer view contains a field this account cannot read.')
        scalars = [name for name in names if name != 'id' and metadata[name]['type'] in _SCALARS]
        model.check_field_access_rights('read', scalars)
        warning = False
        if picking:
            form = picking
        else:
            # The installed default/onchange chain owns locations, shipping policy and responsibility.
            changed = model.onchange({}, [], {name: '1' for name in scalars})
            warning = changed.get('warning') or False
            values = self.env['sale.order']._qorlia_from_onchange(model, changed.get('value', {}), scalars)
            form = model.new(values)
        if form.company_id and form.company_id not in self.env.companies:
            raise AccessError('The native transfer form is outside your active Billing companies.')
        labels = {}
        for name in scalars:
            if metadata[name]['type'] == 'many2one' and form[name]:
                relation = form[name]._origin or form[name]
                relation.check_access_rights('read')
                relation.check_access_rule('read')
                relation.check_field_access_rights('read', ['display_name'])
                labels[name] = _label(relation)
        values = self.env['sale.order']._qorlia_read_fields(form, scalars)
        values['id'] = picking.id or False
        layout = []
        for node in nodes:
            parents = [parent for parent in reversed(list(node.iterancestors()))
                if parent.tag in ('page', 'group')]
            layout.append({'field': node.get('name'), 'label': node.get('string') or False,
                'modifiers': json.loads(node.get('modifiers') or '{}'),
                'domain': node.get('domain') or False, 'context': node.get('context') or False,
                'containers': [{'kind': parent.tag, 'name': parent.get('name') or False,
                    'label': parent.get('string') or False,
                    'modifiers': json.loads(parent.get('modifiers') or '{}')} for parent in parents]})
        surface = {'fields': metadata, 'layout': layout, 'values': values, 'labels': labels, 'warning': warning,
            'collections': [name for name in names if metadata[name]['type'] in ('one2many', 'many2many')],
            'unsupported': [name for name in names if name != 'id'
                and metadata[name]['type'] not in _SCALARS | {'one2many', 'many2many'}]}
        basis = {'purpose': 'qorlia.inventory-form-read.v1', 'scope': scope,
            'transfer_id': transfer_id, 'picking_type_id': picking_type_id,
            'view': _digest(view['arch']), 'surface': surface, 'author': self.env.uid,
            'companies': self.env.companies.ids, 'groups': sorted(self.env.user.groups_id.ids),
            'lang': self.env.context.get('lang'), 'tz': self.env.context.get('tz')}
        return {'read_only': True, 'transfer_id': transfer_id, 'picking_type_id': picking_type_id,
            'version': _digest({'basis': basis, 'stamp': self._qorlia_confirmation_stamp(self._qorlia_return_paged_tables())}),
            'timezone': self.env.context.get('tz') or self.env.user.tz or 'UTC', **surface}

    @api.model
    def qorlia_inventory_form_load(self, transfer_id=False, picking_type_id=False):
        self = self._qorlia_inventory_context()
        cr = self.env.cr
        cr.flush()
        tables = self._qorlia_return_paged_tables()
        before = self._qorlia_confirmation_stamp(tables)
        callbacks = {name: getattr(cr, name) for name in ('precommit', 'postcommit', 'prerollback', 'postrollback')}
        try:
            for name in callbacks:
                setattr(cr, name, tools.Callbacks())
            with closing(cr.savepoint()):
                result = self._qorlia_inventory_form_snapshot(transfer_id, picking_type_id)
                cr.flush()
                if self._qorlia_confirmation_stamp(tables) != before:
                    raise UserError('Reading the native transfer form changed stored data. Nothing was saved.')
            return result
        finally:
            for name, original in callbacks.items():
                setattr(cr, name, original)
            self.env.invalidate_all()
