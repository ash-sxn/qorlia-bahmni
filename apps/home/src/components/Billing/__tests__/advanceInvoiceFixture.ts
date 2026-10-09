import {
  AdvanceInvoice,
  AdvanceRequest,
  AdvanceReview,
  SavedAdvance,
} from '../billingService';
import { invoiceWorkflowFixture } from './invoiceWorkflowFixture';
import { workflowFixture } from './workflowFixture';

export const advanceFixture = (
  changes: Partial<AdvanceInvoice> = {},
): AdvanceInvoice => ({
  order: workflowFixture({
    state: 'sale',
    can_confirm: false,
    can_advance: true,
  }),
  values: {
    advance_payment_method: 'percentage',
    amount: 0,
    fixed_amount: 0,
    deposit_account_id: false,
    deposit_taxes_id: [],
  },
  product: [11, 'QorliaQA Deposit'],
  can_set_account: true,
  ...changes,
});
export const advanceReviewFixture = (
  changes: Partial<AdvanceReview> = {},
): AdvanceReview => ({
  ...advanceFixture(),
  values: { ...advanceFixture().values, amount: 50 },
  review_version: 'b'.repeat(64),
  invoice: {
    company: 'QA Company',
    journal: 'QA Sales',
    currency: [1, 'INR'],
    totals: {
      qorlia_item_subtotal: 250,
      amount_tax: 0,
      amount_total: 250,
      invoice_total: 250,
      round_off_amount: 0,
    },
    lines: [
      { key: 'deposit', name: 'Down payment', subtotal: 250, total: 250 },
    ],
  },
  ...changes,
});
export const advanceRequestFixture = (): AdvanceRequest => ({
  order_id: 18,
  values: advanceReviewFixture().values,
  review_version: 'b'.repeat(64),
  request_key: '3a47b619-83c0-4b39-846a-953d176e7ff5',
});
export const savedAdvanceFixture = (): SavedAdvance => ({
  order: workflowFixture({
    state: 'sale',
    can_confirm: false,
    can_advance: true,
    invoices: [
      { id: 7, name: false, state: 'draft', total: 250, currency: [1, 'INR'] },
    ],
  }),
  invoice: invoiceWorkflowFixture({ total: 250, open_amount: 250 }),
});
