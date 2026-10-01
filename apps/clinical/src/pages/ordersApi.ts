import { get, getOrderTypes, post } from '@bahmni/services';

const core = '/openmrs/ws/rest/v1/bahmnicore';

export interface FulfillmentConcept {
  uuid: string;
  name: { name: string };
  datatype: { name: string };
  handler?: string;
  set: boolean;
  setMembers: FulfillmentConcept[];
}

export interface OrderObservation {
  uuid?: string;
  concept: { uuid: string; name: string; dataType: string };
  value?: unknown;
  groupMembers: OrderObservation[];
  orderUuid?: string;
  voided?: boolean;
  comment?: string;
}

export interface FulfillmentOrder {
  orderUuid: string;
  concept: { name: string; shortName?: string };
  orderNumber?: string;
  orderDate?: string;
  commentToFulfiller?: string;
  hasObservations?: boolean;
  bahmniObservations?: OrderObservation[];
}

export interface FulfillmentEncounter {
  encounterUuid?: string;
  visitUuid?: string;
  observations: OrderObservation[];
}

export const findFulfillmentEncounter = (
  patientUuid: string,
  locationUuid: string,
  providerUuid: string,
) =>
  post<FulfillmentEncounter>(`${core}/bahmniencounter/find`, {
    patientUuid,
    locationUuid,
    providerUuids: [providerUuid],
    includeAll: false,
  });

export const getFulfillmentForm = async (orderType: string) => {
  const response = await get<{ results: FulfillmentConcept[] }>(
    '/openmrs/ws/rest/v1/concept',
    {
      params: {
        s: 'byFullySpecifiedName',
        name: `${orderType} Fulfillment Form`,
        v: 'bahmni',
      },
    },
  );
  const form = response.results[0];
  if (!form)
    throw new Error(`No fulfillment form is configured for ${orderType}.`);
  return form;
};

export const getFulfillmentOrders = async (
  patientUuid: string,
  orderType: string,
  form: FulfillmentConcept,
  filters: { visitUuid?: string; orderUuid?: string } = {},
) => {
  const types = await getOrderTypes();
  const type = types.results.find((item) => item.display === orderType);
  if (!type) throw new Error(`Unknown order type: ${orderType}.`);
  return get<FulfillmentOrder[]>(`${core}/orders`, {
    paramsSerializer: { indexes: null },
    params: {
      patientUuid,
      orderTypeUuid: type.uuid,
      concept: form.setMembers.map((member) => member.name.name),
      includeObs: true,
      ...filters,
    },
  });
};

export const observationsForOrder = (
  encounter: FulfillmentEncounter,
  orderUuid: string,
) => encounter.observations.filter((obs) => obs.orderUuid === orderUuid);

export const makeFulfillmentObservation = (
  concept: FulfillmentConcept,
  existing?: OrderObservation,
): OrderObservation => ({
  ...existing,
  concept: {
    uuid: concept.uuid,
    name: concept.name.name,
    dataType: concept.datatype.name,
  },
  groupMembers: concept.set
    ? concept.setMembers
        .flatMap((member) => {
          const found = existing?.groupMembers.filter(
            (obs) => obs.concept.uuid === member.uuid,
          );
          return found?.length
            ? found.map((obs) => makeFulfillmentObservation(member, obs))
            : [makeFulfillmentObservation(member)];
        })
        .concat(
          existing?.groupMembers.filter(
            (obs) =>
              !concept.setMembers.some(
                (member) => member.uuid === obs.concept.uuid,
              ),
          ) ?? [],
        )
    : [],
});

// ponytail: this editor covers Standard's text/image form. Other form controls
// remain blocked until their validation and behavior have a React equivalent.
export const supportsFulfillmentForm = (
  concept: FulfillmentConcept,
): boolean =>
  concept.set
    ? concept.setMembers.length > 0 &&
      concept.setMembers.every(supportsFulfillmentForm)
    : concept.datatype.name === 'Text' ||
      (concept.datatype.name === 'Complex' &&
        concept.handler === 'ImageUrlHandler');

export const fulfillmentPayload = (
  observation: OrderObservation,
  orderUuid: string,
): OrderObservation | null => {
  if (!observation.uuid && observation.voided) return null;
  const groupMembers = observation.groupMembers
    .map((member) =>
      fulfillmentPayload(
        observation.voided ? { ...member, voided: true } : member,
        orderUuid,
      ),
    )
    .filter((member): member is OrderObservation => member !== null);
  const hasValue =
    observation.value !== undefined &&
    observation.value !== null &&
    observation.value !== '';
  if (!observation.uuid && !hasValue && groupMembers.length === 0) return null;
  return {
    ...observation,
    orderUuid,
    groupMembers,
    voided:
      !!observation.voided ||
      (!!observation.uuid &&
        !hasValue &&
        groupMembers.every((member) => member.voided)),
  };
};

export const saveFulfillment = async (
  patientUuid: string,
  locationUuid: string,
  providerUuid: string,
  orderUuid: string,
  snapshot: FulfillmentEncounter,
  observation: OrderObservation,
) => {
  const current = await findFulfillmentEncounter(
    patientUuid,
    locationUuid,
    providerUuid,
  );
  if (
    current.encounterUuid !== snapshot.encounterUuid ||
    current.visitUuid !== snapshot.visitUuid ||
    JSON.stringify(observationsForOrder(current, orderUuid)) !==
      JSON.stringify(observationsForOrder(snapshot, orderUuid))
  ) {
    throw new Error(
      'This encounter or result changed. Reload it before saving. Your draft has been kept.',
    );
  }
  const payload = fulfillmentPayload(observation, orderUuid);
  if (!payload)
    throw new Error('Enter a result or attach a file before saving.');
  const order = await get<{
    uuid: string;
    patient: { uuid: string };
    voided: boolean;
    action: string;
    dateStopped?: string | null;
  }>(`/openmrs/ws/rest/v1/order/${encodeURIComponent(orderUuid)}`, {
    params: { v: 'full' },
  });
  if (
    order.uuid !== orderUuid ||
    order.patient?.uuid !== patientUuid ||
    order.voided ||
    order.action === 'DISCONTINUE' ||
    (order.dateStopped &&
      (!Number.isFinite(Date.parse(order.dateStopped)) ||
        Date.parse(order.dateStopped) <= Date.now()))
  ) {
    throw new Error(
      'This order is unavailable or has been stopped. Reload it before saving. Your draft has been kept.',
    );
  }
  return post(`${core}/bahmniencounter`, {
    patientUuid,
    locationUuid,
    providers: [{ uuid: providerUuid }],
    observations: [payload],
    orders: [],
    drugOrders: [],
  });
};
