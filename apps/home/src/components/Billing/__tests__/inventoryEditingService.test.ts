import {
  BillingSessionExpired,
  getInventoryDraftForm,
  previewInventoryDraftForm,
  getInventoryDraftFormChoices,
  getInventoryStoredForm,
  previewInventoryStoredForm,
  getInventoryStoredFormChoices,
  getInventoryStoredFormEffects,
} from '../billingService';
import {
  inventoryDraftForm,
  inventoryStoredForm,
  inventoryStoredPreview,
  inventoryFormChoices,
  inventoryEffectPage,
} from './inventoryFormFixture';

const reply = (result: unknown) =>
  jest.mocked(fetch).mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ result }),
  } as Response);
const params = () =>
  jest
    .mocked(fetch)
    .mock.calls.map((call) => JSON.parse(call[1]!.body as string).params);
const selection = () => {
  const data = inventoryStoredPreview();
  return {
    transfer_id: data.transfer_id,
    version: data.version,
    edits: data.edits,
  };
};
beforeEach(() => {
  global.fetch = jest.fn();
});

it('uses the seven named native draft/saved methods without adding an order or a save request', async () => {
  const draft = inventoryDraftForm(),
    current = inventoryStoredPreview(),
    exact = selection();
  reply(draft);
  await expect(getInventoryDraftForm()).resolves.toEqual(draft);
  reply(draft);
  await expect(previewInventoryDraftForm(draft.seed, [])).resolves.toEqual(
    draft,
  );
  const draftChoices = {
    version: draft.version,
    edits: [],
    page: inventoryFormChoices(),
  };
  reply(draftChoices);
  await expect(
    getInventoryDraftFormChoices(draft.seed, [], 3),
  ).resolves.toEqual(draftChoices);
  reply(inventoryStoredForm());
  await expect(getInventoryStoredForm(7)).resolves.toEqual(
    inventoryStoredForm(),
  );
  reply(current);
  await expect(previewInventoryStoredForm(exact)).resolves.toEqual(current);
  const chosen = {
    ...current,
    page: {
      ...inventoryFormChoices(),
      transfer_id: 7,
      form_version: current.form.version,
    },
  };
  reply(chosen);
  await expect(getInventoryStoredFormChoices(exact, 3)).resolves.toEqual(
    chosen,
  );
  reply(inventoryEffectPage());
  await expect(getInventoryStoredFormEffects(exact)).resolves.toEqual(
    inventoryEffectPage(),
  );
  const calls = params();
  expect(calls.map((call) => call.method)).toEqual(
    [
      'draft_load',
      'draft_onchange',
      'draft_choices',
      'edit_load',
      'edit_onchange',
      'edit_choices',
      'edit_effects',
    ].map((name) => 'qorlia_inventory_' + name),
  );
  expect(
    calls.every(
      (call) =>
        call.model === 'stock.picking' &&
        call.args.length === 0 &&
        !('order_id' in call.kwargs),
    ),
  ).toBe(true);
  expect(calls[1].kwargs).toEqual({ seed: draft.seed, edits: [] });
  expect(calls[5].kwargs).toEqual({ ...exact, node: 3, search: '', offset: 0 });
  expect(calls[6].kwargs).toEqual({
    ...exact,
    after: 0,
    effect_version: false,
    continuation_token: false,
    limit: 50,
  });
  expect(current.write_ready).toBe(false);
});
it('keeps signed defaults and ordered edits unchanged while accepting new native warnings/domains', async () => {
  const draft = inventoryDraftForm(),
    seed = JSON.parse(JSON.stringify(draft.seed));
  const edits = [
    { node: 2, value: 'First' },
    { node: 2, value: 'Second' },
  ];
  const result = { ...draft, edits, domains: { partner_id: [['id', '=', 4]] } };
  result.form.values.note = 'Second';
  result.form.version = 'd'.repeat(64);
  result.form.warning = {
    title: 'QorliaQA Warning',
    message: 'Review the contact',
  };
  reply(result);
  await expect(previewInventoryDraftForm(seed, edits)).resolves.toEqual(result);
  expect(params()[0].kwargs).toEqual({ seed, edits });
  expect(seed).toEqual(draft.seed);
});
it.each([
  'identity',
  'ready',
  'version',
  'signature',
  'seed',
  'edits',
  'form',
  'domains',
  'extra',
])('rejects an inconsistent draft replay: %s', async (kind) => {
  const data = inventoryDraftForm(),
    seed = JSON.parse(JSON.stringify(data.seed));
  if (kind === 'identity') data.form.transfer_id = 7;
  if (kind === 'ready') Object.assign(data, { write_ready: true });
  if (kind === 'version') data.version = 'f'.repeat(64);
  if (kind === 'signature') data.seed.signature = 'bad';
  if (kind === 'seed') data.seed.values.note = 'Replaced';
  if (kind === 'edits') data.edits = [{ node: 2, value: 'Unrequested' }];
  if (kind === 'form') data.form.values.id = 7;
  if (kind === 'domains') Object.assign(data, { domains: [] });
  if (kind === 'extra')
    Object.assign(data, { review_complete_token: 'e'.repeat(64) });
  reply(data);
  await expect(previewInventoryDraftForm(seed, [])).rejects.toThrow(
    /Invalid native transfer draft/,
  );
});
it.each([
  'seed-signature',
  'seed-extra',
  'seed-nonfinite',
  'seed-bound',
  'ledger-shape',
  'ledger-node',
  'ledger-nonfinite',
  'ledger-collection',
  'ledger-count',
  'ledger-bound',
  'identity',
])(
  'rejects malformed draft/ledger input before making a request: %s',
  async (kind) => {
    const seed = inventoryDraftForm().seed;
    let edits: unknown = [{ node: 2, value: 'Note' }];
    if (kind === 'seed-signature') seed.signature = 'bad';
    if (kind === 'seed-extra') Object.assign(seed, { author: 99 });
    if (kind === 'seed-nonfinite') seed.values.quantity = Infinity;
    if (kind === 'seed-bound') seed.values.note = 'x'.repeat(2_000_001);
    if (kind === 'ledger-shape')
      edits = [{ node: 2, value: 'Note', field: 'note' }];
    if (kind === 'ledger-node') edits = [{ node: true, value: 'Note' }];
    if (kind === 'ledger-nonfinite') edits = [{ node: 2, value: Infinity }];
    if (kind === 'ledger-collection')
      edits = [{ node: 1, value: [[4, 12, 0]] }];
    if (kind === 'ledger-count')
      edits = Array.from({ length: 101 }, () => ({ node: 2, value: 'Note' }));
    if (kind === 'ledger-bound')
      edits = [{ node: 2, value: 'x'.repeat(2_000_001) }];
    if (kind === 'identity') Object.assign(seed, { picking_type_id: true });
    await expect(
      previewInventoryDraftForm(seed, edits as never),
    ).rejects.toThrow();
    expect(fetch).not.toHaveBeenCalled();
  },
);
it.each(['version', 'edits', 'page'])(
  'rejects an inconsistent edited-draft search: %s',
  async (kind) => {
    const draft = inventoryDraftForm(),
      data = {
        version: draft.version,
        edits: [],
        page: inventoryFormChoices(),
      };
    if (kind === 'version') data.version = 'f'.repeat(64);
    if (kind === 'edits')
      Object.assign(data, { edits: [{ node: 2, value: 'Other' }] });
    if (kind === 'page') data.page.node = 2;
    reply(data);
    await expect(
      getInventoryDraftFormChoices(draft.seed, [], 3),
    ).rejects.toThrow();
  },
);
it.each([
  'identity',
  'version',
  'ready',
  'edits',
  'effect-version',
  'count',
  'form',
  'domains',
  'extra',
])('rejects inconsistent stored native replay: %s', async (kind) => {
  const data = inventoryStoredPreview();
  if (kind === 'identity') data.transfer_id = 8;
  if (kind === 'version') data.version = 'b'.repeat(64);
  if (kind === 'ready') Object.assign(data, { write_ready: true });
  if (kind === 'edits') data.edits = [];
  if (kind === 'effect-version') data.effect_version = 'bad';
  if (kind === 'count') data.effect_count = -1;
  if (kind === 'form') data.form.transfer_id = false;
  if (kind === 'domains') Object.assign(data, { domains: [] });
  if (kind === 'extra')
    Object.assign(data, { review_complete_token: 'e'.repeat(64) });
  reply(data);
  await expect(previewInventoryStoredForm(selection())).rejects.toThrow(
    /Invalid native saved-header replay/,
  );
});
it.each(['identity', 'version', 'form-version', 'ready', 'extra'])(
  'rejects invalid stored load: %s',
  async (kind) => {
    const data = inventoryStoredForm();
    if (kind === 'identity') data.transfer_id = 9;
    if (kind === 'version') data.version = 'bad';
    if (kind === 'form-version') data.form.version = 'f'.repeat(64);
    if (kind === 'ready') Object.assign(data, { write_ready: true });
    if (kind === 'extra') Object.assign(data, { receipt: 'not a save' });
    reply(data);
    await expect(getInventoryStoredForm(7)).rejects.toThrow(
      /Invalid saved native form/,
    );
  },
);
it.each(['version', 'field', 'readonly', 'node'])(
  'binds stored relation search to the edited native form: %s',
  async (kind) => {
    const current = inventoryStoredPreview(),
      data = {
        ...current,
        page: {
          ...inventoryFormChoices(),
          transfer_id: 7,
          form_version: current.form.version,
        },
      };
    if (kind === 'version') data.page.form_version = 'f'.repeat(64);
    if (kind === 'field') data.page.field = 'user_id';
    if (kind === 'readonly') data.form.layout[3].rules.readonly = true;
    if (kind === 'node') data.page.node = 2;
    reply(data);
    await expect(
      getInventoryStoredFormChoices(selection(), 3),
    ).rejects.toThrow();
  },
);
it('traverses exact effect pages without counting private audit entries or fabricating a save proof', async () => {
  reply(inventoryEffectPage(0, 2));
  const first = await getInventoryStoredFormEffects(
    selection(),
    0,
    false,
    false,
    2,
  );
  expect(first.effect_count).toBe(3);
  expect(first.effects.private_audit_counts['mail.message'].created).toBe(2);
  expect(first).not.toHaveProperty('review_complete_token');
  reply(inventoryEffectPage(2, 2));
  const last = await getInventoryStoredFormEffects(
    selection(),
    2,
    first.effect_version,
    first.continuation_token,
    2,
  );
  expect(params()[1].kwargs).toEqual({
    ...selection(),
    after: 2,
    effect_version: first.effect_version,
    continuation_token: first.continuation_token,
    limit: 2,
  });
  expect(last.next_after).toBe(false);
  expect(last.continuation_token).toBe(false);
  expect(fetch).toHaveBeenCalledTimes(2);
});
it.each([
  'after',
  'version',
  'count',
  'next',
  'token',
  'effects',
  'duplicate',
  'order',
  'label',
  'proof',
])('rejects incomplete or invalid effect inspection: %s', async (kind) => {
  const data = inventoryEffectPage(0, 2);
  if (kind === 'after') data.after = 1;
  if (kind === 'version') data.effect_version = 'bad';
  if (kind === 'count') data.effect_count = -1;
  if (kind === 'next') data.next_after = 3;
  if (kind === 'token') data.continuation_token = false;
  if (kind === 'effects') data.effects.updated['stock.move'] = [];
  if (kind === 'duplicate')
    data.effects.updated['stock.move'][1] =
      data.effects.updated['stock.move'][0];
  if (kind === 'order') data.effects.updated['stock.move'].reverse();
  if (kind === 'label') data.effects.labels['res.partner:99'] = 'Unrelated';
  if (kind === 'proof')
    Object.assign(data, { review_complete_token: 'a'.repeat(64) });
  reply(data);
  await expect(
    getInventoryStoredFormEffects(selection(), 0, false, false, 2),
  ).rejects.toThrow();
});
it('rejects an effect version swap on continuation', async () => {
  const data = inventoryEffectPage(2, 2);
  data.effect_version = 'f'.repeat(64);
  reply(data);
  await expect(
    getInventoryStoredFormEffects(
      selection(),
      2,
      'd'.repeat(64),
      'e'.repeat(64),
      2,
    ),
  ).rejects.toThrow();
});
it('rejects invalid stored scope and page inputs without a request', async () => {
  await expect(getInventoryStoredForm(0)).rejects.toThrow();
  await expect(
    previewInventoryStoredForm({ ...selection(), transfer_id: false } as never),
  ).rejects.toThrow();
  await expect(
    previewInventoryStoredForm({ ...selection(), order_id: 9 } as never),
  ).rejects.toThrow();
  await expect(
    getInventoryStoredFormChoices(selection(), 3, '', 100001),
  ).rejects.toThrow();
  await expect(getInventoryStoredFormEffects(selection(), 1)).rejects.toThrow();
  await expect(
    getInventoryStoredFormEffects(selection(), 0, 'd'.repeat(64)),
  ).rejects.toThrow();
  await expect(
    getInventoryStoredFormEffects(selection(), 0, false, false, 101),
  ).rejects.toThrow();
  expect(fetch).not.toHaveBeenCalled();
});
it('preserves session expiry across all seven calls', async () => {
  jest.mocked(fetch).mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ error: { code: 100 } }),
  } as Response);
  const draft = inventoryDraftForm();
  const calls = [
    () => getInventoryDraftForm(),
    () => previewInventoryDraftForm(draft.seed, []),
    () => getInventoryDraftFormChoices(draft.seed, [], 3),
    () => getInventoryStoredForm(7),
    () => previewInventoryStoredForm(selection()),
    () => getInventoryStoredFormChoices(selection(), 3),
    () => getInventoryStoredFormEffects(selection()),
  ];
  for (const call of calls)
    await expect(call()).rejects.toBeInstanceOf(BillingSessionExpired);
});
