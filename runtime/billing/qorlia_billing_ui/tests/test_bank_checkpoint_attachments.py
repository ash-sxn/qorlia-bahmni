# SPDX-License-Identifier: LGPL-3.0-or-later
import base64
import uuid
from odoo import Command
from odoo.exceptions import AccessError, UserError, ValidationError
from odoo.tests import TransactionCase, tagged

from . import test_bank_checkpoints as checkpoint_tests


@tagged('post_install', '-at_install')
class BankCheckpointAttachmentTest(TransactionCase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.entries = cls.env['account.bank.statement.line']
        cls.checkpoints = cls.env['account.bank.statement']
        cls.prefix = 'QorliaQA Checkpoint attachment ' + uuid.uuid4().hex[:8]
        cls.partner = cls.env['res.partner'].create({'name': cls.prefix})
        cls.bank = cls.env['account.account'].create({'name': cls.prefix + ' bank',
            'code': 'QA' + uuid.uuid4().hex[:8], 'account_type': 'asset_cash'})
        cls.suspense = cls.env['account.account'].create({'name': cls.prefix + ' suspense',
            'code': 'QZ' + uuid.uuid4().hex[:8], 'account_type': 'asset_current', 'reconcile': True})
        cls.journal = cls.env['account.journal'].create({'name': cls.prefix, 'code': uuid.uuid4().hex[:5],
            'type': 'bank', 'default_account_id': cls.bank.id, 'suspense_account_id': cls.suspense.id})
    entry = checkpoint_tests.BankCheckpointTest.entry
    checkpoint = checkpoint_tests.BankCheckpointTest.checkpoint

    def file(self, checkpoint, **values):
        result = self.env['ir.attachment'].with_context(image_no_postprocess=True).create({
            'name': self.prefix + '.txt', 'raw': b'Synthetic checkpoint attachment\x00\xff',
            'res_model': 'account.bank.statement', 'res_id': checkpoint.id, **values})
        checkpoint.attachment_ids |= result
        return result

    def test_list_and_binary_download_preserve_bytes_and_accounting(self):
        checkpoint = self.checkpoint()
        file = self.file(checkpoint)
        before = checkpoint.line_ids.read(['write_date', 'amount', 'statement_id', 'move_id'])
        page = self.checkpoints.qorlia_checkpoint_attachments(checkpoint.id)
        self.assertEqual(page['rows'], [{'id': file.id, 'name': file.name, 'kind': 'binary', 'byte_count': file.file_size}])
        result = self.checkpoints.qorlia_checkpoint_attachment_download(checkpoint.id, file.id, page['version'])
        self.assertEqual(base64.b64decode(result['content']), file.raw)
        self.assertEqual(result['mimetype'], 'application/octet-stream')
        self.assertEqual(result['version'], page['version'])
        self.assertEqual(checkpoint.line_ids.read(['write_date', 'amount', 'statement_id', 'move_id']), before)

    def test_paging_is_complete_and_version_change_rejects_stale_list_and_download(self):
        checkpoint = self.checkpoint()
        files = self.env['ir.attachment']
        for _ in range(31):
            files |= self.file(checkpoint)
        first = self.checkpoints.qorlia_checkpoint_attachments(checkpoint.id)
        second = self.checkpoints.qorlia_checkpoint_attachments(checkpoint.id, first['next_after'], first['version'])
        self.assertEqual(len(first['rows']), 30)
        self.assertEqual(len(second['rows']), 1)
        self.assertEqual({row['id'] for row in first['rows'] + second['rows']}, set(files.ids))
        self.assertFalse(second['next_after'])
        files[0].write({'raw': b'Changed native bytes'})
        with self.assertRaises(UserError):
            self.checkpoints.qorlia_checkpoint_attachments(checkpoint.id, version=first['version'])
        with self.assertRaises(UserError):
            self.checkpoints.qorlia_checkpoint_attachment_download(checkpoint.id, files[0].id, first['version'])

    def test_empty_checkpoint_attachment_list_and_invalid_cursor(self):
        checkpoint = self.checkpoint(self.entries.browse())
        page = self.checkpoints.qorlia_checkpoint_attachments(checkpoint.id)
        self.assertEqual(page['rows'], [])
        self.assertEqual(page['total_count'], 0)
        self.assertFalse(page['next_after'])
        for kwargs in ({'after': True}, {'after': 0}, {'after': 1}, {'version': 'bad'},
                {'after': 2147483647, 'version': page['version']}):
            with self.assertRaises(ValidationError):
                self.checkpoints.qorlia_checkpoint_attachments(checkpoint.id, **kwargs)
        for identifier in (True, False, 0, -1, '1'):
            with self.assertRaises(ValidationError):
                self.checkpoints.qorlia_checkpoint_attachments(identifier)

    def test_unlinked_file_and_wrong_attachment_identifier_rejected(self):
        checkpoint = self.checkpoint()
        other = self.checkpoint()
        file = self.file(other)
        page = self.checkpoints.qorlia_checkpoint_attachments(checkpoint.id)
        with self.assertRaises(AccessError):
            self.checkpoints.qorlia_checkpoint_attachment_download(checkpoint.id, file.id, page['version'])
        for identifier in (True, False, 0, -1, '1'):
            with self.assertRaises(ValidationError):
                self.checkpoints.qorlia_checkpoint_attachment_download(checkpoint.id, identifier, page['version'])

    def test_native_shared_and_generic_many_to_many_attachments_are_retained(self):
        checkpoint = self.checkpoint()
        other = self.checkpoint()
        shared = self.file(other)
        generic = self.file(checkpoint, res_model=False, res_id=0, name='../unsafe.txt')
        checkpoint.attachment_ids |= shared
        shared.write({'res_model': 'account.bank.statement', 'res_id': other.id})
        generic.write({'res_model': False, 'res_id': 0})
        page = self.checkpoints.qorlia_checkpoint_attachments(checkpoint.id)
        self.assertEqual({row['id'] for row in page['rows']}, {shared.id, generic.id})
        checkpoint.invalidate_recordset(['attachment_ids'])
        self.assertEqual(self.checkpoints.qorlia_checkpoint_attachments(checkpoint.id)['version'], page['version'])
        self.assertEqual(next(row['name'] for row in page['rows'] if row['id'] == generic.id), 'Attachment-%s' % generic.id)
        self.assertEqual(self.checkpoints.qorlia_checkpoint_attachment_download(checkpoint.id, shared.id, page['version'])['byte_count'], shared.file_size)

    def test_native_parent_rules_public_users_and_foreign_company_rejected(self):
        checkpoint = self.checkpoint()
        file = self.file(checkpoint)
        reader = self.env['res.users'].with_context(no_reset_password=True).create({'name': self.prefix,
            'login': uuid.uuid4().hex, 'groups_id': [Command.set(self.env.ref('account.group_account_readonly').ids)]})
        api = self.checkpoints.with_user(reader)
        page = api.qorlia_checkpoint_attachments(checkpoint.id)
        self.assertEqual(api.qorlia_checkpoint_attachment_download(checkpoint.id, file.id, page['version'])['attachment_id'], file.id)
        self.env['ir.rule'].create({'name': self.prefix + ' hidden checkpoint',
            'model_id': self.env.ref('account.model_account_bank_statement').id,
            'domain_force': "[('id', '!=', %s)]" % checkpoint.id})
        with self.assertRaises(AccessError):
            api.qorlia_checkpoint_attachments(checkpoint.id)
        with self.assertRaises(AccessError):
            api.qorlia_checkpoint_attachment_download(checkpoint.id, file.id, page['version'])
        with self.assertRaises(AccessError):
            self.checkpoints.with_user(self.env.ref('base.public_user')).qorlia_checkpoint_attachments(checkpoint.id)
        other = self.env['res.company'].create({'name': self.prefix + ' foreign'})
        with self.assertRaises(AccessError):
            self.checkpoints.with_context(allowed_company_ids=[other.id]).qorlia_checkpoint_attachments(checkpoint.id)

    def test_hidden_original_parent_of_shared_attachment_fails_closed(self):
        checkpoint = self.checkpoint()
        other = self.checkpoint()
        file = self.file(other)
        checkpoint.attachment_ids |= file
        # Native statement writes reparent linked files; retain the shared file's original parent explicitly.
        file.write({'res_model': 'account.bank.statement', 'res_id': other.id})
        self.assertEqual(file.res_id, other.id)
        reader = self.env['res.users'].with_context(no_reset_password=True).create({'name': self.prefix,
            'login': uuid.uuid4().hex, 'groups_id': [Command.set(self.env.ref('account.group_account_readonly').ids)]})
        self.env['ir.rule'].create({'name': self.prefix + ' hidden shared parent',
            'model_id': self.env.ref('account.model_account_bank_statement').id,
            'domain_force': "[('id', '!=', %s)]" % other.id})
        with self.assertRaises(AccessError):
            self.checkpoints.with_user(reader).qorlia_checkpoint_attachments(checkpoint.id)

    def test_url_download_validation_and_large_binary_limit(self):
        checkpoint = self.checkpoint()
        file = self.file(checkpoint, type='url', url='https://example.com/synthetic.pdf', raw=False)
        page = self.checkpoints.qorlia_checkpoint_attachments(checkpoint.id)
        self.assertEqual(self.checkpoints.qorlia_checkpoint_attachment_download(checkpoint.id, file.id, page['version'])['url'], file.url)
        for link in ('javascript:alert(1)', 'https://user:password@example.com/file', 'https://example.com/\nfile'):
            file.url = link
            page = self.checkpoints.qorlia_checkpoint_attachments(checkpoint.id)
            with self.assertRaises(ValidationError):
                self.checkpoints.qorlia_checkpoint_attachment_download(checkpoint.id, file.id, page['version'])
        large = self.file(checkpoint, raw=b'x' * (10 * 1024 * 1024 + 1))
        page = self.checkpoints.qorlia_checkpoint_attachments(checkpoint.id)
        with self.assertRaises(ValidationError):
            self.checkpoints.qorlia_checkpoint_attachment_download(checkpoint.id, large.id, page['version'])

    def test_hidden_attachment_rule_rejects_list_and_download_without_omitting_file(self):
        checkpoint = self.checkpoint()
        file = self.file(checkpoint)
        reader = self.env['res.users'].with_context(no_reset_password=True).create({'name': self.prefix,
            'login': uuid.uuid4().hex, 'groups_id': [Command.set(self.env.ref('account.group_account_readonly').ids)]})
        api = self.checkpoints.with_user(reader)
        page = api.qorlia_checkpoint_attachments(checkpoint.id)
        self.env['ir.rule'].create({'name': self.prefix + ' hidden file',
            'model_id': self.env.ref('base.model_ir_attachment').id,
            'domain_force': "[('id', '!=', %s)]" % file.id})
        with self.assertRaises(AccessError):
            api.qorlia_checkpoint_attachments(checkpoint.id)
        with self.assertRaises(AccessError):
            api.qorlia_checkpoint_attachment_download(checkpoint.id, file.id, page['version'])
