import { Encounter } from 'fhir/r4';
import { get } from '../../api';
import {
  FHIR_ENCOUNTER_TAG_SYSTEM,
  FHIR_ENCOUNTER_TYPE_CODE_SYSTEM,
} from '../../constants/fhir';
import { getActiveVisit, getEncounterByUuid } from '../../encounterService';
import { ENCOUNTER_SEARCH_URL } from '../constants';
import {
  filterByActiveVisit,
  findActiveEncounterInSession,
  searchEncounters,
} from '../encounterSessionService';

// Mock the encounterService
jest.mock('../../encounterService');
jest.mock('../../api');
const mockGetActiveVisit = getActiveVisit as jest.MockedFunction<
  typeof getActiveVisit
>;

describe('encounterSessionService', () => {
  describe('filterByActiveVisit', () => {
    const mockPatientUUID = 'patient-123';

    const createMockEncounter = (id: string, visitUUID: string): Encounter => ({
      resourceType: 'Encounter',
      id,
      meta: {
        versionId: '1',
        lastUpdated: '2025-07-22T03:18:29.000+00:00',
        tag: [
          {
            system: 'http://fhir.openmrs.org/ext/encounter-tag',
            code: 'encounter',
            display: 'Encounter',
          },
        ],
      },
      status: 'finished',
      class: {
        system: 'http://terminology.hl7.org/CodeSystem/v3-ActCode',
        code: 'AMB',
      },
      type: [
        {
          coding: [
            {
              system: 'http://fhir.openmrs.org/ext/encounter-type',
              code: 'consultation',
              display: 'Consultation',
            },
          ],
        },
      ],
      subject: {
        reference: `Patient/${mockPatientUUID}`,
        type: 'Patient',
        display: 'Test Patient',
      },
      period: { start: '2025-07-22T02:00:00.000+00:00' },
      location: [
        {
          location: {
            reference: 'Location/1',
            type: 'Location',
            display: 'Test Location',
          },
        },
      ],
      partOf: { reference: `Encounter/${visitUUID}`, type: 'Encounter' },
    });

    const createMockVisit = (id: string, hasEndDate: boolean): Encounter => ({
      resourceType: 'Encounter',
      id,
      meta: {
        versionId: '1',
        lastUpdated: '2025-07-22T03:18:29.000+00:00',
        tag: [
          {
            system: 'http://fhir.openmrs.org/ext/encounter-tag',
            code: 'visit',
            display: 'Visit',
          },
        ],
      },
      status: hasEndDate ? 'finished' : 'in-progress',
      class: {
        system: 'http://terminology.hl7.org/CodeSystem/v3-ActCode',
        code: 'IMP',
      },
      type: [
        {
          coding: [
            {
              system: 'http://fhir.openmrs.org/ext/encounter-type',
              code: 'visit',
              display: 'Visit',
            },
          ],
        },
      ],
      subject: {
        reference: `Patient/${mockPatientUUID}`,
        type: 'Patient',
        display: 'Test Patient',
      },
      period: {
        start: '2025-07-21T05:12:45+00:00',
        ...(hasEndDate && { end: '2025-07-22T03:16:51+00:00' }),
      },
      location: [
        {
          location: {
            reference: 'Location/1',
            type: 'Location',
            display: 'Test Location',
          },
        },
      ],
    });

    beforeEach(() => {
      jest.clearAllMocks();
    });

    it('should return null when no encounters provided', async () => {
      const result = await filterByActiveVisit([], mockPatientUUID);
      expect(result).toBeNull();
    });

    it('selects the newest matching encounter without changing the input order', async () => {
      const older = createMockEncounter('older', 'visit-123');
      const newer = {
        ...older,
        id: 'newer',
        period: { start: '2025-07-22T03:00:00Z' },
      };
      const missingDate = { ...older, id: 'undated', period: undefined };
      const invalidDate = {
        ...older,
        id: 'invalid',
        period: { start: 'invalid' },
      };
      const encounters = [missingDate, older, invalidDate, newer];
      mockGetActiveVisit.mockResolvedValue(createMockVisit('visit-123', false));
      await expect(
        filterByActiveVisit(encounters, mockPatientUUID),
      ).resolves.toEqual(newer);
      expect(encounters.map((encounter) => encounter.id)).toEqual([
        'undated',
        'older',
        'invalid',
        'newer',
      ]);
    });

    it.each([
      'https://staging.example/openmrs/ws/fhir2/R4/Encounter/visit-123',
      'Encounter/visit-123/_history/2',
      'https://staging.example/openmrs/ws/fhir2/R4/Encounter/visit-123/_history/2',
    ])('recognizes the active visit reference %s', async (reference) => {
      const encounter = {
        ...createMockEncounter('encounter-1', 'visit-123'),
        partOf: { reference },
      };
      mockGetActiveVisit.mockResolvedValue(createMockVisit('visit-123', false));
      await expect(
        filterByActiveVisit([encounter], mockPatientUUID),
      ).resolves.toEqual(encounter);
    });

    it('does not match a different resource type with the same identifier', async () => {
      const encounter = {
        ...createMockEncounter('encounter-1', 'visit-123'),
        partOf: { reference: 'Patient/visit-123' },
      };
      mockGetActiveVisit.mockResolvedValue(createMockVisit('visit-123', false));
      await expect(
        filterByActiveVisit([encounter], mockPatientUUID),
      ).resolves.toBeNull();
    });

    it('should return null when no visits found', async () => {
      mockGetActiveVisit.mockResolvedValue(null);
      const encounters = [createMockEncounter('encounter-1', 'visit-1')];

      const result = await filterByActiveVisit(encounters, mockPatientUUID);
      expect(result).toBeNull();
    });

    it('should return encounter when its visit is active (no end date)', async () => {
      const visitUUID = 'visit-1';
      const encounterUUID = 'encounter-1';

      const activeVisit = createMockVisit(visitUUID, false); // No end date = active
      const encounter = createMockEncounter(encounterUUID, visitUUID);

      mockGetActiveVisit.mockResolvedValue(activeVisit);

      const result = await filterByActiveVisit([encounter], mockPatientUUID);
      expect(result).toEqual(encounter);
    });

    it('should return null when encounter belongs to closed visit (has end date)', async () => {
      const visitUUID = 'visit-1';
      const encounterUUID = 'encounter-1';

      const encounter = createMockEncounter(encounterUUID, visitUUID);

      mockGetActiveVisit.mockResolvedValue(null); // No active visit

      const result = await filterByActiveVisit([encounter], mockPatientUUID);
      expect(result).toBeNull();
    });

    it('should return first encounter with active visit when multiple encounters exist', async () => {
      const activeVisitUUID = 'active-visit';
      const closedVisitUUID = 'closed-visit';

      const activeVisit = createMockVisit(activeVisitUUID, false);

      const encounterWithClosedVisit = createMockEncounter(
        'encounter-1',
        closedVisitUUID,
      );
      const encounterWithActiveVisit = createMockEncounter(
        'encounter-2',
        activeVisitUUID,
      );

      mockGetActiveVisit.mockResolvedValue(activeVisit);

      const result = await filterByActiveVisit(
        [encounterWithClosedVisit, encounterWithActiveVisit],
        mockPatientUUID,
      );
      expect(result).toEqual(encounterWithActiveVisit);
    });

    it('should return null when encounter has no partOf reference', async () => {
      const visit = createMockVisit('visit-1', false);
      const encounter = createMockEncounter('encounter-1', 'visit-1');
      delete encounter.partOf; // Remove partOf reference

      mockGetActiveVisit.mockResolvedValue(visit);

      const result = await filterByActiveVisit([encounter], mockPatientUUID);
      expect(result).toBeNull();
    });

    it('should return null when visit UUID cannot be extracted from partOf reference', async () => {
      const visit = createMockVisit('visit-1', false);
      const encounter = createMockEncounter('encounter-1', 'visit-1');
      encounter.partOf = { reference: 'InvalidReference', type: 'Encounter' }; // Invalid reference format

      mockGetActiveVisit.mockResolvedValue(visit);

      const result = await filterByActiveVisit([encounter], mockPatientUUID);
      expect(result).toBeNull();
    });

    it('propagates an unavailable visit rather than inventing a new encounter', async () => {
      mockGetActiveVisit.mockRejectedValue(new Error('API Error'));
      const encounters = [createMockEncounter('encounter-1', 'visit-1')];

      await expect(
        filterByActiveVisit(encounters, mockPatientUUID),
      ).rejects.toThrow('API Error');
    });

    describe('episode of care scoping', () => {
      const visitUUID = 'visit-1';

      it("should reuse an encounter whose id is in the current episode's known encounters", async () => {
        const activeVisit = createMockVisit(visitUUID, false);
        const encounter = createMockEncounter('encounter-1', visitUUID);

        mockGetActiveVisit.mockResolvedValue(activeVisit);

        const result = await filterByActiveVisit([encounter], mockPatientUUID, [
          'encounter-1',
        ]);
        expect(result).toEqual(encounter);
      });

      it('should not reuse an encounter belonging to a different episode, even without episodeOfCare on the resource', async () => {
        const activeVisit = createMockVisit(visitUUID, false);
        const encounter = createMockEncounter('encounter-1', visitUUID);

        mockGetActiveVisit.mockResolvedValue(activeVisit);

        const result = await filterByActiveVisit([encounter], mockPatientUUID, [
          'encounter-2',
        ]);
        expect(result).toBeNull();
      });

      it('should not reuse anything when the current episode has no known encounters yet', async () => {
        const activeVisit = createMockVisit(visitUUID, false);
        const encounter = createMockEncounter('encounter-1', visitUUID);

        mockGetActiveVisit.mockResolvedValue(activeVisit);

        const result = await filterByActiveVisit(
          [encounter],
          mockPatientUUID,
          [],
        );
        expect(result).toBeNull();
      });

      it('should fall back to first active-visit match when no episode context is provided (backward compatible)', async () => {
        const activeVisit = createMockVisit(visitUUID, false);
        const encounter = createMockEncounter('encounter-1', visitUUID);

        mockGetActiveVisit.mockResolvedValue(activeVisit);

        const result = await filterByActiveVisit([encounter], mockPatientUUID);
        expect(result).toEqual(encounter);
      });
    });
  });

  describe('findActiveEncounterInSession', () => {
    beforeEach(() => jest.clearAllMocks());

    describe('saved encounter handoff', () => {
      const now = new Date('2026-10-05T10:00:00Z');
      const saved = (): Encounter => ({
        resourceType: 'Encounter',
        id: 'saved-123',
        status: 'unknown',
        class: { code: 'AMB' },
        subject: { reference: 'Patient/patient-123' },
        participant: [
          { individual: { reference: 'Practitioner/provider-123' } },
        ],
        partOf: { reference: 'Encounter/visit-123' },
        type: [
          {
            coding: [
              { system: FHIR_ENCOUNTER_TYPE_CODE_SYSTEM, code: 'type-123' },
            ],
          },
        ],
        meta: {
          lastUpdated: '2026-10-05T09:59:00Z',
          tag: [{ system: FHIR_ENCOUNTER_TAG_SYSTEM, code: 'encounter' }],
        },
        period: { start: '2026-10-05T09:58:00Z' },
      });
      const find = (episode?: string[]) =>
        findActiveEncounterInSession(
          'patient-123',
          'provider-123',
          30,
          'type-123',
          episode,
          'saved-123',
        );
      beforeEach(() => {
        jest.spyOn(Date, 'now').mockReturnValue(now.getTime());
        jest
          .mocked(get)
          .mockReset()
          .mockResolvedValue({ resourceType: 'Bundle', entry: [] });
        mockGetActiveVisit.mockReset().mockResolvedValue({
          resourceType: 'Encounter',
          id: 'visit-123',
          status: 'unknown',
          class: { code: 'AMB' },
        });
        jest.mocked(getEncounterByUuid).mockReset().mockResolvedValue(saved());
      });
      afterEach(() => jest.restoreAllMocks());

      it('re-reads the saved encounter when its search index is empty', async () => {
        await expect(find()).resolves.toEqual(saved());
        expect(getEncounterByUuid).toHaveBeenCalledWith('saved-123');
        expect(mockGetActiveVisit).toHaveBeenCalledTimes(1);
      });
      it.each([{ episode: [] }, { episode: ['other-123'] }])(
        'does not bypass episode membership %j',
        async ({ episode }) => {
          await expect(find(episode)).resolves.toBeNull();
        },
      );
      it('accepts a saved encounter in the selected episode', async () => {
        await expect(find(['saved-123'])).resolves.toEqual(saved());
      });
      it.each([
        { subject: { reference: 'Patient/other-patient-123' } },
        {
          participant: [
            { individual: { reference: 'Practitioner/other-provider' } },
          ],
        },
        { partOf: { reference: 'Encounter/other-visit' } },
        {
          type: [
            {
              coding: [
                { system: FHIR_ENCOUNTER_TYPE_CODE_SYSTEM, code: 'other-type' },
              ],
            },
          ],
        },
        { meta: { ...saved().meta, lastUpdated: '2026-10-05T09:29:59Z' } },
        { status: 'entered-in-error' },
      ])('rejects an ineligible direct read %j', async (change) => {
        jest
          .mocked(getEncounterByUuid)
          .mockResolvedValue({ ...saved(), ...change } as Encounter);
        // An older indexed representation of the same ID must not revive it.
        jest.mocked(get).mockResolvedValue({
          resourceType: 'Bundle',
          entry: [{ resource: saved() }],
        });
        await expect(find()).resolves.toBeNull();
      });
      it('retains the newest selection and does not mutate search entries', async () => {
        const newer = {
          ...saved(),
          id: 'newer-123',
          period: { start: '2026-10-05T09:59:00Z' },
        };
        const indexed = [newer, saved()];
        jest.mocked(get).mockResolvedValue({
          resourceType: 'Bundle',
          entry: indexed.map((resource) => ({ resource })),
        });
        await expect(find()).resolves.toEqual(newer);
        expect(indexed.map((item) => item.id)).toEqual([
          'newer-123',
          'saved-123',
        ]);
      });
      it('keeps a direct-read failure unavailable rather than starting a new encounter', async () => {
        jest
          .mocked(getEncounterByUuid)
          .mockRejectedValue(
            Object.assign(new Error('Denied'), { status: 403 }),
          );
        await expect(find()).rejects.toThrow('Denied');
      });
      it('does not read a saved encounter without an active visit', async () => {
        mockGetActiveVisit.mockResolvedValue(null);
        await expect(find()).resolves.toBeNull();
        expect(getEncounterByUuid).not.toHaveBeenCalled();
      });
    });

    it('propagates encounter-search failure', async () => {
      jest.mocked(get).mockRejectedValue(new Error('Search unavailable'));
      await expect(
        findActiveEncounterInSession(
          'patient-123',
          'provider-123',
          30,
          'type-123',
        ),
      ).rejects.toThrow('Search unavailable');
    });

    it('propagates active-visit failure after a successful search', async () => {
      jest.mocked(get).mockResolvedValue({
        resourceType: 'Bundle',
        entry: [
          {
            resource: {
              resourceType: 'Encounter',
              id: 'encounter-123',
              partOf: { reference: 'Encounter/visit-123' },
            },
          },
        ],
      });
      mockGetActiveVisit.mockRejectedValue(new Error('Visit unavailable'));
      await expect(
        findActiveEncounterInSession(
          'patient-123',
          'provider-123',
          30,
          'type-123',
        ),
      ).rejects.toThrow('Visit unavailable');
    });

    it('returns null only for a successful empty search', async () => {
      jest.mocked(get).mockResolvedValue({ resourceType: 'Bundle', entry: [] });
      await expect(
        findActiveEncounterInSession(
          'patient-123',
          'provider-123',
          30,
          'type-123',
        ),
      ).resolves.toBeNull();
      expect(mockGetActiveVisit).not.toHaveBeenCalled();
    });
  });

  describe('searchEncounters pagination', () => {
    const params = {
      patient: 'patient-123',
      _tag: 'encounter',
      type: 'type-123',
      participant: 'provider-123',
    };
    const initial = `${ENCOUNTER_SEARCH_URL}?${new URLSearchParams(params)}`;
    const next = `${initial}&_getpagesoffset=1`;
    const encounter = { resourceType: 'Encounter', id: 'encounter-2' };
    beforeEach(() => jest.resetAllMocks());

    it('reads the later encounter page through the same local API boundary', async () => {
      jest
        .mocked(get)
        .mockResolvedValueOnce({
          resourceType: 'Bundle',
          total: 1,
          entry: [],
          link: [{ relation: 'next', url: `https://staging.example${next}` }],
        })
        .mockResolvedValueOnce({
          resourceType: 'Bundle',
          entry: [{ resource: encounter }],
        });
      await expect(searchEncounters(params)).resolves.toEqual([encounter]);
      expect(get).toHaveBeenNthCalledWith(1, initial);
      expect(get).toHaveBeenNthCalledWith(2, next);
    });

    it.each([
      ['cyclic', initial],
      ['different resource', next.replace('/Encounter?', '/Patient?')],
    ])('rejects a %s pagination link', async (_, url) => {
      jest.mocked(get).mockResolvedValueOnce({
        resourceType: 'Bundle',
        link: [{ relation: 'next', url }],
      });
      await expect(searchEncounters(params)).rejects.toThrow(
        'Invalid FHIR pagination link',
      );
      expect(get).toHaveBeenCalledTimes(1);
    });

    it('rejects an incomplete history', async () => {
      jest.mocked(get).mockResolvedValueOnce({
        resourceType: 'Bundle',
        total: 2,
        entry: [{ resource: encounter }],
      });
      await expect(searchEncounters(params)).rejects.toThrow(
        'incomplete result',
      );
    });

    it('propagates a later-page failure instead of returning the partial history', async () => {
      jest
        .mocked(get)
        .mockResolvedValueOnce({
          resourceType: 'Bundle',
          entry: [{ resource: encounter }],
          link: [{ relation: 'next', url: next }],
        })
        .mockRejectedValueOnce(new Error('Later page unavailable'));
      await expect(searchEncounters(params)).rejects.toThrow(
        'Later page unavailable',
      );
    });
  });
});
