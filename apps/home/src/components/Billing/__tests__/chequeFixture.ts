import { ChequeRequest, ChequeWorkflow } from '../billingService';

export const chequeFixture = (
  changes: Partial<ChequeWorkflow> = {},
): ChequeWorkflow => ({
  payment_id: 9,
  name: 'QorliaQA cheque',
  version: 'a'.repeat(64),
  amount: 100,
  currency: [1, 'INR'],
  journal: 'QorliaQA bank',
  manual_sequencing: false,
  check_number: false,
  sent: false,
  bank_matched: false,
  can_print: true,
  reason: false,
  layout: 'QorliaQA synthetic only',
  ...changes,
});
export const chequeRequest = (): ChequeRequest => ({
  payment_id: 9,
  version: 'a'.repeat(64),
  review_version: 'b'.repeat(64),
  check_number: '000007',
  request_key: '12345678-1234-1234-1234-123456789abc',
});
export const chequePdf = () => ({
  payment_id: 9,
  filename: 'QorliaQA_cheque_9.pdf',
  mimetype: 'application/pdf',
  byte_count: '%PDF-QA'.length,
  content: btoa('%PDF-QA'),
});
