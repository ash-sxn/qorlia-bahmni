import { BaseLayout, Header } from '@bahmni/design-system';
import {
  BAHMNI_HOME_PATH,
  fetchAllProviders,
  get,
  getAllAppointmentServices,
  getAppointmentsForDate,
  getLocationByTag,
  getWaitlistedAppointments,
  hasPrivilege,
  type Appointment,
  updateAppointmentStatus,
  useTranslation,
} from '@bahmni/services';
import { useUserPrivilege, UserGlobalAction } from '@bahmni/widgets';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useLocation } from 'react-router-dom';
import styles from './styles/index.module.scss';

const dateKey = (date: Date) =>
  [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');

const statuses = [
  'Requested',
  'WaitList',
  'Scheduled',
  'Arrived',
  'CheckedIn',
  'Completed',
  'Missed',
  'Cancelled',
];

type TransitionConfig = {
  config: {
    allowedActions: string[];
    allowedActionsByStatus: Record<string, string[]>;
  };
};

export const getAllowedTransitions = (
  config: TransitionConfig | undefined,
  status: string,
) =>
  config?.config.allowedActionsByStatus[status]?.filter((action) =>
    config.config.allowedActions.includes(action),
  ) ?? [];

export const filterAppointments = (
  appointments: Appointment[],
  filters: {
    serviceUuid: string;
    providerUuid: string;
    locationUuid: string;
    status: string;
    patient: string;
  },
) =>
  appointments.filter((appointment) => {
    const patient = filters.patient.trim().toLowerCase();
    return (
      (!filters.serviceUuid ||
        appointment.service?.uuid === filters.serviceUuid) &&
      (!filters.providerUuid ||
        appointment.provider?.uuid === filters.providerUuid ||
        appointment.providers?.some(
          (provider) => provider.uuid === filters.providerUuid,
        )) &&
      (!filters.locationUuid ||
        appointment.location?.uuid === filters.locationUuid) &&
      (!filters.status || appointment.status === filters.status) &&
      (!patient ||
        appointment.patient.name?.toLowerCase().includes(patient) ||
        appointment.patient.identifier?.toLowerCase().includes(patient))
    );
  });

export const AppointmentListPage = () => {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const awaiting = pathname.endsWith('/awaiting');
  const { userPrivileges, isLoading: privilegesLoading } = useUserPrivilege();
  const canView = hasPrivilege(userPrivileges, 'app:appointments');
  const canManage =
    hasPrivilege(userPrivileges, 'app:appointments:manageAppointmentsTab') &&
    hasPrivilege(userPrivileges, 'Manage Appointments');
  const queryClient = useQueryClient();
  const [actionMessage, setActionMessage] = useState('');
  const [date, setDate] = useState(() => dateKey(new Date()));
  const [serviceUuid, setServiceUuid] = useState('');
  const [providerUuid, setProviderUuid] = useState('');
  const [locationUuid, setLocationUuid] = useState('');
  const [status, setStatus] = useState('');
  const [patient, setPatient] = useState('');
  const transitionConfig = useQuery({
    queryKey: ['legacy-appointment-actions'],
    queryFn: () =>
      get<TransitionConfig>(
        '/bahmni_config/openmrs/apps/appointments/app.json',
      ),
    enabled: canView && canManage,
  });
  const statusChange = useMutation({
    mutationFn: ({ uuid, status }: { uuid: string; status: string }) =>
      updateAppointmentStatus(uuid, status),
    onSuccess: async () => {
      setActionMessage(t('APPOINTMENTS_STATUS_UPDATED'));
      await queryClient.invalidateQueries({ queryKey: ['appointment'] });
    },
    onError: () => setActionMessage(t('APPOINTMENTS_STATUS_UPDATE_ERROR')),
  });
  const services = useQuery({
    queryKey: ['allAppointmentServices'],
    queryFn: getAllAppointmentServices,
    enabled: canView,
  });
  const providers = useQuery({
    queryKey: ['appointment-providers'],
    queryFn: fetchAllProviders,
    enabled: canView,
  });
  const locations = useQuery({
    queryKey: ['appointment-locations'],
    queryFn: () => getLocationByTag('Appointment Location'),
    enabled: canView,
  });
  const dayAppointments = useQuery({
    queryKey: ['appointment-list-day', date],
    queryFn: () => getAppointmentsForDate(new Date(`${date}T00:00:00`)),
    enabled: canView && !awaiting,
  });
  const waitlistedAppointments = useQuery({
    queryKey: ['appointment-waitlist', serviceUuid, providerUuid, locationUuid],
    queryFn: () =>
      getWaitlistedAppointments({
        serviceUuids: serviceUuid ? [serviceUuid] : [],
        providerUuids: providerUuid ? [providerUuid] : [],
        locationUuids: locationUuid ? [locationUuid] : [],
      }),
    enabled: canView && awaiting,
  });
  const result = awaiting ? waitlistedAppointments : dayAppointments;
  const rows = filterAppointments(result.data ?? [], {
    serviceUuid,
    providerUuid,
    locationUuid,
    status: awaiting ? 'WaitList' : status,
    patient,
  }).sort((a, b) => a.startDateTime - b.startDateTime);

  const shiftDate = (days: number) => {
    const next = new Date(`${date}T00:00:00`);
    next.setDate(next.getDate() + days);
    setDate(dateKey(next));
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
              href: '/bahmni-v2/appointments/',
            },
            {
              id: 'list',
              label: awaiting
                ? t('APPOINTMENTS_AWAITING')
                : t('APPOINTMENTS_LIST'),
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
            <h1>
              {awaiting ? t('APPOINTMENTS_AWAITING') : t('APPOINTMENTS_LIST')}
            </h1>
            <p>
              {awaiting
                ? t('APPOINTMENTS_AWAITING_DESCRIPTION')
                : t('APPOINTMENTS_LIST_DESCRIPTION')}
            </p>
          </div>
          <nav className={styles.viewTabs} aria-label={t('APPOINTMENTS_VIEWS')}>
            <a href="/bahmni-v2/appointments/">{t('APPOINTMENTS_SUMMARY')}</a>
            <a
              href="/bahmni-v2/appointments/list"
              aria-current={!awaiting ? 'page' : undefined}
            >
              {t('APPOINTMENTS_LIST')}
            </a>
            <a
              href="/bahmni-v2/appointments/awaiting"
              aria-current={awaiting ? 'page' : undefined}
            >
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
              aria-labelledby="appointment-list-heading"
            >
              <div className={styles.panelHeading}>
                <div>
                  <span className={styles.eyebrow}>
                    {awaiting
                      ? t('APPOINTMENTS_WAITLIST')
                      : t('APPOINTMENTS_DATE')}
                  </span>
                  <h2 id="appointment-list-heading">
                    {awaiting
                      ? t('APPOINTMENTS_AWAITING')
                      : t('APPOINTMENTS_LIST')}
                  </h2>
                </div>
                {!awaiting && (
                  <div className={styles.weekControls}>
                    <button type="button" onClick={() => shiftDate(-1)}>
                      {t('APPOINTMENTS_PREVIOUS_DAY')}
                    </button>
                    <label>
                      <span>{t('APPOINTMENTS_CHOOSE_DATE')}</span>
                      <input
                        type="date"
                        value={date}
                        onChange={(event) => {
                          if (event.target.value) setDate(event.target.value);
                        }}
                      />
                    </label>
                    <button type="button" onClick={() => shiftDate(1)}>
                      {t('APPOINTMENTS_NEXT_DAY')}
                    </button>
                  </div>
                )}
              </div>
              <div className={styles.listFilters}>
                <label>
                  {t('APPOINTMENTS_SERVICE')}
                  <select
                    value={serviceUuid}
                    onChange={(event) => setServiceUuid(event.target.value)}
                  >
                    <option value="">{t('APPOINTMENTS_ALL_SERVICES')}</option>
                    {(services.data ?? []).map((service) => (
                      <option key={service.uuid} value={service.uuid}>
                        {service.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  {t('APPOINTMENTS_PROVIDER')}
                  <select
                    value={providerUuid}
                    onChange={(event) => setProviderUuid(event.target.value)}
                  >
                    <option value="">{t('APPOINTMENTS_ALL_PROVIDERS')}</option>
                    {(providers.data ?? []).map((provider) => (
                      <option key={provider.uuid} value={provider.uuid}>
                        {provider.display}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  {t('APPOINTMENTS_LOCATION')}
                  <select
                    value={locationUuid}
                    onChange={(event) => setLocationUuid(event.target.value)}
                  >
                    <option value="">{t('APPOINTMENTS_ALL_LOCATIONS')}</option>
                    {(locations.data ?? []).map((location) => (
                      <option key={location.uuid} value={location.uuid}>
                        {location.display}
                      </option>
                    ))}
                  </select>
                </label>
                {!awaiting && (
                  <label>
                    {t('APPOINTMENTS_STATUS')}
                    <select
                      value={status}
                      onChange={(event) => setStatus(event.target.value)}
                    >
                      <option value="">{t('APPOINTMENTS_ALL_STATUSES')}</option>
                      {statuses.map((value) => (
                        <option key={value} value={value}>
                          {value}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                <label>
                  {t('APPOINTMENTS_PATIENT')}
                  <input
                    type="search"
                    value={patient}
                    onChange={(event) => setPatient(event.target.value)}
                    placeholder={t('APPOINTMENTS_SEARCH_PATIENT')}
                  />
                </label>
              </div>
              {(services.isError || providers.isError || locations.isError) && (
                <p className={styles.message} role="alert">
                  {t('APPOINTMENTS_FILTERS_ERROR')}
                </p>
              )}
              {canManage && transitionConfig.isError && (
                <p className={styles.message} role="alert">
                  {t('APPOINTMENTS_ACTIONS_UNAVAILABLE')}
                </p>
              )}
              {actionMessage && (
                <p
                  className={styles.message}
                  role={statusChange.isError ? 'alert' : 'status'}
                >
                  {actionMessage}
                </p>
              )}
              {result.isLoading ? (
                <p className={styles.message} role="status">
                  {t('APPOINTMENTS_LOADING')}
                </p>
              ) : result.isError ? (
                <p className={styles.message} role="alert">
                  {t('APPOINTMENTS_LIST_ERROR')}
                </p>
              ) : rows.length === 0 ? (
                <p className={styles.message}>
                  {awaiting
                    ? t('APPOINTMENTS_AWAITING_EMPTY')
                    : t('APPOINTMENTS_NO_RESULTS')}
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
                        <th scope="col">{t('APPOINTMENTS_LOCATION')}</th>
                        <th scope="col">{t('APPOINTMENTS_STATUS')}</th>
                        {canManage && (
                          <th scope="col">{t('APPOINTMENTS_ACTIONS')}</th>
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((appointment) => (
                        <tr key={appointment.uuid}>
                          <td>
                            {new Intl.DateTimeFormat(undefined, {
                              dateStyle: awaiting ? 'medium' : undefined,
                              timeStyle: 'short',
                            }).format(new Date(appointment.startDateTime))}
                          </td>
                          <td>
                            <a
                              href={`/bahmni-v2/clinical/${appointment.patient.uuid}`}
                            >
                              {appointment.patient.name}
                            </a>
                            <small>{appointment.patient.identifier}</small>
                          </td>
                          <td>
                            {appointment.service?.name ??
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
                            {appointment.location?.name ??
                              t('APPOINTMENTS_NOT_SPECIFIED')}
                          </td>
                          <td>
                            <span className={styles.status}>
                              {appointment.status}
                            </span>
                          </td>
                          {canManage && (
                            <td>
                              <div className={styles.rowActions}>
                                {getAllowedTransitions(
                                  transitionConfig.data,
                                  appointment.status,
                                ).map((action) => (
                                  <button
                                    key={action}
                                    type="button"
                                    className={styles.textButton}
                                    disabled={statusChange.isPending}
                                    onClick={() => {
                                      if (
                                        !window.confirm(
                                          t('APPOINTMENTS_CONFIRM_STATUS', {
                                            status: action,
                                          }),
                                        )
                                      )
                                        return;
                                      setActionMessage('');
                                      statusChange.mutate({
                                        uuid: appointment.uuid,
                                        status: action,
                                      });
                                    }}
                                    aria-label={`${action}: ${appointment.patient.name}`}
                                  >
                                    {action}
                                  </button>
                                ))}
                              </div>
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          )}
        </main>
      }
    />
  );
};
