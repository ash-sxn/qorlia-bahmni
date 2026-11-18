import {
  Checkbox,
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
import { useParams, useSearchParams } from 'react-router-dom';
import { ButtonLink } from '../common/ButtonLink';
import { DocumentWorkspace } from '../common/DocumentWorkspace';
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
  const [include, setInclude] = useState({
    diagnoses: true,
    medicines: true,
    allergies: true,
  });

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
    <main className={styles.page}>
      <p role="alert" className={styles.error}>
        {message}
      </p>
      <ButtonLink kind="tertiary" to={link}>
        {linkText}
      </ButtonLink>
    </main>
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
        <h3>{title}</h3>
        {body}
      </section>
    );
  };

  const lists = {
    diagnoses: recentDiagnoses.map(({ display }) => display),
    medicines: recentMedicines.map(({ name, frequency }) =>
      [name, frequency].filter(Boolean).join(', '),
    ),
    allergies: activeAllergies.map(({ display }) => display),
  };
  const toggle = (part: keyof typeof include, checked: boolean) =>
    setInclude({ ...include, [part]: checked });

  const form = (
    <>
      <div>
        <p className={styles.fieldLabel}>{t('REFERRAL_LETTER_TO')}</p>
        <p className={styles.chosen}>
          <strong>{entry.name}</strong>
          <span>
            {[entry.speciality, entry.organisation, entry.city]
              .filter(Boolean)
              .join(', ')}
          </span>
        </p>
        <ButtonLink kind="ghost" size="sm" to={backLink}>
          {t('REFERRAL_LETTER_CHANGE')}
        </ButtonLink>
      </div>
      <div>
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
      <fieldset className={styles.includes}>
        <legend className={styles.fieldLabel}>
          {t('REFERRAL_LETTER_INCLUDE')}
        </legend>
        <Checkbox
          id="referral-include-diagnoses"
          labelText={t('REFERRAL_LETTER_DIAGNOSES')}
          checked={include.diagnoses}
          onChange={(_, { checked }) => toggle('diagnoses', checked)}
        />
        <Checkbox
          id="referral-include-medicines"
          labelText={t('REFERRAL_LETTER_MEDICINES')}
          checked={include.medicines}
          onChange={(_, { checked }) => toggle('medicines', checked)}
        />
        <Checkbox
          id="referral-include-allergies"
          labelText={t('REFERRAL_LETTER_ALLERGIES')}
          checked={include.allergies}
          onChange={(_, { checked }) => toggle('allergies', checked)}
        />
      </fieldset>
      <TextInput
        id="referral-referred-by"
        labelText={t('REFERRAL_LETTER_FROM_LABEL')}
        value={referredBy}
        onChange={(event) => setReferredBy(event.target.value)}
      />
    </>
  );

  const preview = (
    <article className={styles.letter} aria-labelledby="referral-letter">
      <h2 id="referral-letter">{t('REFERRAL_LETTER_TITLE')}</h2>
      <p>{today.format(new Date())}</p>

      <section>
        <h3>{t('REFERRAL_LETTER_TO')}</h3>
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
        <h3>{t('REFERRAL_LETTER_PATIENT')}</h3>
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
        <h3>{t('REFERRAL_LETTER_REASON')}</h3>
        <p className={styles.preLine}>
          {reason || t('REFERRAL_LETTER_REASON_EMPTY')}
        </p>
      </section>

      {include.diagnoses &&
        renderList(t('REFERRAL_LETTER_DIAGNOSES'), diagnoses, lists.diagnoses)}
      {include.medicines &&
        renderList(t('REFERRAL_LETTER_MEDICINES'), medicines, lists.medicines)}
      {include.allergies &&
        renderList(t('REFERRAL_LETTER_ALLERGIES'), allergies, lists.allergies)}

      <section>
        <h3>{t('REFERRAL_LETTER_FROM')}</h3>
        <p>{referredBy}</p>
        <p className={styles.signature}>{t('REFERRAL_LETTER_SIGNATURE')}</p>
      </section>
    </article>
  );

  return (
    <DocumentWorkspace
      patientUuid={patientUuid}
      title={t('REFERRAL_LETTER_TITLE')}
      lead={t('REFERRAL_LETTER_LEAD')}
      status={t('REFERRAL_LETTER_NOT_SAVED')}
      form={form}
      preview={preview}
      printLabel={t('REFERRAL_LETTER_PRINT')}
    />
  );
};
