# SPDX-License-Identifier: LGPL-3.0-or-later
# Copyright 2026 Qorlia contributors.
from odoo import api, models

from .native_reports import native_report, report_menu, report_pdf

REPORTS = {
    'quotation': ('sale.action_report_saleorder', 'sale.report_saleorder'),
    'proforma': ('sale.action_report_pro_forma_invoice', 'sale.report_saleorder_pro_forma'),
    'discount_summary': ('bahmni_sale.sale_summarized_discount_head', 'bahmni_sale.report_discount_heads_summarized'),
}


class SaleOrder(models.Model):
    _inherit = 'sale.order'

    @api.model
    def qorlia_order_report_list(self, order_id):
        self._qorlia_order(order_id, states=None)
        return {'order_id': order_id, 'reports': report_menu(self.env, REPORTS, 'sale.order', 'order')}

    @api.model
    def qorlia_order_report_download(self, order_id, report_key):
        order = self._qorlia_order(order_id, lock=True, states=None)
        order.order_line.check_access_rights('read')
        order.order_line.check_access_rule('read')
        report = native_report(self.env, report_key, REPORTS, 'sale.order', 'order')
        return report_pdf(report, order, report_key, 'order_id', order._get_report_base_filename())
