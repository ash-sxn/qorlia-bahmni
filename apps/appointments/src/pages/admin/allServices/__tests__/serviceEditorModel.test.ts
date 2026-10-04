import type { AppointmentService } from '@bahmni/services';
import {
  fieldsFromService,
  serviceSaveRequest,
  validAttributes,
  validAvailability,
  validNewServiceType,
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

it('checks required and maximum service attributes without changing saved values', () => {
  const types = [{ uuid: 'room', name: 'Room', minOccurs: 1, maxOccurs: 2 }];
  const first = { attributeTypeUuid: 'room', value: 'A1' };
  expect(validAttributes([], types)).toBe(false);
  expect(validAttributes([first], types)).toBe(true);
  expect(validAttributes([first, { ...first, value: '' }], types)).toBe(false);
  expect(validAttributes([first, first, first], types)).toBe(false);
  expect(validAttributes([first, { ...first, voided: true }], types)).toBe(
    true,
  );
});

it('saves new attributes and service types without losing their values', () => {
  const fields = fieldsFromService();
  fields.name = 'OPD';
  fields.durationMins = '15';
  fields.startTime = '09:00';
  fields.endTime = '17:00';
  const attributes = [{ attributeTypeUuid: 'room', value: 'A1' }];
  const types = [{ name: 'Follow-up', duration: 10 }];
  expect(
    serviceSaveRequest(undefined, fields, [], attributes, types),
  ).toMatchObject({
    name: 'OPD',
    startTime: '09:00:00',
    endTime: '17:00:00',
    attributes,
    serviceTypes: types,
  });
  expect(validNewServiceType('Follow-up', '10', types)).toBe(false);
  expect(validNewServiceType('Procedure', '-1', types)).toBe(false);
  expect(validNewServiceType('Procedure', '0', types)).toBe(true);
});
