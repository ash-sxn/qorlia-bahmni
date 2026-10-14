import {
  BillingActionRejected,
  getAdvanceChoices,
  getAdvanceInvoice,
  getAdvanceInvoiceStatus,
  previewAdvanceInvoice,
  saveAdvanceInvoice,
} from '../billingService';
import {
  advanceFixture,
  advanceRequestFixture,
  advanceReviewFixture,
  savedAdvanceFixture,
} from './advanceInvoiceFixture';

const reply = (result: unknown) =>
  (fetch as jest.Mock).mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ result }),
  });
describe('Advance invoice API boundary', () => {
  beforeEach(() => {
    global.fetch = jest.fn();
  });
  it('loads only the requested order and scopes deposit choices without caller context', async () => {
    reply(advanceFixture());
    expect(await getAdvanceInvoice(18)).toEqual(advanceFixture());
    reply([[11, 'Sales account']]);
    expect(await getAdvanceChoices(18, 'account', 'Sales')).toEqual([
      [11, 'Sales account'],
    ]);
    expect(
      JSON.parse((fetch as jest.Mock).mock.calls[1][1].body).params,
    ).toEqual({
      model: 'sale.order',
      method: 'qorlia_advance_choices',
      args: [],
      kwargs: { order_id: 18, kind: 'account', search: 'Sales' },
    });
    reply({
      ...advanceFixture(),
      order: { ...advanceFixture().order, id: 19 },
    });
    await expect(getAdvanceInvoice(18)).rejects.toThrow(
      'Invalid advance invoice',
    );
    for (const bad of [false, [[false, 'Bad']], [[11]], [[11, 99]]]) {
      reply(bad);
      await expect(getAdvanceChoices(18, 'tax', '')).rejects.toThrow(
        'Invalid advance setting',
      );
    }
  });
  it('binds native calculation to submitted values and validates totals, currency and review', async () => {
    const review = advanceReviewFixture();
    reply(review);
    expect(await previewAdvanceInvoice(18, review.values)).toEqual(review);
    expect(
      JSON.parse((fetch as jest.Mock).mock.calls[0][1].body).params.kwargs,
    ).toEqual({ order_id: 18, values: review.values });
    for (const bad of [
      { ...review, review_version: '' },
      { ...review, values: { ...review.values, amount: 60 } },
      { ...review, invoice: { ...review.invoice, currency: [2, 'Other'] } },
      { ...review, invoice: { ...review.invoice, lines: [] } },
      {
        ...review,
        invoice: {
          ...review.invoice,
          totals: { ...review.invoice.totals, invoice_total: NaN },
        },
      },
    ]) {
      reply(bad);
      await expect(previewAdvanceInvoice(18, review.values)).rejects.toThrow(
        'Invalid advance invoice calculation',
      );
    }
  });
  it('uses the identical immutable request for save, status and retry and checks linked native invoices', async () => {
    const request = advanceRequestFixture(),
      saved = savedAdvanceFixture();
    reply(saved);
    expect(await saveAdvanceInvoice(request)).toEqual(saved);
    expect(await getAdvanceInvoiceStatus(request)).toEqual(saved);
    expect(await saveAdvanceInvoice(request)).toEqual(saved);
    for (const [url, options] of (fetch as jest.Mock).mock.calls) {
      expect(url).toMatch(/sale.order\/qorlia_advance_(save|status)$/);
      expect(JSON.parse(options.body).params.kwargs).toEqual(request);
    }
    for (const bad of [
      { ...saved, order: { ...saved.order, invoices: [] } },
      { ...saved, order: { ...saved.order, id: 19 } },
      { ...saved, invoice: { ...saved.invoice, ledger_balanced: false } },
      { ...saved, invoice: { ...saved.invoice, total: 999 } },
    ]) {
      reply(bad);
      await expect(saveAdvanceInvoice(request)).rejects.toThrow(/Invalid/);
    }
    reply(false);
    expect(await getAdvanceInvoiceStatus(request)).toBe(false);
  });
  it('refuses malformed requests before contacting Billing', async () => {
    const request = advanceRequestFixture();
    for (const bad of [
      { ...request, request_key: 'bad' },
      { ...request, order_id: 0 },
      { ...request, review_version: '' },
      { ...request, values: { ...request.values, amount: Infinity } },
      { ...request, values: { ...request.values, deposit_taxes_id: [1, 1] } },
      { ...request, values: { ...request.values, uid: 1 } },
    ])
      await expect(saveAdvanceInvoice(bad)).rejects.toThrow();
    expect(fetch).not.toHaveBeenCalled();
  });
  it('distinguishes explicit native rollback rejection from an unknown transport result', async () => {
    (fetch as jest.Mock).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        error: {
          code: 200,
          data: {
            name: 'odoo.exceptions.UserError',
            arguments: ['Order changed. Recalculate.'],
          },
        },
      }),
    });
    await expect(
      saveAdvanceInvoice(advanceRequestFixture()),
    ).rejects.toBeInstanceOf(BillingActionRejected);
    (fetch as jest.Mock).mockRejectedValue(new Error('Network lost'));
    await expect(
      saveAdvanceInvoice(advanceRequestFixture()),
    ).rejects.not.toBeInstanceOf(BillingActionRejected);
  });
});
