import {
  CustomerPaymentRow,
  getCustomerPaymentHistory,
} from './billingService';

export interface MethodTotal {
  journal: string;
  currency: string;
  received: number;
  refunded: number;
  count: number;
}

export interface DayEnd {
  date: string;
  methods: MethodTotal[];
  payments: CustomerPaymentRow[];
  /** Draft payments that day: not money in hand until they are posted. */
  drafts: number;
}

// History is newest first, 25 a page. This bounds one report to 2,000
// payments, far beyond a clinic's day, and says so if it is reached.
const MAX_PAGES = 80;

const round = (amount: number) => Math.round(amount * 100) / 100;

/** Totals by payment method; cancelled payments never count. */
export const summarise = (date: string, rows: CustomerPaymentRow[]): DayEnd => {
  const day = rows.filter((row) => row.date === date);
  const posted = day.filter((row) => row.state === 'posted');
  const methods = new Map<string, MethodTotal>();
  for (const row of posted) {
    const key = `${row.journal}\u0000${row.currency[1]}`;
    const total = methods.get(key) ?? {
      journal: row.journal,
      currency: row.currency[1],
      received: 0,
      refunded: 0,
      count: 0,
    };
    if (row.direction === 'inbound') total.received += row.amount;
    else total.refunded += row.amount;
    total.count += 1;
    methods.set(key, total);
  }
  return {
    date,
    methods: [...methods.values()]
      .map((total) => ({
        ...total,
        received: round(total.received),
        refunded: round(total.refunded),
      }))
      .sort((a, b) => a.journal.localeCompare(b.journal)),
    payments: posted,
    drafts: day.filter((row) => row.state === 'draft').length,
  };
};

/**
 * Reads every customer payment dated on one day. History is ordered by date,
 * newest first, so reading stops at the first page that reaches an earlier day.
 */
export async function getDayEnd(date: string): Promise<DayEnd> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('Choose a valid day.');
  const rows: CustomerPaymentRow[] = [];
  for (let page = 0, offset = 0; ; page++) {
    if (page === MAX_PAGES)
      throw new Error(
        'Too many payments to total here. Use the Accounting reports for this day.',
      );
    const result = await getCustomerPaymentHistory('', offset);
    rows.push(...result.rows);
    const reachedEarlierDay = result.rows.some((row) => row.date < date);
    if (!result.has_more || reachedEarlierDay) break;
    offset += result.rows.length;
  }
  return summarise(date, rows);
}
