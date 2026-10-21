import type {
  InventoryStoredSelection,
  InventoryStoredSaveRequest,
  InventoryStoredSaveReview,
  InventoryStoredSaveStatus,
} from '../billingService';
import { inventoryStoredForm } from './inventoryFormFixture';
import { inventoryLoad } from './inventoryTransferFixture';

export const headerRequest = (): InventoryStoredSaveRequest => ({
  transfer_id: 7,
  version: 'a'.repeat(64),
  edits: [{ node: 2, value: 'QorliaQA revised note' }],
  review_version: 'd'.repeat(64),
  review_complete_token: 'e'.repeat(64),
  request_key: '12345678-1234-4234-8234-123456789abc',
});
export function headerForm() {
  const loaded = inventoryStoredForm();
  loaded.form.fields.origin = { type: 'char', string: 'Source document' };
  loaded.form.layout.push({ ...loaded.form.layout[2], field: 'origin' });
  loaded.form.values.origin = 'QorliaQA origin';
  loaded.form.values.note = 'QorliaQA original note';
  loaded.form.label_nodes.push({
    target: 'partner_id',
    label: 'Receive From',
    visible: true,
    modifiers: {},
    ancestor_modifiers: [],
    containers: [],
  });
  return loaded;
}
export function headerPreview(selection: InventoryStoredSelection) {
  const loaded = headerForm();
  for (const edit of selection.edits)
    loaded.form.values[loaded.form.layout[edit.node].field] = edit.value;
  loaded.form.version = 'c'.repeat(64);
  return {
    ...loaded,
    edits: selection.edits,
    effect_version: 'd'.repeat(64),
    effect_count: 3,
    domains: {},
  };
}
export function headerReview(
  selection: InventoryStoredSelection,
  after = 0,
  count = 51,
): InventoryStoredSaveReview {
  const preview = headerPreview(selection);
  const end = Math.min(after + 50, count);
  return {
    ...headerForm(),
    form: preview.form,
    edits: selection.edits,
    domains: preview.domains,
    write_ready: true,
    review_version: 'd'.repeat(64),
    changed_fields: ['note'],
    state_after: 'draft',
    effect_count: count,
    after,
    next_after: end < count ? end : false,
    continuation_token: end < count ? 'f'.repeat(64) : false,
    review_complete_token: end < count ? false : 'e'.repeat(64),
    effects: {
      schema: {
        'stock.picking': {
          note: { label: 'Note', type: 'html', relation: false },
        },
      },
      created: { 'stock.picking': [] },
      deleted: { 'stock.picking': [] },
      updated: {
        'stock.picking': Array.from({ length: end - after }, (_, index) => ({
          id: after + index + 1,
          before: { note: 'QorliaQA old' },
          after: { note: 'QorliaQA new' },
        })),
      },
      labels: {},
      private_audit_counts: {
        'mail.followers': { created: 1, updated: 0, deleted: 0 },
      },
    },
  };
}
export function headerOutcome(
  kind: 'accepted' | 'stopped' | 'unknown' = 'accepted',
  count = 0,
): InventoryStoredSaveStatus {
  const current = inventoryLoad();
  current.transfer.id = 7;
  return {
    request_key: headerRequest().request_key,
    accepted: kind === 'accepted',
    stopped: kind === 'stopped',
    state_after: kind === 'accepted' ? 'draft' : false,
    changed_fields: kind === 'accepted' ? ['note'] : [],
    reference_count: kind === 'accepted' ? count : 0,
    current,
  };
}
