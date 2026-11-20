/* global process, Buffer, console, URL, FormData, Blob, AbortSignal */
// Qorlia voice relay: turns short dictation recordings into text.
//
// It runs next to Bahmni behind the same proxy, so the browser sends its Bahmni
// session cookie with every request. The relay checks that session with OpenMRS,
// checks that the user has accepted the current voice notice, and only then passes
// the audio to the speech service. The service key never reaches the browser.
// Audio and text are never written to disk or to the log.
//
// Node 22, no dependencies. Configuration is read from the environment, see README.md.
import { createHash, randomUUID } from "node:crypto";
import { appendFile, mkdir, readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
// The screens call the relay under /openmrs, because Bahmni's session cookie is scoped
// to that path; /qorlia-voice serves the classic-screen script and the health check.
const BASES = ["/openmrs/qorlia-voice", "/qorlia-voice"];

/** Terms that bias recognition towards prescription words (Sarvam allows 50). */
export const DEFAULT_KEYTERMS = [
  "Paracetamol",
  "Dolo",
  "Crocin",
  "Ibuprofen",
  "Aceclofenac",
  "Diclofenac",
  "Amoxicillin",
  "Augmentin",
  "Azithromycin",
  "Cefixime",
  "Ceftriaxone",
  "Doxycycline",
  "Metronidazole",
  "Ciprofloxacin",
  "Ofloxacin",
  "Pantoprazole",
  "Omeprazole",
  "Rabeprazole",
  "Ondansetron",
  "Domperidone",
  "Cetirizine",
  "Levocetirizine",
  "Montelukast",
  "Salbutamol",
  "Budesonide",
  "Prednisolone",
  "Metformin",
  "Glimepiride",
  "Insulin",
  "Amlodipine",
  "Telmisartan",
  "Losartan",
  "Metoprolol",
  "Atorvastatin",
  "Rosuvastatin",
  "Aspirin",
  "Ecosprin",
  "Clopidogrel",
  "Ranitidine",
  "ORS",
  "Vitamin D3",
  "B complex",
  "Folic acid",
  "tablet",
  "capsule",
  "syrup",
  "twice a day",
  "once a day",
  "three times a day",
  "after food",
];

/**
 * Instructions for tidying a dictation into the shorthand the dictation page reads.
 * The page parses the result with its own fixed rules and checks every medicine line
 * against what the doctor said, so the model only rewrites, it never decides.
 */
export const TIDY_PROMPT = `You tidy a doctor's dictated or typed consultation (English, Hindi or Hinglish, often from speech recognition) into standard OPD shorthand, in English. Output only the shorthand, in exactly this layout, leaving out any heading the doctor said nothing for:
C/o: <complaints>
O/E: <examination findings and vitals>
Dx: <diagnosis>
Rx
<one medicine per line: form, name, strength with unit, dose pattern like 1-0-1 or a frequency (OD, BD, TDS, QID, HS, SOS, STAT), "x <n> days|weeks|months", and "after food", "before food" or "empty stomach">
Adv: <advice, tests and follow-up>
Unclear: <anything you could not understand, word for word>

Rules:
- Use only what the doctor said. Never add or change a symptom, finding, diagnosis, medicine, strength, dose, frequency, duration or advice. If a part of a medicine was not said, leave it out of that line.
- Write Dx only if the doctor named a diagnosis. Never work one out from complaints, readings or medicines.
- A strength, dose, frequency, duration or food timing belongs only to the medicine it was said with. Never copy it to another medicine.
- Translate Hindi into short clinical English. Keep every number exactly as said.
- Write medicine names in Latin letters as said; correct only an obvious misspelling of a well-known medicine.
- "jab bukhar ho", "if needed", "zarurat padne par" is SOS. "subah shaam" is 1-0-1. "din mein teen baar" is TDS. "raat ko" alone is HS.
- If you are unsure whether something is a medicine or what was meant, put it under Unclear instead of guessing. Leave out the Unclear line when everything was clear.
- Never write the patient's name, phone number or ID numbers.`;

/** Languages the doctor can choose, and how each is sent to Sarvam. */
export const LANGUAGES = {
  "en-IN": { label: "English", model: "saaras:v4", keyterms: true },
  // codemix keeps English medicine names in Latin letters inside Hindi speech,
  // so the prescription reader can still find them.
  "hi-IN": { label: "Hindi or Hinglish", model: "saaras:v3", mode: "codemix" },
};

export const readConfig = (env = process.env) => ({
  port: Number(env.PORT ?? 8090),
  enabled: env.VOICE_ENABLED !== "false",
  openmrsUrl: (env.OPENMRS_URL ?? "http://openmrs:8080").replace(/\/$/, ""),
  backend: env.STT_BACKEND ?? "sarvam",
  sarvamUrl: env.SARVAM_URL ?? "https://api.sarvam.ai/speech-to-text",
  sarvamKey: env.SARVAM_API_KEY ?? "",
  sarvamChatUrl:
    env.SARVAM_CHAT_URL ?? "https://api.sarvam.ai/v1/chat/completions",
  // Tidying sends the dictation text to Sarvam's chat model; off unless a key is set.
  tidyEnabled: env.TIDY_ENABLED !== "false",
  tidyModel: env.TIDY_MODEL ?? "sarvam-105b-conversations",
  maxTidyChars: Number(env.MAX_TIDY_CHARS ?? 6000),
  localUrl: env.LOCAL_STT_URL ?? "",
  consentVersion: env.CONSENT_VERSION ?? "2026-11-17",
  consentLog: env.CONSENT_LOG ?? "/var/lib/qorlia-voice/consent.log",
  privilege: env.REQUIRED_PRIVILEGE ?? "app:clinical",
  maxAudioBytes: Number(env.MAX_AUDIO_BYTES ?? 3_000_000),
  requestsPerHour: Number(env.REQUESTS_PER_HOUR ?? 240),
  serviceName: env.SERVICE_NAME ?? "Sarvam AI",
  serviceCountry: env.SERVICE_COUNTRY ?? "India",
  servicePolicyUrl:
    env.SERVICE_POLICY_URL ?? "https://www.sarvam.ai/privacy-policy",
});

class HttpError extends Error {
  constructor(status, code) {
    super(code);
    this.status = status;
    this.code = code;
  }
}

const json = (res, status, body, extra = {}) => {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    ...extra,
  });
  res.end(body === undefined ? "" : JSON.stringify(body));
};

const readBody = (req, limit) =>
  new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    let tooLarge = Number(req.headers["content-length"] ?? 0) > limit;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > limit) tooLarge = true;
      if (!tooLarge) chunks.push(chunk);
    });
    // The rest of an oversized upload is read and dropped, so the browser gets the reply.
    req.on("end", () =>
      tooLarge
        ? reject(new HttpError(413, "too_large"))
        : resolve(Buffer.concat(chunks)),
    );
    req.on("error", reject);
  });

/** Only the Bahmni session cookie is passed on, nothing else from the browser. */
export const sessionCookie = (header = "") => {
  const match = /(?:^|;\s*)JSESSIONID=([^;]+)/.exec(header);
  return match ? match[1] : null;
};

const hasPrivilege = (user, privilege) =>
  (user.privileges ?? []).some(({ name }) => name === privilege) ||
  (user.roles ?? []).some(({ name }) => name === "System Developer");

/**
 * Builds the request handler. `deps.fetch` and `deps.now` are replaced in tests.
 */
export const createVoiceHandler = (config, deps = {}) => {
  const fetchFn = deps.fetch ?? globalThis.fetch;
  const now = deps.now ?? Date.now;
  const log = deps.log ?? ((line) => console.log(JSON.stringify(line)));
  const sessions = new Map(); // hashed session id -> { user, expires }
  const usage = new Map(); // username -> request times in the last hour
  const consented = new Set(); // `${scope}:${version}:${username}`
  let consentLoaded = null;

  const loadConsent = () => {
    consentLoaded ??= readFile(config.consentLog, "utf8")
      .then((text) => {
        for (const line of text.split("\n")) {
          if (!line.trim()) continue;
          try {
            const entry = JSON.parse(line);
            // Entries from before tidying existed have no scope and cover voice only.
            if (entry.accepted)
              consented.add(
                `${entry.scope ?? "voice"}:${entry.version}:${entry.user}`,
              );
          } catch {
            // A damaged line is skipped; the user is simply asked again.
          }
        }
      })
      .catch(() => {});
    return consentLoaded;
  };

  const whoIs = async (req) => {
    const id = sessionCookie(req.headers.cookie);
    if (!id) throw new HttpError(401, "not_signed_in");
    const key = createHash("sha256").update(id).digest("hex");
    const cached = sessions.get(key);
    if (cached && cached.expires > now()) return cached.user;

    const response = await fetchFn(
      `${config.openmrsUrl}/openmrs/ws/rest/v1/session?v=custom:(authenticated,user:(uuid,username,privileges:(name),roles:(name)))`,
      { headers: { Cookie: `JSESSIONID=${id}`, Accept: "application/json" } },
    );
    if (!response.ok) throw new HttpError(401, "not_signed_in");
    const session = await response.json();
    if (!session.authenticated || !session.user?.username) {
      sessions.delete(key);
      throw new HttpError(401, "not_signed_in");
    }
    if (!hasPrivilege(session.user, config.privilege)) {
      throw new HttpError(403, "not_allowed");
    }
    const user = { username: session.user.username };
    sessions.set(key, { user, expires: now() + 60_000 });
    return user;
  };

  const checkOrigin = (req) => {
    const origin = req.headers.origin;
    if (!origin) return;
    let host = null;
    try {
      host = new URL(origin).host;
    } catch {
      // "null" and other unreadable origins are refused below.
    }
    if (host !== req.headers.host) throw new HttpError(403, "wrong_origin");
  };

  const hasConsent = (scope, username) =>
    consented.has(`${scope}:${config.consentVersion}:${username}`);
  const tidyOn = () =>
    config.enabled && config.tidyEnabled && Boolean(config.sarvamKey);

  const takeQuota = (username) => {
    const hourAgo = now() - 3_600_000;
    const times = (usage.get(username) ?? []).filter((t) => t > hourAgo);
    if (times.length >= config.requestsPerHour) {
      throw new HttpError(429, "too_many");
    }
    times.push(now());
    usage.set(username, times);
  };

  const transcribe = async (audio, contentType, language) => {
    const choice = LANGUAGES[language];
    const form = new FormData();
    const extension = contentType.includes("mp4")
      ? "m4a"
      : contentType.includes("ogg")
        ? "ogg"
        : "webm";
    form.append(
      "file",
      new Blob([audio], { type: contentType }),
      `dictation.${extension}`,
    );

    let url;
    const headers = {};
    if (config.backend === "sarvam") {
      if (!config.sarvamKey) throw new HttpError(503, "not_configured");
      url = config.sarvamUrl;
      headers["api-subscription-key"] = config.sarvamKey;
      form.append("model", choice.model);
      form.append("language_code", language);
      if (choice.mode) form.append("mode", choice.mode);
      if (choice.keyterms)
        form.append("keyterms", JSON.stringify(DEFAULT_KEYTERMS));
    } else if (config.backend === "http") {
      // A self-hosted model with the same request shape (file + language_code).
      if (!config.localUrl) throw new HttpError(503, "not_configured");
      url = config.localUrl;
      form.append("language_code", language);
    } else {
      throw new HttpError(503, "not_configured");
    }

    let response;
    try {
      response = await fetchFn(url, {
        method: "POST",
        headers,
        body: form,
        signal: AbortSignal.timeout(30_000),
      });
    } catch {
      throw new HttpError(502, "service_unreachable");
    }
    if (response.status === 429 || response.status === 503) {
      throw new HttpError(503, "service_busy");
    }
    if (!response.ok) throw new HttpError(502, `service_${response.status}`);
    const result = await response.json();
    return typeof result.transcript === "string"
      ? result.transcript.trim()
      : "";
  };

  /** Rewrites the dictation as shorthand with Sarvam's chat model. */
  const tidy = async (dictation) => {
    let response;
    try {
      response = await fetchFn(config.sarvamChatUrl, {
        method: "POST",
        headers: {
          "api-subscription-key": config.sarvamKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: config.tidyModel,
          temperature: 0,
          max_tokens: 1000,
          messages: [
            { role: "system", content: TIDY_PROMPT },
            { role: "user", content: dictation },
          ],
        }),
        signal: AbortSignal.timeout(30_000),
      });
    } catch {
      throw new HttpError(502, "service_unreachable");
    }
    if (response.status === 429 || response.status === 503) {
      throw new HttpError(503, "service_busy");
    }
    if (!response.ok) throw new HttpError(502, `service_${response.status}`);
    const result = await response.json();
    const choice = result.choices?.[0];
    const content = choice?.message?.content;
    if (choice?.finish_reason !== "stop" || typeof content !== "string") {
      throw new HttpError(502, "service_incomplete");
    }
    return content
      .replace(/^```[a-z]*\n?|```$/gim, "")
      .split("\n")
      .map((line) => line.trimEnd())
      .filter((line) => !/^unclear:\s*(<?none>?|nothing|-)?\.?\s*$/i.test(line))
      .join("\n")
      .trim();
  };

  const routes = {
    "GET /health": async (req, res) =>
      json(res, 200, {
        ok: true,
        enabled: config.enabled,
        backend: config.backend,
      }),

    "GET /voice.js": async (req, res) => {
      const script = await readFile(join(HERE, "legacy", "voice.js"));
      res.writeHead(200, {
        "Content-Type": "text/javascript; charset=utf-8",
        "Cache-Control": "no-cache",
      });
      res.end(script);
    },

    "GET /config": async (req, res) => {
      const user = await whoIs(req);
      await loadConsent();
      json(res, 200, {
        enabled: config.enabled,
        consentVersion: config.consentVersion,
        consented: hasConsent("voice", user.username),
        tidy: tidyOn(),
        tidyConsented: hasConsent("tidy", user.username),
        tidyService: {
          name: config.serviceName,
          country: config.serviceCountry,
          policyUrl: config.servicePolicyUrl,
        },
        service: {
          name: config.backend === "sarvam" ? config.serviceName : "Qorlia",
          country: config.serviceCountry,
          policyUrl:
            config.backend === "sarvam" ? config.servicePolicyUrl : null,
          outside: config.backend === "sarvam",
        },
        languages: Object.entries(LANGUAGES).map(([code, { label }]) => ({
          code,
          label,
        })),
      });
    },

    "POST /consent": async (req, res) => {
      checkOrigin(req);
      const user = await whoIs(req);
      const body = JSON.parse((await readBody(req, 2_000)).toString() || "{}");
      if (body.version !== config.consentVersion || body.accepted !== true) {
        throw new HttpError(400, "wrong_version");
      }
      const app = body.app === "legacy" ? "legacy" : "new";
      const scope = body.scope === "tidy" ? "tidy" : "voice";
      await mkdir(dirname(config.consentLog), { recursive: true });
      await appendFile(
        config.consentLog,
        `${JSON.stringify({ time: new Date(now()).toISOString(), user: user.username, version: config.consentVersion, scope, app, accepted: true })}\n`,
      );
      await loadConsent();
      consented.add(`${scope}:${config.consentVersion}:${user.username}`);
      json(res, 204);
    },

    "POST /transcribe": async (req, res, url) => {
      checkOrigin(req);
      if (!config.enabled) throw new HttpError(503, "switched_off");
      const user = await whoIs(req);
      await loadConsent();
      if (!hasConsent("voice", user.username)) {
        throw new HttpError(428, "consent_needed");
      }
      const language = url.searchParams.get("lang") ?? "en-IN";
      if (!LANGUAGES[language]) throw new HttpError(400, "unknown_language");
      const contentType = (req.headers["content-type"] ?? "")
        .split(";")[0]
        .trim();
      if (!/^audio\/(webm|ogg|mp4|mpeg|wav|x-wav|aac)$/.test(contentType)) {
        throw new HttpError(415, "not_audio");
      }
      takeQuota(user.username);
      const audio = await readBody(req, config.maxAudioBytes);
      if (audio.length === 0) throw new HttpError(400, "empty");
      const started = now();
      const text = await transcribe(audio, contentType, language);
      log({
        event: "transcribed",
        user: user.username,
        language,
        bytes: audio.length,
        ms: now() - started,
        chars: text.length,
      });
      json(res, 200, { text });
    },

    "POST /tidy": async (req, res) => {
      checkOrigin(req);
      if (!tidyOn()) throw new HttpError(503, "switched_off");
      const user = await whoIs(req);
      await loadConsent();
      if (!hasConsent("tidy", user.username)) {
        throw new HttpError(428, "consent_needed");
      }
      let body;
      try {
        body = JSON.parse(
          (await readBody(req, config.maxTidyChars * 4 + 200)).toString(),
        );
      } catch (error) {
        if (error instanceof HttpError) throw error;
        throw new HttpError(400, "bad_request");
      }
      const dictation = typeof body.text === "string" ? body.text.trim() : "";
      if (!dictation) throw new HttpError(400, "empty");
      if (dictation.length > config.maxTidyChars) {
        throw new HttpError(413, "too_large");
      }
      takeQuota(user.username);
      const started = now();
      const text = await tidy(dictation);
      log({
        event: "tidied",
        user: user.username,
        ms: now() - started,
        charsIn: dictation.length,
        chars: text.length,
      });
      json(res, 200, { text });
    },
  };

  return async (req, res) => {
    const url = new URL(req.url ?? "/", "http://relay");
    const base = BASES.find((prefix) => url.pathname.startsWith(`${prefix}/`));
    const path = base ? url.pathname.slice(base.length) : null;
    const route = path === null ? undefined : routes[`${req.method} ${path}`];
    const requestId = randomUUID();
    if (!route) return json(res, 404, { error: "not_found" });
    try {
      await route(req, res, url);
    } catch (error) {
      const status = error instanceof HttpError ? error.status : 500;
      const code = error instanceof HttpError ? error.code : "failed";
      if (status >= 500)
        log({
          event: "error",
          path,
          code,
          requestId,
          detail: error instanceof HttpError ? undefined : String(error),
        });
      if (!res.headersSent) json(res, status, { error: code, requestId });
    }
  };
};

if (import.meta.url === `file://${process.argv[1]}`) {
  const config = readConfig();
  createServer(createVoiceHandler(config)).listen(config.port, () => {
    console.log(
      JSON.stringify({
        event: "listening",
        port: config.port,
        backend: config.backend,
        enabled: config.enabled,
      }),
    );
  });
}
