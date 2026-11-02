import { syntheticPolicies } from '../__fixtures__/syntheticPolicies';
import publishedCatalogue from '../catalogue/policies.json';
import {
  APPROVED_SOURCE_HOSTS,
  hasPolicyEntries,
  loadPolicyCatalogue,
} from '../policyCatalogue';
import { validateCatalogue } from '../validateCatalogue';

describe('policyCatalogue', () => {
  it('keeps the publishable catalogue empty until content is approved', () => {
    expect(
      validateCatalogue(publishedCatalogue, APPROVED_SOURCE_HOSTS),
    ).toEqual({ ok: true, entries: [] });
  });

  it('loads the validated synthetic examples outside production', () => {
    const result = loadPolicyCatalogue();

    expect(result.ok).toBe(true);
    expect(result.ok && result.entries).toHaveLength(3);
  });

  describe('hasPolicyEntries', () => {
    it('is true when the catalogue is valid and has at least one entry', () => {
      expect(
        hasPolicyEntries({ ok: true, entries: [syntheticPolicies[0]] }),
      ).toBe(true);
    });

    it('is false when the catalogue is valid but empty', () => {
      expect(hasPolicyEntries({ ok: true, entries: [] })).toBe(false);
    });

    it('is false when the catalogue failed validation', () => {
      expect(hasPolicyEntries({ ok: false, errors: ['bad entry'] })).toBe(
        false,
      );
    });
  });
});
