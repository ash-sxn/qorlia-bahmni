import { invoiceName } from '../billingFormat';

describe('Native invoice names', () => {
  it('distinguishes unnamed drafts using their native record IDs', () => {
    expect(invoiceName({ id: 7, name: '/', move_type: 'out_invoice' })).toBe(
      'Draft invoice #7',
    );
    expect(invoiceName({ id: 8, name: false, move_type: 'out_refund' })).toBe(
      'Draft credit note #8',
    );
    expect(invoiceName({ id: 9, name: '', move_type: 'out_invoice' })).toBe(
      'Draft invoice #9',
    );
  });
  it('preserves native issued document numbers', () => {
    expect(invoiceName({ id: 7, name: 'INV/2026/00001' })).toBe(
      'INV/2026/00001',
    );
    expect(invoiceName({ id: 8, name: 'RINV/2026/00001' })).toBe(
      'RINV/2026/00001',
    );
  });
});
