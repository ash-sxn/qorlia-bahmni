import type { Appointment, Bundle } from 'fhir/r4';

export type { CheckInAppointmentResponse } from '../patientService/models';

export interface AppointmentPage {
  bundle: Bundle<Appointment>;
  total: number;
}

export interface AppointmentSummary {
  appointmentService: AppointmentService;
  appointmentCountMap: Record<
    string,
    {
      allAppointmentsCount: number;
      missedAppointmentsCount: number;
      appointmentServiceUuid: string;
    }
  >;
}

export interface AppointmentBookingRequest {
  patientUuid: string;
  serviceUuid: string;
  locationUuid: string;
  startDateTime: string;
  endDateTime: string;
  appointmentKind: 'Scheduled';
  status: 'Scheduled' | 'Requested';
  providers: {
    uuid: string;
    response: 'ACCEPTED' | 'AWAITING';
    comments: null;
  }[];
  comments?: string;
}

export type AppointmentBookingConflicts = Record<string, unknown[]>;

interface Speciality {
  uuid: string;
  name: string;
}

interface Location {
  name: string;
  uuid: string;
}

interface AppointmentAttribute {
  uuid: string;
  attributeType: string;
  attributeTypeUuid: string;
  value: string;
}

export interface AppointmentService {
  appointmentServiceId: number;
  uuid: string;
  name: string;
  description: string | null;
  speciality: Speciality | null;
  attributes: AppointmentAttribute[] | null;
  startTime: string;
  endTime: string;
  location: Location | null;
  durationMins?: number | null;
  color: string;
  initialAppointmentStatus: string | null;
}

export interface AppointmentUnavailability {
  uuid: string;
  location: {
    uuid: string;
    name: string;
  };
  service: {
    uuid: string;
    name: string;
  } | null;
  provider: {
    uuid: string;
    name: string;
  } | null;
  startDate: string;
  startTime: string;
  endDate: string;
  endTime: string;
  voided: boolean;
  dateCreated: string;
  creatorName: string;
}

export interface CreateUnavailabilityRequest {
  locationUuid: string;
  appointmentServiceUuid?: string;
  providerUuid?: string;
  startDate: string;
  startTime: string;
  endDate: string;
  endTime: string;
}
