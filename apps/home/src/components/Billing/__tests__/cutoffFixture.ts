import {
  CutoffData,
  CutoffRequest,
  CutoffReview,
  CutoffSaved,
} from '../billingService';

export const cutoffFixture = (): CutoffData => ({
  invoice_id: 7,
  line_id: 17,
  name: 'INV/QorliaQA/7',
  version: 'a'.repeat(64),
  values: {
    date: '2026-10-10',
    percentage: 50,
    total_amount: -250,
    journal_id: 2,
    revenue_accrual_account: 12,
    expense_accrual_account: false,
  },
  labels: {
    journal_id: [2, 'QorliaQA General journal'],
    revenue_accrual_account: [12, 'QorliaQA Deferred revenue'],
  },
  account_type: 'income',
  currency: [1, 'INR'],
  source_account: [5, '4000 Clinical income'],
  source_balance: -500,
  company: 'QorliaQA Hospital',
  can_create: true,
  lock_date_message: false,
});
export const cutoffReview = (): CutoffReview => ({
  ...cutoffFixture(),
  review_version: 'b'.repeat(64),
  reconcile_accrual_rows: true,
  default_changes: {
    journal: [2, 'QorliaQA General journal'],
    account: [12, 'QorliaQA Deferred revenue'],
    account_type: 'income',
  },
  entries: ['recognition', 'adjustment'].map((kind) => ({
    kind: kind as 'recognition' | 'adjustment',
    date: '2026-10-10',
    ref: `QorliaQA ${kind}`,
    state: 'posted',
    rows: [
      {
        role: 'source',
        name: 'QorliaQA Consultation',
        account_id: [5, '4000 Clinical income'],
        partner_id: [3, 'QorliaQA Patient'],
        currency_id: [1, 'INR'],
        debit: kind === 'recognition' ? 0 : 250,
        credit: kind === 'recognition' ? 250 : 0,
        amount_currency: kind === 'recognition' ? -250 : 250,
        analytic_distribution: false,
      },
      {
        role: 'accrual',
        name: 'QorliaQA Accrual',
        account_id: [12, 'QorliaQA Deferred revenue'],
        partner_id: [3, 'QorliaQA Patient'],
        currency_id: [1, 'INR'],
        debit: kind === 'recognition' ? 250 : 0,
        credit: kind === 'recognition' ? 0 : 250,
        amount_currency: kind === 'recognition' ? 250 : -250,
        analytic_distribution: false,
      },
    ],
  })),
});
export const cutoffRequest = (): CutoffRequest => ({
  invoice_id: 7,
  line_id: 17,
  version: 'a'.repeat(64),
  values: cutoffFixture().values,
  review_version: 'b'.repeat(64),
  request_key: '12345678-1234-1234-1234-123456789abc',
});
export const cutoffSaved = (): CutoffSaved => ({
  invoice_id: 7,
  line_id: 17,
  request_key: cutoffRequest().request_key,
  entries: [201, 202].map((id) => ({
    id,
    name: `QorliaQA Entry ${id}`,
    date: '2026-10-10',
    state: 'posted',
    auto_post: 'no',
    ref: 'QorliaQA Cut-Off',
    journal_id: [2, 'QorliaQA General journal'],
  })),
});
