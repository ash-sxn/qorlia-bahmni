import {
  SYNTHETIC_APPROVED_HOSTS,
  syntheticPolicies,
} from './__fixtures__/syntheticPolicies';
import publishedCatalogue from './catalogue/policies.json';
import { CatalogueResult } from './types';
import { validateCatalogue } from './validateCatalogue';

/**
 * Official source hosts approved by the content reviewer. Empty until the
 * reviewer approves them, so no real entry can pass validation before then.
 */
export const APPROVED_SOURCE_HOSTS: readonly string[] = [];

/**
 * Development builds show the labelled synthetic examples so the screens can
 * be reviewed. Production builds show only the publishable catalogue.
 */
export const usesSyntheticExamples = process.env.NODE_ENV !== 'production';

export const loadPolicyCatalogue = (): CatalogueResult =>
  usesSyntheticExamples
    ? validateCatalogue(syntheticPolicies, SYNTHETIC_APPROVED_HOSTS)
    : validateCatalogue(publishedCatalogue, APPROVED_SOURCE_HOSTS);
