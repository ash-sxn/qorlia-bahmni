import type {
  PagedStockConfirmationLoad,
  PagedStockConfirmationReferences,
  PagedStockConfirmationRequest,
  PagedStockConfirmationReview,
  PagedStockConfirmationStatus,
  StockConfirmationEffects,
} from '../billingService';
import {
  confirmationLoad,
  confirmationRequest,
} from './stockConfirmationFixture';

export const load = (): PagedStockConfirmationLoad => {
  const { graph, ...current } = confirmationLoad();
  const header = graph.transfer;
  return {
    ...current,
    transfer: {
      id: header.id,
      name: header.name,
      state: header.state,
      operation_type: header.operation_type,
      company: header.company,
      customer: header.customer,
      source: header.source,
      destination: header.destination,
      scheduled_date: header.scheduled_date,
      date_done: header.date_done,
      origin: header.origin,
      backorder: header.backorder,
      move_count: 501,
      operation_count: 2001,
    },
    package_count: 2,
  };
};
export const selection = () => ({
  order_id: 9,
  transfer_id: 11,
  version: 'a'.repeat(64),
});
export const request = (): PagedStockConfirmationRequest => ({
  ...confirmationRequest(),
  review_complete_token: 'd'.repeat(64),
});
export const status = (accepted = true): PagedStockConfirmationStatus => ({
  accepted,
  request_key: request().request_key,
  state_after: accepted ? 'waiting' : false,
  reference_count: accepted ? 2 : 0,
  current: load(),
});
export const effects = (): StockConfirmationEffects => ({
  created: { 'stock.move': [] },
  deleted: { 'stock.move': [] },
  updated: {
    'stock.move': [12, 13, 14].map((id) => ({
      id,
      before: {
        state: 'draft',
        product_uom_qty: 5,
        lot_id: 8,
        move_orig_ids: [4],
      },
      after: {
        state: 'waiting',
        product_uom_qty: 5,
        lot_id: 8,
        move_orig_ids: [4, 'new:stock.move:0'],
      },
    })),
  },
  labels: {
    'stock.lot:8': 'QorliaQA Batch',
    'stock.move:4': 'QorliaQA Supply',
  },
  schema: {
    'stock.move': {
      state: { label: 'State', type: 'selection', relation: false },
      product_uom_qty: { label: 'Demand', type: 'float', relation: false },
      lot_id: { label: 'Batch', type: 'many2one', relation: 'stock.lot' },
      move_orig_ids: {
        label: 'Supply',
        type: 'many2many',
        relation: 'stock.move',
      },
    },
  },
  private_audit_counts: {
    'mail.tracking.value': { created: 2, updated: 0, deleted: 0 },
  },
});
export const review = (after = 0, limit = 50): PagedStockConfirmationReview => {
  const all = effects();
  all.updated['stock.move'] = all.updated['stock.move'].slice(
    after,
    after + limit,
  );
  const more = after + limit < 3;
  return {
    ...selection(),
    review_version: 'b'.repeat(64),
    state_after: 'waiting',
    write_ready: true,
    after,
    total_count: 3,
    next_after: more ? after + limit : false,
    effects: all,
    continuation_token: more ? 'c'.repeat(64) : false,
    review_complete_token: more ? false : 'd'.repeat(64),
  };
};
export const references = (): PagedStockConfirmationReferences => ({
  request_key: request().request_key,
  version: 'e'.repeat(64),
  after: 0,
  total_count: 2,
  next_after: false,
  rows: [
    {
      key: 'new:stock.move:0',
      model: 'stock.move',
      id: 19,
      name: 'QorliaQA Supply',
      available: true,
    },
    {
      key: 'new:stock.picking:0',
      model: 'stock.picking',
      id: false,
      name: false,
      available: false,
    },
  ],
});
