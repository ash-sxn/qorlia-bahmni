import type { Appointment } from '@bahmni/services';
import { groupWeeklyAppointments } from '../WeeklyBreakdown';

it('counts weekly appointments by specialty, provider and location', () => {
  const appointments = [
    {
      startDateTime: Date.parse('2026-09-21T09:00:00+05:30'),
      service: { speciality: { uuid: 'specialty-1', name: 'General' } },
      providers: [{ uuid: 'doctor-1', name: 'Dr Rao' }],
      location: { uuid: 'opd-1', name: 'OPD 1' },
    },
    {
      startDateTime: Date.parse('2026-09-21T10:00:00+05:30'),
      service: { speciality: { uuid: 'specialty-1', name: 'General' } },
      providers: [{ uuid: 'doctor-1', name: 'Dr Rao' }],
      location: { uuid: 'opd-1', name: 'OPD 1' },
    },
  ] as Appointment[];

  expect(groupWeeklyAppointments(appointments, 'speciality')[0].counts).toEqual(
    { '2026-09-21': 2 },
  );
  expect(groupWeeklyAppointments(appointments, 'provider')[0].name).toBe(
    'Dr Rao',
  );
  expect(groupWeeklyAppointments(appointments, 'location')[0].counts).toEqual({
    '2026-09-21': 2,
  });
});
