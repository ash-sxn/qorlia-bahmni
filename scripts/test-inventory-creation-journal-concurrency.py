# SPDX-License-Identifier: LGPL-3.0-or-later
# Copyright 2026 Qorlia contributors.
"""Opt-in committed native test. Run through Odoo shell on a disposable synthetic copy only."""
import ast
import copy
import hashlib
import json
import os
from pathlib import Path
import queue
import re
import threading
import time
import traceback
import uuid
from functools import wraps
from unittest.mock import patch

from psycopg2 import OperationalError

from odoo import api, Command, SUPERUSER_ID
from odoo.exceptions import ValidationError
from odoo.service.model import retrying
from odoo.tools import config
from odoo.addons.qorlia_billing_ui import __file__ as addon_file


def run(shell_env):
    database = shell_env.cr.dbname
    if (not __debug__ or config['http_enable']
            or not re.fullmatch(r'qorliaqa_create_journal_[0-9]{8}_r[1-9][0-9]*', database)
            or os.environ.get('QORLIA_COMMITTED_JOURNAL_TEST') != database):
        raise RuntimeError('This test commits data. Use an explicitly opted-in disposable synthetic database copy with HTTP disabled.')
    registry, company = shell_env.registry, shell_env.company.id
    context = {'allowed_company_ids': [company], 'lang': 'en_US', 'tz': 'UTC'}
    source = Path(addon_file).parent
    assert ast.literal_eval((source / '__manifest__.py').read_text())['version'] == '16.0.1.83.0'
    hashes = {str(path.relative_to(source)): hashlib.sha256(path.read_bytes()).hexdigest()
        for path in source.rglob('*.py')}
    assert len(hashes) == 122
    with registry.cursor() as cr:
        setup = api.Environment(cr, SUPERUSER_ID, context)
        assert setup.company.name == 'QorliaQA Isolated Billing'
        assert setup['ir.module.module'].search([('name', '=', 'qorlia_billing_ui')]).latest_version == '16.0.1.49.0'
        assert setup['account.analytic.plan'].browse(23).default_applicability == 'mandatory'
        assert setup.company.stock_move_sms_validation
        cr.execute("SELECT to_regclass('qorlia_inventory_create_request') IS NULL")
        assert cr.fetchone()[0], 'Use a fresh copy, not a previously used journal test database.'
        setup['stock.picking']._qorlia_inventory_creation_journal_setup()
        actor = setup['res.users'].with_context(no_reset_password=True).create({
            'name': 'QorliaQA Committed creation actor', 'login': 'qorliaqa-committed-creation-actor',
            'company_id': company, 'company_ids': [Command.set([company])],
            'groups_id': [Command.set([setup.ref('stock.group_stock_user').id])]})
        actor_id = actor.id
        warehouse = setup['stock.warehouse'].search([('company_id', '=', company)], limit=1)
        assert warehouse
        operation = warehouse.out_type_id.copy({'name': 'QorliaQA Committed creation delivery',
            'sequence_code': 'QJTC', 'reservation_method': 'manual'})
        operation_id = operation.id
        cr.commit()
    print(json.dumps({'stage': 'disposable-copy-setup', 'candidate': 83,
        'installed_metadata': 49, 'python_source_hashes': hashes,
        'harness_sha256': hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
        'http_enabled': False, 'commits_in_disposable_copy_only': True}), flush=True)

    model_type = type(shell_env['stock.picking'])
    original_native = model_type._qorlia_inventory_create_native
    original_read = model_type._qorlia_inventory_creation_journal_read
    native_calls, cases, receipts = [], [], []

    @wraps(original_native)
    def counted_native(records, *args, **kwargs):
        native_calls.append(threading.current_thread().name)
        return original_native(records, *args, **kwargs)

    def fresh_request():
        with registry.cursor() as cr:
            actor_env = api.Environment(cr, actor_id, context)
            loaded = actor_env['stock.picking'].qorlia_inventory_draft_load(operation_id)
            # These are opaque private-journal bindings, not public creation-review authorization.
            return {'seed': loaded['seed'], 'edits': [], 'review_version': 'a' * 64,
                'review_complete_token': 'b' * 64, 'request_key': str(uuid.uuid4())}

    with patch.object(model_type, '_qorlia_inventory_create_native', counted_native):
        for first_action, second_action in (('save', 'save'), ('stop', 'save'), ('save', 'stop')):
            payload = fresh_request()
            barrier = threading.Barrier(2, timeout=60)
            terminal, release = threading.Event(), threading.Event()
            results, failures, pids = {}, queue.SimpleQueue(), {}
            attempts, codes = {'first': 0, 'second': 0}, {'first': [], 'second': []}
            before_calls = len(native_calls)

            @wraps(original_read)
            def held_read(records, *args, **kwargs):
                result = original_read(records, *args, **kwargs)
                if (threading.current_thread().name == 'qorliaqa-first'
                        and (result['accepted'] or result['stopped']) and not terminal.is_set()):
                    terminal.set()
                    if not release.wait(60):
                        raise RuntimeError('The coordinator did not release the uncommitted terminal outcome.')
                return result

            def worker(name, action):
                try:
                    with registry.cursor() as cr:
                        cr.execute("SET LOCAL statement_timeout = '60s'")
                        cr.execute('SHOW transaction_isolation')
                        assert cr.fetchone()[0] == 'repeatable read'
                        cr.execute('SELECT pg_backend_pid()')
                        pids[name] = cr.fetchone()[0]
                        actor_env = api.Environment(cr, actor_id, context)
                        unknown = actor_env['stock.picking']._qorlia_inventory_create_status(payload)
                        assert not unknown['accepted'] and not unknown['stopped']
                        barrier.wait()
                        if name == 'second' and not terminal.wait(90):
                            raise RuntimeError('The first native action did not reach an uncommitted terminal outcome.')

                        def attempt():
                            attempts[name] += 1
                            try:
                                target = actor_env['stock.picking']
                                return (target._qorlia_inventory_create_once(payload) if action == 'save'
                                    else target._qorlia_inventory_create_stop(payload))
                            except OperationalError as error:
                                codes[name].append(error.pgcode)
                                raise

                        results[name] = retrying(attempt, actor_env)
                except Exception:
                    failures.put((name, traceback.format_exc()))

            workers = [threading.Thread(target=worker, args=(name, action),
                name='qorliaqa-' + name, daemon=True)
                for name, action in (('first', first_action), ('second', second_action))]
            blocked = False
            with patch.object(model_type, '_qorlia_inventory_creation_journal_read', held_read):
                for thread in workers:
                    thread.start()
                try:
                    assert terminal.wait(90), 'No first terminal outcome; inspect worker errors.'
                    assert pids['first'] != pids['second']
                    deadline = time.monotonic() + 20
                    with registry.cursor() as monitor:
                        while time.monotonic() < deadline:
                            monitor.execute('SELECT pg_blocking_pids(%s)', [pids['second']])
                            if pids['first'] in monitor.fetchone()[0]:
                                blocked = True
                                break
                            release.wait(0.05)
                    assert blocked, 'The second real connection was not observed waiting for the first.'
                finally:
                    release.set()
                    for thread in workers:
                        thread.join(timeout=90)
            assert not any(thread.is_alive() for thread in workers), 'A native worker is still running.'
            errors = []
            while not failures.empty():
                errors.append(failures.get())
            assert not errors, errors
            assert results['first'] == results['second']
            assert attempts == {'first': 1, 'second': 2}, attempts
            assert codes == {'first': [], 'second': ['40001']}, codes
            accepted = first_action == 'save'
            assert results['first']['accepted'] is accepted
            assert results['first']['stopped'] is (not accepted)
            assert len(native_calls) - before_calls == int(accepted)
            receipts.append((copy.deepcopy(payload), copy.deepcopy(results['first'])))

            with registry.cursor() as cr:
                reader = api.Environment(cr, actor_id, context)['stock.picking']
                assert reader._qorlia_inventory_create_status(payload) == results['first']
                assert reader._qorlia_inventory_create_once(payload) == results['first']
                assert reader._qorlia_inventory_create_stop(payload) == results['first']
                cr.execute('SELECT outcome FROM qorlia_inventory_create_request WHERE request_key = %s', [payload['request_key']])
                assert cr.fetchall() == [('accepted' if accepted else 'stopped',)]
                if accepted:
                    picking = reader.browse(results['first']['result']['transfer_id'])
                    assert picking.exists() and picking.create_uid.id == actor_id
                    assert picking.name != '/' and picking.state == results['first']['result']['state_after']
                cr.commit()
            cases.append({'first': first_action, 'second': second_action, 'observed_database_wait': blocked,
                'attempts': attempts, 'sqlstates': codes, 'accepted': accepted,
                'native_creations': len(native_calls) - before_calls})
            print(json.dumps({'stage': 'committed-race', **cases[-1]}), flush=True)

        assert len(native_calls) == 2
        with registry.cursor() as cr:
            operator = api.Environment(cr, SUPERUSER_ID, context)
            for _payload, receipt in receipts:
                if receipt['accepted']:
                    operator['stock.picking'].browse(receipt['result']['transfer_id']).unlink()
            cr.commit()
        for payload, receipt in receipts:
            with registry.cursor() as cr:
                reader = api.Environment(cr, actor_id, context)['stock.picking']
                assert reader._qorlia_inventory_create_status(payload) == receipt
                assert reader._qorlia_inventory_create_once(payload) == receipt
                assert reader._qorlia_inventory_create_stop(payload) == receipt
                if receipt['accepted']:
                    assert not reader.browse(receipt['result']['transfer_id']).exists()
                changed = dict(payload, review_version='c' * 64)
                try:
                    reader._qorlia_inventory_create_once(changed)
                except ValidationError:
                    pass
                else:
                    raise AssertionError('A committed request key accepted a changed body.')
                cr.commit()
        assert len(native_calls) == 2, 'Committed history replayed native creation after business deletion.'

    with registry.cursor() as cr:
        final = api.Environment(cr, SUPERUSER_ID, context)
        cr.execute('SELECT outcome, count(*) FROM qorlia_inventory_create_request GROUP BY outcome ORDER BY outcome')
        assert cr.fetchall() == [('accepted', 2), ('stopped', 1)]
        assert final['account.analytic.plan'].browse(23).default_applicability == 'mandatory'
        assert final.company.stock_move_sms_validation
        assert final['ir.module.module'].search([('name', '=', 'qorlia_billing_ui')]).latest_version == '16.0.1.49.0'
    print(json.dumps({'stage': 'complete', 'candidate': 83, 'committed_races': len(cases),
        'real_retryable_collisions': 3, 'native_creations': len(native_calls),
        'cross_cursor_history_after_committed_delete': True, 'changed_body_rejected': True,
        'mandatory_analytics': True, 'sms_enabled': True, 'installed_metadata': 49,
        'public_review_or_save_acceptance': False, 'http_or_browser_acceptance': False}), flush=True)


if __name__ == '__main__':
    run(env)
