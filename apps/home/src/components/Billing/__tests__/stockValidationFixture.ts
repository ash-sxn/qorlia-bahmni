import {
  StockValidationLoad,
  StockValidationReview,
  StockValidationRequest,
  StockValidationStep,
  StockValidationStatus,
} from '../billingService';
import { stockLoad } from './stockReservationFixture';

export const validationLoad = (): StockValidationLoad => ({
  order_id: 9,
  transfer_id: 11,
  version: 'a'.repeat(64),
  graph: stockLoad().graph,
  reason: false,
  write_ready: true,
});
export const validationRequest = (): StockValidationRequest => ({
  order_id: 9,
  transfer_id: 11,
  version: 'a'.repeat(64),
  decisions: [],
  review_version: 'b'.repeat(64),
  request_key: '11111111-2222-4333-8444-555555555555',
});
export const validationStep = (
  kind: 'immediate' | 'backorder' = 'immediate',
): StockValidationStep => ({
  kind,
  title: 'Native selection',
  transfers: [{ transfer: [11, 'QA/OUT/11'], selected: true }],
  lots: [],
  operations: [],
  blocked_reason: false,
});
export const terminalValidationReview = (): StockValidationReview => ({
  order_id: 9,
  transfer_id: 11,
  version: 'a'.repeat(64),
  decisions: [],
  review_version: 'b'.repeat(64),
  next_step: false,
  terminal: true,
  state_after: 'done',
  write_ready: true,
  effects: {
    created: { 'stock.picking': [] },
    updated: {
      'stock.picking': [
        {
          id: 11,
          before: { state: 'assigned', date_done: null },
          after: { state: 'done', date_done: false },
          assigned_on_save: ['date_done'],
        },
      ],
    },
    deleted: { 'stock.picking': [] },
    labels: {},
    schema: {
      'stock.picking': {
        state: { label: 'State', type: 'selection', relation: false },
        date_done: { label: 'Completed', type: 'datetime', relation: false },
      },
    },
    private_effect_counts: {
      'stock.valuation.layer': { created: 1, updated: 0, deleted: 0 },
    },
  },
});
export const validationStatus = (): StockValidationStatus => ({
  accepted: true,
  request_key: validationRequest().request_key,
  state_after: 'done',
  current: validationLoad(),
  references: {
    'new:stock.valuation.layer:0': {
      model: 'stock.valuation.layer',
      id: false,
      name: false,
      available: false,
    },
  },
});
