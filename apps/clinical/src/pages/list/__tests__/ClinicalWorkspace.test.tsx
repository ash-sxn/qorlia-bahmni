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
            userPrivileges={[{ uuid: 'priv-1', name: 'app:clinical' }]}
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
});
