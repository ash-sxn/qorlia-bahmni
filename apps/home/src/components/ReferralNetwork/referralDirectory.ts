import publishedDirectory from './directory/referrals.json';
import { DirectoryResult } from './types';
import { validateDirectory } from './validateDirectory';

/**
 * Development builds show the labelled synthetic examples so the screens can
 * be reviewed. Production builds show only the verified, published directory.
 */
export const usesSyntheticReferrals = process.env.NODE_ENV !== 'production';

// The check must stay inline. Bundlers only drop the fixtures from production
// when the condition is a literal NODE_ENV test, and not a variable like the one above.
const syntheticFixtures =
  process.env.NODE_ENV !== 'production'
    ? // eslint-disable-next-line @typescript-eslint/no-require-imports
      (require('./__fixtures__/syntheticReferrals') as typeof import('./__fixtures__/syntheticReferrals'))
    : null;

export const loadDirectory = (): DirectoryResult =>
  validateDirectory(
    syntheticFixtures
      ? syntheticFixtures.syntheticReferrals
      : publishedDirectory,
  );

/** True when there is at least one valid entry, so the Home tile is worth showing. */
export const hasReferralEntries = (result: DirectoryResult): boolean =>
  result.ok && result.entries.length > 0;
