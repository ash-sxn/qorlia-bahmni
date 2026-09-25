import type { Appointment } from '@bahmni/services';
import { filterAppointments } from '../AppointmentListPage';

it('filters appointments by patient, service, provider, location and status', () => {
  const appointments = [
    {
      patient: { name: 'Anita Rao', identifier: 'DEMO-101' },
      service: { uuid: 'service-1' },
      providers: [{ uuid: 'provider-1' }],
      location: { uuid: 'location-1' },
      status: 'Scheduled',
    },
    {
      patient: { name: 'Other Patient', identifier: 'DEMO-202' },
      service: { uuid: 'service-2' },
      providers: [{ uuid: 'provider-2' }],
      location: { uuid: 'location-2' },
      status: 'WaitList',
    },
  ] as Appointment[];

  expect(
    filterAppointments(appointments, {
      patient: 'demo-101',
      serviceUuid: 'service-1',
      providerUuid: 'provider-1',
      locationUuid: 'location-1',
      status: 'Scheduled',
    }),
  ).toEqual([appointments[0]]);
});
