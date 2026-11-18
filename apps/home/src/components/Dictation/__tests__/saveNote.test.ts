import {
  dispatchAuditEvent,
  get,
  getCurrentProvider,
  getCurrentUser,
  getUserLoginLocation,
  post,
} from '@bahmni/services';
import { saveNoteToRecord, SaveNoteError } from '../saveNote';

jest.mock('@bahmni/services', () => ({
  ...jest.requireActual('@bahmni/services'),
  get: jest.fn(),
  post: jest.fn(),
  getCurrentUser: jest.fn(),
  getCurrentProvider: jest.fn(),
  getUserLoginLocation: jest.fn(),
  dispatchAuditEvent: jest.fn(),
}));

const mockGet = get as jest.Mock;
const mockPost = post as jest.Mock;

const answers = (overrides: Record<string, unknown> = {}) => {
  const replies: Record<string, unknown> = {
    visit: { results: [{ uuid: 'visit-1', visitType: { display: 'OPD' } }] },
    concept: {
      results: [
        { uuid: 'other', name: { name: 'Consultation Notes Set' } },
        { uuid: 'note-concept', name: { name: 'Consultation Note' } },
      ],
    },
    encountertype: {
      results: [{ uuid: 'consultation-type', name: 'Consultation' }],
    },
    ...overrides,
  };
  mockGet.mockImplementation(async (url: string) => {
    const resource = /v1\/(\w+)\?/.exec(url)![1];
    return replies[resource];
  });
};

const savedEncounter = (text: string, obsUuid = 'obs-1') => ({
  encounterUuid: 'enc-1',
  patientUuid: 'patient-1',
  visitUuid: 'visit-1',
  observations: [
    { uuid: obsUuid, concept: { uuid: 'note-concept' }, value: text },
  ],
});

describe('saveNoteToRecord', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    answers();
    (getUserLoginLocation as jest.Mock).mockReturnValue({ uuid: 'loc-1' });
    (getCurrentUser as jest.Mock).mockResolvedValue({ uuid: 'user-1' });
    (getCurrentProvider as jest.Mock).mockResolvedValue({ uuid: 'prov-1' });
  });

  it('saves the note as a Consultation Note in the open visit', async () => {
    mockPost.mockResolvedValue(savedEncounter('Complaints: fever'));

    const saved = await saveNoteToRecord('patient-1', 'Complaints: fever');

    expect(mockGet).toHaveBeenCalledWith(
      expect.stringContaining('visit?patient=patient-1&includeInactive=false'),
    );
    expect(mockPost).toHaveBeenCalledWith(
      expect.stringContaining('/bahmnicore/bahmniencounter'),
      {
        patientUuid: 'patient-1',
        visitUuid: 'visit-1',
        visitType: 'OPD',
        encounterTypeUuid: 'consultation-type',
        locationUuid: 'loc-1',
        providers: [{ uuid: 'prov-1' }],
        observations: [
          {
            concept: { uuid: 'note-concept', name: 'Consultation Note' },
            value: 'Complaints: fever',
          },
        ],
      },
    );
    expect(saved).toMatchObject({
      encounterUuid: 'enc-1',
      observationUuid: 'obs-1',
      visitType: 'OPD',
      text: 'Complaints: fever',
    });
    expect(dispatchAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'EDIT_ENCOUNTER',
        patientUuid: 'patient-1',
      }),
    );
  });

  it('edits the saved observation when saved again', async () => {
    mockPost.mockResolvedValue(savedEncounter('Second', 'obs-2'));
    const previous = {
      encounterUuid: 'enc-1',
      observationUuid: 'obs-1',
      visitType: 'OPD',
      text: 'First',
      savedAt: new Date(),
    };

    const saved = await saveNoteToRecord('patient-1', 'Second', previous);

    const body = mockPost.mock.calls[0][1];
    expect(body.encounterUuid).toBe('enc-1');
    // OpenMRS answers with a new observation for the edited value.
    expect(saved.observationUuid).toBe('obs-2');
    expect(body.observations[0]).toMatchObject({
      uuid: 'obs-1',
      value: 'Second',
    });
  });

  it.each([
    ['no_visit', 0, () => answers({ visit: { results: [] } })],
    ['not_configured', 0, () => answers({ concept: { results: [] } })],
    [
      'no_provider',
      0,
      () => (getCurrentProvider as jest.Mock).mockResolvedValue(null),
    ],
    [
      'no_location',
      0,
      () =>
        (getUserLoginLocation as jest.Mock).mockImplementation(() => {
          throw new Error('no location');
        }),
    ],
    [
      'not_allowed',
      1,
      () => mockPost.mockRejectedValue({ response: { status: 403 } }),
    ],
    ['failed', 1, () => mockPost.mockResolvedValue({ encounterUuid: 'enc-1' })],
  ])(
    'reports %s and records no audit event',
    async (problem, posts, arrange) => {
      arrange();
      const attempt = saveNoteToRecord('patient-1', 'Complaints: fever');
      await expect(attempt).rejects.toBeInstanceOf(SaveNoteError);
      await expect(attempt).rejects.toMatchObject({ problem });
      expect(mockPost).toHaveBeenCalledTimes(posts as number);
      expect(dispatchAuditEvent).not.toHaveBeenCalled();
    },
  );
});
