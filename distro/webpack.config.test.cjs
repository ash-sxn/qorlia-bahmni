const assert = require("node:assert/strict");
const test = require("node:test");
process.chdir(__dirname);
process.env.NX_TASK_TARGET_PROJECT = "@bahmni/distro";
process.env.NX_TASK_TARGET_TARGET = "serve";
const createConfig = require("./webpack.config");
const historyApiFallback = require("connect-history-api-fallback");

test("review routes serve the React entry only for HTML navigation", () => {
  const middleware = historyApiFallback(
    createConfig({}, { mode: "development" }).devServer.historyApiFallback,
  );
  for (const path of ["/bahmni-v2/login", "/bahmni-v2/home/"]) {
    const browserRequest = {
      method: "GET",
      url: path,
      headers: { accept: "text/html" },
    };
    middleware(browserRequest, {}, () => {});
    assert.equal(browserRequest.url, "/bahmni-v2/index.html");
    const probe = { method: "GET", url: path, headers: { accept: "*/*" } };
    middleware(probe, {}, () => {});
    assert.equal(probe.url, path);
  }
  const apiRequest = {
    method: "GET",
    url: "/openmrs/ws/rest/v1/session",
    headers: { accept: "application/json" },
  };
  middleware(apiRequest, {}, () => {});
  assert.equal(apiRequest.url, "/openmrs/ws/rest/v1/session");
});

test("local API authentication stays enforced without a browser login dialog", () => {
  const config = createConfig({}, { mode: "development" });
  const { onProxyRes } = config.devServer.proxy.at(-1);
  const response = {
    statusCode: 401,
    headers: { "www-authenticate": 'Basic realm="OpenMRS"' },
  };
  onProxyRes(response, { url: "/openmrs/ws/rest/v1/user" });
  assert.equal(response.statusCode, 401);
  assert.equal(response.headers["www-authenticate"], undefined);

  const otherResponse = {
    statusCode: 401,
    headers: { "www-authenticate": 'Basic realm="Other service"' },
  };
  onProxyRes(otherResponse, { url: "/other-service" });
  assert.equal(
    otherResponse.headers["www-authenticate"],
    'Basic realm="Other service"',
  );
});

test("local backend configuration is not kept in the browser's HTTP cache", () => {
  const { onProxyRes } = createConfig(
    {},
    { mode: "development" },
  ).devServer.proxy.at(-1);
  const response = {
    statusCode: 200,
    headers: { "cache-control": "max-age=3600" },
  };
  onProxyRes(response, { url: "/bahmni_config/openmrs/apps/orders/app.json" });
  assert.equal(response.headers["cache-control"], "no-store");
  const other = {
    statusCode: 200,
    headers: { "cache-control": "max-age=3600" },
  };
  onProxyRes(other, { url: "/openmrs/ws/rest/v1/concept" });
  assert.equal(other.headers["cache-control"], "max-age=3600");
});

test("billing proxy isolates ERP cookies and never forwards clinical credentials", () => {
  const proxy = createConfig({}, { mode: "development" }).devServer.proxy[0];
  assert.deepEqual(proxy.context, ["/openmrs/qorlia-billing-api"]);
  assert.equal(proxy.cookiePathRewrite, "/openmrs/qorlia-billing-api");
  const headers = { cookie: "original", authorization: "Basic private" };
  proxy.onProxyReq(
    {
      removeHeader: (name) => delete headers[name],
      setHeader: (name, value) => {
        headers[name] = value;
      },
    },
    {
      headers: { cookie: "JSESSIONID=clinical; session_id=erp; other=secret" },
    },
  );
  assert.deepEqual(headers, { cookie: "session_id=erp" });
  const response = { headers: {} };
  proxy.onProxyRes(response);
  assert.equal(response.headers["cache-control"], "no-store");
});

test("billing gateway requires a verified clinical session before ERP requests", async () => {
  let gate;
  createConfig({}, { mode: "development" }).devServer.setupMiddlewares([], {
    app: {
      use: (path, handler) => {
        assert.equal(path, "/openmrs/qorlia-billing-api");
        gate = handler;
      },
      get: () => {},
    },
  });
  const originalFetch = global.fetch;
  let status;
  let calls = 0;
  let nextCalls = 0;
  const response = {
    status: (value) => {
      status = value;
      return response;
    },
    json: () => {},
  };
  try {
    global.fetch = async (url, options) => {
      calls++;
      assert.equal(new URL(url).pathname, "/openmrs/ws/rest/v1/session");
      assert.equal(options.headers.Cookie, "JSESSIONID=clinical");
      return { ok: true, json: async () => ({ authenticated: false }) };
    };
    await gate(
      { headers: { cookie: "session_id=erp" } },
      response,
      () => nextCalls++,
    );
    assert.equal(status, 401);
    assert.equal(calls, 0);
    await gate(
      { headers: { cookie: "JSESSIONID=clinical; session_id=erp" } },
      response,
      () => nextCalls++,
    );
    assert.equal(status, 401);
    assert.equal(nextCalls, 0);
    global.fetch = async () => ({
      ok: true,
      json: async () => ({ authenticated: true }),
    });
    await gate(
      { headers: { cookie: "JSESSIONID=clinical" } },
      response,
      () => nextCalls++,
    );
    assert.equal(nextCalls, 1);
    global.fetch = async () => {
      throw new Error("Unavailable");
    };
    await gate(
      { headers: { cookie: "JSESSIONID=clinical" } },
      response,
      () => nextCalls++,
    );
    assert.equal(status, 503);
    assert.equal(nextCalls, 1);
  } finally {
    global.fetch = originalFetch;
  }
});
