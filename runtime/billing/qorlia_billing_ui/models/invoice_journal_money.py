# SPDX-License-Identifier: LGPL-3.0-or-later
# Copyright 2026 Qorlia contributors.
from contextlib import closing
import uuid

from odoo import api, Command, fields, models, tools
from odoo.exceptions import AccessError, UserError, ValidationError

from .invoice_draft import HEADERS, _digest
from .invoice_journal_edit import DETAILS


MONEY_TOTALS = ('state', 'payment_state', 'amount_untaxed', 'amount_tax', 'amount_total',
                'invoice_total', 'amount_residual')
MONEY_ROWS = ('name', 'account_id', 'partner_id', 'date_maturity', 'currency_id',
              'amount_currency', 'debit', 'credit', 'balance', 'tax_ids', 'tax_tag_ids',
              'discount_date', 'discount_amount_currency', 'product_id', 'product_uom_id',
              'quantity', 'price_unit', 'price_subtotal', 'price_total', 'discount', 'sequence',
              'display_type', 'qorlia_adjustment_kind', 'amount_residual',
              'amount_residual_currency', 'reconciled', 'matched_debit_ids',
              'matched_credit_ids', 'full_reconcile_id')
MONEY_INPUTS = DETAILS + ('partner_id', 'currency_id', 'amount_currency', 'debit', 'credit', 'tax_ids')


class InvoiceJournalMoney(models.Model):
    _inherit = 'account.move'

    qorlia_journal_money_receipts = fields.Json(copy=False, readonly=True)

    def _qorlia_journal_money_snapshot(self, source_ids):
        self.ensure_one()
        self.env['account.move.line'].flush_model(['move_id'])
        self.env.cr.execute('SELECT id FROM account_move_line WHERE move_id = %s ORDER BY id', [self.id])
        lines = self.env['account.move.line'].browse([row[0] for row in self.env.cr.fetchall()])
        lines.check_access_rights('read')
        lines.check_access_rule('read')
        names = MONEY_ROWS + (('analytic_distribution',) if self.env.user.has_group(
            'analytic.group_analytic_accounting') else ())
        reader = self.env['sale.order']._qorlia_read_fields
        rows = [{'id': line.id if line.id in source_ids else False, 'values': reader(line, names)}
                for line in lines]
        for row in rows:
            for name in ('tax_ids', 'tax_tag_ids', 'matched_debit_ids', 'matched_credit_ids'):
                row['values'][name] = sorted(row['values'][name])
        rows.sort(key=lambda row: (row['id'] is False, row['id'] or 0, _digest(row['values'])))
        return {'invoice_id': self.id, 'totals': reader(self, MONEY_TOTALS), 'rows': rows}

    def _qorlia_journal_money_simulate(self, commands):
        self.ensure_one()
        invoice = self._qorlia_journal_document(self.id, 'write', True)
        source_ids = set(invoice.line_ids.ids)
        cr = self.env.cr
        cr.flush()
        hooks = {name: getattr(cr, name) for name in ('postcommit', 'prerollback', 'postrollback')}
        try:
            for name in hooks:
                setattr(cr, name, tools.Callbacks())
            # Native onchange differs from write; always roll back the native calculation and its hooks.
            with closing(cr.savepoint()):
                document = invoice.with_context(tracking_disable=True, mail_create_nosubscribe=True,
                    mail_notify_force_send=False)
                document.write({'line_ids': commands})
                cr.flush()
                return document._qorlia_journal_money_snapshot(source_ids)
        finally:
            for name, callbacks in hooks.items():
                setattr(cr, name, callbacks)

    def _qorlia_journal_money_permission(self, invoice):
        if (self.env.context.get('check_move_validity') is False
                or any(self.env.context.get(name) for name in
                    ('skip_invoice_sync', 'skip_account_move_synchronization'))):
            raise ValidationError('Native accounting validation cannot be disabled.')
        invoice.check_access_rights('write')
        invoice.check_access_rule('write')
        if not self.env.user.has_group('account.group_account_invoice'):
            raise AccessError('Your Billing account cannot edit journal amounts.')
        if invoice.state not in ('draft', 'posted'):
            raise UserError('Only draft or posted journals can be edited. Reload the invoice.')

    def _qorlia_journal_money_version(self):
        self.ensure_one()
        return _digest({'source': self._qorlia_invoice_draft_version(),
            'ledger': self._qorlia_journal_money_snapshot(set(self.line_ids.ids)),
            'author': self.env.uid, 'analytics': self.env.user.has_group('analytic.group_analytic_accounting'),
            'multi_currency': self.env.user.has_group('base.group_multi_currency')})

    def _qorlia_journal_money_labels(self, result):
        labels = {}
        for row in result['rows']:
            for name, value in row['values'].items():
                field = self.env['account.move.line']._fields[name]
                if field.type not in ('many2one', 'many2many') or not value:
                    continue
                records = self.env[field.comodel_name].browse(value if isinstance(value, list) else [value])
                records.check_access_rights('read')
                records.check_access_rule('read')
                labels.update({'%s:%s' % (record._name, record.id): record.display_name for record in records})
            analytic_ids = sorted({int(part) for key in (row['values'].get('analytic_distribution') or {})
                for part in key.split(',')})
            if analytic_ids:
                accounts = self.env['account.analytic.account'].browse(analytic_ids)
                accounts.check_access_rights('read')
                accounts.check_access_rule('read')
                labels.update({'account.analytic.account:%s' % account.id: account.display_name for account in accounts})
        return labels

    def _qorlia_journal_money_view(self):
        self.ensure_one()
        result = self._qorlia_journal_money_snapshot(set(self.line_ids.ids))
        labels = self._qorlia_journal_money_labels(result)
        can_edit = True
        try:
            self._qorlia_journal_money_permission(self)
        except (AccessError, UserError):
            can_edit = False
        inputs = list(MONEY_INPUTS)
        if not self.env.user.has_group('analytic.group_analytic_accounting'):
            inputs.remove('analytic_distribution')
        if not self.env.user.has_group('base.group_multi_currency'):
            inputs.remove('currency_id')
            inputs.remove('amount_currency')
        result.update({'name': self.name or False, 'move_type': self.move_type,
            'version': self._qorlia_journal_money_version(), 'labels': labels,
            'company_currency': self.company_currency_id.name_get()[0],
            'transaction_currency': self.currency_id.name_get()[0], 'can_edit': can_edit,
            'editable_fields': inputs if can_edit else [],
            'can_add': bool(can_edit and self.env['account.move.line'].check_access_rights('create', raise_exception=False)),
            'can_delete': bool(can_edit and self.state == 'draft'
                and self.env['account.move.line'].check_access_rights('unlink', raise_exception=False))})
        return result

    @api.model
    def qorlia_journal_money_load(self, invoice_id):
        return self._qorlia_journal_document(invoice_id)._qorlia_journal_money_view()

    def _qorlia_journal_money_commands(self, invoice, changes):
        if not isinstance(changes, list) or not changes or len(changes) > 1000:
            raise ValidationError('Use between one and 1,000 journal changes.')
        commands, seen = [], set()
        model = self.env['account.move.line']
        reader = self.env['sale.order']._qorlia_read_fields
        for change in changes:
            if (not isinstance(change, dict) or 'id' not in change
                    or set(change) not in ({'id', 'values'}, {'id', 'delete'})):
                raise ValidationError('Use a saved item or a new journal row with supported fields.')
            identifier = change['id']
            line = self._qorlia_journal_line(invoice, identifier, 'write') if identifier is not False else model
            if identifier:
                if identifier in seen:
                    raise ValidationError('Change each saved journal item only once.')
                seen.add(identifier)
            if 'delete' in change:
                if not identifier or change['delete'] is not True:
                    raise ValidationError('Select a saved journal item to remove.')
                line.check_access_rights('unlink')
                line.check_access_rule('unlink')
                commands.append(Command.delete(identifier))
                continue
            values = change['values']
            prepared = self.env['sale.order']._qorlia_values(model, values, MONEY_INPUTS)
            if not values:
                raise ValidationError('Change a journal field before reviewing.')
            if (set(values) & {'currency_id', 'amount_currency'}
                    and not self.env.user.has_group('base.group_multi_currency')):
                raise AccessError('Transaction-currency editing requires native multi-currency permissions.')
            if 'analytic_distribution' in values and not self.env.user.has_group('analytic.group_analytic_accounting'):
                raise AccessError('Analytic distribution requires native analytic permissions.')
            if identifier is False:
                model.check_access_rights('create')
                if not values.get('account_id') or not values.get('name'):
                    raise ValidationError('A new journal row needs an account and label.')
                line = model.new({'move_id': invoice.id, 'display_type': 'product',
                    'partner_id': invoice.commercial_partner_id.id, 'currency_id': invoice.currency_id.id,
                    **prepared})
                account = line.account_id
                if (account.deprecated or account.is_off_balance
                        or account.account_type in ('asset_receivable', 'liability_payable')):
                    raise ValidationError('A new product journal row needs an active non-receivable account.')
            details = reader(line, DETAILS)
            if not self.env.user.has_group('analytic.group_analytic_accounting'):
                details['analytic_distribution'] = False
            details.update({name: value for name, value in values.items() if name in DETAILS})
            self._qorlia_journal_details(invoice, line, details)
            currency = self.env['res.currency'].browse(values.get('currency_id', line.currency_id.id))
            if not currency or (identifier is False or currency != line.currency_id) and not currency.active:
                raise ValidationError('Select an active transaction currency.')
            partner = self.env['res.partner'].browse(values.get('partner_id', line.partner_id.id))
            if partner and (partner.company_id and partner.company_id != invoice.company_id
                    or (identifier is False or partner != line.partner_id) and partner.parent_id and not partner.is_company):
                raise ValidationError('Select a journal partner in this company.')
            if 'tax_ids' in values:
                if len(set(values['tax_ids'])) != len(values['tax_ids']):
                    raise ValidationError('Select distinct taxes.')
                taxes = self.env['account.tax'].browse(values['tax_ids'])
                if any(tax.company_id != invoice.company_id or tax.type_tax_use != 'sale'
                       or tax.country_id != invoice.tax_country_id for tax in taxes):
                    raise ValidationError('Select sales taxes for this invoice company and tax country.')
            for name in ('debit', 'credit'):
                if name in values and values[name] < 0:
                    raise ValidationError('Debits and credits cannot be negative.')
            if identifier:
                before = reader(line, tuple(values))
                prepared = {name: value for name, value in prepared.items() if before[name] != values[name]}
                if prepared:
                    commands.append(Command.update(identifier, prepared))
            else:
                commands.append(Command.create({**prepared, 'display_type': 'product'}))
        if not commands:
            raise ValidationError('Change a journal field before reviewing.')
        return commands

    def _qorlia_journal_money_payload(self, payload, lock=False):
        if not isinstance(payload, dict) or set(payload) != {'invoice_id', 'version', 'changes'}:
            raise ValidationError('Reload the complete journal change request.')
        invoice = self._qorlia_journal_document(payload['invoice_id'], 'write', lock)
        self._qorlia_journal_money_permission(invoice)
        if payload['version'] != invoice._qorlia_journal_money_version():
            raise UserError('The invoice or accounting configuration changed. Reload the journal.')
        return invoice, self._qorlia_journal_money_commands(invoice, payload['changes'])

    def _qorlia_journal_money_configuration(self, commands, lock=False):
        self.ensure_one()
        records = {}

        def add(items):
            if items:
                records[items._name] = records.get(items._name, self.env[items._name]) | items

        for record, names in [(self, HEADERS)] + [(line, MONEY_ROWS) for line in self.line_ids]:
            for name in names:
                if record._fields[name].type in ('many2one', 'many2many'):
                    add(record[name])
        for command in commands:
            if command[0] not in (Command.CREATE, Command.UPDATE):
                continue
            for name, value in command[2].items():
                field = self.env['account.move.line']._fields[name]
                if field.type == 'many2one' and value:
                    add(self.env[field.comodel_name].browse(value))
                elif field.type == 'many2many':
                    add(self.env[field.comodel_name].browse(value[0][2]))
                elif name == 'analytic_distribution' and value:
                    add(self.env['account.analytic.account'].browse(sorted({
                        int(part) for key in value for part in key.split(',')})))
        add(self.company_id)
        add(self.company_currency_id)
        taxes = records.get('account.tax', self.env['account.tax']).flatten_taxes_hierarchy()
        add(taxes)
        add(taxes.invoice_repartition_line_ids | taxes.refund_repartition_line_ids)
        add((taxes.invoice_repartition_line_ids | taxes.refund_repartition_line_ids).account_id)
        add(self.invoice_payment_term_id.line_ids)
        add(self.fiscal_position_id.tax_ids)
        add(self.fiscal_position_id.account_ids)
        add(records.get('account.account', self.env['account.account']).currency_id)
        if self.env.user.has_group('analytic.group_analytic_accounting'):
            for line in self.line_ids:
                add(self.env['account.analytic.account'].browse(sorted({int(part)
                    for key in (line.analytic_distribution or {}) for part in key.split(',')})))
            plans = self.env['account.analytic.plan'].search([
                ('company_id', 'in', [False, self.company_id.id])])
            add(plans)
            add(plans.applicability_ids)
        add(self.env['res.currency.rate'].search([('currency_id', 'in', records['res.currency'].ids),
            ('company_id', 'in', [False, self.company_id.id])]))
        for name in sorted(records):
            items = records[name].sorted('id')
            items.check_access_rights('read')
            items.check_access_rule('read')
            if lock:
                self.env.cr.execute('SELECT id FROM %s WHERE id IN %%s ORDER BY id FOR UPDATE' % items._table,
                                    [tuple(items.ids)])
                items.invalidate_recordset()
        # Read values as well as timestamps: two writes can share the transaction's timestamp.
        settings = {
            'account.account': ('company_id', 'account_type', 'deprecated', 'is_off_balance', 'currency_id', 'tax_ids'),
            'account.tax': ('amount', 'amount_type', 'price_include', 'include_base_amount',
                'is_base_affected', 'sequence', 'children_tax_ids', 'company_id', 'country_id', 'type_tax_use'),
            'account.tax.repartition.line': ('factor_percent', 'account_id', 'tag_ids', 'repartition_type'),
            'res.currency': ('rounding', 'active'),
            'res.currency.rate': ('name', 'rate', 'company_id', 'currency_id'),
            'account.analytic.account': ('plan_id', 'company_id'),
            'account.analytic.plan': ('parent_id', 'company_id', 'default_applicability', 'applicability_ids'),
            'account.analytic.applicability': ('analytic_plan_id', 'business_domain', 'applicability'),
        }
        return {'source': self._qorlia_invoice_draft_configuration(self),
            'relations': {name: items.sorted('id').read(['write_date', *settings.get(name, ())])
                for name, items in records.items()}}

    def _qorlia_journal_money_prepare(self, payload, lock=False):
        invoice, commands = self._qorlia_journal_money_payload(payload, lock=True)
        configuration = invoice._qorlia_journal_money_configuration(commands, lock)
        # Locking/invalidation must not let an earlier cached source version through.
        if payload['version'] != invoice._qorlia_journal_money_version():
            raise UserError('The invoice or accounting configuration changed. Reload the journal.')
        result = invoice._qorlia_journal_money_simulate(commands)
        result['labels'] = invoice._qorlia_journal_money_labels(result)
        result['review_version'] = _digest({'payload': payload, 'result': result,
            'configuration': configuration, 'author': self.env.uid})
        return invoice, commands, result

    @api.model
    def qorlia_journal_money_preview(self, payload):
        return self._qorlia_journal_money_prepare(payload)[-1]

    @api.model
    def qorlia_journal_money_analytics(self, invoice_id, line_id, account_id, account_ids):
        invoice = self._qorlia_journal_document(invoice_id)
        line = self._qorlia_journal_line(invoice, line_id) if line_id is not False else self.env['account.move.line']
        return {**self._qorlia_journal_analytics(invoice, line, account_id, account_ids), 'line_id': line_id}

    @api.model
    def qorlia_journal_money_choices(self, invoice_id, kind, search='', line_id=False,
            account_id=False, plan_id=False, account_ids=None):
        invoice = self._qorlia_journal_document(invoice_id)
        line = self._qorlia_journal_line(invoice, line_id) if line_id is not False else self.env['account.move.line']
        if not isinstance(search, str) or len(search) > 200:
            raise ValidationError('Use a shorter journal search.')
        choices = {
            'account': ('account.account', [('company_id', '=', invoice.company_id.id), ('deprecated', '=', False),
                ('is_off_balance', '=', False), ('account_type', '=', 'asset_receivable')] if line.account_type == 'asset_receivable'
                else [('company_id', '=', invoice.company_id.id), ('deprecated', '=', False), ('is_off_balance', '=', False),
                      ('account_type', 'not in', ['asset_receivable', 'liability_payable'])]),
            'partner': ('res.partner', [('company_id', 'in', [False, invoice.company_id.id]),
                '|', ('parent_id', '=', False), ('is_company', '=', True)]),
            'currency': ('res.currency', [('active', '=', True)]),
            'tax': ('account.tax', [('company_id', '=', invoice.company_id.id), ('type_tax_use', '=', 'sale'),
                ('country_id', '=', invoice.tax_country_id.id)]),
            'grid': ('account.account.tag', [('applicability', '=', 'taxes'), ('country_id', 'in', [False, invoice.tax_country_id.id])]),
            'analytic': ('account.analytic.account', [('company_id', 'in', [False, invoice.company_id.id])]),
        }
        if not isinstance(kind, str) or kind not in choices:
            raise ValidationError('Unsupported journal search.')
        if kind == 'currency' and not self.env.user.has_group('base.group_multi_currency'):
            raise AccessError('Transaction-currency editing requires native multi-currency permissions.')
        if kind == 'analytic' and not self.env.user.has_group('analytic.group_analytic_accounting'):
            raise AccessError('Analytic distribution requires native analytic permissions.')
        model, domain = choices[kind]
        if kind == 'analytic':
            allocation = self._qorlia_journal_analytics(invoice, line, account_id or line.account_id.id,
                account_ids if account_ids is not None else sorted({int(part) for key in
                    (line.analytic_distribution or {}) for part in key.split(',')}))
            plans = [plan['id'] for plan in allocation['plans']]
            if plan_id is not False:
                if type(plan_id) is not int or plan_id not in plans:
                    raise ValidationError('Select a native analytic plan for this journal item.')
                plans = [plan_id]
            domain += [('root_plan_id', 'in', plans)]
        elif account_id is not False or plan_id is not False or account_ids is not None:
            raise ValidationError('Analytic search scope is only allowed for analytic choices.')
        return self.env[model].name_search(name=search, args=domain, operator='ilike', limit=26)

    def _qorlia_journal_money_request(self, payload, review_version, request_key):
        try:
            if (not isinstance(payload, dict) or set(payload) != {'invoice_id', 'version', 'changes'}
                    or type(payload['invoice_id']) is not int or payload['invoice_id'] <= 0
                    or not isinstance(payload['version'], str) or len(payload['version']) != 64
                    or not isinstance(payload['changes'], list) or not 0 < len(payload['changes']) <= 1000
                    or not isinstance(review_version, str) or len(review_version) != 64
                    or any(char not in '0123456789abcdef' for char in review_version)
                    or str(uuid.UUID(request_key)) != request_key):
                raise ValueError()
            digest = _digest({'payload': payload, 'review_version': review_version, 'author': self.env.uid})
        except (TypeError, ValueError, AttributeError):
            raise ValidationError('Use a valid reviewed journal save request.')
        return request_key, digest

    def _qorlia_journal_money_receipt(self, key, digest):
        self.ensure_one()
        receipt = (self.qorlia_journal_money_receipts or {}).get(key)
        if receipt and (receipt['hash'] != digest or receipt['author'] != self.env.uid):
            raise ValidationError('This identifier belongs to another journal amount request.')
        return receipt

    @api.model
    def qorlia_journal_money_status(self, payload, review_version, request_key):
        key, digest = self._qorlia_journal_money_request(payload, review_version, request_key)
        invoice = self._qorlia_invoice(payload['invoice_id'])
        if not invoice._qorlia_journal_money_receipt(key, digest):
            return False
        return {**invoice._qorlia_journal_money_view(), 'request_key': key}

    @api.model
    def qorlia_journal_money_save(self, payload, review_version, request_key):
        key, digest = self._qorlia_journal_money_request(payload, review_version, request_key)
        invoice = self._qorlia_invoice(payload['invoice_id'], 'write', True)
        if invoice._qorlia_journal_money_receipt(key, digest):
            return {**invoice._qorlia_journal_money_view(), 'request_key': key}
        invoice, commands, review = self._qorlia_journal_money_prepare(payload, lock=True)
        if review['review_version'] != review_version:
            raise UserError('Review the native journal calculation again before saving.')
        expected = {name: value for name, value in review.items() if name not in ('review_version', 'labels')}
        source_ids = set(invoice.line_ids.ids)
        with self.env.cr.savepoint():
            receipts = dict(invoice.qorlia_journal_money_receipts or {})
            receipts[key] = {'hash': digest, 'author': self.env.uid}
            # A second invoice write can resync prices; record the receipt in the same native save.
            invoice.write({'line_ids': commands, 'qorlia_journal_money_receipts': receipts})
            self.env.cr.flush()
            if invoice._qorlia_journal_money_snapshot(source_ids) != expected:
                raise UserError('Native Billing changed the reviewed ledger. Nothing was saved.')
            return {**invoice._qorlia_journal_money_view(), 'request_key': key}
