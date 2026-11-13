import {
  get,
  getAppointmentsForDate,
  getEncounterTypeByName,
  OPENMRS_FHIR_R4,
  OPENMRS_REST_V1,
} from '@bahmni/services';
import { dayBounds, localDateTime } from './overviewFigures';
import {
  FhirCount,
  OverviewAppointment,
  OverviewVisit,
  RestPage,
  WardBeds,
} from './types';

// Read-only: every call in this file is a GET. Nothing here saves or changes data.

const VISIT_VIEW = 'custom:(uuid,startDatetime,visitType:(display))';
const VISIT_PAGE_SIZE = 100;
/** A safety stop, so a server that keeps sending "next" cannot loop forever. */
const MAX_VISIT_PAGES = 50;

/** Every visit that started on the day of `day`, for the whole hospital, closed visits included. */
export const getVisitsForDay = async (day: Date): Promise<OverviewVisit[]> => {
  const { start, end } = dayBounds(day);
  const visits: OverviewVisit[] = [];

  for (let page = 0; page < MAX_VISIT_PAGES; page += 1) {
    const params = new URLSearchParams({
      fromStartDate: localDateTime(start),
      // toStartDate includes its own moment, so stop one millisecond before the next day.
      toStartDate: localDateTime(new Date(end.getTime() - 1)),
      includeInactive: 'true',
      v: VISIT_VIEW,
      limit: String(VISIT_PAGE_SIZE),
      // Continue from what has arrived, in case the server sends smaller pages than asked.
      startIndex: String(visits.length),
    });
    const response = await get<RestPage<OverviewVisit>>(
      `${OPENMRS_REST_V1}/visit?${params}`,
    );
    visits.push(...response.results);

    if (!response.links?.some(({ rel }) => rel === 'next')) {
      return visits;
    }
  }

  throw new Error(
    `More than ${MAX_VISIT_PAGES * VISIT_PAGE_SIZE} visits in one day; the count was stopped.`,
  );
};

/** How many encounters of the named type (for example ADMISSION) are dated on the day of `day`. */
export const countEncountersForDay = async (
  encounterTypeName: string,
  day: Date,
): Promise<number> => {
  const encounterType = await getEncounterTypeByName(encounterTypeName);
  if (!encounterType) {
    throw new Error(`Encounter type ${encounterTypeName} was not found.`);
  }

  const { start, end } = dayBounds(day);
  // REST /encounter without a patient returns HTTP 500, so the count comes from FHIR (#28).
  const params = new URLSearchParams([
    ['date', `ge${localDateTime(start, ':')}`],
    ['date', `lt${localDateTime(end, ':')}`],
    ['type', encounterType.uuid],
    ['_summary', 'count'],
  ]);
  const { total } = await get<FhirCount>(
    `${OPENMRS_FHIR_R4}/Encounter?${params}`,
  );
  return total;
};

/** The day's appointments, from the shared appointment service. */
export const getAppointmentsForDay = (
  day: Date,
): Promise<OverviewAppointment[]> =>
  getAppointmentsForDate(dayBounds(day).start);

/** Total and occupied beds for every ward. */
export const getWardBeds = async (): Promise<WardBeds[]> => {
  const { results } = await get<RestPage<WardBeds>>(
    `${OPENMRS_REST_V1}/admissionLocation`,
  );
  return results;
};
