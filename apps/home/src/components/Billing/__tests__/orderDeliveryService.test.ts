import {
  BillingActionRejected,
  BillingSessionExpired,
  getOrderDeliveries,
  getOrderDeliveryPage,
} from '../billingService';
import { orderDeliveryFixture } from './orderDeliveryFixture';

const reply = (result: unknown) =>
  (fetch as jest.Mock).mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ result }),
  });
describe('Order transfer native boundary', () => {
  beforeEach(() => {
    global.fetch = jest.fn();
  });
  it('uses only the scoped read API and preserves native per-operation units', async () => {
    const fixture = orderDeliveryFixture();
    reply(fixture);
    expect(await getOrderDeliveries(9)).toEqual(fixture);
    const [url, init] = (fetch as jest.Mock).mock.calls[0];
    expect(url).toBe(
      '/openmrs/qorlia-billing-api/web/dataset/call_kw/sale.order/qorlia_order_deliveries',
    );
    expect(init.credentials).toBe('same-origin');
    expect(JSON.parse(init.body).params).toEqual({
      model: 'sale.order',
      method: 'qorlia_order_deliveries',
      args: [],
      kwargs: { order_id: 9 },
    });
  });
  it('rejects invalid identities before sending a request', async () => {
    for (const id of [
      false,
      true,
      0,
      -1,
      0.5,
      '9',
      NaN,
      Infinity,
      Number.MAX_SAFE_INTEGER + 1,
    ])
      await expect(getOrderDeliveries(id as number)).rejects.toThrow(
        'Select a saved charge order',
      );
    expect(fetch).not.toHaveBeenCalled();
  });
  it('rejects missing, foreign, duplicate and malformed native graphs', async () => {
    const fixture = orderDeliveryFixture();
    const row = fixture.rows[0];
    for (const change of [
      { order_id: 10 },
      { version: false },
      { read_only: false },
      { order_state: 'paid' },
      { rows: undefined },
      { rows: [null] },
      { rows: [row, row] },
      { rows: [{ ...row, moves: [row.moves[0], row.moves[0]] }] },
      { rows: [{ ...row, state: 'completed' }] },
      { rows: [{ ...row, company: false }] },
      { rows: [{ ...row, moves: [{ ...row.moves[0], demand: '12' }] }] },
      {
        rows: [{ ...row, operations: [{ ...row.operations[0], move_id: 99 }] }],
      },
      {
        rows: [
          { ...row, operations: [{ ...row.operations[0], done: Infinity }] },
        ],
      },
      {
        rows: [
          { ...row, operations: [{ ...row.operations[0], lot: [0, 'Wrong'] }] },
        ],
      },
      {
        rows: [
          { ...row, operations: [{ ...row.operations[0], expiry_date: true }] },
        ],
      },
    ]) {
      reply({ ...fixture, ...change });
      await expect(getOrderDeliveries(9)).rejects.toThrow(
        'Invalid stock transfer response',
      );
    }
    reply({ ...fixture, rows: [] });
    expect((await getOrderDeliveries(9)).rows).toEqual([]);
  });
  it('preserves expiry recovery without leaking native tracebacks', async () => {
    (fetch as jest.Mock).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ error: { code: 100 } }),
    });
    await expect(getOrderDeliveries(9)).rejects.toBeInstanceOf(
      BillingSessionExpired,
    );
    (fetch as jest.Mock).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        error: { code: 200, data: { debug: 'private traceback' } },
      }),
    });
    await expect(getOrderDeliveries(9)).rejects.toThrow(
      'Check your billing account permissions',
    );
  });
});

describe('Native order transfer pages', () => {
  const page = () => {
    const fixture = orderDeliveryFixture();
    const { moves, operations, ...header } = fixture.rows[0];
    return {
      ...fixture,
      after: 0,
      position: 0,
      total_count: 1,
      next_after: false,
      rows: [
        {
          ...header,
          move_count: moves.length,
          operation_count: operations.length,
        },
      ],
    };
  };
  beforeEach(() => {
    global.fetch = jest.fn();
  });
  it('uses the scoped page API and preserves headers/counts without inventing nested detail', async () => {
    const first = { ...page(), total_count: 2, next_after: 11 };
    reply(first);
    expect(await getOrderDeliveryPage(9, 0, false, 1)).toEqual(first);
    const [url, init] = (fetch as jest.Mock).mock.calls[0];
    expect(url).toContain('/sale.order/qorlia_order_delivery_page');
    expect(JSON.parse(init.body).params).toEqual({
      model: 'sale.order',
      method: 'qorlia_order_delivery_page',
      args: [],
      kwargs: { order_id: 9, after: 0, version: false, limit: 1 },
    });
    const second = {
      ...page(),
      after: 11,
      position: 1,
      total_count: 2,
      rows: [
        { ...page().rows[0], id: 12, move_count: 501, operation_count: 2001 },
      ],
    };
    reply(second);
    expect(await getOrderDeliveryPage(9, 11, first.version, 1)).toEqual(second);
    expect(second.rows[0]).not.toHaveProperty('moves');
    expect(second.rows[0]).not.toHaveProperty('operations');
  });
  it('rejects unbounded, foreign-shaped or versionless cursor inputs before HTTP', async () => {
    for (const args of [
      [false],
      [0],
      [9, true],
      [9, -1],
      [9, 11],
      [9, 0, true],
      [9, 0, 'short'],
      [9, 0, false, 0],
      [9, 0, false, 101],
      [9, 0, false, 1.5],
    ]) {
      await expect(
        getOrderDeliveryPage(
          ...(args as Parameters<typeof getOrderDeliveryPage>),
        ),
      ).rejects.toThrow('Use a bounded transfer page');
    }
    expect(fetch).not.toHaveBeenCalled();
  });
  it('rejects malformed counts, cursors, ordering, headers, identities and mixed snapshots', async () => {
    const good = page();
    for (const change of [
      { order_id: 10 },
      { version: false },
      { read_only: false },
      { order_state: 'paid' },
      { after: 11 },
      { position: 1 },
      { total_count: -1 },
      { total_count: 2 },
      { next_after: 11 },
      { rows: undefined },
      { rows: [null] },
      { rows: [{ ...good.rows[0], move_count: -1 }] },
      { rows: [{ ...good.rows[0], operation_count: '2' }] },
      { rows: [{ ...good.rows[0], moves: [] }] },
      { rows: [{ ...good.rows[0], id: 0 }] },
      { rows: [{ ...good.rows[0], state: 'completed' }] },
      { rows: [{ ...good.rows[0], company: false }] },
      { extra: 'unreviewed' },
    ]) {
      reply({ ...good, ...change });
      await expect(getOrderDeliveryPage(9)).rejects.toThrow(
        'Invalid native transfer page',
      );
    }
    reply({
      ...good,
      after: 11,
      position: 1,
      total_count: 3,
      next_after: false,
      rows: [
        { ...good.rows[0], id: 12 },
        { ...good.rows[0], id: 12 },
      ],
    });
    await expect(getOrderDeliveryPage(9, 11, good.version, 2)).rejects.toThrow(
      'Invalid native transfer page',
    );
    reply({
      ...good,
      after: 11,
      position: 1,
      total_count: 2,
      version: 'b'.repeat(64),
      rows: [{ ...good.rows[0], id: 12 }],
    });
    await expect(getOrderDeliveryPage(9, 11, good.version, 1)).rejects.toThrow(
      'Invalid native transfer page',
    );
    reply({
      ...good,
      after: 11,
      position: 12,
      total_count: 13,
      rows: [{ ...good.rows[0], id: 12 }],
    });
    await expect(getOrderDeliveryPage(9, 11, good.version, 1)).rejects.toThrow(
      'Invalid native transfer page',
    );
    reply({ ...good, rows: [], total_count: 0 });
    expect((await getOrderDeliveryPage(9)).rows).toEqual([]);
  });
  it('preserves native stale-page rejection and session recovery without private tracebacks', async () => {
    (fetch as jest.Mock).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        error: {
          code: 200,
          data: {
            name: 'odoo.exceptions.UserError',
            arguments: ['Reload transfer pages.'],
            debug: 'private trace',
          },
        },
      }),
    });
    await expect(getOrderDeliveryPage(9)).rejects.toBeInstanceOf(
      BillingActionRejected,
    );
    await expect(getOrderDeliveryPage(9)).rejects.toThrow(
      'Reload transfer pages.',
    );
    (fetch as jest.Mock).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ error: { code: 100 } }),
    });
    await expect(getOrderDeliveryPage(9)).rejects.toBeInstanceOf(
      BillingSessionExpired,
    );
  });
  it('redacts native record-rule access errors instead of exposing hidden records as business errors', async () => {
    (fetch as jest.Mock).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        error: {
          code: 200,
          data: {
            name: 'odoo.exceptions.AccessError',
            arguments: ['Private hidden operation 123 and access rule details'],
            debug: 'private traceback',
          },
        },
      }),
    });
    const error = await getOrderDeliveryPage(9).catch(
      (caught: unknown) => caught,
    );
    expect(error).toBeInstanceOf(Error);
    expect(error).not.toBeInstanceOf(BillingActionRejected);
    expect((error as Error).message).toBe(
      'Billing access failed. Check your billing account permissions.',
    );
  });
});
