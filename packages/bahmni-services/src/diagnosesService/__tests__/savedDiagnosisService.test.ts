import { del, get, post } from '../../api';
import { SavedDiagnosis } from '../models';
import {
  getSavedDiagnosis,
  removeSavedDiagnosis,
  updateSavedDiagnosis,
} from '../savedDiagnosisService';

jest.mock('../../api');

const record = (changes: Partial<SavedDiagnosis> = {}): SavedDiagnosis => ({
  uuid: 'diagnosis-1',
  diagnosis: { coded: { uuid: 'concept-1' }, nonCoded: null },
  patient: { uuid: 'patient-1' },
  encounter: {
    uuid: 'encounter-1',
    patient: { uuid: 'patient-1' },
    voided: false,
  },
  condition: { uuid: 'condition-1' },
  certainty: 'CONFIRMED',
  rank: 2,
  voided: false,
  display: 'Hypertension',
  auditInfo: { dateCreated: '2026-10-05T05:00:00Z', dateChanged: null },
  formFieldNamespace: 'form2',
  formFieldPath: 'form.1/field.2',
  ...changes,
});

beforeEach(() => jest.resetAllMocks());

test('reads native rank and associations without using the lossy FHIR translator', async () => {
  (get as jest.Mock).mockResolvedValue(record());
  expect(await getSavedDiagnosis('patient-1', 'diagnosis-1')).toEqual(record());
  expect(get).toHaveBeenCalledWith(
    '/openmrs/ws/rest/v1/patientdiagnoses/diagnosis-1?v=full',
    { headers: { 'Cache-Control': 'no-cache' } },
  );
});

test.each([
  { uuid: 'other' },
  { patient: { uuid: 'other' } },
  { encounter: { uuid: 'encounter-1', patient: { uuid: 'other' } } },
  { rank: 0 },
  { auditInfo: { dateCreated: 'not-a-date' } },
  { diagnosis: {} },
  { certainty: 'unknown' },
])('rejects incomplete or wrong-patient native reads: %j', async (changes) => {
  (get as jest.Mock).mockResolvedValue(
    record(changes as Partial<SavedDiagnosis>),
  );
  await expect(getSavedDiagnosis('patient-1', 'diagnosis-1')).rejects.toThrow(
    'Incomplete or mismatched',
  );
});

test.each(['', '../encounter', 'diagnosis-1?purge=true'])(
  'rejects invalid record paths: %s',
  async (uuid) => {
    await expect(getSavedDiagnosis('patient-1', uuid)).rejects.toThrow();
    expect(get).not.toHaveBeenCalled();
  },
);

test('changes certainty/order only, preserving coded/noncoded values, condition, encounter and form fields', async () => {
  const original = record({
    diagnosis: {
      coded: { uuid: 'concept-1' },
      nonCoded: 'Original additional text',
    },
  });
  (get as jest.Mock).mockResolvedValue(original);
  const saved = record({ ...original, certainty: 'PROVISIONAL', rank: 1 });
  (post as jest.Mock).mockResolvedValue(saved);
  expect(
    await updateSavedDiagnosis('patient-1', original, {
      certainty: 'PROVISIONAL',
      rank: 1,
    }),
  ).toEqual(saved);
  expect(post).toHaveBeenCalledTimes(1);
  expect(post).toHaveBeenCalledWith(
    '/openmrs/ws/rest/v1/patientdiagnoses/diagnosis-1?v=full',
    {
      diagnosis: { coded: 'concept-1', nonCoded: 'Original additional text' },
      condition: 'condition-1',
      encounter: 'encounter-1',
      certainty: 'PROVISIONAL',
      rank: 1,
      voided: false,
      formFieldNamespace: 'form2',
      formFieldPath: 'form.1/field.2',
    },
  );
});

test('supports existing noncoded native records without inventing a concept', async () => {
  const original = record({
    diagnosis: { nonCoded: 'Original diagnosis' },
    condition: null,
  });
  (get as jest.Mock).mockResolvedValue(original);
  (post as jest.Mock).mockResolvedValue(record({ ...original, rank: 1 }));
  await updateSavedDiagnosis('patient-1', original, {
    certainty: 'CONFIRMED',
    rank: 1,
  });
  expect((post as jest.Mock).mock.calls[0][1].diagnosis).toEqual({
    nonCoded: 'Original diagnosis',
  });
});

test.each([
  { certainty: 'PROVISIONAL' },
  { rank: 1 },
  { voided: true },
  { diagnosis: { coded: { uuid: 'other' } } },
  { condition: null },
  { encounter: { uuid: 'other' } },
  { formFieldPath: 'other' },
  {
    auditInfo: {
      dateCreated: '2026-10-05T05:00:00Z',
      dateChanged: '2026-10-05T05:01:00Z',
    },
  },
])(
  'prevents update/removal of an observed stale record: %j',
  async (changes) => {
    (get as jest.Mock).mockResolvedValue(
      record(changes as Partial<SavedDiagnosis>),
    );
    await expect(
      updateSavedDiagnosis('patient-1', record(), {
        certainty: 'CONFIRMED',
        rank: 2,
      }),
    ).rejects.toThrow('changed');
    await expect(
      removeSavedDiagnosis('patient-1', record(), 'Correction'),
    ).rejects.toThrow('changed');
    expect(post).not.toHaveBeenCalled();
    expect(del).not.toHaveBeenCalled();
  },
);

test('does not revive a removed diagnosis or encounter', async () => {
  for (const original of [
    record({ voided: true }),
    record({ encounter: { uuid: 'encounter-1', voided: true } }),
  ]) {
    await expect(
      updateSavedDiagnosis('patient-1', original, {
        certainty: 'CONFIRMED',
        rank: 2,
      }),
    ).rejects.toThrow('removed');
  }
  expect(get).not.toHaveBeenCalled();
  expect(post).not.toHaveBeenCalled();
});

test('propagates permission denial without a fallback or retry', async () => {
  (get as jest.Mock).mockResolvedValue(record());
  (post as jest.Mock).mockRejectedValue(new Error('403 Edit Diagnoses'));
  await expect(
    updateSavedDiagnosis('patient-1', record(), {
      certainty: 'CONFIRMED',
      rank: 2,
    }),
  ).rejects.toThrow('403');
  expect(post).toHaveBeenCalledTimes(1);
  expect(del).not.toHaveBeenCalled();
});

test('does not retry an incomplete save acknowledgement', async () => {
  (get as jest.Mock).mockResolvedValue(record());
  (post as jest.Mock).mockResolvedValue(record({ rank: 1 }));
  await expect(
    updateSavedDiagnosis('patient-1', record(), {
      certainty: 'CONFIRMED',
      rank: 2,
    }),
  ).rejects.toThrow('could not be confirmed');
  expect(post).toHaveBeenCalledTimes(1);
});

test('voids the specific diagnosis with a reason, without purge or encounter deletion', async () => {
  (get as jest.Mock).mockResolvedValue(record());
  await removeSavedDiagnosis('patient-1', record(), '  Entered in error  ');
  expect(del).toHaveBeenCalledWith(
    '/openmrs/ws/rest/v1/patientdiagnoses/diagnosis-1',
    { params: { reason: 'Entered in error' } },
  );
  expect(del).toHaveBeenCalledTimes(1);
  expect(post).not.toHaveBeenCalled();
});

test.each(['', ' ', 'x'.repeat(256)])(
  'requires a bounded removal reason',
  async (reason) => {
    await expect(
      removeSavedDiagnosis('patient-1', record(), reason),
    ).rejects.toThrow('removal reason');
    expect(get).not.toHaveBeenCalled();
    expect(del).not.toHaveBeenCalled();
  },
);

test.each([
  { certainty: 'unknown', rank: 1 },
  { certainty: 'CONFIRMED', rank: 0 },
])('rejects invalid changes before any request', async (changes) => {
  await expect(
    updateSavedDiagnosis('patient-1', record(), changes as never),
  ).rejects.toThrow('valid diagnosis');
  expect(get).not.toHaveBeenCalled();
  expect(post).not.toHaveBeenCalled();
});
