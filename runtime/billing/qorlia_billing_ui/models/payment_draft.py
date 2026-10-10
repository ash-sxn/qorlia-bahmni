# SPDX-License-Identifier: LGPL-3.0-or-later
# Copyright 2026 Qorlia contributors.
import hashlib
import re
import uuid

from psycopg2.errors import UniqueViolation

from odoo import api, Command, fields, models
from odoo.exceptions import AccessError, UserError, ValidationError

from .invoice_draft import _digest


PAYMENT_FIELDS = ('partner_id', 'company_id', 'payment_type', 'amount', 'date', 'journal_id',
                  'payment_method_line_id', 'currency_id', 'partner_bank_id', 'ref',
                  'payment_reference', 'bank_reference', 'cheque_reference', 'effective_date')


class PaymentDraft(models.Model):
    _inherit = 'account.payment'

    qorlia_payment_creation_key = fields.Char(copy=False, readonly=True, index=True)
    qorlia_payment_creation_hash = fields.Char(copy=False, readonly=True)
    qorlia_payment_draft_receipts = fields.Json(copy=False, readonly=True)
    _sql_constraints = [
        ('qorlia_payment_creation_key_unique', 'unique(qorlia_payment_creation_key)',
         'This payment creation request has already been saved.'),
    ]

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
                'auto_allocate': payment.is_auto_reconciliation_applicable, 'review_version': _digest(stamp),
                'date_readonly': payment.is_auto_reconciliation_applicable,
                'journal_readonly': bool(origin and origin.posted_before),
                'show_bank': payment.show_partner_bank_account,
                'require_bank': payment.require_partner_bank_account,
                'multi_currency': self.env.user.has_group('base.group_multi_currency')}

    def _qorlia_payment_draft_values(self, values):
        if not isinstance(values, dict) or set(values) != set(PAYMENT_FIELDS):
            raise ValidationError('Reload the complete customer payment form.')
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
        defaults = model.onchange({}, [], {name: '1' for name in PAYMENT_FIELDS})
        values = self.env['sale.order']._qorlia_from_onchange(model, defaults['value'], PAYMENT_FIELDS)
        values.update(company_id=self.env.company.id, partner_type='customer', is_internal_transfer=False,
                      payment_type='inbound', amount=0, date=fields.Date.context_today(model))
        payment = model.new(values)
        return model._qorlia_payment_draft_snapshot(payment, model.browse())

    def _qorlia_payment_draft_form(self, payload):
        if (not isinstance(payload, dict) or set(payload) != {'id', 'version', 'values'}):
            raise ValidationError('Use a valid customer payment draft.')
        model = self._qorlia_customer_payment_context()
        if not self.env.user.has_group('account.group_account_invoice'):
            raise AccessError('Your Billing account cannot edit customer payments.')
        origin = model._qorlia_payment_draft_origin(payload['id']) if payload['id'] is not False else model.browse()
        if origin:
            origin.check_access_rights('write')
            origin.check_access_rule('write')
            if payload['version'] != model._qorlia_state_snapshot(origin)['version']:
                raise UserError('This payment changed. Reload before editing.')
        else:
            model.check_access_rights('create')
            if payload['version'] is not False:
                raise ValidationError('A new payment cannot carry an existing version.')
        values = model._qorlia_payment_draft_values(payload['values'])
        if origin and values['company_id'] != origin.company_id.id:
            raise ValidationError('A saved payment must stay in its original company.')
        if origin and origin.posted_before and values['journal_id'] != origin.journal_id.id:
            raise ValidationError('A previously posted payment must keep its original journal.')
        model = model.with_company(model.env['res.company'].browse(values['company_id']))
        if model.new(values).is_auto_reconciliation_applicable:
            date = origin.date if origin else fields.Date.context_today(model)
            if values['date'] != fields.Date.to_string(date):
                raise ValidationError('Automatic allocation keeps the native accounting date. Use Effective Date for PDC details.')
        return model, values, origin

    @api.model
    def qorlia_customer_payment_draft_onchange(self, payload, field):
        if not isinstance(field, str) or field not in PAYMENT_FIELDS:
            raise ValidationError('Select a supported customer payment field.')
        model, values, origin = self._qorlia_payment_draft_form(payload)
        # Run on an unattached form: upstream customer onchange unlinks any attached allocation rows.
        result = model.onchange(values, [field], {name: '1' for name in PAYMENT_FIELDS})
        values.update(self.env['sale.order']._qorlia_from_onchange(model, result.get('value', {}), PAYMENT_FIELDS))
        payment = model.new(values)
        payment._check_company()
        if payment.partner_id and payment.is_auto_reconciliation_applicable:
            payment.update(payment.partner_id_onchange().get('value', {}))
            payment.paid_amount_onchange()
        snapshot = model._qorlia_payment_draft_snapshot(payment, origin)
        warning = result.get('warning', False)
        snapshot['warning'] = warning.get('message', False) if warning else False
        return snapshot

    def _qorlia_payment_draft_build(self, payload):
        model, values, origin = self._qorlia_payment_draft_form(payload)
        # Never attach saved allocation rows: the native partner onchange unlinks its rows.
        payment = model.new(values)
        if (not payment.journal_id.active or payment.journal_id.type not in ('bank', 'cash')
                or payment.journal_id.company_id != payment.company_id
                or payment.journal_id._origin not in payment.available_journal_ids._origin):
            raise ValidationError('Select a bank or cash journal in the payment company.')
        if payment.payment_method_line_id._origin not in payment.available_payment_method_line_ids._origin:
            raise ValidationError('Select a payment method offered by this journal and direction.')
        if payment.partner_bank_id and payment.partner_bank_id._origin not in payment.available_partner_bank_ids._origin:
            raise ValidationError('Select a bank account offered by the native payment form.')
        if payment.require_partner_bank_account and not payment.partner_bank_id:
            raise ValidationError('This payment method requires a native bank account.')
        if (not payment.currency_id.active or (not self.env.user.has_group('base.group_multi_currency')
                and payment.currency_id != (payment.journal_id.currency_id or payment.company_id.currency_id))):
            raise ValidationError('Select a payment currency permitted by your Billing account.')
        if not payment.partner_id:
            raise ValidationError('Select a customer before reviewing payment allocations.')
        payment._check_company()
        payment.update(payment.partner_id_onchange().get('value', {}) if payment.is_auto_reconciliation_applicable else {})
        payment.paid_amount_onchange()
        return payment, origin

    def _qorlia_payment_draft_review(self, payment, origin):
        result = self._qorlia_payment_draft_snapshot(payment, origin)
        writeoff_values = []
        if origin:
            liquidity, counterpart, writeoffs = origin._seek_for_lines()
            if len(liquidity) != 1 or len(counterpart) != 1:
                raise UserError('This payment has nonstandard journal entries. Review its journal before editing.')
            if writeoffs:
                writeoff_values = [{'name': writeoffs[0].name, 'account_id': writeoffs[0].account_id.id,
                    'partner_id': writeoffs[0].partner_id.id, 'currency_id': writeoffs[0].currency_id.id,
                    'amount_currency': sum(writeoffs.mapped('amount_currency')), 'balance': sum(writeoffs.mapped('balance'))}]
        ledger = payment._prepare_move_line_default_vals(write_off_line_vals=writeoff_values)
        result['ledger'] = ledger
        accounts = self.env['account.account'].browse(sorted({line['account_id'] for line in ledger})).exists()
        for records in (accounts, payment.currency_id, payment.company_id.currency_id):
            records.check_access_rights('read')
            records.check_access_rule('read')
        result['account_labels'] = {str(account.id): account.display_name for account in accounts}
        configuration = {'journal': payment.journal_id.read(['write_date', 'active', 'type', 'currency_id', 'default_account_id']),
            'method': payment.payment_method_line_id.read(['write_date', 'payment_account_id', 'payment_method_id']),
            'bank': payment.partner_bank_id.read(['write_date', 'acc_number', 'partner_id', 'company_id']),
            'accounts': accounts.read(['write_date', 'deprecated', 'reconcile', 'account_type', 'company_id']),
            'company': payment.company_id.read(['write_date', 'currency_id', 'period_lock_date', 'fiscalyear_lock_date',
                'tax_lock_date', 'account_journal_payment_debit_account_id', 'account_journal_payment_credit_account_id']),
            'currencies': (payment.currency_id | payment.company_id.currency_id).read(['write_date', 'rounding', 'active']),
            'rates': self.env['res.currency.rate'].search([('currency_id', 'in', (payment.currency_id | payment.company_id.currency_id).ids),
                '|', ('company_id', '=', False), ('company_id', '=', payment.company_id.id)]).read(['write_date', 'name', 'rate']),
            'today': str(fields.Date.context_today(payment))}
        if origin:
            origin.move_id.line_ids.check_access_rights('read')
            origin.move_id.line_ids.check_access_rule('read')
            configuration['existing_ledger'] = origin.move_id.line_ids.sorted('id').read([
                'write_date', 'name', 'account_id', 'partner_id', 'currency_id', 'debit', 'credit', 'amount_currency',
                'analytic_distribution', 'tax_ids', 'tax_tag_ids'])
        result['review_version'] = _digest({'review': result, 'configuration': configuration, 'author': self.env.uid})
        return result

    @api.model
    def qorlia_customer_payment_draft_preview(self, payload):
        payment, origin = self._qorlia_payment_draft_build(payload)
        return self._qorlia_payment_draft_review(payment, origin)

    @api.model
    def qorlia_customer_payment_draft_choices(self, values, kind, search=''):
        if not isinstance(search, str) or len(search) > 200:
            raise ValidationError('Enter a shorter customer payment search.')
        if not self.env.user.has_group('account.group_account_invoice'):
            raise AccessError('Your Billing account cannot edit customer payments.')
        model = self._qorlia_customer_payment_context()
        prepared = model._qorlia_payment_draft_values(values)
        payment = model.with_company(self.env['res.company'].browse(prepared['company_id'])).new(prepared)
        company = payment.company_id.id
        choices = {
            'company': ('res.company', [('id', 'in', self.env.companies.ids)]),
            'customer': ('res.partner', ['|', ('parent_id', '=', False), ('is_company', '=', True),
                '|', ('company_id', '=', False), ('company_id', '=', company)]),
            'journal': ('account.journal', [('id', 'in', payment.available_journal_ids._origin.ids)]),
            'method': ('account.payment.method.line', [('id', 'in', payment.available_payment_method_line_ids._origin.ids)]),
            'bank': ('res.partner.bank', [('id', 'in', payment.available_partner_bank_ids._origin.ids)]),
            'currency': ('res.currency', [('active', '=', True)]),
        }
        if not isinstance(kind, str) or kind not in choices:
            raise ValidationError('Select a supported customer payment setting.')
        if kind == 'currency' and not self.env.user.has_group('base.group_multi_currency'):
            raise AccessError('Additional currencies require native multi-currency permissions.')
        name, domain = choices[kind]
        return payment.env[name].name_search(name=search, args=domain, operator='ilike', limit=26)

    def _qorlia_payment_draft_request(self, payload, review_version, request_key):
        try:
            if not isinstance(request_key, str) or str(uuid.UUID(request_key)) != request_key:
                raise ValueError()
            if not isinstance(review_version, str) or not re.fullmatch('[a-f0-9]{64}', review_version):
                raise ValueError()
            if not isinstance(payload, dict) or set(payload) != {'id', 'version', 'values'}:
                raise ValueError()
            if payload['id'] is not False and (type(payload['id']) is not int or payload['id'] <= 0):
                raise ValueError()
            if ((payload['id'] is False and payload['version'] is not False)
                    or (payload['id'] is not False and (not isinstance(payload['version'], str)
                        or not re.fullmatch('[a-f0-9]{64}', payload['version'])))):
                raise ValueError()
            return _digest({'payload': payload, 'review': review_version, 'author': self.env.uid})
        except (TypeError, ValueError, AttributeError):
            raise ValidationError('Use an exact reviewed customer payment save request.')

    def _qorlia_payment_draft_receipt(self, payload, request_key, digest, lock=False):
        if payload['id'] is False:
            # Lookup only the ID so hidden receipts cannot be mistaken for a new creation. ORM checks follow.
            self.env.cr.execute('SELECT id FROM account_payment WHERE qorlia_payment_creation_key = %s', [request_key])
            row = self.env.cr.fetchone()
            payment = self._qorlia_state_payment(row[0], lock) if row else self.browse()
            if payment and payment.qorlia_payment_creation_hash != digest:
                raise ValidationError('This identifier belongs to a different customer payment request.')
            return payment, bool(payment)
        payment = self._qorlia_state_payment(payload['id'], lock)
        receipt = (payment.qorlia_payment_draft_receipts or {}).get(request_key)
        if receipt and (receipt['hash'] != digest or receipt['author'] != self.env.uid):
            raise ValidationError('This identifier belongs to a different customer payment request.')
        return payment, bool(receipt)

    @api.model
    def qorlia_customer_payment_draft_status(self, payload, review_version, request_key):
        digest = self._qorlia_payment_draft_request(payload, review_version, request_key)
        payment, accepted = self._qorlia_payment_draft_receipt(payload, request_key, digest)
        return {'accepted': accepted, 'payment': self._qorlia_state_snapshot(payment) if accepted else False}

    @api.model
    def qorlia_customer_payment_draft_save(self, payload, review_version, request_key):
        digest = self._qorlia_payment_draft_request(payload, review_version, request_key)
        lock = int.from_bytes(hashlib.sha256(('customer-payment:' + request_key).encode()).digest()[:8], 'big', signed=True)
        self.env.cr.execute('SELECT pg_advisory_xact_lock(%s)', [lock])
        origin, accepted = self._qorlia_payment_draft_receipt(payload, request_key, digest, lock=True)
        if accepted:
            return {'accepted': True, 'payment': self._qorlia_state_snapshot(origin)}
        payment, origin = self._qorlia_payment_draft_build(payload)
        documents = payment._qorlia_payment_balance_documents() | payment._qorlia_payment_balance_documents(credit=True)
        for table, ids in (('account_move', (documents | origin.move_id).ids),
                ('account_move_line', (documents.line_ids | origin.move_id.line_ids).ids),
                ('account_journal', payment.journal_id._origin.ids), ('res_company', payment.company_id._origin.ids)):
            if ids:
                self.env.cr.execute('SELECT id FROM ' + table + ' WHERE id IN %s ORDER BY id FOR UPDATE', [tuple(ids)])
        self.env.invalidate_all()
        payment, origin = self._qorlia_payment_draft_build(payload)
        reviewed = self._qorlia_payment_draft_review(payment, origin)
        if reviewed['review_version'] != review_version:
            raise UserError('Payment details, documents or configuration changed. Review again before saving.')
        values = {**reviewed['values'], 'partner_type': 'customer', 'is_internal_transfer': False}
        for kind, field in (('outstanding', 'outstanding_invoice_lines'), ('credits', 'credit_invoice_lines')):
            records = origin[field]
            for operation in ('read', 'unlink'):
                records.check_access_rights(operation)
                records.check_access_rule(operation)
            self.env[self._fields[field].comodel_name].check_access_rights('create')
            values[field] = ([Command.clear()] if origin else []) + [Command.create({
                'invoice_id': row['invoice_id'], 'partner_id': reviewed['values']['partner_id'], 'date': row['date'],
                'care_setting': row['care_setting'], 'invoice_amt': row['invoice_amount'],
                'allocated_amount': row['allocated_amount'], 'remaining_amt': row['remaining_amount'],
                'selected': row['selected']}) for row in reviewed['allocations'][kind]]
        values.update(reviewed['totals'])
        balances = documents.sorted('id').read(['state', 'amount_residual', 'amount_total'])
        try:
            with self.env.cr.savepoint():
                if origin:
                    original = self.env['sale.order']._qorlia_read_fields(origin, PAYMENT_FIELDS)
                    # Rewriting unchanged delegated company fields can recompute the move's journal before method validation.
                    changed = {name: value for name, value in values.items()
                               if name not in PAYMENT_FIELDS or value != original[name]}
                    changed.pop('partner_type', None)
                    changed.pop('is_internal_transfer', None)
                    # The installed synchronization trigger omits method changes; amount invokes its reviewed native ledger preparation.
                    changed['amount'] = values['amount']
                    origin.write(changed)
                    saved = origin
                else:
                    saved = payment._qorlia_customer_payment_context().create({**values,
                        'qorlia_payment_creation_key': request_key, 'qorlia_payment_creation_hash': digest})
                saved.check_access_rule('create' if not origin else 'write')
                self.env.invalidate_all()
                ledger_fields = ('name', 'account_id', 'partner_id', 'currency_id', 'debit', 'credit', 'amount_currency')
                actual = [self.env['sale.order']._qorlia_read_fields(line, ledger_fields) for line in saved.move_id.line_ids.sorted('id')]
                expected = [{field: line.get(field, 0 if field in ('debit', 'credit', 'amount_currency') else False)
                             for field in ledger_fields} for line in reviewed['ledger']]
                readback = self._qorlia_payment_draft_snapshot(saved, saved)
                if (saved.state != 'draft' or saved.move_id._get_unbalanced_moves({'records': saved.move_id})
                        or readback['values'] != reviewed['values'] or readback['totals'] != reviewed['totals']
                        or readback['allocations'] != reviewed['allocations'] or actual != expected
                        or documents.sorted('id').read(['state', 'amount_residual', 'amount_total']) != balances):
                    raise UserError('Native Billing changed an unreviewed detail. No payment draft was saved.')
                if origin:
                    receipts = dict(saved.qorlia_payment_draft_receipts or {})
                    receipts[request_key] = {'hash': digest, 'author': self.env.uid}
                    saved.write({'qorlia_payment_draft_receipts': receipts})
        except UniqueViolation as error:
            if error.diag.constraint_name != 'account_payment_qorlia_payment_creation_key_unique':
                raise
            self.env.cr.execute("DO $$ BEGIN RAISE EXCEPTION 'Concurrent payment creation' USING ERRCODE = '40001'; END $$")
        return {'accepted': True, 'payment': self._qorlia_state_snapshot(saved)}
