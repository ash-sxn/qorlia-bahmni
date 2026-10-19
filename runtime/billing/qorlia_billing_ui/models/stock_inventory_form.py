# SPDX-License-Identifier: LGPL-3.0-or-later
# Copyright 2026 Qorlia contributors.
from contextlib import closing
import json
import operator

from lxml import etree
from odoo import api, models, tools
from odoo.exceptions import AccessError, UserError, ValidationError
from odoo.osv import expression
from odoo.tools.safe_eval import safe_eval

from .invoice_draft import _digest
from .order_deliveries import _label


_SCALARS = {'char', 'text', 'html', 'selection', 'boolean', 'float', 'monetary',
    'integer', 'datetime', 'date', 'many2one'}
_ATTRIBUTES = ['string', 'help', 'type', 'readonly', 'required', 'states', 'domain', 'selection', 'relation']
_NODE_ATTRIBUTES = ('id', 'widget', 'options', 'help', 'nolabel', 'placeholder', 'force_save', 'on_change')
_MODIFIER_OPS = {'=': operator.eq, '==': operator.eq, '!=': operator.ne,
    '<': operator.lt, '<=': operator.le, '>': operator.gt, '>=': operator.ge,
    'in': lambda value, items: value in items if isinstance(items, (list, tuple)) else items in value,
    'not in': lambda value, items: value not in items if isinstance(items, (list, tuple)) else items not in value}


def _modifier(condition, values):
    if type(condition) is bool:
        return condition
    if not isinstance(condition, list):
        raise UserError('This native form uses an unsupported field condition. No field was changed.')
    stack = []
    for term in reversed(expression.normalize_domain(condition)):
        if term == '!':
            stack.append(not stack.pop())
        elif term in ('&', '|'):
            left, right = stack.pop(), stack.pop()
            stack.append(left and right if term == '&' else left or right)
        elif tuple(term) == expression.TRUE_LEAF:
            stack.append(True)
        elif tuple(term) == expression.FALSE_LEAF:
            stack.append(False)
        else:
            field, op, expected = term
            if field not in values or op not in _MODIFIER_OPS:
                raise UserError('This native form condition needs an explicit adapter before editing.')
            stack.append(_MODIFIER_OPS[op](values[field], expected))
    return stack == [True]


def _presentation(node):
    parents = list(reversed(list(node.iterancestors())))
    return {'modifiers': json.loads(node.get('modifiers') or '{}'),
        'ancestor_modifiers': [json.loads(parent.get('modifiers')) for parent in parents if parent.get('modifiers')],
        'containers': [{'kind': parent.tag, 'name': parent.get('name') or False,
            'label': parent.get('string') or False,
            'modifiers': json.loads(parent.get('modifiers') or '{}')}
            for parent in parents if parent.tag in ('page', 'group')]}


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
            layout.append({'field': node.get('name'), 'label': node.get('string') or False,
                **_presentation(node),
                'domain': node.get('domain') or False, 'context': node.get('context') or False,
                'attributes': {key: node.get(key) for key in _NODE_ATTRIBUTES if node.get(key) is not None}})
        targets = set(names) | {node.get('id') for node in nodes if node.get('id')}
        label_nodes = [{'target': node.get('for'), 'label': node.get('string') or False, **_presentation(node)}
            for node in root.xpath('.//label[not(ancestor::field)]') if node.get('for') in targets]
        # Collections are evaluated internally, never returned as child records through the scalar reader.
        rule_values = dict(values, **{name: form[name].ids for name in names
            if metadata[name]['type'] in ('one2many', 'many2many')})
        can_edit = model.check_access_rights('write' if picking else 'create', raise_exception=False)
        if picking and can_edit:
            try:
                picking.check_access_rule('write')
            except AccessError:
                can_edit = False
        for row in layout:
            modifiers = row['modifiers']
            visible = not any(_modifier(item.get('invisible', False), rule_values)
                for item in [*row['ancestor_modifiers'], modifiers])
            writable = can_edit
            try:
                model.check_field_access_rights('write', [row['field']])
            except AccessError:
                writable = False
            row['rules'] = {'visible': visible,
                'readonly': not writable or any(_modifier(item.get('readonly', False), rule_values)
                    for item in [*row['ancestor_modifiers'], modifiers]),
                'required': _modifier(modifiers.get('required', False), rule_values)}
        for row in label_nodes:
            row['visible'] = not any(_modifier(item.get('invisible', False), rule_values)
                for item in [*row['ancestor_modifiers'], row['modifiers']])
        surface = {'fields': metadata, 'layout': layout, 'label_nodes': label_nodes,
            'values': values, 'labels': labels, 'warning': warning,
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

    def _qorlia_inventory_form_read(self, action):
        cr = self.env.cr
        cr.flush()
        tables = self._qorlia_return_paged_tables()
        before = self._qorlia_confirmation_stamp(tables)
        callbacks = {name: getattr(cr, name) for name in ('precommit', 'postcommit', 'prerollback', 'postrollback')}
        try:
            for name in callbacks:
                setattr(cr, name, tools.Callbacks())
            with closing(cr.savepoint()):
                result = action()
                cr.flush()
                if self._qorlia_confirmation_stamp(tables) != before:
                    raise UserError('Reading the native transfer form changed stored data. Nothing was saved.')
            return result
        finally:
            for name, original in callbacks.items():
                setattr(cr, name, original)
            self.env.invalidate_all()

    @api.model
    def qorlia_inventory_form_load(self, transfer_id=False, picking_type_id=False):
        self = self._qorlia_inventory_context()
        return self._qorlia_inventory_form_read(lambda: self._qorlia_inventory_form_snapshot(transfer_id, picking_type_id))

    def _qorlia_inventory_form_choices(self, transfer_id, picking_type_id, node, search, offset):
        if (type(node) is not int or node < 0 or not isinstance(search, str) or len(search) > 200
                or type(offset) is not int or offset < 0 or offset > 100000):
            raise ValidationError('Choose a native relation field and bounded search page.')
        view = self._qorlia_inventory_form_snapshot(transfer_id, picking_type_id)
        if node >= len(view['layout']):
            raise ValidationError('This field node is not part of the native transfer form.')
        row = view['layout'][node]
        field = view['fields'][row['field']]
        if field['type'] != 'many2one':
            raise ValidationError('Choose a native transfer relation field.')
        if not row['rules']['visible'] or row['rules']['readonly']:
            raise AccessError('This native relation field is hidden or read-only.')
        values = view['values']
        model, _picking, _scope = self._qorlia_inventory_form_source(transfer_id, picking_type_id)
        context = dict(model.env.context)
        evaluation = {**values, **context, 'uid': self.env.uid, 'context': context,
            'active_model': self._name, 'active_id': transfer_id, 'active_ids': [transfer_id] if transfer_id else []}
        # Native web _getDomain uses the view override, otherwise the model domain, not their intersection.
        domain = row['domain'] if row['domain'] is not False else field.get('domain', [])
        domain = safe_eval(domain, evaluation) if isinstance(domain, str) else domain
        if not isinstance(domain, (list, tuple)):
            raise UserError('The native relation domain is not supported. Nothing was searched.')
        if row['context']:
            field_context = safe_eval(row['context'], evaluation)
            if not isinstance(field_context, dict):
                raise UserError('The native relation context is not supported. Nothing was searched.')
            context.update(field_context)
        # A field context cannot widen the authenticated company boundary.
        context['allowed_company_ids'] = self.env.companies.ids
        model = self.env[field['relation']].with_context(context)
        model.check_access_rights('read')
        model.check_field_access_rights('read', ['display_name'])
        # shortcut: native name_search has no offset; preserve native ordering by fetching its bounded prefix.
        matches = model.name_search(name=search, args=domain, operator='ilike', limit=offset + 26)
        records = model.browse([item[0] for item in matches[offset:offset + 26]])
        records.check_access_rule('read')
        return {'read_only': True, 'transfer_id': transfer_id, 'picking_type_id': picking_type_id,
            'form_version': view['version'], 'node': node, 'field': row['field'], 'offset': offset,
            'rows': [_label(record) for record in records[:25]], 'has_more': len(records) > 25}

    @api.model
    def qorlia_inventory_form_choices(self, transfer_id=False, picking_type_id=False, node=0, search='', offset=0):
        self = self._qorlia_inventory_context()
        return self._qorlia_inventory_form_read(lambda: self._qorlia_inventory_form_choices(
            transfer_id, picking_type_id, node, search, offset))
