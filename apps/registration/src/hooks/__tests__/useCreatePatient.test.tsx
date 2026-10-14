import {
  createPatient,
  generateIdentifier,
  dispatchAuditEvent,
} from '@bahmni/services';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { useCreatePatient } from '../useCreatePatient';

const mockNotify = jest.fn();
const mockNavigate = jest.fn();
jest.mock('@bahmni/services', () => ({
  ...jest.requireActual('@bahmni/services'),
  createPatient: jest.fn(),
  generateIdentifier: jest.fn(),
  dispatchAuditEvent: jest.fn(),
}));
jest.mock('@bahmni/widgets', () => ({
  useNotification: () => ({ addNotification: mockNotify }),
}));
jest.mock('react-router-dom', () => ({ useNavigate: () => mockNavigate }));
jest.mock('../usePersonAttributes', () => ({
  usePersonAttributes: () => ({
    personAttributes: [
      { uuid: 'phone', name: 'phoneNumber', format: 'java.lang.String' },
    ],
  }),
}));

const form = {
  profile: {
    patientIdFormat: 'ABC',
    entryType: true,
    firstName: 'QorliaQA',
    middleName: '',
    lastName: 'Synthetic',
    gender: 'Male',
    ageYears: '30',
    ageMonths: '0',
    ageDays: '0',
    dateOfBirth: '1996-10-01',
    birthTime: '',
    dobEstimated: true,
    patientIdentifier: {
      identifierType: 'type',
      identifierSourceUuid: 'source',
      preferred: true,
    },
  },
  address: {},
  contact: { phoneNumber: '0000000000' },
  additional: {},
  additionalIdentifiers: {},
  relationships: [],
};
const response = {
  patient: {
    uuid: 'patient',
    person: { names: [{ display: 'QorliaQA Synthetic' }] },
  },
};
const wrapper = ({ children }: { children: React.ReactNode }) => (
  <QueryClientProvider
    client={
      new QueryClient({ defaultOptions: { mutations: { retry: false } } })
    }
  >
    {children}
  </QueryClientProvider>
);

beforeEach(() => {
  jest.clearAllMocks();
  (generateIdentifier as jest.Mock).mockResolvedValue({
    identifier: 'ABC200011',
  });
  (createPatient as jest.Mock).mockResolvedValue(response);
});

it('saves full estimated DOB and contact attributes with the generated alphanumeric ID', async () => {
  const { result } = renderHook(useCreatePatient, { wrapper });
  await result.current.mutateAsync(form);
  expect(generateIdentifier).toHaveBeenCalledWith('source');
  expect(createPatient).toHaveBeenCalledWith(
    expect.objectContaining({
      patient: expect.objectContaining({
        person: expect.objectContaining({
          birthdate: '1996-10-01',
          birthdateEstimated: true,
          attributes: [
            { attributeType: { uuid: 'phone' }, value: '0000000000' },
          ],
        }),
        identifiers: [expect.objectContaining({ identifier: 'ABC200011' })],
      }),
      relationships: [],
    }),
  );
  expect(mockNotify).toHaveBeenCalledWith(
    expect.objectContaining({ type: 'success' }),
  );
  expect(dispatchAuditEvent).toHaveBeenCalledWith(
    expect.objectContaining({ patientUuid: 'patient' }),
  );
});

it('saves relationships in the same patient request rather than a second write', async () => {
  const { result } = renderHook(useCreatePatient, { wrapper });
  await result.current.mutateAsync({
    ...form,
    relationships: [
      {
        id: 'new',
        relationshipType: 'sibling',
        patientId: 'ABC200010',
        patientUuid: 'relative',
        tillDate: '',
      },
    ],
  });
  expect(createPatient).toHaveBeenCalledTimes(1);
  expect((createPatient as jest.Mock).mock.calls[0][0].relationships).toEqual([
    {
      relationshipType: { uuid: 'sibling' },
      personB: { uuid: 'relative' },
      endDate: null,
      voided: false,
    },
  ]);
});

it('rejects missing ID configuration before generating or saving anything', async () => {
  const { result } = renderHook(useCreatePatient, { wrapper });
  await expect(
    result.current.mutateAsync({
      ...form,
      profile: {
        ...form.profile,
        patientIdentifier: { identifierType: '', preferred: true },
      },
    }),
  ).rejects.toThrow('Patient ID configuration');
  expect(generateIdentifier).not.toHaveBeenCalled();
  expect(createPatient).not.toHaveBeenCalled();
});

it('uses a supplied ID without generating another ID', async () => {
  const { result } = renderHook(useCreatePatient, { wrapper });
  await result.current.mutateAsync({
    ...form,
    profile: {
      ...form.profile,
      patientIdentifier: {
        identifierType: 'type',
        identifier: 'ABC200012',
        preferred: true,
      },
    },
  });
  expect(generateIdentifier).not.toHaveBeenCalled();
});

it('keeps save failures visible and does not report success', async () => {
  (createPatient as jest.Mock).mockRejectedValue(
    new Error('Server unavailable'),
  );
  const { result } = renderHook(useCreatePatient, { wrapper });
  await expect(result.current.mutateAsync(form)).rejects.toThrow(
    'Server unavailable',
  );
  await waitFor(() =>
    expect(mockNotify).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'error', message: 'Server unavailable' }),
    ),
  );
  expect(dispatchAuditEvent).not.toHaveBeenCalled();
});
