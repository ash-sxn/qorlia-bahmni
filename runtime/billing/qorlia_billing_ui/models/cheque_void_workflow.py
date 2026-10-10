# SPDX-License-Identifier: LGPL-3.0-or-later
# Copyright 2026 Qorlia contributors.
from odoo import api, fields, models
from odoo.exceptions import AccessError, UserError, ValidationError

from .invoice_draft import _digest


class ChequeVoidWorkflow(models.Model):
    _inherit = 'account.payment'

    qorlia_cheque_void_receipts = fields.Json(copy=False, readonly=True)

    def _qorlia_void_payment(self, payment_id, lock=False):
        if type(payment_id) is not int or payment_id <= 0:
            raise ValidationError('Select a saved customer cheque.')
        payment = self.browse(payment_id).exists()
        if not payment:
            raise UserError('This cheque payment is no longer available.')
        payment.check_access_rights('read')
        payment.check_access_rule('read')
        if lock:
            self.env.cr.execute('SELECT id FROM account_payment WHERE id = %s FOR UPDATE', [payment.id])
            payment.invalidate_recordset()
            payment.check_access_rule('read')
        if (payment.partner_type != 'customer' or payment.is_internal_transfer
                or payment.journal_id.type != 'bank'
                or payment.payment_method_id.code not in ('check_printing', 'pdc')):
            raise UserError('Select a customer bank cheque, not a manual or internal payment.')
        for record in (payment.move_id, payment.company_id, payment.journal_id, payment.payment_method_id):
            record.check_access_rights('read')
            record.check_access_rule('read')
        return payment

    def _qorlia_void_graph(self, payment, extra_ids=()):
        selections = payment.credit_invoice_lines
        outstanding = payment.outstanding_invoice_lines
        for records in (selections, outstanding):
            records.check_access_rights('read')
            records.check_access_rule('read')
        # Bahmni reset also removes credit allocations selected on the payment, not just its own reconciliation.
        seeds = (payment.move_id | selections.filtered('selected').invoice_id
                 | outstanding.filtered('selected').invoice_id | self.env['account.move'].browse(extra_ids).exists())
        moves = self.env['account.move']
        stamps, removable = [], True
        for seed in seeds.sorted('id'):
            connected, stamp, allowed = seed._qorlia_credit_reconciliation_state()
            moves |= connected
            stamps.append(stamp)
            # An unreconciled selected document is reviewed but native void does not modify it.
            if seed == payment.move_id or stamp['partials']:
                removable = removable and allowed
        if len(moves.line_ids) > 1000:
            raise UserError('This cheque involves more than 1000 journal lines. Review its native allocations first.')
        if any(move.company_id != payment.company_id for move in moves):
            raise AccessError('Connected cheque allocations must belong to the same company.')
        selections_stamp = {'credits': selections.sorted('id').read(['write_date', 'invoice_id', 'selected', 'allocated_amount']),
                            'outstanding': outstanding.sorted('id').read(['write_date', 'invoice_id', 'selected', 'allocated_amount'])}
        return moves, {'reconciliation': stamps, 'selections': selections_stamp}, removable

    def _qorlia_void_snapshot(self, payment, extra_ids=()):
        self.env.flush_all()
        moves, graph, removable = self._qorlia_void_graph(payment, extra_ids)
        analytics = payment.move_id.line_ids.analytic_line_ids
        analytics.check_access_rights('read')
        analytics.check_access_rule('read')
        reason = False
        if payment.state != 'posted' or not payment.is_move_sent or payment.payment_method_id.code != 'check_printing':
            reason = 'Native void requires a posted check-printing payment marked sent. PDC and other states use their own native workflows.'
        elif payment.move_id.restrict_mode_hash_table:
            reason = 'The payment journal is in strict mode and cannot be reset for voiding.'
        elif not removable:
            reason = 'Your Billing account cannot safely remove all connected allocations, or their journals need balance review.'
        try:
            if not self.env.user.has_group('account.group_account_invoice'):
                raise AccessError('Your Billing account cannot void cheques.')
            for records, operation in ((payment, 'write'), (payment.move_id, 'write'), (analytics, 'unlink')):
                records.check_access_rights(operation)
                records.check_access_rule(operation)
        except AccessError as error:
            reason = str(error)
        documents = [{'id': move.id, 'name': move.name or '/', 'type': move.move_type,
                      'state': move.state, 'total': move.amount_total, 'open_amount': move.amount_residual,
                      'currency': [move.currency_id.id, move.currency_id.name]} for move in moves.sorted('id')]
        stamp = {'payment': payment.read(['write_date', 'amount', 'date', 'ref', 'state', 'check_number',
                    'is_move_sent', 'is_matched', 'currency_id', 'partner_id', 'payment_method_line_id',
                    'bank_reference', 'cheque_reference', 'effective_date'])[0],
                 'graph': graph, 'documents': documents,
                 'analytics': analytics.sorted('id').read(['write_date', 'amount', 'move_line_id']),
                 'company': payment.company_id.read(['write_date', 'period_lock_date', 'fiscalyear_lock_date', 'tax_lock_date']),
                 'journal': payment.journal_id.read(['write_date', 'restrict_mode_hash_table']), 'author': self.env.uid}
        return {'payment_id': payment.id, 'name': payment.name, 'amount': payment.amount,
                'currency': [payment.currency_id.id, payment.currency_id.name], 'state': payment.state,
                'check_number': payment.check_number or False, 'sent': payment.is_move_sent,
                'bank_matched': payment.is_matched, 'can_void': not reason, 'reason': reason,
                'documents': documents, 'version': _digest(stamp)}

    @api.model
    def qorlia_cheque_void_load(self, payment_id):
        return self._qorlia_void_snapshot(self._qorlia_void_payment(payment_id))

    @api.model
    def qorlia_cheque_void_preview(self, payment_id, version):
        current = self.qorlia_cheque_void_load(payment_id)
        if not current['can_void']:
            raise UserError(current['reason'])
        if version != current['version']:
            raise UserError('This cheque or its connected allocations changed. Reload and review again.')
        return {**current, 'review_version': _digest({'version': version, 'action': 'void', 'author': self.env.uid})}

    def _qorlia_void_receipt(self, payment, version, review_version, request_key):
        self._qorlia_cheque_request(version, False, review_version, request_key)
        digest = _digest({'version': version, 'review': review_version, 'action': 'void', 'author': self.env.uid})
        receipt = (payment.qorlia_cheque_void_receipts or {}).get(request_key)
        if receipt and (receipt['hash'] != digest or receipt['author'] != self.env.uid):
            raise ValidationError('This identifier belongs to a different cheque void request.')
        return receipt, digest

    @api.model
    def qorlia_cheque_void_status(self, payment_id, version, review_version, request_key):
        payment = self._qorlia_void_payment(payment_id)
        receipt, _ = self._qorlia_void_receipt(payment, version, review_version, request_key)
        return {'accepted': bool(receipt), 'payment': self._qorlia_void_snapshot(payment, receipt['moves'] if receipt else ())}

    @api.model
    def qorlia_cheque_void_run(self, payment_id, version, review_version, request_key):
        payment = self._qorlia_void_payment(payment_id, lock=True)
        receipt, digest = self._qorlia_void_receipt(payment, version, review_version, request_key)
        if receipt:
            return self.qorlia_cheque_void_status(payment_id, version, review_version, request_key)
        self.qorlia_cheque_void_preview(payment_id, version)
        moves, _, _ = self._qorlia_void_graph(payment)
        partials = moves.line_ids.matched_debit_ids | moves.line_ids.matched_credit_ids
        full = partials.full_reconcile_id
        for table, ids in (('account_move', moves.ids), ('account_move_line', moves.line_ids.ids),
                           ('account_partial_reconcile', partials.ids), ('account_full_reconcile', full.ids),
                           ('account_payment_credit_invoice_line', payment.credit_invoice_lines.ids),
                           ('account_payment_outstanding_invoice_line', payment.outstanding_invoice_lines.ids),
                           ('account_journal', [payment.journal_id.id]), ('res_company', [payment.company_id.id])):
            if ids:
                self.env.cr.execute('SELECT id FROM ' + table + ' WHERE id IN %s ORDER BY id FOR UPDATE', [tuple(ids)])
        self.env.invalidate_all()
        payment.check_access_rule('write')
        review = self.qorlia_cheque_void_preview(payment_id, version)
        if review['review_version'] != review_version:
            raise UserError('Review the connected documents again before voiding this cheque.')
        financial_fields = ['amount', 'date', 'currency_id', 'partner_id', 'journal_id', 'payment_method_line_id',
                            'payment_type', 'partner_type', 'bank_reference', 'cheque_reference', 'effective_date', 'ref', 'check_number']
        before = payment.read(financial_fields)
        lines_before = moves.line_ids.sorted('id').read(['debit', 'credit', 'account_id', 'amount_currency', 'currency_id'])
        payment.action_void_check()
        self.env.invalidate_all()
        affected = moves.exists() | self.env['account.move'].search([('reversed_entry_id', 'in', moves.ids)])
        if (payment.state != 'cancel' or payment.is_move_sent or payment.read(financial_fields) != before
                or moves.line_ids.sorted('id').read(['debit', 'credit', 'account_id', 'amount_currency', 'currency_id']) != lines_before
                or affected._get_unbalanced_moves({'records': affected})):
            raise UserError('Native void changed an unreviewed financial detail or left an unbalanced journal. No void was saved.')
        receipts = dict(payment.qorlia_cheque_void_receipts or {})
        receipts[request_key] = {'hash': digest, 'author': self.env.uid, 'moves': affected.ids}
        payment.write({'qorlia_cheque_void_receipts': receipts})
        return self.qorlia_cheque_void_status(payment_id, version, review_version, request_key)
