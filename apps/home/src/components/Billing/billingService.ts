const API = '/openmrs/qorlia-billing-api';

export class BillingSessionExpired extends Error {
  readonly billingSessionExpired = true;
}

export interface BillingSession {
  uid: number | false;
  name?: string;
  db?: string;
}

export interface Invoice {
  id: number;
  name: string | false;
  ref: string | false;
  move_type: 'out_invoice' | 'out_refund';
  partner_id: [number, string] | false;
  invoice_date: string | false;
  invoice_date_due: string | false;
  state: string;
  payment_state: string;
  amount_total: number;
  amount_untaxed: number;
  qorlia_item_subtotal: number;
  amount_tax: number;
  discount: number;
  round_off_amount: number;
  invoice_total: number;
  amount_residual: number;
  currency_id: [number, string];
}

export interface InvoiceLine {
  id: number;
  name: string;
  quantity: number;
  price_unit: number;
  price_subtotal: number;
  discount: number;
  price_total: number;
}

export interface InvoiceWorkflow {
  id: number;
  name: string | false;
  state: 'draft' | 'posted' | 'cancel';
  move_type: 'out_invoice' | 'out_refund';
  version: string;
  customer: string | false;
  currency: [number, string];
  total: number;
  open_amount: number;
  payment_state: string;
  invoice_date: string | false;
  journal: string;
  company: string;
  ledger_balanced: boolean;
  can_post: boolean;
}

type Relation = [number, string] | false;

export interface ChargeOrder {
  id: number;
  name: string;
  client_order_ref: string | false;
  partner_id: Relation;
  shop_id: Relation;
  date_order: string;
  state: 'draft' | 'sent' | 'sale' | 'done' | 'cancel';
  invoice_status: 'upselling' | 'invoiced' | 'to invoice' | 'no';
  care_setting: 'opd' | 'ipd' | false;
  provider_name: string | false;
  amount_untaxed: number;
  amount_tax: number;
  amount_total: number;
  discount: number;
  discount_type: 'none' | 'fixed' | 'percentage';
  discount_percentage: number;
  chargeable_amount: number;
  disc_acc_id: Relation;
  round_off_amount: number;
  currency_id: [number, string];
  invoice_ids: number[];
}

export interface ChargeOrderLine {
  id: number;
  name: string;
  display_type: 'line_section' | 'line_note' | false;
  product_id: Relation;
  product_uom: Relation;
  product_uom_qty: number;
  qty_delivered: number;
  qty_invoiced: number;
  price_unit: number;
  discount: number;
  price_subtotal: number;
  price_tax: number;
  price_total: number;
  dispensed: boolean;
  lot_id: Relation;
  expiry_date: string | false;
}

const validRelation = (value: unknown) =>
  value === false ||
  (Array.isArray(value) &&
    value.length === 2 &&
    Number.isInteger(value[0]) &&
    value[0] > 0 &&
    typeof value[1] === 'string');

async function rpc<T>(path: string, params: object): Promise<T> {
  const response = await fetch(`${API}${path}`, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', method: 'call', params, id: 1 }),
  });
  if (response.status === 401) {
    window.location.assign('/bahmni-v2/login');
    throw new Error('Sign in to Qorlia to open Billing.');
  }
  if (!response.ok)
    throw new Error('Billing is unavailable. Please try again.');
  const body = await response.json();
  if (body.error) {
    if (body.error.code === 100) throw new BillingSessionExpired();
    if (
      ['odoo.exceptions.UserError', 'odoo.exceptions.ValidationError'].includes(
        body.error.data?.name,
      ) &&
      typeof body.error.data?.arguments?.[0] === 'string'
    )
      throw new Error(body.error.data.arguments[0]);
    throw new Error(
      'Billing access failed. Check your billing account permissions.',
    );
  }
  if (!Object.hasOwn(body, 'result'))
    throw new Error('Invalid billing response.');
  return body.result;
}

export const getBillingSession = () =>
  rpc<BillingSession>('/web/session/get_session_info', {});

export const signInToBilling = (login: string, password: string) =>
  rpc<BillingSession>('/web/session/authenticate', {
    db: 'odoo',
    login,
    password,
  });

export const disconnectBilling = () => rpc('/web/session/destroy', {});

export interface DraftLine {
  id: number | false;
  values: {
    product_id: number | false;
    name: string | false;
    display_type: 'line_section' | 'line_note' | false;
    sequence: number;
    product_uom: number | false;
    product_uom_qty: number;
    price_unit: number;
    discount: number;
    tax_id: number[];
    lot_id: number | false;
    expiry_date: string | false;
    analytic_distribution: Record<string, number> | false;
  };
  totals: { price_subtotal: number; price_tax: number; price_total: number };
}

export interface BillingDraft {
  id: number | false;
  name: string;
  version: string | false;
  values: {
    partner_id: number | false;
    partner_invoice_id: number | false;
    partner_shipping_id: number | false;
    shop_id: number | false;
    care_setting: 'opd' | 'ipd' | false;
    provider_name: string | false;
    client_order_ref: string | false;
    company_id: number;
    pricelist_id: number | false;
    warehouse_id: number | false;
    location_id: number | false;
    payment_term_id: number | false;
    fiscal_position_id: number | false;
    date_order: string | false;
    discount_type: 'none' | 'fixed' | 'percentage';
    discount: number;
    discount_percentage: number;
    chargeable_amount: number;
    disc_acc_id: number | false;
    note: string | false;
    partner_village: number | false;
    user_id: number | false;
    team_id: number | false;
    validity_date: string | false;
  };
  lines: DraftLine[];
  totals: {
    amount_untaxed: number;
    amount_tax: number;
    amount_total: number;
    round_off_amount: number;
    currency_id: number | false;
  };
  labels: Record<string, string>;
  warning: { title?: string; message: string } | false;
}

export type DraftChoiceKind =
  | 'customer'
  | 'shop'
  | 'product'
  | 'pricelist'
  | 'payment_term'
  | 'discount_account'
  | 'tax'
  | 'unit'
  | 'lot';

const draftPayload = ({ id, version, values, lines }: BillingDraft) => ({
  id,
  version,
  values,
  lines,
});

const draftCall = <T>(method: string, kwargs: object) =>
  rpc<T>(`/web/dataset/call_kw/sale.order/${method}`, {
    model: 'sale.order',
    method,
    args: [],
    kwargs,
  });

const validId = (id: unknown) =>
  id === false || (Number.isInteger(id) && Number(id) > 0);

function checkedDraft(value: BillingDraft): BillingDraft {
  const stringOrFalse = (text: unknown) =>
    text === false || typeof text === 'string';
  if (
    !value ||
    !validId(value.id) ||
    typeof value.name !== 'string' ||
    !(
      value.version === false ||
      (typeof value.version === 'string' &&
        /^[a-f0-9]{64}$/.test(value.version))
    ) ||
    !value.values ||
    ![
      'partner_id',
      'partner_invoice_id',
      'partner_shipping_id',
      'shop_id',
      'company_id',
      'pricelist_id',
      'warehouse_id',
      'location_id',
      'payment_term_id',
      'fiscal_position_id',
      'disc_acc_id',
      'partner_village',
      'user_id',
      'team_id',
    ].every((field) =>
      validId(value.values[field as keyof BillingDraft['values']]),
    ) ||
    ![false, 'opd', 'ipd'].includes(value.values.care_setting) ||
    !['none', 'fixed', 'percentage'].includes(value.values.discount_type) ||
    ![
      'provider_name',
      'client_order_ref',
      'note',
      'date_order',
      'validity_date',
    ].every((field) =>
      stringOrFalse(value.values[field as keyof BillingDraft['values']]),
    ) ||
    ![
      value.values.discount,
      value.values.discount_percentage,
      value.values.chargeable_amount,
    ].every(Number.isFinite) ||
    !Array.isArray(value.lines) ||
    !value.lines.every(
      (line) =>
        line &&
        validId(line.id) &&
        line.values &&
        [
          line.values.product_id,
          line.values.product_uom,
          line.values.lot_id,
        ].every(validId) &&
        stringOrFalse(line.values.name) &&
        stringOrFalse(line.values.expiry_date) &&
        [false, 'line_section', 'line_note'].includes(
          line.values.display_type,
        ) &&
        [
          line.values.sequence,
          line.values.product_uom_qty,
          line.values.price_unit,
          line.values.discount,
        ].every(Number.isFinite) &&
        Array.isArray(line.values.tax_id) &&
        line.values.tax_id.every((id) => Number.isInteger(id) && id > 0) &&
        line.totals &&
        [
          line.totals.price_subtotal,
          line.totals.price_tax,
          line.totals.price_total,
        ].every(Number.isFinite),
    ) ||
    !value.totals ||
    ![
      value.totals.amount_untaxed,
      value.totals.amount_tax,
      value.totals.amount_total,
      value.totals.round_off_amount,
    ].every(Number.isFinite) ||
    !validId(value.totals.currency_id) ||
    !value.labels ||
    typeof value.labels !== 'object' ||
    (value.totals.currency_id &&
      !value.labels[`res.currency:${value.totals.currency_id}`]) ||
    (!value.totals.currency_id &&
      [
        value.totals.amount_untaxed,
        value.totals.amount_tax,
        value.totals.amount_total,
        value.totals.round_off_amount,
      ].some((amount) => amount !== 0)) ||
    !Object.values(value.labels).every((label) => typeof label === 'string') ||
    !(
      value.warning === false ||
      (value.warning && typeof value.warning.message === 'string')
    )
  )
    throw new Error('Invalid draft response. Reload the editor.');
  return value;
}

export const getBillingDraft = async (orderId: number | false = false) =>
  checkedDraft(
    await draftCall<BillingDraft>('qorlia_draft_load', { order_id: orderId }),
  );

export const previewBillingDraft = async (
  draft: BillingDraft,
  change: { field: string; line?: number },
) =>
  checkedDraft(
    await draftCall<BillingDraft>('qorlia_draft_preview', {
      payload: draftPayload(draft),
      change,
    }),
  );

export const saveBillingDraft = async (
  draft: BillingDraft,
  requestKey: string,
) =>
  checkedDraft(
    await draftCall<BillingDraft>('qorlia_draft_save', {
      payload: draftPayload(draft),
      request_key: requestKey,
    }),
  );

export interface OrderWorkflow {
  id: number;
  name: string;
  state: ChargeOrder['state'];
  version: string;
  customer: string | false;
  currency: [number, string];
  amount_total: number;
  can_confirm: boolean;
  can_invoice: boolean;
  automation: { delivery: boolean; invoice: boolean; legacy_delivery: boolean };
  invoices: {
    id: number;
    name: string | false;
    state: 'draft' | 'posted' | 'cancel';
    total: number;
    currency: [number, string];
  }[];
  pickings: { id: number; name: string; state: string }[];
}

function checkedWorkflow(value: OrderWorkflow): OrderWorkflow {
  const positiveId = (id: unknown) => Number.isInteger(id) && Number(id) > 0;
  if (
    !value ||
    !positiveId(value.id) ||
    typeof value.name !== 'string' ||
    !['draft', 'sent', 'sale', 'done', 'cancel'].includes(value.state) ||
    typeof value.version !== 'string' ||
    !/^[a-f0-9]{64}$/.test(value.version) ||
    !(value.customer === false || typeof value.customer === 'string') ||
    !Array.isArray(value.currency) ||
    !validRelation(value.currency) ||
    !Number.isFinite(value.amount_total) ||
    typeof value.can_confirm !== 'boolean' ||
    typeof value.can_invoice !== 'boolean' ||
    !value.automation ||
    !['delivery', 'invoice', 'legacy_delivery'].every(
      (key) =>
        typeof value.automation[key as keyof OrderWorkflow['automation']] ===
        'boolean',
    ) ||
    !Array.isArray(value.invoices) ||
    !value.invoices.every(
      (invoice) =>
        invoice &&
        positiveId(invoice.id) &&
        (invoice.name === false || typeof invoice.name === 'string') &&
        ['draft', 'posted', 'cancel'].includes(invoice.state) &&
        Number.isFinite(invoice.total) &&
        Array.isArray(invoice.currency) &&
        validRelation(invoice.currency),
    ) ||
    !Array.isArray(value.pickings) ||
    !value.pickings.every(
      (picking) =>
        picking &&
        positiveId(picking.id) &&
        typeof picking.name === 'string' &&
        typeof picking.state === 'string',
    )
  )
    throw new Error(
      'Invalid order status response. Reload the current status.',
    );
  return value;
}

export const getOrderWorkflow = async (orderId: number) =>
  checkedWorkflow(
    await draftCall<OrderWorkflow>('qorlia_order_workflow_load', {
      order_id: orderId,
    }),
  );

export const runOrderWorkflow = async (
  order: OrderWorkflow,
  action: 'confirm' | 'invoice',
) =>
  checkedWorkflow(
    await draftCall<OrderWorkflow>('qorlia_order_workflow_run', {
      order_id: order.id,
      version: order.version,
      action,
    }),
  );

function checkedInvoiceWorkflow(value: InvoiceWorkflow): InvoiceWorkflow {
  if (
    !value ||
    !Number.isInteger(value.id) ||
    value.id <= 0 ||
    !(value.name === false || typeof value.name === 'string') ||
    !['draft', 'posted', 'cancel'].includes(value.state) ||
    !['out_invoice', 'out_refund'].includes(value.move_type) ||
    typeof value.version !== 'string' ||
    !/^[a-f0-9]{64}$/.test(value.version) ||
    !(value.customer === false || typeof value.customer === 'string') ||
    !Array.isArray(value.currency) ||
    !validRelation(value.currency) ||
    ![value.total, value.open_amount].every(Number.isFinite) ||
    typeof value.payment_state !== 'string' ||
    !(value.invoice_date === false || typeof value.invoice_date === 'string') ||
    typeof value.journal !== 'string' ||
    typeof value.company !== 'string' ||
    typeof value.ledger_balanced !== 'boolean' ||
    typeof value.can_post !== 'boolean'
  )
    throw new Error(
      'Invalid invoice status response. Reload its current status.',
    );
  return value;
}

const invoiceWorkflowCall = async (method: string, kwargs: object) =>
  checkedInvoiceWorkflow(
    await rpc<InvoiceWorkflow>(`/web/dataset/call_kw/account.move/${method}`, {
      model: 'account.move',
      method,
      args: [],
      kwargs,
    }),
  );

export const getInvoiceWorkflow = (invoiceId: number) =>
  invoiceWorkflowCall('qorlia_invoice_workflow_load', {
    invoice_id: invoiceId,
  });

export const postInvoiceWorkflow = (invoice: InvoiceWorkflow) =>
  invoiceWorkflowCall('qorlia_invoice_workflow_post', {
    invoice_id: invoice.id,
    version: invoice.version,
  });

export interface InvoiceDraftLine {
  id: number | false;
  values: {
    product_id: number | false;
    name: string | false;
    display_type: 'product' | 'line_section' | 'line_note';
    sequence: number;
    account_id: number | false;
    product_uom_id: number | false;
    quantity: number;
    price_unit: number;
    discount: number;
    tax_ids: number[];
    analytic_distribution: Record<string, number> | false;
  };
  totals: { price_subtotal: number; price_total: number };
}

export interface InvoiceDraft {
  id: number;
  name: string | false;
  move_type: 'out_invoice' | 'out_refund';
  company: [number, string];
  version: string;
  review_version?: string;
  values: {
    partner_id: number | false;
    partner_shipping_id: number | false;
    ref: string | false;
    payment_reference: string | false;
    invoice_date: string | false;
    date: string | false;
    invoice_date_due: string | false;
    invoice_payment_term_id: number | false;
    journal_id: number | false;
    currency_id: number | false;
    fiscal_position_id: number | false;
    invoice_user_id: number | false;
    partner_bank_id: number | false;
    invoice_incoterm_id: number | false;
    narration: string | false;
    discount_type: 'none' | 'fixed' | 'percentage';
    discount: number;
    discount_percentage: number;
    disc_acc_id: number | false;
    invoice_cash_rounding_id: number | false;
    auto_post: 'no' | 'at_date' | 'monthly' | 'quarterly' | 'yearly';
    auto_post_until: string | false;
    to_check: boolean;
  };
  lines: InvoiceDraftLine[];
  totals: {
    qorlia_item_subtotal: number;
    amount_tax: number;
    amount_total: number;
    invoice_total: number;
    round_off_amount: number;
  };
  labels: Record<string, string>;
  warning: { title?: string; message: string } | false;
  generated_adjustments: { kind: string; name: string; amount: number }[];
  selections: {
    discount_type: [string, string][];
    auto_post: [string, string][];
  };
  journal_locked: boolean;
  can_edit: boolean;
}

export type InvoiceDraftChoiceKind =
  | 'customer'
  | 'shipping'
  | 'product'
  | 'journal'
  | 'currency'
  | 'account'
  | 'discount_account'
  | 'tax'
  | 'payment_term'
  | 'fiscal_position'
  | 'bank'
  | 'incoterm'
  | 'cash_rounding'
  | 'salesperson'
  | 'analytic'
  | 'unit';

const invoiceDraftCall = <T>(method: string, kwargs: object) =>
  rpc<T>(`/web/dataset/call_kw/account.move/${method}`, {
    model: 'account.move',
    method,
    args: [],
    kwargs,
  });
const hashVersion = (value: unknown) =>
  typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const dateOrFalse = (value: unknown) =>
  value === false ||
  (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value));

function checkedInvoiceDraft(
  value: InvoiceDraft,
  invoiceId: number,
  reviewed = false,
): InvoiceDraft {
  const header = value?.values;
  const selection = (rows: unknown) =>
    Array.isArray(rows) &&
    rows.length > 0 &&
    rows.every(
      (row) =>
        Array.isArray(row) &&
        row.length === 2 &&
        row.every((part) => typeof part === 'string'),
    );
  const stringOrFalse = (text: unknown) =>
    text === false || typeof text === 'string';
  if (
    !value ||
    !validId(value.id) ||
    !value.id ||
    value.id !== invoiceId ||
    !stringOrFalse(value.name) ||
    !['out_invoice', 'out_refund'].includes(value.move_type) ||
    !value.company ||
    !validRelation(value.company) ||
    !hashVersion(value.version) ||
    (reviewed && !hashVersion(value.review_version)) ||
    (value.review_version !== undefined &&
      !hashVersion(value.review_version)) ||
    !header ||
    ![
      header.partner_id,
      header.partner_shipping_id,
      header.invoice_payment_term_id,
      header.journal_id,
      header.currency_id,
      header.fiscal_position_id,
      header.invoice_user_id,
      header.partner_bank_id,
      header.invoice_incoterm_id,
      header.disc_acc_id,
      header.invoice_cash_rounding_id,
    ].every(validId) ||
    ![header.ref, header.payment_reference, header.narration].every(
      stringOrFalse,
    ) ||
    ![
      header.invoice_date,
      header.date,
      header.invoice_date_due,
      header.auto_post_until,
    ].every(dateOrFalse) ||
    !['none', 'fixed', 'percentage'].includes(header.discount_type) ||
    !['no', 'at_date', 'monthly', 'quarterly', 'yearly'].includes(
      header.auto_post,
    ) ||
    ![header.discount, header.discount_percentage].every(Number.isFinite) ||
    typeof header.to_check !== 'boolean' ||
    !Array.isArray(value.lines) ||
    value.lines.length > 500 ||
    !value.lines.every(
      (line) =>
        line &&
        validId(line.id) &&
        line.values &&
        [
          line.values.product_id,
          line.values.account_id,
          line.values.product_uom_id,
        ].every(validId) &&
        stringOrFalse(line.values.name) &&
        ['product', 'line_section', 'line_note'].includes(
          line.values.display_type,
        ) &&
        [
          line.values.sequence,
          line.values.quantity,
          line.values.price_unit,
          line.values.discount,
        ].every(Number.isFinite) &&
        Array.isArray(line.values.tax_ids) &&
        line.values.tax_ids.every((id) => Number.isInteger(id) && id > 0) &&
        (line.values.analytic_distribution === false ||
          (line.values.analytic_distribution &&
            typeof line.values.analytic_distribution === 'object' &&
            !Array.isArray(line.values.analytic_distribution) &&
            Object.entries(line.values.analytic_distribution).every(
              ([key, percentage]) =>
                /^\d+(,\d+)*$/.test(key) && Number.isFinite(percentage),
            ))) &&
        line.totals &&
        [line.totals.price_subtotal, line.totals.price_total].every(
          Number.isFinite,
        ),
    ) ||
    !value.totals ||
    ![
      value.totals.qorlia_item_subtotal,
      value.totals.amount_tax,
      value.totals.amount_total,
      value.totals.invoice_total,
      value.totals.round_off_amount,
    ].every(Number.isFinite) ||
    !value.labels ||
    typeof value.labels !== 'object' ||
    Array.isArray(value.labels) ||
    !Object.values(value.labels).every((label) => typeof label === 'string') ||
    !header.currency_id ||
    !value.labels[`res.currency:${header.currency_id}`] ||
    !(
      value.warning === false ||
      (value.warning && typeof value.warning.message === 'string')
    ) ||
    !Array.isArray(value.generated_adjustments) ||
    !value.generated_adjustments.every(
      (row) =>
        row &&
        typeof row.kind === 'string' &&
        typeof row.name === 'string' &&
        Number.isFinite(row.amount),
    ) ||
    !value.selections ||
    !selection(value.selections.discount_type) ||
    !selection(value.selections.auto_post) ||
    typeof value.journal_locked !== 'boolean' ||
    typeof value.can_edit !== 'boolean'
  )
    throw new Error('Invalid invoice draft response. Reload the editor.');
  return value;
}

const invoiceDraftPayload = ({ id, version, values, lines }: InvoiceDraft) => ({
  id,
  version,
  values,
  lines,
});
export const getInvoiceDraft = async (invoiceId: number) =>
  checkedInvoiceDraft(
    await invoiceDraftCall<InvoiceDraft>('qorlia_invoice_draft_load', {
      invoice_id: invoiceId,
    }),
    invoiceId,
  );
export const previewInvoiceDraft = async (
  draft: InvoiceDraft,
  change: { field: string; line?: number },
) =>
  checkedInvoiceDraft(
    await invoiceDraftCall<InvoiceDraft>('qorlia_invoice_draft_preview', {
      payload: invoiceDraftPayload(draft),
      change,
    }),
    draft.id,
    true,
  );
export const saveInvoiceDraft = async (draft: InvoiceDraft) => {
  if (!hashVersion(draft.review_version))
    throw new Error('Recalculate this draft before saving.');
  return checkedInvoiceDraft(
    await invoiceDraftCall<InvoiceDraft>('qorlia_invoice_draft_save', {
      payload: invoiceDraftPayload(draft),
      review_version: draft.review_version,
    }),
    draft.id,
  );
};
export const getInvoiceDraftChoices = async (
  invoiceId: number,
  kind: InvoiceDraftChoiceKind,
  search: string,
  productId: number | false = false,
) => {
  const result = await invoiceDraftCall<[number, string][]>(
    'qorlia_invoice_draft_choices',
    {
      invoice_id: invoiceId,
      kind,
      search,
      product_id: productId,
    },
  );
  if (
    !Array.isArray(result) ||
    result.length > 26 ||
    !result.every((row) => row && validRelation(row))
  )
    throw new Error('Invalid invoice choices response.');
  return result;
};

export interface CorrectionWorkflow {
  invoice: InvoiceWorkflow;
  version: string;
  can_reset: boolean;
  can_cancel: boolean;
  posted_before: boolean;
  allocations: {
    id: number;
    name: string;
    date: string;
    amount: number;
    currency: [number, string];
    is_exchange: boolean;
  }[];
}

export const getCorrectionWorkflow = async (invoiceId: number) => {
  const value = await rpc<CorrectionWorkflow>(
    '/web/dataset/call_kw/account.move/qorlia_correction_load',
    {
      model: 'account.move',
      method: 'qorlia_correction_load',
      args: [],
      kwargs: { invoice_id: invoiceId },
    },
  );
  if (
    !value ||
    typeof value.version !== 'string' ||
    !/^[a-f0-9]{64}$/.test(value.version) ||
    typeof value.can_reset !== 'boolean' ||
    typeof value.can_cancel !== 'boolean' ||
    typeof value.posted_before !== 'boolean' ||
    !Array.isArray(value.allocations) ||
    value.allocations.length > 200 ||
    value.allocations.some(
      (row) =>
        !row ||
        !Number.isInteger(row.id) ||
        row.id <= 0 ||
        typeof row.name !== 'string' ||
        typeof row.date !== 'string' ||
        !Number.isFinite(row.amount) ||
        row.amount < 0 ||
        !Array.isArray(row.currency) ||
        !validRelation(row.currency) ||
        typeof row.is_exchange !== 'boolean',
    )
  )
    throw new Error('Invalid correction review. Reload the current status.');
  checkedInvoiceWorkflow(value.invoice);
  if (value.invoice.id !== invoiceId)
    throw new Error('The correction review belongs to another invoice.');
  return value;
};

export const runCorrectionWorkflow = async (
  review: CorrectionWorkflow,
  action: 'reset' | 'cancel',
) => {
  const result = await invoiceWorkflowCall('qorlia_correction_run', {
    invoice_id: review.invoice.id,
    version: review.version,
    action,
  });
  if (result.id !== review.invoice.id)
    throw new Error(
      'The correction result belongs to another invoice. Reload its current status.',
    );
  return result;
};

export interface ReversalValues {
  date_mode: 'custom' | 'entry';
  date: string | false;
  reason: string | false;
  refund_method: 'refund' | 'cancel' | 'modify';
  journal_id: number | false;
}

export interface ReversalWorkflow {
  invoice: InvoiceWorkflow;
  can_reverse: boolean;
  reason: string | false;
  values: ReversalValues | false;
  source_version: string | false;
  version: string | false;
  journals: [number, string][];
  methods: [ReversalValues['refund_method'], string][];
  effective_date: string | false;
  scheduled: boolean;
  history: InvoiceWorkflow[];
}

export interface ReversalResult {
  invoice: InvoiceWorkflow;
  credits: InvoiceWorkflow[];
  replacements: InvoiceWorkflow[];
  scheduled: boolean;
  effective_date: string;
}

const reversalCall = <T>(method: string, kwargs: object) =>
  rpc<T>(`/web/dataset/call_kw/account.move/${method}`, {
    model: 'account.move',
    method,
    args: [],
    kwargs,
  });

function checkedReversal(value: ReversalWorkflow, invoiceId: number) {
  const version = (input: unknown) =>
    input === false ||
    (typeof input === 'string' && /^[a-f0-9]{64}$/.test(input));
  const text = (input: unknown) => input === false || typeof input === 'string';
  if (
    !value ||
    typeof value.can_reverse !== 'boolean' ||
    !text(value.reason) ||
    !version(value.version) ||
    !version(value.source_version) ||
    !text(value.effective_date) ||
    typeof value.scheduled !== 'boolean' ||
    !Array.isArray(value.journals) ||
    !value.journals.every((row) => Array.isArray(row) && validRelation(row)) ||
    !Array.isArray(value.methods) ||
    !value.methods.every(
      (row) =>
        Array.isArray(row) &&
        row.length === 2 &&
        ['refund', 'cancel', 'modify'].includes(row[0]) &&
        typeof row[1] === 'string',
    ) ||
    !Array.isArray(value.history) ||
    value.history.length > 100
  )
    throw new Error('Invalid credit-note review. Reload the current status.');
  checkedInvoiceWorkflow(value.invoice);
  if (value.invoice.id !== invoiceId)
    throw new Error('The credit-note review belongs to another invoice.');
  value.history.forEach(checkedInvoiceWorkflow);
  if (
    value.values !== false &&
    (!value.values ||
      !['custom', 'entry'].includes(value.values.date_mode) ||
      !['refund', 'cancel', 'modify'].includes(value.values.refund_method) ||
      !text(value.values.date) ||
      !text(value.values.reason) ||
      !(
        value.values.journal_id === false ||
        (Number.isInteger(value.values.journal_id) &&
          value.values.journal_id > 0)
      ))
  )
    throw new Error(
      'Invalid native credit-note options. Reload the current status.',
    );
  if (
    value.can_reverse &&
    (!value.values ||
      !value.version ||
      !value.source_version ||
      !value.effective_date ||
      !value.journals.some(
        ([id]) => value.values && id === value.values.journal_id,
      ) ||
      !value.methods.some(
        ([method]) => value.values && method === value.values.refund_method,
      ))
  )
    throw new Error('The credit-note review has no eligible native options.');
  return value;
}

export const getReversalWorkflow = async (invoiceId: number) =>
  checkedReversal(
    await reversalCall<ReversalWorkflow>('qorlia_reversal_load', {
      invoice_id: invoiceId,
    }),
    invoiceId,
  );

export const previewReversalWorkflow = async (
  review: ReversalWorkflow,
  values: ReversalValues,
) =>
  checkedReversal(
    await reversalCall<ReversalWorkflow>('qorlia_reversal_preview', {
      invoice_id: review.invoice.id,
      source_version: review.source_version,
      values,
    }),
    review.invoice.id,
  );

export const runReversalWorkflow = async (review: ReversalWorkflow) => {
  const result = await reversalCall<ReversalResult>('qorlia_reversal_run', {
    invoice_id: review.invoice.id,
    version: review.version,
    values: review.values,
  });
  if (
    !result ||
    !Array.isArray(result.credits) ||
    result.credits.length !== 1 ||
    !Array.isArray(result.replacements) ||
    result.replacements.length !==
      (review.values && review.values.refund_method === 'modify' ? 1 : 0) ||
    typeof result.scheduled !== 'boolean' ||
    typeof result.effective_date !== 'string'
  )
    throw new Error(
      'Invalid credit-note result. Reload Billing before trying again.',
    );
  checkedInvoiceWorkflow(result.invoice);
  result.credits.forEach(checkedInvoiceWorkflow);
  result.replacements.forEach(checkedInvoiceWorkflow);
  if (
    result.invoice.id !== review.invoice.id ||
    result.credits.some((move) => move.move_type !== 'out_refund') ||
    result.replacements.some((move) => move.move_type !== 'out_invoice')
  )
    throw new Error(
      'The credit-note result has unexpected documents. Reload Billing before trying again.',
    );
  const expectedState =
    result.scheduled ||
    (review.values && review.values.refund_method === 'refund')
      ? 'draft'
      : 'posted';
  if (
    result.scheduled !== review.scheduled ||
    result.effective_date !== review.effective_date ||
    !result.invoice.ledger_balanced ||
    result.credits.some(
      (move) =>
        move.id === review.invoice.id ||
        move.state !== expectedState ||
        !move.ledger_balanced,
    ) ||
    result.replacements.some(
      (move) => move.state !== 'draft' || !move.ledger_balanced,
    )
  )
    throw new Error(
      'The saved credit-note status differs from the review. Reload Billing before trying again.',
    );
  return result;
};

export interface CreditWorkflow {
  invoice: InvoiceWorkflow;
  version: string;
  credits: {
    id: number;
    source_id: number;
    name: string;
    date: string;
    amount: number;
    currency: [number, string];
    can_apply: boolean;
  }[];
  history: {
    id: number;
    name: string;
    date: string;
    amount: number;
    currency: [number, string];
    is_exchange: boolean;
    can_remove: boolean;
  }[];
}

const creditCall = async (method: string, kwargs: object) => {
  const value = await rpc<CreditWorkflow>(
    `/web/dataset/call_kw/account.move/${method}`,
    { model: 'account.move', method, args: [], kwargs },
  );
  if (!value?.invoice)
    throw new Error(
      'Invalid credit allocation response. Reload current status.',
    );
  checkedInvoiceWorkflow(value.invoice);
  const validRow = (row: CreditWorkflow['history'][number]) =>
    row &&
    Number.isInteger(row.id) &&
    row.id > 0 &&
    typeof row.name === 'string' &&
    typeof row.date === 'string' &&
    Number.isFinite(row.amount) &&
    row.amount >= 0 &&
    Array.isArray(row.currency) &&
    validRelation(row.currency);
  if (
    typeof value.version !== 'string' ||
    !/^[a-f0-9]{64}$/.test(value.version) ||
    !Array.isArray(value.credits) ||
    !Array.isArray(value.history) ||
    !value.credits.every(
      (row) =>
        validRow({ ...row, is_exchange: false, can_remove: false }) &&
        Number.isInteger(row.source_id) &&
        row.source_id > 0 &&
        typeof row.can_apply === 'boolean' &&
        (!row.can_apply ||
          (value.invoice.ledger_balanced &&
            value.invoice.state === 'posted' &&
            value.invoice.open_amount > 0)),
    ) ||
    !value.history.every(
      (row) =>
        validRow(row) &&
        typeof row.is_exchange === 'boolean' &&
        typeof row.can_remove === 'boolean' &&
        (!row.can_remove ||
          (!row.is_exchange &&
            value.invoice.ledger_balanced &&
            value.invoice.state === 'posted')),
    )
  )
    throw new Error(
      'Invalid credit allocation response. Reload current status.',
    );
  return value;
};

export const getCreditWorkflow = (invoiceId: number) =>
  creditCall('qorlia_credit_load', { invoice_id: invoiceId });

export const applyCreditWorkflow = (review: CreditWorkflow, lineId: number) =>
  creditCall('qorlia_credit_apply', {
    invoice_id: review.invoice.id,
    line_id: lineId,
    version: review.version,
  });

export const removeCreditWorkflow = (
  review: CreditWorkflow,
  partialId: number,
) =>
  creditCall('qorlia_credit_remove', {
    invoice_id: review.invoice.id,
    partial_id: partialId,
    version: review.version,
  });

export interface PaymentValues {
  journal_id: number | false;
  payment_method_line_id: number | false;
  currency_id: number | false;
  partner_bank_id: number | false;
  amount: number;
  payment_date: string;
  communication: string | false;
  payment_difference_handling: 'open' | 'reconcile';
  writeoff_account_id: number | false;
  writeoff_label: string | false;
}

export interface PaymentWorkflow {
  invoice: InvoiceWorkflow;
  values: PaymentValues | false;
  version: string | false;
  can_record: boolean;
  reason: string | false;
  currency: [number, string];
  payment_type: 'inbound' | 'outbound' | false;
  difference: number;
  journals: [number, string][];
  methods: [number, string][];
  currencies: [number, string][];
  banks: [number, string][];
  accounts: [number, string][];
  payments: {
    id: number;
    name: string;
    date: string;
    amount: number;
    currency_id: [number, string];
    journal_id: [number, string];
    journal_type: string;
    is_matched: boolean;
    state: string;
    payment_type: 'inbound' | 'outbound';
    ref: string | false;
  }[];
}

const paymentCall = async (method: string, kwargs: object) => {
  const value = await rpc<PaymentWorkflow>(
    `/web/dataset/call_kw/account.move/${method}`,
    { model: 'account.move', method, args: [], kwargs },
  );
  if (!value?.invoice)
    throw new Error(
      'Invalid native payment response. Reload the current status.',
    );
  checkedInvoiceWorkflow(value.invoice);
  const choices = [
    value.journals,
    value.methods,
    value.currencies,
    value.banks,
    value.accounts,
  ];
  const data = value.values;
  if (
    typeof value.can_record !== 'boolean' ||
    !(value.reason === false || typeof value.reason === 'string') ||
    !validRelation(value.currency) ||
    !Array.isArray(value.currency) ||
    ![false, 'inbound', 'outbound'].includes(value.payment_type) ||
    !Number.isFinite(value.difference) ||
    !(
      value.version === false ||
      (typeof value.version === 'string' &&
        /^[a-f0-9]{64}$/.test(value.version))
    ) ||
    !choices.every(
      (rows) =>
        Array.isArray(rows) &&
        rows.every((row) => Array.isArray(row) && validRelation(row)),
    ) ||
    !(
      data === false ||
      (data &&
        [
          'journal_id',
          'payment_method_line_id',
          'currency_id',
          'partner_bank_id',
          'writeoff_account_id',
        ].every((field) => {
          const id = data[field as keyof PaymentValues];
          return (
            id === false ||
            (typeof id === 'number' && Number.isInteger(id) && id > 0)
          );
        }) &&
        Number.isFinite(data.amount) &&
        typeof data.payment_date === 'string' &&
        ['open', 'reconcile'].includes(data.payment_difference_handling) &&
        ['communication', 'writeoff_label'].every(
          (field) =>
            data[field as keyof PaymentValues] === false ||
            typeof data[field as keyof PaymentValues] === 'string',
        ))
    ) ||
    (value.can_record &&
      (!data ||
        !value.version ||
        !value.invoice.ledger_balanced ||
        value.invoice.state !== 'posted')) ||
    !Array.isArray(value.payments) ||
    !value.payments.every(
      (payment) =>
        payment &&
        Number.isInteger(payment.id) &&
        payment.id > 0 &&
        typeof payment.name === 'string' &&
        typeof payment.date === 'string' &&
        Number.isFinite(payment.amount) &&
        validRelation(payment.currency_id) &&
        Array.isArray(payment.currency_id) &&
        validRelation(payment.journal_id) &&
        Array.isArray(payment.journal_id) &&
        typeof payment.journal_type === 'string' &&
        typeof payment.is_matched === 'boolean' &&
        typeof payment.state === 'string' &&
        ['inbound', 'outbound'].includes(payment.payment_type) &&
        (payment.ref === false || typeof payment.ref === 'string'),
    )
  )
    throw new Error(
      'Invalid native payment response. Reload the current status.',
    );
  return value;
};

export const getPaymentWorkflow = (invoiceId: number) =>
  paymentCall('qorlia_payment_load', { invoice_id: invoiceId });

export const previewPaymentWorkflow = (
  invoice: InvoiceWorkflow,
  values: PaymentValues,
  changed:
    | false
    | 'journal_id'
    | 'payment_method_line_id'
    | 'currency_id'
    | 'payment_date' = false,
) =>
  paymentCall('qorlia_payment_preview', {
    invoice_id: invoice.id,
    invoice_version: invoice.version,
    values,
    changed,
  });

export const recordPaymentWorkflow = (review: PaymentWorkflow) =>
  paymentCall('qorlia_payment_record', {
    invoice_id: review.invoice.id,
    version: review.version,
    values: review.values,
  });

export const getDraftChoices = async (
  kind: DraftChoiceKind,
  search: string,
  shopId: number | false = false,
  productId: number | false = false,
) => {
  const result = await draftCall<[number, string][]>('qorlia_draft_choices', {
    kind,
    search,
    shop_id: shopId,
    product_id: productId,
  });
  if (
    !Array.isArray(result) ||
    !result.every(
      (row) =>
        Array.isArray(row) &&
        row.length === 2 &&
        Number.isInteger(row[0]) &&
        row[0] > 0 &&
        typeof row[1] === 'string',
    )
  )
    throw new Error('Invalid billing choices response.');
  return result;
};

export const getInvoices = async (
  search: string,
  offset: number,
  invoiceIds?: number[],
) => {
  const result = await rpc<Invoice[]>(
    '/web/dataset/call_kw/account.move/search_read',
    {
      model: 'account.move',
      method: 'search_read',
      args: [],
      kwargs: {
        domain: [
          ['move_type', 'in', ['out_invoice', 'out_refund']],
          ...(invoiceIds ? [['id', 'in', invoiceIds]] : []),
          ...(search
            ? [
                '|',
                '|',
                ['name', 'ilike', search],
                ['partner_id', 'ilike', search],
                ['ref', 'ilike', search],
              ]
            : []),
        ],
        fields: [
          'id',
          'name',
          'ref',
          'move_type',
          'partner_id',
          'invoice_date',
          'invoice_date_due',
          'state',
          'payment_state',
          'amount_total',
          'amount_untaxed',
          'qorlia_item_subtotal',
          'amount_tax',
          'discount',
          'round_off_amount',
          'invoice_total',
          'amount_residual',
          'currency_id',
        ],
        limit: 26,
        offset,
        order: 'id desc',
      },
    },
  );
  if (
    !Array.isArray(result) ||
    !result.every(
      (row) =>
        row &&
        Number.isInteger(row.id) &&
        row.id > 0 &&
        (row.name === false || typeof row.name === 'string') &&
        (row.ref === false || typeof row.ref === 'string') &&
        ['out_invoice', 'out_refund'].includes(row.move_type) &&
        typeof row.state === 'string' &&
        typeof row.payment_state === 'string' &&
        [
          'amount_total',
          'amount_untaxed',
          'qorlia_item_subtotal',
          'amount_tax',
          'discount',
          'round_off_amount',
          'invoice_total',
          'amount_residual',
        ].every((field) => Number.isFinite(row[field as keyof Invoice])) &&
        Array.isArray(row.currency_id) &&
        Number.isInteger(row.currency_id[0]) &&
        row.currency_id[0] > 0 &&
        typeof row.currency_id[1] === 'string' &&
        (row.partner_id === false ||
          (Array.isArray(row.partner_id) &&
            Number.isInteger(row.partner_id[0]) &&
            row.partner_id[0] > 0 &&
            typeof row.partner_id[1] === 'string')) &&
        (row.invoice_date === false || typeof row.invoice_date === 'string') &&
        (row.invoice_date_due === false ||
          typeof row.invoice_date_due === 'string'),
    )
  )
    throw new Error('Invalid invoice response.');
  return result;
};

export const getChargeOrders = async (
  search: string,
  offset: number,
  status: 'draft' | 'confirmed' | 'all',
) => {
  const result = await rpc<ChargeOrder[]>(
    '/web/dataset/call_kw/sale.order/search_read',
    {
      model: 'sale.order',
      method: 'search_read',
      args: [],
      kwargs: {
        domain: [
          ...(status === 'all'
            ? []
            : [
                [
                  'state',
                  'in',
                  status === 'draft' ? ['draft', 'sent'] : ['sale', 'done'],
                ],
              ]),
          ...(search
            ? [
                '|',
                '|',
                ['name', 'ilike', search],
                ['partner_id', 'ilike', search],
                ['client_order_ref', 'ilike', search],
              ]
            : []),
        ],
        fields: [
          'id',
          'name',
          'client_order_ref',
          'partner_id',
          'shop_id',
          'date_order',
          'state',
          'invoice_status',
          'care_setting',
          'provider_name',
          'amount_untaxed',
          'amount_tax',
          'amount_total',
          'discount',
          'discount_type',
          'discount_percentage',
          'chargeable_amount',
          'disc_acc_id',
          'round_off_amount',
          'currency_id',
          'invoice_ids',
        ],
        limit: 26,
        offset,
        order: 'id desc',
      },
    },
  );
  if (
    !Array.isArray(result) ||
    !result.every(
      (row) =>
        row &&
        Number.isInteger(row.id) &&
        row.id > 0 &&
        typeof row.name === 'string' &&
        typeof row.date_order === 'string' &&
        (row.client_order_ref === false ||
          typeof row.client_order_ref === 'string') &&
        (row.provider_name === false ||
          typeof row.provider_name === 'string') &&
        ['draft', 'sent', 'sale', 'done', 'cancel'].includes(row.state) &&
        ['upselling', 'invoiced', 'to invoice', 'no'].includes(
          row.invoice_status,
        ) &&
        [false, 'opd', 'ipd'].includes(row.care_setting) &&
        ['none', 'fixed', 'percentage'].includes(row.discount_type) &&
        [row.partner_id, row.shop_id, row.disc_acc_id].every(validRelation) &&
        Array.isArray(row.currency_id) &&
        validRelation(row.currency_id) &&
        [
          row.amount_untaxed,
          row.amount_tax,
          row.amount_total,
          row.discount,
          row.discount_percentage,
          row.chargeable_amount,
          row.round_off_amount,
        ].every(Number.isFinite) &&
        Array.isArray(row.invoice_ids) &&
        row.invoice_ids.every((id) => Number.isInteger(id) && id > 0),
    )
  )
    throw new Error('Invalid charge order response.');
  return result;
};

export const getChargeOrderLines = async (orderId: number) => {
  const result = await rpc<ChargeOrderLine[]>(
    '/web/dataset/call_kw/sale.order.line/search_read',
    {
      model: 'sale.order.line',
      method: 'search_read',
      args: [],
      kwargs: {
        domain: [['order_id', '=', orderId]],
        fields: [
          'id',
          'name',
          'display_type',
          'product_id',
          'product_uom',
          'product_uom_qty',
          'qty_delivered',
          'qty_invoiced',
          'price_unit',
          'discount',
          'price_subtotal',
          'price_tax',
          'price_total',
          'dispensed',
          'lot_id',
          'expiry_date',
        ],
        limit: 501,
        order: 'sequence, id',
      },
    },
  );
  if (
    !Array.isArray(result) ||
    !result.every(
      (row) =>
        row &&
        Number.isInteger(row.id) &&
        row.id > 0 &&
        typeof row.name === 'string' &&
        [false, 'line_section', 'line_note'].includes(row.display_type) &&
        [row.product_id, row.product_uom, row.lot_id].every(validRelation) &&
        [
          row.product_uom_qty,
          row.qty_delivered,
          row.qty_invoiced,
          row.price_unit,
          row.discount,
          row.price_subtotal,
          row.price_tax,
          row.price_total,
        ].every(Number.isFinite) &&
        typeof row.dispensed === 'boolean' &&
        (row.expiry_date === false || typeof row.expiry_date === 'string'),
    )
  )
    throw new Error('Invalid charge order detail response.');
  return result;
};

export const getInvoiceLines = async (invoiceId: number) => {
  const result = await rpc<InvoiceLine[]>(
    '/web/dataset/call_kw/account.move.line/search_read',
    {
      model: 'account.move.line',
      method: 'search_read',
      args: [],
      kwargs: {
        domain: [
          ['move_id', '=', invoiceId],
          ['display_type', '=', 'product'],
          ['qorlia_adjustment_kind', '=', false],
        ],
        fields: [
          'id',
          'name',
          'quantity',
          'price_unit',
          'price_subtotal',
          'discount',
          'price_total',
        ],
        limit: 501,
        order: 'sequence, id',
      },
    },
  );
  if (
    !Array.isArray(result) ||
    !result.every(
      (row) =>
        row &&
        Number.isInteger(row.id) &&
        row.id > 0 &&
        typeof row.name === 'string' &&
        Number.isFinite(row.quantity) &&
        Number.isFinite(row.price_unit) &&
        Number.isFinite(row.price_subtotal) &&
        Number.isFinite(row.discount) &&
        Number.isFinite(row.price_total),
    )
  )
    throw new Error('Invalid invoice detail response.');
  return result;
};
