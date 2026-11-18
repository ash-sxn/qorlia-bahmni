import {
  Button,
  InlineLoading,
  Loading,
  MenuButton,
  MenuItem,
  Panel,
  PatientBanner,
  Printer,
} from '@bahmni/design-system';
import {
  AllergyStatus,
  calculateAge,
  getFormattedAllergies,
  getFormattedPatientById,
  getPatientDiagnoses,
  getPatientMedications,
  MedicationStatus,
  useTranslation,
} from '@bahmni/services';
import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ButtonLink } from '../common/ButtonLink';
import styles from './PatientRecord.module.scss';
import {
  getPatientLabResults,
  getPatientNotes,
  getPatientVisits,
} from './recordService';
import {
  countByKind,
  diagnosisEntries,
  filterGroups,
  groupByVisit,
  labEntries,
  medicineEntries,
  noteEntries,
} from './recordTimeline';
import { RECORD_KINDS, RecordEntry, RecordKind, VisitGroup } from './types';

/** Read-only history: no automatic retry and no reload when the window regains focus. */
const QUERY_OPTIONS = { retry: false, refetchOnWindowFocus: false } as const;

type Filter = 'all' | RecordKind;
const FILTERS: Filter[] = ['all', ...RECORD_KINDS];
const FILTER_LABELS: Record<Filter, string> = {
  all: 'PATIENT_RECORD_FILTER_ALL',
  note: 'PATIENT_RECORD_KIND_NOTE',
  diagnosis: 'PATIENT_RECORD_KIND_DIAGNOSIS',
  medicine: 'PATIENT_RECORD_KIND_MEDICINE',
  lab: 'PATIENT_RECORD_KIND_LAB',
};
const KIND_LABELS: Record<RecordKind, string> = {
  note: 'PATIENT_RECORD_KIND_NOTE_ONE',
  diagnosis: 'PATIENT_RECORD_KIND_DIAGNOSIS_ONE',
  medicine: 'PATIENT_RECORD_KIND_MEDICINE_ONE',
  lab: 'PATIENT_RECORD_KIND_LAB_ONE',
};
const KIND_ERRORS: Record<RecordKind, string> = {
  note: 'PATIENT_RECORD_NOTES_ERROR',
  diagnosis: 'PATIENT_RECORD_DIAGNOSES_ERROR',
  medicine: 'PATIENT_RECORD_MEDICINES_ERROR',
  lab: 'PATIENT_RECORD_LABS_ERROR',
};

/** Older visits fold away so the chart opens on what matters now. */
const VISITS_SHOWN = 4;
const LONG_NOTE = 280;

const day = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' });
const clock = new Intl.DateTimeFormat(undefined, {
  hour: '2-digit',
  minute: '2-digit',
});
const formatDay = (value: string) => day.format(new Date(value));

const forPatient = (path: string, patientUuid: string) =>
  `${path}?patient=${encodeURIComponent(patientUuid)}`;

/**
 * The patient chart: who the patient is, what matters now, and their history by
 * visit. Every patient action starts from here. Nothing on this page changes data.
 */
export const PatientRecordPage = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { patientUuid = '' } = useParams();
  const [filter, setFilter] = useState<Filter>('all');
  const [showAllVisits, setShowAllVisits] = useState(false);

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
  const notes = useQuery(query('notes', () => getPatientNotes(patientUuid)));
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
      ...noteEntries(notes.data ?? []),
      ...diagnosisEntries(diagnoses.data ?? []),
      ...medicineEntries(medicines.data ?? []),
      ...labEntries(labs.data ?? []),
    ],
    [notes.data, diagnoses.data, medicines.data, labs.data],
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
      <main className={styles.page}>
        <p role="alert" className={styles.error}>
          {t('PATIENT_RECORD_PATIENT_ERROR')}
        </p>
        <ButtonLink kind="tertiary" to="/home/records">
          {t('PATIENT_RECORD_BACK')}
        </ButtonLink>
      </main>
    );
  }

  const sources = {
    note: notes,
    diagnosis: diagnoses,
    medicine: medicines,
    lab: labs,
  };
  const loading =
    visits.isPending || RECORD_KINDS.some((kind) => sources[kind].isPending);
  const counts = countByKind(entries);
  const age = patient.data.birthDate
    ? calculateAge(patient.data.birthDate)
    : null;
  const activeAllergies = (allergies.data ?? [])
    .filter((allergy) => allergy.status === AllergyStatus.Active)
    .map((allergy) => allergy.display);
  const openVisit = (visits.data ?? []).find((visit) => !visit.stopDatetime);
  const consultation = forPatient('/home/dictation', patientUuid);

  const allergySummary = () => {
    if (allergies.isPending) return { message: t('PATIENT_RECORD_LOADING') };
    if (allergies.isError)
      return { message: t('PATIENT_RECORD_ALLERGIES_ERROR') };
    return {
      label:
        activeAllergies.length > 0
          ? t('PATIENT_RECORD_ALLERGIES')
          : t('PATIENT_RECORD_NO_ALLERGIES'),
      items: activeAllergies,
    };
  };

  const problems = [
    ...new Map(
      [...(diagnoses.data ?? [])]
        .sort((a, b) => b.recordedDate.localeCompare(a.recordedDate))
        .map((diagnosis) => [diagnosis.display, diagnosis]),
    ).values(),
  ].slice(0, 6);
  const currentMedicines = (medicines.data ?? []).filter(
    (medicine) => medicine.status === MedicationStatus.Active,
  );
  const recentLabs = labEntries(labs.data ?? [])
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 5);

  const glance = (
    items: { key: string; title: string; detail?: string; flag?: string }[],
    emptyKey: string,
    pending: boolean,
    failed: boolean,
    errorKey: string,
  ) => {
    if (pending)
      return <p className={styles.muted}>{t('PATIENT_RECORD_LOADING')}</p>;
    if (failed) return <p className={styles.error}>{t(errorKey)}</p>;
    if (items.length === 0)
      return <p className={styles.muted}>{t(emptyKey)}</p>;
    return (
      <ul className={styles.glanceList}>
        {items.map((item) => (
          <li key={item.key}>
            <span className={styles.glanceTitle}>{item.title}</span>
            {item.flag && <span className={styles.flag}>{item.flag}</span>}
            {item.detail && (
              <span className={styles.glanceDetail}>{item.detail}</span>
            )}
          </li>
        ))}
      </ul>
    );
  };

  const renderEntry = (entry: RecordEntry) => (
    <li key={entry.id} className={styles.entry}>
      <span className={styles.kind}>{t(KIND_LABELS[entry.kind])}</span>
      <div className={styles.entryBody}>
        {entry.kind === 'note' ? (
          <>
            {entry.detail.length > LONG_NOTE ? (
              <details className={styles.note}>
                <summary>
                  <span className={styles.noteText}>
                    {`${entry.detail.slice(0, LONG_NOTE).trimEnd()}…`}
                  </span>
                  <span className={styles.more}>
                    {t('PATIENT_RECORD_SHOW_WHOLE_NOTE')}
                  </span>
                </summary>
                <p className={styles.noteText}>{entry.detail}</p>
              </details>
            ) : (
              <p className={styles.noteText}>{entry.detail}</p>
            )}
            {entry.title && (
              <span className={styles.detail}>
                {t('PATIENT_RECORD_NOTE_BY', { name: entry.title })}
              </span>
            )}
          </>
        ) : (
          <>
            <strong>{entry.title}</strong>
            {entry.detail && (
              <span className={styles.detail}>{entry.detail}</span>
            )}
          </>
        )}
      </div>
      <span className={styles.entryEnd}>
        {entry.abnormal && (
          <span className={styles.flag}>{t('PATIENT_RECORD_ABNORMAL')}</span>
        )}
        <time dateTime={entry.date}>
          {entry.kind === 'note'
            ? `${formatDay(entry.date)}, ${clock.format(new Date(entry.date))}`
            : formatDay(entry.date)}
        </time>
      </span>
    </li>
  );

  const renderGroup = (
    { key, visit, entries: visitEntries }: VisitGroup,
    index: number,
  ) => {
    const open = Boolean(visit && !visit.stopDatetime);
    // Folded visits stay in the page so a printed record is complete.
    const folded = !showAllVisits && index >= VISITS_SHOWN;
    return (
      <section
        key={key}
        className={`${styles.visit} ${folded ? styles.folded : ''}`}
        aria-labelledby={`visit-${key}`}
      >
        <header className={styles.visitHead}>
          <h3 id={`visit-${key}`}>
            {visit
              ? [formatDay(visit.startDatetime), visit.visitType.display]
                  .filter(Boolean)
                  .join(', ')
              : t('PATIENT_RECORD_OUTSIDE_VISITS')}
          </h3>
          {visit?.location?.display && (
            <span className={styles.muted}>{visit.location.display}</span>
          )}
          {open && (
            <span className={styles.openTag}>
              {t('PATIENT_RECORD_OPEN_VISIT')}
            </span>
          )}
        </header>
        {visitEntries.length > 0 && (
          <ul className={styles.entries}>{visitEntries.map(renderEntry)}</ul>
        )}
        {visitEntries.length === 0 && !open && (
          <p className={styles.muted}>{t('PATIENT_RECORD_VISIT_EMPTY')}</p>
        )}
        {open &&
          (filter === 'all' || filter === 'note') &&
          !visitEntries.some((entry) => entry.kind === 'note') && (
            <div className={styles.startHere}>
              <span>{t('PATIENT_RECORD_NO_NOTE_YET')}</span>
              <ButtonLink kind="tertiary" size="md" to={consultation}>
                {t('PATIENT_RECORD_START_CONSULTATION')}
              </ButtonLink>
            </div>
          )}
      </section>
    );
  };

  const shown = filterGroups(
    groups,
    new Set(filter === 'all' ? RECORD_KINDS : [filter]),
  );

  return (
    <>
      <PatientBanner
        name={patient.data.fullName ?? ''}
        details={[
          [
            age && t('PATIENT_RECORD_AGE_YEARS', { count: age.years }),
            patient.data.gender,
          ]
            .filter(Boolean)
            .join(', '),
          patient.data.identifier,
        ]}
        allergies={allergySummary()}
        visit={
          openVisit
            ? t('PATIENT_RECORD_VISIT_OPEN_SINCE', {
                type: openVisit.visitType.display,
                date: formatDay(openVisit.startDatetime),
              })
            : undefined
        }
        actions={
          <>
            <ButtonLink to={consultation}>
              {t('PATIENT_RECORD_START_CONSULTATION')}
            </ButtonLink>
            <MenuButton
              label={t('PATIENT_RECORD_CREATE_DOCUMENT')}
              kind="tertiary"
              size="lg"
              menuAlignment="bottom-end"
            >
              <MenuItem
                label={t('PATIENT_RECORD_REFER')}
                onClick={() =>
                  navigate(forPatient('/home/referrals', patientUuid))
                }
              />
              <MenuItem
                label={t('PATIENT_RECORD_PREAUTH')}
                onClick={() =>
                  navigate(forPatient('/home/preauthorisation', patientUuid))
                }
              />
              <MenuItem
                label={t('PATIENT_RECORD_ESTIMATE')}
                onClick={() =>
                  navigate(forPatient('/home/estimate', patientUuid))
                }
              />
            </MenuButton>
            <Button
              kind="ghost"
              hasIconOnly
              renderIcon={Printer}
              iconDescription={t('PATIENT_RECORD_PRINT')}
              tooltipPosition="bottom"
              onClick={() => window.print()}
            />
          </>
        }
      />

      <main className={styles.chart}>
        <aside
          className={styles.glance}
          aria-label={t('PATIENT_RECORD_GLANCE')}
        >
          <Panel title={t('PATIENT_RECORD_PROBLEMS')} variant="summary">
            {glance(
              problems.map((diagnosis) => ({
                key: diagnosis.id,
                title: diagnosis.display,
                detail: formatDay(diagnosis.recordedDate),
              })),
              'PATIENT_RECORD_NO_PROBLEMS',
              diagnoses.isPending,
              diagnoses.isError,
              'PATIENT_RECORD_GLANCE_ERROR',
            )}
          </Panel>
          <Panel
            title={t('PATIENT_RECORD_CURRENT_MEDICINES')}
            variant="summary"
          >
            {glance(
              currentMedicines.map((medicine) => ({
                key: medicine.id,
                title: medicine.name,
                detail: [
                  medicine.dose &&
                    `${medicine.dose.value} ${medicine.dose.unit}`,
                  medicine.frequency,
                ]
                  .filter(Boolean)
                  .join(', '),
              })),
              'PATIENT_RECORD_NO_CURRENT_MEDICINES',
              medicines.isPending,
              medicines.isError,
              'PATIENT_RECORD_GLANCE_ERROR',
            )}
          </Panel>
          <Panel title={t('PATIENT_RECORD_RECENT_LABS')} variant="summary">
            {glance(
              recentLabs.map((entry) => ({
                key: entry.id,
                title: entry.title,
                detail: [entry.detail, formatDay(entry.date)]
                  .filter(Boolean)
                  .join(', '),
                flag: entry.abnormal
                  ? t('PATIENT_RECORD_ABNORMAL_SHORT')
                  : undefined,
              })),
              'PATIENT_RECORD_NO_LABS',
              labs.isPending,
              labs.isError,
              'PATIENT_RECORD_GLANCE_ERROR',
            )}
          </Panel>
          <Link className={styles.quietLink} to="/home/records">
            {t('PATIENT_RECORD_FIND_ANOTHER')}
          </Link>
        </aside>

        <Panel
          title={t('PATIENT_RECORD_HISTORY')}
          className={styles.history}
          aside={
            <div
              className={styles.segmented}
              role="group"
              aria-label={t('PATIENT_RECORD_FILTER_LABEL')}
            >
              {FILTERS.map((id) => (
                <button
                  key={id}
                  type="button"
                  aria-pressed={filter === id}
                  className={filter === id ? styles.segmentOn : styles.segment}
                  onClick={() => setFilter(id)}
                >
                  {t(FILTER_LABELS[id])}
                  {id !== 'all' && !loading && (
                    <span className={styles.count}>{counts[id]}</span>
                  )}
                </button>
              ))}
            </div>
          }
        >
          {loading ? (
            <InlineLoading description={t('PATIENT_RECORD_LOADING')} />
          ) : (
            <>
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
              {shown.length === 0 ? (
                <p className={styles.muted}>{t('PATIENT_RECORD_EMPTY')}</p>
              ) : (
                shown.map(renderGroup)
              )}
              {shown.length > VISITS_SHOWN && (
                <Button
                  kind="ghost"
                  className={styles.screenOnly}
                  onClick={() => setShowAllVisits(!showAllVisits)}
                >
                  {showAllVisits
                    ? t('PATIENT_RECORD_FEWER_VISITS')
                    : t('PATIENT_RECORD_MORE_VISITS', {
                        count: shown.length - VISITS_SHOWN,
                      })}
                </Button>
              )}
            </>
          )}
        </Panel>
      </main>
    </>
  );
};
