# SPDX-License-Identifier: LGPL-3.0-or-later
import copy
import uuid

from odoo.exceptions import AccessError, UserError, ValidationError
from odoo.tests import TransactionCase, tagged


@tagged('post_install', '-at_install')
class DraftAdapterTest(TransactionCase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.orders = cls.env['sale.order']
        cls.customer = cls.env['res.partner'].create({'name': 'QorliaQA Adapter customer', 'customer_rank': 1})
        cls.product = cls.env['product.product'].create({'name': 'QorliaQA Adapter consultation',
            'type': 'service', 'list_price': 500, 'invoice_policy': 'order', 'taxes_id': [(6, 0, [])]})
        cls.shop = cls.env['sale.shop'].search([('company_id', '=', cls.env.company.id)], limit=1)
        if not cls.shop:
            warehouse = cls.env['stock.warehouse'].search([('company_id', '=', cls.env.company.id)], limit=1)
            term = cls.env['account.payment.term'].search([], limit=1)
            pricelist = cls.env['product.pricelist'].search([], limit=1)
            cls.shop = cls.env['sale.shop'].create({'name': 'QorliaQA Adapter shop',
                'company_id': cls.env.company.id, 'warehouse_id': warehouse.id,
                'location_id': warehouse.lot_stock_id.id, 'payment_default_id': term.id,
                'pricelist_id': pricelist.id})

    def payload(self, snapshot):
        return {key: snapshot[key] for key in ('id', 'version', 'values', 'lines')}

    def draft(self):
        draft = self.orders.qorlia_draft_load()
        draft['values']['partner_id'] = self.customer.id
        draft = self.orders.qorlia_draft_preview(self.payload(draft), {'field': 'partner_id'})
        draft['values']['shop_id'] = self.shop.id
        draft = self.orders.qorlia_draft_preview(self.payload(draft), {'field': 'shop_id'})
        draft['lines'].append({'id': False, 'values': {'product_id': self.product.id,
            'name': '', 'product_uom_qty': 1, 'discount': 0, 'display_type': False, 'sequence': 10}})
        return self.orders.qorlia_draft_preview(self.payload(draft), {'field': 'product_id', 'line': 0})

    def test_native_defaults_preview_save_and_retry(self):
        before = self.orders.search_count([])
        draft = self.draft()
        self.assertEqual(self.orders.search_count([]), before)
        self.assertEqual(draft['values']['warehouse_id'], self.shop.warehouse_id.id)
        self.assertEqual(draft['values']['payment_term_id'], self.shop.payment_default_id.id)
        self.assertEqual(draft['lines'][0]['values']['price_unit'], 500)
        self.assertEqual(draft['totals']['amount_total'], 500)
        draft['lines'][0]['values']['product_uom_qty'] = 2
        draft['lines'][0]['values']['discount'] = 10
        draft = self.orders.qorlia_draft_preview(self.payload(draft), {'field': 'discount', 'line': 0})
        self.assertEqual(draft['totals']['amount_total'], 900)
        key = str(uuid.uuid4())
        saved = self.orders.qorlia_draft_save(self.payload(draft), key)
        retry = self.orders.qorlia_draft_save(self.payload(draft), key)
        self.assertEqual(saved['id'], retry['id'])
        self.assertEqual(self.orders.search_count([]), before + 1)
        order = self.orders.browse(saved['id'])
        self.assertEqual(order.state, 'draft')
        self.assertFalse(order.invoice_ids)
        self.assertFalse(order.picking_ids)
        self.assertEqual(order.amount_total, 900)
        different = copy.deepcopy(self.payload(draft))
        different['values']['provider_name'] = 'Another request'
        with self.assertRaises(ValidationError):
            self.orders.qorlia_draft_save(different, key)

    def test_version_conflicts_and_confirmed_state(self):
        saved = self.orders.qorlia_draft_save(self.payload(self.draft()), str(uuid.uuid4()))
        order = self.orders.browse(saved['id'])
        edited = self.payload(saved)
        edited['values']['provider_name'] = 'QorliaQA Edited provider'
        updated = self.orders.qorlia_draft_save(edited, str(uuid.uuid4()))
        self.assertEqual(order.provider_name, 'QorliaQA Edited provider')
        with self.assertRaises(UserError):
            self.orders.qorlia_draft_save(edited, str(uuid.uuid4()))
        with self.assertRaises(UserError):
            self.orders.qorlia_draft_preview(edited, {'field': 'provider_name'})
        order.order_line.write({'name': 'External line edit'})
        with self.assertRaises(UserError):
            self.orders.qorlia_draft_save(self.payload(updated), str(uuid.uuid4()))
        fresh = self.orders.qorlia_draft_load(order.id)
        order.write({'state': 'sale'})
        with self.assertRaises(UserError):
            self.orders.qorlia_draft_save(self.payload(fresh), str(uuid.uuid4()))

    def test_metadata_edit_preserves_manual_tax_and_price(self):
        tax = self.env['account.tax'].create({'name': 'QorliaQA Adapter sales tax',
            'amount': 5, 'type_tax_use': 'sale', 'company_id': self.env.company.id})
        draft = self.draft()
        draft['lines'][0]['values']['price_unit'] = 650
        draft = self.orders.qorlia_draft_preview(self.payload(draft), {'field': 'price_unit', 'line': 0})
        draft['lines'][0]['values']['tax_id'] = tax.ids
        draft = self.orders.qorlia_draft_preview(self.payload(draft), {'field': 'tax_id', 'line': 0})
        saved = self.orders.qorlia_draft_save(self.payload(draft), str(uuid.uuid4()))
        self.assertEqual(saved['totals']['amount_tax'], 32.5)
        saved['values']['provider_name'] = 'QorliaQA Changed provider'
        preview = self.orders.qorlia_draft_preview(self.payload(saved), {'field': 'provider_name'})
        self.assertEqual(preview['lines'][0]['values']['price_unit'], 650)
        self.assertEqual(preview['lines'][0]['values']['tax_id'], tax.ids)
        self.assertEqual(preview['totals']['amount_tax'], 32.5)
        self.assertIn('account.tax:%s' % tax.id, preview['labels'])
        updated = self.orders.qorlia_draft_save(self.payload(preview), str(uuid.uuid4()))
        self.assertEqual(updated['lines'][0]['values']['tax_id'], tax.ids)
        self.assertEqual(updated['totals']['amount_tax'], 32.5)
        self.assertEqual(updated['totals']['amount_total'], saved['totals']['amount_total'])

    def test_rejects_foreign_items_and_unsafe_fields(self):
        first = self.orders.qorlia_draft_save(self.payload(self.draft()), str(uuid.uuid4()))
        second = self.orders.qorlia_draft_save(self.payload(self.draft()), str(uuid.uuid4()))
        payload = self.payload(first)
        payload['lines'][0]['id'] = second['lines'][0]['id']
        with self.assertRaises(ValidationError):
            self.orders.qorlia_draft_save(payload, str(uuid.uuid4()))
        payload = self.payload(self.draft())
        payload['values']['state'] = 'sale'
        with self.assertRaises(ValidationError):
            self.orders.qorlia_draft_save(payload, str(uuid.uuid4()))
        payload = self.payload(self.draft())
        payload['lines'][0]['values']['price_unit'] = float('nan')
        with self.assertRaises(ValidationError):
            self.orders.qorlia_draft_save(payload, str(uuid.uuid4()))
        payload = self.payload(self.draft())
        payload['lines'][0]['values']['product_uom'] = self.env.ref('uom.product_uom_hour').id
        with self.assertRaises(ValidationError):
            self.orders.qorlia_draft_save(payload, str(uuid.uuid4()))
        payload = self.payload(self.draft())
        payload['values']['chargeable_amount'] = -1
        with self.assertRaises(ValidationError):
            self.orders.qorlia_draft_save(payload, str(uuid.uuid4()))

    def test_native_permissions_apply_to_direct_calls(self):
        user = self.env['res.users'].with_context(no_reset_password=True).create({
            'name': 'QorliaQA No billing rights', 'login': 'qorlia-qa-no-billing',
            'groups_id': [(6, 0, [self.env.ref('base.group_user').id])],
            'company_id': self.env.company.id, 'company_ids': [(6, 0, self.env.company.ids)],
        })
        with self.assertRaises(AccessError):
            self.orders.with_user(user).qorlia_draft_load()
        with self.assertRaises(AccessError):
            self.orders.with_user(user).qorlia_draft_save(self.payload(self.draft()), str(uuid.uuid4()))
        saved = self.orders.qorlia_draft_save(self.payload(self.draft()), str(uuid.uuid4()))
        workflow = self.orders.qorlia_order_workflow_load(saved['id'])
        with self.assertRaises(AccessError):
            self.orders.with_user(user).qorlia_order_workflow_load(saved['id'])
        with self.assertRaises(AccessError):
            self.orders.with_user(user).qorlia_order_workflow_run(saved['id'], workflow['version'], 'confirm')

    def test_workflow_native_confirmation_and_regular_invoice(self):
        self.env['ir.config_parameter'].set_param('bahmni_sale.is_invoice_automated', False)
        saved = self.orders.qorlia_draft_save(self.payload(self.draft()), str(uuid.uuid4()))
        ready = self.orders.qorlia_order_workflow_load(saved['id'])
        self.assertTrue(ready['can_confirm'])
        self.assertFalse(ready['automation']['invoice'])
        confirmed = self.orders.qorlia_order_workflow_run(saved['id'], ready['version'], 'confirm')
        self.assertIn(confirmed['state'], ('sale', 'done'))
        self.assertFalse(confirmed['invoices'])
        self.assertTrue(confirmed['can_invoice'])
        invoiced = self.orders.qorlia_order_workflow_run(saved['id'], confirmed['version'], 'invoice')
        self.assertEqual(len(invoiced['invoices']), 1)
        self.assertEqual(invoiced['invoices'][0]['state'], 'draft')
        self.assertEqual(invoiced['invoices'][0]['total'], 500)
        self.assertFalse(invoiced['can_invoice'])
        self.assertFalse(invoiced['pickings'])
        with self.assertRaises(UserError):
            self.orders.qorlia_order_workflow_run(saved['id'], confirmed['version'], 'invoice')
        self.assertEqual(len(self.orders.browse(saved['id']).invoice_ids), 1)

    def test_workflow_discloses_native_automatic_invoice_posting(self):
        self.env['ir.config_parameter'].set_param('bahmni_sale.is_invoice_automated', True)
        saved = self.orders.qorlia_draft_save(self.payload(self.draft()), str(uuid.uuid4()))
        ready = self.orders.qorlia_order_workflow_load(saved['id'])
        self.assertTrue(ready['automation']['invoice'])
        result = self.orders.qorlia_order_workflow_run(saved['id'], ready['version'], 'confirm')
        self.assertEqual(len(result['invoices']), 1)
        self.assertEqual(result['invoices'][0]['state'], 'posted')
        self.assertEqual(result['invoices'][0]['total'], 500)
        self.assertEqual(self.orders.browse(saved['id']).invoice_ids.payment_state, 'not_paid')
        self.assertFalse(result['can_confirm'])
        self.assertFalse(result['can_invoice'])
        with self.assertRaises(UserError):
            self.orders.qorlia_order_workflow_run(saved['id'], ready['version'], 'confirm')

    def test_workflow_rejects_changed_settings_and_order(self):
        self.env['ir.config_parameter'].set_param('bahmni_sale.is_invoice_automated', False)
        saved = self.orders.qorlia_draft_save(self.payload(self.draft()), str(uuid.uuid4()))
        ready = self.orders.qorlia_order_workflow_load(saved['id'])
        self.env['ir.config_parameter'].set_param('bahmni_sale.is_invoice_automated', True)
        with self.assertRaises(UserError):
            self.orders.qorlia_order_workflow_run(saved['id'], ready['version'], 'confirm')
        self.assertEqual(self.orders.browse(saved['id']).state, 'draft')
        fresh = self.orders.qorlia_order_workflow_load(saved['id'])
        self.orders.browse(saved['id']).order_line.write({'price_unit': 650})
        with self.assertRaises(UserError):
            self.orders.qorlia_order_workflow_run(saved['id'], fresh['version'], 'confirm')
        with self.assertRaises(ValidationError):
            self.orders.qorlia_order_workflow_run(saved['id'], fresh['version'], 'action_post')

    def test_posting_rejects_unbalanced_document_discount_and_rolls_back_confirmation(self):
        self.env['ir.config_parameter'].set_param('bahmni_sale.is_invoice_automated', True)
        draft = self.draft()
        draft['values']['discount_type'] = 'fixed'
        draft = self.orders.qorlia_draft_preview(self.payload(draft), {'field': 'discount_type'})
        draft['values']['discount'] = 25
        draft = self.orders.qorlia_draft_preview(self.payload(draft), {'field': 'discount'})
        draft['values']['disc_acc_id'] = self.env['account.account'].search([
            ('account_type', '=', 'income_other'), ('company_id', '=', self.env.company.id)], limit=1).id
        saved = self.orders.qorlia_draft_save(self.payload(draft), str(uuid.uuid4()))
        ready = self.orders.qorlia_order_workflow_load(saved['id'])
        with self.assertRaisesRegex(UserError, 'journal entries must balance'), self.env.cr.savepoint():
            self.orders.qorlia_order_workflow_run(saved['id'], ready['version'], 'confirm')
        order = self.orders.browse(saved['id'])
        order.invalidate_recordset()
        self.assertEqual(order.state, 'draft')
        self.assertFalse(order.invoice_ids)

    def test_posting_rejects_unbalanced_native_rounding(self):
        self.env['ir.config_parameter'].set_param('bahmni_sale.is_invoice_automated', False)
        saved = self.orders.qorlia_draft_save(self.payload(self.draft()), str(uuid.uuid4()))
        ready = self.orders.qorlia_order_workflow_load(saved['id'])
        confirmed = self.orders.qorlia_order_workflow_run(saved['id'], ready['version'], 'confirm')
        invoiced = self.orders.qorlia_order_workflow_run(saved['id'], confirmed['version'], 'invoice')
        invoice = self.env['account.move'].browse(invoiced['invoices'][0]['id'])
        invoice.write({'round_off_amount': 0.25})
        with self.assertRaisesRegex(UserError, 'journal entries must balance'), self.env.cr.savepoint():
            invoice.action_post()
        invoice.invalidate_recordset()
        self.assertEqual(invoice.state, 'draft')
        self.assertTrue(invoice.company_id.currency_id.is_zero(sum(invoice.line_ids.mapped('balance'))))

    def test_invoice_workflow_posts_balanced_invoice_once_without_payment(self):
        self.env['ir.config_parameter'].set_param('bahmni_sale.is_invoice_automated', False)
        saved = self.orders.qorlia_draft_save(self.payload(self.draft()), str(uuid.uuid4()))
        ready = self.orders.qorlia_order_workflow_load(saved['id'])
        confirmed = self.orders.qorlia_order_workflow_run(saved['id'], ready['version'], 'confirm')
        invoiced = self.orders.qorlia_order_workflow_run(saved['id'], confirmed['version'], 'invoice')
        moves = self.env['account.move']
        invoice_id = invoiced['invoices'][0]['id']
        snapshot = moves.qorlia_invoice_workflow_load(invoice_id)
        self.assertTrue(snapshot['can_post'])
        self.assertTrue(snapshot['ledger_balanced'])
        posted = moves.qorlia_invoice_workflow_post(invoice_id, snapshot['version'])
        self.assertEqual(posted['state'], 'posted')
        self.assertEqual(posted['total'], 500)
        self.assertEqual(posted['open_amount'], 500)
        self.assertEqual(posted['payment_state'], 'not_paid')
        self.assertFalse(posted['can_post'])
        self.assertTrue(posted['ledger_balanced'])
        with self.assertRaises(UserError):
            moves.qorlia_invoice_workflow_post(invoice_id, snapshot['version'])
        self.assertFalse(moves.browse(invoice_id)._get_reconciled_payments())

    def test_invoice_workflow_rejects_stale_state_and_unauthorized_direct_calls(self):
        self.env['ir.config_parameter'].set_param('bahmni_sale.is_invoice_automated', False)
        saved = self.orders.qorlia_draft_save(self.payload(self.draft()), str(uuid.uuid4()))
        ready = self.orders.qorlia_order_workflow_load(saved['id'])
        confirmed = self.orders.qorlia_order_workflow_run(saved['id'], ready['version'], 'confirm')
        invoiced = self.orders.qorlia_order_workflow_run(saved['id'], confirmed['version'], 'invoice')
        moves = self.env['account.move']
        invoice_id = invoiced['invoices'][0]['id']
        snapshot = moves.qorlia_invoice_workflow_load(invoice_id)
        moves.browse(invoice_id).write({'ref': 'QorliaQA Concurrent edit'})
        with self.assertRaises(UserError):
            moves.qorlia_invoice_workflow_post(invoice_id, snapshot['version'])
        self.assertEqual(moves.browse(invoice_id).state, 'draft')
        user = self.env['res.users'].with_context(no_reset_password=True).create({
            'name': 'QorliaQA No invoice rights', 'login': 'qorlia-qa-no-invoice',
            'groups_id': [(6, 0, [self.env.ref('base.group_user').id])],
            'company_id': self.env.company.id, 'company_ids': [(6, 0, self.env.company.ids)],
        })
        with self.assertRaises(AccessError):
            moves.with_user(user).qorlia_invoice_workflow_load(invoice_id)
        with self.assertRaises(AccessError):
            moves.with_user(user).qorlia_invoice_workflow_post(invoice_id, snapshot['version'])
        with self.assertRaises(ValidationError):
            moves.qorlia_invoice_workflow_load(True)
