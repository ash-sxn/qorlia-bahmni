import type {
  PagedStockCancellationLoad,
  PagedStockCancellationRequest,
  PagedStockCancellationReview,
  PagedStockCancellationStatus,
  PagedStockConfirmationReferences,
} from '../billingService';
import {
  load as confirmationLoad,
  request as confirmationRequest,
} from './stockConfirmationPagedFixture';

export const load = (): PagedStockCancellationLoad => {
  const data = confirmationLoad();
  return {
    order_id: data.order_id,
    transfer_id: data.transfer_id,
    version: data.version,
    transfer: { ...data.transfer, state: 'assigned' },
    reason: false,
    write_ready: true,
  };
};
export const request = (): PagedStockCancellationRequest => ({
  ...confirmationRequest(),
  action: 'cancel_transfer',
});
export const review = (
  after = 0,
  total = 101,
): PagedStockCancellationReview => ({
  order_id: 9,
  transfer_id: 11,
  version: load().version,
  action: 'cancel_transfer',
  review_version: request().review_version,
  state_after: 'cancel',
  write_ready: true,
  after,
  total_count: total,
  next_after: after + 50 < total ? after + 50 : false,
  continuation_token: after + 50 < total ? 'c'.repeat(64) : false,
  review_complete_token:
    after + 50 < total ? false : request().review_complete_token,
  effects: {
    created: { 'stock.move': [] },
    deleted: { 'stock.move': [] },
    updated: {
      'stock.move': Array.from(
        { length: Math.min(50, total - after) },
        (_, index) => ({
          id: 12 + after + index,
          before: { state: 'assigned', product_uom_qty: 5 },
          after: { state: 'cancel', product_uom_qty: 5 },
        }),
      ),
    },
    labels: {},
    schema: {
      'stock.move': {
        state: { label: 'Status', type: 'selection', relation: false },
        product_uom_qty: { label: 'Demand', type: 'float', relation: false },
      },
    },
    private_effect_counts: {
      'account.analytic.line': { created: 0, updated: 0, deleted: 1 },
    },
  },
});
export const status = (
  outcome: 'accepted' | 'unknown' | 'stopped' = 'accepted',
  count = 0,
): PagedStockCancellationStatus => ({
  accepted: outcome === 'accepted',
  stopped: outcome === 'stopped',
  request_key: request().request_key,
  state_after: outcome === 'accepted' ? 'cancel' : false,
  reference_count: outcome === 'accepted' ? count : 0,
  current: {
    order_id: 9,
    transfer_id: 11,
    version: 'f'.repeat(64),
    transfer: {
      ...load().transfer,
      state: outcome === 'accepted' ? 'cancel' : 'assigned',
    },
  },
});
export const references = (
  after = 0,
  count = 0,
): PagedStockConfirmationReferences => ({
  request_key: request().request_key,
  version: 'e'.repeat(64),
  after,
  total_count: count,
  next_after: after + 50 < count ? after + 50 : false,
  rows: Array.from({ length: count }, (_, index) => ({
    key: `new:stock.move:${index}`,
    model: 'stock.move',
    id: 1000 + index,
    name: index
      ? `QorliaQA reference ${index}`
      : '<img src=x onerror=alert(1)>',
    available: true,
  }))
    .sort((a, b) => (a.key < b.key ? -1 : 1))
    .slice(after, after + 50),
});
