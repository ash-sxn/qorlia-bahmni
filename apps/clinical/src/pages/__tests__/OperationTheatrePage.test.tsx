import { get } from '@bahmni/services';
import { useUserPrivilege } from '@bahmni/widgets';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import OperationTheatrePage, {
  fetchSurgicalBlocks,
} from '../OperationTheatrePage';

jest.mock('@bahmni/services', () => ({
  ...jest.requireActual('@bahmni/services'),
  get: jest.fn(),
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
  fireEvent.change(screen.getByRole('searchbox'), {
    target: { value: 'Other patient' },
  });
  expect(
    screen.getByText('No surgical appointments match these filters.'),
  ).toBeInTheDocument();
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
