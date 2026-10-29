import publishedCatalogue from '../catalogue/policies.json';
import { APPROVED_SOURCE_HOSTS, loadPolicyCatalogue } from '../policyCatalogue';
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
});
