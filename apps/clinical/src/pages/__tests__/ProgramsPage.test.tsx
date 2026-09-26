import * as services from '@bahmni/services';
import { useUserPrivilege } from '@bahmni/widgets';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import ProgramsPage from '../ProgramsPage';

jest.mock('@bahmni/services', () => ({
  ...jest.requireActual('@bahmni/services'),
  getFormattedPatientById: jest.fn(),
  getPatientPrograms: jest.fn(),
  searchPatientByNameOrId: jest.fn(),
  updateProgramState: jest.fn(),
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
const updateState = services.updateProgramState as jest.Mock;

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
          states: [
            {
              uuid: 'state-1',
              startDate: '2026-09-01',
              endDate: null,
              voided: false,
              state: { concept: { display: 'In care', names: [] } },
              auditInfo: { creator: { display: 'Nurse Demo' } },
            },
            {
              uuid: 'state-2',
              startDate: '2026-09-02',
              endDate: null,
              voided: true,
              state: { concept: { display: 'Voided state' } },
            },
          ],
          attributes: [
            {
              uuid: 'attribute-1',
              attributeType: { description: 'District' },
              value: 'Gwalior',
              voided: false,
            },
            {
              uuid: 'attribute-2',
              attributeType: { description: 'Private note' },
              value: 'Voided value',
              voided: true,
            },
          ],
          voided: false,
        },
        {
          uuid: 'past-1',
          program: { name: 'Diabetes care' },
          dateEnrolled: '2025-01-01',
          dateCompleted: '2026-01-01',
          states: [],
          outcome: { display: 'Completed care' },
          voided: false,
        },
      ],
    });
    renderPage('/clinical/programs/patient-1');

    expect(await screen.findByText('Maternal health')).toBeInTheDocument();
    expect(screen.getByText('Diabetes care')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Maternal health'));
    expect(screen.getByText('District')).toBeVisible();
    expect(screen.getByText('Gwalior')).toBeVisible();
    expect(screen.getByText(/Nurse Demo/)).toBeVisible();
    expect(screen.queryByText('Voided value')).not.toBeInTheDocument();
    expect(screen.queryByText('Voided state')).not.toBeInTheDocument();
    fireEvent.click(screen.getByText('Diabetes care'));
    expect(screen.getByText('Completed care')).toBeVisible();
    expect(
      screen.queryByRole('combobox', { name: 'PROGRAMS_CHANGE_STATE' }),
    ).not.toBeInTheDocument();
    expect(getPrograms).toHaveBeenCalledWith('patient-1');
    expect(
      screen.getByRole('link', { name: 'PROGRAMS_LEGACY_MANAGER' }),
    ).toHaveAttribute(
      'href',
      '/bahmni/clinical/#/programs/patient/patient-1/consultationContext',
    );
  });

  it('updates an allowed state only with the program editing privilege', async () => {
    (useUserPrivilege as jest.Mock).mockReturnValue({
      userPrivileges: [
        { uuid: 'priv-1', name: 'app:clinical' },
        { uuid: 'priv-2', name: 'Edit Patient Programs' },
      ],
      isLoading: false,
    });
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
          attributes: [],
          allowedStates: [
            {
              uuid: 'workflow-state-1',
              retired: false,
              concept: { display: 'In care' },
            },
          ],
          voided: false,
        },
      ],
    });
    updateState.mockResolvedValue({ uuid: 'active-1' });
    renderPage('/clinical/programs/patient-1');

    fireEvent.click(await screen.findByText('Maternal health'));
    const stateSelect = screen.getByRole('combobox', {
      name: 'PROGRAMS_CHANGE_STATE',
    });
    fireEvent.change(stateSelect, { target: { value: 'workflow-state-1' } });
    fireEvent.click(
      screen.getByRole('button', { name: 'PROGRAMS_SAVE_STATE' }),
    );

    await waitFor(() =>
      expect(updateState).toHaveBeenCalledWith('active-1', 'workflow-state-1'),
    );
    expect(await screen.findByRole('status')).toHaveTextContent(
      'PROGRAMS_STATE_SAVED',
    );
    expect(getPrograms).toHaveBeenCalledTimes(2);
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
