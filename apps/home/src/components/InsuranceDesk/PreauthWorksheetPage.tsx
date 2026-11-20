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
import { CostEstimateTable } from './CostEstimateTable';
import styles from './InsuranceDesk.module.scss';
import {
  AdmissionType,
  CHRONIC_CONDITIONS,
  ChronicCondition,
  FIELD_KEYS,
  LINES_OF_TREATMENT,
  LineOfTreatment,
  SECTIONS,
  WorksheetField,
} from './partC';
import {
  COST_HEADS,
  PREAUTH_DOCUMENTS,
  PreauthDocument,
  totalEstimate,
} from './preauthEstimate';

const QUERY_OPTIONS = { retry: false, refetchOnWindowFocus: false } as const;

type FieldKey = string;

const blank = <K extends string>(keys: readonly K[]) =>
  Object.fromEntries(keys.map((key) => [key, ''])) as Record<K, string>;
const upper = (key: string) => key.toUpperCase();
const today = new Intl.DateTimeFormat(undefined, { dateStyle: 'long' });
const DATE_KINDS = new Set(['date']);

/**
 * A worksheet for a cashless pre-authorisation request, started from the patient's record.
 * Its fields follow the IRDAI Part C request, so the desk can copy it into the payer's own
 * form or portal. It is printed; nothing is saved or sent.
 */
export const PreauthWorksheetPage = () => {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const patientUuid = searchParams.get('patient') ?? '';
  const [fields, setFields] = useState(() => blank(FIELD_KEYS));
  const [admissionType, setAdmissionType] = useState<AdmissionType>('');
  const [lines, setLines] = useState<ReadonlySet<LineOfTreatment>>(
    () => new Set(),
  );
  const [chronic, setChronic] = useState<
    Partial<Record<ChronicCondition, string>>
  >({});
  const [injury, setInjury] = useState(false);
  const [roadAccident, setRoadAccident] = useState(false);
  const [maternity, setMaternity] = useState(false);
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
      <ButtonLink kind="tertiary" to="/home/records">
        {t('PREAUTH_FIND_PATIENT')}
      </ButtonLink>
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
  const kindOf = (key: FieldKey) =>
    SECTIONS.flatMap((section) => section.fields).find(
      (field) => field.key === key,
    )?.kind;
  /** A date box holds YYYY-MM-DD; the printed sheet shows it the way people write dates. */
  const printValue = (key: FieldKey) =>
    DATE_KINDS.has(kindOf(key) ?? '') && fields[key]
      ? today.format(new Date(`${fields[key]}T12:00:00`))
      : fields[key];
  const shownSections = SECTIONS.filter(
    ({ when }) =>
      !when ||
      (when === 'injury' && injury) ||
      (when === 'maternity' && maternity),
  );
  const toggleLine = (line: LineOfTreatment, checked: boolean) => {
    const next = new Set(lines);
    if (checked) next.add(line);
    else next.delete(line);
    setLines(next);
  };
  const toggleChronic = (condition: ChronicCondition, checked: boolean) => {
    const next = { ...chronic };
    if (checked) next[condition] = next[condition] ?? '';
    else delete next[condition];
    setChronic(next);
  };
  const chronicDeclared = CHRONIC_CONDITIONS.filter(
    (condition) => chronic[condition] !== undefined,
  );
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

  const renderField = ({ key, kind }: WorksheetField) => {
    const props = {
      id: `preauth-${key}`,
      labelText: t(`PREAUTH_FIELD_${upper(key)}`),
      value: fields[key],
    };
    if (kind === 'long') {
      return (
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
      );
    }
    return (
      <TextInput
        key={key}
        {...props}
        type={kind === 'number' ? 'text' : kind}
        inputMode={kind === 'number' ? 'numeric' : undefined}
        onChange={(event) => setField(key, event.target.value)}
      />
    );
  };

  const form = (
    <>
      {shownSections.map((section) => (
        <fieldset key={section.key} className={styles.formSection}>
          <legend>{t(`PREAUTH_SECTION_${upper(section.key)}`)}</legend>
          {section.key === 'admission' && (
            <div
              className={styles.choiceRow}
              role="radiogroup"
              aria-label={t('PREAUTH_ADMISSION_TYPE')}
            >
              {(['emergency', 'planned'] as const).map((type) => (
                <label key={type} className={styles.choice}>
                  <input
                    type="radio"
                    name="preauth-admission-type"
                    checked={admissionType === type}
                    onChange={() => setAdmissionType(type)}
                  />
                  {t(`PREAUTH_ADMISSION_${upper(type)}`)}
                </label>
              ))}
            </div>
          )}
          <div className={styles.formGrid}>
            {section.fields.map(renderField)}
          </div>
          {section.key === 'clinical' && (
            <div className={styles.checkGroup}>
              <p className={styles.fieldLabel}>
                {t('PREAUTH_LINE_OF_TREATMENT')}
              </p>
              {LINES_OF_TREATMENT.map((line) => (
                <Checkbox
                  key={line}
                  id={`preauth-line-${line}`}
                  labelText={t(`PREAUTH_LINE_${upper(line)}`)}
                  checked={lines.has(line)}
                  onChange={(_, { checked }) => toggleLine(line, checked)}
                />
              ))}
            </div>
          )}
          {section.key === 'injury' && (
            <Checkbox
              id="preauth-road-accident"
              labelText={t('PREAUTH_ROAD_ACCIDENT')}
              checked={roadAccident}
              onChange={(_, { checked }) => setRoadAccident(checked)}
            />
          )}
        </fieldset>
      ))}

      <fieldset className={styles.formSection}>
        <legend>{t('PREAUTH_SECTION_KIND')}</legend>
        <Checkbox
          id="preauth-injury"
          labelText={t('PREAUTH_IS_INJURY')}
          checked={injury}
          onChange={(_, { checked }) => setInjury(checked)}
        />
        <Checkbox
          id="preauth-maternity"
          labelText={t('PREAUTH_IS_MATERNITY')}
          checked={maternity}
          onChange={(_, { checked }) => setMaternity(checked)}
        />
      </fieldset>

      <fieldset className={styles.formSection}>
        <legend>{t('PREAUTH_SECTION_HISTORY')}</legend>
        <p className={styles.hint}>{t('PREAUTH_HISTORY_HINT')}</p>
        {CHRONIC_CONDITIONS.map((condition) => (
          <div key={condition} className={styles.historyRow}>
            <Checkbox
              id={`preauth-chronic-${condition}`}
              labelText={t(`PREAUTH_CHRONIC_${upper(condition)}`)}
              checked={chronic[condition] !== undefined}
              onChange={(_, { checked }) => toggleChronic(condition, checked)}
            />
            {chronic[condition] !== undefined && (
              <TextInput
                id={`preauth-chronic-${condition}-since`}
                labelText={t('PREAUTH_CHRONIC_SINCE', {
                  condition: t(`PREAUTH_CHRONIC_${upper(condition)}`),
                })}
                placeholder={t('PREAUTH_CHRONIC_SINCE_PLACEHOLDER')}
                size="sm"
                value={chronic[condition]}
                onChange={(event) =>
                  setChronic({ ...chronic, [condition]: event.target.value })
                }
              />
            )}
          </div>
        ))}
      </fieldset>

      <div>
        <p className={styles.fieldLabel}>{t('PREAUTH_ESTIMATE')}</p>
        <CostEstimateTable amounts={amounts} onChange={setAmounts} />
      </div>
      <fieldset className={styles.checkGroup}>
        <legend className={styles.fieldLabel}>{t('PREAUTH_DOCUMENTS')}</legend>
        {PREAUTH_DOCUMENTS.map((document) => (
          <Checkbox
            key={document}
            id={`preauth-document-${document}`}
            labelText={t(`PREAUTH_DOCUMENT_${upper(document)}`)}
            checked={documents.has(document)}
            onChange={(_, { checked }) => toggleDocument(document, checked)}
          />
        ))}
      </fieldset>
    </>
  );

  const preview = (
    <article className={styles.worksheet} aria-labelledby="preauth-title">
      <h2 id="preauth-title">{t('PREAUTH_TITLE')}</h2>
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

      {shownSections.map((section) => (
        <section key={section.key}>
          <h3>{t(`PREAUTH_SECTION_${upper(section.key)}`)}</h3>
          <dl className={styles.facts}>
            {section.key === 'admission' && (
              <div className={styles.printRow}>
                <dt>{t('PREAUTH_ADMISSION_TYPE')}</dt>
                <dd>
                  {admissionType
                    ? t(`PREAUTH_ADMISSION_${upper(admissionType)}`)
                    : ''}
                </dd>
              </div>
            )}
            {section.fields.map(({ key }) => (
              <div key={key} className={styles.printRow}>
                <dt>{t(`PREAUTH_FIELD_${upper(key)}`)}</dt>
                <dd>{printValue(key)}</dd>
              </div>
            ))}
            {section.key === 'clinical' && (
              <div className={styles.printRow}>
                <dt>{t('PREAUTH_LINE_OF_TREATMENT')}</dt>
                <dd>
                  {LINES_OF_TREATMENT.filter((line) => lines.has(line))
                    .map((line) => t(`PREAUTH_LINE_${upper(line)}`))
                    .join(', ')}
                </dd>
              </div>
            )}
            {section.key === 'injury' && (
              <div className={styles.printRow}>
                <dt>{t('PREAUTH_ROAD_ACCIDENT')}</dt>
                <dd>{roadAccident ? t('PREAUTH_YES') : t('PREAUTH_NO')}</dd>
              </div>
            )}
          </dl>
        </section>
      ))}

      <section>
        <h3>{t('PREAUTH_SECTION_HISTORY')}</h3>
        {chronicDeclared.length === 0 ? (
          <p>{t('PREAUTH_HISTORY_NONE')}</p>
        ) : (
          <dl className={styles.facts}>
            {chronicDeclared.map((condition) => (
              <div key={condition} className={styles.printRow}>
                <dt>{t(`PREAUTH_CHRONIC_${upper(condition)}`)}</dt>
                <dd>
                  {chronic[condition]
                    ? t('PREAUTH_CHRONIC_SINCE_VALUE', {
                        since: chronic[condition],
                      })
                    : ''}
                </dd>
              </div>
            ))}
          </dl>
        )}
      </section>

      <section>
        <h3>{t('PREAUTH_ESTIMATE')}</h3>
        <CostEstimateTable amounts={amounts} />
      </section>

      <section>
        <h3>{t('PREAUTH_DOCUMENTS')}</h3>
        <ul className={styles.checklist}>
          {PREAUTH_DOCUMENTS.map((document) => (
            <li key={document}>
              {documents.has(document) ? '[x]' : '[  ]'}{' '}
              {t(`PREAUTH_DOCUMENT_${upper(document)}`)}
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
  );

  return (
    <DocumentWorkspace
      patientUuid={patientUuid}
      title={t('PREAUTH_TITLE')}
      lead={t('PREAUTH_LEAD')}
      status={t('PREAUTH_NOT_SENT')}
      form={form}
      preview={preview}
      printLabel={t('PREAUTH_PRINT')}
      printDisabled={total === null}
    />
  );
};
