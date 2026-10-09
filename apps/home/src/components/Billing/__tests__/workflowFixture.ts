import { OrderWorkflow } from '../billingService';

export const workflowFixture = (
  changes: Partial<OrderWorkflow> = {},
): OrderWorkflow => ({
  id: 18,
  name: 'S00018',
  state: 'draft',
  version: 'a'.repeat(64),
  customer: 'QorliaQA Customer',
  currency: [1, 'INR'],
  amount_total: 500,
  can_confirm: true,
  can_invoice: false,
  automation: { delivery: true, invoice: true, legacy_delivery: false },
  invoices: [],
  pickings: [],
  ...changes,
});
