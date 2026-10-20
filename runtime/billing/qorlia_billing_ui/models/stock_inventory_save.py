# SPDX-License-Identifier: LGPL-3.0-or-later
# Copyright 2026 Qorlia contributors.
import copy
import hmac

from lxml import etree
from odoo import api, Command, models
from odoo.exceptions import UserError, ValidationError

from .invoice_draft import _digest
from .stock_confirmation_paged import _hash, _effect_rows, _effect_page
from .stock_inventory_form import _modifier, _presentation, _SCALARS
from .stock_inventory_draft import _wire
from .stock_operation_paged import _FINANCE, _CONFIG
from .stock_confirmation import GRAPH_MODELS, AUDIT_MODELS


_PURPOSE = 'qorlia.inventory-stored-save.v1'
_SAVE_GRAPH = (*GRAPH_MODELS, 'mail.followers')
_SAVE_PRIVATE = AUDIT_MODELS | {'mail.followers'}


class StockInventorySave(models.Model):
    _inherit = 'stock.picking'

    def _qorlia_inventory_saved_tables(self):
        model = self.env['mail.followers']
        return sorted(set(self._qorlia_return_paged_tables()) | {model._table} |
            {field.relation for field in model._fields.values() if field.type == 'many2many' and field.store and field.relation})

    def _qorlia_inventory_save_fields(self, record, root, dirty, parent=None, depth=0):
        if depth > 10:
            raise UserError('This nested native form needs an explicit save adapter.')
        nodes = root.xpath('.//field[not(ancestor::field)]')
        names = list(dict.fromkeys(node.get('name') for node in nodes))
        record.check_field_access_rights('read', names)
        context = self.env['sale.order']._qorlia_read_fields(record,
            [name for name in names if record._fields[name].type in _SCALARS])
        context['id'] = record._origin.id or False
        context.update({name: record[name]._origin.id or False for name in names
            if record._fields[name].type == 'many2one'})
        context.update({name: [row._origin.id if row._origin else 'virtual:%s' % index
            for index, row in enumerate(record[name])] for name in names
            if record._fields[name].type in ('one2many', 'many2many')})
        context.update({'parent.' + name: value for name, value in (parent or {}).items()})
        result = {}
        for name in names:
            if name == 'id':
                continue
            occurrences = [node for node in nodes if node.get('name') == name]
            rules = []
            for node in occurrences:
                presentation = _presentation(node)
                conditions = [*presentation['ancestor_modifiers'], presentation['modifiers']]
                rules.append((node, any(_modifier(item.get('readonly', False), context) for item in conditions),
                    not any(_modifier(item.get('invisible', False), context) or
                        _modifier(item.get('column_invisible', False), context) for item in conditions),
                    _modifier(presentation['modifiers'].get('required', False), context)))
            field = record._fields[name]
            value = record[name]
            empty = not value if field.type in ('one2many', 'many2many', 'many2one') else value is False or value is None or value == ''
            if field.type != 'boolean' and empty and any(visible and required for _node, _readonly, visible, required in rules):
                raise ValidationError('Complete the required native field: %s.' % field.string)
            if name not in dirty:
                continue
            editable = [node for node, readonly, _visible, _required in rules if not readonly or
                node.get('force_save') in ('1', 'true', 'True')]
            if not editable:
                continue
            record.check_field_access_rights('write', [name])
            converted = field.convert_to_write(value._origin if field.type == 'many2one' and value else value, record)
            if field.type not in ('one2many', 'many2many'):
                result[name] = converted
                continue
            if field.type == 'one2many':
                retained = [identifier for command in converted if command[0] == Command.SET for identifier in command[2]]
                # Native StaticList emits links, not a SET which can clear a computed relation before its inverse runs.
                converted = ([Command.link(identifier) for identifier in retained] +
                    [command for command in converted if command[0] != Command.SET] +
                    [Command.unlink(identifier) for identifier in record._origin[name].ids if identifier not in retained])
            if not any(command[0] in (Command.CREATE, Command.UPDATE) for command in converted):
                result[name] = converted
                continue
            # The ORM owns current relation membership and pending child values, not a client-generated diff.
            node = editable[0]
            subviews = node.xpath('./tree|./form')
            if subviews:
                subview = etree.fromstring(etree.tostring(subviews[0]))
            else:
                arch = self.env[field.comodel_name].get_view(view_type='tree')['arch']
                subview = etree.fromstring(arch)
            commands, new_rows = [], iter(value.filtered(lambda row: not row._origin))
            for command in converted:
                code, identifier, changes = command
                if code not in (Command.CREATE, Command.UPDATE):
                    commands.append(command)
                    continue
                child = next(new_rows, None) if code == Command.CREATE else value.filtered(lambda row: row._origin.id == identifier)
                if not child or len(child) != 1:
                    raise UserError('A native child row changed identity during save preparation.')
                child_values = self._qorlia_inventory_save_fields(child, subview, set(changes), context, depth + 1)
                if code == Command.CREATE:
                    commands.append(Command.create(child_values))
                elif child_values:
                    commands.append(Command.update(identifier, child_values))
            result[name] = commands
        return _wire(result)

    def _qorlia_inventory_saved_apply(self, source, baseline, spec, initial, edits):
        model, picking, _scope = source
        picking.check_access_rights('write')
        picking.check_access_rule('write')
        dirty = set()
        current, values = self._qorlia_inventory_stored_replay(source, baseline, spec, initial, edits, dirty)
        form = model.new(values, origin=picking)
        root = etree.fromstring(model.get_view(view_id=self.env.ref('stock.view_picking_form').id, view_type='form')['arch'])
        changes = self._qorlia_inventory_save_fields(form, root, dirty)
        for name in dirty:
            field = model._fields[name]
            if field.type in ('one2many', 'many2many') and name in changes:
                # Preserve explicit native root deletions which ORM membership normalization cannot represent.
                deleted = {command[1] for command in values[name] if command[0] == Command.DELETE}
                changes[name] = [command for command in changes[name] if not
                    (command[0] == Command.UNLINK and command[1] in deleted)]
                changes[name].extend(command for command in values[name] if command[0] == Command.DELETE)
        if changes:
            picking.write(changes)
        picking._check_company()
        return {'form': current['form'], 'domains': current['domains'], 'changed_fields': sorted(changes)}

    def _qorlia_inventory_saved_preview(self, transfer_id, version, edits):
        if not _hash(version):
            raise ValidationError('Reload the saved transfer and its original version.')
        self._qorlia_inventory_edit_ledger(edits)
        source, baseline, spec, initial = self._qorlia_inventory_edit_source(transfer_id)
        if not hmac.compare_digest(version, baseline['version']):
            raise UserError('The transfer, native form or configuration changed. Reload it.')
        _model, picking, _scope = source
        tables = self._qorlia_inventory_saved_tables()
        stamp = self._qorlia_confirmation_stamp(tables)
        native = picking._qorlia_stock_preparation_preview(lambda: picking._qorlia_stock_preparation_native(
            lambda: self._qorlia_inventory_saved_apply(source, baseline, spec, initial, edits),
            _FINANCE, _CONFIG, allow_terminal_unchanged=True, graph_models=_SAVE_GRAPH,
            private_models=_SAVE_PRIVATE, private_always={'mail.followers'}), tables)
        effects, private_audit, state, _references, current = native
        basis = _digest({'purpose': _PURPOSE, 'database': self.env.cr.dbname,
            'transfer_id': transfer_id, 'version': version, 'edits': edits,
            'form': current['form'], 'domains': current['domains'], 'changed_fields': current['changed_fields'],
            'companies': self.env.companies.ids, 'stamp': stamp})
        reviewed = picking._qorlia_confirmation_signature(basis, effects, private_audit, state)
        return {'read_only': True, 'write_ready': False, 'transfer_id': transfer_id, 'version': version,
            'edits': copy.deepcopy(edits), 'review_version': reviewed, 'state_after': state,
            'effect_count': len(_effect_rows(effects)), **current}, effects

    def _qorlia_inventory_saved_token(self, transfer_id, version, edits, reviewed, position):
        return self._qorlia_confirmation_signature(_digest({'purpose': _PURPOSE + '.continue', 'database': self.env.cr.dbname,
            'transfer_id': transfer_id, 'version': version, 'edits': edits}),
            {'review_version': reviewed, 'position': position}, {}, False)

    @api.model
    def qorlia_inventory_edit_save_review(self, transfer_id, version, edits, after=0,
            review_version=False, continuation_token=False, limit=50):
        self = self._qorlia_inventory_context()
        if (type(after) is not int or after < 0 or type(limit) is not int or not 1 <= limit <= 100
                or after == 0 and (review_version is not False or continuation_token is not False)
                or after > 0 and (not _hash(review_version) or not _hash(continuation_token))):
            raise ValidationError('Review complete native save effects in order with their original tokens.')
        current, effects = self._qorlia_inventory_saved_preview(transfer_id, version, edits)
        rows, actual = _effect_rows(effects), current['review_version']
        if after > len(rows):
            raise ValidationError('The cursor is outside this native save review.')
        if after and (not hmac.compare_digest(actual, review_version) or not hmac.compare_digest(
                self._qorlia_inventory_saved_token(transfer_id, version, edits, actual, after), continuation_token)):
            raise UserError('Save effects changed or a page was skipped. Review again from the start.')
        end = min(after + limit, len(rows))
        return {**current, 'after': after, 'next_after': end if end < len(rows) else False,
            'effects': _effect_page(effects, rows[after:end]),
            'continuation_token': self._qorlia_inventory_saved_token(transfer_id, version, edits, actual, end)
                if end < len(rows) else False}
