import {
  AttributeFormat,
  get,
  getProgramAttributeTypes,
  type ProgramAttributeDefinition,
  type ProgramEnrollment,
  updateProgramEnrollmentDetails,
  useTranslation,
} from '@bahmni/services';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import styles from './BedManagement.module.scss';
import {
  localToday,
  ProgramAttributeField,
  type ProgramConfig,
  supportedProgramAttributeFormats,
} from './ProgramEnrollmentForm';

export const ProgramEnrollmentEditForm = ({
  enrollment,
  patientUuid,
}: {
  enrollment: ProgramEnrollment;
  patientUuid: string;
}) => {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [date, setDate] = useState(enrollment.dateEnrolled.slice(0, 10));
  const [values, setValues] = useState<Record<string, string>>({});
  const [message, setMessage] = useState('');
  const attributes = useQuery({
    queryKey: ['program-attribute-types'],
    queryFn: getProgramAttributeTypes,
  });
  const config = useQuery({
    queryKey: ['clinical-program-config'],
    queryFn: () =>
      get<ProgramConfig>('/bahmni_config/openmrs/apps/clinical/app.json'),
  });
  const visibleAttributes = (attributes.data ?? []).filter(
    (attribute) =>
      !config.data?.config?.program?.[attribute.name]?.excludeFrom?.includes(
        enrollment.program.name,
      ),
  );
  const existingValue = (definition: ProgramAttributeDefinition) => {
    const value = (enrollment.attributes ?? []).find(
      (attribute) =>
        !attribute.voided && attribute.attributeType.uuid === definition.uuid,
    )?.value;
    if (!value) return '';
    if (typeof value !== 'string') return value.uuid;
    if (definition.datatypeClassname === AttributeFormat.CONCEPT) {
      return (
        definition.concept?.answers?.find(
          (answer) =>
            answer.display === value || answer.name?.display === value,
        )?.uuid ?? ''
      );
    }
    return definition.datatypeClassname === AttributeFormat.ATTRIBUTABLE_DATE ||
      definition.datatypeClassname === AttributeFormat.DATE_DATATYPE
      ? value.slice(0, 10)
      : value;
  };
  const unsupported = visibleAttributes.some(
    (attribute) =>
      !supportedProgramAttributeFormats.has(attribute.datatypeClassname) ||
      (attribute.datatypeClassname === AttributeFormat.CONCEPT &&
        (enrollment.attributes ?? []).some(
          (existing) =>
            !existing.voided &&
            existing.attributeType.uuid === attribute.uuid &&
            !!existing.value &&
            !attribute.concept?.answers?.some(
              (answer) => answer.uuid === existingValue(attribute),
            ),
        )),
  );
  const maxDate = [
    localToday(),
    ...(enrollment.states ?? [])
      .filter((state) => !state.voided)
      .map((state) => state.startDate.slice(0, 10)),
  ].sort()[0];

  const open = () => {
    setValues(
      Object.fromEntries(
        visibleAttributes.map((attribute) => [
          attribute.uuid,
          existingValue(attribute),
        ]),
      ),
    );
    setDate(enrollment.dateEnrolled.slice(0, 10));
    setMessage('');
    setEditing(true);
  };
  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (saving || unsupported || !date || date > maxDate) return;
    setSaving(true);
    setMessage('');
    try {
      await updateProgramEnrollmentDetails(
        enrollment.uuid,
        date,
        visibleAttributes,
        values,
      );
      await Promise.allSettled([
        queryClient.invalidateQueries({
          queryKey: ['program-enrollments', patientUuid],
        }),
        queryClient.invalidateQueries({
          queryKey: ['programs', enrollment.uuid],
        }),
      ]);
      setEditing(false);
      setMessage(t('PROGRAMS_EDIT_SUCCESS'));
    } catch {
      setMessage(t('PROGRAMS_EDIT_ERROR'));
    } finally {
      setSaving(false);
    }
  };

  if (attributes.isLoading || config.isLoading) {
    return <p role="status">{t('PROGRAMS_LOADING')}</p>;
  }
  if (attributes.isError || config.isError) {
    return <p role="alert">{t('PROGRAMS_ENROLL_CONFIG_ERROR')}</p>;
  }
  return (
    <div className={styles.programEdit}>
      {!editing ? (
        <button type="button" onClick={open} disabled={unsupported}>
          {t('PROGRAMS_EDIT')}
        </button>
      ) : (
        <form className={styles.programEnrollmentForm} onSubmit={save}>
          <label htmlFor={`program-edit-date-${enrollment.uuid}`}>
            {t('PROGRAMS_ENROLLED')}
          </label>
          <input
            id={`program-edit-date-${enrollment.uuid}`}
            type="date"
            required
            max={maxDate}
            value={date}
            onChange={(event) => setDate(event.target.value)}
          />
          {visibleAttributes.map((attribute) => (
            <ProgramAttributeField
              key={attribute.uuid}
              idPrefix={`program-edit-${enrollment.uuid}`}
              attribute={attribute}
              required={
                !!config.data?.config?.program?.[attribute.name]?.required
              }
              value={values[attribute.uuid] ?? ''}
              onChange={(value) =>
                setValues((current) => ({
                  ...current,
                  [attribute.uuid]: value,
                }))
              }
            />
          ))}
          <button type="submit" disabled={saving}>
            {saving ? t('PROGRAMS_SAVING') : t('PROGRAMS_SAVE_CHANGES')}
          </button>
          <button
            type="button"
            onClick={() => setEditing(false)}
            disabled={saving}
          >
            {t('PROGRAMS_CANCEL')}
          </button>
        </form>
      )}
      {unsupported && <p role="alert">{t('PROGRAMS_UNSUPPORTED_ATTRIBUTE')}</p>}
      {message && <p role="status">{message}</p>}
    </div>
  );
};
