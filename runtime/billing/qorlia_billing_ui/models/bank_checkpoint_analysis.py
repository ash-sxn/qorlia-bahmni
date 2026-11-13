# SPDX-License-Identifier: LGPL-3.0-or-later
# Copyright 2026 Qorlia contributors.
from datetime import date

from odoo import api, models
from odoo.exceptions import ValidationError


class BankCheckpointAnalysis(models.Model):
    _inherit = 'account.bank.statement'

    @api.model
    def qorlia_checkpoint_analysis(self, search='', state='all', journal_type='all',
            period='month', date_from=False, date_to=False):
        domain = self._qorlia_checkpoint_domain(search, state, journal_type)
        if period not in ('day', 'week', 'month', 'quarter', 'year', 'journal'):
            raise ValidationError('Select a native checkpoint date or journal grouping.')
        for value in (date_from, date_to):
            if value is not False:
                try:
                    if not isinstance(value, str) or date.fromisoformat(value).isoformat() != value:
                        raise ValueError()
                except (TypeError, ValueError):
                    raise ValidationError('Use calendar dates in YYYY-MM-DD format.')
        if date_from and date_to and date_from > date_to:
            raise ValidationError('The start date must not follow the end date.')
        if date_from:
            domain.append(('date', '>=', date_from))
        if date_to:
            domain.append(('date', '<=', date_to))
        records = self.search(domain)
        records._qorlia_checkpoint_access()
        # Stored balances must not reveal amounts from inaccessible linked entries.
        for checkpoint in records:
            checkpoint._qorlia_checkpoint_lines()
            checkpoint._qorlia_checkpoint_previous()
        date_group = 'date:' + period if period != 'journal' else False
        grouped = self.read_group(domain,
            ['balance_start:sum', 'balance_end:sum', 'balance_end_real:sum', 'checkpoint_count:count(id)'],
            ['journal_id'] + ([date_group] if date_group else []), lazy=False)
        rows = []
        for group in grouped:
            journal = self.env['account.journal'].browse(group['journal_id'][0] if group['journal_id'] else [])
            journal.check_access_rights('read')
            journal.check_access_rule('read')
            currency = journal.currency_id or journal.company_id.currency_id
            currency.check_access_rights('read')
            currency.check_access_rule('read')
            bounds = group.get('__range', {}).get(date_group) if date_group else None
            rows.append({
                'journal_id': group['journal_id'],
                'currency_id': [currency.id, currency.name] if currency else False,
                'period_label': group.get(date_group) or ('All dates' if not date_group else 'No posted date'),
                'period_from': bounds['from'] if bounds else False,
                'period_to': bounds['to'] if bounds else False,
                'count': group['checkpoint_count'],
                'balance_start': group['balance_start'],
                'balance_end': group['balance_end'],
                'balance_end_real': group['balance_end_real'],
            })
        rows.sort(key=lambda row: (row['period_from'] or '', row['journal_id'][0] if row['journal_id'] else 0))
        return {'search': search, 'state': state, 'journal_type': journal_type, 'period': period,
            'date_from': date_from, 'date_to': date_to, 'total_count': sum(row['count'] for row in rows), 'rows': rows}
