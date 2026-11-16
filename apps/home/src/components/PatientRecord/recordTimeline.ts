import type { Diagnosis, MedicationRequest } from '@bahmni/services';
import {
  BahmniDate,
  LabResult,
  RecordEntry,
  RecordKind,
  RecordVisit,
  VisitGroup,
} from './types';

const toIso = (value: BahmniDate): string | null => {
  if (value === null || value === undefined || value === '') {
    return null;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

const joinParts = (parts: (string | null | undefined | false)[]): string =>
  parts.filter(Boolean).join(', ');

/** Diagnoses as record entries. A diagnosis without a readable date is left out. */
export const diagnosisEntries = (
  diagnoses: readonly Diagnosis[],
): RecordEntry[] =>
  diagnoses.flatMap((diagnosis) => {
    const date = toIso(diagnosis.recordedDate);
    return date
      ? [
          {
            id: `diagnosis-${diagnosis.id}`,
            kind: 'diagnosis' as const,
            date,
            title: diagnosis.display,
            detail: joinParts([
              diagnosis.certainty?.display ?? diagnosis.certainty?.code,
              diagnosis.recorder,
            ]),
          },
        ]
      : [];
  });

/** Medicines as record entries: dose, frequency, route and duration in one line. */
export const medicineEntries = (
  medicines: readonly MedicationRequest[],
): RecordEntry[] =>
  medicines.flatMap((medicine) => {
    const date = toIso(medicine.orderDate) ?? toIso(medicine.startDate);
    return date
      ? [
          {
            id: `medicine-${medicine.id}`,
            kind: 'medicine' as const,
            date,
            title: medicine.name,
            detail: joinParts([
              medicine.dose && `${medicine.dose.value} ${medicine.dose.unit}`,
              medicine.frequency,
              medicine.route,
              medicine.duration &&
                `${medicine.duration.duration} ${medicine.duration.durationUnit ?? ''}`.trim(),
              medicine.orderedBy,
            ]),
          },
        ]
      : [];
  });

const normalRange = ({ minNormal, maxNormal }: LabResult): string | null => {
  const hasMin = typeof minNormal === 'number';
  const hasMax = typeof maxNormal === 'number';
  if (hasMin && hasMax) return `normal ${minNormal} to ${maxNormal}`;
  if (hasMin) return `normal from ${minNormal}`;
  if (hasMax) return `normal up to ${maxNormal}`;
  return null;
};

/** Lab results as record entries. A test without a result yet is left out. */
export const labEntries = (results: readonly LabResult[]): RecordEntry[] =>
  results.flatMap((lab, index) => {
    const date =
      toIso(lab.resultDateTime) ??
      toIso(lab.accessionDateTime) ??
      toIso(lab.visitStartTime);
    const value = lab.result?.toString().trim();
    if (!date || !value) {
      return [];
    }
    const range = normalRange(lab);
    return [
      {
        id: `lab-${index}-${lab.testName}-${date}`,
        kind: 'lab' as const,
        date,
        title:
          lab.panelName && lab.panelName !== lab.testName
            ? `${lab.testName} (${lab.panelName})`
            : lab.testName,
        detail:
          [value, lab.testUnitOfMeasurement].filter(Boolean).join(' ') +
          (range ? ` (${range})` : ''),
        abnormal: lab.abnormal === true,
      },
    ];
  });

const newestFirst = (a: { date: string }, b: { date: string }) =>
  b.date.localeCompare(a.date);

/**
 * Puts every entry under the visit it was recorded in, newest visit first.
 * An entry belongs to the latest visit that had started when it was recorded and had not
 * yet ended. Entries that fit no visit come last, in a group whose visit is null.
 * Visits with no entries are kept: the visit itself is part of the history.
 */
export const groupByVisit = (
  visits: readonly RecordVisit[],
  entries: readonly RecordEntry[],
): VisitGroup[] => {
  const ordered = [...visits]
    .map((visit) => ({
      visit,
      start: toIso(visit.startDatetime) ?? '',
      stop: toIso(visit.stopDatetime),
    }))
    .sort((a, b) => b.start.localeCompare(a.start));
  const groups: VisitGroup[] = ordered.map(({ visit }) => ({
    key: visit.uuid,
    visit,
    entries: [],
  }));
  const outside: RecordEntry[] = [];

  for (const entry of entries) {
    const index = ordered.findIndex(
      ({ start, stop }) =>
        start !== '' && entry.date >= start && (!stop || entry.date <= stop),
    );
    (index === -1 ? outside : groups[index].entries).push(entry);
  }

  for (const group of groups) {
    group.entries.sort(newestFirst);
  }
  if (outside.length > 0) {
    groups.push({
      key: 'outside-visits',
      visit: null,
      entries: outside.sort(newestFirst),
    });
  }
  return groups;
};

/** Keeps only the chosen kinds. Visits stay listed even when all their entries are filtered out. */
export const filterGroups = (
  groups: readonly VisitGroup[],
  kinds: ReadonlySet<RecordKind>,
): VisitGroup[] =>
  groups
    .map((group) => ({
      ...group,
      entries: group.entries.filter((entry) => kinds.has(entry.kind)),
    }))
    .filter((group) => group.visit !== null || group.entries.length > 0);

/** How many entries of each kind the record holds. */
export const countByKind = (
  entries: readonly RecordEntry[],
): Record<RecordKind, number> => {
  const counts: Record<RecordKind, number> = {
    diagnosis: 0,
    medicine: 0,
    lab: 0,
  };
  for (const { kind } of entries) {
    counts[kind] += 1;
  }
  return counts;
};
