import {
  checkedJournalRequest,
  getJournalDetails,
  getJournalDetailChoices,
  getJournalAnalytics,
  getJournalDetailsStatus,
  previewJournalDetails,
  saveJournalDetails,
} from '../billingService';
import {
  journalDetailFixture,
  journalDetailRequest,
} from './journalDetailFixture';

const reply = (result: unknown) =>
  (global.fetch as jest.Mock).mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ result }),
  });
describe('Journal detail native API boundary', () => {
  beforeEach(() => {
    global.fetch = jest.fn();
  });
  it('loads only the scoped native item and validates account and grid labels', async () => {
    reply(journalDetailFixture());
    expect(await getJournalDetails(7, 17)).toEqual(journalDetailFixture());
    const [url, init] = (global.fetch as jest.Mock).mock.calls[0];
    expect(url).toContain('/qorlia_journal_edit_load');
    expect(JSON.parse(init.body).params.kwargs).toEqual({
      invoice_id: 7,
      line_id: 17,
    });
    reply({ ...journalDetailFixture(), account: [99, 'Other account'] });
    await expect(getJournalDetails(7, 17)).rejects.toThrow(
      /labels do not match/,
    );
  });
  it('reviews and saves only the exact typed request without an automatic retry', async () => {
    const data = journalDetailFixture(),
      request = journalDetailRequest();
    reply({
      ...data,
      values: request.values,
      review_version: request.review_version,
    });
    await expect(
      previewJournalDetails(data, request.values),
    ).resolves.toHaveProperty('review_version', request.review_version);
    reply(data);
    await expect(saveJournalDetails(request)).resolves.toEqual(data);
    expect(
      JSON.parse((global.fetch as jest.Mock).mock.calls[1][1].body).params
        .kwargs,
    ).toEqual(request);
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });
  it('keeps a negative status distinct from a confirmed receipt', async () => {
    reply(false);
    await expect(getJournalDetailsStatus(journalDetailRequest())).resolves.toBe(
      false,
    );
    reply(journalDetailFixture());
    await expect(
      getJournalDetailsStatus(journalDetailRequest()),
    ).resolves.toHaveProperty('line_id', 17);
  });
  it('rejects unsafe identifiers, impossible dates, repeated grids, monetary fields and nonfinite values before RPC', async () => {
    const request = journalDetailRequest();
    for (const values of [
      { ...request.values, date_maturity: '2026-02-31' },
      { ...request.values, tax_tag_ids: [1, 1] },
      { ...request.values, discount_amount_currency: NaN },
      { ...request.values, debit: 500 },
      { ...request.values, analytic_distribution: { '0': 100 } },
      { ...request.values, analytic_distribution: { '12': 101 } },
    ])
      expect(() => checkedJournalRequest({ ...request, values })).toThrow();
    await expect(getJournalDetails(0, 17)).rejects.toThrow();
    expect(global.fetch).not.toHaveBeenCalled();
  });
  it('rejects unscoped replies, hidden analytics and changed review versions', async () => {
    reply({ ...journalDetailFixture(), line_id: 18 });
    await expect(getJournalDetails(7, 17)).rejects.toThrow();
    reply({
      ...journalDetailFixture(),
      values: {
        ...journalDetailFixture().values,
        analytic_distribution: { '12': 100 },
      },
    });
    await expect(getJournalDetails(7, 17)).rejects.toThrow();
    reply({
      ...journalDetailFixture(),
      version: 'c'.repeat(64),
      review_version: 'b'.repeat(64),
    });
    await expect(
      previewJournalDetails(
        journalDetailFixture(),
        journalDetailRequest().values,
      ),
    ).rejects.toThrow(/version changed/);
  });
  it('bounds native searches and never accepts caller context', async () => {
    reply([[12, '4000 Clinical income']]);
    await expect(
      getJournalDetailChoices(7, 17, 'account', 'clinical'),
    ).resolves.toEqual([[12, '4000 Clinical income']]);
    expect(
      JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body).params
        .kwargs,
    ).toEqual({
      invoice_id: 7,
      line_id: 17,
      kind: 'account',
      search: 'clinical',
    });
    reply(Array.from({ length: 27 }, (_, index) => [index + 1, 'Too many']));
    await expect(getJournalDetailChoices(7, 17, 'account')).rejects.toThrow();
  });
  it('loads native analytic plans and names only for the scoped invoice, line and account IDs', async () => {
    const metadata = {
      invoice_id: 7,
      line_id: 17,
      account_id: 12,
      plans: [{ id: 3, name: 'Departments', applicability: 'mandatory' }],
      accounts: [{ id: 25, name: 'Outpatient', plan_id: 3 }],
    };
    reply(metadata);
    await expect(getJournalAnalytics(7, 17, 12, [25])).resolves.toEqual(
      metadata,
    );
    expect(
      JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body).params
        .kwargs,
    ).toEqual({
      invoice_id: 7,
      line_id: 17,
      account_id: 12,
      account_ids: [25],
    });
    for (const bad of [
      { ...metadata, account_id: 99 },
      { ...metadata, accounts: [] },
      { ...metadata, plans: [] },
      { ...metadata, accounts: [metadata.accounts[0], metadata.accounts[0]] },
      {
        ...metadata,
        plans: [{ ...metadata.plans[0], applicability: 'unavailable' }],
      },
    ]) {
      reply(bad);
      await expect(getJournalAnalytics(7, 17, 12, [25])).rejects.toThrow();
    }
    await expect(getJournalAnalytics(7, 17, 12, [25, 25])).rejects.toThrow();
  });
  it('sends the selected native plan and accounting account with analytic choices', async () => {
    reply([[25, 'Outpatient']]);
    await getJournalDetailChoices(7, 17, 'analytic', 'Out', {
      account_id: 12,
      plan_id: 3,
      account_ids: [25],
    });
    expect(
      JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body).params
        .kwargs,
    ).toEqual({
      invoice_id: 7,
      line_id: 17,
      kind: 'analytic',
      search: 'Out',
      account_id: 12,
      plan_id: 3,
      account_ids: [25],
    });
    await expect(
      getJournalDetailChoices(7, 17, 'grid', '', {
        account_id: 12,
        plan_id: 3,
        account_ids: [],
      }),
    ).rejects.toThrow();
  });
});
