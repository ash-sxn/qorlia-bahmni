import { get, post } from '@bahmni/services';
import { useUserPrivilege } from '@bahmni/widgets';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import OperationTheatrePage, {
  fetchSurgicalBlocks,
  saveSurgicalActualTime,
} from '../OperationTheatrePage';

jest.mock('@bahmni/services', () => ({
  ...jest.requireActual('@bahmni/services'),
  get: jest.fn(),
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
  jest.clearAllMocks();
  jest.mocked(useUserPrivilege).mockReturnValue({
    userPrivileges: [{ uuid: 'ot-privilege', name: 'app:ot' }],
    isLoading: false,
  });
});

it('queries the surgical block API for the selected week', async () => {
  jest.mocked(get).mockResolvedValueOnce({ results: [] });

  await fetchSurgicalBlocks('2026-09-24', 'week');

  expect(get).toHaveBeenCalledWith('/openmrs/ws/rest/v1/surgicalBlock', {
    params: {
      startDatetime: new Date('2026-09-21T00:00:00').toISOString(),
      endDatetime: new Date('2026-09-27T23:59:59.999').toISOString(),
      includeVoided: true,
      activeBlocks: true,
      v: 'full',
    },
  });
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
            patient: { uuid: 'patient-1', display: 'ABC123 - Asha Demo' },
            status: 'SCHEDULED',
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
    saveSurgicalActualTime(block, appointment, '2026-09-28T09:10', '', ''),
  ).rejects.toThrow('This booking changed');
  expect(post).not.toHaveBeenCalled();
});
