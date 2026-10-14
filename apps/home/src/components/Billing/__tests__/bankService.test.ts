import {
  BillingSessionExpired,
  getBankCandidates,
  getBankDetail,
  getBankHistory,
} from '../billingService';
import { bankCandidates, bankDetail, bankEntry } from './bankFixture';

const reply = (result: unknown) =>
  (global.fetch as jest.Mock).mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ result }),
  });
describe('Native bank statement API boundary', () => {
  beforeEach(() => {
    global.fetch = jest.fn();
  });
  it('uses only named read APIs without caller context or raw accounting methods', async () => {
    reply({ rows: [bankEntry()], offset: 0, has_more: false });
    await getBankHistory('QA', 'unmatched');
    const [url, init] = (global.fetch as jest.Mock).mock.calls[0];
    expect(url).toMatch(/account.bank.statement.line\/qorlia_bank_history$/);
    expect(JSON.parse(init.body).params).toEqual({
      model: 'account.bank.statement.line',
      method: 'qorlia_bank_history',
      args: [],
      kwargs: { search: 'QA', state: 'unmatched', offset: 0 },
    });
    reply(bankDetail());
    await expect(getBankDetail(7)).resolves.toEqual(bankDetail());
    reply(bankCandidates());
    await expect(getBankCandidates(7, 'a'.repeat(64))).resolves.toEqual(
      bankCandidates(),
    );
    expect(global.fetch).toHaveBeenCalledTimes(3);
  });
  it('rejects invalid IDs, unversioned cursors, hashes and searches before RPC', async () => {
    for (const id of [0, -1, NaN, 1.5])
      await expect(getBankDetail(id)).rejects.toThrow();
    await expect(getBankDetail(7, 72)).rejects.toThrow();
    await expect(getBankDetail(7, false, 'bad')).rejects.toThrow();
    await expect(getBankCandidates(7, 'X'.repeat(64))).rejects.toThrow();
    await expect(getBankHistory('x'.repeat(161))).rejects.toThrow();
    await expect(getBankHistory('', 'paid')).rejects.toThrow();
    await expect(getBankHistory('', 'all', -1)).rejects.toThrow();
    expect(global.fetch).not.toHaveBeenCalled();
  });
  it('rejects missing currencies, duplicate entries, nonfinite money and false page echoes', async () => {
    for (const result of [
      { rows: [bankEntry()], offset: 25, has_more: false },
      { rows: [bankEntry()], offset: 0, has_more: true },
      { rows: [bankEntry(), bankEntry()], offset: 0, has_more: false },
      {
        rows: [{ ...bankEntry(), currency_id: false }],
        offset: 0,
        has_more: false,
      },
      { rows: [{ ...bankEntry(), amount: NaN }], offset: 0, has_more: false },
    ]) {
      reply(result);
      await expect(getBankHistory()).rejects.toThrow(
        /Invalid bank statement history/,
      );
    }
  });
  it('rejects wrong entry identity, changed versions, partial empty ledgers and out-of-order rows', async () => {
    for (const result of [
      { ...bankDetail(), statement_line_id: 8 },
      { ...bankDetail(), entry: { ...bankEntry(), id: 8 } },
      { ...bankDetail(), rows: [] },
      { ...bankDetail(), rows: [...bankDetail().rows].reverse() },
      { ...bankDetail(), company_currency: false },
      { ...bankDetail(), next_after: 72 },
    ]) {
      reply(result);
      await expect(getBankDetail(7)).rejects.toThrow(
        /Invalid statement ledger/,
      );
    }
    reply({ ...bankDetail(), version: 'b'.repeat(64) });
    await expect(getBankDetail(7, false, 'a'.repeat(64))).rejects.toThrow();
  });
  it('keeps complete totals while loading a versioned 100-row ledger page', async () => {
    const first = {
      ...bankDetail(),
      total_count: 102,
      next_after: 170,
      rows: Array.from({ length: 100 }, (_, i) => ({
        ...bankDetail().rows[0],
        id: i + 71,
      })),
    };
    reply(first);
    await expect(getBankDetail(7)).resolves.toHaveProperty('debit', 100);
    const next = {
      ...bankDetail(),
      after: 170,
      total_count: 102,
      rows: bankDetail().rows.map((row, i) => ({ ...row, id: i + 171 })),
    };
    reply(next);
    await expect(getBankDetail(7, 170, first.version)).resolves.toHaveProperty(
      'total_count',
      102,
    );
    expect(
      JSON.parse((global.fetch as jest.Mock).mock.calls[1][1].body).params
        .kwargs,
    ).toEqual({
      statement_line_id: 7,
      after: 170,
      version: first.version,
    });
    reply({ ...next, rows: [{ ...next.rows[0], id: 170 }] });
    await expect(getBankDetail(7, 170, first.version)).rejects.toThrow();
  });
  it('keeps company and transaction currencies separate and rejects reconciled or unscoped candidates', async () => {
    reply(bankCandidates());
    const loaded = await getBankCandidates(7, 'a'.repeat(64));
    expect(loaded.rows[0].amount_residual).toBe(100);
    expect(loaded.rows[0].amount_residual_currency).toBe(2);
    for (const result of [
      { ...bankCandidates(), statement_line_id: 8 },
      { ...bankCandidates(), version: 'b'.repeat(64) },
      { ...bankCandidates(), offset: 25 },
      {
        ...bankCandidates(),
        rows: [{ ...bankCandidates().rows[0], reconciled: true }],
      },
      {
        ...bankCandidates(),
        rows: [bankCandidates().rows[0], bankCandidates().rows[0]],
      },
    ]) {
      reply(result);
      await expect(getBankCandidates(7, 'a'.repeat(64))).rejects.toThrow();
    }
  });
  it('retains authentication and native RPC failures without retrying', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ error: { code: 100 } }),
    });
    await expect(getBankHistory()).rejects.toBeInstanceOf(
      BillingSessionExpired,
    );
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        error: {
          data: {
            name: 'odoo.exceptions.AccessError',
            message: 'Denied native bank read',
          },
        },
      }),
    });
    await expect(getBankDetail(7)).rejects.toThrow(/Billing access failed/);
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });
});
