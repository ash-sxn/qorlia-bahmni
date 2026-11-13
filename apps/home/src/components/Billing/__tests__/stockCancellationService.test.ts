import {
  BillingActionRejected,
  BillingSessionExpired,
  checkedPagedStockCancellationRequest,
  getPagedStockCancellation,
  getPagedStockCancellationReview,
  getPagedStockCancellationReferences,
  getPagedStockCancellationStatus,
  getPagedStockValidationReview,
  savePagedStockCancellation,
  stopPagedStockCancellation,
  checkedPagedStockConfirmationRequest,
  type PagedStockCancellationRequest,
  type PagedStockCancellationReview,
  type PagedStockCancellationStatus,
  type StockCancellationSelection,
} from '../billingService';
import { orderDeliveryPageFixture } from './orderDeliveryFixture';
import { privateAnalyticReview } from './stockCancellationPagedFixture';
import { pagedValidationEffectPage } from './stockValidationPagedFixture';

const selection = (): StockCancellationSelection => ({
  order_id: 9,
  transfer_id: 11,
  version: 'a'.repeat(64),
  action: 'cancel_transfer',
});
const request = (): PagedStockCancellationRequest => ({
  ...selection(),
  review_version: 'b'.repeat(64),
  review_complete_token: 'c'.repeat(64),
  request_key: '11111111-2222-4333-8444-555555555555',
});
const transfer = () => ({
  ...orderDeliveryPageFixture().rows[0],
  move_count: 501,
  operation_count: 2001,
});
const loaded = () => ({
  order_id: 9,
  transfer_id: 11,
  version: selection().version,
  transfer: transfer(),
  reason: false,
  write_ready: true,
});
const review = (): PagedStockCancellationReview => ({
  ...selection(),
  review_version: request().review_version,
  state_after: 'cancel',
  write_ready: true,
  after: 0,
  total_count: 1,
  next_after: false,
  continuation_token: false,
  review_complete_token: request().review_complete_token,
  effects: {
    created: { 'stock.picking': [] },
    updated: {
      'stock.picking': [
        { id: 11, before: { state: 'assigned' }, after: { state: 'cancel' } },
      ],
    },
    deleted: { 'stock.picking': [] },
    labels: {},
    schema: {
      'stock.picking': {
        state: { label: 'Status', type: 'selection', relation: false },
      },
    },
    private_effect_counts: {},
  },
});
const outcome = (): PagedStockCancellationStatus => ({
  accepted: true,
  stopped: false,
  request_key: request().request_key,
  state_after: 'cancel',
  reference_count: 0,
  current: {
    order_id: 9,
    transfer_id: 11,
    version: 'd'.repeat(64),
    transfer: { ...transfer(), state: 'cancel', operation_count: 0 },
  },
});
const pending = (stopped = false): PagedStockCancellationStatus => ({
  ...outcome(),
  accepted: false,
  stopped,
  state_after: false,
  reference_count: 0,
});
const references = () => ({
  request_key: request().request_key,
  version: 'e'.repeat(64),
  after: 0,
  total_count: 0,
  next_after: false,
  rows: [],
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

it('uses all six fixed cancellation APIs for an orderless transfer', async () => {
  const exact = { ...request(), order_id: false as const };
  const selected = { ...selection(), order_id: false as const };
  reply({ ...loaded(), order_id: false });
  await getPagedStockCancellation(false, 11);
  reply({ ...review(), order_id: false });
  await getPagedStockCancellationReview(selected);
  const result = {
    ...outcome(),
    current: { ...outcome().current, order_id: false as const },
  };
  for (const call of [
    savePagedStockCancellation,
    getPagedStockCancellationStatus,
    stopPagedStockCancellation,
  ]) {
    reply(result);
    expect(await call(exact)).toEqual(result);
  }
  reply(references());
  await getPagedStockCancellationReferences(exact);
  const calls = jest
    .mocked(fetch)
    .mock.calls.map((call) => JSON.parse(call[1]!.body as string).params);
  expect(calls.map((call) => call.method)).toEqual(
    ['load', 'review', 'save', 'status', 'stop', 'references'].map(
      (name) => 'qorlia_cancellation_paged_' + name,
    ),
  );
  expect(calls[0].kwargs).toEqual({ order_id: false, transfer_id: 11 });
  for (const call of calls.slice(1))
    expect(call.kwargs.payload.order_id).toBe(false);
});
it('rejects orderless lookalikes and changed global/order response scopes', async () => {
  for (const order_id of [0, true, null, '', [], {}, -1]) {
    await expect(
      getPagedStockCancellation(order_id as never, 11),
    ).rejects.toThrow();
    expect(() =>
      checkedPagedStockCancellationRequest({ ...request(), order_id } as never),
    ).toThrow();
  }
  expect(fetch).not.toHaveBeenCalled();
  reply(outcome());
  await expect(
    getPagedStockCancellationStatus({ ...request(), order_id: false }),
  ).rejects.toThrow();
  reply({ ...outcome(), current: { ...outcome().current, order_id: false } });
  await expect(getPagedStockCancellationStatus(request())).rejects.toThrow();
});

it('loads compact native cancellation state including large counts and native unavailability', async () => {
  reply(loaded());
  expect(await getPagedStockCancellation(9, 11)).toEqual(loaded());
  expect(jest.mocked(fetch).mock.calls[0][0]).toMatch(
    /qorlia_cancellation_paged_load$/,
  );
  reply({ ...loaded(), reason: 'Native write is denied', write_ready: false });
  expect((await getPagedStockCancellation(9, 11)).write_ready).toBe(false);
});
it.each([
  { order_id: 10 },
  { transfer_id: 12 },
  { version: 'bad' },
  { transfer: { ...transfer(), id: 12 } },
  { reason: false, write_ready: false },
  { context: { uid: 1 } },
])('rejects inconsistent load metadata %j', async (change) => {
  reply({ ...loaded(), ...change });
  await expect(getPagedStockCancellation(9, 11)).rejects.toThrow(/Invalid/);
});
it('keeps cancellation action and exact completion proof without making it an older confirmation', () => {
  expect(checkedPagedStockCancellationRequest(request())).toEqual(request());
  // @ts-expect-error Runtime input must also reject another stock protocol.
  expect(() => checkedPagedStockConfirmationRequest(request())).toThrow(
    /exact/,
  );
  expect(fetch).not.toHaveBeenCalled();
});
it.each([
  { action: 'cancel' },
  { action: 'unreserve' },
  { order_id: true },
  { transfer_id: 0 },
  { version: 'bad' },
  { review_complete_token: false },
  { review_version: 'bad' },
  { request_key: 'bad' },
  { context: { uid: 1 } },
])('rejects malformed cancellation before transport %j', async (change) => {
  await expect(
    savePagedStockCancellation({
      ...request(),
      ...change,
    } as PagedStockCancellationRequest),
  ).rejects.toThrow();
  expect(fetch).not.toHaveBeenCalled();
});
it('uses ordered effect pages and a distinct terminal proof through the actual SDK', async () => {
  reply(review());
  expect(await getPagedStockCancellationReview(selection())).toEqual(review());
  const [route, options] = jest.mocked(fetch).mock.calls[0];
  expect(route).toMatch(/qorlia_cancellation_paged_review$/);
  expect(JSON.parse(String(options?.body)).params).toEqual({
    model: 'stock.picking',
    method: 'qorlia_cancellation_paged_review',
    args: [],
    kwargs: {
      payload: selection(),
      after: 0,
      review_version: false,
      continuation_token: false,
      limit: 50,
    },
  });
  reply({
    ...review(),
    total_count: 2,
    next_after: 1,
    continuation_token: 'd'.repeat(64),
    review_complete_token: false,
  });
  expect(
    (await getPagedStockCancellationReview(selection(), 0, false, false, 1))
      .next_after,
  ).toBe(1);
  reply({ ...review(), after: 1, total_count: 2 });
  expect(
    (
      await getPagedStockCancellationReview(
        selection(),
        1,
        request().review_version,
        'd'.repeat(64),
        1,
      )
    ).review_complete_token,
  ).toBe(request().review_complete_token);
});
it.each([
  { action: 'unreserve' },
  { version: 'f'.repeat(64) },
  { state_after: 'unknown' },
  { write_ready: false },
  { after: 1 },
  { total_count: 2 },
  { next_after: 1 },
  { continuation_token: 'd'.repeat(64) },
  { review_complete_token: false },
  {
    effects: {
      ...review().effects,
      labels: { 'res.users:1': 'Hidden administrator' },
    },
  },
  {
    effects: {
      ...review().effects,
      private_effect_counts: {
        'account.analytic.line': { created: 0, updated: 0, deleted: -1 },
      },
    },
  },
])('rejects incomplete or corrupt review response %j', async (change) => {
  reply({ ...review(), ...change });
  await expect(getPagedStockCancellationReview(selection())).rejects.toThrow();
});
it.each<{
  after: number;
  version: string | false;
  token: string | false;
}>([
  { after: -1, version: false, token: false },
  { after: 1, version: false, token: false },
  { after: 0, version: 'a'.repeat(64), token: false },
])(
  'rejects invalid review cursor before transport %j',
  async ({ after, version, token }) => {
    await expect(
      getPagedStockCancellationReview(selection(), after, version, token),
    ).rejects.toThrow();
    expect(fetch).not.toHaveBeenCalled();
  },
);
it.each([
  { name: 'save', call: savePagedStockCancellation },
  { name: 'status', call: getPagedStockCancellationStatus },
  { name: 'stop', call: stopPagedStockCancellation },
])(
  'sends exact seven-key $name and accepts native compact recovery',
  async ({ name, call }) => {
    reply(outcome());
    expect(await call(request())).toEqual(outcome());
    const [route, options] = jest.mocked(fetch).mock.calls[0];
    expect(route).toMatch(new RegExp(`qorlia_cancellation_paged_${name}$`));
    expect(JSON.parse(String(options?.body)).params.kwargs).toEqual({
      payload: request(),
    });
  },
);
it('distinguishes unknown, stopped and accepted outcomes and never infers acknowledged writes', async () => {
  for (const stopped of [false, true]) {
    reply(pending(stopped));
    expect(await getPagedStockCancellationStatus(request())).toEqual(
      pending(stopped),
    );
    reply(pending(stopped));
    await expect(savePagedStockCancellation(request())).rejects.toThrow(
      /not acknowledged/,
    );
  }
  reply(pending(true));
  expect(await stopPagedStockCancellation(request())).toEqual(pending(true));
  reply(pending());
  await expect(stopPagedStockCancellation(request())).rejects.toThrow(
    /not acknowledged/,
  );
});
it.each([
  { accepted: true, stopped: true },
  { accepted: false },
  { state_after: false },
  { reference_count: -1 },
  { request_key: 'foreign' },
  { current: { ...outcome().current, order_id: 10 } },
  { current: { ...outcome().current, version: 'bad' } },
])('rejects mismatched saved outcome %j', async (change) => {
  reply({ ...outcome(), ...change });
  await expect(getPagedStockCancellationStatus(request())).rejects.toThrow(
    /Invalid/,
  );
});
it('reads pinned saved references even when cancellation creates no new business records', async () => {
  reply(references());
  expect(await getPagedStockCancellationReferences(request())).toEqual(
    references(),
  );
  const [route, options] = jest.mocked(fetch).mock.calls[0];
  expect(route).toMatch(/qorlia_cancellation_paged_references$/);
  expect(JSON.parse(String(options?.body)).params.kwargs).toEqual({
    payload: request(),
    after: 0,
    version: false,
    limit: 50,
  });
});
it.each([
  { request_key: 'foreign' },
  { version: 'bad' },
  { after: 1 },
  { total_count: 1 },
  { next_after: 1 },
  {
    rows: [
      {
        key: 'new:res.users:0',
        model: 'res.users',
        id: 1,
        name: 'Hidden',
        available: true,
      },
    ],
  },
])('rejects invalid saved references %j', async (change) => {
  reply({ ...references(), ...change });
  await expect(getPagedStockCancellationReferences(request())).rejects.toThrow(
    /Invalid/,
  );
});
it('keeps a deleted private analytic reference explicit, never converting it to a missing value or identifier', async () => {
  const page = privateAnalyticReview();
  reply(page);
  const data = await getPagedStockCancellationReview(selection());
  expect(data).toEqual(page);
  expect(
    data.effects.updated['stock.move'][0].before.analytic_account_line_id,
  ).toBe('private:account.analytic.line');
  expect(
    data.effects.updated['stock.move'][0].after.analytic_account_line_id,
  ).toBe(false);
});
it.each([
  'target',
  'identifier',
  'field',
  'model',
  'counts',
  'multiplicity',
  'after',
  'retained',
  'relation',
  'created',
  'deleted',
])(
  'rejects a private cancellation reference outside its native deletion context: %s',
  async (kind) => {
    const page = privateAnalyticReview();
    const schema = page.effects.schema['stock.move'];
    const row = page.effects.updated['stock.move'][0];
    if (kind === 'target')
      row.before.analytic_account_line_id = 'private:res.users';
    if (kind === 'identifier')
      row.before.analytic_account_line_id = 'private:account.analytic.line:1';
    if (kind === 'field') {
      schema.wrong_field = schema.analytic_account_line_id;
      row.before.wrong_field = row.before.analytic_account_line_id;
    }
    if (kind === 'model') {
      page.effects.schema['stock.picking'] = schema;
      page.effects.created['stock.picking'] =
        page.effects.created['stock.move'];
      page.effects.updated['stock.picking'] =
        page.effects.updated['stock.move'];
      page.effects.deleted['stock.picking'] =
        page.effects.deleted['stock.move'];
      delete page.effects.schema['stock.move'];
      delete page.effects.created['stock.move'];
      delete page.effects.updated['stock.move'];
      delete page.effects.deleted['stock.move'];
    }
    if (kind === 'counts') page.effects.private_effect_counts = {};
    if (kind === 'after')
      row.after.analytic_account_line_id = row.before.analytic_account_line_id;
    if (kind === 'retained') row.after.analytic_account_line_id = 10;
    if (kind === 'relation')
      schema.analytic_account_line_id.relation = 'res.users';
    if (kind === 'created') {
      page.effects.updated['stock.move'] = [];
      page.effects.created['stock.move'] = [
        { key: 'new:stock.move:0', values: row.before, assigned_on_save: [] },
      ];
    }
    if (kind === 'deleted') {
      page.effects.updated['stock.move'] = [];
      page.effects.deleted['stock.move'] = [{ id: row.id, values: row.before }];
    }
    if (kind === 'multiplicity') {
      schema.analytic_account_line_id.type = 'many2many';
      row.before.analytic_account_line_id = ['private:account.analytic.line'];
      row.after.analytic_account_line_id = [];
    }
    reply(page);
    await expect(getPagedStockCancellationReview(selection())).rejects.toThrow(
      /Invalid/,
    );
  },
);
it('does not permit cancellation-only private reference markers through the validation protocol', async () => {
  const input = {
    order_id: selection().order_id,
    transfer_id: selection().transfer_id,
    version: selection().version,
    decisions: [],
    continuation_key: false as const,
  };
  const page = pagedValidationEffectPage(input, 0, 1);
  page.effects = privateAnalyticReview().effects;
  reply(page);
  await expect(getPagedStockValidationReview(input)).rejects.toThrow(/Invalid/);
});
it('preserves native session expiry, rejection and unknown transport errors', async () => {
  jest.mocked(fetch).mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ error: { code: 100 } }),
  } as Response);
  await expect(savePagedStockCancellation(request())).rejects.toBeInstanceOf(
    BillingSessionExpired,
  );
  jest.mocked(fetch).mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({
      error: {
        data: {
          name: 'odoo.exceptions.UserError',
          arguments: ['Native refusal'],
        },
      },
    }),
  } as Response);
  await expect(savePagedStockCancellation(request())).rejects.toBeInstanceOf(
    BillingActionRejected,
  );
  jest.mocked(fetch).mockRejectedValue(new Error('Response lost'));
  await expect(savePagedStockCancellation(request())).rejects.toThrow(
    'Response lost',
  );
});
