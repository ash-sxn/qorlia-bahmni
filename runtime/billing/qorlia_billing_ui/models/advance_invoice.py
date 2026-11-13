# SPDX-License-Identifier: LGPL-3.0-or-later
# Copyright 2026 Qorlia contributors.
import hashlib
import math
import re
import uuid

from psycopg2.errors import UniqueViolation

from odoo import api, Command, fields, models
from odoo.exceptions import AccessError, UserError, ValidationError

from .invoice_draft import _digest, TOTALS


VALUES = ('advance_payment_method', 'amount', 'fixed_amount', 'deposit_account_id', 'deposit_taxes_id')


class AdvanceInvoiceIdentity(models.Model):
    _inherit = 'account.move'

    qorlia_advance_key = fields.Char(copy=False, readonly=True, index=True)
    qorlia_advance_hash = fields.Char(copy=False, readonly=True)
    qorlia_advance_order_id = fields.Many2one('sale.order', copy=False, readonly=True, check_company=True)
    _sql_constraints = [
        ('qorlia_advance_key_unique', 'unique(qorlia_advance_key)',
         'This advance invoice request has already been saved.'),
    ]


class AdvanceInvoice(models.Model):
    _inherit = 'sale.order'

    def _qorlia_advance_order(self, order_id, operation='read', lock=False):
        if not self.env.user.has_group('base.group_user'):
            raise AccessError('Advance invoices require an internal Billing account.')
        order = self._qorlia_order(order_id, operation, lock, states=None)
        if order.company_id not in self.env.companies:
            raise AccessError('Select an order from your authorised Billing companies.')
        order.order_line.check_access_rights('read')
        order.order_line.check_access_rule('read')
        if len(order.order_line) > 500:
            raise UserError('More than 500 order lines require native Billing review.')
        return order.with_company(order.company_id)

    def _qorlia_advance_wizard(self, order, values):
        if not isinstance(values, dict) or set(values) != set(VALUES):
            raise ValidationError('Reload the complete advance invoice form.')
        if values['advance_payment_method'] not in ('percentage', 'fixed'):
            raise ValidationError('Select a percentage or fixed advance invoice.')
        for name in ('amount', 'fixed_amount'):
            value = values[name]
            if type(value) not in (int, float) or not math.isfinite(value):
                raise ValidationError('Enter finite advance invoice amounts.')
        tax_ids = values['deposit_taxes_id']
        if (not isinstance(tax_ids, list) or len(tax_ids) > 100
                or any(type(item) is not int or item <= 0 for item in tax_ids)
                or len(set(tax_ids)) != len(tax_ids)):
            raise ValidationError('Select distinct native sales taxes.')
        model = order.env['sale.advance.payment.inv']
        model.check_access_rights('create')
        prepared = order._qorlia_values(model, values, VALUES)
        wizard = model.new({**prepared, 'sale_order_ids': [Command.set(order.ids)]})
        wizard._check_amount_is_positive()
        wizard._check_down_payment_product_is_valid()
        if wizard.product_id:
            wizard.product_id.check_access_rights('read')
            wizard.product_id.check_access_rule('read')
            if wizard.product_id.company_id and wizard.product_id.company_id != order.company_id:
                raise ValidationError('The default deposit product belongs to another company.')
            if values['deposit_account_id'] or tax_ids:
                raise ValidationError('The configured deposit product already determines its account and taxes.')
        else:
            if wizard.deposit_account_id:
                if not self.env.user.has_group('account.group_account_manager'):
                    raise AccessError('Only a Billing accounting manager can select the deposit income account.')
                account = wizard.deposit_account_id
                if account.company_id != order.company_id or account.deprecated:
                    raise ValidationError('Select an active deposit account from this order company.')
            if any(tax.company_id != order.company_id or tax.type_tax_use != 'sale'
                   for tax in wizard.deposit_taxes_id):
                raise ValidationError('Select sales taxes from this order company.')
        return wizard

    def _qorlia_advance_create_access(self, order, wizard):
        order.check_access_rights('write')
        order.check_access_rule('write')
        if order.state not in ('sale', 'done'):
            raise UserError('Confirm this order before creating an advance invoice.')
        moves = order.env['account.move']
        moves.check_access_rights('create')
        moves.check_access_rights('write')
        if not self.env.user.has_group('account.group_account_invoice'):
            raise AccessError('Your Billing account cannot create advance invoices.')
        order.env['account.move.line'].check_access_rights('create')
        order.env['sale.order.line'].check_access_rights('create')
        if not wizard.product_id:
            order.env['product.product'].check_access_rights('create')

    @api.model
    def qorlia_advance_load(self, order_id):
        order = self._qorlia_advance_order(order_id)
        wizard = order.env['sale.advance.payment.inv'].new({'sale_order_ids': [Command.set(order.ids)]})
        if wizard.product_id:
            wizard.product_id.check_access_rights('read')
            wizard.product_id.check_access_rule('read')
        return {'order': order._qorlia_workflow_snapshot(),
                'values': {'advance_payment_method': 'percentage', 'amount': 0.0, 'fixed_amount': 0.0,
                           'deposit_account_id': False, 'deposit_taxes_id': []},
                'product': [wizard.product_id.id, wizard.product_id.display_name] if wizard.product_id else False,
                'can_set_account': self.env.user.has_group('account.group_account_manager')}

    @api.model
    def qorlia_advance_choices(self, order_id, kind, search=''):
        order = self._qorlia_advance_order(order_id)
        if not isinstance(search, str) or len(search) > 200:
            raise ValidationError('Enter a shorter deposit setting search.')
        if kind == 'account':
            if not self.env.user.has_group('account.group_account_manager'):
                raise AccessError('Only an accounting manager can select the deposit account.')
            model, domain = 'account.account', [('deprecated', '=', False)]
        elif kind == 'tax':
            model, domain = 'account.tax', [('type_tax_use', '=', 'sale')]
        else:
            raise ValidationError('Select a supported deposit setting search.')
        return order.env[model].name_search(name=search,
            args=domain + [('company_id', '=', order.company_id.id)], operator='ilike', limit=26)

    def _qorlia_advance_preview(self, order, values):
        wizard = self._qorlia_advance_wizard(order, values)
        self._qorlia_advance_create_access(order, wizard)
        setup = not bool(wizard.product_id)
        product_values = wizard._prepare_down_payment_product_values() if setup else False
        if setup:
            # Virtual records exercise the native computes without consuming IDs or changing defaults.
            wizard.product_id = order.env['product.product'].new(product_values)
        line = order.env['sale.order.line'].new(wizard._prepare_so_line_values(order))
        prepared = wizard._prepare_invoice_values(order, line)
        for command in prepared['invoice_line_ids']:
            command[2].pop('sale_line_ids', None)
        invoice = order.env['account.move'].new(prepared)
        moves = order.env['account.move']
        moves._qorlia_native_draft_totals(invoice)
        invoice.update({'invoice_line_ids': [Command.create(item) for item in invoice._qorlia_adjustment_values()]})
        moves._qorlia_native_draft_totals(invoice)
        moves._qorlia_validate_invoice_draft(invoice)
        configuration = moves._qorlia_invoice_draft_configuration(invoice)
        if setup:
            for item in configuration['items']:
                if item['product_id'] == wizard.product_id.id:
                    item['product_id'] = False
        totals = order._qorlia_read_fields(invoice, TOTALS)
        result = {'order': order._qorlia_workflow_snapshot(), 'values': values,
                  'product': False if setup else [wizard.product_id.id, wizard.product_id.display_name],
                  'can_set_account': self.env.user.has_group('account.group_account_manager'),
                  'invoice': {'company': invoice.company_id.display_name, 'journal': invoice.journal_id.display_name,
                              'currency': [invoice.currency_id.id, invoice.currency_id.name], 'totals': totals,
                              'lines': [{'key': item.qorlia_adjustment_kind or 'deposit',
                                         'name': item.name, 'subtotal': item.price_subtotal,
                                         'total': item.price_total} for item in invoice.invoice_line_ids]}}
        result['review_version'] = _digest({'review': result, 'configuration': configuration,
            'product_setup': product_values,
            'deposit_default': self.env['ir.config_parameter'].sudo().get_param('sale.default_deposit_product_id')})
        return result

    @api.model
    def qorlia_advance_preview(self, order_id, values):
        return self._qorlia_advance_preview(self._qorlia_advance_order(order_id), values)

    def _qorlia_advance_request(self, order_id, values, review_version, request_key):
        try:
            if not isinstance(request_key, str) or str(uuid.UUID(request_key)) != request_key:
                raise ValueError()
        except (ValueError, TypeError, AttributeError):
            raise ValidationError('Use a valid advance invoice request identifier.')
        if not isinstance(review_version, str) or not re.fullmatch('[a-f0-9]{64}', review_version):
            raise ValidationError('Review the current advance calculation before saving.')
        try:
            return _digest({'order': order_id, 'values': values, 'review': review_version})
        except (ValueError, TypeError):
            raise ValidationError('Use valid finite advance invoice values.')

    def _qorlia_existing_advance(self, order, request_key, digest):
        invoice = order.env['account.move'].search([('qorlia_advance_key', '=', request_key)], limit=1)
        if invoice:
            invoice.check_access_rights('read')
            invoice.check_access_rule('read')
            if (invoice.create_uid != self.env.user or invoice.company_id != order.company_id
                    or invoice.qorlia_advance_order_id != order or invoice.qorlia_advance_hash != digest):
                raise ValidationError('This request identifier belongs to a different advance invoice.')
        return invoice

    def _qorlia_advance_saved(self, order, invoice):
        return {'order': order._qorlia_workflow_snapshot(), 'invoice': invoice._qorlia_invoice_snapshot()}

    @api.model
    def qorlia_advance_status(self, order_id, values, review_version, request_key):
        order = self._qorlia_advance_order(order_id)
        digest = self._qorlia_advance_request(order_id, values, review_version, request_key)
        invoice = self._qorlia_existing_advance(order, request_key, digest)
        return self._qorlia_advance_saved(order, invoice) if invoice else False

    @api.model
    def qorlia_advance_save(self, order_id, values, review_version, request_key):
        digest = self._qorlia_advance_request(order_id, values, review_version, request_key)
        lock = int.from_bytes(hashlib.sha256(('advance:' + request_key).encode()).digest()[:8], 'big', signed=True)
        self.env.cr.execute('SELECT pg_advisory_xact_lock(%s)', [lock])
        # First-use setup changes a shared native default, so concurrent orders must recheck it serially.
        setup_lock = int.from_bytes(hashlib.sha256(b'advance-deposit-default').digest()[:8], 'big', signed=True)
        self.env.cr.execute('SELECT pg_advisory_xact_lock(%s)', [setup_lock])
        order = self._qorlia_advance_order(order_id, 'write', lock=True)
        existing = self._qorlia_existing_advance(order, request_key, digest)
        if existing:
            return self._qorlia_advance_saved(order, existing)
        reviewed = self._qorlia_advance_preview(order, values)
        if reviewed['review_version'] != review_version:
            raise UserError('The order or deposit configuration changed. Recalculate before saving.')
        try:
            with self.env.cr.savepoint():
                wizard = self._qorlia_advance_wizard(order, values)
                wizard = order.env['sale.advance.payment.inv'].create({
                    **order._qorlia_values(wizard, values, VALUES), 'sale_order_ids': [Command.set(order.ids)]})
                invoice = wizard._create_invoices(order)
                invoice.ensure_one()
                invoice.check_access_rule('create')
                invoice.check_access_rights('write')
                invoice.check_access_rule('write')
                invoice.line_ids.check_access_rights('read')
                invoice.line_ids.check_access_rule('read')
                if invoice.company_id != order.company_id or invoice.state != 'draft':
                    raise UserError('Native Billing changed the advance invoice company or state. Nothing was saved.')
                invoice._qorlia_prepare_adjustment_lines()
                invoice.invalidate_recordset()
                invoice.line_ids.invalidate_recordset()
                if (invoice._get_unbalanced_moves({'records': invoice}) or any(
                        not invoice.currency_id.is_zero(invoice[name] - reviewed['invoice']['totals'][name])
                        for name in TOTALS)):
                    raise UserError('The native advance amount differs from its review. Nothing was saved.')
                invoice.write({'qorlia_advance_key': request_key, 'qorlia_advance_hash': digest,
                               'qorlia_advance_order_id': order.id})
        except UniqueViolation as error:
            if error.diag.constraint_name != 'account_move_qorlia_advance_key_unique':
                raise
            self.env.cr.execute("DO $$ BEGIN RAISE EXCEPTION 'Concurrent advance creation' USING ERRCODE = '40001'; END $$")
        order.invalidate_recordset()
        order.order_line.invalidate_recordset()
        return self._qorlia_advance_saved(order, invoice)
