import { JournalDetails, JournalDetailRequest } from '../billingService';

export const journalDetailFixture = (): JournalDetails => ({
  invoice_id: 7,
  line_id: 17,
  name: 'INV/QorliaQA/7',
  version: 'a'.repeat(64),
  values: {
    name: 'QorliaQA Consultation',
    account_id: 12,
    date_maturity: false,
    tax_tag_ids: [],
    analytic_distribution: false,
    discount_date: false,
    discount_amount_currency: 0,
  },
  account: [12, '4000 Clinical income'],
  tax_grids: [],
  analytics_visible: false,
  analytic_plans: [],
  analytic_accounts: [],
  can_edit: true,
  currency: [1, 'INR'],
  debit: 0,
  credit: 500,
});
export const journalDetailRequest = (): JournalDetailRequest => ({
  invoice_id: 7,
  line_id: 17,
  version: 'a'.repeat(64),
  values: { ...journalDetailFixture().values, name: 'QorliaQA Reviewed label' },
  review_version: 'b'.repeat(64),
  request_key: '12345678-1234-1234-1234-123456789abc',
});
