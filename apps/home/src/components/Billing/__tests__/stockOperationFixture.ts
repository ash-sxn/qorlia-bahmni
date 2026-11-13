import {
  StockOperationForm,
  StockOperationGraph,
  StockOperationRequest,
  StockOperationReview,
  StockOperationSelection,
  StockOperationSelectionRequest,
  StockOperationStatus,
  stockOperationFields,
} from '../billingService';
import { stockLoad, stockReview } from './stockReservationFixture';

export const operationSelection = (): StockOperationSelection => ({
  order_id: 9,
  transfer_id: 11,
  move_id: 12,
  operation_id: 13,
});
export const operationForm = (): StockOperationForm => ({
  ...operationSelection(),
  version: 'a'.repeat(64),
  product: [5, 'QA Medicine'],
  state: 'assigned',
  tracking: 'lot',
  values: {
    qty_done: 0.5,
    product_uom_id: 2,
    lot_id: 6,
    lot_name: false,
    existing_lot_id: false,
    expiration_date: '2027-01-01 00:00:00',
    location_id: 3,
    location_dest_id: 4,
    package_id: false,
    result_package_id: false,
    owner_id: false,
    cost_price: 100,
    sale_price: 120,
    mrp: 150,
  },
  rules: Object.fromEntries(
    stockOperationFields.map((field) => [
      field,
      {
        visible: true,
        readonly: false,
      },
    ]),
  ) as StockOperationForm['rules'],
  labels: {
    product_uom_id: [2, 'Dozens'],
    lot_id: [6, 'QA-BATCH'],
    location_id: [3, 'QA Stock'],
    location_dest_id: [4, 'QA Customer location'],
  },
  reserved: 0.5,
  balance: 8,
  expiry_warning: false,
  warning: false,
  reason: false,
  write_ready: true,
  can_delete: true,
});
export const operationSelectionRequest =
  (): StockOperationSelectionRequest => ({
    ...operationSelection(),
    version: 'a'.repeat(64),
    action: 'save',
    edits: [{ field: 'qty_done', value: 2 }],
  });
export const operationRequest = (): StockOperationRequest => ({
  ...operationSelectionRequest(),
  review_version: 'b'.repeat(64),
  request_key: '11111111-2222-4333-8444-555555555555',
});
export const operationReview = (): StockOperationReview => {
  const graph = (): StockOperationGraph => ({
    ...stockLoad().graph,
    form_rows: [
      {
        id: 13,
        move_id: 12,
        values: { ...operationForm().values, balance: 8 },
      },
    ],
  });
  const before = graph(),
    after = graph(),
    form = operationForm();
  form.values.qty_done = 2;
  after.transfer.operations[0].done = 2;
  after.transfer.moves[0].done = 24;
  after.form_rows[0].values.qty_done = 2;
  return {
    ...operationSelectionRequest(),
    review_version: 'b'.repeat(64),
    form,
    before,
    after,
    quant_before: stockReview().quant_before,
    quant_after: stockReview().quant_before,
  };
};
export const operationStatus = (accepted = true): StockOperationStatus => ({
  accepted,
  action: 'save',
  request_key: operationRequest().request_key,
  operation_id: accepted ? 13 : false,
  current: stockLoad(),
});
