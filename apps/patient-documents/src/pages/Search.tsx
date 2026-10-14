import { BaseLayout, Header } from '@bahmni/design-system';
import { BAHMNI_HOME_PATH, searchPatientByNameOrId } from '@bahmni/services';
import { UserGlobalAction } from '@bahmni/widgets';
import { useQuery } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation } from 'react-router-dom';
import { BAHMNI_PATIENT_DOCUMENTS_NAMESPACE } from '../constants/app';
import styles from './styles/Index.module.scss';

export const SearchPage = () => {
  const { t } = useTranslation(BAHMNI_PATIENT_DOCUMENTS_NAMESPACE);
  const { search } = useLocation();
  const [input, setInput] = useState('');
  const [term, setTerm] = useState('');
  const patients = useQuery({
    queryKey: ['document-patient-search', term],
    queryFn: () => searchPatientByNameOrId(term),
    enabled: term.length >= 2,
  });
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (input.trim().length >= 2) setTerm(input.trim());
  };
  const params = new URLSearchParams(search);
  if (!params.has('encounterType'))
    params.set('encounterType', 'Patient Document');

  return (
    <BaseLayout
      header={
        <Header
          breadcrumbItems={[
            {
              id: 'home',
              label: t('PATIENT_DOCUMENTS_BREADCRUMB_HOME'),
              href: BAHMNI_HOME_PATH,
            },
            {
              id: 'documents',
              label: t('DOCUMENTS_TITLE'),
              isCurrentPage: true,
            },
          ]}
          userMenu={<UserGlobalAction />}
        />
      }
      main={
        <main className={styles.page}>
          <div className={styles.intro}>
            <h1>{t('DOCUMENTS_TITLE')}</h1>
            <p>{t('PATIENT_DOCUMENTS_SEARCH_DESCRIPTION')}</p>
          </div>
          <section className={styles.searchCard}>
            <form className={styles.searchForm} onSubmit={submit} role="search">
              <label htmlFor="document-patient-search">
                {t('PATIENT_DOCUMENTS_SEARCH_LABEL')}
              </label>
              <input
                id="document-patient-search"
                type="search"
                value={input}
                minLength={2}
                required
                onChange={(event) => setInput(event.target.value)}
              />
              <button type="submit" disabled={input.trim().length < 2}>
                {t('PATIENT_DOCUMENTS_SEARCH_BUTTON')}
              </button>
            </form>
            {!term ? (
              <p>{t('PATIENT_DOCUMENTS_SEARCH_PROMPT')}</p>
            ) : patients.isLoading ? (
              <p role="status">{t('PATIENT_DOCUMENTS_ACCESS_LOADING')}</p>
            ) : patients.isError ? (
              <p role="alert">{t('PATIENT_DOCUMENTS_SEARCH_ERROR')}</p>
            ) : !patients.data?.pageOfResults.length ? (
              <p>{t('PATIENT_DOCUMENTS_SEARCH_EMPTY')}</p>
            ) : (
              <div className={styles.tableScroll}>
                <table>
                  <thead>
                    <tr>
                      <th>{t('PATIENT_DOCUMENTS_PATIENT_NAME')}</th>
                      <th>{t('PATIENT_DOCUMENTS_PATIENT_ID')}</th>
                      <th>{t('PATIENT_DOCUMENTS_SEARCH_ACTION')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {patients.data.pageOfResults.map((patient) => (
                      <tr key={patient.uuid}>
                        <td>
                          {[
                            patient.givenName,
                            patient.middleName,
                            patient.familyName,
                          ]
                            .filter(Boolean)
                            .join(' ')}
                        </td>
                        <td>{patient.identifier}</td>
                        <td>
                          <Link
                            to={`/patient-documents/${encodeURIComponent(patient.uuid)}?${params.toString()}`}
                          >
                            {t('PATIENT_DOCUMENTS_SEARCH_OPEN')}
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {patients.data.totalCount >
                  patients.data.pageOfResults.length && (
                  <p>{t('PATIENT_DOCUMENTS_SEARCH_REFINE')}</p>
                )}
              </div>
            )}
          </section>
        </main>
      }
    />
  );
};
