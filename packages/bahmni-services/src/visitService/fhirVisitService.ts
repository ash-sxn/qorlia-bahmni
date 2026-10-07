import type { Encounter } from 'fhir/r4';
import { post } from '../api';
import { FHIR_ENCOUNTER_TAG_SYSTEM } from '../constants/fhir';
import {
  createFhirEncounterResource,
  FHIR_VISIT_TYPE_SYSTEM,
} from './constants';

const FHIR_ENCOUNTER_URL = '/openmrs/ws/fhir2/R4/Encounter';

export async function createVisitWithFhirR4(
  patientUuid: string,
  locationUuid: string,
  visitTypeUuid: string,
  episodeUuid?: string,
  endTime?: string,
): Promise<Encounter> {
  const resource = createFhirEncounterResource(
    patientUuid,
    locationUuid,
    visitTypeUuid,
    episodeUuid,
    endTime,
  );
  const visit = await post<Encounter>(FHIR_ENCOUNTER_URL, resource);
  // An HTTP success alone is not evidence that this patient's visit was saved.
  if (
    visit?.resourceType !== 'Encounter' ||
    typeof visit.id !== 'string' ||
    !visit.id.trim() ||
    typeof visit.subject?.reference !== 'string' ||
    visit.subject.reference.split('/').slice(-2).join('/') !==
      `Patient/${patientUuid}` ||
    !Array.isArray(visit.location) ||
    !visit.location.some(
      (item) =>
        typeof item?.location?.reference === 'string' &&
        item.location.reference.split('/').slice(-2).join('/') ===
          `Location/${locationUuid}`,
    ) ||
    !Array.isArray(visit.meta?.tag) ||
    !visit.meta.tag.some(
      (tag) =>
        tag?.system === FHIR_ENCOUNTER_TAG_SYSTEM && tag.code === 'visit',
    ) ||
    !Array.isArray(visit.type) ||
    !visit.type.some(
      (type) =>
        Array.isArray(type?.coding) &&
        type.coding.some(
          (coding) =>
            coding?.system === FHIR_VISIT_TYPE_SYSTEM &&
            coding.code === visitTypeUuid,
        ),
    ) ||
    typeof visit.period?.start !== 'string' ||
    !Number.isFinite(Date.parse(visit.period.start))
  ) {
    throw new Error('Invalid visit creation response');
  }
  return visit;
}
