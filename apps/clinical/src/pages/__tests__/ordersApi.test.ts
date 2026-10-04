import { formatDateTime, get, getOrderTypes, post } from '@bahmni/services';
import {
  fulfillmentPayload,
  fulfillmentDateForControl,
  getFulfillmentForm,
  getFulfillmentOrders,
  makeFulfillmentObservation,
  saveFulfillment,
  supportsFulfillmentForm,
  validateFulfillmentObservation,
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

it.each([
  [0, {}, undefined],
  [12, {}, undefined],
  [4, { lowNormal: 10 }, undefined],
  [-1, {}, 'allowable range'],
  [-1, { lowAbsolute: -2 }, undefined],
  [1, { hiAbsolute: 0 }, 'allowable range'],
  [101, { hiAbsolute: 100 }, 'allowable range'],
  [1.5, {}, 'whole number'],
  [1.5, { allowDecimal: true }, undefined],
  ['1', {}, 'must be a number'],
  [NaN, {}, 'must be a number'],
  [Infinity, {}, 'must be a number'],
] as const)(
  'validates numeric results without blocking abnormal reference values: %p, %p',
  (value, metadata, error) => {
    const field = {
      ...notes,
      datatype: { name: 'Numeric' },
      ...metadata,
    };
    const draft = { ...makeFulfillmentObservation(field), value };
    const result = validateFulfillmentObservation(field, draft, {});
    if (error) expect(result).toContain(error);
    else expect(result).toBeUndefined();
  },
);

it('validates configured coded answers and preserves zero, answer IDs and notes', () => {
  const field = {
    ...notes,
    datatype: { name: 'Coded' },
    answers: [{ uuid: 'answer', name: { name: 'Answer' } }],
  };
  const draft = makeFulfillmentObservation(field);
  for (const value of ['answer', { uuid: 'answer', name: 'Answer' }]) {
    draft.value = value;
    draft.comment = 'Synthetic note';
    expect(validateFulfillmentObservation(field, draft, {})).toBeUndefined();
    expect(fulfillmentPayload(draft, 'order')).toMatchObject({
      value,
      comment: 'Synthetic note',
      orderUuid: 'order',
    });
  }
  draft.value = { uuid: 'unknown' };
  expect(validateFulfillmentObservation(field, draft, {})).toContain(
    'configured answer',
  );
  draft.value = 0;
  expect(fulfillmentPayload(draft, 'order')).toMatchObject({ value: 0 });
});

it('checks required results only when some result remains, so existing results can be cleared', () => {
  const draft = makeFulfillmentObservation(form);
  const required = { 'Radiology Notes': { required: true } };
  expect(validateFulfillmentObservation(form, draft, required)).toBeUndefined();
  draft.groupMembers[0].groupMembers[1].value = 'patient/image.png';
  expect(validateFulfillmentObservation(form, draft, required)).toBe(
    'Radiology Notes is required.',
  );
  draft.groupMembers[0].groupMembers[1].voided = true;
  expect(validateFulfillmentObservation(form, draft, required)).toBeUndefined();
  draft.groupMembers[0].groupMembers[0].value = 'Synthetic note';
  expect(validateFulfillmentObservation(form, draft, required)).toBeUndefined();
  expect(supportsFulfillmentForm(form, required)).toBe(true);
  expect(
    supportsFulfillmentForm(form, { 'Radiology Notes': { required: 'true' } }),
  ).toBe(false);
  expect(
    supportsFulfillmentForm({ ...notes, conceptClass: { name: 'Computed' } }),
  ).toBe(false);
});

it('supports ordinary date and datetime fields without ignoring specialized calendar configuration', () => {
  for (const name of ['Date', 'Datetime']) {
    const field = { ...notes, datatype: { name } };
    expect(supportsFulfillmentForm(field)).toBe(true);
    expect(
      supportsFulfillmentForm(field, {
        'Radiology Notes': { allowFutureDates: true, required: true },
      }),
    ).toBe(true);
    expect(
      supportsFulfillmentForm(field, {
        'Radiology Notes': { displayMonthAndYear: true },
      }),
    ).toBe(false);
  }
});

it('validates calendar dates, local times and future-date permission before serializing results', () => {
  jest.useFakeTimers().setSystemTime(new Date('2026-10-04T10:30:00Z'));
  try {
    const date = { ...notes, datatype: { name: 'Date' } };
    const datetime = { ...notes, datatype: { name: 'Datetime' } };
    for (const value of [
      '2025-02-29',
      '2026-02-30',
      'invalid',
      '0000-01-01',
      '+010000-01-01',
      false,
      Infinity,
    ]) {
      expect(
        validateFulfillmentObservation(
          date,
          { ...makeFulfillmentObservation(date), value },
          {},
        ),
      ).toContain('valid date');
    }
    for (const value of ['2024-02-29', '2026-10-03']) {
      const draft = { ...makeFulfillmentObservation(date), value };
      expect(validateFulfillmentObservation(date, draft, {})).toBeUndefined();
      expect(fulfillmentPayload(draft, 'order')).toMatchObject({
        value,
      });
    }
    const future = { ...makeFulfillmentObservation(date), value: '2999-10-04' };
    expect(validateFulfillmentObservation(date, future, {})).toContain(
      'cannot be in the future',
    );
    expect(
      validateFulfillmentObservation(date, future, {
        'Radiology Notes': { allowFutureDates: true },
      }),
    ).toBeUndefined();
    for (const value of [
      '2026-10-03T13:25',
      '2026-10-03 13:25:17',
      '2026-10-03T13:25:17+05:30',
      1791019517000,
    ]) {
      const draft = { ...makeFulfillmentObservation(datetime), value };
      expect(
        validateFulfillmentObservation(datetime, draft, {}),
      ).toBeUndefined();
      expect(fulfillmentPayload(draft, 'order')).toMatchObject({
        value: formatDateTime(
          new Date(value),
          undefined,
          false,
          'yyyy-MM-dd HH:mm',
        ).formattedResult,
      });
    }
    for (const value of [
      '2026-10-04T10:31:00Z',
      'Invalid Datetime',
      '2026-10-04T25:00',
    ]) {
      expect(
        validateFulfillmentObservation(
          datetime,
          { ...makeFulfillmentObservation(datetime), value },
          {},
        ),
      ).toBeDefined();
    }
    expect(
      validateFulfillmentObservation(
        datetime,
        {
          ...makeFulfillmentObservation(datetime),
          value: '2026-10-04T10:30:00Z',
        },
        {},
      ),
    ).toBeUndefined();
  } finally {
    jest.useRealTimers();
  }
});

it('preserves a Boolean No result and rejects strings in place of Boolean answers', () => {
  const field = { ...notes, datatype: { name: 'Boolean' } };
  expect(supportsFulfillmentForm(field)).toBe(true);
  for (const value of [false, true]) {
    const draft = {
      ...makeFulfillmentObservation(field),
      value,
      comment: 'QorliaQA synthetic note',
    };
    expect(validateFulfillmentObservation(field, draft, {})).toBeUndefined();
    expect(fulfillmentPayload(draft, 'order')).toMatchObject({
      value,
      voided: false,
    });
  }
  expect(
    validateFulfillmentObservation(
      field,
      { ...makeFulfillmentObservation(field), value: 'false' },
      {},
    ),
  ).toContain('Yes or No');
});

it('uses the legacy local minute-precision contract and rejects nonexistent local times', () => {
  const field = { ...notes, datatype: { name: 'Datetime' } };
  const persisted = '2026-10-03T13:25:17+05:30';
  const local = fulfillmentDateForControl(persisted, true);
  expect(local).toMatch(/^2026-10-03T\d{2}:\d{2}$/);
  expect(
    fulfillmentPayload(
      { ...makeFulfillmentObservation(field), value: local },
      'order',
    ),
  ).toMatchObject({ value: local.replace('T', ' ') });
  const date = { ...notes, datatype: { name: 'Date' } };
  expect(
    fulfillmentPayload(
      { ...makeFulfillmentObservation(date), value: '2026-10-03' },
      'order',
    ),
  ).toMatchObject({ value: '2026-10-03' });
  expect(
    fulfillmentPayload(
      { ...makeFulfillmentObservation(field), value: '2026-10-03T13:25' },
      'order',
    ),
  ).toMatchObject({ value: '2026-10-03 13:25' });
  expect(fulfillmentDateForControl('2026-02-30')).toBe('');
  expect(fulfillmentDateForControl('0001-01-01')).toBe('0001-01-01');
  const skipped = '2026-03-08T02:30:00';
  const rollsForward = new Date(skipped).getHours() !== 2;
  const result = validateFulfillmentObservation(
    field,
    { ...makeFulfillmentObservation(field), value: skipped },
    {},
  );
  if (rollsForward) {
    expect(result).toContain('valid date and time');
    expect(fulfillmentDateForControl(skipped, true)).toBe('');
  } else expect(result).toBeUndefined();
  const cleared = {
    ...makeFulfillmentObservation(field),
    uuid: 'saved-date',
    value: '',
  };
  expect(fulfillmentPayload(cleared, 'order')).toMatchObject({ voided: true });
});
