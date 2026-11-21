import { get, OPENMRS_REST_V1, post } from '@bahmni/services';
import type { CurrentMedicine } from './wardService';

/*
 * Ward medicine round, through Bahmni's IPD module (bahmni-ipd 1.1.x):
 * an inpatient order is scheduled into timed slots, and each slot is recorded
 * as given or not given. The module takes and returns times in epoch seconds.
 */

const IPD = `${OPENMRS_REST_V1}/ipd`;
const HOUR = 3_600;
const DAY = 86_400;

export type DoseState = 'due' | 'overdue' | 'later' | 'given' | 'not-given';

/** One timed dose of one order. */
export interface DoseSlot {
  uuid: string;
  orderUuid: string;
  patientUuid: string;
  /** Epoch milliseconds. */
  time: number;
  medicine: string;
  how: string;
  status: string;
  recordedBy: string;
  /** Epoch milliseconds, when recorded. */
  recordedAt: number | null;
  reason: string;
}

interface IpdLabel {
  display?: string;
  name?: string;
}

interface IpdSlot {
  uuid: string;
  status: string;
  startTime: number;
  order?: {
    uuid: string;
    drug?: IpdLabel;
    drugNonCoded?: string | null;
    dose?: number | null;
    doseUnits?: IpdLabel | null;
    route?: IpdLabel | null;
    patient?: { uuid: string };
  };
  medicationAdministration?: {
    status?: string;
    administeredDateTime?: number;
    statusReason?: string | null;
    providers?: { provider?: { display?: string } }[];
    notes?: { text?: string }[];
  } | null;
}

interface IpdSchedule {
  slots?: IpdSlot[];
}

const label = (value?: IpdLabel | null) => value?.display ?? value?.name ?? '';

/** "DR-ARVIND - Arvind Mehta" reads as "Arvind Mehta". */
const personName = (display = '') => display.replace(/^.*? - /, '');

export const toDoseSlot = (slot: IpdSlot, patientUuid: string): DoseSlot => {
  const order = slot.order ?? { uuid: '' };
  const given = slot.medicationAdministration;
  return {
    uuid: slot.uuid,
    orderUuid: order.uuid,
    patientUuid,
    time: slot.startTime * 1000,
    medicine:
      label(order.drug) !== '' ? label(order.drug) : (order.drugNonCoded ?? ''),
    how: [
      order.dose !== null && order.dose !== undefined
        ? `${order.dose} ${label(order.doseUnits)}`.trim()
        : '',
      label(order.route),
    ]
      .filter(Boolean)
      .join(' · '),
    status: slot.status,
    recordedBy: personName(given?.providers?.[0]?.provider?.display),
    recordedAt: given?.administeredDateTime
      ? given.administeredDateTime * 1000
      : null,
    reason: given?.statusReason ?? given?.notes?.[0]?.text ?? '',
  };
};

/** Doses due within the hour are due; an hour past their time they are overdue. */
export const doseState = (
  slot: DoseSlot,
  now: Date = new Date(),
): DoseState => {
  if (slot.status === 'COMPLETED') return 'given';
  if (slot.status === 'NOT_DONE' || slot.status === 'STOPPED')
    return 'not-given';
  const minutes = (slot.time - now.getTime()) / 60_000;
  if (minutes < -60) return 'overdue';
  if (minutes <= 60) return 'due';
  return 'later';
};

/** Every slot of a patient's scheduled orders between two times. */
export const getDoseSlots = async (
  patientUuid: string,
  from: Date,
  to: Date,
): Promise<DoseSlot[]> => {
  const params = new URLSearchParams({
    patientUuid,
    startTime: String(Math.floor(from.getTime() / 1000)),
    endTime: String(Math.floor(to.getTime() / 1000)),
  });
  const schedules = await get<IpdSchedule[]>(
    `${IPD}/schedule/type/medication?${params}`,
  );
  return schedules
    .flatMap(({ slots = [] }) => slots)
    .map((slot) => toDoseSlot(slot, patientUuid))
    .sort((a, b) => a.time - b.time);
};

/**
 * Orders that already have slots, so they are not offered for scheduling again.
 * Asked by patient alone, the module answers with a flat list of slots.
 */
export const getScheduledOrderUuids = async (
  patientUuid: string,
): Promise<Set<string>> => {
  const answer = await get<(IpdSlot | IpdSchedule)[]>(
    `${IPD}/schedule/type/medication?patientUuid=${encodeURIComponent(patientUuid)}`,
  );
  return new Set(
    answer
      .flatMap((item) =>
        'slots' in item ? (item.slots ?? []) : [item as IpdSlot],
      )
      .map((slot) => slot.order?.uuid ?? '')
      .filter(Boolean),
  );
};

export const NOT_GIVEN_REASONS = [
  'PATIENT_REFUSED',
  'NIL_BY_MOUTH',
  'NOT_AVAILABLE',
  'HELD_BY_DOCTOR',
] as const;
export type NotGivenReason = (typeof NOT_GIVEN_REASONS)[number];

/** Records one slot as given (now) or not given, with the reason as a note. */
export const recordDose = (
  slot: DoseSlot,
  providerUuid: string,
  outcome: { given: true } | { given: false; reason: string },
  now: Date = new Date(),
) => {
  const nowSeconds = Math.floor(now.getTime() / 1000);
  return post(`${IPD}/scheduledMedicationAdministrations`, [
    {
      patientUuid: slot.patientUuid,
      orderUuid: slot.orderUuid,
      slotUuid: slot.uuid,
      providers: [{ providerUuid, function: 'performer' }],
      notes: outcome.given
        ? []
        : [
            {
              authorUuid: providerUuid,
              recordedTime: nowSeconds,
              text: outcome.reason,
            },
          ],
      status: outcome.given ? 'completed' : 'not-done',
      statusReason: outcome.given ? undefined : outcome.reason,
      administeredDateTime: nowSeconds,
    },
  ]);
};

/** Usual ward times (hours of the day) for Bahmni's frequency names. */
const USUAL_TIMES: Record<string, number[]> = {
  'once a day': [8],
  'twice a day': [8, 20],
  'thrice a day': [8, 14, 20],
  'three times a day': [8, 14, 20],
  'four times a day': [6, 12, 18, 22],
  'five times a day': [6, 10, 14, 18, 22],
  'every 4 hours': [2, 6, 10, 14, 18, 22],
  'every 6 hours': [0, 6, 12, 18],
  'every 8 hours': [6, 14, 22],
  'every 12 hours': [8, 20],
};

/** Suggested hours for an order, or null when its frequency needs a person to decide. */
export const suggestedHours = (frequency: string): number[] | null =>
  USUAL_TIMES[frequency.trim().toLowerCase()] ?? null;

export interface ScheduleRequest {
  patientUuid: string;
  orderUuid: string;
  providerUuid: string;
  serviceType: 'MEDICATION_REQUEST';
  medicationFrequency: 'FIXED_SCHEDULE_FREQUENCY';
  firstDaySlotsStartTime: number[];
  dayWiseSlotsStartTime: number[];
  remainingDaySlotsStartTime: number[];
}

/**
 * Builds the schedule the way Bahmni's own drug chart does: when some of today's
 * times have passed, the rest of today goes in firstDay, the daily pattern starts
 * tomorrow, and the missed ones are made up on the final day. Otherwise the daily
 * pattern starts today.
 */
export const buildSchedule = (
  medicine: Pick<CurrentMedicine, 'uuid' | 'durationDays'>,
  patientUuid: string,
  providerUuid: string,
  hours: number[],
  now: Date = new Date(),
): ScheduleRequest => {
  const midnight = new Date(now);
  midnight.setHours(0, 0, 0, 0);
  const todayStart = Math.floor(midnight.getTime() / 1000);
  const nowSeconds = Math.floor(now.getTime() / 1000);
  const today = [...hours]
    .sort((a, b) => a - b)
    .map((h) => todayStart + h * HOUR);
  const missed = today.filter((time) => time <= nowSeconds);
  const days = medicine.durationDays ?? 1;
  const partial = missed.length > 0;
  return {
    patientUuid,
    orderUuid: medicine.uuid,
    providerUuid,
    serviceType: 'MEDICATION_REQUEST',
    medicationFrequency: 'FIXED_SCHEDULE_FREQUENCY',
    firstDaySlotsStartTime: partial ? today.filter((t) => t > nowSeconds) : [],
    dayWiseSlotsStartTime: partial ? today.map((t) => t + DAY) : today,
    remainingDaySlotsStartTime: partial
      ? missed.map((t) => t + days * DAY)
      : [],
  };
};

export const scheduleOrder = (request: ScheduleRequest) =>
  post(`${IPD}/schedule/type/medication`, request);
