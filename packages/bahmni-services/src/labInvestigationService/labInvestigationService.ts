import { Bundle, ServiceRequest } from 'fhir/r4';
import { get } from '../api';
import { OPENMRS_REST_V1 } from '../constants/app';
import { FHIR_LAB_ORDER_CONCEPT_TYPE_EXTENSION_URL } from '../constants/fhir';
import { getServiceRequestsWithCompatibility } from '../orderRequestService';

const LEGACY_DEFAULT_NUMBER_OF_VISITS = 5;

interface LegacyBahmniOrder {
  orderUuid: string;
  orderTypeUuid?: string;
  provider?: string;
  orderDate?: number;
  commentToFulfiller?: string | null;
  concept?: { uuid?: string; name?: string; set?: boolean };
}

const toServiceRequest = (
  order: LegacyBahmniOrder,
  category: string,
  patientUUID: string,
): ServiceRequest => ({
  resourceType: 'ServiceRequest',
  id: order.orderUuid,
  status: 'active',
  intent: 'order',
  category: [{ coding: [{ code: category }] }],
  code: {
    coding: order.concept?.uuid ? [{ code: order.concept.uuid }] : undefined,
    text: order.concept?.name ?? '',
  },
  subject: { reference: `Patient/${patientUUID}` },
  ...(order.orderDate
    ? { occurrencePeriod: { start: new Date(order.orderDate).toISOString() } }
    : {}),
  ...(order.provider ? { requester: { display: order.provider } } : {}),
  ...(order.commentToFulfiller
    ? { note: [{ text: order.commentToFulfiller }] }
    : {}),
  ...(order.concept?.set
    ? {
        extension: [
          {
            url: FHIR_LAB_ORDER_CONCEPT_TYPE_EXTENSION_URL,
            valueString: 'Panel',
          },
        ],
      }
    : {}),
});

/**
 * Reads lab orders through Bahmni's own order API, for older backends whose
 * FHIR ServiceRequest search cannot filter by order type and does not expose
 * Bahmni's generic orders. Read only.
 */
const getLegacyLabOrdersBundle = async (
  patientUUID: string,
  category: string,
  numberOfVisits?: number,
): Promise<Bundle<ServiceRequest>> => {
  const params = new URLSearchParams({
    patientUuid: patientUUID,
    orderTypeUuid: category,
    includeActiveVisit: 'true',
    numberOfVisits: String(numberOfVisits ?? LEGACY_DEFAULT_NUMBER_OF_VISITS),
  });
  const orders = await get<LegacyBahmniOrder[]>(
    `${OPENMRS_REST_V1}/bahmnicore/orders?${params.toString()}`,
  );
  const requests = (Array.isArray(orders) ? orders : [])
    .filter((order) => !!order.orderUuid && order.orderTypeUuid === category)
    .map((order) => toServiceRequest(order, category, patientUUID));
  return {
    resourceType: 'Bundle',
    type: 'searchset',
    total: requests.length,
    entry: requests.map((resource) => ({ resource })),
  };
};

/**
 * Fetches lab investigation bundle from the FHIR R4 endpoint
 * @param category - The category UUID to filter by (order type)
 * @param patientUuid - Patient UUID to filter by
 * @param encounterUuids - Optional encounter UUIDs to filter by
 * @param numberOfVisits - Optional number of visits to filter by
 * @returns Promise resolving to ServiceRequest Bundle
 */
export async function getLabInvestigationsBundle(
  patientUUID: string,
  category: string,
  encounterUuids?: string[],
  numberOfVisits?: number,
): Promise<Bundle<ServiceRequest>> {
  const { bundle, usedFallback } = await getServiceRequestsWithCompatibility(
    category,
    patientUUID,
    encounterUuids,
    numberOfVisits,
  );
  // Bahmni's order API has no encounter field, so an encounter-scoped view
  // keeps the FHIR result rather than showing unscoped orders.
  if (!usedFallback || bundle.entry?.length || encounterUuids?.length)
    return bundle;
  return getLegacyLabOrdersBundle(patientUUID, category, numberOfVisits);
}
