import { BillingSessionExpired, getInvoiceJournal } from '../billingService';
import { invoiceJournalFixture } from './invoiceJournalFixture';

describe('Native invoice journal API', () => {
  beforeEach(() => {
    global.fetch = jest.fn();
  });
  const reply = (result: unknown) =>
    (fetch as jest.Mock).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ result }),
    });
  it('uses the named read action with invoice and snapshot-bound pagination', async () => {
    const data = invoiceJournalFixture();
    reply(data);
    expect(await getInvoiceJournal(7)).toEqual(data);
    const [url, options] = (fetch as jest.Mock).mock.calls[0];
    expect(url).toContain('/account.move/qorlia_invoice_journal');
    expect(JSON.parse(options.body).params).toEqual({
      model: 'account.move',
      method: 'qorlia_invoice_journal',
      args: [],
      kwargs: { invoice_id: 7, after: false, version: false },
    });
    reply({ ...data, after: 16 });
    await getInvoiceJournal(7, 16, data.version);
    expect(
      JSON.parse((fetch as jest.Mock).mock.calls[1][1].body).params.kwargs,
    ).toEqual({ invoice_id: 7, after: 16, version: data.version });
  });
  it('rejects invalid request identity before contacting Billing', async () => {
    for (const id of [0, -1, NaN, true, '7'])
      await expect(getInvoiceJournal(id as number)).rejects.toThrow(
        /Select an invoice/,
      );
    await expect(getInvoiceJournal(7, 1)).rejects.toThrow();
    await expect(getInvoiceJournal(7, -1, 'a'.repeat(64))).rejects.toThrow();
    await expect(getInvoiceJournal(7, false, 'bad')).rejects.toThrow();
    expect(fetch).not.toHaveBeenCalled();
  });
  it('rejects mismatched, malformed and stale page responses', async () => {
    const data = invoiceJournalFixture();
    for (const patch of [
      { invoice_id: 8 },
      { after: 8 },
      { state: 'paid' },
      { version: 'bad' },
      { currency: false },
      { total_count: -1 },
      { debit: NaN },
      { balanced: 'yes' },
      { rows: null },
      { next_after: 17 },
    ]) {
      reply({ ...data, ...patch });
      await expect(getInvoiceJournal(7)).rejects.toThrow(/Invalid journal/);
    }
    reply({ ...data, after: 16, version: 'b'.repeat(64) });
    await expect(getInvoiceJournal(7, 16, data.version)).rejects.toThrow(
      /Invalid journal/,
    );
  });
  it('rejects invalid financial rows, duplicate ordering and unauthorised analytics', async () => {
    const data = invoiceJournalFixture();
    for (const patch of [
      { id: false },
      { debit: -1 },
      { balance: Infinity },
      { account_id: [false, 'Income'] },
      { date: 'yesterday' },
      { tax_ids: [false] },
      { qorlia_adjustment_kind: 'unknown' },
      { analytic_distribution: { 1: 100 } },
    ]) {
      reply({ ...data, rows: [{ ...data.rows[0], ...patch }] });
      await expect(getInvoiceJournal(7)).rejects.toThrow(
        /Invalid journal item/,
      );
    }
    reply({ ...data, total_count: 2, rows: [data.rows[0], data.rows[0]] });
    await expect(getInvoiceJournal(7)).rejects.toThrow(/Invalid journal item/);
  });
  it('accepts a full page and authorised analytic distribution but rejects malformed keys', async () => {
    const data = invoiceJournalFixture();
    const rows = Array.from({ length: 100 }, (_, index) => ({
      ...data.rows[0],
      id: 17 + index,
      display_type: false as const,
      analytic_distribution: { '5,6': 100 },
    }));
    reply({
      ...data,
      analytics_visible: true,
      rows,
      total_count: 101,
      next_after: 116,
    });
    expect((await getInvoiceJournal(7)).rows).toHaveLength(100);
    reply({
      ...data,
      analytics_visible: true,
      rows: [{ ...data.rows[0], analytic_distribution: { injected: 100 } }],
    });
    await expect(getInvoiceJournal(7)).rejects.toThrow(/Invalid journal item/);
  });
  it('propagates expiry without automatically retrying or returning journal data', async () => {
    (fetch as jest.Mock).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        error: {
          code: 100,
          data: { name: 'odoo.http.SessionExpiredException' },
        },
      }),
    });
    await expect(getInvoiceJournal(7)).rejects.toBeInstanceOf(
      BillingSessionExpired,
    );
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
