import type { Bundle, Condition } from 'fhir/r4';
import { get } from '../api';
import { getCompatiblePatientBundle } from '../fhirSearchCompatibility';

jest.mock('../api');

const invalidSearch = new Error(
  'Invalid input parameters. Please check your request and try again.',
);
const base = '/openmrs/ws/fhir2/R4/Condition?patient=patient-1&_count=100';
const problem: Condition = {
  resourceType: 'Condition',
  id: 'problem-1',
  subject: { reference: 'Patient/patient-1' },
  category: [{ coding: [{ code: 'problem-list-item' }] }],
  code: {},
};
const diagnosis: Condition = {
  ...problem,
  id: 'diagnosis-1',
  category: [{ coding: [{ code: 'encounter-diagnosis' }] }],
};

beforeEach(() => jest.clearAllMocks());

it('uses patient-only search, follows pages, and filters unsupported categories', async () => {
  (get as jest.Mock)
    .mockRejectedValueOnce(invalidSearch)
    .mockResolvedValueOnce({
      resourceType: 'Bundle',
      type: 'searchset',
      total: 2,
      entry: [{ resource: problem }],
      link: [
        {
          relation: 'next',
          url: 'https://demo.example/openmrs/ws/fhir2/R4/Condition?patient=patient-1&_count=100&_getpagesoffset=1',
        },
      ],
    } as Bundle<Condition>)
    .mockResolvedValueOnce({
      resourceType: 'Bundle',
      type: 'searchset',
      entry: [{ resource: diagnosis }],
    } as Bundle<Condition>);

  const result = await getCompatiblePatientBundle<Condition>(
    `${base}&category=problem-list-item`,
    base,
    (condition) =>
      condition.category?.[0]?.coding?.[0]?.code === 'problem-list-item',
  );

  expect(result.usedFallback).toBe(true);
  expect(result.bundle.total).toBe(1);
  expect(result.bundle.entry?.[0]?.resource?.id).toBe('problem-1');
  expect(get).toHaveBeenLastCalledWith(
    '/openmrs/ws/fhir2/R4/Condition?patient=patient-1&_count=100&_getpagesoffset=1',
  );
});

it('does not turn an incomplete patient history into an empty result', async () => {
  (get as jest.Mock)
    .mockRejectedValueOnce(invalidSearch)
    .mockResolvedValueOnce({
      resourceType: 'Bundle',
      type: 'searchset',
      total: 2,
      entry: [{ resource: problem }],
    } as Bundle<Condition>);

  await expect(
    getCompatiblePatientBundle<Condition>(base, base, () => true),
  ).rejects.toThrow('incomplete result');
});

it('preserves real server errors', async () => {
  (get as jest.Mock).mockRejectedValueOnce(new Error('Server Error'));
  await expect(
    getCompatiblePatientBundle<Condition>(base, base, () => true),
  ).rejects.toThrow('Server Error');
  expect(get).toHaveBeenCalledTimes(1);
});

it('collects all preferred pages only when requested', async () => {
  (get as jest.Mock)
    .mockResolvedValueOnce({
      resourceType: 'Bundle',
      total: 2,
      entry: [{ resource: diagnosis }],
      link: [{ relation: 'next', url: `${base}&_getpagesoffset=1` }],
    })
    .mockResolvedValueOnce({
      resourceType: 'Bundle',
      entry: [{ resource: problem }],
    });
  const result = await getCompatiblePatientBundle<Condition>(
    base,
    base,
    (resource) => resource.id === diagnosis.id,
    true,
  );
  expect(result.usedFallback).toBe(false);
  expect(result.bundle.entry).toEqual([{ resource: diagnosis }]);
  expect(result.bundle.total).toBe(1);
  expect(result.bundle.link).toBeUndefined();
  expect(get).toHaveBeenCalledTimes(2);
});

it.each([
  ['different resource', `${base.replace('/Condition?', '/Patient?')}`],
  ['cyclic', base],
])('rejects a %s preferred pagination link', async (_, nextUrl) => {
  (get as jest.Mock).mockResolvedValueOnce({
    resourceType: 'Bundle',
    link: [{ relation: 'next', url: nextUrl }],
  });
  await expect(
    getCompatiblePatientBundle<Condition>(base, base, () => true, true),
  ).rejects.toThrow('Invalid FHIR pagination link');
  expect(get).toHaveBeenCalledTimes(1);
});

it('rejects incomplete preferred results rather than approving unknown duplicates', async () => {
  (get as jest.Mock).mockResolvedValueOnce({
    resourceType: 'Bundle',
    total: 2,
    entry: [{ resource: diagnosis }],
  });
  await expect(
    getCompatiblePatientBundle<Condition>(base, base, () => true, true),
  ).rejects.toThrow('incomplete result');
});
