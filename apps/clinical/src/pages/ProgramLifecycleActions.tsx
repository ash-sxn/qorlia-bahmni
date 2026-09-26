import {
  completeProgramEnrollment,
  get,
  getAllPrograms,
  voidProgramEnrollment,
  type ProgramEnrollment,
  useTranslation,
} from '@bahmni/services';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import styles from './BedManagement.module.scss';

export const ProgramLifecycleActions = ({
  enrollment,
  patientUuid,
  canEdit,
  canDelete,
}: {
  enrollment: ProgramEnrollment;
  patientUuid: string;
  canEdit: boolean;
  canDelete: boolean;
}) => {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [outcomeUuid, setOutcomeUuid] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const isActive = !enrollment.dateCompleted;
  const programs = useQuery({
    queryKey: ['program-catalog'],
    queryFn: getAllPrograms,
    enabled: canEdit && isActive,
  });
  const config = useQuery({
    queryKey: ['clinical-program-config'],
    queryFn: () =>
      get<{ config?: { disableProgramOutcomeEditOption?: boolean } }>(
        '/bahmni_config/openmrs/apps/clinical/app.json',
      ),
    enabled: canEdit && isActive,
  });
  const outcomes =
    programs.data
      ?.find((program) => program.uuid === enrollment.program.uuid)
      ?.outcomesConcept?.setMembers?.filter((outcome) => !outcome.retired) ??
    [];

  const refresh = async () => {
    await Promise.allSettled([
      queryClient.invalidateQueries({
        queryKey: ['program-enrollments', patientUuid],
      }),
      queryClient.invalidateQueries({
        queryKey: ['programs', enrollment.uuid],
      }),
    ]);
  };

  const complete = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (
      !canEdit ||
      !isActive ||
      !outcomes.some((item) => item.uuid === outcomeUuid) ||
      saving
    )
      return;
    setSaving(true);
    setMessage('');
    try {
      await completeProgramEnrollment(
        enrollment.uuid,
        new Date().toISOString(),
        outcomeUuid,
      );
      await refresh();
      setOutcomeUuid('');
      setMessage(t('PROGRAMS_COMPLETE_SUCCESS'));
    } catch {
      setMessage(t('PROGRAMS_COMPLETE_ERROR'));
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (
      !canDelete ||
      saving ||
      !window.confirm(
        t('PROGRAMS_REMOVE_CONFIRM').replace(
          '{program}',
          enrollment.program.name,
        ),
      )
    ) {
      return;
    }
    setSaving(true);
    setMessage('');
    try {
      await voidProgramEnrollment(enrollment.uuid);
      await refresh();
      setMessage(t('PROGRAMS_REMOVE_SUCCESS'));
    } catch {
      setMessage(t('PROGRAMS_REMOVE_ERROR'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={styles.programLifecycle}>
      {canEdit &&
        isActive &&
        (programs.isLoading || config.isLoading ? (
          <p role="status">{t('PROGRAMS_LOADING')}</p>
        ) : programs.isError || config.isError ? (
          <p role="alert">{t('PROGRAMS_OUTCOMES_ERROR')}</p>
        ) : !config.data?.config?.disableProgramOutcomeEditOption &&
          outcomes.length > 0 ? (
          <form onSubmit={complete}>
            <label htmlFor={`program-outcome-${enrollment.uuid}`}>
              {t('PROGRAMS_OUTCOME')}
            </label>
            <select
              id={`program-outcome-${enrollment.uuid}`}
              value={outcomeUuid}
              onChange={(event) => setOutcomeUuid(event.target.value)}
              disabled={saving}
              required
            >
              <option value="">{t('PROGRAMS_CHOOSE_OUTCOME')}</option>
              {outcomes.map((outcome) => (
                <option key={outcome.uuid} value={outcome.uuid}>
                  {outcome.display}
                </option>
              ))}
            </select>
            <button type="submit" disabled={!outcomeUuid || saving}>
              {saving ? t('PROGRAMS_SAVING') : t('PROGRAMS_COMPLETE')}
            </button>
          </form>
        ) : null)}
      {canDelete && (
        <button type="button" onClick={remove} disabled={saving}>
          {t('PROGRAMS_REMOVE')}
        </button>
      )}
      {message && <p role="status">{message}</p>}
    </div>
  );
};
