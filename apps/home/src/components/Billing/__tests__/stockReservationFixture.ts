import {
  StockReservationLoad,
  StockReservationRequest,
  StockReservationReview,
} from '../billingService';
import { orderDeliveryFixture } from './orderDeliveryFixture';

export const stockLoad = (): StockReservationLoad => ({
  order_id: 9,
  transfer_id: 11,
  version: 'a'.repeat(64),
  graph: { transfer: orderDeliveryFixture().rows[0], packages: [] },
  reasons: {
    assign: false,
    unreserve: false,
    set_quantities: false,
    clear_quantities: false,
  },
});
export const stockReview = (): StockReservationReview => {
  const before = stockLoad().graph;
  const after = stockLoad().graph;
  after.transfer.moves[0].reserved = 12;
  after.transfer.operations[0].reserved = 1;
  after.transfer.operations[0].id = false;
  const quant = {
    id: 17,
    unit: [1, 'Units'] as [number, string],
    product_id: [5, 'QA Medicine'] as [number, string],
    location_id: [3, 'QA Stock'] as [number, string],
    lot_id: [6, 'QA-BATCH'] as [number, string],
    package_id: false as const,
    owner_id: false as const,
    company_id: [1, 'QA Company'] as [number, string],
    quantity: 20,
    reserved_quantity: 6,
    in_date: '2026-10-14 10:00:00',
  };
  return {
    order_id: 9,
    transfer_id: 11,
    version: stockLoad().version,
    action: 'assign',
    review_version: 'b'.repeat(64),
    before,
    after,
    quant_before: [quant],
    quant_after: [{ ...quant, reserved_quantity: 12 }],
  };
};
export const stockRequest = (): StockReservationRequest => ({
  order_id: 9,
  transfer_id: 11,
  action: 'assign',
  version: 'a'.repeat(64),
  review_version: 'b'.repeat(64),
  request_key: '11111111-2222-4333-8444-555555555555',
});

export const quantityReview = (
  action: 'set_quantities' | 'clear_quantities',
): StockReservationReview => {
  const before = stockLoad().graph,
    after = stockLoad().graph;
  const beforeDone = action === 'set_quantities' ? 0 : 6;
  const afterDone = action === 'set_quantities' ? 6 : 0;
  for (const [graph, done] of [
    [before, beforeDone],
    [after, afterDone],
  ] as const) {
    graph.transfer.moves[0].demand = 6;
    graph.transfer.moves[0].done = done;
    graph.transfer.operations[0].done = done / 12;
  }
  const quant = stockReview().quant_before;
  return {
    ...stockReview(),
    action,
    before,
    after,
    quant_before: quant,
    quant_after: quant,
  };
};
