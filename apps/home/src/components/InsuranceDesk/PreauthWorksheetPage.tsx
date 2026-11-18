import {
  Button,
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
import { Link, useSearchParams } from 'react-router-dom';
import { CostEstimateTable } from './CostEstimateTable';
import styles from './InsuranceDesk.module.scss';
import {
  COST_HEADS,
  PREAUTH_DOCUMENTS,
  PreauthDocument,
  totalEstimate,
} from './preauthEstimate';

const QUERY_OPTIONS = { retry: false, refetchOnWindowFocus: false } as const;

/** The typed fields, in the order they appear. `long` ones get a multi-line box. */
const FIELDS = [
  { key: 'payer', long: false },
  { key: 'policy_number', long: false },
  { key: 'insured_name', long: false },
  { key: 'treating_doctor', long: false },
  { key: 'complaints', long: true },
  { key: 'diagnosis', long: true },
  { key: 'treatment', long: true },
  { key: 'admission_date', long: false },
  { key: 'expected_days', long: false },
  { key: 'room_type', long: false },
] as const;
type FieldKey = (typeof FIELDS)[number]['key'];

const blank = <K extends string>(keys: readonly K[]) =>
  Object.fromEntries(keys.map((key) => [key, ''])) as Record<K, string>;
const upper = (key: string) => key.toUpperCase();
const today = new Intl.DateTimeFormat(undefined, { dateStyle: 'long' });

/**
 * A worksheet for a cashless pre-authorisation request, started from the patient's record.
 * It is printed and attached to the payer's own form or portal. Nothing is saved or sent.
 */
export const PreauthWorksheetPage = () => {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const patientUuid = searchParams.get('patient') ?? '';
  const [fields, setFields] = useState(() =>
    blank(FIELDS.map(({ key }) => key)),
  );
  const [amounts, setAmounts] = useState(() => blank(COST_HEADS));
  const [documents, setDocuments] = useState<ReadonlySet<PreauthDocument>>(
    () => new Set(),
  );

  const patient = useQuery({
    queryKey: ['preauth', 'patient', patientUuid],
    queryFn: () => getFormattedPatientById(patientUuid),
    enabled: patientUuid !== '',
    ...QUERY_OPTIONS,
  });
  const diagnoses = useQuery({
    queryKey: ['preauth', 'diagnoses', patientUuid],
    queryFn: () => getPatientDiagnoses(patientUuid),
    enabled: patientUuid !== '',
    ...QUERY_OPTIONS,
  });

  const problem = (message: string) => (
    <main className={styles.page}>
      <p role="alert" className={styles.warning}>
        {message}
      </p>
      <Link to="/home/records">{t('PREAUTH_FIND_PATIENT')}</Link>
    </main>
  );
  if (patientUuid === '') {
    return problem(t('PREAUTH_NO_PATIENT'));
  }
  if (patient.isError) {
    return problem(t('PREAUTH_PATIENT_ERROR'));
  }
  if (patient.isPending) {
    return <InlineLoading description={t('PREAUTH_LOADING')} />;
  }

  const age = patient.data.birthDate
    ? calculateAge(patient.data.birthDate)
    : null;
  const total = totalEstimate(amounts);
  const onRecord = [
    ...new Set((diagnoses.data ?? []).map(({ display }) => display)),
  ].slice(0, 6);
  /** The date box holds YYYY-MM-DD; the printed sheet shows it the way people write dates. */
  const printValue = (key: FieldKey) =>
    key === 'admission_date' && fields[key]
      ? today.format(new Date(`${fields[key]}T12:00:00`))
      : fields[key];
  const setField = (key: FieldKey, value: string) =>
    setFields({ ...fields, [key]: value });
  const toggleDocument = (document: PreauthDocument, checked: boolean) => {
    const next = new Set(documents);
    if (checked) {
      next.add(document);
    } else {
      next.delete(document);
    }
    setDocuments(next);
  };

  return (
    <main className={styles.page}>
      <div className={styles.screenOnly}>
        <Link to={`/home/records/${encodeURIComponent(patientUuid)}`}>
          {t('PREAUTH_BACK')}
        </Link>
        <p className={styles.notice}>{t('PREAUTH_NOT_SENT')}</p>
      </div>

      <article className={styles.worksheet} aria-labelledby="preauth-title">
        <h1 id="preauth-title">{t('PREAUTH_TITLE')}</h1>
        <p>{today.format(new Date())}</p>

        <section>
          <h2>{t('PREAUTH_PATIENT')}</h2>
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
          <h2>{t('PREAUTH_DETAILS')}</h2>
          <div className={`${styles.formGrid} ${styles.screenOnly}`}>
            {FIELDS.map(({ key, long }) => {
              const props = {
                id: `preauth-${key}`,
                labelText: t(`PREAUTH_FIELD_${upper(key)}`),
                value: fields[key],
              };
              return long ? (
                <div key={key} className={styles.wide}>
                  {/* The shared TextArea puts its label under the box, so show one above. */}
                  <label htmlFor={props.id} className={styles.fieldLabel}>
                    {props.labelText}
                  </label>
                  <TextArea
                    {...props}
                    hideLabel
                    rows={3}
                    onChange={(event) => setField(key, event.target.value)}
                  />
                  {key === 'diagnosis' && onRecord.length > 0 && (
                    <p className={styles.hint}>
                      {t('PREAUTH_DIAGNOSES_ON_RECORD', {
                        list: onRecord.join(', '),
                      })}
                    </p>
                  )}
                </div>
              ) : (
                <TextInput
                  key={key}
                  {...props}
                  type={key === 'admission_date' ? 'date' : 'text'}
                  onChange={(event) => setField(key, event.target.value)}
                />
              );
            })}
          </div>
          <dl className={`${styles.facts} ${styles.printOnly}`}>
            {FIELDS.map(({ key }) => (
              <div key={key} className={styles.printRow}>
                <dt>{t(`PREAUTH_FIELD_${upper(key)}`)}</dt>
                <dd>{printValue(key)}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section>
          <h2>{t('PREAUTH_ESTIMATE')}</h2>
          <CostEstimateTable amounts={amounts} onChange={setAmounts} />
        </section>

        <section>
          <h2>{t('PREAUTH_DOCUMENTS')}</h2>
          <ul className={styles.checklist}>
            {PREAUTH_DOCUMENTS.map((document) => (
              <li key={document}>
                <span className={styles.screenOnly}>
                  <Checkbox
                    id={`preauth-document-${document}`}
                    labelText={t(`PREAUTH_DOCUMENT_${upper(document)}`)}
                    checked={documents.has(document)}
                    onChange={(_, { checked }) =>
                      toggleDocument(document, checked)
                    }
                  />
                </span>
                <span className={styles.printOnly}>
                  {documents.has(document) ? '[x]' : '[  ]'}{' '}
                  {t(`PREAUTH_DOCUMENT_${upper(document)}`)}
                </span>
              </li>
            ))}
          </ul>
        </section>

        <p className={styles.signatures}>
          <span>{t('PREAUTH_SIGN_DOCTOR')}</span>
          <span>{t('PREAUTH_SIGN_PATIENT')}</span>
        </p>
        <p className={styles.footnote}>{t('PREAUTH_FOOTNOTE')}</p>
      </article>

      <div className={styles.screenOnly}>
        <Button disabled={total === null} onClick={() => window.print()}>
          {t('PREAUTH_PRINT')}
        </Button>
      </div>
    </main>
  );
};
