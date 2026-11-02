import { syntheticCases } from '../__fixtures__/syntheticCases';
import {
  DEFAULT_FILTERS,
  filterCases,
  payerNames,
  sortCases,
} from '../filterCases';

const idsFor = (changes: Partial<typeof DEFAULT_FILTERS>) =>
  filterCases(syntheticCases, { ...DEFAULT_FILTERS, ...changes }).map(
    ({ id }) => id,
  );

describe('filterCases', () => {
  it('returns every case with the default filters', () => {
    expect(idsFor({})).toHaveLength(syntheticCases.length);
  });

  it.each([
    ['patient name', 'synthetic patient 0008'],
    ['patient identifier', 'SYN-PAT-0008'],
    ['policy number', 'syn-pol-0008'],
    ['payer reference', 'SYN-AUTH-0008'],
  ])('searches by %s, ignoring case', (_field, query) => {
    expect(idsFor({ query })).toEqual(['synthetic-cashless-settled-with-tds']);
  });

  it('searches by TPA and ignores surrounding spaces', () => {
    expect(idsFor({ query: '  synthetic tpa two ' })).toEqual([
      'synthetic-cashless-final-approved',
      'synthetic-cashless-claim-submitted',
    ]);
  });

  it('finds nothing for an unknown search', () => {
    expect(idsFor({ query: 'no such case' })).toEqual([]);
  });

  it('filters by status', () => {
    expect(idsFor({ status: 'denied' })).toEqual(['synthetic-cashless-denied']);
  });

  it('filters by route', () => {
    expect(idsFor({ route: 'reimbursement' })).toEqual([
      'synthetic-reimbursement-documents-handed-over',
      'synthetic-reimbursement-closed-after-denial',
    ]);
  });

  it('filters by payer', () => {
    expect(idsFor({ payer: 'Synthetic Insurer B' })).toEqual([
      'synthetic-cashless-preauthorisation-approved',
      'synthetic-cashless-enhancement-pending',
      'synthetic-cashless-short-paid-with-tds',
    ]);
  });

  it('combines the search and every filter', () => {
    expect(
      idsFor({
        query: 'SYN-POL-0009',
        status: 'short_paid',
        route: 'cashless',
        payer: 'Synthetic Insurer B',
      }),
    ).toEqual(['synthetic-cashless-short-paid-with-tds']);
    expect(idsFor({ query: 'SYN-POL-0009', status: 'denied' })).toEqual([]);
  });
});

describe('sortCases', () => {
  it('puts the most recently updated case first without changing the input', () => {
    const before = [...syntheticCases];

    const sorted = sortCases(syntheticCases);

    expect(sorted[0].id).toBe('synthetic-cashless-settled-with-tds');
    expect(sorted[1].id).toBe('synthetic-cashless-short-paid-with-tds');
    expect(syntheticCases).toEqual(before);
  });

  it('compares across time zones', () => {
    const [first, second] = syntheticCases;
    const earlier = {
      ...first,
      id: 'earlier',
      statusRecordedAt: '2026-10-01T10:00:00+05:30',
    };
    const later = {
      ...second,
      id: 'later',
      statusRecordedAt: '2026-10-01T05:00:00Z',
    };

    expect(sortCases([earlier, later]).map(({ id }) => id)).toEqual([
      'later',
      'earlier',
    ]);
  });

  it('breaks ties by id', () => {
    const [first] = syntheticCases;

    expect(
      sortCases([
        { ...first, id: 'b' },
        { ...first, id: 'a' },
      ]).map(({ id }) => id),
    ).toEqual(['a', 'b']);
  });
});

describe('payerNames', () => {
  it('lists each payer once, in order', () => {
    expect(payerNames(syntheticCases)).toEqual([
      'Synthetic Insurer A',
      'Synthetic Insurer B',
      'Synthetic Insurer C',
    ]);
  });
});
