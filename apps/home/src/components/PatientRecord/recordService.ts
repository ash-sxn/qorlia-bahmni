import { get, OPENMRS_REST_V1 } from '@bahmni/services';
import {
  LabResult,
  LabResultsResponse,
  NoteObservation,
  RecordVisit,
  RestPage,
} from './types';

// Read-only: every call in this file is a GET. Nothing here saves or changes data.

const VISIT_VIEW =
  'custom:(uuid,startDatetime,stopDatetime,visitType:(display),location:(display))';
const VISIT_PAGE_SIZE = 100;
/** A safety stop, so a server that keeps sending "next" cannot loop forever. */
const MAX_VISIT_PAGES = 20;

/** Every visit of the patient, open and closed. */
export const getPatientVisits = async (
  patientUuid: string,
): Promise<RecordVisit[]> => {
  const visits: RecordVisit[] = [];

  for (let page = 0; page < MAX_VISIT_PAGES; page += 1) {
    const params = new URLSearchParams({
      patient: patientUuid,
      includeInactive: 'true',
      v: VISIT_VIEW,
      limit: String(VISIT_PAGE_SIZE),
      startIndex: String(visits.length),
    });
    const response = await get<RestPage<RecordVisit>>(
      `${OPENMRS_REST_V1}/visit?${params}`,
    );
    visits.push(...response.results);

    if (!response.links?.some(({ rel }) => rel === 'next')) {
      return visits;
    }
  }

  throw new Error(
    `More than ${MAX_VISIT_PAGES * VISIT_PAGE_SIZE} visits for one patient; the list was stopped.`,
  );
};

/** Every lab result of the patient, from all visits. */
export const getPatientLabResults = async (
  patientUuid: string,
): Promise<LabResult[]> => {
  const params = new URLSearchParams({ patientUuid });
  const response = await get<LabResultsResponse>(
    `${OPENMRS_REST_V1}/bahmnicore/labOrderResults?${params}`,
  );
  return response.results ?? [];
};

const NOTE_CONCEPT = 'Consultation Note';

/** Consultation notes of the patient, newest first; none where the concept is missing. */
export const getPatientNotes = async (
  patientUuid: string,
): Promise<NoteObservation[]> => {
  const concepts = await get<
    RestPage<{ uuid: string; name: { name: string } }>
  >(
    `${OPENMRS_REST_V1}/concept?q=${encodeURIComponent(NOTE_CONCEPT)}&v=custom:(uuid,name:(name))`,
  );
  const concept = concepts.results.find(
    ({ name }) => name.name.toLowerCase() === NOTE_CONCEPT.toLowerCase(),
  );
  if (!concept) return [];
  const params = new URLSearchParams({
    patient: patientUuid,
    concept: concept.uuid,
    limit: '100',
    v: 'custom:(uuid,value,obsDatetime,encounter:(visit:(startDatetime),encounterProviders:(provider:(display))))',
  });
  const response = await get<RestPage<NoteObservation>>(
    `${OPENMRS_REST_V1}/obs?${params}`,
  );
  return response.results;
};
