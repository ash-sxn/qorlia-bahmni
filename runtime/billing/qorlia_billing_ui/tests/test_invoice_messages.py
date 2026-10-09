# SPDX-License-Identifier: LGPL-3.0-or-later
import uuid
from unittest.mock import patch

from odoo import Command
from odoo.exceptions import AccessError, ValidationError
from odoo.tests import TransactionCase, tagged
from . import test_document_reports as report_tests


@tagged('post_install', '-at_install')
class InvoiceMessagesTest(TransactionCase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.customer = cls.env['res.partner'].create({'name': 'QorliaQA Conversation customer'})
        cls.moves = cls.env['account.move']

    invoice = report_tests.DocumentReportTest.invoice
    reader = report_tests.DocumentReportTest.reader

    def test_native_note_identical_retry_has_one_message_and_no_financial_changes(self):
        invoice = self.invoice()
        before = invoice.read(['write_date', 'state', 'amount_total', 'amount_residual'])
        lines = invoice.line_ids.read(['write_date', 'debit', 'credit', 'amount_residual'])
        payments = self.env['account.payment'].search_count([])
        followers = invoice.message_follower_ids.ids
        key = str(uuid.uuid4())
        result = self.moves.qorlia_invoice_note(invoice.id, key, 'QorliaQA Checked invoice\nNo money received.')
        repeat = self.moves.qorlia_invoice_note(invoice.id, key, 'QorliaQA Checked invoice\nNo money received.')
        self.assertEqual(result, repeat)
        message = self.env['mail.message'].browse(result['message']['id'])
        self.assertEqual(message.subtype_id, self.env.ref('mail.mt_note'))
        self.assertTrue(message.is_internal)
        self.assertEqual(message.create_uid, self.env.user)
        self.assertFalse(message.partner_ids)
        self.assertFalse(message.attachment_ids)
        self.assertEqual(invoice.message_follower_ids.ids, followers)
        self.assertEqual(invoice.read(['write_date', 'state', 'amount_total', 'amount_residual']), before)
        self.assertEqual(invoice.line_ids.read(['write_date', 'debit', 'credit', 'amount_residual']), lines)
        self.assertEqual(self.env['account.payment'].search_count([]), payments)
        self.assertEqual(self.env['mail.message'].search_count([('qorlia_note_key', '=', key)]), 1)
        self.assertEqual(self.moves.qorlia_invoice_note_status(invoice.id, key,
            'QorliaQA Checked invoice\nNo money received.'), result)

    def test_plain_text_is_escaped_not_interpreted_as_html(self):
        invoice = self.invoice()
        result = self.moves.qorlia_invoice_note(invoice.id, str(uuid.uuid4()),
            'QorliaQA <script>alert(1)</script> & <img src=x>\nsecond line')
        stored = self.env['mail.message'].browse(result['message']['id']).body
        self.assertNotIn('<script>', stored)
        self.assertNotIn('<img', stored)
        self.assertIn('&lt;script&gt;', stored)
        self.assertIn('<script>alert(1)</script>', result['message']['body'])
        self.assertIn('second line', result['message']['body'])

    def test_history_pages_are_native_invoice_scoped_and_do_not_hide_older_rows(self):
        invoice = self.invoice()
        other = self.invoice()
        with patch.object(type(invoice), '_notify_thread'):
            for number in range(35):
                invoice.message_post(body='QorliaQA History %s' % number, subtype_xmlid='mail.mt_note')
            other.message_post(body='QorliaQA Must not appear', subtype_xmlid='mail.mt_note')
        page = self.moves.qorlia_invoice_messages(invoice.id)
        self.assertEqual(len(page['messages']), 30)
        self.assertEqual(page['next_before'], page['messages'][-1]['id'])
        older = self.moves.qorlia_invoice_messages(invoice.id, page['next_before'])
        ids = [row['id'] for row in page['messages'] + older['messages']]
        self.assertEqual(len(ids), len(set(ids)))
        self.assertEqual(ids, sorted(ids, reverse=True))
        self.assertEqual(set(ids), set(invoice.message_ids.ids))
        self.assertIs(older['next_before'], False)
        self.assertTrue(page['can_note'])
        self.assertFalse(any('Must not appear' in row['body'] for row in page['messages'] + older['messages']))

    def test_native_internal_subtype_does_not_notify_customer_or_portal_followers(self):
        invoice = self.invoice()
        portal = self.env['res.users'].with_context(no_reset_password=True).create({
            'name': 'QorliaQA Portal follower', 'login': 'qorliaqa-portal-' + str(uuid.uuid4()),
            'email': 'qorliaqa-portal@example.invalid',
            'groups_id': [Command.set(self.env.ref('base.group_portal').ids)]})
        invoice.message_subscribe(partner_ids=[self.customer.id, portal.partner_id.id],
                                  subtype_ids=self.env.ref('mail.mt_note').ids)
        with patch.object(type(invoice), '_notify_thread_by_email') as email:
            result = self.moves.qorlia_invoice_note(invoice.id, str(uuid.uuid4()), 'QorliaQA Internal only')
        if email.called:
            for call in email.call_args_list:
                self.assertFalse({self.customer.id, portal.partner_id.id} &
                                 {recipient['id'] for recipient in call.args[1]})
        message = self.env['mail.message'].browse(result['message']['id'])
        self.assertFalse(message.notification_ids.filtered(
            lambda notification: notification.res_partner_id in (self.customer | portal.partner_id)))
        with self.assertRaises(AccessError):
            self.moves.with_user(portal).qorlia_invoice_messages(invoice.id)

    def test_readonly_account_can_read_but_not_post_even_an_identical_retry(self):
        invoice = self.invoice()
        key = str(uuid.uuid4())
        self.moves.qorlia_invoice_note(invoice.id, key, 'QorliaQA Saved note')
        reader = self.reader()
        readonly = self.moves.with_user(reader)
        page = readonly.qorlia_invoice_messages(invoice.id)
        self.assertFalse(page['can_note'])
        self.assertTrue(page['messages'])
        with self.assertRaises(AccessError):
            readonly.qorlia_invoice_note(invoice.id, key, 'QorliaQA Saved note')
        reader.groups_id = [Command.set(self.env.ref('base.group_user').ids)]
        with self.assertRaises(AccessError):
            readonly.qorlia_invoice_messages(invoice.id)

    def test_changed_body_invoice_or_author_cannot_reuse_a_request_key(self):
        invoice, other = self.invoice(), self.invoice()
        key = str(uuid.uuid4())
        self.moves.qorlia_invoice_note(invoice.id, key, 'QorliaQA One note')
        for document, body in [(invoice, 'QorliaQA Different note'), (other, 'QorliaQA One note')]:
            with self.assertRaises(ValidationError):
                self.moves.qorlia_invoice_note(document.id, key, body)
        reader = self.reader()
        with self.assertRaises(ValidationError):
            self.moves.with_user(reader).qorlia_invoice_note_status(invoice.id, key, 'QorliaQA One note')
        absent = self.moves.qorlia_invoice_note_status(invoice.id, str(uuid.uuid4()), 'QorliaQA Not sent')
        self.assertIs(absent['message'], False)

    def test_invalid_ids_cursors_keys_bodies_and_extra_arguments_fail_closed(self):
        invoice = self.invoice()
        for value in (True, 0, -1, '1'):
            with self.assertRaises(ValidationError):
                self.moves.qorlia_invoice_messages(invoice.id, value)
        for key in (False, 1, 'invalid', str(uuid.uuid4()).upper()):
            with self.assertRaises(ValidationError):
                self.moves.qorlia_invoice_note(invoice.id, key, 'QorliaQA Note')
        for body in (False, '', '  ', 'x' * 5001, 'null\x00character'):
            with self.assertRaises(ValidationError):
                self.moves.qorlia_invoice_note(invoice.id, str(uuid.uuid4()), body)
        for name in ('partner_ids', 'author_id', 'attachments', 'subtype_id', 'context'):
            with self.assertRaises(TypeError):
                self.moves.qorlia_invoice_note(invoice.id, str(uuid.uuid4()), 'QorliaQA Note', **{name: []})

    def test_company_and_document_rules_apply_to_history_note_and_status(self):
        invoice = self.invoice()
        user = self.reader()
        other = self.env['res.company'].create({'name': 'QorliaQA Conversation other company'})
        user.write({'company_ids': [Command.set(other.ids)], 'company_id': other.id})
        for method, args in [('qorlia_invoice_messages', (invoice.id,)),
                             ('qorlia_invoice_note', (invoice.id, str(uuid.uuid4()), 'QorliaQA Note')),
                             ('qorlia_invoice_note_status', (invoice.id, str(uuid.uuid4()), 'QorliaQA Note'))]:
            with self.assertRaises(AccessError):
                getattr(self.moves.with_user(user), method)(*args)

    def test_native_tracking_values_and_long_body_limits_are_visible(self):
        invoice = self.invoice()
        field = self.env['ir.model.fields']._get('account.move', 'ref')
        message = self.env['mail.message'].create({'model': 'account.move', 'res_id': invoice.id,
            'body': '<p>' + 'x' * 20001 + '</p>', 'message_type': 'notification',
            'subtype_id': self.env.ref('mail.mt_note').id,
            'tracking_value_ids': [Command.create({'field': field.id, 'field_desc': 'Reference',
                'field_type': 'char', 'old_value_char': 'Before', 'new_value_char': 'After'})]})
        row = next(row for row in self.moves.qorlia_invoice_messages(invoice.id)['messages']
                   if row['id'] == message.id)
        self.assertTrue(row['body_truncated'])
        self.assertEqual(len(row['body']), 20000)
        self.assertEqual(row['changes'], [{'id': message.tracking_value_ids.id,
            'field': 'Reference', 'old': 'Before', 'new': 'After'}])
        amount_field = self.env['ir.model.fields']._get('account.move', 'amount_total')
        amount = self.env['mail.tracking.value'].create({'mail_message_id': message.id,
            'field': amount_field.id, 'field_desc': 'Total', 'field_type': 'monetary',
            'currency_id': invoice.currency_id.id, 'old_value_monetary': 10,
            'new_value_monetary': 20})
        monetary_row = next(row for row in self.moves.qorlia_invoice_messages(invoice.id)['messages']
                            if row['id'] == message.id)
        self.assertIn({'id': amount.id, 'field': 'Total',
            'old': '%s 10.0' % invoice.currency_id.name,
            'new': '%s 20.0' % invoice.currency_id.name}, monetary_row['changes'])

    def test_native_tracking_field_groups_are_respected_for_readonly_viewers(self):
        invoice = self.invoice()
        field = self.env['ir.model.fields']._get('account.move', 'ref')
        message = self.env['mail.message'].create({'model': 'account.move', 'res_id': invoice.id,
            'message_type': 'notification', 'subtype_id': self.env.ref('mail.mt_note').id,
            'tracking_value_ids': [Command.create({'field': field.id, 'field_desc': 'Restricted reference',
                'field_type': 'char', 'old_value_char': 'Secret before', 'new_value_char': 'Secret after'})]})
        reader = self.reader()
        with patch.object(self.moves._fields['ref'], 'groups', 'base.group_system'):
            message.tracking_value_ids.invalidate_recordset(['field_groups'])
            row = next(row for row in self.moves.with_user(reader).qorlia_invoice_messages(invoice.id)['messages']
                       if row['id'] == message.id)
        self.assertEqual(row['changes'], [])

    def test_internal_follower_email_is_queued_without_immediate_send(self):
        invoice = self.invoice()
        follower = self.env['res.users'].with_context(no_reset_password=True).create({
            'name': 'QorliaQA Internal follower', 'login': 'qorliaqa-follower-' + str(uuid.uuid4()),
            'email': 'qorliaqa-internal@example.invalid', 'notification_type': 'email',
            'groups_id': [Command.set(self.env.ref('account.group_account_invoice').ids)]})
        invoice.message_subscribe(follower.partner_id.ids, subtype_ids=self.env.ref('mail.mt_note').ids)
        with patch.object(type(self.env['mail.mail']), 'send') as send:
            result = self.moves.qorlia_invoice_note(invoice.id, str(uuid.uuid4()), 'QorliaQA Queued staff note')
        send.assert_not_called()
        mails = self.env['mail.mail'].search([('mail_message_id', '=', result['message']['id'])])
        self.assertTrue(mails)
        self.assertEqual(set(mails.recipient_ids.ids), set(follower.partner_id.ids))
        self.assertEqual(set(mails.mapped('state')), {'outgoing'})
