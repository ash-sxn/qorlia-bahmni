# SPDX-License-Identifier: LGPL-3.0-or-later
# Copyright 2026 Qorlia contributors.
import hashlib
import json

from odoo import api, fields, models
from odoo.exceptions import AccessError, UserError, ValidationError


REVERSAL_FIELDS = ('date_mode', 'date', 'reason', 'refund_method', 'journal_id')


class InvoiceReversalWorkflow(models.Model):
    _inherit = 'account.move'

    def _qorlia_reversal_access(self):
        if not self.env.user.has_group('account.group_account_invoice'):
            raise AccessError('Your Billing account cannot create credit notes.')
        for model, operation in (('account.move.reversal', 'create'), ('account.move', 'create'),
                                 ('account.move', 'write'), ('account.move.line', 'create'),
                                 ('account.move.line', 'write')):
            self.env[model].check_access_rights(operation)
        self.check_access_rule('write')

    def _qorlia_reversal_wizard(self, values=None):
        self._qorlia_reversal_access()
        if values is not None and (not isinstance(values, dict) or set(values) - set(REVERSAL_FIELDS)):
            raise ValidationError('Use only the reviewed native credit-note fields.')
        values = dict(values or {})
        if values.get('date_mode', 'custom') not in ('custom', 'entry'):
            raise ValidationError('Choose a valid reversal date mode.')
        if values.get('refund_method', 'refund') not in ('refund', 'cancel', 'modify'):
            raise ValidationError('Choose a valid credit-note method.')
        if 'journal_id' in values and (type(values['journal_id']) is not int or values['journal_id'] <= 0):
            raise ValidationError('Choose a valid reversal journal.')
        if values.get('reason', False) is not False and (not isinstance(values['reason'], str) or len(values['reason']) > 500):
            raise ValidationError('The reversal reason must contain at most 500 characters.')
        if 'date' in values:
            try:
                if not isinstance(values['date'], str) or str(fields.Date.to_date(values['date'])) != values['date']:
                    raise ValueError()
            except (ValueError, TypeError):
                raise ValidationError('Enter a valid reversal date.')
        wizard_model = self.env['account.move.reversal'].with_context(active_model='account.move', active_ids=self.ids)
        defaults = wizard_model.default_get(['move_ids', 'company_id', *REVERSAL_FIELDS])
        wizard = wizard_model.new({**defaults, **values})
        wizard.journal_id.check_access_rights('read')
        wizard.journal_id.check_access_rule('read')
        if wizard.journal_id and wizard.journal_id._origin not in wizard.available_journal_ids._origin:
            raise ValidationError('Choose an active native reversal journal in this invoice company.')
        return wizard

    def _qorlia_reversal_snapshot(self, values=None):
        self.ensure_one()
        self.env.flush_all()
        invoice = self._qorlia_invoice_snapshot()
        result = {'invoice': invoice, 'can_reverse': False, 'reason': False, 'values': False,
                  'source_version': False, 'version': False, 'journals': [], 'methods': [],
                  'effective_date': False, 'scheduled': False, 'history': []}
        if self.move_type != 'out_invoice' or self.state != 'posted' or not invoice['ledger_balanced']:
            result['reason'] = 'Create credit notes only from balanced posted customer invoices.'
            return result
        try:
            self._qorlia_reversal_access()
        except AccessError:
            result['reason'] = 'Your Billing account cannot create credit notes.'
            return result
        wizard = self._qorlia_reversal_wizard(values)
        journals = wizard.available_journal_ids._origin.sorted('id')
        journals.check_access_rights('read')
        journals.check_access_rule('read')
        data = {field: wizard[field] for field in REVERSAL_FIELDS if field != 'journal_id'}
        data['journal_id'] = wizard.journal_id._origin.id or False
        data['date'] = str(data['date']) if data['date'] else False
        effective_date = wizard.date if wizard.date_mode == 'custom' else self.date
        scheduled = bool(effective_date and effective_date > fields.Date.context_today(wizard))
        history = self.search([('reversed_entry_id', '=', self.id)], order='id')
        if len(history) > 100:
            raise UserError('More than 100 credit notes require native Billing review.')
        history.check_access_rule('read')
        history_snapshots = [move._qorlia_invoice_snapshot() for move in history]
        moves, reconciliation, removable = self._qorlia_credit_reconciliation_state()
        if len(moves.line_ids) > 1000:
            raise UserError('This reversal involves too many journal lines. Review it in native Billing.')
        accounts = (self.line_ids.account_id | self.disc_acc_id | self.company_id.qorlia_rounding_account_id).sorted('id')
        taxes = self.invoice_line_ids.tax_ids.sorted('id')
        banks = self.env['res.partner.bank'].search([
            ('partner_id', 'in', (self.company_id.partner_id | self.commercial_partner_id).ids),
            ('company_id', 'in', [False, self.company_id.id])], order='id')
        config = {'journals': journals.read(['write_date', 'active', 'company_id', 'type', 'restrict_mode_hash_table']),
            'company': self.company_id.read(['write_date', 'currency_id', 'early_pay_discount_computation',
                'period_lock_date', 'fiscalyear_lock_date', 'tax_lock_date']),
            'accounts': accounts.read(['write_date', 'company_id', 'deprecated', 'account_type', 'reconcile']),
            'taxes': taxes.read(['write_date', 'amount', 'amount_type', 'price_include', 'invoice_repartition_line_ids',
                'refund_repartition_line_ids']),
            'tax_lines': (taxes.invoice_repartition_line_ids | taxes.refund_repartition_line_ids).sorted('id').read(
                ['write_date', 'factor_percent', 'account_id', 'tag_ids']),
            'currency': (self.currency_id | self.company_id.currency_id).sorted('id').read(['write_date', 'active', 'rounding']),
            'rates': self.env['res.currency.rate'].search([('currency_id', 'in', (self.currency_id | self.company_id.currency_id).ids),
                ('company_id', 'in', [False, self.company_id.id])], order='id').read(['write_date', 'name', 'rate']),
            'banks': banks.read(['write_date', 'partner_id', 'company_id', 'sequence']),
            'payment_term': self.invoice_payment_term_id.read(['write_date', 'active']),
            'payment_term_lines': self.invoice_payment_term_id.line_ids.sorted('id').read(['write_date', 'value', 'value_amount',
                'days', 'months', 'end_month', 'days_after', 'discount_percentage', 'discount_days']),
            'today': str(fields.Date.context_today(wizard))}
        source_version = hashlib.sha256(json.dumps({'invoice': invoice['version'], 'history': history_snapshots,
            'reconciliation': reconciliation, 'config': config}, sort_keys=True, default=str).encode()).hexdigest()
        methods = [['refund', 'Editable credit note']]
        # Native Odoo hides full-reversal choices for an invoice whose residual is zero.
        if not self.currency_id.is_zero(self.amount_residual):
            methods += [['cancel', 'Full reversal'], ['modify', 'Full reversal and replacement draft']]
        reason = False
        if data['refund_method'] not in [method[0] for method in methods]:
            reason = 'A fully allocated invoice supports an editable credit note, not automatic full reversal.'
        elif not wizard.journal_id or not effective_date or not self.currency_id.active:
            reason = 'An active native journal, currency and valid reversal date are required.'
        elif data['refund_method'] != 'refund' and not scheduled and not removable:
            reason = 'Your Billing account cannot release the connected allocations required by this reversal.'
        result.update({'values': data, 'source_version': source_version,
            'version': hashlib.sha256(json.dumps({'source': source_version, 'values': data}, sort_keys=True).encode()).hexdigest(),
            'journals': [[journal.id, journal.display_name] for journal in journals], 'methods': methods,
            'effective_date': str(effective_date) if effective_date else False, 'scheduled': scheduled,
            'history': history_snapshots, 'can_reverse': not bool(reason), 'reason': reason})
        return result

    @api.model
    def qorlia_reversal_load(self, invoice_id):
        return self._qorlia_invoice(invoice_id)._qorlia_reversal_snapshot()

    @api.model
    def qorlia_reversal_preview(self, invoice_id, source_version, values):
        invoice = self._qorlia_invoice(invoice_id)
        snapshot = invoice._qorlia_reversal_snapshot(values)
        if not isinstance(source_version, str) or source_version != snapshot['source_version']:
            raise UserError('The invoice or reversal configuration changed. Reload and review it again.')
        return snapshot

    @api.model
    def qorlia_reversal_run(self, invoice_id, version, values):
        if not isinstance(version, str) or len(version) != 64 or not isinstance(values, dict):
            raise ValidationError('Review a valid credit note before confirming it.')
        invoice = self._qorlia_invoice(invoice_id, operation='write')
        invoice._qorlia_reversal_access()
        before = invoice._qorlia_reversal_snapshot(values)
        if version != before['version'] or not before['can_reverse']:
            raise UserError(before['reason'] or 'The invoice changed. Reload and review its current status.')
        moves, _, _ = invoice._qorlia_credit_reconciliation_state()
        partials = moves.line_ids.matched_debit_ids | moves.line_ids.matched_credit_ids
        self.env.cr.execute('SELECT id FROM account_move WHERE id IN %s ORDER BY id FOR UPDATE', [tuple(moves.ids)])
        self.env.cr.execute('SELECT id FROM account_move_line WHERE move_id IN %s ORDER BY id FOR UPDATE', [tuple(moves.ids)])
        if partials:
            self.env.cr.execute('SELECT id FROM account_partial_reconcile WHERE id IN %s ORDER BY id FOR UPDATE', [tuple(partials.ids)])
        self.env.invalidate_all()
        invoice.check_access_rule('write')
        fresh = invoice._qorlia_reversal_snapshot(values)
        if version != fresh['version'] or not fresh['can_reverse']:
            raise UserError('The invoice or reversal configuration changed. Reload and review it again.')
        previous = self.search([('reversed_entry_id', '=', invoice.id)])
        wizard = invoice._qorlia_reversal_wizard(fresh['values'])
        created = wizard.create({**fresh['values'], 'move_ids': [(6, 0, invoice.ids)], 'company_id': invoice.company_id.id})
        created.reverse_moves()
        self.env.invalidate_all()
        credits = self.search([('reversed_entry_id', '=', invoice.id)]) - previous
        replacements = created.new_move_ids.filtered(lambda move: move.move_type == 'out_invoice')
        if len(credits) != 1 or len(replacements) != (1 if fresh['values']['refund_method'] == 'modify' else 0):
            raise UserError('Native Billing did not create the expected credit note and replacement. Nothing was saved.')
        affected = moves | credits | replacements | self.search([('reversed_entry_id', 'in', moves.ids)])
        if affected._get_unbalanced_moves({'records': affected}):
            raise UserError('The reversal produced an unbalanced journal. Nothing was saved.')
        return {'invoice': invoice._qorlia_invoice_snapshot(),
            'credits': [move._qorlia_invoice_snapshot() for move in credits],
            'replacements': [move._qorlia_invoice_snapshot() for move in replacements],
            'scheduled': fresh['scheduled'], 'effective_date': fresh['effective_date']}
