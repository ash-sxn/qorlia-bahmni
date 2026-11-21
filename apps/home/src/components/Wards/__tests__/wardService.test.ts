import { get } from '@bahmni/services';
import {
  currentMedicines,
  getOccupiedBeds,
  latestVitals,
  VITAL_CONCEPTS,
  vitalsDue,
} from '../wardService';

jest.mock('@bahmni/services', () => ({
  ...jest.requireActual('@bahmni/services'),
  get: jest.fn(),
}));

const obs = (kind: keyof typeof VITAL_CONCEPTS, value: number, at: string) => ({
  code: { coding: [{ code: VITAL_CONCEPTS[kind] }, { code: 'snomed' }] },
  effectiveDateTime: at,
  valueQuantity: { value },
});

describe('wardService', () => {
  it('lists occupied beds with their patients, in bed order', async () => {
    (get as jest.Mock).mockResolvedValue({
      bedLayouts: [
        {
          bedId: 2,
          bedNumber: 'GW-10',
          location: 'Room 2',
          status: 'OCCUPIED',
          patients: [
            {
              uuid: 'p2',
              person: {
                age: 52,
                gender: 'M',
                preferredName: { givenName: 'Mahesh', familyName: 'Kushwah' },
              },
              identifiers: [{ identifier: 'ABC36' }],
            },
          ],
        },
        { bedId: 3, bedNumber: 'GW-02', status: 'AVAILABLE', patients: [] },
        {
          bedId: 1,
          bedNumber: 'GW-9',
          location: 'Room 1',
          status: 'OCCUPIED',
          patients: [{ uuid: 'p1', person: { age: 34, gender: 'F' } }],
        },
      ],
    });

    const beds = await getOccupiedBeds('ward-1');

    expect(get).toHaveBeenCalledWith(
      '/openmrs/ws/rest/v1/admissionLocation/ward-1?v=full',
    );
    expect(
      beds.map(({ bedNumber, patientUuid }) => [bedNumber, patientUuid]),
    ).toEqual([
      ['GW-9', 'p1'],
      ['GW-10', 'p2'],
    ]);
    expect(beds[1]).toMatchObject({
      name: 'Mahesh Kushwah',
      identifier: 'ABC36',
      age: 52,
      room: 'Room 2',
    });
  });

  it('keeps the newest value of each reading', () => {
    const vitals = latestVitals([
      obs('pulse', 90, '2026-11-20T06:00:00Z'),
      obs('pulse', 78, '2026-11-20T10:00:00Z'),
      obs('systolic', 130, '2026-11-20T10:00:00Z'),
      obs('diastolic', 84, '2026-11-20T10:00:00Z'),
    ]);
    expect(vitals).toEqual({
      takenAt: '2026-11-20T10:00:00Z',
      values: { pulse: 78, systolic: 130, diastolic: 84 },
    });
  });

  it('marks readings due after four hours, or when none were taken', () => {
    const now = new Date('2026-11-20T10:00:00Z');
    expect(vitalsDue({ takenAt: null, values: {} }, now)).toBe(true);
    expect(
      vitalsDue({ takenAt: '2026-11-20T07:00:00Z', values: {} }, now),
    ).toBe(false);
    expect(
      vitalsDue({ takenAt: '2026-11-20T05:30:00Z', values: {} }, now),
    ).toBe(true);
  });

  it('keeps only medicine orders that are still active', () => {
    const now = new Date('2026-11-20T10:00:00Z');
    const order = (uuid: string, extra: object) => ({
      drugOrder: {
        uuid,
        dateStopped: null,
        autoExpireDate: null,
        drug: { name: `Drug ${uuid}` },
        dosingInstructions: {
          dose: 1,
          doseUnits: 'Tablet',
          route: 'Oral',
          frequency: 'Twice a day',
        },
        ...extra,
      },
    });
    const medicines = currentMedicines(
      [
        order('a', {}),
        order('b', { dateStopped: now.getTime() - 1000 }),
        order('c', { autoExpireDate: now.getTime() - 1000 }),
        order('d', { autoExpireDate: now.getTime() + 86_400_000 }),
      ],
      now,
    );
    expect(medicines.map(({ uuid }) => uuid)).toEqual(['a', 'd']);
    expect(medicines[0]).toEqual({
      uuid: 'a',
      name: 'Drug a',
      dose: '1 Tablet',
      frequency: 'Twice a day',
      route: 'Oral',
      careSetting: '',
      asNeeded: false,
      durationDays: null,
    });
  });
});
