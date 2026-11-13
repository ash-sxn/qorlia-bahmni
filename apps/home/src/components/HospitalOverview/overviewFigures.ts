import {
  OutpatientCount,
  OverviewAppointment,
  OverviewVisit,
  StatusCount,
  WardBeds,
  WardBedCount,
} from './types';

/** Visit types counted as one "Outpatient visits" figure, as agreed in #28. */
export const OUTPATIENT_VISIT_TYPES = ['OPD', 'Special OPD', 'Follow Up'];

/**
 * The day that contains `date`, from local midnight to the next local midnight.
 * Local time is the browser's (IST in the hospital), so early-morning records stay on their day.
 */
export const dayBounds = (date: Date): { start: Date; end: Date } => {
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const end = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1);
  return { start, end };
};

const pad = (value: number, width = 2) => String(value).padStart(width, '0');

/**
 * The local time with its UTC offset, for example 2026-11-13T00:00:00.000+0530.
 * OpenMRS REST reads the offset without a colon; FHIR needs `:` as the separator.
 */
export const localDateTime = (date: Date, offsetSeparator = ''): string => {
  const offset = -date.getTimezoneOffset();
  const sign = offset >= 0 ? '+' : '-';
  const hours = pad(Math.floor(Math.abs(offset) / 60));
  const minutes = pad(Math.abs(offset) % 60);

  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}` +
    `.${pad(date.getMilliseconds(), 3)}${sign}${hours}${offsetSeparator}${minutes}`
  );
};

/** Outpatient visits in total and per visit type. Other types are left out, repeats count once. */
export const countOutpatientVisits = (
  visits: readonly OverviewVisit[],
): OutpatientCount => {
  const byType: Record<string, number> = Object.fromEntries(
    OUTPATIENT_VISIT_TYPES.map((type) => [type, 0]),
  );
  const seen = new Set<string>();

  for (const { uuid, visitType } of visits) {
    if (seen.has(uuid) || !(visitType.display in byType)) {
      continue;
    }
    seen.add(uuid);
    byType[visitType.display] += 1;
  }

  return { total: seen.size, byType };
};

/** Appointments per status, largest group first, then by status name. */
export const countByStatus = (
  appointments: readonly OverviewAppointment[],
): StatusCount[] => {
  const counts = new Map<string, number>();
  for (const { status } of appointments) {
    counts.set(status, (counts.get(status) ?? 0) + 1);
  }

  return [...counts]
    .map(([status, count]) => ({ status, count }))
    .sort((a, b) => b.count - a.count || a.status.localeCompare(b.status));
};

/** Beds per ward, sorted by ward name. Free beds never go below zero. */
export const wardBedCounts = (wards: readonly WardBeds[]): WardBedCount[] =>
  wards
    .map(({ ward, totalBeds, occupiedBeds }) => ({
      ward: ward.name,
      total: totalBeds,
      occupied: occupiedBeds,
      free: Math.max(0, totalBeds - occupiedBeds),
    }))
    .sort((a, b) => a.ward.localeCompare(b.ward));
