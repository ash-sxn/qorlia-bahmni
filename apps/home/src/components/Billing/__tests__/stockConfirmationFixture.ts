import type {
  StockConfirmationLoad,
  StockConfirmationRequest,
  StockConfirmationReview,
  StockConfirmationStatus,
} from '../billingService';
import { stockLoad } from './stockReservationFixture';

export const confirmationLoad = (): StockConfirmationLoad => {
  const graph = stockLoad().graph;
  graph.transfer.state = 'draft';
  graph.transfer.operations = [];
  graph.transfer.moves.forEach((move) => {
    move.state = 'draft';
    move.reserved = 0;
    move.done = 0;
  });
  return {
    order_id: 9,
    transfer_id: 11,
    graph,
    version: 'a'.repeat(64),
    reason: false,
    write_ready: true,
  };
};
export const confirmationRequest = (): StockConfirmationRequest => ({
  order_id: 9,
  transfer_id: 11,
  version: 'a'.repeat(64),
  review_version: 'b'.repeat(64),
  request_key: '11111111-2222-4333-8444-555555555555',
});
export const confirmationReview = (): StockConfirmationReview => ({
  order_id: 9,
  transfer_id: 11,
  version: 'a'.repeat(64),
  review_version: 'b'.repeat(64),
  state_after: 'waiting',
  write_ready: true,
  effects: {
    created: {
      'stock.picking': [
        {
          key: 'new:stock.picking:0',
          values: {
            name: false,
            scheduled_date: '2026-10-15T10:00:00',
            state: 'confirmed',
          },
          assigned_on_save: ['name'],
        },
      ],
      'stock.move': [],
      'mail.message': [
        {
          key: 'new:mail.message:0',
          values: {
            body: '<img src=x onerror="alert(1)">Native audit text',
            res_id: 'new:stock.picking:0',
          },
          assigned_on_save: [],
        },
      ],
    },
    updated: {
      'stock.picking': [],
      'stock.move': [
        {
          id: 12,
          before: { state: 'draft', product_uom_qty: 12 },
          after: { state: 'waiting', product_uom_qty: 12 },
        },
      ],
      'mail.message': [],
    },
    deleted: { 'stock.picking': [], 'stock.move': [], 'mail.message': [] },
    labels: {},
    schema: {
      'stock.picking': {
        name: { label: 'Reference', type: 'char', relation: false },
        scheduled_date: {
          label: 'Scheduled Date',
          type: 'datetime',
          relation: false,
        },
        state: { label: 'Status', type: 'selection', relation: false },
      },
      'stock.move': {
        state: { label: 'Status', type: 'selection', relation: false },
        product_uom_qty: { label: 'Demand', type: 'float', relation: false },
      },
      'mail.message': {
        body: { label: 'Contents', type: 'html', relation: false },
        res_id: {
          label: 'Related Document',
          type: 'many2one_reference',
          relation: false,
        },
      },
    },
    private_audit_counts: {
      'mail.tracking.value': { created: 2, updated: 0, deleted: 0 },
    },
  },
});
export const confirmationStatus = (
  accepted = true,
): StockConfirmationStatus => {
  const current = confirmationLoad();
  if (accepted) {
    current.graph.transfer.state = 'waiting';
    current.reason =
      'Mark as Todo is not available in the current native transfer state.';
  }
  return {
    accepted,
    request_key: confirmationRequest().request_key,
    state_after: accepted ? 'waiting' : false,
    references: accepted
      ? {
          'new:stock.picking:0': {
            model: 'stock.picking',
            id: 18,
            name: 'QA/IN/18',
            available: true,
          },
        }
      : {},
    current,
  };
};
