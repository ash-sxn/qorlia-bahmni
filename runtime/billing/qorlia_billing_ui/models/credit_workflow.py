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

    def _qorlia_credit_snapshot(self):
        self._qorlia_credit_access()
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
        for row in (self.invoice_payments_widget or {}).get('content', []):
            source = self.env['account.move'].browse(row['move_id'])
            source.check_access_rights('read')
            source.check_access_rule('read')
            currency = self.env['res.currency'].browse(row['currency_id'])
            history.append({'id': row['partial_id'], 'name': row['ref'], 'date': str(row['date']),
                            'amount': row['amount'], 'currency': [currency.id, currency.name],
                            'is_exchange': row['is_exchange']})
        config = {'company': self.company_id.read(['write_date', 'period_lock_date', 'fiscalyear_lock_date', 'tax_lock_date']),
                  'currencies': self.env['res.currency'].search([]).read(['write_date', 'rounding']),
                  'rates': self.env['res.currency.rate'].search([('company_id', 'in', [False, self.company_id.id])])
                            .read(['write_date', 'currency_id', 'name', 'rate'])}
        return {'invoice': invoice, 'credits': credits, 'history': history,
                'version': hashlib.sha256(json.dumps({'invoice': invoice['version'], 'credits': credits,
                    'sources': stamps, 'config': config}, sort_keys=True, default=str).encode()).hexdigest()}

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
