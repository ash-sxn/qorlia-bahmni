import { BaseLayout, Header } from '@bahmni/design-system';
import {
  BAHMNI_HOME_PATH,
  getCurrentStateName,
  getFormattedPatientById,
  getPatientPrograms,
  hasPrivilege,
  searchPatientByNameOrId,
  type PatientSearchResult,
  type ProgramEnrollment,
  useTranslation,
} from '@bahmni/services';
import { useUserPrivilege, UserGlobalAction } from '@bahmni/widgets';
import { useQuery } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import styles from './BedManagement.module.scss';

const patientName = (patient: PatientSearchResult) =>
  [patient.givenName, patient.middleName, patient.familyName]
    .filter(Boolean)
    .join(' ');

const displayDate = (value: string | null | undefined) =>
  value ? new Date(value).toLocaleDateString() : '';

export const ProgramsPage = () => {
  const { t } = useTranslation();
  const { patientUuid } = useParams<{ patientUuid: string }>();
  const { userPrivileges, isLoading: privilegesLoading } = useUserPrivilege();
  const canView = hasPrivilege(userPrivileges, 'app:clinical');
  const [input, setInput] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const patients = useQuery({
    queryKey: ['program-patient-search', searchTerm],
    queryFn: () => searchPatientByNameOrId(searchTerm),
    enabled: canView && !patientUuid && searchTerm.length >= 2,
  });
  const patient = useQuery({
    queryKey: ['program-patient', patientUuid],
    queryFn: () => getFormattedPatientById(patientUuid!),
    enabled: canView && !!patientUuid,
  });
  const enrollments = useQuery({
    queryKey: ['program-enrollments', patientUuid],
    queryFn: () => getPatientPrograms(patientUuid!),
    enabled: canView && !!patientUuid,
  });
  const active = (enrollments.data?.results ?? []).filter(
    (item) => !item.voided && !item.dateCompleted,
  );
  const past = (enrollments.data?.results ?? []).filter(
    (item) => !item.voided && !!item.dateCompleted,
  );
  const submitSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSearchTerm(input.trim());
  };
  const programTable = (items: ProgramEnrollment[], title: string) => (
    <section className={styles.card} aria-label={title}>
      <h2>{title}</h2>
      {items.length === 0 ? (
        <p>{t('PROGRAMS_NONE')}</p>
      ) : (
        <div className={styles.tableScroll}>
          <table>
            <thead>
              <tr>
                <th>{t('PROGRAMS_NAME')}</th>
                <th>{t('PROGRAMS_ENROLLED')}</th>
                <th>{t('PROGRAMS_STATE')}</th>
                <th>{t('PROGRAMS_COMPLETED')}</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.uuid}>
                  <td>{item.program?.name ?? item.program?.display}</td>
                  <td>{displayDate(item.dateEnrolled)}</td>
                  <td>
                    {item.states?.length
                      ? (getCurrentStateName(item) ??
                        t('PROGRAMS_NONE_RECORDED'))
                      : t('PROGRAMS_NONE_RECORDED')}
                  </td>
                  <td>{displayDate(item.dateCompleted)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );

  return (
    <BaseLayout
      header={
        <Header
          breadcrumbItems={[
            { id: 'home', label: t('HOME_LABEL'), href: BAHMNI_HOME_PATH },
            {
              id: 'programs',
              label: t('PROGRAMS_TITLE'),
              href: patientUuid ? '/bahmni-v2/clinical/programs' : undefined,
              isCurrentPage: !patientUuid,
            },
            ...(patientUuid
              ? [
                  {
                    id: 'patient',
                    label: patient.data?.fullName ?? t('PROGRAMS_PATIENT'),
                    isCurrentPage: true,
                  },
                ]
              : []),
          ]}
          userMenu={<UserGlobalAction />}
        />
      }
      main={
        <main className={styles.page}>
          <div className={styles.intro}>
            <span className={styles.eyebrow}>{t('CLINICAL_LABEL')}</span>
            <h1>{t('PROGRAMS_TITLE')}</h1>
            <p>{t('PROGRAMS_DESCRIPTION')}</p>
          </div>
          <nav className={styles.pageNav} aria-label={t('PROGRAMS_NAV')}>
            <Link to="/clinical">{t('CLINICAL_LABEL')}</Link>
            <Link
              to="/clinical/programs"
              aria-current={!patientUuid ? 'page' : undefined}
            >
              {t('PROGRAMS_TITLE')}
            </Link>
          </nav>
          {privilegesLoading || userPrivileges === null ? (
            <p role="status">{t('PROGRAMS_LOADING')}</p>
          ) : !canView ? (
            <p role="alert">{t('PROGRAMS_NO_ACCESS')}</p>
          ) : patientUuid ? (
            <div className={styles.programSections}>
              <section className={styles.card}>
                {patient.isLoading ? (
                  <p role="status">{t('PROGRAMS_LOADING')}</p>
                ) : patient.isError || !patient.data ? (
                  <p role="alert">{t('PROGRAMS_PATIENT_ERROR')}</p>
                ) : (
                  <>
                    <h2>{patient.data.fullName ?? t('PROGRAMS_PATIENT')}</h2>
                    <p>{patient.data.identifier}</p>
                    <a
                      href={`/bahmni/clinical/#/programs/patient/${patientUuid}/consultationContext`}
                    >
                      {t('PROGRAMS_LEGACY_MANAGER')}
                    </a>
                  </>
                )}
              </section>
              {enrollments.isLoading ? (
                <p role="status">{t('PROGRAMS_LOADING')}</p>
              ) : enrollments.isError ? (
                <p role="alert">{t('PROGRAMS_ENROLLMENTS_ERROR')}</p>
              ) : (
                <>
                  {programTable(active, t('PROGRAMS_ACTIVE'))}
                  {programTable(past, t('PROGRAMS_PAST'))}
                </>
              )}
            </div>
          ) : (
            <section className={styles.card}>
              <h2>{t('PROGRAMS_FIND_PATIENT')}</h2>
              <form
                className={styles.searchForm}
                onSubmit={submitSearch}
                role="search"
              >
                <label htmlFor="program-patient-search">
                  {t('PROGRAMS_SEARCH_LABEL')}
                </label>
                <input
                  id="program-patient-search"
                  type="search"
                  minLength={2}
                  value={input}
                  onChange={(event) => setInput(event.target.value)}
                />
                <button type="submit">{t('PROGRAMS_SEARCH')}</button>
              </form>
              {searchTerm &&
                (patients.isLoading ? (
                  <p role="status">{t('PROGRAMS_LOADING')}</p>
                ) : patients.isError ? (
                  <p role="alert">{t('PROGRAMS_SEARCH_ERROR')}</p>
                ) : !patients.data?.pageOfResults.length ? (
                  <p>{t('PROGRAMS_NO_PATIENTS')}</p>
                ) : (
                  <div className={styles.tableScroll}>
                    <table>
                      <thead>
                        <tr>
                          <th>{t('PROGRAMS_PATIENT')}</th>
                          <th>{t('PROGRAMS_ID')}</th>
                          <th>{t('PROGRAMS_OPEN')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {patients.data.pageOfResults.map((result) => (
                          <tr key={result.uuid}>
                            <td>{patientName(result)}</td>
                            <td>{result.identifier}</td>
                            <td>
                              <Link to={`/clinical/programs/${result.uuid}`}>
                                {t('PROGRAMS_OPEN')}
                              </Link>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ))}
            </section>
          )}
        </main>
      }
    />
  );
};

export default ProgramsPage;
