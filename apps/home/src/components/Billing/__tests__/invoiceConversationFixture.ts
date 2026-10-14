import { InvoiceConversation, InvoiceMessage } from '../billingService';

export const noteKey = '195299dd-9829-4240-826f-b6815bc28a4c';
export const invoiceMessageFixture = (): InvoiceMessage => ({
  id: 9,
  date: '2026-10-10 12:00:00',
  author: 'QA Cashier',
  subject: '',
  kind: 'note',
  body: 'QorliaQA Checked invoice',
  body_truncated: false,
  changes: [{ id: 1, field: 'Reference', old: 'Before', new: 'After' }],
  attachments: [{ id: 1, name: 'QorliaQA Invoice.pdf' }],
});
export const invoiceConversationFixture = (): InvoiceConversation => ({
  invoice_id: 7,
  can_note: true,
  messages: [invoiceMessageFixture()],
  next_before: false,
});
