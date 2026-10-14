import {
  getUserLoginLocation,
  getCurrentUser,
  getCurrentProvider,
  get,
  post,
  dispatchAuditEvent,
  MODULE_LABELS,
} from '@bahmni/services';
import {
  createRegistrationEncounterForPatient,
  getEncounterTypeUuidByName,
} from '../registrationEncounterService';

jest.mock('@bahmni/services', () => ({
  ...jest.requireActual('@bahmni/services'),
  getUserLoginLocation: jest.fn(),
  getCurrentUser: jest.fn(),
  getCurrentProvider: jest.fn(),
  get: jest.fn(),
  post: jest.fn(),
  dispatchAuditEvent: jest.fn(),
}));

const mockGet = jest.mocked(get);
const mockPost = jest.mocked(post);
const visit = {
  uuid: 'visit-uuid',
  patient: { uuid: 'patient-uuid' },
  startDatetime: '2026-10-01T10:00:00.000+0530',
  stopDatetime: null,
};
const encounter = {
  encounterUuid: 'encounter-uuid',
  patientUuid: 'patient-uuid',
  visitUuid: 'visit-uuid',
  encounterTypeName: 'Registration',
};
const create = () =>
  createRegistrationEncounterForPatient('patient-uuid', 'type-uuid', {
    visitUuid: 'visit-uuid',
  });

beforeEach(() => {
  jest.clearAllMocks();
  jest
    .mocked(getUserLoginLocation)
    .mockReturnValue({ uuid: 'location-uuid', name: 'Emergency' });
  jest
    .mocked(getCurrentUser)
    .mockResolvedValue({ uuid: 'user-uuid' } as Awaited<
      ReturnType<typeof getCurrentUser>
    >);
  jest
    .mocked(getCurrentProvider)
    .mockResolvedValue({ uuid: 'provider-uuid' } as Awaited<
      ReturnType<typeof getCurrentProvider>
    >);
  mockGet.mockResolvedValue(visit);
  mockPost.mockResolvedValue(encounter);
});

describe('createRegistrationEncounterForPatient', () => {
  it('saves atomically through Bahmni REST with the verified visit and provider', async () => {
    await expect(create()).resolves.toEqual(encounter);
    expect(getCurrentProvider).toHaveBeenCalledWith('user-uuid');
    expect(mockGet).toHaveBeenCalledWith(
      '/openmrs/ws/rest/v1/visit/visit-uuid?v=full',
    );
    expect(mockPost).toHaveBeenCalledWith(
      '/openmrs/ws/rest/v1/bahmnicore/bahmniencounter',
      {
        patientUuid: 'patient-uuid',
        encounterTypeUuid: 'type-uuid',
        locationUuid: 'location-uuid',
        visitUuid: 'visit-uuid',
        encounterDateTime: visit.startDatetime,
        providers: [{ uuid: 'provider-uuid' }],
        observations: [],
      },
    );
    expect(dispatchAuditEvent).toHaveBeenCalledWith({
      eventType: 'EDIT_ENCOUNTER',
      patientUuid: 'patient-uuid',
      messageParams: {
        encounterUuid: 'encounter-uuid',
        encounterType: 'Registration',
      },
      module: MODULE_LABELS.REGISTRATION,
    });
  });

  it.each([
    { ...visit, patient: { uuid: 'other-patient' } },
    { ...visit, stopDatetime: '2026-10-01T11:00:00Z' },
    { ...visit, voided: true },
  ])(
    'rejects an unrelated or inactive visit before saving',
    async (invalidVisit) => {
      mockGet.mockResolvedValue(invalidVisit);
      await expect(create()).rejects.toThrow('no longer active');
      expect(mockPost).not.toHaveBeenCalled();
      expect(dispatchAuditEvent).not.toHaveBeenCalled();
    },
  );

  it('requires an authenticated provider', async () => {
    jest.mocked(getCurrentUser).mockResolvedValue(null);
    await expect(create()).rejects.toThrow('required for registration');
    expect(getCurrentProvider).not.toHaveBeenCalled();
    expect(mockPost).not.toHaveBeenCalled();
  });

  it('does not accept an HTTP 200 error body as a successful save', async () => {
    mockPost.mockResolvedValue({ error: 'Save failed' });
    await expect(create()).rejects.toThrow('could not be confirmed');
    expect(dispatchAuditEvent).not.toHaveBeenCalled();
  });

  it('propagates a failed save without auditing success', async () => {
    mockPost.mockRejectedValue(new Error('Server error'));
    await expect(create()).rejects.toThrow('Server error');
    expect(dispatchAuditEvent).not.toHaveBeenCalled();
  });
});

describe('getEncounterTypeUuidByName', () => {
  it('selects an exact match rather than a fuzzy search match', async () => {
    mockGet.mockResolvedValue({
      results: [
        { uuid: 'other', name: 'Registration Follow-up' },
        { uuid: 'type', name: 'Registration' },
      ],
    });
    await expect(getEncounterTypeUuidByName('Registration')).resolves.toBe(
      'type',
    );
  });

  it('returns undefined when no type matches', async () => {
    mockGet.mockResolvedValue({ results: [] });
    await expect(
      getEncounterTypeUuidByName('Registration'),
    ).resolves.toBeUndefined();
  });

  it('URL-encodes the search name', async () => {
    mockGet.mockResolvedValue({ results: [] });
    await getEncounterTypeUuidByName('Clinic Visit Type');
    expect(mockGet).toHaveBeenCalledWith(
      expect.stringContaining('q=Clinic%20Visit%20Type'),
    );
  });
});
