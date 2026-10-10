# SPDX-License-Identifier: LGPL-3.0-or-later
# Copyright 2026 Qorlia contributors.
import copy
import uuid

from odoo import api, fields, models
from odoo.exceptions import AccessError, UserError, ValidationError

from .invoice_draft import _digest


_RECEIPT_TOKEN = object()


SETTINGS = {
    'res.company': ('currency_id', 'period_lock_date', 'fiscalyear_lock_date', 'tax_lock_date',
        'tax_calculation_rounding_method', 'tax_exigibility', 'tax_cash_basis_journal_id',
        'currency_exchange_journal_id', 'income_currency_exchange_account_id', 'expense_currency_exchange_account_id'),
    'account.journal': ('company_id', 'type', 'currency_id', 'default_account_id', 'suspense_account_id',
        'restrict_mode_hash_table', 'profit_account_id', 'loss_account_id'),
    'account.account': ('code', 'company_id', 'account_type', 'currency_id', 'deprecated', 'is_off_balance', 'reconcile', 'tax_ids'),
    'account.tax': ('amount', 'amount_type', 'price_include', 'include_base_amount', 'is_base_affected',
        'sequence', 'children_tax_ids', 'company_id', 'country_id', 'type_tax_use', 'tax_exigibility',
        'cash_basis_transition_account_id', 'invoice_repartition_line_ids', 'refund_repartition_line_ids'),
    'account.tax.repartition.line': ('factor_percent', 'account_id', 'tag_ids', 'repartition_type'),
    'account.reconcile.model': ('active', 'company_id', 'rule_type', 'line_ids', 'match_journal_ids',
        'decimal_separator', 'match_nature', 'match_amount', 'match_amount_min', 'match_amount_max',
        'match_label', 'match_label_param', 'match_note', 'match_note_param', 'match_transaction_type',
        'match_transaction_type_param', 'match_partner', 'match_partner_ids', 'match_partner_category_ids'),
    'account.reconcile.model.line': ('model_id', 'sequence', 'account_id', 'label', 'amount_type',
        'amount_string', 'amount', 'force_tax_included', 'tax_ids', 'analytic_distribution'),
    'res.partner': ('company_id', 'property_account_position_id', 'category_id', 'vat', 'country_id', 'state_id', 'zip'),
    'account.fiscal.position': ('company_id', 'tax_ids', 'account_ids', 'active', 'auto_apply', 'sequence',
        'vat_required', 'country_id', 'country_group_id', 'state_ids', 'zip_from', 'zip_to'),
    'res.country.group': ('country_ids',),
    'account.fiscal.position.tax': ('position_id', 'tax_src_id', 'tax_dest_id'),
    'account.fiscal.position.account': ('position_id', 'account_src_id', 'account_dest_id'),
    'res.currency': ('rounding', 'active'),
    'res.currency.rate': ('currency_id', 'company_id', 'name', 'rate'),
    'account.analytic.plan': ('parent_id', 'company_id', 'default_applicability', 'applicability_ids'),
    'account.analytic.applicability': ('analytic_plan_id', 'business_domain', 'applicability', 'account_prefix', 'product_categ_id'),
    'account.analytic.account': ('plan_id', 'company_id'),
}


def _version(value):
    return isinstance(value, str) and len(value) == 64 and all(char in '0123456789abcdef' for char in value)


class BankMatchingAPI(models.Model):
    _inherit = 'account.bank.statement.line'

    qorlia_bank_match_receipts = fields.Json(copy=False, readonly=True)

    @api.model_create_multi
    def create(self, values_list):
        if (any('qorlia_bank_match_receipts' in values for values in values_list)
                or 'default_qorlia_bank_match_receipts' in self.env.context):
            raise AccessError('Bank save receipts can only be recorded by a reviewed save.')
        return super().create(values_list)

    def write(self, values):
        if ('qorlia_bank_match_receipts' in values
                and self.env.context.get('qorlia_bank_receipt_token') is not _RECEIPT_TOKEN):
            raise AccessError('Bank save receipts can only be recorded by a reviewed save.')
        return super().write(values)

    def _qorlia_bank_api_entry(self, identifier, lock=False):
        entry = self._qorlia_bank_origin(identifier)
        entry = entry.with_company(entry.company_id)
        if lock:
            # Serialize bank requests per company before locking their potentially shared source graph.
            self.env.cr.execute('SELECT id FROM res_company WHERE id = %s FOR UPDATE', [entry.company_id.id])
            self.env.cr.execute('SELECT id FROM account_bank_statement_line WHERE id = %s FOR UPDATE', [entry.id])
            self.env.invalidate_all()
            entry._qorlia_bank_access()
        return entry

    def _qorlia_bank_configuration(self, graph, model, lock=False):
        self.ensure_one()
        records = {}

        def add(items):
            if items:
                records[items._name] = records.get(items._name, self.env[items._name]) | items

        def complete(name, table, column, identifiers):
            self.env.cr.execute('SELECT id FROM %s WHERE %s IN %%s ORDER BY id' % (table, column),
                [tuple(identifiers) or (0,)])
            result = self.env[name].browse([row[0] for row in self.env.cr.fetchall()])
            result.check_access_rights('read')
            result.check_access_rule('read')
            add(result)
            return result

        add(self.company_id)
        add(model)
        rules = complete('account.reconcile.model.line', 'account_reconcile_model_line', 'model_id', model.ids)
        add(graph['account.move'].journal_id | self.company_id.currency_exchange_journal_id
            | self.company_id.tax_cash_basis_journal_id | model.match_journal_ids)
        add(graph['account.move.line'].partner_id | self.partner_id)
        partners = records.get('res.partner', self.env['res.partner'])
        add(partners.property_account_position_id)
        # Automatic fiscal positions can change fee taxes even without an explicit partner property.
        self.env.cr.execute('SELECT id FROM account_fiscal_position WHERE auto_apply '
            'AND (company_id IS NULL OR company_id = %s) ORDER BY id', [self.company_id.id])
        add(self.env['account.fiscal.position'].browse([row[0] for row in self.env.cr.fetchall()]))
        positions = records.get('account.fiscal.position', self.env['account.fiscal.position'])
        add(positions.country_group_id)
        mappings = complete('account.fiscal.position.tax', 'account_fiscal_position_tax', 'position_id', positions.ids)
        account_mappings = complete('account.fiscal.position.account', 'account_fiscal_position_account', 'position_id', positions.ids)
        taxes = (graph['account.move.line'].tax_ids | graph['account.move.line'].tax_line_id
            | graph['account.move.line'].group_tax_id | rules.tax_ids | mappings.tax_src_id | mappings.tax_dest_id)
        while taxes:
            self.env.cr.execute('SELECT child_tax FROM account_tax_filiation_rel WHERE parent_tax IN %s',
                [tuple(taxes.ids)])
            children = self.env['account.tax'].browse([row[0] for row in self.env.cr.fetchall()]) - taxes
            if not children:
                break
            taxes |= children
        add(taxes)
        repartitions = complete('account.tax.repartition.line', 'account_tax_repartition_line', 'invoice_tax_id', taxes.ids)
        repartitions |= complete('account.tax.repartition.line', 'account_tax_repartition_line', 'refund_tax_id', taxes.ids)
        journals = records.get('account.journal', self.env['account.journal'])
        add(graph['account.move.line'].account_id | rules.account_id | repartitions.account_id
            | account_mappings.account_src_id | account_mappings.account_dest_id
            | journals.default_account_id | journals.suspense_account_id | journals.profit_account_id | journals.loss_account_id
            | taxes.cash_basis_transition_account_id | self.company_id.income_currency_exchange_account_id
            | self.company_id.expense_currency_exchange_account_id)
        add(graph['account.move.line'].currency_id | journals.currency_id | self.company_currency_id
            | records['account.account'].currency_id)
        self.env.cr.execute('SELECT id FROM res_currency_rate WHERE currency_id IN %s '
            'AND (company_id IS NULL OR company_id = %s) ORDER BY id',
            [tuple(records['res.currency'].ids), self.company_id.id])
        add(self.env['res.currency.rate'].browse([row[0] for row in self.env.cr.fetchall()]))
        for name, table in (('account.analytic.plan', 'account_analytic_plan'),
                ('account.analytic.account', 'account_analytic_account')):
            self.env.cr.execute('SELECT id FROM %s WHERE company_id IS NULL OR company_id = %%s ORDER BY id' % table,
                [self.company_id.id])
            add(self.env[name].browse([row[0] for row in self.env.cr.fetchall()]))
        plans = records.get('account.analytic.plan', self.env['account.analytic.plan'])
        complete('account.analytic.applicability', 'account_analytic_applicability', 'analytic_plan_id', plans.ids)
        result = {}
        for name in sorted(records):
            items = records[name].sorted('id')
            items.check_access_rights('read')
            items.check_access_rule('read')
            if lock:
                self.env.cr.execute('SELECT id FROM %s WHERE id IN %%s ORDER BY id FOR UPDATE' % items._table,
                    [tuple(items.ids)])
                items.invalidate_recordset()
            for field_name in SETTINGS[name]:
                if items._fields[field_name].type in ('many2one', 'one2many', 'many2many'):
                    related = items.mapped(field_name)
                    related.check_access_rights('read')
                    related.check_access_rule('read')
            result[name] = items.read(['write_date', *SETTINGS[name]])
        return result

    def _qorlia_bank_api_version(self, graph, configuration):
        return _digest({'source': self._qorlia_bank_version(self._qorlia_bank_ledger()),
            'graph': self._qorlia_bank_match_snapshot(graph), 'configuration': configuration,
            'author': self.env.uid, 'companies': self.env.companies.ids})

    def _qorlia_bank_graph_labels(self, snapshots):
        records = {}
        for snapshot in snapshots:
            for name, data in snapshot.items():
                for row in data['rows']:
                    if type(row['id']) is int:
                        records.setdefault(name, set()).add(row['id'])
                    for field_name, value in row['values'].items():
                        field = self.env[name]._fields[field_name]
                        if field.type in ('many2one', 'one2many', 'many2many') and value:
                            identifiers = [value] if field.type == 'many2one' else value
                            records.setdefault(field.comodel_name, set()).update(
                                identifier for identifier in identifiers if type(identifier) is int)
        labels = {}
        for name, identifiers in records.items():
            items = self.env[name].browse(sorted(identifiers)).exists()
            items.check_access_rights('read')
            items.check_access_rule('read')
            labels.update({'%s:%s' % (name, item.id): item.display_name for item in items})
        return labels

    @api.model
    def qorlia_bank_match_load(self, statement_line_id):
        entry = self._qorlia_bank_api_entry(statement_line_id)
        graph = entry._qorlia_bank_match_graph()
        snapshot = entry._qorlia_bank_match_snapshot(graph)
        reason = False
        try:
            entry._qorlia_bank_match_access()
        except (AccessError, UserError) as error:
            reason = str(error)
        # Readers need their actual ledger, not unrelated configuration required only to perform a write.
        configuration = entry._qorlia_bank_configuration(graph, entry.env['account.reconcile.model']) if not reason else {}
        liquidity, suspense, other = entry._seek_for_lines()
        return {'statement_line_id': entry.id, 'entry': entry._qorlia_bank_history_entry(),
            'version': entry._qorlia_bank_api_version(graph, configuration), 'graph': snapshot,
            'labels': entry._qorlia_bank_graph_labels([snapshot]),
            'company_currency': entry.company_currency_id.name_get()[0],
            'transaction_currency': entry._get_accounting_amounts_and_currencies()[1].name_get()[0],
            'reason': reason, 'can_match': not reason and len(liquidity) == 1 and len(suspense) == 1,
            'can_undo': not reason and bool(other or entry.payment_ids)}

    @api.model
    def qorlia_bank_fee_choices(self, statement_line_id, search='', offset=0):
        self._qorlia_bank_page(search, offset)
        entry = self._qorlia_bank_api_entry(statement_line_id)
        entry._qorlia_bank_match_access()
        rules = entry.env['account.reconcile.model'].search([('active', '=', True), ('company_id', '=', entry.company_id.id),
            ('rule_type', 'in', ['writeoff_button', 'writeoff_suggestion']),
            ('name', 'ilike', search.strip()), '|', ('match_journal_ids', '=', False),
            ('match_journal_ids', 'in', entry.journal_id.ids)], order='sequence,id').filtered(
                lambda rule: rule.rule_type == 'writeoff_button' or rule._is_applicable_for(entry, entry.partner_id))
        rules = rules[offset:offset + 26]
        return {'rows': rules[:25].read(['name', 'rule_type']), 'offset': offset, 'has_more': len(rules) > 25}

    def _qorlia_bank_analytic_scope(self, statement_line_id, source_line_id, account_ids):
        entry = self._qorlia_bank_api_entry(statement_line_id)
        if type(source_line_id) is not int or source_line_id <= 0:
            raise ValidationError('Select a saved bank matching item.')
        source = entry.env['account.move.line'].browse(source_line_id).exists()
        source.check_access_rights('read')
        source.check_access_rule('read')
        if not source:
            raise UserError('A matching item is no longer available.')
        entry._qorlia_bank_match_inputs([{'line_id': source.id, 'amount': abs(source.amount_residual_currency)}])
        metadata = entry.move_id._qorlia_journal_analytics(entry.move_id, source, source.account_id.id, account_ids)
        return entry, {key: value for key, value in metadata.items() if key not in ('invoice_id', 'line_id')}

    @api.model
    def qorlia_bank_match_analytics(self, statement_line_id, source_line_id, account_ids):
        _entry, metadata = self._qorlia_bank_analytic_scope(statement_line_id, source_line_id, account_ids)
        return {**metadata, 'statement_line_id': statement_line_id, 'source_line_id': source_line_id}

    @api.model
    def qorlia_bank_analytic_choices(self, statement_line_id, source_line_id, plan_id, account_ids, search='', offset=0):
        self._qorlia_bank_page(search, offset)
        entry, metadata = self._qorlia_bank_analytic_scope(statement_line_id, source_line_id, account_ids)
        if type(plan_id) is not int or plan_id not in [plan['id'] for plan in metadata['plans']]:
            raise ValidationError('Select a native analytic plan for this bank matching item.')
        accounts = entry.env['account.analytic.account'].search([
            ('company_id', 'in', [False, entry.company_id.id]), ('root_plan_id', '=', plan_id),
            ('name', 'ilike', search.strip())], offset=offset, limit=26, order='name,id')
        return {'rows': accounts[:25].name_get(), 'offset': offset, 'has_more': len(accounts) > 25}

    def _qorlia_bank_payload(self, payload):
        if (not isinstance(payload, dict) or set(payload) !=
                {'statement_line_id', 'version', 'action', 'allocations', 'fee_model_id'}
                or type(payload['statement_line_id']) is not int or payload['statement_line_id'] <= 0
                or not _version(payload['version']) or payload['action'] not in ('match', 'undo')
                or not isinstance(payload['allocations'], list) or len(payload['allocations']) > 1000
                or payload['fee_model_id'] is not False and
                    (type(payload['fee_model_id']) is not int or payload['fee_model_id'] <= 0)
                or payload['action'] == 'undo' and (payload['allocations'] or payload['fee_model_id'])):
            raise ValidationError('Reload a complete bank matching or undo request.')

    def _qorlia_bank_prepare(self, payload):
        self._qorlia_bank_payload(payload)
        entry = self._qorlia_bank_api_entry(payload['statement_line_id'], lock=True)
        entry._qorlia_bank_match_access()
        sources = entry.env['account.move.line']
        model = entry.env['account.reconcile.model']
        if payload['action'] == 'match':
            selected, model = entry._qorlia_bank_match_inputs(payload['allocations'], payload['fee_model_id'])
            sources = sources.browse([line.id for line, _amount in selected])
        graph = entry._qorlia_bank_match_graph(sources)
        for attempt in range(3):
            identifiers = {name: set(items.ids) for name, items in graph.items()}
            for name in sorted(graph):
                items = graph[name]
                if items:
                    self.env.cr.execute('SELECT id FROM %s WHERE id IN %%s ORDER BY id FOR UPDATE' % items._table,
                        [tuple(sorted(items.ids))])
            self.env.invalidate_all()
            graph = entry._qorlia_bank_match_graph(sources)
            if identifiers == {name: set(items.ids) for name, items in graph.items()}:
                break
        else:
            raise UserError('Connected accounting changed while locking. Reload the bank entry.')
        # Load version describes the bank's existing graph, while the review also binds chosen sources/rules.
        configuration = entry._qorlia_bank_configuration(graph, model, lock=True)
        loaded = entry.qorlia_bank_match_load(entry.id)
        if loaded['version'] != payload['version']:
            raise UserError('The statement or accounting configuration changed. Reload before reviewing.')
        result = entry._qorlia_bank_match_simulate(payload['allocations'], payload['fee_model_id'],
            undo=payload['action'] == 'undo')
        result['labels'] = entry._qorlia_bank_graph_labels([result['before'], result['after']])
        result['review_version'] = _digest({'payload': payload, 'before': result['before'],
            'after': result['after'], 'configuration': configuration, 'author': entry.env.uid,
            'companies': entry.env.companies.ids})
        return entry, result, graph

    @api.model
    def qorlia_bank_match_preview(self, payload):
        return self._qorlia_bank_prepare(payload)[1]

    def _qorlia_bank_request(self, payload, review_version, request_key):
        self._qorlia_bank_payload(payload)
        try:
            if not _version(review_version) or str(uuid.UUID(request_key)) != request_key:
                raise ValueError()
        except (TypeError, ValueError, AttributeError):
            raise ValidationError('Use a valid reviewed bank save identifier.')
        return _digest({'payload': payload, 'review_version': review_version, 'author': self.env.uid})

    def _qorlia_bank_receipt(self, key, digest):
        receipt = (self.qorlia_bank_match_receipts or {}).get(key)
        if receipt and (receipt['hash'] != digest or receipt['author'] != self.env.uid):
            raise ValidationError('This identifier belongs to another bank matching request.')
        return receipt

    @api.model
    def qorlia_bank_match_status(self, payload, review_version, request_key):
        digest = self._qorlia_bank_request(payload, review_version, request_key)
        entry = self._qorlia_bank_api_entry(payload['statement_line_id'])
        if not entry._qorlia_bank_receipt(request_key, digest):
            return False
        return {**entry.qorlia_bank_match_load(entry.id), 'request_key': request_key, 'accepted': True}

    @api.model
    def qorlia_bank_match_save(self, payload, review_version, request_key):
        digest = self._qorlia_bank_request(payload, review_version, request_key)
        entry = self._qorlia_bank_api_entry(payload['statement_line_id'], lock=True)
        if entry._qorlia_bank_receipt(request_key, digest):
            return entry.qorlia_bank_match_status(payload, review_version, request_key)
        entry, review, graph = entry._qorlia_bank_prepare(payload)
        if review['review_version'] != review_version:
            raise UserError('Review the complete native bank effects again before saving.')
        origin = {name: set(items.ids) for name, items in graph.items()}
        sources = entry.env['account.move.line'].browse([item['line_id'] for item in payload['allocations']])
        # SQL savepoints do not restore callback queues if a caller catches a failed financial action.
        hooks = {name: (getattr(self.env.cr, name), list(getattr(self.env.cr, name)._funcs),
            copy.deepcopy(getattr(self.env.cr, name).data)) for name in ('postcommit', 'prerollback', 'postrollback')}
        try:
            with self.env.cr.savepoint():
                if payload['action'] == 'undo':
                    entry._qorlia_bank_match_undo()
                else:
                    entry._qorlia_bank_match_apply(payload['allocations'], payload['fee_model_id'])
                self.env.cr.flush()
                actual = entry._qorlia_bank_match_snapshot(entry._qorlia_bank_match_graph(sources.exists(), origin), origin)
                if actual != review['after']:
                    raise UserError('Native Billing changed unreviewed bank effects. Nothing was saved.')
                receipts = dict(entry.qorlia_bank_match_receipts or {})
                receipts[request_key] = {'hash': digest, 'author': entry.env.uid}
                entry.with_context(qorlia_bank_receipt_token=_RECEIPT_TOKEN).write({'qorlia_bank_match_receipts': receipts})
                self.env.cr.flush()
                if entry._qorlia_bank_match_snapshot(entry._qorlia_bank_match_graph(sources.exists(), origin), origin) != actual:
                    raise UserError('Recording the bank receipt changed accounting. Nothing was saved.')
                response = entry.qorlia_bank_match_status(payload, review_version, request_key)
            return response
        except Exception:
            for name, (callbacks, functions, data) in hooks.items():
                setattr(self.env.cr, name, callbacks)
                callbacks.clear()
                for function in functions:
                    callbacks.add(function)
                callbacks.data.update(data)
            raise
