import {
  BillingSessionExpired,
  getInventoryStoredSaveReview,
  type InventoryStoredSaveReview,
} from '../billingService';
import {
  inventoryEffectPage,
  inventoryStoredPreview,
} from './inventoryFormFixture';

const selection = () => {
  const data = inventoryStoredPreview();
  return {
    transfer_id: data.transfer_id,
    version: data.version,
    edits: data.edits,
  };
};
const result = (after = 0, limit = 50): InventoryStoredSaveReview => {
  const { effect_version, ...data } = inventoryEffectPage(after, limit);
  return {
    ...data,
    write_ready: true,
    review_complete_token: data.next_after === false ? 'e'.repeat(64) : false,
    review_version: effect_version,
    state_after: 'draft',
    changed_fields: ['note'],
  };
};
const reply = (data: unknown) =>
  jest.mocked(fetch).mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ result: data }),
  } as Response);
beforeEach(() => {
  global.fetch = jest.fn();
});
it('uses the complete save-review method without saving or upgrading an onchange token', async () => {
  reply(result());
  await expect(getInventoryStoredSaveReview(selection())).resolves.toEqual(
    result(),
  );
  const [url, options] = jest.mocked(fetch).mock.calls[0];
  expect(url).toContain('/stock.picking/qorlia_inventory_edit_save_review');
  expect(JSON.parse(options!.body as string).params).toEqual({
    model: 'stock.picking',
    method: 'qorlia_inventory_edit_save_review',
    args: [],
    kwargs: {
      ...selection(),
      after: 0,
      review_version: false,
      continuation_token: false,
      limit: 50,
    },
  });
  expect(result().write_ready).toBe(true);
  expect(result().review_complete_token).toBe('e'.repeat(64));
});
it('retains native preparation and terminal-note outcomes instead of assuming every save stays draft', async () => {
  for (const state_after of [
    'waiting',
    'confirmed',
    'assigned',
    'done',
    'cancel',
  ] as const) {
    const data = { ...result(), state_after };
    reply(data);
    await expect(getInventoryStoredSaveReview(selection())).resolves.toEqual(
      data,
    );
  }
});
it('retains private follower audit counts without exposing follower rows or changing public effect counts', async () => {
  const data = result();
  data.effects.private_audit_counts['mail.followers'] = {
    created: 1,
    updated: 0,
    deleted: 1,
  };
  reply(data);
  await expect(getInventoryStoredSaveReview(selection())).resolves.toEqual(
    data,
  );
  expect(data.effect_count).toBe(3);
  expect(data.effects.schema).not.toHaveProperty('mail.followers');
  data.effects.private_audit_counts['mail.followers'].created = -1;
  reply(data);
  await expect(getInventoryStoredSaveReview(selection())).rejects.toThrow();
});
it('traverses complete effects with the dedicated save-review version and cursor', async () => {
  reply(result(0, 2));
  const first = await getInventoryStoredSaveReview(
    selection(),
    0,
    false,
    false,
    2,
  );
  reply(result(2, 2));
  const last = await getInventoryStoredSaveReview(
    selection(),
    2,
    first.review_version,
    first.continuation_token,
    2,
  );
  const params = JSON.parse(
    jest.mocked(fetch).mock.calls[1][1]!.body as string,
  ).params;
  expect(params.kwargs).toEqual({
    ...selection(),
    after: 2,
    review_version: first.review_version,
    continuation_token: first.continuation_token,
    limit: 2,
  });
  expect(last.next_after).toBe(false);
  expect(fetch).toHaveBeenCalledTimes(2);
});
it.each([
  'scope',
  'ready',
  'version',
  'edits',
  'state',
  'form',
  'fields',
  'identity-field',
  'count',
  'page',
  'token',
  'effects',
  'onchange',
  'proof',
])('rejects an invalid or incomplete full-save review: %s', async (kind) => {
  const data = result(0, 2);
  if (kind === 'scope') data.transfer_id = 8;
  if (kind === 'ready') Object.assign(data, { write_ready: false });
  if (kind === 'version') data.review_version = 'bad';
  if (kind === 'edits') data.edits = [];
  if (kind === 'state') Object.assign(data, { state_after: 'unknown' });
  if (kind === 'form') data.form.transfer_id = false;
  if (kind === 'fields') data.changed_fields = ['missing'];
  if (kind === 'identity-field') data.changed_fields = ['id'];
  if (kind === 'count') data.effect_count = -1;
  if (kind === 'page') data.next_after = 3;
  if (kind === 'token') data.continuation_token = false;
  if (kind === 'effects') data.effects.updated['stock.move'] = [];
  if (kind === 'onchange')
    Object.assign(data, { effect_version: 'a'.repeat(64) });
  if (kind === 'proof')
    Object.assign(data, { review_complete_token: 'a'.repeat(64) });
  reply(data);
  await expect(
    getInventoryStoredSaveReview(selection(), 0, false, false, 2),
  ).rejects.toThrow();
});
it('rejects invalid original selections and cursor inputs before any request', async () => {
  await expect(
    getInventoryStoredSaveReview({
      ...selection(),
      transfer_id: false,
    } as never),
  ).rejects.toThrow();
  await expect(getInventoryStoredSaveReview(selection(), 1)).rejects.toThrow();
  await expect(
    getInventoryStoredSaveReview(selection(), 0, 'd'.repeat(64)),
  ).rejects.toThrow();
  await expect(
    getInventoryStoredSaveReview(selection(), 0, false, false, 101),
  ).rejects.toThrow();
  expect(fetch).not.toHaveBeenCalled();
});
it('propagates session expiry instead of treating uninspected effects as a successful review', async () => {
  jest.mocked(fetch).mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ error: { code: 100 } }),
  } as Response);
  await expect(
    getInventoryStoredSaveReview(selection()),
  ).rejects.toBeInstanceOf(BillingSessionExpired);
});
