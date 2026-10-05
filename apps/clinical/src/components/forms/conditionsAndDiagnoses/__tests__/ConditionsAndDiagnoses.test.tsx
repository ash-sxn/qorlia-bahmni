import {
  type ConditionInputEntry,
  type DiagnosisInputEntry,
  getConditions,
  getPatientDiagnoses,
  hasPrivilege,
} from '@bahmni/services';
import {
  useNotification,
  usePatientUUID,
  conditionsQueryKeys,
  useHasPrivilege,
  UserPrivilegeProvider,
} from '@bahmni/widgets';
import {
  QueryClient,
  QueryClientProvider,
  useQuery,
} from '@tanstack/react-query';
import {
  render,
  screen,
  fireEvent,
  within,
  waitFor,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Condition } from 'fhir/r4';
import { axe, toHaveNoViolations } from 'jest-axe';
import { CERTAINITY_CONCEPTS } from '../../../../constants/diagnosis';
import { useConceptSearch } from '../../../../hooks/useConceptSearch';
import { ConceptSearch } from '../../../../models/concepts';
import { useConditionsAndDiagnosesStore } from '../../../../stores/conditionsAndDiagnosesStore';
import ConditionsAndDiagnoses from '../ConditionsAndDiagnoses';
import type { EncounterSessionStartContext } from '../../../../events/startConsultation';

expect.extend(toHaveNoViolations);

jest.mock('../../../../hooks/useConceptSearch');
jest.mock('@bahmni/services', () => ({
  ...jest.requireActual('@bahmni/services'),
  getConditions: jest.fn(),
  getPatientDiagnoses: jest.fn(),
}));

jest.mock('@bahmni/widgets', () => ({
  ...jest.requireActual('@bahmni/widgets'),
  useNotification: jest.fn(),
  usePatientUUID: jest.fn(),
  conditionsQueryKeys: jest.fn(),
  diagnosesQueryKeys: jest.fn(),
  useHasPrivilege: jest.fn(),
  UserPrivilegeProvider: ({ children }: any) => children,
}));

jest.mock('@tanstack/react-query', () => ({
  ...jest.requireActual('@tanstack/react-query'),
  useQuery: jest.fn(),
}));

// Mock the Zustand store
jest.mock('../../../../stores/conditionsAndDiagnosesStore');

const mockedUseConceptSearch = useConceptSearch as jest.MockedFunction<
  typeof useConceptSearch
>;
const mockedGetConditions = getConditions as jest.MockedFunction<
  typeof getConditions
>;
const mockedUseNotification = useNotification as jest.MockedFunction<
  typeof useNotification
>;
const mockedUsePatientUUID = usePatientUUID as jest.MockedFunction<
  typeof usePatientUUID
>;
const mockedConditionsQueryKeys = conditionsQueryKeys as jest.MockedFunction<
  typeof conditionsQueryKeys
>;
const mockedUseConditionsAndDiagnosesStore =
  useConditionsAndDiagnosesStore as jest.MockedFunction<
    typeof useConditionsAndDiagnosesStore
  >;
const mockedUseQuery = useQuery as jest.MockedFunction<typeof useQuery>;
const mockedUseUserPrivilege = useHasPrivilege as jest.MockedFunction<
  typeof useHasPrivilege
>;

const mockUserPrivilegesWithDiagnoses = true;

const mockUserPrivilegesEmpty = false;

const createMockConcept = (
  overrides?: Partial<ConceptSearch>,
): ConceptSearch => ({
  conceptName: 'Hypertension',
  conceptUuid: 'uuid-1',
  matchedName: 'Hypertension',
  ...overrides,
});

const createMockDiagnosisEntry = (
  overrides?: Partial<DiagnosisInputEntry>,
): DiagnosisInputEntry => ({
  id: 'uuid-1',
  display: 'Hypertension',
  selectedCertainty: CERTAINITY_CONCEPTS[0],
  errors: {},
  hasBeenValidated: false,
  ...overrides,
});

const createMockConditionEntry = (
  overrides?: Partial<ConditionInputEntry>,
): ConditionInputEntry => ({
  id: 'uuid-3',
  display: 'Chronic Hypertension',
  durationValue: 6,
  durationUnit: 'months',
  errors: {},
  hasBeenValidated: false,
  ...overrides,
});

const createMockExistingCondition = (
  overrides?: Partial<Condition>,
): Condition => ({
  resourceType: 'Condition',
  id: 'existing-uuid-1',
  subject: { reference: 'Patient/patient-uuid' },
  code: {
    coding: [
      {
        system: 'http://snomed.info/sct',
        code: 'uuid-1',
        display: 'Existing Condition 1',
      },
    ],
  },
  clinicalStatus: { coding: [{ code: 'active' }] },
  verificationStatus: { coding: [{ code: 'confirmed' }] },
  ...overrides,
});

const mockConcepts = [
  createMockConcept({ conceptName: 'Hypertension', conceptUuid: 'uuid-1' }),
  createMockConcept({ conceptName: 'Diabetes', conceptUuid: 'uuid-2' }),
];

const mockDiagnosisEntries = [createMockDiagnosisEntry()];
const mockConditionEntries = [
  createMockConditionEntry({
    id: 'uuid-3',
    display: 'Chronic Hypertension',
    durationValue: 6,
    durationUnit: 'months',
  }),
  createMockConditionEntry({
    id: 'uuid-4',
    display: 'Type 2 Diabetes',
    durationValue: null,
    durationUnit: null,
  }),
];
const mockExistingConditions = [
  createMockExistingCondition({
    id: 'existing-uuid-1',
    code: {
      coding: [
        {
          system: 'http://snomed.info/sct',
          code: 'uuid-1',
          display: 'Existing Condition 1',
        },
      ],
    },
  }),
  createMockExistingCondition({
    id: 'existing-uuid-2',
    code: {
      coding: [
        {
          system: 'http://snomed.info/sct',
          code: 'uuid-5',
          display: 'Existing Condition 2',
        },
      ],
    },
  }),
];

describe('ConditionsAndDiagnoses', () => {
  // Mock store actions
  let addDiagnosisMock: jest.Mock;
  let addConditionMock: jest.Mock;
  let removeDiagnosisMock: jest.Mock;
  let updateCertaintyMock: jest.Mock;
  let markAsConditionMock: jest.Mock;
  let removeConditionMock: jest.Mock;
  let updateConditionDurationMock: jest.Mock;
  let validateMock: jest.Mock;
  let resetMock: jest.Mock;
  let getStateMock: jest.Mock;

  const renderComponent = (
    selectedDiagnoses: DiagnosisInputEntry[] = [],
    selectedConditions: ConditionInputEntry[] = [],
    conceptSearchResults: ConceptSearch[] = [],
    conceptSearchLoading = false,
    conceptSearchError: Error | null = null,
    existingConditions: Condition[] | null = [],
    existingConditionsLoading = false,
    existingConditionsError: Error | null = null,
    diagnosesError: Error | null = null,
    encounterSessionStartContext?: EncounterSessionStartContext,
  ) => {
    mockedUseConceptSearch.mockReturnValue({
      searchResults: conceptSearchResults,
      loading: conceptSearchLoading,
      error: conceptSearchError,
    });

    mockedUsePatientUUID.mockReturnValue('test-patient-uuid');
    mockedUseNotification.mockReturnValue({
      addNotification: jest.fn(),
      notifications: [],
      removeNotification: jest.fn(),
      clearAllNotifications: jest.fn(),
    });
    mockedConditionsQueryKeys.mockReturnValue([
      'conditions',
      'test-patient-uuid',
    ]);

    // Mock useQuery to return the appropriate structure
    const queryResult = {
      data: existingConditions ?? undefined,
      isLoading: existingConditionsLoading,
      error: existingConditionsError,
      isError: !!existingConditionsError,
      isSuccess: !existingConditionsLoading && !existingConditionsError,
      refetch: jest.fn(),
      isFetching: false,
      isRefetching: false,
      isPending: existingConditionsLoading,
      status: existingConditionsError
        ? 'error'
        : existingConditionsLoading
          ? 'pending'
          : 'success',
      fetchStatus: 'idle',
    };
    mockedUseQuery.mockImplementation(
      (options: any) =>
        ({
          ...queryResult,
          ...(options.queryKey[0] === 'diagnoses' && diagnosesError
            ? {
                data: undefined,
                error: diagnosesError,
                isError: true,
                isSuccess: false,
              }
            : {}),
        }) as any,
    );

    if (existingConditionsError) {
      mockedGetConditions.mockRejectedValue(existingConditionsError);
    } else {
      mockedGetConditions.mockResolvedValue(existingConditions ?? []);
    }

    addDiagnosisMock = jest.fn();
    addConditionMock = jest.fn();
    removeDiagnosisMock = jest.fn();
    updateCertaintyMock = jest.fn();
    markAsConditionMock = jest.fn();
    removeConditionMock = jest.fn();
    updateConditionDurationMock = jest.fn();
    validateMock = jest.fn().mockReturnValue(true);
    resetMock = jest.fn();
    getStateMock = jest.fn();

    mockedUseConditionsAndDiagnosesStore.mockReturnValue({
      selectedDiagnoses,
      selectedConditions,
      addDiagnosis: addDiagnosisMock,
      addCondition: addConditionMock,
      removeDiagnosis: removeDiagnosisMock,
      updateCertainty: updateCertaintyMock,
      validate: validateMock,
      reset: resetMock,
      getState: getStateMock,
      markAsCondition: markAsConditionMock,
      removeCondition: removeConditionMock,
      updateConditionDuration: updateConditionDurationMock,
    });

    const queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
        },
      },
    });

    return render(
      <QueryClientProvider client={queryClient}>
        <UserPrivilegeProvider>
          <ConditionsAndDiagnoses
            encounterSessionStartContext={encounterSessionStartContext}
          />
        </UserPrivilegeProvider>
      </QueryClientProvider>,
    );
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockedUseUserPrivilege.mockReturnValue(mockUserPrivilegesWithDiagnoses);
    jest.spyOn(console, 'error').mockImplementation(() => {});
    window.HTMLElement.prototype.scrollIntoView = jest.fn();
  });

  describe('Initial Rendering', () => {
    it('uses the consultation pad encounter for duplicate reads, not patient-wide history', async () => {
      renderComponent(
        [],
        [],
        mockConcepts,
        false,
        null,
        [],
        false,
        null,
        null,
        {
          patientUuid: 'test-patient-uuid',
          activeEncounter: {
            resourceType: 'Encounter',
            id: 'current-encounter',
            status: 'in-progress',
            class: {},
            subject: { reference: 'Patient/test-patient-uuid' },
          },
        },
      );
      const query = mockedUseQuery.mock.calls.find(
        ([options]: any) => options.queryKey[0] === 'diagnoses',
      )?.[0] as any;
      (getPatientDiagnoses as jest.Mock).mockResolvedValueOnce([]);
      await query.queryFn();
      expect(query.queryKey).toEqual([
        'diagnoses',
        'test-patient-uuid',
        'current-encounter',
      ]);
      expect(getPatientDiagnoses).toHaveBeenCalledWith(
        'test-patient-uuid',
        'current-encounter',
      );
    });

    it('does not use past diagnoses as duplicates for a new encounter', async () => {
      renderComponent(
        [],
        [],
        mockConcepts,
        false,
        null,
        [],
        false,
        null,
        null,
        {
          patientUuid: 'test-patient-uuid',
          activeEncounter: null,
        },
      );
      const query = mockedUseQuery.mock.calls.find(
        ([options]: any) => options.queryKey[0] === 'diagnoses',
      )?.[0] as any;
      expect(await query.queryFn()).toEqual([]);
      expect(getPatientDiagnoses).not.toHaveBeenCalled();
    });

    it.each([
      { activeEncounter: undefined },
      {
        activeEncounter: {
          resourceType: 'Encounter',
          id: 'other-patient-encounter',
          status: 'in-progress',
          class: {},
          subject: { reference: 'Patient/other-patient' },
        },
      },
    ] as EncounterSessionStartContext[])(
      'blocks diagnosis entry until the current patient encounter is resolved: %j',
      async (context) => {
        renderComponent(
          [],
          [],
          mockConcepts,
          false,
          null,
          [],
          false,
          null,
          null,
          context,
        );
        const query = mockedUseQuery.mock.calls.find(
          ([options]: any) => options.queryKey[0] === 'diagnoses',
        )?.[0] as any;
        expect(query.enabled).toBe(false);
        await userEvent.type(screen.getByRole('combobox'), 'hyper');
        expect(screen.getByText('Loading concepts...')).toBeInTheDocument();
        expect(addDiagnosisMock).not.toHaveBeenCalled();
      },
    );

    it('rejects same-name draft diagnoses with different concept IDs', async () => {
      renderComponent(
        [
          createMockDiagnosisEntry({
            id: 'different-id',
            display: ' HYPERTENSION ',
          }),
        ],
        [],
        mockConcepts,
      );
      await userEvent.type(
        screen.getByRole('combobox', { name: 'Search for diagnoses' }),
        'hyper',
      );
      await userEvent.click(screen.getByText('Hypertension'));
      expect(addDiagnosisMock).not.toHaveBeenCalled();
      expect(
        screen.getByText('Diagnosis is already added'),
      ).toBeInTheDocument();
    });

    test('should render the component with default state', () => {
      renderComponent();
      expect(screen.getByText('Conditions and Diagnoses')).toBeInTheDocument();
      expect(
        screen.getByPlaceholderText('Search to add new Diagnosis'),
      ).toBeInTheDocument();
    });

    test('should not render selected diagnoses section when no diagnoses are selected', () => {
      renderComponent([], mockConditionEntries);
      expect(screen.queryByText('Added Diagnoses')).not.toBeInTheDocument();
    });

    test('should render selected diagnoses section when diagnoses are present', () => {
      renderComponent(mockDiagnosisEntries);
      expect(screen.getByText('Added Diagnoses')).toBeInTheDocument();
      expect(screen.getByText('Hypertension')).toBeInTheDocument();
    });

    test('should not render conditions section when no conditions are selected', () => {
      renderComponent(mockDiagnosisEntries, []);
      expect(screen.queryByText('Added Conditions')).not.toBeInTheDocument();
    });

    test('should render conditions section when conditions are present', () => {
      renderComponent([], mockConditionEntries);
      expect(screen.getByText('Added Conditions')).toBeInTheDocument();
      expect(screen.getByText('Chronic Hypertension')).toBeInTheDocument();
      expect(screen.getByText('Type 2 Diabetes')).toBeInTheDocument();
    });

    test('should render both diagnoses and conditions sections when both have data', () => {
      renderComponent(mockDiagnosisEntries, mockConditionEntries);

      expect(screen.getByText('Added Diagnoses')).toBeInTheDocument();
      expect(screen.getByText('Hypertension')).toBeInTheDocument();

      expect(screen.getByText('Added Conditions')).toBeInTheDocument();
      expect(screen.getByText('Chronic Hypertension')).toBeInTheDocument();
      expect(screen.getByText('Type 2 Diabetes')).toBeInTheDocument();
    });
  });

  describe('User Workflow: Search, Select, and Remove Diagnoses', () => {
    test('should display selected diagnosis after selection', () => {
      // Render with selected diagnosis already in store to verify display
      renderComponent(
        [createMockDiagnosisEntry({ display: 'Hypertension', id: 'uuid-1' })],
        [],
        mockConcepts,
      );

      expect(screen.getByText('Hypertension')).toBeInTheDocument();
      expect(screen.getByText('Added Diagnoses')).toBeInTheDocument();
    });

    test('should clear search term after selecting diagnosis', async () => {
      const user = userEvent.setup();
      renderComponent([], [], mockConcepts);

      const searchInput = screen.getByPlaceholderText(
        'Search to add new Diagnosis',
      );
      await user.type(searchInput, 'hyper');
      await user.click(screen.getByText('Hypertension'));

      await waitFor(() => {
        expect(searchInput).toHaveValue('');
      });
    });

    test('should reset ComboBox selectedItem to null after selection to allow immediate re-search', async () => {
      const user = userEvent.setup();
      renderComponent([], [], mockConcepts);

      const searchInput = screen.getByPlaceholderText(
        'Search to add new Diagnosis',
      );

      // First selection
      await user.type(searchInput, 'hyper');
      await user.click(screen.getByText('Hypertension'));

      // Verify combobox is reset (selectedItem is null, allowing new searches)
      await waitFor(() => {
        expect(searchInput).toHaveValue('');
      });

      // Verify we can immediately search for another item (proves selectedItem was reset to null)
      await user.type(searchInput, 'diab');
      await waitFor(() => {
        expect(screen.getByText('Diabetes')).toBeInTheDocument();
      });

      // Verify the new search works correctly - this proves selectedItem is null
      // because the ComboBox wouldn't accept new input if selectedItem was still set
      await user.click(screen.getByText('Diabetes'));
      await waitFor(() => {
        expect(addDiagnosisMock).toHaveBeenCalledTimes(2);
      });
    });

    test('should display already selected diagnoses as disabled with indicator text', async () => {
      const user = userEvent.setup();
      const existingDiagnosis = createMockDiagnosisEntry({
        id: mockConcepts[0].conceptUuid,
        display: mockConcepts[0].conceptName,
      });

      renderComponent([existingDiagnosis], [], mockConcepts);

      const searchInput = screen.getByPlaceholderText(
        'Search to add new Diagnosis',
      );
      await user.type(searchInput, 'hyper');

      const disabledOption = await screen.findByText(
        `${mockConcepts[0].conceptName} (Diagnosis is already added)`,
      );
      expect(disabledOption).toBeInTheDocument();
      const disabledListItem = disabledOption.closest('li');
      expect(disabledListItem).toHaveAttribute('disabled');
    });

    test('should not allow selection of disabled items', async () => {
      const user = userEvent.setup();
      const existingDiagnosis = createMockDiagnosisEntry({
        id: mockConcepts[0].conceptUuid,
        display: mockConcepts[0].conceptName,
      });

      renderComponent([existingDiagnosis], [], mockConcepts);

      const searchInput = screen.getByPlaceholderText(
        'Search to add new Diagnosis',
      );
      await user.type(searchInput, 'hyper');

      const disabledOption = await screen.findByText(
        `${mockConcepts[0].conceptName} (Diagnosis is already added)`,
      );
      expect(disabledOption).toBeInTheDocument();

      const disabledListItem = disabledOption.closest('li');
      expect(disabledListItem).toHaveAttribute('disabled');

      await user.click(disabledOption);

      expect(addDiagnosisMock).not.toHaveBeenCalled();
    });

    test('should handle removal of a diagnosis', async () => {
      const user = userEvent.setup();
      renderComponent(mockDiagnosisEntries);

      const removeButton = screen.getByRole('button', {
        name: 'Close',
      });
      await user.click(removeButton);

      expect(removeDiagnosisMock).toHaveBeenCalledWith(
        mockDiagnosisEntries[0].id,
      );
    });
  });

  describe('Search Functionality', () => {
    test.each([null, undefined])(
      'should display empty value when %s item is selected in ComboBox',
      (value) => {
        renderComponent();
        const comboBox = screen.getByRole('combobox');

        fireEvent.change(comboBox, {
          target: { value: '' },
          selectedItem: value,
        });
        expect(comboBox).toHaveValue('');
      },
    );

    test('should clear search results when search term is empty', async () => {
      const user = userEvent.setup();
      renderComponent([], [], [], true);

      const searchInput = screen.getByPlaceholderText(
        'Search to add new Diagnosis',
      );

      await user.type(searchInput, 'test');
      await user.clear(searchInput);

      expect(mockedUseConceptSearch).toHaveBeenCalledWith('');
      expect(
        screen.queryByText('No matching Diagnosis recorded'),
      ).not.toBeInTheDocument();
    });

    test('should show loading state while searching', async () => {
      const user = userEvent.setup();
      renderComponent([], [], [], true);

      const searchInput = screen.getByPlaceholderText(
        'Search to add new Diagnosis',
      );
      await user.type(searchInput, 'hyper');

      expect(mockedUseConceptSearch).toHaveBeenCalledWith('hyper');
      expect(screen.getByText('Loading concepts...')).toBeInTheDocument();
    });

    test('should display search results when API returns data', async () => {
      const user = userEvent.setup();
      renderComponent([], [], mockConcepts);

      const searchInput = screen.getByPlaceholderText(
        'Search to add new Diagnosis',
      );
      await user.type(searchInput, 'hyper');

      expect(screen.getByText('Hypertension')).toBeInTheDocument();
      expect(screen.getByText('Diabetes')).toBeInTheDocument();
    });

    test('should display no results message when search returns empty', async () => {
      const user = userEvent.setup();
      renderComponent([], [], []);

      const searchInput = screen.getByPlaceholderText(
        'Search to add new Diagnosis',
      );
      await user.type(searchInput, 'nonexistent');

      expect(
        screen.getByText('No matching Diagnosis recorded'),
      ).toBeInTheDocument();
    });

    test('should display error message when search fails', async () => {
      const user = userEvent.setup();
      renderComponent([], [], [], false, new Error('API Error'));

      const searchInput = screen.getByPlaceholderText(
        'Search to add new Diagnosis',
      );
      await user.type(searchInput, 'test');

      const errorOption = screen.getByText(
        'An unexpected error occurred. Please try again later.',
      );
      expect(errorOption).toBeInTheDocument();
      const errorListItem = errorOption.closest('li');
      expect(errorListItem).toHaveAttribute('disabled');
    });

    test('should handle search term less than 3 characters', async () => {
      const user = userEvent.setup();
      renderComponent();
      const searchInput = screen.getByPlaceholderText(
        'Search to add new Diagnosis',
      );
      await user.type(searchInput, 'hy');

      expect(mockedUseConceptSearch).toHaveBeenCalledWith('hy');
      expect(screen.queryByText('Hypertension')).not.toBeInTheDocument();
    });
  });

  describe('Managing Conditions', () => {
    test('should handle condition removal', async () => {
      const user = userEvent.setup();
      renderComponent([], [mockConditionEntries[0]]);

      const removeButtons = screen.getAllByRole('button', {
        name: 'Close',
      });
      await user.click(removeButtons[0]);

      expect(removeConditionMock).toHaveBeenCalledWith(
        mockConditionEntries[0].id,
      );
    });

    test('should handle condition duration updates', async () => {
      renderComponent([], mockConditionEntries);
      expect(screen.getByText('Chronic Hypertension')).toBeInTheDocument();
      expect(screen.getByText('Type 2 Diabetes')).toBeInTheDocument();
      // This test needs to be more specific about how duration updates are handled.
      // It currently only checks for rendering, not interaction.
      // A more robust test would involve simulating input into the duration fields
      // within SelectedConditionItem and asserting that updateConditionDuration is called.
    });
  });

  describe('Diagnosis to Condition Conversion', () => {
    test.each([null, CERTAINITY_CONCEPTS[1], { code: 'unknown' }])(
      'retains but does not convert a diagnosis with certainty %j',
      (selectedCertainty) => {
        renderComponent([createMockDiagnosisEntry({ selectedCertainty })]);
        const link = screen.getByTestId('add-as-condition-link');
        expect(link).toHaveAttribute('aria-disabled', 'true');
        fireEvent.click(link);
        expect(markAsConditionMock).not.toHaveBeenCalled();
        expect(removeDiagnosisMock).not.toHaveBeenCalled();
        expect(screen.getByText('Hypertension')).toBeInTheDocument();
      },
    );

    test('should handle marking diagnosis as condition', async () => {
      const user = userEvent.setup();
      const diagnosisToConvert = createMockDiagnosisEntry({
        id: 'diagnosis-to-convert',
        display: 'Diagnosis to Convert',
      });
      renderComponent([diagnosisToConvert]);

      const markAsConditionLink = screen.getByRole('link', {
        name: /add as condition/i,
      });
      await user.click(markAsConditionLink);

      expect(markAsConditionMock).toHaveBeenCalledWith('diagnosis-to-convert');
    });

    test('should correctly check if diagnosis is a duplicate condition (existing patient conditions)', () => {
      const diagnosis = createMockDiagnosisEntry({
        id: 'uuid-1',
        display: 'Hypertension',
      });
      const existingCondition = createMockExistingCondition({
        code: { coding: [{ code: 'uuid-1', display: 'Existing Condition 1' }] },
      });

      renderComponent([diagnosis], [], [], false, null, [existingCondition]);

      const diagnosisItem = screen.getByText('Hypertension');
      expect(diagnosisItem).toBeInTheDocument();
      // To properly test this, SelectedDiagnosisItem would need to expose a test ID or a specific text
      // indicating it's a duplicate. For now, we rely on the component's internal logic.
    });

    test('should correctly check if diagnosis is a duplicate condition (selected conditions)', () => {
      const diagnosis = createMockDiagnosisEntry({
        id: 'uuid-1',
        display: 'Hypertension',
      });
      const selectedCondition = createMockConditionEntry({
        id: 'uuid-1',
        display: 'Hypertension',
      });

      renderComponent([diagnosis], [selectedCondition]);

      const addedDiagnosesSection = screen
        .getByText('Added Diagnoses')
        .closest('[role="region"]') as HTMLElement;
      expect(addedDiagnosesSection).toBeInTheDocument();
      const diagnosisItem = within(addedDiagnosesSection).getByText(
        'Hypertension',
      );
      expect(diagnosisItem).toBeInTheDocument();
      // Similar to the above, a more explicit assertion would be needed if the UI indicates duplication.
    });

    test('should correctly check if diagnosis is not a duplicate condition', () => {
      const diagnosis = createMockDiagnosisEntry({
        id: 'uuid-non-duplicate',
        display: 'Non-Duplicate Diagnosis',
      });
      renderComponent([diagnosis], [], [], false, null, mockExistingConditions);

      const diagnosisItem = screen.getByText('Non-Duplicate Diagnosis');
      expect(diagnosisItem).toBeInTheDocument();
    });

    test('should handle undefined/null existingConditions array in isConditionDuplicate', () => {
      const diagnosis = createMockDiagnosisEntry();
      renderComponent([diagnosis], [], [], false, null, null, true);

      expect(screen.getByText('Hypertension')).toBeInTheDocument();
      expect(screen.getByTestId('add-as-condition-link')).toHaveAttribute(
        'aria-disabled',
        'true',
      );
      expect(
        screen.queryByText('Already added as condition'),
      ).not.toBeInTheDocument();
      fireEvent.click(screen.getByTestId('add-as-condition-link'));
      expect(markAsConditionMock).not.toHaveBeenCalled();
    });
  });

  describe('Loading and Error States', () => {
    test('should display loading text when existing conditions are loading', async () => {
      const user = userEvent.setup();
      renderComponent([], [], [], false, null, [], true); // Existing conditions loading

      const searchInput = screen.getByPlaceholderText(
        'Search to add new Diagnosis',
      );
      await user.type(searchInput, 'test');

      expect(screen.getByText('Loading concepts...')).toBeInTheDocument();
    });

    test('should display error message when fetching existing conditions fails', async () => {
      const user = userEvent.setup();
      renderComponent(
        [],
        [],
        [],
        false,
        null,
        [],
        false,
        new Error('Conditions API Error'),
      );

      const searchInput = screen.getByPlaceholderText(
        'Search to add new Diagnosis',
      );
      await user.type(searchInput, 'test');
      expect(
        screen.getByText(
          'An unexpected error occurred. Please try again later.',
        ),
      ).toBeInTheDocument();
      expect(
        screen.queryByText('No matching Diagnosis recorded'),
      ).not.toBeInTheDocument();
    });

    test('should prioritize search error over conditions error for display', async () => {
      const user = userEvent.setup();
      renderComponent(
        [],
        [],
        [],
        false,
        new Error('Search API Error'),
        [],
        false,
        new Error('Conditions API Error'),
      );

      const searchInput = screen.getByPlaceholderText(
        'Search to add new Diagnosis',
      );
      await user.type(searchInput, 'test');

      expect(
        screen.getByText(
          'An unexpected error occurred. Please try again later.',
        ),
      ).toBeInTheDocument();
    });
  });

  describe('Search Result Filtering with Existing Conditions', () => {
    test('should mark search results as disabled if they are selected diagnoses AND existing conditions', async () => {
      const user = userEvent.setup();
      const existingDiagnosis = createMockDiagnosisEntry({
        id: mockConcepts[0].conceptUuid,
        display: mockConcepts[0].conceptName,
      });

      renderComponent(
        [existingDiagnosis],
        [],
        mockConcepts,
        false,
        null,
        mockExistingConditions,
      );

      const searchInput = screen.getByPlaceholderText(
        'Search to add new Diagnosis',
      );
      await user.type(searchInput, 'hyper');

      const disabledOption = await screen.findByText(
        `${mockConcepts[0].conceptName} (Diagnosis is already added)`,
      );
      expect(disabledOption).toBeInTheDocument();
      const disabledListItem = disabledOption.closest('li');
      expect(disabledListItem).toHaveAttribute('disabled');
    });

    test('should not mark search results as disabled if they are only existing conditions (current component behavior)', async () => {
      const user = userEvent.setup();
      renderComponent(
        [],
        [],
        mockConcepts,
        false,
        null,
        mockExistingConditions,
      );

      const searchInput = screen.getByPlaceholderText(
        'Search to add new Diagnosis',
      );
      await user.type(searchInput, 'hyper');

      const enabledOption = await screen.findByText(
        mockConcepts[0].conceptName,
      );
      expect(enabledOption).toBeInTheDocument();
      const enabledListItem = enabledOption.closest('li');
      expect(enabledListItem).not.toHaveAttribute('disabled');

      const anotherEnabledOption = screen.getByText(
        mockConcepts[1].conceptName,
      );
      expect(anotherEnabledOption).toBeInTheDocument();
      const anotherEnabledListItem = anotherEnabledOption.closest('li');
      expect(anotherEnabledListItem).not.toHaveAttribute('disabled');
    });
  });

  describe('Accessibility', () => {
    test('should have proper ARIA labels', () => {
      renderComponent();
      expect(screen.getByLabelText('Search for diagnoses')).toBeInTheDocument();
    });

    test('accessible forms pass axe', async () => {
      const { container } = renderComponent();
      expect(await axe(container)).toHaveNoViolations();
    });
  });

  describe('Selection Edge Cases', () => {
    test('should not call addDiagnosis when selectedItem is falsy', async () => {
      renderComponent();
      const comboBox = screen.getByRole('combobox');

      // Simulate onChange with undefined selectedItem
      fireEvent.change(comboBox, {
        target: { value: '' },
        selectedItem: undefined,
      });

      expect(addDiagnosisMock).not.toHaveBeenCalled();
    });

    test('should not call addDiagnosis when selectedItem has missing conceptUuid', async () => {
      const mockConceptMissingUuid = createMockConcept({
        conceptName: 'Test Concept',
        conceptUuid: '',
      });

      renderComponent([], [], [mockConceptMissingUuid]);
      const searchInput = screen.getByPlaceholderText(
        'Search to add new Diagnosis',
      );
      await userEvent.type(searchInput, 'Test');

      fireEvent.click(screen.getByText('Test Concept'));

      expect(addDiagnosisMock).not.toHaveBeenCalled();
    });

    test('should not call addDiagnosis when selectedItem has missing conceptName', async () => {
      const mockConceptMissingName = createMockConcept({
        conceptName: '',
        conceptUuid: 'uuid-test',
        matchedName: 'Test Concept',
      });

      renderComponent([], [], [mockConceptMissingName]);
      const comboBox = screen.getByRole('combobox');

      // Simulate onChange with the problematic selectedItem directly
      fireEvent.change(comboBox, {
        target: { value: 'Test' },
        selectedItem: mockConceptMissingName,
      });

      expect(addDiagnosisMock).not.toHaveBeenCalled();
    });

    test('should not call addDiagnosis when selectedItem has both missing conceptName and conceptUuid', async () => {
      const mockInvalidConcept = createMockConcept({
        conceptName: '',
        conceptUuid: '',
        matchedName: 'Invalid Concept',
      });

      renderComponent([], [], [mockInvalidConcept]);
      const comboBox = screen.getByRole('combobox');

      // Simulate onChange with the problematic selectedItem directly
      fireEvent.change(comboBox, {
        target: { value: 'invalid' },
        selectedItem: mockInvalidConcept,
      });

      expect(addDiagnosisMock).not.toHaveBeenCalled();
    });
  });
  describe('Keyboard Navigation', () => {
    it('should support keyboard navigation and selection in ComboBox', async () => {
      const user = userEvent.setup();
      renderComponent([], [], mockConcepts);

      const searchBox = screen.getByPlaceholderText(
        'Search to add new Diagnosis',
      );

      // Type to open dropdown
      await user.type(searchBox, 'hyper');

      await waitFor(() => {
        expect(screen.getByText('Hypertension')).toBeInTheDocument();
      });

      // Navigate with arrow key and select with Enter
      await user.keyboard('{ArrowDown}');
      await user.keyboard('{Enter}');

      await waitFor(() => {
        expect(addDiagnosisMock).toHaveBeenCalled();
      });
    });
  });

  describe('Snapshot Tests', () => {
    it('empty form matches snapshot', () => {
      const { container } = renderComponent();
      expect(container).toMatchSnapshot();
    });

    it('form with search results matches snapshot', () => {
      const { container } = renderComponent([], [], mockConcepts);
      expect(container).toMatchSnapshot();
    });

    it('form with selected diagnoses matches snapshot', () => {
      const { container } = renderComponent(mockDiagnosisEntries);
      expect(container).toMatchSnapshot();
    });

    it('duplicate diagnosis search should matches snapshot', () => {
      const { container } = renderComponent(
        mockDiagnosisEntries,
        [],
        mockConcepts,
      );
      expect(container).toMatchSnapshot();
    });

    it('form with selected conditions matches snapshot', () => {
      const { container } = renderComponent([], mockConditionEntries);
      expect(container).toMatchSnapshot();
    });

    it('form with both diagnoses and conditions matches snapshot', () => {
      const { container } = renderComponent(
        mockDiagnosisEntries,
        mockConditionEntries,
      );
      expect(container).toMatchSnapshot();
    });
  });

  describe('Consultation Saved Subscription', () => {
    it('refetches existing diagnoses and conditions when consultation is saved with conditions', async () => {
      renderComponent();

      // renderComponent sets up useQuery mock — capture the refetch the component actually holds
      const usedRefetch = (useQuery as jest.Mock).mock.results[0].value.refetch;

      const event = new CustomEvent('consultation:saved', {
        detail: {
          patientUUID: 'test-patient-uuid',
          updatedResources: {
            conditions: true,
            allergies: false,
            medications: false,
            serviceRequests: {},
          },
          updatedConcepts: new Map(),
        },
      });
      window.dispatchEvent(event);

      await waitFor(() => {
        // refetch is called once per query (conditions + diagnoses = 2 calls)
        expect(usedRefetch).toHaveBeenCalledTimes(2);
      });
    });

    it('does not refetch when consultation is saved for a different patient', async () => {
      renderComponent();

      const usedRefetch = (useQuery as jest.Mock).mock.results[0].value.refetch;

      const event = new CustomEvent('consultation:saved', {
        detail: {
          patientUUID: 'different-patient-uuid',
          updatedResources: {
            conditions: true,
            allergies: false,
            medications: false,
            serviceRequests: {},
          },
          updatedConcepts: new Map(),
        },
      });
      window.dispatchEvent(event);

      await waitFor(() => {
        expect(usedRefetch).not.toHaveBeenCalled();
      });
    });
  });

  describe('Privilege Guard', () => {
    it('adds a condition without diagnosis write authorization or diagnosis history', async () => {
      mockedUseUserPrivilege.mockImplementation((required) =>
        hasPrivilege(
          [{ name: 'Edit Conditions', uuid: 'edit-conditions' }],
          required,
        ),
      );
      renderComponent(
        [],
        [],
        mockConcepts,
        false,
        null,
        [],
        false,
        null,
        new Error('Diagnosis history unavailable'),
      );
      expect(mockedUseQuery).toHaveBeenCalledWith(
        expect.objectContaining({
          queryKey: ['conditions', 'test-patient-uuid'],
          enabled: true,
        }),
      );
      expect(mockedUseQuery).toHaveBeenCalledWith(
        expect.objectContaining({
          queryKey: ['diagnoses', 'test-patient-uuid', null],
          enabled: false,
        }),
      );
      await userEvent.type(screen.getByRole('combobox'), 'hyper');
      await userEvent.click(
        screen.getByRole('option', { name: 'Hypertension' }),
      );
      expect(addConditionMock).toHaveBeenCalledWith(
        expect.objectContaining(mockConcepts[0]),
      );
      expect(addDiagnosisMock).not.toHaveBeenCalled();
    });

    it('blocks direct condition selection when condition history is unavailable', async () => {
      mockedUseUserPrivilege.mockImplementation((required) =>
        hasPrivilege(
          [{ name: 'Edit Conditions', uuid: 'edit-conditions' }],
          required,
        ),
      );
      renderComponent(
        [],
        [],
        mockConcepts,
        false,
        null,
        [],
        false,
        new Error('Condition history unavailable'),
      );
      await userEvent.type(screen.getByRole('combobox'), 'hyper');
      expect(
        screen.queryByRole('option', { name: 'Hypertension' }),
      ).not.toBeInTheDocument();
      expect(addConditionMock).not.toHaveBeenCalled();
    });

    it('does not offer an already selected condition to a condition-only user', async () => {
      mockedUseUserPrivilege.mockImplementation((required) =>
        hasPrivilege(
          [{ name: 'Edit Conditions', uuid: 'edit-conditions' }],
          required,
        ),
      );
      renderComponent(
        [],
        [createMockConditionEntry({ id: 'uuid-1' })],
        mockConcepts,
      );
      await userEvent.type(
        screen.getByRole('combobox', { name: 'Search conditions' }),
        'hyper',
      );
      const option = screen.getByRole('option', {
        name: /Hypertension.*already added/i,
      });
      expect(option.closest('li')).toHaveAttribute('disabled');
      fireEvent.click(option);
      expect(addConditionMock).not.toHaveBeenCalled();
      expect(addDiagnosisMock).not.toHaveBeenCalled();
    });

    it.each(['Add Diagnoses', 'Edit Diagnoses'])(
      'allows diagnosis entry with native %s authorization',
      async (name) => {
        mockedUseUserPrivilege.mockImplementation((required) =>
          hasPrivilege([{ name, uuid: name }], required),
        );
        renderComponent([], [], mockConcepts);
        await userEvent.type(screen.getByRole('combobox'), 'hyper');
        await userEvent.click(
          screen.getByRole('option', { name: 'Hypertension' }),
        );
        expect(addDiagnosisMock).toHaveBeenCalledWith(
          expect.objectContaining(mockConcepts[0]),
        );
      },
    );

    it('does not convert a diagnosis without native Edit Conditions authorization', () => {
      mockedUseUserPrivilege.mockImplementation((required) =>
        hasPrivilege(
          [{ name: 'Add Diagnoses', uuid: 'add-diagnoses' }],
          required,
        ),
      );
      renderComponent(mockDiagnosisEntries);
      const link = screen.getByTestId('add-as-condition-link');
      expect(link).toHaveAttribute('aria-disabled', 'true');
      fireEvent.click(link);
      expect(markAsConditionMock).not.toHaveBeenCalled();
      expect(screen.getByText('Hypertension')).toBeInTheDocument();
      expect(
        screen.getByRole('combobox', { name: 'Diagnoses Certainty' }),
      ).not.toBeDisabled();
    });

    it('blocks conversion when condition authorization is revoked with a draft open', () => {
      const privileges = [
        { name: 'Add Diagnoses', uuid: 'add-diagnoses' },
        { name: 'Edit Conditions', uuid: 'edit-conditions' },
      ];
      mockedUseUserPrivilege.mockImplementation((required) =>
        hasPrivilege(privileges, required),
      );
      const { rerender } = renderComponent(mockDiagnosisEntries);
      expect(screen.getByTestId('add-as-condition-link')).toHaveAttribute(
        'aria-disabled',
        'false',
      );
      privileges.pop();
      rerender(<ConditionsAndDiagnoses />);
      expect(screen.getByTestId('add-as-condition-link')).toHaveAttribute(
        'aria-disabled',
        'true',
      );
      fireEvent.click(screen.getByTestId('add-as-condition-link'));
      expect(markAsConditionMock).not.toHaveBeenCalled();
      expect(removeDiagnosisMock).not.toHaveBeenCalled();
    });

    it('renders null when user lacks Add Diagnoses privilege', () => {
      mockedUseUserPrivilege.mockReturnValue(mockUserPrivilegesEmpty);
      const { container } = renderComponent();
      expect(container).toBeEmptyDOMElement();
    });

    it('renders form when user has Add Diagnoses privilege', () => {
      renderComponent();
      expect(
        screen.getByTestId('conditions-and-diagnoses-tile'),
      ).toBeInTheDocument();
    });
  });

  describe('Independent history failures', () => {
    test('does not offer concepts when diagnosis history fails independently', async () => {
      const user = userEvent.setup();
      renderComponent(
        [],
        [],
        mockConcepts,
        false,
        null,
        [],
        false,
        null,
        new Error('Diagnosis history unavailable'),
      );
      await user.type(
        screen.getByPlaceholderText('Search to add new Diagnosis'),
        'hyper',
      );
      expect(
        screen.getByText(
          'An unexpected error occurred. Please try again later.',
        ),
      ).toBeInTheDocument();
      expect(
        screen.queryByRole('option', { name: 'Hypertension' }),
      ).not.toBeInTheDocument();
      expect(addDiagnosisMock).not.toHaveBeenCalled();
    });

    test('keeps a retained diagnosis editable but prevents conversion on a condition read error', () => {
      renderComponent(
        mockDiagnosisEntries,
        [],
        [],
        false,
        null,
        [],
        false,
        new Error('Conditions unavailable'),
      );
      expect(screen.getByText('Hypertension')).toBeInTheDocument();
      expect(screen.getByTestId('add-as-condition-link')).toHaveAttribute(
        'aria-disabled',
        'true',
      );
      fireEvent.click(screen.getByTestId('add-as-condition-link'));
      expect(markAsConditionMock).not.toHaveBeenCalled();
      fireEvent.click(screen.getByRole('button', { name: 'Close' }));
      expect(removeDiagnosisMock).toHaveBeenCalledWith('uuid-1');
    });
  });
});
