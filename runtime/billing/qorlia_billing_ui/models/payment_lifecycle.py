# SPDX-License-Identifier: LGPL-3.0-or-later
# Copyright 2026 Qorlia contributors.
from odoo import api, fields, models
from odoo.exceptions import AccessError, UserError, ValidationError

from .invoice_draft import _digest


class PaymentLifecycle(models.Model):
    _inherit = 'account.payment'

    qorlia_payment_state_receipts = fields.Json(copy=False, readonly=True)

    def _qorlia_state_payment(self, payment_id, lock=False):
        if type(payment_id) is not int or payment_id <= 0:
            raise ValidationError('Select a saved customer payment.')
        # The native customer payment action supplies this context to Bahmni auto-allocation.
        payment = self.with_context(default_partner_type='customer').browse(payment_id).exists()
        if not payment:
            raise UserError('This customer payment is no longer available.')
        payment.check_access_rights('read')
        payment.check_access_rule('read')
        if lock:
            self.env.cr.execute('SELECT id FROM account_payment WHERE id = %s FOR UPDATE', [payment.id])
            payment.invalidate_recordset()
            payment.check_access_rule('read')
        if payment.partner_type != 'customer' or payment.is_internal_transfer:
            raise UserError('Select a customer payment, not a vendor or internal transfer.')
        if payment.company_id not in self.env.companies:
            raise AccessError('Select a payment in your active Billing companies.')
        for record in (payment.move_id, payment.partner_id, payment.company_id,
                       payment.journal_id, payment.currency_id, payment.payment_method_id):
            record.check_access_rights('read')
            record.check_access_rule('read')
        # Upstream caches this context-sensitive compute without depends_context.
        payment.invalidate_recordset(['is_auto_reconciliation_applicable'])
        return payment

    @api.model
    def qorlia_payment_history(self, search='', state='all', offset=0):
        if (not isinstance(search, str) or len(search) > 160 or state not in ('all', 'draft', 'posted', 'cancel')
                or type(offset) is not int or not 0 <= offset <= 2147483647):
            raise ValidationError('Use a valid payment search, state and page.')
        domain = [('partner_type', '=', 'customer'), ('is_internal_transfer', '=', False),
                  ('company_id', 'in', self.env.companies.ids)]
        if state != 'all':
            domain.append(('state', '=', state))
        if search.strip():
            domain += ['|', '|', '|', ('name', 'ilike', search.strip()), ('partner_id.name', 'ilike', search.strip()),
                       ('ref', 'ilike', search.strip()), ('cheque_reference', 'ilike', search.strip())]
        payments = self.search(domain, offset=offset, limit=26, order='date desc, id desc')
        rows = []
        for row in payments[:25]:
            row = self._qorlia_state_payment(row.id)
            rows.append({'payment_id': row.id, 'name': row.name or '/', 'date': fields.Date.to_string(row.date),
                         'customer': row.partner_id.display_name or 'No customer', 'amount': row.amount,
                         'currency': [row.currency_id.id, row.currency_id.name], 'journal': row.journal_id.display_name,
                         'method': row.payment_method_id.display_name, 'direction': row.payment_type,
                         'state': row.state, 'reference': row.ref or ''})
        return {'rows': rows, 'offset': offset, 'has_more': len(payments) > 25}

    def _qorlia_state_snapshot(self, payment, extra_ids=()):
        self.env.flush_all()
        moves, graph, removable = self._qorlia_void_graph(payment, extra_ids)
        analytics = payment.move_id.line_ids.analytic_line_ids
        analytics.check_access_rights('read')
        analytics.check_access_rule('read')
        common_reason = False
        try:
            if not self.env.user.has_group('account.group_account_invoice'):
                raise AccessError('Your Billing account cannot manage customer payments.')
            for record in (payment, payment.move_id, payment.move_id.line_ids):
                record.check_access_rights('write')
                record.check_access_rule('write')
        except AccessError as error:
            common_reason = str(error)
        reset_reason = common_reason
        if not reset_reason and payment.state == 'posted' and payment.move_id.restrict_mode_hash_table:
            reset_reason = 'This posted journal uses strict mode and cannot be reset.'
        if not reset_reason and not removable:
            reset_reason = 'Connected allocations need permission or balance review before reset.'
        try:
            analytics.check_access_rights('unlink')
            analytics.check_access_rule('unlink')
        except AccessError as error:
            reset_reason = str(error)
        post_reason = common_reason
        if not post_reason:
            try:
                for records, operation in ((moves, 'write'), (moves.line_ids, 'write'),
                                           (self.env['account.partial.reconcile'], 'create'),
                                           (self.env['account.full.reconcile'], 'create')):
                    records.check_access_rights(operation)
                    records.check_access_rule(operation)
                selected = payment.credit_invoice_lines.filtered('selected').invoice_id | payment.outstanding_invoice_lines.filtered('selected').invoice_id
                if any(move.commercial_partner_id != payment.partner_id.commercial_partner_id for move in selected):
                    raise UserError('Selected allocations belong to another customer. Review them in native Billing.')
            except (AccessError, UserError) as error:
                post_reason = str(error)
        reasons = {'reset': reset_reason or (False if payment.state in ('posted', 'cancel') else 'Only posted or cancelled payments can be reset.'),
                   'cancel': common_reason or (False if payment.state == 'draft' else 'Reset a posted payment to draft before cancelling it.'),
                   'post': post_reason or (False if payment.state == 'draft' else 'Only draft payments can be confirmed.')}
        documents = [{'id': move.id, 'name': move.name or '/', 'type': move.move_type, 'state': move.state,
                      'total': move.amount_total, 'open_amount': move.amount_residual,
                      'currency': [move.currency_id.id, move.currency_id.name]} for move in moves.sorted('id')]
        payment_fields = ['write_date', 'amount', 'date', 'ref', 'state', 'check_number', 'is_move_sent',
                          'is_matched', 'currency_id', 'partner_id', 'journal_id', 'payment_method_line_id',
                          'bank_reference', 'cheque_reference', 'effective_date', 'current_outstanding', 'balance_outstanding']
        stamp = {'payment': payment.read(payment_fields), 'graph': graph, 'documents': documents,
                 'analytics': analytics.sorted('id').read(['write_date', 'amount', 'move_line_id']),
                 'journal': payment.journal_id.read(['write_date', 'restrict_mode_hash_table', 'check_manual_sequencing']),
                 'company': payment.company_id.read(['write_date', 'period_lock_date', 'fiscalyear_lock_date', 'tax_lock_date']),
                 'auto_allocate': payment.is_auto_reconciliation_applicable, 'reasons': reasons, 'author': self.env.uid}
        return {'payment_id': payment.id, 'name': payment.name or '/', 'amount': payment.amount,
                'date': fields.Date.to_string(payment.date), 'effective_date': fields.Date.to_string(payment.effective_date) or False,
                'currency': [payment.currency_id.id, payment.currency_id.name], 'state': payment.state,
                'customer': payment.partner_id.display_name or 'No customer', 'journal': payment.journal_id.display_name,
                'method': payment.payment_method_id.display_name, 'check_number': payment.check_number or False,
                'sent': payment.is_move_sent, 'bank_matched': payment.is_matched,
                'auto_allocate': payment.is_auto_reconciliation_applicable, 'reasons': reasons,
                'documents': documents, 'version': _digest(stamp)}

    @api.model
    def qorlia_payment_state_load(self, payment_id):
        return self._qorlia_state_snapshot(self._qorlia_state_payment(payment_id))

    @api.model
    def qorlia_payment_state_preview(self, payment_id, version, action):
        if action not in ('reset', 'cancel', 'post'):
            raise ValidationError('Select reset, cancel or confirm for this payment.')
        current = self.qorlia_payment_state_load(payment_id)
        if current['reasons'][action]:
            raise UserError(current['reasons'][action])
        if version != current['version']:
            raise UserError('The payment or connected documents changed. Reload and review again.')
        return {**current, 'action': action, 'review_version': _digest({'version': version, 'action': action, 'author': self.env.uid})}

    def _qorlia_state_receipt(self, payment, version, review_version, request_key, action):
        if action not in ('reset', 'cancel', 'post'):
            raise ValidationError('Select a supported payment action.')
        self._qorlia_cheque_request(version, False, review_version, request_key)
        digest = _digest({'version': version, 'review': review_version, 'action': action, 'author': self.env.uid})
        receipt = (payment.qorlia_payment_state_receipts or {}).get(request_key)
        if receipt and (receipt['hash'] != digest or receipt['author'] != self.env.uid):
            raise ValidationError('This identifier belongs to a different payment request.')
        return receipt, digest

    @api.model
    def qorlia_payment_state_status(self, payment_id, version, review_version, request_key, action):
        payment = self._qorlia_state_payment(payment_id)
        receipt, _ = self._qorlia_state_receipt(payment, version, review_version, request_key, action)
        return {'accepted': bool(receipt), 'action': action,
                'payment': self._qorlia_state_snapshot(payment, receipt['moves'] if receipt else ())}

    @api.model
    def qorlia_payment_state_run(self, payment_id, version, review_version, request_key, action):
        payment = self._qorlia_state_payment(payment_id, lock=True)
        receipt, digest = self._qorlia_state_receipt(payment, version, review_version, request_key, action)
        if receipt:
            return self.qorlia_payment_state_status(payment_id, version, review_version, request_key, action)
        self.qorlia_payment_state_preview(payment_id, version, action)
        moves, _, _ = self._qorlia_void_graph(payment)
        partials = moves.line_ids.matched_debit_ids | moves.line_ids.matched_credit_ids
        for table, ids in (('account_move', moves.ids), ('account_move_line', moves.line_ids.ids),
                           ('account_partial_reconcile', partials.ids), ('account_full_reconcile', partials.full_reconcile_id.ids),
                           ('account_payment_credit_invoice_line', payment.credit_invoice_lines.ids),
                           ('account_payment_outstanding_invoice_line', payment.outstanding_invoice_lines.ids),
                           ('account_journal', [payment.journal_id.id]), ('res_company', [payment.company_id.id])):
            if ids:
                self.env.cr.execute('SELECT id FROM ' + table + ' WHERE id IN %s ORDER BY id FOR UPDATE', [tuple(ids)])
        self.env.invalidate_all()
        payment.check_access_rule('write')
        review = self.qorlia_payment_state_preview(payment_id, version, action)
        if review['review_version'] != review_version:
            raise UserError('Review this payment action again before saving.')
        financial_fields = ['amount', 'currency_id', 'partner_id', 'journal_id', 'payment_method_line_id',
                            'payment_type', 'partner_type', 'bank_reference', 'cheque_reference', 'effective_date', 'ref']
        if action != 'post':
            financial_fields += ['date', 'check_number']
        before = payment.read(financial_fields)
        ledger_fields = ['debit', 'credit', 'account_id', 'amount_currency', 'currency_id']
        unchanged_moves = moves - payment.move_id if action == 'post' else moves
        lines_before = unchanged_moves.line_ids.sorted('id').read(ledger_fields)
        # Use the installed methods, including native numbering and Bahmni allocation/unlink extensions.
        if action == 'reset':
            payment.action_draft()
        elif action == 'cancel':
            payment.action_cancel()
        else:
            payment.action_post()
        self.env.invalidate_all()
        affected = moves.exists() | self.env['account.move'].search([('reversed_entry_id', 'in', moves.ids)])
        target = {'reset': 'draft', 'cancel': 'cancel', 'post': 'posted'}[action]
        if (payment.state != target or payment.read(financial_fields) != before
                or unchanged_moves.line_ids.sorted('id').read(ledger_fields) != lines_before
                or affected._get_unbalanced_moves({'records': affected})):
            raise UserError('Native Billing changed an unreviewed payment detail or left an unbalanced journal. No action was saved.')
        receipts = dict(payment.qorlia_payment_state_receipts or {})
        receipts[request_key] = {'hash': digest, 'author': self.env.uid, 'action': action, 'moves': affected.ids}
        payment.write({'qorlia_payment_state_receipts': receipts})
        return self.qorlia_payment_state_status(payment_id, version, review_version, request_key, action)
