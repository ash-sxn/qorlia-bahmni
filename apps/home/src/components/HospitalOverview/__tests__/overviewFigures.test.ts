import {
  countByStatus,
  countOutpatientVisits,
  dayBounds,
  localDateTime,
  wardBedCounts,
} from '../overviewFigures';
import { OverviewVisit, WardBeds } from '../types';

const visit = (uuid: string, type: string): OverviewVisit => ({
  uuid,
  startDatetime: '2026-11-13T10:00:00.000+0530',
  visitType: { display: type },
});

describe('overviewFigures', () => {
  describe('dayBounds', () => {
    it('runs from local midnight to the next local midnight', () => {
      const { start, end } = dayBounds(new Date(2026, 10, 13, 15, 45));

      expect(start).toEqual(new Date(2026, 10, 13, 0, 0, 0, 0));
      expect(end).toEqual(new Date(2026, 10, 14, 0, 0, 0, 0));
    });

    it('keeps an early-morning time on the same day', () => {
      const { start } = dayBounds(new Date(2026, 10, 13, 0, 30));

      expect(start).toEqual(new Date(2026, 10, 13, 0, 0, 0, 0));
    });

    it('rolls over the end of a month', () => {
      const { end } = dayBounds(new Date(2026, 10, 30, 9, 0));

      expect(end).toEqual(new Date(2026, 11, 1, 0, 0, 0, 0));
    });
  });

  describe('localDateTime', () => {
    const moment = new Date(2026, 10, 13, 9, 5, 7, 42);

    it('writes the local time with its offset, without a colon by default', () => {
      const text = localDateTime(moment);

      expect(text).toMatch(/^2026-11-13T09:05:07\.042[+-]\d{4}$/);
      // Put the colon back so JavaScript can read it, and check it is the same moment.
      expect(new Date(text.replace(/(\d{2})(\d{2})$/, '$1:$2'))).toEqual(
        moment,
      );
    });

    it('can write the offset with a colon, as FHIR expects', () => {
      const text = localDateTime(moment, ':');

      expect(text).toMatch(/^2026-11-13T09:05:07\.042[+-]\d{2}:\d{2}$/);
      expect(new Date(text)).toEqual(moment);
    });
  });

  describe('countOutpatientVisits', () => {
    it('counts OPD, Special OPD and Follow Up together', () => {
      const result = countOutpatientVisits([
        visit('v1', 'OPD'),
        visit('v2', 'OPD'),
        visit('v3', 'Special OPD'),
        visit('v4', 'Follow Up'),
      ]);

      expect(result).toEqual({
        total: 4,
        byType: { OPD: 2, 'Special OPD': 1, 'Follow Up': 1 },
      });
    });

    it('leaves out visits that are not outpatient', () => {
      const result = countOutpatientVisits([
        visit('v1', 'OPD'),
        visit('v2', 'IPD'),
        visit('v3', 'Emergency'),
      ]);

      expect(result.total).toBe(1);
      expect(result.byType).not.toHaveProperty('IPD');
    });

    it('shows every outpatient type with zero when there are no visits', () => {
      expect(countOutpatientVisits([])).toEqual({
        total: 0,
        byType: { OPD: 0, 'Special OPD': 0, 'Follow Up': 0 },
      });
    });

    it('counts a visit only once even if the API repeats it across pages', () => {
      const result = countOutpatientVisits([
        visit('v1', 'OPD'),
        visit('v1', 'OPD'),
      ]);

      expect(result.total).toBe(1);
    });
  });

  describe('countByStatus', () => {
    it('groups appointments by status, largest group first', () => {
      const result = countByStatus([
        { uuid: 'a1', status: 'Scheduled' },
        { uuid: 'a2', status: 'CheckedIn' },
        { uuid: 'a3', status: 'Scheduled' },
        { uuid: 'a4', status: 'Completed' },
      ]);

      expect(result).toEqual([
        { status: 'Scheduled', count: 2 },
        { status: 'CheckedIn', count: 1 },
        { status: 'Completed', count: 1 },
      ]);
    });

    it('is an empty list when there are no appointments', () => {
      expect(countByStatus([])).toEqual([]);
    });
  });

  describe('wardBedCounts', () => {
    const ward = (
      name: string,
      totalBeds: number,
      occupiedBeds: number,
    ): WardBeds => ({
      ward: { uuid: `uuid-${name}`, name },
      totalBeds,
      occupiedBeds,
    });

    it('works out free beds as total minus occupied, sorted by ward name', () => {
      expect(
        wardBedCounts([
          ward('Pediatric Ward', 10, 4),
          ward('General Ward', 20, 20),
        ]),
      ).toEqual([
        { ward: 'General Ward', total: 20, occupied: 20, free: 0 },
        { ward: 'Pediatric Ward', total: 10, occupied: 4, free: 6 },
      ]);
    });

    it('never shows negative free beds if the data is inconsistent', () => {
      expect(wardBedCounts([ward('Emergency', 2, 3)])[0].free).toBe(0);
    });

    it('keeps wards that have no beds configured', () => {
      expect(wardBedCounts([ward('Emergency', 0, 0)])).toEqual([
        { ward: 'Emergency', total: 0, occupied: 0, free: 0 },
      ]);
    });
  });
});
