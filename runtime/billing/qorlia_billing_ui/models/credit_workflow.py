# SPDX-License-Identifier: LGPL-3.0-or-later
# Copyright 2026 Qorlia contributors.
import hashlib
import json

from odoo import api, models
from odoo.exceptions import AccessError, UserError, ValidationError


class CreditWorkflow(models.Model):
    _inherit = 'account.move'

    def _qorlia_credit_access(self):
        self.ensure_one()
        if not self.env.user.has_group('account.group_account_invoice'):
            raise AccessError('Your Billing account cannot allocate customer credits.')
        for model, operation in (('account.move', 'write'), ('account.move.line', 'write'),
                                 ('account.partial.reconcile', 'create'), ('account.full.reconcile', 'create')):
            self.env[model].check_access_rights(operation)
        self.check_access_rule('write')

    def _qorlia_credit_reconciliation_state(self):
        lines = self.line_ids._all_reconciled_lines()
        partials = lines.matched_debit_ids | lines.matched_credit_ids
        full = partials.full_reconcile_id
        reversals = self.search([('tax_cash_basis_rec_id', 'in', partials.ids)]) if partials else self.browse()
        moves = self | lines.move_id | partials.exchange_move_id | full.exchange_move_id | reversals
        for records in (moves, moves.line_ids, partials, full):
            records.check_access_rights('read')
            records.check_access_rule('read')
        removable = self.state == 'posted' and not moves._get_unbalanced_moves({'records': moves})
        for records, operation in ((moves, 'write'), (moves.line_ids, 'write'),
                                   (partials, 'unlink'), (full, 'unlink')):
            if not records.check_access_rights(operation, raise_exception=False):
                removable = False
            else:
                try:
                    records.check_access_rule(operation)
                except AccessError:
                    removable = False
        stamp = {
            'moves': moves.sorted('id').read(['write_date', 'state', 'date', 'ref', 'company_id', 'partner_id']),
            'lines': moves.line_ids.sorted('id').read(['write_date', 'account_id', 'partner_id', 'debit', 'credit',
                'currency_id', 'amount_currency', 'amount_residual', 'amount_residual_currency', 'reconciled',
                'matched_debit_ids', 'matched_credit_ids', 'full_reconcile_id']),
            'partials': partials.sorted('id').read(['write_date', 'debit_move_id', 'credit_move_id', 'amount',
                'debit_amount_currency', 'credit_amount_currency', 'full_reconcile_id', 'exchange_move_id']),
            'full': full.sorted('id').read(['write_date', 'partial_reconcile_ids', 'reconciled_line_ids', 'exchange_move_id']),
        }
        # Relation order differs between Odoo's write cache and a fresh database read.
        for section, fields in (('lines', ('matched_debit_ids', 'matched_credit_ids')),
                                ('full', ('partial_reconcile_ids', 'reconciled_line_ids'))):
            for row in stamp[section]:
                for field in fields:
                    row[field] = sorted(row[field])
        return moves, stamp, bool(removable)

    def _qorlia_credit_snapshot(self):
        self._qorlia_credit_access()
        self.env.flush_all()
        invoice = self._qorlia_invoice_snapshot()
        # Read through Odoo's compute protection; direct compute calls update write_date.
        self.invalidate_recordset(['invoice_outstanding_credits_debits_widget',
                                  'invoice_has_outstanding', 'invoice_payments_widget'])
        rows = (self.invoice_outstanding_credits_debits_widget or {}).get('content', [])
        if len(rows) > 200:
            raise UserError('More than 200 outstanding items require the native Billing reconciliation screen.')
        credits, stamps = [], []
        for row in rows:
            line = self.env['account.move.line'].browse(row['id'])
            line.check_access_rights('read')
            line.check_access_rule('read')
            source = line.move_id
            source.check_access_rights('read')
            source.check_access_rule('read')
            source.line_ids.check_access_rule('read')
            eligible = (invoice['ledger_balanced'] and source.company_id == self.company_id
                        and source.state == 'posted' and not source._get_unbalanced_moves({'records': source})
                        and line.partner_id == self.commercial_partner_id and not line.reconciled
                        and not line.account_id.deprecated and line.account_id.reconcile)
            credits.append({'id': line.id, 'source_id': source.id, 'name': row['journal_name'],
                            'date': row['date'], 'amount': row['amount'], 'currency': invoice['currency'],
                            'can_apply': bool(eligible)})
            stamps.append({'move': source.read(['write_date', 'state', 'date', 'ref', 'partner_id', 'company_id']),
                           'lines': source.line_ids.sorted('id').read(['write_date', 'account_id', 'partner_id',
                               'debit', 'credit', 'amount_currency', 'amount_residual', 'amount_residual_currency',
                               'currency_id', 'reconciled']),
                           'account': line.account_id.read(['write_date', 'deprecated', 'reconcile', 'company_id'])})
        history = []
        rows = (self.invoice_payments_widget or {}).get('content', [])
        if len(rows) > 200:
            raise UserError('More than 200 reconciled items require the native Billing reconciliation screen.')
        _, reconciliation, removable = self._qorlia_credit_reconciliation_state()
        for row in rows:
            source = self.env['account.move'].browse(row['move_id'])
            source.check_access_rights('read')
            source.check_access_rule('read')
            currency = self.env['res.currency'].browse(row['currency_id'])
            history.append({'id': row['partial_id'], 'name': row['ref'], 'date': str(row['date']),
                            'amount': row['amount'], 'currency': [currency.id, currency.name],
                            'is_exchange': row['is_exchange'],
                            'can_remove': removable and not row['is_exchange']})
        config = {'company': self.company_id.read(['write_date', 'period_lock_date', 'fiscalyear_lock_date', 'tax_lock_date']),
                  'currencies': self.env['res.currency'].search([]).read(['write_date', 'rounding']),
                  'rates': self.env['res.currency.rate'].search([('company_id', 'in', [False, self.company_id.id])])
                            .read(['write_date', 'currency_id', 'name', 'rate'])}
        return {'invoice': invoice, 'credits': credits, 'history': history,
                'version': hashlib.sha256(json.dumps({'invoice': invoice['version'], 'credits': credits,
                    'sources': stamps, 'history': history, 'reconciliation': reconciliation,
                    'config': config}, sort_keys=True, default=str).encode()).hexdigest()}

    @api.model
    def qorlia_credit_load(self, invoice_id):
        return self._qorlia_invoice(invoice_id)._qorlia_credit_snapshot()

    @api.model
    def qorlia_credit_apply(self, invoice_id, line_id, version):
        if type(line_id) is not int or line_id <= 0 or not isinstance(version, str) or len(version) != 64:
            raise ValidationError('Review a valid native outstanding item before applying it.')
        invoice = self._qorlia_invoice(invoice_id, operation='write')
        invoice._qorlia_credit_access()
        line = self.env['account.move.line'].browse(line_id).exists()
        if not line:
            raise UserError('The outstanding item is no longer available.')
        line.check_access_rights('write')
        line.check_access_rule('write')
        moves = invoice | line.move_id
        moves.check_access_rule('write')
        # Both documents and all journal lines use one lock order across allocation requests.
        self.env.cr.execute('SELECT id FROM account_move WHERE id IN %s ORDER BY id FOR UPDATE', [tuple(moves.ids)])
        self.env.cr.execute('SELECT id FROM account_move_line WHERE move_id IN %s ORDER BY id FOR UPDATE', [tuple(moves.ids)])
        moves.invalidate_recordset()
        moves.line_ids.invalidate_recordset()
        moves.check_access_rule('write')
        before = invoice._qorlia_credit_snapshot()
        chosen = next((credit for credit in before['credits'] if credit['id'] == line_id), None)
        if version != before['version'] or not chosen or not chosen['can_apply']:
            raise UserError('The invoice or outstanding item changed or is not eligible. Reload and review before applying it.')
        invoice.js_assign_outstanding_line(line_id)
        moves.invalidate_recordset()
        moves.line_ids.invalidate_recordset()
        if moves._get_unbalanced_moves({'records': moves}):
            raise UserError('Reconciliation produced an unbalanced journal. No credit allocation was saved.')
        return invoice._qorlia_credit_snapshot()

    @api.model
    def qorlia_credit_remove(self, invoice_id, partial_id, version):
        if type(partial_id) is not int or partial_id <= 0 or not isinstance(version, str) or len(version) != 64:
            raise ValidationError('Review a valid reconciled item before removing its allocation.')
        invoice = self._qorlia_invoice(invoice_id, operation='write')
        invoice._qorlia_credit_access()
        before = invoice._qorlia_credit_snapshot()
        chosen = next((row for row in before['history'] if row['id'] == partial_id and row['can_remove']), None)
        if version != before['version'] or not chosen:
            raise UserError('The allocation changed or is not eligible. Reload and review before removing it.')
        moves, _, _ = invoice._qorlia_credit_reconciliation_state()
        # Unlink can reverse exchange and cash-basis entries across a full reconciliation.
        self.env.cr.execute('SELECT id FROM account_move WHERE id IN %s ORDER BY id FOR UPDATE', [tuple(moves.ids)])
        self.env.cr.execute('SELECT id FROM account_move_line WHERE move_id IN %s ORDER BY id FOR UPDATE', [tuple(moves.ids)])
        self.env.cr.execute('SELECT id FROM account_partial_reconcile WHERE id = %s FOR UPDATE', [partial_id])
        self.env.invalidate_all()
        invoice.check_access_rule('write')
        fresh = invoice._qorlia_credit_snapshot()
        if fresh['version'] != version:
            raise UserError('The allocation changed. Reload and review before removing it.')
        partial = self.env['account.partial.reconcile'].browse(partial_id).exists()
        partial.check_access_rights('unlink')
        partial.check_access_rule('unlink')
        invoice.js_remove_outstanding_partial(partial_id)
        self.env.invalidate_all()
        affected = moves | self.search([('reversed_entry_id', 'in', moves.ids)])
        if affected._get_unbalanced_moves({'records': affected}):
            raise UserError('Unreconciliation produced an unbalanced journal. No removal was saved.')
        return invoice._qorlia_credit_snapshot()
