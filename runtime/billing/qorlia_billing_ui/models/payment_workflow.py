# SPDX-License-Identifier: LGPL-3.0-or-later
# Copyright 2026 Qorlia contributors.
import hashlib
import json
import math

from odoo import api, fields, models
from odoo.exceptions import AccessError, UserError, ValidationError


PAYMENT_FIELDS = ('journal_id', 'payment_method_line_id', 'currency_id', 'partner_bank_id',
                  'amount', 'payment_date', 'communication', 'payment_difference_handling',
                  'writeoff_account_id', 'writeoff_label')
RELATIONS = ('journal_id', 'payment_method_line_id', 'currency_id', 'partner_bank_id', 'writeoff_account_id')


class PaymentWorkflow(models.Model):
    _inherit = 'account.move'

    def _qorlia_payment_access(self):
        self.ensure_one()
        if not self.env.user.has_group('account.group_account_invoice'):
            raise AccessError('Your Billing account cannot register payments.')
        for model, operation in (('account.payment', 'create'), ('account.payment.register', 'create'),
                                 ('account.move', 'write'), ('account.move.line', 'write')):
            self.env[model].check_access_rights(operation)
        self.check_access_rule('write')

    def _qorlia_payment_wizard(self, values=None, changed=False):
        self._qorlia_payment_access()
        if self.state != 'posted' or self.currency_id.is_zero(self.amount_residual):
            raise UserError('Register payments only for posted invoices or credit notes with an open amount.')
        if self._get_unbalanced_moves({'records': self}):
            raise UserError('The invoice journal entries do not balance. Do not record a payment.')
        if values is not None and (not isinstance(values, dict) or set(values) - set(PAYMENT_FIELDS)):
            raise ValidationError('Use only the reviewed native payment fields.')
        values = dict(values or {})
        if changed not in (False, 'journal_id', 'payment_method_line_id', 'currency_id', 'payment_date'):
            raise ValidationError('Select a valid payment field to update.')
        if changed == 'journal_id':
            for field in ('payment_method_line_id', 'currency_id', 'partner_bank_id', 'amount', 'payment_difference_handling'):
                values.pop(field, None)
        elif changed in ('currency_id', 'payment_date'):
            values.pop('amount', None)
            values.pop('payment_difference_handling', None)
        for field in RELATIONS:
            value = values.get(field, False)
            if value is not False and (type(value) is not int or value <= 0):
                raise ValidationError('Select a valid %s.' % field.replace('_', ' '))
        if 'amount' in values and (type(values['amount']) not in (int, float) or not math.isfinite(values['amount'])
                                   or values['amount'] <= 0):
            raise ValidationError('Enter a finite payment amount greater than zero.')
        if values.get('payment_difference_handling', 'open') not in ('open', 'reconcile'):
            raise ValidationError('Select how Billing should handle the payment difference.')
        for field in ('communication', 'writeoff_label'):
            value = values.get(field, False)
            if value is not False and (not isinstance(value, str) or len(value) > 500):
                raise ValidationError('Payment text must contain at most 500 characters.')
        for field in ('payment_date',):
            if field not in values:
                continue
            try:
                if not isinstance(values[field], str) or len(values[field]) != 10:
                    raise ValueError()
                fields.Date.to_date(values[field])
            except (ValueError, TypeError):
                raise ValidationError('Enter a valid payment date.')
        wizard_model = self.env['account.payment.register'].with_context(active_model='account.move', active_ids=self.ids)
        defaults = wizard_model.default_get(['line_ids', 'payment_date', 'communication'])
        wizard = wizard_model.new({**defaults, **values, 'group_payment': True})
        for record in (wizard.journal_id, wizard.currency_id, wizard.payment_method_line_id,
                       wizard.partner_bank_id, wizard.writeoff_account_id):
            if record:
                record.check_access_rights('read')
                record.check_access_rule('read')
        if wizard.journal_id and wizard.journal_id._origin not in wizard.available_journal_ids._origin:
            raise ValidationError('Choose a native payment journal in this invoice company.')
        if wizard.payment_method_line_id and wizard.payment_method_line_id._origin not in wizard.available_payment_method_line_ids._origin:
            raise ValidationError('Choose a payment method offered by this journal.')
        if wizard.currency_id and not wizard.currency_id.active:
            raise ValidationError('Choose an active payment currency.')
        if wizard.partner_bank_id and wizard.partner_bank_id._origin not in wizard.available_partner_bank_ids._origin:
            raise ValidationError('Choose a bank account offered by native Billing.')
        if wizard.writeoff_account_id and (wizard.writeoff_account_id.company_id != self.company_id
                                          or wizard.writeoff_account_id.deprecated):
            raise ValidationError('Choose a valid difference account in this invoice company.')
        return wizard

    def _qorlia_payment_snapshot(self, values=None, changed=False):
        invoice = self._qorlia_invoice_snapshot()
        payments = self._get_reconciled_payments()
        payments.check_access_rights('read')
        payments.check_access_rule('read')
        history = payments.sorted('id').read(['name', 'date', 'amount', 'currency_id', 'journal_id',
                                              'state', 'payment_type', 'ref', 'is_matched'])
        for payment in history:
            payment['date'] = str(payment['date'])
            payment['journal_type'] = payments.browse(payment['id']).journal_id.type
        result = {'invoice': invoice, 'payments': history, 'can_record': False, 'values': False,
                  'version': False, 'journals': [], 'methods': [], 'currencies': [], 'banks': [], 'accounts': [],
                  'currency': invoice['currency'], 'payment_type': False, 'difference': 0, 'reason': False}
        if not invoice['ledger_balanced'] or self.state != 'posted' or self.currency_id.is_zero(self.amount_residual):
            result['reason'] = 'A balanced posted invoice or credit note with an open amount is required.'
            return result
        wizard = self._qorlia_payment_wizard(values, changed)
        data = {field: wizard[field]._origin.id or False if field in RELATIONS else wizard[field] for field in PAYMENT_FIELDS}
        for field in ('payment_date',):
            data[field] = str(data[field]) if data[field] else False
        def choices(records):
            records = records._origin
            records.check_access_rights('read')
            records.check_access_rule('read')
            return [[record.id, record.display_name] for record in records]
        currencies = self.env['res.currency'].search([('active', '=', True)])
        accounts = self.env['account.account'].search([('company_id', '=', self.company_id.id), ('deprecated', '=', False)])
        methods = wizard.available_payment_method_line_ids._origin
        # shortcut: provider transactions need their own reviewed online-collection flow; this form records manual money movements.
        manual = wizard.payment_method_line_id and wizard.payment_method_line_id.code == 'manual'
        reason = False
        if not manual:
            reason = 'Online providers, checks and post-dated checks require their own workflow. Select a manual recording method here.'
        elif wizard.payment_difference_handling == 'reconcile' and not wizard.early_payment_discount_mode and not wizard.currency_id.is_zero(wizard.payment_difference) and not wizard.writeoff_account_id:
            reason = 'Select the native difference account before marking a payment difference as settled.'
        elif wizard.require_partner_bank_account and not wizard.partner_bank_id:
            reason = 'The native payment method requires a recipient bank account.'
        config = {'journals': wizard.available_journal_ids._origin.read(['write_date', 'name', 'company_id', 'currency_id', 'default_account_id']),
                  'methods': methods.read(['write_date', 'payment_account_id', 'payment_method_id']),
                  'accounts': accounts.read(['write_date', 'deprecated', 'company_id']),
                  'currencies': currencies.read(['write_date', 'rounding']),
                  'rates': self.env['res.currency.rate'].search([('currency_id', 'in', currencies.ids),
                             ('company_id', 'in', [False, self.company_id.id])]).read(['write_date', 'name', 'rate']),
                  'banks': wizard.available_partner_bank_ids._origin.read(['write_date', 'partner_id', 'company_id']),
                  'company': self.company_id.read(['write_date', 'currency_id',
                                                 'period_lock_date', 'fiscalyear_lock_date', 'tax_lock_date'])}
        result.update({'values': data, 'version': hashlib.sha256(json.dumps(
            {'invoice': invoice['version'], 'values': data, 'config': config}, sort_keys=True, default=str).encode()).hexdigest(),
            'journals': choices(wizard.available_journal_ids), 'methods': choices(methods),
            'currencies': choices(currencies), 'banks': choices(wizard.available_partner_bank_ids), 'accounts': choices(accounts),
            'currency': [wizard.currency_id.id, wizard.currency_id.name] if wizard.currency_id else invoice['currency'],
            'payment_type': wizard.payment_type, 'difference': wizard.payment_difference,
            'can_record': bool(wizard.can_edit_wizard and wizard.journal_id and wizard.currency_id and manual
                               and math.isfinite(wizard.amount) and wizard.amount > 0 and not reason), 'reason': reason})
        return result

    @api.model
    def qorlia_payment_load(self, invoice_id):
        return self._qorlia_invoice(invoice_id)._qorlia_payment_snapshot()

    @api.model
    def qorlia_payment_preview(self, invoice_id, invoice_version, values, changed=False):
        invoice = self._qorlia_invoice(invoice_id)
        if invoice_version != invoice._qorlia_invoice_snapshot()['version']:
            raise UserError('This invoice changed. Reload the current payment status.')
        return invoice._qorlia_payment_snapshot(values, changed)

    @api.model
    def qorlia_payment_record(self, invoice_id, version, values):
        if not isinstance(version, str) or len(version) != 64 or not isinstance(values, dict):
            raise ValidationError('Review the current native payment before recording it.')
        invoice = self._qorlia_invoice(invoice_id, operation='write', lock=True)
        before = invoice._qorlia_payment_snapshot(values)
        if version != before['version']:
            raise UserError('The invoice or payment configuration changed. Reload and review before recording payment.')
        if not before['can_record']:
            raise UserError(before['reason'] or 'Payment recording is not available.')
        wizard = invoice._qorlia_payment_wizard(before['values'])
        created = wizard.create({**before['values'], 'line_ids': [(6, 0, wizard.line_ids._origin.ids)], 'group_payment': True})
        payments = created._create_payments()
        if len(payments) != 1 or payments.move_id._get_unbalanced_moves({'records': payments.move_id}):
            raise UserError('Native Billing did not create one balanced payment. No payment was saved.')
        invoice.invalidate_recordset()
        invoice.line_ids.invalidate_recordset()
        return invoice._qorlia_payment_snapshot()
