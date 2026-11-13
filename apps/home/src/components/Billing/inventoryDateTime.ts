import { DateTime } from 'luxon';

const serverFormat = 'yyyy-MM-dd HH:mm:ss';
const inputFormat = "yyyy-MM-dd'T'HH:mm:ss";

export function inventoryLocalDateTime(
  value: string | false,
  timezone: string,
): string {
  if (value === false) return '';
  if (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value))
    throw new Error(
      'The stored native date-time is invalid. Reload the transfer.',
    );
  const utc = DateTime.fromSQL(value, {
    zone: 'utc',
    locale: 'en',
    numberingSystem: 'latn',
  });
  const local = utc.setZone(timezone);
  if (!utc.isValid || utc.toFormat(serverFormat) !== value || !local.isValid)
    throw new Error(
      'The stored date-time or Billing account time zone is invalid. Reload the transfer.',
    );
  return local.toFormat(inputFormat, { numberingSystem: 'latn' });
}

export function inventoryUtcDateTime(
  value: string,
  timezone: string,
): string | false {
  if (!value) return false;
  if (!/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2}(\.\d{1,9})?)?$/.test(value))
    throw new Error(
      'Enter a complete date and time in the Billing account time zone.',
    );
  // Native Odoo uses Luxon in the account zone, including its DST gap/fold policy.
  const local = DateTime.fromISO(value.replace(' ', 'T'), {
    zone: timezone,
    setZone: true,
    locale: 'en',
    numberingSystem: 'latn',
  });
  const utc = local.toUTC();
  if (
    !local.isValid ||
    local.year < 1000 ||
    local.year >= 10000 ||
    !utc.isValid ||
    utc.year < 1 ||
    utc.year >= 10000
  )
    throw new Error(
      'Enter a valid native date and time in the Billing account time zone.',
    );
  return utc.toFormat(serverFormat, { numberingSystem: 'latn' });
}
