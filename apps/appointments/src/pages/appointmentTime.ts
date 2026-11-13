type DisplayOptions = { locale?: string; timeZone?: string };

const dayKey = (value: Date, timeZone?: string) =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(value);

export const formatAppointmentEndTime = (
  startDateTime: number,
  endDateTime: unknown,
  { locale, timeZone }: DisplayOptions = {},
) => {
  if (typeof endDateTime !== 'number') return undefined;
  const end = new Date(endDateTime);
  if (Number.isNaN(end.getTime())) return undefined;
  const sameDay =
    dayKey(new Date(startDateTime), timeZone) === dayKey(end, timeZone);
  return new Intl.DateTimeFormat(locale, {
    timeZone,
    dateStyle: sameDay ? undefined : 'medium',
    timeStyle: 'short',
  }).format(end);
};
