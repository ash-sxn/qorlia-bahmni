import { PaymentStateWorkflow, PaymentStateRequest } from '../billingService';

export const paymentStateFixture = (
  changes: Partial<PaymentStateWorkflow> = {},
): PaymentStateWorkflow => ({
  payment_id: 9,
  name: 'PAY/2026/00009',
  amount: 100,
  currency: [1, 'INR'],
  state: 'draft',
  date: '2026-10-10',
  effective_date: false,
  customer: 'QorliaQA Lifecycle customer',
  journal: 'QA Bank',
  method: 'Manual',
  check_number: false,
  sent: false,
  bank_matched: false,
  auto_allocate: true,
  reasons: {
    post: false,
    reset: 'Only posted or cancelled payments can be reset.',
    cancel: false,
  },
  documents: [
    {
      id: 7,
      name: 'INV/2026/00007',
      type: 'out_invoice',
      state: 'posted',
      total: 500,
      open_amount: 500,
      currency: [1, 'INR'],
    },
  ],
  version: 'a'.repeat(64),
  ...changes,
});
export const paymentStateRequest = (): PaymentStateRequest => ({
  payment_id: 9,
  version: 'a'.repeat(64),
  review_version: 'b'.repeat(64),
  action: 'post',
  request_key: 'a64ec58c-9a81-42a8-811c-4f2deddbcc13',
});
export const postedPaymentState = () =>
  paymentStateFixture({
    state: 'posted',
    reasons: {
      post: 'Only draft payments can be confirmed.',
      reset: false,
      cancel: 'Reset a posted payment first.',
    },
    documents: [
      {
        id: 7,
        name: 'INV/2026/00007',
        type: 'out_invoice',
        state: 'posted',
        total: 500,
        open_amount: 400,
        currency: [1, 'INR'],
      },
    ],
  });
