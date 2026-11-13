import { Settings } from 'luxon';
import {
  inventoryLocalDateTime,
  inventoryUtcDateTime,
} from '../inventoryDateTime';

const now = Settings.now,
  zone = Settings.defaultZone;
beforeEach(() => {
  Settings.now = () => Date.UTC(2026, 6, 1);
});
afterEach(() => {
  Settings.now = now;
  Settings.defaultZone = zone;
});

it.each([
  ['Asia/Kolkata', '2026-10-23 12:34:56', '2026-10-23T18:04:56'],
  ['Asia/Kathmandu', '2026-10-23 12:00:00', '2026-10-23T17:45:00'],
  ['Pacific/Chatham', '2026-01-10 23:30:00', '2026-01-11T13:15:00'],
  ['America/New_York', '2026-07-01 12:00:00', '2026-07-01T08:00:00'],
  ['America/New_York', '2026-01-01 12:00:00', '2026-01-01T07:00:00'],
  ['Pacific/Kiritimati', '2026-12-31 12:00:00', '2027-01-01T02:00:00'],
  ['UTC', '2026-10-23 12:34:56', '2026-10-23T12:34:56'],
])('round-trips canonical account time in %s', (timezone, utc, local) => {
  expect(inventoryLocalDateTime(utc, timezone)).toBe(local);
  expect(inventoryUtcDateTime(local, timezone)).toBe(utc);
});
it('does not inherit or change the device/default Luxon zone', () => {
  Settings.defaultZone = 'Pacific/Honolulu';
  expect(inventoryLocalDateTime('2026-10-23 12:00:00', 'Asia/Kolkata')).toBe(
    '2026-10-23T17:30:00',
  );
  expect(inventoryUtcDateTime('2026-10-23T17:30', 'Asia/Kolkata')).toBe(
    '2026-10-23 12:00:00',
  );
  expect(Settings.defaultZone.name).toBe('Pacific/Honolulu');
});
it.each([
  [
    'America/New_York',
    '2026-03-08T02:30',
    '2026-03-08 07:30:00',
    '2026-03-08T03:30:00',
  ],
  [
    'Australia/Lord_Howe',
    '2026-10-04T02:15',
    '2026-10-03 15:45:00',
    '2026-10-04T02:45:00',
  ],
])(
  'uses native-style DST gap normalization in %s',
  (timezone, input, utc, normalized) => {
    expect(inventoryUtcDateTime(input, timezone)).toBe(utc);
    expect(inventoryLocalDateTime(utc, timezone)).toBe(normalized);
  },
);
it.each([
  [Date.UTC(2026, 0, 1), '2026-11-01 06:30:00'],
  [Date.UTC(2026, 6, 1), '2026-11-01 05:30:00'],
])(
  'uses the native current-offset guess for an ambiguous local clock at %s',
  (clock, utc) => {
    Settings.now = () => clock;
    expect(
      inventoryUtcDateTime('2026-11-01T01:30:00', 'America/New_York'),
    ).toBe(utc);
    expect(inventoryLocalDateTime(utc, 'America/New_York')).toBe(
      '2026-11-01T01:30:00',
    );
  },
);
it('preserves empty values and native whole-second serialization', () => {
  expect(inventoryLocalDateTime(false, 'Asia/Kolkata')).toBe('');
  expect(inventoryUtcDateTime('', 'Asia/Kolkata')).toBe(false);
  expect(inventoryUtcDateTime('2026-10-23T17:30:12.987', 'Asia/Kolkata')).toBe(
    '2026-10-23 12:00:12',
  );
});
it.each(['Invalid/Zone', ''])(
  'rejects an invalid account zone %s rather than falling back to the device',
  (timezone) => {
    expect(() =>
      inventoryLocalDateTime('2026-10-23 12:00:00', timezone),
    ).toThrow();
    expect(() => inventoryUtcDateTime('2026-10-23T17:30', timezone)).toThrow();
  },
);
it.each([
  '2026-02-30T12:00',
  '2026-01-01T25:00',
  '0999-12-31T23:59',
  '2026-10-23T12:00Z',
  '2026-10-23T12:00+05:30',
  'tomorrow',
  ' 2026-10-23T12:00',
])('rejects invalid local picker input %s', (raw) => {
  expect(() => inventoryUtcDateTime(raw, 'Asia/Kolkata')).toThrow();
});
it.each([
  '2026-02-30 12:00:00',
  '2026-01-01 25:00:00',
  '2026-10-23T12:00:00Z',
  '2026-10-23 12:00:00.001',
  'not a date',
])('does not silently display malformed server time %s', (utc) => {
  expect(() => inventoryLocalDateTime(utc, 'Asia/Kolkata')).toThrow();
});
