import type { Bundle, ServiceRequest, Resource } from 'fhir/r4';
import { OPENMRS_FHIR_R4 } from '../constants/app';
import { getPatientEncounters } from '../encounterService';
import { getCompatiblePatientBundle } from '../fhirSearchCompatibility';
import { SERVICE_REQUEST_COUNT, SERVICE_REQUESTS_URL } from './constants';

/**
 * Fetches service requests from the FHIR R4 endpoint
 * @param category - Optional category UUID to filter by
 * @param patientUuid - Patient UUID to filter by
 * @param encounterUuids - Optional encounter UUIDs to filter by
 * @param numberOfVisits
 * @param revinclude - Optional _revinclude parameter for related resources
 * @returns Promise resolving to ServiceRequest Bundle
 */
export async function getServiceRequests<T extends Resource = ServiceRequest>(
  category: string,
  patientUuid: string,
  encounterUuids?: string[],
  numberOfVisits?: number,
  revinclude?: string,
): Promise<Bundle<T>> {
  let encounterUuidsString: string | undefined;

  if (encounterUuids && encounterUuids.length > 0) {
    encounterUuidsString = encounterUuids.join(',');
  }

  const preferredUrl = SERVICE_REQUESTS_URL(
    category,
    patientUuid,
    encounterUuidsString,
    numberOfVisits,
    revinclude,
  );
  const patientOnlyUrl = `${OPENMRS_FHIR_R4}/ServiceRequest?_count=${SERVICE_REQUEST_COUNT}&_sort=-_lastUpdated&patient=${patientUuid}`;
  const { bundle, usedFallback } = await getCompatiblePatientBundle<T>(
    preferredUrl,
    patientOnlyUrl,
    (resource) => {
      if (resource.resourceType !== 'ServiceRequest') return false;
      const request = resource as unknown as ServiceRequest;
      return (
        request.category?.some((item) =>
          item.coding?.some((coding) => coding.code === category),
        ) === true &&
        (!encounterUuidsString ||
          encounterUuids?.includes(
            request.encounter?.reference?.split('/').pop() ?? '',
          ) === true)
      );
    },
  );

  if (
    usedFallback &&
    numberOfVisits &&
    !encounterUuidsString &&
    bundle.entry?.length
  ) {
    const encounters = await getPatientEncounters(patientUuid);
    const visits = encounters
      .filter((encounter) =>
        encounter.meta?.tag?.some((tag) => tag.code === 'visit'),
      )
      .sort(
        (a, b) =>
          Date.parse(b.period?.start ?? '') - Date.parse(a.period?.start ?? ''),
      )
      .slice(0, numberOfVisits);
    const visitIds = new Set(visits.map((visit) => visit.id));
    const encounterIds = new Set(
      encounters
        .filter(
          (encounter) =>
            visitIds.has(encounter.id) ||
            visitIds.has(encounter.partOf?.reference?.split('/').pop()),
        )
        .map((encounter) => encounter.id),
    );
    const entries = bundle.entry?.filter((entry) =>
      encounterIds.has(
        (entry.resource as ServiceRequest | undefined)?.encounter?.reference
          ?.split('/')
          .pop(),
      ),
    );
    return { ...bundle, entry: entries, total: entries?.length ?? 0 };
  }

  return bundle;
}
