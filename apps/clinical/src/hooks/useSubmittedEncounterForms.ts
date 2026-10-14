import {
  ObservationForm,
  getObservationsBundleByEncounterUuid,
  useEncounterSessionStore,
  useSubscribeConsultationSaved,
} from '@bahmni/services';
import { usePatientUUID, extractFormName } from '@bahmni/widgets';
import { useQuery } from '@tanstack/react-query';
import type { Encounter, Observation } from 'fhir/r4';
import { useMemo } from 'react';

/**
 * Returns the set of form UUIDs that have already been submitted in the active encounter.
 *
 * - A resolved new encounter has no submitted forms. Pending/failed history is not known empty.
 * - Automatically refetches after any consultation save for the current patient (handles the
 *   "Continue Consultation" multi-bundle flow).
 */
export function useSubmittedEncounterForms(
  allForms: ObservationForm[],
  context?: { encounter: Encounter | null | undefined; enabled?: boolean },
) {
  const patientUUID = usePatientUUID();
  const {
    activeEncounter,
    matchReasons,
    isLoading: isContextLoading,
  } = useEncounterSessionStore();

  const encounter = context
    ? context.encounter
    : isContextLoading || !matchReasons.length
      ? undefined
      : matchReasons.includes('MATCHED')
        ? (activeEncounter ?? undefined)
        : null;
  const enabled = context?.enabled !== false;
  const activeEncounterUuid = encounter?.id;
  const canFetch = enabled && !!patientUUID && !!activeEncounterUuid;

  const {
    data: bundle,
    refetch,
    error,
    isFetching,
    isSuccess,
  } = useQuery({
    queryKey: ['submittedEncounterForms', patientUUID, activeEncounterUuid],
    enabled: canFetch,
    staleTime: 30_000,
    retry: false,
    queryFn: () => getObservationsBundleByEncounterUuid(activeEncounterUuid!),
  });

  useSubscribeConsultationSaved(
    (payload) => {
      if (canFetch && payload.patientUUID === patientUUID) {
        refetch();
      }
    },
    [patientUUID, canFetch, refetch],
  );

  const submittedFormUuids = useMemo(() => {
    const observations: Observation[] =
      (canFetch ? bundle : undefined)?.entry
        ?.map((e) => e.resource)
        .filter((r): r is Observation => r?.resourceType === 'Observation') ??
      [];

    const submittedUuids = new Set<string>();

    for (const obs of observations) {
      const formName = extractFormName(obs);
      if (!formName) continue;

      const matched = allForms.find((f) => f.name === formName);
      if (matched) {
        submittedUuids.add(matched.uuid);
      }
    }

    return submittedUuids;
  }, [bundle, allForms, canFetch]);

  const isReady =
    !enabled ||
    (!!patientUUID &&
      encounter !== undefined &&
      !error &&
      !isFetching &&
      (encounter === null || (!!activeEncounterUuid && isSuccess)));
  return {
    submittedFormUuids,
    isReady,
    isLoading: enabled && !isReady && !error,
    error: enabled ? error : null,
    refetch: async () => {
      if (canFetch) await refetch();
    },
  };
}
