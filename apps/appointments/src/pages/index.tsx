import { BaseLayout, Header } from '@bahmni/design-system';
import {
  BAHMNI_HOME_PATH,
  getAppointmentSummary,
  hasPrivilege,
  searchAppointmentsByAttribute,
  useTranslation,
} from '@bahmni/services';
import { useUserPrivilege, UserGlobalAction } from '@bahmni/widgets';
import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { BookingForm } from './BookingForm';
import styles from './styles/index.module.scss';

const dateKey = (date: Date) =>
  [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');

const weekOf = (date: Date) => {
  const day = new Date(date);
  day.setHours(0, 0, 0, 0);
  day.setDate(day.getDate() - ((day.getDay() + 6) % 7));
  return day;
};

const shiftDay = (date: Date, offset: number) => {
  const day = new Date(date);
  day.setDate(day.getDate() + offset);
  return day;
};

const label = (date: Date, options: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat(undefined, options).format(date);

export const IndexPage = () => {
  const { t } = useTranslation();
  const { userPrivileges, isLoading: privilegesLoading } = useUserPrivilege();
  const canView = hasPrivilege(userPrivileges, 'app:appointments');
  const canAdmin = hasPrivilege(userPrivileges, 'app:appointments:adminTab');
  const canBook =
    hasPrivilege(userPrivileges, 'app:appointments:manageAppointmentsTab') &&
    hasPrivilege(userPrivileges, 'Manage Appointments');
  const [bookingOpen, setBookingOpen] = useState(false);
  const [bookingMessage, setBookingMessage] = useState('');
  const [selectedAppointmentUuid, setSelectedAppointmentUuid] = useState('');
  const [weekStart, setWeekStart] = useState(() => weekOf(new Date()));
  const [selectedDay, setSelectedDay] = useState(() => dateKey(new Date()));
  const [serviceUuid, setServiceUuid] = useState('');
  const days = useMemo(
    () => Array.from({ length: 7 }, (_, index) => shiftDay(weekStart, index)),
    [weekStart],
  );
  const weekEnd = shiftDay(weekStart, 6);
  weekEnd.setHours(23, 59, 59, 999);
  const dayStart = new Date(selectedDay + 'T00:00:00');
  const dayEnd = new Date(dayStart);
  dayEnd.setHours(23, 59, 59, 999);
  const summary = useQuery({
    queryKey: ['appointment-summary', dateKey(weekStart)],
    queryFn: () =>
      getAppointmentSummary(weekStart.toISOString(), weekEnd.toISOString()),
    enabled: canView,
  });
  const appointments = useQuery({
    queryKey: ['appointment-day', selectedDay],
    queryFn: () =>
      searchAppointmentsByAttribute({
        startDate: dayStart.toISOString(),
        endDate: dayEnd.toISOString(),
      }),
    enabled: canView,
  });
  const rows = (appointments.data ?? [])
    .filter(
      (appointment) =>
        !serviceUuid || appointment.service?.uuid === serviceUuid,
    )
    .sort((a, b) => a.startDateTime - b.startDateTime);
  const selectedAppointment = rows.find(
    (appointment) => appointment.uuid === selectedAppointmentUuid,
  );

  const changeWeek = (offset: number) => {
    const next = shiftDay(weekStart, offset * 7);
    setWeekStart(next);
    setSelectedDay(dateKey(next));
    setServiceUuid('');
  };

  const chooseDate = (value: string) => {
    if (!value) return;
    const next = new Date(value + 'T00:00:00');
    if (Number.isNaN(next.getTime())) return;
    setWeekStart(weekOf(next));
    setSelectedDay(value);
    setServiceUuid('');
  };

  return (
    <BaseLayout
      header={
        <Header
          breadcrumbItems={[
            { id: 'home', label: t('BREADCRUMB_HOME'), href: BAHMNI_HOME_PATH },
            {
              id: 'appointments',
              label: t('BREADCRUMB_APPOINTMENTS'),
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
            <h1>{t('APPOINTMENTS_HEADING')}</h1>
            <p>{t('APPOINTMENTS_DESCRIPTION')}</p>
          </div>
          <nav className={styles.viewTabs} aria-label={t('APPOINTMENTS_VIEWS')}>
            <a href="/bahmni-v2/appointments/" aria-current="page">
              {t('APPOINTMENTS_SUMMARY')}
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
            <>
              {canBook && (
                <div className={styles.actions}>
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
                </div>
              )}
              {bookingMessage && (
                <p role="status" className={styles.successMessage}>
                  {bookingMessage}
                </p>
              )}
              {bookingOpen && (
                <BookingForm
                  services={summary.data ?? []}
                  selectedDay={selectedDay}
                  selectedServiceUuid={serviceUuid}
                  onClose={() => setBookingOpen(false)}
                  onBooked={() => {
                    setBookingOpen(false);
                    setBookingMessage(t('APPOINTMENTS_BOOKED'));
                  }}
                />
              )}
              <section
                className={styles.panel}
                aria-labelledby="appointment-summary-heading"
              >
                <div className={styles.panelHeading}>
                  <div>
                    <span className={styles.eyebrow}>
                      {t('APPOINTMENTS_WEEK')}
                    </span>
                    <h2 id="appointment-summary-heading">
                      {t('APPOINTMENTS_SUMMARY')}
                    </h2>
                  </div>
                  <div className={styles.weekControls}>
                    <button type="button" onClick={() => changeWeek(-1)}>
                      {t('APPOINTMENTS_PREVIOUS')}
                    </button>
                    <label>
                      <span>{t('APPOINTMENTS_CHOOSE_DATE')}</span>
                      <input
                        type="date"
                        value={selectedDay}
                        onChange={(event) => chooseDate(event.target.value)}
                      />
                    </label>
                    <button type="button" onClick={() => changeWeek(1)}>
                      {t('APPOINTMENTS_NEXT')}
                    </button>
                  </div>
                </div>
                {summary.isLoading ? (
                  <p className={styles.message} role="status">
                    {t('APPOINTMENTS_LOADING')}
                  </p>
                ) : summary.isError ? (
                  <p className={styles.message} role="alert">
                    {t('APPOINTMENTS_SUMMARY_ERROR')}
                  </p>
                ) : (
                  <div className={styles.tableScroll}>
                    <table>
                      <caption>
                        {label(weekStart, { day: 'numeric', month: 'short' })}{' '}
                        to{' '}
                        {label(weekEnd, {
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric',
                        })}
                      </caption>
                      <thead>
                        <tr>
                          <th scope="col">{t('APPOINTMENTS_SERVICE')}</th>
                          {days.map((day) => (
                            <th scope="col" key={dateKey(day)}>
                              {label(day, { weekday: 'short', day: 'numeric' })}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {(summary.data ?? []).map(
                          ({ appointmentService, appointmentCountMap }) => (
                            <tr key={appointmentService.uuid}>
                              <th scope="row">{appointmentService.name}</th>
                              {days.map((day) => {
                                const date = dateKey(day);
                                const count =
                                  appointmentCountMap?.[date]
                                    ?.allAppointmentsCount ?? 0;
                                return (
                                  <td key={date}>
                                    <button
                                      type="button"
                                      className={
                                        selectedDay === date &&
                                        serviceUuid === appointmentService.uuid
                                          ? styles.selectedCount
                                          : styles.count
                                      }
                                      onClick={() => {
                                        setSelectedDay(date);
                                        setServiceUuid(appointmentService.uuid);
                                      }}
                                      aria-label={
                                        appointmentService.name +
                                        ', ' +
                                        label(day, { dateStyle: 'full' }) +
                                        ': ' +
                                        count
                                      }
                                    >
                                      {count}
                                    </button>
                                  </td>
                                );
                              })}
                            </tr>
                          ),
                        )}
                      </tbody>
                    </table>
                    {summary.data?.length === 0 && (
                      <p className={styles.message}>
                        {t('APPOINTMENTS_NO_SERVICES')}
                      </p>
                    )}
                  </div>
                )}
              </section>
              <section
                className={styles.panel}
                aria-labelledby="appointment-list-heading"
              >
                <div className={styles.panelHeading}>
                  <div>
                    <span className={styles.eyebrow}>
                      {label(dayStart, { dateStyle: 'long' })}
                    </span>
                    <h2 id="appointment-list-heading">
                      {t('APPOINTMENTS_DAY_LIST')}
                    </h2>
                  </div>
                  <label className={styles.serviceFilter}>
                    <span>{t('APPOINTMENTS_FILTER_SERVICE')}</span>
                    <select
                      value={serviceUuid}
                      onChange={(event) => setServiceUuid(event.target.value)}
                    >
                      <option value="">{t('APPOINTMENTS_ALL_SERVICES')}</option>
                      {(summary.data ?? []).map(({ appointmentService }) => (
                        <option
                          key={appointmentService.uuid}
                          value={appointmentService.uuid}
                        >
                          {appointmentService.name}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
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
                    {t('APPOINTMENTS_NO_RESULTS')}
                  </p>
                ) : (
                  <div className={styles.tableScroll}>
                    <table>
                      <thead>
                        <tr>
                          <th scope="col">{t('APPOINTMENTS_TIME')}</th>
                          <th scope="col">{t('APPOINTMENTS_PATIENT')}</th>
                          <th scope="col">{t('APPOINTMENTS_SERVICE')}</th>
                          <th scope="col">{t('APPOINTMENTS_PROVIDER')}</th>
                          <th scope="col">{t('APPOINTMENTS_STATUS')}</th>
                          <th scope="col">{t('APPOINTMENTS_DETAILS')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((appointment) => (
                          <tr key={appointment.uuid}>
                            <td>
                              {label(new Date(appointment.startDateTime), {
                                hour: 'numeric',
                                minute: '2-digit',
                              })}
                            </td>
                            <td>
                              <a
                                href={
                                  '/bahmni-v2/clinical/' +
                                  appointment.patient.uuid
                                }
                              >
                                {appointment.patient.name}
                              </a>
                              <small>{appointment.patient.identifier}</small>
                            </td>
                            <td>
                              {appointment.service?.name ||
                                t('APPOINTMENTS_NOT_SPECIFIED')}
                            </td>
                            <td>
                              {appointment.provider?.name ??
                                (appointment.providers
                                  ?.map((provider) => provider.name)
                                  .filter(Boolean)
                                  .join(', ') ||
                                  t('APPOINTMENTS_NOT_SPECIFIED'))}
                            </td>
                            <td>
                              <span className={styles.status}>
                                {appointment.status}
                              </span>
                            </td>
                            <td>
                              <button
                                type="button"
                                className={styles.textButton}
                                onClick={() =>
                                  setSelectedAppointmentUuid(appointment.uuid)
                                }
                                aria-label={`${t('APPOINTMENTS_VIEW_DETAILS')}: ${appointment.patient.name}`}
                              >
                                {t('APPOINTMENTS_VIEW_DETAILS')}
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                {selectedAppointment && (
                  <div className={styles.appointmentDetails}>
                    <div className={styles.detailsHeading}>
                      <h3>{t('APPOINTMENTS_DETAILS')}</h3>
                      <button
                        type="button"
                        className={styles.textButton}
                        onClick={() => setSelectedAppointmentUuid('')}
                      >
                        {t('APPOINTMENTS_CLOSE_DETAILS')}
                      </button>
                    </div>
                    <dl>
                      <div>
                        <dt>{t('APPOINTMENTS_NUMBER')}</dt>
                        <dd>{selectedAppointment.appointmentNumber}</dd>
                      </div>
                      <div>
                        <dt>{t('APPOINTMENTS_PATIENT')}</dt>
                        <dd>{selectedAppointment.patient.name}</dd>
                      </div>
                      <div>
                        <dt>{t('APPOINTMENTS_SERVICE')}</dt>
                        <dd>
                          {selectedAppointment.service?.name ??
                            t('APPOINTMENTS_NOT_SPECIFIED')}
                        </dd>
                      </div>
                      <div>
                        <dt>{t('APPOINTMENTS_PROVIDER')}</dt>
                        <dd>
                          {selectedAppointment.provider?.name ??
                            (selectedAppointment.providers
                              ?.map((provider) => provider.name)
                              .filter(Boolean)
                              .join(', ') ||
                              t('APPOINTMENTS_NOT_SPECIFIED'))}
                        </dd>
                      </div>
                      <div>
                        <dt>{t('APPOINTMENTS_LOCATION')}</dt>
                        <dd>
                          {selectedAppointment.location?.name ??
                            t('APPOINTMENTS_NOT_SPECIFIED')}
                        </dd>
                      </div>
                      <div>
                        <dt>{t('APPOINTMENTS_KIND')}</dt>
                        <dd>{selectedAppointment.appointmentKind}</dd>
                      </div>
                      <div>
                        <dt>{t('APPOINTMENTS_TIME')}</dt>
                        <dd>
                          {label(new Date(selectedAppointment.startDateTime), {
                            dateStyle: 'medium',
                            timeStyle: 'short',
                          })}
                          {' to '}
                          {label(new Date(selectedAppointment.endDateTime), {
                            timeStyle: 'short',
                          })}
                        </dd>
                      </div>
                      <div>
                        <dt>{t('APPOINTMENTS_STATUS')}</dt>
                        <dd>{selectedAppointment.status}</dd>
                      </div>
                      {!!selectedAppointment.reasons?.length && (
                        <div>
                          <dt>{t('APPOINTMENTS_REASON')}</dt>
                          <dd>
                            {selectedAppointment.reasons
                              .map((reason) => reason.name)
                              .join(', ')}
                          </dd>
                        </div>
                      )}
                      {selectedAppointment.comments && (
                        <div className={styles.fullWidth}>
                          <dt>{t('APPOINTMENTS_NOTES')}</dt>
                          <dd>{selectedAppointment.comments}</dd>
                        </div>
                      )}
                    </dl>
                  </div>
                )}
              </section>
              {canAdmin && (
                <nav
                  className={styles.adminLinks}
                  aria-label={t('APPOINTMENTS_ADMIN')}
                >
                  <a href="/bahmni-v2/appointments/admin/services">
                    {t('APPOINTMENTS_MANAGE_SERVICES')}
                  </a>
                  <a href="/bahmni-v2/appointments/admin/unavailability">
                    {t('APPOINTMENTS_MANAGE_UNAVAILABILITY')}
                  </a>
                </nav>
              )}
            </>
          )}
        </main>
      }
    />
  );
};
