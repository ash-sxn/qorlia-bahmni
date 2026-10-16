import {
  BillingActionRejected,
  BillingSessionExpired,
  checkedPagedStockReservationRequest,
  checkedStockReservationRequest,
  getPagedStockReservation,
  getPagedStockReservationReferences,
  getPagedStockReservationReview,
  getPagedStockReservationStatus,
  savePagedStockReservation,
  PagedStockReservationLoad,
  PagedStockReservationRequest,
  PagedStockReservationReview,
  PagedStockReservationStatus,
  StockReservationSelection,
  stockPreparationActions,
} from '../billingService';
import { orderDeliveryPageFixture } from './orderDeliveryFixture';
import { stockLoad, stockRequest } from './stockReservationFixture';

const request = (): PagedStockReservationRequest => ({
  ...stockRequest(),
  review_complete_token: 'd'.repeat(64),
});
const selection = (): StockReservationSelection => ({
  order_id: 9,
  transfer_id: 11,
  version: 'a'.repeat(64),
  action: 'assign',
});
const load = (): PagedStockReservationLoad => ({
  order_id: 9,
  transfer_id: 11,
  version: 'a'.repeat(64),
  transfer: {
    ...orderDeliveryPageFixture().rows[0],
    move_count: 501,
    operation_count: 2001,
  },
  package_count: 0,
  reasons: stockLoad().reasons,
  write_ready: true,
});
const status = (accepted = true): PagedStockReservationStatus => ({
  accepted,
  request_key: request().request_key,
  action: 'assign',
  state_after: accepted ? 'assigned' : false,
  reference_count: 0,
  current: {
    order_id: 9,
    transfer_id: 11,
    version: 'e'.repeat(64),
    transfer: load().transfer,
  },
});
const review = (after = 0, limit = 50): PagedStockReservationReview => {
  const rows = [13, 14, 15].slice(after, after + limit),
    more = after + rows.length < 3;
  return {
    ...selection(),
    review_version: 'b'.repeat(64),
    state_after: 'assigned',
    write_ready: true,
    after,
    total_count: 3,
    next_after: more ? after + rows.length : false,
    continuation_token: more ? 'c'.repeat(64) : false,
    review_complete_token: more ? false : 'd'.repeat(64),
    effects: {
      created: { 'stock.quant': [] },
      deleted: { 'stock.quant': [] },
      updated: {
        'stock.quant': rows.map((id) => ({
          id,
          before: { reserved_quantity: 0 },
          after: { reserved_quantity: 5 },
        })),
      },
      labels: {},
      schema: {
        'stock.quant': {
          reserved_quantity: {
            label: 'Reserved',
            type: 'float',
            relation: false,
          },
        },
      },
      private_audit_counts: {},
    },
  };
};
const references = () => ({
  request_key: request().request_key,
  version: 'e'.repeat(64),
  after: 0,
  total_count: 1,
  next_after: false,
  rows: [
    {
      key: 'new:stock.move.line:0',
      model: 'stock.move.line',
      id: 77,
      name: 'QorliaQA Operation',
      available: true,
    },
  ],
});
const reply = (result: unknown) =>
  (fetch as jest.Mock).mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ result }),
  });
const params = () =>
  (fetch as jest.Mock).mock.calls.map(
    (call) => JSON.parse(call[1].body).params,
  );

describe('Complete paged reservation API boundary', () => {
  beforeEach(() => {
    global.fetch = jest.fn();
  });
  it('uses five exact named methods and preserves large compact counts without legacy arrays', async () => {
    reply(load());
    expect(await getPagedStockReservation(9, 11)).toEqual(load());
    reply(review());
    expect(await getPagedStockReservationReview(selection())).toEqual(review());
    reply(status());
    expect(await savePagedStockReservation(request())).toEqual(status());
    expect(await getPagedStockReservationStatus(request())).toEqual(status());
    reply(references());
    expect(await getPagedStockReservationReferences(request())).toEqual(
      references(),
    );
    expect(params().map((p) => p.method)).toEqual(
      ['load', 'review', 'save', 'status', 'references'].map(
        (action) => 'qorlia_reservation_paged_' + action,
      ),
    );
    expect(params()[2].kwargs).toEqual({ payload: request() });
    expect(
      params().every((p) => p.model === 'stock.picking' && p.args.length === 0),
    ).toBe(true);
    expect(checkedPagedStockReservationRequest(request())).toEqual(request());
    expect(() => checkedStockReservationRequest(request())).toThrow();
  });
  it.each(stockPreparationActions)(
    'retains exact native action %s',
    async (action) => {
      reply({ ...status(), action });
      expect(
        (await savePagedStockReservation({ ...request(), action })).action,
      ).toBe(action);
    },
  );
  it.each([
    { order_id: 10 },
    { transfer_id: 12 },
    { version: 'bad' },
    { package_count: -1 },
    { write_ready: 'yes' },
    { reasons: { assign: false } },
    { reasons: { ...stockLoad().reasons, validate: false } },
    { write_ready: false },
    { transfer: { ...load().transfer, moves: [] } },
  ])('rejects invalid compact state: %j', async (change) => {
    reply({ ...load(), ...change });
    await expect(getPagedStockReservation(9, 11)).rejects.toThrow();
  });
  it('preserves native inventory restrictions instead of enabling a capped action', async () => {
    const value = {
      ...load(),
      write_ready: false,
      reasons: Object.fromEntries(
        stockPreparationActions.map((action) => [
          action,
          'Full inventory paging required.',
        ]),
      ),
    };
    reply(value);
    expect(await getPagedStockReservation(9, 11)).toEqual(value);
  });
  it.each([
    { review_complete_token: false },
    { review_complete_token: 'bad' },
    { context: {} },
    { action: 'validate' },
    { order_id: true },
    { request_key: 'bad' },
  ])('rejects malformed save without HTTP: %j', async (change) => {
    await expect(
      savePagedStockReservation({
        ...request(),
        ...change,
      } as PagedStockReservationRequest),
    ).rejects.toThrow();
    expect(fetch).not.toHaveBeenCalled();
  });
  it('requires exact selections and sequential request proofs before HTTP', async () => {
    for (const args of [
      [-1, false, false, 50],
      [true, false, false, 50],
      [1, false, false, 50],
      [0, 'a'.repeat(64), false, 50],
      [0, false, false, 101],
    ] as const)
      await expect(
        getPagedStockReservationReview(
          selection(),
          ...(args as unknown as [
            number,
            string | false,
            string | false,
            number,
          ]),
        ),
      ).rejects.toThrow();
    await expect(
      getPagedStockReservationReview({
        ...selection(),
        context: {},
      } as StockReservationSelection),
    ).rejects.toThrow();
    await expect(
      getPagedStockReservationReferences(request(), 1),
    ).rejects.toThrow();
    expect(fetch).not.toHaveBeenCalled();
  });
  it('walks bounded effects with a final proof, without automatically saving or fetching another page', async () => {
    reply(review(0, 1));
    const first = await getPagedStockReservationReview(
      selection(),
      0,
      false,
      false,
      1,
    );
    expect(first.review_complete_token).toBe(false);
    expect(fetch).toHaveBeenCalledTimes(1);
    reply(review(1, 1));
    expect(
      (
        await getPagedStockReservationReview(
          selection(),
          1,
          first.review_version,
          first.continuation_token,
          1,
        )
      ).next_after,
    ).toBe(2);
    reply(review(2, 1));
    expect(
      (
        await getPagedStockReservationReview(
          selection(),
          2,
          first.review_version,
          first.continuation_token,
          1,
        )
      ).review_complete_token,
    ).toBe('d'.repeat(64));
  });
  it.each([
    { action: 'unreserve' },
    { review_version: 'bad' },
    { state_after: 'done' },
    { write_ready: false },
    { after: 1 },
    { total_count: 4 },
    { next_after: 1 },
    { continuation_token: 'c'.repeat(64) },
    { review_complete_token: false },
    { effects: { ...review().effects, updated: { 'stock.quant': [] } } },
  ])('rejects mismatched or partial review: %j', async (change) => {
    reply({ ...review(), ...change });
    await expect(getPagedStockReservationReview(selection())).rejects.toThrow();
  });
  it('accepts unaccepted and historical accepted receipts but rejects mismatched compact state', async () => {
    reply(status(false));
    expect((await getPagedStockReservationStatus(request())).accepted).toBe(
      false,
    );
    const historical = {
      ...status(),
      current: {
        ...status().current,
        transfer: {
          ...load().transfer,
          state: 'confirmed',
          operation_count: 0,
        },
      },
    };
    reply(historical);
    expect(await getPagedStockReservationStatus(request())).toEqual(historical);
    for (const change of [
      { request_key: 'wrong' },
      { action: 'unreserve' },
      { state_after: 'done' },
      { reference_count: -1 },
      { accepted: false, reference_count: 1 },
      { current: { ...status().current, order_id: 10 } },
    ]) {
      reply({ ...status(), ...change });
      await expect(getPagedStockReservationStatus(request())).rejects.toThrow();
    }
  });
  it('hides unavailable generated references and rejects leaked IDs, wrong keys and incomplete pages', async () => {
    const hidden = {
      ...references(),
      rows: [
        { ...references().rows[0], id: false, name: false, available: false },
      ],
    };
    reply(hidden);
    expect(await getPagedStockReservationReferences(request())).toEqual(hidden);
    for (const change of [
      { request_key: 'wrong' },
      { total_count: 2 },
      { next_after: 1 },
      { rows: [{ ...hidden.rows[0], id: 77 }] },
    ]) {
      reply({ ...references(), ...change });
      await expect(
        getPagedStockReservationReferences(request()),
      ).rejects.toThrow();
    }
  });
  it('distinguishes session expiry, native rejection and an unknown transport outcome', async () => {
    (fetch as jest.Mock).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ error: { code: 100 } }),
    });
    await expect(
      getPagedStockReservationStatus(request()),
    ).rejects.toBeInstanceOf(BillingSessionExpired);
    (fetch as jest.Mock).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        error: {
          data: {
            name: 'odoo.exceptions.UserError',
            arguments: ['Native rejection'],
          },
        },
      }),
    });
    await expect(savePagedStockReservation(request())).rejects.toBeInstanceOf(
      BillingActionRejected,
    );
    (fetch as jest.Mock).mockRejectedValue(new Error('Connection lost'));
    await expect(savePagedStockReservation(request())).rejects.toThrow(
      'Connection lost',
    );
    expect(params().at(-1).kwargs).toEqual({ payload: request() });
  });
});
