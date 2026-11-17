import {
  COST_HEADS,
  CostHead,
  formatRupees,
  parseRupees,
  totalEstimate,
} from '../preauthEstimate';

const amounts = (filled: Partial<Record<CostHead, string>>) =>
  ({
    ...Object.fromEntries(COST_HEADS.map((head) => [head, ''])),
    ...filled,
  }) as Record<CostHead, string>;

describe('parseRupees', () => {
  it.each([
    ['', 0],
    ['   ', 0],
    ['4500', 4500],
    ['1,25,000', 125000],
    ['12 000', 12000],
  ])('reads %j as %d', (text, rupees) => {
    expect(parseRupees(text)).toBe(rupees);
  });

  it.each(['45.50', '-100', 'ten thousand', '₹500', '1234567890'])(
    'rejects %j',
    (text) => {
      expect(parseRupees(text)).toBeNull();
    },
  );
});

describe('totalEstimate', () => {
  it('adds every head and counts an empty head as zero', () => {
    expect(
      totalEstimate(
        amounts({ room: '12,000', theatre: '30000', other: '500' }),
      ),
    ).toBe(42500);
    expect(totalEstimate(amounts({}))).toBe(0);
  });

  it('gives no total while any head is not an amount', () => {
    expect(totalEstimate(amounts({ room: '12000', icu: 'abc' }))).toBeNull();
  });
});

describe('formatRupees', () => {
  it('uses Indian digit grouping', () => {
    expect(formatRupees(125000)).toBe('₹1,25,000');
    expect(formatRupees(0)).toBe('₹0');
  });
});
