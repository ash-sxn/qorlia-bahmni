import { syntheticPolicies } from '../__fixtures__/syntheticPolicies';
import publishedCatalogue from '../catalogue/policies.json';
import {
  APPROVED_SOURCE_HOSTS,
  hasPolicyEntries,
  loadPolicyCatalogue,
} from '../policyCatalogue';
import { validateCatalogue } from '../validateCatalogue';

describe('policyCatalogue', () => {
  it('accepts every entry in the publishable catalogue', () => {
    const result = validateCatalogue(publishedCatalogue, APPROVED_SOURCE_HOSTS);

    expect(result.ok ? [] : result.errors).toEqual([]);
    expect(publishedCatalogue).toHaveLength(14);
  });

  it('publishes only reviewed entries, each checked by both reviewers', () => {
    publishedCatalogue.forEach((entry) => {
      expect(entry.reviewStatus).toBe('reviewed');
      expect(entry.reviewer).toBe('Aniket Motiwal; Ashutosh');
      expect(entry.reviewDueOn).not.toBeNull();
    });
  });

  it('approves only bare https host names, each once', () => {
    expect(new Set(APPROVED_SOURCE_HOSTS).size).toBe(
      APPROVED_SOURCE_HOSTS.length,
    );
    APPROVED_SOURCE_HOSTS.forEach((host) => {
      expect(new URL(`https://${host}`).hostname).toBe(host);
      expect(host).not.toMatch(/^www\./);
    });
  });

  it('loads the validated synthetic examples outside production', () => {
    const result = loadPolicyCatalogue();

    expect(result.ok).toBe(true);
    expect(result.ok && result.entries).toHaveLength(3);
  });

  it('loads only the publishable catalogue in a production build', () => {
    const previous = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';

    jest.isolateModules(() => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const catalogue = require('../policyCatalogue');

      expect(catalogue.loadPolicyCatalogue()).toEqual({
        ok: true,
        entries: publishedCatalogue,
      });
    });

    process.env.NODE_ENV = previous;
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
