import {
  Button,
  InlineLoading,
  TextArea,
  TextInput,
} from '@bahmni/design-system';
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
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { HomePageHeader } from '../HomePageHeader';
import { loadDirectory } from './referralDirectory';
import styles from './ReferralNetwork.module.scss';

const QUERY_OPTIONS = { retry: false, refetchOnWindowFocus: false } as const;
/** A letter stays readable: the most recent few of each, not the whole history. */
const MAX_DIAGNOSES = 6;
const MAX_MEDICINES = 10;

const today = new Intl.DateTimeFormat(undefined, { dateStyle: 'long' });
const newestFirst = (a: string, b: string) =>
  new Date(b).getTime() - new Date(a).getTime();

/**
 * A referral letter for one patient to one directory entry, filled in from the record.
 * Nothing is saved: the letter exists only to be printed or saved as a PDF.
 */
export const ReferralLetterPage = () => {
  const { t } = useTranslation();
  const { entryId = '' } = useParams();
  const [searchParams] = useSearchParams();
  const patientUuid = searchParams.get('patient') ?? '';
  const [reason, setReason] = useState('');
  const [referredBy, setReferredBy] = useState('');

  const entry = useMemo(() => {
    const directory = loadDirectory();
    return directory.ok
      ? directory.entries.find(({ id }) => id === entryId)
      : undefined;
  }, [entryId]);

  const query = <T,>(name: string, queryFn: () => Promise<T>) => ({
    queryKey: ['referral-network', name, patientUuid],
    queryFn,
    enabled: patientUuid !== '' && entry !== undefined,
    ...QUERY_OPTIONS,
  });
  const patient = useQuery(
    query('patient', () => getFormattedPatientById(patientUuid)),
  );
  const diagnoses = useQuery(
    query('diagnoses', () => getPatientDiagnoses(patientUuid)),
  );
  const medicines = useQuery(
    query('medicines', () => getPatientMedications(patientUuid)),
  );
  const allergies = useQuery(
    query('allergies', () => getFormattedAllergies(patientUuid)),
  );

  const backLink = `/home/referrals${patientUuid ? `?patient=${encodeURIComponent(patientUuid)}` : ''}`;
  const problem = (message: string, link: string, linkText: string) => (
    <>
      <HomePageHeader />
      <main className={styles.page}>
        <p role="alert" className={styles.error}>
          {message}
        </p>
        <Link to={link}>{linkText}</Link>
      </main>
    </>
  );

  if (!entry) {
    return problem(
      t('REFERRAL_LETTER_NO_ENTRY'),
      backLink,
      t('REFERRAL_LETTER_BACK'),
    );
  }
  if (patientUuid === '') {
    return problem(
      t('REFERRAL_LETTER_NO_PATIENT'),
      '/home/records',
      t('REFERRAL_LETTER_FIND_PATIENT'),
    );
  }
  if (patient.isError) {
    return problem(
      t('REFERRAL_LETTER_PATIENT_ERROR'),
      '/home/records',
      t('REFERRAL_LETTER_FIND_PATIENT'),
    );
  }
  if (patient.isPending) {
    return <InlineLoading description={t('REFERRAL_LOADING')} />;
  }

  const age = patient.data.birthDate
    ? calculateAge(patient.data.birthDate)
    : null;
  const recentDiagnoses = [...(diagnoses.data ?? [])]
    .sort((a, b) => newestFirst(a.recordedDate, b.recordedDate))
    .slice(0, MAX_DIAGNOSES);
  const recentMedicines = [...(medicines.data ?? [])]
    .sort((a, b) => newestFirst(a.orderDate, b.orderDate))
    .slice(0, MAX_MEDICINES);
  const activeAllergies = (allergies.data ?? []).filter(
    ({ status }) => status === AllergyStatus.Active,
  );

  /** One part of the clinical summary: its items, or why there are none. */
  const renderList = (
    title: string,
    source: { isPending: boolean; isError: boolean },
    items: string[],
  ) => {
    let body;
    if (source.isPending) {
      body = <p>{t('REFERRAL_LOADING')}</p>;
    } else if (source.isError) {
      body = <p role="alert">{t('REFERRAL_LETTER_PART_ERROR')}</p>;
    } else if (items.length === 0) {
      body = <p>{t('REFERRAL_LETTER_NONE')}</p>;
    } else {
      body = (
        <ul>
          {items.map((item, index) => (
            // eslint-disable-next-line react/no-array-index-key
            <li key={`${index}-${item}`}>{item}</li>
          ))}
        </ul>
      );
    }
    return (
      <section>
        <h2>{title}</h2>
        {body}
      </section>
    );
  };

  return (
    <>
      <div className={styles.screenOnly}>
        <HomePageHeader />
      </div>
      <main className={styles.page}>
        <div className={styles.screenOnly}>
          <Link to={backLink}>{t('REFERRAL_LETTER_BACK')}</Link>
          <p className={styles.notice}>{t('REFERRAL_LETTER_NOT_SAVED')}</p>
        </div>

        <article className={styles.letter} aria-labelledby="referral-letter">
          <h1 id="referral-letter">{t('REFERRAL_LETTER_TITLE')}</h1>
          <p>{today.format(new Date())}</p>

          <section>
            <h2>{t('REFERRAL_LETTER_TO')}</h2>
            <p>
              <strong>{entry.name}</strong>
              <br />
              {[entry.speciality, entry.organisation, entry.city]
                .filter(Boolean)
                .join(', ')}
              <br />
              {entry.phone}
            </p>
          </section>

          <section>
            <h2>{t('REFERRAL_LETTER_PATIENT')}</h2>
            <p>
              <strong>{patient.data.fullName}</strong>
              <br />
              {[
                patient.data.identifier,
                patient.data.gender,
                age && t('PATIENT_RECORD_AGE_YEARS', { count: age.years }),
              ]
                .filter(Boolean)
                .join(' · ')}
            </p>
          </section>

          <section>
            <h2>{t('REFERRAL_LETTER_REASON')}</h2>
            <div className={styles.screenOnly}>
              {/* The shared TextArea puts its label under the box, so show one above. */}
              <label htmlFor="referral-reason" className={styles.fieldLabel}>
                {t('REFERRAL_LETTER_REASON_LABEL')}
              </label>
              <TextArea
                id="referral-reason"
                labelText={t('REFERRAL_LETTER_REASON_LABEL')}
                hideLabel
                rows={4}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
              />
            </div>
            <p className={styles.printOnly}>{reason}</p>
          </section>

          {renderList(
            t('REFERRAL_LETTER_DIAGNOSES'),
            diagnoses,
            recentDiagnoses.map(({ display }) => display),
          )}
          {renderList(
            t('REFERRAL_LETTER_MEDICINES'),
            medicines,
            recentMedicines.map(({ name, frequency }) =>
              [name, frequency].filter(Boolean).join(', '),
            ),
          )}
          {renderList(
            t('REFERRAL_LETTER_ALLERGIES'),
            allergies,
            activeAllergies.map(({ display }) => display),
          )}

          <section>
            <h2>{t('REFERRAL_LETTER_FROM')}</h2>
            <div className={styles.screenOnly}>
              <TextInput
                id="referral-referred-by"
                labelText={t('REFERRAL_LETTER_FROM_LABEL')}
                value={referredBy}
                onChange={(event) => setReferredBy(event.target.value)}
              />
            </div>
            <p className={styles.printOnly}>{referredBy}</p>
            <p className={styles.signature}>{t('REFERRAL_LETTER_SIGNATURE')}</p>
          </section>
        </article>

        <div className={`${styles.toolbar} ${styles.screenOnly}`}>
          <Button onClick={() => window.print()}>
            {t('REFERRAL_LETTER_PRINT')}
          </Button>
        </div>
      </main>
    </>
  );
};
