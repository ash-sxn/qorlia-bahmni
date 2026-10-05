import { Button, Loading } from '@bahmni/design-system';
import { getObservationsFromFhir } from '@bahmni/form2-controls';
import type { ObservationForm, Form2Observation } from '@bahmni/services';
import {
  getObservationsBundleByEncounterUuid,
  getPatientFormData,
  fetchFormUuidByObservationDate,
} from '@bahmni/services';
import { useActivePractitioner, usePatientUUID } from '@bahmni/widgets';
import type { Bundle, Task, Observation, Reference } from 'fhir/r4';
import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { EncounterSessionStartContext } from '../../../events/startConsultation';
import { useClinicalAppData } from '../../../hooks/useClinicalAppData';
import useObservationFormsSearch from '../../../hooks/useObservationFormsSearch';
import { usePinnedObservationForms } from '../../../hooks/usePinnedObservationForms';
import { useSubmittedEncounterForms } from '../../../hooks/useSubmittedEncounterForms';
import { useObservationFormsStore } from '../../../stores/observationFormsStore';
import ObservationForms from './ObservationForms';
import styles from './styles/ObservationFormsContainer.module.scss';

interface ObservationFormsPanelProps {
  encounterSessionStartContext?: EncounterSessionStartContext;
}

interface ObservationExistingData {
  status?: string;
  basedOn?: Reference;
}

const ObservationFormsPanel: React.FC<ObservationFormsPanelProps> = ({
  encounterSessionStartContext,
}) => {
  const { t } = useTranslation();
  const { user } = useActivePractitioner();
  const patientUUID = usePatientUUID();
  const { episodeOfCare } = useClinicalAppData();
  const episodeOfCareUuids = episodeOfCare.map((eoc) => eoc.uuid);

  const formName = encounterSessionStartContext?.formName as string | undefined;
  const directFormMode = encounterSessionStartContext?.directFormMode as
    | boolean
    | undefined;
  const sourceEncounterUuid = encounterSessionStartContext?.sourceEncounterUuid;
  const activeEncounter = encounterSessionStartContext?.activeEncounter;
  const isCopyover: boolean | undefined =
    !sourceEncounterUuid || activeEncounter === undefined
      ? undefined
      : activeEncounter?.id !== sourceEncounterUuid;
  const task = encounterSessionStartContext?.task as Task | undefined;
  const basedOnRef = task?.basedOn?.[0]?.reference;
  const basedOnId = basedOnRef?.split('/').pop() ?? undefined;
  const isEditObservationFormsMode =
    encounterSessionStartContext?.editOnly === 'observationForms';
  const isEditMode =
    isEditObservationFormsMode && !!sourceEncounterUuid && isCopyover === false;
  const isCopyoverMode =
    isEditObservationFormsMode && !!sourceEncounterUuid && isCopyover === true;
  const isTaskDirectMode = !!(formName && directFormMode);

  const {
    forms: allForms,
    isLoading: isAllFormsLoading,
    error: observationFormsError,
    refetch: refetchForms,
  } = useObservationFormsSearch(
    '',
    isTaskDirectMode ? undefined : episodeOfCareUuids,
  );

  const {
    pinnedForms,
    updatePinnedForms,
    isLoading: isPinnedFormsLoading,
    refetch: refetchPinnedForms,
  } = usePinnedObservationForms(allForms, {
    userUuid: user?.uuid,
    isFormsLoading: isAllFormsLoading,
  });

  const { selectedForms, addForm, removeForm, viewingForm } =
    useObservationFormsStore();

  const history = useSubmittedEncounterForms(
    allForms,
    encounterSessionStartContext ? { encounter: activeEncounter } : undefined,
  );
  const { submittedFormUuids } = history;
  const [editFailure, setEditFailure] = useState<string | null>(null);
  const [editRetry, setEditRetry] = useState(0);
  const editSessionKey = `${patientUUID}:${sourceEncounterUuid}:${formName}:${basedOnId}:${activeEncounter?.id}:${isCopyoverMode ? 'copyover' : 'edit'}`;
  const directSessionRef = useRef<string | null>(null);

  const prevViewingFormRef = useRef(viewingForm);
  useEffect(() => {
    if (prevViewingFormRef.current && !viewingForm) {
      refetchPinnedForms();
    }
    prevViewingFormRef.current = viewingForm;
  }, [viewingForm, refetchPinnedForms]);

  useEffect(() => {
    if (
      formName &&
      directFormMode &&
      !isAllFormsLoading &&
      !observationFormsError &&
      !sourceEncounterUuid &&
      history.isReady
    ) {
      const key = `${patientUUID}:${activeEncounter?.id}:${formName}`;
      if (directSessionRef.current === key) return;
      const matchingForm = allForms.find(
        (form) => form.name.toLowerCase() === formName.toLowerCase(),
      );

      if (matchingForm && !submittedFormUuids.has(matchingForm.uuid)) {
        useObservationFormsStore.getState().reset();
        directSessionRef.current = key;
        addForm(matchingForm);
      }
    }
  }, [
    formName,
    directFormMode,
    allForms,
    isAllFormsLoading,
    observationFormsError,
    sourceEncounterUuid,
    addForm,
    patientUUID,
    activeEncounter?.id,
    history.isReady,
    submittedFormUuids,
  ]);

  // useObservationFormsStore is a session-wide singleton, not scoped to a single
  // edit session. Without this, `selectedForms` from a previous edit (or from the
  // regular add-form flow) can already contain the next form's uuid, causing the
  // guard below to skip fetching/populating observations for it entirely — the
  // form opens but never prepopulates. Reset once per distinct (encounter, form)
  // pair so each edit session starts from a clean store.
  const editSessionKeyRef = useRef<string | null>(null);
  useEffect(() => {
    if (!isEditObservationFormsMode || !formName || !sourceEncounterUuid) {
      return;
    }
    const sessionKey = editSessionKey;
    if (editSessionKeyRef.current === sessionKey) {
      return;
    }
    editSessionKeyRef.current = sessionKey;
    useObservationFormsStore.getState().reset();
  }, [
    isEditObservationFormsMode,
    formName,
    sourceEncounterUuid,
    isCopyoverMode,
    editSessionKey,
  ]);

  // Latches once the fetch for a given (encounter, form) session actually
  // starts. Guarding on `selectedForms` instead (as before) breaks as soon as
  // `savedFormUuid` differs from `matchingForm.uuid` (editing an encounter
  // saved under an older form version): the form gets added to the store
  // keyed by `savedFormUuid`, but the guard kept checking `matchingForm.uuid`,
  // so it never matched and the entire fetch chain fired a second time on the
  // next `selectedForms`-triggered re-render. Keying on the session itself
  // (not on what ends up in the store) avoids that race entirely.
  const editFetchSessionRef = useRef<string | null>(null);
  useEffect(() => {
    if (
      !isEditObservationFormsMode ||
      !formName ||
      !sourceEncounterUuid ||
      !patientUUID ||
      isAllFormsLoading ||
      observationFormsError ||
      (!isEditMode && !isCopyoverMode)
    )
      return;

    const matchingForm = allForms.find(
      (form) => form.name.toLowerCase() === formName.toLowerCase(),
    );
    if (!matchingForm) return;

    const sessionKey = editSessionKey;
    if (editFetchSessionRef.current === sessionKey) return;
    editFetchSessionRef.current = sessionKey;
    let active = true;
    let initialized = false;

    getObservationsBundleByEncounterUuid(sourceEncounterUuid, basedOnId)
      .then(async (bundle) => {
        if (!active) return;
        // getObservationsBundleByEncounterUuid fetches the WHOLE encounter's
        // observations — an encounter can carry multiple form submissions
        // (e.g. Vitals + History and Examination), all mixed together in one
        // bundle. Keep only this form's own top-level observations (its
        // formFieldPath is "<formName>.<version>/..."), otherwise a stray
        // observation from a different form can end up first in the array and
        // silently corrupt this form's version/prepopulation matching.
        const entries =
          bundle.entry?.flatMap((entry) =>
            entry.resource?.resourceType === 'Observation'
              ? [{ ...entry }]
              : [],
          ) ?? [];
        const form2Observations = getObservationsFromFhir(entries).filter(
          (obs) =>
            obs.formFieldPath
              ?.toLowerCase()
              .startsWith(`${formName.toLowerCase()}.`),
        );

        // Primary: read formUuid directly from the patient forms API —
        // same approach as the old Bahmni Angular frontend (observationForm.formUuid).
        // The backend stores the exact UUID of the form version used when the
        // encounter was saved, so this is the authoritative identifier.
        //
        // Fallback: if formUuid is absent (older backend), use the observation's
        // server-assigned `issued` timestamp to find the most recently published
        // form version that predates the save time.
        let formToOpen = matchingForm;
        let savedFormUuid: string | null = null;

        if (patientUUID) {
          const patientForms = await getPatientFormData(patientUUID);
          if (!active) return;
          // An encounter can carry multiple form submissions (e.g. Vitals +
          // History and Examination saved to the same encounter) — must also
          // match on formName, or this always resolves to whichever form
          // submission happens to be first for the encounter.
          const encounterFormData = patientForms.find(
            (d) =>
              d.encounterUuid === sourceEncounterUuid &&
              d.formName.toLowerCase() === formName.toLowerCase(),
          );
          // Primary: formUuid from patient forms API (same as old Bahmni Angular).
          // Fallback: version-string or date-based lookup using formVersion and
          // encounterDateTime (stable clinical date, unlike Observation.issued which
          // updates on every re-edit).
          savedFormUuid =
            encounterFormData?.formUuid ??
            (await fetchFormUuidByObservationDate(
              formName,
              encounterFormData?.formVersion,
              encounterFormData?.encounterDateTime,
            ));
        }

        if (!active) return;

        if (savedFormUuid && savedFormUuid !== matchingForm.uuid) {
          formToOpen = { ...matchingForm, uuid: savedFormUuid };
        }

        if (form2Observations.length > 0) {
          let obsWithExistingData: Form2Observation[];
          if (isCopyoverMode) {
            // Copyover: strip UUIDs so submission creates new observation resources
            // instead of updating the old ones.
            obsWithExistingData = stripObservationUuids(
              form2Observations as Form2Observation[],
            );
          } else {
            // Edit: preserve UUIDs and echo back status + basedOn for PUT requests.
            const existingDataByUuid = buildObsExistingDataMap(
              bundle as Bundle,
            );
            obsWithExistingData = enrichObsWithExistingData(
              form2Observations as Form2Observation[],
              existingDataByUuid,
            );
          }

          // Pre-populate formsData directly — bypasses the selectedForms guard in
          // updateFormData because the form is not yet in selectedForms at this point.
          useObservationFormsStore.setState((state) => ({
            formsData: {
              ...state.formsData,
              [formToOpen.uuid]: {
                formUuid: formToOpen.uuid,
                formName: formToOpen.name,
                observations: obsWithExistingData,
                timestamp: Date.now(),
              },
            },
          }));
        }

        // Open the form AFTER data is stored — ObservationFormsContainer mounts
        // with existingObservations already populated.
        initialized = true;
        addForm(formToOpen);
      })
      .catch((err) => {
        if (!active) return;
        // eslint-disable-next-line no-console
        console.error('[EditMode] FHIR fetch FAILED for', formName, err);
        setEditFailure(sessionKey);
      });
    return () => {
      active = false;
      // Keep successful initialization latched so a catalogue refresh cannot
      // replace edits. Cancelled or failed reads remain retryable.
      if (!initialized && editFetchSessionRef.current === sessionKey)
        editFetchSessionRef.current = null;
    };
  }, [
    isEditObservationFormsMode,
    formName,
    sourceEncounterUuid,
    basedOnId,
    isAllFormsLoading,
    observationFormsError,
    isEditMode,
    isCopyoverMode,
    allForms,
    addForm,
    patientUUID,
    editSessionKey,
    editRetry,
  ]);

  const matchingRequestedForm = formName
    ? allForms.find(
        (form) => form.name.toLowerCase() === formName.toLowerCase(),
      )
    : undefined;
  const isRequestedFormMissing =
    !!formName &&
    (isEditObservationFormsMode || directFormMode) &&
    !isAllFormsLoading &&
    !observationFormsError &&
    !matchingRequestedForm;

  if (!viewingForm && (observationFormsError || isRequestedFormMissing)) {
    return (
      <div role="alert" className={styles.loadingWrapper}>
        <p>
          {t(
            observationFormsError
              ? 'OBSERVATION_FORM_CATALOGUE_UNAVAILABLE'
              : 'OBSERVATION_FORM_NOT_AVAILABLE',
          )}
        </p>
        <Button kind="tertiary" onClick={() => void refetchForms()}>
          {t('OBSERVATION_FORM_TRY_AGAIN')}
        </Button>
      </div>
    );
  }

  // In edit mode the add-form search panel must never appear. Show a loading
  // indicator while addForm() hasn't fired yet — the fetch it waits on can
  // take several seconds — then render nothing once it has: ConsultationPad
  // switches to ObservationFormsContainer directly as soon as viewingForm is set.
  if (isEditObservationFormsMode) {
    if (editFailure === editSessionKey) {
      return (
        <div role="alert" className={styles.loadingWrapper}>
          <p>{t('OBSERVATION_FORM_EDIT_UNAVAILABLE')}</p>
          <Button
            kind="tertiary"
            onClick={() => {
              setEditFailure(null);
              setEditRetry((value) => value + 1);
            }}
          >
            {t('OBSERVATION_FORM_TRY_AGAIN')}
          </Button>
        </div>
      );
    }
    if (!viewingForm) {
      return (
        <div className={styles.loadingWrapper}>
          <Loading
            description={t('OBSERVATION_FORM_LOADING_METADATA')}
            role="status"
            testId="edit-observation-form-loading"
            withOverlay={false}
          />
        </div>
      );
    }
    return null;
  }

  const handleFormSelect = (form: ObservationForm) => {
    if (
      !isAllFormsLoading &&
      !observationFormsError &&
      history.isReady &&
      !submittedFormUuids.has(form.uuid)
    )
      addForm(form);
  };

  if (!history.isReady) {
    return (
      <div className={styles.loadingWrapper}>
        {history.error ? (
          <div role="alert">
            <p>{t('OBSERVATION_FORM_HISTORY_UNAVAILABLE')}</p>
            <Button kind="tertiary" onClick={() => void history.refetch()}>
              {t('OBSERVATION_FORM_TRY_AGAIN')}
            </Button>
          </div>
        ) : (
          <Loading
            description={t('OBSERVATION_FORM_HISTORY_LOADING')}
            role="status"
            withOverlay={false}
          />
        )}
      </div>
    );
  }

  if (
    directFormMode &&
    allForms.some(
      (form) =>
        form.name.toLowerCase() === formName?.toLowerCase() &&
        submittedFormUuids.has(form.uuid),
    )
  ) {
    return <p role="alert">{t('OBSERVATION_FORM_ALREADY_SUBMITTED')}</p>;
  }

  return (
    <ObservationForms
      onFormSelect={handleFormSelect}
      selectedForms={selectedForms}
      onRemoveForm={removeForm}
      pinnedForms={pinnedForms}
      updatePinnedForms={updatePinnedForms}
      isPinnedFormsLoading={isPinnedFormsLoading}
      allForms={allForms}
      isAllFormsLoading={isAllFormsLoading}
      observationFormsError={observationFormsError}
      submittedFormUuids={submittedFormUuids}
    />
  );
};

export default ObservationFormsPanel;

/** Extracts existing fields (status, basedOn) from a raw FHIR Observation bundle, keyed by uuid. */
function buildObsExistingDataMap(
  bundle: Bundle,
): Map<string, ObservationExistingData> {
  const map = new Map<string, ObservationExistingData>();
  bundle.entry?.forEach((entry) => {
    const resource = entry.resource;
    if (resource?.resourceType !== 'Observation' || !resource.id) return;
    const obs = resource as Observation;
    const existing: ObservationExistingData = {};
    if (obs.status) existing.status = obs.status;
    if (obs.basedOn?.[0]) existing.basedOn = obs.basedOn[0];
    if (existing.status || existing.basedOn) map.set(resource.id, existing);
  });
  return map;
}

/**
 * Recursively strips the uuid from every Form2Observation so they are
 * submitted as new resources (POST) rather than updates to existing ones.
 * Used for copyover: pre-fill the form with old values but create fresh obs.
 */
function stripObservationUuids(
  observations: Form2Observation[],
): Form2Observation[] {
  return observations.map((obs) => {
    const stripped: Form2Observation = { ...obs, uuid: undefined };
    if (obs.groupMembers) {
      stripped.groupMembers = stripObservationUuids(obs.groupMembers);
    }
    return stripped;
  });
}

/** Recursively copies status + basedOn onto Form2Observations with a matching uuid.
 *  status → OpenMRS rejects PUT without exact status ("Editing the fields [status] on Obs is not allowed").
 *  basedOn → OpenMRS strips the ServiceRequest linkage if PUT omits it. */
function enrichObsWithExistingData(
  observations: Form2Observation[],
  existingDataByUuid: Map<string, ObservationExistingData>,
): Form2Observation[] {
  return observations.map((obs) => {
    const enriched: Form2Observation = { ...obs };
    if (obs.uuid) {
      const existing = existingDataByUuid.get(obs.uuid);
      if (existing) {
        if (existing.status) enriched.status = existing.status;
        if (existing.basedOn) enriched.basedOn = existing.basedOn;
      }
    }
    if (obs.groupMembers) {
      enriched.groupMembers = enrichObsWithExistingData(
        obs.groupMembers,
        existingDataByUuid,
      );
    }
    return enriched;
  });
}
