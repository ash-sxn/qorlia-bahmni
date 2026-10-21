import {
  BillingSessionExpired,
  checkedInventoryCreationRequest,
  getInventoryCreationReferences,
  getInventoryCreationStatus,
  stopInventoryCreation,
  type InventoryCreationRequest,
  type InventoryCreationStatus,
} from '../billingService';
import { inventoryDraftForm } from './inventoryFormFixture';

const request = (): InventoryCreationRequest => ({
  seed: inventoryDraftForm().seed,
  edits: [{ node: 2, value: 'QorliaQA New transfer note' }],
  review_version: 'd'.repeat(64),
  review_complete_token: 'e'.repeat(64),
  request_key: '12345678-1234-4234-8234-123456789abc',
});
const status = (): InventoryCreationStatus => ({
  request_key: request().request_key,
  accepted: true,
  stopped: false,
  state_after: 'draft',
  reference_count: 1,
  transfer: {
    model: 'stock.picking',
    id: 991,
    name: 'QorliaQA Transfer',
    available: true,
  },
});
const pending = (): InventoryCreationStatus => ({
  request_key: request().request_key,
  accepted: false,
  stopped: false,
  state_after: false,
  reference_count: 0,
  transfer: false,
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
      name: 'QorliaQA Transfer',
      available: true,
    },
  ],
});
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
  ['status', getInventoryCreationStatus],
  ['stop', stopInventoryCreation],
] as const)(
  'uses the exact original request for %s without a guessed saved ID',
  async (action, call) => {
    const original = request(),
      copy = JSON.parse(JSON.stringify(original));
    reply(status());
    await expect(call(original)).resolves.toEqual(status());
    const [url, options] = jest.mocked(fetch).mock.calls[0];
    expect(url).toContain(`/stock.picking/qorlia_inventory_create_${action}`);
    expect(JSON.parse(options!.body as string).params).toEqual({
      model: 'stock.picking',
      method: `qorlia_inventory_create_${action}`,
      args: [],
      kwargs: { payload: original },
    });
    expect(original).toEqual(copy);
  },
);
it('keeps unknown, stopped and accepted outcomes distinct and does not interpret Stop as undo', async () => {
  reply(pending());
  await expect(getInventoryCreationStatus(request())).resolves.toEqual(
    pending(),
  );
  reply({ ...pending(), stopped: true });
  await expect(stopInventoryCreation(request())).resolves.toEqual({
    ...pending(),
    stopped: true,
  });
  reply(status());
  await expect(stopInventoryCreation(request())).resolves.toEqual(status());
  reply(pending());
  await expect(stopInventoryCreation(request())).rejects.toThrow(
    /original request/,
  );
});
it('accepts historical success when the created transfer is now unavailable', async () => {
  const outcome = {
    ...status(),
    transfer: {
      model: 'stock.picking' as const,
      id: false as const,
      name: false as const,
      available: false,
    },
  };
  reply(outcome);
  await expect(getInventoryCreationStatus(request())).resolves.toEqual(outcome);
  reply({
    ...references(),
    rows: [
      { ...references().rows[0], id: false, name: false, available: false },
    ],
  });
  const page = await getInventoryCreationReferences(request());
  expect(page.rows[0].available).toBe(false);
});
it('deep-copies the seed and ordered edits without modifying their signed representation', () => {
  const original = request(),
    copy = checkedInventoryCreationRequest(original);
  copy.seed.values.note = 'Changed copy';
  copy.edits[0].value = 'Changed copy';
  expect(original).toEqual(request());
});
it.each([
  'extra',
  'nonce',
  'proof',
  'seed',
  'seed-value',
  'node',
  'edit-extra',
  'nan',
])(
  'rejects malformed creation recovery requests before fetch: %s',
  async (kind) => {
    const value = request();
    if (kind === 'extra') Object.assign(value, { transfer_id: 7 });
    if (kind === 'nonce') value.request_key = 'new key';
    if (kind === 'proof') value.review_complete_token = 'bad';
    if (kind === 'seed') value.seed.signature = 'bad';
    if (kind === 'seed-value')
      Object.assign(value.seed.values, { value: Infinity });
    if (kind === 'node') Object.assign(value.edits[0], { node: true });
    if (kind === 'edit-extra') Object.assign(value.edits[0], { context: {} });
    if (kind === 'nan') value.edits[0].value = NaN;
    await expect(getInventoryCreationStatus(value)).rejects.toThrow();
    expect(fetch).not.toHaveBeenCalled();
  },
);
it.each([
  'nonce',
  'both',
  'state',
  'zero-count',
  'negative-count',
  'missing-root',
  'wrong-model',
  'hidden-id',
  'empty-name',
  'pending-root',
  'extra',
  'root-extra',
])('rejects unverifiable or privacy-breaking outcomes: %s', async (kind) => {
  const outcome = status();
  if (kind === 'nonce') outcome.request_key = 'other';
  if (kind === 'both') outcome.stopped = true;
  if (kind === 'state') Object.assign(outcome, { state_after: 'done' });
  if (kind === 'zero-count') outcome.reference_count = 0;
  if (kind === 'negative-count') outcome.reference_count = -1;
  if (kind === 'missing-root') outcome.transfer = false;
  if (kind === 'wrong-model')
    Object.assign(outcome.transfer, { model: 'stock.move' });
  if (kind === 'hidden-id')
    Object.assign(outcome.transfer, { available: false });
  if (kind === 'empty-name') Object.assign(outcome.transfer, { name: '' });
  if (kind === 'pending-root')
    Object.assign(outcome, { accepted: false, state_after: false });
  if (kind === 'extra') Object.assign(outcome, { result: { private: true } });
  if (kind === 'root-extra') Object.assign(outcome.transfer, { private: true });
  reply(outcome);
  await expect(getInventoryCreationStatus(request())).rejects.toThrow(
    /original request/,
  );
});
it('loads a bounded reference page separately without adding context or a root ID', async () => {
  reply(references());
  await expect(getInventoryCreationReferences(request())).resolves.toEqual(
    references(),
  );
  const [url, options] = jest.mocked(fetch).mock.calls[0];
  expect(url).toContain('/stock.picking/qorlia_inventory_create_references');
  expect(JSON.parse(options!.body as string).params.kwargs).toEqual({
    payload: request(),
    after: 0,
    version: false,
    limit: 50,
  });
});
it.each([
  'nonce',
  'incomplete',
  'private',
  'key',
  'hidden-id',
  'version',
  'extra',
])('rejects malformed creation reference pages: %s', async (kind) => {
  const page = references();
  if (kind === 'nonce') page.request_key = 'other';
  if (kind === 'incomplete') page.total_count = 2;
  if (kind === 'private') page.rows[0].model = 'mail.followers';
  if (kind === 'key') page.rows[0].key = 'new:stock.move:0';
  if (kind === 'hidden-id') page.rows[0].available = false;
  if (kind === 'version') page.version = 'bad';
  if (kind === 'extra') Object.assign(page, { private: true });
  reply(page);
  await expect(getInventoryCreationReferences(request())).rejects.toThrow();
});
it('rejects unpinned continuation and oversized pages before a request', async () => {
  await expect(getInventoryCreationReferences(request(), 1)).rejects.toThrow();
  await expect(
    getInventoryCreationReferences(request(), 0, false, 101),
  ).rejects.toThrow();
  expect(fetch).not.toHaveBeenCalled();
});
it('propagates network and session failures without retrying Stop or changing its request', async () => {
  const original = request();
  jest.mocked(fetch).mockRejectedValueOnce(new Error('Lost response'));
  await expect(stopInventoryCreation(original)).rejects.toThrow(
    'Lost response',
  );
  expect(fetch).toHaveBeenCalledTimes(1);
  reply(undefined);
  jest.mocked(fetch).mockResolvedValueOnce({
    ok: true,
    status: 200,
    json: async () => ({ error: { code: 100 } }),
  } as Response);
  await expect(getInventoryCreationStatus(original)).rejects.toBeInstanceOf(
    BillingSessionExpired,
  );
  expect(fetch).toHaveBeenCalledTimes(2);
  expect(original).toEqual(request());
});
