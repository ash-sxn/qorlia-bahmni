# SPDX-License-Identifier: LGPL-3.0-or-later
# Copyright 2026 Qorlia contributors.
import hmac

from odoo import api, models
from odoo.exceptions import AccessError, UserError, ValidationError

from .invoice_draft import _digest
from .stock_validation_recovery import _page_parameters


class StockInventoryCreateRecovery(models.Model):
    _inherit = 'stock.picking'

    def _qorlia_inventory_creation_recovery(self, payload):
        request, digest = self._qorlia_inventory_creation_request(payload)
        self._qorlia_inventory_creation_journal_ready()
        return request, digest, self._qorlia_inventory_creation_journal_read(request, digest)

    def _qorlia_inventory_creation_reference_labels(self, outcome):
        references = {}
        for key, item in (outcome['result']['references'].items() if outcome['accepted'] else []):
            available, identifier, label = False, False, False
            record = self.env[item['model']].browse(item['id']).exists()
            try:
                if record:
                    record.check_access_rights('read')
                    record.check_access_rule('read')
                    record.check_field_access_rights('read', ['display_name'])
                    if 'company_id' in record._fields:
                        record.check_field_access_rights('read', ['company_id'])
                        if record.company_id and record.company_id not in self.env.companies:
                            raise AccessError('The saved reference is outside the active companies.')
                    label = record.display_name
                    if not isinstance(label, str) or not label:
                        raise UserError('The saved reference has no valid native display name. Keep the original request.')
                    available, identifier = True, record.id
            except AccessError:
                available, identifier, label = False, False, False
            references[key] = {'model': item['model'], 'id': identifier, 'name': label, 'available': available}
        return references

    def _qorlia_inventory_creation_public_status(self, outcome):
        references = self._qorlia_inventory_creation_reference_labels(outcome)
        transfer = False
        if outcome['accepted']:
            root = {'model': self._name, 'id': outcome['result']['transfer_id']}
            transfer = next(references[key] for key, item in outcome['result']['references'].items() if item == root)
        return {'request_key': outcome['request_key'], 'accepted': outcome['accepted'], 'stopped': outcome['stopped'],
            'state_after': outcome['result']['state_after'] if outcome['accepted'] else False,
            'reference_count': len(references), 'transfer': transfer}

    @api.model
    def qorlia_inventory_create_status(self, payload):
        self = self._qorlia_inventory_context()
        _request, _digest_value, outcome = self._qorlia_inventory_creation_recovery(payload)
        return self._qorlia_inventory_creation_public_status(outcome)

    @api.model
    def qorlia_inventory_create_references(self, payload, after=0, version=False, limit=50):
        self = self._qorlia_inventory_context()
        _page_parameters(after, version, limit)
        request, digest, outcome = self._qorlia_inventory_creation_recovery(payload)
        if not outcome['accepted']:
            raise UserError('This creation request has not been accepted. Keep the original request and check its status.')
        references = self._qorlia_inventory_creation_reference_labels(outcome)
        basis = _digest({'purpose': 'qorlia.inventory-create-references.v1', 'database': self.env.cr.dbname,
            'request': digest, 'result': outcome['result']})
        current = self._qorlia_confirmation_signature(basis, references, {}, False)
        if version is not False and not hmac.compare_digest(version, current):
            raise UserError('Saved references or their access changed. Reload all reference pages.')
        keys = sorted(references)
        if after > len(keys):
            raise ValidationError('The cursor is outside this creation result.')
        return {'request_key': request['request_key'], 'version': current, 'after': after, 'total_count': len(keys),
            'next_after': after + limit if after + limit < len(keys) else False,
            'rows': [{'key': key, **references[key]} for key in keys[after:after + limit]]}

    @api.model
    def qorlia_inventory_create_stop(self, payload):
        self = self._qorlia_inventory_context()
        outcome = self._qorlia_inventory_create_stop(payload)
        return self._qorlia_inventory_creation_public_status(outcome)
