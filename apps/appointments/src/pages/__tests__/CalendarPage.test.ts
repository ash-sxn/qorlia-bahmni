import type { Appointment } from '@bahmni/services';
import { visibleCalendarAppointments } from '../CalendarPage';

it('shows active appointments in time order, excluding cancelled and waitlisted entries', () => {
  const appointments = [
    { uuid: 'later', status: 'Scheduled', startDateTime: 200 },
    { uuid: 'cancelled', status: 'Cancelled', startDateTime: 100 },
    { uuid: 'waitlist', status: 'WaitList', startDateTime: 50 },
    { uuid: 'earlier', status: 'Arrived', startDateTime: 150 },
  ] as Appointment[];

  expect(
    visibleCalendarAppointments(appointments).map(({ uuid }) => uuid),
  ).toEqual(['earlier', 'later']);
  expect(appointments[0].uuid).toBe('later');
});
