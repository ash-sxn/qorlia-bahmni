import {
  useActivePractitioner,
  useHasPrivilege,
  useShellNavigation,
} from '@bahmni/widgets';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { TodayPage } from '../TodayPage';
import { getTodayQueue } from '../todayService';

jest.mock('@bahmni/widgets', () => ({
  PATIENTS_ID: 'qorlia.patient-record',
  useActivePractitioner: jest.fn(),
  useHasPrivilege: jest.fn(),
  useShellNavigation: jest.fn(),
}));

jest.mock('../todayService', () => ({
  ...jest.requireActual('../todayService'),
  getTodayQueue: jest.fn(),
}));

const mockQueue = getTodayQueue as jest.Mock;

const entry = (name: string, overrides = {}) => ({
  visitUuid: `visit-${name}`,
  patientUuid: `patient-${name}`,
  name,
  identifier: 'ABC1',
  age: 40,
  gender: 'F',
  visitType: 'OPD',
  started: '2026-11-18T04:30:00.000Z',
  open: true,
  seen: false,
  ...overrides,
});

const renderPage = () =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter>
        <TodayPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );

describe('TodayPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (useHasPrivilege as jest.Mock).mockReturnValue(true);
    (useActivePractitioner as jest.Mock).mockReturnValue({
      practitioner: { person: { display: 'Neha Anand' } },
      user: { username: 'dr_neha' },
    });
    (useShellNavigation as jest.Mock).mockReturnValue({
      items: [
        {
          id: 'bahmni.registration.new',
          label: 'Registration',
          href: '/bahmni-v2/registration/search',
          group: 'work',
        },
        {
          id: 'qorlia.patient-record',
          label: 'Patients',
          href: '/bahmni-v2/home/records',
          group: 'work',
        },
      ],
    });
    mockQueue.mockResolvedValue([
      entry('Sunita Verma'),
      entry('Imran Qureshi'),
      entry('Anil Verma', { seen: true }),
    ]);
  });

  it('greets the doctor and says how many patients are waiting', async () => {
    renderPage();

    expect(
      await screen.findByRole('heading', { level: 1, name: /Neha$/ }),
    ).toBeInTheDocument();
    expect(
      await screen.findByText(/2 patients are waiting\./),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Register a patient' }),
    ).toHaveAttribute('href', '/bahmni-v2/registration/search');
  });

  it('lists the waiting patients with one button to start each consultation', async () => {
    renderPage();

    const table = await screen.findByRole('table');
    const rows = within(table).getAllByRole('row').slice(1);
    expect(rows).toHaveLength(2);
    expect(
      within(rows[0]).getByRole('link', { name: 'Sunita Verma' }),
    ).toHaveAttribute('href', '/home/records/patient-Sunita%20Verma');
    expect(
      within(rows[0]).getByRole('link', { name: 'Start' }),
    ).toHaveAttribute('href', '/home/dictation?patient=patient-Sunita%20Verma');
    expect(
      within(screen.getByRole('complementary')).getByRole('link', {
        name: 'Start consultation',
      }),
    ).toHaveAttribute('href', '/home/dictation?patient=patient-Sunita%20Verma');
  });

  it('shows patients already seen on their own tab', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(
      await screen.findByRole('tab', { name: 'Seen today (1)' }),
    );
    const rows = within(screen.getByRole('table')).getAllByRole('row').slice(1);
    expect(rows).toHaveLength(1);
    expect(within(rows[0]).getByText('Note written')).toBeInTheDocument();
    expect(
      within(rows[0]).getByRole('link', { name: 'Open chart' }),
    ).toBeInTheDocument();
  });

  it('says when the queue cannot be loaded', async () => {
    mockQueue.mockRejectedValue(new Error('500'));
    renderPage();

    expect(await screen.findByRole('alert')).toHaveTextContent(
      "Today's patients could not be loaded.",
    );
  });

  it('shows staff without clinical access the work in their menu', async () => {
    (useHasPrivilege as jest.Mock).mockReturnValue(false);
    renderPage();

    expect(
      screen.getByRole('heading', { level: 2, name: 'Your work' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Patients' })).toHaveAttribute(
      'href',
      '/bahmni-v2/home/records',
    );
    expect(mockQueue).not.toHaveBeenCalled();
  });
});
