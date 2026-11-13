import { Jurisdiction, PolicyCategory, PolicyEntry } from './types';

export interface PolicyFilters {
  query: string;
  jurisdiction: Jurisdiction | 'all';
  category: PolicyCategory | 'all';
  reviewStatus: 'reviewed' | 'all';
}

export const DEFAULT_FILTERS: PolicyFilters = {
  query: '',
  jurisdiction: 'all',
  category: 'all',
  reviewStatus: 'reviewed',
};

const matchesQuery = (policy: PolicyEntry, query: string): boolean => {
  const searchText = query.trim().toLowerCase();
  if (searchText === '') {
    return true;
  }

  return [policy.title, policy.authority, policy.summary].some((text) =>
    text.toLowerCase().includes(searchText),
  );
};

const matchesSelection = (value: string, selected: string): boolean =>
  selected === 'all' || value === selected;

export const filterPolicies = (
  policies: readonly PolicyEntry[],
  filters: PolicyFilters,
): PolicyEntry[] =>
  policies.filter(
    (policy) =>
      matchesQuery(policy, filters.query) &&
      matchesSelection(policy.jurisdiction, filters.jurisdiction) &&
      matchesSelection(policy.category, filters.category) &&
      matchesSelection(policy.reviewStatus, filters.reviewStatus),
  );

const compareText = (a: string, b: string): number => {
  if (a < b) {
    return -1;
  }
  if (a > b) {
    return 1;
  }
  return 0;
};

const compareNewestFirst = (a: string | null, b: string | null): number => {
  if (a === b) {
    return 0;
  }
  if (a === null) {
    return 1;
  }
  if (b === null) {
    return -1;
  }
  return compareText(b, a);
};

export const sortPolicies = (policies: readonly PolicyEntry[]): PolicyEntry[] =>
  [...policies].sort(
    (a, b) =>
      compareNewestFirst(a.publishedOn, b.publishedOn) ||
      compareText(a.title, b.title) ||
      compareText(a.id, b.id),
  );
