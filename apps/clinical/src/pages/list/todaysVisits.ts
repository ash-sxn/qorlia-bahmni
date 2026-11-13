import {
  get,
  getUserLoginLocation,
  getVisitLocationUUID,
  OPENMRS_REST_V1,
} from '@bahmni/services';

export interface TodaysVisit {
  uuid: string;
  startDatetime: string;
  visitType: string | null;
  patientUuid: string;
  patientName: string;
  identifier: string;
}

interface VisitResult {
  uuid: string;
  startDatetime: string;
  stopDatetime: string | null;
  visitType?: { display?: string } | null;
  patient: { uuid: string; display: string; person?: { display?: string } };
}

const VISIT_REPRESENTATION =
  'custom:(uuid,startDatetime,stopDatetime,visitType:(display),patient:(uuid,display,person:(display)))';

// One page is enough for a clinic's day; the list says when it is cut short.
export const TODAYS_VISITS_LIMIT = 100;

const startOfToday = (now: Date) => {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  return start;
};

const toLocalDate = (date: Date) =>
  [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');

/** OpenMRS shows a patient as "ID - Name"; the person carries the name alone. */
const splitPatientDisplay = (patient: VisitResult['patient']) => {
  const [identifier, ...rest] = patient.display.split(' - ');
  const name = patient.person?.display ?? rest.join(' - ');
  return {
    identifier: rest.length > 0 ? identifier : '',
    name: name || patient.display,
  };
};

/**
 * Open visits started today at the visit location of the login location.
 * This includes walk-ins, who have a visit but no appointment.
 */
export const getTodaysVisits = async (
  now: Date = new Date(),
): Promise<TodaysVisit[]> => {
  const { uuid: location } = await getVisitLocationUUID(
    getUserLoginLocation().uuid,
  );
  const start = startOfToday(now);
  const params = new URLSearchParams({
    includeInactive: 'false',
    location,
    fromStartDate: toLocalDate(start),
    v: VISIT_REPRESENTATION,
    limit: String(TODAYS_VISITS_LIMIT),
  });
  const response = await get<{ results?: VisitResult[] }>(
    `${OPENMRS_REST_V1}/visit?${params.toString()}`,
  );

  // Filter again here, so an older backend that ignores a parameter cannot
  // put another day's or a closed visit on the list.
  return (response.results ?? [])
    .filter(
      (visit) =>
        visit.stopDatetime === null &&
        new Date(visit.startDatetime).getTime() >= start.getTime(),
    )
    .map((visit) => {
      const { identifier, name } = splitPatientDisplay(visit.patient);
      return {
        uuid: visit.uuid,
        startDatetime: visit.startDatetime,
        visitType: visit.visitType?.display ?? null,
        patientUuid: visit.patient.uuid,
        patientName: name,
        identifier,
      };
    })
    .sort(
      (a, b) =>
        new Date(a.startDatetime).getTime() -
        new Date(b.startDatetime).getTime(),
    );
};
