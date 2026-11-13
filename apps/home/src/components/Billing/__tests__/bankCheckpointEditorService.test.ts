import {
  BankCheckpointPayload,
  BillingSessionExpired,
  getBankCheckpointSaveStatus,
  loadBankCheckpointEditor,
  previewBankCheckpoint,
  saveBankCheckpoint,
} from '../billingService';
import { bankCheckpoint } from './bankFixture';

const selection = {
  checkpoint_id: 9,
  entry_ids: [],
  split_line_id: false as const,
};
const values = {
  name: 'QorliaQA empty',
  reference: false as const,
  balance_start: 0,
  balance_end_real: 0,
};
const header = () => {
  const { id, ...checkpoint } = bankCheckpoint();
  expect(id).toBe(9);
  return {
    ...checkpoint,
    ...values,
    balance_end: 0,
    date: false as const,
    journal_id: false as const,
    company_id: false as const,
    currency_id: false as const,
    is_complete: false,
    is_valid: true,
  };
};
const payload = (): BankCheckpointPayload => ({
  ...selection,
  version: 'a'.repeat(64),
  values: { ...values },
});
const loaded = () => ({
  ...payload(),
  checkpoint: header(),
  selected_entry_ids: [],
});
const review = () => ({
  values: { ...values },
  checkpoint: header(),
  entry_ids: [],
  affected: [{ checkpoint: { ...header(), id: 9 }, entry_ids: [] }],
  financial: {},
  review_version: 'b'.repeat(64),
});
const request = () => ({
  payload: payload(),
  review_version: 'b'.repeat(64),
  request_key: '11111111-2222-4333-8444-555555555555',
});
const reply = (result: unknown) =>
  (global.fetch as jest.Mock).mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ result }),
  });

describe('Native checkpoint editor boundary', () => {
  beforeEach(() => {
    global.fetch = jest.fn();
  });
  it('loads an existing native empty checkpoint using only the named API and selection', async () => {
    reply(loaded());
    await expect(loadBankCheckpointEditor(selection)).resolves.toEqual(
      loaded(),
    );
    const [url, init] = (global.fetch as jest.Mock).mock.calls[0];
    expect(url).toMatch(
      /account.bank.statement\/qorlia_checkpoint_editor_load$/,
    );
    expect(JSON.parse(init.body).params).toEqual({
      model: 'account.bank.statement',
      method: 'qorlia_checkpoint_editor_load',
      args: [],
      kwargs: selection,
    });
  });
  it('rejects invalid IDs, selections, defaults and nonfinite balances before RPC', async () => {
    for (const invalid of [
      { ...selection, checkpoint_id: 0 },
      { ...selection, entry_ids: [7] },
      { ...selection, checkpoint_id: false as const, entry_ids: [] },
      { ...selection, checkpoint_id: false as const, entry_ids: [7, 7] },
      {
        ...selection,
        checkpoint_id: false as const,
        entry_ids: [7],
        split_line_id: 8,
      },
      { ...selection, default_line_ids: [7] },
    ])
      await expect(loadBankCheckpointEditor(invalid)).rejects.toThrow();
    for (const invalid of [
      { ...payload(), version: 'bad' },
      { ...payload(), values: { ...values, balance_start: Infinity } },
      { ...payload(), values: { ...values, name: 'x'.repeat(201) } },
      { ...payload(), values: { ...values, journal_id: 4 } },
    ])
      await expect(previewBankCheckpoint(invalid)).rejects.toThrow();
    expect(global.fetch).not.toHaveBeenCalled();
  });
  it('rejects changed identity, mismatched values and incomplete native selection echoes', async () => {
    for (const invalid of [
      { ...loaded(), checkpoint_id: 10 },
      { ...loaded(), entry_ids: [7] },
      { ...loaded(), selected_entry_ids: [7, 7] },
      { ...loaded(), version: 'bad' },
      { ...loaded(), values: { ...values, balance_end_real: 100 } },
    ]) {
      reply(invalid);
      await expect(loadBankCheckpointEditor(selection)).rejects.toThrow();
    }
    reply({
      ...loaded(),
      checkpoint_id: false,
      entry_ids: [7],
      selected_entry_ids: [],
    });
    await expect(
      loadBankCheckpointEditor({
        ...selection,
        checkpoint_id: false as const,
        entry_ids: [7],
      }),
    ).rejects.toThrow();
  });
  it('reviews all affected checkpoint flags without inventing accounting for an empty statement', async () => {
    reply(review());
    await expect(previewBankCheckpoint(payload())).resolves.toEqual(review());
    expect(
      JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body).params
        .kwargs,
    ).toEqual({ payload: payload() });
  });
  it('fails closed on missing targets, duplicates, false balances and unexpected accounting effects', async () => {
    for (const invalid of [
      { ...review(), affected: [] },
      { ...review(), affected: [...review().affected, ...review().affected] },
      {
        ...review(),
        affected: [
          {
            checkpoint: { ...header(), id: 9, reference: 'Other' },
            entry_ids: [],
          },
        ],
      },
      { ...review(), values: { ...values, balance_start: 5 } },
      {
        ...review(),
        financial: { 'account.move': { rows: [], removed_ids: [] } },
      },
      { ...review(), review_version: 'bad' },
    ]) {
      reply(invalid);
      await expect(previewBankCheckpoint(payload())).rejects.toThrow();
    }
  });
  it('recovers the current native state after an accepted request without demanding old field values', async () => {
    const current = {
      accepted: true,
      checkpoint: { ...header(), id: 9, reference: 'Later native edit' },
    };
    reply(current);
    await expect(saveBankCheckpoint(request())).resolves.toEqual(current);
    expect(
      JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body).params
        .kwargs,
    ).toEqual(request());
    await expect(getBankCheckpointSaveStatus(request())).resolves.toEqual(
      current,
    );
    reply({ accepted: false, checkpoint: false });
    await expect(getBankCheckpointSaveStatus(request())).resolves.toEqual({
      accepted: false,
      checkpoint: false,
    });
  });
  it('rejects false saves, wrong records, malformed status and missing exact-request identity', async () => {
    for (const invalid of [
      { accepted: false, checkpoint: false },
      { accepted: true, checkpoint: { ...header(), id: 10 } },
      { accepted: true, checkpoint: false },
    ]) {
      reply(invalid);
      await expect(saveBankCheckpoint(request())).rejects.toThrow();
    }
    reply({ accepted: false, checkpoint: { ...header(), id: 9 } });
    await expect(getBankCheckpointSaveStatus(request())).rejects.toThrow();
    (global.fetch as jest.Mock).mockClear();
    await expect(
      saveBankCheckpoint({ ...request(), request_key: 'not-a-key' }),
    ).rejects.toThrow();
    expect(global.fetch).not.toHaveBeenCalled();
  });
  it('preserves expired-session failures rather than interpreting them as an unsaved request', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ error: { code: 100 } }),
    });
    await expect(getBankCheckpointSaveStatus(request())).rejects.toBeInstanceOf(
      BillingSessionExpired,
    );
  });
});
