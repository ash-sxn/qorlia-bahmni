import {
  type PagedStockConfirmationReferences,
  type PagedStockOperationRequest,
  type PagedStockOperationReview,
  type PagedStockOperationStatus,
} from '../billingService';
import { orderDeliveryPageFixture } from './orderDeliveryFixture';
import {
  operationForm,
  operationRequest,
  operationSelection,
  operationSelectionRequest,
} from './stockOperationFixture';

export const formRequest = () => ({
  ...operationSelection(),
  version: 'a'.repeat(64),
  edits: operationSelectionRequest().edits,
});

export const request = (): PagedStockOperationRequest => ({
  ...operationRequest(),
  review_complete_token: 'd'.repeat(64),
});
export const review = (after = 0, limit = 50): PagedStockOperationReview => {
  const rows = [13, 14, 15].slice(after, after + limit);
  const more = after + rows.length < 3;
  return {
    ...operationSelectionRequest(),
    form: operationForm(),
    review_version: 'b'.repeat(64),
    state_after: 'assigned',
    operation_key: 13,
    write_ready: true,
    after,
    total_count: 3,
    next_after: more ? after + rows.length : false,
    continuation_token: more ? 'c'.repeat(64) : false,
    review_complete_token: more ? false : 'd'.repeat(64),
    effects: {
      created: { 'stock.move.line': [] },
      deleted: { 'stock.move.line': [] },
      updated: {
        'stock.move.line': rows.map((id) => ({
          id,
          before: { qty_done: 0 },
          after: { qty_done: 2 },
        })),
      },
      labels: {},
      schema: {
        'stock.move.line': {
          qty_done: { label: 'Done', type: 'float', relation: false },
        },
      },
      private_audit_counts: {},
    },
  };
};
export const status = (accepted = true): PagedStockOperationStatus => {
  const header = orderDeliveryPageFixture().rows[0];
  return {
    accepted,
    request_key: request().request_key,
    action: 'save',
    operation_id: accepted ? 13 : false,
    state_after: accepted ? 'assigned' : false,
    reference_count: 0,
    current: {
      order_id: 9,
      transfer_id: 11,
      version: 'e'.repeat(64),
      transfer: { ...header, move_count: 501, operation_count: 2001 },
    },
  };
};
export const references = (): PagedStockConfirmationReferences => ({
  request_key: request().request_key,
  version: 'e'.repeat(64),
  after: 0,
  total_count: 1,
  next_after: false,
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
