# SPDX-License-Identifier: LGPL-3.0-or-later
# Copyright 2026 Qorlia contributors.
import copy
import hmac

from odoo import api, Command, models
from odoo.exceptions import UserError, ValidationError

from .invoice_draft import _digest
from .stock_confirmation_paged import _hash, _effect_rows, _effect_page
from .stock_inventory_draft import _wire
from .stock_operation_paged import _FINANCE, _CONFIG


_PURPOSE = 'qorlia.inventory-stored-onchange.v1'


class StockInventoryEdit(models.Model):
    _inherit = 'stock.picking'

    def _qorlia_inventory_edit_source(self, transfer_id):
        source = self._qorlia_inventory_form_source(transfer_id, False)
        model, picking, _scope = source
        if not picking:
            raise ValidationError('Choose a saved native transfer for header editing.')
        form = self._qorlia_inventory_form_snapshot(transfer_id, False, source_override=source)
        if form['unsupported']:
            raise UserError('This stored native form needs an adapter for its unsupported field types.')
        names = list(form['fields'])
        picking.check_field_access_rights('read', names)
        values = self.env['sale.order']._qorlia_from_onchange(model, picking.read(names)[0], names)
        for name in form['collections']:
            records = picking[name]
            if records:
                records.check_access_rights('read')
                records.check_access_rule('read')
            values[name] = [Command.link(identifier) for identifier in values[name]]
        spec = model._onchange_spec(model.get_view(view_id=self.env.ref('stock.view_picking_form').id, view_type='form'))
        return source, form, spec, values

    def _qorlia_inventory_stored_snapshot(self, source, baseline, values, warning):
        model, picking, _scope = source
        form = model.new(values, origin=picking)
        return self._qorlia_inventory_form_snapshot(picking.id, False, form_override=form,
            warning_override=warning, source_override=source, basis_version=baseline['version'])

    @api.model
    def qorlia_inventory_edit_load(self, transfer_id):
        self = self._qorlia_inventory_context()
        def load():
            _source, form, _spec, _values = self._qorlia_inventory_edit_source(transfer_id)
            return {'read_only': True, 'write_ready': False, 'transfer_id': transfer_id,
                'version': form['version'], 'form': form}
        return self._qorlia_inventory_form_read(load)

    def _qorlia_inventory_stored_replay(self, source, baseline, spec, initial, edits, dirty=None):
        model, picking, _scope = source
        values, domains, warning = copy.deepcopy(initial), {}, False
        for edit in edits:
            view = self._qorlia_inventory_stored_snapshot(source, baseline, values, warning)
            name, changed = self._qorlia_inventory_edit_value(model, view, edit, domains)
            values.update(changed)
            if dirty is not None:
                dirty.add(name)
            if spec.get(name) in ('1', 'true'):
                result = _wire(picking.onchange(dict(values, id=picking.id), [name], spec))
                incoming = self.env['sale.order']._qorlia_from_onchange(model, result.get('value', {}), baseline['fields'])
                if dirty is not None:
                    dirty.update(incoming)
                values = self._qorlia_inventory_merge_onchange(model, picking, values, incoming)
                domains.update(result.get('domain') or {})
                warning = result.get('warning') or False
        return {'form': self._qorlia_inventory_stored_snapshot(source, baseline, values, warning),
            'domains': domains}, values

    def _qorlia_inventory_edit_preview(self, transfer_id, version, edits, choice=False):
        if not _hash(version):
            raise ValidationError('Reload the saved transfer and use its original form version.')
        self._qorlia_inventory_edit_ledger(edits)
        source, baseline, spec, values = self._qorlia_inventory_edit_source(transfer_id)
        if not hmac.compare_digest(version, baseline['version']):
            raise UserError('The transfer, native view or configuration changed. Reload the stored form.')
        model, picking, _scope = source
        def replay():
            current, _values = self._qorlia_inventory_stored_replay(source, baseline, spec, values, edits)
            if choice:
                current['page'] = self._qorlia_inventory_form_read(lambda: self._qorlia_inventory_choices_for_view(
                    model, current['form'], choice['node'], choice['search'], choice['offset'], current['domains']))
            return current
        # Inspect real native linked writes, but never persist a header or a stock change from this preview.
        native = picking._qorlia_stock_preparation_preview(lambda: picking._qorlia_stock_preparation_native(
            replay, _FINANCE, _CONFIG, preserve_state=True), self._qorlia_return_paged_tables())
        effects, private_audit, _state, _references, current = native
        basis = _digest({'purpose': _PURPOSE, 'transfer_id': transfer_id, 'version': version, 'edits': edits,
            'form': current['form'], 'domains': current['domains'], 'companies': self.env.companies.ids})
        effect_version = picking._qorlia_confirmation_signature(basis, effects, private_audit, False)
        return {'read_only': True, 'write_ready': False, 'transfer_id': transfer_id, 'version': version,
            'edits': copy.deepcopy(edits), 'effect_version': effect_version, 'effect_count': len(_effect_rows(effects)),
            **current}, effects

    @api.model
    def qorlia_inventory_edit_onchange(self, transfer_id, version, edits):
        self = self._qorlia_inventory_context()
        return self._qorlia_inventory_edit_preview(transfer_id, version, edits)[0]

    @api.model
    def qorlia_inventory_edit_choices(self, transfer_id, version, edits, node, search='', offset=0):
        self = self._qorlia_inventory_context()
        current, _effects = self._qorlia_inventory_edit_preview(transfer_id, version, edits,
            {'node': node, 'search': search, 'offset': offset})
        return current

    def _qorlia_inventory_effect_token(self, transfer_id, version, edits, effect_version, position):
        return self._qorlia_confirmation_signature(_digest({'purpose': _PURPOSE + '.continue',
            'transfer_id': transfer_id, 'version': version, 'edits': edits}),
            {'effect_version': effect_version, 'position': position}, {}, False)

    @api.model
    def qorlia_inventory_edit_effects(self, transfer_id, version, edits, after=0,
            effect_version=False, continuation_token=False, limit=50):
        self = self._qorlia_inventory_context()
        if (type(after) is not int or after < 0 or type(limit) is not int or not 1 <= limit <= 100
                or after == 0 and (effect_version is not False or continuation_token is not False)
                or after > 0 and (not _hash(effect_version) or not _hash(continuation_token))):
            raise ValidationError('Inspect bounded native onchange effects in order with their original tokens.')
        current, effects = self._qorlia_inventory_edit_preview(transfer_id, version, edits)
        actual = current['effect_version']
        rows = _effect_rows(effects)
        if after > len(rows):
            raise ValidationError('The effect cursor is outside this native onchange preview.')
        if after and (not hmac.compare_digest(actual, effect_version) or not hmac.compare_digest(
                self._qorlia_inventory_effect_token(transfer_id, version, edits, actual, after), continuation_token)):
            raise UserError('Native onchange effects changed or a page was skipped. Inspect them again from the start.')
        # shortcut: each page replays the complete native ledger; benchmark large transfers before release.
        end = min(after + limit, len(rows))
        return {**current, 'after': after, 'next_after': end if end < len(rows) else False,
            'effects': _effect_page(effects, rows[after:end]),
            'continuation_token': self._qorlia_inventory_effect_token(transfer_id, version, edits, actual, end)
                if end < len(rows) else False}
