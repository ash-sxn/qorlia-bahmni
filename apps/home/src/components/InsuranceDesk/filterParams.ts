import { CaseFilters, DEFAULT_FILTERS } from './filterCases';
import { CASE_STATUSES, CLAIM_ROUTES } from './types';

const PARAM_NAMES: Record<keyof CaseFilters, string> = {
  query: 'q',
  status: 'status',
  route: 'route',
  payer: 'payer',
};

const oneOf = <T extends string>(
  value: string | null,
  allowed: readonly T[],
  fallback: T,
): T => (allowed.includes(value as T) ? (value as T) : fallback);

/** Reads filters from the URL. Missing or unknown values fall back to the defaults. */
export const filtersFromParams = (
  params: URLSearchParams,
  payers: readonly string[],
): CaseFilters => ({
  query: params.get(PARAM_NAMES.query) ?? DEFAULT_FILTERS.query,
  status: oneOf<CaseFilters['status']>(
    params.get(PARAM_NAMES.status),
    ['all', ...CASE_STATUSES],
    DEFAULT_FILTERS.status,
  ),
  route: oneOf<CaseFilters['route']>(
    params.get(PARAM_NAMES.route),
    ['all', ...CLAIM_ROUTES],
    DEFAULT_FILTERS.route,
  ),
  payer: oneOf(params.get(PARAM_NAMES.payer), payers, DEFAULT_FILTERS.payer),
});

/** Writes only the filters that differ from the defaults, so the plain list keeps a clean URL. */
export const filtersToParams = (filters: CaseFilters): URLSearchParams => {
  const params = new URLSearchParams();
  (Object.keys(PARAM_NAMES) as (keyof CaseFilters)[]).forEach((key) => {
    if (filters[key] !== DEFAULT_FILTERS[key]) {
      params.set(PARAM_NAMES[key], filters[key]);
    }
  });
  return params;
};
