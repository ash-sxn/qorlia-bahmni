import type { Diagnosis, MedicationRequest } from '@bahmni/services';
import {
  countByKind,
  diagnosisEntries,
  filterGroups,
  groupByVisit,
  labEntries,
  medicineEntries,
} from '../recordTimeline';
import { RecordEntry, RecordVisit } from '../types';

const visit = (
  uuid: string,
  start: string,
  stop: string | null,
): RecordVisit => ({
  uuid,
  startDatetime: start,
  stopDatetime: stop,
  visitType: { display: 'OPD' },
  location: { display: 'OPD-1' },
});

const entry = (id: string, date: string, kind = 'diagnosis'): RecordEntry =>
  ({ id, kind, date, title: id, detail: '' }) as RecordEntry;

describe('diagnosisEntries', () => {
  it('shows the diagnosis with its certainty and who recorded it', () => {
    const diagnosis = {
      id: 'd1',
      display: 'Hypertension',
      certainty: { code: 'confirmed', display: 'Confirmed' },
      recordedDate: '2026-11-13T06:30:00.000Z',
      recorder: 'Dr. Neha Anand',
    } as Diagnosis;

    expect(diagnosisEntries([diagnosis])).toEqual([
      {
        id: 'diagnosis-d1',
        kind: 'diagnosis',
        date: '2026-11-13T06:30:00.000Z',
        title: 'Hypertension',
        detail: 'Confirmed, Dr. Neha Anand',
      },
    ]);
  });

  it('leaves out a diagnosis without a readable date', () => {
    const diagnosis = {
      id: 'd2',
      display: 'Fever',
      certainty: {},
      recordedDate: 'not a date',
      recorder: '',
    } as Diagnosis;

    expect(diagnosisEntries([diagnosis])).toEqual([]);
  });
});

describe('medicineEntries', () => {
  it('puts dose, frequency, route, duration and prescriber on one line', () => {
    const medicine = {
      id: 'm1',
      name: 'Amlodipine 5 mg',
      dose: { value: 1, unit: 'Tablet' },
      frequency: 'Once a day',
      route: 'Oral',
      duration: { duration: 30, durationUnit: 'Day(s)' },
      orderDate: '2026-11-13T06:40:00.000Z',
      startDate: '2026-11-13T06:40:00.000Z',
      orderedBy: 'Dr. Neha Anand',
    } as MedicationRequest;

    expect(medicineEntries([medicine])[0]).toMatchObject({
      id: 'medicine-m1',
      kind: 'medicine',
      title: 'Amlodipine 5 mg',
      detail: '1 Tablet, Once a day, Oral, 30 Day(s), Dr. Neha Anand',
    });
  });

  it('uses the start date when there is no order date and skips missing parts', () => {
    const medicine = {
      id: 'm2',
      name: 'Paracetamol',
      orderDate: '',
      startDate: '2026-11-12T05:00:00.000Z',
      orderedBy: '',
    } as MedicationRequest;

    expect(medicineEntries([medicine])[0]).toMatchObject({
      date: '2026-11-12T05:00:00.000Z',
      detail: '',
    });
  });
});

describe('labEntries', () => {
  it('shows the value with its unit and normal range, and marks abnormal results', () => {
    const [result] = labEntries([
      {
        testName: 'Haemoglobin',
        panelName: 'Complete blood count',
        result: '9.5',
        testUnitOfMeasurement: 'g/dL',
        minNormal: 12,
        maxNormal: 16,
        abnormal: true,
        resultDateTime: 1794552000000,
      },
    ]);

    expect(result).toMatchObject({
      kind: 'lab',
      title: 'Haemoglobin (Complete blood count)',
      detail: '9.5 g/dL (normal 12 to 16)',
      abnormal: true,
      date: new Date(1794552000000).toISOString(),
    });
  });

  it('leaves out tests that have no result yet', () => {
    expect(
      labEntries([
        {
          testName: 'Platelets',
          result: null,
          accessionDateTime: 1794552000000,
        },
        { testName: 'ESR', result: '  ', accessionDateTime: 1794552000000 },
      ]),
    ).toEqual([]);
  });

  it('shows no range when Bahmni sends 0 and 0 for a test without one', () => {
    const [result] = labEntries([
      {
        testName: 'Neutrophils',
        result: '60.0',
        testUnitOfMeasurement: '%',
        minNormal: 0,
        maxNormal: 0,
        resultDateTime: 1794536454000,
      },
    ]);

    expect(result.detail).toBe('60.0 %');
  });

  it('falls back to the sample date and handles a one-sided range', () => {
    const [result] = labEntries([
      {
        testName: 'ESR',
        result: '12',
        maxNormal: 20,
        accessionDateTime: '2026-11-13T07:00:00.000Z',
      },
    ]);

    expect(result).toMatchObject({
      title: 'ESR',
      detail: '12 (normal up to 20)',
      abnormal: false,
      date: '2026-11-13T07:00:00.000Z',
    });
  });
});

describe('groupByVisit', () => {
  const visits = [
    visit('old', '2026-10-01T04:00:00.000Z', '2026-10-01T10:00:00.000Z'),
    visit('open', '2026-11-13T04:00:00.000Z', null),
  ];

  it('lists the newest visit first and puts each entry under its visit', () => {
    const groups = groupByVisit(visits, [
      entry('during-old', '2026-10-01T05:00:00.000Z'),
      entry('during-open', '2026-11-13T06:00:00.000Z'),
      entry('later-in-open', '2026-11-14T06:00:00.000Z'),
    ]);

    expect(groups.map(({ key }) => key)).toEqual(['open', 'old']);
    expect(groups[0].entries.map(({ id }) => id)).toEqual([
      'later-in-open',
      'during-open',
    ]);
    expect(groups[1].entries.map(({ id }) => id)).toEqual(['during-old']);
  });

  it('keeps entries recorded between visits in a last group without a visit', () => {
    const groups = groupByVisit(visits, [
      entry('between', '2026-10-20T05:00:00.000Z'),
      entry('before-all', '2026-09-01T05:00:00.000Z'),
    ]);

    expect(groups).toHaveLength(3);
    expect(groups[2]).toMatchObject({ key: 'outside-visits', visit: null });
    expect(groups[2].entries.map(({ id }) => id)).toEqual([
      'between',
      'before-all',
    ]);
  });

  it('puts a lab result under the visit Bahmni names, even when it came after the visit closed', () => {
    const [late] = labEntries([
      {
        testName: 'Haemoglobin',
        result: '13.6',
        // Reported two hours after the October visit was closed.
        resultDateTime: '2026-10-01T12:00:00.000Z',
        visitStartTime: Date.parse('2026-10-01T04:00:00.000Z'),
      },
    ]);

    const groups = groupByVisit(visits, [late]);

    expect(groups).toHaveLength(2);
    expect(groups[1].key).toBe('old');
    expect(groups[1].entries).toEqual([late]);
  });

  it('falls back to the time when the named visit is not in the list', () => {
    const groups = groupByVisit(visits, [
      {
        ...entry('lab', '2026-11-13T06:00:00.000Z'),
        visitStart: '2020-01-01T00:00:00.000Z',
      },
    ]);

    expect(groups[0].entries.map(({ id }) => id)).toEqual(['lab']);
  });

  it('keeps a visit that has no entries, and adds no empty outside group', () => {
    const groups = groupByVisit(visits, []);

    expect(groups.map(({ key, entries }) => [key, entries.length])).toEqual([
      ['open', 0],
      ['old', 0],
    ]);
  });
});

describe('filterGroups and countByKind', () => {
  const entries = [
    entry('dx', '2026-11-13T06:00:00.000Z', 'diagnosis'),
    entry('rx', '2026-11-13T06:10:00.000Z', 'medicine'),
    entry('lab', '2026-09-01T06:00:00.000Z', 'lab'),
  ];
  const groups = groupByVisit(
    [visit('open', '2026-11-13T04:00:00.000Z', null)],
    entries,
  );

  it('keeps only the chosen kinds, still lists the visit, and drops an emptied outside group', () => {
    const shown = filterGroups(groups, new Set(['medicine'] as const));

    expect(shown).toHaveLength(1);
    expect(shown[0].entries.map(({ id }) => id)).toEqual(['rx']);
  });

  it('counts the entries of each kind', () => {
    expect(countByKind(entries)).toEqual({ diagnosis: 1, medicine: 1, lab: 1 });
  });
});
