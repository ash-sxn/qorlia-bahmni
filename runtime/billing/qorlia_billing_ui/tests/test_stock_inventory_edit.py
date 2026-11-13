# SPDX-License-Identifier: LGPL-3.0-or-later
# Copyright 2026 Qorlia contributors.
from unittest.mock import patch

from odoo.exceptions import AccessError, UserError, ValidationError
from odoo.tests import Form, TransactionCase, tagged

from . import test_stock_inventory as inventory
from . import test_stock_inventory_form as forms
from ..models.stock_inventory_draft import _wire
from ..models.stock_confirmation_paged import _effect_rows
from ..models.stock_operation_paged import _FINANCE, _CONFIG


@tagged('post_install', '-at_install')
class StockInventoryEditTest(inventory.StockInventoryFixture, TransactionCase):
    api = inventory.StockInventoryConfirmationTest.api
    unlinked = inventory.StockInventoryConfirmationTest.unlinked
    delivered = inventory.StockInventoryReturnTest.delivered
    node = forms.StockInventoryFormTest.node
    deny = inventory.StockInventoryDetailTest.deny

    def load(self, picking):
        return self.api().qorlia_inventory_edit_load(picking.id)

    def ledger(self, current, changes):
        return [{'node': self.node(current['form'], name), 'value': value} for name, value in changes]

    def expected(self, picking, changes):
        def replay():
            form = Form(picking)
            for name, value in changes:
                field = picking._fields[name]
                setattr(form, name, picking.env[field.comodel_name].browse(value) if field.type == 'many2one' else value)
            return _wire(form._values)
        return picking._qorlia_stock_preparation_preview(replay, picking._qorlia_return_paged_tables())

    def compare(self, result, expected):
        for name, value in result['form']['values'].items():
            self.assertEqual(value, expected[name], name)

    def pages(self, picking, loaded, edits, limit=1):
        result, after, version, token = [], 0, False, False
        while True:
            page = self.api().qorlia_inventory_edit_effects(picking.id, loaded['version'], edits,
                after, version, token, limit)
            result.append(page)
            if page['next_after'] is False:
                return result
            after, version, token = page['next_after'], page['effect_version'], page['continuation_token']

    def test_saved_load_and_empty_replay_preserve_identity_state_and_all_data(self):
        picking = self.unlinked()
        self.assertFalse(self.reader.has_group('sales_team.group_sale_salesman'))
        before = self.stamp()
        loaded = self.load(picking)
        result = self.api().qorlia_inventory_edit_onchange(picking.id, loaded['version'], [])
        self.assertTrue(result['read_only'])
        self.assertFalse(result['write_ready'])
        self.assertEqual(result['transfer_id'], picking.id)
        self.assertEqual(result['form']['values']['id'], picking.id)
        self.assertEqual(result['version'], loaded['version'])
        self.assertEqual(result['effect_count'], 0)
        self.assertEqual(before, self.stamp())

    def test_saved_ordered_scalar_replay_matches_native_form_and_rolls_back_linked_writes(self):
        picking = self.unlinked()
        original_partners = {move.id: move.partner_id.id for move in picking.move_ids}
        contact = self.env['res.partner'].create({'name': 'QorliaQA Saved native contact'})
        changes = [('partner_id', contact.id), ('scheduled_date', '2026-10-23 12:34:56'),
            ('origin', 'QorliaQA Native stored header'), ('note', '<p>QorliaQA ' + 'n' * 12000 + '</p>')]
        expected = self.expected(picking, changes)
        loaded = self.load(picking)
        before = self.stamp()
        result = self.api().qorlia_inventory_edit_onchange(picking.id, loaded['version'], self.ledger(loaded, changes))
        self.compare(result, expected)
        self.assertEqual(before, self.stamp())
        self.assertEqual(picking.partner_id, self.customer)
        self.assertEqual({move.id: move.partner_id.id for move in picking.move_ids}, original_partners)
        self.assertEqual(picking.origin, 'QorliaQA Validation native contract')
        self.assertFalse(picking.note)

    def test_real_native_partner_move_effects_are_complete_stable_and_paged_without_saving(self):
        picking = self.unlinked()
        picking.move_ids.with_env(self.env).copy({'picking_id': picking.id, 'sale_line_id': False})
        contact = self.env['res.partner'].create({'name': 'QorliaQA Saved effect contact'})
        original_partners = {move.id: move.partner_id.id for move in picking.move_ids}
        loaded = self.load(picking)
        edits = self.ledger(loaded, [('partner_id', contact.id)])
        before = self.stamp()
        preview = self.api().qorlia_inventory_edit_onchange(picking.id, loaded['version'], edits)
        pages = self.pages(picking, loaded, edits)
        rows = [row for page in pages for row in _effect_rows(page['effects'])]
        self.assertEqual(len(rows), preview['effect_count'])
        self.assertGreaterEqual(len(pages), 2)
        changed = [row for model, kind, row in rows if model == 'stock.move' and kind == 'updated']
        self.assertEqual({row['id'] for row in changed}, set(picking.move_ids.ids))
        for row in changed:
            self.assertEqual(row['before']['partner_id'], original_partners[row['id']])
            self.assertEqual(row['after']['partner_id'], contact.id)
        self.assertTrue(all(page['effect_version'] == preview['effect_version'] for page in pages))
        self.assertFalse(pages[-1]['continuation_token'])
        self.assertEqual(before, self.stamp())

    def test_done_cancelled_native_notes_are_previewable_but_state_and_physical_stock_are_preserved(self):
        done = self.delivered()
        cancelled = self.unlinked()
        cancelled.with_env(self.env).action_cancel()
        for picking in (done, cancelled):
            with self.subTest(state=picking.state):
                loaded = self.load(picking)
                before = self.stamp()
                expected = self.expected(picking, [('note', '<p>QorliaQA Terminal note</p>')])
                result = self.api().qorlia_inventory_edit_onchange(picking.id, loaded['version'],
                    self.ledger(loaded, [('note', '<p>QorliaQA Terminal note</p>')]))
                self.compare(result, expected)
                self.assertEqual(result['form']['values']['state'], picking.state)
                self.assertEqual(before, self.stamp())
                # Existing preparation callers must still reject terminal stock without the explicit preserve-state mode.
                with self.assertRaises(UserError):
                    picking._qorlia_stock_preparation_preview(lambda: picking._qorlia_stock_preparation_native(
                        lambda: False, _FINANCE, _CONFIG), picking._qorlia_return_paged_tables())

    def test_stale_record_view_locale_and_malformed_versions_are_rejected(self):
        picking = self.unlinked()
        loaded = self.load(picking)
        for invalid in (False, 'bad', '0' * 64):
            expected = UserError if invalid == '0' * 64 else ValidationError
            with self.assertRaises(expected):
                self.api().qorlia_inventory_edit_onchange(picking.id, invalid, [])
        with self.assertRaises(UserError):
            self.api().with_context(tz='Asia/Kolkata').qorlia_inventory_edit_onchange(picking.id, loaded['version'], [])
        picking.with_env(self.env).note = '<p>QorliaQA Changed externally</p>'
        with self.assertRaises(UserError):
            self.api().qorlia_inventory_edit_onchange(picking.id, loaded['version'], [])
        loaded = self.load(picking)
        self.env['ir.ui.view'].create({'name': 'QorliaQA Saved view change', 'model': 'stock.picking',
            'inherit_id': self.env.ref('stock.view_picking_form').id,
            'arch': '<data><xpath expr="//field[@name=\'origin\']" position="attributes">'
                '<attribute name="string">QorliaQA Source label</attribute></xpath></data>'})
        with self.assertRaises(UserError):
            self.api().qorlia_inventory_edit_onchange(picking.id, loaded['version'], [])

    def test_readonly_hidden_identity_collection_and_invalid_edits_fail_closed(self):
        picking = self.unlinked()
        loaded = self.load(picking)
        for index, row in enumerate(loaded['form']['layout']):
            kind = loaded['form']['fields'][row['field']]['type']
            if row['field'] == 'id' or kind in ('one2many', 'many2many'):
                expected = ValidationError
            elif row['rules']['readonly'] or not row['rules']['visible']:
                expected = AccessError
            else:
                continue
            with self.subTest(field=row['field']), self.assertRaises(expected):
                self.api().qorlia_inventory_edit_onchange(picking.id, loaded['version'], [{'node': index, 'value': False}])
        for edits in (None, {}, [{'node': True, 'value': False}], [{'node': 0}],
                [{'node': 99999, 'value': False}], [{'node': 0, 'value': False}] * 101):
            with self.assertRaises(ValidationError):
                self.api().qorlia_inventory_edit_onchange(picking.id, loaded['version'], edits)

    def test_hidden_linked_move_and_denied_write_to_native_move_do_not_return_partial_forms(self):
        picking = self.unlinked()
        contact = self.env['res.partner'].create({'name': 'QorliaQA Saved denied contact'})
        rule = self.deny('stock.move', picking.move_ids.id)
        with self.assertRaises(AccessError):
            self.load(picking)
        rule.unlink()
        self.env['ir.rule'].create({'name': 'QorliaQA Deny native saved move write',
            'model_id': self.env['ir.model']._get_id('stock.move'),
            'domain_force': "[('id', '!=', %s)]" % picking.move_ids.id,
            'perm_read': False, 'perm_write': True, 'perm_create': False, 'perm_unlink': False})
        loaded = self.load(picking)
        before = self.stamp()
        with self.assertRaises(AccessError):
            self.api().qorlia_inventory_edit_onchange(picking.id, loaded['version'], self.ledger(loaded, [('partner_id', contact.id)]))
        self.assertEqual(before, self.stamp())

    def test_nonstock_and_foreign_saved_transfer_scope_is_denied(self):
        picking = self.unlinked()
        for invalid in (False, True, 0, -1, '1'):
            with self.assertRaises(ValidationError):
                self.api().qorlia_inventory_edit_load(invalid)
        self.env.flush_all()
        with self.assertRaises(AccessError):
            self.env['stock.picking'].with_user(self.env.ref('base.public_user')).qorlia_inventory_edit_load(picking.id)
        company = self.env['res.company'].create({'name': 'QorliaQA Saved foreign company'})
        warehouse = self.env['stock.warehouse'].search([('company_id', '=', company.id)], limit=1)
        if not warehouse:
            warehouse = self.env['stock.warehouse'].create({'name': 'QorliaQA Saved foreign warehouse', 'code': 'QSF', 'company_id': company.id})
        foreign = self.env['stock.picking'].create({'picking_type_id': warehouse.int_type_id.id,
            'location_id': warehouse.lot_stock_id.id, 'location_dest_id': warehouse.lot_stock_id.id})
        with self.assertRaises(AccessError):
            self.load(foreign)

    def test_native_config_financial_physical_and_state_writes_are_rejected_and_rolled_back(self):
        picking = self.unlinked()
        contact = self.env['res.partner'].create({'name': 'QorliaQA Saved guard contact'})
        loaded = self.load(picking)
        edits = self.ledger(loaded, [('partner_id', contact.id)])
        original = type(self.api()).onchange
        actions = [lambda records: records.env.company.sudo().write({'stock_move_sms_validation': False}),
            lambda records: self.order.sudo().write({'client_order_ref': 'QorliaQA Forbidden financial change'}),
            lambda records: records.env['stock.quant'].sudo()._update_available_quantity(self.product,
                self.warehouse.lot_stock_id, 1, lot_id=self.lot),
            lambda records: records.browse(picking.id).write({'state': 'cancel'})]
        for action in actions:
            before = self.stamp()
            def malicious(records, *args, **kwargs):
                result = original(records, *args, **kwargs)
                action(records)
                return result
            with patch.object(type(self.api()), 'onchange', malicious), self.assertRaises(UserError):
                self.api().qorlia_inventory_edit_onchange(picking.id, loaded['version'], edits)
            self.assertEqual(before, self.stamp())

    def test_success_and_failure_restore_all_callback_objects_and_do_not_send_queued_callbacks(self):
        picking = self.unlinked()
        contact = self.env['res.partner'].create({'name': 'QorliaQA Saved callback contact'})
        loaded = self.load(picking)
        edits = self.ledger(loaded, [('partner_id', contact.id)])
        callbacks = {name: getattr(self.env.cr, name) for name in ('precommit', 'postcommit', 'prerollback', 'postrollback')}
        marker = []
        original = type(self.api()).onchange
        def queued(records, *args, **kwargs):
            result = original(records, *args, **kwargs)
            records.env.cr.postcommit.add(lambda: marker.append('sent'))
            return result
        with patch.object(type(self.api()), 'onchange', queued):
            self.api().qorlia_inventory_edit_onchange(picking.id, loaded['version'], edits)
        self.assertEqual(marker, [])
        for name, callback in callbacks.items():
            self.assertIs(getattr(self.env.cr, name), callback)
        before = self.stamp()
        def failed(records, *args, **kwargs):
            queued(records, *args, **kwargs)
            raise UserError('QorliaQA Native onchange failure')
        with patch.object(type(self.api()), 'onchange', failed), self.assertRaises(UserError):
            self.api().qorlia_inventory_edit_onchange(picking.id, loaded['version'], edits)
        self.assertEqual(marker, [])
        for name, callback in callbacks.items():
            self.assertIs(getattr(self.env.cr, name), callback)
        self.assertEqual(before, self.stamp())

    def test_edited_relation_choices_keep_native_domains_and_reject_search_writes(self):
        picking = self.unlinked()
        contact = self.env['res.partner'].create({'name': 'QorliaQA Saved choice contact'})
        loaded = self.load(picking)
        edits = self.ledger(loaded, [('partner_id', contact.id)])
        node = self.node(loaded['form'], 'user_id')
        original = type(self.api()).onchange
        def native_domain(records, *args, **kwargs):
            result = original(records, *args, **kwargs)
            result['domain'] = {'user_id': [('id', '=', self.reader.id)]}
            return result
        with patch.object(type(self.api()), 'onchange', native_domain):
            chosen = self.api().qorlia_inventory_edit_choices(picking.id, loaded['version'], edits, node, 'QorliaQA')
            self.assertEqual(chosen['page']['rows'], [[self.reader.id, self.reader.display_name]])
        original_search = type(self.env['res.users']).name_search
        def malicious_search(records, *args, **kwargs):
            records.env['stock.picking'].browse(picking.id).write({'origin': 'QorliaQA Forbidden choice write'})
            return original_search(records, *args, **kwargs)
        before = self.stamp()
        with patch.object(type(self.env['res.users']), 'name_search', malicious_search), self.assertRaises(UserError):
            self.api().qorlia_inventory_edit_choices(picking.id, loaded['version'], edits, node, 'QorliaQA')
        self.assertEqual(before, self.stamp())

    def test_effect_pages_reject_skips_tampered_tokens_and_changed_native_baseline(self):
        picking = self.unlinked()
        picking.move_ids.with_env(self.env).copy({'picking_id': picking.id, 'sale_line_id': False})
        contact = self.env['res.partner'].create({'name': 'QorliaQA Saved page contact'})
        loaded = self.load(picking)
        edits = self.ledger(loaded, [('partner_id', contact.id)])
        first = self.api().qorlia_inventory_edit_effects(picking.id, loaded['version'], edits, limit=1)
        self.assertIsNot(first['next_after'], False)
        for kwargs in ({'after': first['next_after'] + 1, 'effect_version': first['effect_version'],
                'continuation_token': first['continuation_token']}, {'after': first['next_after'],
                'effect_version': first['effect_version'], 'continuation_token': '0' * 64}):
            with self.assertRaises(UserError):
                self.api().qorlia_inventory_edit_effects(picking.id, loaded['version'], edits, **kwargs)
        for kwargs in ({'after': True}, {'limit': 0}, {'limit': 101}, {'after': -1},
                {'effect_version': '0' * 64}, {'after': 1}):
            with self.assertRaises(ValidationError):
                self.api().qorlia_inventory_edit_effects(picking.id, loaded['version'], edits, **kwargs)
        picking.with_env(self.env).note = '<p>QorliaQA Saved between pages</p>'
        with self.assertRaises(UserError):
            self.api().qorlia_inventory_edit_effects(picking.id, loaded['version'], edits,
                first['next_after'], first['effect_version'], first['continuation_token'])

    def test_sales_linked_transfer_uses_its_native_contact_onchange_without_a_fake_order(self):
        picking = self.picking().with_user(self.reader)
        group = self.env['procurement.group'].create({'name': 'QorliaQA Saved linked order',
            'sale_id': self.order.id, 'partner_id': self.customer.id})
        picking.with_env(self.env).group_id = group
        picking.move_ids.with_env(self.env).group_id = group
        self.assertEqual(picking.sale_id, self.order)
        self.assertFalse(self.reader.has_group('sales_team.group_sale_salesman'))
        contact = self.env['res.partner'].create({'name': 'QorliaQA Linked saved contact'})
        expected = self.expected(picking, [('partner_id', contact.id)])
        loaded = self.load(picking)
        result = self.api().qorlia_inventory_edit_onchange(picking.id, loaded['version'], self.ledger(loaded, [('partner_id', contact.id)]))
        self.compare(result, expected)
        self.assertEqual(picking.sale_id, self.order)
        self.assertEqual(picking.partner_id, self.customer)
