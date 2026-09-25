import { get, getUserLoginLocation, post } from '@bahmni/services';
import { performInpatientAction } from '../inpatientActions';

jest.mock('@bahmni/services', () => ({
  ...jest.requireActual('@bahmni/services'),
  get: jest.fn(),
  post: jest.fn(),
  getUserLoginLocation: jest.fn(),
}));

const config = {
  encounterTypes: {
    ADMISSION: 'admission-type',
    TRANSFER: 'transfer-type',
    DISCHARGE: 'discharge-type',
  },
  visitTypes: { OPD: 'opd-type', IPD: 'ipd-type' },
};
const app = { config: { defaultVisitType: 'IPD' } };
const visit = { uuid: 'visit-1', visitType: { name: 'OPD' } };
const input = {
  patientUuid: 'patient-1',
  practitionerUuid: 'provider-1',
  targetBedId: 3,
  expectedVisitUuid: 'visit-1',
};

beforeEach(() => {
  jest.resetAllMocks();
  jest.mocked(getUserLoginLocation).mockReturnValue({
    uuid: 'location-1',
  } as ReturnType<typeof getUserLoginLocation>);
});

it('checks state, creates an admission, then assigns the bed', async () => {
  jest
    .mocked(get)
    .mockResolvedValueOnce(config)
    .mockResolvedValueOnce(app)
    .mockResolvedValueOnce({ results: [visit] })
    .mockResolvedValueOnce({ results: [] })
    .mockResolvedValueOnce({ patients: [] });
  jest
    .mocked(post)
    .mockResolvedValueOnce({
      patientUuid: 'patient-1',
      encounterUuid: 'encounter-1',
      visitUuid: 'visit-1',
    })
    .mockResolvedValueOnce({});

  await performInpatientAction({ ...input, action: 'admit' });

  expect(get).toHaveBeenCalledWith('/openmrs/ws/rest/v1/beds/3');
  expect(post).toHaveBeenNthCalledWith(
    1,
    '/openmrs/ws/rest/v1/bahmnicore/bahmniencounter',
    expect.objectContaining({
      patientUuid: 'patient-1',
      encounterTypeUuid: 'admission-type',
      visitTypeUuid: 'opd-type',
      locationUuid: 'location-1',
      providers: [{ uuid: 'provider-1' }],
    }),
  );
  expect(post).toHaveBeenNthCalledWith(2, '/openmrs/ws/rest/v1/beds/3', {
    patientUuid: 'patient-1',
    encounterUuid: 'encounter-1',
  });
});

it('closes an existing visit only after the explicit IPD choice', async () => {
  jest
    .mocked(get)
    .mockResolvedValueOnce(config)
    .mockResolvedValueOnce(app)
    .mockResolvedValueOnce({ results: [visit] })
    .mockResolvedValueOnce({ results: [] })
    .mockResolvedValueOnce({ patients: [] });
  jest.mocked(post).mockResolvedValue({
    patientUuid: 'patient-1',
    encounterUuid: 'encounter-1',
    visitUuid: 'visit-2',
  });

  await performInpatientAction({
    ...input,
    action: 'admit',
    startIpdVisit: true,
  });

  expect(post).toHaveBeenNthCalledWith(
    1,
    '/openmrs/ws/rest/v1/bahmnicore/visit/endVisitAndCreateEncounter?visitUuid=visit-1',
    expect.objectContaining({ visitTypeUuid: 'ipd-type' }),
  );
});

it('does not write when the target bed has become occupied', async () => {
  jest
    .mocked(get)
    .mockResolvedValueOnce(config)
    .mockResolvedValueOnce(app)
    .mockResolvedValueOnce({ results: [visit] })
    .mockResolvedValueOnce({ results: [] })
    .mockResolvedValueOnce({ patients: [{ uuid: 'other-patient' }] });

  await expect(
    performInpatientAction({ ...input, action: 'admit' }),
  ).rejects.toThrow('no longer available');
  expect(post).not.toHaveBeenCalled();
});

it('does not write when the patient stay changed after confirmation opened', async () => {
  jest
    .mocked(get)
    .mockResolvedValueOnce(config)
    .mockResolvedValueOnce(app)
    .mockResolvedValueOnce({ results: [{ ...visit, uuid: 'visit-2' }] })
    .mockResolvedValueOnce({ results: [] });

  await expect(
    performInpatientAction({ ...input, action: 'admit' }),
  ).rejects.toThrow('patient stay changed');
  expect(post).not.toHaveBeenCalled();
});

it('reports a partial save so the encounter is not blindly retried', async () => {
  jest
    .mocked(get)
    .mockResolvedValueOnce(config)
    .mockResolvedValueOnce(app)
    .mockResolvedValueOnce({ results: [visit] })
    .mockResolvedValueOnce({ results: [] })
    .mockResolvedValueOnce({ patients: [] });
  jest
    .mocked(post)
    .mockResolvedValueOnce({
      patientUuid: 'patient-1',
      encounterUuid: 'encounter-1',
      visitUuid: 'visit-1',
    })
    .mockRejectedValueOnce(new Error('bed save failed'));

  await expect(
    performInpatientAction({ ...input, action: 'admit' }),
  ).rejects.toThrow('encounter was saved');
  expect(post).toHaveBeenCalledTimes(2);
});

it('transfers only an assigned patient to a different empty bed', async () => {
  jest
    .mocked(get)
    .mockResolvedValueOnce(config)
    .mockResolvedValueOnce(app)
    .mockResolvedValueOnce({ results: [visit] })
    .mockResolvedValueOnce({ results: [{ bedId: 2 }] })
    .mockResolvedValueOnce({ patients: [] });
  jest.mocked(post).mockResolvedValue({
    patientUuid: 'patient-1',
    encounterUuid: 'transfer-1',
    visitUuid: 'visit-1',
  });

  await performInpatientAction({
    ...input,
    action: 'transfer',
    expectedBedId: 2,
  });

  expect(post).toHaveBeenNthCalledWith(
    1,
    '/openmrs/ws/rest/v1/bahmnicore/bahmniencounter',
    expect.objectContaining({ encounterTypeUuid: 'transfer-type' }),
  );
  expect(post).toHaveBeenNthCalledWith(2, '/openmrs/ws/rest/v1/beds/3', {
    patientUuid: 'patient-1',
    encounterUuid: 'transfer-1',
  });
});

it('discharges only a patient with an active visit and assigned bed', async () => {
  jest
    .mocked(get)
    .mockResolvedValueOnce(config)
    .mockResolvedValueOnce(app)
    .mockResolvedValueOnce({ results: [visit] })
    .mockResolvedValueOnce({ results: [{ bedId: 2 }] });
  jest.mocked(post).mockResolvedValueOnce({ visitUuid: 'visit-1' });

  await performInpatientAction({
    ...input,
    action: 'discharge',
    expectedBedId: 2,
  });

  expect(post).toHaveBeenCalledTimes(1);
  expect(post).toHaveBeenCalledWith(
    '/openmrs/ws/rest/v1/bahmnicore/discharge',
    expect.objectContaining({ encounterTypeUuid: 'discharge-type' }),
  );
});
