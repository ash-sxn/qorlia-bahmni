const API = '/openmrs/qorlia-billing-api';

export class BillingSessionExpired extends Error {}

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
