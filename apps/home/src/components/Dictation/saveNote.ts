/**
 * Saves the checked note to the patient's record as Bahmni's own "Consultation Note",
 * in the patient's open visit, through the same encounter endpoint the classic
 * clinical app uses. The classic screens and the patient record then show it.
 */
import {
  AUDIT_LOG_EVENT_DETAILS,
  dispatchAuditEvent,
  get,
  getCurrentProvider,
  getCurrentUser,
  getUserLoginLocation,
  MODULE_LABELS,
  OPENMRS_REST_V1,
  post,
  type AuditEventType,
} from '@bahmni/services';

export const NOTE_CONCEPT = 'Consultation Note';
export const NOTE_ENCOUNTER_TYPE = 'Consultation';

export type SaveNoteProblem =
  | 'no_visit'
  | 'no_location'
  | 'no_provider'
  | 'not_configured'
  | 'not_allowed'
  | 'failed';

export class SaveNoteError extends Error {
  constructor(readonly problem: SaveNoteProblem) {
    super(problem);
  }
}

export interface SavedNote {
  encounterUuid: string;
  observationUuid: string;
  visitType: string;
  text: string;
  savedAt: Date;
}

interface Named {
  uuid: string;
  name?: { name: string } | string;
  display?: string;
}

interface OpenVisit {
  uuid: string;
  visitType: { display: string };
}

interface SavedEncounter {
  encounterUuid: string;
  patientUuid: string;
  visitUuid: string;
  observations?: {
    uuid: string;
    concept: { uuid: string };
    value: unknown;
  }[];
}

const nameOf = ({ name, display }: Named) =>
  typeof name === 'string' ? name : (name?.name ?? display ?? '');

const findExact = async (resource: string, name: string) => {
  const { results } = await get<{ results: Named[] }>(
    `${OPENMRS_REST_V1}/${resource}?q=${encodeURIComponent(name)}&v=custom:(uuid,name${resource === 'concept' ? ':(name)' : ''})`,
  );
  return results.find(
    (result) => nameOf(result).toLowerCase() === name.toLowerCase(),
  )?.uuid;
};

const statusOf = (error: unknown) =>
  (error as { response?: { status?: number } })?.response?.status;

/** Saves the note, or updates the one saved earlier on this page. */
export const saveNoteToRecord = async (
  patientUuid: string,
  text: string,
  previous?: SavedNote,
): Promise<SavedNote> => {
  let locationUuid: string;
  try {
    locationUuid = getUserLoginLocation().uuid;
  } catch {
    throw new SaveNoteError('no_location');
  }

  try {
    const [visits, conceptUuid, encounterTypeUuid, user] = await Promise.all([
      get<{ results: OpenVisit[] }>(
        `${OPENMRS_REST_V1}/visit?patient=${encodeURIComponent(patientUuid)}&includeInactive=false&v=custom:(uuid,visitType:(display))`,
      ),
      findExact('concept', NOTE_CONCEPT),
      findExact('encountertype', NOTE_ENCOUNTER_TYPE),
      getCurrentUser(),
    ]);
    const visit = visits.results[0];
    if (!visit) throw new SaveNoteError('no_visit');
    if (!conceptUuid || !encounterTypeUuid) {
      throw new SaveNoteError('not_configured');
    }
    const provider = user ? await getCurrentProvider(user.uuid) : null;
    if (!provider?.uuid) throw new SaveNoteError('no_provider');

    const saved = await post<SavedEncounter>(
      `${OPENMRS_REST_V1}/bahmnicore/bahmniencounter`,
      {
        patientUuid,
        visitUuid: visit.uuid,
        visitType: visit.visitType.display,
        encounterTypeUuid,
        locationUuid,
        ...(previous ? { encounterUuid: previous.encounterUuid } : {}),
        providers: [{ uuid: provider.uuid }],
        observations: [
          {
            ...(previous ? { uuid: previous.observationUuid } : {}),
            concept: { uuid: conceptUuid, name: NOTE_CONCEPT },
            value: text,
          },
        ],
      },
    );
    // OpenMRS keeps an edited observation as a new one, so match on the text.
    const observation = saved.observations?.find(
      (obs) => obs.concept.uuid === conceptUuid && obs.value === text,
    );
    if (
      !saved.encounterUuid ||
      saved.patientUuid !== patientUuid ||
      !observation
    ) {
      throw new SaveNoteError('failed');
    }

    dispatchAuditEvent({
      eventType: AUDIT_LOG_EVENT_DETAILS.EDIT_ENCOUNTER
        .eventType as AuditEventType,
      patientUuid,
      messageParams: {
        encounterUuid: saved.encounterUuid,
        encounterType: NOTE_ENCOUNTER_TYPE,
      },
      module: MODULE_LABELS.CLINICAL,
    });
    return {
      encounterUuid: saved.encounterUuid,
      observationUuid: observation.uuid,
      visitType: visit.visitType.display,
      text,
      savedAt: new Date(),
    };
  } catch (error) {
    if (error instanceof SaveNoteError) throw error;
    const status = statusOf(error);
    throw new SaveNoteError(
      status === 401 || status === 403 ? 'not_allowed' : 'failed',
    );
  }
};
