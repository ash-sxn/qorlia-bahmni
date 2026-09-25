import type { AppointmentService } from '@bahmni/services';
import {
  fieldsFromService,
  serviceSaveRequest,
  validAvailability,
} from '../serviceEditorModel';

it('preserves hidden service types and attributes while editing weekly availability', () => {
  const service = {
    uuid: 'service-1',
    name: 'OPD',
    description: 'Consultation',
    durationMins: 15,
    maxAppointmentsLimit: null,
    startTime: '09:00:00',
    endTime: '17:00:00',
    location: { uuid: 'location-1', name: 'OPD' },
    speciality: null,
    color: '#006400',
    initialAppointmentStatus: 'Scheduled',
    weeklyAvailability: [
      {
        uuid: 'availability-1',
        dayOfWeek: 'MONDAY',
        startTime: '09:00:00',
        endTime: '12:00:05',
      },
    ],
    serviceTypes: [{ uuid: 'type-1', name: 'Follow-up', duration: 10 }],
    attributes: [
      {
        uuid: 'attribute-1',
        attributeTypeUuid: 'attr-type-1',
        value: 'room-1',
      },
    ],
  } as AppointmentService;
  const fields = fieldsFromService(service);
  fields.name = 'OPD consultation';
  const request = serviceSaveRequest(
    service,
    fields,
    service.weeklyAvailability ?? [],
  );

  expect(request).toMatchObject({
    uuid: 'service-1',
    name: 'OPD consultation',
    startTime: undefined,
    endTime: undefined,
    locationUuid: 'location-1',
    weeklyAvailability: [
      {
        uuid: 'availability-1',
        dayOfWeek: 'MONDAY',
        startTime: '09:00:00',
        endTime: '12:00:05',
      },
    ],
    serviceTypes: service.serviceTypes,
    attributes: service.attributes,
  });
  expect(
    validAvailability([
      ...request.weeklyAvailability,
      { dayOfWeek: 'MONDAY', startTime: '11:00', endTime: '13:00' },
    ]),
  ).toBe(false);
});
