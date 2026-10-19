import {
  BillingSessionExpired,
  getInventoryTransfers,
} from '../billingService';
import { inventoryPage } from './inventoryTransferFixture';

const reply = (result: unknown) =>
  jest.mocked(fetch).mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ result }),
  } as Response);
beforeEach(() => {
  global.fetch = jest.fn();
});
it('calls only the named stock list reader without an order identifier or context', async () => {
  const data = inventoryPage();
  reply(data);
  await expect(getInventoryTransfers()).resolves.toEqual(data);
  const [url, options] = jest.mocked(fetch).mock.calls[0];
  expect(url).toContain('/stock.picking/qorlia_inventory_transfers');
  expect(JSON.parse(options!.body as string).params).toEqual({
    model: 'stock.picking',
    method: 'qorlia_inventory_transfers',
    args: [],
    kwargs: { search: '', operation: 'all', state: 'all', offset: 0 },
  });
});
it('sends a trimmed native search and preserves incoming and waiting filters', async () => {
  const data = {
    ...inventoryPage(),
    filters: { search: 'Receipt', operation: 'incoming', state: 'waiting' },
  };
  reply(data);
  await expect(
    getInventoryTransfers(' Receipt ', 'incoming', 'waiting'),
  ).resolves.toEqual(data);
});
it.each([
  'rows',
  'count',
  'offset',
  'next',
  'duplicate',
  'filters',
  'timezone',
  'readonly',
  'extra',
  'state',
])('rejects an incoherent native browse response: %s', async (kind) => {
  const data = inventoryPage();
  if (kind === 'rows') data.rows = [];
  if (kind === 'count') data.total_count = -1;
  if (kind === 'offset') data.offset = 25;
  if (kind === 'next') data.next_offset = 25;
  if (kind === 'duplicate') {
    data.rows.push(data.rows[0]);
    data.total_count = 2;
  }
  if (kind === 'filters') data.filters.search = 'other';
  if (kind === 'timezone') data.timezone = 'Invalid/Timezone';
  if (kind === 'readonly') Object.assign(data, { read_only: false });
  if (kind === 'extra')
    Object.assign(data.rows[0], { private_field: 'hidden' });
  if (kind === 'state') Object.assign(data.rows[0], { state: 'invalid' });
  reply(data);
  await expect(getInventoryTransfers()).rejects.toThrow(/Invalid inventory/);
});
it('rejects invalid input before making a request', async () => {
  await expect(getInventoryTransfers('', 'all', 'all', -1)).rejects.toThrow(
    /valid inventory/,
  );
  await expect(getInventoryTransfers('x'.repeat(161))).rejects.toThrow(
    /valid inventory/,
  );
  expect(fetch).not.toHaveBeenCalled();
});
it('preserves session expiry rather than showing an empty inventory', async () => {
  jest.mocked(fetch).mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ error: { code: 100 } }),
  } as Response);
  await expect(getInventoryTransfers()).rejects.toBeInstanceOf(
    BillingSessionExpired,
  );
});
