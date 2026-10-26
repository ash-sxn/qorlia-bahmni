# SPDX-License-Identifier: LGPL-3.0-or-later
# Copyright 2026 Qorlia contributors.
import json

from odoo import api, models
from odoo.exceptions import UserError

from .invoice_draft import _digest


class StockInventoryCreateReview(models.Model):
    _inherit = 'stock.picking'

    @api.model
    def qorlia_inventory_create_values_review(self, seed, edits):
        self = self._qorlia_inventory_context()

        def review():
            current, values = self._qorlia_inventory_draft_prepare(seed, edits)
            basis = _digest({'purpose': 'qorlia.inventory-create-values.v1', 'database': self.env.cr.dbname,
                'companies': self.env.companies.ids, 'current': current, 'prepared_values': values,
                'stamp': self._qorlia_confirmation_stamp(self._qorlia_inventory_saved_tables())})
            # This signs complete prepared values, not simulated creation effects or authorization to Save.
            result = {**current, 'review_kind': 'native_create_values', 'prepared_values': values,
                'values_version': self._qorlia_confirmation_signature(basis, {}, {}, False)}
            if len(json.dumps(result, allow_nan=False)) > 4_000_000:
                raise UserError('This complete native values review needs a paged contract. Nothing was created.')
            return result

        return self._qorlia_inventory_form_read(review)
