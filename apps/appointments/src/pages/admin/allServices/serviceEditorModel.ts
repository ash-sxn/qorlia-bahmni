import type {
  AppointmentService,
  AppointmentServiceSaveRequest,
} from '@bahmni/services';

export type ServiceFields = {
  name: string;
  description: string;
  durationMins: string;
  maxAppointmentsLimit: string;
  startTime: string;
  endTime: string;
  locationUuid: string;
  specialityUuid: string;
  color: string;
  initialAppointmentStatus: string;
};

export const fieldsFromService = (
  service?: AppointmentService,
  defaultColor = '#006400',
): ServiceFields => ({
  name: service?.name ?? '',
  description: service?.description ?? '',
  durationMins: service?.durationMins?.toString() ?? '',
  maxAppointmentsLimit: service?.maxAppointmentsLimit?.toString() ?? '',
  startTime: service?.startTime?.slice(0, 5) ?? '',
  endTime: service?.endTime?.slice(0, 5) ?? '',
  locationUuid: service?.location?.uuid ?? '',
  specialityUuid: service?.speciality?.uuid ?? '',
  color: service?.color?.trim() ? service.color : defaultColor,
  initialAppointmentStatus: service?.initialAppointmentStatus ?? '',
});

const timeForApi = (time: string) =>
  time ? (time.length === 5 ? `${time}:00` : time) : undefined;

export const serviceSaveRequest = (
  service: AppointmentService | undefined,
  fields: ServiceFields,
  weeklyAvailability: AppointmentServiceSaveRequest['weeklyAvailability'],
): AppointmentServiceSaveRequest => ({
  ...(service?.uuid ? { uuid: service.uuid } : {}),
  name: fields.name.trim(),
  description: fields.description.trim() || null,
  durationMins: fields.durationMins ? Number(fields.durationMins) : null,
  maxAppointmentsLimit: fields.maxAppointmentsLimit
    ? Number(fields.maxAppointmentsLimit)
    : null,
  color: fields.color,
  initialAppointmentStatus: fields.initialAppointmentStatus || null,
  startTime: weeklyAvailability.some((item) => !item.voided)
    ? undefined
    : timeForApi(fields.startTime),
  endTime: weeklyAvailability.some((item) => !item.voided)
    ? undefined
    : timeForApi(fields.endTime),
  specialityUuid: fields.specialityUuid || undefined,
  locationUuid: fields.locationUuid || undefined,
  weeklyAvailability: weeklyAvailability.map((item) => ({
    ...item,
    startTime: timeForApi(item.startTime) ?? '',
    endTime: timeForApi(item.endTime) ?? '',
  })),
  serviceTypes: service?.serviceTypes ?? [],
  attributes: service?.attributes ?? [],
});

export const validAvailability = (
  availability: AppointmentServiceSaveRequest['weeklyAvailability'],
) => {
  const active = availability.filter((item) => !item.voided);
  return active.every(
    (item, index) =>
      item.startTime < item.endTime &&
      !active
        .slice(index + 1)
        .some(
          (other) =>
            item.dayOfWeek === other.dayOfWeek &&
            item.startTime < other.endTime &&
            other.startTime < item.endTime,
        ),
  );
};
