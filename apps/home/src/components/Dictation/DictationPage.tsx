import {
  Button,
  InlineLoading,
  Tag,
  TextArea,
  TextInput,
} from '@bahmni/design-system';
import {
  AllergyStatus,
  calculateAge,
  getFormattedAllergies,
  getFormattedPatientById,
  useTranslation,
} from '@bahmni/services';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { HomePageHeader } from '../HomePageHeader';
import {
  checkAgainstDictation,
  diagnosisWasSaid,
} from './checkAgainstDictation';
import styles from './Dictation.module.scss';
import {
  allergyMatches,
  DictationDraft,
  EXAMPLE_DICTATION,
  MedicineLine,
  NOTE_SECTIONS,
  NoteSection,
  parseDictation,
} from './parseDictation';
import { SavedNote, saveNoteToRecord, SaveNoteError } from './saveNote';
import { appendSpoken } from './spokenDictation';
import { TidyWithAi } from './TidyWithAi';
import { VoiceDictation } from './VoiceDictation';

const QUERY_OPTIONS = { retry: false, refetchOnWindowFocus: false } as const;
const PATTERN_TIMES = ['MORNING', 'AFTERNOON', 'NIGHT'] as const;
const today = new Intl.DateTimeFormat(undefined, { dateStyle: 'long' });

/**
 * The doctor types the consultation in shorthand; the page drafts the note and the
 * prescription for the doctor to check, correct and print. The note is saved to the
 * patient's open visit only when the doctor presses Save.
 */
export const DictationPage = () => {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const patientUuid = searchParams.get('patient') ?? '';
  const [dictation, setDictation] = useState('');
  const [draft, setDraft] = useState<DictationDraft | null>(null);
  const [sections, setSections] = useState<Record<NoteSection, string>>();
  const [doctor, setDoctor] = useState('');
  const [saved, setSaved] = useState<SavedNote>();
  const [saving, setSaving] = useState(false);
  const [saveProblem, setSaveProblem] = useState<string>();
  /** What the doctor dictated, kept while the box holds the AI's tidied version. */
  const [said, setSaid] = useState<string>();
  /** Parts the AI said it could not understand. */
  const [unclear, setUnclear] = useState<string[]>([]);

  const patient = useQuery({
    queryKey: ['dictation', 'patient', patientUuid],
    queryFn: () => getFormattedPatientById(patientUuid),
    enabled: patientUuid !== '',
    ...QUERY_OPTIONS,
  });
  const allergies = useQuery({
    queryKey: ['dictation', 'allergies', patientUuid],
    queryFn: () => getFormattedAllergies(patientUuid),
    enabled: patientUuid !== '',
    ...QUERY_OPTIONS,
  });

  const problem = (message: string) => (
    <>
      <HomePageHeader />
      <main className={styles.page}>
        <p role="alert" className={styles.error}>
          {message}
        </p>
        <Link to="/home/records">{t('DICTATION_FIND_PATIENT')}</Link>
      </main>
    </>
  );
  if (patientUuid === '') {
    return problem(t('DICTATION_NO_PATIENT'));
  }
  if (patient.isError) {
    return problem(t('DICTATION_PATIENT_ERROR'));
  }
  if (patient.isPending) {
    return <InlineLoading description={t('DICTATION_LOADING')} />;
  }

  const age = patient.data.birthDate
    ? calculateAge(patient.data.birthDate)
    : null;
  const activeAllergies = (allergies.data ?? [])
    .filter(({ status }) => status === AllergyStatus.Active)
    .map(({ display }) => display);

  const makeDraft = (text = dictation) => {
    const next = parseDictation(text);
    setDraft(next);
    setSections(next.sections);
  };

  const applyTidied = (tidied: string) => {
    const lines = tidied.split('\n');
    const isUnclear = (line: string) => /^\s*unclear\s*:/i.test(line);
    const kept = lines
      .filter((line) => !isUnclear(line))
      .join('\n')
      .trim();
    setUnclear(
      lines
        .filter(isUnclear)
        .map((line) => line.replace(/^\s*unclear\s*:\s*/i, '').trim())
        .filter(Boolean),
    );
    setSaid(dictation);
    setDictation(kept);
    makeDraft(kept);
  };

  const undoTidy = () => {
    if (said === undefined) return;
    setDictation(said);
    setSaid(undefined);
    setUnclear([]);
    makeDraft(said);
  };

  const howOften = (medicine: MedicineLine) => {
    const parts: string[] = [];
    if (medicine.pattern) {
      const times = PATTERN_TIMES.filter(
        (_, index) => !/^0+$/.test(medicine.pattern![index]),
      ).map((time) => t(`DICTATION_TIME_${time}`));
      parts.push(`${medicine.pattern.join('-')} (${times.join(', ')})`);
    }
    if (medicine.frequency) {
      parts.push(t(`DICTATION_FREQUENCY_${medicine.frequency}`));
    }
    return parts.join(', ');
  };

  const describeMedicine = (medicine: MedicineLine) =>
    [
      [medicine.form, medicine.name, medicine.strength]
        .filter(Boolean)
        .join(' '),
      howOften(medicine),
      medicine.duration &&
        t(`DICTATION_DURATION_${medicine.duration.unit.toUpperCase()}`, {
          count: medicine.duration.count,
        }),
      medicine.timing && t(`DICTATION_TIMING_${medicine.timing.toUpperCase()}`),
    ]
      .filter(Boolean)
      .join(', ');

  /** The note as it is stored in Bahmni: plain text, one part per heading. */
  const noteText = (current: DictationDraft) => {
    const parts = NOTE_SECTIONS.filter((section) =>
      sections?.[section]?.trim(),
    ).map(
      (section) =>
        `${t(`DICTATION_SECTION_${section.toUpperCase()}`)}: ${sections![section].trim()}`,
    );
    if (current.medicines.length) {
      parts.push(
        [
          `${t('DICTATION_SECTION_MEDICINES')}:`,
          ...current.medicines.map(
            (medicine, index) => `${index + 1}. ${describeMedicine(medicine)}`,
          ),
        ].join('\n'),
      );
    }
    if (doctor.trim()) parts.push(doctor.trim());
    return parts.join('\n\n');
  };

  const save = async (text: string) => {
    setSaving(true);
    setSaveProblem(undefined);
    try {
      setSaved(await saveNoteToRecord(patientUuid, text, saved));
    } catch (error) {
      setSaveProblem(error instanceof SaveNoteError ? error.problem : 'failed');
    } finally {
      setSaving(false);
    }
  };

  const renderSave = (current: DictationDraft) => {
    const text = noteText(current);
    const upToDate = saved?.text === text;
    return (
      <div className={styles.screenOnly}>
        <div className={styles.toolbar}>
          <Button
            disabled={saving || upToDate || !text.trim()}
            onClick={() => void save(text)}
          >
            {saved ? t('DICTATION_SAVE_CHANGES') : t('DICTATION_SAVE')}
          </Button>
          <Button kind="secondary" onClick={() => window.print()}>
            {t('DICTATION_PRINT')}
          </Button>
        </div>
        {saving && <InlineLoading description={t('DICTATION_SAVING')} />}
        {saved && (
          <p role="status" className={styles.hint}>
            {upToDate
              ? t('DICTATION_SAVED', {
                  time: saved.savedAt.toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                  }),
                  visit: saved.visitType,
                })
              : t('DICTATION_CHANGED_SINCE_SAVE')}
          </p>
        )}
        {saveProblem && (
          <p role="alert" className={styles.error}>
            {t(`DICTATION_SAVE_PROBLEM_${saveProblem.toUpperCase()}`)}
          </p>
        )}
        {current.medicines.length > 0 && (
          <p className={styles.hint}>{t('DICTATION_SAVE_MEDICINES_AS_TEXT')}</p>
        )}
      </div>
    );
  };

  const renderMedicines = (medicines: MedicineLine[]) => {
    const unsupported =
      said === undefined ? [] : checkAgainstDictation(medicines, said);
    return (
      <table className={styles.medicines}>
        <thead>
          <tr>
            <th scope="col">{t('DICTATION_COLUMN_MEDICINE')}</th>
            <th scope="col">{t('DICTATION_COLUMN_HOW_OFTEN')}</th>
            <th scope="col">{t('DICTATION_COLUMN_HOW_LONG')}</th>
            <th scope="col">{t('DICTATION_COLUMN_WHEN')}</th>
          </tr>
        </thead>
        <tbody>
          {medicines.map((medicine, index) => {
            const allergic = allergyMatches(medicine, activeAllergies);
            const notSaid = unsupported[index] ?? [];
            return (
              // eslint-disable-next-line react/no-array-index-key
              <tr key={`${index}-${medicine.raw}`}>
                <th scope="row">
                  <strong>
                    {[medicine.form, medicine.name, medicine.strength]
                      .filter(Boolean)
                      .join(' ')}
                  </strong>
                  {allergic.length > 0 && (
                    <span className={styles.flag}>
                      <Tag type="red">
                        {t('DICTATION_ALLERGY_MATCH', {
                          allergy: allergic.join(', '),
                        })}
                      </Tag>
                    </span>
                  )}
                  {notSaid.length > 0 && (
                    <span className={`${styles.flag} ${styles.screenOnly}`}>
                      <Tag type="magenta">
                        {t('TIDY_NOT_SAID', {
                          parts: notSaid
                            .map((part) => t(`TIDY_PART_${part.toUpperCase()}`))
                            .join(', '),
                        })}
                      </Tag>
                    </span>
                  )}
                  {medicine.missing.length > 0 && (
                    <span className={`${styles.flag} ${styles.screenOnly}`}>
                      <Tag type="warm-gray">
                        {t('DICTATION_CHECK_LINE', {
                          missing: medicine.missing
                            .map((part) =>
                              t(`DICTATION_MISSING_${part.toUpperCase()}`),
                            )
                            .join(', '),
                        })}
                      </Tag>
                    </span>
                  )}
                  <span className={`${styles.raw} ${styles.screenOnly}`}>
                    {t('DICTATION_AS_TYPED', { line: medicine.raw })}
                  </span>
                </th>
                <td>{howOften(medicine)}</td>
                <td>
                  {medicine.duration
                    ? t(
                        `DICTATION_DURATION_${medicine.duration.unit.toUpperCase()}`,
                        {
                          count: medicine.duration.count,
                        },
                      )
                    : ''}
                </td>
                <td>
                  {medicine.timing
                    ? t(`DICTATION_TIMING_${medicine.timing.toUpperCase()}`)
                    : ''}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    );
  };

  const renderDraft = (current: DictationDraft) => (
    <article className={styles.note} aria-labelledby="dictation-note">
      <h2 id="dictation-note">{t('DICTATION_NOTE_TITLE')}</h2>
      <p>{today.format(new Date())}</p>
      <p>
        <strong>{patient.data.fullName}</strong>
        {' · '}
        {[
          patient.data.identifier,
          patient.data.gender,
          age && t('PATIENT_RECORD_AGE_YEARS', { count: age.years }),
        ]
          .filter(Boolean)
          .join(' · ')}
      </p>
      {activeAllergies.length > 0 && (
        <p className={styles.allergies}>
          {t('DICTATION_ALLERGIES', { list: activeAllergies.join(', ') })}
        </p>
      )}

      {NOTE_SECTIONS.map((section) => {
        const id = `dictation-section-${section}`;
        const text = sections?.[section] ?? '';
        return (
          <section key={section} className={styles.part}>
            <h3>
              <label htmlFor={id}>
                {t(`DICTATION_SECTION_${section.toUpperCase()}`)}
              </label>
            </h3>
            <div className={styles.screenOnly}>
              <TextArea
                id={id}
                labelText={t(`DICTATION_SECTION_${section.toUpperCase()}`)}
                hideLabel
                rows={2}
                value={text}
                onChange={(event) =>
                  setSections({
                    ...(sections as Record<NoteSection, string>),
                    [section]: event.target.value,
                  })
                }
              />
              {!text.trim() && (
                <p className={styles.hint}>{t('DICTATION_NOT_DICTATED')}</p>
              )}
              {section === 'diagnosis' &&
                said !== undefined &&
                text.trim() !== '' &&
                !diagnosisWasSaid(text, said) && (
                  <p className={styles.voiceError}>
                    {t('TIDY_DIAGNOSIS_NOT_SAID')}
                  </p>
                )}
            </div>
            <p className={styles.printOnly}>{text}</p>
          </section>
        );
      })}

      <section className={styles.part}>
        <h3>{t('DICTATION_SECTION_MEDICINES')}</h3>
        {current.medicines.length > 0 ? (
          renderMedicines(current.medicines)
        ) : (
          <p>{t('DICTATION_NO_MEDICINES')}</p>
        )}
        {current.unread.length > 0 && (
          <div role="alert" className={`${styles.error} ${styles.screenOnly}`}>
            <p>{t('DICTATION_UNREAD')}</p>
            <ul>
              {current.unread.map((line, index) => (
                // eslint-disable-next-line react/no-array-index-key
                <li key={`${index}-${line}`}>{line}</li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <section className={styles.part}>
        <div className={styles.screenOnly}>
          <TextInput
            id="dictation-doctor"
            labelText={t('DICTATION_DOCTOR_LABEL')}
            value={doctor}
            onChange={(event) => setDoctor(event.target.value)}
          />
        </div>
        <p className={styles.printOnly}>{doctor}</p>
        <p className={styles.signature}>{t('DICTATION_SIGNATURE')}</p>
      </section>
    </article>
  );

  return (
    <>
      <div className={styles.screenOnly}>
        <HomePageHeader />
      </div>
      <main className={styles.page}>
        <div className={styles.screenOnly}>
          <Link to={`/home/records/${encodeURIComponent(patientUuid)}`}>
            {t('DICTATION_BACK')}
          </Link>
          <h1>{t('DICTATION_TITLE')}</h1>
          <p className={styles.notice}>{t('DICTATION_NOT_SAVED')}</p>

          <VoiceDictation
            onText={(spoken) =>
              setDictation((current) => appendSpoken(current, spoken))
            }
          />

          <label htmlFor="dictation-text" className={styles.fieldLabel}>
            {t('DICTATION_INPUT_LABEL')}
          </label>
          <TextArea
            id="dictation-text"
            labelText={t('DICTATION_INPUT_LABEL')}
            hideLabel
            rows={10}
            value={dictation}
            onChange={(event) => setDictation(event.target.value)}
          />
          <p className={styles.hint}>{t('DICTATION_INPUT_HINT')}</p>
          <div className={styles.toolbar}>
            <Button disabled={!dictation.trim()} onClick={() => makeDraft()}>
              {draft ? t('DICTATION_REDRAFT') : t('DICTATION_MAKE_DRAFT')}
            </Button>
            <Button
              kind="ghost"
              onClick={() => setDictation(EXAMPLE_DICTATION)}
            >
              {t('DICTATION_EXAMPLE')}
            </Button>
            <TidyWithAi
              text={dictation}
              disabled={said !== undefined}
              onTidied={applyTidied}
            />
          </div>
          {said !== undefined && (
            <section className={styles.tidied} aria-label={t('TIDY_DONE')}>
              <p role="status">{t('TIDY_DONE')}</p>
              {unclear.length > 0 && (
                <div className={styles.voiceError}>
                  <p>{t('TIDY_UNCLEAR')}</p>
                  <ul>
                    {unclear.map((part) => (
                      <li key={part}>{part}</li>
                    ))}
                  </ul>
                </div>
              )}
              <details>
                <summary>{t('TIDY_WHAT_YOU_SAID')}</summary>
                <p className={styles.said}>{said}</p>
              </details>
              <Button kind="ghost" size="sm" onClick={undoTidy}>
                {t('TIDY_UNDO')}
              </Button>
            </section>
          )}
          {draft && (
            <p className={styles.hint}>{t('DICTATION_REDRAFT_HINT')}</p>
          )}
        </div>

        {draft && renderDraft(draft)}

        {draft && renderSave(draft)}
      </main>
    </>
  );
};
