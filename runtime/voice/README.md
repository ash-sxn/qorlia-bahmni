# Voice dictation relay

Turns short dictation recordings into text for two screens:

- the new interface: **Dictate by voice** on the dictation page (`apps/home/src/components/Dictation`);
- the classic Bahmni clinical app: a microphone button that types into the notes box the doctor selected (`legacy/voice.js`).

The browser never holds the speech service key. It sends audio to this relay on the same address as Bahmni, so its Bahmni session cookie comes along. The relay:

1. checks the session with OpenMRS and requires the `app:clinical` privilege;
2. checks that this user has accepted the current voice notice (the notice names the speech service and is shown before the microphone first turns on);
3. sends the audio to the speech service and returns the text.

Audio and text are never written to disk or to the log. The log has one line per recording: user, language, size, time taken and number of characters. Acceptances of the notice are appended to `CONSENT_LOG` (user, notice version, screen, time).

## Speech services

| `STT_BACKEND`      | What it does                                                                                                                                                                                                                                                                        |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `sarvam` (default) | [Sarvam AI speech-to-text](https://docs.sarvam.ai/api-reference-docs/speech-to-text/transcribe). English uses `saaras:v4` with a list of common medicine names as key terms. Hindi or Hinglish uses `saaras:v3` in `codemix` mode, so English medicine names stay in Latin letters. |
| `http`             | Any self-hosted model that accepts the same multipart request (`file`, `language_code`) at `LOCAL_STT_URL` and answers `{ "transcript": "..." }`. Use this to move to a model on the hospital's own server. The notice then says audio stays on the hospital's server.              |

**Tidy with AI** (new interface only): the doctor can press _Tidy with AI_ to send the dictation text to Sarvam's chat model (`TIDY_MODEL`, default `sarvam-105b-conversations`), which rewrites it as the shorthand the dictation page already reads (`TIDY_PROMPT` in `server.mjs`). The page then makes the draft with its own fixed rules and marks every part of a medicine line that is not in what the doctor said. Tidying has its own notice and acceptance (`scope: "tidy"` in `CONSENT_LOG`), separate from voice. `TIDY_ENABLED=false` switches it off. Only the length of the text is logged.

Sarvam keeps API data until a workspace owner sets a retention period. Before real use, set **Settings, Workspace, Data policy, Product overrides, Model APIs: No retention** in the Sarvam dashboard.

## Configuration

| Variable             | Default                             | Meaning                                                                     |
| -------------------- | ----------------------------------- | --------------------------------------------------------------------------- |
| `PORT`               | `8090`                              | Listening port                                                              |
| `VOICE_ENABLED`      | `true`                              | `false` switches dictation off everywhere without a redeploy of the screens |
| `OPENMRS_URL`        | `http://openmrs:8080`               | Used only to check the session                                              |
| `STT_BACKEND`        | `sarvam`                            | See above                                                                   |
| `SARVAM_API_KEY`     |                                     | Required for `sarvam`. Keep it in a root-only env file, never in Git        |
| `LOCAL_STT_URL`      |                                     | Required for `http`                                                         |
| `CONSENT_VERSION`    | `2026-11-17`                        | Change it when the notice text changes; everyone is asked again             |
| `CONSENT_LOG`        | `/var/lib/qorlia-voice/consent.log` | Append-only record of acceptances                                           |
| `REQUIRED_PRIVILEGE` | `app:clinical`                      | OpenMRS privilege needed to dictate                                         |
| `REQUESTS_PER_HOUR`  | `240`                               | Recordings per user per hour (each is a phrase of up to 25 seconds)         |
| `MAX_AUDIO_BYTES`    | `3000000`                           | Largest single recording                                                    |
| `TIDY_ENABLED`       | `true`                              | `false` hides Tidy with AI; it also needs `SARVAM_API_KEY`                  |
| `TIDY_MODEL`         | `sarvam-105b-conversations`         | Sarvam chat model used to tidy                                              |
| `MAX_TIDY_CHARS`     | `6000`                              | Longest dictation text that can be tidied                                   |

## Running it next to Bahmni (Docker Compose)

```yaml
services:
  qorlia-voice:
    image: node:22-alpine
    command: ["node", "/srv/voice/server.mjs"]
    env_file: /etc/qorlia/voice/voice.env # root-only, holds SARVAM_API_KEY
    volumes:
      - ./runtime/voice:/srv/voice:ro
      - qorlia-voice-data:/var/lib/qorlia-voice
    restart: unless-stopped
volumes:
  qorlia-voice-data:
```

Proxy (Apache, in the Bahmni proxy configuration):

```apache
# Before "ProxyPass /openmrs": the screens call /openmrs/qorlia-voice, because the
# Bahmni session cookie is scoped to /openmrs.
ProxyPass /openmrs/qorlia-voice http://qorlia-voice:8090/openmrs/qorlia-voice
ProxyPassReverse /openmrs/qorlia-voice http://qorlia-voice:8090/openmrs/qorlia-voice
# The classic-screen script and the health check.
ProxyPass /qorlia-voice http://qorlia-voice:8090/qorlia-voice
ProxyPassReverse /qorlia-voice http://qorlia-voice:8090/qorlia-voice
```

Classic clinical app: append `legacy/customControl-loader.js` to `openmrs/apps/customDisplayControl/js/customControl.js` in the Bahmni config. The microphone appears only inside `/bahmni/clinical/`, and only for signed-in users with the clinical privilege.

The new interface needs nothing extra: the dictation page asks `/openmrs/qorlia-voice/config` and shows the control only when the relay answers.

## Tests

```bash
node --test runtime/voice/server.test.mjs
```

For a local browser check, run the relay and start the dev server with `QORLIA_VOICE_ORIGIN=http://127.0.0.1:8090`, which proxies `/qorlia-voice` to it.
