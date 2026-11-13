import type {
  PagedStockReservationLoad,
  PagedStockReservationRequest,
  PagedStockReservationReview,
  PagedStockReservationStatus,
  StockReservationSelection,
} from '../billingService';
import { orderDeliveryPageFixture } from './orderDeliveryFixture';
import { stockLoad, stockRequest } from './stockReservationFixture';

export const request = (): PagedStockReservationRequest & {
  order_id: number;
} => ({
  ...stockRequest(),
  review_complete_token: 'd'.repeat(64),
});
export const selection = (): StockReservationSelection => ({
  order_id: 9,
  transfer_id: 11,
  version: 'a'.repeat(64),
  action: 'assign',
});
export const load = (): PagedStockReservationLoad => ({
  order_id: 9,
  transfer_id: 11,
  version: 'a'.repeat(64),
  transfer: {
    ...orderDeliveryPageFixture().rows[0],
    move_count: 501,
    operation_count: 2001,
  },
  package_count: 0,
  reasons: stockLoad().reasons,
  write_ready: true,
});
export const status = (accepted = true): PagedStockReservationStatus => ({
  accepted,
  request_key: request().request_key,
  action: 'assign',
  state_after: accepted ? 'assigned' : false,
  reference_count: 0,
  current: {
    order_id: 9,
    transfer_id: 11,
    version: 'e'.repeat(64),
    transfer: load().transfer,
  },
});
export const review = (after = 0, limit = 50): PagedStockReservationReview => {
  const rows = [13, 14, 15].slice(after, after + limit),
    more = after + rows.length < 3;
  return {
    ...selection(),
    review_version: 'b'.repeat(64),
    state_after: 'assigned',
    write_ready: true,
    after,
    total_count: 3,
    next_after: more ? after + rows.length : false,
    continuation_token: more ? 'c'.repeat(64) : false,
    review_complete_token: more ? false : 'd'.repeat(64),
    effects: {
      created: { 'stock.quant': [] },
      deleted: { 'stock.quant': [] },
      updated: {
        'stock.quant': rows.map((id) => ({
          id,
          before: { reserved_quantity: 0 },
          after: { reserved_quantity: 5 },
        })),
      },
      labels: {},
      schema: {
        'stock.quant': {
          reserved_quantity: {
            label: 'Reserved',
            type: 'float',
            relation: false,
          },
        },
      },
      private_audit_counts: {},
    },
  };
};
export const references = () => ({
  request_key: request().request_key,
  version: 'e'.repeat(64),
  after: 0,
  total_count: 1,
  next_after: false as const,
  rows: [
    {
      key: 'new:stock.move.line:0',
      model: 'stock.move.line',
      id: 77,
      name: 'QorliaQA Operation',
      available: true,
    },
  ],
});
