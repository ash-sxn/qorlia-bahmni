const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { resolve } = require('node:path');
const { createReviewApp } = require('./server.cjs');

test('review gate protects UI, clinical API and named Billing actions with isolated cookies', async (t) => {
  let seenClinical = '';
  let seenBilling = '';
  let seenBillingAuth;
  const backend = http.createServer((req, res) => {
    seenClinical = req.headers.cookie || '';
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ authenticated: seenClinical.includes('JSESSIONID=valid') }));
  }).listen(0, '127.0.0.1');
  const billing = http.createServer((req, res) => {
    seenBilling = req.headers.cookie || '';
    seenBillingAuth = req.headers.authorization;
    res.setHeader('content-type', 'application/json');
    res.setHeader('set-cookie', 'session_id=erp-next; Domain=example.com; Path=/; HttpOnly');
    res.end(JSON.stringify({ result: { uid: 1 } }));
  }).listen(0, '127.0.0.1');
  await Promise.all([backend, billing].map((server) => new Promise((r) => server.once('listening', r))));
  const originOf = (server) => `http://127.0.0.1:${server.address().port}`;
  const app = createReviewApp({ code: 'temporary-test-code-123456789', signingKey: 'test-signing-key-12345678901234567890',
    expiresAt: Date.now() + 60000, backend: originOf(backend), billing: originOf(billing),
    staticDir: resolve(__dirname, '../../distro/dist') });
  const server = app.listen(0, '127.0.0.1');
  await new Promise((r) => server.once('listening', r));
  t.after(() => { for (const s of [server, backend, billing]) { s.closeAllConnections(); s.close(); } });
  const base = originOf(server);
  const request = (path, options) => fetch(`${base}${path}`, { redirect: 'manual', ...options });
  for (const path of ['/bahmni-v2/login', '/bahmni-v2/main.js', '/openmrs/ws/rest/v1/session', '/openmrs/qorlia-billing-api/web/session/get_session_info'])
    assert.equal((await request(path)).status, 401, path);
  assert.match(await (await request('/robots.txt')).text(), /Disallow: \//);
  assert.equal((await request('/review-access', { method: 'POST', headers: { Origin: 'https://evil.example' } })).status, 403);
  const login = await request('/review-access', { method: 'POST', headers: { Origin: base, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'code=temporary-test-code-123456789' });
  assert.equal(login.status, 303);
  const cookie = login.headers.get('set-cookie').split(';')[0];
  assert.match(login.headers.get('set-cookie'), /HttpOnly/);
  assert.match(login.headers.get('set-cookie'), /Secure/);
  assert.equal((await request('/bahmni-v2/login', { headers: { Cookie: cookie } })).status, 200);
  assert.equal((await request('/bahmni-v2/login', { headers: { Cookie: `${cookie}tampered` } })).status, 401);
  assert.equal((await request('/.env', { headers: { Cookie: cookie } })).status, 404);
  assert.equal((await request('/bahmni-v2/absent.js', { headers: { Cookie: cookie } })).status, 404);
  const rpc = (path, cookies, params = {}, method = 'call') => request(`/openmrs/qorlia-billing-api${path}`, {
    method: 'POST', headers: { Origin: base, Cookie: cookies, Authorization: 'Basic clinical-secret', 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', method, params, id: 1 }) });
  assert.equal((await rpc('/web/session/get_session_info', cookie)).status, 401);
  assert.equal((await rpc('/web/session/get_session_info', `${cookie}; JSESSIONID=invalid`)).status, 401);
  const allCookies = `${cookie}; JSESSIONID=valid; session_id=erp-current; reporting_session=report`;
  const session = await rpc('/web/session/get_session_info', allCookies);
  assert.equal(session.status, 200);
  assert.equal(seenClinical, 'JSESSIONID=valid');
  assert.equal(seenBilling, 'session_id=erp-current');
  assert.equal(seenBillingAuth, undefined);
  assert.match(session.headers.get('set-cookie'), /Path=\/openmrs\/qorlia-billing-api/);
  assert.doesNotMatch(session.headers.get('set-cookie'), /Domain=/);
  assert.equal((await rpc('/web/database/list', allCookies)).status, 404);
  assert.equal((await rpc('/web/dataset/call_kw/account.move/search_read', allCookies, { model: 'account.move', method: 'write' })).status, 400);
  for (const model of ['sale.order', 'sale.order.line']) {
    const path = `/web/dataset/call_kw/${model}/search_read`;
    assert.equal((await rpc(path, cookie, { model, method: 'search_read' })).status, 401);
    assert.equal((await rpc(path, allCookies, { model, method: 'search_read' })).status, 200);
    assert.equal(seenBilling, 'session_id=erp-current');
    assert.equal((await rpc(path, allCookies, { model: 'res.users', method: 'search_read' })).status, 400);
    assert.equal((await rpc(path, allCookies, { model, method: 'write' })).status, 400);
    for (const method of ['create', 'write', 'action_confirm', 'unlink'])
      assert.equal((await rpc(`/web/dataset/call_kw/${model}/${method}`, allCookies, { model, method })).status, 404);
  }
  for (const method of ['load', 'preview', 'save', 'choices'].map((action) => `qorlia_draft_${action}`)
    .concat(['qorlia_order_workflow_load', 'qorlia_order_workflow_run'])) {
    const path = `/web/dataset/call_kw/sale.order/${method}`;
    const params = { model: 'sale.order', method, args: [], kwargs: {} };
    assert.equal((await rpc(path, cookie, params)).status, 401);
    assert.equal((await rpc(path, allCookies, params)).status, 200);
    assert.equal(seenBilling, 'session_id=erp-current');
    assert.equal((await rpc(path, allCookies, { ...params, method: 'write' })).status, 400);
    assert.equal((await rpc(path, allCookies, { ...params, model: 'account.move' })).status, 400);
    assert.equal((await rpc(path, allCookies, { ...params, args: [1] })).status, 400);
    assert.equal((await rpc(path, allCookies, { ...params, kwargs: { context: { uid: 1 } } })).status, 400);
  }
  for (const method of ['qorlia_invoice_workflow_load', 'qorlia_invoice_workflow_post',
    'qorlia_payment_load', 'qorlia_payment_preview', 'qorlia_payment_record', 'qorlia_credit_load', 'qorlia_credit_apply']) {
    const path = `/web/dataset/call_kw/account.move/${method}`;
    const params = { model: 'account.move', method, args: [], kwargs: {} };
    assert.equal((await rpc(path, cookie, params)).status, 401);
    assert.equal((await rpc(path, allCookies, params)).status, 200);
    assert.equal(seenBilling, 'session_id=erp-current');
    assert.equal((await rpc(path, allCookies, { ...params, method: 'action_post' })).status, 400);
    assert.equal((await rpc(path, allCookies, { ...params, args: [1] })).status, 400);
    assert.equal((await rpc(path, allCookies, { ...params, kwargs: { context: { check_move_validity: false } } })).status, 400);
  }
  for (const method of ['action_post', 'button_draft', 'button_cancel', 'write', 'unlink', 'js_assign_outstanding_line', 'js_remove_outstanding_partial'])
    assert.equal((await rpc(`/web/dataset/call_kw/account.move/${method}`, allCookies, { model: 'account.move', method })).status, 404);
  for (const model of ['account.payment', 'account.payment.register'])
    for (const method of ['create', 'write', 'action_post', 'action_create_payments', '_create_payments', 'unlink'])
      assert.equal((await rpc(`/web/dataset/call_kw/${model}/${method}`, allCookies, { model, method })).status, 404);
  await request('/openmrs/ws/rest/v1/session', { headers: { Cookie: allCookies } });
  assert.equal(seenClinical, 'JSESSIONID=valid; reporting_session=report');
  assert.equal((await request('/openmrs/module/addresshierarchy/ajax/getOrderedAddressHierarchyLevels.form',
    { headers: { Cookie: allCookies } })).status, 200);
  assert.equal((await request('/bahmni/home/index.html', { headers: { Cookie: cookie } })).headers.get('location'), '/bahmni-v2/login');
  for (let i = 0; i < 10; i++) assert.equal((await request('/review-access', {
    method: 'POST', headers: { Origin: base, 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'code=wrong',
  })).status, 401);
  assert.equal((await request('/review-access', { method: 'POST', headers: { Origin: base }, body: 'code=wrong' })).status, 429);
});

test('expired review link fails closed', async (t) => {
  const server = createReviewApp({ code: 'temporary-test-code-123456789', signingKey: 'test-signing-key-12345678901234567890',
    expiresAt: Date.now() - 1000, backend: 'http://127.0.0.1:1', billing: 'http://127.0.0.1:1',
    staticDir: resolve(__dirname, '../../distro/dist') }).listen(0, '127.0.0.1');
  await new Promise((r) => server.once('listening', r));
  t.after(() => { server.closeAllConnections(); server.close(); });
  assert.equal((await fetch(`http://127.0.0.1:${server.address().port}/bahmni-v2/login`)).status, 410);
});
