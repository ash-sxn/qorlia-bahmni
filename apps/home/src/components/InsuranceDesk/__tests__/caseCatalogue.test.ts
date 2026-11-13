import { syntheticCases } from '../__fixtures__/syntheticCases';
import { hasCases, loadCases } from '../caseCatalogue';

describe('caseCatalogue', () => {
  it('loads the valid synthetic cases outside production', () => {
    expect(loadCases()).toEqual({ ok: true, cases: syntheticCases });
  });

  it('has no cases in a production build', () => {
    const previous = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';

    jest.isolateModules(() => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const catalogue = require('../caseCatalogue');

      expect(catalogue.loadCases()).toEqual({ ok: true, cases: [] });
    });

    process.env.NODE_ENV = previous;
  });

  describe('hasCases', () => {
    it('is true with at least one case', () => {
      expect(hasCases({ ok: true, cases: syntheticCases })).toBe(true);
    });

    it('is false with no cases', () => {
      expect(hasCases({ ok: true, cases: [] })).toBe(false);
    });

    it('is false when validation failed', () => {
      expect(hasCases({ ok: false, errors: ['bad case'] })).toBe(false);
    });
  });
});
