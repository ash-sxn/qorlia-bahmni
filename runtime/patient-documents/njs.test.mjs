import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("./njs.js", import.meta.url), "utf8");
const { default: documentAuth } = await import(
  `data:text/javascript,${encodeURIComponent(source)}`
);
const path = "/document_images/100/QorliaQA mascot & note.png";
assert.equal(
  documentAuth.getRequestedDocumentPath({
    args: { requested_document: encodeURIComponent(path) },
  }),
  path,
);
for (const value of [
  undefined,
  [],
  "/etc/passwd",
  "/document_images/../secret",
  "/document_images/%252e%252e/secret",
  "/document_images/a\\b",
  "/document_images/a?b",
  "/document_images/a%00b",
  "/document_images/a%zz",
  "/document_images/a/",
  "/document_images//a",
]) {
  assert.equal(
    documentAuth.getRequestedDocumentPath({
      args: { requested_document: value },
    }),
    "",
    String(value),
  );
}

function checkSession(
  response,
  expectedStatus,
  expectedRedirect,
  requestedPath = path,
  expectedFilename,
) {
  let status, redirect;
  const headersOut = {};
  documentAuth.auth({
    args: { requested_document: requestedPath },
    headersOut,
    subrequest: (url, options, callback) => {
      assert.equal(url, "/openmrs/session/verify");
      assert.equal(options.method, "GET");
      callback(response);
    },
    return: (value) => {
      status = value;
    },
    internalRedirect: (value) => {
      redirect = value;
    },
  });
  assert.equal(status, expectedStatus);
  assert.equal(redirect, expectedRedirect);
  assert.equal(headersOut["Content-Disposition"], expectedFilename);
}
const importPath = "/uploaded-files/mrs/concept/QorliaQA.val.err.csv";
const response = (session) => ({
  status: 200,
  responseText: JSON.stringify(session),
});
checkSession(
  response({
    authenticated: true,
    user: { privileges: [{ name: "app:clinical" }] },
  }),
  403,
  undefined,
  importPath,
);
checkSession(
  response({
    authenticated: true,
    user: { privileges: [{ name: "Import CSV Files" }] },
  }),
  undefined,
  `/document/fetch?requested_document=${encodeURIComponent(importPath)}`,
  importPath,
  "attachment; filename*=UTF-8''QorliaQA.val.err.csv",
);
checkSession(
  response({
    authenticated: true,
    user: { privileges: [{ name: "Import CSV Files" }] },
  }),
  403,
);
checkSession(
  response({
    authenticated: true,
    user: { privileges: [], roles: [{ name: "System Developer" }] },
  }),
  undefined,
  `/document/fetch?requested_document=${encodeURIComponent(importPath)}`,
  importPath,
  "attachment; filename*=UTF-8''QorliaQA.val.err.csv",
);
checkSession(
  response({
    authenticated: false,
    user: { privileges: [], roles: [{ name: "System Developer" }] },
  }),
  403,
  undefined,
  importPath,
);
checkSession(
  response({
    authenticated: true,
    user: { privileges: [], roles: [{ name: "SuperAdmin" }] },
  }),
  403,
  undefined,
  importPath,
);
checkSession(response({ authenticated: false }), 403);
checkSession(response({ authenticated: true, user: { privileges: [] } }), 403);
checkSession(response(null), 403);
checkSession({ status: 200, responseText: "not JSON" }, 502);
checkSession({ status: 401 }, 401);
checkSession({ status: 500 }, 502);
for (const name of [
  "app:clinical",
  "app:patient-documents",
  "app:document-upload",
]) {
  checkSession(
    response({ authenticated: true, user: { privileges: [{ name }] } }),
    undefined,
    `/document/fetch?requested_document=${encodeURIComponent(path)}`,
  );
}
let invalidStatus;
documentAuth.auth({
  args: { requested_document: "/document_images/../secret" },
  subrequest: () =>
    assert.fail("Invalid paths must not reach session verification"),
  return: (status) => {
    invalidStatus = status;
  },
});
assert.equal(invalidStatus, 400);
console.log("Patient-document authentication and path checks passed.");
