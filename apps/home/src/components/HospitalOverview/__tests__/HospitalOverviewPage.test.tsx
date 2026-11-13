import { useUserPrivilege } from '@bahmni/widgets';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import {
  HospitalOverviewPage,
  OVERVIEW_PRIVILEGES,
} from '../HospitalOverviewPage';
import {
  countEncountersForDay,
  getAppointmentsForDay,
  getVisitsForDay,
  getWardBeds,
} from '../overviewService';

jest.mock('../../HomePageHeader', () => ({
  HomePageHeader: () => <div data-testid="home-page-header" />,
}));

jest.mock('@bahmni/widgets', () => ({
  useUserPrivilege: jest.fn(),
}));

jest.mock('../overviewService', () => ({
  getVisitsForDay: jest.fn(),
  countEncountersForDay: jest.fn(),
  getAppointmentsForDay: jest.fn(),
  getWardBeds: jest.fn(),
}));

const mockPrivileges = useUserPrivilege as jest.Mock;
const mockVisits = getVisitsForDay as jest.Mock;
const mockEncounters = countEncountersForDay as jest.Mock;
const mockAppointments = getAppointmentsForDay as jest.Mock;
const mockBeds = getWardBeds as jest.Mock;

const ALL_PRIVILEGES = Object.values(OVERVIEW_PRIVILEGES);

const givePrivileges = (names: string[]) =>
  mockPrivileges.mockReturnValue({
    userPrivileges: names.map((name) => ({ uuid: name, name })),
    error: null,
  });

const visit = (uuid: string, type: string) => ({
  uuid,
  startDatetime: '2026-11-13T10:00:00.000+0530',
  visitType: { display: type },
});

const renderPage = () =>
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <MemoryRouter>
        <HospitalOverviewPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );

const section = (name: string) => screen.getByRole('region', { name });

beforeEach(() => {
  jest.resetAllMocks();
  givePrivileges(ALL_PRIVILEGES);
  mockVisits.mockResolvedValue([
    visit('v1', 'OPD'),
    visit('v2', 'OPD'),
    visit('v3', 'Follow Up'),
    visit('v4', 'IPD'),
  ]);
  mockEncounters.mockImplementation((type: string) =>
    Promise.resolve(type === 'ADMISSION' ? 2 : 1),
  );
  mockAppointments.mockResolvedValue([
    { uuid: 'a1', status: 'Scheduled' },
    { uuid: 'a2', status: 'Scheduled' },
    { uuid: 'a3', status: 'Completed' },
  ]);
  mockBeds.mockResolvedValue([
    {
      ward: { uuid: 'w1', name: 'General Ward' },
      totalBeds: 20,
      occupiedBeds: 5,
    },
  ]);
});

describe('HospitalOverviewPage', () => {
  it('shows the heading and says the page is read-only for the whole hospital', () => {
    renderPage();

    expect(
      screen.getByRole('heading', { level: 1, name: 'Hospital overview' }),
    ).toBeInTheDocument();
    expect(screen.getByText(/whole hospital/)).toBeInTheDocument();
    expect(
      screen.getByText(/nothing on this page changes data/),
    ).toBeInTheDocument();
  });

  it('shows outpatient visits as one figure with the breakdown by visit type', async () => {
    renderPage();
    const outpatient = section('Outpatient visits');

    expect(await within(outpatient).findByText('3')).toBeInTheDocument();
    expect(within(outpatient).getByText('OPD: 2')).toBeInTheDocument();
    expect(within(outpatient).getByText('Special OPD: 0')).toBeInTheDocument();
    expect(within(outpatient).getByText('Follow Up: 1')).toBeInTheDocument();
    expect(
      within(outpatient).getByText(/OPD, Special OPD or Follow Up/),
    ).toBeInTheDocument();
  });

  it('shows admissions and discharges for today', async () => {
    renderPage();

    expect(
      await within(section('Admissions')).findByText('2'),
    ).toBeInTheDocument();
    expect(
      await within(section('Discharges')).findByText('1'),
    ).toBeInTheDocument();
    expect(mockEncounters).toHaveBeenCalledWith('ADMISSION', expect.any(Date));
    expect(mockEncounters).toHaveBeenCalledWith('DISCHARGE', expect.any(Date));
  });

  it('says new registrations need a backend API instead of guessing a number', () => {
    renderPage();

    expect(
      within(section('New registrations')).getByText(/needs a backend API/),
    ).toBeInTheDocument();
  });

  it('shows appointments by status in a table, largest group first', async () => {
    renderPage();
    const appointments = section('Appointments by status');

    const rows = await within(appointments).findAllByRole('row');
    expect(rows.map((row) => row.textContent)).toEqual([
      'StatusAppointments',
      'Scheduled2',
      'Completed1',
    ]);
  });

  it('shows total, occupied and free beds per ward', async () => {
    renderPage();
    const beds = section('Beds per ward');

    const row = await within(beds).findByRole('row', { name: /General Ward/ });
    expect(
      within(row)
        .getAllByRole('cell')
        .map((cell) => cell.textContent),
    ).toEqual(['20', '5', '15']);
  });

  it('shows a loading message while figures are on their way', () => {
    mockVisits.mockReturnValue(new Promise(() => {}));
    renderPage();

    expect(
      within(section('Outpatient visits')).getByText('Loading'),
    ).toBeInTheDocument();
  });

  it('shows an error in one section without hiding the others', async () => {
    mockBeds.mockRejectedValue(new Error('Network down'));
    renderPage();

    expect(
      await within(section('Beds per ward')).findByRole('alert'),
    ).toHaveTextContent('could not be loaded');
    expect(
      await within(section('Outpatient visits')).findByText('3'),
    ).toBeInTheDocument();
  });

  it('shows empty messages when there are no appointments or wards', async () => {
    mockAppointments.mockResolvedValue([]);
    mockBeds.mockResolvedValue([]);
    renderPage();

    expect(
      await within(section('Appointments by status')).findByText(
        'No appointments today.',
      ),
    ).toBeInTheDocument();
    expect(
      await within(section('Beds per ward')).findByText('No wards are set up.'),
    ).toBeInTheDocument();
  });

  it('does not load a section the user has no privilege for', async () => {
    givePrivileges(
      ALL_PRIVILEGES.filter((name) => name !== OVERVIEW_PRIVILEGES.beds),
    );
    renderPage();

    expect(
      within(section('Beds per ward')).getByText(
        'You do not have permission to see this.',
      ),
    ).toBeInTheDocument();
    expect(mockBeds).not.toHaveBeenCalled();
    expect(
      await within(section('Outpatient visits')).findByText('3'),
    ).toBeInTheDocument();
  });

  it('loads nothing when the sign-in cannot be verified', () => {
    mockPrivileges.mockReturnValue({
      userPrivileges: null,
      error: new Error('Session expired'),
    });
    renderPage();

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Your sign-in could not be verified',
    );
    expect(mockVisits).not.toHaveBeenCalled();
  });
});
