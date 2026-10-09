# SPDX-License-Identifier: LGPL-3.0-or-later
# Copyright 2026 Qorlia contributors.
import uuid

from odoo import api, Command, fields, models
from odoo.exceptions import AccessError, UserError, ValidationError

from .invoice_draft import _digest


DETAILS = ('name', 'account_id', 'date_maturity', 'tax_tag_ids', 'analytic_distribution',
           'discount_date', 'discount_amount_currency')


class InvoiceJournalEdit(models.Model):
    _inherit = 'account.move'

    qorlia_journal_receipts = fields.Json(copy=False, readonly=True)

    def _qorlia_journal_edit_version(self):
        self.ensure_one()
        reader = self.env['sale.order']._qorlia_read_fields
        return _digest({'draft': self._qorlia_invoice_draft_version(), 'author': self.env.uid,
            'analytics': self.env.user.has_group('analytic.group_analytic_accounting'),
            'details': [{'id': line.id, 'values': reader(line, DETAILS)} for line in self.line_ids.sorted('id')]})

    def _qorlia_journal_document(self, invoice_id, operation='read', lock=False):
        if not self.env.user.has_group('base.group_user'):
            raise AccessError('Journal editing requires an internal Billing account.')
        invoice = self._qorlia_invoice(invoice_id, operation, lock)
        journal = self.qorlia_invoice_journal(invoice.id)
        if journal['total_count'] > 1000:
            raise UserError('More than 1,000 journal items require native Billing review.')
        if not journal['balanced']:
            raise UserError('The journal is unbalanced. Ask your Billing administrator to review it.')
        return invoice

    def _qorlia_journal_line(self, invoice, line_id, operation='read'):
        if type(line_id) is not int or line_id <= 0:
            raise ValidationError('Select a saved journal item.')
        line = self.env['account.move.line'].browse(line_id).exists()
        line.check_access_rights(operation)
        line.check_access_rule(operation)
        if not line or line.move_id != invoice or line.display_type in ('line_section', 'line_note'):
            raise ValidationError('This journal item does not belong to the invoice.')
        if operation == 'write':
            if invoice.state != 'draft':
                raise UserError('Only draft journal details can be changed here. Reload the invoice.')
            if not self.env.user.has_group('account.group_account_invoice'):
                raise AccessError('Your Billing account cannot edit journal details.')
            if line.qorlia_adjustment_kind:
                raise UserError('Document discounts and rounding are managed by the invoice editor.')
        return line

    @api.model
    def qorlia_journal_edit_load(self, invoice_id, line_id):
        invoice = self._qorlia_journal_document(invoice_id)
        line = self._qorlia_journal_line(invoice, line_id)
        values = self.env['sale.order']._qorlia_read_fields(line, DETAILS)
        analytics = self.env.user.has_group('analytic.group_analytic_accounting')
        if not analytics:
            values['analytic_distribution'] = False
        for records in (line.account_id, line.tax_tag_ids):
            records.check_access_rights('read')
            records.check_access_rule('read')
        editable = invoice.state == 'draft' and not line.qorlia_adjustment_kind
        try:
            self._qorlia_invoice(invoice_id, 'write')
            self._qorlia_journal_line(invoice, line_id, 'write')
        except (AccessError, UserError):
            editable = False
        return {'invoice_id': invoice.id, 'line_id': line.id, 'name': invoice.name or False,
                'version': invoice._qorlia_journal_edit_version() if invoice.state == 'draft'
                else self.qorlia_invoice_journal(invoice.id)['version'],
                'values': values, 'account': [line.account_id.id, line.account_id.display_name],
                'tax_grids': line.tax_tag_ids.name_get(), 'analytics_visible': analytics,
                'can_edit': editable, 'currency': [invoice.company_currency_id.id, invoice.company_currency_id.name],
                'debit': line.debit, 'credit': line.credit}

    def _qorlia_journal_details(self, invoice, line, values):
        if not isinstance(values, dict) or set(values) != set(DETAILS):
            raise ValidationError('Reload all journal detail fields before editing.')
        prepared = self.env['sale.order']._qorlia_values(line, values, DETAILS)
        if not self.env.user.has_group('analytic.group_analytic_accounting'):
            if values['analytic_distribution'] is not False:
                raise AccessError('Analytic distribution requires native analytic permissions.')
            prepared.pop('analytic_distribution')
        for name in ('date_maturity', 'discount_date'):
            if values[name] is not False:
                try:
                    if str(fields.Date.to_date(values[name])) != values[name]:
                        raise ValueError()
                except (ValueError, TypeError):
                    raise ValidationError('Enter a valid date for %s.' % line._fields[name].string)
        if values['discount_amount_currency'] < 0:
            raise ValidationError('The early-payment discount amount cannot be negative.')
        if len(set(values['tax_tag_ids'])) != len(values['tax_tag_ids']):
            raise ValidationError('Select distinct tax grids.')
        account = self.env['account.account'].browse(values['account_id'])
        if (not account or account.company_id != invoice.company_id or account.deprecated or account.is_off_balance):
            raise ValidationError('Select an active journal account in this invoice company.')
        receivable = line.account_type == 'asset_receivable'
        if (receivable and account.account_type != 'asset_receivable'
                or not receivable and account.account_type in ('asset_receivable', 'liability_payable')):
            raise ValidationError('Keep the native receivable or non-receivable account category for this item.')
        tags = self.env['account.account.tag'].browse(values['tax_tag_ids'])
        if any(tag.applicability != 'taxes' or tag.country_id and tag.country_id != invoice.tax_country_id for tag in tags):
            raise ValidationError('Select tax grids for this invoice tax country.')
        if values['analytic_distribution'] and any(
                value < 0 or value > 100 for value in values['analytic_distribution'].values()):
            raise ValidationError('Use analytic percentages between zero and 100.')
        if values['analytic_distribution']:
            ids = {int(part) for key in values['analytic_distribution'] for part in key.split(',')}
            accounts = self.env['account.analytic.account'].browse(ids)
            if any(record.company_id and record.company_id != invoice.company_id for record in accounts):
                raise ValidationError('Select analytic accounts from this invoice company.')
        before = self.env['sale.order']._qorlia_read_fields(line, DETAILS)
        return {name: value for name, value in prepared.items() if before[name] != values[name]}

    def _qorlia_journal_payload(self, invoice_id, line_id, version, values, lock=False):
        invoice = self._qorlia_journal_document(invoice_id, 'write', lock)
        line = self._qorlia_journal_line(invoice, line_id, 'write')
        if (not isinstance(version, str) or len(version) != 64
                or version != invoice._qorlia_journal_edit_version()):
            raise UserError('The invoice or its accounting configuration changed. Reload journal details.')
        return invoice, line, self._qorlia_journal_details(invoice, line, values)

    @api.model
    def qorlia_journal_edit_preview(self, invoice_id, line_id, version, values):
        invoice, line, changed = self._qorlia_journal_payload(invoice_id, line_id, version, values)
        if not changed:
            raise ValidationError('Change a journal detail before reviewing.')
        result = self.qorlia_journal_edit_load(invoice.id, line.id)
        result['values'] = values
        result['account'] = self.env['account.account'].browse(values['account_id']).name_get()[0]
        result['tax_grids'] = self.env['account.account.tag'].browse(values['tax_tag_ids']).name_get()
        configuration = []
        for records in (self.env['account.account'].browse(values['account_id']),
                        self.env['account.account.tag'].browse(values['tax_tag_ids'])):
            configuration.append(records.sorted('id').read(['write_date']))
        if values['analytic_distribution']:
            ids = {int(part) for key in values['analytic_distribution'] for part in key.split(',')}
            configuration.append(self.env['account.analytic.account'].browse(sorted(ids)).read(['write_date']))
        result['review_version'] = _digest({'invoice_id': invoice.id, 'line_id': line.id,
            'version': version, 'values': values, 'author': self.env.uid,
            'account': result['account'], 'grids': result['tax_grids'], 'configuration': configuration})
        return result

    @api.model
    def qorlia_journal_edit_choices(self, invoice_id, line_id, kind, search=''):
        invoice = self._qorlia_journal_document(invoice_id)
        line = self._qorlia_journal_line(invoice, line_id)
        if not isinstance(search, str) or len(search) > 200:
            raise ValidationError('Use a shorter journal detail search.')
        choices = {
            'account': ('account.account', [('company_id', '=', invoice.company_id.id),
                ('deprecated', '=', False), ('is_off_balance', '=', False),
                ('account_type', '=', 'asset_receivable')] if line.account_type == 'asset_receivable' else
                [('company_id', '=', invoice.company_id.id), ('deprecated', '=', False),
                 ('is_off_balance', '=', False), ('account_type', 'not in', ['asset_receivable', 'liability_payable'])]),
            'grid': ('account.account.tag', [('applicability', '=', 'taxes'), ('country_id', 'in', [False, invoice.tax_country_id.id])]),
            'analytic': ('account.analytic.account', [('company_id', 'in', [False, invoice.company_id.id])]),
        }
        if not isinstance(kind, str) or kind not in choices:
            raise ValidationError('Unsupported journal detail search.')
        if kind == 'analytic' and not self.env.user.has_group('analytic.group_analytic_accounting'):
            raise AccessError('Analytic distribution requires native analytic permissions.')
        model, domain = choices[kind]
        return self.env[model].name_search(name=search, args=domain, operator='ilike', limit=26)

    def _qorlia_journal_request(self, line_id, version, values, review_version, request_key):
        try:
            if str(uuid.UUID(request_key)) != request_key:
                raise ValueError()
            digest = _digest({'line_id': line_id, 'version': version, 'values': values,
                              'review_version': review_version, 'author': self.env.uid})
        except (TypeError, ValueError, AttributeError):
            raise ValidationError('Use a valid journal save request.')
        return request_key, digest

    def _qorlia_journal_receipt(self, invoice, request_key, digest):
        receipt = (invoice.qorlia_journal_receipts or {}).get(request_key)
        if receipt and (receipt['hash'] != digest or receipt['author'] != self.env.uid):
            raise ValidationError('This save identifier belongs to another journal request.')
        return receipt

    @api.model
    def qorlia_journal_edit_status(self, invoice_id, line_id, version, values, review_version, request_key):
        invoice = self._qorlia_journal_document(invoice_id)
        line = self._qorlia_journal_line(invoice, line_id)
        key, digest = self._qorlia_journal_request(line_id, version, values, review_version, request_key)
        if not self._qorlia_journal_receipt(invoice, key, digest):
            return False
        return self.qorlia_journal_edit_load(invoice.id, line.id)

    @api.model
    def qorlia_journal_edit_save(self, invoice_id, line_id, version, values, review_version, request_key):
        key, digest = self._qorlia_journal_request(line_id, version, values, review_version, request_key)
        invoice = self._qorlia_journal_document(invoice_id, 'write', True)
        line = self._qorlia_journal_line(invoice, line_id)
        if self._qorlia_journal_receipt(invoice, key, digest):
            return self.qorlia_journal_edit_load(invoice.id, line.id)
        invoice, line, changed = self._qorlia_journal_payload(invoice_id, line_id, version, values)
        preview = self.qorlia_journal_edit_preview(invoice_id, line_id, version, values)
        if preview['review_version'] != review_version:
            raise UserError('Review the journal details again before saving.')
        amounts = ('amount_total', 'amount_tax', 'invoice_total', 'amount_residual')
        before = invoice.read(list(amounts))[0]
        ledger = {item.id: (item.debit, item.credit, item.amount_currency) for item in invoice.line_ids}
        detail_fields = DETAILS + ('tax_ids', 'currency_id', 'partner_id', 'quantity', 'price_unit', 'discount')
        reader = self.env['sale.order']._qorlia_read_fields
        expected = {item.id: reader(item, detail_fields) for item in invoice.line_ids}
        expected[line.id].update({name: values[name] for name in changed})
        invoice.write({'line_ids': [Command.update(line.id, changed)]})
        invoice.invalidate_recordset()
        invoice.line_ids.invalidate_recordset()
        if (invoice.state != 'draft' or invoice._get_unbalanced_moves({'records': invoice})
                or any(not invoice.currency_id.is_zero(invoice[name] - before[name]) for name in amounts)
                or ledger != {item.id: (item.debit, item.credit, item.amount_currency) for item in invoice.line_ids}):
            raise UserError('Native Billing would change monetary entries. Nothing was saved; use the invoice calculation editor.')
        actual = {item.id: reader(item, detail_fields) for item in invoice.line_ids}
        for detail in list(expected.values()) + list(actual.values()):
            detail['tax_tag_ids'] = sorted(detail['tax_tag_ids'])
            detail['tax_ids'] = sorted(detail['tax_ids'])
        if actual != expected:
            raise UserError('Native Billing changed a reviewed detail. Nothing was saved; reload the invoice.')
        receipts = dict(invoice.qorlia_journal_receipts or {})
        receipts[key] = {'hash': digest, 'author': self.env.uid}
        invoice.write({'qorlia_journal_receipts': receipts})
        return self.qorlia_journal_edit_load(invoice.id, line.id)
