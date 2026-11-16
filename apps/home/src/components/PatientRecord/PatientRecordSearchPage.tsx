import { Button, InlineLoading, Search } from '@bahmni/design-system';
import {
  type PatientSearchResult,
  searchPatientByNameOrId,
  useTranslation,
} from '@bahmni/services';
import { useQuery } from '@tanstack/react-query';
import { FormEvent, useState } from 'react';
import { Link } from 'react-router-dom';
import { HomePageHeader } from '../HomePageHeader';
import styles from './PatientRecord.module.scss';

const MIN_SEARCH_LENGTH = 2;

/** Find a patient by name or ID, then open their record. Read-only. */
export const PatientRecordSearchPage = () => {
  const { t } = useTranslation();
  const [text, setText] = useState('');
  const [term, setTerm] = useState('');
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
        {patients.map((patient) => (
          <li key={patient.uuid}>
            <Link to={`/records/${patient.uuid}`}>
              {[patient.givenName, patient.middleName, patient.familyName]
                .filter(Boolean)
                .join(' ')}
            </Link>
            <span className={styles.muted}>
              {[patient.identifier, patient.gender, patient.age]
                .filter(Boolean)
                .join(' · ')}
            </span>
          </li>
        ))}
      </ul>
    );
  };

  return (
    <>
      <HomePageHeader />
      <main className={styles.page}>
        <Link to="/home/">{t('HOME_LABEL')}</Link>
        <h1>{t('PATIENT_RECORD_TITLE')}</h1>
        <p>{t('PATIENT_RECORD_INTRO')}</p>
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
    </>
  );
};
