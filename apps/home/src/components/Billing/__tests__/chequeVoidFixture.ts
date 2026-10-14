import { ChequeVoidRequest, ChequeVoidWorkflow } from '../billingService';

export const voidFixture = (
  change: Partial<ChequeVoidWorkflow> = {},
): ChequeVoidWorkflow => ({
  payment_id: 9,
  name: 'QorliaQA Cheque',
  amount: 100,
  currency: [1, 'INR'],
  state: 'posted',
  check_number: '004321',
  sent: true,
  bank_matched: false,
  can_void: true,
  reason: false,
  version: 'a'.repeat(64),
  documents: [
    {
      id: 7,
      name: 'QorliaQA Credit',
      type: 'out_refund',
      state: 'posted',
      total: 500,
      open_amount: 400,
      currency: [1, 'INR'],
    },
  ],
  ...change,
});
export const voidRequest = (): ChequeVoidRequest => ({
  payment_id: 9,
  version: 'a'.repeat(64),
  review_version: 'b'.repeat(64),
  request_key: '8a2e4532-6504-4a13-81d4-899c57a73f68',
});
export const voidedFixture = () =>
  voidFixture({
    state: 'cancel',
    sent: false,
    can_void: false,
    reason: 'Native cheque is cancelled.',
  });
