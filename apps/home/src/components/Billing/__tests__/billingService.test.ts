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
  getOrderWorkflow,
  runOrderWorkflow,
  getInvoiceWorkflow,
  postInvoiceWorkflow,
  getPaymentWorkflow,
  previewPaymentWorkflow,
  recordPaymentWorkflow,
  getCreditWorkflow,
  applyCreditWorkflow,
  removeCreditWorkflow,
  getCorrectionWorkflow,
  runCorrectionWorkflow,
} from '../billingService';
import { correctionWorkflowFixture } from './correctionWorkflowFixture';
import { creditWorkflowFixture } from './creditWorkflowFixture';
import { draftFixture } from './draftFixture';
import { invoiceWorkflowFixture } from './invoiceWorkflowFixture';
import { paymentWorkflowFixture } from './paymentWorkflowFixture';
import { workflowFixture } from './workflowFixture';

describe('billing API', () => {
  beforeEach(() => {
    global.fetch = jest.fn();
  });
  it('uses only the named removal action with the reviewed invoice, partial and version', async () => {
    const credit = creditWorkflowFixture();
    reply({ result: credit });
    await removeCreditWorkflow(credit, 23);
    const [url, options] = (fetch as jest.Mock).mock.calls[0];
    expect(url).toContain('/account.move/qorlia_credit_remove');
    expect(JSON.parse(options.body).params).toEqual({
      model: 'account.move',
      method: 'qorlia_credit_remove',
      args: [],
      kwargs: { invoice_id: 7, partial_id: 23, version: credit.version },
    });
  });
  const reply = (body: unknown) =>
    (fetch as jest.Mock).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => body,
    });
  it('uses only named correction actions with the reviewed invoice and version', async () => {
    const review = correctionWorkflowFixture();
    reply({ result: review });
    expect(await getCorrectionWorkflow(7)).toEqual(review);
    reply({ result: invoiceWorkflowFixture() });
    await runCorrectionWorkflow(review, 'reset');
    const [url, options] = (fetch as jest.Mock).mock.calls[1];
    expect(url).toContain('/account.move/qorlia_correction_run');
    expect(JSON.parse(options.body).params).toEqual({
      model: 'account.move',
      method: 'qorlia_correction_run',
      args: [],
      kwargs: { invoice_id: 7, version: review.version, action: 'reset' },
    });
  });
  it('rejects malformed correction financial data and wrong-invoice reviews', async () => {
    const review = correctionWorkflowFixture();
    for (const patch of [
      { version: null },
      { can_reset: 'yes' },
      { posted_before: 1 },
      { allocations: [false] },
      { allocations: [{ ...review.allocations[0], amount: Infinity }] },
      { allocations: [{ ...review.allocations[0], amount: -1 }] },
      { allocations: [{ ...review.allocations[0], currency: false }] },
    ]) {
      reply({ result: { ...review, ...patch } });
      await expect(getCorrectionWorkflow(7)).rejects.toThrow(
        'Invalid correction review',
      );
    }
    reply({ result: { ...review, invoice: { ...review.invoice, id: 8 } } });
    await expect(getCorrectionWorkflow(7)).rejects.toThrow('another invoice');
    reply({ result: { ...invoiceWorkflowFixture(), id: 8 } });
    await expect(runCorrectionWorkflow(review, 'reset')).rejects.toThrow(
      'another invoice',
    );
  });
  it('uses only named credit actions and passes the selected line and version', async () => {
    const credit = creditWorkflowFixture();
    reply({ result: credit });
    expect(await getCreditWorkflow(7)).toEqual(credit);
    await applyCreditWorkflow(credit, 12);
    const [url, options] = (fetch as jest.Mock).mock.calls[1];
    expect(url).toContain('/account.move/qorlia_credit_apply');
    expect(JSON.parse(options.body).params).toEqual({
      model: 'account.move',
      method: 'qorlia_credit_apply',
      args: [],
      kwargs: { invoice_id: 7, line_id: 12, version: credit.version },
    });
  });
  it('rejects invalid allocation amounts, sources, versions and history', async () => {
    const credit = creditWorkflowFixture();
    for (const patch of [
      { version: 'old' },
      { credits: [{ ...credit.credits[0], amount: Infinity }] },
      { credits: [{ ...credit.credits[0], source_id: false }] },
      { credits: [{ ...credit.credits[0], can_apply: 'yes' }] },
      { history: [{ id: 1, amount: 100 }] },
      {
        history: [
          {
            id: 1,
            name: 'Exchange',
            date: '2026-10-09',
            amount: 10,
            currency: [3, 'INR'],
            is_exchange: true,
            can_remove: true,
          },
        ],
      },
      {
        history: [
          {
            id: 1,
            name: 'Receipt',
            date: '2026-10-09',
            amount: 100,
            currency: [3, 'INR'],
            is_exchange: false,
            can_remove: 'yes',
          },
        ],
      },
      { invoice: { ...credit.invoice, ledger_balanced: false } },
    ]) {
      reply({ result: { ...credit, ...patch } });
      await expect(getCreditWorkflow(7)).rejects.toThrow(
        'Invalid credit allocation response',
      );
    }
  });
  it('uses named reviewed payment actions with version and native values, not arbitrary financial writes', async () => {
    const payment = paymentWorkflowFixture();
    reply({ result: payment });
    expect(await getPaymentWorkflow(7)).toEqual(payment);
    if (!payment.values) throw new Error('Fixture requires values');
    await previewPaymentWorkflow(payment.invoice, payment.values, 'journal_id');
    await recordPaymentWorkflow(payment);
    const [url, options] = (fetch as jest.Mock).mock.calls[2];
    expect(url).toContain('/account.move/qorlia_payment_record');
    expect(JSON.parse(options.body).params).toEqual({
      model: 'account.move',
      method: 'qorlia_payment_record',
      args: [],
      kwargs: {
        invoice_id: 7,
        version: payment.version,
        values: payment.values,
      },
    });
  });
  it('rejects malformed native payment money, eligibility, choices and history', async () => {
    const payment = paymentWorkflowFixture();
    for (const broken of [
      { difference: NaN },
      { version: 'old' },
      { currency: false },
      { methods: [false] },
      { can_record: 'yes' },
      { values: false },
      { payments: [{ id: 2, amount: '500' }] },
      { values: { ...payment.values, amount: Infinity } },
    ]) {
      reply({ result: { ...payment, ...broken } });
      await expect(getPaymentWorkflow(7)).rejects.toThrow(
        'Invalid native payment response',
      );
    }
  });
  it('uses named invoice posting with the loaded version and validates financial status', async () => {
    const invoice = invoiceWorkflowFixture();
    reply({ result: invoice });
    expect(await getInvoiceWorkflow(7)).toEqual(invoice);
    await postInvoiceWorkflow(invoice);
    const [url, options] = (fetch as jest.Mock).mock.calls[1];
    expect(url).toContain('/account.move/qorlia_invoice_workflow_post');
    expect(JSON.parse(options.body).params).toEqual({
      model: 'account.move',
      method: 'qorlia_invoice_workflow_post',
      args: [],
      kwargs: { invoice_id: 7, version: invoice.version },
    });
    for (const broken of [
      { ledger_balanced: 'yes' },
      { can_post: 1 },
      { currency: false },
      { total: NaN },
      { version: 'stale' },
    ]) {
      reply({ result: { ...invoice, ...broken } });
      await expect(getInvoiceWorkflow(7)).rejects.toThrow(
        'Invalid invoice status response',
      );
    }
  });
  it('uses named native workflow actions with a current version, never arbitrary state writes', async () => {
    const workflow = workflowFixture();
    reply({ result: workflow });
    expect(await getOrderWorkflow(18)).toEqual(workflow);
    await runOrderWorkflow(workflow, 'confirm');
    const [url, options] = (fetch as jest.Mock).mock.calls[1];
    expect(url).toContain('/sale.order/qorlia_order_workflow_run');
    expect(JSON.parse(options.body).params).toEqual({
      model: 'sale.order',
      method: 'qorlia_order_workflow_run',
      args: [],
      kwargs: { order_id: 18, version: workflow.version, action: 'confirm' },
    });
  });
  it('rejects malformed workflow eligibility, automation and financial responses', async () => {
    for (const broken of [
      { can_confirm: 'yes' },
      { version: 'old' },
      { automation: {} },
      { amount_total: Infinity },
      { currency: false },
      { invoices: [{ id: 7, total: '500' }] },
    ]) {
      reply({ result: { ...workflowFixture(), ...broken } });
      await expect(getOrderWorkflow(18)).rejects.toThrow(
        'Invalid order status response',
      );
    }
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
        'qorlia_item_subtotal',
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
      qorlia_item_subtotal: 900,
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
    reply({ result: [{ ...invoice, qorlia_item_subtotal: undefined }] });
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
          ['qorlia_adjustment_kind', '=', false],
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
  it('accepts native unset currency only for an empty zero-value draft', async () => {
    const empty = {
      ...draftFixture(),
      lines: [],
      labels: {},
      totals: {
        amount_untaxed: 0,
        amount_tax: 0,
        amount_total: 0,
        round_off_amount: 0,
        currency_id: false,
      },
    };
    reply({ result: empty });
    expect(await getBillingDraft()).toEqual(empty);
    reply({
      result: { ...empty, totals: { ...empty.totals, amount_total: 500 } },
    });
    await expect(getBillingDraft()).rejects.toThrow('Invalid draft response');
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
