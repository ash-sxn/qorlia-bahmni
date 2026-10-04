const assert = require("node:assert/strict");
const test = require("node:test");
process.chdir(__dirname);
process.env.NX_TASK_TARGET_PROJECT = "@bahmni/distro";
process.env.NX_TASK_TARGET_TARGET = "serve";
const createConfig = require("./webpack.config");

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
