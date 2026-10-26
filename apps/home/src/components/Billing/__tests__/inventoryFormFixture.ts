import type {
  InventoryNativeForm,
  InventoryFormChoices,
  InventoryDraftForm,
  InventoryStoredForm,
  InventoryStoredPreview,
  InventoryStoredEffects,
} from '../billingService';

export const inventoryForm = (
  id: number | false = false,
): InventoryNativeForm => ({
  read_only: true,
  transfer_id: id,
  picking_type_id: false,
  version: 'a'.repeat(64),
  timezone: 'Asia/Kolkata',
  fields: {
    id: { type: 'integer', string: 'ID' },
    move_ids: { type: 'one2many', string: 'Moves', relation: 'stock.move' },
    note: { type: 'html', string: 'Note' },
    partner_id: {
      type: 'many2one',
      string: 'Contact',
      relation: 'res.partner',
    },
  },
  layout: ['id', 'move_ids', 'note', 'partner_id'].map((field) => ({
    field,
    label: false,
    domain: false,
    context: false,
    modifiers: {},
    ancestor_modifiers: [],
    containers: [],
    attributes: {},
    rules: { visible: true, readonly: field === 'id', required: false },
  })),
  label_nodes: [],
  values: { id, note: false, partner_id: 4 },
  labels: { partner_id: [4, 'QorliaQA Contact'] },
  warning: false,
  collections: ['move_ids'],
  unsupported: [],
});
export const inventoryFormChoices = (): InventoryFormChoices => ({
  read_only: true,
  transfer_id: false,
  picking_type_id: false,
  form_version: 'a'.repeat(64),
  node: 3,
  field: 'partner_id',
  offset: 0,
  rows: [[4, 'QorliaQA Contact']],
  has_more: false,
});
export const inventoryDraftForm = (): InventoryDraftForm => ({
  read_only: true,
  write_ready: false,
  version: 'b'.repeat(64),
  seed: {
    picking_type_id: false,
    version: 'b'.repeat(64),
    signature: 'c'.repeat(64),
    payload: JSON.stringify({
      values: { ...inventoryForm().values, move_ids: [[4, 12, 0]] },
      domains: {},
      warning: false,
    }),
  },
  edits: [],
  domains: {},
  form: inventoryForm(),
});
export const inventoryStoredForm = (): InventoryStoredForm => ({
  read_only: true,
  write_ready: false,
  transfer_id: 7,
  version: 'a'.repeat(64),
  form: inventoryForm(7),
});
export const inventoryStoredPreview = (): InventoryStoredPreview => {
  const data = {
    ...inventoryStoredForm(),
    edits: [{ node: 2, value: 'QorliaQA Note' }],
    effect_version: 'd'.repeat(64),
    effect_count: 3,
    domains: {},
  };
  data.form.version = 'c'.repeat(64);
  data.form.values.note = 'QorliaQA Note';
  return data;
};
export const inventoryEffectPage = (
  after = 0,
  limit = 50,
): InventoryStoredEffects => {
  const rows = [12, 13, 14].slice(after, after + limit),
    more = after + rows.length < 3;
  return {
    ...inventoryStoredPreview(),
    after,
    next_after: more ? after + rows.length : false,
    continuation_token: more ? 'e'.repeat(64) : false,
    effects: {
      created: { 'stock.move': [] },
      deleted: { 'stock.move': [] },
      updated: {
        'stock.move': rows.map((id) => ({
          id,
          before: { partner_id: 4 },
          after: { partner_id: 8 },
        })),
      },
      schema: {
        'stock.move': {
          partner_id: {
            label: 'Contact',
            type: 'many2one',
            relation: 'res.partner',
          },
        },
      },
      labels: {
        'res.partner:4': 'QorliaQA Original',
        'res.partner:8': 'QorliaQA Changed',
      },
      private_audit_counts: {
        'mail.message': { created: 2, updated: 0, deleted: 0 },
      },
    },
  };
};
