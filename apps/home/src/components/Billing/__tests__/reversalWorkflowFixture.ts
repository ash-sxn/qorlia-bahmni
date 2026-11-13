import { ReversalWorkflow } from '../billingService';
import { invoiceWorkflowFixture } from './invoiceWorkflowFixture';

export const reversalWorkflowFixture = (
  patch: Partial<ReversalWorkflow> = {},
): ReversalWorkflow => ({
  invoice: invoiceWorkflowFixture({ state: 'posted', can_post: false }),
  can_reverse: true,
  reason: false,
  source_version: 'a'.repeat(64),
  version: 'b'.repeat(64),
  values: {
    date_mode: 'custom',
    date: '2026-10-09',
    reason: false,
    refund_method: 'refund',
    journal_id: 2,
  },
  journals: [[2, 'Customer invoices']],
  methods: [
    ['refund', 'Editable credit note'],
    ['cancel', 'Full reversal'],
    ['modify', 'Full reversal and replacement draft'],
  ],
  effective_date: '2026-10-09',
  scheduled: false,
  history: [],
  ...patch,
});

export const reversalResultFixture = () => ({
  invoice: reversalWorkflowFixture().invoice,
  credits: [invoiceWorkflowFixture({ id: 8, move_type: 'out_refund' })],
  replacements: [],
  scheduled: false,
  effective_date: '2026-10-09',
});
