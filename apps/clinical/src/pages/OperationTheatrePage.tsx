import { BaseLayout, Header } from '@bahmni/design-system';
import {
  BAHMNI_HOME_PATH,
  fetchAllProviders,
  get,
  getLocationByTag,
  hasPrivilege,
  post,
  type Provider,
} from '@bahmni/services';
import { useUserPrivilege } from '@bahmni/widgets';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { type FormEvent, useState } from 'react';
import styles from './BedManagement.module.scss';

interface SurgicalAppointment {
  id?: number;
  uuid: string;
  voided?: boolean;
  sortWeight?: number;
  status?: string;
  notes?: string;
  patient?: { uuid: string; display?: string; person?: { age?: number } };
  actualStartDatetime?: string;
  actualEndDatetime?: string;
  bedLocation?: string;
  bedNumber?: string;
  surgicalAppointmentAttributes?: {
    value?: string | number | null;
    surgicalAppointmentAttributeType: { name: string };
  }[];
}

interface SurgicalBlock {
  uuid: string;
  voided?: boolean;
  startDatetime: string;
  endDatetime?: string;
  location?: { uuid: string; name: string };
  provider?: { uuid: string; display?: string; person?: { display?: string } };
  surgicalAppointments?: SurgicalAppointment[];
}

interface OtCalendarConfig {
  config?: {
    startOfWeek?: string;
    primarySurgeonsForOT?: string[];
    calendarView?: {
      dayViewStart?: string;
      dayViewEnd?: string;
      dayViewSplit?: string;
    };
  };
}

const estimateMinutes = (appointment: SurgicalAppointment) => {
  const value = (name: string) => {
    const raw = appointment.surgicalAppointmentAttributes?.find(
      (attribute) => attribute.surgicalAppointmentAttributeType.name === name,
    )?.value;
    const parsed = Number(raw ?? 0);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
  };
  return (
    value('estTimeHours') * 60 + value('estTimeMinutes') + value('cleaningTime')
  );
};

export const appointmentsForBlock = (block: SurgicalBlock) => {
  let expectedStart = new Date(block.startDatetime).getTime();
  return [...(block.surgicalAppointments ?? [])]
    .filter((appointment) => !appointment.voided)
    .sort((a, b) => (a.sortWeight ?? 0) - (b.sortWeight ?? 0))
    .map((appointment) => {
      const durationMinutes = estimateMinutes(appointment);
      const scheduled = ['SCHEDULED', 'COMPLETED'].includes(
        appointment.status ?? '',
      );
      const start =
        scheduled && Number.isFinite(expectedStart)
          ? new Date(expectedStart).toISOString()
          : undefined;
      if (scheduled) expectedStart += durationMinutes * 60_000;
      return { block, appointment, expectedStart: start, durationMinutes };
    });
};

export const appointmentOverlapsRange = (
  entry: ReturnType<typeof appointmentsForBlock>[number],
  rangeStart: Date,
  rangeEnd: Date,
) => {
  const start = new Date(
    entry.expectedStart ?? entry.block.startDatetime,
  ).getTime();
  const end = start + entry.durationMinutes * 60_000;
  return entry.expectedStart && entry.durationMinutes > 0
    ? start < rangeEnd.getTime() && end > rangeStart.getTime()
    : start >= rangeStart.getTime() && start < rangeEnd.getTime();
};

const localDate = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

const localDateTime = (value?: string) => {
  if (!value) return '';
  const date = new Date(value);
  return `${localDate(date)}T${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
};

const minutesOfDay = (value: string) => {
  const [hours, minutes] = value.split(':').map(Number);
  return hours * 60 + minutes;
};

export const calendarPlacement = (
  block: SurgicalBlock,
  day: string,
  startMinutes: number,
  endMinutes: number,
) => {
  const start = new Date(block.startDatetime);
  const end = new Date(block.endDatetime ?? block.startDatetime);
  const midnight = new Date(`${day}T00:00:00`);
  const first = midnight.getTime() + startMinutes * 60_000;
  const last = midnight.getTime() + endMinutes * 60_000;
  const overlapStart = Math.max(first, start.getTime());
  const overlapEnd = Math.min(last, end.getTime());
  if (overlapEnd <= overlapStart || last <= first) return null;
  return {
    top: `${((overlapStart - first) / (last - first)) * 100}%`,
    height: `${((overlapEnd - overlapStart) / (last - first)) * 100}%`,
  };
};

const startOfWeek = (date: Date, dayName: string) => {
  const configuredDay = [
    'Sunday',
    'Monday',
    'Tuesday',
    'Wednesday',
    'Thursday',
    'Friday',
    'Saturday',
  ].indexOf(dayName);
  const firstDay = new Date(date);
  firstDay.setDate(
    firstDay.getDate() -
      ((firstDay.getDay() - (configuredDay < 0 ? 0 : configuredDay) + 7) % 7),
  );
  return firstDay;
};

export const fetchSurgicalBlocks = (
  date: string,
  period: 'day' | 'week',
  firstDay = 'Sunday',
) => {
  const start = new Date(`${date}T00:00:00`);
  if (period === 'week') start.setTime(startOfWeek(start, firstDay).getTime());
  const end = new Date(start);
  end.setDate(end.getDate() + (period === 'week' ? 6 : 0));
  end.setHours(23, 59, 59, 999);

  return get<{ results: SurgicalBlock[] }>(
    '/openmrs/ws/rest/v1/surgicalBlock',
    {
      params: {
        startDatetime: start.toISOString(),
        endDatetime: end.toISOString(),
        includeVoided: false,
        activeBlocks: true,
        v: 'full',
      },
    },
  );
};

export const saveSurgicalActualTime = async (
  block: SurgicalBlock,
  appointment: SurgicalAppointment,
  startValue: string,
  endValue: string,
  notes: string,
) => {
  const start = startValue ? new Date(startValue) : null;
  const end = endValue ? new Date(endValue) : null;
  if (
    !!start !== !!end ||
    ((startValue || endValue || notes.trim()) && (!start || !end)) ||
    (start && !Number.isFinite(start.getTime())) ||
    (end && !Number.isFinite(end.getTime())) ||
    (start && end && end <= start)
  ) {
    throw new Error('Enter a valid start time and a later end time.');
  }
  const latest = await get<SurgicalBlock>(
    `/openmrs/ws/rest/v1/surgicalBlock/${encodeURIComponent(block.uuid)}`,
    { params: { v: 'full' } },
  );
  const current = latest.surgicalAppointments?.find(
    ({ uuid }) => uuid === appointment.uuid,
  );
  const timestamp = (value?: string) =>
    value ? new Date(value).getTime() : null;
  if (
    latest.voided ||
    !current?.id ||
    !current.patient?.uuid ||
    current.voided ||
    !['SCHEDULED', 'COMPLETED'].includes(current.status ?? '') ||
    current.status !== appointment.status ||
    current.sortWeight !== appointment.sortWeight ||
    timestamp(current.actualStartDatetime) !==
      timestamp(appointment.actualStartDatetime) ||
    timestamp(current.actualEndDatetime) !==
      timestamp(appointment.actualEndDatetime) ||
    (current.notes ?? '') !== (appointment.notes ?? '')
  ) {
    throw new Error(
      'This booking changed. Refresh the schedule before editing.',
    );
  }
  return post<SurgicalAppointment>(
    `/openmrs/ws/rest/v1/surgicalAppointment/${encodeURIComponent(current.uuid)}`,
    {
      id: current.id,
      uuid: current.uuid,
      surgicalBlock: { uuid: block.uuid },
      patient: { uuid: current.patient.uuid },
      sortWeight: current.sortWeight,
      status: start ? 'COMPLETED' : 'SCHEDULED',
      actualStartDatetime: start?.toISOString() ?? null,
      actualEndDatetime: end?.toISOString() ?? null,
      notes,
    },
    { params: { v: 'full' } },
  );
};

const formatTime = (value?: string) =>
  value
    ? new Intl.DateTimeFormat(undefined, {
        dateStyle: 'medium',
        timeStyle: 'short',
      }).format(new Date(value))
    : 'Not recorded';

const OperationTheatrePage = () => {
  const { userPrivileges, isLoading: privilegesLoading } = useUserPrivilege();
  const canView = hasPrivilege(userPrivileges, 'app:ot');
  const canEdit = hasPrivilege(userPrivileges, 'app:ot:write');
  const queryClient = useQueryClient();
  const [date, setDate] = useState(() => localDate(new Date()));
  const [period, setPeriod] = useState<'day' | 'week'>('day');
  const [view, setView] = useState<'list' | 'calendar'>('list');
  const [groupBy, setGroupBy] = useState<'theatre' | 'surgeon'>('theatre');
  const [locationUuid, setLocationUuid] = useState('');
  const [providerUuid, setProviderUuid] = useState('');
  const [status, setStatus] = useState('');
  const [patientSearch, setPatientSearch] = useState('');
  const [editingUuid, setEditingUuid] = useState('');
  const [actualStart, setActualStart] = useState('');
  const [actualEnd, setActualEnd] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [saveSuccess, setSaveSuccess] = useState('');
  const calendarConfig = useQuery({
    queryKey: ['ot-calendar-config'],
    queryFn: () =>
      get<OtCalendarConfig>('/bahmni_config/openmrs/apps/ot/app.json'),
    enabled:
      !privilegesLoading &&
      canView &&
      (view === 'calendar' || period === 'week'),
  });
  const firstDay = calendarConfig.data?.config?.startOfWeek ?? 'Sunday';
  const blocks = useQuery({
    queryKey: ['ot-surgical-blocks', date, period, firstDay],
    queryFn: () => fetchSurgicalBlocks(date, period, firstDay),
    enabled:
      !privilegesLoading &&
      canView &&
      !!date &&
      (period === 'day' || !!calendarConfig.data),
  });
  const theatreCatalog = useQuery({
    queryKey: ['ot-calendar-theatres'],
    queryFn: () => getLocationByTag('Operation Theater'),
    enabled: !privilegesLoading && canView && view === 'calendar',
  });
  const surgeonCatalog = useQuery({
    queryKey: ['ot-calendar-surgeons'],
    queryFn: fetchAllProviders,
    enabled:
      !privilegesLoading &&
      canView &&
      view === 'calendar' &&
      period === 'day' &&
      groupBy === 'surgeon',
  });
  const activeBlocks = (blocks.data?.results ?? [])
    .filter((block) => !block.voided)
    .sort((a, b) => a.startDatetime.localeCompare(b.startDatetime));
  const locations = Array.from(
    new Map(
      activeBlocks
        .filter((block) => block.location)
        .map((block) => [block.location!.uuid, block.location!]),
    ).values(),
  );
  const providers = Array.from(
    new Map(
      activeBlocks
        .filter((block) => block.provider)
        .map((block) => [block.provider!.uuid, block.provider!]),
    ).values(),
  );
  const appointments = activeBlocks.flatMap(appointmentsForBlock);
  const statuses = Array.from(
    new Set(
      appointments.map(({ appointment }) => appointment.status).filter(Boolean),
    ),
  );
  const selectedDay = new Date(`${date || localDate(new Date())}T00:00:00`);
  const weekStart = startOfWeek(selectedDay, firstDay);
  const rangeStart = period === 'day' ? selectedDay : weekStart;
  const rangeEnd = new Date(rangeStart);
  rangeEnd.setDate(rangeEnd.getDate() + (period === 'day' ? 1 : 7));
  const visible = appointments.filter(
    (entry) =>
      appointmentOverlapsRange(entry, rangeStart, rangeEnd) &&
      (!locationUuid || entry.block.location?.uuid === locationUuid) &&
      (!providerUuid || entry.block.provider?.uuid === providerUuid) &&
      (!status || entry.appointment.status === status) &&
      (!patientSearch ||
        (entry.appointment.patient?.display ?? '')
          .toLowerCase()
          .includes(patientSearch.trim().toLowerCase())),
  );
  const editing = visible.find(
    ({ appointment }) => appointment.uuid === editingUuid,
  );
  const calendarStart = minutesOfDay(
    calendarConfig.data?.config?.calendarView?.dayViewStart ?? '08:00',
  );
  const calendarEnd = minutesOfDay(
    calendarConfig.data?.config?.calendarView?.dayViewEnd ?? '18:00',
  );
  const split = Math.max(
    15,
    Number(calendarConfig.data?.config?.calendarView?.dayViewSplit ?? 60) || 60,
  );
  const calendarDays = Array.from(
    { length: period === 'day' ? 1 : 7 },
    (_, index) => {
      const day = new Date(period === 'day' ? selectedDay : weekStart);
      day.setDate(day.getDate() + index);
      return localDate(day);
    },
  );
  const theatreColumns = (theatreCatalog.data ?? []).filter(
    (theatre) => !locationUuid || theatre.uuid === locationUuid,
  );
  const configuredSurgeons = calendarConfig.data?.config?.primarySurgeonsForOT;
  const surgeonColumns = (surgeonCatalog.data ?? []).filter(
    (surgeon: Provider) =>
      surgeon.person?.display &&
      (!configuredSurgeons?.length ||
        configuredSurgeons.includes(surgeon.person.display)) &&
      (!providerUuid || surgeon.uuid === providerUuid),
  );
  const calendarColumns =
    period === 'day'
      ? groupBy === 'theatre'
        ? theatreColumns.map((theatre) => ({
            key: theatre.uuid,
            label: theatre.display,
            day: localDate(selectedDay),
          }))
        : surgeonColumns.map((surgeon) => ({
            key: surgeon.uuid,
            label: surgeon.person.display,
            day: localDate(selectedDay),
          }))
      : calendarDays.map((day) => ({
          key: day,
          label: new Intl.DateTimeFormat(undefined, {
            weekday: 'short',
            day: 'numeric',
            month: 'short',
          }).format(new Date(`${day}T00:00:00`)),
          day,
        }));
  const calendarBlocks = activeBlocks.filter(
    (block) =>
      (!locationUuid || block.location?.uuid === locationUuid) &&
      (!providerUuid || block.provider?.uuid === providerUuid),
  );
  const changeDate = (direction: number) => {
    const next = new Date(`${date}T00:00:00`);
    next.setDate(next.getDate() + direction * (period === 'day' ? 1 : 7));
    setDate(localDate(next));
  };

  const submitActualTime = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canEdit || !editing || saving) return;
    setSaving(true);
    setSaveError('');
    setSaveSuccess('');
    try {
      await saveSurgicalActualTime(
        editing.block,
        editing.appointment,
        actualStart,
        actualEnd,
        notes,
      );
      setEditingUuid('');
      setSaveSuccess('Actual surgery time saved.');
      void queryClient.invalidateQueries({ queryKey: ['ot-surgical-blocks'] });
    } catch (error) {
      setSaveError(
        error instanceof Error ? error.message : 'Could not save actual time.',
      );
    } finally {
      setSaving(false);
    }
  };

  /* eslint-disable react/forbid-dom-props -- Timeline positions follow configured minutes and real block timestamps. */
  return (
    <BaseLayout
      header={
        <Header
          breadcrumbItems={[
            { id: 'home', label: 'Home', href: BAHMNI_HOME_PATH },
            { id: 'ot', label: 'Operation theatre', isCurrentPage: true },
          ]}
        />
      }
      main={
        <div className={styles.page}>
          <div className={styles.intro}>
            <span className={styles.eyebrow}>Surgical care</span>
            <h1>Operation theatre schedule</h1>
            <p>Review live Bahmni theatre bookings.</p>
          </div>
          <nav className={styles.pageNav} aria-label="Operation theatre views">
            {canEdit && (
              <a href="/bahmni-v2/clinical/operation-theatre/new">
                New surgical block
              </a>
            )}
            <a href="/bahmni/ot/#/otScheduling">Open full OT tools</a>
          </nav>
          {privilegesLoading ? (
            <p role="status">Loading operation theatre access...</p>
          ) : !canView ? (
            <p role="alert">You do not have access to operation theatre.</p>
          ) : (
            <section className={styles.card} aria-label="Surgical schedule">
              <div className={styles.filterForm}>
                <label>
                  Layout
                  <select
                    value={view}
                    onChange={(event) => {
                      setView(event.target.value as 'list' | 'calendar');
                      setStatus('');
                    }}
                  >
                    <option value="list">List</option>
                    <option value="calendar">Calendar</option>
                  </select>
                </label>
                <label>
                  Date
                  <input
                    type="date"
                    value={date}
                    onChange={(event) => setDate(event.target.value)}
                  />
                </label>
                {view === 'calendar' && period === 'day' && (
                  <label>
                    Group day by
                    <select
                      value={groupBy}
                      onChange={(event) =>
                        setGroupBy(event.target.value as 'theatre' | 'surgeon')
                      }
                    >
                      <option value="theatre">Theatre</option>
                      <option value="surgeon">Surgeon</option>
                    </select>
                  </label>
                )}
                <label>
                  View
                  <select
                    value={period}
                    onChange={(event) =>
                      setPeriod(event.target.value as 'day' | 'week')
                    }
                  >
                    <option value="day">Day</option>
                    <option value="week">Week</option>
                  </select>
                </label>
                <label>
                  Theatre
                  <select
                    value={locationUuid}
                    onChange={(event) => setLocationUuid(event.target.value)}
                  >
                    <option value="">All theatres</option>
                    {locations.map((location) => (
                      <option key={location.uuid} value={location.uuid}>
                        {location.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Surgeon
                  <select
                    value={providerUuid}
                    onChange={(event) => setProviderUuid(event.target.value)}
                  >
                    <option value="">All surgeons</option>
                    {providers.map((provider) => (
                      <option key={provider.uuid} value={provider.uuid}>
                        {provider.person?.display ??
                          provider.display ??
                          'Unknown provider'}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Status
                  <select
                    value={status}
                    onChange={(event) => setStatus(event.target.value)}
                  >
                    <option value="">All statuses</option>
                    {statuses
                      .filter(
                        (value) =>
                          view === 'list' ||
                          ['SCHEDULED', 'COMPLETED'].includes(value ?? ''),
                      )
                      .map((value) => (
                        <option key={value} value={value}>
                          {value}
                        </option>
                      ))}
                  </select>
                </label>
                <label>
                  Patient
                  <input
                    type="search"
                    value={patientSearch}
                    onChange={(event) => setPatientSearch(event.target.value)}
                    placeholder="Name or ID"
                  />
                </label>
              </div>
              <div className={styles.pageNav} aria-label="Schedule navigation">
                <button type="button" onClick={() => changeDate(-1)}>
                  Previous {period}
                </button>
                <button
                  type="button"
                  onClick={() => setDate(localDate(new Date()))}
                >
                  Today
                </button>
                <button type="button" onClick={() => changeDate(1)}>
                  Next {period}
                </button>
              </div>
              {period === 'week' && calendarConfig.isLoading ? (
                <p role="status">Loading theatre settings...</p>
              ) : period === 'week' && calendarConfig.isError ? (
                <p role="alert">Could not load the theatre settings.</p>
              ) : blocks.isLoading ? (
                <p role="status">Loading surgical schedule...</p>
              ) : blocks.isError ? (
                <p role="alert">Could not load the surgical schedule.</p>
              ) : view === 'calendar' &&
                (calendarConfig.isLoading ||
                  theatreCatalog.isLoading ||
                  (period === 'day' &&
                    groupBy === 'surgeon' &&
                    surgeonCatalog.isLoading)) ? (
                <p role="status">Loading theatre calendar...</p>
              ) : view === 'calendar' &&
                (calendarConfig.isError ||
                  theatreCatalog.isError ||
                  (period === 'day' &&
                    groupBy === 'surgeon' &&
                    surgeonCatalog.isError) ||
                  !Number.isFinite(calendarStart) ||
                  !Number.isFinite(calendarEnd) ||
                  calendarEnd <= calendarStart) ? (
                <p role="alert">Could not load the theatre calendar.</p>
              ) : view === 'calendar' ? (
                <div className={styles.otCalendarScroll}>
                  <div className={styles.otCalendar}>
                    {calendarColumns.map((column) => (
                      <section
                        key={column.key}
                        className={styles.otCalendarColumn}
                        aria-label={column.label}
                      >
                        <h2>{column.label}</h2>
                        <div className={styles.otCalendarTimeline}>
                          {Array.from(
                            {
                              length:
                                Math.ceil(
                                  (calendarEnd - calendarStart) / split,
                                ) + 1,
                            },
                            (_, index) => {
                              const minutes = calendarStart + index * split;
                              return (
                                <div
                                  key={minutes}
                                  className={styles.otCalendarTick}
                                  style={{
                                    top: `${((minutes - calendarStart) / (calendarEnd - calendarStart)) * 100}%`,
                                  }}
                                >
                                  <span>
                                    {String(Math.floor(minutes / 60)).padStart(
                                      2,
                                      '0',
                                    )}
                                    :{String(minutes % 60).padStart(2, '0')}
                                  </span>
                                </div>
                              );
                            },
                          )}
                          {calendarBlocks
                            .filter(
                              (block) =>
                                period === 'week' ||
                                (groupBy === 'theatre'
                                  ? block.location?.uuid === column.key
                                  : block.provider?.uuid === column.key),
                            )
                            .map((block) => {
                              const placement = calendarPlacement(
                                block,
                                column.day,
                                calendarStart,
                                calendarEnd,
                              );
                              if (!placement) return null;
                              const dayStart = new Date(
                                `${column.day}T00:00:00`,
                              );
                              const dayEnd = new Date(dayStart);
                              dayEnd.setDate(dayEnd.getDate() + 1);
                              const cases = appointmentsForBlock(block).filter(
                                (entry) =>
                                  appointmentOverlapsRange(
                                    entry,
                                    dayStart,
                                    dayEnd,
                                  ) &&
                                  ['SCHEDULED', 'COMPLETED'].includes(
                                    entry.appointment.status ?? '',
                                  ) &&
                                  (!status ||
                                    entry.appointment.status === status) &&
                                  (!patientSearch ||
                                    (entry.appointment.patient?.display ?? '')
                                      .toLowerCase()
                                      .includes(
                                        patientSearch.trim().toLowerCase(),
                                      )),
                              );
                              if ((status || patientSearch) && !cases.length)
                                return null;
                              return (
                                <article
                                  key={block.uuid}
                                  className={styles.otCalendarBlock}
                                  style={placement}
                                >
                                  {canEdit ? (
                                    <a
                                      href={`/bahmni-v2/clinical/operation-theatre/${encodeURIComponent(block.uuid)}`}
                                    >
                                      {formatTime(block.startDatetime)} ·{' '}
                                      {period === 'week' ||
                                      groupBy === 'surgeon'
                                        ? block.location?.name
                                        : block.provider?.person?.display}
                                    </a>
                                  ) : (
                                    <strong>
                                      {formatTime(block.startDatetime)} ·{' '}
                                      {period === 'week' ||
                                      groupBy === 'surgeon'
                                        ? block.location?.name
                                        : block.provider?.person?.display}
                                    </strong>
                                  )}
                                  {cases.length ? (
                                    cases.map(
                                      ({ appointment, expectedStart }) => (
                                        <p key={appointment.uuid}>
                                          {expectedStart
                                            ? new Intl.DateTimeFormat(
                                                undefined,
                                                {
                                                  hour: 'numeric',
                                                  minute: '2-digit',
                                                },
                                              ).format(new Date(expectedStart))
                                            : ''}{' '}
                                          {appointment.patient?.display ??
                                            'Unknown patient'}
                                        </p>
                                      ),
                                    )
                                  ) : (
                                    <p>Available block</p>
                                  )}
                                </article>
                              );
                            })}
                        </div>
                      </section>
                    ))}
                  </div>
                  {calendarColumns.length === 0 && (
                    <p>
                      No{' '}
                      {groupBy === 'surgeon' && period === 'day'
                        ? 'surgeons'
                        : 'operation theatres'}{' '}
                      are configured.
                    </p>
                  )}
                </div>
              ) : visible.length === 0 ? (
                <p>No surgical appointments match these filters.</p>
              ) : (
                <div className={styles.tableScroll}>
                  <table>
                    <thead>
                      <tr>
                        <th scope="col">Expected start</th>
                        <th scope="col">Patient</th>
                        <th scope="col">Patient age</th>
                        <th scope="col">Theatre</th>
                        <th scope="col">Surgeon</th>
                        <th scope="col">Status</th>
                        <th scope="col">Estimated time</th>
                        <th scope="col">Actual time</th>
                        <th scope="col">Status change notes</th>
                        <th scope="col">Bed location</th>
                        <th scope="col">Bed ID</th>
                        {canEdit && <th scope="col">Action</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {visible.map(
                        ({
                          block,
                          appointment,
                          expectedStart,
                          durationMinutes,
                        }) => (
                          <tr key={appointment.uuid}>
                            <td>
                              {expectedStart
                                ? formatTime(expectedStart)
                                : 'Not scheduled'}
                            </td>
                            <td>
                              {appointment.patient?.display ??
                                'Unknown patient'}
                            </td>
                            <td>{appointment.patient?.person?.age ?? ''}</td>
                            <td>{block.location?.name ?? 'Unassigned'}</td>
                            <td>
                              {block.provider?.person?.display ??
                                block.provider?.display ??
                                'Unassigned'}
                            </td>
                            <td>{appointment.status ?? 'Unspecified'}</td>
                            <td>{durationMinutes} min</td>
                            <td>
                              {appointment.actualStartDatetime
                                ? formatTime(appointment.actualStartDatetime)
                                : 'Not started'}
                            </td>
                            <td>{appointment.notes ?? ''}</td>
                            <td>{appointment.bedLocation ?? ''}</td>
                            <td>{appointment.bedNumber ?? ''}</td>
                            {canEdit && (
                              <td>
                                <a
                                  href={`/bahmni-v2/clinical/operation-theatre/${encodeURIComponent(block.uuid)}`}
                                >
                                  Edit block
                                </a>{' '}
                                {['SCHEDULED', 'COMPLETED'].includes(
                                  appointment.status ?? '',
                                ) && (
                                  <button
                                    className={styles.inlineButton}
                                    type="button"
                                    onClick={() => {
                                      setEditingUuid(appointment.uuid);
                                      setActualStart(
                                        localDateTime(
                                          appointment.actualStartDatetime ??
                                            expectedStart,
                                        ),
                                      );
                                      setActualEnd(
                                        localDateTime(
                                          appointment.actualEndDatetime ??
                                            (expectedStart
                                              ? new Date(
                                                  new Date(
                                                    expectedStart,
                                                  ).getTime() +
                                                    durationMinutes * 60_000,
                                                ).toISOString()
                                              : undefined),
                                        ),
                                      );
                                      setNotes(appointment.notes ?? '');
                                      setSaveError('');
                                      setSaveSuccess('');
                                    }}
                                  >
                                    Record actual time
                                  </button>
                                )}
                              </td>
                            )}
                          </tr>
                        ),
                      )}
                    </tbody>
                  </table>
                </div>
              )}
              {editing && canEdit && (
                <form
                  onSubmit={submitActualTime}
                  aria-label="Record actual surgery time"
                >
                  <h2>{editing.appointment.patient?.display ?? 'Surgery'}</h2>
                  <div className={styles.filterForm}>
                    <label>
                      Actual start
                      <input
                        type="datetime-local"
                        required={!!(actualStart || actualEnd || notes.trim())}
                        value={actualStart}
                        onChange={(event) => setActualStart(event.target.value)}
                      />
                    </label>
                    <label>
                      Actual end
                      <input
                        type="datetime-local"
                        required={!!(actualStart || actualEnd || notes.trim())}
                        value={actualEnd}
                        min={actualStart}
                        onChange={(event) => setActualEnd(event.target.value)}
                      />
                    </label>
                    <label>
                      Notes
                      <textarea
                        value={notes}
                        onChange={(event) => setNotes(event.target.value)}
                      />
                    </label>
                  </div>
                  <div className={styles.searchForm}>
                    <button type="submit" disabled={saving}>
                      {saving ? 'Saving...' : 'Save actual time'}
                    </button>
                    {(!!editing.appointment.actualStartDatetime ||
                      !!editing.appointment.actualEndDatetime) && (
                      <button
                        type="button"
                        onClick={() => {
                          setActualStart('');
                          setActualEnd('');
                          setNotes('');
                        }}
                      >
                        Clear recorded time
                      </button>
                    )}
                    <button type="button" onClick={() => setEditingUuid('')}>
                      Cancel
                    </button>
                  </div>
                </form>
              )}
              {saveError && <p role="alert">{saveError}</p>}
              {saveSuccess && <p role="status">{saveSuccess}</p>}
              <p>For advanced OT tools, open the full OT screen.</p>
            </section>
          )}
        </div>
      }
    />
  );
};
/* eslint-enable react/forbid-dom-props */

export default OperationTheatrePage;
