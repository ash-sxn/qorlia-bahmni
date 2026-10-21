# SPDX-License-Identifier: LGPL-3.0-or-later
# Copyright 2026 Qorlia contributors.
import copy
import math
import uuid
from contextlib import closing

from odoo import api, fields, models, tools
from odoo.exceptions import AccessError, UserError, ValidationError

from .invoice_draft import _digest
from .stock_operation_form import OPERATION_FIELDS, IDENTITY_FIELDS


_RECEIPT_TOKEN = object()


class StockOperationEdit(models.Model):
    _inherit = 'stock.picking'

    # shortcut: per-transfer receipts; migrate to a receipt table before high-volume fulfillment.
    qorlia_operation_receipts = fields.Json(copy=False, readonly=True)

    @api.model_create_multi
    def create(self, values_list):
        if (any('qorlia_operation_receipts' in values for values in values_list)
                or 'default_qorlia_operation_receipts' in self.env.context):
            raise AccessError('Operation receipts can only be recorded by a reviewed action.')
        return super().create(values_list)

    def write(self, values):
        if ('qorlia_operation_receipts' in values
                and self.env.context.get('qorlia_operation_receipt_token') is not _RECEIPT_TOKEN):
            raise AccessError('Operation receipts can only be recorded by a reviewed action.')
        return super().write(values)

    def _qorlia_operation_delete_access(self, picking, move, line):
        if not line or move.state in ('done', 'cancel'):
            raise UserError('Select a saved operation that has not been completed or cancelled.')
        for records in (picking, move):
            records.check_access_rights('write')
            records.check_access_rule('write')
        line.check_access_rights('unlink')
        line.check_access_rule('unlink')
        for level in line.package_level_id:
            for records in (level.move_line_ids, level.move_ids):
                records.check_access_rights('read')
                records.check_access_rule('read')
            if not (level.move_line_ids - line or level.move_ids):
                level.check_access_rights('unlink')
                level.check_access_rule('unlink')

    def _qorlia_operation_can_delete(self, picking, move, line):
        try:
            self._qorlia_operation_delete_access(picking, move, line)
            return True
        except (AccessError, UserError):
            return False

    def _qorlia_operation_request(self, payload, receipt=False, allow_inventory=False):
        names = {'order_id', 'transfer_id', 'move_id', 'operation_id', 'version', 'edits', 'action'}
        if receipt:
            names |= {'review_version', 'request_key'}
        if not isinstance(payload, dict) or set(payload) != names:
            raise ValidationError('Use an exact reviewed stock operation request.')
        if ((not (allow_inventory and payload['order_id'] is False)
                and (type(payload['order_id']) is not int or payload['order_id'] <= 0))
                or any(type(payload[name]) is not int or payload[name] <= 0 for name in ('transfer_id', 'move_id'))
                or payload['operation_id'] is not False and (type(payload['operation_id']) is not int or payload['operation_id'] <= 0)
                or not isinstance(payload['action'], str) or payload['action'] not in ('save', 'delete')
                or not isinstance(payload['edits'], list) or len(payload['edits']) > 100
                or payload['action'] == 'delete' and (not payload['operation_id'] or payload['edits'])):
            raise ValidationError('Select a supported stock operation and action.')
        for name in ('version', 'review_version') if receipt else ('version',):
            value = payload[name]
            if not isinstance(value, str) or len(value) != 64 or any(char not in '0123456789abcdef' for char in value):
                raise ValidationError('Reload and review the current stock operation.')
        for edit in payload['edits']:
            if (not isinstance(edit, dict) or set(edit) != {'field', 'value'}
                    or not isinstance(edit['field'], str) or edit['field'] not in OPERATION_FIELDS):
                raise ValidationError('Use only supported stock operation edits.')
            kind = self.env['stock.move.line']._fields[edit['field']].type
            value = edit['value']
            if (kind == 'float' and (type(value) not in (int, float) or not math.isfinite(value))
                    or kind == 'many2one' and value is not False and (type(value) is not int or value <= 0)
                    or kind in ('char', 'datetime') and value is not False and (not isinstance(value, str) or len(value) > 10000)):
                raise ValidationError('Use finite values and valid stock relation identifiers.')
        if receipt:
            try:
                if str(uuid.UUID(payload['request_key'])) != payload['request_key']:
                    raise ValueError()
            except (ValueError, TypeError, AttributeError):
                raise ValidationError('Use the exact stock operation request identifier.')
        return {name: copy.deepcopy(payload[name]) for name in names}

    def _qorlia_operation_selected(self, view, lock=False):
        selected = {}
        names = {'uom.uom': ['active', 'category_id', 'factor', 'rounding'],
            'stock.lot': ['product_id', 'company_id', 'name', 'expiration_date'],
            'stock.location': ['parent_path', 'usage', 'company_id'],
            'stock.quant.package': ['location_id', 'company_id', 'package_type_id'],
            'res.partner': ['company_id', 'active']}
        for field, value in view['values'].items():
            definition = self.env['stock.move.line']._fields[field]
            if definition.type == 'many2one' and value:
                selected.setdefault(definition.comodel_name, set()).add(value)
        result = {}
        for model_name in sorted(selected):
            records = self.env[model_name].browse(sorted(selected[model_name])).exists()
            if len(records) != len(selected[model_name]):
                raise UserError('A selected stock relation is no longer available.')
            records.check_access_rights('read')
            records.check_access_rule('read')
            records.check_field_access_rights('read', ['write_date', *names[model_name]])
            if lock:
                self.env.cr.execute('SELECT id FROM %s WHERE id IN %%s ORDER BY id FOR UPDATE' % records._table, [tuple(records.ids)])
                records.invalidate_recordset()
            result[model_name] = records.read(['write_date', *names[model_name]])
        return result

    def _qorlia_operation_graph(self, order_id, original_lines=None, original_packages=None):
        graph = self._qorlia_reservation_graph(order_id, original_lines, original_packages)
        lines = self.move_line_ids.sorted('id')
        lines.check_field_access_rights('read', OPERATION_FIELDS + ('balance',))
        rows = [{'id': line.id if original_lines is None or line.id in original_lines else False,
            'move_id': line.move_id.id, 'values': self.env['sale.order']._qorlia_read_fields(line, OPERATION_FIELDS + ('balance',))}
            for line in lines]
        graph['form_rows'] = sorted(rows, key=_digest)
        return graph

    def _qorlia_operation_apply(self, source, view, action):
        picking, move, line, model, identity, _values, groups, _version = source
        if action == 'delete':
            self._qorlia_operation_delete_access(picking, move, line)
            line.unlink()
            return False
        values = self.env['sale.order']._qorlia_values(model, view['values'], OPERATION_FIELDS)
        form = model.new({**identity, **values}, origin=line if line else None)
        _rules, reason = self._qorlia_operation_rules(picking, move, line, form, groups, model.env.context)
        if reason:
            raise AccessError(reason)
        form._check_positive_qty_done()
        form._check_fields_values()
        values['balance'] = view['balance']
        if line:
            before = self.env['sale.order']._qorlia_read_fields(line, OPERATION_FIELDS + ('balance',))
            values = {name: value for name, value in values.items() if before[name] != value}
            if not values:
                raise UserError('No stock operation changes were entered.')
            line.check_field_access_rights('write', list(values))
            line.with_context(**model.env.context).write(values)
            return line.id
        model.check_field_access_rights('write', list(values) + list(IDENTITY_FIELDS))
        return model.create({**identity, **values}).id

    def _qorlia_operation_prepare(self, payload):
        data = self._qorlia_operation_request(payload)
        picking, _order = self._qorlia_reservation_transfer(data['order_id'], data['transfer_id'], lock=True)
        configuration = picking._qorlia_reservation_scope(lock=True)
        for items in (picking.move_ids, picking.move_line_ids, picking.package_level_ids):
            if items:
                self.env.cr.execute('SELECT id FROM %s WHERE id IN %%s ORDER BY id FOR UPDATE' % items._table, [tuple(sorted(items.ids))])
        self.env.invalidate_all()
        selected = {name: data[name] for name in ('order_id', 'transfer_id', 'move_id', 'operation_id')}
        source = self._qorlia_operation_source(**selected)
        view = self.qorlia_operation_onchange(**selected, version=data['version'], edits=data['edits'])
        self._qorlia_operation_selected(view, lock=True)
        self.env.invalidate_all()
        source = self._qorlia_operation_source(**selected)
        view = self.qorlia_operation_onchange(**selected, version=data['version'], edits=data['edits'])
        related = self._qorlia_operation_selected(view)
        original_lines, original_packages = set(picking.move_line_ids.ids), set(picking.package_level_ids.ids)
        before = picking._qorlia_operation_graph(data['order_id'], original_lines, original_packages)
        cr = self.env.cr
        cr.flush()
        callbacks = {name: getattr(cr, name) for name in ('postcommit', 'prerollback', 'postrollback')}
        try:
            for name in callbacks:
                setattr(cr, name, tools.Callbacks())
            with closing(cr.savepoint()):
                self._qorlia_operation_apply(source, view, data['action'])
                cr.flush()
                after = picking._qorlia_operation_graph(data['order_id'], original_lines, original_packages)
                stock = picking._qorlia_reservation_scope()
                physical = lambda scope: [(row['id'], row['quantity']) for row in scope['stock.quant']]
                if physical(stock) != physical(configuration) or picking.state in ('done', 'cancel'):
                    raise UserError('This operation changed physical stock or completed the transfer. Nothing was saved.')
                quant = lambda scope: [{key: value for key, value in row.items() if key != 'write_date'} for row in scope['stock.quant']]
                effect = {'before': before, 'after': after, 'quant_before': quant(configuration), 'quant_after': quant(stock)}
        finally:
            for name, original in callbacks.items():
                setattr(cr, name, original)
            self.env.invalidate_all()
        review = {**data, 'form': view, **effect, 'review_version': _digest({'request': data,
            'effect': effect, 'form': view, 'related': related, 'author': self.env.uid, 'companies': self.env.companies.ids})}
        return picking, review, source, view, original_lines, original_packages

    @api.model
    def qorlia_operation_preview(self, payload):
        return self._qorlia_operation_prepare(payload)[1]

    def _qorlia_operation_receipt(self, key, digest):
        receipt = (self.qorlia_operation_receipts or {}).get(key)
        if receipt and (receipt['hash'] != digest or receipt['author'] != self.env.uid):
            raise ValidationError('This identifier belongs to another stock operation request.')
        return receipt

    @api.model
    def qorlia_operation_status(self, payload):
        exact = self._qorlia_operation_request(payload, receipt=True)
        if not self.env.user.has_group('stock.group_stock_user'):
            raise AccessError('Operation recovery requires the native Stock User role.')
        picking, _order = self._qorlia_reservation_transfer(exact['order_id'], exact['transfer_id'])
        digest = _digest({'request': exact, 'author': self.env.uid, 'companies': self.env.companies.ids})
        receipt = picking._qorlia_operation_receipt(exact['request_key'], digest)
        return {'accepted': bool(receipt), 'request_key': exact['request_key'], 'action': exact['action'],
            'operation_id': receipt['operation_id'] if receipt else False,
            'current': self.qorlia_transfer_load(exact['order_id'], exact['transfer_id'])}

    @api.model
    def qorlia_operation_save(self, payload):
        exact = self._qorlia_operation_request(payload, receipt=True)
        if not self.env.user.has_group('stock.group_stock_user'):
            raise AccessError('Saving operations requires the native Stock User role.')
        picking, _order = self._qorlia_reservation_transfer(exact['order_id'], exact['transfer_id'], lock=True)
        digest = _digest({'request': exact, 'author': self.env.uid, 'companies': self.env.companies.ids})
        if picking._qorlia_operation_receipt(exact['request_key'], digest):
            return self.qorlia_operation_status(exact)
        selected = {name: value for name, value in exact.items() if name not in ('review_version', 'request_key')}
        picking, review, source, view, original_lines, original_packages = self._qorlia_operation_prepare(selected)
        if review['review_version'] != exact['review_version']:
            raise UserError('The operation effects changed. Review them again before saving.')
        cr = self.env.cr
        hooks = {name: (getattr(cr, name), list(getattr(cr, name)._funcs), copy.deepcopy(getattr(cr, name).data))
            for name in ('postcommit', 'prerollback', 'postrollback')}
        try:
            with cr.savepoint():
                operation_id = self._qorlia_operation_apply(source, view, exact['action'])
                cr.flush()
                after = picking._qorlia_operation_graph(exact['order_id'], original_lines, original_packages)
                stock = [{key: value for key, value in row.items() if key != 'write_date'}
                    for row in picking._qorlia_reservation_scope()['stock.quant']]
                if after != review['after'] or stock != review['quant_after']:
                    raise UserError('Native operation effects changed. Nothing was saved.')
                receipts = dict(picking.qorlia_operation_receipts or {})
                receipts[exact['request_key']] = {'hash': digest, 'author': self.env.uid, 'operation_id': operation_id}
                picking.with_context(qorlia_operation_receipt_token=_RECEIPT_TOKEN).write({'qorlia_operation_receipts': receipts})
                self.env.flush_all()
                self.env.invalidate_all()
                result = self.qorlia_operation_status(exact)
            return result
        except Exception:
            for name, (callbacks, functions, data) in hooks.items():
                setattr(cr, name, callbacks)
                callbacks.clear()
                for function in functions:
                    callbacks.add(function)
                callbacks.data.update(data)
            raise
