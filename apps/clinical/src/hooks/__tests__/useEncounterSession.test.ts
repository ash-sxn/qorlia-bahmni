import {
  resolveEncounterMatchDecision,
  getUserLoginLocation,
  getEncounterSessionSnapshot,
} from '@bahmni/services';
import { usePatientUUID } from '@bahmni/widgets';
import { act, renderHook, waitFor } from '@testing-library/react';
import { useEncounterSession } from '../useEncounterSession';

jest.mock('@bahmni/services', () => {
  const { canResumeOwnInSessionEncounter } =
    jest.requireActual('@bahmni/services');
  return {
    resolveEncounterMatchDecision: jest.fn(),
    getUserLoginLocation: jest.fn(),
    canResumeOwnInSessionEncounter,
    getEncounterSessionSnapshot: jest.fn(() => ({
      matchReasons: [],
      activeEncounter: null,
      canEditOrCreate: false,
      isLoading: false,
    })),
  };
});

jest.mock('@bahmni/widgets', () => ({
  usePatientUUID: jest.fn(),
}));

const mockResolveEncounterMatchDecision =
  resolveEncounterMatchDecision as jest.MockedFunction<
    typeof resolveEncounterMatchDecision
  >;
const mockGetUserLoginLocation = getUserLoginLocation as jest.MockedFunction<
  typeof getUserLoginLocation
>;
const mockUsePatientUUID = usePatientUUID as jest.MockedFunction<
  typeof usePatientUUID
>;

const PATIENT_UUID = 'patient-123';
const PRACTITIONER_UUID = 'practitioner-456';
const LOCATION_UUID = 'location-789';
const ENCOUNTER_TYPE_UUID = 'encounter-type-abc';

const mockPractitioner = { uuid: PRACTITIONER_UUID } as any;

const defaultOptions = {
  practitioner: mockPractitioner,
  encounterTypeUUID: ENCOUNTER_TYPE_UUID,
};

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(getEncounterSessionSnapshot).mockReturnValue({
    matchReasons: [],
    activeEncounter: null,
    canEditOrCreate: false,
    isLoading: false,
  });
  mockUsePatientUUID.mockReturnValue(PATIENT_UUID);
  mockGetUserLoginLocation.mockReturnValue({ uuid: LOCATION_UUID } as any);
});

describe('useEncounterSession', () => {
  describe('early return — missing required values', () => {
    it('returns loading state when patientUUID is null', async () => {
      mockUsePatientUUID.mockReturnValue(null);

      const { result } = renderHook(() => useEncounterSession(defaultOptions));

      expect(result.current.isLoading).toBe(true);
      expect(result.current.hasActiveSession).toBe(false);
      expect(result.current.activeEncounter).toBeNull();
      expect(result.current.matchReason).toEqual([]);
      expect(result.current.editActiveEncounter).toBe(false);
      expect(mockResolveEncounterMatchDecision).not.toHaveBeenCalled();
    });

    it('returns loading state when practitioner is null', async () => {
      const { result } = renderHook(() =>
        useEncounterSession({
          practitioner: null,
          encounterTypeUUID: ENCOUNTER_TYPE_UUID,
        }),
      );

      expect(result.current.isLoading).toBe(true);
      expect(result.current.hasActiveSession).toBe(false);
      expect(result.current.matchReason).toEqual([]);
      expect(mockResolveEncounterMatchDecision).not.toHaveBeenCalled();
    });

    it('returns loading state when encounterTypeUUID is undefined — prevents unfiltered search', async () => {
      const { result } = renderHook(() =>
        useEncounterSession({ practitioner: mockPractitioner }),
      );

      expect(result.current.isLoading).toBe(true);
      expect(result.current.matchReason).toEqual([]);
      expect(result.current.editActiveEncounter).toBe(false);
      expect(mockResolveEncounterMatchDecision).not.toHaveBeenCalled();
    });
  });

  describe('store snapshot seeding', () => {
    const snapshotEncounter = {
      id: 'snap-enc-1',
      subject: { reference: `Patient/${PATIENT_UUID}` },
    } as any;

    it('passes the saved ID to the shared resolver without seeding an unverified session', async () => {
      (
        jest.requireMock('@bahmni/services')
          .getEncounterSessionSnapshot as jest.Mock
      ).mockReturnValue({
        matchReasons: ['MATCHED'],
        activeEncounter: snapshotEncounter,
        canEditOrCreate: true,
        isLoading: false,
      });
      let finish!: (
        decision: Awaited<ReturnType<typeof resolveEncounterMatchDecision>>,
      ) => void;
      mockResolveEncounterMatchDecision.mockReturnValue(
        new Promise((resolve) => {
          finish = resolve;
        }),
      );

      const { result } = renderHook(() => useEncounterSession(defaultOptions));
      expect(result.current.isLoading).toBe(true);
      expect(result.current.hasActiveSession).toBe(false);
      expect(result.current.activeEncounter).toBeNull();
      expect(mockResolveEncounterMatchDecision).toHaveBeenCalledWith(
        PATIENT_UUID,
        PRACTITIONER_UUID,
        LOCATION_UUID,
        ENCOUNTER_TYPE_UUID,
        'snap-enc-1',
      );
      await act(async () =>
        finish({
          matched: true,
          encounter: snapshotEncounter,
          reasons: ['MATCHED'],
        }),
      );

      await waitFor(() => expect(result.current.isLoading).toBe(false));

      expect(result.current.hasActiveSession).toBe(true);
      expect(result.current.activeEncounter).toBe(snapshotEncounter);
      expect(result.current.matchReason).toEqual(['MATCHED']);
      expect(mockResolveEncounterMatchDecision).toHaveBeenCalledTimes(1);
    });

    it('cannot resume a same-patient cached match when fresh resolution fails', async () => {
      jest.mocked(getEncounterSessionSnapshot).mockReturnValue({
        matchReasons: ['MATCHED'],
        activeEncounter: snapshotEncounter,
        canEditOrCreate: true,
        isLoading: false,
      });
      mockResolveEncounterMatchDecision.mockRejectedValue(
        new Error('Fresh encounter read failed'),
      );
      const { result } = renderHook(() => useEncounterSession(defaultOptions));
      await waitFor(() => expect(result.current.isLoading).toBe(false));
      expect(result.current.error).toBe('Fresh encounter read failed');
      expect(result.current.editActiveEncounter).toBe(false);
      expect(result.current.activeEncounter).toBeNull();
      expect(result.current.matchReason).toEqual([]);
    });

    it('uses the new provider and encounter type rather than a cached MATCHED decision', async () => {
      jest.mocked(getEncounterSessionSnapshot).mockReturnValue({
        matchReasons: ['MATCHED'],
        activeEncounter: snapshotEncounter,
        canEditOrCreate: true,
        isLoading: false,
      });
      mockResolveEncounterMatchDecision.mockResolvedValue({
        matched: false,
        encounter: snapshotEncounter,
        reasons: ['PROVIDER_MISMATCH'],
      });
      const { result } = renderHook(() =>
        useEncounterSession({
          practitioner: { uuid: 'new-provider' } as any,
          encounterTypeUUID: 'new-type',
        }),
      );
      await waitFor(() => expect(result.current.isLoading).toBe(false));
      expect(mockResolveEncounterMatchDecision).toHaveBeenCalledWith(
        PATIENT_UUID,
        'new-provider',
        LOCATION_UUID,
        'new-type',
        'snap-enc-1',
      );
      expect(result.current.editActiveEncounter).toBe(false);
    });

    it.each([
      { matchReasons: ['MATCHED'], isLoading: true },
      { matchReasons: ['MATCHED', 'SESSION_EXPIRED'], isLoading: false },
      { matchReasons: ['PROVIDER_MISMATCH'], isLoading: false },
    ])(
      'does not supply a pending or conflicting cached match: %j',
      async (state) => {
        jest.mocked(getEncounterSessionSnapshot).mockReturnValue({
          ...state,
          activeEncounter: snapshotEncounter,
          canEditOrCreate: true,
        } as any);
        mockResolveEncounterMatchDecision.mockResolvedValue({
          matched: false,
          encounter: null,
          reasons: ['NO_ACTIVE_ENCOUNTER'],
        });
        const { result } = renderHook(() =>
          useEncounterSession(defaultOptions),
        );
        await waitFor(() => expect(result.current.isLoading).toBe(false));
        expect(mockResolveEncounterMatchDecision).toHaveBeenCalledWith(
          PATIENT_UUID,
          PRACTITIONER_UUID,
          LOCATION_UUID,
          ENCOUNTER_TYPE_UUID,
          undefined,
        );
        expect(result.current.editActiveEncounter).toBe(false);
      },
    );

    it('does not seed and falls through to resolver when snapshot encounter belongs to a different patient', async () => {
      (
        jest.requireMock('@bahmni/services')
          .getEncounterSessionSnapshot as jest.Mock
      ).mockReturnValue({
        matchReasons: ['MATCHED'],
        activeEncounter: {
          id: 'snap-enc-other',
          subject: { reference: 'Patient/other-patient' },
        },
        canEditOrCreate: true,
        isLoading: false,
      });
      mockResolveEncounterMatchDecision.mockResolvedValue({
        matched: false,
        encounter: null,
        reasons: ['NO_ACTIVE_ENCOUNTER'],
      });

      const { result } = renderHook(() => useEncounterSession(defaultOptions));

      await waitFor(() => expect(result.current.isLoading).toBe(false));

      expect(mockResolveEncounterMatchDecision).toHaveBeenCalled();
      expect(result.current.matchReason).toEqual(['NO_ACTIVE_ENCOUNTER']);
    });
  });

  describe('MATCHED', () => {
    it('returns editActiveEncounter=true and matchReason=[MATCHED]', async () => {
      const encounter = { id: 'enc-1' } as any;
      mockResolveEncounterMatchDecision.mockResolvedValue({
        matched: true,
        encounter,
        reasons: ['MATCHED'],
      });

      const { result } = renderHook(() => useEncounterSession(defaultOptions));

      await waitFor(() => expect(result.current.isLoading).toBe(false));

      expect(result.current.hasActiveSession).toBe(true);
      expect(result.current.activeEncounter).toEqual(encounter);
      expect(result.current.matchReason).toEqual(['MATCHED']);
      expect(result.current.editActiveEncounter).toBe(true);
      expect(result.current.isPractitionerMatch).toBe(true);
    });
  });

  describe('SESSION_EXPIRED', () => {
    it('returns editActiveEncounter=false and matchReason=[SESSION_EXPIRED]', async () => {
      mockResolveEncounterMatchDecision.mockResolvedValue({
        matched: false,
        encounter: { id: 'enc-1' } as any,
        reasons: ['SESSION_EXPIRED'],
      });

      const { result } = renderHook(() => useEncounterSession(defaultOptions));

      await waitFor(() => expect(result.current.isLoading).toBe(false));

      expect(result.current.matchReason).toEqual(['SESSION_EXPIRED']);
      expect(result.current.editActiveEncounter).toBe(false);
      expect(result.current.isPractitionerMatch).toBe(false);
    });
  });

  describe('PROVIDER_MISMATCH', () => {
    it('returns matchReason=[PROVIDER_MISMATCH] when only provider differs', async () => {
      mockResolveEncounterMatchDecision.mockResolvedValue({
        matched: false,
        encounter: { id: 'enc-1' } as any,
        reasons: ['PROVIDER_MISMATCH'],
      });

      const { result } = renderHook(() => useEncounterSession(defaultOptions));

      await waitFor(() => expect(result.current.isLoading).toBe(false));

      expect(result.current.matchReason).toEqual(['PROVIDER_MISMATCH']);
      expect(result.current.editActiveEncounter).toBe(false);
      expect(result.current.isPractitionerMatch).toBe(false);
    });

    it('returns matchReason=[PROVIDER_MISMATCH, LOCATION_MISMATCH] when both differ', async () => {
      mockResolveEncounterMatchDecision.mockResolvedValue({
        matched: false,
        encounter: { id: 'enc-1' } as any,
        reasons: ['PROVIDER_MISMATCH', 'LOCATION_MISMATCH'],
      });

      const { result } = renderHook(() => useEncounterSession(defaultOptions));

      await waitFor(() => expect(result.current.isLoading).toBe(false));

      expect(result.current.matchReason).toEqual([
        'PROVIDER_MISMATCH',
        'LOCATION_MISMATCH',
      ]);
      // LOCATION_MISMATCH alongside PROVIDER_MISMATCH means different provider's encounter
      // at a different location — sessionExists is false so both are false
      expect(result.current.editActiveEncounter).toBe(false);
      expect(result.current.isPractitionerMatch).toBe(false);
    });
  });

  describe('LOCATION_MISMATCH', () => {
    it('returns editActiveEncounter=true and matchReason=[LOCATION_MISMATCH]', async () => {
      mockResolveEncounterMatchDecision.mockResolvedValue({
        matched: false,
        encounter: { id: 'enc-1' } as any,
        reasons: ['LOCATION_MISMATCH'],
      });

      const { result } = renderHook(() => useEncounterSession(defaultOptions));

      await waitFor(() => expect(result.current.isLoading).toBe(false));

      expect(result.current.matchReason).toEqual(['LOCATION_MISMATCH']);
      expect(result.current.editActiveEncounter).toBe(true);
      expect(result.current.isPractitionerMatch).toBe(true);
    });
  });

  describe('NO_ACTIVE_VISIT / NO_ACTIVE_ENCOUNTER', () => {
    it.each(['NO_ACTIVE_VISIT', 'NO_ACTIVE_ENCOUNTER'] as const)(
      'returns editActiveEncounter=false and matchReason=[%s]',
      async (reasonCode) => {
        mockResolveEncounterMatchDecision.mockResolvedValue({
          matched: false,
          encounter: null,
          reasons: [reasonCode],
        });

        const { result } = renderHook(() =>
          useEncounterSession(defaultOptions),
        );

        await waitFor(() => expect(result.current.isLoading).toBe(false));

        expect(result.current.hasActiveSession).toBe(false);
        expect(result.current.activeEncounter).toBeNull();
        expect(result.current.matchReason).toEqual([reasonCode]);
        expect(result.current.editActiveEncounter).toBe(false);
      },
    );
  });

  describe('locationUUID sourcing', () => {
    it('passes locationUUID from getUserLoginLocation to the resolver', async () => {
      mockResolveEncounterMatchDecision.mockResolvedValue({
        matched: true,
        encounter: null,
        reasons: ['MATCHED'],
      });

      renderHook(() => useEncounterSession(defaultOptions));

      await waitFor(() =>
        expect(mockResolveEncounterMatchDecision).toHaveBeenCalledWith(
          PATIENT_UUID,
          PRACTITIONER_UUID,
          LOCATION_UUID,
          ENCOUNTER_TYPE_UUID,
          undefined,
        ),
      );
    });

    it('passes undefined when getUserLoginLocation throws', async () => {
      mockGetUserLoginLocation.mockImplementation(() => {
        throw new Error('cookie missing');
      });
      mockResolveEncounterMatchDecision.mockResolvedValue({
        matched: false,
        encounter: null,
        reasons: ['NO_ACTIVE_ENCOUNTER'],
      });

      renderHook(() => useEncounterSession(defaultOptions));

      await waitFor(() =>
        expect(mockResolveEncounterMatchDecision).toHaveBeenCalledWith(
          PATIENT_UUID,
          PRACTITIONER_UUID,
          undefined,
          ENCOUNTER_TYPE_UUID,
          undefined,
        ),
      );
    });
  });

  describe('error handling', () => {
    it('keeps resolution failure distinct from a known new encounter', async () => {
      mockResolveEncounterMatchDecision.mockRejectedValue(
        new Error('network error'),
      );

      const { result } = renderHook(() => useEncounterSession(defaultOptions));

      await waitFor(() => expect(result.current.isLoading).toBe(false));

      expect(result.current.hasActiveSession).toBe(false);
      expect(result.current.activeEncounter).toBeNull();
      expect(result.current.matchReason).toEqual([]);
      expect(result.current.error).toBe('network error');
      expect(result.current.editActiveEncounter).toBe(false);
    });
  });

  describe('refetch', () => {
    it('re-calls the resolver when refetch is invoked', async () => {
      mockResolveEncounterMatchDecision.mockResolvedValue({
        matched: true,
        encounter: { id: 'enc-1' } as any,
        reasons: ['MATCHED'],
      });

      const { result } = renderHook(() => useEncounterSession(defaultOptions));
      await waitFor(() => expect(result.current.isLoading).toBe(false));
      expect(mockResolveEncounterMatchDecision).toHaveBeenCalledTimes(1);

      await act(async () => {
        await result.current.refetch();
      });

      await waitFor(() =>
        expect(mockResolveEncounterMatchDecision).toHaveBeenCalledTimes(2),
      );
    });
  });
});
