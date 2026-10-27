import { DEFAULT_FILTERS, PolicyFilters } from './filterPolicies';
import { CATEGORIES, JURISDICTIONS } from './types';

const PARAM_NAMES: Record<keyof PolicyFilters, string> = {
  query: 'q',
  jurisdiction: 'jurisdiction',
  category: 'category',
  reviewStatus: 'status',
};

const oneOf = <T extends string>(
  value: string | null,
  allowed: readonly T[],
  fallback: T,
): T => (allowed.includes(value as T) ? (value as T) : fallback);

/** Reads filters from the URL. Missing or unknown values fall back to the defaults. */
export const filtersFromParams = (params: URLSearchParams): PolicyFilters => ({
  query: params.get(PARAM_NAMES.query) ?? DEFAULT_FILTERS.query,
  jurisdiction: oneOf<PolicyFilters['jurisdiction']>(
    params.get(PARAM_NAMES.jurisdiction),
    ['all', ...JURISDICTIONS],
    DEFAULT_FILTERS.jurisdiction,
  ),
  category: oneOf<PolicyFilters['category']>(
    params.get(PARAM_NAMES.category),
    ['all', ...CATEGORIES],
    DEFAULT_FILTERS.category,
  ),
  reviewStatus: oneOf<PolicyFilters['reviewStatus']>(
    params.get(PARAM_NAMES.reviewStatus),
    ['reviewed', 'all'],
    DEFAULT_FILTERS.reviewStatus,
  ),
});

/** Writes only the filters that differ from the defaults, so the plain list keeps a clean URL. */
export const filtersToParams = (filters: PolicyFilters): URLSearchParams => {
  const params = new URLSearchParams();
  (Object.keys(PARAM_NAMES) as (keyof PolicyFilters)[]).forEach((key) => {
    if (filters[key] !== DEFAULT_FILTERS[key]) {
      params.set(PARAM_NAMES[key], filters[key]);
    }
  });
  return params;
};
