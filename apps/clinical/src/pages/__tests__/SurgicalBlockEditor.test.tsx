import { get, post } from '@bahmni/services';
import {
  cancelSurgicalBlock,
  saveSurgicalBlock,
  validateSurgicalBlock,
} from '../SurgicalBlockEditor';

jest.mock('@bahmni/services', () => ({
  ...jest.requireActual('@bahmni/services'),
  get: jest.fn(),
  post: jest.fn(),
}));

const row = {
  patientUuid: 'patient-1',
  patientLabel: 'Demo patient',
  notes: '',
  values: { estTimeHours: '1', estTimeMinutes: '0', cleaningTime: '15' },
};

beforeEach(() => jest.clearAllMocks());

it('rejects surgery durations longer than the theatre block', () => {
  expect(
    validateSurgicalBlock(
      '2026-09-28T09:00',
      '2026-09-28T10:00',
      'surgeon-1',
      'theatre-1',
      [row],
      [],
    ),
  ).toMatch(/exceed/);
});

it('creates a block with the selected patient and configured attributes', async () => {
  jest.mocked(post).mockResolvedValueOnce({ uuid: 'block-new' });
  await saveSurgicalBlock(
    undefined,
    '2026-09-28T09:00',
    '2026-09-28T11:00',
    'surgeon-1',
    'theatre-1',
    [row],
    [{ uuid: 'hours-1', name: 'estTimeHours', format: 'java.lang.Integer' }],
  );
  expect(post).toHaveBeenCalledWith(
    '/openmrs/ws/rest/v1/surgicalBlock',
    expect.objectContaining({
      provider: { uuid: 'surgeon-1' },
      location: { uuid: 'theatre-1' },
      surgicalAppointments: [
        expect.objectContaining({
          patient: { uuid: 'patient-1' },
          status: 'SCHEDULED',
          surgicalAppointmentAttributes: [
            expect.objectContaining({
              value: '1',
              surgicalAppointmentAttributeType: expect.objectContaining({
                uuid: 'hours-1',
              }),
            }),
          ],
        }),
      ],
    }),
    { params: { v: 'full' } },
  );
});

it('does not overwrite a block changed since it was loaded', async () => {
  const loaded = {
    uuid: 'block-1',
    startDatetime: '2026-09-28T09:00:00.000Z',
    endDatetime: '2026-09-28T11:00:00.000Z',
    provider: { uuid: 'surgeon-1' },
    location: { uuid: 'theatre-1' },
    surgicalAppointments: [],
  };
  jest.mocked(get).mockResolvedValueOnce({
    ...loaded,
    endDatetime: '2026-09-28T12:00:00.000Z',
  });
  await expect(
    saveSurgicalBlock(
      loaded,
      '2026-09-28T09:00',
      '2026-09-28T11:00',
      'surgeon-1',
      'theatre-1',
      [],
      [],
    ),
  ).rejects.toThrow(/changed/);
  expect(post).not.toHaveBeenCalled();
});

it('preserves attributes and cancelled surgeries without sending read-only fields', async () => {
  const attribute = {
    id: 4,
    value: 'Keep me',
    resourceVersion: '1.8',
    surgicalAppointmentAttributeType: {
      uuid: 'hidden-1',
      name: 'hiddenAttribute',
      format: 'java.lang.String',
      sortWeight: 1,
      resourceVersion: '1.8',
    },
  };
  const surgery = {
    id: 2,
    uuid: 'surgery-1',
    patient: { uuid: 'patient-1' },
    status: 'SCHEDULED',
    sortWeight: 0,
    bedNumber: 'GW-1',
    bedLocation: { uuid: 'ward-1' },
    patientObservations: [{ uuid: 'observation-1' }],
    resourceVersion: '1.8',
    surgicalAppointmentAttributes: [attribute],
  };
  const cancelled = {
    ...surgery,
    id: 3,
    uuid: 'cancelled-1',
    status: 'CANCELLED',
  };
  const loaded = {
    id: 1,
    uuid: 'block-1',
    startDatetime: '2026-09-28T09:00:00.000Z',
    endDatetime: '2026-09-28T11:00:00.000Z',
    provider: { uuid: 'surgeon-1' },
    location: { uuid: 'theatre-1' },
    surgicalAppointments: [surgery, cancelled],
  };
  jest.mocked(get).mockResolvedValueOnce(loaded);
  jest.mocked(post).mockResolvedValueOnce(loaded);
  await saveSurgicalBlock(
    loaded,
    '2026-09-28T09:00',
    '2026-09-28T11:00',
    'surgeon-1',
    'theatre-1',
    [
      {
        ...row,
        uuid: surgery.uuid,
        original: surgery,
        values: { ...row.values, hiddenAttribute: 'Keep me' },
      },
    ],
    [attribute.surgicalAppointmentAttributeType],
  );
  const payload = jest.mocked(post).mock.calls[0][1] as typeof loaded;
  expect(payload.surgicalAppointments).toHaveLength(2);
  for (const saved of payload.surgicalAppointments) {
    expect(saved).not.toHaveProperty('bedNumber');
    expect(saved).not.toHaveProperty('bedLocation');
    expect(saved).not.toHaveProperty('patientObservations');
    expect(saved).not.toHaveProperty('resourceVersion');
    expect(saved.surgicalAppointmentAttributes).toEqual([
      {
        id: 4,
        value: 'Keep me',
        surgicalAppointmentAttributeType: { uuid: 'hidden-1' },
      },
    ]);
  }
  expect(payload.surgicalAppointments[1]).toMatchObject({
    id: cancelled.id,
    uuid: cancelled.uuid,
    status: 'CANCELLED',
    patient: { uuid: 'patient-1' },
  });
});

it('cancels one surgery with a reason and keeps the other scheduled', async () => {
  const surgeries = [
    {
      uuid: 'surgery-1',
      patient: { uuid: 'patient-1' },
      status: 'SCHEDULED',
      sortWeight: 0,
      surgicalAppointmentAttributes: [],
    },
    {
      uuid: 'surgery-2',
      patient: { uuid: 'patient-2' },
      status: 'SCHEDULED',
      sortWeight: 1,
      surgicalAppointmentAttributes: [],
    },
  ];
  const loaded = {
    uuid: 'block-1',
    startDatetime: '2026-09-28T09:00:00.000Z',
    endDatetime: '2026-09-28T11:00:00.000Z',
    provider: { uuid: 'surgeon-1' },
    location: { uuid: 'theatre-1' },
    surgicalAppointments: surgeries,
  };
  const rows = surgeries.map((surgery) => ({
    ...row,
    uuid: surgery.uuid,
    patientUuid: surgery.patient.uuid,
    original: surgery,
  }));
  await expect(
    saveSurgicalBlock(
      loaded,
      '2026-09-28T09:00',
      '2026-09-28T11:00',
      'surgeon-1',
      'theatre-1',
      [{ ...rows[0], status: 'CANCELLED' }, rows[1]],
      [],
    ),
  ).rejects.toThrow(/reason/);
  expect(get).not.toHaveBeenCalled();
  jest.mocked(get).mockResolvedValueOnce(loaded);
  jest.mocked(post).mockResolvedValueOnce(loaded);
  await saveSurgicalBlock(
    loaded,
    '2026-09-28T09:00',
    '2026-09-28T11:00',
    'surgeon-1',
    'theatre-1',
    [{ ...rows[0], status: 'CANCELLED', notes: 'Patient unwell' }, rows[1]],
    [],
  );
  const payload = jest.mocked(post).mock.calls[0][1] as typeof loaded;
  expect(payload.surgicalAppointments[0]).toMatchObject({
    uuid: 'surgery-1',
    status: 'CANCELLED',
    sortWeight: null,
    notes: 'Patient unwell',
  });
  expect(payload.surgicalAppointments[1]).toMatchObject({
    uuid: 'surgery-2',
    status: 'SCHEDULED',
    sortWeight: 0,
  });
});

it('cancels only scheduled surgeries when cancelling a block', async () => {
  const loaded = {
    id: 1,
    uuid: 'block-1',
    startDatetime: '2026-09-28T09:00:00.000Z',
    endDatetime: '2026-09-28T11:00:00.000Z',
    provider: { uuid: 'surgeon-1' },
    location: { uuid: 'theatre-1' },
    surgicalAppointments: [
      {
        id: 2,
        uuid: 'surgery-1',
        patient: { uuid: 'patient-1' },
        status: 'SCHEDULED',
        sortWeight: 0,
        notes: 'Old note',
        bedNumber: 'GW-1',
        resourceVersion: '1.8',
        surgicalAppointmentAttributes: [
          {
            id: 4,
            value: 'Keep this attribute',
            resourceVersion: '1.8',
            surgicalAppointmentAttributeType: {
              uuid: 'attribute-type-1',
              name: 'procedure',
              format: 'java.lang.String',
              sortWeight: 1,
            },
          },
        ],
      },
      {
        id: 3,
        uuid: 'surgery-2',
        patient: { uuid: 'patient-2' },
        status: 'COMPLETED',
        sortWeight: 1,
        notes: 'Keep this note',
        surgicalAppointmentAttributes: [],
      },
    ],
  };
  jest.mocked(get).mockResolvedValueOnce(loaded);
  jest.mocked(post).mockResolvedValueOnce(loaded);
  await cancelSurgicalBlock(loaded, 'CANCELLED', 'Theatre unavailable');
  const payload = jest.mocked(post).mock.calls[0][1] as typeof loaded & {
    voided: boolean;
    voidReason: string;
  };
  expect(payload.voided).toBe(true);
  expect(payload.voidReason).toBe('Theatre unavailable');
  expect(payload.surgicalAppointments[0]).toMatchObject({
    status: 'CANCELLED',
    sortWeight: null,
    notes: 'Theatre unavailable',
  });
  expect(payload.surgicalAppointments[0]).not.toHaveProperty('bedNumber');
  expect(payload.surgicalAppointments[0]).not.toHaveProperty('resourceVersion');
  expect(payload.surgicalAppointments[0].surgicalAppointmentAttributes).toEqual(
    [
      {
        id: 4,
        value: 'Keep this attribute',
        surgicalAppointmentAttributeType: { uuid: 'attribute-type-1' },
      },
    ],
  );
  expect(payload.surgicalAppointments[1]).toMatchObject({
    status: 'COMPLETED',
    sortWeight: 1,
    notes: 'Keep this note',
  });
});
