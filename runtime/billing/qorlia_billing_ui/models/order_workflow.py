# SPDX-License-Identifier: LGPL-3.0-or-later
# Copyright 2026 Qorlia contributors.
import hashlib
import json

from odoo import api, Command, models
from odoo.exceptions import UserError, ValidationError


class SaleOrderWorkflow(models.Model):
    _inherit = 'sale.order'

    def _qorlia_automation(self):
        # Read only these native settings. Financial actions retain the caller's ACLs.
        parameters = self.env['ir.config_parameter'].sudo()
        return {
            # Match Bahmni's installed action_confirm/_create_invoices semantics.
            'delivery': bool(parameters.get_param('bahmni_sale.is_delivery_automated')),
            'invoice': bool(parameters.get_param('bahmni_sale.is_invoice_automated')),
            'legacy_delivery': self.env.ref('bahmni_sale.validate_delivery_when_order_confirmed').sudo().value == '1',
        }

    def _qorlia_workflow_snapshot(self):
        self.ensure_one()
        invoices, pickings = self.invoice_ids.sorted('id'), self.picking_ids.sorted('id')
        if len(self.order_line) > 500 or len(invoices) > 100 or len(pickings) > 100:
            raise UserError('This order is too large for the review screen. Open it in native Billing.')
        for records in (invoices, pickings):
            records.check_access_rights('read')
            records.check_access_rule('read')
        automation = self._qorlia_automation()
        stamp = {
            'order': self._qorlia_version(), 'automation': automation,
            'invoices': [(item.id, str(item.write_date), item.state, item.payment_state) for item in invoices],
            'pickings': [(item.id, str(item.write_date), item.state) for item in pickings],
            'quantities': [(line.id, line.qty_delivered, line.qty_invoiced, line.qty_to_invoice, line.dispensed)
                           for line in self.order_line.sorted('id')],
        }
        writable = self.check_access_rights('write', raise_exception=False)
        if writable:
            self.check_access_rule('write')
        invoiceable = bool(self._get_invoiceable_lines(final=True).filtered(lambda line: not line.display_type))
        return {
            'id': self.id, 'name': self.name, 'state': self.state,
            'version': hashlib.sha256(json.dumps(stamp, sort_keys=True).encode()).hexdigest(),
            'customer': self.partner_id.display_name or False,
            'currency': [self.currency_id.id, self.currency_id.name],
            'amount_total': self.amount_total,
            'can_confirm': bool(writable and self.state in ('draft', 'sent')
                                and self.order_line.filtered(lambda line: not line.display_type)),
            'can_invoice': bool(writable and self.state in ('sale', 'done') and invoiceable),
            'can_advance': bool(writable and self.state in ('sale', 'done')
                                and self.env.user.has_group('account.group_account_invoice')
                                and self.env['account.move'].check_access_rights('create', raise_exception=False)),
            'automation': automation,
            'invoices': [{'id': invoice.id, 'name': invoice.name or False, 'state': invoice.state,
                          'total': invoice.invoice_total, 'currency': [invoice.currency_id.id, invoice.currency_id.name]}
                         for invoice in invoices],
            'pickings': [{'id': picking.id, 'name': picking.name, 'state': picking.state} for picking in pickings],
        }

    @api.model
    def qorlia_order_workflow_load(self, order_id):
        order = self._qorlia_order(order_id, states=None)
        return order._qorlia_workflow_snapshot()

    @api.model
    def qorlia_order_workflow_run(self, order_id, version, action):
        if action not in ('confirm', 'invoice') or not isinstance(version, str) or len(version) != 64:
            raise ValidationError('Select a supported order action and reload its current status.')
        order = self._qorlia_order(order_id, operation='write', lock=True, states=None)
        before = order._qorlia_workflow_snapshot()
        if version != before['version']:
            raise UserError('This order or its Billing settings changed. Reload its current status before continuing.')
        if not before['can_' + action]:
            raise UserError('This action is no longer available. Reload the current order status.')
        if action == 'confirm':
            # Native Bahmni may deliver stock and create/post invoices, as disclosed in the review.
            order.with_context(validate_analytic=True).action_confirm()
        else:
            # Use the native regular-invoice wizard, including its down-payment deductions.
            wizard = self.env['sale.advance.payment.inv'].create({
                'sale_order_ids': [Command.set(order.ids)],
                'advance_payment_method': 'delivered', 'deduct_down_payments': True,
            })
            wizard.create_invoices()
        order.invalidate_recordset()
        order.order_line.invalidate_recordset()
        return order._qorlia_workflow_snapshot()
