import {
  fetchAllProviders,
  get,
  getLocationByTag,
  post,
} from '@bahmni/services';
import { useUserPrivilege } from '@bahmni/widgets';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import OperationTheatrePage, {
  appointmentOverlapsRange,
  appointmentsForBlock,
  calendarPlacement,
  fetchSurgicalBlocks,
  saveSurgicalActualTime,
} from '../OperationTheatrePage';

jest.mock('@bahmni/services', () => ({
  ...jest.requireActual('@bahmni/services'),
  get: jest.fn(),
  getLocationByTag: jest.fn(),
  fetchAllProviders: jest.fn(),
  post: jest.fn(),
}));
jest.mock('@bahmni/widgets', () => ({
  ...jest.requireActual('@bahmni/widgets'),
  useUserPrivilege: jest.fn(),
}));

const renderPage = () =>
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <MemoryRouter>
        <OperationTheatrePage />
      </MemoryRouter>
    </QueryClientProvider>,
  );

beforeEach(() => {
  jest.resetAllMocks();
  jest.mocked(useUserPrivilege).mockReturnValue({
    userPrivileges: [{ uuid: 'ot-privilege', name: 'app:ot' }],
    isLoading: false,
  });
});

it('places a block at its configured time in the calendar', () => {
  expect(
    calendarPlacement(
      {
        uuid: 'block-1',
        startDatetime: '2026-09-28T09:00:00',
        endDatetime: '2026-09-28T12:00:00',
      },
      '2026-09-28',
      8 * 60,
      18 * 60,
    ),
  ).toEqual({ top: '10%', height: '30%' });
});

it('loads the theatre catalog and shows real surgical blocks in calendar layout', async () => {
  jest.mocked(get).mockResolvedValueOnce({
    results: [
      {
        uuid: 'block-1',
        startDatetime: '2026-09-28T09:00:00',
        endDatetime: '2026-09-28T12:00:00',
        location: { uuid: 'theatre-1', name: 'Theatre 1' },
        provider: { uuid: 'surgeon-1', person: { display: 'Dr Demo' } },
        surgicalAppointments: [
          {
            uuid: 'case-1',
            status: 'SCHEDULED',
            patient: { uuid: 'patient-1', display: 'Asha Demo' },
          },
        ],
      },
    ],
  });
  jest.mocked(get).mockResolvedValueOnce({
    config: {
      primarySurgeonsForOT: ['Dr Demo'],
      calendarView: {
        dayViewStart: '08:00',
        dayViewEnd: '18:00',
        dayViewSplit: '60',
      },
    },
  });
  jest
    .mocked(getLocationByTag)
    .mockResolvedValueOnce([{ uuid: 'theatre-1', display: 'Theatre 1' }]);
  renderPage();
  fireEvent.change(screen.getByLabelText('Date'), {
    target: { value: '2026-09-28' },
  });
  fireEvent.change(screen.getByLabelText('Layout'), {
    target: { value: 'calendar' },
  });
  expect(
    await screen.findByRole('heading', { name: 'Theatre 1' }),
  ).toBeInTheDocument();
  expect(screen.getByText(/Asha Demo/)).toBeInTheDocument();
  expect(getLocationByTag).toHaveBeenCalledWith('Operation Theater');
  jest.mocked(fetchAllProviders).mockResolvedValueOnce([
    {
      uuid: 'surgeon-1',
      display: 'Dr Demo',
      person: { display: 'Dr Demo' },
    },
    {
      uuid: 'surgeon-2',
      display: 'Dr Other',
      person: { display: 'Dr Other' },
    },
  ] as Awaited<ReturnType<typeof fetchAllProviders>>);
  fireEvent.change(screen.getByLabelText('Group day by'), {
    target: { value: 'surgeon' },
  });
  expect(
    await screen.findByRole('heading', { name: 'Dr Demo' }),
  ).toBeInTheDocument();
  expect(
    screen.queryByRole('heading', { name: 'Dr Other' }),
  ).not.toBeInTheDocument();
  expect(screen.getByText(/Asha Demo/)).toBeInTheDocument();
  expect(fetchAllProviders).toHaveBeenCalledTimes(1);
});

it('advances expected surgery times by estimated work and cleaning, skipping cancelled cases', () => {
  const attribute = (name: string, value: string) => ({
    surgicalAppointmentAttributeType: { name },
    value,
  });
  const block = {
    uuid: 'block-1',
    startDatetime: '2026-09-28T09:00:00.000Z',
    surgicalAppointments: [
      {
        uuid: 'second',
        status: 'SCHEDULED',
        sortWeight: 2,
        surgicalAppointmentAttributes: [],
      },
      {
        uuid: 'first',
        status: 'SCHEDULED',
        sortWeight: 0,
        surgicalAppointmentAttributes: [
          attribute('estTimeHours', '1'),
          attribute('cleaningTime', '15'),
        ],
      },
      {
        uuid: 'cancelled',
        status: 'CANCELLED',
        sortWeight: 1,
        surgicalAppointmentAttributes: [attribute('estTimeHours', '4')],
      },
    ],
  };
  const schedule = appointmentsForBlock(block);
  expect(schedule.map(({ appointment }) => appointment.uuid)).toEqual([
    'first',
    'cancelled',
    'second',
  ]);
  expect(schedule[0].expectedStart).toBe('2026-09-28T09:00:00.000Z');
  expect(schedule[1].expectedStart).toBeUndefined();
  expect(schedule[2].expectedStart).toBe('2026-09-28T10:15:00.000Z');
});

it('shows a cross-midnight case only on days its scheduled time overlaps', () => {
  const block = {
    uuid: 'overnight-block',
    startDatetime: '2026-09-28T23:00:00',
    surgicalAppointments: [
      {
        uuid: 'late-case',
        status: 'SCHEDULED',
        sortWeight: 0,
        surgicalAppointmentAttributes: [
          {
            value: '2',
            surgicalAppointmentAttributeType: { name: 'estTimeHours' },
          },
        ],
      },
      {
        uuid: 'next-day-case',
        status: 'SCHEDULED',
        sortWeight: 1,
        surgicalAppointmentAttributes: [],
      },
    ],
  };
  const [late, nextDay] = appointmentsForBlock(block);
  const monday = new Date('2026-09-28T00:00:00');
  const tuesday = new Date('2026-09-29T00:00:00');
  const wednesday = new Date('2026-09-30T00:00:00');
  expect(appointmentOverlapsRange(late, monday, tuesday)).toBe(true);
  expect(appointmentOverlapsRange(late, tuesday, wednesday)).toBe(true);
  expect(appointmentOverlapsRange(nextDay, monday, tuesday)).toBe(false);
  expect(appointmentOverlapsRange(nextDay, tuesday, wednesday)).toBe(true);
});

it('queries the surgical block API for the selected week', async () => {
  jest.mocked(get).mockResolvedValueOnce({ results: [] });

  await fetchSurgicalBlocks('2026-09-24', 'week', 'Monday');

  expect(get).toHaveBeenCalledWith('/openmrs/ws/rest/v1/surgicalBlock', {
    params: {
      startDatetime: new Date('2026-09-21T00:00:00').toISOString(),
      endDatetime: new Date('2026-09-27T23:59:59.999').toISOString(),
      includeVoided: false,
      activeBlocks: true,
      v: 'full',
    },
  });
});

it('uses a configured Tuesday week boundary', async () => {
  jest.mocked(get).mockResolvedValueOnce({ results: [] });

  await fetchSurgicalBlocks('2026-09-24', 'week', 'Tuesday');

  expect(get).toHaveBeenCalledWith(
    '/openmrs/ws/rest/v1/surgicalBlock',
    expect.objectContaining({
      params: expect.objectContaining({
        startDatetime: new Date('2026-09-22T00:00:00').toISOString(),
        endDatetime: new Date('2026-09-28T23:59:59.999').toISOString(),
      }),
    }),
  );
});

it('shows live bookings and filters by patient without changing them', async () => {
  jest.mocked(get).mockResolvedValueOnce({
    results: [
      {
        uuid: 'block-1',
        startDatetime: '2026-09-28T09:00:00.000+0530',
        endDatetime: '2026-09-28T12:00:00.000+0530',
        location: { uuid: 'theatre-1', name: 'Theatre 1' },
        provider: { uuid: 'surgeon-1', person: { display: 'Dr Demo' } },
        surgicalAppointments: [
          {
            uuid: 'appointment-1',
            patient: {
              uuid: 'patient-1',
              display: 'ABC123 - Asha Demo',
              person: { age: 42 },
            },
            status: 'SCHEDULED',
            notes: 'Moved from Tuesday',
            bedLocation: 'General Ward',
            bedNumber: 'GW-2',
          },
          {
            uuid: 'appointment-2',
            voided: true,
            patient: { uuid: 'patient-2', display: 'Hidden Patient' },
          },
        ],
      },
    ],
  });

  renderPage();

  expect(await screen.findByText('ABC123 - Asha Demo')).toBeInTheDocument();
  expect(screen.getByText('42')).toBeInTheDocument();
  expect(screen.getByText('Moved from Tuesday')).toBeInTheDocument();
  expect(screen.getByText('General Ward')).toBeInTheDocument();
  expect(screen.getByText('GW-2')).toBeInTheDocument();
  expect(screen.getAllByText('Theatre 1')).toHaveLength(2);
  expect(screen.queryByText('Hidden Patient')).not.toBeInTheDocument();
  expect(
    screen.queryByRole('button', { name: 'Record actual time' }),
  ).not.toBeInTheDocument();
  fireEvent.change(screen.getByRole('searchbox'), {
    target: { value: 'Other patient' },
  });
  expect(
    screen.getByText('No surgical appointments match these filters.'),
  ).toBeInTheDocument();
});

it('shows the actual-time form only to OT writers', async () => {
  jest.mocked(useUserPrivilege).mockReturnValue({
    userPrivileges: [
      { uuid: 'ot-privilege', name: 'app:ot' },
      { uuid: 'ot-write-privilege', name: 'app:ot:write' },
    ],
    isLoading: false,
  });
  jest.mocked(get).mockResolvedValueOnce({
    results: [
      {
        uuid: 'block-1',
        startDatetime: '2026-09-28T09:00:00.000+0530',
        surgicalAppointments: [
          {
            id: 9,
            uuid: 'appointment-1',
            patient: { uuid: 'patient-1', display: 'ABC123 - Asha Demo' },
            status: 'SCHEDULED',
          },
        ],
      },
    ],
  });

  renderPage();
  fireEvent.click(
    await screen.findByRole('button', { name: 'Record actual time' }),
  );

  expect(
    screen.getByRole('form', { name: 'Record actual surgery time' }),
  ).toBeInTheDocument();
  expect(screen.getByLabelText('Actual start')).toBeRequired();
  expect(screen.getByLabelText('Actual end')).toBeRequired();
  expect(screen.getByLabelText('Actual start')).toHaveValue();
});

it('can clear a completed surgery time before saving it', async () => {
  jest.mocked(useUserPrivilege).mockReturnValue({
    userPrivileges: [
      { uuid: 'ot-privilege', name: 'app:ot' },
      { uuid: 'ot-write-privilege', name: 'app:ot:write' },
    ],
    isLoading: false,
  });
  jest.mocked(get).mockResolvedValueOnce({
    results: [
      {
        uuid: 'block-1',
        startDatetime: '2026-09-28T09:00:00.000+0530',
        surgicalAppointments: [
          {
            id: 9,
            uuid: 'appointment-1',
            patient: { uuid: 'patient-1', display: 'ABC123 - Asha Demo' },
            status: 'COMPLETED',
            actualStartDatetime: '2026-09-28T09:10:00.000+0530',
            actualEndDatetime: '2026-09-28T10:10:00.000+0530',
            notes: 'Completed',
          },
        ],
      },
    ],
  });

  renderPage();
  fireEvent.click(
    await screen.findByRole('button', { name: 'Record actual time' }),
  );
  fireEvent.click(screen.getByRole('button', { name: 'Clear recorded time' }));

  expect(screen.getByLabelText('Actual start')).toHaveValue('');
  expect(screen.getByLabelText('Actual end')).toHaveValue('');
  expect(screen.getByLabelText('Notes')).toHaveValue('');
  expect(screen.getByLabelText('Actual start')).not.toBeRequired();
});

it('does not request bookings without the OT privilege', () => {
  jest.mocked(useUserPrivilege).mockReturnValue({
    userPrivileges: [],
    isLoading: false,
  });

  renderPage();

  expect(screen.getByRole('alert')).toHaveTextContent(
    'You do not have access to operation theatre.',
  );
  expect(get).not.toHaveBeenCalled();
});

it('rechecks a booking and uses the Bahmni actual-time update API', async () => {
  const appointment = {
    id: 9,
    uuid: 'appointment-1',
    patient: { uuid: 'patient-1', display: 'ABC123 - Asha Demo' },
    status: 'SCHEDULED',
    sortWeight: 0,
    notes: '',
  };
  const block = {
    uuid: 'block-1',
    startDatetime: '2026-09-28T09:00:00.000+0530',
    surgicalAppointments: [appointment],
  };
  jest.mocked(get).mockResolvedValueOnce(block);
  jest
    .mocked(post)
    .mockResolvedValueOnce({ ...appointment, status: 'COMPLETED' });

  await saveSurgicalActualTime(
    block,
    appointment,
    '2026-09-28T09:10',
    '2026-09-28T10:10',
    'Completed as planned',
  );

  expect(get).toHaveBeenCalledWith(
    '/openmrs/ws/rest/v1/surgicalBlock/block-1',
    { params: { v: 'full' } },
  );
  expect(post).toHaveBeenCalledWith(
    '/openmrs/ws/rest/v1/surgicalAppointment/appointment-1',
    {
      id: 9,
      uuid: 'appointment-1',
      surgicalBlock: { uuid: 'block-1' },
      patient: { uuid: 'patient-1' },
      sortWeight: 0,
      status: 'COMPLETED',
      actualStartDatetime: new Date('2026-09-28T09:10').toISOString(),
      actualEndDatetime: new Date('2026-09-28T10:10').toISOString(),
      notes: 'Completed as planned',
    },
    { params: { v: 'full' } },
  );
});

it('rejects stale and invalid actual-time updates before posting', async () => {
  const appointment = {
    id: 9,
    uuid: 'appointment-1',
    patient: { uuid: 'patient-1' },
    status: 'SCHEDULED',
    sortWeight: 0,
  };
  const block = {
    uuid: 'block-1',
    startDatetime: '2026-09-28T09:00:00.000+0530',
    surgicalAppointments: [appointment],
  };

  await expect(
    saveSurgicalActualTime(
      block,
      appointment,
      '2026-09-28T10:10',
      '2026-09-28T09:10',
      '',
    ),
  ).rejects.toThrow('Enter a valid start time');
  expect(get).not.toHaveBeenCalled();

  jest.mocked(get).mockResolvedValueOnce({
    ...block,
    surgicalAppointments: [{ ...appointment, status: 'CANCELLED' }],
  });
  await expect(
    saveSurgicalActualTime(
      block,
      appointment,
      '2026-09-28T09:10',
      '2026-09-28T10:10',
      '',
    ),
  ).rejects.toThrow('This booking changed');
  expect(post).not.toHaveBeenCalled();
});

it('clears actual time and restores the scheduled status', async () => {
  const appointment = {
    id: 9,
    uuid: 'appointment-1',
    patient: { uuid: 'patient-1' },
    status: 'COMPLETED',
    sortWeight: 0,
    actualStartDatetime: '2026-09-28T09:10:00.000Z',
    actualEndDatetime: '2026-09-28T10:10:00.000Z',
    notes: 'Completed',
  };
  const block = {
    uuid: 'block-1',
    startDatetime: '2026-09-28T09:00:00.000Z',
    surgicalAppointments: [appointment],
  };
  jest.mocked(get).mockResolvedValueOnce(block);
  jest.mocked(post).mockResolvedValueOnce(appointment);

  await saveSurgicalActualTime(block, appointment, '', '', '');

  expect(post).toHaveBeenCalledWith(
    '/openmrs/ws/rest/v1/surgicalAppointment/appointment-1',
    expect.objectContaining({
      status: 'SCHEDULED',
      actualStartDatetime: null,
      actualEndDatetime: null,
      notes: '',
    }),
    { params: { v: 'full' } },
  );
});
