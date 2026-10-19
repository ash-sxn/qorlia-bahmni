import {
  BillingSessionExpired,
  getPagedStockValidation,
  getPagedStockValidationReview,
  type PagedStockValidationLoad,
  type PagedStockValidationReview,
  type StockValidationStepSelection,
  type StockValidationPromptMetadata,
} from '../billingService';
import { orderDeliveryPageFixture } from './orderDeliveryFixture';
import { terminalValidationReview } from './stockValidationFixture';

const selection = (): StockValidationStepSelection => ({
  order_id: 9,
  transfer_id: 11,
  version: 'a'.repeat(64),
  continuation_key: false,
  decisions: [],
});
const load = (): PagedStockValidationLoad => ({
  order_id: 9,
  transfer_id: 11,
  version: selection().version,
  transfer: {
    ...orderDeliveryPageFixture().rows[0],
    move_count: 501,
    operation_count: 2001,
  },
  package_count: 0,
  inventory_quant_count: 2001,
  reason: false,
  write_ready: true,
});
const review = (): PagedStockValidationReview => ({
  ...selection(),
  review_version: 'b'.repeat(64),
  state_after: 'done',
  write_ready: true,
  input_prompt: false,
  prompt_rows: [],
  next_step: false,
  terminal: true,
  effects: terminalValidationReview().effects,
  after: 0,
  total_count: 1,
  prompt_count: 0,
  effect_count: 1,
  next_after: false,
  continuation_token: false,
  review_complete_token: 'c'.repeat(64),
});
const reply = (result: unknown) =>
  (fetch as jest.Mock).mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ result }),
  });
describe('Complete native validation review client', () => {
  beforeEach(() => {
    global.fetch = jest.fn();
  });
  it('loads complete compact state with native write availability through the fixed API', async () => {
    reply(load());
    expect(await getPagedStockValidation(9, 11)).toEqual(load());
    expect(
      JSON.parse((fetch as jest.Mock).mock.calls[0][1].body).params,
    ).toEqual({
      model: 'stock.picking',
      method: 'qorlia_validation_paged_load',
      args: [],
      kwargs: { order_id: 9, transfer_id: 11 },
    });
  });
  it.each([
    { write_ready: false },
    { package_count: -1 },
    { inventory_quant_count: -1 },
    { version: false },
    { transfer_id: 12 },
    { reason: null },
    { graph: {} },
  ])('rejects incorrect load metadata: %j', async (change) => {
    reply({ ...load(), ...change });
    await expect(getPagedStockValidation(9, 11)).rejects.toThrow(
      /validation review state/,
    );
  });
  it('reviews exact native effects without a request nonce or a save route', async () => {
    reply(review());
    expect(await getPagedStockValidationReview(selection())).toEqual(review());
    expect(
      JSON.parse((fetch as jest.Mock).mock.calls[0][1].body).params,
    ).toEqual({
      model: 'stock.picking',
      method: 'qorlia_validation_paged_review',
      args: [],
      kwargs: {
        payload: selection(),
        after: 0,
        review_version: false,
        continuation_token: false,
        limit: 50,
      },
    });
  });
  it('accepts a zero-row opening review with a next native prompt, without processing its decision', async () => {
    const next_step: StockValidationPromptMetadata = {
      kind: 'immediate' as const,
      title: 'Native immediate',
      blocked_reason: false,
      counts: { transfers: 1, lots: 0, operations: 0 },
    };
    const data: PagedStockValidationReview = {
      ...review(),
      effects: {
        created: {},
        updated: {},
        deleted: {},
        schema: {},
        labels: {},
        private_effect_counts: {},
      },
      total_count: 0,
      effect_count: 0,
      state_after: 'assigned',
      terminal: false,
      next_step,
    };
    reply(data);
    expect(await getPagedStockValidationReview(selection())).toEqual(data);
  });
  it('reads 101 saved receipt rows then effect rows across the shared ordered proof chain', async () => {
    const exact: StockValidationStepSelection = {
      ...selection(),
      continuation_key: '11111111-2222-4333-8444-555555555555',
      decisions: [{ kind: 'receipt', confirm: true }],
    };
    const descriptor: StockValidationPromptMetadata = {
      kind: 'receipt' as const,
      title: 'Native receipt',
      blocked_reason: false as const,
      counts: { transfers: 0, lots: 0, operations: 101 },
      source: [3, 'Supplier'] as [number, string],
      destination: [4, 'Stock'] as [number, string],
      picking_code: 'incoming',
    };
    for (const after of [0, 50, 100]) {
      const more = after < 100;
      const data: PagedStockValidationReview = {
        ...review(),
        ...exact,
        after,
        total_count: 102,
        prompt_count: 101,
        effect_count: 1,
        input_prompt: descriptor,
        prompt_rows: Array.from(
          { length: Math.min(50, 101 - after) },
          (_, index) => ({
            section: 'operations' as const,
            value: {
              id: after + index + 1,
              product_id: [3, 'Medicine'],
              product_uom_id: [4, 'Dozens'],
              qty_done: 0.5,
              lot_id: false,
              lot_name: 'Batch',
              expiration_date: '2027-02-01T00:00:00',
              cost_price: 2.5,
              sale_price: 5,
              mrp: 7,
              balance: 10,
              is_move_line_lot_expiring_soon: false,
              expiry_warning: false,
            },
          }),
        ),
        effects: more
          ? {
              created: {},
              updated: {},
              deleted: {},
              schema: {},
              labels: {},
              private_effect_counts:
                terminalValidationReview().effects.private_effect_counts,
            }
          : terminalValidationReview().effects,
        next_after: more ? after + 50 : false,
        continuation_token: more ? 'd'.repeat(64) : false,
        review_complete_token: more ? false : 'c'.repeat(64),
      };
      reply(data);
      expect(
        await getPagedStockValidationReview(
          exact,
          after,
          after ? 'b'.repeat(64) : false,
          after ? 'd'.repeat(64) : false,
        ),
      ).toEqual(data);
    }
    expect(
      (fetch as jest.Mock).mock.calls.map(
        (call) => JSON.parse(call[1].body).params.kwargs.after,
      ),
    ).toEqual([0, 50, 100]);
  });
  it.each([
    { write_ready: false },
    { after: 1 },
    { total_count: 2 },
    { prompt_count: 1 },
    { effect_count: 0 },
    { review_version: 'bad' },
    { continuation_key: '11111111-2222-4333-8444-555555555555' },
    { decisions: [{ kind: 'immediate', selected: true }] },
    { terminal: false },
    { next_step: {} },
    { state_after: 'paid' },
    {
      input_prompt: {
        kind: 'immediate',
        title: 'Unexpected',
        blocked_reason: false,
        counts: { transfers: 1, lots: 0, operations: 0 },
      },
    },
    { next_after: 1 },
    { continuation_token: 'd'.repeat(64) },
    { review_complete_token: false },
    { res_model: 'stock.immediate.transfer' },
    {
      effects: {
        ...terminalValidationReview().effects,
        labels: { 'res.partner:1': 'Unrelated label' },
      },
    },
  ])(
    'fails closed on inconsistent page metadata or native bodies: %j',
    async (change) => {
      reply({ ...review(), ...change });
      await expect(
        getPagedStockValidationReview(selection()),
      ).rejects.toThrow();
    },
  );
  it('rejects a future page with a different review snapshot', async () => {
    const data = { ...review(), after: 1, total_count: 2, effect_count: 2 };
    reply(data);
    await expect(
      getPagedStockValidationReview(
        selection(),
        1,
        'e'.repeat(64),
        'd'.repeat(64),
        1,
      ),
    ).rejects.toThrow(/validation review page/);
  });
  it('does not allow a malformed prompt row, hidden data or a different native decision to satisfy complete review', async () => {
    const exact: StockValidationStepSelection = {
      ...selection(),
      continuation_key: '11111111-2222-4333-8444-555555555555',
      decisions: [{ kind: 'immediate', selected: true }],
    };
    const data = {
      ...review(),
      ...exact,
      total_count: 2,
      prompt_count: 1,
      input_prompt: {
        kind: 'immediate',
        title: 'Native prompt',
        blocked_reason: false,
        counts: { transfers: 1, lots: 0, operations: 0 },
      },
      prompt_rows: [
        {
          section: 'transfers',
          value: { transfer: [99, 'Foreign transfer'], selected: true },
        },
      ],
    };
    reply(data);
    await expect(getPagedStockValidationReview(exact)).rejects.toThrow(
      /validation review page/,
    );
  });
  it.each([
    { after: -1, version: false, token: false, limit: 50 },
    { after: 1, version: false, token: false, limit: 50 },
    { after: 0, version: 'b'.repeat(64), token: false, limit: 50 },
    { after: 0, version: false, token: false, limit: 101 },
  ] as const)(
    'rejects bad cursors/proofs before any HTTP: %j',
    async (options) => {
      await expect(
        getPagedStockValidationReview(
          selection(),
          options.after,
          options.version,
          options.token,
          options.limit,
        ),
      ).rejects.toThrow();
      expect(fetch).not.toHaveBeenCalled();
    },
  );
  it('rejects extra caller context and invalid native decisions before HTTP', async () => {
    const value = { ...selection(), context: { uid: 1 } };
    await expect(getPagedStockValidationReview(value)).rejects.toThrow();
    await expect(
      getPagedStockValidationReview({
        ...selection(),
        decisions: [{ kind: 'immediate', selected: true }],
      }),
    ).rejects.toThrow();
    await expect(getPagedStockValidation(0, 11)).rejects.toThrow();
    expect(fetch).not.toHaveBeenCalled();
  });
  it('preserves native session expiry without using a fallback or another protocol', async () => {
    (fetch as jest.Mock).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ error: { code: 100, message: 'Session expired' } }),
    });
    await expect(
      getPagedStockValidationReview(selection()),
    ).rejects.toBeInstanceOf(BillingSessionExpired);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
