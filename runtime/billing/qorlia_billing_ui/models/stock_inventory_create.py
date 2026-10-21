# SPDX-License-Identifier: LGPL-3.0-or-later
# Copyright 2026 Qorlia contributors.
import copy

from lxml import etree
from odoo import models
from odoo.exceptions import UserError

from .stock_inventory_save import _SAVE_GRAPH, _SAVE_PRIVATE
from .stock_operation_paged import _FINANCE, _CONFIG


class StockInventoryCreate(models.Model):
    _inherit = 'stock.picking'

    def _qorlia_inventory_draft_prepare(self, seed, edits):
        """Prepare native create values only; this is not a public API or Save proof."""
        self = self._qorlia_inventory_context()

        def prepare():
            tables = self._qorlia_inventory_saved_tables()
            before = self._qorlia_confirmation_stamp(tables, semantic=True)
            model, values, domains, warning = self._qorlia_inventory_draft_replay_values(seed, edits)
            # Default child relations arrive as JSON [id, label] pairs, not ORM relation IDs.
            native_values = self._qorlia_inventory_merge_fields(model, model.browse(), {}, values)
            form = model.new(native_values)
            root = etree.fromstring(model.get_view(
                view_id=self.env.ref('stock.view_picking_form').id, view_type='form')['arch'])
            # A new native form submits its defaulted values too, not just the user's edited fields.
            changes = self._qorlia_inventory_save_fields(form, root, set(native_values), values=native_values)
            current = self._qorlia_inventory_draft_snapshot(model, seed, values, domains, warning, edits)
            form._check_company()
            self.env.cr.flush()
            if self._qorlia_confirmation_stamp(tables, semantic=True) != before:
                raise UserError('Preparing the native transfer changed stored data. Nothing was created.')
            return current, changes

        return self._qorlia_inventory_form_read(prepare)

    def _qorlia_inventory_create_native(self, seed, edits):
        """Save-only native execution. It allocates real references, so never use it for read-only preview."""
        self = self._qorlia_inventory_context()
        current, values = self._qorlia_inventory_draft_prepare(seed, edits)
        model, _spec, _metadata = self._qorlia_inventory_draft_seed(seed)
        cr = self.env.cr
        hooks = {name: (getattr(cr, name), list(getattr(cr, name)._funcs), copy.deepcopy(getattr(cr, name).data))
            for name in ('precommit', 'postcommit', 'prerollback', 'postrollback')}

        try:
            with cr.savepoint():
                native = self.browse()._qorlia_stock_preparation_native(lambda: model.create(values), _FINANCE, _CONFIG,
                    graph_models=_SAVE_GRAPH, private_models=_SAVE_PRIVATE,
                    private_always={'mail.followers'}, creation=True)
                return (*native, current)
        except Exception:
            for name, (callbacks, functions, data) in hooks.items():
                setattr(cr, name, callbacks)
                callbacks.clear()
                for function in functions:
                    callbacks.add(function)
                callbacks.data.update(data)
            raise
