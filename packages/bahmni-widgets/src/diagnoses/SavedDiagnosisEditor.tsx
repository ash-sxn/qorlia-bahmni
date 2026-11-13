import { TextArea } from '@bahmni/design-system';
import {
  getSavedDiagnosis,
  updateSavedDiagnosis,
  removeSavedDiagnosis,
  dispatchConsultationSaved,
  useTranslation,
  type SavedDiagnosis,
} from '@bahmni/services';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import ConfirmationModal from '../confirmationModal/ConfirmationModal';
import styles from './styles/DiagnosesTable.module.scss';

interface Props {
  patientUUID: string;
  diagnosisUUID: string;
  display: string;
  mode: 'edit' | 'remove';
  eligible: boolean;
  launcher: HTMLElement;
  onClose: () => void;
}

// Mount per patient/diagnosis/action. Never prefill editable fields from FHIR:
// the installed translator omits rank and cannot safely update it.
export default function SavedDiagnosisEditor(props: Props) {
  const { t } = useTranslation();
  const query = useQuery({
    queryKey: ['savedDiagnosis', props.patientUUID, props.diagnosisUUID],
    queryFn: () => getSavedDiagnosis(props.patientUUID, props.diagnosisUUID),
    enabled: props.eligible,
    retry: false,
    refetchOnWindowFocus: false,
    gcTime: 0,
  });
  if (query.data && !query.isFetching) {
    return <DiagnosisActionForm {...props} record={query.data} />;
  }
  return (
    <ConfirmationModal
      open
      launcher={props.launcher}
      heading={t(props.mode === 'edit' ? 'DIAGNOSIS_EDIT' : 'DIAGNOSIS_REMOVE')}
      body={
        <div>
          <p>{props.display}</p>
          <p role={query.isError ? 'alert' : 'status'}>
            {!props.eligible
              ? t('DIAGNOSIS_ACTION_UNAVAILABLE')
              : query.isError
                ? t('DIAGNOSIS_LOAD_ERROR')
                : t('DIAGNOSIS_LOADING')}
          </p>
        </div>
      }
      confirmLabel={t('DIAGNOSIS_SAVE')}
      cancelLabel={t('DIAGNOSIS_CANCEL')}
      isConfirmDisabled
      onConfirm={() => {}}
      onCancel={props.onClose}
    />
  );
}

function DiagnosisActionForm({
  record,
  ...props
}: Props & { record: SavedDiagnosis }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [certainty, setCertainty] = useState(record.certainty);
  const [rank, setRank] = useState(record.rank);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const submitting = useRef(false);
  const remove = props.mode === 'remove';
  const unavailable =
    !props.eligible || record.voided || record.encounter.voided === true;
  const valid =
    !unavailable &&
    !failed &&
    (remove
      ? !!reason.trim() && reason.trim().length <= 255
      : [1, 2].includes(rank) &&
        (certainty !== record.certainty || rank !== record.rank));

  async function submit() {
    if (!valid || submitting.current) return;
    submitting.current = true;
    setBusy(true);
    try {
      if (remove) await removeSavedDiagnosis(props.patientUUID, record, reason);
      else
        await updateSavedDiagnosis(props.patientUUID, record, {
          certainty,
          rank: rank as 1 | 2,
        });
      dispatchConsultationSaved({
        patientUUID: props.patientUUID,
        updatedResources: {
          conditions: true,
          allergies: false,
          medications: false,
          serviceRequests: {},
        },
        updatedConcepts: new Map(),
      });
      props.onClose();
    } catch {
      // An ambiguous acknowledgement is not permission to replay a clinical write.
      // Close and reopen to obtain a fresh native record before another attempt.
      setFailed(true);
    } finally {
      await queryClient.invalidateQueries({
        queryKey: ['diagnoses', props.patientUUID],
      });
      submitting.current = false;
      setBusy(false);
    }
  }

  return (
    <ConfirmationModal
      open
      launcher={props.launcher}
      heading={t(remove ? 'DIAGNOSIS_REMOVE' : 'DIAGNOSIS_EDIT')}
      confirmLabel={t(remove ? 'DIAGNOSIS_REMOVE' : 'DIAGNOSIS_SAVE')}
      cancelLabel={t('DIAGNOSIS_CANCEL')}
      danger={remove}
      isSubmitting={busy}
      isConfirmDisabled={!valid}
      onConfirm={submit}
      onCancel={() => !submitting.current && props.onClose()}
      body={
        <div className={styles.editor}>
          <p className={styles.diagnosisName}>{props.display}</p>
          {failed && <p role="alert">{t('DIAGNOSIS_SAVE_UNCONFIRMED')}</p>}
          {unavailable && (
            <p role="alert">{t('DIAGNOSIS_ACTION_UNAVAILABLE')}</p>
          )}
          {remove ? (
            <>
              <p>{t('DIAGNOSIS_REMOVE_HISTORY')}</p>
              <TextArea
                id="diagnosis-removal-reason"
                labelText={t('DIAGNOSIS_REMOVAL_REASON')}
                value={reason}
                maxLength={255}
                required
                disabled={busy || !props.eligible || failed}
                onChange={(event) => setReason(event.target.value)}
              />
            </>
          ) : (
            <fieldset disabled={busy || !props.eligible || failed}>
              <label htmlFor="diagnosis-certainty">
                {t('DIAGNOSIS_CERTAINTY')}
              </label>
              <select
                id="diagnosis-certainty"
                value={certainty}
                onChange={(event) =>
                  setCertainty(
                    event.target.value as SavedDiagnosis['certainty'],
                  )
                }
              >
                <option value="CONFIRMED">{t('CERTAINITY_CONFIRMED')}</option>
                <option value="PROVISIONAL">
                  {t('CERTAINITY_PROVISIONAL')}
                </option>
              </select>
              <label htmlFor="diagnosis-rank">{t('DIAGNOSIS_ORDER')}</label>
              <select
                id="diagnosis-rank"
                value={rank}
                onChange={(event) => setRank(Number(event.target.value))}
              >
                <option value="1">{t('DIAGNOSIS_PRIMARY')}</option>
                <option value="2">{t('DIAGNOSIS_SECONDARY')}</option>
                {![1, 2].includes(record.rank) && (
                  <option value={record.rank} disabled>
                    {t('DIAGNOSIS_SELECT_ORDER')}
                  </option>
                )}
              </select>
            </fieldset>
          )}
        </div>
      }
    />
  );
}
