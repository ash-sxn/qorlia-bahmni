import {
  BillingSessionExpired,
  getBillingSession,
  getInvoices,
  getInvoiceLines,
  signInToBilling,
} from '../billingService';

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
        ['name', 'ilike', 'QA'],
        ['partner_id', 'ilike', 'QA'],
      ],
    });
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
});
