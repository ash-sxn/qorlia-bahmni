import { BillingSessionExpired, getOrderDeliveries } from '../billingService';
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
