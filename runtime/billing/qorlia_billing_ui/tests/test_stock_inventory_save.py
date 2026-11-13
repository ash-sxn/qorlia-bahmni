# SPDX-License-Identifier: LGPL-3.0-or-later
# Copyright 2026 Qorlia contributors.
from unittest.mock import patch

from lxml import etree
from odoo import Command
from odoo.exceptions import AccessError, MissingError, UserError, ValidationError
from odoo.tests import Form, TransactionCase, tagged

from . import test_stock_inventory as inventory
from . import test_stock_inventory_form as forms
from ..models.stock_operation_paged import _FINANCE, _CONFIG
from ..models.stock_confirmation_paged import _effect_rows
from ..models.stock_inventory_save import _SAVE_GRAPH, _SAVE_PRIVATE


@tagged('post_install', '-at_install')
class StockInventorySavePreviewTest(inventory.StockInventoryFixture, TransactionCase):
    api = inventory.StockInventoryConfirmationTest.api
    unlinked = inventory.StockInventoryConfirmationTest.unlinked
    delivered = inventory.StockInventoryReturnTest.delivered
    node = forms.StockInventoryFormTest.node

    def load(self, picking):
        return self.api().qorlia_inventory_edit_load(picking.id)

    def edits(self, loaded, changes):
        return [{'node': self.node(loaded['form'], name), 'value': value} for name, value in changes]

    def preview(self, picking, changes, loaded=None, **kwargs):
        loaded = loaded or self.load(picking)
        return self.api().qorlia_inventory_edit_save_review(picking.id, loaded['version'], self.edits(loaded, changes), **kwargs)

    def expected(self, picking, changes):
        def save():
            form = Form(picking)
            for name, value in changes:
                field = picking._fields[name]
                setattr(form, name, picking.env[field.comodel_name].browse(value) if field.type == 'many2one' else value)
            form.save()
        return picking._qorlia_stock_preparation_preview(lambda: picking._qorlia_stock_preparation_native(
            save, _FINANCE, _CONFIG, allow_terminal_unchanged=True, graph_models=_SAVE_GRAPH,
            private_models=_SAVE_PRIVATE, private_always={'mail.followers'}), picking._qorlia_inventory_saved_tables())

    def test_scalar_native_save_effects_include_the_header_and_are_rolled_back(self):
        picking = self.unlinked()
        changes = [('origin', 'QorliaQA Saved source'), ('note', '<p>QorliaQA saved note</p>'),
            ('scheduled_date', '2026-10-24 11:22:33')]
        expected = self.expected(picking, changes)
        before = self.stamp()
        result = self.preview(picking, changes)
        self.assertEqual(result['effects'], expected[0])
        self.assertEqual(result['state_after'], expected[2])
        self.assertTrue(result['read_only'])
        self.assertTrue(result['write_ready'])
        self.assertEqual(set(result['changed_fields']), {'origin', 'note', 'scheduled_date'})
        self.assertTrue(result['effects']['updated']['stock.picking'])
        self.assertEqual(before, self.stamp())

    def test_all_three_native_types_save_contact_and_scheduling_without_sales(self):
        contact = self.env['res.partner'].create({'name': 'QorliaQA Save preview contact'})
        for kind in (self.in_type, self.out_type, self.internal_type):
            with self.subTest(kind=kind.code):
                picking = self.unlinked(kind)
                changes = [('partner_id', contact.id), ('scheduled_date', '2026-10-24 11:22:33')]
                expected = self.expected(picking, changes)
                before = self.stamp()
                result = self.preview(picking, changes)
                self.assertEqual(result['effects'], expected[0])
                self.assertEqual(result['state_after'], expected[2])
                if kind.code in ('incoming', 'outgoing'):
                    self.assertGreater(result['effects']['private_audit_counts']['mail.followers']['created'], 0)
                    self.assertNotIn('mail.followers', result['effects']['schema'])
                self.assertEqual(before, self.stamp())
                self.assertFalse(picking.sale_id)

    def test_operation_type_child_changes_match_the_complete_native_save(self):
        picking = self.unlinked()
        changes = [('picking_type_id', self.in_type.id)]
        expected = self.expected(picking, changes)
        before = self.stamp()
        result = self.preview(picking, changes)
        self.assertEqual(result['effects'], expected[0])
        self.assertEqual(result['state_after'], expected[2])
        self.assertEqual(before, self.stamp())

    def test_no_edits_do_not_write_the_whole_read_form(self):
        picking = self.unlinked()
        before = self.stamp()
        result = self.preview(picking, [])
        self.assertEqual(result['changed_fields'], [])
        self.assertEqual(result['effect_count'], 0)
        self.assertEqual(before, self.stamp())

    def test_native_readonly_outputs_are_saved_only_when_force_save_is_enabled(self):
        picking = self.unlinked()
        contact = self.env['res.partner'].create({'name': 'QorliaQA Force-save contact'})
        original = type(self.api()).onchange
        def priority(records, *args, **kwargs):
            result = original(records, *args, **kwargs)
            result.setdefault('value', {})['priority'] = '1'
            return result
        for forced in (False, True):
            view = self.env['ir.ui.view'].create({'name': 'QorliaQA Force-save priority', 'model': 'stock.picking',
                'inherit_id': self.env.ref('stock.view_picking_form').id,
                'arch': '<data><xpath expr="//field[@name=\'priority\']" position="attributes">'
                    '<attribute name="readonly">1</attribute><attribute name="force_save">%s</attribute></xpath></data>' % ('1' if forced else '')})
            changes = [('partner_id', contact.id)]
            with patch.object(type(self.api()), 'onchange', priority):
                expected = self.expected(picking, changes)
                before = self.stamp()
                result = self.preview(picking, changes)
                self.assertEqual(result['effects'], expected[0])
                self.assertEqual('priority' in result['changed_fields'], forced)
                self.assertEqual(before, self.stamp())
            view.unlink()

    def test_native_terminal_notes_save_without_validating_or_cancelling_again(self):
        done, cancelled = self.delivered(), self.unlinked()
        cancelled.with_env(self.env).action_cancel()
        for picking in (done, cancelled):
            with self.subTest(state=picking.state):
                changes = [('note', '<p>QorliaQA terminal saved note</p>')]
                expected = self.expected(picking, changes)
                before = self.stamp()
                result = self.preview(picking, changes)
                self.assertEqual(result['effects'], expected[0])
                self.assertEqual(result['state_after'], picking.state)
                self.assertEqual(before, self.stamp())

    def test_pending_native_child_values_survive_a_later_link_only_result(self):
        picking = self.unlinked()
        move = picking.move_ids
        before = self.stamp()
        model = self.api()
        values = {'id': picking.id, 'move_ids_without_package': [Command.update(move.id, {'description_picking': 'QorliaQA pending child'})]}
        merged = model._qorlia_inventory_merge_onchange(model, picking, values,
            {'move_ids_without_package': [Command.link(move.id)]})
        form = model.new(merged, origin=picking)
        self.assertEqual(form.move_ids_without_package.description_picking, 'QorliaQA pending child')
        merged = model._qorlia_inventory_merge_onchange(model, picking, merged,
            {'move_ids_without_package': [Command.clear(), Command.update(move.id, {
                'picking_type_id': [picking.picking_type_id.id, picking.picking_type_id.display_name],
                'location_id': [move.location_id.id, move.location_id.display_name],
                'location_dest_id': [move.location_dest_id.id, move.location_dest_id.display_name]})]})
        form = model.new(merged, origin=picking)
        self.assertEqual(form.move_ids_without_package._origin, move)
        self.assertEqual(form.move_ids_without_package.description_picking, 'QorliaQA pending child')
        self.assertEqual(before, self.stamp())

    def test_explicit_native_root_deletion_is_not_silently_changed_to_unlink(self):
        picking = self.unlinked()
        move = picking.move_ids
        before = self.stamp()
        merged = self.api()._qorlia_inventory_merge_onchange(self.api(), picking,
            {'id': picking.id, 'move_ids_without_package': [Command.link(move.id)]},
            {'move_ids_without_package': [Command.delete(move.id)]})
        self.assertIn(list(Command.delete(move.id)), merged['move_ids_without_package'])
        self.assertTrue(move.exists())
        self.assertEqual(before, self.stamp())

    def test_nested_native_deletion_survives_replay_and_save_extraction(self):
        picking = self.unlinked()
        line = self.reserve(picking)
        move = picking.move_ids
        model = self.api()
        before = self.stamp()
        values = {'id': picking.id, 'move_ids_without_package': [Command.update(move.id,
            {'description_picking': 'QorliaQA Pending nested deletion'})]}
        merged = model._qorlia_inventory_merge_onchange(model, picking, values,
            {'move_ids_without_package': [Command.clear(), Command.update(move.id,
                {'move_line_ids': [Command.delete(line.id)]})]})
        # A later link-only refresh must not erase either the child edit or deletion intent.
        merged = model._qorlia_inventory_merge_onchange(model, picking, merged,
            {'move_ids_without_package': [Command.clear(), Command.link(move.id)]})
        child = next(command[2] for command in merged['move_ids_without_package'] if command[0] == Command.UPDATE)
        self.assertEqual(child['description_picking'], 'QorliaQA Pending nested deletion')
        self.assertIn(list(Command.delete(line.id)), child['move_line_ids'])
        root = etree.fromstring('''<form><field name="move_ids_without_package"><tree>
            <field name="description_picking"/><field name="move_line_ids"><tree>
            <field name="lot_id"/></tree></field></tree></field></form>''')
        form = model.new(merged, origin=picking)
        changes = model._qorlia_inventory_save_fields(form, root, {'move_ids_without_package'}, values=merged)
        saved_child = next(command[2] for command in changes['move_ids_without_package'] if command[0] == Command.UPDATE)
        self.assertIn(list(Command.delete(line.id)), saved_child['move_line_ids'])
        self.assertNotIn(list(Command.unlink(line.id)), saved_child['move_line_ids'])
        def native(write_values):
            return picking._qorlia_stock_preparation_preview(lambda: picking._qorlia_stock_preparation_native(
                lambda: picking.write(write_values), _FINANCE, _CONFIG, allow_terminal_unchanged=True,
                graph_models=_SAVE_GRAPH, private_models=_SAVE_PRIVATE, private_always={'mail.followers'}),
                picking._qorlia_inventory_saved_tables())
        # The stored relation accepts deletion; the computed alias replays DELETE twice in installed native Odoo.
        stored_root = etree.fromstring(etree.tostring(root))
        stored_root.find('field').set('name', 'move_ids')
        stored_values = {'id': picking.id, 'move_ids': merged['move_ids_without_package']}
        stored_form = model.new(stored_values, origin=picking)
        stored_changes = model._qorlia_inventory_save_fields(stored_form, stored_root, {'move_ids'}, values=stored_values)
        expected = native({'move_ids': [Command.update(move.id,
            {'description_picking': 'QorliaQA Pending nested deletion', 'move_line_ids': [Command.delete(line.id)]})]})
        actual = native(stored_changes)
        self.assertEqual(actual[0], expected[0])
        self.assertEqual(actual[2], expected[2])
        for computed_values in ({'move_ids_without_package': [Command.update(move.id,
                {'description_picking': 'QorliaQA Pending nested deletion', 'move_line_ids': [Command.delete(line.id)]})]}, changes):
            with self.assertRaises(MissingError):
                native(computed_values)
        self.assertTrue(line.exists())
        self.assertEqual(before, self.stamp())

    def test_partial_commands_keep_other_members_and_pending_child_values(self):
        picking = self.unlinked()
        first = picking.move_ids
        second = first.with_env(self.env).copy({'picking_id': picking.id})
        model = self.api()
        before = self.stamp()
        values = {'id': picking.id, 'move_ids_without_package': [Command.link(first.id),
            Command.update(second.id, {'description_picking': 'QorliaQA Retained second'})]}
        merged = model._qorlia_inventory_merge_onchange(model, picking, values,
            {'move_ids_without_package': [Command.update(first.id, {'name': 'QorliaQA Edited first'})]})
        form = model.new(merged, origin=picking)
        self.assertEqual(form.move_ids_without_package._origin.ids, [first.id, second.id])
        self.assertEqual(form.move_ids_without_package[1].description_picking, 'QorliaQA Retained second')
        merged = model._qorlia_inventory_merge_onchange(model, picking, merged,
            {'move_ids_without_package': [Command.clear(), Command.link(second.id)]})
        form = model.new(merged, origin=picking)
        self.assertEqual(form.move_ids_without_package._origin.ids, [second.id])
        self.assertEqual(form.move_ids_without_package.description_picking, 'QorliaQA Retained second')
        merged = model._qorlia_inventory_merge_onchange(model, picking, merged,
            {'move_ids_without_package': [Command.set([first.id]), Command.link(second.id), Command.unlink(first.id)]})
        self.assertEqual(model.new(merged, origin=picking).move_ids_without_package._origin.ids, [second.id])
        self.assertFalse(any(command[0] == Command.DELETE for command in merged['move_ids_without_package']))
        self.assertEqual(before, self.stamp())

    def test_virtual_child_references_stay_distinct_and_keep_nested_pending_values(self):
        model = self.api()
        before = self.stamp()
        values = {'move_ids_without_package': [Command.create({'name': name, 'product_id': self.product.id,
            'move_line_ids': [Command.create({'lot_name': name})]}) for name in ('QorliaQA First', 'QorliaQA Second')]}
        merged = model._qorlia_inventory_merge_onchange(model, model.browse(), values, {})
        creates = [command for command in merged['move_ids_without_package'] if command[0] == Command.CREATE]
        self.assertEqual(len(creates), 2)
        self.assertNotEqual(creates[0][1], creates[1][1])
        children = [[item for item in command[2]['move_line_ids'] if item[0] == Command.CREATE][0] for command in creates]
        self.assertNotEqual(children[0][1], children[1][1])
        refreshed = model._qorlia_inventory_merge_onchange(model, model.browse(), merged,
            {'move_ids_without_package': [Command.clear(), (Command.CREATE, creates[1][1], {'name': 'QorliaQA Refreshed second'})]})
        retained = next(command for command in refreshed['move_ids_without_package'] if command[0] == Command.CREATE)
        self.assertEqual(retained[1], creates[1][1])
        self.assertEqual(retained[2]['product_id'], self.product.id)
        self.assertEqual(retained[2]['move_line_ids'], creates[1][2]['move_line_ids'])
        removed = model._qorlia_inventory_merge_onchange(model, model.browse(), refreshed,
            {'move_ids_without_package': [Command.unlink(retained[1])]})
        self.assertEqual(removed['move_ids_without_package'], [list(Command.clear())])
        self.assertEqual(before, self.stamp())

    def test_existing_and_virtual_numeric_references_cannot_alias(self):
        picking = self.unlinked()
        move = picking.move_ids
        model = self.api()
        before = self.stamp()
        merged = model._qorlia_inventory_merge_onchange(model, picking,
            {'id': picking.id, 'move_ids_without_package': [Command.link(move.id)]},
            {'move_ids_without_package': [(Command.CREATE, move.id, {'name': 'QorliaQA Virtual numeric ref',
                'product_id': self.product.id})]})
        commands = merged['move_ids_without_package']
        self.assertIn(list(Command.link(move.id)), commands)
        self.assertEqual(len([command for command in commands if command[0] == Command.CREATE]), 1)
        form = model.new(merged, origin=picking)
        self.assertEqual(len(form.move_ids_without_package), 2)
        self.assertEqual(form.move_ids_without_package._origin.ids, [move.id])
        for incoming in ([Command.link('missing-virtual')], [Command.set(['missing-virtual'])]):
            with self.assertRaises(ValidationError):
                model._qorlia_inventory_merge_onchange(model, picking, {}, {'move_ids_without_package': incoming})
        self.assertEqual(before, self.stamp())

    def test_view_required_fields_are_checked_before_native_save(self):
        picking = self.unlinked()
        self.env['ir.ui.view'].create({'name': 'QorliaQA Required save source', 'model': 'stock.picking',
            'inherit_id': self.env.ref('stock.view_picking_form').id,
            'arch': '<data><xpath expr="//field[@name=\'origin\']" position="attributes">'
                '<attribute name="required">1</attribute></xpath></data>'})
        before = self.stamp()
        with self.assertRaises(ValidationError):
            self.preview(picking, [('origin', False)])
        self.assertEqual(before, self.stamp())

    def test_native_header_write_denial_is_not_bypassed_by_preview(self):
        picking = self.unlinked()
        self.env['ir.rule'].create({'name': 'QorliaQA No saved header writes',
            'model_id': self.env['ir.model']._get_id('stock.picking'), 'domain_force': "[('id','!=',%s)]" % picking.id,
            'perm_read': False, 'perm_write': True, 'perm_create': False, 'perm_unlink': False})
        before = self.stamp()
        with self.assertRaises(AccessError):
            loaded = self.load(picking)
            node = next(index for index, row in enumerate(loaded['form']['layout']) if row['field'] == 'note')
            self.api().qorlia_inventory_edit_save_review(picking.id, loaded['version'],
                [{'node': node, 'value': 'QorliaQA Denied note'}])
        self.assertEqual(before, self.stamp())

    def test_changed_native_baseline_rejects_full_save_review(self):
        picking = self.unlinked()
        loaded = self.load(picking)
        picking.with_env(self.env).note = 'QorliaQA External edit'
        before = self.stamp()
        with self.assertRaises(UserError):
            self.preview(picking, [('note', 'QorliaQA Stale note')], loaded)
        self.assertEqual(before, self.stamp())

    def test_complete_save_effects_are_sequential_and_distinct_from_onchange_inspection(self):
        picking = self.unlinked()
        contact = self.env['res.partner'].create({'name': 'QorliaQA Multi-page save contact'})
        loaded = self.load(picking)
        edits = self.edits(loaded, [('note', 'QorliaQA Paged save note')])
        onchange = self.api().qorlia_inventory_edit_onchange(picking.id, loaded['version'], edits)
        self.assertEqual(onchange['effect_count'], 0)
        note_review = self.api().qorlia_inventory_edit_save_review(picking.id, loaded['version'], edits)
        self.assertGreater(note_review['effect_count'], 0)
        self.assertNotEqual(note_review['review_version'], onchange['effect_version'])
        edits = self.edits(loaded, [('note', 'QorliaQA Paged save note'), ('partner_id', contact.id)])
        first = self.api().qorlia_inventory_edit_save_review(picking.id, loaded['version'], edits, limit=1)
        self.assertGreater(first['effect_count'], 1)
        self.assertFalse(first['review_complete_token'])
        pages, current = [first], first
        while current['next_after'] is not False:
            current = self.api().qorlia_inventory_edit_save_review(picking.id, loaded['version'], edits,
                current['next_after'], first['review_version'], current['continuation_token'], 1)
            pages.append(current)
        self.assertEqual(sum(len(_effect_rows(page['effects'])) for page in pages), first['effect_count'])
        self.assertFalse(current['continuation_token'])
        self.assertEqual(len(current['review_complete_token']), 64)

    def test_malformed_or_onchange_page_tokens_cannot_authorize_save_review(self):
        picking = self.unlinked()
        loaded = self.load(picking)
        edits = self.edits(loaded, [('note', 'QorliaQA Invalid page')])
        before = self.stamp()
        for kwargs in ({'after': True}, {'limit': 0}, {'limit': 101}, {'after': 1},
                {'review_version': '0' * 64}, {'after': -1}):
            with self.assertRaises(ValidationError):
                self.api().qorlia_inventory_edit_save_review(picking.id, loaded['version'], edits, **kwargs)
        self.assertEqual(before, self.stamp())

    def test_financial_and_physical_side_effects_from_write_are_rejected_and_rolled_back(self):
        picking = self.unlinked()
        original = type(self.api()).write
        actions = [lambda: self.order.sudo().write({'client_order_ref': 'QorliaQA Forbidden saved finance'}),
            lambda: self.env['stock.quant'].sudo()._update_available_quantity(self.product, self.warehouse.lot_stock_id, 1, lot_id=self.lot)]
        for action in actions:
            before = self.stamp()
            def malicious(records, values):
                result = original(records, values)
                if 'note' in values:
                    action()
                return result
            with patch.object(type(self.api()), 'write', malicious), self.assertRaises(UserError):
                self.preview(picking, [('note', 'QorliaQA Guarded native write')])
            self.assertEqual(before, self.stamp())
