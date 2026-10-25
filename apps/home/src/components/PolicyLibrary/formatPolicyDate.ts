import { IsoDate } from './types';

/**
 * Formats a YYYY-MM-DD calendar date for display. The date is built and
 * formatted in UTC so it never shifts to a neighbouring day in local time.
 */
export const formatPolicyDate = (
  value: IsoDate | null,
  locale?: string,
): string | null => {
  if (value === null) {
    return null;
  }

  const [year, month, day] = value.split('-').map(Number);

  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(year, month - 1, day)));
};
