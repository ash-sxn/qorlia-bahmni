import { DocumentReference, Encounter } from 'fhir/r4';
import { get, post } from '../../api';
import { ENCOUNTER_BUNDLE_URL } from '../../encounterBundle';
import { getUserLoginLocation } from '../../userService';
import { saveDocuments } from '../documentWriteService';
import { usesLegacyDocuments } from '../legacyDocuments';
import { DocumentPayload } from '../models';

jest.mock('../../api');
jest.mock('../legacyDocuments', () => ({
  ...jest.requireActual('../legacyDocuments'),
  usesLegacyDocuments: jest.fn().mockResolvedValue(false),
}));
jest.mock('../../userService');

const mockedPost = post as jest.MockedFunction<typeof post>;
const mockedGetUserLoginLocation = getUserLoginLocation as jest.MockedFunction<
  typeof getUserLoginLocation
>;

const PATIENT_UUID = 'patient-uuid';

const EXISTING_ENCOUNTER: Encounter = {
  resourceType: 'Encounter',
  id: 'enc-uuid',
  status: 'finished',
  class: { code: 'AMB', display: 'ambulatory' },
  type: [{ coding: [{ code: 'enc-type-uuid', display: 'Patient Document' }] }],
  subject: { reference: `Patient/${PATIENT_UUID}` },
  partOf: { reference: 'Encounter/visit-uuid', type: 'Encounter' },
  location: [{ location: { reference: 'Location/location-uuid' } }],
  participant: [{ individual: { reference: 'Practitioner/prac-uuid' } }],
  period: { start: '2026-06-29T09:00:00Z' },
};

const existingEncounterTarget = {
  encounterUuid: 'enc-uuid',
  existingEncounter: EXISTING_ENCOUNTER,
};

const createEncounterInVisit = {
  visitUuid: 'visit-uuid',
  encounterTypeUuid: 'enc-type-uuid',
  encounterTypeDisplay: 'Patient Document',
};

// Fixed so the assertions can tell the visit's own date apart from "now".
const NOW = '2026-07-01T10:15:00.000Z';
const VISIT_START = '2026-06-29T09:00:00.000Z';

const firstDocument: DocumentPayload = {
  url: '100/doc-uuid__file.pdf',
  contentType: 'application/pdf',
  title: 'file.pdf',
  typeCode: 'type-uuid',
  typeDisplay: 'Prescription',
};

const secondDocument: DocumentPayload = {
  url: '100/doc-uuid__scan.png',
  contentType: 'image/png',
  title: 'scan.png',
};

interface TestBundle {
  resourceType: string;
  type: string;
  entry: Array<{
    fullUrl: string;
    resource: Record<string, unknown>;
    request: { method: string; url: string };
  }>;
}

const postedBundle = (): TestBundle =>
  mockedPost.mock.calls[0][1] as unknown as TestBundle;

const docAt = (index: number) =>
  postedBundle().entry[index].resource as unknown as DocumentReference;

const encounterPeriodStart = () =>
  (postedBundle().entry[0].resource as unknown as Encounter).period?.start;

const saveIntoVisit = (visitPeriod?: { start?: string; end?: string }) => {
  (get as jest.Mock).mockResolvedValueOnce({
    resourceType: 'Encounter',
    id: 'visit-uuid',
    subject: { reference: `Patient/${PATIENT_UUID}` },
    status: 'in-progress',
    period: visitPeriod,
  });
  return saveDocuments({
    patientUuid: PATIENT_UUID,
    target: {
      createEncounterInVisit: { ...createEncounterInVisit, visitPeriod },
    },
    documents: [firstDocument],
  });
};

describe('documentWriteService', () => {
  beforeAll(() => {
    jest.useFakeTimers().setSystemTime(new Date(NOW));
  });

  afterAll(() => {
    jest.useRealTimers();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockedPost.mockResolvedValue({});
    mockedGetUserLoginLocation.mockReturnValue({
      uuid: 'location-uuid',
    } as ReturnType<typeof getUserLoginLocation>);
    (get as jest.Mock).mockImplementation((url: string) =>
      Promise.resolve(
        url.includes('/Encounter/enc-uuid')
          ? EXISTING_ENCOUNTER
          : {
              resourceType: 'Encounter',
              id: 'visit-uuid',
              status: 'in-progress',
              subject: { reference: `Patient/${PATIENT_UUID}` },
              period: { start: VISIT_START },
            },
      ),
    );
  });

  it('selects the legacy API before writing and never retries a failed save through the FHIR API', async () => {
    (usesLegacyDocuments as jest.Mock).mockResolvedValueOnce(true);
    (get as jest.Mock).mockResolvedValueOnce({
      uuid: 'visit-uuid',
      patient: { uuid: PATIENT_UUID },
      visitType: { uuid: 'visit-type' },
      startDatetime: VISIT_START,
      stopDatetime: null,
    });
    mockedPost.mockRejectedValueOnce(new Error('Save response interrupted'));
    await expect(
      saveDocuments({
        patientUuid: PATIENT_UUID,
        target: { createEncounterInVisit },
        documents: [{ ...firstDocument, authorPractitionerUuid: 'prac-uuid' }],
      }),
    ).rejects.toThrow('Save response interrupted');
    expect(mockedPost).toHaveBeenCalledTimes(1);
    expect(mockedPost.mock.calls[0][0]).toBe(
      '/openmrs/ws/rest/v1/bahmnicore/visitDocument',
    );
  });

  describe('attaching to an existing encounter', () => {
    it('sends one bundle re-stating the encounter and linking each document to it', async () => {
      await saveDocuments({
        patientUuid: PATIENT_UUID,
        target: existingEncounterTarget,
        documents: [firstDocument],
      });

      expect(mockedPost).toHaveBeenCalledTimes(1);
      const [url] = mockedPost.mock.calls[0];
      const bundle = postedBundle();
      expect(url).toBe(ENCOUNTER_BUNDLE_URL);
      expect(bundle.resourceType).toBe('EncounterBundle');
      expect(bundle.type).toBe('transaction');
      expect(bundle.entry).toHaveLength(2);

      // The endpoint requires exactly one Encounter entry, and resolves a document's encounter
      // reference by matching it against a bundle entry's fullUrl — hence the concrete reference
      // on both, and the PUT.
      const [encounterEntry, docEntry] = bundle.entry;
      expect(encounterEntry.fullUrl).toBe('Encounter/enc-uuid');
      expect(encounterEntry.request).toEqual({
        method: 'PUT',
        url: 'Encounter/enc-uuid',
      });
      expect(docEntry.request).toEqual({
        method: 'POST',
        url: 'DocumentReference',
      });
      expect(docAt(1).subject?.reference).toBe(`Patient/${PATIENT_UUID}`);
      expect(docAt(1).context?.encounter?.[0].reference).toBe(
        'Encounter/enc-uuid',
      );
      expect(docAt(1).content?.[0].attachment.url).toBe(firstDocument.url);
      expect(docAt(1).type?.coding?.[0].code).toBe('type-uuid');
    });

    it('re-sends the encounter unchanged apart from a bare-uuid id', async () => {
      await saveDocuments({
        patientUuid: PATIENT_UUID,
        target: {
          encounterUuid: 'enc-uuid',
          existingEncounter: {
            ...EXISTING_ENCOUNTER,
            id: 'Encounter/enc-uuid',
          },
        },
        documents: [firstDocument],
      });

      // Sent whole because the OpenMRS encounter update writes subject, type, partOf, location,
      // participant and period from the payload without null-guards.
      expect(postedBundle().entry[0].resource).toEqual(EXISTING_ENCOUNTER);
    });

    it('sends a batch as one transaction with a distinct placeholder per document', async () => {
      await saveDocuments({
        patientUuid: PATIENT_UUID,
        target: existingEncounterTarget,
        documents: [firstDocument, secondDocument],
      });

      expect(mockedPost).toHaveBeenCalledTimes(1);
      const bundle = postedBundle();
      expect(bundle.entry).toHaveLength(3);
      const documentEntries = bundle.entry.slice(1);
      expect(
        documentEntries.map(
          (entry) =>
            (entry.resource as unknown as DocumentReference).content?.[0]
              .attachment.title,
        ),
      ).toEqual(['file.pdf', 'scan.png']);
      expect(new Set(documentEntries.map((e) => e.fullUrl)).size).toBe(2);
    });

    it('carries the note as description and the author when provided', async () => {
      await saveDocuments({
        patientUuid: PATIENT_UUID,
        target: existingEncounterTarget,
        documents: [
          {
            ...firstDocument,
            description: 'follow up',
            authorPractitionerUuid: 'prac-uuid',
          },
        ],
      });

      expect(docAt(1).description).toBe('follow up');
      expect(docAt(1).author?.[0].reference).toBe('Practitioner/prac-uuid');
    });

    it('omits type, description and author when they are not provided', async () => {
      await saveDocuments({
        patientUuid: PATIENT_UUID,
        target: existingEncounterTarget,
        documents: [{ url: '100/doc.pdf', contentType: 'application/pdf' }],
      });

      expect(docAt(1).type).toBeUndefined();
      expect(docAt(1).description).toBeUndefined();
      expect(docAt(1).author).toBeUndefined();
    });
  });

  describe('creating an encounter in the visit', () => {
    it('creates one encounter for the batch and links every document to it', async () => {
      await saveDocuments({
        patientUuid: PATIENT_UUID,
        target: { createEncounterInVisit },
        documents: [
          { ...firstDocument, authorPractitionerUuid: 'prac-uuid' },
          secondDocument,
        ],
      });

      expect(mockedPost).toHaveBeenCalledTimes(1);
      const [url] = mockedPost.mock.calls[0];
      const bundle = postedBundle();
      expect(url).toBe(ENCOUNTER_BUNDLE_URL);
      expect(bundle.entry).toHaveLength(3);

      const [encounterEntry, ...documentEntries] = bundle.entry;
      const encounter = encounterEntry.resource as unknown as {
        resourceType: string;
        partOf: { reference: string };
        location: Array<{ location: { reference: string } }>;
        participant: Array<{ individual: { reference: string } }>;
      };
      expect(encounter.resourceType).toBe('Encounter');
      expect(encounterEntry.request.method).toBe('POST');
      expect(encounter.partOf.reference).toBe('Encounter/visit-uuid');
      expect(encounter.location[0].location.reference).toBe(
        'Location/location-uuid',
      );
      expect(encounter.participant[0].individual.reference).toBe(
        'Practitioner/prac-uuid',
      );

      // Documents point at the bundle-local placeholder so the transaction wires them to the
      // encounter it is creating.
      expect(
        documentEntries.map(
          (entry) =>
            (entry.resource as unknown as DocumentReference).context
              ?.encounter?.[0].reference,
        ),
      ).toEqual([encounterEntry.fullUrl, encounterEntry.fullUrl]);
    });

    it('creates the encounter without a participant when no author is given', async () => {
      await saveDocuments({
        patientUuid: PATIENT_UUID,
        target: { createEncounterInVisit },
        documents: [firstDocument],
      });

      expect(postedBundle().entry[0].resource.participant).toBeUndefined();
    });

    // OpenMRS reads period.start as the encounter's clinical datetime and rejects one dated
    // outside the visit in partOf, so a closed visit cannot be given the current time.
    describe('dating the encounter against the visit period', () => {
      it('uses the visit start when the visit has already closed', async () => {
        await saveIntoVisit({
          start: VISIT_START,
          end: '2026-06-29T17:30:00.000Z',
        });

        expect(encounterPeriodStart()).toBe(VISIT_START);
      });

      it('uses the visit start when the current time precedes the visit', async () => {
        await saveIntoVisit({ start: '2026-07-05T09:00:00.000Z' });

        expect(encounterPeriodStart()).toBe('2026-07-05T09:00:00.000Z');
      });

      it('keeps the current time for a visit still in progress', async () => {
        await saveIntoVisit({
          start: VISIT_START,
          end: '2026-07-02T09:00:00.000Z',
        });

        expect(encounterPeriodStart()).toBe(NOW);
      });

      it('keeps the current time for an open visit with no end', async () => {
        await saveIntoVisit({ start: VISIT_START });

        expect(encounterPeriodStart()).toBe(NOW);
      });

      it('treats both visit boundaries as inclusive', async () => {
        await saveIntoVisit({ start: NOW, end: NOW });

        expect(encounterPeriodStart()).toBe(NOW);
      });

      it('rejects a visit with no date instead of guessing the clinical datetime', async () => {
        await expect(saveIntoVisit(undefined)).rejects.toThrow('invalid dates');
        expect(mockedPost).not.toHaveBeenCalled();
      });

      it('rejects an unparseable visit start', async () => {
        await expect(saveIntoVisit({ start: 'not-a-date' })).rejects.toThrow(
          'invalid dates',
        );
        expect(mockedPost).not.toHaveBeenCalled();
      });

      it('rejects an unparseable visit end', async () => {
        await expect(
          saveIntoVisit({ start: VISIT_START, end: 'not-a-date' }),
        ).rejects.toThrow('invalid dates');
        expect(mockedPost).not.toHaveBeenCalled();
      });
    });
  });

  it('posts nothing for an empty batch', async () => {
    await expect(
      saveDocuments({
        patientUuid: PATIENT_UUID,
        target: existingEncounterTarget,
        documents: [],
      }),
    ).resolves.toEqual([]);
    expect(mockedPost).not.toHaveBeenCalled();
  });

  it.each([
    { ...EXISTING_ENCOUNTER, subject: { reference: 'Patient/other' } },
    { ...EXISTING_ENCOUNTER, status: 'entered-in-error' },
    { ...EXISTING_ENCOUNTER, participant: [] },
    { ...EXISTING_ENCOUNTER, period: { start: NOW } },
  ])('does not write an unavailable or changed encounter', async (current) => {
    (get as jest.Mock).mockResolvedValueOnce(current);
    await expect(
      saveDocuments({
        patientUuid: PATIENT_UUID,
        target: existingEncounterTarget,
        documents: [firstDocument],
      }),
    ).rejects.toThrow();
    expect(mockedPost).not.toHaveBeenCalled();
  });

  it('uses the current visit period, not stale dates passed by the UI', async () => {
    (get as jest.Mock).mockResolvedValueOnce({
      resourceType: 'Encounter',
      id: 'visit-uuid',
      status: 'finished',
      subject: { reference: `Patient/${PATIENT_UUID}` },
      period: { start: VISIT_START, end: '2026-06-29T17:30:00Z' },
    });
    await saveDocuments({
      patientUuid: PATIENT_UUID,
      target: {
        createEncounterInVisit: {
          ...createEncounterInVisit,
          visitPeriod: { start: NOW },
        },
      },
      documents: [firstDocument],
    });
    expect(encounterPeriodStart()).toBe(VISIT_START);
  });

  it('blocks unsafe attachment paths before reading or writing', async () => {
    await expect(
      saveDocuments({
        patientUuid: PATIENT_UUID,
        target: existingEncounterTarget,
        documents: [{ ...firstDocument, url: '../outside.pdf' }],
      }),
    ).rejects.toThrow('uploaded document');
    expect(get).not.toHaveBeenCalled();
    expect(mockedPost).not.toHaveBeenCalled();
  });
});
