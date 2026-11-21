import { Button, InlineLoading, Panel } from '@bahmni/design-system';
import {
  type Appointment,
  getAppointmentsForDate,
  useTranslation,
} from '@bahmni/services';
import { type ShellNavItem, useHasPrivilege } from '@bahmni/widgets';
import { useQuery } from '@tanstack/react-query';
import React from 'react';
import styles from './Today.module.scss';
import { getTodayQueue } from './todayService';

const time = new Intl.DateTimeFormat(undefined, {
  hour: '2-digit',
  minute: '2-digit',
});

const STATUS_KEYS: Record<string, string> = {
  Scheduled: 'FRONTDESK_STATUS_SCHEDULED',
  CheckedIn: 'FRONTDESK_STATUS_CHECKED_IN',
  Completed: 'FRONTDESK_STATUS_COMPLETED',
  Missed: 'FRONTDESK_STATUS_MISSED',
  Cancelled: 'FRONTDESK_STATUS_CANCELLED',
  WaitList: 'FRONTDESK_STATUS_WAITLIST',
};

/** Still to come: booked for today and not yet checked in, seen, missed or cancelled. */
export const isExpected = (appointment: Pick<Appointment, 'status'>) =>
  appointment.status === 'Scheduled';

const dayStart = (now: Date) => {
  const day = new Date(now);
  day.setHours(0, 0, 0, 0);
  return day;
};

interface FrontDeskProps {
  heading: React.ReactNode;
  items: ShellNavItem[];
}

/**
 * The front desk's first screen: who is booked today, who has arrived, and the
 * two things reception does all day, register and book. It only reads.
 */
export const FrontDesk: React.FC<FrontDeskProps> = ({ heading, items }) => {
  const { t } = useTranslation();
  const canSeeAppointments = useHasPrivilege('app:appointments');
  const now = new Date();
  const appointments = useQuery({
    queryKey: ['frontdesk', 'appointments', now.toDateString()],
    queryFn: () => getAppointmentsForDate(dayStart(now)),
    enabled: canSeeAppointments,
    refetchInterval: 60_000,
    retry: false,
  });
  const arrivals = useQuery({
    queryKey: ['frontdesk', 'arrivals', now.toDateString()],
    queryFn: () => getTodayQueue(now),
    refetchInterval: 60_000,
    retry: false,
  });
  const registrationV2 = items.find(
    (item) => item.id === 'bahmni.registration.new',
  );
  const registration =
    registrationV2 ?? items.find((item) => item.id === 'bahmni.registration');
  const appointmentsItem = items.find(
    (item) => item.id === 'bahmni.appointment.scheduling',
  );
  const list = [...(appointments.data ?? [])].sort(
    (a, b) => a.startDateTime - b.startDateTime,
  );
  const checkedIn = list.filter(
    ({ status }) => status === 'CheckedIn' || status === 'Completed',
  ).length;
  const expected = list.filter(isExpected).length;

  const patientName = (appointment: Appointment) =>
    registrationV2 ? (
      <a
        className={styles.patient}
        href={`/bahmni-v2/registration/patient/${encodeURIComponent(appointment.patient.uuid)}`}
      >
        {appointment.patient.name}
      </a>
    ) : (
      <span className={styles.patient}>{appointment.patient.name}</span>
    );

  const renderAppointments = () => {
    if (!canSeeAppointments) {
      return (
        <p className={styles.empty}>{t('FRONTDESK_NO_APPOINTMENTS_ACCESS')}</p>
      );
    }
    if (appointments.isPending) {
      return <InlineLoading description={t('FRONTDESK_LOADING')} />;
    }
    if (appointments.isError) {
      return (
        <p role="alert" className={styles.error}>
          {t('FRONTDESK_ERROR')}
        </p>
      );
    }
    if (list.length === 0) {
      return <p className={styles.empty}>{t('FRONTDESK_NONE_BOOKED')}</p>;
    }
    return (
      <div className={styles.tableWrap}>
        <table className={styles.queue}>
          <thead>
            <tr>
              <th scope="col">{t('TODAY_COLUMN_TIME')}</th>
              <th scope="col">{t('TODAY_COLUMN_PATIENT')}</th>
              <th scope="col">{t('FRONTDESK_COLUMN_SERVICE')}</th>
              <th scope="col">{t('TODAY_COLUMN_STATUS')}</th>
            </tr>
          </thead>
          <tbody>
            {list.map((appointment) => (
              <tr key={appointment.uuid}>
                <td className={styles.time}>
                  {time.format(new Date(appointment.startDateTime))}
                </td>
                <td>
                  {patientName(appointment)}
                  <span className={styles.meta}>
                    {[
                      appointment.patient.age !== undefined &&
                        appointment.patient.age !== null &&
                        t('TODAY_AGE', { count: appointment.patient.age }),
                      appointment.patient.gender,
                      appointment.patient.identifier,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                </td>
                <td>
                  {appointment.service?.name}
                  {appointment.provider?.name && (
                    <span className={styles.meta}>
                      {appointment.provider.name}
                    </span>
                  )}
                </td>
                <td>
                  <span
                    className={`${styles.status} ${isExpected(appointment) ? styles.waiting : styles.done}`}
                  >
                    {t(STATUS_KEYS[appointment.status] ?? appointment.status, {
                      defaultValue: appointment.status,
                    })}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  return (
    <main className={styles.page}>
      <div className={styles.heading}>
        {heading}
        <div className={styles.headingActions}>
          {appointmentsItem && (
            <Button kind="tertiary" href={appointmentsItem.href}>
              {t('FRONTDESK_BOOK')}
            </Button>
          )}
          {registration && (
            <Button href={registration.href}>{t('TODAY_REGISTER')}</Button>
          )}
        </div>
      </div>
      <div className={styles.columns}>
        <section
          className={styles.queuePanel}
          aria-label={t('FRONTDESK_APPOINTMENTS')}
        >
          <h2 className={styles.panelTitle}>{t('FRONTDESK_APPOINTMENTS')}</h2>
          {renderAppointments()}
        </section>
        <aside className={styles.rail}>
          <Panel title={t('TODAY_SUMMARY')} variant="summary">
            <dl className={styles.counts}>
              <dt>{t('FRONTDESK_COUNT_BOOKED')}</dt>
              <dd>{canSeeAppointments ? list.length : '–'}</dd>
              <dt>{t('FRONTDESK_COUNT_ARRIVED')}</dt>
              <dd>{canSeeAppointments ? checkedIn : '–'}</dd>
              <dt>{t('FRONTDESK_COUNT_EXPECTED')}</dt>
              <dd>{canSeeAppointments ? expected : '–'}</dd>
              <dt>{t('FRONTDESK_COUNT_VISITS')}</dt>
              <dd>{arrivals.isSuccess ? arrivals.data.length : '–'}</dd>
            </dl>
          </Panel>
        </aside>
      </div>
    </main>
  );
};

export default FrontDesk;
