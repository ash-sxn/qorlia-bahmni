import {
  checkedCutoffRequest,
  getCutoff,
  getCutoffChoices,
  getCutoffStatus,
  onchangeCutoff,
  previewCutoff,
  saveCutoff,
} from '../billingService';
import {
  cutoffFixture,
  cutoffRequest,
  cutoffReview,
  cutoffSaved,
} from './cutoffFixture';

const reply = (result: unknown) =>
  (global.fetch as jest.Mock).mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ result }),
  });
describe('Native Cut-Off API boundary', () => {
  beforeEach(() => {
    global.fetch = jest.fn();
  });
  it('uses only fixed named methods and invoice/line scope', async () => {
    reply(cutoffFixture());
    await expect(getCutoff(7, 17)).resolves.toEqual(cutoffFixture());
    const [url, options] = (fetch as jest.Mock).mock.calls[0];
    expect(url).toContain('/account.move/qorlia_cutoff_load');
    expect(JSON.parse(options.body).params).toEqual({
      model: 'account.move',
      method: 'qorlia_cutoff_load',
      args: [],
      kwargs: { invoice_id: 7, line_id: 17 },
    });
  });
  it('recalculates with the native amount onchange and exact source version', async () => {
    reply({
      ...cutoffFixture(),
      values: { ...cutoffFixture().values, percentage: 25, total_amount: -125 },
    });
    expect(
      (
        await onchangeCutoff(
          cutoffFixture(),
          { ...cutoffFixture().values, total_amount: -125 },
          'total_amount',
        )
      ).values.percentage,
    ).toBe(25);
    expect(
      JSON.parse((fetch as jest.Mock).mock.calls[0][1].body).params.kwargs
        .field,
    ).toBe('total_amount');
    reply({ ...cutoffFixture(), version: 'c'.repeat(64) });
    await expect(
      onchangeCutoff(cutoffFixture(), cutoffFixture().values, 'percentage'),
    ).rejects.toThrow(/source changed/);
  });
  it('validates the two native balanced entries and disclosed company defaults', async () => {
    reply(cutoffReview());
    await expect(
      previewCutoff(cutoffFixture(), cutoffFixture().values),
    ).resolves.toEqual(cutoffReview());
    for (const bad of [
      { ...cutoffReview(), entries: [] },
      { ...cutoffReview(), version: 'c'.repeat(64) },
      {
        ...cutoffReview(),
        default_changes: {
          ...cutoffReview().default_changes,
          account: [99, 'Wrong account'],
        },
      },
      {
        ...cutoffReview(),
        entries: [
          {
            ...cutoffReview().entries[0],
            rows: [
              { ...cutoffReview().entries[0].rows[0], credit: 500 },
              cutoffReview().entries[0].rows[1],
            ],
          },
          cutoffReview().entries[1],
        ],
      },
    ]) {
      reply(bad);
      await expect(
        previewCutoff(cutoffFixture(), cutoffFixture().values),
      ).rejects.toThrow();
    }
  });
  it('preserves the exact request on save and distinguishes absent status from receipt', async () => {
    reply(cutoffSaved());
    await expect(saveCutoff(cutoffRequest())).resolves.toEqual(cutoffSaved());
    expect(
      JSON.parse((fetch as jest.Mock).mock.calls[0][1].body).params.kwargs,
    ).toEqual(cutoffRequest());
    reply(false);
    await expect(getCutoffStatus(cutoffRequest())).resolves.toBe(false);
    reply(cutoffSaved());
    await expect(getCutoffStatus(cutoffRequest())).resolves.toEqual(
      cutoffSaved(),
    );
    expect(fetch).toHaveBeenCalledTimes(3);
  });
  it('rejects unsafe payloads before any network call', async () => {
    for (const values of [
      { ...cutoffRequest().values, date: '2026-02-31' },
      { ...cutoffRequest().values, percentage: NaN },
      { ...cutoffRequest().values, journal_id: 0 },
      { ...cutoffRequest().values, company_id: 99 },
      { ...cutoffRequest().values, total_amount: Infinity },
    ])
      expect(() =>
        checkedCutoffRequest({ ...cutoffRequest(), values }),
      ).toThrow();
    await expect(getCutoff(0, 17)).rejects.toThrow();
    expect(fetch).not.toHaveBeenCalled();
  });
  it('rejects wrong invoice, line, labels and receipt identifiers', async () => {
    reply({ ...cutoffFixture(), line_id: 18 });
    await expect(getCutoff(7, 17)).rejects.toThrow();
    reply({ ...cutoffFixture(), labels: {} });
    await expect(getCutoff(7, 17)).rejects.toThrow(/labels/);
    reply({ ...cutoffSaved(), request_key: crypto.randomUUID() });
    await expect(saveCutoff(cutoffRequest())).rejects.toThrow(/receipt/);
    reply({
      ...cutoffSaved(),
      entries: [cutoffSaved().entries[0], cutoffSaved().entries[0]],
    });
    await expect(getCutoffStatus(cutoffRequest())).rejects.toThrow(/receipt/);
  });
  it('bounds native choices and rejects unsupported search kinds', async () => {
    reply([[2, 'General journal']]);
    await expect(
      getCutoffChoices(7, 17, 'journal', 'general'),
    ).resolves.toEqual([[2, 'General journal']]);
    reply(Array.from({ length: 27 }, (_, index) => [index + 1, 'Too many']));
    await expect(getCutoffChoices(7, 17, 'journal')).rejects.toThrow();
    await expect(
      getCutoffChoices(7, 17, 'users' as 'journal'),
    ).rejects.toThrow();
  });
});
