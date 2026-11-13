import {
  BillingActionRejected,
  BillingSessionExpired,
  getOrderTransferDetailPage,
} from '../billingService';
import { orderDeliveryFixture } from './orderDeliveryFixture';

const page = (section: 'moves' | 'operations' = 'moves') => {
  const fixture = orderDeliveryFixture();
  const { moves, operations, ...header } = fixture.rows[0];
  return {
    ...fixture,
    transfer: {
      ...header,
      move_count: moves.length,
      operation_count: operations.length,
    },
    section,
    after: 0,
    position: 0,
    total_count: section === 'moves' ? moves.length : operations.length,
    next_after: false,
    rows: section === 'moves' ? moves : operations,
  };
};
const reply = (result: unknown) =>
  (fetch as jest.Mock).mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ result }),
  });

describe('Native transfer move and operation pages', () => {
  beforeEach(() => {
    global.fetch = jest.fn();
  });

  it('uses only the scoped read API and shares a summary snapshot across both sections', async () => {
    const native = page();
    reply(native);
    expect(
      await getOrderTransferDetailPage(9, 11, 'moves', 0, native.version),
    ).toEqual(native);
    const [url, init] = (fetch as jest.Mock).mock.calls[0];
    expect(url).toContain('/sale.order/qorlia_order_transfer_detail_page');
    expect(JSON.parse(init.body).params).toEqual({
      model: 'sale.order',
      method: 'qorlia_order_transfer_detail_page',
      args: [],
      kwargs: {
        order_id: 9,
        transfer_id: 11,
        section: 'moves',
        after: 0,
        version: native.version,
        limit: 50,
      },
    });
    const operations = page('operations');
    reply(operations);
    const result = await getOrderTransferDetailPage(
      9,
      11,
      'operations',
      0,
      native.version,
    );
    expect(result).toEqual(operations);
    expect(result.transfer).not.toHaveProperty('moves');
    expect(result.transfer).not.toHaveProperty('operations');
  });

  it('accepts native ordered continuation and counts above the old full-detail budgets', async () => {
    const first = page('operations');
    const row = first.rows[0];
    const continued = {
      ...first,
      after: row.id,
      position: 1,
      total_count: 2001,
      transfer: { ...first.transfer, move_count: 501, operation_count: 2001 },
      next_after: row.id + 1,
      rows: [{ ...row, id: row.id + 1 }],
    };
    reply(continued);
    expect(
      await getOrderTransferDetailPage(
        9,
        11,
        'operations',
        row.id,
        first.version,
        1,
      ),
    ).toEqual(continued);
    const empty = {
      ...continued,
      after: row.id + 2001,
      position: 2001,
      rows: [],
      next_after: false,
    };
    reply(empty);
    expect(
      (
        await getOrderTransferDetailPage(
          9,
          11,
          'operations',
          empty.after,
          first.version,
        )
      ).rows,
    ).toEqual([]);
    const zero = {
      ...first,
      transfer: { ...first.transfer, operation_count: 0 },
      total_count: 0,
      rows: [],
    };
    reply(zero);
    expect(
      (await getOrderTransferDetailPage(9, 11, 'operations')).rows,
    ).toEqual([]);
  });

  it('rejects invalid identities, sections, bounds and versionless cursors before HTTP', async () => {
    for (const args of [
      [false, 11, 'moves'],
      [9, 0, 'moves'],
      [9, 11, 'products'],
      [9, 11, []],
      [9, 11, 'moves', true],
      [9, 11, 'moves', -1],
      [9, 11, 'moves', 1],
      [9, 11, 'moves', 0, 'short'],
      [9, 11, 'moves', 0, true],
      [9, 11, 'moves', 0, false, 0],
      [9, 11, 'moves', 0, false, 101],
      [9, 11, 'moves', 0, false, 1.5],
    ]) {
      await expect(
        getOrderTransferDetailPage(
          ...(args as Parameters<typeof getOrderTransferDetailPage>),
        ),
      ).rejects.toThrow('Use a bounded move or operation page');
    }
    expect(fetch).not.toHaveBeenCalled();
  });

  it('rejects foreign identities, mixed sections, incomplete shapes and inconsistent page budgets', async () => {
    const good = page();
    for (const changed of [
      { order_id: 10 },
      { order_state: 'paid' },
      { read_only: false },
      { transfer: { ...good.transfer, id: 12 } },
      { section: 'operations' },
      { after: 1 },
      { position: 1 },
      { total_count: 2 },
      { next_after: good.rows[0].id },
      { version: false },
      { rows: undefined },
      { rows: [null] },
      { extra: 'private' },
      { transfer: { ...good.transfer, moves: [] } },
      { transfer: { ...good.transfer, move_count: -1 } },
      { rows: [{ ...good.rows[0], demand: Infinity }] },
      { rows: [{ ...good.rows[0], private: 'extra' }] },
      { rows: [{ ...good.rows[0], unit: [0, 'invalid'] }] },
    ]) {
      reply({ ...good, ...changed });
      await expect(getOrderTransferDetailPage(9, 11, 'moves')).rejects.toThrow(
        'Invalid native transfer detail page',
      );
    }
    const ops = page('operations');
    for (const changed of [
      { id: false },
      { move_id: '13' },
      { done: NaN },
      { lot: [0, 'invalid'] },
      { expiry_date: true },
      { lot_name: true },
      { unit: true },
      { extra: 'private' },
    ]) {
      reply({ ...ops, rows: [{ ...ops.rows[0], ...changed }] });
      await expect(
        getOrderTransferDetailPage(9, 11, 'operations'),
      ).rejects.toThrow('Invalid native transfer detail page');
    }
    reply({
      ...good,
      rows: [good.rows[0], good.rows[0]],
      total_count: 2,
      transfer: { ...good.transfer, move_count: 2 },
    });
    await expect(getOrderTransferDetailPage(9, 11, 'moves')).rejects.toThrow(
      'Invalid native transfer detail page',
    );
    reply({ ...good, version: 'b'.repeat(64) });
    await expect(
      getOrderTransferDetailPage(9, 11, 'moves', 0, good.version),
    ).rejects.toThrow('Invalid native transfer detail page');
    reply({
      ...good,
      after: 1,
      position: 2,
      total_count: 3,
      transfer: { ...good.transfer, move_count: 3 },
      rows: [{ ...good.rows[0], id: 2 }],
    });
    await expect(
      getOrderTransferDetailPage(9, 11, 'moves', 1, good.version, 1),
    ).rejects.toThrow('Invalid native transfer detail page');
  });

  it('preserves native operation units and references to moves on other detail pages', async () => {
    const fixture = page('operations');
    const native = {
      ...fixture,
      transfer: { ...fixture.transfer, move_count: 501 },
      rows: [
        {
          ...fixture.rows[0],
          move_id: 999,
          unit: [9, 'Dozen'],
          done: 0.5,
          lot: false,
          lot_name: 'Pending native batch',
          expiry_date: '2028-02-01 00:00:00',
        },
      ],
    };
    reply(native);
    expect(await getOrderTransferDetailPage(9, 11, 'operations')).toEqual(
      native,
    );
  });

  it('preserves native stale/session handling and redacts access errors', async () => {
    const nativeError = (code: number, name?: string) =>
      (fetch as jest.Mock).mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          error: {
            code,
            data: {
              name,
              arguments: ['Private record details'],
              debug: 'private traceback',
            },
          },
        }),
      });
    nativeError(200, 'odoo.exceptions.UserError');
    await expect(
      getOrderTransferDetailPage(9, 11, 'moves'),
    ).rejects.toBeInstanceOf(BillingActionRejected);
    nativeError(100);
    await expect(
      getOrderTransferDetailPage(9, 11, 'moves'),
    ).rejects.toBeInstanceOf(BillingSessionExpired);
    nativeError(200, 'odoo.exceptions.AccessError');
    await expect(getOrderTransferDetailPage(9, 11, 'moves')).rejects.toThrow(
      'Billing access failed. Check your billing account permissions.',
    );
  });
});
