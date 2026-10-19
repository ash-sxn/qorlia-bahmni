import {
  BillingSessionExpired,
  getPagedStockReturn,
  getPagedStockReturnLines,
  getPagedStockReturnLocations,
  getPagedStockReturnReview,
  previewStockReturn,
  type PagedStockReturnLoad,
  type PagedStockReturnLines,
  type PagedStockReturnLocations,
  type PagedStockReturnReview,
  type StockReturnSelection,
} from '../billingService';
import { orderDeliveryPageFixture } from './orderDeliveryFixture';

const base = () => ({ order_id: 9, transfer_id: 11, version: 'a'.repeat(64) });
const metadata = () => ({
  location: [3, 'QA Stock'] as [number, string],
  location_editable: true,
  show_units: true,
  chained_move_warning: true,
});
const line = (move_id = 12, quantity = 2) => ({
  move_id,
  quantity,
  product: [5, 'QA Medicine'] as [number, string],
  unit: [1, 'Units'] as [number, string],
  updates_order_quantities: true,
});
const selection = (): StockReturnSelection => ({
  ...base(),
  location_id: 3,
  lines: [{ move_id: 12, quantity: 2 }],
});
const loaded = (): PagedStockReturnLoad => ({
  ...base(),
  transfer: {
    ...orderDeliveryPageFixture().rows[0],
    state: 'done',
    move_count: 501,
  },
  form: metadata(),
  line_count: 501,
  reason: false,
  write_ready: false,
});
const lines = (): PagedStockReturnLines => ({
  ...base(),
  form: metadata(),
  after: 0,
  total_count: 1,
  next_after: false,
  rows: [line()],
});
const locations = (): PagedStockReturnLocations => ({
  ...base(),
  query: 'QA',
  after: 0,
  rows: [[3, 'QA Stock']],
  next_after: false,
});
const effects = () => ({
  created: {
    'stock.picking': [
      {
        key: 'new:stock.picking:0',
        values: { name: false, state: 'assigned' },
        assigned_on_save: ['name'],
      },
    ],
  },
  updated: { 'stock.picking': [] },
  deleted: { 'stock.picking': [] },
  labels: {},
  schema: {
    'stock.picking': {
      name: { label: 'Reference', type: 'char', relation: false as const },
      state: { label: 'State', type: 'selection', relation: false as const },
    },
  },
  private_effect_counts: {
    'mail.message': { created: 1, updated: 0, deleted: 0 },
  },
});
const reviewed = (): PagedStockReturnReview => ({
  ...base(),
  location_id: 3,
  form: metadata(),
  line_count: 1,
  return_state: 'assigned',
  write_ready: false,
  review_version: 'b'.repeat(64),
  after: 0,
  total_count: 2,
  effect_count: 1,
  next_after: false,
  line_rows: [line()],
  effects: effects(),
  continuation_token: false,
  review_complete_token: 'c'.repeat(64),
});
const noEffects = () => ({
  created: {},
  updated: {},
  deleted: {},
  schema: {},
  labels: {},
  private_effect_counts: {},
});
const reply = (result: unknown) =>
  (fetch as jest.Mock).mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ result }),
  });
const kwargs = (index = 0) =>
  JSON.parse((fetch as jest.Mock).mock.calls[index][1].body).params.kwargs;

describe('Complete native return read and rollback review client', () => {
  beforeEach(() => {
    global.fetch = jest.fn();
  });

  it('uses four named APIs with pinned versions, exact payloads and no new write method', async () => {
    reply(loaded());
    expect(await getPagedStockReturn(9, 11)).toEqual(loaded());
    reply(lines());
    expect(await getPagedStockReturnLines(base())).toEqual(lines());
    reply(locations());
    expect(await getPagedStockReturnLocations(base(), 'QA')).toEqual(
      locations(),
    );
    reply(reviewed());
    expect(await getPagedStockReturnReview(selection())).toEqual(reviewed());
    expect((fetch as jest.Mock).mock.calls.map((call) => call[0])).toEqual(
      ['load', 'lines', 'locations', 'review'].map(
        (name) =>
          `/openmrs/qorlia-billing-api/web/dataset/call_kw/stock.picking/qorlia_return_paged_${name}`,
      ),
    );
    expect(kwargs()).toEqual({ order_id: 9, transfer_id: 11 });
    expect(kwargs(1)).toEqual({ ...base(), after: 0, limit: 50 });
    expect(kwargs(2)).toEqual({ ...base(), query: 'QA', after: 0, limit: 25 });
    expect(kwargs(3)).toEqual({
      payload: selection(),
      after: 0,
      review_version: false,
      continuation_token: false,
      limit: 50,
    });
  });

  it('preserves a native unavailable form without interpreting the missing writer as readiness', async () => {
    const data = {
      ...loaded(),
      form: false,
      line_count: 0,
      reason: 'Only completed transfers can be returned.',
    };
    reply(data);
    expect(await getPagedStockReturn(9, 11)).toEqual(data);
  });

  it.each([
    { write_ready: true },
    { reason: 'Unavailable with a form' },
    { form: false },
    { line_count: 502 },
    { line_count: -1 },
    { version: 'bad' },
    { transfer_id: 12 },
    { graph: {} },
    { form: { ...metadata(), lines: [] } },
    { transfer: { ...loaded().transfer, id: 12 } },
    { transfer: { ...loaded().transfer, state: 'assigned' } },
  ])('rejects inconsistent compact load metadata: %j', async (change) => {
    reply({ ...loaded(), ...change });
    await expect(getPagedStockReturn(9, 11)).rejects.toThrow(
      /complete native return state/,
    );
  });

  it('loads all 501 native line defaults in bounded pages without a legacy graph', async () => {
    const actual = [];
    for (let after = 0; after < 501; after += 100) {
      const page = {
        ...lines(),
        after,
        total_count: 501,
        next_after: after + 100 < 501 ? after + 100 : false,
        rows: Array.from({ length: Math.min(100, 501 - after) }, (_, index) =>
          line(after + index + 1, 5),
        ),
      };
      reply(page);
      actual.push(...(await getPagedStockReturnLines(base(), after, 100)).rows);
    }
    expect(actual).toHaveLength(501);
    expect(actual[500].move_id).toBe(501);
    expect(kwargs(5)).toEqual({ ...base(), after: 500, limit: 100 });
  });

  it.each([
    { version: 'b'.repeat(64) },
    { after: 1 },
    { total_count: 2 },
    { next_after: 1 },
    { rows: [] },
    { rows: [line(), line()] },
    { rows: [line(12, Number.NaN)] },
    { rows: [{ ...line(), to_refund: false }] },
    { form: { ...metadata(), lines: [] } },
    { current: {} },
  ])(
    'rejects incomplete, changed or extra line-page fields: %j',
    async (change) => {
      reply({ ...lines(), ...change });
      await expect(getPagedStockReturnLines(base())).rejects.toThrow(
        /native return line page/,
      );
    },
  );

  it('preserves native negative/default and over-return quantities without a browser maximum', async () => {
    reply({ ...lines(), rows: [line(12, -1)] });
    expect((await getPagedStockReturnLines(base())).rows[0].quantity).toBe(-1);
    const data = { ...reviewed(), line_rows: [line(12, 6)] };
    reply(data);
    expect(
      await getPagedStockReturnReview({
        ...selection(),
        lines: [{ move_id: 12, quantity: 6 }],
      }),
    ).toEqual(data);
  });

  it('paginates locations by native ID and binds query, version and cursor', async () => {
    const first = {
      ...locations(),
      rows: [[3, 'QA Stock']] as [number, string][],
      next_after: 3,
    };
    reply(first);
    expect(await getPagedStockReturnLocations(base(), 'QA', 0, 1)).toEqual(
      first,
    );
    const last = {
      ...locations(),
      after: 3,
      rows: [[4, 'QA Returns']] as [number, string][],
    };
    reply(last);
    expect(await getPagedStockReturnLocations(base(), 'QA', 3, 1)).toEqual(
      last,
    );
  });

  it.each([
    { query: '' },
    { version: 'b'.repeat(64) },
    { after: 1 },
    { next_after: 2 },
    {
      rows: [
        [3, 'QA'],
        [3, 'Duplicate'],
      ],
    },
    { rows: [[0, 'Invalid']] },
    { wizard_id: 1 },
  ])('rejects unrelated native location responses: %j', async (change) => {
    reply({ ...locations(), ...change });
    await expect(getPagedStockReturnLocations(base(), 'QA')).rejects.toThrow(
      /pinned native return locations/,
    );
  });

  it('reviews 501 selected rows before effects, without echoing the entire selection or enabling a writer', async () => {
    const exact = {
      ...selection(),
      lines: Array.from({ length: 501 }, (_, index) => ({
        move_id: index + 1,
        quantity: 2,
      })),
    };
    for (let after = 0; after <= 500; after += 100) {
      const more = after < 500;
      const data: PagedStockReturnReview = {
        ...reviewed(),
        line_count: 501,
        after,
        total_count: 502,
        line_rows: exact.lines
          .slice(after, after + 100)
          .map((row) => line(row.move_id, row.quantity)),
        effects: more ? noEffects() : effects(),
        next_after: more ? after + 100 : false,
        continuation_token: more ? 'd'.repeat(64) : false,
        review_complete_token: more ? false : 'c'.repeat(64),
      };
      reply(data);
      expect(
        await getPagedStockReturnReview(
          exact,
          after,
          after ? 'b'.repeat(64) : false,
          after ? 'd'.repeat(64) : false,
          100,
        ),
      ).toEqual(data);
      expect(data).not.toHaveProperty('lines');
    }
    (fetch as jest.Mock).mockClear();
    await expect(previewStockReturn(exact)).rejects.toThrow(
      /original native return moves/,
    );
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each([
    { location_id: 4 },
    { version: 'b'.repeat(64) },
    { review_version: 'bad' },
    { after: 1 },
    { total_count: 3 },
    { line_count: 0 },
    { effect_count: 0 },
    { write_ready: true },
    { return_state: 'done' },
    { line_rows: [] },
    { line_rows: [line(13)] },
    { line_rows: [line(12, 3)] },
    { form: { ...metadata(), location: [4, 'Elsewhere'] } },
    { review_complete_token: false },
    { continuation_token: 'd'.repeat(64) },
    { next_after: 1 },
    { lines: selection().lines },
    { effects: { ...effects(), labels: { 'res.partner:1': 'Unrelated' } } },
    {
      effects: {
        ...effects(),
        created: {
          'stock.picking': [
            {
              ...effects().created['stock.picking'][0],
              values: { password: 'hidden' },
            },
          ],
        },
      },
    },
  ])(
    'fails closed on malformed, substituted or incomplete native review: %j',
    async (change) => {
      reply({ ...reviewed(), ...change });
      await expect(getPagedStockReturnReview(selection())).rejects.toThrow(
        /native return review page|Incomplete native return/,
      );
    },
  );

  it('requires the same reviewed signature on subsequent pages', async () => {
    reply({
      ...reviewed(),
      after: 1,
      line_rows: [],
      review_version: 'e'.repeat(64),
    });
    await expect(
      getPagedStockReturnReview(selection(), 1, 'b'.repeat(64), 'd'.repeat(64)),
    ).rejects.toThrow(/native return review/);
  });

  it('rejects invalid selections, nonfinite quantities and proofs before transport', async () => {
    for (const change of [
      { lines: [{ move_id: 12, quantity: Number.NaN }] },
      { lines: [{ move_id: 12, quantity: Infinity }] },
      { lines: [{ move_id: 12, quantity: true }] },
      { lines: selection().lines.concat(selection().lines) },
      { lines: [{ move_id: 12, quantity: 2, to_refund: false }] },
      { complete: true },
      { request_key: 'unexpected' },
    ])
      await expect(
        getPagedStockReturnReview({
          ...selection(),
          ...change,
        } as StockReturnSelection),
      ).rejects.toThrow();
    await expect(getPagedStockReturnReview(selection(), 1)).rejects.toThrow(
      /original tokens/,
    );
    await expect(
      getPagedStockReturnReview(selection(), 0, 'b'.repeat(64)),
    ).rejects.toThrow(/original tokens/);
    await expect(
      getPagedStockReturnLines({ ...base(), context: {} } as ReturnType<
        typeof base
      >),
    ).rejects.toThrow();
    await expect(getPagedStockReturnLines(base(), -1)).rejects.toThrow();
    await expect(getPagedStockReturnLines(base(), 0, 101)).rejects.toThrow();
    await expect(
      getPagedStockReturnLocations(base(), 'x'.repeat(201)),
    ).rejects.toThrow();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('retains the existing Billing session-expiry behavior', async () => {
    (fetch as jest.Mock).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ error: { code: 100 } }),
    });
    await expect(getPagedStockReturn(9, 11)).rejects.toBeInstanceOf(
      BillingSessionExpired,
    );
  });
});
