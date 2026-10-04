import {
  updatePatient,
  getPatientProfile,
  dispatchAuditEvent,
} from '@bahmni/services';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook } from '@testing-library/react';
import { useUpdatePatient } from '../useUpdatePatient';

const mockNotify = jest.fn();
jest.mock('@bahmni/services', () => ({
  ...jest.requireActual('@bahmni/services'),
  updatePatient: jest.fn(),
  getPatientProfile: jest.fn(),
  dispatchAuditEvent: jest.fn(),
}));
jest.mock('@bahmni/widgets', () => ({
  useNotification: () => ({ addNotification: mockNotify }),
}));
jest.mock('../usePersonAttributes', () => ({
  usePersonAttributes: () => ({
    personAttributes: [
      { uuid: 'phone', name: 'phoneNumber', format: 'java.lang.String' },
    ],
  }),
}));

const form = {
  patientUuid: 'patient',
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
    patientIdentifier: { identifierType: 'type', preferred: true },
  },
  address: {},
  contact: { phoneNumber: '0000000000' },
  additional: {},
  additionalIdentifiers: {},
  relationships: [],
};
const existing = {
  patient: {
    uuid: 'patient',
    identifiers: [
      {
        uuid: 'identifier',
        identifier: 'ABC200011',
        identifierType: { uuid: 'type' },
        preferred: true,
      },
    ],
    person: {
      names: [
        {
          uuid: 'name',
          givenName: 'QorliaQA',
          familyName: 'Synthetic',
          preferred: true,
        },
      ],
      attributes: [
        { uuid: 'saved-phone', attributeType: { uuid: 'phone' }, value: 'old' },
      ],
    },
  },
  relationships: [],
};
const client = new QueryClient({
  defaultOptions: { mutations: { retry: false } },
});
const wrapper = ({ children }: { children: React.ReactNode }) => (
  <QueryClientProvider client={client}>{children}</QueryClientProvider>
);
beforeEach(() => {
  jest.clearAllMocks();
  client.clear();
  (getPatientProfile as jest.Mock).mockResolvedValue(existing);
  (updatePatient as jest.Mock).mockResolvedValue(existing);
});

it('preserves the existing identifier and attribute UUID during update', async () => {
  const invalidate = jest.spyOn(client, 'invalidateQueries');
  const { result } = renderHook(useUpdatePatient, { wrapper });
  await result.current.mutateAsync(form);
  expect(getPatientProfile).toHaveBeenCalledWith('patient');
  expect(updatePatient).toHaveBeenCalledWith(
    'patient',
    expect.objectContaining({
      patient: {
        person: expect.objectContaining({
          birthdate: '1996-10-01',
          attributes: [
            {
              uuid: 'saved-phone',
              attributeType: { uuid: 'phone' },
              value: '0000000000',
            },
          ],
        }),
        identifiers: [
          expect.objectContaining({
            uuid: 'identifier',
            identifier: 'ABC200011',
          }),
        ],
      },
    }),
  );
  expect(invalidate).toHaveBeenCalledWith({
    queryKey: ['registrationPatientProfile', 'patient'],
  });
  expect(dispatchAuditEvent).toHaveBeenCalled();
});

it.each([true, false])(
  'does not write a voided or different patient (voided=%s)',
  async (voided) => {
    (getPatientProfile as jest.Mock).mockResolvedValue({
      ...existing,
      patient: {
        ...existing.patient,
        uuid: voided ? 'patient' : 'different',
        voided,
      },
    });
    const { result } = renderHook(useUpdatePatient, { wrapper });
    await expect(result.current.mutateAsync(form)).rejects.toThrow(
      'no longer available',
    );
    expect(updatePatient).not.toHaveBeenCalled();
  },
);

it('voids explicitly cleared attributes, rather than dropping them silently', async () => {
  const { result } = renderHook(useUpdatePatient, { wrapper });
  await result.current.mutateAsync({ ...form, contact: { phoneNumber: '' } });
  expect(
    (updatePatient as jest.Mock).mock.calls[0][1].patient.person.attributes,
  ).toEqual([
    { uuid: 'saved-phone', attributeType: { uuid: 'phone' }, voided: true },
  ]);
});

it('does not report success after an update failure', async () => {
  (updatePatient as jest.Mock).mockRejectedValue(new Error('Save failed'));
  const { result } = renderHook(useUpdatePatient, { wrapper });
  await expect(result.current.mutateAsync(form)).rejects.toThrow('Save failed');
  expect(mockNotify).toHaveBeenCalledWith(
    expect.objectContaining({ type: 'error', message: 'Save failed' }),
  );
  expect(dispatchAuditEvent).not.toHaveBeenCalled();
});
