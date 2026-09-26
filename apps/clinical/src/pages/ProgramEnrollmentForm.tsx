import {
  AttributeFormat,
  createProgramEnrollment,
  get,
  getAllPrograms,
  getInputTypeForFormat,
  getPatientPrograms,
  getProgramAttributeTypes,
  type ProgramAttributeDefinition,
  useTranslation,
} from '@bahmni/services';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import styles from './BedManagement.module.scss';

export interface ProgramConfig {
  config?: {
    program?: Record<string, { required?: boolean; excludeFrom?: string[] }>;
  };
}

export const localToday = () => {
  const now = new Date();
  return [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
  ].join('-');
};
export const supportedProgramAttributeFormats = new Set<string>(
  Object.values(AttributeFormat),
);

export const ProgramEnrollmentForm = ({
  patientUuid,
  activeProgramUuids,
}: {
  patientUuid: string;
  activeProgramUuids: string[];
}) => {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const today = localToday();
  const [programUuid, setProgramUuid] = useState('');
  const [stateUuid, setStateUuid] = useState('');
  const [date, setDate] = useState(today);
  const [values, setValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const programs = useQuery({
    queryKey: ['program-catalog'],
    queryFn: getAllPrograms,
  });
  const attributes = useQuery({
    queryKey: ['program-attribute-types'],
    queryFn: getProgramAttributeTypes,
  });
  const config = useQuery({
    queryKey: ['clinical-program-config'],
    queryFn: () =>
      get<ProgramConfig>('/bahmni_config/openmrs/apps/clinical/app.json'),
  });
  const program = programs.data?.find((item) => item.uuid === programUuid);
  const states =
    program?.allWorkflows
      ?.find((workflow) => !workflow.retired)
      ?.states.filter((state) => !state.retired) ?? [];
  const visibleAttributes = (attributes.data ?? []).filter(
    (attribute) =>
      !config.data?.config?.program?.[attribute.name]?.excludeFrom?.includes(
        program?.name ?? '',
      ),
  );
  const unsupported = visibleAttributes.some(
    (attribute) =>
      !supportedProgramAttributeFormats.has(attribute.datatypeClassname),
  );

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!program || saving || unsupported || !date || date > today) return;
    setSaving(true);
    setMessage('');
    try {
      const existing = await getPatientPrograms(patientUuid);
      if (
        existing.results.some(
          (item) =>
            !item.voided &&
            !item.dateCompleted &&
            item.program.uuid === program.uuid,
        )
      ) {
        setMessage(t('PROGRAMS_ALREADY_ENROLLED'));
        return;
      }
      const dateEnrolled = new Date(`${date}T00:00:00`).toISOString();
      await createProgramEnrollment({
        patient: patientUuid,
        program: program.uuid,
        dateEnrolled,
        ...(stateUuid && {
          states: [{ state: stateUuid, startDate: dateEnrolled }],
        }),
        attributes: visibleAttributes.flatMap((attribute) => {
          const value = values[attribute.uuid];
          if (value === undefined || value === '') return [];
          const concept =
            attribute.datatypeClassname === AttributeFormat.CONCEPT;
          const answer = attribute.concept?.answers?.find(
            (item) => item.uuid === value,
          );
          return [
            {
              attributeType: { uuid: attribute.uuid },
              value: concept
                ? (answer?.name?.display ?? answer?.display ?? '')
                : value,
              ...(concept && { hydratedObject: value }),
            },
          ];
        }),
      });
      await Promise.allSettled([
        queryClient.invalidateQueries({
          queryKey: ['program-enrollments', patientUuid],
        }),
      ]);
      setProgramUuid('');
      setStateUuid('');
      setValues({});
      setDate(today);
      setMessage(t('PROGRAMS_ENROLLED_SUCCESS'));
    } catch {
      setMessage(t('PROGRAMS_ENROLL_ERROR'));
    } finally {
      setSaving(false);
    }
  };

  if (programs.isLoading || attributes.isLoading || config.isLoading) {
    return <p role="status">{t('PROGRAMS_LOADING')}</p>;
  }
  if (programs.isError || attributes.isError || config.isError) {
    return <p role="alert">{t('PROGRAMS_ENROLL_CONFIG_ERROR')}</p>;
  }

  return (
    <form className={styles.programEnrollmentForm} onSubmit={save}>
      <label htmlFor="program-enroll-program">{t('PROGRAMS_NAME')}</label>
      <select
        id="program-enroll-program"
        required
        value={programUuid}
        onChange={(event) => {
          setProgramUuid(event.target.value);
          setStateUuid('');
          setValues({});
        }}
      >
        <option value="">{t('PROGRAMS_CHOOSE_PROGRAM')}</option>
        {programs.data
          ?.filter((item) => !item.retired)
          .map((item) => (
            <option
              key={item.uuid}
              value={item.uuid}
              disabled={activeProgramUuids.includes(item.uuid)}
            >
              {item.name}
            </option>
          ))}
      </select>
      <label htmlFor="program-enroll-date">{t('PROGRAMS_ENROLLED')}</label>
      <input
        id="program-enroll-date"
        type="date"
        required
        max={today}
        value={date}
        onChange={(event) => setDate(event.target.value)}
      />
      {states.length > 0 && (
        <>
          <label htmlFor="program-enroll-state">{t('PROGRAMS_STATE')}</label>
          <select
            id="program-enroll-state"
            value={stateUuid}
            onChange={(event) => setStateUuid(event.target.value)}
          >
            <option value="">{t('PROGRAMS_CHOOSE_STATE')}</option>
            {states.map((state) => (
              <option key={state.uuid} value={state.uuid}>
                {state.concept.display}
              </option>
            ))}
          </select>
        </>
      )}
      {program &&
        visibleAttributes.map((attribute) => (
          <ProgramAttributeField
            key={attribute.uuid}
            attribute={attribute}
            required={
              !!config.data?.config?.program?.[attribute.name]?.required
            }
            value={values[attribute.uuid] ?? ''}
            onChange={(value) =>
              setValues((current) => ({ ...current, [attribute.uuid]: value }))
            }
          />
        ))}
      {program && unsupported && (
        <p role="alert">{t('PROGRAMS_UNSUPPORTED_ATTRIBUTE')}</p>
      )}
      <button type="submit" disabled={!program || saving || unsupported}>
        {saving ? t('PROGRAMS_SAVING') : t('PROGRAMS_ENROLL')}
      </button>
      {message && <p role="status">{message}</p>}
    </form>
  );
};

export const ProgramAttributeField = ({
  attribute,
  idPrefix = 'program-attribute',
  required,
  value,
  onChange,
}: {
  attribute: ProgramAttributeDefinition;
  idPrefix?: string;
  required: boolean;
  value: string;
  onChange: (value: string) => void;
}) => {
  const id = `${idPrefix}-${attribute.uuid}`;
  const type = getInputTypeForFormat(attribute.datatypeClassname);
  return (
    <>
      <label htmlFor={id}>{attribute.description ?? attribute.name}</label>
      {type === 'dropdown' ? (
        <select
          id={id}
          required={required}
          value={value}
          onChange={(event) => onChange(event.target.value)}
        >
          <option value="" />
          {attribute.concept?.answers?.map((answer) => (
            <option key={answer.uuid} value={answer.uuid}>
              {answer.name?.display ?? answer.display}
            </option>
          ))}
        </select>
      ) : (
        <input
          id={id}
          type={type === 'checkbox' ? 'checkbox' : type}
          required={required}
          value={type === 'checkbox' ? undefined : value}
          checked={type === 'checkbox' ? value === 'true' : undefined}
          step={
            attribute.datatypeClassname === AttributeFormat.FLOAT
              ? 'any'
              : undefined
          }
          pattern={attribute.datatypeConfig}
          onChange={(event) =>
            onChange(
              type === 'checkbox'
                ? String(event.target.checked)
                : event.target.value,
            )
          }
        />
      )}
    </>
  );
};
