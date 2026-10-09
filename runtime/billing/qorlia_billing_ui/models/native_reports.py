# SPDX-License-Identifier: LGPL-3.0-or-later
# Copyright 2026 Qorlia contributors.
import base64
import re

from odoo.exceptions import AccessError, UserError, ValidationError

MAX_PDF_BYTES = 10 * 1024 * 1024


def native_report(env, key, reports, model, label):
    if not isinstance(key, str) or key not in reports:
        raise ValidationError('Select an available %s report.' % label)
    xmlid, template = reports[key]
    report = env.ref(xmlid, raise_if_not_found=False)
    if (not report or report.model != model or report.report_type != 'qweb-pdf'
            or report.report_name != template):
        raise UserError('The native %s report is not configured correctly.' % label)
    report.check_access_rights('read')
    report.check_access_rule('read')
    if report.groups_id and not (report.groups_id & env.user.groups_id) and not env.su:
        raise AccessError('Your Billing account cannot print this report.')
    return report


def report_menu(env, reports, model, label):
    result = []
    for key in reports:
        try:
            report = native_report(env, key, reports, model, label)
        except AccessError:
            continue
        result.append({'key': key, 'name': report.name})
    return result


def report_pdf(report, record, key, id_field, label):
    # Preserve installed layout and native archive behavior, without caller-selected templates or context.
    pdf, output_type = record.env['ir.actions.report']._render_qweb_pdf(report.id, res_ids=record.ids)
    if output_type != 'pdf' or not isinstance(pdf, bytes) or not pdf.startswith(b'%PDF-'):
        raise UserError('Native Billing did not produce a PDF. Ask your Billing administrator to check reporting.')
    if len(pdf) > MAX_PDF_BYTES:
        raise UserError('This PDF exceeds the download limit. Open it in native Billing.')
    label = re.sub(r'[^A-Za-z0-9_-]+', '_', label).strip('_')[:100] or 'Billing'
    return {id_field: record.id, 'filename': '%s_%s_%s.pdf' % (label, record.id, key),
            'mimetype': 'application/pdf', 'byte_count': len(pdf), 'content': base64.b64encode(pdf).decode('ascii')}
