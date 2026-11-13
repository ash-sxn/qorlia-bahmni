import {
  BillingSessionExpired,
  getInventoryNativeForm,
  getInventoryNativeFormChoices,
} from '../billingService';
import {
  inventoryForm as fixture,
  inventoryFormChoices as choices,
} from './inventoryFormFixture';

const reply = (result: unknown) =>
  jest.mocked(fetch).mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ result }),
  } as Response);
beforeEach(() => {
  global.fetch = jest.fn();
});

it.each([false, 7] as const)(
  'uses the named native form reader for identity %s without a fake order',
  async (id) => {
    const data = fixture(id);
    reply(data);
    await expect(getInventoryNativeForm(id)).resolves.toEqual(data);
    const [url, options] = jest.mocked(fetch).mock.calls[0];
    expect(url).toContain('/stock.picking/qorlia_inventory_form_load');
    expect(JSON.parse(options!.body as string).params).toEqual({
      model: 'stock.picking',
      method: 'qorlia_inventory_form_load',
      args: [],
      kwargs: { transfer_id: id, picking_type_id: false },
    });
  },
);
it('preserves native presentation, rich text, separate labels and unsupported fields without evaluating expressions', async () => {
  const data = fixture();
  data.fields.payload = { type: 'json', string: 'Native extension' };
  data.unsupported = ['payload'];
  data.layout.push({ ...data.layout[2], field: 'payload' });
  data.values.note = '<p>' + 'n'.repeat(12000) + '</p>';
  data.layout[3].domain = "[('company_id', '=', company_id)]";
  data.layout[3].context = "{'default_company_id': company_id}";
  data.layout[3].attributes = {
    widget: 'many2one',
    options: "{'no_create': True}",
  };
  data.layout[3].ancestor_modifiers = [{ invisible: [['state', '=', 'done']] }];
  data.label_nodes.push({
    target: 'partner_id',
    label: 'Delivery contact',
    visible: true,
    modifiers: {},
    ancestor_modifiers: [],
    containers: [],
  });
  reply(data);
  await expect(getInventoryNativeForm()).resolves.toEqual(data);
});
it.each([
  'identity',
  'readonly',
  'version',
  'timezone',
  'fields',
  'missing-value',
  'collection-leak',
  'label',
  'missing-label',
  'node',
  'rule',
  'attribute',
  'warning',
  'number',
  'extra',
])('rejects a malformed native form: %s', async (kind) => {
  const data = fixture();
  if (kind === 'identity') data.transfer_id = 9;
  if (kind === 'readonly') Object.assign(data, { read_only: false });
  if (kind === 'version') data.version = 'bad';
  if (kind === 'timezone') data.timezone = 'Invalid/Zone';
  if (kind === 'fields') delete data.fields.partner_id;
  if (kind === 'missing-value') delete data.values.note;
  if (kind === 'collection-leak') data.values.move_ids = [8];
  if (kind === 'label') data.labels.partner_id = [5, 'Other contact'];
  if (kind === 'missing-label') delete data.labels.partner_id;
  if (kind === 'node') data.layout[0].field = 'missing';
  if (kind === 'rule') Object.assign(data.layout[0].rules, { visible: 'yes' });
  if (kind === 'attribute') data.layout[0].attributes = { script: 'execute()' };
  if (kind === 'warning') Object.assign(data, { warning: [] });
  if (kind === 'number') data.values.partner_id = Infinity;
  if (kind === 'extra') Object.assign(data, { write_ready: true });
  reply(data);
  await expect(getInventoryNativeForm()).rejects.toThrow(
    /Invalid native transfer form/,
  );
});
it('keeps a new operation type distinct from a saved transfer', async () => {
  const data = fixture();
  data.picking_type_id = 3;
  data.fields.picking_type_id = {
    type: 'many2one',
    string: 'Operation type',
    relation: 'stock.picking.type',
  };
  data.layout.push({ ...data.layout[3], field: 'picking_type_id' });
  data.values.picking_type_id = 3;
  data.labels.picking_type_id = [3, 'QorliaQA Receipt'];
  reply(data);
  await expect(getInventoryNativeForm(false, 3)).resolves.toEqual(data);
  await expect(getInventoryNativeForm(7, 3)).rejects.toThrow(
    /Choose a saved transfer/,
  );
  expect(fetch).toHaveBeenCalledTimes(1);
});
it('searches native relations by exact node, preserving the search text and offset', async () => {
  const data = { ...choices(), offset: 25 };
  reply(data);
  await expect(
    getInventoryNativeFormChoices(false, false, 3, ' Contact ', 25),
  ).resolves.toEqual(data);
  const [url, options] = jest.mocked(fetch).mock.calls[0];
  expect(url).toContain('/stock.picking/qorlia_inventory_form_choices');
  expect(JSON.parse(options!.body as string).params.kwargs).toEqual({
    transfer_id: false,
    picking_type_id: false,
    node: 3,
    search: ' Contact ',
    offset: 25,
  });
});
it.each([
  'identity',
  'type',
  'node',
  'offset',
  'version',
  'rows',
  'duplicate',
  'more',
  'extra',
])('rejects incoherent relation search results: %s', async (kind) => {
  const data = choices();
  if (kind === 'identity') Object.assign(data, { transfer_id: 7 });
  if (kind === 'type') Object.assign(data, { picking_type_id: 8 });
  if (kind === 'node') data.node = 4;
  if (kind === 'offset') data.offset = 25;
  if (kind === 'version') data.form_version = 'bad';
  if (kind === 'rows') data.rows = [[0, 'Invalid']];
  if (kind === 'duplicate') data.rows.push(data.rows[0]);
  if (kind === 'more') data.has_more = true;
  if (kind === 'extra') Object.assign(data, { secret: 'hidden' });
  reply(data);
  await expect(getInventoryNativeFormChoices(false, false, 3)).rejects.toThrow(
    /Invalid native relation/,
  );
});
it('rejects invalid identities and searches before any request', async () => {
  await expect(getInventoryNativeForm(0)).rejects.toThrow();
  await expect(getInventoryNativeForm(false, -1)).rejects.toThrow();
  await expect(
    getInventoryNativeFormChoices(false, false, -1),
  ).rejects.toThrow();
  await expect(
    getInventoryNativeFormChoices(false, false, 0, 'x'.repeat(201)),
  ).rejects.toThrow();
  await expect(
    getInventoryNativeFormChoices(false, false, 0, '', 100001),
  ).rejects.toThrow();
  expect(fetch).not.toHaveBeenCalled();
});
it('preserves session expiry for both form readers instead of returning an empty form', async () => {
  jest.mocked(fetch).mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ error: { code: 100 } }),
  } as Response);
  await expect(getInventoryNativeForm()).rejects.toBeInstanceOf(
    BillingSessionExpired,
  );
  await expect(
    getInventoryNativeFormChoices(false, false, 3),
  ).rejects.toBeInstanceOf(BillingSessionExpired);
});
