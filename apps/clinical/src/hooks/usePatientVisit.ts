import {
  getVisits,
  getFormattedError,
  getUserLoginLocation,
  getVisitLocationUUID,
  useTranslation,
} from '@bahmni/services';
import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { FhirEncounter } from '../models/encounter';

interface UsePatientVisitResult {
  activeVisit: FhirEncounter | null;
  lastVisit: FhirEncounter | null;
  loading: boolean;
  error: Error | null;
  refetch: () => void;
}

/**
 * Fetches visits at the login department's native parent visit location:
 * - activeVisit: the ongoing visit (no period.end)
 * - lastVisit: most recently ended visit (only when no active visit)
 */
export const usePatientVisit = (
  patientUUID: string | null,
): UsePatientVisitResult => {
  const { t } = useTranslation();
  const translation = useRef(t);
  translation.current = t;
  let loginLocationUUID: string | undefined;
  try {
    loginLocationUUID = getUserLoginLocation().uuid;
  } catch {
    // Missing session location is an unavailable read, not an unscoped search.
  }
  const context = useMemo(
    () => ({ patientUUID, loginLocationUUID }),
    [patientUUID, loginLocationUUID],
  );
  const [state, setState] = useState<{
    context: typeof context;
    activeVisit: FhirEncounter | null;
    lastVisit: FhirEncounter | null;
    loading: boolean;
    error: Error | null;
  } | null>(null);
  const activeFetch = useRef<{
    context: typeof context;
    fetch: () => Promise<void>;
  } | null>(null);

  useEffect(() => {
    let active = true;
    let request = 0;
    const fetchVisits = async () => {
      const currentRequest = ++request;
      setState({
        context,
        activeVisit: null,
        lastVisit: null,
        loading: true,
        error: null,
      });
      try {
        if (!context.patientUUID)
          throw new Error(translation.current('ERROR_INVALID_PATIENT_UUID'));
        if (!context.loginLocationUUID)
          throw new Error(
            translation.current('ERROR_FETCHING_USER_LOCATION_DETAILS'),
          );
        const location = await getVisitLocationUUID(context.loginLocationUUID);
        const visits = (await getVisits(
          context.patientUUID,
          location.uuid,
        )) as FhirEncounter[];
        const activeVisit = visits.find((v) => !v.period?.end) ?? null;
        const lastVisit = activeVisit
          ? null
          : (visits
              .filter((v) => v.period?.end && v.period?.start)
              .sort(
                (a, b) =>
                  new Date(b.period!.end!).getTime() -
                  new Date(a.period!.end!).getTime(),
              )[0] ?? null);
        if (active && currentRequest === request) {
          setState({
            context,
            activeVisit,
            lastVisit,
            loading: false,
            error:
              activeVisit || lastVisit
                ? null
                : new Error(translation.current('ERROR_NO_ACTIVE_VISIT_FOUND')),
          });
        }
      } catch (err) {
        if (active && currentRequest === request) {
          const { message } = getFormattedError(err);
          setState({
            context,
            activeVisit: null,
            lastVisit: null,
            loading: false,
            error: err instanceof Error ? err : new Error(message),
          });
        }
      }
    };
    const lifecycle = { context, fetch: fetchVisits };
    activeFetch.current = lifecycle;
    void fetchVisits();
    return () => {
      active = false;
      if (activeFetch.current === lifecycle) activeFetch.current = null;
    };
  }, [context]);

  const refetch = useCallback(async () => {
    if (activeFetch.current?.context === context)
      await activeFetch.current.fetch();
  }, [context]);
  // Do not expose an old patient/facility while its replacement effect starts.
  const current = state?.context === context ? state : null;

  return {
    activeVisit: current?.activeVisit ?? null,
    lastVisit: current?.lastVisit ?? null,
    loading: current?.loading ?? true,
    error: current?.error ?? null,
    refetch,
  };
};
