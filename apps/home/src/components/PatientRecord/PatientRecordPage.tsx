import { Button, InlineLoading, Loading, Tag } from '@bahmni/design-system';
import {
  AllergyStatus,
  calculateAge,
  getFormattedAllergies,
  getFormattedPatientById,
  getPatientDiagnoses,
  getPatientMedications,
  useTranslation,
} from '@bahmni/services';
import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { HomePageHeader } from '../HomePageHeader';
import styles from './PatientRecord.module.scss';
import { getPatientLabResults, getPatientVisits } from './recordService';
import {
  countByKind,
  diagnosisEntries,
  filterGroups,
  groupByVisit,
  labEntries,
  medicineEntries,
} from './recordTimeline';
import { RECORD_KINDS, RecordKind, VisitGroup } from './types';

/** Read-only history: no automatic retry and no reload when the window regains focus. */
const QUERY_OPTIONS = { retry: false, refetchOnWindowFocus: false } as const;

const KIND_LABELS: Record<RecordKind, string> = {
  diagnosis: 'PATIENT_RECORD_KIND_DIAGNOSIS',
  medicine: 'PATIENT_RECORD_KIND_MEDICINE',
  lab: 'PATIENT_RECORD_KIND_LAB',
};
const KIND_ERRORS: Record<RecordKind, string> = {
  diagnosis: 'PATIENT_RECORD_DIAGNOSES_ERROR',
  medicine: 'PATIENT_RECORD_MEDICINES_ERROR',
  lab: 'PATIENT_RECORD_LABS_ERROR',
};

const day = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' });
const formatDay = (value: string) => day.format(new Date(value));

/** A patient's whole history on one page, grouped by visit. Nothing here changes data. */
export const PatientRecordPage = () => {
  const { t } = useTranslation();
  const { patientUuid = '' } = useParams();
  const [kinds, setKinds] = useState<ReadonlySet<RecordKind>>(
    () => new Set(RECORD_KINDS),
  );

  const query = <T,>(name: string, queryFn: () => Promise<T>) => ({
    queryKey: ['patient-record', name, patientUuid],
    queryFn,
    enabled: patientUuid !== '',
    ...QUERY_OPTIONS,
  });
  const patient = useQuery(
    query('patient', () => getFormattedPatientById(patientUuid)),
  );
  const visits = useQuery(query('visits', () => getPatientVisits(patientUuid)));
  const diagnoses = useQuery(
    query('diagnoses', () => getPatientDiagnoses(patientUuid)),
  );
  const medicines = useQuery(
    query('medicines', () => getPatientMedications(patientUuid)),
  );
  const labs = useQuery(query('labs', () => getPatientLabResults(patientUuid)));
  const allergies = useQuery(
    query('allergies', () => getFormattedAllergies(patientUuid)),
  );

  const entries = useMemo(
    () => [
      ...diagnosisEntries(diagnoses.data ?? []),
      ...medicineEntries(medicines.data ?? []),
      ...labEntries(labs.data ?? []),
    ],
    [diagnoses.data, medicines.data, labs.data],
  );
  const groups = useMemo(
    () => groupByVisit(visits.data ?? [], entries),
    [visits.data, entries],
  );

  if (patient.isPending) {
    return <Loading />;
  }
  if (patient.isError) {
    return (
      <>
        <HomePageHeader />
        <main className={styles.page}>
          <Link to="/home/records">{t('PATIENT_RECORD_BACK')}</Link>
          <p role="alert" className={styles.error}>
            {t('PATIENT_RECORD_PATIENT_ERROR')}
          </p>
        </main>
      </>
    );
  }

  const sources = { diagnosis: diagnoses, medicine: medicines, lab: labs };
  const loading =
    visits.isPending || RECORD_KINDS.some((kind) => sources[kind].isPending);
  const counts = countByKind(entries);
  const age = patient.data.birthDate
    ? calculateAge(patient.data.birthDate)
    : null;
  const activeAllergies = (allergies.data ?? []).filter(
    (allergy) => allergy.status === AllergyStatus.Active,
  );
  const toggleKind = (kind: RecordKind) => {
    const next = new Set(kinds);
    if (!next.delete(kind)) {
      next.add(kind);
    }
    setKinds(next);
  };

  const renderAllergies = () => {
    if (allergies.isPending) {
      return t('PATIENT_RECORD_LOADING');
    }
    if (allergies.isError) {
      return t('PATIENT_RECORD_ALLERGIES_ERROR');
    }
    return activeAllergies.length > 0
      ? activeAllergies.map((allergy) => allergy.display).join(', ')
      : t('PATIENT_RECORD_NO_ALLERGIES');
  };

  const renderGroup = ({ key, visit, entries: visitEntries }: VisitGroup) => (
    <section
      key={key}
      className={styles.visit}
      aria-labelledby={`visit-${key}`}
    >
      <h2 id={`visit-${key}`}>
        {visit
          ? [
              formatDay(visit.startDatetime),
              visit.visitType.display,
              visit.location?.display,
            ]
              .filter(Boolean)
              .join(' · ')
          : t('PATIENT_RECORD_OUTSIDE_VISITS')}
        {visit && !visit.stopDatetime && (
          <Tag type="green">{t('PATIENT_RECORD_OPEN_VISIT')}</Tag>
        )}
      </h2>
      {visitEntries.length === 0 ? (
        <p className={styles.muted}>{t('PATIENT_RECORD_VISIT_EMPTY')}</p>
      ) : (
        <ul className={styles.entries}>
          {visitEntries.map((entry) => (
            <li key={entry.id}>
              <span className={styles.kind}>{t(KIND_LABELS[entry.kind])}</span>
              <span>
                <strong>{entry.title}</strong>
                {entry.abnormal && (
                  <Tag type="red">{t('PATIENT_RECORD_ABNORMAL')}</Tag>
                )}
                {entry.detail && (
                  <span className={styles.detail}>{entry.detail}</span>
                )}
              </span>
              <time dateTime={entry.date}>{formatDay(entry.date)}</time>
            </li>
          ))}
        </ul>
      )}
    </section>
  );

  const shown = filterGroups(groups, kinds);

  return (
    <>
      <div className={styles.screenOnly}>
        <HomePageHeader />
      </div>
      <main className={styles.page}>
        <Link className={styles.screenOnly} to="/home/records">
          {t('PATIENT_RECORD_BACK')}
        </Link>
        <h1>{patient.data.fullName}</h1>
        <p>
          {[
            patient.data.identifier,
            patient.data.gender,
            age && t('PATIENT_RECORD_AGE_YEARS', { count: age.years }),
          ]
            .filter(Boolean)
            .join(' · ')}
        </p>
        <p>
          <strong>{t('PATIENT_RECORD_ALLERGIES')}</strong> {renderAllergies()}
        </p>

        {loading ? (
          <InlineLoading description={t('PATIENT_RECORD_LOADING')} />
        ) : (
          <>
            <p className={styles.muted}>
              {t('PATIENT_RECORD_SUMMARY', {
                visits: visits.data?.length ?? 0,
                diagnoses: counts.diagnosis,
                medicines: counts.medicine,
                labs: counts.lab,
              })}
            </p>
            {visits.isError && (
              <p role="alert" className={styles.error}>
                {t('PATIENT_RECORD_VISITS_ERROR')}
              </p>
            )}
            {RECORD_KINDS.filter((kind) => sources[kind].isError).map(
              (kind) => (
                <p key={kind} role="alert" className={styles.error}>
                  {t(KIND_ERRORS[kind])}
                </p>
              ),
            )}
            <div
              className={`${styles.toolbar} ${styles.screenOnly}`}
              role="group"
              aria-label={t('PATIENT_RECORD_FILTER_LABEL')}
            >
              {RECORD_KINDS.map((kind) => (
                <Button
                  key={kind}
                  size="sm"
                  kind={kinds.has(kind) ? 'primary' : 'tertiary'}
                  aria-pressed={kinds.has(kind)}
                  onClick={() => toggleKind(kind)}
                >
                  {t(KIND_LABELS[kind])}
                </Button>
              ))}
              <Button size="sm" kind="ghost" onClick={() => window.print()}>
                {t('PATIENT_RECORD_PRINT')}
              </Button>
              <Link
                to={`/home/referrals?patient=${encodeURIComponent(patientUuid)}`}
              >
                {t('PATIENT_RECORD_REFER')}
              </Link>
              <Link
                to={`/home/preauthorisation?patient=${encodeURIComponent(patientUuid)}`}
              >
                {t('PATIENT_RECORD_PREAUTH')}
              </Link>
            </div>
            {shown.length === 0 ? (
              <p className={styles.muted}>{t('PATIENT_RECORD_EMPTY')}</p>
            ) : (
              shown.map(renderGroup)
            )}
          </>
        )}
      </main>
    </>
  );
};
