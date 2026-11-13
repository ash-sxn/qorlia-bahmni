import {
  BillingSessionExpired,
  getBankCheckpointDetail,
  getBankCheckpointHistory,
} from '../billingService';
import { bankCheckpoint, checkpointDetail } from './bankFixture';

const reply = (result: unknown) =>
  (global.fetch as jest.Mock).mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ result }),
  });
describe('Native checkpoint API boundary', () => {
  beforeEach(() => {
    global.fetch = jest.fn();
  });
  it('uses only named native checkpoint APIs with no caller context', async () => {
    reply({ rows: [bankCheckpoint()], offset: 0, has_more: false });
    await getBankCheckpointHistory('QA', 'invalid', 'bank');
    const [url, init] = (global.fetch as jest.Mock).mock.calls[0];
    expect(url).toMatch(/account.bank.statement\/qorlia_checkpoint_history$/);
    expect(JSON.parse(init.body).params).toEqual({
      model: 'account.bank.statement',
      method: 'qorlia_checkpoint_history',
      args: [],
      kwargs: {
        search: 'QA',
        state: 'invalid',
        journal_type: 'bank',
        offset: 0,
      },
    });
    reply(checkpointDetail());
    await expect(getBankCheckpointDetail(9)).resolves.toEqual(
      checkpointDetail(),
    );
  });
  it('rejects identifiers, unversioned cursors, hashes, filters and bounds before RPC', async () => {
    for (const id of [0, -1, NaN, 1.5])
      await expect(getBankCheckpointDetail(id)).rejects.toThrow();
    await expect(getBankCheckpointDetail(9, 7)).rejects.toThrow();
    await expect(
      getBankCheckpointDetail(9, false, 'invalid'),
    ).rejects.toThrow();
    await expect(getBankCheckpointHistory('x'.repeat(161))).rejects.toThrow();
    await expect(getBankCheckpointHistory('', 'paid')).rejects.toThrow();
    await expect(getBankCheckpointHistory('', 'all', 'sale')).rejects.toThrow();
    await expect(
      getBankCheckpointHistory('', 'all', 'all', -1),
    ).rejects.toThrow();
    expect(global.fetch).not.toHaveBeenCalled();
  });
  it('preserves native empty checkpoints without inventing a journal or currency', async () => {
    const empty = {
      ...bankCheckpoint(),
      date: false,
      journal_id: false,
      company_id: false,
      currency_id: false,
      balance_start: 0,
      balance_end: 0,
      balance_end_real: 0,
      is_complete: false,
      is_valid: true,
    };
    reply({ rows: [empty], offset: 0, has_more: false });
    await expect(getBankCheckpointHistory('', 'empty')).resolves.toHaveProperty(
      'rows',
      [empty],
    );
    reply({
      ...checkpointDetail(),
      checkpoint: empty,
      total_count: 0,
      rows: [],
    });
    await expect(getBankCheckpointDetail(9)).resolves.toHaveProperty(
      'rows',
      [],
    );
  });
  it('rejects malformed history, duplicates, nonfinite balances and false status/page echoes', async () => {
    for (const result of [
      { rows: [bankCheckpoint()], offset: 25, has_more: false },
      { rows: [bankCheckpoint()], offset: 0, has_more: true },
      {
        rows: [bankCheckpoint(), bankCheckpoint()],
        offset: 0,
        has_more: false,
      },
      {
        rows: [{ ...bankCheckpoint(), is_valid: 'yes' }],
        offset: 0,
        has_more: false,
      },
      {
        rows: [{ ...bankCheckpoint(), balance_end_real: NaN }],
        offset: 0,
        has_more: false,
      },
      {
        rows: [{ ...bankCheckpoint(), journal_id: [0, 'Bank'] }],
        offset: 0,
        has_more: false,
      },
    ]) {
      reply(result);
      await expect(getBankCheckpointHistory()).rejects.toThrow(
        /Invalid statement checkpoint history/,
      );
    }
  });
  it('rejects a different checkpoint, changed version, missing/foreign entries and invalid cursors', async () => {
    for (const result of [
      { ...checkpointDetail(), checkpoint_id: 10 },
      { ...checkpointDetail(), checkpoint: { ...bankCheckpoint(), id: 10 } },
      { ...checkpointDetail(), rows: [] },
      { ...checkpointDetail(), total_count: 2 },
      {
        ...checkpointDetail(),
        rows: [{ ...checkpointDetail().rows[0], statement_id: false }],
      },
      {
        ...checkpointDetail(),
        rows: [{ ...checkpointDetail().rows[0], statement_id: [10, 'Other'] }],
      },
      {
        ...checkpointDetail(),
        rows: [checkpointDetail().rows[0], checkpointDetail().rows[0]],
        total_count: 2,
      },
      { ...checkpointDetail(), next_after: 7 },
    ]) {
      reply(result);
      await expect(getBankCheckpointDetail(9)).rejects.toThrow(
        /Invalid statement checkpoint entries/,
      );
    }
    reply({ ...checkpointDetail(), version: 'b'.repeat(64) });
    await expect(
      getBankCheckpointDetail(9, false, 'a'.repeat(64)),
    ).rejects.toThrow();
  });
  it('keeps native internal-index order rather than sorting by numeric entry ID', async () => {
    const page = {
      ...checkpointDetail(),
      total_count: 101,
      next_after: 102,
      rows: Array.from({ length: 100 }, (_, index) => ({
        ...checkpointDetail().rows[0],
        id: 201 - index,
      })),
    };
    reply(page);
    await expect(getBankCheckpointDetail(9)).resolves.toHaveProperty(
      'next_after',
      102,
    );
    const next = {
      ...checkpointDetail(),
      after: 102,
      total_count: 101,
      rows: [{ ...checkpointDetail().rows[0], id: 101 }],
    };
    reply(next);
    await expect(
      getBankCheckpointDetail(9, 102, page.version),
    ).resolves.toHaveProperty('rows', next.rows);
    expect(
      JSON.parse((global.fetch as jest.Mock).mock.calls[1][1].body).params
        .kwargs,
    ).toEqual({
      checkpoint_id: 9,
      after: 102,
      version: page.version,
    });
    reply({ ...next, rows: [{ ...next.rows[0], id: 102 }] });
    await expect(
      getBankCheckpointDetail(9, 102, page.version),
    ).rejects.toThrow();
  });
  it('retains native access and expired-session failures', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ error: { code: 100 } }),
    });
    await expect(getBankCheckpointHistory()).rejects.toBeInstanceOf(
      BillingSessionExpired,
    );
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        error: {
          data: {
            name: 'odoo.exceptions.AccessError',
            message: 'Checkpoint denied',
          },
        },
      }),
    });
    await expect(getBankCheckpointDetail(9)).rejects.toThrow(
      /Billing access failed/,
    );
  });
});
