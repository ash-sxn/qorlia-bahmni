import { CorrectionWorkflow } from '../billingService';
import { invoiceWorkflowFixture } from './invoiceWorkflowFixture';

export const correctionWorkflowFixture = (
  patch: Partial<CorrectionWorkflow> = {},
): CorrectionWorkflow => ({
  invoice: invoiceWorkflowFixture({
    state: 'posted',
    can_post: false,
    open_amount: 400,
  }),
  version: 'c'.repeat(64),
  can_reset: true,
  can_cancel: false,
  posted_before: true,
  allocations: [
    {
      id: 23,
      name: 'QA Receipt',
      date: '2026-10-09',
      amount: 100,
      currency: [1, 'INR'],
      is_exchange: false,
    },
  ],
  ...patch,
});
