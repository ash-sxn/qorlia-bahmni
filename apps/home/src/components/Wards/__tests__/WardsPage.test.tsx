import { useHasPrivilege, useShellNavigation } from '@bahmni/widgets';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import {
  getCurrentMedicines,
  getLatestVitals,
  getOccupiedBeds,
  getWards,
} from '../wardService';
import { WardsPage } from '../WardsPage';

jest.mock('@bahmni/widgets', () => ({
  useHasPrivilege: jest.fn(),
  useShellNavigation: jest.fn(),
}));

jest.mock('../wardService', () => ({
  ...jest.requireActual('../wardService'),
  getWards: jest.fn(),
  getOccupiedBeds: jest.fn(),
  getLatestVitals: jest.fn(),
  getCurrentMedicines: jest.fn(),
}));

const hoursAgo = (hours: number) =>
  new Date(Date.now() - hours * 3_600_000).toISOString();

const renderPage = () =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter>
        <WardsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );

describe('WardsPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (useHasPrivilege as jest.Mock).mockReturnValue(true);
    (useShellNavigation as jest.Mock).mockReturnValue({
      items: [
        {
          id: 'bahmni.ipd',
          label: 'Admissions and discharge',
          href: '/bahmni-v2/clinical/inpatient',
          group: 'hospital',
        },
      ],
    });
    (getWards as jest.Mock).mockResolvedValue([
      {
        ward: { uuid: 'w1', name: 'Emergency' },
        totalBeds: 2,
        occupiedBeds: 0,
      },
      {
        ward: { uuid: 'w2', name: 'General Ward' },
        totalBeds: 8,
        occupiedBeds: 2,
      },
    ]);
    (getOccupiedBeds as jest.Mock).mockImplementation(async (uuid: string) =>
      uuid === 'w2'
        ? [
            {
              bedId: 1,
              bedNumber: 'GW1-01',
              room: 'Room 1',
              patientUuid: 'p1',
              name: 'Meera Sharma',
              identifier: 'ABC200000',
              age: 34,
              gender: 'F',
            },
            {
              bedId: 2,
              bedNumber: 'GW1-02',
              room: 'Room 1',
              patientUuid: 'p2',
              name: 'Vishal Singh',
              identifier: 'ABC200015',
              age: 41,
              gender: 'M',
            },
          ]
        : [],
    );
    (getLatestVitals as jest.Mock).mockImplementation(async (uuid: string) =>
      uuid === 'p1'
        ? {
            takenAt: hoursAgo(1),
            values: { systolic: 124, diastolic: 80, pulse: 76 },
          }
        : { takenAt: null, values: {} },
    );
    (getCurrentMedicines as jest.Mock).mockImplementation(
      async (uuid: string) =>
        uuid === 'p1'
          ? [
              {
                uuid: 'o1',
                name: 'Paracetamol 650 mg',
                dose: '1 Tablet',
                route: 'Oral',
                frequency: 'Twice a day',
              },
            ]
          : [],
    );
  });

  it('opens the first ward with patients and shows each bed', async () => {
    renderPage();

    expect(await screen.findByText('2 of 8 beds in use')).toBeInTheDocument();
    const table = await screen.findByRole('table');
    const rows = within(table).getAllByRole('row').slice(1);
    expect(rows).toHaveLength(2);
    expect(await within(rows[0]).findByText('Up to date')).toBeInTheDocument();
    expect(
      within(rows[0]).getByText('BP 124/80 · Pulse 76'),
    ).toBeInTheDocument();
    expect(
      await within(rows[0]).findByText('Paracetamol 650 mg'),
    ).toBeInTheDocument();
    expect(
      await within(rows[1]).findByText('Readings due'),
    ).toBeInTheDocument();
    expect(
      within(rows[1]).getByText('No readings recorded'),
    ).toBeInTheDocument();
    expect(
      await within(rows[1]).findByText('No active medicine orders'),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Meera Sharma' })).toHaveAttribute(
      'href',
      '/home/records/p1',
    );
    expect(
      within(rows[1]).getByRole('link', { name: 'Record readings' }),
    ).toHaveAttribute('href', '/bahmni-v2/clinical/p2');
    expect(
      screen.getByRole('link', { name: 'Admit or discharge' }),
    ).toHaveAttribute('href', '/bahmni-v2/clinical/inpatient');
    expect(
      screen.getByText('2 patients admitted across 2 wards'),
    ).toBeInTheDocument();
  });

  it('switches ward', async () => {
    renderPage();
    await screen.findByRole('table');
    await userEvent.click(screen.getByRole('button', { name: /Emergency/ }));
    expect(
      await screen.findByText('Nobody is admitted to this ward.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Emergency/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('tells staff without ward access to ask for it', () => {
    (useHasPrivilege as jest.Mock).mockReturnValue(false);
    renderPage();
    expect(
      screen.getByText(/Your account cannot see the wards/),
    ).toBeInTheDocument();
    expect(getWards).not.toHaveBeenCalled();
  });

  it('waits for permissions before deciding what to show', () => {
    (useHasPrivilege as jest.Mock).mockReturnValue(false);
    (useShellNavigation as jest.Mock).mockReturnValue({
      items: [],
      loading: true,
    });
    renderPage();
    expect(screen.getByText('Loading beds…')).toBeInTheDocument();
    expect(
      screen.queryByText(/Your account cannot see the wards/),
    ).not.toBeInTheDocument();
  });
});
