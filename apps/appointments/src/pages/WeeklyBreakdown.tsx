import type { Appointment } from '@bahmni/services';
import { useTranslation } from '@bahmni/services';
import styles from './styles/index.module.scss';

type Group = 'speciality' | 'provider' | 'location';

const dateKey = (date: Date) =>
  [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');

export const groupWeeklyAppointments = (
  appointments: Appointment[],
  group: Group,
) => {
  const rows = new Map<
    string,
    { name: string; counts: Record<string, number> }
  >();
  for (const appointment of appointments) {
    const members =
      group === 'speciality'
        ? [appointment.service?.speciality]
        : group === 'location'
          ? [appointment.location]
          : appointment.providers?.length
            ? appointment.providers
            : [appointment.provider];
    const day = dateKey(new Date(appointment.startDateTime));
    for (const member of members) {
      if (!member?.name) continue;
      const id = member.uuid ?? member.name;
      const row = rows.get(id) ?? { name: member.name, counts: {} };
      row.counts[day] = (row.counts[day] ?? 0) + 1;
      rows.set(id, row);
    }
  }
  return [...rows.entries()]
    .map(([id, row]) => ({ id, ...row }))
    .sort((a, b) => a.name.localeCompare(b.name));
};

export const WeeklyBreakdown = ({
  group,
  days,
  appointments,
  loading,
  error,
}: {
  group: Group;
  days: Date[];
  appointments: Appointment[];
  loading: boolean;
  error: boolean;
}) => {
  const { t } = useTranslation();
  const rows = groupWeeklyAppointments(appointments, group);
  const title = t(`APPOINTMENTS_${group.toUpperCase()}_SUMMARY`);

  return (
    <section className={styles.panel} aria-labelledby={`${group}-summary`}>
      <div className={styles.panelHeading}>
        <h2 id={`${group}-summary`}>{title}</h2>
      </div>
      {loading ? (
        <p className={styles.message} role="status">
          {t('APPOINTMENTS_LOADING')}
        </p>
      ) : error ? (
        <p className={styles.message} role="alert">
          {t('APPOINTMENTS_SUMMARY_ERROR')}
        </p>
      ) : rows.length === 0 ? (
        <p className={styles.message}>{t('APPOINTMENTS_BREAKDOWN_EMPTY')}</p>
      ) : (
        <div className={styles.tableScroll}>
          <table>
            <thead>
              <tr>
                <th scope="col">{title}</th>
                {days.map((day) => (
                  <th scope="col" key={dateKey(day)}>
                    {new Intl.DateTimeFormat(undefined, {
                      weekday: 'short',
                      day: 'numeric',
                    }).format(day)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <th scope="row">{row.name}</th>
                  {days.map((day) => (
                    <td key={dateKey(day)}>{row.counts[dateKey(day)] ?? 0}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
};
