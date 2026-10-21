# SPDX-License-Identifier: LGPL-3.0-or-later
# Copyright 2026 Qorlia contributors.
from contextlib import closing
import json
import operator

from lxml import etree
from odoo import api, Command, fields, models, tools
from odoo.exceptions import AccessError, UserError, ValidationError
from odoo.osv import expression
from odoo.tools.safe_eval import safe_eval

from .invoice_draft import _digest
from .order_deliveries import _label
from .sequence_read_guard import _read_sequence_boundary


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

    def _qorlia_inventory_form_snapshot(self, transfer_id, picking_type_id, form_override=None, warning_override=False,
            source_override=None, basis_version=None):
        model, picking, scope = source_override or self._qorlia_inventory_form_source(transfer_id, picking_type_id)
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
        if form_override is not None:
            form, warning = form_override, warning_override
        elif picking:
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
            'version': _digest({'basis': basis, 'stamp': basis_version if basis_version is not None
                else self._qorlia_confirmation_stamp(self._qorlia_return_paged_tables())}),
            'timezone': self.env.context.get('tz') or self.env.user.tz or 'UTC', **surface}

    def _qorlia_inventory_form_read(self, action):
        cr = self.env.cr
        cr.flush()
        with _read_sequence_boundary(cr):
            tables = self._qorlia_inventory_saved_tables()
            before = self._qorlia_confirmation_stamp(tables)
            business_before = self._qorlia_confirmation_stamp(tables, semantic=True)
            callbacks = {name: getattr(cr, name) for name in ('precommit', 'postcommit', 'prerollback', 'postrollback')}
            try:
                for name in callbacks:
                    setattr(cr, name, tools.Callbacks())
                with closing(cr.savepoint()):
                    result = action()
                    cr.flush()
                    if self._qorlia_confirmation_stamp(tables, semantic=True) != business_before:
                        raise UserError('Reading the native transfer form changed stored data. Nothing was saved.')
                # Native read/onchange can recompute identical business values with a new audit author.
                self.env.invalidate_all()
                if self._qorlia_confirmation_stamp(tables) != before:
                    raise UserError('The native form rollback did not restore every stored field. Nothing was accepted.')
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
        view = self._qorlia_inventory_form_snapshot(transfer_id, picking_type_id)
        model, _picking, _scope = self._qorlia_inventory_form_source(transfer_id, picking_type_id)
        return self._qorlia_inventory_choices_for_view(model, view, node, search, offset)

    def _qorlia_inventory_relation(self, model, view, node, domains=None):
        if type(node) is not int or not 0 <= node < len(view['layout']):
            raise ValidationError('This field node is not part of the native transfer form.')
        row = view['layout'][node]
        field = view['fields'][row['field']]
        if field['type'] != 'many2one':
            raise ValidationError('Choose a native transfer relation field.')
        if not row['rules']['visible'] or row['rules']['readonly']:
            raise AccessError('This native relation field is hidden or read-only.')
        context = dict(model.env.context)
        evaluation = {**view['values'], **context, 'uid': self.env.uid, 'context': context,
            'active_model': self._name, 'active_id': view['transfer_id'],
            'active_ids': [view['transfer_id']] if view['transfer_id'] else []}
        # The native modern form intersects onchange domains with the view-or-model domain.
        domain = row['domain'] if row['domain'] is not False else field.get('domain', [])
        domain = safe_eval(domain, evaluation) if isinstance(domain, str) else domain
        changed_domain = (domains or {}).get(row['field'], [])
        changed_domain = safe_eval(changed_domain, evaluation) if isinstance(changed_domain, str) else changed_domain
        if not isinstance(domain, (list, tuple)) or not isinstance(changed_domain, (list, tuple)):
            raise UserError('The native relation domain is not supported. Nothing was searched.')
        domain = expression.AND([domain, changed_domain])
        if row['context']:
            field_context = safe_eval(row['context'], evaluation)
            if not isinstance(field_context, dict):
                raise UserError('The native relation context is not supported. Nothing was searched.')
            context.update(field_context)
        context['allowed_company_ids'] = self.env.companies.ids
        relation = self.env[field['relation']].with_context(context)
        relation.check_access_rights('read')
        relation.check_field_access_rights('read', ['display_name'])
        return row, relation, domain

    def _qorlia_inventory_choices_for_view(self, model, view, node, search, offset, domains=None):
        if (type(node) is not int or node < 0 or not isinstance(search, str) or len(search) > 200
                or type(offset) is not int or offset < 0 or offset > 100000):
            raise ValidationError('Choose a native relation field and bounded search page.')
        row, relation, domain = self._qorlia_inventory_relation(model, view, node, domains)
        # shortcut: native name_search has no offset; preserve native ordering by fetching its bounded prefix.
        matches = relation.name_search(name=search, args=domain, operator='ilike', limit=offset + 26)
        records = relation.browse([item[0] for item in matches[offset:offset + 26]])
        records.check_access_rule('read')
        return {'read_only': True, 'transfer_id': view['transfer_id'], 'picking_type_id': view['picking_type_id'],
            'form_version': view['version'], 'node': node, 'field': row['field'], 'offset': offset,
            'rows': [_label(record) for record in records[:25]], 'has_more': len(records) > 25}

    @api.model
    def qorlia_inventory_form_choices(self, transfer_id=False, picking_type_id=False, node=0, search='', offset=0):
        self = self._qorlia_inventory_context()
        return self._qorlia_inventory_form_read(lambda: self._qorlia_inventory_form_choices(
            transfer_id, picking_type_id, node, search, offset))

    def _qorlia_inventory_edit_ledger(self, edits):
        if not isinstance(edits, list) or len(edits) > 100:
            raise ValidationError('Replay at most 100 ordered native transfer edits before reloading.')
        try:
            if len(json.dumps(edits, allow_nan=False)) > 2_000_000:
                raise ValueError()
        except (TypeError, ValueError):
            raise ValidationError('Use bounded finite JSON for the native form edit ledger.')

    def _qorlia_inventory_merge_onchange(self, model, origin, values, incoming):
        from .stock_inventory_draft import _wire
        merged = _wire(self._qorlia_inventory_merge_fields(model, origin, values, incoming))
        merged['id'] = origin.id if origin else False
        return merged

    def _qorlia_inventory_merge_fields(self, model, origin, values, incoming, path=()):
        if len(path) > 20:
            raise UserError('This native child structure exceeds the supported form depth.')
        result = dict(values)
        for name in dict.fromkeys([*values, *incoming]):
            value = incoming[name] if name in incoming else values[name]
            field = model._fields[name]
            if field.type not in ('one2many', 'many2many'):
                result[name] = value[0] if field.type == 'many2one' and isinstance(value, (list, tuple)) else value
                continue
            # Native web state retains child edits separately from membership, including after CLEAR then LINK.
            members, pending, deleted = {}, {}, set()
            initial = values[name] if name in values else [Command.link(identifier) for identifier in origin[name].ids] if origin else []
            streams = (initial or [], (incoming.get(name) or []))
            used_refs = {command[1] for stream in streams for command in stream if command[0] == Command.CREATE and command[1]}
            sequence = 0
            child_model = self.env[field.comodel_name]
            for stream in streams:
                for code, identifier, changes in stream:
                    if code == Command.CLEAR:
                        members.clear()
                    elif code == Command.SET:
                        members = dict.fromkeys((type(item) is not int, item) for item in changes)
                        deleted.difference_update(changes)
                    elif code in (Command.DELETE, Command.UNLINK):
                        members.pop((type(identifier) is not int, identifier), None)
                        if code == Command.DELETE and type(identifier) is int and identifier > 0:
                            deleted.add(identifier)
                    elif code in (Command.CREATE, Command.UPDATE, Command.LINK):
                        if code == Command.CREATE and not identifier:
                            identifier = 'qorlia_virtual:' + json.dumps([*path, name, sequence], separators=(',', ':'))
                            while identifier in used_refs:
                                sequence += 1
                                identifier = 'qorlia_virtual:' + json.dumps([*path, name, sequence], separators=(',', ':'))
                            used_refs.add(identifier)
                            sequence += 1
                        created = code == Command.CREATE or type(identifier) is not int
                        identity = (created, identifier)
                        if not created and (type(identifier) is not int or identifier <= 0):
                            raise ValidationError('The native child reference has no existing or virtual row.')
                        if created and code != Command.CREATE and identity not in pending:
                            raise ValidationError('The native child reference has no existing or virtual row.')
                        if code in (Command.CREATE, Command.UPDATE):
                            child_origin = child_model.browse(identifier) if not created else child_model.browse()
                            child_values = self._qorlia_inventory_merge_fields(child_model, child_origin,
                                pending.get(identity, {}), changes, (*path, name, identity))
                            pending[identity] = child_values
                        members[identity] = None
                        if not created:
                            deleted.discard(identifier)
                    else:
                        raise ValidationError('This native child command is not supported.')
            commands = [Command.clear()]
            for created, identifier in members:
                changes = pending.get((created, identifier), {})
                if created and (created, identifier) not in pending:
                    raise ValidationError('The native child reference has no existing or virtual row.')
                if not created and (type(identifier) is not int or identifier <= 0):
                    raise ValidationError('The native child reference has no existing or virtual row.')
                if created:
                    commands.append((Command.CREATE, identifier, changes))
                elif changes:
                    commands.append(Command.update(identifier, changes))
                else:
                    commands.append(Command.link(identifier))
            retained = {identifier for created, identifier in members if not created}
            commands.extend(Command.delete(identifier) for identifier in sorted(deleted - retained))
            result[name] = commands
        return result

    def _qorlia_inventory_edit_value(self, model, view, edit, domains):
        if not isinstance(edit, dict) or set(edit) != {'node', 'value'} or type(edit['node']) is not int:
            raise ValidationError('Select a native transfer field occurrence and value.')
        if not 0 <= edit['node'] < len(view['layout']):
            raise ValidationError('This field occurrence is not part of the native transfer form.')
        row = view['layout'][edit['node']]
        name, value = row['field'], edit['value']
        kind = view['fields'][name]['type']
        if name == 'id':
            raise ValidationError('Native Billing controls transfer identity. It cannot be edited.')
        if kind not in _SCALARS:
            raise ValidationError('Use the separate native child workflow for stock rows and collections.')
        if not row['rules']['visible'] or row['rules']['readonly']:
            raise AccessError('This native transfer field is hidden or read-only.')
        model.check_field_access_rights('write', [name])
        if kind == 'boolean' and type(value) is not bool:
            raise ValidationError('Use a Boolean value for this native field.')
        if kind == 'selection' and value is not False and type(value) not in (str, int):
            raise ValidationError('Select a native selection value.')
        if kind in ('char', 'text', 'html'):
            if value is not False and not isinstance(value, str):
                raise ValidationError('Enter native text or clear the field.')
            changed = {name: value}
        else:
            changed = self.env['sale.order']._qorlia_values(model, {name: value}, [name])
        if kind in ('date', 'datetime') and value is not False:
            converter = fields.Datetime if kind == 'datetime' else fields.Date
            try:
                if converter.to_string(converter.to_datetime(value) if kind == 'datetime'
                        else converter.to_date(value)) != value:
                    raise ValueError()
            except (ValueError, TypeError):
                raise ValidationError('Use the exact native date or UTC date-time format.')
        if kind == 'many2one' and value:
            _row, relation, domain = self._qorlia_inventory_relation(model, view, edit['node'], domains)
            offered = relation.name_search(name='', args=expression.AND([[('id', '=', value)], domain]),
                operator='ilike', limit=1)
            if not any(item[0] == value for item in offered):
                raise ValidationError('Choose a record offered by this native field domain.')
        return name, changed
