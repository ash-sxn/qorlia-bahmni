/**
 * Talks to the Qorlia voice relay that runs next to Bahmni on the same address
 * (runtime/voice). The relay checks the Bahmni session, records the doctor's
 * acceptance of the notice, and holds the speech service key.
 */
// Under /openmrs so the browser sends the Bahmni session cookie, which is scoped to that path.
export const VOICE_API = '/openmrs/qorlia-voice';

export interface VoiceConfig {
  enabled: boolean;
  consentVersion: string;
  consented: boolean;
  service: {
    name: string;
    country: string;
    policyUrl: string | null;
    /** True when audio leaves the hospital's server. */
    outside: boolean;
  };
  languages: { code: string; label: string }[];
  /** Whether "Tidy with AI" is available on this server. */
  tidy?: boolean;
  /** Whether this user accepted the separate notice for tidying text. */
  tidyConsented?: boolean;
  tidyService?: { name: string; country: string; policyUrl: string | null };
}

export type NoticeScope = 'voice' | 'tidy';

export class VoiceError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
  ) {
    super(code);
  }
}

const send = async <T>(path: string, init?: RequestInit): Promise<T> => {
  let response: Response;
  try {
    response = await fetch(`${VOICE_API}${path}`, {
      credentials: 'same-origin',
      ...init,
    });
  } catch {
    throw new VoiceError('unreachable', 0);
  }
  if (response.status === 204) return undefined as T;
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new VoiceError(body.error ?? 'failed', response.status);
  }
  return body as T;
};

export const getVoiceConfig = () => send<VoiceConfig>('/config');

export const acceptVoiceNotice = (
  version: string,
  scope: NoticeScope = 'voice',
) =>
  send<void>('/consent', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ version, accepted: true, app: 'new', scope }),
  });

/** Sends the dictation text to be rewritten as shorthand; returns the shorthand. */
export const tidyDictation = async (text: string) => {
  const result = await send<{ text: string }>('/tidy', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  });
  return result.text;
};

export const transcribeAudio = async (audio: Blob, language: string) => {
  const { text } = await send<{ text: string }>(
    `/transcribe?lang=${encodeURIComponent(language)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': audio.type.split(';')[0] || 'audio/webm' },
      body: audio,
    },
  );
  return text;
};
