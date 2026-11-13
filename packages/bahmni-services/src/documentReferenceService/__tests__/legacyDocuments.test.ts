import { get, post } from '../../api';
import { getUserLoginLocation } from '../../userService';
import {
  getLegacyDocumentBundle,
  saveLegacyDocuments,
  usesLegacyDocuments,
} from '../legacyDocuments';

jest.mock('../../api');
jest.mock('../../userService');
const read = jest.mocked(get);
const write = jest.mocked(post);
const target = {
  createEncounterInVisit: { visitUuid: 'visit', encounterTypeUuid: 'doc-type' },
};
const input = {
  patientUuid: 'patient',
  target,
  documents: [
    {
      url: '100/file__scan.pdf',
      typeCode: 'type',
      authorPractitionerUuid: 'provider',
      description: 'Note',
    },
  ],
};
const visit = {
  uuid: 'visit',
  patient: { uuid: 'patient' },
  visitType: { uuid: 'opd' },
  startDatetime: '2026-09-01T08:00:00+0530',
  stopDatetime: '2026-09-01T09:00:00+0530',
};
const encounter = (uuid: string) => ({
  uuid,
  provider: { display: 'Clinician' },
  obs: [
    {
      uuid: 'group',
      concept: { uuid: 'type', name: { name: 'Prescription' } },
      groupMembers: [
        {
          uuid: `${uuid}-file`,
          obsDatetime: '2026-09-01T08:00:00+0530',
          value: '100/file__scan.pdf',
          comment: 'Note',
        },
        { uuid: 'voided', voided: true, value: '100/hidden.pdf' },
        { uuid: 'unsafe', value: '100/%252e%252e/hidden.pdf' },
        { uuid: 'diagnosis', value: 'Normal' },
      ],
    },
  ],
});

beforeEach(() => {
  jest.resetAllMocks();
  jest
    .mocked(getUserLoginLocation)
    .mockReturnValue({ uuid: 'location' } as ReturnType<
      typeof getUserLoginLocation
    >);
});

it('selects the legacy API only from a valid server capability statement', async () => {
  read
    .mockResolvedValueOnce({
      rest: [{ mode: 'server', resource: [{ type: 'Encounter' }] }],
    })
    .mockResolvedValueOnce({
      rest: [{ mode: 'server', resource: [{ type: 'DocumentReference' }] }],
    })
    .mockResolvedValueOnce({});
  expect(await usesLegacyDocuments()).toBe(true);
  expect(await usesLegacyDocuments()).toBe(false);
  await expect(usesLegacyDocuments()).rejects.toThrow(
    'determine document support',
  );
});

it('maps only valid, active file observations and keeps encounter filters and totals', async () => {
  read.mockResolvedValueOnce({
    results: [encounter('included'), encounter('other')],
  });
  const result = await getLegacyDocumentBundle('patient', ['included'], 1, 0);
  expect(result.total).toBe(1);
  expect(result.entry?.[0].resource).toMatchObject({
    id: 'included-file',
    masterIdentifier: { value: 'scan.pdf' },
    description: 'Note',
    context: { encounter: [{ reference: 'Encounter/included' }] },
    content: [
      {
        attachment: {
          url: '100/file__scan.pdf',
          contentType: 'application/pdf',
        },
      },
    ],
  });
  expect(read).toHaveBeenCalledWith(
    '/openmrs/ws/rest/v1/encounter',
    expect.objectContaining({
      params: expect.objectContaining({
        patient: 'patient',
        startIndex: 0,
        limit: 100,
      }),
    }),
  );
});

it('walks every legacy encounter page before taking a document page', async () => {
  read
    .mockResolvedValueOnce({
      results: Array.from({ length: 100 }, (_, i) => encounter(`enc-${i}`)),
    })
    .mockResolvedValueOnce({ results: [encounter('last')] });
  const result = await getLegacyDocumentBundle('patient', undefined, 1, 100);
  expect(result.total).toBe(101);
  expect(result.entry?.[0].resource?.id).toBe('last-file');
  expect(read).toHaveBeenLastCalledWith(
    '/openmrs/ws/rest/v1/encounter',
    expect.objectContaining({
      params: expect.objectContaining({ startIndex: 100 }),
    }),
  );
});

it('saves into the selected patient visit using the official legacy document contract', async () => {
  read.mockResolvedValueOnce(visit);
  write.mockResolvedValueOnce({
    visitUuid: 'visit',
    encounterUuid: 'document-encounter',
  });
  await saveLegacyDocuments(input);
  expect(write).toHaveBeenCalledTimes(1);
  expect(write).toHaveBeenCalledWith(
    '/openmrs/ws/rest/v1/bahmnicore/visitDocument',
    {
      patientUuid: 'patient',
      visitUuid: 'visit',
      visitTypeUuid: 'opd',
      visitStartDate: visit.startDatetime,
      visitEndDate: visit.stopDatetime,
      encounterTypeUuid: 'doc-type',
      encounterDateTime: visit.startDatetime,
      providerUuid: 'provider',
      locationUuid: 'location',
      documents: [
        {
          testUuid: 'type',
          image: '100/file__scan.pdf',
          comment: 'Note',
          obsDateTime: visit.startDatetime,
        },
      ],
    },
  );
});

it('maps video observations supported by the legacy uploader', async () => {
  const videoEncounter = encounter('video');
  videoEncounter.obs[0].groupMembers[0].value = '100/file__scan.mp4';
  read.mockResolvedValueOnce({ results: [videoEncounter] });
  const result = await getLegacyDocumentBundle('patient', ['video'], 10, 0);
  expect(result.entry?.[0].resource?.content[0].attachment.contentType).toBe(
    'video/mp4',
  );
});

it('does not report a save as successful without an encounter acknowledgment', async () => {
  read.mockResolvedValueOnce(visit);
  write.mockResolvedValueOnce({ visitUuid: 'visit' });
  await expect(saveLegacyDocuments(input)).rejects.toThrow('did not confirm');
  expect(write).toHaveBeenCalledTimes(1);
});

it('rejects mismatched visit IDs and invalid visit dates before writing', async () => {
  read.mockResolvedValueOnce({ ...visit, uuid: 'other' });
  await expect(saveLegacyDocuments(input)).rejects.toThrow('selected patient');
  read.mockResolvedValueOnce({ ...visit, stopDatetime: '2026-08-01' });
  await expect(saveLegacyDocuments(input)).rejects.toThrow('invalid dates');
  expect(write).not.toHaveBeenCalled();
});

it('blocks an unsafe file path or a visit for another patient without writing', async () => {
  await expect(
    saveLegacyDocuments({
      ...input,
      documents: [{ ...input.documents[0], url: '../secret.pdf' }],
    }),
  ).rejects.toThrow('Choose a document type');
  read.mockResolvedValueOnce({ ...visit, patient: { uuid: 'other' } });
  await expect(saveLegacyDocuments(input)).rejects.toThrow('selected patient');
  expect(write).not.toHaveBeenCalled();
});

it('does not attach to an existing encounter owned by a different provider', async () => {
  read.mockResolvedValueOnce({
    patient: { uuid: 'patient' },
    visit: { uuid: 'visit' },
    encounterType: { uuid: 'doc-type' },
    location: { uuid: 'location' },
    encounterProviders: [{ provider: { uuid: 'other' } }],
    voided: false,
  });
  await expect(
    saveLegacyDocuments({
      ...input,
      target: {
        encounterUuid: 'enc',
        existingEncounter: {
          resourceType: 'Encounter',
          status: 'finished',
          class: { code: 'AMB' },
          partOf: { reference: 'Encounter/visit' },
          type: [{ coding: [{ code: 'doc-type' }] }],
        },
      },
    }),
  ).rejects.toThrow('another provider');
  expect(write).not.toHaveBeenCalled();
});
