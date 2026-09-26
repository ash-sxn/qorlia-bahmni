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
  getAllPrograms: jest.fn(),
  getProgramAttributeTypes: jest.fn(),
  createProgramEnrollment: jest.fn(),
  completeProgramEnrollment: jest.fn(),
  voidProgramEnrollment: jest.fn(),
  get: jest.fn(),
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
const getAllPrograms = services.getAllPrograms as jest.Mock;
const getAttributes = services.getProgramAttributeTypes as jest.Mock;
const getConfig = services.get as jest.Mock;
const createEnrollment = services.createProgramEnrollment as jest.Mock;
const completeEnrollment = services.completeProgramEnrollment as jest.Mock;
const voidEnrollment = services.voidProgramEnrollment as jest.Mock;

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
    getAllPrograms.mockResolvedValue([]);
    getAttributes.mockResolvedValue([]);
    getConfig.mockResolvedValue({ config: { program: {} } });
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
    expect(
      screen.queryByRole('button', { name: 'PROGRAMS_ENROLL' }),
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

  it('enrolls a patient with required and concept attributes through Bahmni', async () => {
    (useUserPrivilege as jest.Mock).mockReturnValue({
      userPrivileges: [
        { uuid: 'priv-1', name: 'app:clinical' },
        { uuid: 'priv-2', name: 'Edit Patient Programs' },
        { uuid: 'priv-3', name: 'Add Patient Programs' },
      ],
      isLoading: false,
    });
    getPatient.mockResolvedValue({
      fullName: 'Meera Demo',
      identifier: 'ABC123',
    });
    getPrograms.mockResolvedValue({ results: [] });
    getAllPrograms.mockResolvedValue([
      {
        uuid: 'program-1',
        name: 'Maternal health',
        retired: false,
        allWorkflows: [
          {
            retired: false,
            states: [
              {
                uuid: 'workflow-state-1',
                retired: false,
                concept: { display: 'In care' },
              },
            ],
          },
        ],
      },
    ]);
    getAttributes.mockResolvedValue([
      {
        uuid: 'attr-1',
        name: 'ID_Number',
        description: 'ID number',
        datatypeClassname: 'java.lang.String',
      },
      {
        uuid: 'attr-2',
        name: 'Care plan',
        datatypeClassname: 'org.openmrs.Concept',
        concept: {
          answers: [
            {
              uuid: 'answer-1',
              display: 'Standard',
              name: { display: 'Standard care' },
            },
          ],
        },
      },
    ]);
    getConfig.mockResolvedValue({
      config: { program: { ID_Number: { required: true } } },
    });
    createEnrollment.mockResolvedValue({ uuid: 'enrollment-1' });
    renderPage('/clinical/programs/patient-1');

    fireEvent.change(await screen.findByLabelText('PROGRAMS_NAME'), {
      target: { value: 'program-1' },
    });
    fireEvent.change(screen.getByLabelText('PROGRAMS_ENROLLED'), {
      target: { value: '2020-09-20' },
    });
    fireEvent.change(screen.getByLabelText('PROGRAMS_STATE'), {
      target: { value: 'workflow-state-1' },
    });
    fireEvent.change(screen.getByLabelText('ID number'), {
      target: { value: '123' },
    });
    fireEvent.change(screen.getByLabelText('Care plan'), {
      target: { value: 'answer-1' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'PROGRAMS_ENROLL' }));

    await waitFor(() => expect(createEnrollment).toHaveBeenCalledTimes(1));
    expect(createEnrollment).toHaveBeenCalledWith({
      patient: 'patient-1',
      program: 'program-1',
      dateEnrolled: new Date('2020-09-20T00:00:00').toISOString(),
      states: [
        {
          state: 'workflow-state-1',
          startDate: new Date('2020-09-20T00:00:00').toISOString(),
        },
      ],
      attributes: [
        { attributeType: { uuid: 'attr-1' }, value: '123' },
        {
          attributeType: { uuid: 'attr-2' },
          value: 'Standard care',
          hydratedObject: 'answer-1',
        },
      ],
    });
    expect(await screen.findByText('PROGRAMS_ENROLLED_SUCCESS')).toBeVisible();
  });

  it('refuses a duplicate active enrollment when the patient record changes', async () => {
    (useUserPrivilege as jest.Mock).mockReturnValue({
      userPrivileges: [
        { uuid: 'priv-1', name: 'app:clinical' },
        { uuid: 'priv-2', name: 'Edit Patient Programs' },
        { uuid: 'priv-3', name: 'Add Patient Programs' },
      ],
      isLoading: false,
    });
    getPatient.mockResolvedValue({ fullName: 'Meera Demo' });
    getPrograms.mockResolvedValueOnce({ results: [] }).mockResolvedValueOnce({
      results: [
        {
          program: { uuid: 'program-1' },
          dateCompleted: null,
          voided: false,
        },
      ],
    });
    getAllPrograms.mockResolvedValue([
      { uuid: 'program-1', name: 'Maternal health', retired: false },
    ]);
    renderPage('/clinical/programs/patient-1');

    fireEvent.change(await screen.findByLabelText('PROGRAMS_NAME'), {
      target: { value: 'program-1' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'PROGRAMS_ENROLL' }));

    expect(await screen.findByText('PROGRAMS_ALREADY_ENROLLED')).toBeVisible();
    expect(createEnrollment).not.toHaveBeenCalled();
  });

  it('completes an active program with a configured outcome', async () => {
    (useUserPrivilege as jest.Mock).mockReturnValue({
      userPrivileges: [
        { uuid: 'priv-1', name: 'app:clinical' },
        { uuid: 'priv-2', name: 'Edit Patient Programs' },
      ],
      isLoading: false,
    });
    getPatient.mockResolvedValue({ fullName: 'Meera Demo' });
    getPrograms.mockResolvedValue({
      results: [
        {
          uuid: 'enrollment-1',
          program: { uuid: 'program-1', name: 'Maternal health' },
          dateEnrolled: '2020-09-20',
          dateCompleted: null,
          states: [],
          attributes: [],
          voided: false,
        },
      ],
    });
    getAllPrograms.mockResolvedValue([
      {
        uuid: 'program-1',
        outcomesConcept: {
          setMembers: [{ uuid: 'outcome-1', display: 'Completed' }],
        },
      },
    ]);
    completeEnrollment.mockResolvedValue({ uuid: 'enrollment-1' });
    renderPage('/clinical/programs/patient-1');

    fireEvent.click(await screen.findByText('Maternal health'));
    fireEvent.change(await screen.findByLabelText('PROGRAMS_OUTCOME'), {
      target: { value: 'outcome-1' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'PROGRAMS_COMPLETE' }));

    await waitFor(() =>
      expect(completeEnrollment).toHaveBeenCalledWith(
        'enrollment-1',
        expect.any(String),
        'outcome-1',
      ),
    );
    expect(await screen.findByText('PROGRAMS_COMPLETE_SUCCESS')).toBeVisible();
    expect(
      screen.queryByRole('button', { name: 'PROGRAMS_ENROLL' }),
    ).not.toBeInTheDocument();
  });

  it('requires the delete privilege and confirmation before voiding', async () => {
    (useUserPrivilege as jest.Mock).mockReturnValue({
      userPrivileges: [
        { uuid: 'priv-1', name: 'app:clinical' },
        { uuid: 'priv-2', name: 'Delete Patient Programs' },
      ],
      isLoading: false,
    });
    getPatient.mockResolvedValue({ fullName: 'Meera Demo' });
    getPrograms.mockResolvedValue({
      results: [
        {
          uuid: 'enrollment-1',
          program: { uuid: 'program-1', name: 'Maternal health' },
          dateEnrolled: '2020-09-20',
          dateCompleted: null,
          states: [],
          attributes: [],
          voided: false,
        },
      ],
    });
    const confirm = jest.spyOn(window, 'confirm').mockReturnValue(false);
    voidEnrollment.mockResolvedValue(undefined);
    renderPage('/clinical/programs/patient-1');

    fireEvent.click(await screen.findByText('Maternal health'));
    fireEvent.click(screen.getByRole('button', { name: 'PROGRAMS_REMOVE' }));
    expect(voidEnrollment).not.toHaveBeenCalled();

    confirm.mockReturnValue(true);
    fireEvent.click(screen.getByRole('button', { name: 'PROGRAMS_REMOVE' }));
    await waitFor(() =>
      expect(voidEnrollment).toHaveBeenCalledWith('enrollment-1'),
    );
    confirm.mockRestore();
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
