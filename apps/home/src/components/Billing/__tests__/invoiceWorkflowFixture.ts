import { InvoiceWorkflow } from '../billingService';

export const invoiceWorkflowFixture = (
  changes: Partial<InvoiceWorkflow> = {},
): InvoiceWorkflow => ({
  id: 7,
  name: false,
  state: 'draft',
  move_type: 'out_invoice',
  version: 'a'.repeat(64),
  customer: 'QorliaQA Customer',
  currency: [1, 'INR'],
  total: 500,
  open_amount: 500,
  payment_state: 'not_paid',
  invoice_date: false,
  journal: 'QA Sales',
  company: 'QA Company',
  ledger_balanced: true,
  can_post: true,
  ...changes,
});
