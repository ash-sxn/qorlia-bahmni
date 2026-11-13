# SPDX-License-Identifier: LGPL-3.0-or-later
import base64
import uuid
from unittest.mock import patch
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

    def edit_request(self, checkpoint, uploads=None, remove_ids=None):
        return {'checkpoint_id': checkpoint.id,
            'version': self.checkpoints.qorlia_checkpoint_attachments(checkpoint.id)['version'],
            'uploads': [{'name': self.prefix + '.bin', 'content': base64.b64encode(b'Native\x00\xff').decode()}]
                if uploads is None else uploads,
            'remove_ids': [] if remove_ids is None else remove_ids}

    def test_atomic_upload_empty_file_and_exact_retry_preserve_native_accounting(self):
        checkpoint = self.checkpoint()
        old = self.file(checkpoint)
        before = self.checkpoints._qorlia_checkpoint_editor_result(checkpoint, checkpoint,
            checkpoint.line_ids, self.checkpoints._qorlia_checkpoint_editor_graph(checkpoint.line_ids))
        payload = self.edit_request(checkpoint)
        payload['uploads'].append({'name': self.prefix + '.empty', 'content': ''})
        key = str(uuid.uuid4())
        self.assertFalse(self.checkpoints.qorlia_checkpoint_attachment_status(payload, key)['accepted'])
        result = self.checkpoints.qorlia_checkpoint_attachment_save(payload, key)
        self.assertTrue(result['accepted'])
        self.assertEqual(result['attachments']['total_count'], 3)
        self.assertEqual(self.checkpoints.qorlia_checkpoint_attachment_save(payload, key), result)
        self.assertEqual(self.checkpoints.qorlia_checkpoint_attachment_status(payload, key), result)
        files = checkpoint.attachment_ids - old
        self.assertEqual(len(files), 2)
        for file in files:
            upload = next(item for item in payload['uploads'] if item['name'] == file.name)
            self.assertEqual(file.raw or b'', base64.b64decode(upload['content']))
            self.assertEqual(file.company_id, checkpoint.company_id)
            self.assertFalse(file.public or file.access_token or file.res_field)
            self.assertEqual((file.res_model, file.res_id), (checkpoint._name, checkpoint.id))
        self.assertEqual(self.checkpoints._qorlia_checkpoint_editor_result(checkpoint, checkpoint,
            checkpoint.line_ids, self.checkpoints._qorlia_checkpoint_editor_graph(checkpoint.line_ids)), before)

    def test_removal_only_unlinks_native_relation_and_retains_shared_file(self):
        checkpoint = self.checkpoint()
        other = self.checkpoint()
        file = self.file(other)
        checkpoint.attachment_ids |= file
        file.write({'res_model': checkpoint._name, 'res_id': other.id})
        before = file.read(['name', 'checksum', 'res_model', 'res_id', 'write_date'])
        payload = self.edit_request(checkpoint, uploads=[], remove_ids=file.ids)
        result = self.checkpoints.qorlia_checkpoint_attachment_save(payload, str(uuid.uuid4()))
        self.assertTrue(result['accepted'])
        self.assertEqual(result['attachments']['rows'], [])
        self.assertTrue(file.exists())
        self.assertIn(file, other.attachment_ids)
        self.assertEqual(file.read(['name', 'checksum', 'res_model', 'res_id', 'write_date']), before)

    def test_combined_upload_removal_and_recovery_return_current_list(self):
        checkpoint = self.checkpoint()
        old = self.file(checkpoint)
        payload = self.edit_request(checkpoint, remove_ids=old.ids)
        key = str(uuid.uuid4())
        result = self.checkpoints.qorlia_checkpoint_attachment_save(payload, key)
        self.assertEqual(result['attachments']['total_count'], 1)
        saved = checkpoint.attachment_ids
        later = self.file(checkpoint, name=self.prefix + '-later.txt')
        recovered = self.checkpoints.qorlia_checkpoint_attachment_save(payload, key)
        self.assertTrue(recovered['accepted'])
        self.assertEqual({row['id'] for row in recovered['attachments']['rows']}, set((saved | later).ids))
        self.assertNotEqual(recovered['attachments']['version'], result['attachments']['version'])
        self.assertTrue(old.exists())

    def test_invalid_attachment_edit_payloads_and_metadata_injection_rejected(self):
        checkpoint = self.checkpoint()
        payload = self.edit_request(checkpoint)
        invalid = [dict(payload, checkpoint_id=True), dict(payload, version='bad'),
            dict(payload, remove_ids=[True]), dict(payload, remove_ids=[1, 1]),
            dict(payload, remove_ids=False), dict(payload, uploads=[], remove_ids=[]),
            dict(payload, uploads=[{'name': '../bad', 'content': ''}]),
            dict(payload, uploads=[{'name': 'bad\x00name', 'content': ''}]),
            dict(payload, uploads=[{'name': 'bad.txt', 'content': 'YR=='}]),
            dict(payload, uploads=[{'name': 'bad.txt', 'content': '!!!!'}]),
            dict(payload, uploads=[dict(payload['uploads'][0], res_id=1)]),
            dict(payload, uploads=payload['uploads'] * 6), dict(payload, foreign=True)]
        for values in invalid:
            with self.assertRaises(ValidationError):
                self.checkpoints.qorlia_checkpoint_attachment_save(values, str(uuid.uuid4()))
        for key in ('bad', True, str(uuid.uuid4()).upper()):
            with self.assertRaises(ValidationError):
                self.checkpoints.qorlia_checkpoint_attachment_status(payload, key)
        self.assertFalse(checkpoint.attachment_ids)

    def test_stale_version_and_unlinked_removal_create_no_orphan_files(self):
        checkpoint = self.checkpoint()
        payload = self.edit_request(checkpoint)
        self.file(checkpoint)
        count = self.env['ir.attachment'].search_count([])
        with self.assertRaises(UserError):
            self.checkpoints.qorlia_checkpoint_attachment_save(payload, str(uuid.uuid4()))
        other = self.file(self.checkpoint())
        payload = self.edit_request(checkpoint, remove_ids=other.ids)
        count += 1
        with self.assertRaises(AccessError):
            self.checkpoints.qorlia_checkpoint_attachment_save(payload, str(uuid.uuid4()))
        self.assertEqual(self.env['ir.attachment'].search_count([]), count)
        self.assertFalse(checkpoint.qorlia_checkpoint_edit_receipts)

    def test_exact_request_binds_upload_content_order_removal_and_author(self):
        checkpoint = self.checkpoint()
        payload = self.edit_request(checkpoint)
        key = str(uuid.uuid4())
        self.checkpoints.qorlia_checkpoint_attachment_save(payload, key)
        for values in (dict(payload, uploads=[{'name': 'Other.txt', 'content': ''}]),
                dict(payload, version='0' * 64), dict(payload, remove_ids=[1])):
            with self.assertRaises(ValidationError):
                self.checkpoints.qorlia_checkpoint_attachment_status(values, key)
        reader = self.env['res.users'].with_context(no_reset_password=True).create({'name': self.prefix,
            'login': uuid.uuid4().hex, 'groups_id': [Command.set(self.env.ref('account.group_account_readonly').ids)]})
        with self.assertRaises(ValidationError):
            self.checkpoints.with_user(reader).qorlia_checkpoint_attachment_status(payload, key)

    def test_readonly_public_and_foreign_company_cannot_change_files(self):
        checkpoint = self.checkpoint()
        reader = self.env['res.users'].with_context(no_reset_password=True).create({'name': self.prefix,
            'login': uuid.uuid4().hex, 'groups_id': [Command.set(self.env.ref('account.group_account_readonly').ids)]})
        api = self.checkpoints.with_user(reader)
        payload = self.edit_request(checkpoint)
        readonly = api.qorlia_checkpoint_attachments(checkpoint.id)
        self.assertFalse(readonly['can_upload'] or readonly['can_remove'])
        self.assertTrue(self.checkpoints.qorlia_checkpoint_attachments(checkpoint.id)['can_upload'])
        payload['version'] = readonly['version']
        with self.assertRaises(AccessError):
            api.qorlia_checkpoint_attachment_save(payload, str(uuid.uuid4()))
        with self.assertRaises(AccessError):
            self.checkpoints.with_user(self.env.ref('base.public_user')).qorlia_checkpoint_attachment_save(payload, str(uuid.uuid4()))
        other = self.env['res.company'].create({'name': self.prefix + ' foreign'})
        with self.assertRaises(AccessError):
            self.checkpoints.with_context(allowed_company_ids=other.ids).qorlia_checkpoint_attachment_save(payload, str(uuid.uuid4()))

    def test_hidden_original_parent_blocks_shared_attachment_removal(self):
        checkpoint, other = self.checkpoint(), self.checkpoint()
        file = self.file(other)
        checkpoint.attachment_ids |= file
        file.write({'res_model': checkpoint._name, 'res_id': other.id})
        user = self.env['res.users'].with_context(no_reset_password=True).create({'name': self.prefix,
            'login': uuid.uuid4().hex, 'groups_id': [Command.set(self.env.ref('account.group_account_user').ids)]})
        api = self.checkpoints.with_user(user)
        payload = self.edit_request(checkpoint, uploads=[], remove_ids=file.ids)
        payload['version'] = api.qorlia_checkpoint_attachments(checkpoint.id)['version']
        self.env['ir.rule'].create({'name': self.prefix + ' hidden original parent',
            'model_id': self.env.ref('account.model_account_bank_statement').id,
            'domain_force': "[('id', '!=', %s)]" % other.id})
        with self.assertRaises(AccessError):
            api.qorlia_checkpoint_attachment_save(payload, str(uuid.uuid4()))

    def test_failed_native_link_write_rolls_back_files_receipt_and_callbacks(self):
        checkpoint = self.checkpoint()
        payload = self.edit_request(checkpoint)
        key = str(uuid.uuid4())
        count = self.env['ir.attachment'].search_count([])
        callbacks = self.env.cr.postcommit
        original = type(checkpoint).write
        added = lambda: None

        def fail_after_link(records, values):
            result = original(records, values)
            if 'attachment_ids' in values:
                self.env.cr.postcommit.add(added)
                raise UserError('Synthetic link failure')
            return result

        with patch.object(type(checkpoint), 'write', fail_after_link):
            with self.assertRaisesRegex(UserError, 'Synthetic link failure'):
                self.checkpoints.qorlia_checkpoint_attachment_save(payload, key)
        self.assertIs(self.env.cr.postcommit, callbacks)
        self.assertNotIn(added, callbacks._funcs)
        self.assertFalse(checkpoint.attachment_ids or checkpoint.qorlia_checkpoint_edit_receipts)
        self.assertEqual(self.env['ir.attachment'].search_count([]), count)
        self.assertFalse(self.checkpoints.qorlia_checkpoint_attachment_status(payload, key)['accepted'])

    def test_native_file_transform_is_detected_and_rolls_back(self):
        checkpoint = self.checkpoint()
        payload = self.edit_request(checkpoint)
        count = self.env['ir.attachment'].search_count([])
        original = type(self.env['ir.attachment']).create

        def transform(records, values):
            result = original(records, values)
            result.write({'name': 'Unexpected native transformation'})
            return result

        with patch.object(type(self.env['ir.attachment']), 'create', transform):
            with self.assertRaisesRegex(UserError, 'differs from the requested file'):
                self.checkpoints.qorlia_checkpoint_attachment_save(payload, str(uuid.uuid4()))
        self.assertEqual(self.env['ir.attachment'].search_count([]), count)
        self.assertFalse(checkpoint.qorlia_checkpoint_edit_receipts)

    def test_bypass_context_and_receipt_namespace_collision_are_rejected(self):
        checkpoint = self.checkpoint()
        payload = self.edit_request(checkpoint)
        for context in ({'default_public': True}, {'check_move_validity': False},
                {'skip_account_move_synchronization': True}, {'force_delete': True}):
            with self.assertRaises(ValidationError):
                self.checkpoints.with_context(**context).qorlia_checkpoint_attachment_save(payload, str(uuid.uuid4()))
        editor = self.checkpoints.qorlia_checkpoint_editor_load(checkpoint_id=checkpoint.id)
        editing = {name: editor[name] for name in ('checkpoint_id', 'entry_ids', 'split_line_id', 'version', 'values')}
        review = self.checkpoints.qorlia_checkpoint_editor_preview(editing)
        key = str(uuid.uuid4())
        self.checkpoints.qorlia_checkpoint_editor_save(editing, review['review_version'], key)
        with self.assertRaises(ValidationError):
            self.checkpoints.qorlia_checkpoint_attachment_status(payload, key)

    def test_upload_size_boundary_is_shared_with_invoice_note_parser(self):
        checkpoint = self.checkpoint()
        payload = self.edit_request(checkpoint)
        payload['uploads'] = [{'name': 'Large.bin', 'content': base64.b64encode(b'x' * (10 * 1024 * 1024 + 1)).decode()}]
        with self.assertRaises(ValidationError):
            self.checkpoints.qorlia_checkpoint_attachment_save(payload, str(uuid.uuid4()))
        self.assertFalse(checkpoint.attachment_ids)

    def test_attachment_create_acl_denial_leaves_no_receipt(self):
        checkpoint = self.checkpoint()
        payload = self.edit_request(checkpoint)
        original = type(self.env['ir.attachment']).check_access_rights

        def deny_create(records, operation, *args, **kwargs):
            if operation == 'create':
                if kwargs.get('raise_exception') is False:
                    return False
                raise AccessError('Synthetic attachment create denied')
            return original(records, operation, *args, **kwargs)

        with patch.object(type(self.env['ir.attachment']), 'check_access_rights', deny_create):
            capabilities = self.checkpoints.qorlia_checkpoint_attachments(checkpoint.id)
            self.assertFalse(capabilities['can_upload'])
            self.assertTrue(capabilities['can_remove'])
            payload['version'] = capabilities['version']
            with self.assertRaises(AccessError):
                self.checkpoints.qorlia_checkpoint_attachment_save(payload, str(uuid.uuid4()))
        self.assertFalse(checkpoint.attachment_ids or checkpoint.qorlia_checkpoint_edit_receipts)

    def test_unexpected_financial_hook_rolls_back_accounting_and_files(self):
        checkpoint = self.checkpoint()
        payload = self.edit_request(checkpoint)
        entry = checkpoint.line_ids[0]
        plan = self.env['account.analytic.plan'].create({'name': self.prefix})
        account = self.env['account.analytic.account'].create({'name': self.prefix, 'plan_id': plan.id})
        before = self.env['account.analytic.line'].search_count([])
        files_before = self.env['ir.attachment'].search_count([])
        original = type(checkpoint).write

        def hook(records, values):
            result = original(records, values)
            if 'attachment_ids' in values:
                self.env['account.analytic.line'].create({'name': self.prefix, 'account_id': account.id,
                    'move_line_id': entry.move_id.line_ids[0].id, 'amount': 1})
            return result

        with patch.object(type(checkpoint), 'write', hook):
            with self.assertRaisesRegex(UserError, 'changed unrelated files or accounting'):
                self.checkpoints.qorlia_checkpoint_attachment_save(payload, str(uuid.uuid4()))
        self.assertEqual(self.env['account.analytic.line'].search_count([]), before)
        self.assertEqual(self.env['ir.attachment'].search_count([]), files_before)
        self.assertFalse(checkpoint.attachment_ids or checkpoint.qorlia_checkpoint_edit_receipts)

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
