import type { Appointment } from '@bahmni/services';

/** One visit from GET /openmrs/ws/rest/v1/visit with a custom view. */
export interface OverviewVisit {
  uuid: string;
  startDatetime: string;
  visitType: { display: string };
}

/** An OpenMRS REST list. totalCount is present only when totalCount=true is sent. */
export interface RestPage<T> {
  results: T[];
  totalCount?: number;
  links?: { rel: string; uri: string }[];
}

/** A FHIR search with _summary=count returns only the total. */
export interface FhirCount {
  total: number;
}

/** One ward from GET /openmrs/ws/rest/v1/admissionLocation. */
export interface WardBeds {
  ward: { uuid: string; name: string };
  totalBeds: number;
  occupiedBeds: number;
}

/** Only the appointment fields the overview reads. */
export type OverviewAppointment = Pick<Appointment, 'uuid' | 'status'>;

/** Outpatient visits: the total and the count for each visit type. */
export interface OutpatientCount {
  total: number;
  byType: Record<string, number>;
}

export interface StatusCount {
  status: string;
  count: number;
}

export interface WardBedCount {
  ward: string;
  total: number;
  occupied: number;
  free: number;
}
