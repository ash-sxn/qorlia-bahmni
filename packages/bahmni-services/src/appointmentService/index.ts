export {
  searchAppointmentsByAttribute,
  getAppointmentSummary,
  getAppointmentBookingConflicts,
  bookAppointment,
  updateAppointmentStatus,
  checkInAppointment,
  getAppointmentById,
  getUpcomingAppointments,
  getPastAppointments,
  getUpcomingAppointmentsPage,
  getPastAppointmentsPage,
  getAllAppointmentServices,
  deleteAppointmentService,
  getAppointmentUnavailabilities,
  createAppointmentUnavailability,
} from './appointmentService';
export {
  type AppointmentPage,
  type AppointmentSummary,
  type AppointmentBookingConflicts,
  type AppointmentBookingRequest,
  type AppointmentService,
  type AppointmentUnavailability,
  type CheckInAppointmentResponse,
  type CreateUnavailabilityRequest,
} from './models';
export {
  APPOINTMENT_STATUSES,
  APPOINTMENT_IDENTIFIER_SYSTEM,
} from './constants';
