import { CaseListResult, InsuranceCase } from './types';
import { validateCases } from './validateCases';

/**
 * Development builds show the labelled synthetic cases so the screens can be
 * reviewed. Production builds have no cases until real data is approved.
 */
export const usesSyntheticCases = process.env.NODE_ENV !== 'production';

// The check must stay inline. Bundlers only drop the fixtures from production
// when the condition is a literal NODE_ENV test, and not a variable like the one above.
const availableCases: InsuranceCase[] =
  process.env.NODE_ENV !== 'production'
    ? // eslint-disable-next-line @typescript-eslint/no-require-imports
      require('./__fixtures__/syntheticCases').syntheticCases
    : [];

export const loadCases = (): CaseListResult => validateCases(availableCases);

/** True when there is at least one valid case, so the Home tile is worth showing. */
export const hasCases = (result: CaseListResult): boolean =>
  result.ok && result.cases.length > 0;
