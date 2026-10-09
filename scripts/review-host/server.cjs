const express = require('express');
const compression = require('compression');
const { createProxyMiddleware, fixRequestBody } = require('http-proxy-middleware');
const { createHash, createHmac, timingSafeEqual } = require('node:crypto');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');

const COOKIE = '__Host-qorlia_review';
const BILLING = '/openmrs/qorlia-billing-api';
const digest = (value) => createHash('sha256').update(value).digest();
const cookieNamed = (header = '', name) =>
  header.split(';').map((part) => part.trim()).find((part) => part.startsWith(`${name}=`)) || '';
const gatePage = (message = '') => `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>Qorlia tester access</title><style>body{margin:0;background:#f2f5f2;color:#202723;font:18px system-ui;display:grid;place-items:center;min-height:100vh}main{box-sizing:border-box;max-width:480px;width:90%;padding:36px;background:white;border:1px solid #d6e0d9;border-radius:24px}h1{color:#20543b}label,input,button{display:block;box-sizing:border-box;width:100%}input{margin:12px 0 20px;padding:14px;font:inherit;border:1px solid #9db4a4;border-radius:10px}button{padding:14px;background:#20543b;color:white;border:0;border-radius:10px;font:inherit;cursor:pointer}small{display:block;line-height:1.6;color:#526158}p{line-height:1.5}.error{color:#a3261b}</style><main><h1>Qorlia</h1><h2>Tester access</h2><p>Enter the shared testing code. Then sign in with your test account.</p><p class="error" role="alert">${message}</p><form action="/review-access" method="post"><label for="code">Testing access code</label><input id="code" name="code" type="password" autocomplete="off" required maxlength="128"><button>Open the review build</button></form><p><small>Test environment only. Use synthetic records, not real patient information.</small></p></main></html>`;

function createReviewApp({ code, signingKey, expiresAt, backend, billing, staticDir }) {
  if (!code || code.length < 20 || !signingKey || signingKey.length < 32 || !Number.isFinite(expiresAt))
    throw new Error('Review access secrets and expiry are required.');
  const app = express();
  app.disable('x-powered-by');
  const attempts = new Map();
  const sign = (expiry) => createHmac('sha256', signingKey).update(String(expiry)).digest('hex');
  const validAccess = (header) => {
    const token = cookieNamed(header, COOKIE).slice(COOKIE.length + 1);
    const [expiry, signature] = token.split('.');
    if (!/^\d+$/.test(expiry || '') || !/^[a-f0-9]{64}$/.test(signature || '')) return false;
    const timestamp = Number(expiry);
    return timestamp > Date.now() && timestamp <= expiresAt &&
      timingSafeEqual(Buffer.from(signature, 'hex'), Buffer.from(sign(timestamp), 'hex'));
  };
  const sameOrigin = (req) => {
    try { return new URL(req.headers.origin).host === req.headers.host; }
    catch { return false; }
  };
  app.use((req, res, next) => {
    res.set({ 'Cache-Control': 'private, no-store', 'X-Robots-Tag': 'noindex, nofollow, noarchive',
      'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'same-origin',
      'X-Frame-Options': 'SAMEORIGIN' });
    if (Date.now() >= expiresAt) return res.status(410).send('This testing link has expired.');
    // The host port is loopback-only. Cloudflared is the only public ingress.
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && !sameOrigin(req))
      return res.status(403).json({ error: 'Use the testing site to submit this request.' });
    next();
  });
  app.get('/robots.txt', (_req, res) => res.type('text/plain').send('User-agent: *\nDisallow: /\n'));
  app.post('/review-access', express.urlencoded({ extended: false, limit: '1kb' }), (req, res) => {
    const now = Date.now();
    const ip = req.headers['cf-connecting-ip'] || req.socket.remoteAddress;
    for (const [key, item] of attempts) if (item.until <= now) attempts.delete(key);
    const previous = attempts.get(ip) || { count: 0, until: now + 15 * 60 * 1000 };
    if (previous.count >= 10 || attempts.size >= 2000)
      return res.status(429).set('Retry-After', '900').send(gatePage('Too many attempts. Please wait 15 minutes.'));
    previous.count++;
    attempts.set(ip, previous);
    if (typeof req.body.code !== 'string' || !timingSafeEqual(digest(req.body.code), digest(code)))
      return res.status(401).send(gatePage('That testing code was not accepted.'));
    attempts.delete(ip);
    const expiry = Math.min(now + 12 * 60 * 60 * 1000, expiresAt);
    res.cookie(COOKIE, `${expiry}.${sign(expiry)}`, { secure: true, httpOnly: true,
      sameSite: 'lax', path: '/', maxAge: expiry - now });
    res.redirect(303, '/bahmni-v2/login');
  });
  app.use((req, res, next) => {
    if (validAccess(req.headers.cookie)) return next();
    if (req.method === 'GET' && req.headers.accept?.includes('text/html')) return res.status(401).send(gatePage());
    res.status(401).json({ error: 'Enter the testing access code first.' });
  });

  const proxyError = (_error, _req, res) => {
    if (!res.headersSent) res.writeHead(502, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'The testing backend is unavailable. Please try again.' }));
  };
  app.use(BILLING, async (req, res, next) => {
    const allowed = new Set(['/web/session/get_session_info', '/web/session/authenticate',
      '/web/session/destroy', '/web/dataset/call_kw/account.move/search_read',
      '/web/dataset/call_kw/account.move.line/search_read',
      '/web/dataset/call_kw/sale.order/search_read',
      '/web/dataset/call_kw/sale.order.line/search_read',
      ...['load', 'preview', 'save', 'choices'].map((action) =>
        `/web/dataset/call_kw/sale.order/qorlia_draft_${action}`),
      ...['load', 'run'].map((action) => `/web/dataset/call_kw/sale.order/qorlia_order_workflow_${action}`),
      ...['load', 'post'].map((action) => `/web/dataset/call_kw/account.move/qorlia_invoice_workflow_${action}`),
      ...['load', 'preview', 'record'].map((action) => `/web/dataset/call_kw/account.move/qorlia_payment_${action}`)]);
    if (req.method !== 'POST' || !allowed.has(req.path)) return res.sendStatus(404);
    const clinicalCookie = cookieNamed(req.headers.cookie, 'JSESSIONID');
    if (!clinicalCookie) return res.status(401).json({ error: 'Sign in to Qorlia.' });
    try {
      const session = await fetch(new URL('/openmrs/ws/rest/v1/session', backend), {
        headers: { Cookie: clinicalCookie, Accept: 'application/json' }, signal: AbortSignal.timeout(10000),
      });
      if (!session.ok || !(await session.json()).authenticated)
        return res.status(401).json({ error: 'Sign in to Qorlia.' });
      next();
    } catch { res.status(503).json({ error: 'Hospital session verification is unavailable.' }); }
  }, express.json({ limit: '32kb' }), (req, res, next) => {
    // Expose only named adapter actions, never raw financial create/write/confirm calls.
    const params = req.body?.params;
    const model = req.path.split('/')[4];
    const method = req.path.split('/')[5];
    if (!params || req.body.method !== 'call' ||
      (req.path.includes('/call_kw/') && (params.model !== model || params.method !== method)) ||
      (method?.startsWith('qorlia_') &&
        (!Array.isArray(params.args) || params.args.length || !params.kwargs ||
          typeof params.kwargs !== 'object' || Array.isArray(params.kwargs) ||
          Object.keys(params.kwargs).includes('context'))) ||
      (req.path.endsWith('/authenticate') && params.db !== 'odoo')) return res.sendStatus(400);
    next();
  }, createProxyMiddleware({
    target: billing, changeOrigin: true, secure: true,
    cookieDomainRewrite: { '*': '' }, cookiePathRewrite: BILLING,
    on: {
      proxyReq: (proxyReq, req, res) => {
        proxyReq.removeHeader('authorization');
        proxyReq.removeHeader('cookie');
        const cookie = cookieNamed(req.headers.cookie, 'session_id');
        if (cookie) proxyReq.setHeader('cookie', cookie);
        fixRequestBody(proxyReq, req, res);
      },
      proxyRes: (response) => { response.headers['cache-control'] = 'private, no-store'; },
      error: proxyError,
    },
  }));

  app.use(createProxyMiddleware({
    pathFilter: (path) => path.startsWith('/openmrs/ws/') || path === '/openmrs/auth' ||
      path === '/openmrs/module/addresshierarchy/ajax/getPossibleAddressHierarchyEntriesWithParents.form' ||
      path === '/openmrs/module/addresshierarchy/ajax/getOrderedAddressHierarchyLevels.form' ||
      path.startsWith('/uploaded-files/mrs/') || path.startsWith('/bahmnireports/') ||
      path.startsWith('/bahmni_config/openmrs/'),
    target: backend, changeOrigin: true, secure: true,
    cookieDomainRewrite: { '*': '' },
    on: {
      proxyReq: (proxyReq, req) => {
        proxyReq.removeHeader('cookie');
        const cookies = ['JSESSIONID', 'reporting_session'].map((name) => cookieNamed(req.headers.cookie, name)).filter(Boolean);
        if (cookies.length) proxyReq.setHeader('cookie', cookies.join('; '));
        proxyReq.setHeader('x-forwarded-proto', 'https');
      },
      proxyRes: (response) => {
        response.headers['cache-control'] = 'private, no-store';
        delete response.headers['www-authenticate'];
      },
      error: proxyError,
    },
  }));
  app.get(['/', '/bahmni/home', '/bahmni/home/', '/bahmni/home/index.html'],
    (_req, res) => res.redirect(302, '/bahmni-v2/login'));
  app.use('/bahmni-v2', compression(), express.static(staticDir, { dotfiles: 'deny', index: false, redirect: false }));
  app.get('/bahmni-v2/*', (req, res) => {
    if (!req.accepts('html') || req.path.includes('.') || req.path.includes('..')) return res.sendStatus(404);
    res.sendFile(resolve(staticDir, 'index.html'));
  });
  app.use((_req, res) => res.sendStatus(404));
  app.use((_error, _req, res, _next) => res.status(400).json({ error: 'Invalid testing request.' }));
  return app;
}

module.exports = { createReviewApp };
if (require.main === module) {
  createReviewApp({
    code: readFileSync(process.env.REVIEW_CODE_FILE, 'utf8').trim(),
    signingKey: readFileSync(process.env.REVIEW_KEY_FILE, 'utf8').trim(),
    expiresAt: Date.parse(process.env.REVIEW_EXPIRES),
    backend: process.env.BAHMNI_API_ORIGIN,
    billing: process.env.BAHMNI_BILLING_ORIGIN,
    staticDir: '/app/static',
  }).listen(8080, '0.0.0.0', () => console.log('Qorlia review gateway listening on port 8080'));
}
