import { Encounter } from 'fhir/r4';
import { get } from '../api';
import {
  FHIR_ENCOUNTER_TAG_SYSTEM,
  FHIR_ENCOUNTER_TYPE_CODE_SYSTEM,
} from '../constants/fhir';
import { getActiveVisit, getEncounterByUuid } from '../encounterService';
import { getAllFHIRSearchPages } from '../fhirSearchCompatibility';
import {
  ENCOUNTER_SESSION_DURATION_GP_URL,
  ENCOUNTER_SEARCH_URL,
} from './constants';

interface EncounterSearchParams {
  patient: string;
  _tag?: string;
  _lastUpdated?: string;
  participant?: string;
  type?: string;
}

/**
 * Searches for encounters using FHIR API with given parameters
 * @param params - Search parameters for encounter query
 * @returns Promise resolving to array of FhirEncounter
 */
export async function searchEncounters(
  params: EncounterSearchParams,
): Promise<Encounter[]> {
  const queryParams = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (value) {
      queryParams.append(key, value);
    }
  });

  const url = `${ENCOUNTER_SEARCH_URL}?${queryParams.toString()}`;

  const bundle = await getAllFHIRSearchPages<Encounter>(url);

  return (
    bundle.entry
      ?.map((entry) => entry.resource)
      .filter(
        (resource): resource is Encounter =>
          resource?.resourceType === 'Encounter',
      ) ?? []
  );
}

export function getTypedReferenceId(
  reference: string | undefined,
  resourceType: string,
): string | undefined {
  const match = reference?.match(
    /(?:^|\/)([A-Za-z][A-Za-z0-9]*)\/([A-Za-z0-9.-]+)(?:\/_history\/[A-Za-z0-9.-]+)?$/,
  );
  return match?.[1] === resourceType ? match[2] : undefined;
}

export function sortByMostRecent(encounters: Encounter[]): Encounter[] {
  const start = (encounter: Encounter) =>
    Date.parse(encounter.period?.start ?? '') || 0;
  return [...encounters].sort((a, b) => start(b) - start(a));
}

/** Re-read the saved ID; a cached MATCHED flag is not a current decision. */
export async function readSavedEncounter(
  uuid: string | undefined,
  patientUUID: string,
  practitionerUUID: string,
  visitUUID: string,
  encounterTypeUUID: string | undefined,
): Promise<Encounter | null> {
  if (!uuid || !/^[A-Za-z0-9.-]+$/.test(uuid) || !encounterTypeUUID)
    return null;
  let encounter: Encounter;
  try {
    encounter = await getEncounterByUuid(uuid);
  } catch (error) {
    if (error instanceof Error && 'status' in error && error.status === 404)
      return null;
    throw error;
  }
  const updated = Date.parse(encounter.meta?.lastUpdated ?? '');
  if (
    encounter.resourceType !== 'Encounter' ||
    encounter.id !== uuid ||
    getTypedReferenceId(encounter.subject?.reference, 'Patient') !==
      patientUUID ||
    getTypedReferenceId(encounter.partOf?.reference, 'Encounter') !==
      visitUUID ||
    !encounter.participant?.some(
      (p) =>
        getTypedReferenceId(p.individual?.reference, 'Practitioner') ===
        practitionerUUID,
    ) ||
    !encounter.type?.some((type) =>
      type.coding?.some(
        (coding) =>
          coding.system === FHIR_ENCOUNTER_TYPE_CODE_SYSTEM &&
          coding.code === encounterTypeUUID,
      ),
    ) ||
    !encounter.meta?.tag?.some(
      (tag) =>
        tag.system === FHIR_ENCOUNTER_TAG_SYSTEM && tag.code === 'encounter',
    ) ||
    encounter.status === 'cancelled' ||
    encounter.status === 'entered-in-error' ||
    !Number.isFinite(updated) ||
    updated > Date.now()
  )
    return null;
  return encounter;
}

function findEncounterInVisit(
  encounters: Encounter[],
  visitUUID: string,
  currentEpisodeEncounterUuids?: string[],
): Encounter | null {
  return (
    sortByMostRecent(encounters).find(
      (encounter) =>
        getTypedReferenceId(encounter.partOf?.reference, 'Encounter') ===
          visitUUID &&
        (!currentEpisodeEncounterUuids ||
          (!!encounter.id &&
            currentEpisodeEncounterUuids.includes(encounter.id))),
    ) ?? null
  );
}

/**
 * Gets the encounter session duration from global properties
 * @returns Promise resolving to session duration in minutes (default: 30)
 */
export async function getEncounterSessionDuration(): Promise<number> {
  try {
    const response = await get<{ value: string }>(
      ENCOUNTER_SESSION_DURATION_GP_URL,
    );
    const duration = Number(response.value);
    return !isNaN(duration) && duration > 0 ? duration : 60; // Default to 60 minutes if invalid
  } catch {
    return 30;
  }
}

/**
 * Filters encounters to find those belonging to the active visit
 * @param encounters - Array of encounters to filter
 * @param patientUUID - Patient UUID
 * @param currentEpisodeEncounterUuids - Array of known encounters UUIDs of current EOC
 * @returns Promise resolving to encounter within active visit or null
 */
export async function filterByActiveVisit(
  encounters: Encounter[],
  patientUUID: string,
  currentEpisodeEncounterUuids?: string[],
): Promise<Encounter | null> {
  if (!encounters.length) return null;

  const activeVisit = await getActiveVisit(patientUUID);
  if (!activeVisit) return null;

  return activeVisit.id
    ? findEncounterInVisit(
        encounters,
        activeVisit.id,
        currentEpisodeEncounterUuids,
      )
    : null;
}

/**
 * Finds an active encounter within the session duration for a patient and practitioner
 * @param patientUUID - Patient UUID
 * @param practitionerUUID - Practitioner UUID (optional, for practitioner-specific sessions)
 * @param sessionDurationMinutes - Session duration in minutes (optional, will fetch from config if not provided)
 * @param encounterTypeUUID - Encounter type UUID (optional, filters by type)
 * @param currentEpisodeEncounterUuids - The current episode of care's own known encounter UUIDs
 * @param savedEncounterUUID - Saved ID hint, always re-read and context-checked
 * @returns Promise resolving to active encounter or null
 */
export async function findActiveEncounterInSession(
  patientUUID: string,
  practitionerUUID?: string,
  sessionDurationMinutes?: number,
  encounterTypeUUID?: string,
  currentEpisodeEncounterUuids?: string[],
  savedEncounterUUID?: string,
): Promise<Encounter | null> {
  if (!patientUUID) return null;

  const duration =
    sessionDurationMinutes ?? (await getEncounterSessionDuration());
  const sessionStartTime = new Date(Date.now() - duration * 60 * 1000);
  const lastUpdatedParam = `ge${sessionStartTime.toISOString()}`;

  const searchParams: EncounterSearchParams = {
    patient: patientUUID,
    _tag: 'encounter',
    _lastUpdated: lastUpdatedParam,
    type: encounterTypeUUID,
  };

  // Add participant filter if practitioner UUID is provided
  if (practitionerUUID) {
    searchParams.participant = practitionerUUID;
  }

  // Search for encounters within session duration
  // Server-side filtering by patient, duration, and practitioner (if provided)
  const encounters = await searchEncounters(searchParams);

  const hasSavedHint = !!(
    savedEncounterUUID &&
    practitionerUUID &&
    encounterTypeUUID
  );
  if (encounters.length === 0 && !hasSavedHint) return null;
  const activeVisit = await getActiveVisit(patientUUID);
  if (!activeVisit?.id) return null;
  const saved = hasSavedHint
    ? await readSavedEncounter(
        savedEncounterUUID,
        patientUUID,
        practitionerUUID!,
        activeVisit.id,
        encounterTypeUUID,
      )
    : null;
  const candidates = [
    ...encounters.filter(
      (encounter) => !hasSavedHint || encounter.id !== savedEncounterUUID,
    ),
    ...(saved &&
    Date.parse(saved.meta!.lastUpdated!) >= sessionStartTime.getTime()
      ? [saved]
      : []),
  ];
  return findEncounterInVisit(
    candidates,
    activeVisit.id,
    currentEpisodeEncounterUuids,
  );
}

/**
 * Checks if there is an active encounter session for a patient and practitioner
 * @param patientUUID - Patient UUID
 * @param practitionerUUID - Practitioner UUID (optional, for practitioner-specific sessions)
 * @returns Promise resolving to boolean indicating if session is active
 */
export async function hasActiveEncounterSession(
  patientUUID: string,
  practitionerUUID?: string,
): Promise<boolean> {
  const activeEncounter = await findActiveEncounterInSession(
    patientUUID,
    practitionerUUID,
  );
  return activeEncounter !== null;
}
