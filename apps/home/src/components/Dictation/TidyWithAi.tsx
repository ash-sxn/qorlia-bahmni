import { Button, Checkbox, InlineLoading, Modal } from '@bahmni/design-system';
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

interface TidyWithAiProps {
  text: string;
  disabled?: boolean;
  /** Called with the shorthand the AI wrote from `text`. */
  onTidied: (tidied: string) => void;
}

/**
 * "Tidy with AI": rewrites the dictation as shorthand with the AI service the voice
 * relay is set up for. Shows nothing where the relay or tidying is not available.
 * The first use shows a notice that names the service; nothing is sent before the
 * doctor accepts it.
 */
export const TidyWithAi = ({ text, disabled, onTidied }: TidyWithAiProps) => {
  const { t } = useTranslation();
  const config = useQuery({
    queryKey: ['voice', 'config'],
    queryFn: getVoiceConfig,
    retry: false,
    refetchOnWindowFocus: false,
  });
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string>();
  const [noticeOpen, setNoticeOpen] = useState(false);
  const [agreed, setAgreed] = useState(false);

  if (!config.data?.enabled || !config.data.tidy) return null;
  const settings = config.data;
  const service = settings.tidyService ?? settings.service;

  const run = async () => {
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

  const accept = async () => {
    try {
      await acceptVoiceNotice(settings.consentVersion, 'tidy');
      await config.refetch();
      setNoticeOpen(false);
      void run();
    } catch {
      setNoticeOpen(false);
      setProblem('TIDY_ERROR_FAILED');
    }
  };

  return (
    <>
      <Button
        kind="secondary"
        disabled={Boolean(disabled) || busy || !text.trim()}
        onClick={() => {
          if (settings.tidyConsented) {
            void run();
          } else {
            setAgreed(false);
            setNoticeOpen(true);
          }
        }}
      >
        {t('TIDY_BUTTON', { service: service.name })}
      </Button>
      {busy && <InlineLoading description={t('TIDY_WORKING')} />}
      {problem && (
        <p role="alert" className={styles.voiceError}>
          {t(problem)}
        </p>
      )}
      <Modal
        open={noticeOpen}
        modalHeading={t('TIDY_NOTICE_TITLE')}
        primaryButtonText={t('TIDY_NOTICE_ACCEPT')}
        secondaryButtonText={t('VOICE_NOTICE_CANCEL')}
        primaryButtonDisabled={!agreed}
        onRequestSubmit={accept}
        onRequestClose={() => setNoticeOpen(false)}
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
    </>
  );
};
