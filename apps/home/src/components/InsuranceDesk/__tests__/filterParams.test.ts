import { CaseFilters, DEFAULT_FILTERS } from '../filterCases';
import { filtersFromParams, filtersToParams } from '../filterParams';

const PAYERS = ['Synthetic Insurer A', 'Synthetic Insurer B'];

describe('filtersFromParams', () => {
  it('uses the defaults for an empty URL', () => {
    expect(filtersFromParams(new URLSearchParams(), PAYERS)).toEqual(
      DEFAULT_FILTERS,
    );
  });

  it('reads every filter', () => {
    const params = new URLSearchParams(
      'q=syn&status=settled&route=cashless&payer=Synthetic+Insurer+B',
    );

    expect(filtersFromParams(params, PAYERS)).toEqual({
      query: 'syn',
      status: 'settled',
      route: 'cashless',
      payer: 'Synthetic Insurer B',
    });
  });

  it('falls back to the defaults for unknown values', () => {
    const params = new URLSearchParams(
      'status=paid&route=cash&payer=Unknown+insurer',
    );

    expect(filtersFromParams(params, PAYERS)).toEqual(DEFAULT_FILTERS);
  });
});

describe('filtersToParams', () => {
  it('writes nothing for the defaults', () => {
    expect(filtersToParams(DEFAULT_FILTERS).toString()).toBe('');
  });

  it('writes only the filters that changed', () => {
    expect(
      filtersToParams({ ...DEFAULT_FILTERS, status: 'denied' }).toString(),
    ).toBe('status=denied');
  });

  it('round-trips through the URL', () => {
    const filters: CaseFilters = {
      query: 'syn pol',
      status: 'short_paid',
      route: 'cashless',
      payer: 'Synthetic Insurer A',
    };

    expect(filtersFromParams(filtersToParams(filters), PAYERS)).toEqual(
      filters,
    );
  });
});
