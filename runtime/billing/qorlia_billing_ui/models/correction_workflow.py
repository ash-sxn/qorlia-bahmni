# SPDX-License-Identifier: LGPL-3.0-or-later
# Copyright 2026 Qorlia contributors.
import hashlib
import json

from odoo import api, models
from odoo.exceptions import AccessError, UserError, ValidationError


class InvoiceCorrectionWorkflow(models.Model):
    _inherit = 'account.move'

    def _qorlia_correction_snapshot(self):
        self.ensure_one()
        self.env.flush_all()
        invoice = self._qorlia_invoice_snapshot()
        moves, reconciliation, removable = self._qorlia_credit_reconciliation_state()
        if len(moves.line_ids) > 1000:
            raise UserError('This correction involves too many journal lines. Review it in native Billing.')
        analytics = self.line_ids.analytic_line_ids
        analytics.check_access_rights('read')
        analytics.check_access_rule('read')
        writable = self.env.user.has_group('account.group_account_invoice')
        for records in (self, self.line_ids):
            if not records.check_access_rights('write', raise_exception=False):
                writable = False
            else:
                try:
                    records.check_access_rule('write')
                except AccessError:
                    writable = False
        can_reset = writable and invoice['ledger_balanced'] and self.show_reset_to_draft_button
        if analytics:
            try:
                analytics.check_access_rights('unlink')
                analytics.check_access_rule('unlink')
            except AccessError:
                can_reset = False
        partials = self.line_ids.matched_debit_ids | self.line_ids.matched_credit_ids
        if partials and not removable:
            can_reset = False
        self.invalidate_recordset(['invoice_payments_widget'])
        rows = (self.invoice_payments_widget or {}).get('content', [])
        if len(rows) > 200:
            raise UserError('More than 200 allocations require native Billing correction review.')
        allocations = []
        for row in rows:
            currency = self.env['res.currency'].browse(row['currency_id'])
            allocations.append({'id': row['partial_id'], 'name': row['ref'], 'date': str(row['date']),
                'amount': row['amount'], 'currency': [currency.id, currency.name], 'is_exchange': row['is_exchange']})
        stamp = {'invoice': invoice['version'], 'reconciliation': reconciliation,
            'analytics': analytics.sorted('id').read(['write_date', 'move_line_id', 'amount']),
            'company': self.company_id.read(['write_date', 'period_lock_date', 'fiscalyear_lock_date', 'tax_lock_date']),
            'journal': self.journal_id.read(['write_date', 'restrict_mode_hash_table']),
            'posted_before': self.posted_before, 'allocations': allocations}
        return {'invoice': invoice,
            'version': hashlib.sha256(json.dumps(stamp, sort_keys=True, default=str).encode()).hexdigest(),
            'can_reset': bool(can_reset),
            'can_cancel': bool(writable and invoice['ledger_balanced'] and self.state == 'draft'),
            'posted_before': self.posted_before, 'allocations': allocations}

    @api.model
    def qorlia_correction_load(self, invoice_id):
        return self._qorlia_invoice(invoice_id)._qorlia_correction_snapshot()

    @api.model
    def qorlia_correction_run(self, invoice_id, version, action):
        if action not in ('reset', 'cancel') or not isinstance(version, str) or len(version) != 64:
            raise ValidationError('Review a valid invoice correction before confirming it.')
        invoice = self._qorlia_invoice(invoice_id, operation='write')
        before = invoice._qorlia_correction_snapshot()
        if version != before['version'] or not before['can_' + action]:
            raise UserError('This correction changed or is unavailable. Reload and review its current status.')
        moves, _, _ = invoice._qorlia_credit_reconciliation_state()
        partials = moves.line_ids.matched_debit_ids | moves.line_ids.matched_credit_ids
        # Reset can unlink allocations and reverse exchange/cash-basis entries across connected documents.
        self.env.cr.execute('SELECT id FROM account_move WHERE id IN %s ORDER BY id FOR UPDATE', [tuple(moves.ids)])
        self.env.cr.execute('SELECT id FROM account_move_line WHERE move_id IN %s ORDER BY id FOR UPDATE', [tuple(moves.ids)])
        if partials:
            self.env.cr.execute('SELECT id FROM account_partial_reconcile WHERE id IN %s ORDER BY id FOR UPDATE',
                                [tuple(partials.ids)])
        self.env.invalidate_all()
        invoice.check_access_rule('write')
        fresh = invoice._qorlia_correction_snapshot()
        if version != fresh['version'] or not fresh['can_' + action]:
            raise UserError('This correction changed. Reload and review its current status.')
        if action == 'reset':
            invoice.button_draft()
        else:
            invoice.button_cancel()
        self.env.invalidate_all()
        affected = moves | self.search([('reversed_entry_id', 'in', moves.ids)])
        if affected._get_unbalanced_moves({'records': affected}):
            raise UserError('The correction produced an unbalanced journal. No correction was saved.')
        return invoice._qorlia_invoice_snapshot()
