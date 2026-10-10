import {
  CustomerPaymentDraft,
  CustomerPaymentDraftRequest,
} from '../billingService';

export const customerPaymentDraftFixture = (
  changes: Partial<CustomerPaymentDraft> = {},
): CustomerPaymentDraft => ({
  id: false,
  version: false,
  values: {
    partner_id: 4,
    company_id: 1,
    payment_type: 'inbound',
    amount: 100,
    date: '2026-10-10',
    journal_id: 2,
    payment_method_line_id: 3,
    currency_id: 1,
    partner_bank_id: false,
    ref: 'QorliaQA draft payment',
    payment_reference: false,
    bank_reference: false,
    cheque_reference: false,
    effective_date: false,
  },
  labels: {
    partner_id: 'QorliaQA Customer',
    company_id: 'QA Company',
    journal_id: 'QA Bank',
    payment_method_line_id: 'Manual',
    currency_id: 'INR',
  },
  allocations: {
    outstanding: [
      {
        invoice_id: 7,
        name: 'INV/2026/00007',
        date: '2026-10-10',
        care_setting: false,
        invoice_amount: 500,
        allocated_amount: 100,
        remaining_amount: 400,
        selected: true,
        state: 'posted',
        open_amount: 500,
        document_currency: [1, 'INR'],
        document_version: 'c'.repeat(64),
      },
    ],
    credits: [],
  },
  totals: { current_outstanding: 500, balance_outstanding: 400 },
  auto_allocate: true,
  date_readonly: true,
  journal_readonly: false,
  show_bank: false,
  require_bank: false,
  multi_currency: true,
  review_version: 'b'.repeat(64),
  ledger: [
    {
      name: 'Payment',
      account_id: 21,
      partner_id: 4,
      currency_id: 1,
      debit: 100,
      credit: 0,
      amount_currency: 100,
    },
    {
      name: 'Payment',
      account_id: 22,
      partner_id: 4,
      currency_id: 1,
      debit: 0,
      credit: 100,
      amount_currency: -100,
    },
  ],
  account_labels: { '21': 'QA Bank', '22': 'Receivable' },
  ...changes,
});
export const customerPaymentDraftRequest = (): CustomerPaymentDraftRequest => {
  const { id, version, values, review_version } = customerPaymentDraftFixture();
  return {
    payload: { id, version, values },
    review_version,
    request_key: '81f92c58-4af3-405d-84f9-613a608acd23',
  };
};
