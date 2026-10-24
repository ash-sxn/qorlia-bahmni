import { syntheticPolicies } from '../__fixtures__/syntheticPolicies';
import {
  DEFAULT_FILTERS,
  filterPolicies,
  PolicyFilters,
} from '../filterPolicies';
import { PolicyEntry } from '../types';

const ALL_STATUSES: PolicyFilters = { ...DEFAULT_FILTERS, reviewStatus: 'all' };

const ids = (policies: PolicyEntry[]) => policies.map((policy) => policy.id);

describe('filterPolicies search', () => {
  it('returns every policy for an empty search', () => {
    const result = filterPolicies(syntheticPolicies, ALL_STATUSES);

    expect(ids(result)).toEqual([
      'synthetic-mp-digital-health',
      'synthetic-central-data-protection',
      'synthetic-mp-scheme-draft',
    ]);
  });

  it('matches the title ignoring case', () => {
    const result = filterPolicies(syntheticPolicies, {
      ...ALL_STATUSES,
      query: 'DIGITAL',
    });

    expect(ids(result)).toEqual(['synthetic-mp-digital-health']);
  });

  it('ignores spaces around the search text', () => {
    const result = filterPolicies(syntheticPolicies, {
      ...ALL_STATUSES,
      query: '  notice  ',
    });

    expect(ids(result)).toEqual(['synthetic-central-data-protection']);
  });

  it('matches the authority and the summary', () => {
    const policies = [
      {
        ...syntheticPolicies[0],
        id: 'by-authority',
        authority: 'Synthetic health board',
      },
      {
        ...syntheticPolicies[1],
        id: 'by-summary',
        summary: 'Synthetic text about the health board.',
      },
      { ...syntheticPolicies[2], id: 'no-match' },
    ];

    const result = filterPolicies(policies, {
      ...ALL_STATUSES,
      query: 'health board',
    });

    expect(ids(result)).toEqual(['by-authority', 'by-summary']);
  });

  it('returns nothing when no policy matches', () => {
    const result = filterPolicies(syntheticPolicies, {
      ...ALL_STATUSES,
      query: 'no such policy',
    });

    expect(result).toEqual([]);
  });
});

describe('filterPolicies filters', () => {
  it('shows only reviewed policies by default', () => {
    const result = filterPolicies(syntheticPolicies, DEFAULT_FILTERS);

    expect(ids(result)).toEqual([
      'synthetic-mp-digital-health',
      'synthetic-central-data-protection',
    ]);
  });

  it('filters by jurisdiction', () => {
    const result = filterPolicies(syntheticPolicies, {
      ...ALL_STATUSES,
      jurisdiction: 'madhya_pradesh',
    });

    expect(ids(result)).toEqual([
      'synthetic-mp-digital-health',
      'synthetic-mp-scheme-draft',
    ]);
  });

  it('filters by category', () => {
    const result = filterPolicies(syntheticPolicies, {
      ...ALL_STATUSES,
      category: 'data_protection',
    });

    expect(ids(result)).toEqual(['synthetic-central-data-protection']);
  });

  it('combines search with every filter', () => {
    const result = filterPolicies(syntheticPolicies, {
      ...DEFAULT_FILTERS,
      query: 'synthetic',
      jurisdiction: 'madhya_pradesh',
      category: 'digital_health',
    });

    expect(ids(result)).toEqual(['synthetic-mp-digital-health']);
  });

  it('keeps a draft hidden even when it matches the other filters', () => {
    const result = filterPolicies(syntheticPolicies, {
      ...DEFAULT_FILTERS,
      jurisdiction: 'madhya_pradesh',
      category: 'government_schemes',
    });

    expect(result).toEqual([]);
  });
});
