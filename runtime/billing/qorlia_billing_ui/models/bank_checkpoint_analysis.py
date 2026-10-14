# SPDX-License-Identifier: LGPL-3.0-or-later
# Copyright 2026 Qorlia contributors.
import base64
import io
from datetime import date

from odoo import api, models
from odoo.exceptions import UserError, ValidationError
from odoo.tools.misc import xlsxwriter

from .invoice_draft import _digest


MEASURES = {'count': 'Checkpoint count', 'balance_start': 'Opening balance',
    'balance_end': 'Computed ending balance', 'balance_end_real': 'Recorded ending balance'}


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
        result = {'search': search, 'state': state, 'journal_type': journal_type, 'period': period,
            'date_from': date_from, 'date_to': date_to, 'total_count': sum(row['count'] for row in rows), 'rows': rows}
        result['version'] = _digest({'analysis': result, 'author': self.env.uid, 'companies': self.env.companies.ids})
        return result

    @api.model
    def qorlia_checkpoint_analysis_export(self, version, measure='balance_end', transposed=False,
            search='', state='all', journal_type='all', period='month', date_from=False, date_to=False):
        if (not isinstance(version, str) or len(version) != 64
                or any(char not in '0123456789abcdef' for char in version)
                or not isinstance(measure, str) or measure not in MEASURES or type(transposed) is not bool):
            raise ValidationError('Use an exact checkpoint analysis version, measure and orientation.')
        analysis = self.qorlia_checkpoint_analysis(search, state, journal_type, period, date_from, date_to)
        if analysis['version'] != version:
            raise UserError('Checkpoint analysis changed. Refresh it before downloading Excel.')
        if not analysis['rows']:
            raise UserError('There are no checkpoint values to export.')
        journals, periods, cells, totals = {}, {}, {}, {}
        for row in analysis['rows']:
            journal = row['journal_id'][0] if row['journal_id'] else False
            posted = row['period_from']
            journals.setdefault(journal, row)
            periods.setdefault(posted, row)
            cells[journal, posted] = row
            totals[journal] = totals.get(journal, 0) + row[measure]
        columns = periods if transposed else journals
        table_rows = journals if transposed else periods
        if len(columns) + (2 if transposed else 1) > 16384 or len(table_rows) + 10 > 1048576:
            raise UserError('This pivot exceeds Excel limits. Filter further or flip its axes.')
        output = io.BytesIO()
        with xlsxwriter.Workbook(output, {'in_memory': True, 'strings_to_formulas': False,
                'strings_to_urls': False}) as workbook:
            sheet = workbook.add_worksheet('Checkpoint analysis')
            heading = workbook.add_format({'bold': True, 'bg_color': '#DCE9E0', 'text_wrap': True})
            numeric_formats = {}
            for journal, row in journals.items():
                currency = self.env['res.currency'].browse(row['currency_id'][0] if row['currency_id'] else [])
                digits = currency.decimal_places if currency and measure != 'count' else 0
                numeric_formats[journal] = workbook.add_format({'num_format': '#,##0' + ('.' + '0' * digits if digits else '')})
            sheet.write_string(0, 0, 'Qorlia statement checkpoint analysis', heading)
            sheet.write_string(1, 0, 'Sums of checkpoint values, not bank cash flow or the current closing balance.')
            sheet.write_string(2, 0, 'Search: ' + search)
            sheet.write_string(3, 0, 'Status: %s | Journal type: %s' % (state, journal_type))
            sheet.write_string(4, 0, 'Group: %s | From: %s | Through: %s' % (period, date_from or 'Any', date_to or 'Any'))
            sheet.write_string(5, 0, 'Measure: ' + MEASURES[measure])
            sheet.write_string(6, 0, 'Snapshot: ' + version)

            def journal_label(row):
                return '%s (%s)' % (row['journal_id'][1] if row['journal_id'] else 'No journal',
                    row['currency_id'][1] if row['currency_id'] else 'No journal currency')

            sheet.write_string(8, 0, 'Journal' if transposed else 'Period', heading)
            for column, row in enumerate(columns.values(), 1):
                sheet.write_string(8, column, row['period_label'] if transposed else journal_label(row), heading)
            if transposed:
                sheet.write_string(8, len(columns) + 1, 'Sum of checkpoint values', heading)
            for index, (key, group) in enumerate(table_rows.items(), 9):
                sheet.write_string(index, 0, journal_label(group) if transposed else group['period_label'])
                for column, column_key in enumerate(columns, 1):
                    journal, posted = (key, column_key) if transposed else (column_key, key)
                    cell = cells.get((journal, posted))
                    if cell:
                        sheet.write_number(index, column, cell[measure], numeric_formats[journal])
                    else:
                        sheet.write_string(index, column, 'No checkpoints')
                if transposed:
                    sheet.write_number(index, len(columns) + 1, totals[key], numeric_formats[key])
            if not transposed:
                index = len(table_rows) + 9
                sheet.write_string(index, 0, 'Sum of checkpoint values', heading)
                for column, journal in enumerate(journals, 1):
                    sheet.write_number(index, column, totals[journal], numeric_formats[journal])
            sheet.set_column(0, 0, 46)
            sheet.set_column(1, len(columns) + (1 if transposed else 0), 24)
            sheet.freeze_panes(9, 1)
        content = output.getvalue()
        # shortcut: synchronous JSON download; stream larger exports when required by accepted workloads.
        if len(content) > 10 * 1024 * 1024:
            raise UserError('This Excel export exceeds 10 MiB. Narrow the analysis filters.')
        return {'version': version, 'measure': measure, 'transposed': transposed,
            'filename': 'Qorlia_Checkpoints.xlsx', 'mimetype': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'byte_count': len(content), 'content': base64.b64encode(content).decode('ascii')}
