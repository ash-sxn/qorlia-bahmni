# SPDX-License-Identifier: LGPL-3.0-or-later
# Copyright 2026 Qorlia contributors.
import copy
import hmac
import json

from odoo import api, fields, models
from odoo.exceptions import AccessError, UserError, ValidationError
from odoo.osv import expression
from odoo.tools.date_utils import json_default

from .invoice_draft import _digest
from .stock_confirmation_paged import _hash
from .stock_inventory_form import _ATTRIBUTES, _SCALARS


_PURPOSE = 'qorlia.inventory-new-form.v1'
_SEED_KEYS = {'picking_type_id', 'version', 'values', 'domains', 'warning', 'signature'}


def _wire(value):
    # Sign the date/child-command representation Odoo actually sends over JSON, not Python datetime objects.
    return json.loads(json.dumps(value, default=json_default, allow_nan=False))


class StockInventoryDraft(models.Model):
    _inherit = 'stock.picking'

    def _qorlia_inventory_draft_source(self, picking_type_id):
        model, _picking, _scope = self._qorlia_inventory_form_source(False, picking_type_id)
        view = model.get_view(view_id=self.env.ref('stock.view_picking_form').id, view_type='form')
        spec = model._onchange_spec(view)
        names = sorted({name.split('.')[0] for name in spec})
        metadata = model.fields_get(names, attributes=_ATTRIBUTES)
        if set(metadata) != set(names):
            raise AccessError('A native new-transfer field is not readable by this account.')
        model.check_field_access_rights('read', names)
        if any(item['type'] not in _SCALARS | {'one2many', 'many2many'} for item in metadata.values()):
            raise UserError('This native new-transfer form needs an adapter for its unsupported field types.')
        version = _digest({'purpose': _PURPOSE, 'database': self.env.cr.dbname, 'author': self.env.uid,
            'companies': self.env.companies.ids, 'groups': sorted(self.env.user.groups_id.ids),
            'context': dict(model.env.context), 'picking_type_id': picking_type_id,
            'view': view['arch'], 'fields': metadata, 'spec': spec,
            'today': str(fields.Date.context_today(model)), 'server_today': str(fields.Date.today()),
            'stamp': self._qorlia_confirmation_stamp(self._qorlia_return_paged_tables())})
        return model, spec, metadata, version

    def _qorlia_inventory_draft_signature(self, seed):
        return self._qorlia_confirmation_signature(_PURPOSE,
            {key: seed[key] for key in _SEED_KEYS - {'signature'}}, {}, False)

    def _qorlia_inventory_draft_seed(self, seed):
        if (not isinstance(seed, dict) or set(seed) != _SEED_KEYS
                or not _hash(seed['version']) or not _hash(seed['signature'])
                or not isinstance(seed['values'], dict) or not isinstance(seed['domains'], dict)
                or not (seed['warning'] is False or isinstance(seed['warning'], dict))):
            raise ValidationError('Use the original signed native new-transfer defaults.')
        try:
            if len(json.dumps(seed, allow_nan=False)) > 2_000_000:
                raise ValueError()
        except (ValueError, TypeError):
            raise ValidationError('Use finite JSON values in the original native form seed.')
        model, spec, metadata, version = self._qorlia_inventory_draft_source(seed['picking_type_id'])
        if (not hmac.compare_digest(version, seed['version']) or not hmac.compare_digest(
                self._qorlia_inventory_draft_signature(seed), seed['signature'])):
            raise UserError('The native defaults, account or configuration changed. Reload the new-transfer form.')
        return model, spec, metadata

    def _qorlia_inventory_draft_snapshot(self, model, seed, values, domains, warning, edits):
        form = model.new(values)
        # The original action/default context remains intact when the selected operation type changes.
        view = self._qorlia_inventory_form_snapshot(False, seed['picking_type_id'],
            form_override=form, warning_override=warning)
        return {'read_only': True, 'write_ready': False, 'version': seed['version'],
            'seed': copy.deepcopy(seed), 'edits': copy.deepcopy(edits), 'domains': copy.deepcopy(domains), 'form': view}

    def _qorlia_inventory_draft_load(self, picking_type_id):
        model, spec, metadata, version = self._qorlia_inventory_draft_source(picking_type_id)
        changed = _wire(model.onchange({}, [], spec))
        values = self.env['sale.order']._qorlia_from_onchange(model, changed.get('value', {}), metadata)
        seed = {'picking_type_id': picking_type_id, 'version': version, 'values': values,
            'domains': changed.get('domain') or {}, 'warning': changed.get('warning') or False}
        seed['signature'] = self._qorlia_inventory_draft_signature(seed)
        if len(json.dumps(seed, allow_nan=False)) > 2_000_000:
            raise UserError('These native defaults require a larger paged form contract before editing.')
        return self._qorlia_inventory_draft_snapshot(model, seed, values, seed['domains'], seed['warning'], [])

    @api.model
    def qorlia_inventory_draft_load(self, picking_type_id=False):
        self = self._qorlia_inventory_context()
        return self._qorlia_inventory_form_read(lambda: self._qorlia_inventory_draft_load(picking_type_id))

    def _qorlia_inventory_draft_replay(self, seed, edits):
        model, spec, metadata = self._qorlia_inventory_draft_seed(seed)
        if not isinstance(edits, list) or len(edits) > 100:
            raise ValidationError('Replay at most 100 ordered native new-transfer edits before reloading.')
        try:
            if len(json.dumps(edits, allow_nan=False)) > 2_000_000:
                raise ValueError()
        except (TypeError, ValueError):
            raise ValidationError('Use bounded finite JSON for the native form edit ledger.')
        values, domains, warning = copy.deepcopy(seed['values']), copy.deepcopy(seed['domains']), seed['warning']
        for index, edit in enumerate(edits):
            if not isinstance(edit, dict) or set(edit) != {'node', 'value'} or type(edit['node']) is not int:
                raise ValidationError('Select a native new-transfer field occurrence and value.')
            current = self._qorlia_inventory_draft_snapshot(model, seed, values, domains, warning, edits[:index])
            view = current['form']
            if not 0 <= edit['node'] < len(view['layout']):
                raise ValidationError('This field occurrence is not part of the native new-transfer form.')
            row = view['layout'][edit['node']]
            name = row['field']
            kind = metadata[name]['type']
            if name == 'id':
                raise ValidationError('Native Billing assigns the new transfer identity when it is saved.')
            if kind not in _SCALARS:
                raise ValidationError('Use the separate native child workflow for stock rows and collections.')
            if not row['rules']['visible'] or row['rules']['readonly']:
                raise AccessError('This native new-transfer field is hidden or read-only.')
            model.check_field_access_rights('write', [name])
            if kind == 'boolean' and type(edit['value']) is not bool:
                raise ValidationError('Use a Boolean value for this native field.')
            if kind == 'selection' and edit['value'] is not False and type(edit['value']) not in (str, int):
                raise ValidationError('Select a native selection value.')
            if kind in ('char', 'text', 'html'):
                if edit['value'] is not False and not isinstance(edit['value'], str):
                    raise ValidationError('Enter native text or clear the field.')
                changed = {name: edit['value']}
            else:
                changed = self.env['sale.order']._qorlia_values(model, {name: edit['value']}, [name])
            if kind in ('date', 'datetime') and edit['value'] is not False:
                converter = fields.Datetime if kind == 'datetime' else fields.Date
                try:
                    if converter.to_string(converter.to_datetime(edit['value']) if kind == 'datetime'
                            else converter.to_date(edit['value'])) != edit['value']:
                        raise ValueError()
                except (ValueError, TypeError):
                    raise ValidationError('Use the exact native date or UTC date-time format.')
            if kind == 'many2one' and edit['value']:
                _row, relation, domain = self._qorlia_inventory_relation(model, view, edit['node'], domains)
                offered = relation.name_search(name='', args=expression.AND([[('id', '=', edit['value'])], domain]),
                    operator='ilike', limit=1)
                if not any(item[0] == edit['value'] for item in offered):
                    raise ValidationError('Choose a record offered by this native field domain.')
            values.update(changed)
            if spec.get(name) in ('1', 'true'):
                result = _wire(model.onchange(dict(values, id=False), [name], spec))
                values.update(self.env['sale.order']._qorlia_from_onchange(model, result.get('value', {}), metadata))
                domains.update(result.get('domain') or {})
                warning = result.get('warning') or False
        return model, self._qorlia_inventory_draft_snapshot(model, seed, values, domains, warning, edits)

    @api.model
    def qorlia_inventory_draft_onchange(self, seed, edits):
        self = self._qorlia_inventory_context()
        return self._qorlia_inventory_form_read(lambda: self._qorlia_inventory_draft_replay(seed, edits)[1])

    @api.model
    def qorlia_inventory_draft_choices(self, seed, edits, node, search='', offset=0):
        self = self._qorlia_inventory_context()
        def choices():
            model, current = self._qorlia_inventory_draft_replay(seed, edits)
            page = self._qorlia_inventory_choices_for_view(model, current['form'], node, search, offset, current['domains'])
            return {'version': current['version'], 'edits': current['edits'], 'page': page}
        return self._qorlia_inventory_form_read(choices)
