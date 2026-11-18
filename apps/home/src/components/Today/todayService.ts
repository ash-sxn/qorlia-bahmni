import { get, OPENMRS_REST_V1 } from '@bahmni/services';

/** One patient in today's outpatient queue. */
export interface QueueEntry {
  visitUuid: string;
  patientUuid: string;
  name: string;
  identifier: string;
  age: number | null;
  gender: string;
  visitType: string;
  started: string;
  open: boolean;
  /** A consultation encounter exists in this visit. */
  seen: boolean;
}

interface RestVisit {
  uuid: string;
  startDatetime: string;
  stopDatetime: string | null;
  visitType: { display: string };
  patient: {
    uuid: string;
    display: string;
    person: { age: number | null; gender: string; display: string };
  };
  encounters: { encounterType: { display: string } }[];
}

/** Admitted patients are cared for on the wards, not in the outpatient queue. */
const NOT_OUTPATIENT = /^(ipd|inpatient)$/i;
const CONSULTATION = /consultation/i;

const startOfToday = (now: Date) => {
  const day = new Date(now);
  day.setHours(0, 0, 0, 0);
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${day.getFullYear()}-${pad(day.getMonth() + 1)}-${pad(day.getDate())}T00:00:00`;
};

/** Today's outpatient visits across the hospital, oldest first. */
export const getTodayQueue = async (
  now: Date = new Date(),
): Promise<QueueEntry[]> => {
  const { results } = await get<{ results: RestVisit[] }>(
    `${OPENMRS_REST_V1}/visit?includeInactive=true&fromStartDate=${encodeURIComponent(startOfToday(now))}&limit=200&v=custom:(uuid,startDatetime,stopDatetime,visitType:(display),patient:(uuid,display,person:(age,gender,display)),encounters:(encounterType:(display)))`,
  );
  return results
    .filter((visit) => !NOT_OUTPATIENT.test(visit.visitType.display))
    .map((visit) => ({
      visitUuid: visit.uuid,
      patientUuid: visit.patient.uuid,
      name: visit.patient.person.display,
      identifier: visit.patient.display.split(' - ')[0] ?? '',
      age: visit.patient.person.age,
      gender: visit.patient.person.gender,
      visitType: visit.visitType.display,
      started: visit.startDatetime,
      open: !visit.stopDatetime,
      seen: visit.encounters.some(({ encounterType }) =>
        CONSULTATION.test(encounterType.display),
      ),
    }))
    .sort((a, b) => a.started.localeCompare(b.started));
};

/** Waiting: the visit is open and nobody has written a consultation yet. */
export const isWaiting = (entry: QueueEntry) => entry.open && !entry.seen;
