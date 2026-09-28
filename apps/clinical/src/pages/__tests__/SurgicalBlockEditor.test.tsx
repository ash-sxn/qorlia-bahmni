import { get, post } from '@bahmni/services';
import {
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

it('keeps existing unshown attributes and cancelled surgeries on edit', async () => {
  const attribute = {
    id: 4,
    value: 'Keep me',
    surgicalAppointmentAttributeType: {
      uuid: 'hidden-1',
      name: 'hiddenAttribute',
      format: 'java.lang.String',
    },
  };
  const surgery = {
    id: 2,
    uuid: 'surgery-1',
    patient: { uuid: 'patient-1' },
    status: 'SCHEDULED',
    sortWeight: 0,
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
  expect(
    payload.surgicalAppointments[0].surgicalAppointmentAttributes[0],
  ).toMatchObject(attribute);
  expect(payload.surgicalAppointments[1]).toMatchObject(cancelled);
});
