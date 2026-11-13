import {
  Provider,
  resolveEncounterMatchDecision,
  canResumeOwnInSessionEncounter,
  MatchReasonCode,
  getUserLoginLocation,
  getEncounterSessionSnapshot,
  type EncounterMatchDecision,
} from '@bahmni/services';
import { usePatientUUID } from '@bahmni/widgets';
import { Encounter } from 'fhir/r4';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

export interface UseEncounterSessionOptions {
  practitioner: Provider | null;
  encounterTypeUUID?: string;
}

export interface UseEncounterSessionReturn {
  hasActiveSession: boolean;
  activeEncounter: Encounter | null;
  isPractitionerMatch: boolean;
  matchReason: MatchReasonCode[];
  editActiveEncounter: boolean;
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

const EMPTY_MATCH_REASONS: MatchReasonCode[] = [];

export function useEncounterSession(
  options: UseEncounterSessionOptions,
): UseEncounterSessionReturn {
  const { practitioner, encounterTypeUUID } = options;

  const patientUUID = usePatientUUID();
  const practitionerUUID = practitioner?.uuid;
  const context = useMemo(
    () => ({ patientUUID, practitionerUUID, encounterTypeUUID }),
    [patientUUID, practitionerUUID, encounterTypeUUID],
  );
  const [state, setState] = useState<{
    context: typeof context;
    decision: EncounterMatchDecision | null;
    isLoading: boolean;
    error: string | null;
  } | null>(null);
  const activeFetch = useRef<{
    context: typeof context;
    fetch: () => Promise<void>;
  } | null>(null);

  // A lifecycle owns both the initial load and retries. Its request number
  // prevents an older completion from replacing a newer decision or error.
  useEffect(() => {
    let active = true;
    let request = 0;
    async function fetchSessionState() {
      const { patientUUID, practitionerUUID, encounterTypeUUID } = context;
      if (!patientUUID || !practitionerUUID || !encounterTypeUUID) return;
      const currentRequest = ++request;
      setState({ context, decision: null, isLoading: true, error: null });
      try {
        let loginLocationUUID: string | undefined;
        try {
          loginLocationUUID = getUserLoginLocation().uuid;
        } catch {
          // Preserve the resolver's existing missing-location policy.
        }
        // A saved ID is only a hint; the resolver re-reads and validates it.
        const storeState = getEncounterSessionSnapshot();
        const savedEncounterUUID =
          !storeState.isLoading &&
          storeState.matchReasons.length === 1 &&
          storeState.matchReasons[0] === 'MATCHED'
            ? storeState.activeEncounter?.id
            : undefined;
        const decision = await resolveEncounterMatchDecision(
          patientUUID,
          practitionerUUID,
          loginLocationUUID,
          encounterTypeUUID,
          savedEncounterUUID,
        );
        if (active && currentRequest === request) {
          setState({ context, decision, isLoading: false, error: null });
        }
      } catch (err) {
        if (active && currentRequest === request) {
          setState({
            context,
            decision: null,
            isLoading: false,
            error:
              err instanceof Error
                ? err.message
                : 'Failed to load encounter session',
          });
        }
      }
    }
    const lifecycle = { context, fetch: fetchSessionState };
    activeFetch.current = lifecycle;
    void fetchSessionState();
    return () => {
      active = false;
      if (activeFetch.current === lifecycle) activeFetch.current = null;
    };
  }, [context]);

  const refetch = useCallback(async () => {
    if (activeFetch.current?.context === context) {
      await activeFetch.current.fetch();
    }
  }, [context]);

  // Hide old context synchronously, before effects publish to the shared store.
  // Object identity also distinguishes an A -> B -> A patient round trip.
  const currentState = state?.context === context ? state : null;
  const decision = currentState?.decision;
  const hasActiveSession = decision
    ? canResumeOwnInSessionEncounter(decision)
    : false;

  return {
    hasActiveSession,
    activeEncounter: decision?.encounter ?? null,
    isPractitionerMatch: hasActiveSession,
    matchReason: decision?.reasons ?? EMPTY_MATCH_REASONS,
    editActiveEncounter: hasActiveSession,
    isLoading: currentState?.isLoading ?? true,
    error: currentState?.error ?? null,
    refetch,
  };
}
