import { CaseStatus, ClaimRoute, InsuranceCase } from './types';

export interface CaseFilters {
  query: string;
  status: CaseStatus | 'all';
  route: ClaimRoute | 'all';
  payer: string;
}

export const DEFAULT_FILTERS: CaseFilters = {
  query: '',
  status: 'all',
  route: 'all',
  payer: 'all',
};

const matchesQuery = (insuranceCase: InsuranceCase, query: string): boolean => {
  const searchText = query.trim().toLowerCase();
  if (searchText === '') {
    return true;
  }

  return [
    insuranceCase.patientDisplayName,
    insuranceCase.patientIdentifier,
    insuranceCase.policyNumber,
    insuranceCase.payerName,
    insuranceCase.tpaName,
    insuranceCase.payerReference,
  ].some((text) => text?.toLowerCase().includes(searchText));
};

const matchesSelection = (value: string, selected: string): boolean =>
  selected === 'all' || value === selected;

export const filterCases = (
  cases: readonly InsuranceCase[],
  filters: CaseFilters,
): InsuranceCase[] =>
  cases.filter(
    (insuranceCase) =>
      matchesQuery(insuranceCase, filters.query) &&
      matchesSelection(insuranceCase.status, filters.status) &&
      matchesSelection(insuranceCase.claimRoute, filters.route) &&
      matchesSelection(insuranceCase.payerName, filters.payer),
  );

/** Most recently updated first, then by id so the order never changes between renders. */
export const sortCases = (cases: readonly InsuranceCase[]): InsuranceCase[] =>
  [...cases].sort(
    (a, b) =>
      Date.parse(b.statusRecordedAt) - Date.parse(a.statusRecordedAt) ||
      a.id.localeCompare(b.id),
  );

/** The payers present in the cases, for the payer filter. Payers are data, not a fixed list. */
export const payerNames = (cases: readonly InsuranceCase[]): string[] =>
  [...new Set(cases.map(({ payerName }) => payerName))].sort((a, b) =>
    a.localeCompare(b),
  );
