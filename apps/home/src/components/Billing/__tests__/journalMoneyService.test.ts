import {
  BillingActionRejected,
  BillingSessionExpired,
  checkedJournalMoneyRequest,
  getJournalMoney,
  getJournalMoneyChoices,
  getJournalMoneyStatus,
  JournalMoneyPayload,
  JournalMoneyView,
  previewJournalMoney,
  saveJournalMoney,
} from '../billingService';

function journalMoneyFixture(): JournalMoneyView {
  return {
    invoice_id: 7,
    name: 'INV/7',
    move_type: 'out_invoice',
    version: 'a'.repeat(64),
    company_currency: [1, 'INR'],
    transaction_currency: [1, 'INR'],
    can_edit: true,
    can_add: true,
    can_delete: false,
    editable_fields: [
      'credit',
      'debit',
      'amount_currency',
      'name',
      'account_id',
      'tax_ids',
    ],
    labels: {
      'account.account:12': 'Consultation income',
      'res.currency:1': 'INR',
    },
    totals: {
      state: 'posted',
      payment_state: 'not_paid',
      amount_untaxed: 500,
      amount_tax: 0,
      amount_total: 500,
      invoice_total: 500,
      amount_residual: 500,
    },
    rows: [
      {
        id: 14,
        values: {
          name: 'Consultation',
          account_id: 12,
          partner_id: 2,
          currency_id: 1,
          date_maturity: false,
          tax_tag_ids: [],
          analytic_distribution: false,
          discount_date: false,
          discount_amount_currency: 0,
          amount_currency: -500,
          debit: 0,
          credit: 500,
          balance: -500,
          tax_ids: [],
          product_id: false,
          product_uom_id: false,
          quantity: 1,
          price_unit: 500,
          price_subtotal: 500,
          price_total: 500,
          discount: 0,
          sequence: 10,
          display_type: 'product',
          qorlia_adjustment_kind: false,
          amount_residual: 0,
          amount_residual_currency: 0,
          reconciled: false,
          matched_debit_ids: [],
          matched_credit_ids: [],
          full_reconcile_id: false,
        },
      },
    ],
  };
}
const payload = (): JournalMoneyPayload => ({
  invoice_id: 7,
  version: 'a'.repeat(64),
  changes: [{ id: 14, values: { credit: 600 } }],
});
const request = () => ({
  payload: payload(),
  review_version: 'b'.repeat(64),
  request_key: 'b99377b5-041a-41d7-89b7-596dfc58fb7c',
});
const reply = (result: unknown) =>
  (fetch as jest.Mock).mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ result }),
  });

describe('native monetary journal contract', () => {
  beforeEach(() => {
    global.fetch = jest.fn();
  });
  it('loads the complete native ledger with named permissions', async () => {
    reply(journalMoneyFixture());
    expect(await getJournalMoney(7)).toEqual(journalMoneyFixture());
    expect(
      JSON.parse((fetch as jest.Mock).mock.calls[0][1].body).params,
    ).toEqual({
      model: 'account.move',
      method: 'qorlia_journal_money_load',
      args: [],
      kwargs: { invoice_id: 7 },
    });
  });
  it('previews native calculation without computing accounting in the client', async () => {
    const view = journalMoneyFixture();
    const review = {
      invoice_id: 7,
      totals: view.totals,
      rows: [{ ...view.rows[0], id: false }],
      review_version: 'b'.repeat(64),
    };
    reply(review);
    expect(await previewJournalMoney(payload())).toEqual(review);
    expect(
      JSON.parse((fetch as jest.Mock).mock.calls[0][1].body).params.kwargs,
    ).toEqual({ payload: payload() });
  });
  it('saves and recovers only the exact reviewed request', async () => {
    const saved = {
      ...journalMoneyFixture(),
      request_key: request().request_key,
    };
    reply(saved);
    expect(await saveJournalMoney(request())).toEqual(saved);
    expect(await getJournalMoneyStatus(request())).toEqual(saved);
    for (const call of (fetch as jest.Mock).mock.calls)
      expect(JSON.parse(call[1].body).params.kwargs).toEqual(request());
    reply(false);
    expect(await getJournalMoneyStatus(request())).toBe(false);
  });
  it('rejects changed invoice, receipt, capabilities and malformed amounts', async () => {
    const view = journalMoneyFixture();
    for (const patch of [
      { invoice_id: 8 },
      { version: 'bad' },
      { can_edit: 'yes' },
      { can_edit: false },
      { can_delete: true },
      { company_currency: false },
      { labels: [] },
      { editable_fields: ['write'] },
      { totals: { ...view.totals, amount_total: Infinity } },
      { rows: [{ ...view.rows[0], id: false }] },
      { rows: [view.rows[0], view.rows[0]] },
      {
        rows: [
          { ...view.rows[0], values: { ...view.rows[0].values, credit: NaN } },
        ],
      },
      {
        rows: [
          {
            ...view.rows[0],
            values: { ...view.rows[0].values, tax_ids: [1, 1] },
          },
        ],
      },
    ]) {
      reply({ ...view, ...patch });
      await expect(getJournalMoney(7)).rejects.toThrow();
    }
    reply({ ...view, request_key: 'wrong' });
    await expect(saveJournalMoney(request())).rejects.toThrow('recovery');
  });
  it('validates partial patches and deletion before sending anything', async () => {
    const invalid = [
      { ...payload(), changes: [] },
      { ...payload(), changes: [{ id: 14, values: { credit: -1 } }] },
      { ...payload(), changes: [{ id: 14, values: { debit: NaN } }] },
      { ...payload(), changes: [{ id: 14, values: { move_id: 8 } }] },
      { ...payload(), changes: [{ id: 14, values: {} }] },
      { ...payload(), changes: [{ id: 14, delete: false }] },
      { ...payload(), changes: [{ id: false, delete: true }] },
      { ...payload(), changes: [{ id: false, values: { credit: 100 } }] },
      { ...payload(), changes: [{ id: 14, values: { tax_ids: [1, 1] } }] },
      {
        ...payload(),
        changes: [{ id: 14, values: { date_maturity: '2026-02-30' } }],
      },
      {
        ...payload(),
        changes: [
          { id: 14, values: { credit: 600 } },
          { id: 14, delete: true },
        ],
      },
    ];
    for (const value of invalid)
      await expect(
        previewJournalMoney(value as JournalMoneyPayload),
      ).rejects.toThrow();
    expect(fetch).not.toHaveBeenCalled();
  });
  it('rejects unreviewed or corrupted recovery requests', () => {
    for (const patch of [
      { request_key: 'bad' },
      { review_version: 'x'.repeat(64) },
      { extra: true },
      { payload: { ...payload(), version: false } },
    ])
      expect(() =>
        checkedJournalMoneyRequest({ ...request(), ...patch } as never),
      ).toThrow();
  });
  it('validates choices and only sends supported searches', async () => {
    reply([[12, 'Income']]);
    expect(await getJournalMoneyChoices(7, 'account', 'Income', 14)).toEqual([
      [12, 'Income'],
    ]);
    expect(
      JSON.parse((fetch as jest.Mock).mock.calls[0][1].body).params.kwargs,
    ).toEqual({
      invoice_id: 7,
      kind: 'account',
      search: 'Income',
      line_id: 14,
    });
    reply([
      [12, 'Income'],
      [12, 'Duplicate'],
    ]);
    await expect(getJournalMoneyChoices(7, 'account')).rejects.toThrow();
    await expect(getJournalMoneyChoices(7, 'write' as never)).rejects.toThrow();
  });
  it('keeps native rejection distinct from an uncertain transport failure', async () => {
    (fetch as jest.Mock).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        error: {
          data: {
            name: 'odoo.exceptions.UserError',
            arguments: ['Review changed.'],
          },
        },
      }),
    });
    await expect(saveJournalMoney(request())).rejects.toBeInstanceOf(
      BillingActionRejected,
    );
    (fetch as jest.Mock).mockRejectedValue(new Error('Connection dropped'));
    await expect(saveJournalMoney(request())).rejects.toThrow(
      'Connection dropped',
    );
    (fetch as jest.Mock).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ error: { code: 100 } }),
    });
    await expect(saveJournalMoney(request())).rejects.toBeInstanceOf(
      BillingSessionExpired,
    );
  });
});
