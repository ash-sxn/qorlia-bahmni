import * as services from '@bahmni/services';
import { useUserPrivilege } from '@bahmni/widgets';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import ProgramsPage from '../ProgramsPage';

jest.mock('@bahmni/services', () => ({
  ...jest.requireActual('@bahmni/services'),
  getFormattedPatientById: jest.fn(),
  getPatientPrograms: jest.fn(),
  searchPatientByNameOrId: jest.fn(),
  useTranslation: () => ({ t: (key: string) => key }),
}));
jest.mock('@bahmni/widgets', () => ({
  ...jest.requireActual('@bahmni/widgets'),
  useUserPrivilege: jest.fn(),
  UserGlobalAction: () => null,
}));

const searchPatients = services.searchPatientByNameOrId as jest.Mock;
const getPatient = services.getFormattedPatientById as jest.Mock;
const getPrograms = services.getPatientPrograms as jest.Mock;

describe('ProgramsPage', () => {
  const renderPage = (
    path: string,
    client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    }),
  ) => {
    return render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route path="/clinical/programs" element={<ProgramsPage />} />
            <Route
              path="/clinical/programs/:patientUuid"
              element={<ProgramsPage />}
            />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (useUserPrivilege as jest.Mock).mockReturnValue({
      userPrivileges: [{ uuid: 'priv-1', name: 'app:clinical' }],
      isLoading: false,
    });
  });

  it('searches real patients and opens their program route', async () => {
    searchPatients.mockResolvedValue({
      totalCount: 1,
      pageOfResults: [
        {
          uuid: 'patient-1',
          identifier: 'ABC123',
          givenName: 'Meera',
          middleName: '',
          familyName: 'Demo',
        },
      ],
    });
    renderPage('/clinical/programs');

    fireEvent.change(screen.getByRole('searchbox'), {
      target: { value: 'Meera' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'PROGRAMS_SEARCH' }));

    expect(await screen.findByText('Meera Demo')).toBeInTheDocument();
    expect(searchPatients).toHaveBeenCalledWith('Meera');
    expect(screen.getByRole('link', { name: 'PROGRAMS_OPEN' })).toHaveAttribute(
      'href',
      '/clinical/programs/patient-1',
    );
  });

  it('shows API-backed active and past enrollments without saving', async () => {
    getPatient.mockResolvedValue({
      fullName: 'Meera Demo',
      identifier: 'ABC123',
    });
    getPrograms.mockResolvedValue({
      results: [
        {
          uuid: 'active-1',
          program: { name: 'Maternal health' },
          dateEnrolled: '2026-09-01',
          dateCompleted: null,
          states: [],
          voided: false,
        },
        {
          uuid: 'past-1',
          program: { name: 'Diabetes care' },
          dateEnrolled: '2025-01-01',
          dateCompleted: '2026-01-01',
          states: [],
          voided: false,
        },
      ],
    });
    renderPage('/clinical/programs/patient-1');

    expect(await screen.findByText('Maternal health')).toBeInTheDocument();
    expect(screen.getByText('Diabetes care')).toBeInTheDocument();
    expect(getPrograms).toHaveBeenCalledWith('patient-1');
    expect(
      screen.getByRole('link', { name: 'PROGRAMS_LEGACY_MANAGER' }),
    ).toHaveAttribute(
      'href',
      '/bahmni/clinical/#/programs/patient/patient-1/consultationContext',
    );
  });

  it('does not request patient data without clinical access', () => {
    (useUserPrivilege as jest.Mock).mockReturnValue({
      userPrivileges: [],
      isLoading: false,
    });
    const client = new QueryClient();
    client.setQueryData(['program-patient', 'patient-1'], {
      fullName: 'Private Patient',
      identifier: 'ABC123',
    });
    renderPage('/clinical/programs/patient-1', client);

    expect(screen.getByRole('alert')).toHaveTextContent('PROGRAMS_NO_ACCESS');
    expect(screen.queryByText('Private Patient')).not.toBeInTheDocument();
    expect(getPatient).not.toHaveBeenCalled();
    expect(getPrograms).not.toHaveBeenCalled();
  });
});
