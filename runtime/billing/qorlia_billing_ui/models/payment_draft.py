# SPDX-License-Identifier: LGPL-3.0-or-later
# Copyright 2026 Qorlia contributors.
from odoo import api, fields, models
from odoo.exceptions import AccessError, UserError, ValidationError

from .invoice_draft import _digest


PAYMENT_FIELDS = ('partner_id', 'company_id', 'payment_type', 'amount', 'date', 'journal_id',
                  'payment_method_line_id', 'currency_id', 'partner_bank_id', 'ref',
                  'payment_reference', 'bank_reference', 'cheque_reference', 'effective_date')


class PaymentDraft(models.Model):
    _inherit = 'account.payment'

    def _qorlia_customer_payment_context(self):
        return self.with_context(default_partner_type='customer', qorlia_payment_company_scope=True)

    def _qorlia_payment_balance_documents(self, credit=False):
        self.ensure_one()
        if not self.partner_id:
            return self.env['account.move']
        if self.company_id not in self.env.companies:
            raise AccessError('Select a payment in your active Billing companies.')
        domain = [('partner_id', '=', self.partner_id.id), ('company_id', '=', self.company_id.id),
                  ('state', '=', 'posted')]
        domain += (['|', ('amount_residual', '<', 0), '&', ('amount_residual', '>', 0),
                    ('move_type', '=', 'out_refund')] if credit else
                   [('amount_residual', '>', 0), ('move_type', '=', 'out_invoice')])
        # Native SQL totals omit company scope and record rules. Keep the native predicates, using ORM access.
        return self.env['account.move'].search(domain, order='invoice_date_due,id ASC')

    def total_credit(self):
        if not self.env.context.get('qorlia_payment_company_scope'):
            return super().total_credit()
        return sum(abs(move.amount_residual) for move in self._qorlia_payment_balance_documents(credit=True))

    def total_outstanding(self):
        if not self.env.context.get('qorlia_payment_company_scope'):
            return super().total_outstanding()
        return sum(move.amount_residual for move in self._qorlia_payment_balance_documents())

    def _qorlia_payment_draft_origin(self, payment_id):
        payment = self._qorlia_state_payment(payment_id)
        if payment.state != 'draft':
            raise UserError('Only draft customer payments can be edited. Reset the payment first.')
        return payment

    def _qorlia_payment_draft_snapshot(self, payment, origin):
        helper = self.env['sale.order']
        values = helper._qorlia_read_fields(payment, PAYMENT_FIELDS)
        labels = {}
        for name in PAYMENT_FIELDS:
            if payment._fields[name].type == 'many2one':
                record = payment[name]
                record.check_access_rights('read')
                record.check_access_rule('read')
                if record:
                    labels[name] = record.display_name
        allocations = {'outstanding': [], 'credits': []}
        for kind, rows in (('outstanding', payment.outstanding_invoice_lines), ('credits', payment.credit_invoice_lines)):
            if len(rows) > 500:
                raise UserError('This payment has more than 500 allocation rows. Review it in native Billing.')
            for row in rows:
                document = row.invoice_id
                document.check_access_rights('read')
                document.check_access_rule('read')
                if document.company_id != payment.company_id or document.partner_id != payment.partner_id:
                    raise AccessError('Payment allocations must belong to the selected customer and company.')
                # Native allocation amounts are not converted between currencies.
                if document.currency_id != payment.currency_id:
                    raise UserError('Mixed-currency automatic allocation needs native Billing review.')
                allocations[kind].append({'invoice_id': document.id, 'name': document.name,
                    'date': fields.Date.to_string(row.date) or False, 'care_setting': row.care_setting or False,
                    'invoice_amount': row.invoice_amt, 'allocated_amount': row.allocated_amount,
                    'remaining_amount': row.remaining_amt, 'selected': row.selected,
                    'state': document.state, 'open_amount': document.amount_residual,
                    'document_version': _digest(document.read(['write_date', 'state', 'name', 'ref',
                        'invoice_date_due', 'amount_total', 'amount_residual', 'partner_id', 'company_id', 'currency_id']))})
        totals = {'current_outstanding': payment.current_outstanding, 'balance_outstanding': payment.balance_outstanding}
        version = self._qorlia_state_snapshot(origin)['version'] if origin else False
        stamp = {'id': origin.id or False, 'version': version, 'values': values, 'allocations': allocations,
                 'totals': totals, 'auto_allocate': payment.is_auto_reconciliation_applicable,
                 'labels': labels, 'author': self.env.uid,
                 'journal': payment.journal_id.read(['write_date']),
                 'company': payment.company_id.read(['write_date'])}
        return {'id': origin.id or False, 'version': version, 'values': values, 'labels': labels,
                'allocations': allocations, 'totals': totals,
                'auto_allocate': payment.is_auto_reconciliation_applicable, 'review_version': _digest(stamp)}

    def _qorlia_payment_draft_values(self, values):
        result = self.env['sale.order']._qorlia_values(self, values, PAYMENT_FIELDS)
        if result.get('company_id') not in self.env.companies.ids:
            raise AccessError('Select a payment in your active Billing companies.')
        if result.get('payment_type') not in ('inbound', 'outbound') or result.get('amount', 0) < 0:
            raise ValidationError('Select a payment direction and a nonnegative amount.')
        for name in ('date', 'effective_date'):
            value = result.get(name)
            try:
                valid = bool(value) and fields.Date.to_string(fields.Date.to_date(value)) == value
            except (TypeError, ValueError):
                valid = False
            if not valid and (name == 'date' or value is not False):
                raise ValidationError('Enter a valid accounting or effective date.')
        result.update(partner_type='customer', is_internal_transfer=False)
        return result

    @api.model
    def qorlia_customer_payment_draft_load(self, payment_id=False):
        model = self._qorlia_customer_payment_context()
        if payment_id is not False:
            origin = model._qorlia_payment_draft_origin(payment_id)
            return model._qorlia_payment_draft_snapshot(origin, origin)
        model.check_access_rights('create')
        values = model.default_get(list(PAYMENT_FIELDS))
        values.update(company_id=self.env.company.id, partner_type='customer', is_internal_transfer=False,
                      payment_type='inbound', amount=0, date=fields.Date.today())
        payment = model.new(values)
        return model._qorlia_payment_draft_snapshot(payment, model.browse())

    @api.model
    def qorlia_customer_payment_draft_preview(self, payload):
        if (not isinstance(payload, dict) or set(payload) != {'id', 'version', 'values'}):
            raise ValidationError('Use a valid customer payment draft.')
        model = self._qorlia_customer_payment_context()
        origin = model._qorlia_payment_draft_origin(payload['id']) if payload['id'] is not False else model.browse()
        if origin:
            if payload['version'] != model._qorlia_state_snapshot(origin)['version']:
                raise UserError('This payment changed. Reload before editing.')
            origin.check_access_rights('write')
            origin.check_access_rule('write')
        else:
            model.check_access_rights('create')
            if payload['version'] is not False:
                raise ValidationError('A new payment cannot carry an existing version.')
        if not self.env.user.has_group('account.group_account_invoice'):
            raise AccessError('Your Billing account cannot edit customer payments.')
        values = model._qorlia_payment_draft_values(payload['values'])
        # Never attach saved allocation rows: the native partner onchange unlinks its rows.
        payment = model.new(values)
        if payment.journal_id.type not in ('bank', 'cash') or payment.journal_id.company_id != payment.company_id:
            raise ValidationError('Select a bank or cash journal in the payment company.')
        if payment.payment_method_line_id._origin not in payment.available_payment_method_line_ids._origin:
            raise ValidationError('Select a payment method offered by this journal and direction.')
        if payment.partner_bank_id and payment.partner_bank_id._origin not in payment.available_partner_bank_ids._origin:
            raise ValidationError('Select a bank account offered by the native payment form.')
        if not payment.partner_id:
            raise ValidationError('Select a customer before reviewing payment allocations.')
        payment.update(payment.partner_id_onchange().get('value', {}) if payment.is_auto_reconciliation_applicable else {})
        payment.paid_amount_onchange()
        return model._qorlia_payment_draft_snapshot(payment, origin)
