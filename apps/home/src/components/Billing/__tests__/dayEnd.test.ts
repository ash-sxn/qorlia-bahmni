import {
  CustomerPaymentRow,
  getCustomerPaymentHistory,
} from '../billingService';
import { getDayEnd, summarise } from '../dayEnd';

jest.mock('../billingService', () => ({
  ...jest.requireActual('../billingService'),
  getCustomerPaymentHistory: jest.fn(),
}));

let nextId = 1;
const row = (
  overrides: Partial<CustomerPaymentRow> = {},
): CustomerPaymentRow => ({
  payment_id: nextId++,
  name: 'PCSH1/2026/00001',
  date: '2026-11-11',
  customer: 'QorliaQA Patient',
  amount: 500,
  currency: [20, 'INR'],
  journal: 'Cash',
  method: 'Manual',
  direction: 'inbound',
  state: 'posted',
  reference: '',
  ...overrides,
});

describe('summarise', () => {
  it('totals posted money in and out by method for the day only', () => {
    const report = summarise('2026-11-11', [
      row({ amount: 500 }),
      row({ amount: 200.1, journal: 'Bank' }),
      row({ amount: 0.2, journal: 'Bank' }),
      row({ amount: 100, direction: 'outbound' }),
      row({ amount: 999, state: 'cancel' }),
      row({ amount: 50, state: 'draft' }),
      row({ amount: 700, date: '2026-11-10' }),
    ]);
    expect(report.methods).toEqual([
      {
        journal: 'Bank',
        currency: 'INR',
        received: 200.3,
        refunded: 0,
        count: 2,
      },
      {
        journal: 'Cash',
        currency: 'INR',
        received: 500,
        refunded: 100,
        count: 2,
      },
    ]);
    expect(report.drafts).toBe(1);
    expect(report.payments).toHaveLength(4);
  });

  it('keeps currencies apart', () => {
    const report = summarise('2026-11-11', [
      row(),
      row({ currency: [2, 'USD'] }),
    ]);
    expect(report.methods.map((method) => method.currency)).toEqual([
      'INR',
      'USD',
    ]);
  });
});

describe('getDayEnd', () => {
  beforeEach(() => jest.clearAllMocks());

  it('reads newest-first pages until it reaches an earlier day', async () => {
    jest
      .mocked(getCustomerPaymentHistory)
      .mockResolvedValueOnce({
        rows: [row({ date: '2026-11-12' }), row()],
        offset: 0,
        has_more: true,
      })
      .mockResolvedValueOnce({
        rows: [row({ amount: 300 }), row({ date: '2026-11-10' })],
        offset: 2,
        has_more: true,
      });

    const report = await getDayEnd('2026-11-11');

    expect(getCustomerPaymentHistory).toHaveBeenCalledTimes(2);
    expect(getCustomerPaymentHistory).toHaveBeenNthCalledWith(2, '', 2);
    expect(report.methods[0].received).toBe(800);
  });

  it('refuses an invalid day without asking Billing', async () => {
    await expect(getDayEnd('11/11/2026')).rejects.toThrow('valid day');
    expect(getCustomerPaymentHistory).not.toHaveBeenCalled();
  });
});
