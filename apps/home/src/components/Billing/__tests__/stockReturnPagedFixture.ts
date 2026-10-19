import type {
  PagedStockReturnLoad,
  PagedStockReturnRequest,
  PagedStockReturnReview,
  PagedStockReturnStatus,
  PagedStockConfirmationReferences,
  StockReturnSelection,
  StockValidationEffects,
} from '../billingService';
import { orderDeliveryPageFixture } from './orderDeliveryFixture';

export const returnSelection = () => ({
  order_id: 9,
  transfer_id: 11,
  version: 'a'.repeat(64),
});
export const returnMetadata = () => ({
  location: [3, 'QA Stock'] as [number, string],
  location_editable: true,
  show_units: true,
  chained_move_warning: true,
});
export const returnLine = (index = 0) => ({
  move_id: 12 + index,
  quantity: 2,
  product: [5, 'QA Medicine'] as [number, string],
  unit: [1, 'Units'] as [number, string],
  updates_order_quantities: true,
});
export const returnLoad = (count = 1): PagedStockReturnLoad => ({
  ...returnSelection(),
  transfer: {
    ...orderDeliveryPageFixture().rows[0],
    state: 'done',
    move_count: count,
  },
  form: returnMetadata(),
  line_count: count,
  reason: false,
  write_ready: true,
});
export const returnRequest = (): PagedStockReturnRequest => ({
  ...returnSelection(),
  location_id: 3,
  lines: [{ move_id: 12, quantity: 2 }],
  review_version: 'b'.repeat(64),
  review_complete_token: 'c'.repeat(64),
  request_key: '11111111-2222-4333-8444-555555555555',
});
export function returnReview(
  selection: StockReturnSelection,
  after = 0,
  effectCount = 1,
): PagedStockReturnReview {
  const end = Math.min(after + 50, selection.lines.length + effectCount);
  const startEffect = Math.max(0, after - selection.lines.length);
  const endEffect = Math.max(0, end - selection.lines.length);
  const effects: StockValidationEffects = {
    created: {},
    updated: {},
    deleted: {},
    schema: {},
    labels: {},
    private_effect_counts: {},
  };
  if (endEffect > startEffect) {
    effects.created['stock.picking'] = Array.from(
      { length: endEffect - startEffect },
      (_, i) => ({
        key: `new:stock.picking:${i + startEffect}`,
        values: { name: false, state: 'assigned' },
        assigned_on_save: ['name'],
      }),
    );
    effects.updated['stock.picking'] = [];
    effects.deleted['stock.picking'] = [];
    effects.schema['stock.picking'] = {
      name: { label: 'Reference', type: 'char', relation: false },
      state: { label: 'State', type: 'selection', relation: false },
    };
  }
  const { lines, ...identity } = selection;
  return {
    ...identity,
    form: {
      ...returnMetadata(),
      location: [selection.location_id, 'QA Stock'],
    },
    line_count: lines.length,
    return_state: 'assigned',
    write_ready: true,
    review_version: 'b'.repeat(64),
    after,
    total_count: lines.length + effectCount,
    effect_count: effectCount,
    next_after: end < lines.length + effectCount ? end : false,
    line_rows: lines
      .slice(after, Math.min(end, lines.length))
      .map((line) => ({ ...returnLine(line.move_id - 12), ...line })),
    effects,
    continuation_token:
      end < lines.length + effectCount ? 'd'.repeat(64) : false,
    review_complete_token:
      end < lines.length + effectCount ? false : 'c'.repeat(64),
  };
}
export const returnOutcome = (
  kind: 'accepted' | 'stopped' | 'unknown' = 'accepted',
): PagedStockReturnStatus => ({
  accepted: kind === 'accepted',
  stopped: kind === 'stopped',
  request_key: returnRequest().request_key,
  state_after: kind === 'accepted' ? 'assigned' : false,
  return_transfer:
    kind === 'accepted'
      ? {
          model: 'stock.picking',
          id: 19,
          name: 'QA/RETURN/19',
          available: true,
        }
      : false,
  reference_count: kind === 'accepted' ? 2 : 0,
  current: {
    ...returnSelection(),
    version: 'e'.repeat(64),
    transfer: returnLoad().transfer,
  },
});
export const returnReferences = (): PagedStockConfirmationReferences => ({
  request_key: returnRequest().request_key,
  version: 'f'.repeat(64),
  after: 0,
  total_count: 2,
  next_after: false as number | false,
  rows: [
    {
      key: 'new:stock.move:0',
      model: 'stock.move',
      id: 20,
      name: 'QA Return item',
      available: true,
    },
    {
      key: 'new:stock.picking:0',
      model: 'stock.picking',
      id: 19,
      name: 'QA/RETURN/19',
      available: true,
    },
  ],
});
