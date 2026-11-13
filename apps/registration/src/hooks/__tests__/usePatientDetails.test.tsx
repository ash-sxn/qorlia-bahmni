import { getPatientProfile } from '@bahmni/services';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { usePatientDetails } from '../usePatientDetails';

const mockNotify = jest.fn();
const attributes = [
  { uuid: 'phone', name: 'phoneNumber', format: 'java.lang.String' },
];
jest.mock('@bahmni/services', () => ({
  ...jest.requireActual('@bahmni/services'),
  getPatientProfile: jest.fn(),
  formatDateTime: () => ({ formattedResult: '1 October 2026' }),
}));
jest.mock('@bahmni/widgets', () => ({
  useNotification: () => ({ addNotification: mockNotify }),
}));
jest.mock('../usePersonAttributes', () => ({
  usePersonAttributes: () => ({ personAttributes: attributes }),
}));
jest.mock('../../utils/identifierGenderUtils', () => ({
  useGenderData: () => ({
    getGenderDisplay: (code: string) => (code === 'M' ? 'Male' : code),
  }),
}));
const patient = {
  patient: {
    uuid: 'patient',
    identifiers: [
      {
        identifier: 'ABC200011',
        identifierType: { uuid: 'type' },
        preferred: true,
      },
      {
        identifier: 'OLD123',
        identifierType: { uuid: 'old-type' },
        preferred: false,
      },
    ],
    person: {
      uuid: 'patient',
      names: [
        {
          uuid: 'name',
          givenName: 'QorliaQA',
          middleName: 'OctOne',
          familyName: 'Synthetic',
          preferred: true,
        },
      ],
      gender: 'M',
      birthdate: '1996-10-01T00:00:00.000+0530',
      birthdateEstimated: true,
      auditInfo: { dateCreated: '2026-10-01T14:56:00+0530' },
      attributes: [
        {
          uuid: 'attr',
          attributeType: { uuid: 'phone', display: 'Phone number' },
          value: '0000000000',
        },
      ],
      addresses: [{ address1: 'Test address', preferred: true }],
    },
  },
  relationships: [],
};
const wrapper = ({ children }: { children: React.ReactNode }) => (
  <QueryClientProvider
    client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
  >
    {children}
  </QueryClientProvider>
);
beforeEach(() => {
  jest.clearAllMocks();
  (getPatientProfile as jest.Mock).mockResolvedValue(patient);
});

it('reads full estimated date precision, attribute names, identifiers and metadata', async () => {
  const { result } = renderHook(
    () => usePatientDetails({ patientUuid: 'patient' }),
    { wrapper },
  );
  await waitFor(() => expect(result.current.isLoading).toBe(false));
  expect(result.current.profileInitialData).toMatchObject({
    firstName: 'QorliaQA',
    gender: 'Male',
    dateOfBirth: '1996-10-01',
  });
  expect(result.current.initialDobEstimated).toBe(true);
  expect(result.current.personAttributesInitialData).toEqual({
    phoneNumber: '0000000000',
  });
  expect(result.current.addressInitialData).toMatchObject({
    address1: 'Test address',
  });
  expect(result.current.additionalIdentifiersInitialData).toEqual({
    'old-type': 'OLD123',
  });
  expect(result.current.metadata).toEqual({
    patientUuid: 'patient',
    patientIdentifier: 'ABC200011',
    patientName: 'QorliaQA OctOne Synthetic',
    registerDate: '1 October 2026',
  });
});

it('does not fetch without a patient UUID', () => {
  renderHook(() => usePatientDetails({ patientUuid: undefined }), { wrapper });
  expect(getPatientProfile).not.toHaveBeenCalled();
});

it('shows read failures instead of presenting an empty editable record', async () => {
  (getPatientProfile as jest.Mock).mockRejectedValue(new Error('Read failed'));
  renderHook(() => usePatientDetails({ patientUuid: 'patient' }), { wrapper });
  await waitFor(() =>
    expect(mockNotify).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'error', message: 'Read failed' }),
    ),
  );
});
