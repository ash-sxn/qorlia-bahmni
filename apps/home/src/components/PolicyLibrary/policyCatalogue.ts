import publishedCatalogue from './catalogue/policies.json';
import { CatalogueResult } from './types';
import { validateCatalogue } from './validateCatalogue';

/**
 * Official source hosts approved by the content reviewer (#41). Each is the
 * own site of the body that issues the rule. Add a host only with the same
 * test. Hosts match exactly, so list the name without "www.".
 */
export const APPROVED_SOURCE_HOSTS: readonly string[] = [
  'mohfw.gov.in',
  'nhm.gov.in',
  'abdm.gov.in',
  'nha.gov.in',
  'health.mp.gov.in',
  'egazette.gov.in',
  'pmjay.gov.in',
  'pib.gov.in',
  'cghs.mohfw.gov.in',
  'esic.gov.in',
  'cpcb.nic.in',
  'mppcb.mp.gov.in',
  'aerb.gov.in',
  'cdsco.gov.in',
  'nabh.co',
  'meity.gov.in',
  'indiacode.nic.in',
  'boi.gov.in',
];

/**
 * Development builds show the labelled synthetic examples so the screens can
 * be reviewed. Production builds show only the publishable catalogue.
 */
export const usesSyntheticExamples = process.env.NODE_ENV !== 'production';

// The check must stay inline. Bundlers only drop the fixtures from production
// when the condition is a literal NODE_ENV test, and not a variable like the one above.
const syntheticFixtures =
  process.env.NODE_ENV !== 'production'
    ? // eslint-disable-next-line @typescript-eslint/no-require-imports
      (require('./__fixtures__/syntheticPolicies') as typeof import('./__fixtures__/syntheticPolicies'))
    : null;

export const loadPolicyCatalogue = (): CatalogueResult =>
  syntheticFixtures
    ? validateCatalogue(
        syntheticFixtures.syntheticPolicies,
        syntheticFixtures.SYNTHETIC_APPROVED_HOSTS,
      )
    : validateCatalogue(publishedCatalogue, APPROVED_SOURCE_HOSTS);

/** True when there is at least one valid entry, so the Home tile is worth showing. */
export const hasPolicyEntries = (result: CatalogueResult): boolean =>
  result.ok && result.entries.length > 0;
