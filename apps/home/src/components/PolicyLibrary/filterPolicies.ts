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

export const filterPolicies = (
  policies: readonly PolicyEntry[],
  filters: PolicyFilters,
): PolicyEntry[] =>
  policies.filter((policy) => matchesQuery(policy, filters.query));
