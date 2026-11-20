/* global Response, fetch */
// Run with: node --test runtime/voice/
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, beforeEach, describe, it } from "node:test";
import { writeFile } from "node:fs/promises";
import {
  createVoiceHandler,
  readConfig,
  sessionCookie,
  TIDY_PROMPT,
} from "./server.mjs";

const SESSION = "abc123";
const doctor = {
  authenticated: true,
  user: {
    uuid: "u1",
    username: "dr_test",
    privileges: [{ name: "app:clinical" }],
    roles: [],
  },
};

let dir;
let server;
let base;
let scriptBase;
let calls;
let sessionReply;
let sttReply;
let chatReply;
let config;
let logs;

const fakeFetch = async (url, options = {}) => {
  calls.push({ url, options });
  if (url.includes("/openmrs/ws/rest/v1/session")) {
    return new Response(JSON.stringify(sessionReply), { status: 200 });
  }
  if (url.includes("chat/completions")) return chatReply();
  return sttReply();
};

const start = async (overrides = {}) => {
  if (server) await new Promise((resolve) => server.close(resolve));
  config = {
    ...readConfig({}),
    openmrsUrl: "http://openmrs.test",
    sarvamKey: "test-key",
    consentLog: join(dir, `consent-${Math.random()}.log`),
    ...overrides,
  };
  server = createServer(
    createVoiceHandler(config, {
      fetch: fakeFetch,
      log: (line) => logs.push(line),
    }),
  );
  await new Promise((resolve) => server.listen(0, resolve));
  base = `http://127.0.0.1:${server.address().port}/openmrs/qorlia-voice`;
  scriptBase = `http://127.0.0.1:${server.address().port}/qorlia-voice`;
};

const call = (
  path,
  { method = "GET", body, headers = {}, cookie = true } = {},
) =>
  fetch(`${base}${path}`, {
    method,
    body,
    headers: {
      ...(cookie ? { Cookie: `other=1; JSESSIONID=${SESSION}` } : {}),
      ...headers,
    },
  });

const agree = (scope) =>
  call("/consent", {
    method: "POST",
    body: JSON.stringify({
      version: config.consentVersion,
      accepted: true,
      app: "legacy",
      ...(scope ? { scope } : {}),
    }),
    headers: { "Content-Type": "application/json" },
  });

const audio = (type = "audio/webm") =>
  call("/transcribe?lang=en-IN", {
    method: "POST",
    body: new Uint8Array([1, 2, 3]),
    headers: { "Content-Type": type },
  });

before(async () => {
  dir = await mkdtemp(join(tmpdir(), "qorlia-voice-"));
});
after(async () => {
  await new Promise((resolve) => server.close(resolve));
  await rm(dir, { recursive: true, force: true });
});
beforeEach(async () => {
  calls = [];
  logs = [];
  sessionReply = doctor;
  sttReply = () =>
    new Response(
      JSON.stringify({ transcript: " Paracetamol 650 mg twice a day " }),
      { status: 200 },
    );
  chatReply = () =>
    new Response(
      JSON.stringify({
        choices: [
          {
            finish_reason: "stop",
            message: {
              content:
                "C/o: Fever for 3 days\nRx\nTab Paracetamol 650 mg SOS\nUnclear: <none>",
            },
          },
        ],
      }),
      { status: 200 },
    );
  await start();
});

describe("sessionCookie", () => {
  it("reads only the Bahmni session cookie", () => {
    assert.equal(sessionCookie("a=1; JSESSIONID=xyz; b=2"), "xyz");
    assert.equal(sessionCookie("MYJSESSIONID=xyz"), null);
    assert.equal(sessionCookie(undefined), null);
  });
});

describe("voice relay", () => {
  it("answers health without a session", async () => {
    const response = await call("/health", { cookie: false });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      ok: true,
      enabled: true,
      backend: "sarvam",
    });
  });

  it("refuses everything else without a Bahmni session", async () => {
    assert.equal((await call("/config", { cookie: false })).status, 401);
    const response = await call("/transcribe", {
      method: "POST",
      cookie: false,
      body: new Uint8Array([1]),
      headers: { "Content-Type": "audio/webm" },
    });
    assert.equal(response.status, 401);
    assert.equal(calls.length, 0);
  });

  it("refuses a session OpenMRS does not recognise", async () => {
    sessionReply = { authenticated: false };
    assert.equal((await call("/config")).status, 401);
  });

  it("refuses a user without the clinical privilege", async () => {
    sessionReply = {
      authenticated: true,
      user: {
        username: "clerk",
        privileges: [{ name: "app:registration" }],
        roles: [],
      },
    };
    assert.equal((await call("/config")).status, 403);
  });

  it("passes on only the session cookie to OpenMRS", async () => {
    await call("/config");
    assert.equal(calls[0].options.headers.Cookie, `JSESSIONID=${SESSION}`);
  });

  it("names the outside service and asks for consent first", async () => {
    const body = await (await call("/config")).json();
    assert.equal(body.consented, false);
    assert.equal(body.service.name, "Sarvam AI");
    assert.equal(body.service.outside, true);
    assert.deepEqual(
      body.languages.map(({ code }) => code),
      ["en-IN", "hi-IN"],
    );
  });

  it("will not transcribe before the user accepts the notice", async () => {
    const response = await audio();
    assert.equal(response.status, 428);
    assert.equal(
      calls.some(({ url }) => url.includes("sarvam")),
      false,
    );
  });

  it("records consent per user and version, and remembers it after a restart", async () => {
    assert.equal((await agree()).status, 204);
    assert.equal((await (await call("/config")).json()).consented, true);
    const line = JSON.parse((await readFile(config.consentLog, "utf8")).trim());
    assert.equal(line.user, "dr_test");
    assert.equal(line.version, config.consentVersion);
    assert.equal(line.app, "legacy");

    await start({ consentLog: config.consentLog });
    assert.equal((await (await call("/config")).json()).consented, true);

    await start({ consentLog: config.consentLog, consentVersion: "next" });
    assert.equal((await (await call("/config")).json()).consented, false);
  });

  it("refuses consent for an old notice version", async () => {
    const response = await call("/consent", {
      method: "POST",
      body: JSON.stringify({ version: "old", accepted: true }),
      headers: { "Content-Type": "application/json" },
    });
    assert.equal(response.status, 400);
  });

  it("refuses requests from another site", async () => {
    const response = await call("/consent", {
      method: "POST",
      body: JSON.stringify({ version: config.consentVersion, accepted: true }),
      headers: {
        "Content-Type": "application/json",
        Origin: "https://evil.example",
      },
    });
    assert.equal(response.status, 403);
  });

  it("sends audio to Sarvam with the key and returns trimmed text", async () => {
    await agree();
    const response = await audio();
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      text: "Paracetamol 650 mg twice a day",
    });

    const sent = calls.find(({ url }) => url.includes("sarvam"));
    assert.equal(sent.options.headers["api-subscription-key"], "test-key");
    assert.equal(sent.options.body.get("model"), "saaras:v4");
    assert.equal(sent.options.body.get("language_code"), "en-IN");
    assert.ok(JSON.parse(sent.options.body.get("keyterms")).length <= 50);
    assert.equal(sent.options.body.get("file").type, "audio/webm");
  });

  it("uses codemix for Hindi so medicine names stay in Latin letters", async () => {
    await agree();
    await call("/transcribe?lang=hi-IN", {
      method: "POST",
      body: new Uint8Array([1]),
      headers: { "Content-Type": "audio/webm;codecs=opus" },
    });
    const sent = calls.find(({ url }) => url.includes("sarvam"));
    assert.equal(sent.options.body.get("model"), "saaras:v3");
    assert.equal(sent.options.body.get("mode"), "codemix");
  });

  it("never logs the words", async () => {
    await agree();
    await audio();
    assert.equal(JSON.stringify(logs).includes("Paracetamol"), false);
    assert.equal(logs[0].chars, 30);
  });

  it("refuses something that is not audio, an unknown language and too much audio", async () => {
    await agree();
    assert.equal((await audio("text/plain")).status, 415);
    assert.equal(
      (
        await call("/transcribe?lang=fr-FR", {
          method: "POST",
          body: new Uint8Array([1]),
          headers: { "Content-Type": "audio/webm" },
        })
      ).status,
      400,
    );
    await start({ consentLog: config.consentLog, maxAudioBytes: 2 });
    assert.equal((await audio()).status, 413);
  });

  it("limits how many recordings one user can send in an hour", async () => {
    await start({ requestsPerHour: 2 });
    await agree();
    assert.equal((await audio()).status, 200);
    assert.equal((await audio()).status, 200);
    assert.equal((await audio()).status, 429);
  });

  it("reports a busy service without leaking its reply", async () => {
    await agree();
    sttReply = () =>
      new Response('{"error":{"message":"quota"}}', { status: 429 });
    const response = await audio();
    assert.equal(response.status, 503);
    assert.equal((await response.json()).error, "service_busy");
  });

  it("can be switched off", async () => {
    await start({ enabled: false });
    await agree();
    assert.equal((await audio()).status, 503);
    assert.equal((await (await call("/config")).json()).enabled, false);
  });

  it("asks for a separate agreement before sending text to be tidied", async () => {
    const tidy = (text = "teen din se bukhar, paracetamol 650 jab bukhar ho") =>
      call("/tidy", {
        method: "POST",
        body: JSON.stringify({ text }),
        headers: { "Content-Type": "application/json" },
      });
    await agree();
    let body = await (await call("/config")).json();
    assert.equal(body.tidy, true);
    assert.equal(body.consented, true);
    assert.equal(body.tidyConsented, false);
    assert.equal((await tidy()).status, 428);
    assert.equal(
      calls.some(({ url }) => url.includes("chat/completions")),
      false,
    );

    assert.equal((await agree("tidy")).status, 204);
    body = await (await call("/config")).json();
    assert.equal(body.tidyConsented, true);
    const response = await tidy();
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      text: "C/o: Fever for 3 days\nRx\nTab Paracetamol 650 mg SOS",
    });
    const sent = calls.find(({ url }) => url.includes("chat/completions"));
    const request = JSON.parse(sent.options.body);
    assert.equal(sent.options.headers["api-subscription-key"], "test-key");
    assert.equal(request.model, "sarvam-105b-conversations");
    assert.equal(request.temperature, 0);
    assert.equal(request.messages[0].content, TIDY_PROMPT);
    assert.equal(
      request.messages[1].content,
      "teen din se bukhar, paracetamol 650 jab bukhar ho",
    );
    assert.equal(JSON.stringify(logs).includes("bukhar"), false);
    assert.equal(JSON.stringify(logs).includes("Paracetamol"), false);

    chatReply = () =>
      new Response(
        JSON.stringify({
          choices: [{ finish_reason: "length", message: { content: "C/o" } }],
        }),
        { status: 200 },
      );
    assert.equal((await tidy()).status, 502);
    assert.equal((await tidy("")).status, 400);
    await start({ consentLog: config.consentLog, maxTidyChars: 5 });
    assert.equal((await tidy()).status, 413);
    await start({ consentLog: config.consentLog, tidyEnabled: false });
    assert.equal((await (await call("/config")).json()).tidy, false);
    assert.equal((await tidy()).status, 503);
  });

  it("treats acceptances logged before tidying existed as voice only", async () => {
    await writeFile(
      config.consentLog,
      `${JSON.stringify({ user: "dr_test", version: config.consentVersion, accepted: true })}\n`,
    );
    await start({ consentLog: config.consentLog });
    const body = await (await call("/config")).json();
    assert.equal(body.consented, true);
    assert.equal(body.tidyConsented, false);
  });

  it("serves the classic-screen script", async () => {
    const response = await fetch(`${scriptBase}/voice.js`);
    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type"), /javascript/);
    assert.match(await response.text(), /qorliaVoice/);
  });
});
