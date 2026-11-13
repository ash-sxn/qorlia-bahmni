import * as services from '@bahmni/services';
import { getTodaysVisits } from '../todaysVisits';

jest.mock('@bahmni/services', () => ({
  ...jest.requireActual('@bahmni/services'),
  get: jest.fn(),
  getUserLoginLocation: jest.fn(),
  getVisitLocationUUID: jest.fn(),
}));

const get = services.get as jest.Mock;
const getUserLoginLocation = services.getUserLoginLocation as jest.Mock;
const getVisitLocationUUID = services.getVisitLocationUUID as jest.Mock;

const visit = (
  uuid: string,
  startDatetime: string,
  stopDatetime: string | null = null,
) => ({
  uuid,
  startDatetime,
  stopDatetime,
  visitType: { display: 'OPD' },
  patient: {
    uuid: `patient-${uuid}`,
    display: `ABC-${uuid} - Patient ${uuid}`,
    person: { display: `Patient ${uuid}` },
  },
});

describe('getTodaysVisits', () => {
  const now = new Date(2026, 10, 11, 15, 0);
  const today = (hour: number) => new Date(2026, 10, 11, hour, 0).toISOString();

  beforeEach(() => {
    jest.clearAllMocks();
    getUserLoginLocation.mockReturnValue({ uuid: 'login-location' });
    getVisitLocationUUID.mockResolvedValue({ uuid: 'visit-location' });
  });

  it('asks for open visits from today at the visit location of the login location', async () => {
    get.mockResolvedValue({ results: [] });

    await getTodaysVisits(now);

    expect(getVisitLocationUUID).toHaveBeenCalledWith('login-location');
    const url = new URL(get.mock.calls[0][0], 'http://host');
    expect(url.pathname).toMatch(/\/visit$/);
    expect(url.searchParams.get('includeInactive')).toBe('false');
    expect(url.searchParams.get('location')).toBe('visit-location');
    expect(url.searchParams.get('fromStartDate')).toBe('2026-11-11');
  });

  it('keeps only open visits started today, earliest first, with name and ID apart', async () => {
    get.mockResolvedValue({
      results: [
        visit('late', today(11)),
        visit('early', today(9)),
        visit('closed', today(10), today(12)),
        visit('yesterday', new Date(2026, 10, 10, 18, 0).toISOString()),
      ],
    });

    const visits = await getTodaysVisits(now);

    expect(visits.map(({ uuid }) => uuid)).toEqual(['early', 'late']);
    expect(visits[0]).toMatchObject({
      patientUuid: 'patient-early',
      patientName: 'Patient early',
      identifier: 'ABC-early',
      visitType: 'OPD',
    });
  });

  it('copes with a patient display that has no identifier part', async () => {
    get.mockResolvedValue({
      results: [
        {
          ...visit('plain', today(9)),
          visitType: null,
          patient: { uuid: 'p', display: 'Only Name' },
        },
      ],
    });

    const [result] = await getTodaysVisits(now);

    expect(result).toMatchObject({
      patientName: 'Only Name',
      identifier: '',
      visitType: null,
    });
  });
});
