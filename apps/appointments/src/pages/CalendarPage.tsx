import { BaseLayout, Header } from '@bahmni/design-system';
import {
  BAHMNI_HOME_PATH,
  getAppointmentSummary,
  hasPrivilege,
  searchAppointmentsByAttribute,
  type Appointment,
  useTranslation,
} from '@bahmni/services';
import { useUserPrivilege, UserGlobalAction } from '@bahmni/widgets';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { BookingForm } from './BookingForm';
import styles from './styles/index.module.scss';

const dateKey = (date: Date) =>
  [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');

const weekOf = (date: Date) => {
  const first = new Date(date);
  first.setHours(0, 0, 0, 0);
  first.setDate(first.getDate() - ((first.getDay() + 6) % 7));
  return first;
};

const shiftDay = (date: Date, offset: number) => {
  const next = new Date(date);
  next.setDate(next.getDate() + offset);
  return next;
};

export const visibleCalendarAppointments = (appointments: Appointment[]) =>
  appointments
    .filter(({ status }) => status !== 'Cancelled' && status !== 'WaitList')
    .sort((a, b) => a.startDateTime - b.startDateTime);

const providersFor = (appointment: Appointment) => {
  const names = (appointment.providers ?? [])
    .map((provider) => provider.name)
    .filter((name): name is string => Boolean(name));
  return names.length ? names : [appointment.provider?.name ?? ''];
};

export const CalendarPage = () => {
  const { t } = useTranslation();
  const { userPrivileges, isLoading: privilegesLoading } = useUserPrivilege();
  const canView = hasPrivilege(userPrivileges, 'app:appointments');
  const canBook =
    hasPrivilege(userPrivileges, 'app:appointments:manageAppointmentsTab') &&
    hasPrivilege(userPrivileges, 'Manage Appointments');
  const [view, setView] = useState<'day' | 'week'>('day');
  const [selectedDay, setSelectedDay] = useState(() => dateKey(new Date()));
  const [bookingOpen, setBookingOpen] = useState(false);
  const [bookingMessage, setBookingMessage] = useState('');
  const day = new Date(selectedDay + 'T00:00:00');
  const weekStart = weekOf(day);
  const days = Array.from({ length: 7 }, (_, index) =>
    shiftDay(weekStart, index),
  );
  const start = view === 'week' ? weekStart : day;
  const end = shiftDay(start, view === 'week' ? 6 : 0);
  end.setHours(23, 59, 59, 999);
  const summaryEnd = shiftDay(weekStart, 6);
  summaryEnd.setHours(23, 59, 59, 999);
  const appointments = useQuery({
    queryKey: ['appointment-calendar', view, selectedDay],
    queryFn: () =>
      searchAppointmentsByAttribute({
        startDate: start.toISOString(),
        endDate: end.toISOString(),
      }),
    enabled: canView,
  });
  const summary = useQuery({
    queryKey: ['appointment-summary', dateKey(weekStart)],
    queryFn: () =>
      getAppointmentSummary(weekStart.toISOString(), summaryEnd.toISOString()),
    enabled: canBook && bookingOpen,
  });
  const rows = visibleCalendarAppointments(appointments.data ?? []);
  const providerNames = Array.from(
    new Set(
      rows
        .flatMap(providersFor)
        .map((name) => name || t('APPOINTMENTS_NO_PROVIDER')),
    ),
  ).sort((a, b) => a.localeCompare(b));
  const formatTime = (time: number) =>
    new Intl.DateTimeFormat(undefined, {
      hour: 'numeric',
      minute: '2-digit',
    }).format(time);
  const formatDay = (date: Date) =>
    new Intl.DateTimeFormat(undefined, {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
    }).format(date);

  const appointmentCard = (appointment: Appointment) => (
    <li key={appointment.uuid} className={styles.calendarAppointment}>
      <details>
        <summary>
          <strong>{formatTime(appointment.startDateTime)}</strong>
          <span>{appointment.patient.name}</span>
          <small>
            {appointment.service?.name || t('APPOINTMENTS_NOT_SPECIFIED')}
          </small>
        </summary>
        <div className={styles.calendarDetails}>
          <p>
            {formatTime(appointment.startDateTime)} to{' '}
            {formatTime(appointment.endDateTime)}
          </p>
          <p>
            {t('APPOINTMENTS_STATUS')}: {appointment.status}
          </p>
          <p>
            {t('APPOINTMENTS_LOCATION')}:{' '}
            {appointment.location?.name || t('APPOINTMENTS_NOT_SPECIFIED')}
          </p>
          <a href={'/bahmni-v2/clinical/' + appointment.patient.uuid}>
            {t('APPOINTMENTS_PATIENT')}: {appointment.patient.name} (
            {appointment.patient.identifier})
          </a>
        </div>
      </details>
    </li>
  );

  return (
    <BaseLayout
      header={
        <Header
          breadcrumbItems={[
            { id: 'home', label: t('BREADCRUMB_HOME'), href: BAHMNI_HOME_PATH },
            {
              id: 'appointments',
              label: t('BREADCRUMB_APPOINTMENTS'),
              href: '/bahmni-v2/appointments/',
            },
            {
              id: 'calendar',
              label: t('APPOINTMENTS_CALENDAR'),
              isCurrentPage: true,
            },
          ]}
          userMenu={<UserGlobalAction />}
        />
      }
      main={
        <main className={styles.page}>
          <div className={styles.intro}>
            <span className={styles.eyebrow}>
              {t('APPOINTMENTS_WORKSPACE')}
            </span>
            <h1>{t('APPOINTMENTS_CALENDAR')}</h1>
            <p>{t('APPOINTMENTS_CALENDAR_DESCRIPTION')}</p>
          </div>
          <nav className={styles.viewTabs} aria-label={t('APPOINTMENTS_VIEWS')}>
            <a href="/bahmni-v2/appointments/">{t('APPOINTMENTS_SUMMARY')}</a>
            <a href="/bahmni-v2/appointments/calendar" aria-current="page">
              {t('APPOINTMENTS_CALENDAR')}
            </a>
            <a href="/bahmni-v2/appointments/list">{t('APPOINTMENTS_LIST')}</a>
            <a href="/bahmni-v2/appointments/awaiting">
              {t('APPOINTMENTS_AWAITING')}
            </a>
          </nav>
          {privilegesLoading || userPrivileges === null ? (
            <p role="status">{t('APPOINTMENTS_LOADING')}</p>
          ) : !canView ? (
            <p role="alert">{t('APPOINTMENTS_NO_ACCESS')}</p>
          ) : (
            <section
              className={styles.panel}
              aria-labelledby="calendar-heading"
            >
              <div className={styles.panelHeading}>
                <div>
                  <span className={styles.eyebrow}>
                    {t('APPOINTMENTS_WEEK')}
                  </span>
                  <h2 id="calendar-heading">{t('APPOINTMENTS_CALENDAR')}</h2>
                </div>
                <div className={styles.weekControls}>
                  <button
                    type="button"
                    onClick={() =>
                      setSelectedDay(
                        dateKey(shiftDay(day, view === 'week' ? -7 : -1)),
                      )
                    }
                  >
                    {view === 'week'
                      ? t('APPOINTMENTS_PREVIOUS')
                      : t('APPOINTMENTS_PREVIOUS_DAY')}
                  </button>
                  <label>
                    <span>{t('APPOINTMENTS_CHOOSE_DATE')}</span>
                    <input
                      type="date"
                      value={selectedDay}
                      onChange={(event) =>
                        event.target.value && setSelectedDay(event.target.value)
                      }
                    />
                  </label>
                  <button
                    type="button"
                    onClick={() =>
                      setSelectedDay(
                        dateKey(shiftDay(day, view === 'week' ? 7 : 1)),
                      )
                    }
                  >
                    {view === 'week'
                      ? t('APPOINTMENTS_NEXT')
                      : t('APPOINTMENTS_NEXT_DAY')}
                  </button>
                </div>
              </div>
              <div className={styles.calendarToolbar}>
                <div
                  className={styles.calendarViewSwitch}
                  aria-label={t('APPOINTMENTS_CALENDAR_VIEW')}
                >
                  <button
                    type="button"
                    aria-pressed={view === 'day'}
                    onClick={() => setView('day')}
                  >
                    {t('APPOINTMENTS_DAY_VIEW')}
                  </button>
                  <button
                    type="button"
                    aria-pressed={view === 'week'}
                    onClick={() => setView('week')}
                  >
                    {t('APPOINTMENTS_WEEK_VIEW')}
                  </button>
                </div>
                {canBook && (
                  <button
                    type="button"
                    className={styles.primaryButton}
                    onClick={() => {
                      setBookingOpen(true);
                      setBookingMessage('');
                    }}
                  >
                    {t('APPOINTMENTS_BOOK')}
                  </button>
                )}
              </div>
              {bookingMessage && (
                <p className={styles.successMessage} role="status">
                  {bookingMessage}
                </p>
              )}
              {bookingOpen && summary.isLoading && (
                <p className={styles.message} role="status">
                  {t('APPOINTMENTS_LOADING')}
                </p>
              )}
              {bookingOpen && summary.isError && (
                <p className={styles.message} role="alert">
                  {t('APPOINTMENTS_SUMMARY_ERROR')}
                </p>
              )}
              {bookingOpen && summary.data && (
                <BookingForm
                  services={summary.data}
                  selectedDay={selectedDay}
                  selectedServiceUuid=""
                  onClose={() => setBookingOpen(false)}
                  onBooked={() => {
                    setBookingOpen(false);
                    setBookingMessage(t('APPOINTMENTS_BOOKED'));
                  }}
                />
              )}
              {appointments.isLoading ? (
                <p className={styles.message} role="status">
                  {t('APPOINTMENTS_LOADING')}
                </p>
              ) : appointments.isError ? (
                <p className={styles.message} role="alert">
                  {t('APPOINTMENTS_LIST_ERROR')}
                </p>
              ) : rows.length === 0 ? (
                <p className={styles.message}>
                  {t('APPOINTMENTS_CALENDAR_EMPTY')}
                </p>
              ) : view === 'day' ? (
                <div className={styles.calendarGrid}>
                  {providerNames.map((provider) => (
                    <section
                      key={provider}
                      className={styles.calendarColumn}
                      aria-label={provider}
                    >
                      <h3>{provider}</h3>
                      <ol>
                        {rows
                          .filter((appointment) =>
                            providersFor(appointment)
                              .map(
                                (name) => name || t('APPOINTMENTS_NO_PROVIDER'),
                              )
                              .includes(provider),
                          )
                          .map(appointmentCard)}
                      </ol>
                    </section>
                  ))}
                </div>
              ) : (
                <div className={styles.calendarGrid}>
                  {days.map((calendarDay) => (
                    <section
                      key={dateKey(calendarDay)}
                      className={styles.calendarColumn}
                      aria-label={formatDay(calendarDay)}
                    >
                      <h3>{formatDay(calendarDay)}</h3>
                      <ol>
                        {rows
                          .filter(
                            (appointment) =>
                              dateKey(new Date(appointment.startDateTime)) ===
                              dateKey(calendarDay),
                          )
                          .map(appointmentCard)}
                      </ol>
                    </section>
                  ))}
                </div>
              )}
            </section>
          )}
        </main>
      }
    />
  );
};
