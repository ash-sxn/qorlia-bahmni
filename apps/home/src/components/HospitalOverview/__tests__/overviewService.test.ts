import {
  get,
  getAppointmentsForDate,
  getEncounterTypeByName,
} from '@bahmni/services';
import { localDateTime } from '../overviewFigures';
import {
  countEncountersForDay,
  getAppointmentsForDay,
  getVisitsForDay,
  getWardBeds,
} from '../overviewService';

jest.mock('@bahmni/services', () => ({
  get: jest.fn(),
  getAppointmentsForDate: jest.fn(),
  getEncounterTypeByName: jest.fn(),
  OPENMRS_REST_V1: '/openmrs/ws/rest/v1',
  OPENMRS_FHIR_R4: '/openmrs/ws/fhir2/R4',
}));

const mockGet = get as jest.Mock;
const mockAppointments = getAppointmentsForDate as jest.Mock;
const mockEncounterType = getEncounterTypeByName as jest.Mock;

const day = new Date(2026, 10, 13, 15, 0);
const start = new Date(2026, 10, 13);
const lastMoment = new Date(2026, 10, 13, 23, 59, 59, 999);
const nextDay = new Date(2026, 10, 14);

const visit = (uuid: string) => ({
  uuid,
  startDatetime: '2026-11-13T10:00:00.000+0530',
  visitType: { display: 'OPD' },
});

/** The query string of the n-th GET call. */
const paramsOfCall = (n: number) =>
  new URL(mockGet.mock.calls[n][0], 'http://test').searchParams;

beforeEach(() => {
  jest.resetAllMocks();
});

describe('overviewService', () => {
  describe('getVisitsForDay', () => {
    it('asks for every visit that started that day, closed ones included', async () => {
      mockGet.mockResolvedValueOnce({ results: [visit('v1')] });

      const visits = await getVisitsForDay(day);

      expect(visits).toEqual([visit('v1')]);
      expect(mockGet).toHaveBeenCalledTimes(1);
      expect(mockGet.mock.calls[0][0]).toMatch(
        /^\/openmrs\/ws\/rest\/v1\/visit\?/,
      );
      const params = paramsOfCall(0);
      expect(params.get('fromStartDate')).toBe(localDateTime(start));
      expect(params.get('toStartDate')).toBe(localDateTime(lastMoment));
      expect(params.get('includeInactive')).toBe('true');
      expect(params.get('v')).toBe(
        'custom:(uuid,startDatetime,visitType:(display))',
      );
      expect(params.get('startIndex')).toBe('0');
    });

    it('does not filter by location, so the whole hospital is counted', async () => {
      mockGet.mockResolvedValueOnce({ results: [] });

      await getVisitsForDay(day);

      expect(paramsOfCall(0).has('location')).toBe(false);
    });

    it('follows the next link and continues from the rows already received', async () => {
      mockGet
        .mockResolvedValueOnce({
          results: [visit('v1'), visit('v2')],
          links: [{ rel: 'next', uri: 'ignored' }],
        })
        .mockResolvedValueOnce({ results: [visit('v3')] });

      const visits = await getVisitsForDay(day);

      expect(visits.map(({ uuid }) => uuid)).toEqual(['v1', 'v2', 'v3']);
      expect(paramsOfCall(1).get('startIndex')).toBe('2');
    });

    it('stops with an error instead of showing a partial count when pages never end', async () => {
      mockGet.mockResolvedValue({
        results: [visit('v1')],
        links: [{ rel: 'next', uri: 'ignored' }],
      });

      await expect(getVisitsForDay(day)).rejects.toThrow();
    });

    it('passes on a failed request', async () => {
      mockGet.mockRejectedValueOnce(new Error('Network down'));

      await expect(getVisitsForDay(day)).rejects.toThrow('Network down');
    });
  });

  describe('countEncountersForDay', () => {
    it('looks up the type by name and asks FHIR only for the count of that day', async () => {
      mockEncounterType.mockResolvedValueOnce({
        uuid: 'admission-uuid',
        name: 'ADMISSION',
      });
      mockGet.mockResolvedValueOnce({ total: 3 });

      await expect(countEncountersForDay('ADMISSION', day)).resolves.toBe(3);

      expect(mockEncounterType).toHaveBeenCalledWith('ADMISSION');
      expect(mockGet.mock.calls[0][0]).toMatch(
        /^\/openmrs\/ws\/fhir2\/R4\/Encounter\?/,
      );
      const params = paramsOfCall(0);
      expect(params.getAll('date')).toEqual([
        `ge${localDateTime(start, ':')}`,
        `lt${localDateTime(nextDay, ':')}`,
      ]);
      expect(params.get('type')).toBe('admission-uuid');
      expect(params.get('_summary')).toBe('count');
    });

    it('fails clearly when the encounter type does not exist', async () => {
      mockEncounterType.mockResolvedValueOnce(null);

      await expect(countEncountersForDay('DISCHARGE', day)).rejects.toThrow(
        'DISCHARGE',
      );
      expect(mockGet).not.toHaveBeenCalled();
    });
  });

  describe('getAppointmentsForDay', () => {
    it('reuses the shared appointment service with the start of the day', async () => {
      mockAppointments.mockResolvedValueOnce([
        { uuid: 'a1', status: 'Scheduled' },
      ]);

      await expect(getAppointmentsForDay(day)).resolves.toEqual([
        { uuid: 'a1', status: 'Scheduled' },
      ]);
      expect(mockAppointments).toHaveBeenCalledWith(start);
    });
  });

  describe('getWardBeds', () => {
    it('returns the wards from admissionLocation', async () => {
      const wards = [
        {
          ward: { uuid: 'w1', name: 'General Ward' },
          totalBeds: 20,
          occupiedBeds: 5,
        },
      ];
      mockGet.mockResolvedValueOnce({ results: wards });

      await expect(getWardBeds()).resolves.toEqual(wards);
      expect(mockGet).toHaveBeenCalledWith(
        '/openmrs/ws/rest/v1/admissionLocation',
      );
    });
  });
});
