# SPDX-License-Identifier: LGPL-3.0-or-later
# Copyright 2026 Qorlia contributors.
from contextlib import contextmanager
import hashlib
import json
import math

from odoo import api, Command, fields, models
from odoo.addons.bahmni_account.models.account_invoice import AccountInvoice as BahmniAccountInvoice
from odoo.exceptions import AccessError, UserError, ValidationError


class AccountMove(models.Model):
    _inherit = 'account.move'

    qorlia_item_subtotal = fields.Monetary(compute='_compute_qorlia_item_subtotal')

    @api.depends('invoice_line_ids.price_subtotal', 'invoice_line_ids.qorlia_adjustment_kind')
    def _compute_qorlia_item_subtotal(self):
        for invoice in self:
            invoice.qorlia_item_subtotal = sum(invoice.invoice_line_ids.filtered(
                lambda line: line.display_type == 'product' and not line.qorlia_adjustment_kind
            ).mapped('price_subtotal'))

    @api.depends('discount', 'discount_percentage', 'amount_total', 'round_off_amount',
                 'invoice_line_ids.price_total', 'invoice_line_ids.qorlia_adjustment_kind')
    def _compute_invoice_total(self):
        for invoice in self:
            applied = sum(invoice.invoice_line_ids.filtered('qorlia_adjustment_kind').mapped('price_total'))
            invoice.invoice_total = invoice.amount_total - invoice.discount + invoice.round_off_amount - applied

    @api.onchange('invoice_line_ids')
    def onchange_invoice_lines(self):
        for invoice in self:
            gross = invoice.qorlia_item_subtotal + invoice.amount_tax
            if invoice.discount_type == 'fixed':
                invoice.discount_percentage = invoice.discount / gross * 100 if gross else 0
            elif invoice.discount_type == 'percentage':
                invoice.discount = invoice.currency_id.round(gross * invoice.discount_percentage / 100)

    @api.onchange('discount', 'discount_percentage', 'discount_type')
    def onchange_discount(self):
        for invoice in self:
            if invoice.discount_type == 'none':
                invoice.discount = invoice.discount_percentage = 0
                invoice.disc_acc_id = False
            elif invoice.discount_type == 'fixed':
                invoice.discount_percentage = 0
            elif invoice.discount_type == 'percentage':
                invoice.discount = invoice.currency_id.round(
                    (invoice.qorlia_item_subtotal + invoice.amount_tax) * invoice.discount_percentage / 100)

    def _qorlia_prepare_adjustment_lines(self):
        self.ensure_one()
        gross = self.qorlia_item_subtotal + self.amount_tax
        if (not all(math.isfinite(amount) for amount in (self.discount, self.discount_percentage, self.round_off_amount))
                or self.discount < 0 or self.discount > gross or not 0 <= self.discount_percentage <= 100):
            raise ValidationError('The document discount must be between zero and the invoice total before adjustments.')
        if self.round_off_amount and self.invoice_cash_rounding_id:
            raise ValidationError('Use either Bahmni rounding or native cash rounding, not both.')
        commands = [Command.delete(line.id) for line in self.invoice_line_ids.filtered('qorlia_adjustment_kind')]
        for kind, name, amount, account in (
            ('discount', 'Document discount', -self.discount, self.disc_acc_id),
            ('rounding', 'Rounding adjustment', self.round_off_amount, self.company_id.qorlia_rounding_account_id),
        ):
            if self.currency_id.is_zero(amount):
                continue
            if not account or account.company_id != self.company_id or account.deprecated:
                raise ValidationError('Configure a valid %s account in this invoice company.' % kind)
            if account.account_type not in ('income_other', 'expense'):
                raise ValidationError('The %s account must be an income or expense adjustment account.' % kind)
            account.check_access_rights('read')
            account.check_access_rule('read')
            commands.append(Command.create({'name': name, 'qorlia_adjustment_kind': kind,
                'account_id': account.id, 'quantity': 1, 'price_unit': amount,
                'discount': 0, 'tax_ids': [Command.clear()], 'sequence': 9999}))
        if commands:
            self.write({'invoice_line_ids': commands})

    def _post(self, soft=True):
        for invoice in self.filtered(lambda move: move.state == 'draft' and move.move_type in ('out_invoice', 'out_refund')):
            if invoice._get_unbalanced_moves({'records': invoice}):
                raise UserError('This invoice already has unbalanced journal entries. Review it before posting.')
            invoice._qorlia_prepare_adjustment_lines()
        return super()._post(soft=soft)

    def action_post(self):
        # Skip only the pinned Bahmni receivable rewrite; retain the subsequent Sale and Odoo posting hooks.
        return super(BahmniAccountInvoice, self).action_post()

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
            'rounding_account': self.company_id.qorlia_rounding_account_id.read(
                ['write_date', 'company_id', 'account_type', 'deprecated']),
            'invoice': self.read(['write_date', 'ref', 'state', 'move_type', 'invoice_date', 'invoice_date_due', 'date', 'auto_post',
                                  'currency_id', 'company_id', 'journal_id', 'partner_id', 'invoice_total',
                                  'amount_residual', 'amount_total', 'amount_tax', 'discount_type', 'discount',
                                  'discount_percentage', 'disc_acc_id', 'round_off_amount', 'payment_state'])[0],
            'lines': self.line_ids.sorted('id').read(['write_date', 'name', 'account_id', 'debit', 'credit',
                                                    'amount_currency', 'amount_residual', 'reconciled',
                                                    'display_type', 'qorlia_adjustment_kind', 'quantity', 'price_unit', 'discount',
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


class AccountMoveLine(models.Model):
    _inherit = 'account.move.line'

    qorlia_adjustment_kind = fields.Selection([('discount', 'Document discount'), ('rounding', 'Rounding adjustment')],
                                             readonly=True, copy=True)


class ResCompany(models.Model):
    _inherit = 'res.company'

    qorlia_rounding_account_id = fields.Many2one('account.account', string='Qorlia rounding account', check_company=True)
