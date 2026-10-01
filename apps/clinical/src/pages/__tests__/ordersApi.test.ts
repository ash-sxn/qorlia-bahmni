import { get, getOrderTypes, post } from '@bahmni/services';
import {
  fulfillmentPayload,
  getFulfillmentForm,
  getFulfillmentOrders,
  makeFulfillmentObservation,
  saveFulfillment,
  supportsFulfillmentForm,
  type FulfillmentConcept,
  type OrderObservation,
} from '../ordersApi';

jest.mock('@bahmni/services', () => ({
  ...jest.requireActual('@bahmni/services'),
  get: jest.fn(),
  post: jest.fn(),
  getOrderTypes: jest.fn(),
}));

const notes: FulfillmentConcept = {
  uuid: 'notes',
  name: { name: 'Radiology Notes' },
  datatype: { name: 'Text' },
  set: false,
  setMembers: [],
};
const image: FulfillmentConcept = {
  uuid: 'image',
  name: { name: 'Diagnostic Images' },
  datatype: { name: 'Complex' },
  handler: 'ImageUrlHandler',
  set: false,
  setMembers: [],
};
const form: FulfillmentConcept = {
  uuid: 'form',
  name: { name: 'Radiology order fulfillment form' },
  datatype: { name: 'N/A' },
  set: true,
  setMembers: [
    {
      uuid: 'summary',
      name: { name: 'Summary' },
      datatype: { name: 'N/A' },
      set: true,
      setMembers: [notes, image],
    },
  ],
};

beforeEach(() => jest.resetAllMocks());

it('loads the configured full concept tree and correct legacy order type', async () => {
  jest
    .mocked(get)
    .mockResolvedValueOnce({ results: [form] })
    .mockResolvedValueOnce([]);
  jest.mocked(getOrderTypes).mockResolvedValueOnce({
    results: [
      { uuid: 'radiology', display: 'Radiology Order', conceptClasses: [] },
    ],
  });
  expect(await getFulfillmentForm('Radiology Order')).toEqual(form);
  await getFulfillmentOrders('patient', 'Radiology Order', form, {
    orderUuid: 'order',
  });
  expect(get).toHaveBeenLastCalledWith(
    '/openmrs/ws/rest/v1/bahmnicore/orders',
    {
      paramsSerializer: { indexes: null },
      params: {
        patientUuid: 'patient',
        orderTypeUuid: 'radiology',
        concept: ['Summary'],
        includeObs: true,
        orderUuid: 'order',
      },
    },
  );
});

it('preserves nested results, comments and unexpected stored members without losing them', () => {
  const existing = makeFulfillmentObservation(form);
  existing.uuid = 'existing';
  existing.comment = 'keep comment';
  const extra: OrderObservation = {
    uuid: 'extra',
    concept: { uuid: 'extra', name: 'Other', dataType: 'Text' },
    value: 'keep',
    groupMembers: [],
  };
  existing.groupMembers.push(extra);
  const result = makeFulfillmentObservation(form, existing);
  expect(result.comment).toBe('keep comment');
  expect(result.groupMembers).toContainEqual(extra);
});

it('attaches every group and leaf to the order, prunes blanks and voids cleared existing results', () => {
  const draft = makeFulfillmentObservation(form);
  const summary = draft.groupMembers[0];
  summary.groupMembers[0].value = 'Normal';
  summary.groupMembers[1].uuid = 'old-image';
  summary.groupMembers[1].value = '';
  const payload = fulfillmentPayload(draft, 'order')!;
  expect(payload.orderUuid).toBe('order');
  expect(payload.groupMembers[0].orderUuid).toBe('order');
  expect(payload.groupMembers[0].groupMembers[0]).toMatchObject({
    value: 'Normal',
    orderUuid: 'order',
    voided: false,
  });
  expect(payload.groupMembers[0].groupMembers[1]).toMatchObject({
    uuid: 'old-image',
    orderUuid: 'order',
    voided: true,
  });
  expect(
    fulfillmentPayload(makeFulfillmentObservation(form), 'order'),
  ).toBeNull();
  expect(
    fulfillmentPayload({ ...summary.groupMembers[0], voided: true }, 'order'),
  ).toBeNull();
  summary.uuid = 'old-summary';
  summary.voided = true;
  expect(fulfillmentPayload(summary, 'order')!.groupMembers).toEqual([
    expect.objectContaining({ uuid: 'old-image', voided: true }),
  ]);
});

it('blocks saving when another user changed the current encounter', async () => {
  jest.mocked(post).mockResolvedValueOnce({
    encounterUuid: 'new-encounter',
    observations: [],
  });
  await expect(
    saveFulfillment(
      'patient',
      'location',
      'provider',
      'order',
      { encounterUuid: 'old-encounter', observations: [] },
      makeFulfillmentObservation(form),
    ),
  ).rejects.toThrow('changed');
  expect(post).toHaveBeenCalledTimes(1);
  expect(post).toHaveBeenCalledWith(
    '/openmrs/ws/rest/v1/bahmnicore/bahmniencounter/find',
    {
      patientUuid: 'patient',
      locationUuid: 'location',
      providerUuids: ['provider'],
      includeAll: false,
    },
  );
});

it('sends the legacy encounter save contract without creating a replacement order', async () => {
  jest.mocked(get).mockResolvedValueOnce({
    uuid: 'order',
    patient: { uuid: 'patient' },
    voided: false,
    action: 'NEW',
  });
  jest
    .mocked(post)
    .mockResolvedValueOnce({ encounterUuid: 'enc', observations: [] })
    .mockResolvedValueOnce({});
  const draft = makeFulfillmentObservation(form);
  draft.groupMembers[0].groupMembers[0].value = 'Normal';
  await saveFulfillment(
    'patient',
    'location',
    'provider',
    'order',
    { encounterUuid: 'enc', observations: [] },
    draft,
  );
  expect(post).toHaveBeenLastCalledWith(
    '/openmrs/ws/rest/v1/bahmnicore/bahmniencounter',
    expect.objectContaining({
      patientUuid: 'patient',
      locationUuid: 'location',
      providers: [{ uuid: 'provider' }],
      observations: [fulfillmentPayload(draft, 'order')],
      orders: [],
      drugOrders: [],
    }),
  );
  expect(get).toHaveBeenCalledWith('/openmrs/ws/rest/v1/order/order', {
    params: { v: 'full' },
  });
});

it.each([
  { voided: true },
  { action: 'DISCONTINUE' },
  { dateStopped: '2024-01-01T00:00:00Z' },
  { dateStopped: 'invalid-date' },
  { patient: { uuid: 'other-patient' } },
])(
  'preserves the draft instead of saving to an unavailable order: %j',
  async (change) => {
    jest
      .mocked(post)
      .mockResolvedValueOnce({ encounterUuid: 'enc', observations: [] });
    jest.mocked(get).mockResolvedValueOnce({
      uuid: 'order',
      patient: { uuid: 'patient' },
      voided: false,
      action: 'NEW',
      ...change,
    });
    const draft = makeFulfillmentObservation(form);
    draft.groupMembers[0].groupMembers[0].value = 'Normal';
    await expect(
      saveFulfillment(
        'patient',
        'location',
        'provider',
        'order',
        { encounterUuid: 'enc', observations: [] },
        draft,
      ),
    ).rejects.toThrow('draft has been kept');
    expect(post).toHaveBeenCalledTimes(1);
    expect(draft.groupMembers[0].groupMembers[0].value).toBe('Normal');
  },
);

it('does not silently render an unsupported datatype as free text', () => {
  expect(supportsFulfillmentForm(form)).toBe(true);
  expect(
    supportsFulfillmentForm({ ...notes, datatype: { name: 'Coded' } }),
  ).toBe(false);
  expect(supportsFulfillmentForm({ ...image, handler: 'OtherHandler' })).toBe(
    false,
  );
});
