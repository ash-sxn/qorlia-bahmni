# SPDX-License-Identifier: LGPL-3.0-or-later
# Copyright 2026 Qorlia contributors.
import json
import uuid

from odoo import api, fields, models
from odoo.exceptions import AccessError, UserError, ValidationError

from .invoice_draft import _digest


INPUTS = ('date', 'percentage', 'total_amount', 'journal_id',
          'revenue_accrual_account', 'expense_accrual_account')
DEFAULTS = ('automatic_entry_default_journal_id', 'revenue_accrual_account_id',
            'expense_accrual_account_id')
LEDGER = ('name', 'account_id', 'partner_id', 'currency_id', 'date', 'date_maturity',
          'debit', 'credit', 'amount_currency', 'amount_residual', 'amount_residual_currency',
          'reconciled', 'matched_debit_ids', 'matched_credit_ids', 'full_reconcile_id',
          'tax_ids', 'tax_tag_ids', 'analytic_distribution')
ENTRY_LINE = ('name', 'account_id', 'partner_id', 'currency_id', 'debit', 'credit',
              'amount_currency', 'analytic_distribution')


class InvoiceCutoff(models.Model):
    _inherit = 'account.move'

    qorlia_cutoff_receipts = fields.Json(copy=False, readonly=True)

    def _qorlia_cutoff_source(self, invoice_id, line_id, operation='read', lock=False):
        invoice = self._qorlia_journal_document(invoice_id, operation, lock)
        line = self._qorlia_journal_line(invoice, line_id)
        return invoice, line

    def _qorlia_cutoff_model(self, invoice, line):
        if line.account_id.internal_group not in ('income', 'expense'):
            raise UserError('Cut-Off requires a revenue or expense journal item.')
        model = self.env['account.automatic.entry.wizard'].with_company(invoice.company_id).with_context(
            active_model='account.move.line', active_ids=line.ids,
            hide_automatic_options=1, default_action='change_period')
        # Native selection rejects draft and reconciled source items.
        defaults = model.default_get(['move_line_ids', 'company_id', 'action', 'date'])
        return model, defaults

    def _qorlia_cutoff_permission(self, invoice):
        invoice.check_access_rights('write')
        invoice.check_access_rule('write')
        self.env['account.automatic.entry.wizard'].check_access_rights('create')
        self.check_access_rights('create')
        if not self.env.user.has_group('account.group_account_invoice'):
            raise AccessError('Your Billing account cannot create adjusting entries.')

    def _qorlia_cutoff_version(self, invoice, line):
        invoice.company_id.check_access_rights('read')
        invoice.company_id.check_access_rule('read')
        return _digest({'invoice': invoice._qorlia_invoice_draft_version(), 'line': line.id,
            'author': self.env.uid, 'defaults': invoice.company_id.read(list(DEFAULTS)),
            'today': str(fields.Date.context_today(invoice))})

    def _qorlia_cutoff_view(self, invoice, line, wizard):
        reader = self.env['sale.order']._qorlia_read_fields
        labels = {}
        for field in ('journal_id', 'revenue_accrual_account', 'expense_accrual_account'):
            record = wizard[field]
            record.check_access_rights('read')
            record.check_access_rule('read')
            if record:
                labels[field] = record.name_get()[0]
        editable = True
        try:
            self._qorlia_cutoff_permission(invoice)
        except AccessError:
            editable = False
        return {'invoice_id': invoice.id, 'line_id': line.id, 'name': invoice.name,
            'version': self._qorlia_cutoff_version(invoice, line), 'values': reader(wizard, INPUTS),
            'labels': labels, 'account_type': wizard.account_type,
            'currency': invoice.company_currency_id.name_get()[0],
            'source_account': line.account_id.name_get()[0], 'source_balance': line.balance,
            'lock_date_message': wizard.lock_date_message or False, 'can_create': editable,
            'company': invoice.company_id.display_name}

    @api.model
    def qorlia_cutoff_load(self, invoice_id, line_id):
        invoice, line = self._qorlia_cutoff_source(invoice_id, line_id)
        model, defaults = self._qorlia_cutoff_model(invoice, line)
        return self._qorlia_cutoff_view(invoice, line, model.new(defaults))

    def _qorlia_cutoff_values(self, invoice, line, values):
        model, defaults = self._qorlia_cutoff_model(invoice, line)
        if not isinstance(values, dict) or set(values) != set(INPUTS):
            raise ValidationError('Reload every Cut-Off field before reviewing.')
        data = self.env['sale.order']._qorlia_values(model, values, INPUTS)
        try:
            if not values['date'] or str(fields.Date.to_date(values['date'])) != values['date']:
                raise ValueError()
        except (TypeError, ValueError):
            raise ValidationError('Enter a valid recognition date.')
        source = model.new(defaults)
        inactive = 'expense_accrual_account' if source.account_type == 'income' else 'revenue_accrual_account'
        if values[inactive] != source[inactive].id:
            raise ValidationError('Only the accrual account for this item can be changed.')
        data.pop(inactive)
        return model, defaults, data

    def _qorlia_cutoff_payload(self, invoice_id, line_id, version, values):
        invoice, line = self._qorlia_cutoff_source(invoice_id, line_id)
        self._qorlia_cutoff_permission(invoice)
        if not isinstance(version, str) or version != self._qorlia_cutoff_version(invoice, line):
            raise UserError('The invoice or accounting configuration changed. Reload Cut-Off.')
        model, defaults, data = self._qorlia_cutoff_values(invoice, line, values)
        return invoice, line, model, defaults, data

    @api.model
    def qorlia_cutoff_onchange(self, invoice_id, line_id, version, values, field):
        invoice, line, model, defaults, data = self._qorlia_cutoff_payload(invoice_id, line_id, version, values)
        if field not in INPUTS or field not in data:
            raise ValidationError('Select a supported Cut-Off field.')
        spec = {name: '1' for name in INPUTS + ('move_line_ids', 'company_id', 'action', 'account_type')}
        changed = model.onchange({**defaults, **data}, [field], spec).get('value', {})
        data.update(self.env['sale.order']._qorlia_from_onchange(model, changed, INPUTS))
        return self._qorlia_cutoff_view(invoice, line, model.new({**defaults, **data}))

    @api.model
    def qorlia_cutoff_choices(self, invoice_id, line_id, kind, search=''):
        invoice, line = self._qorlia_cutoff_source(invoice_id, line_id)
        self._qorlia_cutoff_model(invoice, line)
        if not isinstance(search, str) or len(search) > 200:
            raise ValidationError('Use a shorter Cut-Off search.')
        if kind == 'journal':
            model, domain = 'account.journal', [('company_id', '=', invoice.company_id.id), ('type', '=', 'general')]
        elif kind == 'accrual':
            model, domain = 'account.account', [('company_id', '=', invoice.company_id.id),
                ('account_type', 'not in', ['asset_receivable', 'liability_payable']), ('is_off_balance', '=', False)]
        else:
            raise ValidationError('Unsupported Cut-Off search.')
        return self.env[model].name_search(name=search, args=domain, operator='ilike', limit=26)

    def _qorlia_cutoff_entries(self, moves):
        entries = []
        for move in moves:
            rows = []
            for command in move['line_ids']:
                values = command[2]
                row = dict(values)
                row['role'] = 'source' if not rows else 'accrual'
                for field, model in (('account_id', 'account.account'), ('partner_id', 'res.partner'),
                                     ('currency_id', 'res.currency')):
                    record = self.env[model].browse(values[field]).exists() if values[field] else self.env[model]
                    record.check_access_rights('read')
                    record.check_access_rule('read')
                    if values[field] and not record:
                        raise UserError('An adjusting-entry record is no longer available.')
                    row[field] = record.name_get()[0] if record else False
                if not self.env.user.has_group('analytic.group_analytic_accounting'):
                    row['analytic_distribution'] = False
                rows.append(row)
            entries.append({'kind': 'recognition' if not entries else 'adjustment',
                'date': move['date'], 'ref': move['ref'], 'rows': rows,
                'state': 'draft' if fields.Date.to_date(move['date']) > fields.Date.context_today(self) else 'posted'})
        return entries

    def _qorlia_cutoff_prepare(self, invoice_id, line_id, version, values):
        invoice, line, model, defaults, data = self._qorlia_cutoff_payload(invoice_id, line_id, version, values)
        journal = self.env['account.journal'].browse(data['journal_id'])
        account_type = model.new(defaults).account_type
        active = 'revenue_accrual_account' if account_type == 'income' else 'expense_accrual_account'
        account = self.env['account.account'].browse(data[active])
        if not journal or journal.company_id != invoice.company_id or journal.type != 'general':
            raise ValidationError('Select a general journal in this invoice company.')
        if (not account or account.company_id != invoice.company_id or account.deprecated
                or account.account_type in ('asset_receivable', 'liability_payable') or account.is_off_balance):
            raise ValidationError('Select an active accrual account in this invoice company.')
        wizard = model.new({**defaults, **data})
        wizard._constraint_percentage()
        wizard._check_date()
        if not invoice.company_currency_id.is_zero(wizard.total_amount - line.balance * wizard.percentage / 100):
            raise ValidationError('The adjusting amount and percentage differ. Recalculate Cut-Off.')
        moves = json.loads(wizard.move_data)
        result = self._qorlia_cutoff_view(invoice, line, wizard)
        result['entries'] = self._qorlia_cutoff_entries(moves)
        result['reconcile_accrual_rows'] = bool(account.reconcile and all(
            entry['state'] == 'posted' for entry in result['entries']))
        result['default_changes'] = {'journal': journal.name_get()[0], 'account': account.name_get()[0],
            'account_type': account_type}
        result['review_version'] = _digest({'version': version, 'values': result['values'], 'moves': moves,
            'labels': result['labels'], 'configuration': [journal.read(['write_date']),
                account.read(['write_date']), invoice.company_id.read(list(DEFAULTS) + ['write_date'])]})
        return invoice, line, model, defaults, data, moves, result

    @api.model
    def qorlia_cutoff_preview(self, invoice_id, line_id, version, values):
        return self._qorlia_cutoff_prepare(invoice_id, line_id, version, values)[-1]

    def _qorlia_cutoff_request(self, line_id, version, values, review_version, request_key):
        try:
            if str(uuid.UUID(request_key)) != request_key:
                raise ValueError()
            digest = _digest({'line_id': line_id, 'version': version, 'values': values,
                'review_version': review_version, 'author': self.env.uid})
        except (TypeError, ValueError, AttributeError):
            raise ValidationError('Use a valid Cut-Off save request.')
        return request_key, digest

    def _qorlia_cutoff_receipt(self, invoice, key, digest):
        receipt = (invoice.qorlia_cutoff_receipts or {}).get(key)
        if receipt and (receipt['hash'] != digest or receipt['author'] != self.env.uid):
            raise ValidationError('This identifier belongs to another Cut-Off request.')
        return receipt

    def _qorlia_cutoff_saved(self, invoice, line, receipt):
        moves = self.browse(receipt['entry_ids']).exists()
        moves.check_access_rights('read')
        moves.check_access_rule('read')
        if len(moves) != len(receipt['entry_ids']):
            raise UserError('A saved adjusting entry is no longer available. Do not create another request.')
        return {'invoice_id': invoice.id, 'line_id': line.id,
            'entries': moves.sorted('id').read(['name', 'date', 'state', 'auto_post', 'ref', 'journal_id']),
            'request_key': receipt['request_key']}

    @api.model
    def qorlia_cutoff_status(self, invoice_id, line_id, version, values, review_version, request_key):
        invoice, line = self._qorlia_cutoff_source(invoice_id, line_id)
        key, digest = self._qorlia_cutoff_request(line_id, version, values, review_version, request_key)
        receipt = self._qorlia_cutoff_receipt(invoice, key, digest)
        return self._qorlia_cutoff_saved(invoice, line, receipt) if receipt else False

    @api.model
    def qorlia_cutoff_save(self, invoice_id, line_id, version, values, review_version, request_key):
        key, digest = self._qorlia_cutoff_request(line_id, version, values, review_version, request_key)
        invoice, line = self._qorlia_cutoff_source(invoice_id, line_id, 'write', True)
        receipt = self._qorlia_cutoff_receipt(invoice, key, digest)
        if receipt:
            return self._qorlia_cutoff_saved(invoice, line, receipt)
        # Native wizard inverses change shared company defaults, so serialize those too.
        self.env.cr.execute('SELECT id FROM res_company WHERE id = %s FOR UPDATE', [invoice.company_id.id])
        invoice.company_id.invalidate_recordset()
        for table, ids in (('account_journal', [values.get('journal_id')] if isinstance(values, dict) else []),
                           ('account_account', sorted({value for name, value in (values.items() if isinstance(values, dict) else [])
                               if name in ('revenue_accrual_account', 'expense_accrual_account') and type(value) is int}))):
            if ids and all(type(value) is int and value > 0 for value in ids):
                self.env.cr.execute('SELECT id FROM %s WHERE id IN %%s ORDER BY id FOR SHARE' % table, [tuple(ids)])
        self.env['account.journal'].invalidate_model()
        self.env['account.account'].invalidate_model()
        invoice, line, model, defaults, data, expected, review = self._qorlia_cutoff_prepare(
            invoice_id, line_id, version, values)
        if review['review_version'] != review_version:
            raise UserError('Review the adjusting entries again before saving.')
        reader = self.env['sale.order']._qorlia_read_fields
        amounts = ('state', 'payment_state', 'amount_total', 'amount_tax', 'invoice_total', 'amount_residual')
        before = reader(invoice, amounts)
        ledger = {item.id: reader(item, LEDGER) for item in invoice.line_ids}
        company_defaults = reader(invoice.company_id, DEFAULTS)
        company_defaults['automatic_entry_default_journal_id'] = data['journal_id']
        company_defaults['%s_accrual_account_id' % review['account_type'].replace('income', 'revenue')] = (
            review['default_changes']['account'][0])
        data.pop('total_amount')  # Percentage is canonical after the native amount onchange.
        wizard = model.create({**defaults, **data})
        if json.loads(wizard.move_data) != expected:
            raise UserError('Native Billing changed the reviewed entries. Nothing was saved.')
        action = wizard.do_action()
        if (action.get('res_model') != 'account.move' or len(action.get('domain', [])) != 1
                or action['domain'][0][:2] != ('id', 'in')):
            raise UserError('Native Billing returned an unexpected adjusting-entry action. Nothing was saved.')
        generated = self.browse(action['domain'][0][2]).exists()
        generated.check_access_rights('read')
        generated.check_access_rule('read')
        if len(generated) != len(expected):
            raise UserError('Native Billing created an unexpected number of entries. Nothing was saved.')
        for move, wanted in zip(generated, expected):
            move.line_ids.check_access_rights('read')
            move.line_ids.check_access_rule('read')
            header = reader(move, ('date', 'journal_id', 'currency_id', 'move_type', 'ref'))
            if (header != {name: wanted[name] for name in header}
                    or [reader(item, ENTRY_LINE) for item in move.line_ids.sorted('id')]
                        != [{name: command[2].get(name, False) for name in ENTRY_LINE} for command in wanted['line_ids']]
                    or move._get_unbalanced_moves({'records': move})
                    or move.state != ('draft' if move.date > fields.Date.context_today(move) else 'posted')
                    or move.state == 'draft' and move.auto_post != 'at_date'):
                raise UserError('Native Billing changed a reviewed accounting entry. Nothing was saved.')
        invoice.invalidate_recordset()
        invoice.line_ids.invalidate_recordset()
        invoice.company_id.invalidate_recordset()
        if reader(invoice.company_id, DEFAULTS) != company_defaults:
            raise UserError('Native Billing changed unreviewed company defaults. Nothing was saved.')
        if reader(invoice, amounts) != before or ledger != {item.id: reader(item, LEDGER) for item in invoice.line_ids}:
            raise UserError('Native Billing changed the source invoice or its matching. Nothing was saved.')
        receipt = {'hash': digest, 'author': self.env.uid, 'entry_ids': generated.ids, 'request_key': key}
        receipts = dict(invoice.qorlia_cutoff_receipts or {})
        receipts[key] = receipt
        invoice.write({'qorlia_cutoff_receipts': receipts})
        return self._qorlia_cutoff_saved(invoice, line, receipt)
