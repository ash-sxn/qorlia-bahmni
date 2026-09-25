import type { Appointment as FhirAppointment, Bundle } from 'fhir/r4';
import { del, get, post } from '../api';
import type { Appointment as LegacyAppointment } from '../patientService/models';
import {
  ALL_APPOINTMENT_SERVICES_URL,
  APPOINTMENT_SERVICE_URL,
  APPOINTMENT_CONFLICTS_URL,
  APPOINTMENT_DAY_URL,
  APPOINTMENT_LEGACY_SEARCH_URL,
  APPOINTMENT_SAVE_URL,
  APPOINTMENT_SUMMARY_URL,
  APPOINTMENTS_SEARCH_URL,
  APPOINTMENT_UNAVAILABILITY_URL,
  getAppointmentByIdUrl,
  getDeleteAppointmentServiceUrl,
  updateAppointmentStatusUrl,
  UPCOMING_APPOINTMENTS_URL,
  PAST_APPOINTMENTS_URL,
  getUpcomingAppointmentsPageUrl,
  getPastAppointmentsPageUrl,
  APPOINTMENT_IDENTIFIER_SYSTEM,
} from './constants';
import {
  AppointmentPage,
  AppointmentBookingConflicts,
  AppointmentBookingRequest,
  AppointmentService,
  AppointmentServiceSaveRequest,
  AppointmentSummary,
  AppointmentUnavailability,
  CheckInAppointmentResponse,
  CreateUnavailabilityRequest,
} from './models';

/**
 * Search for appointments by specified attributes.
 *
 * @param searchParam - Search parameters for appointments
 * @returns Bahmni appointment records matching search criteria. Consumer is responsible for transformation to view model
 * @throws Error if the API request fails
 */
export const searchAppointmentsByAttribute = async (
  searchParam: Record<string, string>,
): Promise<LegacyAppointment[]> => {
  return await post<LegacyAppointment[]>(APPOINTMENTS_SEARCH_URL, searchParam);
};

export const getAppointmentsForDate = (
  date: Date,
): Promise<LegacyAppointment[]> =>
  get<LegacyAppointment[]>(
    `${APPOINTMENT_DAY_URL}?${new URLSearchParams({ forDate: date.toISOString() })}`,
  );

export const getWaitlistedAppointments = (filters: {
  serviceUuids: string[];
  providerUuids: string[];
  locationUuids: string[];
}): Promise<LegacyAppointment[]> =>
  post<LegacyAppointment[]>(APPOINTMENT_LEGACY_SEARCH_URL, {
    ...filters,
    serviceTypeUuids: [],
    statusList: ['WaitList'],
    status: 'WaitList',
  });

export const getAppointmentSummary = (
  startDate: string,
  endDate: string,
): Promise<AppointmentSummary[]> =>
  get<AppointmentSummary[]>(
    `${APPOINTMENT_SUMMARY_URL}?${new URLSearchParams({ startDate, endDate })}`,
  );

export const getAppointmentBookingConflicts = (
  request: AppointmentBookingRequest,
): Promise<AppointmentBookingConflicts> =>
  post<AppointmentBookingConflicts>(APPOINTMENT_CONFLICTS_URL, request);

export const bookAppointment = (
  request: AppointmentBookingRequest,
): Promise<LegacyAppointment> =>
  post<LegacyAppointment>(APPOINTMENT_SAVE_URL, request);

const legacyStatus: Record<string, FhirAppointment['status']> = {
  Requested: 'proposed',
  WaitList: 'waitlist',
  Scheduled: 'booked',
  Arrived: 'arrived',
  CheckedIn: 'arrived',
  Completed: 'fulfilled',
  Cancelled: 'cancelled',
  Missed: 'noshow',
};

const toFhirAppointment = (
  appointment: LegacyAppointment,
): FhirAppointment => ({
  resourceType: 'Appointment',
  id: appointment.uuid,
  status: legacyStatus[appointment.status] ?? 'proposed',
  identifier: [
    {
      system: APPOINTMENT_IDENTIFIER_SYSTEM,
      value: appointment.appointmentNumber,
    },
  ],
  serviceType: [{ text: appointment.service?.name ?? '' }],
  reasonCode: appointment.reasons?.map((reason) => ({ text: reason.name })),
  start: new Date(appointment.startDateTime).toISOString(),
  end: new Date(appointment.endDateTime).toISOString(),
  participant: [
    {
      actor: {
        reference: `Patient/${appointment.patient.uuid}`,
        display: appointment.patient.name,
      },
      status: 'accepted',
    },
    ...(appointment.providers?.length
      ? appointment.providers
      : appointment.provider
        ? [appointment.provider]
        : []
    ).map((provider) => ({
      actor: {
        reference: `Practitioner/${provider.uuid}`,
        display: provider.name,
      },
      status: 'accepted' as const,
    })),
  ],
});

async function getLegacyPatientAppointments(
  patientUuid: string,
  type: 'upcoming' | 'past',
): Promise<Bundle<FhirAppointment>> {
  const now = new Date().toISOString();
  const appointments = await post<LegacyAppointment[]>(
    APPOINTMENTS_SEARCH_URL,
    {
      patientUuid,
      startDate: type === 'past' ? '1970-01-01T00:00:00.000Z' : now,
      // ponytail: The legacy search caps unbounded results. The 2100 ceiling avoids that cap; use server pagination if this horizon becomes relevant.
      endDate: type === 'past' ? now : '2100-01-01T00:00:00.000Z',
    },
  );
  const ordered = [...appointments].sort((a, b) =>
    type === 'past'
      ? b.startDateTime - a.startDateTime
      : a.startDateTime - b.startDateTime,
  );
  return {
    resourceType: 'Bundle',
    type: 'searchset',
    total: ordered.length,
    entry: ordered.map((appointment) => ({
      resource: toFhirAppointment(appointment),
    })),
  };
}

async function getPatientAppointmentBundle(
  url: string,
  patientUuid: string,
  type: 'upcoming' | 'past',
  count?: number,
  offset: number = 0,
): Promise<Bundle<FhirAppointment>> {
  try {
    return await get<Bundle<FhirAppointment>>(url);
  } catch (error) {
    if (
      !(error instanceof Error) ||
      !('status' in error) ||
      error.status !== 404
    )
      throw error;
    const bundle = await getLegacyPatientAppointments(patientUuid, type);
    return count && count > 0
      ? { ...bundle, entry: bundle.entry?.slice(offset, offset + count) }
      : bundle;
  }
}

/**
 * Fetch upcoming appointments for a patient.
 *
 * @param patientUuid - Patient UUID to fetch appointments for
 * @returns Raw FHIR Bundle containing upcoming appointments. Consumer is responsible for transformation to view model
 * @throws Error if the API request fails
 */
export async function getUpcomingAppointments(
  patientUuid: string,
): Promise<Bundle<FhirAppointment>> {
  return getPatientAppointmentBundle(
    UPCOMING_APPOINTMENTS_URL(patientUuid),
    patientUuid,
    'upcoming',
  );
}

/**
 * Fetch past appointments for a patient.
 *
 * @param patientUuid - Patient UUID to fetch appointments for
 * @param count - Optional limit on number of past appointments to fetch (from config)
 * @returns Raw FHIR Bundle containing past appointments sorted by date (most recent first). Consumer is responsible for transformation to view model
 * @throws Error if the API request fails
 */
export async function getPastAppointments(
  patientUuid: string,
  count?: number,
): Promise<Bundle<FhirAppointment>> {
  return getPatientAppointmentBundle(
    PAST_APPOINTMENTS_URL(patientUuid, count),
    patientUuid,
    'past',
    count,
  );
}

/**
 * Update the status of an appointment.
 *
 * @param appointmentUuid - Appointment UUID to update
 * @param toStatus - New status value
 * @param onDate - Optional date for the status update
 * @returns Raw FHIR Appointment resource with updated status. Consumer is responsible for transformation to view model
 * @throws Error if the API request fails
 */
export const updateAppointmentStatus = async (
  appointmentUuid: string,
  toStatus: string,
  onDate?: Date,
) => {
  return await post(updateAppointmentStatusUrl(appointmentUuid), {
    toStatus,
    onDate,
  });
};

export const checkInAppointment = async (
  submitUrl: string,
  appointmentUuid: string,
) => post<CheckInAppointmentResponse>(submitUrl, { appointmentUuid });

/**
 * Fetch a specific appointment by ID.
 *
 * @param uuid - Appointment UUID
 * @returns Raw FHIR Appointment resource. Consumer is responsible for transformation to view model
 * @throws Error if the API request fails
 */
export async function getAppointmentById(uuid: string) {
  return await get(getAppointmentByIdUrl(uuid));
}

/**
 * Fetches all the appointment service definitions
 * @returns A list of Appointment Service Definitions
 */
export const getAllAppointmentServices = async (): Promise<
  AppointmentService[]
> => {
  return await get<AppointmentService[]>(ALL_APPOINTMENT_SERVICES_URL);
};

export const getAppointmentService = (
  uuid: string,
): Promise<AppointmentService> =>
  get<AppointmentService>(
    `${APPOINTMENT_SERVICE_URL}?${new URLSearchParams({ uuid })}`,
  );

export const saveAppointmentService = (
  service: AppointmentServiceSaveRequest,
): Promise<AppointmentService> =>
  post<AppointmentService>(APPOINTMENT_SERVICE_URL, service);

/**
 * Deletes an appointment service definition by UUID.
 *
 * @param uuid - UUID of the appointment service to delete
 * @throws Error if the API request fails
 */
export const deleteAppointmentService = async (uuid: string): Promise<void> => {
  await del(getDeleteAppointmentServiceUrl(uuid));
};

/**
 * Fetches a single page of upcoming appointments using offset-based pagination.
 * @param patientUuid - The UUID of the patient
 * @param count - Number of items per page (default 10)
 * @param page - 1-based page number (default 1)
 * @returns Promise resolving to an AppointmentPage with bundle and total count
 */
export async function getUpcomingAppointmentsPage(
  patientUuid: string,
  count: number = 10,
  page: number = 1,
): Promise<AppointmentPage> {
  const offset = (page - 1) * count;
  const bundle = await getPatientAppointmentBundle(
    getUpcomingAppointmentsPageUrl(patientUuid, count, offset),
    patientUuid,
    'upcoming',
    count,
    offset,
  );
  const total = bundle.total ?? bundle.entry?.length ?? 0;
  return { bundle, total };
}

/**
 * Fetches a single page of past appointments using offset-based pagination.
 * @param patientUuid - The UUID of the patient
 * @param count - Number of items per page (default 10)
 * @param page - 1-based page number (default 1)
 * @returns Promise resolving to an AppointmentPage with bundle and total count
 */
export async function getPastAppointmentsPage(
  patientUuid: string,
  count: number = 10,
  page: number = 1,
): Promise<AppointmentPage> {
  const offset = (page - 1) * count;
  const bundle = await getPatientAppointmentBundle(
    getPastAppointmentsPageUrl(patientUuid, count, offset),
    patientUuid,
    'past',
    count,
    offset,
  );
  const total = bundle.total ?? bundle.entry?.length ?? 0;
  return { bundle, total };
}

/**
 * Fetches all appointment unavailabilities
 * @returns A list of Appointment Unavailabilities
 */
export const getAppointmentUnavailabilities = async (): Promise<
  AppointmentUnavailability[]
> => {
  return await get<AppointmentUnavailability[]>(APPOINTMENT_UNAVAILABILITY_URL);
};

/**
 * Creates a new appointment unavailability
 * @param data - The unavailability data to create
 * @returns Resolves when creation completes
 */
export const createAppointmentUnavailability = async (
  data: CreateUnavailabilityRequest[],
): Promise<void> => {
  await post(APPOINTMENT_UNAVAILABILITY_URL, data);
};
