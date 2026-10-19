# SPDX-License-Identifier: LGPL-3.0-or-later
# Copyright 2026 Qorlia contributors.
from contextlib import closing
import copy
import hashlib
import hmac
import re
import uuid

from psycopg2 import sql
from odoo import api, fields, models, tools
from odoo.exceptions import AccessError, UserError, ValidationError

from .invoice_draft import _digest


GRAPH_MODELS = ('product.product', 'stock.picking', 'stock.move', 'stock.move.line', 'stock.package_level',
    'stock.quant', 'stock.lot', 'stock.quant.package', 'procurement.group',
    'purchase.order', 'purchase.order.line', 'stock.warehouse.orderpoint',
    'mail.message', 'mail.mail', 'mail.activity', 'mail.notification',
    'mail.tracking.value', 'ir.attachment')
CONFIG_MODELS = ('res.company', 'res.users', 'res.groups', 'ir.model.access', 'ir.rule',
    'ir.property', 'ir.config_parameter', 'ir.module.module', 'product.product',
    'product.template', 'product.category', 'product.supplierinfo', 'stock.location',
    'stock.route', 'stock.rule', 'stock.warehouse', 'stock.picking.type', 'uom.uom',
    'res.currency', 'res.currency.rate', 'account.tax', 'account.tax.repartition.line',
    'account.fiscal.position', 'account.fiscal.position.tax', 'account.fiscal.position.account',
    'res.partner', 'account.payment.term', 'account.payment.term.line',
    'ir.ui.view', 'mail.template', 'mail.message.subtype', 'res.lang')
FINANCIAL_MODELS = ('account.move', 'account.move.line', 'account.payment',
    'account.partial.reconcile', 'stock.valuation.layer', 'sale.order', 'sale.order.line')
METADATA = {'id', 'create_uid', 'create_date', 'write_uid', 'write_date'}
AUDIT_MODELS = {'mail.message', 'mail.mail', 'mail.activity', 'mail.notification', 'mail.tracking.value', 'ir.attachment'}
ASSIGNED_ON_SAVE = {'stock.picking': {'name', 'date'}, 'purchase.order': {'name'},
    'stock.move.line': {'date'}, 'mail.message': {'date', 'message_id'}, 'mail.mail': {'message_id'}}
_RECEIPT_TOKEN = object()


class StockConfirmation(models.Model):
    _inherit = 'stock.picking'

    # shortcut: per-transfer JSON receipts; migrate before high-volume fulfillment.
    qorlia_confirmation_receipts = fields.Json(copy=False, readonly=True)

    @api.model_create_multi
    def create(self, values_list):
        if any('qorlia_confirmation_receipts' in values for values in values_list) or 'default_qorlia_confirmation_receipts' in self.env.context:
            raise AccessError('Confirmation receipts can only be recorded by a reviewed action.')
        return super().create(values_list)

    def write(self, values):
        if 'qorlia_confirmation_receipts' in values and self.env.context.get('qorlia_confirmation_receipt_token') is not _RECEIPT_TOKEN:
            raise AccessError('Confirmation receipts can only be recorded by a reviewed action.')
        return super().write(values)

    def _qorlia_confirmation_tables(self):
        tables = set()
        for name in (*GRAPH_MODELS, *CONFIG_MODELS, *FINANCIAL_MODELS):
            model = self.env[name]
            tables.add(model._table)
            tables.update(field.relation for field in model._fields.values()
                if field.type == 'many2many' and field.store and field.relation)
        return sorted(tables)

    def _qorlia_confirmation_stamp(self, tables, semantic=False):
        result = {}
        self.env.flush_all()
        for table in tables:
            # Only server-generated digests leave this helper, never configuration or authentication rows.
            record = sql.SQL("(row_to_json(record)::jsonb - ARRAY['create_date','create_uid','write_date','write_uid'])::text") if semantic else sql.SQL('row_to_json(record)::text')
            self.env.cr.execute(sql.SQL("SELECT encode(sha256(convert_to(COALESCE(string_agg(value, ',' ORDER BY value), ''), 'UTF8')), 'hex') "
                "FROM (SELECT encode(sha256(convert_to({}, 'UTF8')), 'hex') AS value "
                "FROM {} record) fingerprint").format(record, sql.Identifier(table)))
            result[table] = self.env.cr.fetchone()[0]
        return result

    def _qorlia_confirmation_version(self, order_id, graph, stamp):
        return _digest({'order_id': order_id, 'transfer_id': self.id, 'graph': graph,
            'stamp': stamp, 'author': self.env.uid, 'companies': self.env.companies.ids,
            'today': str(fields.Date.context_today(self))})

    def _qorlia_confirmation_access(self):
        self.ensure_one()
        if not self.env.user.has_group('base.group_user'):
            raise AccessError('Stock confirmation requires an internal Billing account.')
        for records in (self, self.move_ids, self.move_line_ids, self.package_level_ids):
            records.check_access_rights('write')
            records.check_access_rule('write')

    @api.model
    def qorlia_confirmation_load(self, order_id, transfer_id):
        self = self.with_context({key: self.env.context[key] for key in ('allowed_company_ids', 'lang', 'tz') if key in self.env.context})
        self.env.cr.flush()
        picking, _order = self._qorlia_reservation_transfer(order_id, transfer_id)
        graph = picking._qorlia_reservation_graph(order_id)
        reason = False
        try:
            picking._qorlia_confirmation_access()
        except AccessError as error:
            reason = str(error)
        if not reason and not picking.show_mark_as_todo:
            reason = 'Mark as Todo is not available in the current native transfer state.'
        self.env.cr.flush()
        graph = picking._qorlia_reservation_graph(order_id)
        stamp = picking._qorlia_confirmation_stamp(picking._qorlia_confirmation_tables())
        return {'order_id': order_id, 'transfer_id': transfer_id, 'graph': graph,
            'version': picking._qorlia_confirmation_version(order_id, graph, stamp),
            'reason': reason, 'write_ready': True}

    def _qorlia_confirmation_capture(self, model_names=GRAPH_MODELS):
        result, visible = {}, {}
        self.env.flush_all()
        for name in model_names:
            model = self.env[name]
            self.env.cr.execute(sql.SQL('SELECT row_to_json(record) FROM {} record ORDER BY id').format(sql.Identifier(model._table)))
            result[name] = {}
            while True:
                batch = self.env.cr.fetchmany(500)
                if not batch:
                    break
                result[name].update({item[0]['id']: item[0] for item in batch})
            visible[name] = set(model.with_context(active_test=False).search([('id', 'in', list(result[name]))]).ids) if model.check_access_rights('read', raise_exception=False) else set()
        links = {}
        for name in model_names:
            model = self.env[name]
            for field_name, field in model._fields.items():
                if field.type == 'many2many' and field.store and field.relation:
                    self.env.cr.execute(sql.SQL('SELECT {}, {} FROM {} ORDER BY {}, {}').format(
                        sql.Identifier(field.column1), sql.Identifier(field.column2), sql.Identifier(field.relation),
                        sql.Identifier(field.column1), sql.Identifier(field.column2)))
                    mapping = {}
                    for source, target in self.env.cr.fetchall():
                        mapping.setdefault(source, []).append(target)
                    links[(name, field_name)] = mapping
        return result, visible, links

    def _qorlia_confirmation_effects(self, before, after, model_names=GRAPH_MODELS,
            private_models=AUDIT_MODELS, private_counts_key='private_audit_counts', assigned_fields=None,
            private_analytic_deletions=False):
        old, old_visible, old_links = before
        new, new_visible, new_links = after
        assigned_fields = assigned_fields or {}
        text_fields = ('origin', 'reference', 'record_name', 'body', 'note', 'subject')
        if assigned_fields:
            text_fields += ('ref', 'move_name', 'name', 'description')
        generated = {name: {identifier: 'new:%s:%s' % (name, index)
            for index, identifier in enumerate(sorted(set(new[name]) - set(old[name])))} for name in model_names}
        generated_names = {row.get('name'): generated[name][identifier]
            for name in model_names for identifier, row in new[name].items()
            if identifier in generated[name] and row.get('name') and (name in ('stock.picking', 'purchase.order')
                or 'name' in assigned_fields.get((name, identifier), set()))}
        result = {'created': {}, 'updated': {}, 'deleted': {}, 'labels': {}, 'schema': {}, private_counts_key: {}}
        private_audit = {}

        def project(name, identifier, rows, links, allowed, private=False):
            model = self.env[name]
            raw = rows[name][identifier]
            if 'company_id' in raw and raw['company_id'] and raw['company_id'] != self.company_id.id:
                raise AccessError('Confirmation changed a document outside this transfer company.')
            values = {}
            for field_name in sorted(allowed):
                field = model._fields[field_name]
                if field_name in METADATA or field_name == 'access_token' or field_name.startswith('qorlia_') or field.type == 'binary':
                    continue
                if field.type == 'many2many' and (name, field_name) in links:
                    value = links[(name, field_name)].get(identifier, [])
                elif field_name in raw:
                    value = raw[field_name]
                else:
                    continue
                if field.type in ('many2one', 'many2many'):
                    def reference(target):
                        if not target:
                            return False
                        key = generated.get(field.comodel_name, {}).get(target)
                        if key:
                            return key
                        if private:
                            return target
                        related = self.env[field.comodel_name].browse(target)
                        if field.comodel_name in rows and target in rows[field.comodel_name]:
                            visible = old_visible[field.comodel_name] if rows is old else new_visible[field.comodel_name]
                            if target not in visible:
                                if (private_analytic_deletions and rows is old and name == 'stock.move'
                                        and field_name == 'analytic_account_line_id' and field.type == 'many2one'
                                        and field.comodel_name == 'account.analytic.line'
                                        and field.comodel_name in private_models
                                        and target not in new[field.comodel_name]
                                        and identifier in new[name] and not new[name][identifier].get(field_name)):
                                    # Bind the hidden relationship, not just the set of deleted private entries.
                                    private_audit.setdefault('__private_analytic_references', []).append({
                                        'model': name, 'record': identifier, 'field': field_name, 'target': target})
                                    return 'private:account.analytic.line'
                                raise AccessError('A confirmation dependency is not readable by this account.')
                            # Deleted graph records still have their original, permission-checked name.
                            label = rows[field.comodel_name][target].get('name')
                            if label is not None:
                                related.check_field_access_rights('read', ['name'])
                            if isinstance(label, dict):
                                label = label.get(self.env.lang) or label.get('en_US') or next(iter(label.values()), False)
                        else:
                            related.check_access_rights('read')
                            related.check_access_rule('read')
                            if not related.exists():
                                raise UserError('A confirmation dependency is no longer available.')
                            label = related.display_name
                        if isinstance(label, str):
                            result['labels']['%s:%s' % (field.comodel_name, target)] = label
                        return target
                    value = [reference(target) for target in value] if field.type == 'many2many' else reference(value)
                # Preserve scheduling dates; native references and creation metadata are assigned at save.
                if (identifier in generated[name] and field_name in ASSIGNED_ON_SAVE.get(name, set())
                        or rows is new and field_name in assigned_fields.get((name, identifier), set())):
                    value = False
                if name in ('mail.message', 'mail.activity') and field_name == 'res_id':
                    target_model = raw.get('model')
                    if not target_model and raw.get('res_model_id'):
                        if private:
                            # Internal normalization only; inaccessible model metadata never leaves private effects.
                            self.env.cr.execute('SELECT model FROM ir_model WHERE id = %s', [raw['res_model_id']])
                            metadata = self.env.cr.fetchone()
                            target_model = metadata[0] if metadata else None
                        else:
                            target_model = self.env['ir.model'].browse(raw['res_model_id']).model
                    value = generated.get(target_model, {}).get(value, value)
                if isinstance(value, str) and field_name in text_fields:
                    for assigned_name, key in generated_names.items():
                        value = value.replace(assigned_name, key)
                    if name in ('mail.message', 'mail.activity') and field_name in ('body', 'note'):
                        for target_model, ids in generated.items():
                            for target, key in ids.items():
                                value = re.sub(r'((?:[?&#]id=|data-oe-id=[\"\']))%s(?=[\"\'&<>\s]|$)' % target,
                                    lambda match: match[1] + key, value)
                values[field_name] = value
            return values

        for name in model_names:
            model = self.env[name]
            fields_allowed = set(model.check_field_access_rights('read', None))
            created, updated, deleted = [], [], []
            all_ids = sorted(set(old[name]) | set(new[name]))
            for identifier in all_ids:
                original, current = old[name].get(identifier), new[name].get(identifier)
                clean = lambda row: {key: value for key, value in row.items() if key not in METADATA}
                link_change = any(old_links.get((name, field_name), {}).get(identifier, []) != new_links.get((name, field_name), {}).get(identifier, [])
                    for field_name, field in model._fields.items() if field.type == 'many2many' and field.store)
                if original is not None and current is not None and clean(original) == clean(current) and not link_change:
                    continue
                hidden = original is not None and identifier not in old_visible[name] or current is not None and identifier not in new_visible[name]
                if not hidden and name in AUDIT_MODELS:
                    try:
                        if original:
                            project(name, identifier, old, old_links, fields_allowed)
                        if current:
                            project(name, identifier, new, new_links, fields_allowed)
                    except AccessError:
                        hidden = True
                if hidden:
                    if name not in private_models:
                        raise AccessError('Confirmation changed a document this account cannot review (%s).' % name)
                    kind = 'created' if original is None else 'deleted' if current is None else 'updated'
                    counts = result[private_counts_key].setdefault(name, {'created': 0, 'updated': 0, 'deleted': 0})
                    counts[kind] += 1
                    private_audit.setdefault(name, []).append({'kind': kind,
                        'key': generated[name].get(identifier, identifier),
                        'before': project(name, identifier, old, old_links, model._fields, private=True) if original else False,
                        'after': project(name, identifier, new, new_links, model._fields, private=True) if current else False})
                    continue
                if original is None:
                    values = project(name, identifier, new, new_links, fields_allowed)
                    created.append({'key': generated[name][identifier], 'values': values,
                        'assigned_on_save': sorted((ASSIGNED_ON_SAVE.get(name, set()) | assigned_fields.get((name, identifier), set())) & set(values))})
                elif current is None:
                    deleted.append({'id': identifier, 'values': project(name, identifier, old, old_links, fields_allowed)})
                else:
                    row = {'id': identifier, 'before': project(name, identifier, old, old_links, fields_allowed),
                        'after': project(name, identifier, new, new_links, fields_allowed)}
                    assigned = assigned_fields.get((name, identifier), set()) & set(row['after'])
                    if assigned:
                        row['assigned_on_save'] = sorted(assigned)
                    updated.append(row)
            if created or updated or deleted:
                result['created'][name], result['updated'][name], result['deleted'][name] = created, updated, deleted
                result['schema'][name] = {field_name: {'label': model._fields[field_name].string,
                    'type': model._fields[field_name].type,
                    'relation': model._fields[field_name].comodel_name if model._fields[field_name].type in ('many2one', 'many2many') else False}
                    for field_name in sorted(fields_allowed) if field_name not in METADATA and field_name != 'access_token' and not field_name.startswith('qorlia_') and model._fields[field_name].type != 'binary'}
        return result, private_audit

    def _qorlia_confirmation_signature(self, version, effects, private_audit, state):
        secret = self.env['ir.config_parameter'].sudo().get_param('database.secret')
        if not isinstance(secret, str) or len(secret) < 16:
            raise UserError('Native signing configuration is missing. Nothing was saved.')
        reviewed = _digest({'version': version, 'effects': effects, 'private_audit': private_audit, 'state': state, 'author': self.env.uid})
        return hmac.new(secret.encode(), reviewed.encode(), hashlib.sha256).hexdigest()

    def _qorlia_confirmation_native(self):
        return self._qorlia_stock_preparation_native(self.action_confirm, FINANCIAL_MODELS, CONFIG_MODELS)[:4]

    def _qorlia_stock_preparation_native(self, action, financial_models, config_models, *, preserve_state=False):
        original_state = self.state
        # Register the caller's tracking before sudo-computed state can choose a different audit author.
        self._track_prepare(self._fields)
        def guard_tables(names):
            models = [self.env[name] for name in names]
            return sorted({model._table for model in models} | {field.relation
                for model in models for field in model._fields.values()
                if field.type == 'many2many' and field.store and field.relation})
        finance_tables = guard_tables(financial_models)
        config_tables = guard_tables(name for name in config_models if name not in GRAPH_MODELS)
        money_before = self._qorlia_confirmation_stamp(finance_tables, semantic=True)
        config_before = self._qorlia_confirmation_stamp(config_tables, semantic=True)
        before = self._qorlia_confirmation_capture()
        value = action()
        # Cursor flush chooses an arbitrary live environment; drain computed tracking under the caller first.
        self.env.flush_all()
        self.env.cr.flush()
        after = self._qorlia_confirmation_capture()
        money_after = self._qorlia_confirmation_stamp(finance_tables, semantic=True)
        config_after = self._qorlia_confirmation_stamp(config_tables, semantic=True)
        if preserve_state and self.state != original_state:
            raise UserError('Native form onchange changed the stored transfer state. Nothing was saved.')
        if money_after != money_before or not preserve_state and self.state in ('done', 'cancel'):
            raise UserError('Stock preparation changed financial records or completed stock. Nothing was saved.')
        if config_after != config_before:
            raise UserError('Stock preparation changed unreviewed native configuration. Nothing was saved.')
        physical = lambda snapshot: {identifier: (row['product_id'], row['location_id'], row['lot_id'], row['package_id'], row['owner_id'], row['quantity'])
            for identifier, row in snapshot[0]['stock.quant'].items() if row['quantity']}
        if physical(before) != physical(after):
            raise UserError('Stock preparation changed physical stock. Nothing was saved.')
        effects, private_audit = self._qorlia_confirmation_effects(before, after)
        references = {('new:%s:%s' % (name, index)): {'model': name, 'id': identifier}
            for name in GRAPH_MODELS if name not in AUDIT_MODELS
            for index, identifier in enumerate(sorted(set(after[0][name]) - set(before[0][name])))}
        return effects, private_audit, self.state, references, value

    @api.model
    def qorlia_confirmation_preview(self, order_id, transfer_id, version):
        self = self.with_context({key: self.env.context[key] for key in ('allowed_company_ids', 'lang', 'tz') if key in self.env.context})
        if not isinstance(version, str) or len(version) != 64 or any(char not in '0123456789abcdef' for char in version):
            raise ValidationError('Reload and review the current native transfer.')
        picking, _order = self._qorlia_reservation_transfer(order_id, transfer_id, lock=True)
        picking._qorlia_confirmation_access()
        current = self.qorlia_confirmation_load(order_id, transfer_id)
        if current['version'] != version:
            raise UserError('The transfer, inventory or native configuration changed. Reload it.')
        if current['reason']:
            raise UserError(current['reason'])
        effects, private_audit, state = picking._qorlia_confirmation_preview_effects()
        # Native signing secret prevents the public review digest becoming a dictionary oracle for hidden audit data.
        return {'order_id': order_id, 'transfer_id': transfer_id, 'version': version,
            'state_after': state, 'effects': effects, 'write_ready': True,
            'review_version': picking._qorlia_confirmation_signature(version, effects, private_audit, state)}

    def _qorlia_confirmation_preview_effects(self):
        return self._qorlia_stock_preparation_preview(self._qorlia_confirmation_native, self._qorlia_confirmation_tables())[:3]

    def _qorlia_stock_preparation_preview(self, execute, tables):
        self.ensure_one()
        cr = self.env.cr
        cr.flush()
        stamp = self._qorlia_confirmation_stamp(tables)
        hooks = {name: getattr(cr, name) for name in ('precommit', 'postcommit', 'prerollback', 'postrollback')}
        try:
            for name in hooks:
                setattr(cr, name, tools.Callbacks())
            with closing(cr.savepoint()):
                result = execute()
        finally:
            for name, callbacks in hooks.items():
                setattr(cr, name, callbacks)
            self.env.invalidate_all()
        if self._qorlia_confirmation_stamp(tables) != stamp:
            raise UserError('Native state changed during stock preview. Reload and review it again.')
        return result

    def _qorlia_confirmation_request(self, payload, allow_inventory=False):
        if not isinstance(payload, dict) or set(payload) != {'order_id', 'transfer_id', 'version', 'review_version', 'request_key'}:
            raise ValidationError('Use the exact reviewed confirmation request.')
        try:
            if ((not (allow_inventory and payload['order_id'] is False)
                    and (type(payload['order_id']) is not int or payload['order_id'] <= 0))
                    or type(payload['transfer_id']) is not int or payload['transfer_id'] <= 0
                    or any(not isinstance(payload[name], str) or len(payload[name]) != 64
                        or any(char not in '0123456789abcdef' for char in payload[name]) for name in ('version', 'review_version'))
                    or str(uuid.UUID(payload['request_key'])) != payload['request_key']):
                raise ValueError()
        except (ValueError, TypeError, AttributeError):
            raise ValidationError('Use valid identifiers and the exact confirmation request key.')
        return dict(payload), _digest({'request': payload, 'author': self.env.uid, 'companies': self.env.companies.ids})

    def _qorlia_confirmation_receipt(self, request, digest):
        receipt = (self.qorlia_confirmation_receipts or {}).get(request['request_key'])
        if receipt and (receipt['hash'] != digest or receipt['author'] != self.env.uid):
            raise ValidationError('This identifier belongs to another confirmation request.')
        return receipt

    @api.model
    def qorlia_confirmation_status(self, payload):
        self = self.with_context({key: self.env.context[key] for key in ('allowed_company_ids', 'lang', 'tz') if key in self.env.context})
        request, digest = self._qorlia_confirmation_request(payload)
        picking, _order = self._qorlia_reservation_transfer(request['order_id'], request['transfer_id'])
        receipt = picking._qorlia_confirmation_receipt(request, digest)
        references = picking._qorlia_confirmation_reference_labels(receipt)
        return {'accepted': bool(receipt), 'request_key': request['request_key'],
            'state_after': receipt['state'] if receipt else False, 'references': references,
            'current': self.qorlia_confirmation_load(request['order_id'], request['transfer_id'])}

    def _qorlia_confirmation_reference_labels(self, receipt):
        references = {}
        for key, item in (receipt['references'].items() if receipt else []):
            record = self.env[item['model']].browse(item['id']).exists()
            available = False
            if record and record.check_access_rights('read', raise_exception=False):
                try:
                    record.check_access_rule('read')
                    available = True
                except AccessError:
                    pass
            references[key] = {'model': item['model'], 'id': item['id'] if available else False,
                'name': record.display_name if available else False, 'available': available}
        return references

    @api.model
    def qorlia_confirmation_save(self, payload):
        self = self.with_context({key: self.env.context[key] for key in ('allowed_company_ids', 'lang', 'tz') if key in self.env.context})
        request, digest = self._qorlia_confirmation_request(payload)
        picking, _order = self._qorlia_reservation_transfer(request['order_id'], request['transfer_id'])
        if picking._qorlia_confirmation_receipt(request, digest):
            return self.qorlia_confirmation_status(request)
        self.env.cr.flush()
        # shortcut: coarse deterministic locks cover native procurement phantoms; refine before concurrent hospital-scale fulfillment.
        for table in picking._qorlia_confirmation_tables():
            self.env.cr.execute(sql.SQL('LOCK TABLE {} IN SHARE ROW EXCLUSIVE MODE').format(sql.Identifier(table)))
        self.env.invalidate_all()
        picking, _order = self._qorlia_reservation_transfer(request['order_id'], request['transfer_id'])
        if picking._qorlia_confirmation_receipt(request, digest):
            return self.qorlia_confirmation_status(request)
        review = self.qorlia_confirmation_preview(request['order_id'], request['transfer_id'], request['version'])
        if not hmac.compare_digest(review['review_version'], request['review_version']):
            raise UserError('Native confirmation effects changed. Review them again before saving.')
        cr = self.env.cr
        hooks = {name: (getattr(cr, name), list(getattr(cr, name)._funcs), copy.deepcopy(getattr(cr, name).data))
            for name in ('precommit', 'postcommit', 'prerollback', 'postrollback')}
        try:
            with cr.savepoint():
                effects, private_audit, state, references = picking._qorlia_confirmation_native()
                actual = picking._qorlia_confirmation_signature(request['version'], effects, private_audit, state)
                if not hmac.compare_digest(actual, request['review_version']):
                    raise UserError('Native confirmation changed unreviewed effects. Nothing was saved.')
                receipts = dict(picking.qorlia_confirmation_receipts or {})
                receipts[request['request_key']] = {'hash': digest, 'author': self.env.uid, 'state': state, 'references': references}
                picking.with_context(qorlia_confirmation_receipt_token=_RECEIPT_TOKEN).write({'qorlia_confirmation_receipts': receipts})
                cr.flush()
                self.env.invalidate_all()
                response = self.qorlia_confirmation_status(request)
            return response
        except Exception:
            for name, (callbacks, functions, data) in hooks.items():
                setattr(cr, name, callbacks)
                callbacks.clear()
                for function in functions:
                    callbacks.add(function)
                callbacks.data.update(data)
            raise
