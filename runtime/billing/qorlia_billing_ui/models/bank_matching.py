# SPDX-License-Identifier: LGPL-3.0-or-later
# Copyright 2026 Qorlia contributors.
from contextlib import closing
import math

from odoo import Command, models, tools
from odoo.exceptions import AccessError, UserError, ValidationError
from odoo.tools import float_compare


GRAPH_FIELDS = {
    'account.bank.statement.line': ('move_id', 'journal_id', 'date', 'payment_ref', 'partner_id',
        'amount', 'currency_id', 'amount_currency', 'foreign_currency_id', 'amount_residual',
        'is_reconciled', 'to_check', 'payment_ids', 'statement_id', 'transaction_type'),
    'account.move': ('name', 'state', 'move_type', 'date', 'company_id', 'journal_id', 'partner_id',
        'currency_id', 'amount_total', 'amount_residual', 'payment_state', 'line_ids',
        'reversed_entry_id', 'tax_cash_basis_rec_id', 'tax_cash_basis_origin_move_id', 'narration'),
    'account.move.line': ('name', 'move_id', 'account_id', 'partner_id', 'date', 'date_maturity',
        'debit', 'credit', 'balance', 'currency_id', 'amount_currency', 'amount_residual',
        'amount_residual_currency', 'reconciled', 'matched_debit_ids', 'matched_credit_ids',
        'full_reconcile_id', 'tax_ids', 'tax_tag_ids', 'tax_repartition_line_id', 'tax_line_id',
        'group_tax_id', 'tax_base_amount', 'tax_tag_invert', 'display_type', 'reconcile_model_id',
        'analytic_distribution', 'payment_id', 'statement_line_id'),
    'account.partial.reconcile': ('debit_move_id', 'credit_move_id', 'amount', 'debit_amount_currency',
        'credit_amount_currency', 'full_reconcile_id', 'exchange_move_id', 'max_date'),
    'account.full.reconcile': ('name', 'partial_reconcile_ids', 'reconciled_line_ids', 'exchange_move_id'),
    'account.payment': ('move_id', 'state', 'amount', 'currency_id', 'payment_type', 'partner_type',
        'partner_id', 'journal_id', 'is_matched', 'is_reconciled'),
    'account.analytic.line': ('move_line_id', 'account_id', 'date', 'amount', 'unit_amount', 'company_id'),
}


class BankMatching(models.Model):
    _inherit = 'account.bank.statement.line'

    def _qorlia_bank_match_access(self):
        self.ensure_one()
        self._qorlia_bank_access()
        if (self.env.context.get('check_move_validity') is False or any(self.env.context.get(name) for name in
                ('force_delete', 'skip_account_move_synchronization', 'skip_invoice_sync',
                 'no_exchange_difference', 'no_exchange_difference_no_recursive', 'no_cash_basis'))):
            raise ValidationError('Native bank accounting validation cannot be disabled.')
        if not self.env.user.has_group('account.group_account_user'):
            raise AccessError('Bank matching requires native accounting permissions.')
        for records in (self, self.move_id, self._qorlia_bank_ledger()):
            records.check_access_rights('write')
            records.check_access_rule('write')
        for model in ('account.move.line', 'account.partial.reconcile', 'account.full.reconcile'):
            self.env[model].check_access_rights('create')
        if self.move_id.state != 'posted':
            raise UserError('Match only a posted bank or cash entry.')
        if self.move_id.inalterable_hash:
            raise UserError('Hash-protected bank entries cannot be rewritten by matching or undo.')
        if self.move_id._get_unbalanced_moves({'records': self.move_id}):
            raise UserError('The bank journal is unbalanced. Ask your Billing administrator to review it.')

    def _qorlia_bank_match_inputs(self, allocations, fee_model_id=False):
        self._qorlia_bank_match_access()
        if not isinstance(allocations, list) or len(allocations) > 1000 or not allocations and not fee_model_id:
            raise ValidationError('Select matching items or a native fee rule before reviewing.')
        prepared, seen = [], set()
        for allocation in allocations:
            if (not isinstance(allocation, dict) or set(allocation) != {'line_id', 'amount'}
                    or type(allocation['line_id']) is not int or allocation['line_id'] <= 0
                    or allocation['line_id'] in seen or type(allocation['amount']) not in (int, float)
                    or not math.isfinite(allocation['amount']) or allocation['amount'] <= 0):
                raise ValidationError('Select distinct saved items and finite positive source-currency amounts.')
            source = self.env['account.move.line'].browse(allocation['line_id']).exists()
            if not source:
                raise UserError('A matching item is no longer available.')
            for records in (source, source.move_id):
                records.check_access_rights('write')
                records.check_access_rule('write')
            for records in (source.account_id, source.partner_id, source.currency_id):
                records.check_access_rights('read')
                records.check_access_rule('read')
            domain = self._get_default_amls_matching_domain() + [('id', '=', source.id),
                ('move_id', '!=', self.move_id.id)]
            if (not self.env['account.move.line'].search_count(domain) or source.account_id.deprecated
                    or source.account_id.is_off_balance):
                raise UserError('A selected item is no longer eligible for native bank matching.')
            if source.move_id._get_unbalanced_moves({'records': source.move_id}):
                raise UserError('A matching item belongs to an unbalanced journal.')
            amount, currency = allocation['amount'], source.currency_id
            if (currency.is_zero(source.amount_residual_currency)
                    or currency.is_zero(amount)
                    or float_compare(amount, abs(source.amount_residual_currency), precision_rounding=currency.rounding) > 0
                    or not math.isclose(amount, currency.round(amount), rel_tol=0,
                        abs_tol=currency.rounding * 1e-9)):
                raise ValidationError('Use an available rounded amount in the matching item currency.')
            seen.add(source.id)
            prepared.append((source, amount))
        if fee_model_id is not False and (type(fee_model_id) is not int or fee_model_id <= 0):
            raise ValidationError('Select a saved native reconciliation rule.')
        model = self.env['account.reconcile.model'].browse(fee_model_id).exists() if fee_model_id else self.env['account.reconcile.model']
        if fee_model_id:
            for records in (model, model.line_ids, model.line_ids.account_id, model.line_ids.tax_ids):
                records.check_access_rights('read')
                records.check_access_rule('read')
            if (not model or not model.active or model.company_id != self.company_id
                    or model.rule_type not in ('writeoff_button', 'writeoff_suggestion')
                    or model.match_journal_ids and self.journal_id not in model.match_journal_ids):
                raise ValidationError('Select an active native fee rule for this company and journal.')
            if model.rule_type == 'writeoff_suggestion' and not model._is_applicable_for(self, self.partner_id):
                raise ValidationError('This native fee suggestion does not apply to the bank entry.')
        return prepared, model

    def _qorlia_bank_fee_rows(self, model, remaining_amount):
        transaction_currency = self._get_accounting_amounts_and_currencies()[1]
        rows = []
        for rule in model.line_ids:
            start = len(rows)
            row = rule._apply_in_bank_widget(remaining_amount, self.partner_id, self)
            row.pop('journal_id', None)
            currency = self.env['res.currency'].browse(row['currency_id'])
            if currency.is_zero(row['amount_currency']):
                continue
            amounts = self._prepare_counterpart_amounts_using_st_line_rate(currency,
                currency._convert(row['amount_currency'], self.company_currency_id, self.company_id, self.date),
                row['amount_currency'])
            row.update(amounts, currency_id=transaction_currency.id)
            virtual = self.env['account.move.line'].new({'move_id': self.move_id.id, **row})
            self.env['sale.order']._qorlia_values(virtual,
                {'analytic_distribution': virtual.analytic_distribution or False}, ('analytic_distribution',))
            analytic_ids = {int(part) for key in (virtual.analytic_distribution or {}) for part in key.split(',')}
            if any(account.company_id and account.company_id != self.company_id for account in
                    self.env['account.analytic.account'].browse(analytic_ids)):
                raise ValidationError('Native fee analytics must belong to the statement company.')
            for records in (virtual.account_id, virtual.tax_ids, virtual.partner_id):
                records.check_access_rights('read')
                records.check_access_rule('read')
            if (virtual.account_id.company_id != self.company_id or virtual.account_id.deprecated
                    or virtual.account_id.is_off_balance or any(tax.company_id != self.company_id for tax in virtual.tax_ids)):
                raise ValidationError('The native fee rule uses an unavailable company account or tax.')
            if virtual.tax_ids:
                tax_model = self.env['account.tax'].with_company(self.company_id)
                base = virtual._convert_to_tax_base_line_dict()
                if rule.force_tax_included:
                    base['extra_context'] = {'force_price_include': True}
                result, taxes = tax_model._compute_taxes_for_single_line(base,
                    include_caba_tags=self.move_id.always_tax_exigible)
                row['amount_currency'] = result['price_subtotal']
                row.update(self._prepare_counterpart_amounts_using_st_line_rate(transaction_currency, 0,
                    row['amount_currency']))
                row['tax_tag_ids'] = result['tax_tag_ids']
                for tax in taxes:
                    values = tax_model._get_generation_dict_from_base_line(base, tax,
                        force_caba_exigibility=self.move_id.always_tax_exigible)
                    values.pop('tax_id', None)
                    values.pop('_extra_grouping_key_', None)
                    values.update(self._prepare_counterpart_amounts_using_st_line_rate(transaction_currency, 0,
                        tax['tax_amount_currency']))
                    values.update({'name': row['name'] + ' ' + tax['name'], 'display_type': 'tax',
                        'tax_base_amount': self._prepare_counterpart_amounts_using_st_line_rate(transaction_currency, 0,
                            tax['base_amount_currency'])['balance'], 'reconcile_model_id': model.id})
                    rows.append(values)
            rows.append(row)
            remaining_amount -= sum(item['amount_currency'] for item in rows[start:])
        return rows

    def _qorlia_bank_match_apply(self, allocations, fee_model_id=False):
        self.ensure_one()
        sources, model = self._qorlia_bank_match_inputs(allocations, fee_model_id)
        liquidity, suspense, _other = self._seek_for_lines()
        if len(liquidity) != 1 or len(suspense) != 1 or suspense.reconciled:
            raise UserError('This entry needs one native liquidity and unmatched suspense item.')
        for records in (suspense,):
            records.check_access_rights('unlink')
            records.check_access_rule('unlink')
        reader = self.env['sale.order']._qorlia_read_fields
        original = reader(self, ('amount', 'amount_currency', 'foreign_currency_id'))
        original_liquidity = reader(liquidity, ('balance', 'amount_currency', 'currency_id', 'account_id'))
        currency = self._get_accounting_amounts_and_currencies()[1]
        values = []
        for source, amount in sources:
            sign = -1 if source.amount_residual_currency > 0 else 1
            company_amount = source.amount_residual * amount / abs(source.amount_residual_currency)
            amounts = self._prepare_counterpart_amounts_using_st_line_rate(source.currency_id, -company_amount, amount * sign)
            values.append({'name': source.name or self.payment_ref, 'account_id': source.account_id.id,
                'partner_id': source.partner_id.id, 'currency_id': currency.id, **amounts})
        values.extend(self._qorlia_bank_fee_rows(model,
            suspense.amount_currency - sum(row['amount_currency'] for row in values)) if model else [])
        remaining_balance = suspense.balance - sum(row['balance'] for row in values)
        remaining_amount = suspense.amount_currency - sum(row['amount_currency'] for row in values)
        if not values:
            raise ValidationError('The selected rule did not produce any native journal items.')
        commands = [Command.create(row) for row in values]
        if self.company_currency_id.is_zero(remaining_balance) and currency.is_zero(remaining_amount):
            commands.append(Command.delete(suspense.id))
        else:
            commands.append(Command.update(suspense.id, {'balance': remaining_balance, 'amount_currency': remaining_amount}))
        before = set(self._qorlia_bank_ledger().ids)
        # Native suspense replacement permits posted deletion, never disabled balance/hash/fiscal validation.
        self.move_id.with_context(skip_account_move_synchronization=True, force_delete=True).write({'line_ids': commands})
        created = self._qorlia_bank_ledger().filtered(lambda line: line.id not in before).sorted('id')
        created.with_context(validate_analytic=True)._validate_analytic_distribution()
        if len(created) != len(values):
            raise UserError('Native Billing changed the proposed bank journal items.')
        for index, (source, _amount) in enumerate(sources):
            (source | created[index]).reconcile()
        self.env.flush_all()
        if (self.move_id._get_unbalanced_moves({'records': self.move_id})
                or reader(self, tuple(original)) != original
                or reader(liquidity, tuple(original_liquidity)) != original_liquidity):
            raise UserError('Native matching changed original statement amounts or unbalanced the journal.')
        return created

    def _qorlia_bank_match_graph(self, sources=None, witnesses=None):
        self.ensure_one()
        self._qorlia_bank_access()
        sources = sources if sources is not None else self.env['account.move.line']
        witnesses = witnesses or {}
        moves = (self.move_id | sources.move_id | self.payment_ids.move_id
            | self.env['account.move'].browse(witnesses.get('account.move', [])).exists())
        records = {}
        previous = None
        while previous != set(moves.ids):
            previous = set(moves.ids)
            self.env.flush_all()
            moves.check_access_rights('read')
            moves.check_access_rule('read')
            self.env.cr.execute('SELECT id FROM account_move_line WHERE move_id IN %s ORDER BY id', [tuple(moves.ids)])
            lines = self.env['account.move.line'].browse([row[0] for row in self.env.cr.fetchall()])
            lines.check_access_rights('read')
            lines.check_access_rule('read')
            self.env.cr.execute('SELECT id FROM account_partial_reconcile WHERE debit_move_id IN %s OR credit_move_id IN %s ORDER BY id',
                [tuple(lines.ids) or (0,), tuple(lines.ids) or (0,)])
            partials = self.env['account.partial.reconcile'].browse([row[0] for row in self.env.cr.fetchall()])
            full = lines.full_reconcile_id | partials.full_reconcile_id
            if full:
                self.env.cr.execute('SELECT id FROM account_partial_reconcile WHERE full_reconcile_id IN %s ORDER BY id',
                    [tuple(full.ids)])
                partials |= self.env['account.partial.reconcile'].browse([row[0] for row in self.env.cr.fetchall()])
                self.env.cr.execute('SELECT id FROM account_move_line WHERE full_reconcile_id IN %s ORDER BY id',
                    [tuple(full.ids)])
                full_lines = self.env['account.move.line'].browse([row[0] for row in self.env.cr.fetchall()])
                full_lines.check_access_rights('read')
                full_lines.check_access_rule('read')
            else:
                full_lines = self.env['account.move.line']
            for items in (partials, full):
                if items:
                    items.check_access_rights('read')
                    items.check_access_rule('read')
            related = partials.debit_move_id | partials.credit_move_id | full_lines
            self.env.cr.execute('SELECT id FROM account_move WHERE reversed_entry_id IN %s OR tax_cash_basis_rec_id IN %s '
                'OR tax_cash_basis_origin_move_id IN %s ORDER BY id',
                [tuple(moves.ids), tuple(partials.ids) or (0,), tuple(moves.ids)])
            moves |= related.move_id | partials.exchange_move_id | full.exchange_move_id | self.env['account.move'].browse(
                [row[0] for row in self.env.cr.fetchall()])
            if len(moves) > 1000:
                raise UserError('More than 1,000 connected entries need a paged native accounting review.')
        records.update({'account.move': moves, 'account.move.line': lines,
            'account.partial.reconcile': partials, 'account.full.reconcile': full})
        for model, table, field, identifiers in (
                ('account.bank.statement.line', 'account_bank_statement_line', 'move_id', moves.ids),
                ('account.payment', 'account_payment', 'move_id', moves.ids),
                ('account.analytic.line', 'account_analytic_line', 'move_line_id', lines.ids)):
            self.env.cr.execute('SELECT id FROM %s WHERE %s IN %%s ORDER BY id' % (table, field), [tuple(identifiers) or (0,)])
            records[model] = self.env[model].browse([row[0] for row in self.env.cr.fetchall()])
        for items in records.values():
            if items:
                items.check_access_rights('read')
                items.check_access_rule('read')
                if 'company_id' in items._fields and any(item.company_id and item.company_id != self.company_id for item in items):
                    raise AccessError('Connected bank accounting records must stay in the statement company.')
        return records

    def _qorlia_bank_match_snapshot(self, records, origin=None):
        reader = self.env['sale.order']._qorlia_read_fields
        origin = origin if origin is not None else {name: set(items.ids) for name, items in records.items()}
        keys = {name: {item.id: item.id if item.id in origin.get(name, ()) else 'new:%s' % index
            for index, item in enumerate(items.sorted('id'), 1)} for name, items in records.items()}
        result = {}
        for name, items in records.items():
            rows = []
            for item in items.sorted('id'):
                values = reader(item, GRAPH_FIELDS[name])
                if name == 'account.move.line' and values['analytic_distribution']:
                    self.env['sale.order']._qorlia_values(item,
                        {'analytic_distribution': values['analytic_distribution']}, ('analytic_distribution',))
                if name == 'account.full.reconcile' and item.id not in origin.get(name, ()):
                    # Native reconciliation identifiers consume sequences even when preview rolls back.
                    values['name'] = False
                for field_name, value in values.items():
                    field = item._fields[field_name]
                    if field.type in ('many2one', 'one2many', 'many2many'):
                        relation = item[field_name]
                        if relation:
                            relation.check_access_rights('read')
                            relation.check_access_rule('read')
                        if field.type == 'one2many':
                            value = relation.ids
                        mapping = keys.get(field.comodel_name, {})
                        values[field_name] = mapping.get(value, value) if field.type == 'many2one' else sorted(
                            [mapping.get(identifier, identifier) for identifier in value], key=str)
                rows.append({'id': keys[name][item.id], 'values': values})
            result[name] = {'rows': rows, 'removed_ids': sorted(set(origin.get(name, ())) - set(items.ids))}
        return result

    def _qorlia_bank_match_undo(self):
        self._qorlia_bank_match_access()
        records = self._qorlia_bank_match_graph()
        for name in ('account.move', 'account.move.line'):
            records[name].check_access_rights('write')
            records[name].check_access_rule('write')
        for name in ('account.partial.reconcile', 'account.full.reconcile', 'account.payment'):
            if records[name]:
                records[name].check_access_rights('unlink')
                records[name].check_access_rule('unlink')
        if not self._seek_for_lines()[2] and not self.payment_ids:
            raise UserError('This statement has no matching or generated payment to undo.')
        self.action_undo_reconciliation()

    def _qorlia_bank_match_simulate(self, allocations=None, fee_model_id=False, undo=False):
        self._qorlia_bank_match_access()
        if undo:
            if allocations or fee_model_id:
                raise ValidationError('Review undo separately from a new bank match.')
            sources = self.env['account.move.line']
        else:
            chosen, _model = self._qorlia_bank_match_inputs(allocations, fee_model_id)
            sources = self.env['account.move.line'].browse([line.id for line, _amount in chosen])
        graph = self._qorlia_bank_match_graph(sources)
        origin = {name: set(items.ids) for name, items in graph.items()}
        before = self._qorlia_bank_match_snapshot(graph, origin)
        cr = self.env.cr
        cr.flush()
        hooks = {name: getattr(cr, name) for name in ('postcommit', 'prerollback', 'postrollback')}
        try:
            for name in hooks:
                setattr(cr, name, tools.Callbacks())
            # Execute native calculations with callback quarantine and unconditional SQL rollback.
            with closing(cr.savepoint()):
                entry = self.with_context(tracking_disable=True, mail_create_nosubscribe=True, mail_notify_force_send=False)
                if undo:
                    entry._qorlia_bank_match_undo()
                else:
                    entry._qorlia_bank_match_apply(allocations, fee_model_id)
                cr.flush()
                after_graph = entry._qorlia_bank_match_graph(sources.exists(), origin)
                moves = after_graph['account.move']
                if moves._get_unbalanced_moves({'records': moves}):
                    raise UserError('Native matching produced an unbalanced connected journal.')
                return {'statement_line_id': self.id, 'before': before,
                    'after': entry._qorlia_bank_match_snapshot(after_graph, origin)}
        finally:
            for name, callbacks in hooks.items():
                setattr(cr, name, callbacks)
