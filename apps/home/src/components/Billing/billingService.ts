const API = '/openmrs/qorlia-billing-api';

export class BillingSessionExpired extends Error {}

export interface BillingSession {
  uid: number | false;
  name?: string;
  db?: string;
}

export interface Invoice {
  id: number;
  name: string;
  partner_id: [number, string] | false;
  invoice_date: string | false;
  invoice_date_due: string | false;
  state: string;
  payment_state: string;
  amount_total: number;
  amount_residual: number;
  currency_id: [number, string];
}

export interface InvoiceLine {
  id: number;
  name: string;
  quantity: number;
  price_unit: number;
  price_subtotal: number;
}

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

export const getInvoices = async (search: string, offset: number) => {
  const result = await rpc<Invoice[]>(
    '/web/dataset/call_kw/account.move/search_read',
    {
      model: 'account.move',
      method: 'search_read',
      args: [],
      kwargs: {
        domain: [
          ['move_type', 'in', ['out_invoice', 'out_refund']],
          ...(search
            ? ['|', ['name', 'ilike', search], ['partner_id', 'ilike', search]]
            : []),
        ],
        fields: [
          'id',
          'name',
          'partner_id',
          'invoice_date',
          'invoice_date_due',
          'state',
          'payment_state',
          'amount_total',
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
        typeof row.name === 'string' &&
        typeof row.state === 'string' &&
        typeof row.payment_state === 'string' &&
        Number.isFinite(row.amount_total) &&
        Number.isFinite(row.amount_residual) &&
        Array.isArray(row.currency_id) &&
        typeof row.currency_id[1] === 'string' &&
        (row.partner_id === false ||
          (Array.isArray(row.partner_id) &&
            typeof row.partner_id[1] === 'string')) &&
        (row.invoice_date === false || typeof row.invoice_date === 'string') &&
        (row.invoice_date_due === false ||
          typeof row.invoice_date_due === 'string'),
    )
  )
    throw new Error('Invalid invoice response.');
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
        fields: ['id', 'name', 'quantity', 'price_unit', 'price_subtotal'],
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
        Number.isFinite(row.price_subtotal),
    )
  )
    throw new Error('Invalid invoice detail response.');
  return result;
};
