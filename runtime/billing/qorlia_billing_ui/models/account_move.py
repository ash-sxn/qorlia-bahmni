# SPDX-License-Identifier: LGPL-3.0-or-later
# Copyright 2026 Qorlia contributors.
from contextlib import contextmanager
import hashlib
import json

from odoo import api, models
from odoo.exceptions import AccessError, UserError, ValidationError


class AccountMove(models.Model):
    _inherit = 'account.move'

    @contextmanager
    def _check_balanced(self, container):
        # Restore Odoo's invariant omitted by the installed Bahmni discount override.
        with self._disable_recursion(container, 'check_move_validity', default=True, target=False) as disabled:
            yield
            if disabled:
                return
        if self._get_unbalanced_moves(container):
            raise UserError('Billing journal entries must balance before they can be saved or posted. '
                            'The current discount or rounding configuration produced unequal debits and credits. '
                            'No payment should be recorded. Ask your Billing administrator to review the configuration.')

    def _qorlia_invoice(self, invoice_id, operation='read', lock=False):
        if type(invoice_id) is not int or invoice_id <= 0:
            raise ValidationError('Select a valid customer invoice or credit note.')
        invoice = self.browse(invoice_id).exists()
        if not invoice:
            raise UserError('The invoice is no longer available.')
        invoice.check_access_rights(operation)
        invoice.check_access_rule(operation)
        if lock:
            self.env.cr.execute('SELECT id FROM account_move WHERE id = %s FOR UPDATE', [invoice.id])
            self.env.cr.execute('SELECT id FROM account_move_line WHERE move_id = %s ORDER BY id FOR UPDATE', [invoice.id])
            invoice.invalidate_recordset()
            invoice.line_ids.invalidate_recordset()
            invoice.check_access_rule(operation)
        if invoice.move_type not in ('out_invoice', 'out_refund'):
            raise UserError('Only customer invoices and credit notes are available in this workflow.')
        return invoice

    def _qorlia_invoice_snapshot(self):
        self.ensure_one()
        if len(self.line_ids) > 1000:
            raise UserError('This invoice is too large for this review screen. Open it in native Billing.')
        self.line_ids.check_access_rights('read')
        self.line_ids.check_access_rule('read')
        writable = self.check_access_rights('write', raise_exception=False)
        if writable:
            try:
                self.check_access_rule('write')
            except AccessError:
                writable = False
        ledger_balanced = not bool(self._get_unbalanced_moves({'records': self}))
        stamp = {
            'invoice': self.read(['write_date', 'ref', 'state', 'move_type', 'invoice_date', 'invoice_date_due', 'date', 'auto_post',
                                  'currency_id', 'company_id', 'journal_id', 'partner_id', 'invoice_total',
                                  'amount_residual', 'amount_total', 'amount_tax', 'discount_type', 'discount',
                                  'discount_percentage', 'disc_acc_id', 'round_off_amount', 'payment_state'])[0],
            'lines': self.line_ids.sorted('id').read(['write_date', 'name', 'account_id', 'debit', 'credit',
                                                    'amount_currency', 'amount_residual', 'reconciled',
                                                    'display_type', 'quantity', 'price_unit', 'discount',
                                                    'tax_ids', 'analytic_distribution']),
        }
        return {
            'id': self.id, 'name': self.name or False, 'state': self.state, 'move_type': self.move_type,
            'version': hashlib.sha256(json.dumps(stamp, sort_keys=True, default=str).encode()).hexdigest(),
            'customer': self.partner_id.display_name or False,
            'currency': [self.currency_id.id, self.currency_id.name],
            'total': self.invoice_total, 'open_amount': self.amount_residual,
            'payment_state': self.payment_state, 'invoice_date': str(self.invoice_date) if self.invoice_date else False,
            'journal': self.journal_id.display_name, 'company': self.company_id.display_name,
            'ledger_balanced': ledger_balanced,
            'can_post': bool(writable and self.env.user.has_group('account.group_account_invoice')
                             and self.state == 'draft' and not self.hide_post_button
                             and not self.display_inactive_currency_warning and ledger_balanced),
        }

    @api.model
    def qorlia_invoice_workflow_load(self, invoice_id):
        return self._qorlia_invoice(invoice_id)._qorlia_invoice_snapshot()

    @api.model
    def qorlia_invoice_workflow_post(self, invoice_id, version):
        if not isinstance(version, str) or len(version) != 64:
            raise ValidationError('Reload the current invoice status before posting.')
        invoice = self._qorlia_invoice(invoice_id, operation='write', lock=True)
        before = invoice._qorlia_invoice_snapshot()
        if version != before['version']:
            raise UserError('This invoice changed. Reload its current status before posting.')
        if not before['can_post']:
            raise UserError('Posting is not available. Check invoice status, permissions and journal balance.')
        invoice.with_context(validate_analytic=True).action_post()
        invoice.invalidate_recordset()
        invoice.line_ids.invalidate_recordset()
        return invoice._qorlia_invoice_snapshot()
