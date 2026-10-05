import { Encounter } from 'fhir/r4';
import { getActiveVisit } from '../encounterService';
import {
  type MatchReasonCode,
  type EncounterMatchDecision,
  MATCH_REASON_MESSAGES,
} from './constants';
import {
  searchEncounters,
  getEncounterSessionDuration,
  getTypedReferenceId,
  sortByMostRecent,
  readSavedEncounter,
} from './encounterSessionService';

export type { MatchReasonCode, EncounterMatchDecision };
export { MATCH_REASON_MESSAGES };

function checkLocationMatch(
  encounter: Encounter,
  loginLocationUUID: string | undefined,
): boolean {
  if (!loginLocationUUID) return true; // location unknown — skip check, don't penalise clinician
  const encounterLocations = encounter.location ?? [];
  return encounterLocations.some(
    (loc) =>
      getTypedReferenceId(loc.location?.reference, 'Location') ===
      loginLocationUUID,
  );
}

function filterEncountersByVisit(
  encounters: Encounter[],
  visitId: string,
): Encounter[] {
  return encounters.filter(
    (enc) =>
      getTypedReferenceId(enc.partOf?.reference, 'Encounter') === visitId,
  );
}

export async function resolveEncounterMatchDecision(
  patientUUID: string,
  practitionerUUID: string,
  locationUUID: string | undefined,
  encounterTypeUUID?: string,
  savedEncounterUUID?: string,
): Promise<EncounterMatchDecision> {
  // 1. Active visit? → NO → NO_ACTIVE_VISIT
  const activeVisit = await getActiveVisit(patientUUID);
  if (!activeVisit?.id) {
    return { matched: false, encounter: null, reasons: ['NO_ACTIVE_VISIT'] };
  }

  // 2. Get session window
  const sessionDuration = await getEncounterSessionDuration();
  const now = Date.now();
  const sessionStartTime = new Date(now - sessionDuration * 60 * 1000);
  const recentUpdatedParam = `ge${sessionStartTime.toISOString()}`;

  // 3. Two parallel searches:
  //    recentEncounters         — all providers, session window  → detect MATCHED / LOCATION_MISMATCH / PROVIDER_MISMATCH
  //    practitionerAllTimeEncounters — this practitioner, all time → detect SESSION_EXPIRED
  const [recentEncounters, practitionerAllTimeEncounters, savedEncounter] =
    await Promise.all([
      searchEncounters({
        patient: patientUUID,
        _tag: 'encounter',
        _lastUpdated: recentUpdatedParam,
        type: encounterTypeUUID,
      }),
      searchEncounters({
        patient: patientUUID,
        _tag: 'encounter',
        participant: practitionerUUID,
        type: encounterTypeUUID,
      }),
      readSavedEncounter(
        savedEncounterUUID,
        patientUUID,
        practitionerUUID,
        activeVisit.id,
        encounterTypeUUID,
      ),
    ]);

  // Search indexing may lag a just-saved widget encounter. Include its current
  // direct read, but retain normal newest-selection and expiry/location rules.
  const currentRecentEncounters = [
    ...recentEncounters.filter(
      (encounter) => !savedEncounterUUID || encounter.id !== savedEncounterUUID,
    ),
    ...(savedEncounter &&
    Date.parse(savedEncounter.meta!.lastUpdated!) >= sessionStartTime.getTime()
      ? [savedEncounter]
      : []),
  ];
  const currentPractitionerEncounters = [
    ...practitionerAllTimeEncounters.filter(
      (encounter) => !savedEncounterUUID || encounter.id !== savedEncounterUUID,
    ),
    ...(savedEncounter ? [savedEncounter] : []),
  ];

  // 4. Filter to current visit only
  const recentEncountersInVisit = filterEncountersByVisit(
    currentRecentEncounters,
    activeVisit.id,
  );
  const practitionerEncountersAllTime = sortByMostRecent(
    filterEncountersByVisit(currentPractitionerEncounters, activeVisit.id),
  );

  // 5. No encounters at all → NO_ACTIVE_ENCOUNTER
  if (
    recentEncountersInVisit.length === 0 &&
    practitionerEncountersAllTime.length === 0
  ) {
    return {
      matched: false,
      encounter: null,
      reasons: ['NO_ACTIVE_ENCOUNTER'],
    };
  }

  // 6. Split recent encounters by practitioner
  const hasParticipant = (
    e: (typeof recentEncountersInVisit)[0],
    uuid: string,
  ) =>
    e.participant?.some(
      (p) =>
        getTypedReferenceId(p.individual?.reference, 'Practitioner') === uuid,
    ) ?? false;

  const currentPractitionerRecentEncounters = sortByMostRecent(
    recentEncountersInVisit.filter((e) => hasParticipant(e, practitionerUUID)),
  );
  const otherProvidersRecentEncounters = sortByMostRecent(
    recentEncountersInVisit.filter((e) => !hasParticipant(e, practitionerUUID)),
  );

  // 7. Recent encounters by this practitioner → MATCHED or LOCATION_MISMATCH
  //    When multiple exist, pick the most recent by period.start.
  if (currentPractitionerRecentEncounters.length >= 1) {
    const encounter = currentPractitionerRecentEncounters[0];
    if (checkLocationMatch(encounter, locationUUID)) {
      return { matched: true, encounter, reasons: ['MATCHED'] };
    }
    return { matched: false, encounter, reasons: ['LOCATION_MISMATCH'] };
  }

  // 9. No recent encounter by this practitioner — check other conditions
  const reasons: MatchReasonCode[] = [];
  let primaryEncounter: Encounter | null = null;

  // Other providers actively working → PROVIDER_MISMATCH
  if (otherProvidersRecentEncounters.length > 0) {
    reasons.push('PROVIDER_MISMATCH');
    primaryEncounter = otherProvidersRecentEncounters[0];
  }

  // This practitioner had an encounter outside session window → SESSION_EXPIRED
  if (practitionerEncountersAllTime.length > 0) {
    reasons.push('SESSION_EXPIRED');
    primaryEncounter ??= practitionerEncountersAllTime[0];
  }

  // 10. Add LOCATION_MISMATCH if primary encounter is at a different location
  if (primaryEncounter && !checkLocationMatch(primaryEncounter, locationUUID)) {
    reasons.push('LOCATION_MISMATCH');
  }

  if (reasons.length === 0) {
    return {
      matched: false,
      encounter: null,
      reasons: ['NO_ACTIVE_ENCOUNTER'],
    };
  }

  return { matched: false, encounter: primaryEncounter, reasons };
}

export function canResumeOwnInSessionEncounter(
  decision: EncounterMatchDecision,
): boolean {
  return (
    decision.matched ||
    (decision.reasons.includes('LOCATION_MISMATCH') &&
      !decision.reasons.includes('SESSION_EXPIRED') &&
      !decision.reasons.includes('PROVIDER_MISMATCH'))
  );
}
