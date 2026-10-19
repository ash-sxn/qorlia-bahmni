import {
  BillingActionRejected,
  BillingSessionExpired,
  changePagedStockOperationForm,
  checkedPagedStockOperationRequest,
  checkedStockOperationRequest,
  getPagedStockOperationForm,
  getPagedStockOperationChoices,
  getPagedStockOperationReferences,
  getPagedStockOperationReview,
  getPagedStockOperationStatus,
  PagedStockOperationRequest,
  savePagedStockOperation,
  StockOperationSelection,
  StockOperationSelectionRequest,
} from '../billingService';
import {
  operationForm,
  operationSelection,
  operationSelectionRequest,
} from './stockOperationFixture';

import {
  formRequest,
  request,
  review,
  status,
  references,
} from './stockOperationPagedFixture';

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
  it('uses seven named APIs, existing form shape and exact completion-proof payloads', async () => {
    reply(operationForm());
    expect(await getPagedStockOperationForm(operationSelection())).toEqual(
      operationForm(),
    );
    expect(await changePagedStockOperationForm(formRequest())).toEqual(
      operationForm(),
    );
    reply({ rows: [[7, 'QorliaQA Batch']], has_more: false, offset: 0 });
    expect(
      await getPagedStockOperationChoices(formRequest(), 'lot_id'),
    ).toEqual({
      rows: [[7, 'QorliaQA Batch']],
      has_more: false,
      offset: 0,
    });
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
      [
        'load',
        'onchange',
        'choices',
        'review',
        'save',
        'status',
        'references',
      ].map((action) => `qorlia_operation_paged_${action}`),
    );
    expect(params()[4].kwargs).toEqual({ payload: request() });
    expect(checkedPagedStockOperationRequest(request())).toEqual(request());
    expect(() => checkedStockOperationRequest(request())).toThrow();
    for (const item of params()) {
      expect(item.model).toBe('stock.picking');
      expect(item.args).toEqual([]);
    }
  });
  it('keeps paged choices exact, native and bounded without changing the legacy route', async () => {
    const choices = {
      rows: [[7, 'QorliaQA Batch']],
      has_more: false,
      offset: 25,
    };
    reply(choices);
    expect(
      await getPagedStockOperationChoices(formRequest(), 'lot_id', 'Batch', 25),
    ).toEqual(choices);
    expect(params()[0].kwargs).toEqual({
      ...formRequest(),
      field: 'lot_id',
      search: 'Batch',
      offset: 25,
    });
    expect(params()[0].method).toBe('qorlia_operation_paged_choices');
    for (const result of [
      {
        rows: [
          [7, 'Batch'],
          [7, 'Duplicate'],
        ],
        has_more: false,
        offset: 0,
      },
      { rows: [false], has_more: false, offset: 0 },
      { rows: [[7, 'Batch']], has_more: true, offset: 0 },
      { rows: [], has_more: false, offset: 25 },
    ]) {
      reply(result);
      await expect(
        getPagedStockOperationChoices(formRequest(), 'lot_id'),
      ).rejects.toThrow('Invalid native stock field choices');
    }
  });
  it.each([
    [{ ...formRequest(), context: {} }, 'lot_id', '', 0],
    [{ ...formRequest(), complete_inventory: true }, 'lot_id', '', 0],
    [formRequest(), 'qty_done', '', 0],
    [formRequest(), 'lot_id', 'x'.repeat(201), 0],
    [formRequest(), 'lot_id', 12, 0],
    [formRequest(), 'lot_id', '', -1],
    [formRequest(), 'lot_id', '', 100001],
    [formRequest(), 'lot_id', '', true],
  ])(
    'rejects invalid paged choice requests before HTTP: %j',
    async (data, field, search, offset) => {
      await expect(
        getPagedStockOperationChoices(
          data as Parameters<typeof getPagedStockOperationChoices>[0],
          field as Parameters<typeof getPagedStockOperationChoices>[1],
          search as string,
          offset as number,
        ),
      ).rejects.toThrow();
      expect(fetch).not.toHaveBeenCalled();
    },
  );
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
