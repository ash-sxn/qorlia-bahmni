import type { Bundle, Condition } from 'fhir/r4';
import { get } from '../api';
import {
  getAllFHIRSearchPages,
  getCompatiblePatientBundle,
} from '../fhirSearchCompatibility';

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

beforeEach(() => jest.resetAllMocks());

it.each([
  undefined,
  {},
  '<html>Sign in</html>',
  { error: { message: 'Not authenticated' } },
  { resourceType: 'OperationOutcome' },
  { resourceType: 'Bundle', entry: {} },
  { resourceType: 'Bundle', entry: [null] },
  { resourceType: 'Bundle', link: {} },
  { resourceType: 'Bundle', total: -1 },
])(
  'rejects malformed search data rather than treating it as no visits: %p',
  async (response) => {
    (get as jest.Mock).mockResolvedValue(response);
    await expect(getAllFHIRSearchPages(base)).rejects.toThrow(
      'Invalid FHIR search response',
    );
  },
);

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

it('follows a HAPI search cursor at the FHIR root through the local API', async () => {
  const nextPath =
    '/openmrs/ws/fhir2/R4?_getpages=search-token&_getpagesoffset=1&_count=1&_bundletype=searchset';
  (get as jest.Mock)
    .mockResolvedValueOnce({
      resourceType: 'Bundle',
      total: 2,
      entry: [{ resource: diagnosis }],
      link: [{ relation: 'next', url: `https://upstream.invalid${nextPath}` }],
    })
    .mockResolvedValueOnce({
      resourceType: 'Bundle',
      entry: [{ resource: problem }],
    });

  const result = await getCompatiblePatientBundle<Condition>(
    base,
    base,
    () => true,
    true,
  );

  expect(result.bundle.entry).toEqual([
    { resource: diagnosis },
    { resource: problem },
  ]);
  expect(get).toHaveBeenNthCalledWith(2, nextPath);
});

it.each([
  ['different resource', `${base.replace('/Condition?', '/Patient?')}`],
  ['cyclic', base],
  [
    'FHIR root without a search cursor',
    '/openmrs/ws/fhir2/R4?_getpagesoffset=1',
  ],
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

it('rejects a repeated HAPI cursor page', async () => {
  const cursor =
    '/openmrs/ws/fhir2/R4?_getpages=search-token&_getpagesoffset=1';
  (get as jest.Mock)
    .mockResolvedValueOnce({
      resourceType: 'Bundle',
      link: [{ relation: 'next', url: cursor }],
    })
    .mockResolvedValueOnce({
      resourceType: 'Bundle',
      link: [{ relation: 'next', url: cursor }],
    });

  await expect(
    getCompatiblePatientBundle<Condition>(base, base, () => true, true),
  ).rejects.toThrow('Invalid FHIR pagination link');
  expect(get).toHaveBeenCalledTimes(2);
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
