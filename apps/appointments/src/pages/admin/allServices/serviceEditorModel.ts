import type {
  AppointmentAttribute,
  AppointmentService,
  AppointmentServiceSaveRequest,
  AppointmentServiceType,
} from '@bahmni/services';

export type ServiceAttributeType = {
  uuid: string;
  name: string;
  datatype?: string;
  minOccurs?: number;
  maxOccurs?: number;
};

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
  attributes: AppointmentAttribute[] = service?.attributes ?? [],
  serviceTypes: AppointmentServiceType[] = service?.serviceTypes ?? [],
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
  serviceTypes,
  attributes,
});

export const validAttributes = (
  attributes: AppointmentAttribute[],
  types: ServiceAttributeType[],
) =>
  types.every((type) => {
    const values = attributes.filter(
      (attribute) =>
        !attribute.voided && attribute.attributeTypeUuid === type.uuid,
    );
    return (
      values.every((attribute) => attribute.value.trim()) &&
      values.length >= (type.minOccurs ?? 0) &&
      (type.maxOccurs == null ||
        type.maxOccurs < 0 ||
        values.length <= type.maxOccurs)
    );
  });

export const validNewServiceType = (
  name: string,
  duration: string,
  types: AppointmentServiceType[],
) =>
  !!name.trim() &&
  duration !== '' &&
  Number.isFinite(Number(duration)) &&
  Number(duration) >= 0 &&
  !types.some(
    (type) =>
      !type.voided && type.name.toLowerCase() === name.trim().toLowerCase(),
  );

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
