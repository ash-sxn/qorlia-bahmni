import {
  SYNTHETIC_APPROVED_HOSTS,
  syntheticPolicies,
} from '../__fixtures__/syntheticPolicies';
import { validateCatalogue } from '../validateCatalogue';

describe('syntheticPolicies', () => {
  it('passes the catalogue validator', () => {
    const result = validateCatalogue(
      syntheticPolicies,
      SYNTHETIC_APPROVED_HOSTS,
    );

    expect(result).toEqual({ ok: true, entries: syntheticPolicies });
  });

  it('labels every entry as a synthetic example', () => {
    syntheticPolicies.forEach((policy) => {
      expect(policy.title.startsWith('Synthetic example:')).toBe(true);
    });
  });

  it('uses only the reserved example.org domain for sources', () => {
    syntheticPolicies.forEach((policy) => {
      expect(new URL(policy.sourceUrl).hostname).toBe('www.example.org');
    });
  });

  it('includes reviewed and draft entries for the filter tests', () => {
    const statuses = syntheticPolicies.map((policy) => policy.reviewStatus);

    expect(statuses).toContain('reviewed');
    expect(statuses).toContain('draft');
  });
});
