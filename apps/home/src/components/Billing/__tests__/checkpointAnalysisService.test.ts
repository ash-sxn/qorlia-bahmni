import {
  BillingSessionExpired,
  CheckpointAnalysisFilters,
  getCheckpointAnalysis,
} from '../billingService';

const filters: CheckpointAnalysisFilters = {
  search: 'QorliaQA',
  state: 'all',
  journal_type: 'all',
  period: 'month',
  date_from: false,
  date_to: false,
};
const analysisFixture = () => ({
  ...filters,
  total_count: 3,
  rows: [
    {
      journal_id: [5, 'Synthetic INR bank'],
      currency_id: [21, 'INR'],
      period_label: 'January 2026',
      period_from: '2026-01-01',
      period_to: '2026-02-01',
      count: 2,
      balance_start: 100,
      balance_end: -30,
      balance_end_real: -30,
    },
    {
      journal_id: [6, 'Synthetic USD cash'],
      currency_id: [2, 'USD'],
      period_label: 'February 2026',
      period_from: '2026-02-01',
      period_to: '2026-03-01',
      count: 1,
      balance_start: 25,
      balance_end: 50,
      balance_end_real: 45,
    },
  ],
});
const reply = (result: unknown) =>
  (fetch as jest.Mock).mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ result }),
  });
describe('Checkpoint analysis native boundary', () => {
  beforeEach(() => {
    global.fetch = jest.fn();
  });
  it('calls only the scoped named read API and keeps native currency groups', async () => {
    reply(analysisFixture());
    expect(await getCheckpointAnalysis(filters)).toEqual(analysisFixture());
    expect(
      JSON.parse((fetch as jest.Mock).mock.calls[0][1].body).params,
    ).toEqual({
      model: 'account.bank.statement',
      method: 'qorlia_checkpoint_analysis',
      args: [],
      kwargs: filters,
    });
  });
  it('rejects bad calendar dates, reversed ranges and caller context before any request', async () => {
    for (const change of [
      { date_from: '2026-02-30' },
      { date_from: '2026-2-01' },
      { date_from: '2026-02-02', date_to: '2026-02-01' },
      { period: 'partner_id' },
      { date_to: true },
      { context: {} },
    ])
      await expect(
        getCheckpointAnalysis({
          ...filters,
          ...change,
        } as CheckpointAnalysisFilters),
      ).rejects.toThrow();
    expect(fetch).not.toHaveBeenCalled();
  });
  it('rejects missing groups, inconsistent counts/currencies, invalid bounds and filter echoes', async () => {
    const fixture = analysisFixture();
    for (const change of [
      { total_count: 4 },
      { rows: undefined },
      { period: 'day' },
      { rows: [...fixture.rows, fixture.rows[0]], total_count: 5 },
      {
        rows: [{ ...fixture.rows[0], balance_start: Infinity }],
        total_count: 2,
      },
      { rows: [{ ...fixture.rows[0], count: 1.5 }], total_count: 1.5 },
      {
        rows: [{ ...fixture.rows[0], period_to: '2026-01-01' }],
        total_count: 2,
      },
      {
        rows: [
          fixture.rows[0],
          { ...fixture.rows[1], journal_id: fixture.rows[0].journal_id },
        ],
        total_count: 3,
      },
    ]) {
      reply({ ...fixture, ...change });
      await expect(getCheckpointAnalysis(filters)).rejects.toThrow();
    }
    reply({ ...filters, total_count: 0, rows: [] });
    expect((await getCheckpointAnalysis(filters)).rows).toEqual([]);
    reply({
      ...filters,
      total_count: 1,
      rows: [
        {
          ...fixture.rows[0],
          journal_id: false,
          currency_id: false,
          period_label: 'No posted date',
          period_from: false,
          period_to: false,
          count: 1,
        },
      ],
    });
    expect((await getCheckpointAnalysis(filters)).rows[0].currency_id).toBe(
      false,
    );
  });
  it('preserves Billing expiry handling', async () => {
    (fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({
        error: {
          code: 100,
          data: {
            name: 'odoo.http.SessionExpiredException',
            message: 'Expired',
          },
        },
      }),
    });
    await expect(getCheckpointAnalysis(filters)).rejects.toBeInstanceOf(
      BillingSessionExpired,
    );
  });
});
