import { ActionBar, Button, Panel, PatientBanner } from '@bahmni/design-system';
import { useTranslation } from '@bahmni/services';
import React, { ReactNode } from 'react';
import { ButtonLink } from './ButtonLink';
import styles from './DocumentWorkspace.module.scss';
import { usePatientBanner } from './usePatientBanner';

interface DocumentWorkspaceProps {
  patientUuid: string;
  title: string;
  /** One sentence on what the document is for. */
  lead: string;
  /** Says what happens to the document: saved, sent, or printed only. */
  status: string;
  /** The fields to fill in. */
  form: ReactNode;
  /** The document as it will print, drawn from the same values. */
  preview: ReactNode;
  printLabel: string;
  printDisabled?: boolean;
  /** Where Back goes; the patient's chart by default. */
  backTo?: string;
  backLabel?: string;
}

/**
 * One pattern for every document made from a patient's record: fill in on the left,
 * see the printed page on the right, and print from the bar at the bottom.
 */
export const DocumentWorkspace: React.FC<DocumentWorkspaceProps> = ({
  patientUuid,
  title,
  lead,
  status,
  form,
  preview,
  printLabel,
  printDisabled = false,
  backTo,
  backLabel,
}) => {
  const { t } = useTranslation();
  const banner = usePatientBanner(patientUuid);
  const chart = `/home/records/${encodeURIComponent(patientUuid)}`;
  return (
    <>
      {banner && (
        <div className={styles.screenOnly}>
          <PatientBanner {...banner} />
        </div>
      )}
      <main className={styles.workspace}>
        <header className={`${styles.heading} ${styles.screenOnly}`}>
          <h1>{title}</h1>
          <p>{lead}</p>
        </header>
        <div className={styles.columns}>
          <Panel
            title={t('DOCUMENT_FILL_IN')}
            className={`${styles.form} ${styles.screenOnly}`}
          >
            <div className={styles.fields}>{form}</div>
          </Panel>
          <section
            className={styles.previewColumn}
            aria-label={t('DOCUMENT_PREVIEW')}
          >
            <p className={`${styles.caption} ${styles.screenOnly}`}>
              {t('DOCUMENT_PREVIEW')}
            </p>
            <div className={styles.paper}>{preview}</div>
          </section>
        </div>
      </main>
      <ActionBar status={status} ariaLabel={t('DOCUMENT_ACTIONS')}>
        <ButtonLink kind="ghost" to={backTo ?? chart}>
          {backLabel ?? t('DICTATION_BACK')}
        </ButtonLink>
        <Button disabled={printDisabled} onClick={() => window.print()}>
          {printLabel}
        </Button>
      </ActionBar>
    </>
  );
};

export default DocumentWorkspace;
