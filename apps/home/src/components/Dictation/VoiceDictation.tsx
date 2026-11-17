import {
  Button,
  Checkbox,
  Dropdown,
  InlineLoading,
  Modal,
} from '@bahmni/design-system';
import { useTranslation } from '@bahmni/services';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import styles from './Dictation.module.scss';
import {
  canRecord,
  startVoiceRecording,
  VoiceRecording,
} from './voiceRecorder';
import {
  acceptVoiceNotice,
  getVoiceConfig,
  transcribeAudio,
  VoiceError,
} from './voiceService';

const LANGUAGE_KEY = 'qorlia.voice.language';

const ERROR_KEYS: Record<string, string> = {
  not_signed_in: 'VOICE_ERROR_SESSION',
  consent_needed: 'VOICE_ERROR_SESSION',
  not_allowed: 'VOICE_ERROR_NOT_ALLOWED',
  too_many: 'VOICE_ERROR_LIMIT',
  service_busy: 'VOICE_ERROR_BUSY',
  service_unreachable: 'VOICE_ERROR_BUSY',
  switched_off: 'VOICE_ERROR_OFF',
  not_configured: 'VOICE_ERROR_OFF',
};

const errorKey = (error: unknown) =>
  (error instanceof VoiceError && ERROR_KEYS[error.code]) ||
  'VOICE_ERROR_FAILED';

const storedLanguage = () => {
  try {
    return window.localStorage.getItem(LANGUAGE_KEY);
  } catch {
    return null;
  }
};

interface VoiceDictationProps {
  /** Called with each piece of speech, in the order it was spoken. */
  onText: (text: string) => void;
}

/**
 * The "Dictate by voice" control. Shows nothing where the voice relay is not
 * installed. The first use shows a notice naming the speech service, which the
 * doctor must accept before the microphone turns on.
 */
export const VoiceDictation = ({ onText }: VoiceDictationProps) => {
  const { t } = useTranslation();
  const config = useQuery({
    queryKey: ['voice', 'config'],
    queryFn: getVoiceConfig,
    retry: false,
    refetchOnWindowFocus: false,
  });
  const [language, setLanguage] = useState<string | null>(storedLanguage);
  const [recording, setRecording] = useState<VoiceRecording | null>(null);
  const [starting, setStarting] = useState(false);
  const [pending, setPending] = useState(0);
  const [message, setMessage] = useState<{ key: string; error: boolean }>();
  const [noticeOpen, setNoticeOpen] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const queue = useRef<Promise<void>>(Promise.resolve());
  const recordingRef = useRef<VoiceRecording | null>(null);
  const onTextRef = useRef(onText);
  onTextRef.current = onText;

  useEffect(() => () => recordingRef.current?.stop(), []);

  if (config.isPending) return null;
  if (config.isError) {
    const code = (config.error as VoiceError).code;
    // Not installed on this server, or not reachable: the page works without it.
    if (code === 'unreachable' || code === 'not_found' || code === 'failed') {
      return null;
    }
    return (
      <p className={styles.hint} role="status">
        {t(errorKey(config.error))}
      </p>
    );
  }
  if (!config.data.enabled) return null;

  const settings = config.data;
  const languages = settings.languages;
  const selected =
    languages.find(({ code }) => code === language) ?? languages[0];

  const stop = () => {
    recordingRef.current?.stop();
    recordingRef.current = null;
    setRecording(null);
    setMessage(undefined);
  };

  const send = (audio: Blob) => {
    setPending((count) => count + 1);
    const job = transcribeAudio(audio, selected.code);
    queue.current = queue.current
      .then(() => job)
      .then(
        (text) => {
          if (text) onTextRef.current(text);
        },
        (error: unknown) => {
          if (
            error instanceof VoiceError &&
            ['not_signed_in', 'consent_needed', 'switched_off'].includes(
              error.code,
            )
          ) {
            stop();
          }
          setMessage({ key: errorKey(error), error: true });
        },
      )
      .finally(() => setPending((count) => count - 1));
  };

  const start = async () => {
    if (!canRecord()) {
      setMessage({ key: 'VOICE_ERROR_BROWSER', error: true });
      return;
    }
    setStarting(true);
    try {
      const handle = await startVoiceRecording(send);
      recordingRef.current = handle;
      setRecording(handle);
      setMessage({ key: 'VOICE_LISTENING', error: false });
    } catch {
      setMessage({ key: 'VOICE_ERROR_MICROPHONE', error: true });
    } finally {
      setStarting(false);
    }
  };

  const onButton = () => {
    if (recording) {
      stop();
    } else if (!settings.consented) {
      setAgreed(false);
      setNoticeOpen(true);
    } else {
      void start();
    }
  };

  const accept = async () => {
    try {
      await acceptVoiceNotice(settings.consentVersion);
      await config.refetch();
      setNoticeOpen(false);
      void start();
    } catch (error) {
      setNoticeOpen(false);
      setMessage({ key: errorKey(error), error: true });
    }
  };

  const service = settings.service;
  const points = service.outside
    ? [
        t('VOICE_NOTICE_SENT', {
          service: service.name,
          country: service.country,
        }),
        t('VOICE_NOTICE_NOT_KEPT'),
        t('VOICE_NOTICE_NO_NAMES'),
        t('VOICE_NOTICE_CHECK'),
        t('VOICE_NOTICE_TELL_PATIENT'),
      ]
    : [t('VOICE_NOTICE_LOCAL'), t('VOICE_NOTICE_CHECK')];

  return (
    <section className={styles.voice} aria-label={t('VOICE_DICTATE')}>
      <div className={styles.voiceControls}>
        <Dropdown
          id="voice-language"
          titleText={t('VOICE_LANGUAGE')}
          label={selected.label}
          items={languages}
          itemToString={(item) => item?.label ?? ''}
          selectedItem={selected}
          disabled={Boolean(recording)}
          onChange={({ selectedItem }) => {
            if (!selectedItem) return;
            setLanguage(selectedItem.code);
            try {
              window.localStorage.setItem(LANGUAGE_KEY, selectedItem.code);
            } catch {
              // Only a convenience.
            }
          }}
        />
        <Button
          kind={recording ? 'danger' : 'secondary'}
          aria-pressed={Boolean(recording)}
          disabled={starting}
          onClick={onButton}
        >
          {recording ? t('VOICE_STOP') : t('VOICE_DICTATE')}
        </Button>
        {pending > 0 && <InlineLoading description={t('VOICE_WRITING')} />}
      </div>
      <p
        role="status"
        className={message?.error ? styles.voiceError : styles.hint}
      >
        {message ? t(message.key) : t('VOICE_HINT')}
      </p>

      <Modal
        open={noticeOpen}
        modalHeading={t('VOICE_NOTICE_TITLE')}
        primaryButtonText={t('VOICE_NOTICE_ACCEPT')}
        secondaryButtonText={t('VOICE_NOTICE_CANCEL')}
        primaryButtonDisabled={!agreed}
        onRequestSubmit={accept}
        onRequestClose={() => setNoticeOpen(false)}
      >
        <ul className={styles.voiceNotice}>
          {points.map((point) => (
            <li key={point}>{point}</li>
          ))}
        </ul>
        {service.policyUrl && (
          <p>
            <a href={service.policyUrl} target="_blank" rel="noreferrer">
              {t('VOICE_NOTICE_POLICY', { service: service.name })}
            </a>
          </p>
        )}
        <Checkbox
          id="voice-notice-agree"
          labelText={t('VOICE_NOTICE_AGREE')}
          checked={agreed}
          onChange={(_, { checked }) => setAgreed(checked)}
        />
      </Modal>
    </section>
  );
};
