import {
  BillingSessionExpired,
  getInventoryCreationValuesReview,
  type InventoryCreationValuesReview,
} from '../billingService';
import { inventoryDraftForm } from './inventoryFormFixture';

const review = (): InventoryCreationValuesReview => ({
  ...inventoryDraftForm(),
  review_kind: 'native_create_values',
  prepared_values: {
    note: '<p>QorliaQA Review</p>',
    partner_id: 4,
    move_ids: [[0, 0, { name: 'QorliaQA Child', product_uom_qty: 3 }]],
  },
  values_version: 'd'.repeat(64),
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

it('reads complete native save values using the exact original seed and ordered edits, without Save', async () => {
  const current = inventoryDraftForm(),
    original = JSON.parse(JSON.stringify(current));
  const data = review();
  reply(data);
  await expect(
    getInventoryCreationValuesReview(current.seed, current.edits),
  ).resolves.toEqual(data);
  expect(fetch).toHaveBeenCalledTimes(1);
  const [url, options] = jest.mocked(fetch).mock.calls[0];
  expect(url).toContain('/stock.picking/qorlia_inventory_create_values_review');
  expect(JSON.parse(options!.body as string).params).toEqual({
    model: 'stock.picking',
    method: 'qorlia_inventory_create_values_review',
    args: [],
    kwargs: { seed: current.seed, edits: current.edits },
  });
  expect(current).toEqual(original);
  expect(data.write_ready).toBe(false);
  expect(data).not.toHaveProperty('review_complete_token');
});

it.each([
  'kind',
  'version',
  'writer',
  'read-only',
  'root-id',
  'unknown-field',
  'number',
  'missing-values',
  'empty-values',
  'wrong-seed',
  'wrong-edits',
  'saved-form',
  'missing-form',
  'save-proof',
  'oversized',
])(
  'rejects a malformed or incomplete prepared-values review: %s',
  async (kind) => {
    const data = review(),
      current = inventoryDraftForm();
    if (kind === 'kind') Object.assign(data, { review_kind: 'native_effects' });
    if (kind === 'version') data.values_version = 'bad';
    if (kind === 'writer') Object.assign(data, { write_ready: true });
    if (kind === 'read-only') Object.assign(data, { read_only: false });
    if (kind === 'root-id') data.prepared_values.id = 99;
    if (kind === 'unknown-field') data.prepared_values.unknown = true;
    if (kind === 'number') data.prepared_values.partner_id = Infinity;
    if (kind === 'missing-values')
      Object.assign(data, { prepared_values: false });
    if (kind === 'empty-values') data.prepared_values = {};
    if (kind === 'wrong-seed')
      data.seed.payload = data.seed.payload.replace('false', 'true');
    if (kind === 'wrong-edits')
      data.edits = [{ node: 2, value: 'QorliaQA Other edit' }];
    if (kind === 'saved-form') data.form.transfer_id = 77;
    if (kind === 'missing-form') Object.assign(data, { form: false });
    if (kind === 'save-proof')
      Object.assign(data, { review_complete_token: 'e'.repeat(64) });
    if (kind === 'oversized') data.prepared_values.note = 'x'.repeat(4_000_001);
    reply(data);
    await expect(
      getInventoryCreationValuesReview(current.seed, current.edits),
    ).rejects.toThrow(/Invalid/);
  },
);

it('rejects malformed original input before making a request', async () => {
  const data = inventoryDraftForm();
  await expect(
    getInventoryCreationValuesReview({ ...data.seed, signature: 'bad' }, []),
  ).rejects.toThrow();
  await expect(
    getInventoryCreationValuesReview(data.seed, [{ node: -1, value: 'bad' }]),
  ).rejects.toThrow();
  expect(fetch).not.toHaveBeenCalled();
});

it('does not retry a failed values review or turn it into a Save', async () => {
  const current = inventoryDraftForm();
  jest
    .mocked(fetch)
    .mockRejectedValue(new Error('QorliaQA Network unavailable'));
  await expect(
    getInventoryCreationValuesReview(current.seed, []),
  ).rejects.toThrow(/Network/);
  expect(fetch).toHaveBeenCalledTimes(1);
});

it('preserves session expiry without bypassing authentication', async () => {
  const current = inventoryDraftForm();
  jest.mocked(fetch).mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ error: { code: 100 } }),
  } as Response);
  await expect(
    getInventoryCreationValuesReview(current.seed, []),
  ).rejects.toBeInstanceOf(BillingSessionExpired);
  expect(fetch).toHaveBeenCalledTimes(1);
});
