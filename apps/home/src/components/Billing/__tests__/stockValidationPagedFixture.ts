import type {
  PagedStockValidationLoad,
  PagedStockValidationRequest,
  PagedStockValidationStatus,
  PagedStockValidationReview,
  StockValidationStepSelection,
  StockValidationPromptMetadata,
  StockValidationPromptRow,
  PagedStockValidationPromptPage,
  PagedStockValidationReferences,
} from '../billingService';
import { orderDeliveryPageFixture } from './orderDeliveryFixture';
import {
  validationRequest,
  terminalValidationReview,
} from './stockValidationFixture';

export const pagedValidationRequest = (): PagedStockValidationRequest => ({
  ...validationRequest(),
  continuation_key: false,
  review_complete_token: 'c'.repeat(64),
});
export const pagedValidationLoad = (): PagedStockValidationLoad => ({
  order_id: 9,
  transfer_id: 11,
  version: 'a'.repeat(64),
  transfer: {
    ...orderDeliveryPageFixture().rows[0],
    move_count: 501,
    operation_count: 2001,
  },
  reason: false,
  write_ready: true,
  package_count: 0,
  inventory_quant_count: 2001,
});
export function promptMetadata(
  kind: 'receipt' | 'expiry' | 'immediate' | 'backorder' = 'receipt',
  count = 101,
): StockValidationPromptMetadata {
  return {
    kind,
    title: `Saved ${kind} prompt`,
    blocked_reason: false,
    counts: {
      transfers: kind === 'immediate' || kind === 'backorder' ? 1 : 0,
      lots: kind === 'expiry' ? count : 0,
      operations: kind === 'receipt' ? count : 0,
    },
    ...(kind === 'receipt'
      ? {
          source: [3, 'Supplier'] as [number, string],
          destination: [4, 'Stock'] as [number, string],
          picking_code: 'incoming',
        }
      : kind === 'expiry'
        ? { description: 'Some native batches have expired.' }
        : {}),
  };
}
export function promptRows(
  metadata: StockValidationPromptMetadata,
  after = 0,
): StockValidationPromptRow[] {
  const count =
    metadata.counts.lots +
    metadata.counts.transfers +
    metadata.counts.operations;
  return Array.from({ length: Math.min(50, count - after) }, (_, i) => {
    const id = after + i + 1;
    if (metadata.kind === 'expiry')
      return { section: 'lots', value: [id, `Expired batch ${id}`] };
    if (metadata.kind === 'immediate' || metadata.kind === 'backorder')
      return {
        section: 'transfers',
        value: { transfer: [11, 'QA Transfer'], selected: true },
      };
    return {
      section: 'operations',
      value: {
        id,
        product_id: [3, `Medicine ${id}`],
        product_uom_id: [4, 'Dozens'],
        qty_done: 0.5,
        lot_id: false,
        lot_name: `Batch ${id}`,
        expiration_date: '2027-02-01T00:00:00',
        cost_price: 2.5,
        sale_price: 5,
        mrp: 7,
        balance: 10,
        is_move_line_lot_expiring_soon: false,
        expiry_warning: false,
      },
    };
  });
}
export function pagedValidationOutcome(
  request = pagedValidationRequest(),
  kind: 'unknown' | 'terminal' | 'prompt' | 'stopped' = 'terminal',
  metadata = promptMetadata(),
  references = 101,
): PagedStockValidationStatus {
  const terminal = kind === 'terminal';
  const source =
    kind === 'stopped' ? request.continuation_key : request.request_key;
  return {
    accepted: terminal || kind === 'prompt',
    stopped: kind === 'stopped',
    request_key: request.request_key,
    current: {
      order_id: request.order_id,
      transfer_id: request.transfer_id,
      version: 'd'.repeat(64),
      transfer: pagedValidationLoad().transfer,
    },
    receipt:
      kind === 'unknown' || !source
        ? false
        : {
            request_key: source,
            state_after: terminal ? 'done' : 'assigned',
            reference_count: references,
            next_step: terminal ? false : metadata,
            prompt_count: terminal
              ? 0
              : Object.values(metadata.counts).reduce((a, b) => a + b, 0),
            prompt_version: terminal ? false : 'e'.repeat(64),
            continuation_key: terminal ? false : source,
            continuation_reason: false,
            terminal,
          },
  };
}
export function pagedValidationEffectPage(
  selection: StockValidationStepSelection,
  after = 0,
  count = 101,
): PagedStockValidationReview {
  const input_prompt = selection.continuation_key
    ? promptMetadata(selection.decisions[0].kind)
    : false;
  const prompt_count = input_prompt
    ? Object.values(input_prompt.counts).reduce((a, b) => a + b, 0)
    : 0;
  const total_count = prompt_count + count,
    end = Math.min(after + 50, total_count);
  const effects = terminalValidationReview().effects;
  const example = effects.updated['stock.picking'][0];
  effects.updated['stock.picking'] = Array.from(
    { length: Math.max(0, end - Math.max(after, prompt_count)) },
    (_, i) => ({ ...example, id: 11 + Math.max(0, after - prompt_count) + i }),
  );
  return {
    ...selection,
    review_version: 'b'.repeat(64),
    state_after: 'done',
    write_ready: true,
    input_prompt,
    prompt_rows:
      input_prompt && after < prompt_count
        ? promptRows(input_prompt, after)
        : [],
    next_step: false,
    terminal: true,
    effects,
    after,
    total_count,
    prompt_count,
    effect_count: count,
    next_after: end < total_count ? end : false,
    continuation_token: end < total_count ? 'f'.repeat(64) : false,
    review_complete_token: end < total_count ? false : 'c'.repeat(64),
  };
}
export function pagedValidationPrompt(
  request: PagedStockValidationRequest,
  metadata = promptMetadata(),
  after = 0,
): PagedStockValidationPromptPage {
  const total = Object.values(metadata.counts).reduce((a, b) => a + b, 0);
  return {
    request_key: request.request_key,
    receipt_key: request.request_key,
    version: 'e'.repeat(64),
    descriptor: metadata,
    after,
    total_count: total,
    next_after: after + 50 < total ? after + 50 : false,
    rows: promptRows(metadata, after),
  };
}
export function pagedValidationReferences(
  request = pagedValidationRequest(),
  after = 0,
  count = 101,
): PagedStockValidationReferences {
  return {
    request_key: request.request_key,
    receipt_key: request.request_key,
    version: 'f'.repeat(64),
    after,
    total_count: count,
    next_after: after + 50 < count ? after + 50 : false,
    rows: Array.from({ length: Math.min(50, count - after) }, (_, i) => ({
      key: `new:stock.picking:${after + i}`,
      model: 'stock.picking',
      id: after + i + 100,
      name:
        after + i === 100
          ? '<img src=x onerror=alert(1)>'
          : `QA reference ${after + i}`,
      available: true,
    })),
  };
}
