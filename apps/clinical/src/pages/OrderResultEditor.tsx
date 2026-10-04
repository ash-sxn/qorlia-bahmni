import {
  formatDateTime,
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
  codedResultUuid,
  fulfillmentAnswerLabel,
  fulfillmentDateForControl,
  makeFulfillmentObservation,
  observationsForOrder,
  saveFulfillment,
  supportsFulfillmentForm,
  toggleFulfillmentAnswer,
  validateFulfillmentObservation,
  type FulfillmentConcept,
  type FulfillmentEncounter,
  type FulfillmentOrder,
  type OrderObservation,
} from './ordersApi';

const resultValueLabel = (value: unknown, datatype: string): string => {
  if (datatype === 'Boolean' && typeof value === 'boolean')
    return value ? 'Yes' : 'No';
  if (
    ['Date', 'Datetime'].includes(datatype) &&
    (typeof value === 'string' || typeof value === 'number')
  )
    return (
      formatDateTime(value, undefined, datatype === 'Datetime')
        .formattedResult || String(value)
    );
  if (!value || typeof value !== 'object') return String(value ?? '');
  const coded = value as {
    shortName?: unknown;
    name?: unknown;
    display?: unknown;
  };
  const name =
    coded.name && typeof coded.name === 'object' && 'name' in coded.name
      ? coded.name.name
      : coded.name;
  const label = coded.shortName ?? name ?? coded.display;
  return typeof label === 'string' ? label : JSON.stringify(value);
};

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
            <>
              <a
                href={documentLink(obs.value)}
                target="_blank"
                rel="noreferrer"
              >
                Open attachment
              </a>
              {typeof obs.value === 'string' && /\.pdf$/i.test(obs.value) && (
                <>
                  {' '}
                  ·{' '}
                  <a
                    href={documentLink(obs.value)}
                    download={obs.value.split('__').pop()}
                  >
                    Download PDF
                  </a>
                </>
              )}
            </>
          ) : (
            resultValueLabel(obs.value, obs.concept.dataType)
          )}
          {obs.comment && <p>{obs.comment}</p>}
        </li>
      ))}
  </ul>
);

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
  multiObservations?: OrderObservation[];
  concept: FulfillmentConcept;
  uiConfig: Record<string, Record<string, unknown>>;
  id: string;
  patientUuid: string;
  maxSize?: number;
  onChange: (observations: OrderObservation[]) => void;
  onUploading: (uploading: boolean) => void;
  onError: (message: string) => void;
}

const ResultField = ({
  observation: obs,
  multiObservations,
  concept,
  uiConfig,
  id,
  patientUuid,
  maxSize,
  onChange,
  onUploading,
  onError,
}: FieldProps) => {
  const label = obs.concept.name;
  const multiple =
    obs.concept.dataType === 'Coded' && uiConfig[label]?.multiSelect === true;
  const upload = async (files: File[]) => {
    if (!files.length) return;
    if (maxSize === undefined || maxSize <= 0) {
      onError('The upload limit is unavailable. Try again after it loads.');
      return;
    }
    if (
      files.some(
        (file) =>
          !/^image\/(jpeg|png|gif)$/.test(file.type) &&
          file.type !== 'application/pdf',
      )
    ) {
      onError('Choose a JPEG, PNG, GIF image or PDF.');
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
  if (obs.voided && !multiple)
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
        {obs.groupMembers.map((member, index) => {
          const multiselect =
            member.concept.dataType === 'Coded' &&
            uiConfig[member.concept.name]?.multiSelect === true;
          if (
            multiselect &&
            obs.groupMembers.findIndex(
              (entry) => entry.concept.uuid === member.concept.uuid,
            ) !== index
          )
            return null;
          return (
            <ResultField
              key={member.uuid ?? `${member.concept.uuid}:${index}`}
              observation={member}
              multiObservations={
                multiselect
                  ? obs.groupMembers.filter(
                      (entry) => entry.concept.uuid === member.concept.uuid,
                    )
                  : undefined
              }
              concept={
                concept.setMembers.find(
                  (field) => field.uuid === member.concept.uuid,
                )!
              }
              uiConfig={uiConfig}
              id={`${id}-${index}`}
              patientUuid={patientUuid}
              maxSize={maxSize}
              onError={onError}
              onUploading={onUploading}
              onChange={(replacement) =>
                onChange([
                  {
                    ...obs,
                    groupMembers: multiselect
                      ? obs.groupMembers.flatMap((entry, i) =>
                          entry.concept.uuid === member.concept.uuid
                            ? i === index
                              ? replacement
                              : []
                            : [entry],
                        )
                      : [
                          ...obs.groupMembers.slice(0, index),
                          ...replacement,
                          ...obs.groupMembers.slice(index + 1),
                        ],
                  },
                ])
              }
            />
          );
        })}
      </fieldset>
    );
  if (
    ['Numeric', 'Coded', 'Date', 'Datetime', 'Boolean'].includes(
      obs.concept.dataType,
    )
  ) {
    const note =
      multiple || uiConfig[label]?.disableAddNotes === true ? null : (
        <label className={styles.resultText} htmlFor={`${id}-notes`}>
          Notes for {label}
          <textarea
            id={`${id}-notes`}
            rows={2}
            maxLength={255}
            value={obs.comment ?? ''}
            onChange={(event) =>
              onChange([{ ...obs, comment: event.target.value }])
            }
          />
        </label>
      );
    if (obs.concept.dataType === 'Numeric') {
      const value = obs.value;
      const abnormal =
        typeof value === 'number' &&
        ((concept.lowNormal != null && value < concept.lowNormal) ||
          (concept.hiNormal != null && value > concept.hiNormal));
      return (
        <div>
          <div className={styles.resultText}>
            <label htmlFor={id}>{label}</label>
            <input
              id={id}
              type="number"
              value={String(value ?? '')}
              min={concept.lowAbsolute ?? 0}
              max={concept.hiAbsolute ?? undefined}
              step={concept.allowDecimal ? 'any' : 1}
              aria-describedby={
                concept.units || abnormal ? `${id}-hint` : undefined
              }
              onChange={(event) =>
                onChange([
                  {
                    ...obs,
                    value:
                      event.target.value === ''
                        ? undefined
                        : Number(event.target.value),
                  },
                ])
              }
            />
            {(concept.units || abnormal) && (
              <span id={`${id}-hint`}>
                {abnormal
                  ? `Outside the reference range: ${concept.lowNormal ?? 'no lower limit'} to ${concept.hiNormal ?? 'no upper limit'}${concept.units ? ` ${concept.units}` : ''}.`
                  : concept.units}
              </span>
            )}
          </div>
          {note}
        </div>
      );
    }
    if (['Date', 'Datetime'].includes(obs.concept.dataType)) {
      const includeTime = obs.concept.dataType === 'Datetime';
      return (
        <div>
          <label className={styles.resultText} htmlFor={id}>
            {label}
            <input
              id={id}
              type={includeTime ? 'datetime-local' : 'date'}
              min={includeTime ? '0001-01-01T00:00' : '0001-01-01'}
              max={
                uiConfig[label]?.allowFutureDates === true
                  ? includeTime
                    ? '9999-12-31T23:59'
                    : '9999-12-31'
                  : fulfillmentDateForControl(Date.now(), includeTime)
              }
              step={includeTime ? 60 : undefined}
              value={fulfillmentDateForControl(obs.value, includeTime)}
              onChange={(event) =>
                onChange([{ ...obs, value: event.target.value || undefined }])
              }
            />
          </label>
          {note}
        </div>
      );
    }
    const boolean = obs.concept.dataType === 'Boolean';
    const answers = boolean
      ? [
          { key: 'yes', label: 'Yes', value: true },
          { key: 'no', label: 'No', value: false },
        ]
      : concept.answers!.map((answer) => ({
          key: answer.uuid,
          label: fulfillmentAnswerLabel(answer),
          value: {
            uuid: answer.uuid,
            name: answer.name.name,
            shortName: fulfillmentAnswerLabel(answer),
          },
        }));
    return (
      <fieldset>
        <legend>{label}</legend>
        <div className={styles.tabs}>
          {answers.map((answer) => {
            const selected = boolean
              ? obs.value === answer.value
              : multiple
                ? multiObservations!.some(
                    (entry) =>
                      !entry.voided &&
                      codedResultUuid(entry.value) === answer.key,
                  )
                : codedResultUuid(obs.value) === answer.key;
            return (
              <button
                type="button"
                key={answer.key}
                aria-pressed={selected}
                onClick={() =>
                  onChange(
                    multiple
                      ? toggleFulfillmentAnswer(
                          concept,
                          multiObservations!,
                          answer.key,
                        )
                      : [
                          {
                            ...obs,
                            value: selected ? undefined : answer.value,
                          },
                        ],
                  )
                }
              >
                {answer.label}
              </button>
            );
          })}
        </div>
        {note}
      </fieldset>
    );
  }
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
            {typeof obs.value === 'string' && /\.pdf$/i.test(obs.value) && (
              <>
                <a
                  href={documentLink(obs.value)}
                  download={obs.value.split('__').pop()}
                >
                  Download PDF
                </a>{' '}
              </>
            )}
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
          accept="image/jpeg,image/png,image/gif,application/pdf"
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
    queryFn: async () => (await getDocumentUploadMaxSizeMb()) ?? null,
  });
  const canWrite =
    hasPrivilege(userPrivileges, 'Add Encounters') &&
    hasPrivilege(userPrivileges, 'Add Observations') &&
    (!existing || hasPrivilege(userPrivileges, 'Edit Observations'));
  const supported =
    supportsFulfillmentForm(form, uiConfig) &&
    // A fulfillment template is a concept set; multi-selects are its members.
    !(
      form.datatype.name === 'Coded' &&
      uiConfig[form.name.name]?.multiSelect === true
    ) &&
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
    const validation = validateFulfillmentObservation(form, draft, uiConfig);
    setError(validation ?? '');
    if (validation) return;
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
    const validation = validateFulfillmentObservation(form, draft, uiConfig);
    if (validation) {
      setConfirming(false);
      setError(validation);
      return;
    }
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
            concept={form}
            uiConfig={uiConfig}
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
