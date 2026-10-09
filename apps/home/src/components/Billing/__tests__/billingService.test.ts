import {
  BillingSessionExpired,
  getBillingSession,
  getInvoices,
  getInvoiceLines,
  signInToBilling,
  getChargeOrders,
  getChargeOrderLines,
  getBillingDraft,
  previewBillingDraft,
  saveBillingDraft,
  getDraftChoices,
} from '../billingService';
import { draftFixture } from './draftFixture';

describe('billing API', () => {
  beforeEach(() => {
    global.fetch = jest.fn();
  });
  const reply = (body: unknown) =>
    (fetch as jest.Mock).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => body,
    });
  it('uses the native ERP session without storing credentials', async () => {
    reply({ result: { uid: 3 } });
    await signInToBilling('cashier', 'synthetic-password');
    const [url, options] = (fetch as jest.Mock).mock.calls[0];
    expect(url).toBe('/openmrs/qorlia-billing-api/web/session/authenticate');
    expect(JSON.parse(options.body).params).toEqual({
      db: 'odoo',
      login: 'cashier',
      password: 'synthetic-password',
    });
    expect(options.credentials).toBe('same-origin');
  });
  it('distinguishes an expired ERP session from a service failure', async () => {
    reply({ error: { code: 100 } });
    await expect(getBillingSession()).rejects.toBeInstanceOf(
      BillingSessionExpired,
    );
    reply({ error: { code: 200, data: { debug: 'private traceback' } } });
    await expect(getBillingSession()).rejects.toThrow(
      'Check your billing account permissions',
    );
  });
  it('rejects malformed financial rows instead of rendering incorrect amounts', async () => {
    reply({ result: [{ id: 7, name: 'Broken invoice', amount_total: '500' }] });
    await expect(getInvoices('', 0)).rejects.toThrow(
      'Invalid invoice response.',
    );
    reply({ result: [null] });
    await expect(getInvoiceLines(7)).rejects.toThrow(
      'Invalid invoice detail response.',
    );
  });
  it('reads invoices with a bounded page and excludes supplier bills', async () => {
    reply({ result: [] });
    await getInvoices('QA', 25);
    const params = JSON.parse(
      (fetch as jest.Mock).mock.calls[0][1].body,
    ).params;
    expect(params.method).toBe('search_read');
    expect(params.kwargs).toMatchObject({
      limit: 26,
      offset: 25,
      domain: [
        ['move_type', 'in', ['out_invoice', 'out_refund']],
        '|',
        '|',
        ['name', 'ilike', 'QA'],
        ['partner_id', 'ilike', 'QA'],
        ['ref', 'ilike', 'QA'],
      ],
    });
    expect(params.kwargs.fields).toEqual(
      expect.arrayContaining([
        'invoice_total',
        'discount',
        'round_off_amount',
        'move_type',
      ]),
    );
  });
  it('accepts native draft numbers and rejects a missing Bahmni financial total', async () => {
    const invoice = {
      id: 7,
      name: false,
      ref: 'QA draft',
      move_type: 'out_invoice',
      partner_id: [1, 'QA'],
      currency_id: [2, 'INR'],
      invoice_date: false,
      invoice_date_due: false,
      state: 'draft',
      payment_state: 'not_paid',
      amount_untaxed: 900,
      amount_tax: 45,
      amount_total: 945,
      discount: 25.5,
      round_off_amount: 0.25,
      invoice_total: 919.75,
      amount_residual: 945,
    };
    reply({ result: [invoice] });
    expect(await getInvoices('', 0)).toEqual([invoice]);
    reply({ result: [{ ...invoice, invoice_total: undefined }] });
    await expect(getInvoices('', 0)).rejects.toThrow(
      'Invalid invoice response.',
    );
  });
  it('reads only the selected invoice items, never writes or posts it', async () => {
    reply({ result: [] });
    await getInvoiceLines(42);
    const params = JSON.parse(
      (fetch as jest.Mock).mock.calls[0][1].body,
    ).params;
    expect(params).toMatchObject({
      model: 'account.move.line',
      method: 'search_read',
      kwargs: {
        domain: [
          ['move_id', '=', 42],
          ['display_type', '=', 'product'],
        ],
      },
    });
  });
  it('rejects a malformed list response rather than showing invented empty data', async () => {
    reply({ result: {} });
    await expect(getInvoices('', 0)).rejects.toThrow(
      'Invalid invoice response',
    );
  });
  it('reads bounded charge orders with native quotation and confirmed-order filters', async () => {
    reply({ result: [] });
    await getChargeOrders('QORLIAQA', 25, 'draft');
    const [url, options] = (fetch as jest.Mock).mock.calls[0];
    expect(url).toContain('/sale.order/search_read');
    expect(JSON.parse(options.body).params.kwargs).toMatchObject({
      domain: [
        ['state', 'in', ['draft', 'sent']],
        '|',
        '|',
        ['name', 'ilike', 'QORLIAQA'],
        ['partner_id', 'ilike', 'QORLIAQA'],
        ['client_order_ref', 'ilike', 'QORLIAQA'],
      ],
      offset: 25,
      limit: 26,
      order: 'id desc',
    });
    await getChargeOrders('', 0, 'confirmed');
    await getChargeOrders('', 0, 'all');
    const params = (fetch as jest.Mock).mock.calls
      .slice(1)
      .map(([, option]) => JSON.parse(option.body).params);
    expect(params[0].kwargs.domain).toEqual([
      ['state', 'in', ['sale', 'done']],
    ]);
    expect(params[1].kwargs.domain).toEqual([]);
  });
  it('validates native charge-order totals, status, relations and linked invoice IDs', async () => {
    const order = {
      id: 9,
      name: 'QORLIAQA-ORDER',
      client_order_ref: false,
      partner_id: [2, 'QA'],
      shop_id: [1, 'QA Shop'],
      date_order: '2026-10-09 08:00:00',
      state: 'draft',
      invoice_status: 'no',
      care_setting: false,
      provider_name: false,
      amount_untaxed: 900,
      amount_tax: 45,
      amount_total: 919.75,
      discount: 25.5,
      discount_type: 'fixed',
      discount_percentage: 0,
      chargeable_amount: 0,
      disc_acc_id: false,
      round_off_amount: 0.25,
      currency_id: [1, 'INR'],
      invoice_ids: [7],
    };
    reply({ result: [order] });
    expect(await getChargeOrders('', 0, 'draft')).toEqual([order]);
    for (const broken of [
      { amount_total: Infinity },
      { amount_tax: '45' },
      { shop_id: [0, 'Bad'] },
      { currency_id: false },
      { invoice_ids: ['7'] },
      { state: 'invented' },
    ]) {
      reply({ result: [{ ...order, ...broken }] });
      await expect(getChargeOrders('', 0, 'draft')).rejects.toThrow(
        'Invalid charge order response.',
      );
    }
  });
  it('reads only selected charge-order lines including native stock and billing progress', async () => {
    const line = {
      id: 10,
      name: 'QA Consultation',
      display_type: false,
      product_id: [3, 'QA'],
      product_uom: [1, 'Units'],
      product_uom_qty: 2,
      qty_delivered: 0,
      qty_invoiced: 0,
      price_unit: 500,
      discount: 10,
      price_subtotal: 900,
      price_tax: 45,
      price_total: 945,
      dispensed: false,
      lot_id: false,
      expiry_date: false,
    };
    reply({ result: [line] });
    expect(await getChargeOrderLines(9)).toEqual([line]);
    const params = JSON.parse(
      (fetch as jest.Mock).mock.calls[0][1].body,
    ).params;
    expect(params).toMatchObject({
      model: 'sale.order.line',
      method: 'search_read',
      kwargs: {
        domain: [['order_id', '=', 9]],
        limit: 501,
        order: 'sequence, id',
      },
    });
    expect(params.kwargs.fields).toEqual(
      expect.arrayContaining([
        'qty_delivered',
        'qty_invoiced',
        'dispensed',
        'lot_id',
        'expiry_date',
      ]),
    );
    reply({ result: [{ ...line, dispensed: 'false' }] });
    await expect(getChargeOrderLines(9)).rejects.toThrow(
      'Invalid charge order detail response.',
    );
  });
  it('restricts linked invoice reads to the native order invoice IDs', async () => {
    reply({ result: [] });
    await getInvoices('', 0, [7, 8]);
    const params = JSON.parse(
      (fetch as jest.Mock).mock.calls[0][1].body,
    ).params;
    expect(params.kwargs.domain).toEqual([
      ['move_type', 'in', ['out_invoice', 'out_refund']],
      ['id', 'in', [7, 8]],
    ]);
  });
  it('uses named draft actions and strips response-only fields from saves', async () => {
    const draft = draftFixture();
    reply({ result: draft });
    expect(await getBillingDraft()).toEqual(draft);
    await previewBillingDraft(draft, { field: 'discount', line: 0 });
    await saveBillingDraft(draft, 'request-key');
    const params = JSON.parse(
      (fetch as jest.Mock).mock.calls[2][1].body,
    ).params;
    expect(params).toMatchObject({
      model: 'sale.order',
      method: 'qorlia_draft_save',
      args: [],
      kwargs: {
        request_key: 'request-key',
        payload: {
          id: false,
          version: false,
          values: draft.values,
          lines: draft.lines,
        },
      },
    });
    expect(params.kwargs.payload).not.toHaveProperty('labels');
    expect(params.kwargs.payload).not.toHaveProperty('totals');
  });
  it('rejects malformed draft money, currency and choice responses', async () => {
    for (const broken of [
      {
        ...draftFixture(),
        totals: { ...draftFixture().totals, amount_total: '500' },
      },
      { ...draftFixture(), labels: {} },
      { ...draftFixture(), version: true },
    ]) {
      reply({ result: broken });
      await expect(getBillingDraft()).rejects.toThrow('Invalid draft response');
    }
    reply({ result: [[false, 'Invalid choice']] });
    await expect(getDraftChoices('customer', '')).rejects.toThrow(
      'Invalid billing choices',
    );
  });
  it('shows native safe validation messages but never private tracebacks', async () => {
    reply({
      error: {
        code: 200,
        data: {
          name: 'odoo.exceptions.UserError',
          arguments: ['This charge order changed since you opened it.'],
          debug: 'private secret',
        },
      },
    });
    await expect(saveBillingDraft(draftFixture(), 'key')).rejects.toThrow(
      'changed since',
    );
    reply({
      error: {
        code: 200,
        data: {
          name: 'odoo.exceptions.AccessError',
          arguments: ['private secret'],
        },
      },
    });
    await expect(getBillingDraft()).rejects.toThrow(
      'Check your billing account permissions',
    );
  });
});
