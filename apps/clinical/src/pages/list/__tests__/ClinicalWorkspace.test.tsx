import * as services from '@bahmni/services';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { axe, toHaveNoViolations } from 'jest-axe';
import { MemoryRouter } from 'react-router-dom';
import ClinicalWorkspace from '../ClinicalWorkspace';

expect.extend(toHaveNoViolations);

jest.mock('@bahmni/services', () => ({
  ...jest.requireActual('@bahmni/services'),
  searchAppointmentsByAttribute: jest.fn(),
  searchPatientByNameOrId: jest.fn(),
  useTranslation: () => ({ t: (key: string) => key }),
}));

const searchAppointments = services.searchAppointmentsByAttribute as jest.Mock;
const searchPatients = services.searchPatientByNameOrId as jest.Mock;

describe('ClinicalWorkspace', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    searchAppointments.mockResolvedValue([]);
    searchPatients.mockResolvedValue({
      totalCount: 1,
      pageOfResults: [
        {
          uuid: 'patient-1',
          identifier: 'ABC123',
          givenName: 'Meera',
          middleName: '',
          familyName: 'Demo',
          age: '34',
        },
      ],
    });
  });

  it('uses live appointments and patient search without sample rows', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const { container } = render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <ClinicalWorkspace
            userPrivileges={[
              { uuid: 'priv-1', name: 'app:clinical' },
              { uuid: 'priv-2', name: 'View Appointments' },
            ]}
          />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(
      await screen.findByText('CLINICAL_WORKSPACE_NO_APPOINTMENTS'),
    ).toBeInTheDocument();
    expect(searchAppointments).toHaveBeenCalledWith(
      expect.objectContaining({
        startDate: expect.any(String),
        endDate: expect.any(String),
      }),
    );
    expect(
      screen.queryByRole('link', { name: 'CLINICAL_WORKSPACE_REGISTRATION' }),
    ).not.toBeInTheDocument();

    fireEvent.change(screen.getByRole('searchbox'), {
      target: { value: 'Meera' },
    });
    fireEvent.click(
      screen.getByRole('button', { name: 'CLINICAL_WORKSPACE_SEARCH' }),
    );
    expect(await screen.findByText('Meera Demo')).toBeInTheDocument();
    expect(searchPatients).toHaveBeenCalledWith('Meera');
    expect(
      screen.getByRole('link', { name: 'CLINICAL_WORKSPACE_OPEN_RECORD' }),
    ).toHaveAttribute('href', '/clinical/patient-1');
    expect(await axe(container)).toHaveNoViolations();
  });

  it.each([null, [], [{ uuid: 'fhir', name: 'Get Appointments' }]])(
    'does not query legacy appointments without its native read permission: %s',
    async (userPrivileges) => {
      const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false } },
      });
      render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter>
            <ClinicalWorkspace userPrivileges={userPrivileges} />
          </MemoryRouter>
        </QueryClientProvider>,
      );
      expect(
        screen.queryByRole('region', {
          name: 'CLINICAL_WORKSPACE_APPOINTMENTS',
        }),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByText('CLINICAL_WORKSPACE_TODAY'),
      ).not.toBeInTheDocument();
      fireEvent.change(screen.getByRole('searchbox'), {
        target: { value: 'Meera' },
      });
      fireEvent.click(
        screen.getByRole('button', { name: 'CLINICAL_WORKSPACE_SEARCH' }),
      );
      expect(await screen.findByText('Meera Demo')).toBeInTheDocument();
      expect(searchAppointments).not.toHaveBeenCalled();
    },
  );

  it('accepts Manage Appointments and hides cached rows immediately when that permission is removed', async () => {
    searchAppointments.mockResolvedValue([
      {
        uuid: 'appointment-1',
        startDateTime: Date.now(),
        patient: {
          uuid: 'patient-1',
          name: 'Cached Appointment Patient',
          identifier: 'QA1',
        },
        status: 'Scheduled',
      },
    ]);
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const view = (userPrivileges: services.UserPrivilege[]) => (
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <ClinicalWorkspace userPrivileges={userPrivileges} />
        </MemoryRouter>
      </QueryClientProvider>
    );
    const { rerender } = render(
      view([{ uuid: 'manage', name: 'Manage Appointments' }]),
    );
    expect(
      await screen.findByText('Cached Appointment Patient'),
    ).toBeInTheDocument();
    expect(searchAppointments).toHaveBeenCalledTimes(1);
    rerender(view([]));
    expect(
      screen.queryByText('Cached Appointment Patient'),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('region', { name: 'CLINICAL_WORKSPACE_APPOINTMENTS' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText('CLINICAL_WORKSPACE_TODAY'),
    ).not.toBeInTheDocument();
    expect(searchAppointments).toHaveBeenCalledTimes(1);
  });

  it('shows an actual appointment read failure instead of an empty schedule', async () => {
    searchAppointments.mockRejectedValue(new Error('Denied by backend'));
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <ClinicalWorkspace
            userPrivileges={[{ uuid: 'view', name: 'View Appointments' }]}
          />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'CLINICAL_WORKSPACE_APPOINTMENTS_ERROR',
    );
    expect(
      screen.queryByText('CLINICAL_WORKSPACE_NO_APPOINTMENTS'),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText('CLINICAL_WORKSPACE_UNAVAILABLE'),
    ).toBeInTheDocument();
  });

  it('keeps appointment navigation inside the React workspace', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <ClinicalWorkspace
            userPrivileges={[{ uuid: 'priv-1', name: 'app:appointments' }]}
          />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    const links = await screen.findAllByRole('link', {
      name: 'CLINICAL_WORKSPACE_APPOINTMENTS',
    });
    expect(links).toHaveLength(2);
    links.forEach((link) =>
      expect(link).toHaveAttribute('href', '/appointments/'),
    );
  });
});
