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
  describe('request lifecycle', () => {
    type Decision = Awaited<ReturnType<typeof resolveEncounterMatchDecision>>;
    const matched = (id: string): Decision => ({
      matched: true,
      encounter: { resourceType: 'Encounter', id, status: 'in-progress' },
      reasons: ['MATCHED'],
    });
    const deferred = () => {
      let resolve!: (decision: Decision) => void;
      let reject!: (error: Error) => void;
      const promise = new Promise<Decision>((resolvePromise, rejectPromise) => {
        resolve = resolvePromise;
        reject = rejectPromise;
      });
      return { promise, resolve, reject };
    };
    const changeContext = (kind: string) => {
      if (kind === 'patient')
        mockUsePatientUUID.mockReturnValue('patient-next');
      return {
        practitioner:
          kind === 'provider' ? { uuid: 'provider-next' } : mockPractitioner,
        encounterTypeUUID:
          kind === 'encounter type' ? 'type-next' : ENCOUNTER_TYPE_UUID,
      };
    };

    it.each(['patient', 'provider', 'encounter type'])(
      'never exposes the old decision during a %s change',
      async (kind) => {
        mockResolveEncounterMatchDecision.mockResolvedValueOnce(matched('old'));
        const next = deferred();
        mockResolveEncounterMatchDecision.mockReturnValueOnce(next.promise);
        let options = defaultOptions;
        const renders: ReturnType<typeof useEncounterSession>[] = [];
        const { result, rerender } = renderHook(() => {
          const session = useEncounterSession(options);
          renders.push(session);
          return session;
        });
        await waitFor(() => expect(result.current.isLoading).toBe(false));
        renders.length = 0;
        options = changeContext(kind);
        rerender();

        expect(renders.length).toBeGreaterThan(0);
        for (const session of renders) {
          expect(session.activeEncounter).toBeNull();
          expect(session.matchReason).toEqual([]);
          expect(session.editActiveEncounter).toBe(false);
          expect(session.isLoading).toBe(true);
        }
        await act(async () => next.resolve(matched('next')));
        expect(result.current.activeEncounter?.id).toBe('next');
      },
    );

    it.each(['patient', 'provider', 'encounter type'])(
      'ignores late retry success and failure after a %s change',
      async (kind) => {
        const oldSuccess = deferred();
        const oldFailure = deferred();
        const next = deferred();
        mockResolveEncounterMatchDecision
          .mockResolvedValueOnce(matched('initial'))
          .mockReturnValueOnce(oldSuccess.promise)
          .mockReturnValueOnce(oldFailure.promise)
          .mockReturnValueOnce(next.promise);
        let options = defaultOptions;
        const { result, rerender } = renderHook(() =>
          useEncounterSession(options),
        );
        await waitFor(() => expect(result.current.isLoading).toBe(false));
        let successRequest!: Promise<void>;
        let failureRequest!: Promise<void>;
        act(() => {
          successRequest = result.current.refetch();
          failureRequest = result.current.refetch();
        });
        options = changeContext(kind);
        rerender();
        await act(async () => next.resolve(matched('next')));

        await act(async () => {
          oldSuccess.resolve(matched('old-success'));
          oldFailure.reject(new Error('Old context failed'));
          await Promise.all([successRequest, failureRequest]);
        });
        expect(result.current.activeEncounter?.id).toBe('next');
        expect(result.current.matchReason).toEqual(['MATCHED']);
        expect(result.current.error).toBeNull();
        expect(result.current.isLoading).toBe(false);
      },
    );

    it.each(['success', 'failure'])(
      'keeps the latest retry when an older retry finishes with %s',
      async (outcome) => {
        const older = deferred();
        const latest = deferred();
        mockResolveEncounterMatchDecision
          .mockResolvedValueOnce(matched('initial'))
          .mockReturnValueOnce(older.promise)
          .mockReturnValueOnce(latest.promise);
        const { result } = renderHook(() =>
          useEncounterSession(defaultOptions),
        );
        await waitFor(() => expect(result.current.isLoading).toBe(false));
        let olderRequest!: Promise<void>;
        let latestRequest!: Promise<void>;
        act(() => {
          olderRequest = result.current.refetch();
          latestRequest = result.current.refetch();
        });
        await act(async () => {
          latest.resolve(matched('latest'));
          await latestRequest;
        });
        await act(async () => {
          if (outcome === 'success') older.resolve(matched('older'));
          else older.reject(new Error('Older request failed'));
          await olderRequest;
        });
        expect(result.current.activeEncounter?.id).toBe('latest');
        expect(result.current.error).toBeNull();
        expect(result.current.editActiveEncounter).toBe(true);
      },
    );

    it('clears action eligibility while retrying and does not let an older response end loading', async () => {
      const older = deferred();
      const latest = deferred();
      mockResolveEncounterMatchDecision
        .mockResolvedValueOnce(matched('initial'))
        .mockReturnValueOnce(older.promise)
        .mockReturnValueOnce(latest.promise);
      const { result } = renderHook(() => useEncounterSession(defaultOptions));
      await waitFor(() => expect(result.current.isLoading).toBe(false));
      let olderRequest!: Promise<void>;
      let latestRequest!: Promise<void>;
      act(() => {
        olderRequest = result.current.refetch();
        latestRequest = result.current.refetch();
      });
      expect(result.current.isLoading).toBe(true);
      expect(result.current.activeEncounter).toBeNull();
      expect(result.current.editActiveEncounter).toBe(false);
      expect(result.current.matchReason).toEqual([]);
      await act(async () => {
        older.resolve(matched('older'));
        await olderRequest;
      });
      expect(result.current.isLoading).toBe(true);
      expect(result.current.activeEncounter).toBeNull();
      await act(async () => {
        latest.resolve(matched('latest'));
        await latestRequest;
      });
      expect(result.current.activeEncounter?.id).toBe('latest');
    });

    it('does not revive a retry or its callback after a patient round trip', async () => {
      const old = deferred();
      mockResolveEncounterMatchDecision
        .mockResolvedValueOnce(matched('initial'))
        .mockReturnValueOnce(old.promise)
        .mockResolvedValueOnce(matched('other'))
        .mockResolvedValueOnce(matched('returned'));
      const { result, rerender } = renderHook(() =>
        useEncounterSession(defaultOptions),
      );
      await waitFor(() => expect(result.current.isLoading).toBe(false));
      const obsoleteRefetch = result.current.refetch;
      let oldRequest!: Promise<void>;
      act(() => {
        oldRequest = obsoleteRefetch();
      });
      mockUsePatientUUID.mockReturnValue('patient-next');
      rerender();
      await waitFor(() =>
        expect(result.current.activeEncounter?.id).toBe('other'),
      );
      mockUsePatientUUID.mockReturnValue(PATIENT_UUID);
      rerender();
      await waitFor(() =>
        expect(result.current.activeEncounter?.id).toBe('returned'),
      );
      await act(async () => {
        old.resolve(matched('old'));
        await oldRequest;
        await obsoleteRefetch();
      });
      expect(mockResolveEncounterMatchDecision).toHaveBeenCalledTimes(4);
      expect(result.current.activeEncounter?.id).toBe('returned');
    });

    it('makes callbacks from a replaced context or unmounted hook inert', async () => {
      mockResolveEncounterMatchDecision.mockResolvedValue(matched('initial'));
      let options = defaultOptions;
      const { result, rerender, unmount } = renderHook(() =>
        useEncounterSession(options),
      );
      await waitFor(() => expect(result.current.isLoading).toBe(false));
      const oldRefetch = result.current.refetch;
      options = changeContext('provider');
      rerender();
      await waitFor(() => expect(result.current.isLoading).toBe(false));
      await act(async () => oldRefetch());
      expect(mockResolveEncounterMatchDecision).toHaveBeenCalledTimes(2);
      const unmountedRefetch = result.current.refetch;
      unmount();
      await act(async () => unmountedRefetch());
      expect(mockResolveEncounterMatchDecision).toHaveBeenCalledTimes(2);
    });

    it('retains the latest error when an older success arrives', async () => {
      const older = deferred();
      const latest = deferred();
      mockResolveEncounterMatchDecision
        .mockResolvedValueOnce(matched('initial'))
        .mockReturnValueOnce(older.promise)
        .mockReturnValueOnce(latest.promise);
      const { result } = renderHook(() => useEncounterSession(defaultOptions));
      await waitFor(() => expect(result.current.isLoading).toBe(false));
      let olderRequest!: Promise<void>;
      let latestRequest!: Promise<void>;
      act(() => {
        olderRequest = result.current.refetch();
        latestRequest = result.current.refetch();
      });
      await act(async () => {
        latest.reject(new Error('Current lookup failed'));
        await latestRequest;
      });
      await act(async () => {
        older.resolve(matched('older'));
        await olderRequest;
      });
      expect(result.current.error).toBe('Current lookup failed');
      expect(result.current.activeEncounter).toBeNull();
      expect(result.current.editActiveEncounter).toBe(false);
      expect(result.current.isLoading).toBe(false);
    });

    it('does not publish a retry completion after unmount', async () => {
      const pending = deferred();
      mockResolveEncounterMatchDecision
        .mockResolvedValueOnce(matched('initial'))
        .mockReturnValueOnce(pending.promise);
      const rendered = jest.fn();
      const { result, unmount } = renderHook(() => {
        const session = useEncounterSession(defaultOptions);
        rendered(session);
        return session;
      });
      await waitFor(() => expect(result.current.isLoading).toBe(false));
      let request!: Promise<void>;
      act(() => {
        request = result.current.refetch();
      });
      unmount();
      rendered.mockClear();
      await act(async () => {
        pending.resolve(matched('late'));
        await request;
      });
      expect(rendered).not.toHaveBeenCalled();
    });

    it('waits safely when required context disappears and resolves when it returns', async () => {
      mockResolveEncounterMatchDecision.mockResolvedValue(matched('initial'));
      const { result, rerender } = renderHook(() =>
        useEncounterSession(defaultOptions),
      );
      await waitFor(() => expect(result.current.isLoading).toBe(false));
      mockUsePatientUUID.mockReturnValue(null);
      rerender();
      expect(result.current.activeEncounter).toBeNull();
      expect(result.current.editActiveEncounter).toBe(false);
      expect(result.current.isLoading).toBe(true);
      await act(async () => result.current.refetch());
      expect(mockResolveEncounterMatchDecision).toHaveBeenCalledTimes(1);
      mockUsePatientUUID.mockReturnValue(PATIENT_UUID);
      rerender();
      await waitFor(() => expect(result.current.isLoading).toBe(false));
      expect(mockResolveEncounterMatchDecision).toHaveBeenCalledTimes(2);
      expect(result.current.activeEncounter?.id).toBe('initial');
    });
  });

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
