import { CreditWorkflow } from '../billingService';
import { invoiceWorkflowFixture } from './invoiceWorkflowFixture';
export const creditWorkflowFixture = (
  changes: Partial<CreditWorkflow> = {},
): CreditWorkflow => ({
  invoice: invoiceWorkflowFixture({
    state: 'posted',
    can_post: false,
    open_amount: 500,
  }),
  version: 'b'.repeat(64),
  credits: [
    {
      id: 12,
      source_id: 8,
      name: 'QorliaQA Credit note',
      date: '2026-10-09',
      amount: 100,
      currency: [3, 'INR'],
      can_apply: true,
    },
  ],
  history: [],
  ...changes,
});
