import {
  BillingActionRejected,
  BillingSessionExpired,
  changePagedStockOperationForm,
  checkedPagedStockOperationRequest,
  checkedStockOperationRequest,
  getPagedStockOperationForm,
  getPagedStockOperationReferences,
  getPagedStockOperationReview,
  getPagedStockOperationStatus,
  PagedStockConfirmationReferences,
  PagedStockOperationRequest,
  PagedStockOperationReview,
  PagedStockOperationStatus,
  savePagedStockOperation,
  StockOperationSelection,
  StockOperationSelectionRequest,
} from '../billingService';
import { orderDeliveryPageFixture } from './orderDeliveryFixture';
import {
  operationForm,
  operationRequest,
  operationSelection,
  operationSelectionRequest,
} from './stockOperationFixture';

const formRequest = () => ({
  ...operationSelection(),
  version: 'a'.repeat(64),
  edits: operationSelectionRequest().edits,
});

const request = (): PagedStockOperationRequest => ({
  ...operationRequest(),
  review_complete_token: 'd'.repeat(64),
});
const review = (after = 0, limit = 50): PagedStockOperationReview => {
  const rows = [13, 14, 15].slice(after, after + limit);
  const more = after + rows.length < 3;
  return {
    ...operationSelectionRequest(),
    form: operationForm(),
    review_version: 'b'.repeat(64),
    state_after: 'assigned',
    operation_key: 13,
    write_ready: true,
    after,
    total_count: 3,
    next_after: more ? after + rows.length : false,
    continuation_token: more ? 'c'.repeat(64) : false,
    review_complete_token: more ? false : 'd'.repeat(64),
    effects: {
      created: { 'stock.move.line': [] },
      deleted: { 'stock.move.line': [] },
      updated: {
        'stock.move.line': rows.map((id) => ({
          id,
          before: { qty_done: 0 },
          after: { qty_done: 2 },
        })),
      },
      labels: {},
      schema: {
        'stock.move.line': {
          qty_done: { label: 'Done', type: 'float', relation: false },
        },
      },
      private_audit_counts: {},
    },
  };
};
const status = (accepted = true): PagedStockOperationStatus => {
  const header = orderDeliveryPageFixture().rows[0];
  return {
    accepted,
    request_key: request().request_key,
    action: 'save',
    operation_id: accepted ? 13 : false,
    state_after: accepted ? 'assigned' : false,
    reference_count: 0,
    current: {
      order_id: 9,
      transfer_id: 11,
      version: 'e'.repeat(64),
      transfer: { ...header, move_count: 501, operation_count: 2001 },
    },
  };
};
const references = (): PagedStockConfirmationReferences => ({
  request_key: request().request_key,
  version: 'e'.repeat(64),
  after: 0,
  total_count: 1,
  next_after: false,
  rows: [
    {
      key: 'new:stock.move.line:0',
      model: 'stock.move.line',
      id: 77,
      name: 'QorliaQA Operation',
      available: true,
    },
  ],
});
const reply = (result: unknown) =>
  (fetch as jest.Mock).mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ result }),
  });
const params = () =>
  (fetch as jest.Mock).mock.calls.map(
    (call) => JSON.parse(call[1].body).params,
  );

describe('Complete paged operation API boundary', () => {
  beforeEach(() => {
    global.fetch = jest.fn();
  });
  it('uses six named APIs, existing form shape and exact completion-proof payloads', async () => {
    reply(operationForm());
    expect(await getPagedStockOperationForm(operationSelection())).toEqual(
      operationForm(),
    );
    expect(await changePagedStockOperationForm(formRequest())).toEqual(
      operationForm(),
    );
    reply(review());
    expect(
      await getPagedStockOperationReview(operationSelectionRequest()),
    ).toEqual(review());
    reply(status());
    expect(await savePagedStockOperation(request())).toEqual(status());
    expect(await getPagedStockOperationStatus(request())).toEqual(status());
    reply(references());
    expect(await getPagedStockOperationReferences(request())).toEqual(
      references(),
    );
    expect(params().map((item) => item.method)).toEqual(
      ['load', 'onchange', 'review', 'save', 'status', 'references'].map(
        (action) => `qorlia_operation_paged_${action}`,
      ),
    );
    expect(params()[3].kwargs).toEqual({ payload: request() });
    expect(checkedPagedStockOperationRequest(request())).toEqual(request());
    expect(() => checkedStockOperationRequest(request())).toThrow();
    for (const item of params()) {
      expect(item.model).toBe('stock.picking');
      expect(item.args).toEqual([]);
    }
  });
  it('preserves native readonly and warning rules, but rejects changed onchange versions', async () => {
    const form = {
      ...operationForm(),
      reason: 'Native read-only',
      write_ready: false,
      can_delete: false,
      warning: 'Native warning',
    };
    reply(form);
    expect(await getPagedStockOperationForm(operationSelection())).toEqual(
      form,
    );
    reply({ ...form, version: 'f'.repeat(64) });
    await expect(changePagedStockOperationForm(formRequest())).rejects.toThrow(
      'version changed',
    );
  });
  it('keeps source selections exact and rejects contexts before transmitting', async () => {
    await expect(
      getPagedStockOperationForm({
        ...operationSelection(),
        context: {},
      } as StockOperationSelection),
    ).rejects.toThrow();
    await expect(
      changePagedStockOperationForm({ ...operationSelectionRequest() }),
    ).rejects.toThrow();
    await expect(
      getPagedStockOperationReview({
        ...operationSelectionRequest(),
        context: {},
      } as StockOperationSelectionRequest),
    ).rejects.toThrow();
    expect(fetch).not.toHaveBeenCalled();
  });
  it.each([
    { review_complete_token: false },
    { review_complete_token: 'bad' },
    { context: {} },
    { request_key: 'bad' },
    { move_id: true },
    { operation_id: true },
    { action: 'delete' },
    { edits: [{ field: 'qty_done', value: NaN }] },
  ])('rejects malformed exact saves before HTTP: %j', async (change) => {
    await expect(
      savePagedStockOperation({
        ...request(),
        ...change,
      } as PagedStockOperationRequest),
    ).rejects.toThrow();
    expect(fetch).not.toHaveBeenCalled();
  });
  it('retains sequential cursors and never manufactures a completion proof', async () => {
    reply(review(0, 1));
    const first = await getPagedStockOperationReview(
      operationSelectionRequest(),
      0,
      false,
      false,
      1,
    );
    expect(first.review_complete_token).toBe(false);
    reply(review(1, 1));
    expect(
      await getPagedStockOperationReview(
        operationSelectionRequest(),
        1,
        first.review_version,
        first.continuation_token,
        1,
      ),
    ).toEqual(review(1, 1));
    reply(review(2, 1));
    expect(
      (
        await getPagedStockOperationReview(
          operationSelectionRequest(),
          2,
          first.review_version,
          first.continuation_token,
          1,
        )
      ).review_complete_token,
    ).toBe('d'.repeat(64));
  });
  it.each([
    { order_id: 99 },
    { move_id: 99 },
    { operation_key: 99 },
    { state_after: 'done' },
    { write_ready: false },
    { version: 'f'.repeat(64) },
    { review_version: 'bad' },
    { total_count: 2 },
    { next_after: 3 },
    { review_complete_token: false },
    { continuation_token: 'c'.repeat(64) },
    { effects: {} },
    { edits: [] },
    { form: { ...operationForm(), version: 'f'.repeat(64) } },
    { form: { ...operationForm(), write_ready: false } },
  ])(
    'rejects malformed reviews without accepting their proof: %j',
    async (change) => {
      reply({ ...review(), ...change });
      await expect(
        getPagedStockOperationReview(operationSelectionRequest()),
      ).rejects.toThrow();
    },
  );
  it('accepts new-operation virtual identity and removal without inventing a saved ID', async () => {
    const selection = {
      ...operationSelectionRequest(),
      operation_id: false as const,
    };
    reply({
      ...review(),
      operation_id: false,
      operation_key: 'new:stock.move.line:0',
      form: { ...operationForm(), operation_id: false },
    });
    expect((await getPagedStockOperationReview(selection)).operation_key).toBe(
      'new:stock.move.line:0',
    );
    const removal = {
      ...operationSelectionRequest(),
      action: 'delete' as const,
      edits: [],
    };
    reply({ ...review(), action: 'delete', edits: [], operation_key: false });
    expect((await getPagedStockOperationReview(removal)).operation_key).toBe(
      false,
    );
    reply({ ...status(), action: 'delete', operation_id: false });
    expect(
      (
        await getPagedStockOperationStatus({
          ...request(),
          action: 'delete',
          edits: [],
        })
      ).operation_id,
    ).toBe(false);
  });
  it.each([
    { accepted: 'yes' },
    { action: 'delete' },
    { operation_id: 99 },
    { state_after: 'done' },
    { request_key: 'wrong' },
    { reference_count: -1 },
    { current: null },
    {
      current: {
        ...status().current,
        transfer: { ...status().current.transfer, operations: [] },
      },
    },
  ])('rejects malformed compact receipts: %j', async (change) => {
    reply({ ...status(), ...change });
    await expect(getPagedStockOperationStatus(request())).rejects.toThrow();
  });
  it('represents an uncertain request as unaccepted without claiming cancellation', async () => {
    reply(status(false));
    expect((await getPagedStockOperationStatus(request())).accepted).toBe(
      false,
    );
    reply({ ...status(false), operation_id: 13 });
    await expect(getPagedStockOperationStatus(request())).rejects.toThrow();
  });
  it('preserves hidden reference availability, exact versions and count bounds', async () => {
    const hidden = {
      ...references(),
      rows: [
        {
          ...references().rows[0],
          id: false as const,
          name: false as const,
          available: false,
        },
      ],
    };
    reply(hidden);
    expect(await getPagedStockOperationReferences(request())).toEqual(hidden);
    for (const invalid of [
      { ...references(), request_key: 'wrong' },
      { ...references(), total_count: 2 },
      { ...references(), rows: [{ ...hidden.rows[0], id: 77 }] },
      { ...references(), next_after: 1 },
    ]) {
      reply(invalid);
      await expect(
        getPagedStockOperationReferences(request()),
      ).rejects.toThrow();
    }
  });
  it('rejects invalid continuation inputs locally', async () => {
    for (const args of [
      [-1, false, false, 50],
      [true, false, false, 50],
      [1, false, false, 50],
      [0, 'a'.repeat(64), false, 50],
      [0, false, false, 101],
    ] as const)
      await expect(
        getPagedStockOperationReview(
          operationSelectionRequest(),
          ...(args as unknown as [
            number,
            string | false,
            string | false,
            number,
          ]),
        ),
      ).rejects.toThrow();
    await expect(
      getPagedStockOperationReferences(request(), 1),
    ).rejects.toThrow();
    expect(fetch).not.toHaveBeenCalled();
  });
  it('keeps expiry and native rejection distinct from transport uncertainty', async () => {
    (fetch as jest.Mock).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ error: { code: 100 } }),
    });
    await expect(
      getPagedStockOperationStatus(request()),
    ).rejects.toBeInstanceOf(BillingSessionExpired);
    (fetch as jest.Mock).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        error: {
          data: {
            name: 'odoo.exceptions.UserError',
            arguments: ['Native rejection'],
          },
        },
      }),
    });
    await expect(savePagedStockOperation(request())).rejects.toBeInstanceOf(
      BillingActionRejected,
    );
    (fetch as jest.Mock).mockRejectedValue(new Error('Connection lost'));
    await expect(savePagedStockOperation(request())).rejects.toThrow(
      'Connection lost',
    );
  });
});
