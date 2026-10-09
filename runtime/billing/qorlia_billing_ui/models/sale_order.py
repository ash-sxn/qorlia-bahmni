# SPDX-License-Identifier: LGPL-3.0-or-later
# Copyright 2026 Qorlia contributors.
import hashlib
import json
import math
import uuid

from odoo import api, fields, models
from odoo.exceptions import AccessError, UserError, ValidationError


HEADERS = (
    'partner_id', 'partner_invoice_id', 'partner_shipping_id', 'shop_id',
    'care_setting', 'provider_name', 'client_order_ref', 'company_id',
    'pricelist_id', 'warehouse_id', 'location_id', 'payment_term_id',
    'fiscal_position_id', 'date_order', 'discount_type', 'discount',
    'discount_percentage', 'chargeable_amount', 'disc_acc_id', 'note',
    'partner_village', 'user_id', 'team_id', 'validity_date',
)
ITEMS = (
    'product_id', 'name', 'display_type', 'sequence', 'product_uom',
    'product_uom_qty', 'price_unit', 'discount', 'tax_id', 'lot_id',
    'expiry_date', 'analytic_distribution',
)
TOTALS = ('amount_untaxed', 'amount_tax', 'amount_total', 'round_off_amount', 'currency_id')
LINE_TOTALS = ('price_subtotal', 'price_tax', 'price_total')


def _positive_id(value):
    return type(value) is int and value > 0


class SaleOrder(models.Model):
    _inherit = 'sale.order'

    qorlia_creation_key = fields.Char(copy=False, readonly=True, index=True)
    qorlia_creation_hash = fields.Char(copy=False, readonly=True)
    _sql_constraints = [
        ('qorlia_creation_key_unique', 'unique(qorlia_creation_key)',
         'This draft request has already been saved.'),
    ]

    def _qorlia_order(self, order_id, operation='read', lock=False):
        if not _positive_id(order_id):
            raise ValidationError('Select a valid charge order.')
        order = self.browse(order_id).exists()
        if not order:
            raise UserError('The charge order is no longer available.')
        order.check_access_rights(operation)
        order.check_access_rule(operation)
        if lock:
            self.env.cr.execute('SELECT id FROM sale_order WHERE id = %s FOR UPDATE', [order.id])
            self.env.cr.execute('SELECT id FROM sale_order_line WHERE order_id = %s ORDER BY id FOR UPDATE', [order.id])
            order.invalidate_recordset()
            order.order_line.invalidate_recordset()
            order.check_access_rule(operation)
        if order.state not in ('draft', 'sent'):
            raise UserError('Only draft or sent quotations can be edited. Reload this order.')
        return order

    def _qorlia_version(self):
        self.ensure_one()
        snapshot = {
            'state': self.state, 'stamp': self.write_date.isoformat(),
            'values': self._qorlia_read_fields(self, HEADERS),
            'lines': [{'id': line.id, 'stamp': line.write_date.isoformat(),
                       'values': self._qorlia_read_fields(line, ITEMS)}
                      for line in self.order_line.sorted('id')],
        }
        return hashlib.sha256(json.dumps(snapshot, sort_keys=True).encode()).hexdigest()

    def _qorlia_read_fields(self, record, names):
        result = {}
        for name in names:
            field = record._fields[name]
            value = record[name]
            if field.type == 'many2one':
                result[name] = value.id or False
            elif field.type == 'many2many':
                result[name] = value.ids
            elif field.type == 'datetime':
                result[name] = fields.Datetime.to_string(value) or False
            elif field.type == 'date':
                result[name] = fields.Date.to_string(value) or False
            else:
                result[name] = value
        return result

    def _qorlia_snapshot(self, order, warning=False):
        labels = {}
        records = [order] + list(order.order_line)
        for record in records:
            names = HEADERS + TOTALS if record._name == 'sale.order' else ITEMS
            for name in names:
                if record._fields[name].type in ('many2one', 'many2many'):
                    for relation in record[name]:
                        relation = relation._origin or relation
                        relation.check_access_rights('read')
                        relation.check_access_rule('read')
                        labels['%s:%s' % (relation._name, relation.id)] = relation.display_name
        return {
            'id': order._origin.id or False,
            'name': order._origin.name if order._origin else 'New charge order',
            'version': order._origin._qorlia_version() if order._origin else False,
            'values': self._qorlia_read_fields(order, HEADERS),
            'lines': [
                {'id': line._origin.id or False,
                 'values': self._qorlia_read_fields(line, ITEMS),
                 'totals': self._qorlia_read_fields(line, LINE_TOTALS)}
                for line in order.order_line
            ],
            'totals': self._qorlia_read_fields(order, TOTALS),
            'labels': labels,
            'warning': warning,
        }

    def _qorlia_values(self, model, values, allowed):
        if not isinstance(values, dict) or set(values) - set(allowed):
            raise ValidationError('Unsupported draft fields. Reload the editor.')
        result = {}
        for name, value in values.items():
            field = model._fields[name]
            if field.type in ('float', 'monetary', 'integer'):
                if type(value) not in (int, float) or not math.isfinite(value):
                    raise ValidationError('Enter a finite numeric value for %s.' % field.string)
                if field.type == 'integer' and type(value) is not int:
                    raise ValidationError('Enter a whole number for %s.' % field.string)
            elif field.type == 'many2one':
                if value is not False and not _positive_id(value):
                    raise ValidationError('Select a valid %s.' % field.string)
                if value:
                    relation = self.env[field.comodel_name].browse(value).exists()
                    if not relation:
                        raise ValidationError('The selected %s is no longer available.' % field.string)
                    relation.check_access_rights('read')
                    relation.check_access_rule('read')
            elif field.type == 'many2many':
                if (not isinstance(value, list) or len(value) > 100
                        or not all(_positive_id(item) for item in value)):
                    raise ValidationError('Select valid %s records.' % field.string)
                records = self.env[field.comodel_name].browse(value).exists()
                if set(records.ids) != set(value):
                    raise ValidationError('A selected %s is no longer available.' % field.string)
                records.check_access_rights('read')
                records.check_access_rule('read')
                value = [(6, 0, value)]
            elif field.type == 'selection':
                if value is not False and value not in dict(field._description_selection(self.env)):
                    raise ValidationError('Select a valid %s.' % field.string)
            elif field.type in ('char', 'text', 'html', 'date', 'datetime'):
                if value is not False and (not isinstance(value, str) or len(value) > 10000):
                    raise ValidationError('Enter valid text for %s.' % field.string)
            elif field.type == 'json':
                if value is not False and not isinstance(value, dict):
                    raise ValidationError('Invalid analytic distribution.')
                if value and (len(value) > 100 or not all(
                        isinstance(key, str) and all(part.isdigit() for part in key.split(','))
                        and type(amount) in (int, float) and math.isfinite(amount)
                        for key, amount in value.items())):
                    raise ValidationError('Invalid analytic distribution.')
                if value:
                    ids = {int(part) for key in value for part in key.split(',')}
                    records = self.env['account.analytic.account'].browse(ids).exists()
                    if set(records.ids) != ids:
                        raise ValidationError('Invalid analytic account.')
                    records.check_access_rights('read')
                    records.check_access_rule('read')
            result[name] = value
        return result

    def _qorlia_payload(self, payload, operation='read', lock=False):
        if (not isinstance(payload, dict) or set(payload) - {'id', 'version', 'values', 'lines'}
                or not isinstance(payload.get('lines'), list) or len(payload['lines']) > 500):
            raise ValidationError('Invalid draft. Reload the editor.')
        order_id = payload.get('id', False)
        origin = self._qorlia_order(order_id, operation, lock) if order_id is not False else self.browse()
        self.check_access_rights(operation if origin else 'create')
        values = self._qorlia_values(self, payload.get('values'), HEADERS)
        if values.get('company_id') not in self.env.companies.ids:
            raise AccessError('Select an authorized billing company.')
        commands = []
        seen = set()
        for line in payload['lines']:
            if not isinstance(line, dict) or set(line) - {'id', 'values', 'totals'}:
                raise ValidationError('Invalid draft item.')
            line_id = line.get('id', False)
            if line_id is not False and (not _positive_id(line_id) or line_id in seen
                                        or line_id not in origin.order_line.ids):
                raise ValidationError('The draft item does not belong to this order.')
            seen.add(line_id) if line_id else None
            item = self._qorlia_values(self.env['sale.order.line'], line.get('values'), ITEMS)
            if line_id:
                if operation == 'write':
                    previous = self._qorlia_read_fields(origin.order_line.browse(line_id), ITEMS)
                    item = {name: value for name, value in item.items()
                            if line['values'][name] != previous[name]}
                if item:
                    commands.append((1, line_id, item))
            else:
                commands.append((0, 0, item))
        commands.extend((2, line.id, 0) for line in origin.order_line if line.id not in seen)
        values['order_line'] = commands
        return origin, values

    @api.model
    def qorlia_draft_load(self, order_id=False):
        if order_id is not False:
            return self._qorlia_snapshot(self._qorlia_order(order_id))
        self.check_access_rights('create')
        spec = {name: '1' for name in HEADERS + TOTALS}
        spec['order_line'] = '1'
        result = self.onchange({}, [], spec)
        values = self._qorlia_from_onchange(self, result['value'], HEADERS)
        return self._qorlia_snapshot(self.new(values), result.get('warning', False))

    def _qorlia_from_onchange(self, model, values, names):
        result = {}
        for name in names:
            if name not in values:
                continue
            field = model._fields[name]
            value = values[name]
            if field.type == 'many2one' and isinstance(value, (tuple, list)):
                value = value[0]
            result[name] = value
        return result

    @api.model
    def qorlia_draft_preview(self, payload, change=False):
        origin, values = self._qorlia_payload(payload)
        if origin and payload.get('version') != origin._qorlia_version():
            raise UserError('This charge order changed since you opened it. Reload before editing.')
        if not payload['lines'] and values.get('discount_type') == 'fixed' and values.get('discount'):
            raise ValidationError('Add a product before calculating a fixed document discount.')
        if (change is not False and (not isinstance(change, dict)
                or set(change) - {'field', 'line'} or not isinstance(change.get('field'), str))):
            raise ValidationError('Invalid draft change.')
        warning = False
        if change and 'line' in change:
            index = change['line']
            if type(index) is not int or not 0 <= index < len(payload['lines']) or change['field'] not in ITEMS:
                raise ValidationError('Invalid item change.')
            line = payload['lines'][index]
            item = self._qorlia_values(self.env['sale.order.line'], line['values'], ITEMS)
            item['order_id'] = {**values, 'id': origin.id or False}
            item_origin = self.env['sale.order.line'].browse(line['id']) if line['id'] else self.env['sale.order.line']
            spec = {name: '1' for name in ITEMS + LINE_TOTALS}
            result = item_origin.onchange(item, [change['field']], spec)
            item.update(self._qorlia_from_onchange(item_origin, result.get('value', {}), ITEMS))
            item.pop('order_id')
            command = values['order_line'][index]
            values['order_line'][index] = (command[0], command[1], item)
            warning = result.get('warning', False)
        elif change and change['field'] not in HEADERS + ('order_line',):
            raise ValidationError('Invalid charge-order change.')
        spec = {name: '1' for name in HEADERS + TOTALS + ('order_line',)}
        spec.update({'order_line.' + name: '1' for name in ITEMS + LINE_TOTALS})
        changed = [change['field']] if change and 'line' not in change else ['order_line']
        result = origin.onchange(values, changed, spec)
        values.update(self._qorlia_from_onchange(self, result.get('value', {}), HEADERS + ('order_line',)))
        return self._qorlia_snapshot(self.new(values, origin=origin), warning or result.get('warning', False))

    @api.model
    def qorlia_draft_save(self, payload, request_key):
        try:
            if str(uuid.UUID(request_key)) != request_key:
                raise ValueError()
        except (ValueError, TypeError, AttributeError):
            raise ValidationError('A valid save request identifier is required.')
        origin, values = self._qorlia_payload(payload, 'write', lock=True)
        if not values.get('partner_id') or not values.get('shop_id'):
            raise ValidationError('Select a customer and shop before saving.')
        company = self.env['res.company'].browse(values['company_id'])
        shop = self.env['sale.shop'].browse(values['shop_id'])
        if shop.company_id and shop.company_id != company:
            raise ValidationError('The shop must belong to the quotation company.')
        if origin and origin.company_id != company:
            raise ValidationError('An existing quotation cannot be moved to another company.')
        if not payload['lines'] or not any(not line['values'].get('display_type') for line in payload['lines']):
            raise ValidationError('Add at least one product or service before saving.')
        for line in payload['lines']:
            item = line['values']
            if not item.get('display_type'):
                if not item.get('product_id') or not item.get('product_uom') or item.get('product_uom_qty', 0) <= 0:
                    raise ValidationError('Product lines need a product, unit and positive quantity.')
                if not 0 <= item.get('discount', 0) <= 100 or item.get('price_unit', 0) < 0:
                    raise ValidationError('Enter a non-negative price and a line discount from 0 to 100.')
                product = self.env['product.product'].browse(item['product_id'])
                unit = self.env['uom.uom'].browse(item['product_uom'])
                if not product.sale_ok or product.uom_id.category_id != unit.category_id:
                    raise ValidationError('Select a saleable product and a unit from its measurement category.')
                taxes = self.env['account.tax'].browse(item.get('tax_id', []))
                if any(tax.type_tax_use != 'sale' or tax.company_id != company for tax in taxes):
                    raise ValidationError('Select sales taxes from the quotation company.')
                if item.get('lot_id'):
                    lot = self.env['stock.lot'].browse(item['lot_id'])
                    if lot.product_id != product or (lot.company_id and lot.company_id != company):
                        raise ValidationError('Select a batch belonging to this product and company.')
        if not 0 <= values.get('discount_percentage', 0) <= 100 or values.get('discount', 0) < 0:
            raise ValidationError('Enter a valid document discount.')
        if values.get('chargeable_amount', 0) < 0:
            raise ValidationError('Enter a non-negative chargeable amount.')
        if (values.get('discount', 0) or values.get('discount_percentage', 0)) and not values.get('disc_acc_id'):
            raise ValidationError('Select a discount account head.')
        if values.get('disc_acc_id'):
            account = self.env['account.account'].browse(values['disc_acc_id'])
            if account.company_id != company or account.account_type != 'income_other':
                raise ValidationError('Select a discount account head from the quotation company.')
        if origin:
            if payload.get('version') != origin._qorlia_version():
                raise UserError('This charge order changed since you opened it. Reload before saving.')
            # Linked invoices or fulfilment need their own correction workflow, not a quotation overwrite.
            if origin.invoice_ids or origin.picking_ids or any(origin.order_line.mapped('dispensed')):
                raise UserError('This quotation has billing or stock activity. Use its native correction workflow.')
            # Native forms write changed fields only; resending dependencies resets manually selected taxes.
            previous = self._qorlia_read_fields(origin, HEADERS)
            changed = {name: value for name, value in values.items()
                       if name != 'order_line' and payload['values'][name] != previous[name]}
            if values['order_line']:
                changed['order_line'] = values['order_line']
            origin.write(changed)
        else:
            # Serialize retries of the same creation without relying on browser state.
            lock_key = int.from_bytes(hashlib.sha256(request_key.encode()).digest()[:8], 'big', signed=True)
            self.env.cr.execute('SELECT pg_advisory_xact_lock(%s)', [lock_key])
            digest = hashlib.sha256(json.dumps(payload, sort_keys=True, allow_nan=False).encode()).hexdigest()
            existing = self.search([('qorlia_creation_key', '=', request_key)], limit=1)
            if existing:
                if existing.create_uid != self.env.user or existing.qorlia_creation_hash != digest:
                    raise ValidationError('This save identifier belongs to another draft request.')
                return self._qorlia_snapshot(existing)
            origin = self.create({**values, 'qorlia_creation_key': request_key, 'qorlia_creation_hash': digest})
        return self._qorlia_snapshot(origin)

    @api.model
    def qorlia_draft_choices(self, kind, search='', shop_id=False, product_id=False):
        self.check_access_rights('read')
        if not isinstance(search, str) or len(search) > 200:
            raise ValidationError('Enter a shorter search.')
        choices = {
            'customer': ('res.partner', [('customer_rank', '>', 0)]),
            'shop': ('sale.shop', [('company_id', 'in', [False] + self.env.companies.ids)]),
            'product': ('product.product', [('sale_ok', '=', True)]),
            'pricelist': ('product.pricelist', []),
            'payment_term': ('account.payment.term', []),
            'discount_account': ('account.account', [('account_type', '=', 'income_other'), ('company_id', 'in', self.env.companies.ids)]),
            'tax': ('account.tax', [('type_tax_use', '=', 'sale'), ('company_id', 'in', self.env.companies.ids)]),
            'unit': ('uom.uom', []),
        }
        if kind == 'lot':
            if not _positive_id(shop_id) or not _positive_id(product_id):
                raise ValidationError('Select a shop and product before choosing a batch.')
            shop = self.env['sale.shop'].browse(shop_id).exists()
            shop.check_access_rights('read')
            shop.check_access_rule('read')
            if not shop or (shop.company_id and shop.company_id not in self.env.companies):
                raise AccessError('Select an authorized shop.')
            quants = self.env['stock.quant'].search([('product_id', '=', product_id),
                ('location_id', '=', shop.location_id.id), ('quantity', '>', 0)])
            model, domain = 'stock.lot', [('id', 'in', quants.lot_id.ids),
                ('product_id', '=', product_id), '|', ('expiration_date', '=', False),
                ('expiration_date', '>', fields.Datetime.now())]
        elif kind in choices:
            model, domain = choices[kind]
        else:
            raise ValidationError('Unsupported draft search.')
        return self.env[model].with_context(parent_shop_id=shop_id).name_search(
            name=search, args=domain, operator='ilike', limit=26)
