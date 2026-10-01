import {
  AUDIT_LOG_EVENT_DETAILS,
  MODULE_LABELS,
  dispatchAuditEvent,
  getCurrentProvider,
  getCurrentUser,
  getUserLoginLocation,
  get,
  post,
  OPENMRS_REST_V1,
  type AuditEventType,
} from '@bahmni/services';

const ENCOUNTER_TYPE_URL = `${OPENMRS_REST_V1}/encountertype`;

interface RegistrationEncounter {
  encounterUuid: string;
  patientUuid: string;
  visitUuid: string;
  encounterTypeName?: string;
}

interface RegistrationVisit {
  uuid: string;
  patient: { uuid: string };
  startDatetime: string;
  stopDatetime: string | null;
  voided?: boolean;
}

/**
 * Creates a registration encounter for patient.
 * Uses the same transactional REST endpoint as legacy Bahmni. The older demo
 * FHIR provider fails when saving the encounter's provider relationship.
 */
export async function createRegistrationEncounterForPatient(
  patientUuid: string,
  encounterTypeUuid: string,
  options?: { visitUuid?: string; periodStart?: string },
): Promise<RegistrationEncounter> {
  const locationUuid = getUserLoginLocation().uuid;
  const user = await getCurrentUser();
  const provider = user ? await getCurrentProvider(user.uuid) : null;
  if (
    !options?.visitUuid ||
    !locationUuid ||
    !provider?.uuid ||
    !encounterTypeUuid
  )
    throw new Error(
      'Visit, location, encounter type and provider are required for registration.',
    );
  const visit = await get<RegistrationVisit>(
    `${OPENMRS_REST_V1}/visit/${encodeURIComponent(options.visitUuid)}?v=full`,
  );
  if (
    visit.uuid !== options.visitUuid ||
    visit.patient.uuid !== patientUuid ||
    visit.voided ||
    visit.stopDatetime
  )
    throw new Error(
      'The visit is no longer active for this patient. Reload before continuing.',
    );
  const createdEncounter = await post<RegistrationEncounter>(
    `${OPENMRS_REST_V1}/bahmnicore/bahmniencounter`,
    {
      patientUuid,
      encounterTypeUuid,
      locationUuid,
      visitUuid: visit.uuid,
      encounterDateTime: visit.startDatetime,
      providers: [{ uuid: provider.uuid }],
      observations: [],
    },
  );
  if (
    !createdEncounter.encounterUuid ||
    createdEncounter.patientUuid !== patientUuid ||
    createdEncounter.visitUuid !== visit.uuid
  )
    throw new Error(
      'Registration encounter save could not be confirmed. Refresh before retrying.',
    );
  const encounterTypeName =
    createdEncounter.encounterTypeName ?? encounterTypeUuid;

  // EDIT_ENCOUNTER is a shared event with no default module (Clinical relies on
  // that), so the registration module is passed explicitly here.
  dispatchAuditEvent({
    eventType: AUDIT_LOG_EVENT_DETAILS.EDIT_ENCOUNTER
      .eventType as AuditEventType,
    patientUuid,
    messageParams: {
      encounterUuid: createdEncounter.encounterUuid,
      encounterType: encounterTypeName,
    },
    module: MODULE_LABELS.REGISTRATION,
  });
  return createdEncounter;
}

export async function getEncounterTypeUuidByName(
  name: string,
): Promise<string | undefined> {
  const response = await get<{ results: { uuid: string; name: string }[] }>(
    `${ENCOUNTER_TYPE_URL}?q=${encodeURIComponent(name)}&v=default`,
  );
  return response.results.find((r) => r.name === name)?.uuid;
}
