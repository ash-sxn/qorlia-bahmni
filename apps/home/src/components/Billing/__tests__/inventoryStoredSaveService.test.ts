import {
  BillingSessionExpired,
  getInventoryStoredSaveReferences,
  getInventoryStoredSaveStatus,
  saveInventoryStoredForm,
  stopInventoryStoredSave,
  type InventoryStoredSaveRequest,
  type InventoryStoredSaveStatus,
} from '../billingService';
import { inventoryStoredPreview } from './inventoryFormFixture';
import { inventoryLoad } from './inventoryTransferFixture';

const request = (): InventoryStoredSaveRequest => {
  const data = inventoryStoredPreview();
  return {
    transfer_id: data.transfer_id,
    version: data.version,
    edits: data.edits,
    review_version: 'd'.repeat(64),
    review_complete_token: 'e'.repeat(64),
    request_key: '12345678-1234-4234-8234-123456789abc',
  };
};
const status = (): InventoryStoredSaveStatus => {
  const current = inventoryLoad();
  current.transfer.id = request().transfer_id;
  return {
    request_key: request().request_key,
    accepted: true,
    stopped: false,
    state_after: 'draft',
    changed_fields: ['note'],
    reference_count: 0,
    current,
  };
};
const reply = (result: unknown) =>
  jest.mocked(fetch).mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ result }),
  } as Response);
beforeEach(() => {
  global.fetch = jest.fn();
});

it.each([
  ['save', saveInventoryStoredForm, 'qorlia_inventory_edit_save'],
  ['status', getInventoryStoredSaveStatus, 'qorlia_inventory_edit_save_status'],
  ['stop', stopInventoryStoredSave, 'qorlia_inventory_edit_save_stop'],
] as const)(
  'sends the same immutable exact request for %s',
  async (_name, call, method) => {
    const original = request(),
      copied = JSON.parse(JSON.stringify(original));
    reply(status());
    await expect(call(original)).resolves.toEqual(status());
    expect(original).toEqual(copied);
    const [url, options] = jest.mocked(fetch).mock.calls[0];
    expect(url).toContain(`/stock.picking/${method}`);
    expect(JSON.parse(options!.body as string).params).toEqual({
      model: 'stock.picking',
      method,
      args: [],
      kwargs: { payload: original },
    });
  },
);
it('distinguishes pending status, durable stop and accepted save without implying undo', async () => {
  const pending = {
    ...status(),
    accepted: false,
    state_after: false,
    changed_fields: [],
  };
  reply(pending);
  await expect(getInventoryStoredSaveStatus(request())).resolves.toEqual(
    pending,
  );
  reply({ ...pending, stopped: true });
  await expect(stopInventoryStoredSave(request())).resolves.toEqual({
    ...pending,
    stopped: true,
  });
  reply(status());
  await expect(stopInventoryStoredSave(request())).resolves.toEqual(status());
  reply(pending);
  await expect(saveInventoryStoredForm(request())).rejects.toThrow(
    /original request/,
  );
  reply(pending);
  await expect(stopInventoryStoredSave(request())).rejects.toThrow(
    /original request/,
  );
});
it.each(['scope', 'version', 'proof', 'nonce', 'node', 'extra'])(
  'rejects invalid save requests before contacting the backend: %s',
  async (kind) => {
    const data = request();
    if (kind === 'scope') data.transfer_id = 0;
    if (kind === 'version') data.version = 'bad';
    if (kind === 'proof') data.review_complete_token = 'bad';
    if (kind === 'nonce') data.request_key = 'new nonce';
    if (kind === 'node') Object.assign(data.edits[0], { node: true });
    if (kind === 'extra') Object.assign(data, { order_id: 99 });
    await expect(saveInventoryStoredForm(data)).rejects.toThrow();
    expect(fetch).not.toHaveBeenCalled();
  },
);
it.each([
  'nonce',
  'scope',
  'both',
  'state',
  'fields',
  'private-field',
  'duplicates',
  'count',
  'pending',
  'extra',
  'current-extra',
])(
  'rejects an unverifiable receipt without silently accepting it: %s',
  async (kind) => {
    const data = status();
    if (kind === 'nonce')
      data.request_key = '87654321-1234-4234-8234-123456789abc';
    if (kind === 'scope') data.current.transfer.id += 1;
    if (kind === 'both') data.stopped = true;
    if (kind === 'state') Object.assign(data, { state_after: false });
    if (kind === 'fields') data.changed_fields = ['origin', 'note'];
    if (kind === 'private-field')
      data.changed_fields = ['qorlia_validation_receipts'];
    if (kind === 'duplicates') data.changed_fields = ['note', 'note'];
    if (kind === 'count') data.reference_count = -1;
    if (kind === 'pending')
      Object.assign(data, { accepted: false, state_after: false });
    if (kind === 'extra') Object.assign(data, { receipt: { private: true } });
    if (kind === 'current-extra')
      Object.assign(data.current, { private: 'hidden' });
    reply(data);
    await expect(getInventoryStoredSaveStatus(request())).rejects.toThrow(
      /original request/,
    );
  },
);
it('keeps a network failure unknown and does not automatically retry a write', async () => {
  const original = request();
  jest.mocked(fetch).mockRejectedValue(new Error('Connection lost'));
  await expect(saveInventoryStoredForm(original)).rejects.toThrow(
    'Connection lost',
  );
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(original).toEqual(request());
});
it('propagates session expiry so the original request can be recovered after sign-in', async () => {
  jest.mocked(fetch).mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ error: { code: 100 } }),
  } as Response);
  await expect(getInventoryStoredSaveStatus(request())).rejects.toBeInstanceOf(
    BillingSessionExpired,
  );
  expect(fetch).toHaveBeenCalledTimes(1);
});
const references = () => ({
  request_key: request().request_key,
  version: 'f'.repeat(64),
  after: 0,
  total_count: 1,
  next_after: false,
  rows: [
    {
      key: 'new:stock.picking:0',
      model: 'stock.picking',
      id: 991,
      name: 'QorliaQA Generated transfer',
      available: true,
    },
  ],
});
it('loads bounded generated references separately from the compact receipt', async () => {
  reply(references());
  await expect(getInventoryStoredSaveReferences(request())).resolves.toEqual(
    references(),
  );
  const [url, options] = jest.mocked(fetch).mock.calls[0];
  expect(url).toContain('/stock.picking/qorlia_inventory_edit_save_references');
  expect(JSON.parse(options!.body as string).params.kwargs).toEqual({
    payload: request(),
    after: 0,
    version: false,
    limit: 50,
  });
});
it.each(['nonce', 'incomplete', 'private', 'version'])(
  'rejects invalid reference pages: %s',
  async (kind) => {
    const data = references();
    if (kind === 'nonce') data.request_key = 'other';
    if (kind === 'incomplete') data.total_count = 2;
    if (kind === 'private') data.rows[0].model = 'mail.followers';
    if (kind === 'version') data.version = 'bad';
    reply(data);
    await expect(getInventoryStoredSaveReferences(request())).rejects.toThrow();
  },
);
it('rejects unpinned continuation or excessive page sizes before any request', async () => {
  await expect(
    getInventoryStoredSaveReferences(request(), 1),
  ).rejects.toThrow();
  await expect(
    getInventoryStoredSaveReferences(request(), 0, false, 101),
  ).rejects.toThrow();
  expect(fetch).not.toHaveBeenCalled();
});
