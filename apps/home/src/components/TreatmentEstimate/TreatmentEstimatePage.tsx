import {
  Checkbox,
  InlineLoading,
  TextArea,
  TextInput,
} from '@bahmni/design-system';
import {
  calculateAge,
  getFormattedPatientById,
  getPatientDiagnoses,
  useTranslation,
} from '@bahmni/services';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ButtonLink } from '../common/ButtonLink';
import { DocumentWorkspace } from '../common/DocumentWorkspace';
import { CostEstimateTable } from '../InsuranceDesk/CostEstimateTable';
import styles from '../InsuranceDesk/InsuranceDesk.module.scss';
import { COST_HEADS, totalEstimate } from '../InsuranceDesk/preauthEstimate';

const QUERY_OPTIONS = { retry: false, refetchOnWindowFocus: false } as const;

const FIELDS = [
  { key: 'diagnosis', long: true },
  { key: 'treatment', long: true },
  { key: 'expected_days', long: false },
  { key: 'room_type', long: false },
  { key: 'valid_days', long: false },
  { key: 'prepared_by', long: false },
] as const;
/** Asked only for a patient travelling from another country, for the visa papers. */
const TRAVEL_FIELDS = ['passport', 'nationality', 'attendant'] as const;
type FieldKey = (typeof FIELDS)[number]['key'] | (typeof TRAVEL_FIELDS)[number];

const blank = <K extends string>(keys: readonly K[]) =>
  Object.fromEntries(keys.map((key) => [key, ''])) as Record<K, string>;
const today = new Intl.DateTimeFormat(undefined, { dateStyle: 'long' });

/**
 * A treatment plan and cost estimate for one patient, to print and hand over. Patients ask
 * for it before admission, and an international patient needs it for a medical visa.
 * Nothing is saved, and it is an estimate, not a bill.
 */
export const TreatmentEstimatePage = () => {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const patientUuid = searchParams.get('patient') ?? '';
  const [fields, setFields] = useState(() =>
    blank<FieldKey>([...FIELDS.map(({ key }) => key), ...TRAVEL_FIELDS]),
  );
  const [amounts, setAmounts] = useState(() => blank(COST_HEADS));
  const [international, setInternational] = useState(false);

  const patient = useQuery({
    queryKey: ['treatment-estimate', 'patient', patientUuid],
    queryFn: () => getFormattedPatientById(patientUuid),
    enabled: patientUuid !== '',
    ...QUERY_OPTIONS,
  });
  const diagnoses = useQuery({
    queryKey: ['treatment-estimate', 'diagnoses', patientUuid],
    queryFn: () => getPatientDiagnoses(patientUuid),
    enabled: patientUuid !== '',
    ...QUERY_OPTIONS,
  });

  const problem = (message: string) => (
    <main className={styles.page}>
      <p role="alert" className={styles.warning}>
        {message}
      </p>
      <ButtonLink kind="tertiary" to="/home/records">
        {t('ESTIMATE_FIND_PATIENT')}
      </ButtonLink>
    </main>
  );
  if (patientUuid === '') {
    return problem(t('ESTIMATE_NO_PATIENT'));
  }
  if (patient.isError) {
    return problem(t('ESTIMATE_PATIENT_ERROR'));
  }
  if (patient.isPending) {
    return <InlineLoading description={t('ESTIMATE_LOADING')} />;
  }

  const age = patient.data.birthDate
    ? calculateAge(patient.data.birthDate)
    : null;
  const onRecord = [
    ...new Set((diagnoses.data ?? []).map(({ display }) => display)),
  ].slice(0, 6);
  const label = (key: FieldKey) => t(`ESTIMATE_FIELD_${key.toUpperCase()}`);
  const setField = (key: FieldKey, value: string) =>
    setFields({ ...fields, [key]: value });
  const shownKeys: FieldKey[] = [
    ...(international ? TRAVEL_FIELDS : []),
    ...FIELDS.map(({ key }) => key),
  ];

  const renderInput = (key: FieldKey, long: boolean) =>
    long ? (
      <div key={key} className={styles.wide}>
        {/* The shared TextArea puts its label under the box, so show one above. */}
        <label htmlFor={`estimate-${key}`} className={styles.fieldLabel}>
          {label(key)}
        </label>
        <TextArea
          id={`estimate-${key}`}
          labelText={label(key)}
          hideLabel
          rows={3}
          value={fields[key]}
          onChange={(event) => setField(key, event.target.value)}
        />
        {key === 'diagnosis' && onRecord.length > 0 && (
          <p className={styles.hint}>
            {t('PREAUTH_DIAGNOSES_ON_RECORD', { list: onRecord.join(', ') })}
          </p>
        )}
      </div>
    ) : (
      <TextInput
        key={key}
        id={`estimate-${key}`}
        labelText={label(key)}
        value={fields[key]}
        onChange={(event) => setField(key, event.target.value)}
      />
    );

  const form = (
    <>
      <Checkbox
        id="estimate-international"
        labelText={t('ESTIMATE_INTERNATIONAL')}
        checked={international}
        onChange={(_, { checked }) => setInternational(checked)}
      />
      <div className={styles.formGrid}>
        {international && TRAVEL_FIELDS.map((key) => renderInput(key, false))}
        {FIELDS.map(({ key, long }) => renderInput(key, long))}
      </div>
      <div>
        <p className={styles.fieldLabel}>{t('PREAUTH_ESTIMATE')}</p>
        <CostEstimateTable amounts={amounts} onChange={setAmounts} />
      </div>
    </>
  );

  const preview = (
    <article className={styles.worksheet} aria-labelledby="estimate-title">
      <h2 id="estimate-title">{t('ESTIMATE_TITLE')}</h2>
      <p>{today.format(new Date())}</p>

      <section>
        <h3>{t('PREAUTH_PATIENT')}</h3>
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
        <h3>{t('ESTIMATE_PLAN')}</h3>
        <dl className={styles.facts}>
          {shownKeys.map((key) => (
            <div key={key} className={styles.printRow}>
              <dt>{label(key)}</dt>
              <dd>{fields[key]}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section>
        <h3>{t('PREAUTH_ESTIMATE')}</h3>
        <CostEstimateTable amounts={amounts} />
      </section>

      <p className={styles.footnote}>{t('ESTIMATE_FOOTNOTE')}</p>
      <p className={styles.signatures}>
        <span>{t('PREAUTH_SIGN_DOCTOR')}</span>
        <span>{t('ESTIMATE_SIGN_HOSPITAL')}</span>
      </p>
    </article>
  );

  return (
    <DocumentWorkspace
      patientUuid={patientUuid}
      title={t('ESTIMATE_TITLE')}
      lead={t('ESTIMATE_LEAD')}
      status={t('ESTIMATE_NOT_SAVED')}
      form={form}
      preview={preview}
      printLabel={t('ESTIMATE_PRINT')}
      printDisabled={totalEstimate(amounts) === null}
    />
  );
};
