import {
  getDocumentUploadMaxSizeMb,
  getAuthenticatedDocumentUrl as documentLink,
  hasPrivilege,
  uploadDocument,
} from '@bahmni/services';
import { ConfirmationModal, useUserPrivilege } from '@bahmni/widgets';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useState, type FormEvent } from 'react';
import styles from './BedManagement.module.scss';
import {
  makeFulfillmentObservation,
  observationsForOrder,
  saveFulfillment,
  supportsFulfillmentForm,
  type FulfillmentConcept,
  type FulfillmentEncounter,
  type FulfillmentOrder,
  type OrderObservation,
} from './ordersApi';

export const OrderResultValues = ({
  observations,
}: {
  observations: OrderObservation[];
}) => (
  <ul>
    {observations
      .filter((obs) => !obs.voided)
      .map((obs, index) => (
        <li key={obs.uuid ?? index}>
          <strong>{obs.concept.name}: </strong>
          {obs.groupMembers?.length ? (
            <OrderResultValues observations={obs.groupMembers} />
          ) : obs.concept.dataType === 'Complex' && documentLink(obs.value) ? (
            <a href={documentLink(obs.value)} target="_blank" rel="noreferrer">
              Open attachment
            </a>
          ) : typeof obs.value === 'object' ? (
            JSON.stringify(obs.value)
          ) : (
            String(obs.value ?? '')
          )}
        </li>
      ))}
  </ul>
);

const hasUiRules = (
  form: FulfillmentConcept,
  config: Record<string, Record<string, unknown>>,
): boolean =>
  Object.keys(config[form.name.name] ?? {}).length > 0 ||
  form.setMembers.some((member) => hasUiRules(member, config));

const matchesForm = (
  observation: OrderObservation,
  concept: FulfillmentConcept,
): boolean =>
  observation.concept.uuid === concept.uuid &&
  observation.groupMembers.every((member) => {
    const child = concept.setMembers.find(
      (field) => field.uuid === member.concept.uuid,
    );
    return !!child && matchesForm(member, child);
  });

interface FieldProps {
  observation: OrderObservation;
  id: string;
  patientUuid: string;
  maxSize?: number;
  onChange: (observations: OrderObservation[]) => void;
  onUploading: (uploading: boolean) => void;
  onError: (message: string) => void;
}

const ResultField = ({
  observation: obs,
  id,
  patientUuid,
  maxSize,
  onChange,
  onUploading,
  onError,
}: FieldProps) => {
  const label = obs.concept.name;
  const upload = async (files: File[]) => {
    if (!files.length) return;
    if (maxSize === undefined || maxSize <= 0) {
      onError('The upload limit is unavailable. Try again after it loads.');
      return;
    }
    if (
      files.some(
        (file) =>
          !/^image\/(jpeg|png|gif|webp)$/.test(file.type) &&
          file.type !== 'application/pdf',
      )
    ) {
      onError('Choose a JPEG, PNG, GIF, WebP image or PDF.');
      return;
    }
    if (files.some((file) => file.size > maxSize * 1000 * 1000)) {
      onError(`Each file must be no larger than ${maxSize} MB.`);
      return;
    }
    onUploading(true);
    const updated: OrderObservation[] = obs.value ? [obs] : [];
    try {
      // Upload as legacy imageUpload does, without assigning a document encounter type.
      for (const file of files) {
        const uploaded = await uploadDocument(file, undefined, patientUuid);
        if (!documentLink(uploaded.url))
          throw new Error('The server returned an invalid attachment path.');
        updated.push({
          concept: obs.concept,
          groupMembers: [],
          value: uploaded.url,
        });
      }
      onError('');
    } catch (error) {
      onError(
        error instanceof Error ? error.message : 'Attachment upload failed.',
      );
    } finally {
      if (updated.length) onChange(updated);
      onUploading(false);
    }
  };
  if (obs.voided)
    return (
      <div>
        <p>{label} is marked for removal.</p>
        <button
          type="button"
          onClick={() => onChange([{ ...obs, voided: false }])}
        >
          Restore
        </button>
      </div>
    );
  if (obs.groupMembers.length)
    return (
      <fieldset>
        <legend>{label}</legend>
        {obs.groupMembers.map((member, index) => (
          <ResultField
            key={member.uuid ?? `${member.concept.uuid}:${index}`}
            observation={member}
            id={`${id}-${index}`}
            patientUuid={patientUuid}
            maxSize={maxSize}
            onError={onError}
            onUploading={onUploading}
            onChange={(replacement) =>
              onChange([
                {
                  ...obs,
                  groupMembers: [
                    ...obs.groupMembers.slice(0, index),
                    ...replacement,
                    ...obs.groupMembers.slice(index + 1),
                  ],
                },
              ])
            }
          />
        ))}
      </fieldset>
    );
  if (obs.concept.dataType === 'Text')
    return (
      <label className={styles.resultText} htmlFor={id}>
        {label}
        <textarea
          id={id}
          rows={4}
          value={String(obs.value ?? '')}
          onChange={(event) =>
            onChange([{ ...obs, value: event.target.value }])
          }
        />
      </label>
    );
  if (obs.concept.dataType === 'Complex')
    return (
      <div className={styles.resultText}>
        {!!obs.value && (
          <p>
            <a href={documentLink(obs.value)} target="_blank" rel="noreferrer">
              Open {label}
            </a>{' '}
            <button
              type="button"
              onClick={() =>
                onChange(
                  obs.uuid
                    ? [{ ...obs, voided: true }]
                    : [{ ...obs, value: undefined }],
                )
              }
            >
              Remove attachment
            </button>
          </p>
        )}
        <label htmlFor={id}>Add {label}</label>
        <input
          id={id}
          type="file"
          disabled={maxSize === undefined}
          accept="image/jpeg,image/png,image/gif,image/webp,application/pdf"
          multiple
          onChange={(event) => {
            const files = Array.from(event.target.files ?? []);
            event.target.value = '';
            void upload(files);
          }}
        />
      </div>
    );
  return (
    <p role="alert">
      {label} uses a control that is not yet supported in this editor.
    </p>
  );
};

interface EditorProps {
  patientUuid: string;
  order: FulfillmentOrder;
  form: FulfillmentConcept;
  snapshot: FulfillmentEncounter;
  locationUuid: string;
  providerUuid: string;
  uiConfig: Record<string, Record<string, unknown>>;
  onSaved: () => Promise<FulfillmentEncounter>;
}

const OrderResultEditor = ({
  patientUuid,
  order,
  form,
  snapshot,
  locationUuid,
  providerUuid,
  uiConfig,
  onSaved,
}: EditorProps) => {
  const { userPrivileges } = useUserPrivilege();
  // Keep each editor's original snapshot when another order refreshes the page.
  const [baseline, setBaseline] = useState(snapshot);
  const current = observationsForOrder(baseline, order.orderUuid);
  const existing = current.find((obs) => obs.concept.uuid === form.uuid);
  const [draft, setDraft] = useState(() =>
    makeFulfillmentObservation(form, existing),
  );
  const [dirty, setDirty] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const maxSize = useQuery({
    queryKey: ['documentUploadMaxSizeMb'],
    queryFn: getDocumentUploadMaxSizeMb,
  });
  const canWrite =
    hasPrivilege(userPrivileges, 'Add Encounters') &&
    hasPrivilege(userPrivileges, 'Add Observations') &&
    (!existing || hasPrivilege(userPrivileges, 'Edit Observations'));
  const supported =
    supportsFulfillmentForm(form) &&
    !hasUiRules(form, uiConfig) &&
    current.length <= 1 &&
    (!current.length || (!!existing && matchesForm(existing, form)));
  useEffect(() => {
    if (!dirty && !uploading) return;
    const leave = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    const followLink = (event: MouseEvent) => {
      const link = (event.target as Element).closest('a');
      if (
        link &&
        link.target !== '_blank' &&
        !window.confirm('Leave without saving this order result?')
      ) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    window.addEventListener('beforeunload', leave);
    document.addEventListener('click', followLink, true);
    return () => {
      window.removeEventListener('beforeunload', leave);
      document.removeEventListener('click', followLink, true);
    };
  }, [dirty, uploading]);
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canWrite || !supported || !dirty || uploading || saving || saved)
      return;
    setConfirming(true);
  };
  const confirmSave = async () => {
    if (
      !confirming ||
      !canWrite ||
      !supported ||
      !dirty ||
      uploading ||
      saving ||
      saved
    )
      return;
    setConfirming(false);
    setSaving(true);
    setError('');
    try {
      await saveFulfillment(
        patientUuid,
        locationUuid,
        providerUuid,
        order.orderUuid,
        baseline,
        draft,
      );
      setDirty(false);
      setSaved(true);
      try {
        const fresh = await onSaved();
        setBaseline(fresh);
        setDraft(
          makeFulfillmentObservation(
            form,
            observationsForOrder(fresh, order.orderUuid).find(
              (obs) => obs.concept.uuid === form.uuid,
            ),
          ),
        );
      } catch (refreshError) {
        setError(
          refreshError instanceof Error
            ? refreshError.message
            : 'Result saved. Reload to refresh.',
        );
      }
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : 'Result was not saved. Your draft has been kept.',
      );
    } finally {
      setSaving(false);
    }
  };
  if (!supported)
    return (
      <p role="alert">
        This configured form needs controls that are still being migrated.
        Results remain read-only here.
      </p>
    );
  return (
    <>
      <form className={styles.resultForm} onSubmit={submit}>
        {!canWrite && (
          <p>You can view results, but your role cannot save them.</p>
        )}
        {maxSize.isError && (
          <p role="alert">
            Could not load the attachment size limit. File uploads are
            unavailable.
          </p>
        )}
        <fieldset
          disabled={!canWrite || uploading || saving || saved || confirming}
        >
          <legend>Order results</legend>
          <ResultField
            observation={draft}
            id={`result-${order.orderUuid}`}
            patientUuid={patientUuid}
            maxSize={maxSize.isSuccess ? (maxSize.data ?? Infinity) : undefined}
            onChange={([next]) => {
              setDraft(next);
              setDirty(true);
            }}
            onUploading={setUploading}
            onError={setError}
          />
          <button type="submit" disabled={!dirty}>
            Save result
          </button>
        </fieldset>
        {uploading && <p role="status">Uploading attachments…</p>}
        {saving && <p role="status">Saving result…</p>}
        {saved && <p role="status">Result saved.</p>}
        {saved && !error && (
          <button type="button" onClick={() => setSaved(false)}>
            Edit saved result
          </button>
        )}
        {error && <p role="alert">{error}</p>}
      </form>
      {confirming && (
        <ConfirmationModal
          open
          heading={`Save results for ${order.concept.shortName ?? order.concept.name}?`}
          body="These results will be saved to this patient's record."
          confirmLabel="Confirm save"
          cancelLabel="Keep editing"
          isSubmitting={saving || !canWrite || !supported}
          onConfirm={() => void confirmSave()}
          onCancel={() => setConfirming(false)}
        />
      )}
    </>
  );
};

export default OrderResultEditor;
