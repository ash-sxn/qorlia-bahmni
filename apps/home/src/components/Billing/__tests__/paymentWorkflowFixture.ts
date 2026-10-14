import { PaymentValues, PaymentWorkflow } from '../billingService';
import { invoiceWorkflowFixture } from './invoiceWorkflowFixture';

export const paymentValuesFixture = (): PaymentValues => ({
  journal_id: 2,
  payment_method_line_id: 3,
  currency_id: 1,
  partner_bank_id: false,
  amount: 500,
  payment_date: '2026-10-09',
  communication: 'INV/QA/7',
  payment_difference_handling: 'open',
  writeoff_account_id: false,
  writeoff_label: 'Write-Off',
  bank_reference: false,
  cheque_reference: false,
  effective_date: false,
});

export const paymentWorkflowFixture = (
  changes: Partial<PaymentWorkflow> = {},
): PaymentWorkflow => ({
  invoice: invoiceWorkflowFixture({
    state: 'posted',
    name: 'INV/QA/7',
    can_post: false,
  }),
  values: paymentValuesFixture(),
  version: 'b'.repeat(64),
  can_record: true,
  reason: false,
  currency: [1, 'INR'],
  payment_type: 'inbound',
  method_code: 'manual',
  difference: 0,
  journals: [[2, 'QA Cash']],
  methods: [[3, 'Manual']],
  currencies: [[1, 'INR']],
  banks: [],
  accounts: [[5, 'QA Difference account']],
  payments: [],
  ...changes,
});
