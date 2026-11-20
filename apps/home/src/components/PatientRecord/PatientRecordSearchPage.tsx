import { Button, InlineLoading, Search } from '@bahmni/design-system';
import {
  type PatientSearchResult,
  searchPatientByNameOrId,
  useTranslation,
} from '@bahmni/services';
import { useQuery } from '@tanstack/react-query';
import { FormEvent, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ButtonLink } from '../common/ButtonLink';
import styles from './PatientRecord.module.scss';

const MIN_SEARCH_LENGTH = 2;

/** Find a patient by name or ID, then open their record. Read-only. */
export const PatientRecordSearchPage = () => {
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const initial = searchParams.get('q') ?? '';
  const [text, setText] = useState(initial);
  const [term, setTerm] = useState(initial.trim());
  const search = useQuery({
    queryKey: ['patient-record', 'search', term],
    queryFn: () => searchPatientByNameOrId(term),
    enabled: term.length >= MIN_SEARCH_LENGTH,
    retry: false,
    refetchOnWindowFocus: false,
  });
  const patients = (search.data?.pageOfResults ?? []) as PatientSearchResult[];

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setTerm(text.trim());
    setSearchParams(text.trim() ? { q: text.trim() } : {}, { replace: true });
  };

  const renderResults = () => {
    if (term.length < MIN_SEARCH_LENGTH) {
      return <p className={styles.muted}>{t('PATIENT_RECORD_SEARCH_HINT')}</p>;
    }
    if (search.isPending) {
      return <InlineLoading description={t('PATIENT_RECORD_LOADING')} />;
    }
    if (search.isError) {
      return (
        <p role="alert" className={styles.error}>
          {t('PATIENT_RECORD_SEARCH_ERROR')}
        </p>
      );
    }
    if (patients.length === 0) {
      return <p className={styles.muted}>{t('PATIENT_RECORD_NO_PATIENTS')}</p>;
    }
    return (
      <ul className={styles.results} aria-label={t('PATIENT_RECORD_RESULTS')}>
        {patients.map((patient) => {
          const chart = `/home/records/${patient.uuid}`;
          return (
            <li key={patient.uuid} className={styles.result}>
              <div className={styles.resultText}>
                <Link className={styles.resultName} to={chart}>
                  {[patient.givenName, patient.middleName, patient.familyName]
                    .filter(Boolean)
                    .join(' ')}
                </Link>
                <span className={styles.detail}>
                  {[
                    patient.age && `${patient.age} y`,
                    patient.gender,
                    patient.identifier,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </span>
              </div>
              {patient.activeVisitUuid && (
                <span className={styles.openTag}>
                  {t('PATIENT_RECORD_OPEN_VISIT')}
                </span>
              )}
              <div className={styles.resultActions}>
                <ButtonLink kind="tertiary" size="md" to={chart}>
                  {t('PATIENT_RECORD_OPEN_CHART')}
                </ButtonLink>
                {patient.activeVisitUuid && (
                  <ButtonLink
                    size="md"
                    to={`/home/dictation?patient=${encodeURIComponent(patient.uuid)}`}
                  >
                    {t('PATIENT_RECORD_START_CONSULTATION')}
                  </ButtonLink>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    );
  };

  return (
    <main className={styles.page}>
      <h1 className={styles.title}>{t('PATIENT_RECORD_TITLE')}</h1>
      <p className={styles.lead}>{t('PATIENT_RECORD_INTRO')}</p>
      <form role="search" className={styles.search} onSubmit={submit}>
        <Search
          size="lg"
          labelText={t('PATIENT_RECORD_SEARCH_LABEL')}
          placeholder={t('PATIENT_RECORD_SEARCH_PLACEHOLDER')}
          closeButtonLabelText={t('PATIENT_RECORD_SEARCH_CLEAR')}
          value={text}
          onChange={(event) => setText(event.target.value)}
        />
        <Button type="submit">{t('PATIENT_RECORD_SEARCH_BUTTON')}</Button>
      </form>
      {renderResults()}
    </main>
  );
};
