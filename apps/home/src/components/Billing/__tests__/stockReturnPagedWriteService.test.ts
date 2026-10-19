import {
  BillingActionRejected,
  BillingSessionExpired,
  checkedPagedStockReturnRequest,
  getPagedStockReturnReferences,
  getPagedStockReturnStatus,
  savePagedStockReturn,
  stopPagedStockReturn,
  checkedStockReturnRequest,
  type PagedStockReturnRequest,
  type PagedStockReturnStatus,
  type PagedStockConfirmationReferences,
} from '../billingService';
import { orderDeliveryPageFixture } from './orderDeliveryFixture';

const request = (): PagedStockReturnRequest => ({
  order_id: 9,
  transfer_id: 11,
  version: 'a'.repeat(64),
  location_id: 3,
  lines: [{ move_id: 12, quantity: 2 }],
  review_version: 'b'.repeat(64),
  review_complete_token: 'c'.repeat(64),
  request_key: '11111111-2222-4333-8444-555555555555',
});
const current = () => ({
  order_id: 9,
  transfer_id: 11,
  version: 'd'.repeat(64),
  transfer: {
    ...orderDeliveryPageFixture().rows[0],
    state: 'done' as const,
    move_count: 501,
    operation_count: 2001,
  },
});
const accepted = (): PagedStockReturnStatus => ({
  accepted: true,
  stopped: false,
  request_key: request().request_key,
  state_after: 'assigned',
  return_transfer: {
    model: 'stock.picking',
    id: 19,
    name: 'QA/RETURN/19',
    available: true,
  },
  reference_count: 2,
  current: current(),
});
const pending = (stopped = false): PagedStockReturnStatus => ({
  ...accepted(),
  accepted: false,
  stopped,
  state_after: false,
  return_transfer: false,
  reference_count: 0,
});
const references = (): PagedStockConfirmationReferences => ({
  request_key: request().request_key,
  version: 'e'.repeat(64),
  after: 0,
  total_count: 2,
  next_after: false,
  rows: [
    {
      key: 'new:stock.move:0',
      model: 'stock.move',
      id: 20,
      name: 'QA Return item',
      available: true,
    },
    {
      key: 'new:stock.picking:0',
      model: 'stock.picking',
      id: 19,
      name: 'QA/RETURN/19',
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
const cases = [
  { name: 'save', call: savePagedStockReturn },
  { name: 'status', call: getPagedStockReturnStatus },
  { name: 'stop', call: stopPagedStockReturn },
];

describe('Complete native return creation, recovery and retirement client', () => {
  beforeEach(() => {
    global.fetch = jest.fn();
  });

  it('preserves global identity through save, status, references and stop, without relaxing legacy requests', async () => {
    const exact = { ...request(), order_id: false as const };
    const result = {
      ...accepted(),
      current: { ...current(), order_id: false as const },
    };
    for (const call of [
      savePagedStockReturn,
      getPagedStockReturnStatus,
      stopPagedStockReturn,
    ]) {
      reply(result);
      expect(await call(exact)).toEqual(result);
    }
    reply(references());
    expect(await getPagedStockReturnReferences(exact)).toEqual(references());
    for (const [, options] of (fetch as jest.Mock).mock.calls)
      expect(JSON.parse(options.body).params.kwargs.payload).toEqual(exact);
    const { review_complete_token: _proof, ...legacy } = exact;
    expect(_proof).toHaveLength(64);
    expect(() =>
      checkedStockReturnRequest(
        legacy as unknown as Parameters<typeof checkedStockReturnRequest>[0],
      ),
    ).toThrow();
    for (const invalid of [0, true, null, undefined, 'false'])
      expect(() =>
        checkedPagedStockReturnRequest({
          ...exact,
          order_id: invalid as number,
        }),
      ).toThrow();
    reply(accepted());
    await expect(getPagedStockReturnStatus(exact)).rejects.toThrow();
  });

  it.each(cases)(
    'sends the exact eight-key request to fixed $name and validates compact accepted recovery',
    async ({ name, call }) => {
      reply(accepted());
      expect(await call(request())).toEqual(accepted());
      const [route, options] = (fetch as jest.Mock).mock.calls[0];
      expect(route).toBe(
        `/openmrs/qorlia-billing-api/web/dataset/call_kw/stock.picking/qorlia_return_paged_${name}`,
      );
      expect(JSON.parse(options.body).params).toEqual({
        model: 'stock.picking',
        method: `qorlia_return_paged_${name}`,
        args: [],
        kwargs: { payload: request() },
      });
    },
  );

  it('keeps unknown and explicitly stopped status distinct from accepted creation', async () => {
    for (const stopped of [false, true]) {
      reply(pending(stopped));
      expect(await getPagedStockReturnStatus(request())).toEqual(
        pending(stopped),
      );
    }
    reply(pending(true));
    expect(await stopPagedStockReturn(request())).toEqual(pending(true));
  });

  it('never interprets unknown or stopped save and unknown stop as acknowledgements', async () => {
    for (const result of [pending(), pending(true)]) {
      reply(result);
      await expect(savePagedStockReturn(request())).rejects.toThrow(
        /not acknowledged/,
      );
    }
    reply(pending());
    await expect(stopPagedStockReturn(request())).rejects.toThrow(
      /not acknowledged/,
    );
  });

  it('allows an unavailable saved return reference without leaking its ID or name', async () => {
    const data = {
      ...accepted(),
      return_transfer: {
        model: 'stock.picking',
        id: false,
        name: false,
        available: false,
      },
    };
    reply(data);
    expect(await getPagedStockReturnStatus(request())).toEqual(data);
    reply({ ...data, return_transfer: { ...data.return_transfer, id: 19 } });
    await expect(getPagedStockReturnStatus(request())).rejects.toThrow(
      /native return outcome/,
    );
  });

  it.each([
    { accepted: false },
    { stopped: true },
    { request_key: 'foreign' },
    { state_after: 'done' },
    { return_transfer: false },
    { reference_count: 0 },
    { reference_count: -1 },
    {
      return_transfer: {
        model: 'account.move',
        id: 19,
        name: 'Private',
        available: true,
      },
    },
    {
      return_transfer: {
        ...accepted().return_transfer,
        res_model: 'stock.return.picking',
      },
    },
    { current: { ...current(), graph: {} } },
    { current: { ...current(), transfer_id: 12 } },
    { current: { ...current(), version: false } },
    { current: { ...current(), transfer: { ...current().transfer, id: 12 } } },
    { references: {} },
    { form: {} },
  ])('rejects malformed, foreign or expanded status: %j', async (change) => {
    reply({ ...accepted(), ...change });
    await expect(getPagedStockReturnStatus(request())).rejects.toThrow(
      /native return outcome/,
    );
  });

  it('requires no saved reference or created state for unknown/stopped outcomes', async () => {
    for (const change of [
      { reference_count: 1 },
      { return_transfer: accepted().return_transfer },
      { state_after: 'assigned' },
    ]) {
      reply({ ...pending(true), ...change });
      await expect(getPagedStockReturnStatus(request())).rejects.toThrow(
        /native return outcome/,
      );
    }
  });

  it('copies complete selections without a 500-line cap, but never strips proofs into a legacy request', () => {
    const data = {
      ...request(),
      lines: Array.from({ length: 501 }, (_, index) => ({
        move_id: index + 1,
        quantity: 1,
      })),
    };
    const exact = checkedPagedStockReturnRequest(data);
    expect(exact).toEqual(data);
    expect(exact.lines).not.toBe(data.lines);
    data.lines[500].quantity = 9;
    expect(exact.lines[500].quantity).toBe(1);
    expect(() =>
      checkedStockReturnRequest({ ...exact, order_id: 9 }),
    ).toThrow();
    const { review_complete_token, ...legacy } = exact;
    expect(review_complete_token).toHaveLength(64);
    expect(() =>
      checkedStockReturnRequest({ ...legacy, order_id: 9 }),
    ).toThrow();
  });

  it.each([
    { review_complete_token: false },
    { review_complete_token: 'bad' },
    { review_version: 'bad' },
    { request_key: 'bad' },
    { version: false },
    { order_id: true },
    { location_id: 0 },
    { context: { uid: 1 } },
    { complete: true },
    { lines: [{ move_id: 12, quantity: NaN }] },
    { lines: [{ move_id: 12, quantity: Infinity }] },
    { lines: [{ move_id: 12, quantity: true }] },
    { lines: [{ move_id: 12, quantity: 1, to_refund: false }] },
    { lines: [...request().lines, ...request().lines] },
  ])('rejects malformed requests before transport: %j', async (change) => {
    const data = { ...request(), ...change } as PagedStockReturnRequest;
    for (const { call } of cases) await expect(call(data)).rejects.toThrow();
    await expect(getPagedStockReturnReferences(data)).rejects.toThrow();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('reads every accepted reference with pinned page counts and signatures', async () => {
    reply(references());
    expect(await getPagedStockReturnReferences(request())).toEqual(
      references(),
    );
    expect(
      JSON.parse((fetch as jest.Mock).mock.calls[0][1].body).params.kwargs,
    ).toEqual({
      payload: request(),
      after: 0,
      version: false,
      limit: 50,
    });
    const version = 'e'.repeat(64);
    const all = Array.from({ length: 501 }, (_, index) => ({
      key: `new:stock.move:${index}`,
      model: 'stock.move',
      id: index + 1,
      name: 'QA Return move',
      available: true,
    })).sort((left, right) => (left.key < right.key ? -1 : 1));
    for (let after = 0; after < 501; after += 100) {
      const rows = all.slice(after, after + 100);
      const data = {
        ...references(),
        after,
        total_count: 501,
        rows,
        next_after: after + 100 < 501 ? after + 100 : false,
      };
      reply(data);
      expect(
        await getPagedStockReturnReferences(
          request(),
          after,
          after ? version : false,
          100,
        ),
      ).toEqual(data);
    }
  });

  it.each([
    { request_key: 'foreign' },
    { after: 1 },
    { version: 'bad' },
    { total_count: 3 },
    { next_after: 1 },
    { rows: references().rows.slice().reverse() },
    {
      rows: [
        {
          key: 'new:mail.message:0',
          model: 'mail.message',
          id: 1,
          name: 'Private',
          available: true,
        },
      ],
    },
    { rows: [...references().rows, references().rows[0]] },
    { context: {} },
  ])('rejects incomplete or private reference pages: %j', async (change) => {
    reply({ ...references(), ...change });
    await expect(getPagedStockReturnReferences(request())).rejects.toThrow(
      /return reference page/,
    );
  });

  it('requires original reference versions and bounded integer cursors before HTTP', async () => {
    for (const [after, version, limit] of [
      [1, false, 50],
      [-1, false, 50],
      [0, false, 101],
      [0, 'bad', 50],
    ] as const)
      await expect(
        getPagedStockReturnReferences(request(), after, version, limit),
      ).rejects.toThrow();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('retains expiry, explicit native rejection and unknown transport failures separately', async () => {
    (fetch as jest.Mock).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ error: { code: 100 } }),
    });
    await expect(savePagedStockReturn(request())).rejects.toBeInstanceOf(
      BillingSessionExpired,
    );
    (fetch as jest.Mock).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        error: {
          data: {
            name: 'odoo.exceptions.UserError',
            arguments: ['Native return rejected'],
          },
        },
      }),
    });
    await expect(savePagedStockReturn(request())).rejects.toBeInstanceOf(
      BillingActionRejected,
    );
    (fetch as jest.Mock).mockRejectedValue(new Error('Response lost'));
    await expect(savePagedStockReturn(request())).rejects.toThrow(
      'Response lost',
    );
  });
});
