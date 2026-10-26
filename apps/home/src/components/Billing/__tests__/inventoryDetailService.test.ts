import {
  BillingActionRejected,
  BillingSessionExpired,
  getInventoryTransfer,
  getInventoryTransferDetailPage,
} from '../billingService';
import { inventoryLoad, inventoryDetail } from './inventoryTransferFixture';

const reply = (result: unknown) =>
  jest.mocked(fetch).mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ result }),
  } as Response);
beforeEach(() => {
  global.fetch = jest.fn();
});
it('loads a stock-only transfer with only its identifier and no sales scope', async () => {
  const data = inventoryLoad();
  reply(data);
  await expect(getInventoryTransfer(11)).resolves.toEqual(data);
  const [url, options] = jest.mocked(fetch).mock.calls[0];
  expect(url).toContain('/stock.picking/qorlia_inventory_transfer_load');
  expect(JSON.parse(options!.body as string).params).toEqual({
    model: 'stock.picking',
    method: 'qorlia_inventory_transfer_load',
    args: [],
    kwargs: { transfer_id: 11 },
  });
});
it.each(['moves', 'operations'] as const)(
  'reads %s with the actual native cursor and pinned version',
  async (section) => {
    const data = inventoryDetail(section);
    reply(data);
    await expect(
      getInventoryTransferDetailPage(11, section, 0, data.version),
    ).resolves.toEqual(data);
    const [url, options] = jest.mocked(fetch).mock.calls[0];
    expect(url).toContain(
      '/stock.picking/qorlia_inventory_transfer_detail_page',
    );
    expect(JSON.parse(options!.body as string).params).toEqual({
      model: 'stock.picking',
      method: 'qorlia_inventory_transfer_detail_page',
      args: [],
      kwargs: {
        transfer_id: 11,
        section,
        after: 0,
        version: data.version,
        limit: 50,
      },
    });
    expect(data).not.toHaveProperty('order_id');
    expect(data.rows[0]).not.toHaveProperty('order_line');
  },
);
it.each([
  'identifier',
  'counts',
  'version',
  'timezone',
  'readonly',
  'extra',
  'header',
])('rejects malformed transfer load: %s', async (kind) => {
  const data = inventoryLoad();
  if (kind === 'identifier') data.transfer.id = 99;
  if (kind === 'counts') data.transfer.move_count = -1;
  if (kind === 'version') data.version = 'bad';
  if (kind === 'timezone') data.timezone = 'Invalid/Timezone';
  if (kind === 'readonly') Object.assign(data, { read_only: false });
  if (kind === 'extra') Object.assign(data, { order_id: 9 });
  if (kind === 'header')
    Object.assign(data.transfer, { private_account: 'hidden' });
  reply(data);
  await expect(getInventoryTransfer(11)).rejects.toThrow(/Invalid inventory/);
});
it.each(['moves', 'operations'] as const)(
  'rejects malformed %s cursor, snapshot and row payloads',
  async (section) => {
    for (const kind of [
      'identifier',
      'section',
      'version',
      'after',
      'position',
      'count',
      'rows',
      'duplicate',
      'next',
      'order',
      'quantity',
      'timezone',
    ]) {
      const data = inventoryDetail(section);
      if (kind === 'identifier') data.transfer.id = 99;
      if (kind === 'section') Object.assign(data, { section: 'other' });
      if (kind === 'version') data.version = 'a'.repeat(64);
      if (kind === 'after') data.after = 1;
      if (kind === 'position') data.position = 1;
      if (kind === 'count') data.total_count = 2;
      if (kind === 'rows') data.rows = [];
      if (kind === 'duplicate') {
        Object.assign(data, { rows: [...data.rows, data.rows[0]] });
        data.total_count = 2;
        if (section === 'moves') data.transfer.move_count = 2;
        else data.transfer.operation_count = 2;
      }
      if (kind === 'next') data.next_after = data.rows[0].id;
      if (kind === 'order') Object.assign(data.rows[0], { order_line: false });
      if (kind === 'quantity') Object.assign(data.rows[0], { done: NaN });
      if (kind === 'timezone') data.timezone = 'Invalid/Timezone';
      reply(data);
      await expect(
        getInventoryTransferDetailPage(11, section, 0, inventoryLoad().version),
      ).rejects.toThrow(/Invalid inventory/);
    }
  },
);
it('rejects invalid requests before transport, including unpinned later pages', async () => {
  await expect(getInventoryTransfer(0)).rejects.toThrow(/saved inventory/);
  await expect(
    getInventoryTransferDetailPage(11, 'moves', 12, false),
  ).rejects.toThrow(/original version/);
  await expect(
    getInventoryTransferDetailPage(11, 'moves', 0, false, 101),
  ).rejects.toThrow(/bounded inventory/);
  expect(fetch).not.toHaveBeenCalled();
});
it('keeps native stale-access rejection and expiry distinct from empty details', async () => {
  jest.mocked(fetch).mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({
      error: {
        data: {
          name: 'odoo.exceptions.UserError',
          arguments: ['Inventory changed. Reload it.'],
        },
      },
    }),
  } as Response);
  await expect(getInventoryTransfer(11)).rejects.toBeInstanceOf(
    BillingActionRejected,
  );
  jest.mocked(fetch).mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ error: { code: 100 } }),
  } as Response);
  await expect(
    getInventoryTransferDetailPage(11, 'moves'),
  ).rejects.toBeInstanceOf(BillingSessionExpired);
});
