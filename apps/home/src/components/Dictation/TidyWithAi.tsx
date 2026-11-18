import { Checkbox, Modal } from '@bahmni/design-system';
import { useTranslation } from '@bahmni/services';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import styles from './Dictation.module.scss';
import {
  acceptVoiceNotice,
  getVoiceConfig,
  tidyDictation,
  VoiceError,
} from './voiceService';

const ERROR_KEYS: Record<string, string> = {
  not_signed_in: 'TIDY_ERROR_SESSION',
  consent_needed: 'TIDY_ERROR_SESSION',
  not_allowed: 'TIDY_ERROR_NOT_ALLOWED',
  too_many: 'TIDY_ERROR_LIMIT',
  too_large: 'TIDY_ERROR_TOO_LONG',
  service_busy: 'TIDY_ERROR_BUSY',
  service_unreachable: 'TIDY_ERROR_BUSY',
  switched_off: 'TIDY_ERROR_OFF',
};

/**
 * Tidy with AI: rewrites the dictation as shorthand with the AI service the voice
 * relay is set up for. Unavailable where the relay or tidying is not installed.
 * The first use shows a notice that names the service; nothing is sent before the
 * doctor accepts it.
 */
export const useTidyWithAi = (onTidied: (tidied: string) => void) => {
  const { t } = useTranslation();
  const config = useQuery({
    queryKey: ['voice', 'config'],
    queryFn: getVoiceConfig,
    retry: false,
    refetchOnWindowFocus: false,
  });
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string>();
  const [pending, setPending] = useState<string | null>(null);
  const [agreed, setAgreed] = useState(false);

  const settings = config.data;
  const available = Boolean(settings?.enabled && settings.tidy);
  const service = settings?.tidyService ?? settings?.service;

  const run = async (text: string) => {
    setBusy(true);
    setProblem(undefined);
    try {
      const tidied = await tidyDictation(text);
      if (tidied.trim()) onTidied(tidied);
      else setProblem('TIDY_ERROR_FAILED');
    } catch (error) {
      setProblem(
        (error instanceof VoiceError && ERROR_KEYS[error.code]) ||
          'TIDY_ERROR_FAILED',
      );
    } finally {
      setBusy(false);
    }
  };

  const start = (text: string) => {
    if (!settings || !text.trim()) return;
    if (settings.tidyConsented) {
      void run(text);
    } else {
      setAgreed(false);
      setPending(text);
    }
  };

  const accept = async () => {
    const text = pending;
    setPending(null);
    if (!settings || text === null) return;
    try {
      await acceptVoiceNotice(settings.consentVersion, 'tidy');
      await config.refetch();
      void run(text);
    } catch {
      setProblem('TIDY_ERROR_FAILED');
    }
  };

  const notice = service ? (
    <Modal
      open={pending !== null}
      modalHeading={t('TIDY_NOTICE_TITLE')}
      primaryButtonText={t('TIDY_NOTICE_ACCEPT')}
      secondaryButtonText={t('VOICE_NOTICE_CANCEL')}
      primaryButtonDisabled={!agreed}
      onRequestSubmit={accept}
      onRequestClose={() => setPending(null)}
    >
      <ul className={styles.voiceNotice}>
        {[
          t('TIDY_NOTICE_SENT', {
            service: service.name,
            country: service.country,
          }),
          t('TIDY_NOTICE_NOT_KEPT'),
          t('VOICE_NOTICE_NO_NAMES'),
          t('TIDY_NOTICE_CHECK'),
        ].map((point) => (
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
        id="tidy-notice-agree"
        labelText={t('TIDY_NOTICE_AGREE')}
        checked={agreed}
        onChange={(_, { checked }) => setAgreed(checked)}
      />
    </Modal>
  ) : null;

  return {
    available,
    busy,
    problem,
    clearProblem: () => setProblem(undefined),
    serviceName: service?.name ?? '',
    serviceCountry: service?.country ?? '',
    start,
    notice,
  };
};
