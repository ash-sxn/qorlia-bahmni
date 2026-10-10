# SPDX-License-Identifier: LGPL-3.0-or-later
# Copyright 2026 Qorlia contributors.
import re
import uuid

from odoo import api, fields, models
from odoo.exceptions import AccessError, UserError, ValidationError

from .invoice_draft import _digest
from .native_reports import native_report, report_pdf


class ChequeWorkflow(models.Model):
    _inherit = 'account.payment'

    qorlia_cheque_receipts = fields.Json(copy=False, readonly=True)
    qorlia_cheque_sent_receipts = fields.Json(copy=False, readonly=True)

    @api.model
    def qorlia_cheque_sent_load(self, payment_id):
        payment = self._qorlia_cheque_payment(payment_id)
        reason = False
        try:
            self._qorlia_cheque_payment(payment_id, write=True)
        except (AccessError, UserError) as error:
            reason = str(error)
        return {'payment_id': payment.id, 'name': payment.name, 'amount': payment.amount,
                'currency': [payment.currency_id.id, payment.currency_id.name],
                'journal': payment.journal_id.display_name, 'check_number': payment.check_number or False,
                'sent': payment.is_move_sent, 'bank_matched': payment.is_matched,
                'can_update': not reason, 'reason': reason,
                'version': _digest({'payment': payment.read(['write_date', 'check_number', 'is_move_sent'])[0],
                    'financial': self._qorlia_cheque_financial_state(payment), 'author': self.env.uid})}

    @api.model
    def qorlia_cheque_sent_preview(self, payment_id, version, action):
        if action not in ('mark_sent', 'unmark_sent'):
            raise ValidationError('Select a supported cheque sent-status action.')
        current = self.qorlia_cheque_sent_load(payment_id)
        if not current['can_update']:
            raise AccessError(current['reason'])
        if current['version'] != version:
            raise UserError('The cheque payment changed. Reload and review its sent status again.')
        if current['sent'] == (action == 'mark_sent'):
            raise UserError('This payment already has the requested sent status. Reload before another action.')
        return {**current, 'action': action, 'review_version': _digest({
            'version': version, 'action': action, 'author': self.env.uid})}

    def _qorlia_cheque_sent_request(self, version, review_version, request_key, action):
        if action not in ('mark_sent', 'unmark_sent'):
            raise ValidationError('Select a supported cheque sent-status action.')
        self._qorlia_cheque_request(version, False, review_version, request_key)
        return _digest({'version': version, 'review_version': review_version,
                        'action': action, 'author': self.env.uid})

    def _qorlia_cheque_sent_receipt(self, payment, request_key, digest):
        receipt = (payment.qorlia_cheque_sent_receipts or {}).get(request_key)
        if receipt and (receipt['hash'] != digest or receipt['author'] != self.env.uid):
            raise ValidationError('This identifier belongs to a different cheque sent-status request.')
        return receipt

    @api.model
    def qorlia_cheque_sent_status(self, payment_id, version, review_version, request_key, action):
        digest = self._qorlia_cheque_sent_request(version, review_version, request_key, action)
        payment = self._qorlia_cheque_payment(payment_id)
        receipt = self._qorlia_cheque_sent_receipt(payment, request_key, digest)
        return {'accepted': bool(receipt), 'action': action, 'payment': self.qorlia_cheque_sent_load(payment_id)}

    @api.model
    def qorlia_cheque_sent_run(self, payment_id, version, review_version, request_key, action):
        digest = self._qorlia_cheque_sent_request(version, review_version, request_key, action)
        payment = self._qorlia_cheque_payment(payment_id, write=True, lock=True)
        if self._qorlia_cheque_sent_receipt(payment, request_key, digest):
            return self.qorlia_cheque_sent_status(payment_id, version, review_version, request_key, action)
        review = self.qorlia_cheque_sent_preview(payment_id, version, action)
        if review['review_version'] != review_version:
            raise UserError('Review this cheque sent-status action again before saving.')
        before = self._qorlia_cheque_financial_state(payment)
        number = payment.check_number
        if action == 'mark_sent':
            payment.mark_as_sent()
        else:
            payment.unmark_as_sent()
        payment.invalidate_recordset()
        if (payment.is_move_sent != (action == 'mark_sent') or payment.check_number != number
                or self._qorlia_cheque_financial_state(payment) != before):
            raise UserError('Native Billing changed an unreviewed payment detail. No sent-status request was saved.')
        receipts = dict(payment.qorlia_cheque_sent_receipts or {})
        receipts[request_key] = {'hash': digest, 'author': self.env.uid, 'action': action}
        payment.write({'qorlia_cheque_sent_receipts': receipts})
        return self.qorlia_cheque_sent_status(payment_id, version, review_version, request_key, action)

    def _qorlia_cheque_payment(self, payment_id, write=False, lock=False):
        payment = self._qorlia_receipt_payment(payment_id, lock=lock)
        for record in (payment.company_id, payment.journal_id, payment.payment_method_id):
            record.check_access_rights('read')
            record.check_access_rule('read')
        if payment.payment_method_id.code not in ('check_printing', 'pdc') or payment.journal_id.type != 'bank':
            raise UserError('Select a posted bank cheque or post-dated cheque payment.')
        if write:
            if not self.env.user.has_group('account.group_account_invoice'):
                raise AccessError('Your Billing account cannot update cheques.')
            for record in (payment, payment.move_id):
                record.check_access_rights('write')
                record.check_access_rule('write')
        if lock:
            self.env.cr.execute('SELECT id FROM account_move WHERE id = %s FOR UPDATE', [payment.move_id.id])
            self.env.cr.execute('SELECT id FROM account_journal WHERE id = %s FOR UPDATE', [payment.journal_id.id])
            self.env.cr.execute('SELECT id FROM res_company WHERE id = %s FOR UPDATE', [payment.company_id.id])
            for record in (payment.move_id, payment.journal_id, payment.company_id):
                record.invalidate_recordset()
        return payment

    def _qorlia_cheque_report(self, payment):
        layout = payment.company_id.account_check_printing_layout
        options = dict(payment.company_id._fields['account_check_printing_layout']._description_selection(self.env))
        if not layout or layout == 'disabled' or layout not in options:
            raise UserError('No native cheque layout is configured. Ask your Billing administrator to install and verify a bank-compatible layout.')
        report = self.env.ref(layout, raise_if_not_found=False)
        if not report or report._name != 'ir.actions.report':
            raise UserError('The configured cheque layout is not a native report.')
        return native_report(self.env, 'cheque', {'cheque': (layout, report.report_name)}, 'account.payment', 'cheque')

    def _qorlia_cheque_financial_state(self, payment):
        return {'payment': payment.read(['amount', 'date', 'currency_id', 'partner_id', 'journal_id',
                    'payment_method_line_id', 'payment_type', 'partner_type', 'state', 'is_matched',
                    'bank_reference', 'cheque_reference', 'effective_date', 'ref'])[0],
                'lines': payment.move_id.line_ids.sorted('id').read(['debit', 'credit', 'amount_currency',
                    'account_id', 'matched_debit_ids', 'matched_credit_ids']),
                'invoices': payment.reconciled_invoice_ids.sorted('id').read(['state', 'amount_total', 'invoice_total', 'amount_residual'])}

    @api.model
    def qorlia_cheque_load(self, payment_id):
        payment = self._qorlia_cheque_payment(payment_id)
        reason, report = False, False
        try:
            self._qorlia_cheque_payment(payment_id, write=True)
            report = self._qorlia_cheque_report(payment)
        except (AccessError, UserError) as error:
            reason = str(error)
        manual = payment.journal_id.check_manual_sequencing
        if not reason and manual and not payment.check_number:
            reason = 'Native Billing has not assigned a cheque number. Ask your Billing administrator to review the journal sequencing.'
        version = _digest({'payment': payment.read(['write_date', 'check_number', 'is_move_sent'])[0],
            'financial': self._qorlia_cheque_financial_state(payment), 'author': self.env.uid,
            'journal': payment.journal_id.read(['write_date', 'check_manual_sequencing'])[0],
            'company': payment.company_id.read(['write_date', 'account_check_printing_layout'])[0],
            'report': report.read(['write_date', 'report_name', 'groups_id', 'paperformat_id']) if report else False})
        return {'payment_id': payment.id, 'name': payment.name, 'version': version,
                'amount': payment.amount, 'currency': [payment.currency_id.id, payment.currency_id.name],
                'journal': payment.journal_id.display_name, 'manual_sequencing': manual,
                'check_number': payment.check_number or False, 'sent': payment.is_move_sent,
                'bank_matched': payment.is_matched, 'can_print': not reason and not payment.is_move_sent,
                'reason': reason or ('This cheque is already marked sent. Use its accepted request to download again without assigning a new number.' if payment.is_move_sent else False),
                'layout': report.name if report else False}

    def _qorlia_cheque_number(self, payment, check_number):
        if payment.journal_id.check_manual_sequencing:
            if check_number is not False:
                raise ValidationError('The native journal already assigns cheque numbers. Do not supply another number.')
            return payment.check_number
        if (not isinstance(check_number, str) or not re.fullmatch(r'[0-9]{1,19}', check_number)
                or int(check_number) > 9223372036854775807):
            raise ValidationError('Enter the numeric cheque number printed on the cheque stationery, using at most 19 digits.')
        return check_number

    @api.model
    def qorlia_cheque_preview(self, payment_id, version, check_number=False):
        payment = self._qorlia_cheque_payment(payment_id, write=True)
        current = self.qorlia_cheque_load(payment_id)
        if not current['can_print']:
            raise UserError(current['reason'] or 'Cheque printing is unavailable.')
        if version != current['version']:
            raise UserError('The payment or cheque configuration changed. Reload and review again.')
        number = self._qorlia_cheque_number(payment, check_number)
        return {**current, 'number_to_print': number, 'review_version': _digest({
            'version': version, 'number': number, 'author': self.env.uid})}

    def _qorlia_cheque_request(self, version, check_number, review_version, request_key):
        try:
            if str(uuid.UUID(request_key)) != request_key:
                raise ValueError()
        except (TypeError, ValueError, AttributeError):
            raise ValidationError('Use a valid cheque print request.')
        if (not isinstance(version, str) or len(version) != 64 or not isinstance(review_version, str)
                or len(review_version) != 64 or check_number is not False and not isinstance(check_number, str)):
            raise ValidationError('Review the cheque before requesting its PDF.')
        return _digest({'version': version, 'number': check_number, 'review_version': review_version, 'author': self.env.uid})

    def _qorlia_cheque_receipt(self, payment, request_key, digest):
        receipt = (payment.qorlia_cheque_receipts or {}).get(request_key)
        if receipt and (receipt['hash'] != digest or receipt['author'] != self.env.uid):
            raise ValidationError('This identifier belongs to a different cheque request.')
        return receipt

    def _qorlia_cheque_download(self, payment, receipt):
        report = self._qorlia_cheque_report(payment)
        if (payment.check_number != receipt['number'] or report.id != receipt['report_id']
                or not payment.is_move_sent):
            raise UserError('The accepted cheque number, layout or sent status changed. Ask your Billing administrator to review it.')
        return report_pdf(report, payment, 'cheque', 'payment_id', payment.name)

    @api.model
    def qorlia_cheque_status(self, payment_id, version, review_version, request_key, check_number=False):
        digest = self._qorlia_cheque_request(version, check_number, review_version, request_key)
        payment = self._qorlia_cheque_payment(payment_id)
        receipt = self._qorlia_cheque_receipt(payment, request_key, digest)
        return {'accepted': bool(receipt), 'payment': self.qorlia_cheque_load(payment_id)}

    @api.model
    def qorlia_cheque_download(self, payment_id, version, review_version, request_key, check_number=False):
        digest = self._qorlia_cheque_request(version, check_number, review_version, request_key)
        payment = self._qorlia_cheque_payment(payment_id, lock=True)
        receipt = self._qorlia_cheque_receipt(payment, request_key, digest)
        if not receipt:
            raise UserError('No accepted cheque print request was found. Check status before attempting a new print.')
        return self._qorlia_cheque_download(payment, receipt)

    @api.model
    def qorlia_cheque_download_current(self, payment_id):
        payment = self._qorlia_cheque_payment(payment_id, lock=True)
        report = self._qorlia_cheque_report(payment)
        if not payment.is_move_sent or not payment.check_number:
            raise UserError('Only an already numbered cheque marked sent can be downloaded without a new print review.')
        return self._qorlia_cheque_download(payment, {'number': payment.check_number, 'report_id': report.id})

    @api.model
    def qorlia_cheque_print(self, payment_id, version, review_version, request_key, check_number=False):
        digest = self._qorlia_cheque_request(version, check_number, review_version, request_key)
        payment = self._qorlia_cheque_payment(payment_id, write=True, lock=True)
        receipt = self._qorlia_cheque_receipt(payment, request_key, digest)
        if receipt:
            return {'payment': self.qorlia_cheque_load(payment_id), 'pdf': self._qorlia_cheque_download(payment, receipt)}
        review = self.qorlia_cheque_preview(payment_id, version, check_number)
        if review['review_version'] != review_version:
            raise UserError('Review this cheque number again before printing.')
        report = self._qorlia_cheque_report(payment)
        before = self._qorlia_cheque_financial_state(payment)
        # The installed extension overrides print_checks with an old API. Use its current native wizard and renderer.
        if payment.journal_id.check_manual_sequencing:
            payment.do_print_checks()
        else:
            self.env['print.prenumbered.checks'].with_context(payment_ids=payment.ids).create({
                'next_check_number': check_number}).print_checks()
        payment.invalidate_recordset()
        if (payment.check_number != review['number_to_print'] or not payment.is_move_sent
                or self._qorlia_cheque_financial_state(payment) != before):
            raise UserError('Native Billing changed an unreviewed payment detail. No cheque request was saved.')
        pdf = report_pdf(report, payment, 'cheque', 'payment_id', payment.name)
        receipts = dict(payment.qorlia_cheque_receipts or {})
        receipts[request_key] = {'hash': digest, 'author': self.env.uid,
                                 'number': payment.check_number, 'report_id': report.id}
        payment.write({'qorlia_cheque_receipts': receipts})
        return {'payment': self.qorlia_cheque_load(payment_id), 'pdf': pdf}
