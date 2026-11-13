export const sentFixture = (changes = {}) => ({
  payment_id: 9,
  name: 'QorliaQA cheque',
  amount: 100,
  currency: [1, 'INR'] as [number, string],
  journal: 'QorliaQA bank',
  check_number: false as const,
  sent: false,
  bank_matched: false,
  can_update: true,
  reason: false as const,
  version: 'a'.repeat(64),
  ...changes,
});
export const sentRequest = () => ({
  payment_id: 9,
  version: 'a'.repeat(64),
  review_version: 'b'.repeat(64),
  request_key: '11111111-1111-4111-8111-111111111111',
  action: 'mark_sent' as const,
});
