# SPDX-License-Identifier: LGPL-3.0-or-later
import uuid
from contextlib import contextmanager
from unittest.mock import patch

from odoo import Command, fields
from odoo.exceptions import AccessError, UserError, ValidationError
from odoo.tests import TransactionCase, tagged


@tagged('post_install', '-at_install')
class ChequeWorkflowTest(TransactionCase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.payments = cls.env['account.payment']
        cls.customer = cls.env['res.partner'].create({'name': 'QorliaQA Cheque workflow customer'})
        cls.journal = cls.env['account.journal'].create({'name': 'QorliaQA Cheque test bank',
            'code': 'QCHK', 'type': 'bank', 'check_manual_sequencing': False})
        cls.journal.inbound_payment_method_line_ids.payment_account_id = cls.journal.default_account_id
        cls.journal.outbound_payment_method_line_ids.payment_account_id = cls.journal.default_account_id
        method = cls.env.ref('account_check_printing.account_payment_method_check')
        cls.method = cls.journal.outbound_payment_method_line_ids.filtered(lambda line: line.payment_method_id == method)
        if not cls.method:
            cls.method = cls.env['account.payment.method.line'].create({'journal_id': cls.journal.id,
                'payment_method_id': method.id, 'payment_account_id': cls.journal.default_account_id.id})
        cls.template = cls.env['ir.ui.view'].create({'name': 'QorliaQA synthetic cheque layout', 'type': 'qweb',
            'key': 'qorlia_billing_ui.qa_cheque_layout', 'arch': '<t t-name="qorlia_billing_ui.qa_cheque_layout"><t t-call="web.html_container"><t t-foreach="docs" t-as="o"><t t-call="web.basic_layout"><div class="page">QorliaQA synthetic layout. NOT A BANK CHEQUE. <span t-field="o.check_number"/><span t-field="o.amount"/></div></t></t></t></t>'})
        cls.report = cls.env['ir.actions.report'].create({'name': 'QorliaQA synthetic cheque',
            'model': 'account.payment', 'report_type': 'qweb-pdf', 'report_name': cls.template.key})
        cls.env['ir.model.data'].create({'module': 'qorlia_billing_ui', 'name': 'qa_cheque_report',
            'model': 'ir.actions.report', 'res_id': cls.report.id})

    @contextmanager
    def configured(self):
        field = self.env.company._fields['account_check_printing_layout']
        with patch.object(field, 'selection', [('disabled', 'None'), ('qorlia_billing_ui.qa_cheque_report', 'QorliaQA synthetic only')]):
            self.env.company.account_check_printing_layout = 'qorlia_billing_ui.qa_cheque_report'
            try:
                yield
            finally:
                self.env.company.account_check_printing_layout = 'disabled'

    def payment(self):
        payment = self.payments.create({'partner_id': self.customer.id, 'partner_type': 'customer',
            'payment_type': 'outbound', 'amount': 100, 'date': fields.Date.today(),
            'journal_id': self.journal.id, 'payment_method_line_id': self.method.id})
        payment.action_post()
        return payment

    def request(self, payment, number='000007'):
        loaded = self.payments.qorlia_cheque_load(payment.id)
        reviewed = self.payments.qorlia_cheque_preview(payment.id, loaded['version'], number)
        return {'payment_id': payment.id, 'version': loaded['version'], 'check_number': number,
                'review_version': reviewed['review_version'], 'request_key': str(uuid.uuid4())}

    def render(self):
        return patch.object(type(self.env['ir.actions.report']), '_render_qweb_pdf', return_value=(b'%PDF-QorliaQA', 'pdf'))

    def test_disabled_layout_is_explained_without_number_or_sent_write(self):
        payment = self.payment()
        before = payment.read(['write_date', 'check_number', 'is_move_sent'])
        loaded = self.payments.qorlia_cheque_load(payment.id)
        self.assertFalse(loaded['can_print'])
        self.assertIn('No native cheque layout', loaded['reason'])
        with self.assertRaises(UserError):
            self.payments.qorlia_cheque_preview(payment.id, loaded['version'], '000007')
        self.assertEqual(payment.read(['write_date', 'check_number', 'is_move_sent']), before)

    def test_native_numbering_pdf_recovery_and_retry_never_renumber(self):
        payment = self.payment()
        with self.configured(), self.render() as render:
            request = self.request(payment)
            before = self.payments._qorlia_cheque_financial_state(payment)
            self.assertFalse(self.payments.qorlia_cheque_status(**request)['accepted'])
            result = self.payments.qorlia_cheque_print(**request)
            self.assertEqual(result['payment']['check_number'], '000007')
            self.assertTrue(result['payment']['sent'])
            self.assertFalse(result['payment']['can_print'])
            self.assertEqual(result['pdf']['mimetype'], 'application/pdf')
            self.assertTrue(self.payments.qorlia_cheque_status(**request)['accepted'])
            with patch.object(type(self.env['print.prenumbered.checks']), 'print_checks') as wizard:
                self.payments.qorlia_cheque_print(**request)
                self.payments.qorlia_cheque_download(**request)
                self.payments.qorlia_cheque_download_current(payment.id)
                wizard.assert_not_called()
            self.assertEqual(self.payments._qorlia_cheque_financial_state(payment), before)
            self.assertEqual(len(payment.qorlia_cheque_receipts), 1)
            self.assertEqual(render.call_count, 4)

    def test_actual_synthetic_qweb_contains_number_and_not_bank_claim(self):
        payment = self.payment()
        with self.configured():
            with self.render():
                self.payments.qorlia_cheque_print(**self.request(payment, '001234'))
            html, _ = self.env['ir.actions.report']._render_qweb_html(self.report.id, payment.ids)
            self.assertIn(b'001234', html)
            self.assertIn(b'NOT A BANK CHEQUE', html)
            pdf = self.payments.qorlia_cheque_download_current(payment.id)
            self.assertEqual(pdf['mimetype'], 'application/pdf')
            self.assertGreater(pdf['byte_count'], 1000)

    def test_manual_sequence_keeps_native_posted_number(self):
        self.journal.check_manual_sequencing = True
        payment = self.payment()
        number = payment.check_number
        self.assertTrue(number)
        with self.configured(), self.render():
            request = self.request(payment, False)
            with patch.object(type(self.env['print.prenumbered.checks']), 'print_checks') as wizard:
                self.payments.qorlia_cheque_print(**request)
                wizard.assert_not_called()
            self.assertEqual(payment.check_number, number)

    def test_stale_review_or_configuration_and_duplicate_number_are_rejected(self):
        payment = self.payment()
        with self.configured(), self.render():
            request = self.request(payment)
            self.journal.name = 'QorliaQA changed configuration'
            with self.assertRaises(UserError):
                self.payments.qorlia_cheque_print(**request)
            self.assertFalse(payment.is_move_sent)
            self.payments.qorlia_cheque_print(**self.request(payment))
            another = self.payment()
            duplicate = self.request(another)
            with self.assertRaises(ValidationError), self.env.cr.savepoint():
                self.payments.qorlia_cheque_print(**duplicate)
            self.assertFalse(another.check_number)
            self.assertFalse(another.is_move_sent)

    def test_pdf_failure_rolls_back_number_sent_and_receipt(self):
        payment = self.payment()
        with self.configured(), patch.object(type(self.env['ir.actions.report']), '_render_qweb_pdf', return_value=(b'not PDF', 'pdf')):
            request = self.request(payment)
            with self.assertRaises(UserError), self.env.cr.savepoint():
                self.payments.qorlia_cheque_print(**request)
            self.assertFalse(payment.check_number)
            self.assertFalse(payment.is_move_sent)
            self.assertFalse(payment.qorlia_cheque_receipts)

    def test_request_conflict_and_changed_accepted_state_fail_closed(self):
        payment = self.payment()
        with self.configured(), self.render():
            request = self.request(payment)
            self.payments.qorlia_cheque_print(**request)
            with self.assertRaises(ValidationError):
                self.payments.qorlia_cheque_status(**{**request, 'check_number': '99'})
            payment.action_unmark_sent()
            with self.assertRaises(UserError):
                self.payments.qorlia_cheque_download(**request)
            with self.assertRaises(UserError):
                self.payments.qorlia_cheque_download_current(payment.id)

    def test_invalid_numbers_identifiers_and_missing_receipt(self):
        payment = self.payment()
        with self.configured():
            for number in ('ABC007', '', '-1', '9223372036854775808', '\u0661', True):
                with self.assertRaises(ValidationError):
                    self.request(payment, number)
            request = self.request(payment)
            with self.assertRaises(ValidationError):
                self.payments.qorlia_cheque_status(**{**request, 'request_key': 'invalid'})
            with self.assertRaises(UserError):
                self.payments.qorlia_cheque_download(**request)
            with self.assertRaises(ValidationError):
                self.payments.qorlia_cheque_load(True)

    def test_readonly_user_can_inspect_but_cannot_print_or_bypass_report_group(self):
        payment = self.payment()
        reader = self.env['res.users'].with_context(no_reset_password=True).create({'name': 'QorliaQA Cheque reader',
            'login': 'qorliaqa-cheque-' + str(uuid.uuid4()), 'company_id': self.env.company.id,
            'company_ids': [Command.set(self.env.company.ids)],
            'groups_id': [Command.set(self.env.ref('account.group_account_readonly').ids)]})
        with self.configured():
            self.assertFalse(self.payments.with_user(reader).qorlia_cheque_load(payment.id)['can_print'])
            with self.assertRaises(AccessError):
                self.payments.with_user(reader).qorlia_cheque_preview(payment.id, 'a' * 64, '7')
            self.report.groups_id = self.env.ref('base.group_system')
            with self.assertRaises(AccessError):
                self.payments.with_user(reader)._qorlia_cheque_report(payment.with_user(reader))

    def test_manual_payment_and_draft_are_denied(self):
        payment = self.payment()
        payment.action_draft()
        with self.assertRaises(UserError):
            self.payments.qorlia_cheque_load(payment.id)
        payment.payment_method_line_id = self.journal.outbound_payment_method_line_ids.filtered(lambda line: line.code == 'manual')[:1]
        payment.action_post()
        with self.assertRaises(UserError):
            self.payments.qorlia_cheque_load(payment.id)

    def sent_request(self, payment, action='mark_sent'):
        loaded = self.payments.qorlia_cheque_sent_load(payment.id)
        review = self.payments.qorlia_cheque_sent_preview(payment.id, loaded['version'], action)
        return {'payment_id': payment.id, 'version': loaded['version'], 'action': action,
                'review_version': review['review_version'], 'request_key': str(uuid.uuid4())}

    def test_sent_flags_use_native_methods_without_layout_or_financial_changes(self):
        payment = self.payment()
        before = self.payments._qorlia_cheque_financial_state(payment)
        number = payment.check_number
        marked = self.sent_request(payment)
        self.assertFalse(self.payments.qorlia_cheque_sent_status(**marked)['accepted'])
        self.assertTrue(self.payments.qorlia_cheque_sent_run(**marked)['payment']['sent'])
        unmarked = self.sent_request(payment, 'unmark_sent')
        self.assertFalse(self.payments.qorlia_cheque_sent_run(**unmarked)['payment']['sent'])
        self.assertEqual(payment.check_number, number)
        self.assertEqual(before, self.payments._qorlia_cheque_financial_state(payment))
        self.assertEqual(len(payment.qorlia_cheque_sent_receipts), 2)

    def test_accepted_old_sent_request_never_overwrites_later_status(self):
        payment = self.payment()
        request = self.sent_request(payment)
        self.payments.qorlia_cheque_sent_run(**request)
        self.payments.qorlia_cheque_sent_run(**self.sent_request(payment, 'unmark_sent'))
        with patch.object(type(payment), 'mark_as_sent') as native:
            result = self.payments.qorlia_cheque_sent_run(**request)
            native.assert_not_called()
        self.assertTrue(result['accepted'])
        self.assertFalse(result['payment']['sent'])
        self.assertTrue(self.payments.qorlia_cheque_sent_status(**request)['accepted'])

    def test_stale_or_tampered_sent_review_does_not_write(self):
        payment = self.payment()
        request = self.sent_request(payment)
        payment.ref = 'QorliaQA changed reference'
        with self.assertRaises(UserError):
            self.payments.qorlia_cheque_sent_run(**request)
        fresh = self.sent_request(payment)
        with self.assertRaises(UserError):
            self.payments.qorlia_cheque_sent_run(**{**fresh, 'review_version': 'a' * 64})
        self.assertFalse(payment.is_move_sent)
        self.assertFalse(payment.qorlia_cheque_sent_receipts)

    def test_sent_request_conflict_and_invalid_action_are_rejected(self):
        payment = self.payment()
        request = self.sent_request(payment)
        self.payments.qorlia_cheque_sent_run(**request)
        for change in ({'action': 'unmark_sent'}, {'version': 'b' * 64}):
            with self.assertRaises(ValidationError):
                self.payments.qorlia_cheque_sent_status(**{**request, **change})
        for action in ('void', 'print', False):
            with self.assertRaises(ValidationError):
                self.payments.qorlia_cheque_sent_preview(payment.id, request['version'], action)

    def test_readonly_sent_review_and_write_are_denied(self):
        payment = self.payment()
        reader = self.env['res.users'].with_context(no_reset_password=True).create({
            'name': 'QorliaQA Sent reader', 'login': 'qorliaqa-sent-' + str(uuid.uuid4()),
            'company_id': self.env.company.id, 'company_ids': [Command.set(self.env.company.ids)],
            'groups_id': [Command.set(self.env.ref('account.group_account_readonly').ids)]})
        loaded = self.payments.with_user(reader).qorlia_cheque_sent_load(payment.id)
        self.assertFalse(loaded['can_update'])
        with self.assertRaises(AccessError):
            self.payments.with_user(reader).qorlia_cheque_sent_preview(payment.id, loaded['version'], 'mark_sent')
        with self.assertRaises(AccessError):
            self.payments.with_user(reader).qorlia_cheque_sent_run(**self.sent_request(payment))

    def test_native_unexpected_financial_write_rolls_back_sent_request(self):
        payment = self.payment()
        request = self.sent_request(payment)
        def unsafe(record):
            record.write({'is_move_sent': True, 'ref': 'QorliaQA unexpected native change'})
        with patch.object(type(payment), 'mark_as_sent', unsafe):
            with self.assertRaises(UserError), self.env.cr.savepoint():
                self.payments.qorlia_cheque_sent_run(**request)
        payment.invalidate_recordset()
        self.assertFalse(payment.is_move_sent)
        self.assertFalse(payment.qorlia_cheque_sent_receipts)

    def test_sent_action_requires_current_opposite_flag(self):
        payment = self.payment()
        loaded = self.payments.qorlia_cheque_sent_load(payment.id)
        with self.assertRaises(UserError):
            self.payments.qorlia_cheque_sent_preview(payment.id, loaded['version'], 'unmark_sent')
        payment.action_draft()
        with self.assertRaises(UserError):
            self.payments.qorlia_cheque_sent_load(payment.id)
