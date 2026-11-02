import { syntheticCases } from './__fixtures__/syntheticCases';
import { CaseListResult } from './types';
import { validateCases } from './validateCases';

/**
 * Development builds show the labelled synthetic cases so the screens can be
 * reviewed. Production builds have no cases until real data is approved.
 */
export const usesSyntheticCases = process.env.NODE_ENV !== 'production';

export const loadCases = (): CaseListResult =>
  validateCases(usesSyntheticCases ? syntheticCases : []);

/** True when there is at least one valid case, so the Home tile is worth showing. */
export const hasCases = (result: CaseListResult): boolean =>
  result.ok && result.cases.length > 0;
