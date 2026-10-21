import { formatAppointmentEndTime } from '../appointmentTime';

const zone = { locale: 'en-US', timeZone: 'Asia/Kolkata' };
const plain = (value: string | undefined) => value?.replace(/\s/g, ' ');

it('formats an end time on the same day like the start time', () => {
  expect(
    plain(
      formatAppointmentEndTime(
        Date.parse('2026-10-16T13:00:00+05:30'),
        Date.parse('2026-10-16T13:30:00+05:30'),
        zone,
      ),
    ),
  ).toBe('1:30 PM');
});

it('includes the date when the end falls on a later day', () => {
  expect(
    plain(
      formatAppointmentEndTime(
        Date.parse('2026-10-16T23:30:00+05:30'),
        Date.parse('2026-10-17T00:30:00+05:30'),
        zone,
      ),
    ),
  ).toBe('Oct 17, 2026, 12:30 AM');
});

it.each([undefined, null, Number.NaN, 'not-a-date', {}])(
  'returns undefined for a missing or invalid end (%p)',
  (end) => {
    expect(
      formatAppointmentEndTime(
        Date.parse('2026-10-16T13:00:00+05:30'),
        end,
        zone,
      ),
    ).toBeUndefined();
  },
);
