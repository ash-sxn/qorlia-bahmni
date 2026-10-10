# SPDX-License-Identifier: LGPL-3.0-or-later
# Copyright 2026 Qorlia contributors.
import hashlib
import json
import uuid

from psycopg2.errors import UniqueViolation

from odoo import api, Command, fields, models
from odoo.exceptions import AccessError, UserError, ValidationError


HEADERS = (
    'partner_id', 'partner_shipping_id', 'ref', 'payment_reference', 'invoice_date',
    'date', 'invoice_date_due', 'invoice_payment_term_id', 'journal_id', 'currency_id',
    'fiscal_position_id', 'invoice_user_id', 'partner_bank_id', 'invoice_incoterm_id',
    'narration', 'discount_type', 'discount', 'discount_percentage', 'disc_acc_id',
    'invoice_cash_rounding_id', 'auto_post', 'auto_post_until', 'to_check',
)
ITEMS = ('product_id', 'name', 'display_type', 'sequence', 'account_id', 'product_uom_id',
         'quantity', 'price_unit', 'discount', 'tax_ids', 'analytic_distribution')
TOTALS = ('qorlia_item_subtotal', 'amount_tax', 'amount_total', 'invoice_total', 'round_off_amount')
LINE_TOTALS = ('price_subtotal', 'price_total')


def _digest(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, default=str, allow_nan=False).encode()).hexdigest()


class InvoiceDraft(models.Model):
    _inherit = 'account.move'

    qorlia_invoice_creation_key = fields.Char(copy=False, readonly=True, index=True)
    qorlia_invoice_creation_hash = fields.Char(copy=False, readonly=True)
    _sql_constraints = [
        ('qorlia_invoice_creation_key_unique', 'unique(qorlia_invoice_creation_key)',
         'This invoice creation request has already been saved.'),
    ]

    def _qorlia_new_invoice(self):
        self.check_access_rights('create')
        if not self.env.user.has_group('account.group_account_invoice'):
            raise AccessError('Your Billing account cannot create customer invoices.')
        model = self.with_context(default_move_type='out_invoice')
        spec = {name: '1' for name in HEADERS + TOTALS + ('invoice_line_ids', 'company_id', 'move_type', 'state')}
        result = model.onchange({}, [], spec)
        values = self.env['sale.order']._qorlia_from_onchange(model, result['value'], HEADERS)
        return model.new({**values, 'company_id': self.env.company.id,
                          'move_type': 'out_invoice', 'state': 'draft'})

    def _qorlia_new_invoice_version(self):
        document = self._qorlia_new_invoice()
        return _digest({'user': self.env.uid, 'company': self.env.company.id,
            'defaults': self.env['sale.order']._qorlia_read_fields(document, HEADERS),
            'configuration': self._qorlia_invoice_draft_configuration(document)})

    def _qorlia_draft_invoice(self, invoice_id, operation='read', lock=False):
        invoice = self._qorlia_invoice(invoice_id, operation, lock)
        if invoice.state != 'draft':
            raise UserError('Only draft customer invoices and credit notes can be edited. Reload this document.')
        if not invoice._qorlia_invoice_snapshot()['ledger_balanced']:
            raise UserError('This draft has unbalanced journal entries. Review it in native Billing before editing.')
        if len(invoice.invoice_line_ids.filtered(lambda line: not line.qorlia_adjustment_kind)) > 500:
            raise UserError('More than 500 editable lines require native Billing review.')
        invoice.invoice_line_ids.check_access_rights('read')
        invoice.invoice_line_ids.check_access_rule('read')
        if operation == 'write' and not self.env.user.has_group('account.group_account_invoice'):
            raise AccessError('Your Billing account cannot edit invoices or credit notes.')
        return invoice

    def _qorlia_invoice_draft_configuration(self, document):
        reader = self.env['sale.order']._qorlia_read_fields
        result = {'today': str(fields.Date.context_today(document))}
        relations = ([(document, HEADERS)]
                     + [(line, ITEMS) for line in document.invoice_line_ids])
        for record, names in relations:
            for name in names:
                if record._fields[name].type in ('many2one', 'many2many'):
                    for relation in record[name]._origin:
                        relation.check_access_rights('read')
                        relation.check_access_rule('read')
                        result['%s:%s' % (relation._name, relation.id)] = str(relation.write_date)
        company = document.company_id._origin
        result['company'] = company.read(['write_date', 'currency_id', 'qorlia_rounding_account_id',
            'period_lock_date', 'fiscalyear_lock_date', 'tax_lock_date', 'tax_calculation_rounding_method',
            'early_pay_discount_computation'])
        currencies = (document.currency_id | company.currency_id)._origin
        result['currencies'] = currencies.read(['write_date', 'rounding', 'active'])
        result['rates'] = self.env['res.currency.rate'].search([
            ('currency_id', 'in', currencies.ids), ('company_id', 'in', [False, company.id])],
            order='id').read(['write_date', 'name', 'rate'])
        taxes = document.invoice_line_ids.tax_ids._origin
        taxes |= taxes.flatten_taxes_hierarchy()
        result['taxes'] = taxes.sorted('id').read(['write_date', 'amount', 'amount_type', 'price_include',
            'include_base_amount', 'is_base_affected', 'sequence', 'children_tax_ids', 'company_id', 'country_id'])
        result['accounts'] = (document.invoice_line_ids.account_id | document.disc_acc_id
                              | company.qorlia_rounding_account_id)._origin.sorted('id').read(
            ['write_date', 'company_id', 'account_type', 'deprecated', 'is_off_balance'])
        result['journal'] = document.journal_id._origin.read(
            ['write_date', 'type', 'active', 'company_id', 'currency_id', 'restrict_mode_hash_table'])
        result['term'] = document.invoice_payment_term_id._origin.read(['write_date', 'active'])
        result['rounding'] = document.invoice_cash_rounding_id._origin.read(
            ['write_date', 'rounding', 'strategy', 'rounding_method', 'profit_account_id', 'loss_account_id'])
        result['tax_lines'] = (taxes.invoice_repartition_line_ids | taxes.refund_repartition_line_ids).sorted('id').read(
            ['write_date', 'factor_percent', 'account_id', 'tag_ids'])
        result['term_lines'] = document.invoice_payment_term_id._origin.line_ids.sorted('id').read(
            ['write_date', 'value', 'value_amount', 'days', 'months', 'end_month', 'days_after',
             'discount_percentage', 'discount_days'])
        result['fiscal_tax_maps'] = document.fiscal_position_id._origin.tax_ids.sorted('id').read(
            ['write_date', 'tax_src_id', 'tax_dest_id'])
        result['fiscal_account_maps'] = document.fiscal_position_id._origin.account_ids.sorted('id').read(
            ['write_date', 'account_src_id', 'account_dest_id'])
        result['items'] = [reader(line, ITEMS) for line in document.invoice_line_ids]
        return result

    def _qorlia_invoice_draft_version(self):
        self.ensure_one()
        reader = self.env['sale.order']._qorlia_read_fields
        return _digest({'invoice': self._qorlia_invoice_snapshot()['version'],
            'values': reader(self, HEADERS), 'posted_before': self.posted_before,
            'lines': [{'id': line.id, 'write_date': line.write_date, 'values': reader(line, ITEMS),
                       'marker': line.qorlia_adjustment_kind} for line in self.invoice_line_ids.sorted('id')],
            'configuration': self._qorlia_invoice_draft_configuration(self)})

    def _qorlia_invoice_draft_snapshot(self, document, warning=False, source_version=False):
        reader = self.env['sale.order']._qorlia_read_fields
        origin = document._origin
        items = document.invoice_line_ids.filtered(lambda line: not line.qorlia_adjustment_kind)
        labels = {}
        for record, names in [(document, HEADERS)] + [(line, ITEMS) for line in items]:
            for name in names:
                if record._fields[name].type in ('many2one', 'many2many'):
                    for relation in record[name]._origin:
                        relation.check_access_rights('read')
                        relation.check_access_rule('read')
                        labels['%s:%s' % (relation._name, relation.id)] = relation.display_name
        writable = self.check_access_rights('write' if origin else 'create', raise_exception=False)
        if writable and origin:
            try:
                origin.check_access_rule('write')
            except AccessError:
                writable = False
        return {'id': origin.id or False, 'name': origin.name or False, 'move_type': document.move_type,
            'company': [document.company_id.id, document.company_id.display_name],
            'version': origin._qorlia_invoice_draft_version() if origin else source_version,
            'values': reader(document, HEADERS),
            'lines': [{'id': line._origin.id or False, 'values': reader(line, ITEMS),
                       'totals': reader(line, LINE_TOTALS)} for line in items],
            'totals': reader(document, TOTALS), 'labels': labels, 'warning': warning,
            'generated_adjustments': [{'kind': line.qorlia_adjustment_kind, 'name': line.name,
                                       'amount': line.price_subtotal}
                                      for line in document.invoice_line_ids.filtered('qorlia_adjustment_kind')],
            'selections': {name: self._fields[name]._description_selection(self.env)
                           for name in ('discount_type', 'auto_post')},
            'journal_locked': bool(origin.posted_before),
            'can_edit': bool(writable
                             and self.env.user.has_group('account.group_account_invoice'))}

    def _qorlia_invoice_draft_values(self, model, values, allowed):
        if not isinstance(values, dict) or set(values) != set(allowed):
            raise ValidationError('Reload the complete draft before editing.')
        result = self.env['sale.order']._qorlia_values(model, values, allowed)
        for name, value in values.items():
            field = model._fields[name]
            if field.type == 'boolean' and type(value) is not bool:
                raise ValidationError('Use a valid checkbox value for %s.' % field.string)
            if field.type == 'date' and value is not False:
                try:
                    if str(fields.Date.to_date(value)) != value:
                        raise ValueError()
                except (ValueError, TypeError):
                    raise ValidationError('Enter a valid date for %s.' % field.string)
        return result

    def _qorlia_invoice_draft_payload(self, payload, lock=False):
        if (not isinstance(payload, dict) or set(payload) != {'id', 'version', 'values', 'lines'}
                or not isinstance(payload.get('lines'), list) or len(payload['lines']) > 500):
            raise ValidationError('Invalid invoice draft. Reload the editor.')
        version = self._qorlia_new_invoice_version() if payload['id'] is False else False
        invoice = (self._qorlia_new_invoice() if payload['id'] is False
                   else self._qorlia_draft_invoice(payload['id'], 'write', lock))
        if payload['id'] is not False:
            version = invoice._qorlia_invoice_draft_version()
        if payload['version'] != version:
            raise UserError('The draft or its accounting configuration changed. Reload before editing.')
        values = self._qorlia_invoice_draft_values(self, payload['values'], HEADERS)
        if invoice.posted_before and values['journal_id'] != invoice.journal_id.id:
            raise ValidationError('A previously posted document must keep its original journal.')
        commands, seen = [], set()
        editable = invoice.invoice_line_ids.filtered(lambda line: not line.qorlia_adjustment_kind)
        for line in payload['lines']:
            if not isinstance(line, dict) or set(line) - {'id', 'values', 'totals'} or 'id' not in line:
                raise ValidationError('Invalid invoice item.')
            line_id = line['id']
            if line_id is not False and (type(line_id) is not int or line_id not in editable.ids or line_id in seen):
                raise ValidationError('The item does not belong to this editable invoice.')
            item = self._qorlia_invoice_draft_values(self.env['account.move.line'], line.get('values'), ITEMS)
            if item['display_type'] not in ('product', 'line_section', 'line_note'):
                raise ValidationError('Only invoice products, sections and notes can be edited.')
            if line_id and item['display_type'] != editable.browse(line_id).display_type:
                raise ValidationError('An existing invoice line must keep its product, section or note type.')
            commands.append(Command.update(line_id, item) if line_id else Command.create(item))
            if line_id:
                seen.add(line_id)
        commands.extend(Command.delete(line.id) for line in editable if line.id not in seen)
        values.update({'company_id': invoice.company_id.id, 'move_type': invoice.move_type,
                       'state': 'draft', 'invoice_line_ids': commands})
        return invoice, values

    def _qorlia_validate_invoice_draft(self, document):
        company = document.company_id._origin
        if not document.partner_id or not document.journal_id or not document.currency_id:
            raise ValidationError('Select a customer, sales journal and currency before saving.')
        if document.journal_id.company_id != company or document.journal_id.type != 'sale' or not document.journal_id.active:
            raise ValidationError('Choose an active sales journal from this invoice company.')
        if not document.currency_id.active:
            raise ValidationError('Select an active invoice currency.')
        for relation in (document.partner_id, document.partner_shipping_id, document.fiscal_position_id,
                         document.invoice_payment_term_id, document.invoice_cash_rounding_id):
            if relation and 'company_id' in relation._fields and relation.company_id and relation.company_id != company:
                raise ValidationError('Select invoice settings from this document company.')
        if document.partner_bank_id and document.partner_bank_id.partner_id != document.bank_partner_id:
            raise ValidationError('Select the native recipient bank account for this document.')
        if not document.invoice_line_ids.filtered(lambda line: line.display_type == 'product' and not line.qorlia_adjustment_kind):
            raise ValidationError('Add at least one product or service line before saving.')
        for line in document.invoice_line_ids.filtered(lambda item: item.display_type == 'product'):
            account = line.account_id
            if (not account or account.company_id != company or account.deprecated or account.is_off_balance
                    or account.account_type in ('asset_receivable', 'liability_payable')):
                raise ValidationError('Select an active non-receivable invoice-line account in this company.')
            if line.product_id:
                if (not line.product_id.sale_ok or line.product_id.company_id and line.product_id.company_id != company
                        or line.product_uom_id.category_id != line.product_id.uom_id.category_id):
                    raise ValidationError('Select a saleable product and a matching measurement unit from this company.')
            if any(tax.company_id != company or tax.type_tax_use != 'sale'
                   or tax.country_id != document.tax_country_id for tax in line.tax_ids):
                raise ValidationError('Select sales taxes for this invoice company and tax country.')

    @api.model
    def qorlia_invoice_draft_load(self, invoice_id=False):
        # Native onchange clears virtual-record caches. Compute defaults/version before building the form.
        version = self._qorlia_new_invoice_version() if invoice_id is False else False
        invoice = self._qorlia_new_invoice() if invoice_id is False else self._qorlia_draft_invoice(invoice_id)
        return self._qorlia_invoice_draft_snapshot(invoice, source_version=version)

    @api.model
    def qorlia_invoice_draft_choices(self, invoice_id, kind, search='', product_id=False):
        invoice = self._qorlia_new_invoice() if invoice_id is False else self._qorlia_draft_invoice(invoice_id)
        if not isinstance(search, str) or len(search) > 200:
            raise ValidationError('Enter a shorter invoice search.')
        company = invoice.company_id.id
        choices = {
            'customer': ('res.partner', [('type', '!=', 'private'), ('company_id', 'in', [False, company])]),
            'shipping': ('res.partner', [('company_id', 'in', [False, company])]),
            'product': ('product.product', [('sale_ok', '=', True), ('company_id', 'in', [False, company])]),
            'journal': ('account.journal', [('type', '=', 'sale'), ('company_id', '=', company), ('active', '=', True)]),
            'currency': ('res.currency', [('active', '=', True)]),
            'account': ('account.account', [('company_id', '=', company), ('deprecated', '=', False),
                ('account_type', 'not in', ('asset_receivable', 'liability_payable')), ('is_off_balance', '=', False)]),
            'discount_account': ('account.account', [('company_id', '=', company), ('deprecated', '=', False),
                ('account_type', '=', 'income_other')]),
            'tax': ('account.tax', [('type_tax_use', '=', 'sale'), ('company_id', '=', company),
                ('country_id', '=', invoice.tax_country_id.id)]),
            'payment_term': ('account.payment.term', [('company_id', 'in', [False, company])]),
            'fiscal_position': ('account.fiscal.position', [('company_id', '=', company)]),
            'bank': ('res.partner.bank', [('partner_id', '=', invoice.bank_partner_id.id),
                ('company_id', 'in', [False, company])]),
            'incoterm': ('account.incoterms', []),
            'cash_rounding': ('account.cash.rounding', [('company_id', 'in', [False, company])]),
            'salesperson': ('res.users', [('share', '=', False), ('company_ids', 'in', [company])]),
            'analytic': ('account.analytic.account', [('company_id', 'in', [False, company])]),
            'unit': ('uom.uom', []),
        }
        if not isinstance(kind, str) or kind not in choices:
            raise ValidationError('Unsupported invoice draft search.')
        model, domain = choices[kind]
        if kind == 'journal' and invoice.posted_before:
            domain += [('id', '=', invoice.journal_id.id)]
        if product_id is not False:
            if type(product_id) is not int or product_id <= 0:
                raise ValidationError('Select a valid product before choosing its unit.')
            product = self.env['product.product'].browse(product_id).exists()
            product.check_access_rights('read')
            product.check_access_rule('read')
            if not product or product.company_id and product.company_id != invoice.company_id:
                raise ValidationError('Select a product from this invoice company.')
            if kind == 'unit':
                domain += [('category_id', '=', product.uom_id.category_id.id)]
        return self.env[model].with_company(invoice.company_id).name_search(
            name=search, args=domain, operator='ilike', limit=26)

    @api.model
    def qorlia_invoice_draft_preview(self, payload, change=False):
        invoice, values = self._qorlia_invoice_draft_payload(payload)
        origin = invoice._origin
        rounding = invoice.round_off_amount
        if change is not False and (not isinstance(change, dict) or set(change) - {'field', 'line'}
                                   or not isinstance(change.get('field'), str)):
            raise ValidationError('Invalid invoice draft change.')
        warning = False
        helper = self.env['sale.order']
        if change and 'line' in change:
            index = change['line']
            if type(index) is not int or not 0 <= index < len(payload['lines']) or change['field'] not in ITEMS:
                raise ValidationError('Invalid invoice item change.')
            line = payload['lines'][index]
            item = self._qorlia_invoice_draft_values(self.env['account.move.line'], line['values'], ITEMS)
            item['move_id'] = {**values, 'id': origin.id or False}
            line_origin = self.env['account.move.line'].browse(line['id']) if line['id'] else self.env['account.move.line']
            result = line_origin.onchange(item, [change['field']], {name: '1' for name in ITEMS + LINE_TOTALS})
            item.update(helper._qorlia_from_onchange(line_origin, result.get('value', {}), ITEMS))
            item.pop('move_id')
            command = values['invoice_line_ids'][index]
            values['invoice_line_ids'][index] = (command[0], command[1], item)
            warning = result.get('warning', False)
        elif change and change['field'] not in HEADERS + ('invoice_line_ids',):
            raise ValidationError('Invalid invoice header change.')
        if change:
            spec = {name: '1' for name in HEADERS + TOTALS + ('invoice_line_ids',)}
            spec.update({'invoice_line_ids.' + name: '1' for name in ITEMS + LINE_TOTALS})
            changed = [change['field']] if 'line' not in change else ['invoice_line_ids']
            result = origin.onchange(values, changed, spec)
            values.update(helper._qorlia_from_onchange(self, result.get('value', {}), HEADERS + ('invoice_line_ids',)))
            warning = warning or result.get('warning', False)
        document = self.new(values, origin=origin)
        # Native computes use the inherited rounding, not a caller-supplied adjustment.
        document.round_off_amount = rounding
        document.update({'invoice_line_ids': [Command.delete(line.id)
                         for line in document.invoice_line_ids.filtered('qorlia_adjustment_kind')]})
        self._qorlia_native_draft_totals(document)
        document.onchange_invoice_lines()
        commands = [Command.create(value) for value in document._qorlia_adjustment_values()]
        document.update({'invoice_line_ids': commands})
        self._qorlia_native_draft_totals(document)
        try:
            self._qorlia_validate_invoice_draft(document)
        except ValidationError as error:
            if payload['id'] is not False:
                raise
            return self._qorlia_invoice_draft_snapshot(document,
                warning or {'title': 'Complete the invoice draft', 'message': str(error)}, payload['version'])
        snapshot = self._qorlia_invoice_draft_snapshot(document, warning, payload['version'])
        snapshot['review_version'] = _digest({'snapshot': {key: snapshot[key] for key in ('id', 'version', 'values', 'lines', 'totals')},
                                            'configuration': self._qorlia_invoice_draft_configuration(document)})
        return snapshot

    def _qorlia_native_draft_totals(self, document):
        # A virtual draft has no rebuilt journal lines. Use Odoo's native form tax widget instead of old ledger totals.
        document._compute_tax_totals()
        totals = document.tax_totals
        document.amount_tax = totals['amount_total'] - totals['amount_untaxed']
        document.amount_total = totals.get('amount_total_rounded', totals['amount_total'])
        document._compute_qorlia_item_subtotal()
        document._compute_invoice_total()

    @api.model
    def qorlia_invoice_draft_save(self, payload, review_version, request_key=False):
        if not isinstance(review_version, str) or len(review_version) != 64:
            raise ValidationError('Review the native draft calculation before saving.')
        if isinstance(payload, dict) and payload.get('id') is False:
            return self._qorlia_create_invoice_draft(payload, review_version, request_key)
        invoice, _ = self._qorlia_invoice_draft_payload(payload, lock=True)
        preview = self.qorlia_invoice_draft_preview(payload)
        if preview['review_version'] != review_version:
            raise UserError('This draft review changed. Recalculate before saving.')
        helper = self.env['sale.order']
        previous = helper._qorlia_read_fields(invoice, HEADERS)
        values = self._qorlia_invoice_draft_values(self, preview['values'], HEADERS)
        changed = {name: value for name, value in values.items() if previous[name] != preview['values'][name]}
        commands, seen = [], set()
        for line in preview['lines']:
            item = self._qorlia_invoice_draft_values(self.env['account.move.line'], line['values'], ITEMS)
            if line['id']:
                before = helper._qorlia_read_fields(self.env['account.move.line'].browse(line['id']), ITEMS)
                item = {name: value for name, value in item.items() if before[name] != line['values'][name]}
                if item:
                    commands.append(Command.update(line['id'], item))
                seen.add(line['id'])
            else:
                commands.append(Command.create(item))
        commands.extend(Command.delete(line.id) for line in invoice.invoice_line_ids
                        if not line.qorlia_adjustment_kind and line.id not in seen)
        if commands:
            changed['invoice_line_ids'] = commands
        if changed:
            invoice.write(changed)
        invoice._qorlia_prepare_adjustment_lines()
        invoice.invalidate_recordset()
        invoice.line_ids.invalidate_recordset()
        after = self._qorlia_invoice_draft_snapshot(invoice)
        if invoice._get_unbalanced_moves({'records': invoice}) or any(
                not invoice.currency_id.is_zero(after['totals'][name] - preview['totals'][name]) for name in TOTALS):
            raise UserError('Native Billing changed the reviewed calculation or produced an unbalanced draft. Nothing was saved.')
        return after

    def _qorlia_create_invoice_draft(self, payload, review_version, request_key):
        self.check_access_rights('create')
        if not self.env.user.has_group('account.group_account_invoice'):
            raise AccessError('Your Billing account cannot create customer invoices.')
        try:
            if str(uuid.UUID(request_key)) != request_key:
                raise ValueError()
        except (ValueError, TypeError, AttributeError):
            raise ValidationError('A valid invoice save request identifier is required.')
        # Serialize uncertain-response retries. The database constraint also prevents duplicate creations.
        lock_key = int.from_bytes(hashlib.sha256(('invoice:' + request_key).encode()).digest()[:8], 'big', signed=True)
        self.env.cr.execute('SELECT pg_advisory_xact_lock(%s)', [lock_key])
        try:
            digest = _digest({'payload': payload, 'review': review_version})
        except (ValueError, TypeError):
            raise ValidationError('Use valid finite invoice values before saving.')
        existing = self.search([('qorlia_invoice_creation_key', '=', request_key)], limit=1)
        if existing:
            if (existing.create_uid != self.env.user or existing.company_id != self.env.company
                    or existing.qorlia_invoice_creation_hash != digest):
                raise ValidationError('This save identifier belongs to another invoice request.')
            return self._qorlia_invoice_draft_snapshot(self._qorlia_draft_invoice(existing.id))
        self._qorlia_invoice_draft_payload(payload)
        preview = self.qorlia_invoice_draft_preview(payload)
        if preview.get('review_version') != review_version:
            raise UserError('This new invoice review changed. Recalculate before saving.')
        values = self._qorlia_invoice_draft_values(self, preview['values'], HEADERS)
        values.update({'company_id': self.env.company.id, 'move_type': 'out_invoice', 'state': 'draft',
            'qorlia_invoice_creation_key': request_key, 'qorlia_invoice_creation_hash': digest,
            'invoice_line_ids': [Command.create(self._qorlia_invoice_draft_values(
                self.env['account.move.line'], line['values'], ITEMS)) for line in preview['lines']]})
        try:
            with self.env.cr.savepoint():
                invoice = self.create(values)
        except UniqueViolation as error:
            if error.diag.constraint_name != 'account_move_qorlia_invoice_creation_key_unique':
                raise
            # Odoo retries SQLSTATE 40001 with a fresh snapshot; a Python-only error has no pgcode.
            self.env.cr.execute("DO $$ BEGIN RAISE EXCEPTION 'Concurrent invoice creation' USING ERRCODE = '40001'; END $$")
        invoice.check_access_rule('create')
        invoice._qorlia_prepare_adjustment_lines()
        invoice.invalidate_recordset()
        invoice.line_ids.invalidate_recordset()
        after = self._qorlia_invoice_draft_snapshot(invoice)
        if invoice._get_unbalanced_moves({'records': invoice}) or any(
                not invoice.currency_id.is_zero(after['totals'][name] - preview['totals'][name]) for name in TOTALS):
            raise UserError('Native Billing changed the reviewed calculation or produced an unbalanced draft. Nothing was created.')
        return after
