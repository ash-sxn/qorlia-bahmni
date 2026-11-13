import { filtersFromParams, filtersToParams } from '../filterParams';
import { DEFAULT_FILTERS, PolicyFilters } from '../filterPolicies';

describe('filterParams', () => {
  it('keeps the URL empty for the default filters', () => {
    expect(filtersToParams(DEFAULT_FILTERS).toString()).toBe('');
  });

  it('writes only the filters that differ from the defaults', () => {
    const filters: PolicyFilters = {
      query: 'digital health',
      jurisdiction: 'central',
      category: 'data_protection',
      reviewStatus: 'all',
    };

    expect(filtersToParams(filters).toString()).toBe(
      'q=digital+health&jurisdiction=central&category=data_protection&status=all',
    );
  });

  it('reads back the same filters it wrote', () => {
    const filters: PolicyFilters = {
      query: 'notice',
      jurisdiction: 'madhya_pradesh',
      category: 'all',
      reviewStatus: 'all',
    };

    expect(filtersFromParams(filtersToParams(filters))).toEqual(filters);
  });

  it('falls back to the defaults for missing or unknown values', () => {
    const params = new URLSearchParams(
      'jurisdiction=delhi&category=sports&status=anything',
    );

    expect(filtersFromParams(params)).toEqual(DEFAULT_FILTERS);
  });
});
