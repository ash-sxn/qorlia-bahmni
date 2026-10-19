import { waitFor } from '@testing-library/react';
import {
  StockReservationRequest,
  PagedStockValidationRequest,
  PagedStockValidationStatus,
  PagedStockReturnRequest,
  PagedStockReturnStatus,
  PagedStockCancellationRequest,
  PagedStockCancellationStatus,
} from '../billingService';
import {
  clearStockReservationRecovery,
  loadStockReservationRecovery,
  persistStockReservationRecovery,
  clearStockOperationRecovery,
  loadStockOperationRecovery,
  loadStockWriteRecovery,
  persistStockOperationRecovery,
  clearStockConfirmationRecovery,
  loadStockConfirmationRecovery,
  persistStockConfirmationRecovery,
  loadStockValidationRecovery,
  persistStockValidationRecovery,
  clearStockValidationRecovery,
  replaceStockValidationRecovery,
  isStockValidationStepRequest,
  isPagedStockWriteRequest,
  loadPagedStockWriteRecovery,
  persistPagedStockWriteRecovery,
  clearPagedStockWriteRecovery,
  PagedStockWriteRequest,
  loadPagedStockValidationRecovery,
  persistPagedStockValidationRecovery,
  restoreStoppedPagedStockValidationRecovery,
  clearPagedStockValidationRecovery,
  isPagedStockValidationRequest,
  isPagedStockReturnRequest,
  isStockConfirmationRequest,
  loadPagedStockReturnRecovery,
  persistPagedStockReturnRecovery,
  clearPagedStockReturnRecovery,
  isPagedStockCancellationRequest,
  loadPagedStockCancellationRecovery,
  persistPagedStockCancellationRecovery,
  clearPagedStockCancellationRecovery,
} from '../stockReservationRecovery';
import { orderDeliveryPageFixture } from './orderDeliveryFixture';
import { confirmationRequest } from './stockConfirmationFixture';
import { operationRequest } from './stockOperationFixture';
import { stockRequest } from './stockReservationFixture';
import { validationRequest } from './stockValidationFixture';

const request = (): StockReservationRequest => stockRequest();
const billingDatabase = process.env.BAHMNI_BILLING_DATABASE ?? 'odoo';
const pagedRequests = [
  [
    'paged_reservation',
    { ...stockRequest(), review_complete_token: 'c'.repeat(64) },
  ],
  [
    'paged_operation',
    { ...operationRequest(), review_complete_token: 'c'.repeat(64) },
  ],
  [
    'paged_confirmation',
    { ...confirmationRequest(), review_complete_token: 'c'.repeat(64) },
  ],
  [
    'paged_confirmation',
    {
      ...confirmationRequest(),
      order_id: false,
      review_complete_token: 'c'.repeat(64),
    },
  ],
] as const;

function database() {
  const records = new Map<number, unknown>();
  let autoCommit = true;
  let failWrites = false;
  let commit = () => {};
  const db = {
    close: jest.fn(),
    onversionchange: null,
    createObjectStore: jest.fn(),
    transaction: jest.fn(() => {
      let aborted = false;
      let apply = () => {};
      const tx = {
        oncomplete: null as (() => void) | null,
        onerror: null as (() => void) | null,
        onabort: null as (() => void) | null,
        abort: () => {
          aborted = true;
          queueMicrotask(() => tx.onabort?.());
        },
        objectStore: () => ({
          get: (uid: number) => {
            const get = {
              result: records.get(uid),
              onsuccess: null as (() => void) | null,
            };
            queueMicrotask(() => {
              get.onsuccess?.();
              commit = () => {
                if (!aborted) {
                  apply();
                  tx.oncomplete?.();
                }
              };
              if (autoCommit) queueMicrotask(commit);
            });
            return get;
          },
          put: (value: unknown, uid: number) => {
            if (failWrites) tx.abort();
            else apply = () => records.set(uid, value);
          },
          delete: (uid: number) => {
            if (failWrites) tx.abort();
            else
              apply = () => {
                records.delete(uid);
              };
          },
        }),
      };
      return tx;
    }),
  };
  const factory = {
    open: jest.fn(() => {
      const open = {
        result: db,
        onsuccess: null as (() => void) | null,
        onerror: null,
        onblocked: null,
        onupgradeneeded: null,
      };
      queueMicrotask(() => open.onsuccess?.());
      return open;
    }),
  };
  Object.defineProperty(window, 'indexedDB', {
    configurable: true,
    value: factory,
  });
  return {
    records,
    db,
    factory,
    hold: () => {
      autoCommit = false;
    },
    commit: () => commit(),
    fail: () => {
      failWrites = true;
    },
  };
}

const completeValidation = (): PagedStockValidationRequest => ({
  ...validationRequest(),
  continuation_key: false,
  review_complete_token: 'c'.repeat(64),
});
const validationEnvelope = (
  request = completeValidation(),
  history: unknown[] = [],
) => ({
  schema: 6,
  kind: 'paged_validation',
  uid: 3,
  database: billingDatabase,
  request,
  history,
});
function validationOutcome(
  request: PagedStockValidationRequest,
  outcome: 'open' | 'unknown' | 'stopped' | 'terminal' = 'open',
): PagedStockValidationStatus {
  const source =
    outcome === 'stopped' ? request.continuation_key : request.request_key;
  const terminal = outcome === 'terminal';
  return {
    accepted: outcome === 'open' || terminal,
    stopped: outcome === 'stopped',
    request_key: request.request_key,
    current: {
      order_id: request.order_id,
      transfer_id: request.transfer_id,
      version: 'd'.repeat(64),
      transfer: {
        ...orderDeliveryPageFixture().rows[0],
        move_count: 501,
        operation_count: 2001,
      },
    },
    receipt:
      outcome === 'unknown' || !source
        ? false
        : {
            request_key: source,
            state_after: 'assigned',
            reference_count: 1,
            next_step: terminal
              ? false
              : {
                  kind: 'immediate',
                  title: 'Native prompt',
                  blocked_reason: false,
                  counts: { transfers: 1, operations: 0, lots: 0 },
                },
            prompt_count: terminal ? 0 : 1,
            prompt_version: terminal ? false : 'e'.repeat(64),
            continuation_key: terminal ? false : source,
            continuation_reason: false,
            terminal,
          },
  };
}
function nativeOutcome(value: unknown) {
  (fetch as jest.Mock).mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ result: value }),
  });
}

const completeReturn = (): PagedStockReturnRequest => ({
  order_id: 9,
  transfer_id: 11,
  version: 'a'.repeat(64),
  location_id: 3,
  lines: [{ move_id: 12, quantity: 2 }],
  review_version: 'b'.repeat(64),
  review_complete_token: 'c'.repeat(64),
  request_key: '11111111-2222-4333-8444-555555555555',
});
const returnEnvelope = (request = completeReturn(), uid = 3) => ({
  schema: 7,
  kind: 'paged_return',
  database: billingDatabase,
  uid,
  request,
});
function returnOutcome(
  outcome: 'accepted' | 'stopped' | 'unknown' = 'accepted',
  count = 2,
) {
  const accepted = outcome === 'accepted';
  const status: PagedStockReturnStatus = {
    accepted,
    stopped: outcome === 'stopped',
    request_key: completeReturn().request_key,
    state_after: accepted ? 'assigned' : false,
    return_transfer: accepted
      ? {
          model: 'stock.picking',
          id: 19,
          name: 'QA/RETURN/19',
          available: true,
        }
      : false,
    reference_count: accepted ? count : 0,
    current: {
      order_id: 9,
      transfer_id: 11,
      version: 'd'.repeat(64),
      transfer: {
        ...orderDeliveryPageFixture().rows[0],
        state: 'done',
        move_count: 501,
        operation_count: 2001,
      },
    },
  };
  const rows = Array.from({ length: count - 1 }, (_, index) => ({
    key: `new:stock.move:${index}`,
    model: 'stock.move',
    id: 100 + index,
    name: 'QA Return item',
    available: true as boolean,
  }))
    .concat([
      {
        key: 'new:stock.picking:0',
        model: 'stock.picking',
        id: 19,
        name: 'QA/RETURN/19',
        available: true,
      },
    ])
    .sort((left, right) => (left.key < right.key ? -1 : 1));
  const state = {
    status,
    rows,
    version: 'e'.repeat(64),
    session: { uid: 3, db: billingDatabase },
  };
  (fetch as jest.Mock).mockImplementation(async (route, options) => {
    let result: unknown;
    if (route.endsWith('/web/session/get_session_info')) result = state.session;
    else {
      const { method, kwargs } = JSON.parse(options.body).params;
      if (method === 'qorlia_return_paged_status') result = state.status;
      else if (method === 'qorlia_return_paged_references') {
        if (kwargs.version !== false && kwargs.version !== state.version)
          return {
            ok: true,
            status: 200,
            json: async () => ({
              error: {
                data: {
                  name: 'odoo.exceptions.UserError',
                  arguments: ['Return references changed'],
                },
              },
            }),
          };
        const { after, limit } = kwargs;
        result = {
          request_key: completeReturn().request_key,
          version: state.version,
          after,
          total_count: state.rows.length,
          rows: state.rows.slice(after, after + limit),
          next_after: after + limit < state.rows.length ? after + limit : false,
        };
      } else throw new Error(`Unexpected return recovery method: ${method}`);
    }
    const body = JSON.stringify({ result });
    return { ok: true, status: 200, json: async () => JSON.parse(body) };
  });
  return state;
}

const completeCancellation = (): PagedStockCancellationRequest => ({
  ...confirmationRequest(),
  action: 'cancel_transfer',
  review_complete_token: 'c'.repeat(64),
});
const cancellationEnvelope = (request = completeCancellation(), uid = 3) => ({
  schema: 8,
  kind: 'paged_cancellation',
  database: billingDatabase,
  uid,
  request,
});
function cancellationOutcome(
  outcome: 'accepted' | 'stopped' | 'unknown' = 'accepted',
  count = 0,
) {
  const accepted = outcome === 'accepted';
  const status: PagedStockCancellationStatus = {
    accepted,
    stopped: outcome === 'stopped',
    request_key: completeCancellation().request_key,
    state_after: accepted ? 'cancel' : false,
    reference_count: accepted ? count : 0,
    current: {
      order_id: 9,
      transfer_id: 11,
      version: 'd'.repeat(64),
      transfer: {
        ...orderDeliveryPageFixture().rows[0],
        state: accepted ? 'cancel' : 'assigned',
        move_count: 501,
        operation_count: accepted ? 0 : 2001,
      },
    },
  };
  const state = {
    status,
    rows: Array.from({ length: count }, (_, index) => ({
      key: `new:stock.move:${index}`,
      model: 'stock.move',
      id: 100 + index,
      name: 'QorliaQA native reference',
      available: true,
    })).sort((a, b) => (a.key < b.key ? -1 : 1)),
    version: 'e'.repeat(64),
    session: { uid: 3, db: billingDatabase },
  };
  (fetch as jest.Mock).mockImplementation(async (route, options) => {
    let result: unknown;
    if (route.endsWith('/web/session/get_session_info')) result = state.session;
    else {
      const { method, kwargs } = JSON.parse(options.body).params;
      if (method === 'qorlia_cancellation_paged_status') result = state.status;
      else if (method === 'qorlia_cancellation_paged_references') {
        if (kwargs.version !== false && kwargs.version !== state.version)
          return {
            ok: true,
            status: 200,
            json: async () => ({
              error: {
                data: {
                  name: 'odoo.exceptions.UserError',
                  arguments: ['Cancellation references changed'],
                },
              },
            }),
          };
        const { after, limit } = kwargs;
        result = {
          request_key: completeCancellation().request_key,
          version: state.version,
          after,
          total_count: state.rows.length,
          rows: state.rows.slice(after, after + limit),
          next_after: after + limit < state.rows.length ? after + limit : false,
        };
      } else
        throw new Error(`Unexpected cancellation recovery method: ${method}`);
    }
    const body = JSON.stringify({ result });
    return { ok: true, status: 200, json: async () => JSON.parse(body) };
  });
  return state;
}

describe('Complete native cancellation durable recovery', () => {
  it('retains references that no longer match the version reviewed by the UI', async () => {
    const fake = database();
    fake.records.set(3, cancellationEnvelope());
    cancellationOutcome('accepted', 1);
    await expect(
      clearPagedStockCancellationRecovery(
        3,
        completeCancellation(),
        'f'.repeat(64),
      ),
    ).rejects.toThrow(/references changed/);
    expect(fake.records.get(3)).toEqual(cancellationEnvelope());
  });
  beforeEach(() => {
    global.fetch = jest.fn();
  });
  it('stores exact schema-8 cancellation in the existing strict account slot without a native write', async () => {
    const fake = database(),
      exact = completeCancellation();
    cancellationOutcome();
    await persistPagedStockCancellationRecovery(3, exact);
    expect(fake.records.get(3)).toEqual(cancellationEnvelope());
    expect(await loadPagedStockCancellationRecovery(3)).toEqual(exact);
    expect(await loadStockWriteRecovery(3)).toEqual(exact);
    expect(isPagedStockCancellationRequest(exact)).toBe(true);
    expect(isPagedStockWriteRequest(exact)).toBe(false);
    expect(isStockConfirmationRequest(exact)).toBe(false);
    expect(fake.factory.open).toHaveBeenCalledWith(
      'qorlia.billing.stock-reservation-recovery',
      1,
    );
    expect(fake.db.transaction).toHaveBeenCalledWith('pending', 'readwrite', {
      durability: 'strict',
    });
    exact.review_complete_token = 'f'.repeat(64);
    expect(fake.records.get(3)).toEqual(cancellationEnvelope());
    expect(
      (fetch as jest.Mock).mock.calls.every((call) =>
        call[0].endsWith('/web/session/get_session_info'),
      ),
    ).toBe(true);
  });
  it('waits for commit and rechecks the original account after storage', async () => {
    const fake = database(),
      state = cancellationOutcome();
    fake.hold();
    const saving = persistPagedStockCancellationRecovery(
      3,
      completeCancellation(),
    );
    const rejected = saving.catch((error: unknown) => error);
    await waitFor(() => expect(fake.db.transaction).toHaveBeenCalled());
    expect(fake.records.size).toBe(0);
    state.session.uid = 4;
    fake.commit();
    const error = await rejected;
    expect(error).toBeInstanceOf(Error);
    expect(error).toMatchObject({
      message: expect.stringMatching(/original Billing account/),
    });
    expect(fake.records.get(3)).toEqual(cancellationEnvelope());
    expect((fetch as jest.Mock).mock.calls).toHaveLength(2);
  });
  it('keeps the original nonce, rejects replacement and separates accounts', async () => {
    const fake = database(),
      state = cancellationOutcome();
    await persistPagedStockCancellationRecovery(3, completeCancellation());
    await persistPagedStockCancellationRecovery(3, completeCancellation());
    for (const change of [
      { request_key: '22222222-2222-4333-8444-555555555555' },
      { review_complete_token: 'd'.repeat(64) },
      { transfer_id: 12 },
    ])
      await expect(
        persistPagedStockCancellationRecovery(3, {
          ...completeCancellation(),
          ...change,
        }),
      ).rejects.toThrow(/Another stock request/);
    expect(fake.records.get(3)).toEqual(cancellationEnvelope());
    state.session.uid = 4;
    await persistPagedStockCancellationRecovery(4, completeCancellation());
    expect(fake.records.get(4)).toEqual(
      cancellationEnvelope(completeCancellation(), 4),
    );
  });
  it('blocks all older readers and clearers without stripping cancellation proofs', async () => {
    const fake = database();
    fake.records.set(3, cancellationEnvelope());
    for (const load of [
      loadStockReservationRecovery,
      loadStockOperationRecovery,
      loadStockConfirmationRecovery,
      loadStockValidationRecovery,
      loadPagedStockWriteRecovery,
      loadPagedStockValidationRecovery,
      loadPagedStockReturnRecovery,
    ])
      await expect(load(3)).rejects.toThrow(
        /cancellation request|Another stock request/,
      );
    for (const clear of [
      () => clearStockReservationRecovery(3, request()),
      () => clearStockOperationRecovery(3, operationRequest()),
      () => clearStockConfirmationRecovery(3, confirmationRequest()),
      () => clearStockValidationRecovery(3, validationRequest()),
      () => clearPagedStockWriteRecovery(3, pagedRequests[0][1]),
      () => clearPagedStockReturnRecovery(3, completeReturn()),
    ]) {
      await expect(clear()).rejects.toThrow(
        /cancellation request|Another stock request/,
      );
      expect(fake.records.get(3)).toEqual(cancellationEnvelope());
    }
    nativeOutcome(validationOutcome(completeValidation(), 'terminal'));
    await expect(
      clearPagedStockValidationRecovery(3, completeValidation()),
    ).rejects.toThrow(/cancellation request/);
    expect(fake.records.get(3)).toEqual(cancellationEnvelope());
  });
  it.each([1, 2, 3, 4, 5, 6, 7])(
    'does not disguise cancellation as schema %s',
    async (schema) => {
      const fake = database(),
        stored = { ...cancellationEnvelope(), schema };
      fake.records.set(3, stored);
      await expect(loadStockWriteRecovery(3)).rejects.toThrow();
      expect(fake.records.get(3)).toEqual(stored);
      expect(fetch).not.toHaveBeenCalled();
    },
  );
  it.each([
    { schema: 9 },
    { uid: 4 },
    { database: 'another' },
    { kind: 'paged_confirmation' },
    { history: [] },
    { request: { ...completeCancellation(), context: {} } },
    { request: { ...completeCancellation(), review_complete_token: false } },
    { request: { ...completeCancellation(), action: 'unreserve' } },
  ])(
    'preserves malformed or foreign cancellation recovery %j',
    async (change) => {
      const fake = database(),
        stored = { ...cancellationEnvelope(), ...change };
      fake.records.set(3, stored);
      await expect(loadStockWriteRecovery(3)).rejects.toThrow();
      await expect(
        clearPagedStockCancellationRecovery(3, completeCancellation()),
      ).rejects.toThrow();
      expect(fake.records.get(3)).toEqual(stored);
      expect(fetch).not.toHaveBeenCalled();
    },
  );
  it('rejects malformed new cancellation and invalid accounts before storage or transport', async () => {
    const fake = database();
    for (const change of [
      { action: 'unreserve' },
      { context: {} },
      { review_complete_token: false },
      { request_key: 'bad' },
    ])
      await expect(
        persistPagedStockCancellationRecovery(3, {
          ...completeCancellation(),
          ...change,
        } as PagedStockCancellationRequest),
      ).rejects.toThrow();
    await expect(
      persistPagedStockCancellationRecovery(0, completeCancellation()),
    ).rejects.toThrow();
    expect(fake.factory.open).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });
  it('cannot replace another kind of stock work', async () => {
    const fake = database();
    cancellationOutcome();
    for (const stored of [
      { schema: 1, uid: 3, request: request() },
      returnEnvelope(),
      validationEnvelope(),
    ]) {
      fake.records.set(3, stored);
      await expect(
        persistPagedStockCancellationRecovery(3, completeCancellation()),
      ).rejects.toThrow(/Another stock request/);
      await expect(loadPagedStockCancellationRecovery(3)).rejects.toThrow(
        /Another stock request/,
      );
      expect(fake.records.get(3)).toEqual(stored);
    }
  });
  it.each([0, 101])(
    'retires accepted cancellation only after all %s pinned references and fresh checks',
    async (count) => {
      const fake = database();
      fake.records.set(3, cancellationEnvelope());
      cancellationOutcome('accepted', count);
      await clearPagedStockCancellationRecovery(3, completeCancellation());
      expect(fake.records.size).toBe(0);
      const calls = (fetch as jest.Mock).mock.calls;
      const pages = calls
        .filter((call) =>
          call[0].endsWith('/qorlia_cancellation_paged_references'),
        )
        .map((call) => JSON.parse(call[1].body).params.kwargs);
      expect(pages.map((p) => [p.after, p.limit])).toEqual(
        count
          ? [
              [0, 50],
              [50, 50],
              [100, 50],
              [0, 1],
            ]
          : [
              [0, 50],
              [0, 1],
            ],
      );
      expect(pages.map((p) => p.version)).toEqual(
        count
          ? [false, 'e'.repeat(64), 'e'.repeat(64), 'e'.repeat(64)]
          : [false, 'e'.repeat(64)],
      );
      expect(
        calls.filter((call) =>
          call[0].endsWith('/qorlia_cancellation_paged_status'),
        ),
      ).toHaveLength(2);
      expect(
        calls.filter((call) =>
          call[0].endsWith('/web/session/get_session_info'),
        ),
      ).toHaveLength(2);
      expect(
        calls.some((call) =>
          /qorlia_cancellation_paged_(save|stop)$/.test(call[0]),
        ),
      ).toBe(false);
    },
  );
  it('retires only an explicitly stopped cancellation without pretending the transfer was cancelled', async () => {
    const fake = database();
    fake.records.set(3, cancellationEnvelope());
    cancellationOutcome('stopped');
    await clearPagedStockCancellationRecovery(3, completeCancellation());
    expect(fake.records.size).toBe(0);
    expect(
      (fetch as jest.Mock).mock.calls.some((call) =>
        /_references$|_save$|_stop$/.test(call[0]),
      ),
    ).toBe(false);
  });
  it('never clears unknown, failed or expired outcomes', async () => {
    const fake = database();
    fake.records.set(3, cancellationEnvelope());
    cancellationOutcome('unknown');
    await expect(
      clearPagedStockCancellationRecovery(3, completeCancellation()),
    ).rejects.toThrow(/outcome is unknown/);
    (fetch as jest.Mock).mockRejectedValue(new Error('Offline'));
    await expect(
      clearPagedStockCancellationRecovery(3, completeCancellation()),
    ).rejects.toThrow(/Offline/);
    (fetch as jest.Mock).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ error: { code: 100 } }),
    });
    await expect(
      clearPagedStockCancellationRecovery(3, completeCancellation()),
    ).rejects.toThrow();
    expect(fake.records.get(3)).toEqual(cancellationEnvelope());
  });
  it.each(['reference', 'status', 'overlap'])(
    'retains changed or overlapping %s evidence',
    async (mode) => {
      const fake = database();
      fake.records.set(3, cancellationEnvelope());
      const state = cancellationOutcome('accepted', 101),
        native = (fetch as jest.Mock).getMockImplementation()!;
      let statuses = 0;
      (fetch as jest.Mock).mockImplementation(async (route, options) => {
        if (
          route.endsWith('/qorlia_cancellation_paged_status') &&
          ++statuses === 2
        ) {
          if (mode === 'reference') state.version = 'f'.repeat(64);
          if (mode === 'status') state.status.current.version = 'f'.repeat(64);
        }
        const response = await native(route, options);
        if (
          mode === 'overlap' &&
          route.endsWith('/qorlia_cancellation_paged_references') &&
          JSON.parse(options.body).params.kwargs.after === 50
        ) {
          const body = await response.json();
          body.result.rows = state.rows.slice(0, 50);
          return { ...response, json: async () => body };
        }
        return response;
      });
      await expect(
        clearPagedStockCancellationRecovery(3, completeCancellation()),
      ).rejects.toThrow(/references changed|outcome changed|pages overlap/);
      expect(fake.records.get(3)).toEqual(cancellationEnvelope());
    },
  );
  it.each(['account', 'database', 'slot'])(
    'preserves recovery when %s changes before final clear',
    async (mode) => {
      const fake = database();
      fake.records.set(3, cancellationEnvelope());
      const state = cancellationOutcome(),
        native = (fetch as jest.Mock).getMockImplementation()!;
      const newer = { schema: 1, uid: 3, request: request() };
      let sessions = 0;
      (fetch as jest.Mock).mockImplementation(async (route, options) => {
        if (
          route.endsWith('/web/session/get_session_info') &&
          ++sessions === 2
        ) {
          if (mode === 'account') state.session.uid = 4;
          if (mode === 'database') state.session.db = 'another';
          if (mode === 'slot') fake.records.set(3, newer);
        }
        return native(route, options);
      });
      await expect(
        clearPagedStockCancellationRecovery(3, completeCancellation()),
      ).rejects.toThrow(
        /original Billing account|pending stock request changed/,
      );
      expect(fake.records.get(3)).toEqual(
        mode === 'slot' ? newer : cancellationEnvelope(),
      );
    },
  );
  it('retains a failed clear commit and never contacts native for an absent or different local request', async () => {
    const fake = database();
    await expect(
      clearPagedStockCancellationRecovery(3, completeCancellation()),
    ).rejects.toThrow(/not stored/);
    fake.records.set(3, cancellationEnvelope());
    await expect(
      clearPagedStockCancellationRecovery(3, {
        ...completeCancellation(),
        review_complete_token: 'f'.repeat(64),
      }),
    ).rejects.toThrow(/request changed/);
    expect(fetch).not.toHaveBeenCalled();
    cancellationOutcome();
    fake.fail();
    await expect(
      clearPagedStockCancellationRecovery(3, completeCancellation()),
    ).rejects.toThrow(/could not be committed/);
    expect(fake.records.get(3)).toEqual(cancellationEnvelope());
  });
});

describe('Complete native return durable recovery', () => {
  beforeEach(() => {
    global.fetch = jest.fn();
  });

  it('stores exact eight-key requests in schema 7 using the same account slot and no network write', async () => {
    const fake = database(),
      exact = completeReturn();
    exact.lines = Array.from({ length: 501 }, (_, index) => ({
      move_id: index + 1,
      quantity: 1,
    }));
    await persistPagedStockReturnRecovery(3, exact);
    expect(fake.records.get(3)).toEqual(returnEnvelope(exact));
    expect(await loadPagedStockReturnRecovery(3)).toEqual(exact);
    expect(isPagedStockReturnRequest(exact)).toBe(true);
    expect(isStockConfirmationRequest(exact)).toBe(false);
    expect(isPagedStockWriteRequest(exact)).toBe(false);
    expect(fake.factory.open).toHaveBeenCalledWith(
      'qorlia.billing.stock-reservation-recovery',
      1,
    );
    expect(fake.db.transaction).toHaveBeenCalledWith('pending', 'readwrite', {
      durability: 'strict',
    });
    exact.lines[500].quantity = 9;
    expect((await loadPagedStockReturnRecovery(3))!.lines[500].quantity).toBe(
      1,
    );
    expect(fetch).not.toHaveBeenCalled();
  });

  it('waits for strict commit before allowing a new return save to proceed', async () => {
    const fake = database();
    fake.hold();
    let resolved = false;
    const saving = persistPagedStockReturnRecovery(3, completeReturn()).then(
      () => {
        resolved = true;
      },
    );
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(resolved).toBe(false);
    expect(fake.records.size).toBe(0);
    fake.commit();
    await saving;
    expect(fake.records.get(3)).toEqual(returnEnvelope());
  });

  it('allows only the identical pending request and separates Billing accounts', async () => {
    const fake = database();
    await persistPagedStockReturnRecovery(3, completeReturn());
    await persistPagedStockReturnRecovery(3, completeReturn());
    for (const change of [
      { request_key: '22222222-2222-4333-8444-555555555555' },
      { review_complete_token: 'd'.repeat(64) },
      { location_id: 4 },
      { lines: [{ move_id: 12, quantity: 3 }] },
    ])
      await expect(
        persistPagedStockReturnRecovery(3, { ...completeReturn(), ...change }),
      ).rejects.toThrow(/Another stock request/);
    expect(fake.records.get(3)).toEqual(returnEnvelope());
    await persistPagedStockReturnRecovery(4, completeReturn());
    expect(fake.records.get(4)).toEqual(returnEnvelope(completeReturn(), 4));
  });

  it('keeps return requests intact and rejects every older reader/clearer instead of converting their protocol', async () => {
    const fake = database();
    await persistPagedStockReturnRecovery(3, completeReturn());
    expect(await loadStockWriteRecovery(3)).toEqual(completeReturn());
    for (const load of [
      loadStockReservationRecovery,
      loadStockOperationRecovery,
      loadStockConfirmationRecovery,
      loadStockValidationRecovery,
      loadPagedStockWriteRecovery,
      loadPagedStockValidationRecovery,
    ])
      await expect(load(3)).rejects.toThrow(
        /return request|Another stock request/,
      );
    for (const clear of [
      () => clearStockReservationRecovery(3, request()),
      () => clearStockOperationRecovery(3, operationRequest()),
      () => clearStockConfirmationRecovery(3, confirmationRequest()),
      () => clearStockValidationRecovery(3, validationRequest()),
      () => clearPagedStockWriteRecovery(3, pagedRequests[0][1]),
    ]) {
      await expect(clear()).rejects.toThrow(/return request/);
      expect(fake.records.get(3)).toEqual(returnEnvelope());
    }
    for (const persist of [
      () => persistStockReservationRecovery(3, request()),
      () => persistStockOperationRecovery(3, operationRequest()),
      () => persistStockConfirmationRecovery(3, confirmationRequest()),
      () => persistStockValidationRecovery(3, validationRequest()),
      () => persistPagedStockWriteRecovery(3, pagedRequests[0][1]),
      () => persistPagedStockValidationRecovery(3, completeValidation()),
    ])
      await expect(persist()).rejects.toThrow(/Another stock request/);
    nativeOutcome(validationOutcome(completeValidation(), 'terminal'));
    await expect(
      clearPagedStockValidationRecovery(3, completeValidation()),
    ).rejects.toThrow(/return request/);
    expect(fake.records.get(3)).toEqual(returnEnvelope());
  });

  it('does not overwrite older requests or prior-action validation history', async () => {
    const fake = database();
    const older = [
      { schema: 1, uid: 3, request: request() },
      {
        schema: 2,
        kind: 'confirmation',
        uid: 3,
        request: confirmationRequest(),
      },
      {
        schema: 5,
        kind: pagedRequests[0][0],
        database: billingDatabase,
        uid: 3,
        request: pagedRequests[0][1],
      },
      validationEnvelope(),
    ];
    for (const value of older) {
      fake.records.set(3, value);
      await expect(loadPagedStockReturnRecovery(3)).rejects.toThrow(
        /Another stock request/,
      );
      await expect(
        persistPagedStockReturnRecovery(3, completeReturn()),
      ).rejects.toThrow(/Another stock request/);
      expect(fake.records.get(3)).toEqual(value);
    }
  });

  it.each([
    { schema: 6 },
    { kind: 'paged_confirmation' },
    { database: 'another-database' },
    { uid: 4 },
    { history: [] },
    { request: { ...completeReturn(), context: {} } },
    { request: { ...completeReturn(), review_complete_token: false } },
    {
      request: {
        ...completeReturn(),
        lines: [{ move_id: 12, quantity: Infinity }],
      },
    },
  ])(
    'retains malformed/foreign return envelopes without storage migration: %j',
    async (change) => {
      const fake = database(),
        value = { ...returnEnvelope(), ...change };
      fake.records.set(3, value);
      await expect(loadPagedStockReturnRecovery(3)).rejects.toThrow();
      await expect(
        persistPagedStockReturnRecovery(3, completeReturn()),
      ).rejects.toThrow();
      await expect(
        clearPagedStockReturnRecovery(3, completeReturn()),
      ).rejects.toThrow();
      expect(fake.records.get(3)).toEqual(value);
      expect(fetch).not.toHaveBeenCalled();
    },
  );

  it('rejects proof-stripped, duplicate and malformed new requests before opening storage', async () => {
    const fake = database();
    for (const change of [
      { context: {} },
      { review_complete_token: false },
      { location_id: 0 },
      { lines: [{ move_id: 12, quantity: NaN }] },
      { lines: [...completeReturn().lines, ...completeReturn().lines] },
    ])
      await expect(
        persistPagedStockReturnRecovery(3, {
          ...completeReturn(),
          ...change,
        } as PagedStockReturnRequest),
      ).rejects.toThrow();
    await expect(
      persistPagedStockReturnRecovery(0, completeReturn()),
    ).rejects.toThrow();
    expect(fake.factory.open).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('never clears an unknown return outcome or a failed native status read', async () => {
    const fake = database();
    await persistPagedStockReturnRecovery(3, completeReturn());
    returnOutcome('unknown');
    await expect(
      clearPagedStockReturnRecovery(3, completeReturn()),
    ).rejects.toThrow(/outcome is unknown/);
    expect(fake.records.get(3)).toEqual(returnEnvelope());
    (fetch as jest.Mock).mockRejectedValue(new Error('Native unavailable'));
    await expect(
      clearPagedStockReturnRecovery(3, completeReturn()),
    ).rejects.toThrow(/Native unavailable/);
    expect(fake.records.get(3)).toEqual(returnEnvelope());
  });

  it('retires accepted creation only after all 101 pinned references, a final read and fresh account checks', async () => {
    const fake = database();
    await persistPagedStockReturnRecovery(3, completeReturn());
    returnOutcome('accepted', 101);
    await clearPagedStockReturnRecovery(3, completeReturn());
    expect(fake.records.size).toBe(0);
    const calls = (fetch as jest.Mock).mock.calls;
    const pages = calls
      .filter((call) => call[0].endsWith('/qorlia_return_paged_references'))
      .map((call) => JSON.parse(call[1].body).params.kwargs);
    expect(pages.map((page) => [page.after, page.limit])).toEqual([
      [0, 50],
      [50, 50],
      [100, 50],
      [0, 1],
    ]);
    expect(pages.map((page) => page.version)).toEqual([
      false,
      'e'.repeat(64),
      'e'.repeat(64),
      'e'.repeat(64),
    ]);
    expect(
      calls.filter((call) => call[0].endsWith('/qorlia_return_paged_status')),
    ).toHaveLength(2);
    expect(
      calls.filter((call) => call[0].endsWith('/web/session/get_session_info')),
    ).toHaveLength(2);
    expect(
      calls.some((call) => /qorlia_return_paged_(save|stop)$/.test(call[0])),
    ).toBe(false);
  });

  it('retires only an explicitly stopped exact request without pretending a return was created', async () => {
    const fake = database();
    await persistPagedStockReturnRecovery(3, completeReturn());
    returnOutcome('stopped');
    await clearPagedStockReturnRecovery(3, completeReturn());
    expect(fake.records.size).toBe(0);
    expect(
      (fetch as jest.Mock).mock.calls.filter((call) =>
        call[0].endsWith('/qorlia_return_paged_references'),
      ),
    ).toHaveLength(0);
  });

  it('requires the saved return reference and every page, not only the receipt count', async () => {
    const fake = database();
    await persistPagedStockReturnRecovery(3, completeReturn());
    const state = returnOutcome();
    state.rows[1].id = 99;
    await expect(
      clearPagedStockReturnRecovery(3, completeReturn()),
    ).rejects.toThrow(/saved return reference was not read/);
    expect(fake.records.get(3)).toEqual(returnEnvelope());
  });

  it('rejects overlapping reference pages across boundaries and keeps the exact request', async () => {
    const fake = database();
    await persistPagedStockReturnRecovery(3, completeReturn());
    const state = returnOutcome('accepted', 101);
    const native = (fetch as jest.Mock).getMockImplementation()!;
    (fetch as jest.Mock).mockImplementation(async (route, options) => {
      const response = await native(route, options);
      if (
        route.endsWith('/qorlia_return_paged_references') &&
        JSON.parse(options.body).params.kwargs.after === 50
      ) {
        const body = await response.json();
        body.result.rows = state.rows.slice(0, 50);
        return { ...response, json: async () => body };
      }
      return response;
    });
    await expect(
      clearPagedStockReturnRecovery(3, completeReturn()),
    ).rejects.toThrow(/pages overlap/);
    expect(fake.records.get(3)).toEqual(returnEnvelope());
  });

  it('retains pending state when references change after their last page or the final status changes', async () => {
    const fake = database();
    await persistPagedStockReturnRecovery(3, completeReturn());
    for (const mode of ['reference', 'status']) {
      const state = returnOutcome(),
        native = (fetch as jest.Mock).getMockImplementation()!;
      let statuses = 0;
      (fetch as jest.Mock).mockImplementation(async (route, options) => {
        if (route.endsWith('/qorlia_return_paged_status') && ++statuses === 2) {
          if (mode === 'reference') state.version = 'f'.repeat(64);
          else state.status.current.version = 'f'.repeat(64);
        }
        return native(route, options);
      });
      await expect(
        clearPagedStockReturnRecovery(3, completeReturn()),
      ).rejects.toThrow(/references changed|outcome changed/);
      expect(fake.records.get(3)).toEqual(returnEnvelope());
    }
  });

  it('does not retire another account/database or lose a request when the account changes during recovery', async () => {
    const fake = database();
    await persistPagedStockReturnRecovery(3, completeReturn());
    for (const session of [
      { uid: 4, db: billingDatabase },
      { uid: 3, db: 'another-database' },
    ]) {
      const state = returnOutcome();
      state.session = session;
      await expect(
        clearPagedStockReturnRecovery(3, completeReturn()),
      ).rejects.toThrow(/original Billing account/);
      expect(fake.records.get(3)).toEqual(returnEnvelope());
    }
    const state = returnOutcome(),
      native = (fetch as jest.Mock).getMockImplementation()!;
    let sessions = 0;
    (fetch as jest.Mock).mockImplementation(async (route, options) => {
      if (route.endsWith('/web/session/get_session_info') && ++sessions === 2)
        state.session.uid = 4;
      return native(route, options);
    });
    await expect(
      clearPagedStockReturnRecovery(3, completeReturn()),
    ).rejects.toThrow(/original Billing account/);
    expect(fake.records.get(3)).toEqual(returnEnvelope());
  });

  it('preserves a different request that appears before the final durable clear', async () => {
    const fake = database();
    await persistPagedStockReturnRecovery(3, completeReturn());
    returnOutcome();
    const native = (fetch as jest.Mock).getMockImplementation()!;
    const newer = { schema: 1, uid: 3, request: request() };
    let sessions = 0;
    (fetch as jest.Mock).mockImplementation(async (route, options) => {
      if (route.endsWith('/web/session/get_session_info') && ++sessions === 2)
        fake.records.set(3, newer);
      return native(route, options);
    });
    await expect(
      clearPagedStockReturnRecovery(3, completeReturn()),
    ).rejects.toThrow(/pending stock request changed/);
    expect(fake.records.get(3)).toEqual(newer);
  });

  it('retains a known accepted request if the deletion commit fails, and never replaces on a failed put', async () => {
    const fake = database();
    await persistPagedStockReturnRecovery(3, completeReturn());
    returnOutcome();
    fake.fail();
    await expect(
      clearPagedStockReturnRecovery(3, completeReturn()),
    ).rejects.toThrow(/could not be committed/);
    expect(fake.records.get(3)).toEqual(returnEnvelope());
    const empty = database();
    empty.fail();
    await expect(
      persistPagedStockReturnRecovery(3, completeReturn()),
    ).rejects.toThrow(/could not be committed/);
    expect(empty.records.size).toBe(0);
  });

  it('does not contact native services to clear a missing or different local request', async () => {
    const fake = database();
    await expect(
      clearPagedStockReturnRecovery(3, completeReturn()),
    ).rejects.toThrow(/not stored/);
    await persistPagedStockReturnRecovery(3, completeReturn());
    await expect(
      clearPagedStockReturnRecovery(3, { ...completeReturn(), location_id: 4 }),
    ).rejects.toThrow(/request changed/);
    expect(fake.records.get(3)).toEqual(returnEnvelope());
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe('Complete validation durable recovery and prior-action handoff', () => {
  beforeEach(() => {
    global.fetch = jest.fn();
  });
  const child = (
    parent = completeValidation(),
    first = '22222222',
  ): PagedStockValidationRequest => ({
    ...parent,
    request_key: `${first}-2222-4333-8444-555555555555`,
    continuation_key: parent.request_key,
    decisions: [{ kind: 'immediate', selected: true }],
  });
  it('stores every exact proof in database-bound schema 6 and blocks all older readers and writers', async () => {
    const fake = database(),
      exact = completeValidation();
    await persistPagedStockValidationRecovery(3, exact);
    expect(fake.records.get(3)).toEqual(validationEnvelope());
    expect(await loadPagedStockValidationRecovery(3)).toEqual({
      request: exact,
      history: [],
    });
    expect(isPagedStockValidationRequest(exact)).toBe(true);
    expect(isPagedStockWriteRequest(exact)).toBe(false);
    expect(await loadStockWriteRecovery(3)).toEqual(exact);
    await persistPagedStockValidationRecovery(3, exact);
    for (const other of [
      { ...exact, request_key: '99999999-2222-4333-8444-555555555555' },
      { ...exact, version: 'f'.repeat(64) },
      { ...exact, review_version: 'f'.repeat(64) },
      { ...exact, review_complete_token: 'f'.repeat(64) },
    ]) {
      await expect(
        persistPagedStockValidationRecovery(3, other),
      ).rejects.toThrow(/Another stock request/);
      expect(fake.records.get(3)).toEqual(validationEnvelope());
    }
    for (const load of [
      loadPagedStockWriteRecovery,
      loadStockValidationRecovery,
      loadStockReservationRecovery,
      loadStockOperationRecovery,
      loadStockConfirmationRecovery,
    ])
      await expect(load(3)).rejects.toThrow(
        /complete validation request is pending|older stock dialog/,
      );
    for (const [, other] of pagedRequests) {
      await expect(persistPagedStockWriteRecovery(3, other)).rejects.toThrow(
        /Another stock request/,
      );
      await expect(clearPagedStockWriteRecovery(3, other)).rejects.toThrow(
        /older stock dialog/,
      );
      expect(fake.records.get(3)).toEqual(validationEnvelope());
    }
    await expect(
      persistStockValidationRecovery(3, validationRequest()),
    ).rejects.toThrow(/Another stock request/);
    expect(fetch).not.toHaveBeenCalled();
    expect(fake.db.transaction).toHaveBeenCalledWith('pending', 'readwrite', {
      durability: 'strict',
    });
  });
  it('retains all ancestors through repeated stopped-child recovery and exact retry', async () => {
    const fake = database(),
      root = completeValidation(),
      next = child(root),
      later = child(next, '33333333');
    await persistPagedStockValidationRecovery(3, root);
    nativeOutcome(validationOutcome(root));
    await persistPagedStockValidationRecovery(3, next, root);
    nativeOutcome(validationOutcome(next));
    await persistPagedStockValidationRecovery(3, later, next);
    expect(fake.records.get(3)).toEqual(
      validationEnvelope(later, [root, next]),
    );
    await persistPagedStockValidationRecovery(3, later);
    expect((await loadPagedStockValidationRecovery(3))?.history).toEqual([
      root,
      next,
    ]);
    nativeOutcome(validationOutcome(later, 'stopped'));
    expect(await restoreStoppedPagedStockValidationRecovery(3, later)).toEqual(
      next,
    );
    expect(fake.records.get(3)).toEqual(validationEnvelope(next, [root]));
    const replacement = child(next, '44444444');
    nativeOutcome(validationOutcome(next));
    await persistPagedStockValidationRecovery(3, replacement, next);
    nativeOutcome(validationOutcome(replacement, 'stopped'));
    await restoreStoppedPagedStockValidationRecovery(3, replacement);
    expect(await loadPagedStockValidationRecovery(3)).toEqual({
      request: next,
      history: [root],
    });
    expect(
      (fetch as jest.Mock).mock.calls.every(
        (call) =>
          JSON.parse(call[1].body).params.method ===
          'qorlia_validation_paged_status',
      ),
    ).toBe(true);
  });
  it('explicitly continues an accepted legacy step and restores its unchanged schema on stop', async () => {
    const fake = database();
    const parent = { ...validationRequest(), continuation_key: false as const };
    await persistStockValidationRecovery(3, parent);
    const saved = JSON.parse(JSON.stringify(fake.records.get(3)));
    const next = child(completeValidation());
    const status = validationOutcome(completeValidation());
    nativeOutcome({
      accepted: true,
      ...status.receipt,
      current: status.current,
    });
    await persistPagedStockValidationRecovery(3, next, parent);
    expect(fake.records.get(3)).toEqual(validationEnvelope(next, [parent]));
    nativeOutcome(validationOutcome(next, 'stopped'));
    expect(await restoreStoppedPagedStockValidationRecovery(3, next)).toEqual(
      parent,
    );
    expect(fake.records.get(3)).toEqual(saved);
    expect(await loadStockValidationRecovery(3)).toEqual(parent);
  });
  it.each(['unknown', 'terminal', 'stopped'] as const)(
    'does not replace a parent with %s outcome',
    async (outcome) => {
      const fake = database(),
        root = completeValidation();
      await persistPagedStockValidationRecovery(3, root);
      nativeOutcome(validationOutcome(root, outcome));
      await expect(
        persistPagedStockValidationRecovery(3, child(root), root),
      ).rejects.toThrow(/not acknowledged/);
      expect(fake.records.get(3)).toEqual(validationEnvelope());
    },
  );
  it('keeps consumed or unavailable parent prompts and lost status reads intact', async () => {
    const fake = database(),
      root = completeValidation(),
      status = validationOutcome(root);
    await persistPagedStockValidationRecovery(3, root);
    if (!status.receipt) throw new Error('Missing fixture receipt');
    nativeOutcome({
      ...status,
      receipt: {
        ...status.receipt,
        next_step: false,
        prompt_count: 0,
        prompt_version: false,
        continuation_key: false,
        continuation_reason: 'Native prompt unavailable',
      },
    });
    await expect(
      persistPagedStockValidationRecovery(3, child(root), root),
    ).rejects.toThrow(/not acknowledged/);
    (fetch as jest.Mock).mockRejectedValue(new Error('Response lost'));
    await expect(
      persistPagedStockValidationRecovery(3, child(root), root),
    ).rejects.toThrow();
    expect(fake.records.get(3)).toEqual(validationEnvelope());
  });
  it.each(['open', 'unknown'] as const)(
    'does not restore or clear a request with %s outcome',
    async (outcome) => {
      const fake = database(),
        exact = completeValidation();
      await persistPagedStockValidationRecovery(3, exact);
      nativeOutcome(validationOutcome(exact, outcome));
      await expect(
        restoreStoppedPagedStockValidationRecovery(3, exact),
      ).rejects.toThrow(/not acknowledged as stopped/);
      await expect(clearPagedStockValidationRecovery(3, exact)).rejects.toThrow(
        /not terminal/,
      );
      expect(fake.records.get(3)).toEqual(validationEnvelope());
    },
  );
  it('retires a stopped initial request only after a fresh exact native stop acknowledgement', async () => {
    const fake = database(),
      exact = completeValidation();
    await persistPagedStockValidationRecovery(3, exact);
    nativeOutcome(validationOutcome(exact, 'stopped'));
    await expect(clearPagedStockValidationRecovery(3, exact)).rejects.toThrow(
      /not terminal/,
    );
    expect(fake.records.get(3)).toEqual(validationEnvelope());
    expect(
      await restoreStoppedPagedStockValidationRecovery(3, exact),
    ).toBeNull();
    expect(fake.records.size).toBe(0);
  });
  it('clears an accepted terminal decline without claiming physical delivery', async () => {
    const fake = database(),
      exact = completeValidation();
    await persistPagedStockValidationRecovery(3, exact);
    nativeOutcome(validationOutcome(exact, 'terminal'));
    expect(await clearPagedStockValidationRecovery(3, exact)).toBeNull();
    expect(fake.records.size).toBe(0);
  });
  it('waits for strict child and restore commits and preserves exact history on transaction abort', async () => {
    const fake = database(),
      root = completeValidation(),
      next = child(root);
    await persistPagedStockValidationRecovery(3, root);
    nativeOutcome(validationOutcome(root));
    fake.hold();
    let saved = false;
    const saving = persistPagedStockValidationRecovery(3, next, root).then(
      () => {
        saved = true;
      },
    );
    for (let i = 0; i < 16; i++) await Promise.resolve();
    expect(saved).toBe(false);
    expect(fake.records.get(3)).toEqual(validationEnvelope());
    fake.commit();
    await saving;
    nativeOutcome(validationOutcome(next, 'stopped'));
    let restored = false;
    const restoring = restoreStoppedPagedStockValidationRecovery(3, next).then(
      () => {
        restored = true;
      },
    );
    for (let i = 0; i < 16; i++) await Promise.resolve();
    expect(restored).toBe(false);
    expect(fake.records.get(3)).toEqual(validationEnvelope(next, [root]));
    fake.commit();
    await restoring;
    expect(fake.records.get(3)).toEqual(validationEnvelope());
    fake.fail();
    nativeOutcome(validationOutcome(root));
    await expect(
      persistPagedStockValidationRecovery(3, next, root),
    ).rejects.toThrow(/could not be committed/);
    expect(fake.records.get(3)).toEqual(validationEnvelope());
  });
  it('retains a stopped child or terminal receipt when restore or clear aborts', async () => {
    const fake = database(),
      root = completeValidation(),
      next = child(root);
    await persistPagedStockValidationRecovery(3, root);
    nativeOutcome(validationOutcome(root));
    await persistPagedStockValidationRecovery(3, next, root);
    fake.fail();
    nativeOutcome(validationOutcome(next, 'stopped'));
    await expect(
      restoreStoppedPagedStockValidationRecovery(3, next),
    ).rejects.toThrow(/could not be committed/);
    nativeOutcome(validationOutcome(next, 'terminal'));
    await expect(clearPagedStockValidationRecovery(3, next)).rejects.toThrow(
      /could not be committed/,
    );
    expect(fake.records.get(3)).toEqual(validationEnvelope(next, [root]));
  });
  it('keeps the full child history when a stop or terminal acknowledgement read is lost', async () => {
    const fake = database(),
      root = completeValidation(),
      next = child(root);
    await persistPagedStockValidationRecovery(3, root);
    nativeOutcome(validationOutcome(root));
    await persistPagedStockValidationRecovery(3, next, root);
    (fetch as jest.Mock).mockRejectedValue(new Error('Native response lost'));
    await expect(
      restoreStoppedPagedStockValidationRecovery(3, next),
    ).rejects.toThrow();
    await expect(clearPagedStockValidationRecovery(3, next)).rejects.toThrow();
    expect(fake.records.get(3)).toEqual(validationEnvelope(next, [root]));
  });
  it('retains the original parent if another tab changes the slot during its native read', async () => {
    const fake = database(),
      root = completeValidation(),
      next = child(root);
    await persistPagedStockValidationRecovery(3, root);
    const other = validationEnvelope({
      ...root,
      request_key: '99999999-2222-4333-8444-555555555555',
    });
    (fetch as jest.Mock).mockImplementation(async () => {
      fake.records.set(3, other);
      return {
        ok: true,
        status: 200,
        json: async () => ({ result: validationOutcome(root) }),
      };
    });
    await expect(
      persistPagedStockValidationRecovery(3, next, root),
    ).rejects.toThrow(/preceding recovery request changed/);
    expect(fake.records.get(3)).toEqual(other);
  });
  it('does not overwrite another tab changing recovery during an acknowledgement read', async () => {
    const fake = database(),
      exact = completeValidation(),
      other = {
        ...stockRequest(),
        request_key: '99999999-2222-4333-8444-555555555555',
      };
    const stored = { schema: 1, uid: 3, request: other };
    await persistPagedStockValidationRecovery(3, exact);
    (fetch as jest.Mock).mockImplementation(async () => {
      fake.records.set(3, stored);
      return {
        ok: true,
        status: 200,
        json: async () => ({ result: validationOutcome(exact, 'stopped') }),
      };
    });
    await expect(
      restoreStoppedPagedStockValidationRecovery(3, exact),
    ).rejects.toThrow(/recovery request changed/);
    expect(fake.records.get(3)).toEqual(stored);
    nativeOutcome(validationOutcome(exact, 'terminal'));
    expect(await clearPagedStockValidationRecovery(3, exact)).toEqual(other);
    expect(fake.records.get(3)).toEqual(stored);
  });
  it('rejects malformed histories and database/schema confusion without changing the stored entry', async () => {
    const fake = database(),
      root = completeValidation(),
      next = child(root);
    const stored = validationEnvelope(next, [root]);
    for (const invalid of [
      { ...stored, history: undefined },
      { ...stored, history: {} },
      { ...stored, history: [] },
      { ...stored, history: [next] },
      { ...stored, history: [root, root] },
      { ...stored, history: [{ ...root, order_id: 99 }] },
      { ...stored, history: [{ ...root, transfer_id: 99 }] },
      { ...stored, history: [{ ...root, review_complete_token: false }] },
      { ...stored, history: [{ ...root, context: {} }] },
      { ...stored, history: [validationRequest()] },
      { ...stored, schema: 5 },
      { ...stored, kind: 'validation_step' },
      { ...stored, uid: 4 },
      { ...stored, database: 'different' },
      { ...stored, extra: true },
      { ...stored, request: { ...next, context: {} } },
      {
        ...stored,
        history: [root],
        request: { ...next, continuation_key: false },
      },
    ]) {
      fake.records.set(3, invalid);
      await expect(loadPagedStockValidationRecovery(3)).rejects.toThrow();
      await expect(
        persistPagedStockValidationRecovery(3, next),
      ).rejects.toThrow();
      expect(fake.records.get(3)).toEqual(invalid);
    }
  });
  it('does not smuggle a complete request through legacy save or replacement APIs', async () => {
    const fake = database(),
      exact = completeValidation();
    await expect(persistStockValidationRecovery(3, exact)).rejects.toThrow();
    await expect(clearStockValidationRecovery(3, exact)).rejects.toThrow();
    await expect(
      replaceStockValidationRecovery(
        3,
        { ...validationRequest(), continuation_key: false },
        child(exact),
      ),
    ).rejects.toThrow(/complete validation recovery protocol/);
    expect(fake.factory.open).not.toHaveBeenCalled();
  });
  it('rejects invalid identity or proof before storage or native reads', async () => {
    const fake = database(),
      exact = completeValidation();
    await expect(
      persistPagedStockValidationRecovery(0, exact),
    ).rejects.toThrow();
    await expect(
      restoreStoppedPagedStockValidationRecovery(0, exact),
    ).rejects.toThrow();
    await expect(clearPagedStockValidationRecovery(0, exact)).rejects.toThrow();
    await expect(
      persistPagedStockValidationRecovery(3, {
        ...exact,
        review_complete_token: '',
      }),
    ).rejects.toThrow();
    expect(fake.factory.open).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });
  it('rejects a child without its exact stored parent and never starts a second pending stock action', async () => {
    const fake = database(),
      root = completeValidation(),
      next = child(root);
    await expect(persistPagedStockValidationRecovery(3, next)).rejects.toThrow(
      /history does not match/,
    );
    expect(fake.records.size).toBe(0);
    await persistStockReservationRecovery(3, stockRequest());
    const stored = JSON.parse(JSON.stringify(fake.records.get(3)));
    await expect(persistPagedStockValidationRecovery(3, root)).rejects.toThrow(
      /Another stock request/,
    );
    await expect(loadPagedStockValidationRecovery(3)).rejects.toThrow(
      /original workflow/,
    );
    expect(fake.records.get(3)).toEqual(stored);
  });
});

describe('Stock reservation IndexedDB recovery', () => {
  it.each(pagedRequests)(
    'keeps %s exact, database-bound and isolated in the existing slot',
    async (kind, exact) => {
      const fake = database();
      await persistPagedStockWriteRecovery(3, exact);
      expect(fake.records.get(3)).toEqual({
        schema: 5,
        kind,
        database: billingDatabase,
        uid: 3,
        request: exact,
      });
      expect(await loadPagedStockWriteRecovery(3)).toEqual(exact);
      expect(await loadStockWriteRecovery(3)).toEqual(exact);
      expect(isPagedStockWriteRequest((await loadStockWriteRecovery(3))!)).toBe(
        true,
      );
      await persistPagedStockWriteRecovery(3, exact);
      for (const load of [
        loadStockReservationRecovery,
        loadStockOperationRecovery,
        loadStockConfirmationRecovery,
        loadStockValidationRecovery,
      ])
        await expect(load(3)).rejects.toThrow(/older stock dialog/);
      for (const save of [
        () => persistStockReservationRecovery(3, stockRequest()),
        () => persistStockOperationRecovery(3, operationRequest()),
        () => persistStockConfirmationRecovery(3, confirmationRequest()),
        () => persistStockValidationRecovery(3, validationRequest()),
      ])
        await expect(save()).rejects.toThrow(/Another stock request/);
      const changed = { ...exact, review_complete_token: 'd'.repeat(64) };
      await expect(persistPagedStockWriteRecovery(3, changed)).rejects.toThrow(
        /Another stock request/,
      );
      expect(await clearPagedStockWriteRecovery(3, changed)).toEqual(exact);
      for (const [, other] of pagedRequests) {
        if (other === exact) continue;
        await expect(persistPagedStockWriteRecovery(3, other)).rejects.toThrow(
          /Another stock request/,
        );
        expect(await clearPagedStockWriteRecovery(3, other)).toEqual(exact);
      }
      await persistPagedStockWriteRecovery(4, exact);
      await clearPagedStockWriteRecovery(3, exact);
      expect(await loadPagedStockWriteRecovery(3)).toBeNull();
      expect(await loadPagedStockWriteRecovery(4)).toEqual(exact);
      expect(fake.db.transaction).toHaveBeenCalledWith('pending', 'readwrite', {
        durability: 'strict',
      });
    },
  );
  it('never converts or replaces any older recovery kind to start paged stock work', async () => {
    const fake = database(),
      exact = pagedRequests[0][1];
    const older = [
      { schema: 1, uid: 3, request: stockRequest() },
      { schema: 1, uid: 3, request: operationRequest() },
      {
        schema: 2,
        kind: 'confirmation',
        uid: 3,
        request: confirmationRequest(),
      },
      {
        schema: 3,
        kind: 'validation',
        database: billingDatabase,
        uid: 3,
        request: validationRequest(),
      },
      {
        schema: 4,
        kind: 'validation_step',
        database: billingDatabase,
        uid: 3,
        request: { ...validationRequest(), continuation_key: false },
      },
    ];
    for (const stored of older) {
      fake.records.set(3, stored);
      expect(await loadStockWriteRecovery(3)).toEqual(stored.request);
      await expect(loadPagedStockWriteRecovery(3)).rejects.toThrow(
        /older stock request/,
      );
      await expect(persistPagedStockWriteRecovery(3, exact)).rejects.toThrow(
        /Another stock request/,
      );
      expect(await clearPagedStockWriteRecovery(3, exact)).toEqual(
        stored.request,
      );
      expect(fake.records.get(3)).toEqual(stored);
    }
  });
  it('rejects wrong schemas, kinds, identities, databases and malformed completion proofs without changing recovery', async () => {
    const fake = database(),
      exact = pagedRequests[0][1];
    const stored = {
      schema: 5,
      kind: 'paged_reservation',
      uid: 3,
      database: billingDatabase,
      request: exact,
    };
    for (const changed of [
      { ...stored, schema: 6 },
      { ...stored, uid: 4 },
      { ...stored, database: `${billingDatabase}_other` },
      { ...stored, database: undefined },
      { ...stored, kind: 'reservation' },
      { ...stored, kind: 'paged_operation' },
      { ...stored, extra: true },
      { ...stored, request: stockRequest() },
      { ...stored, request: { ...exact, review_complete_token: false } },
      {
        ...stored,
        request: {
          ...exact,
          review_complete_token: 'continuation-not-completion',
        },
      },
      { ...stored, request: { ...exact, context: {} } },
      { schema: 1, uid: 3, request: exact },
      { schema: 1, uid: 3, request: pagedRequests[1][1] },
      { schema: 2, kind: 'confirmation', uid: 3, request: pagedRequests[2][1] },
      {
        schema: 3,
        kind: 'validation',
        uid: 3,
        database: billingDatabase,
        request: exact,
      },
      {
        schema: 4,
        kind: 'validation_step',
        uid: 3,
        database: billingDatabase,
        request: exact,
      },
    ]) {
      fake.records.set(3, changed);
      await expect(loadStockWriteRecovery(3)).rejects.toThrow();
      await expect(persistPagedStockWriteRecovery(3, exact)).rejects.toThrow();
      await expect(clearPagedStockWriteRecovery(3, exact)).rejects.toThrow();
      expect(fake.records.get(3)).toEqual(changed);
    }
  });
  it('rejects using a legacy writer for a paged proof before opening storage', async () => {
    const fake = database();
    await expect(
      persistStockReservationRecovery(3, pagedRequests[0][1]),
    ).rejects.toThrow();
    await expect(
      clearStockReservationRecovery(3, pagedRequests[0][1]),
    ).rejects.toThrow();
    await expect(
      persistStockOperationRecovery(3, pagedRequests[1][1]),
    ).rejects.toThrow();
    await expect(
      clearStockOperationRecovery(3, pagedRequests[1][1]),
    ).rejects.toThrow();
    await expect(
      persistStockConfirmationRecovery(3, pagedRequests[2][1]),
    ).rejects.toThrow();
    await expect(
      clearStockConfirmationRecovery(3, pagedRequests[2][1]),
    ).rejects.toThrow();
    const invalid = {
      ...validationRequest(),
      review_complete_token: 'c'.repeat(64),
    };
    await expect(persistStockValidationRecovery(3, invalid)).rejects.toThrow();
    await expect(clearStockValidationRecovery(3, invalid)).rejects.toThrow();
    expect(fake.factory.open).not.toHaveBeenCalled();
  });
  it('waits for durable paged save and clear commits and retains exact data after aborted writes', async () => {
    const fake = database(),
      exact = pagedRequests[1][1];
    fake.hold();
    let saved = false;
    const saving = persistPagedStockWriteRecovery(3, exact).then(() => {
      saved = true;
    });
    for (let i = 0; i < 4; i++) await Promise.resolve();
    expect(saved).toBe(false);
    expect(fake.records.size).toBe(0);
    fake.commit();
    await saving;
    let cleared = false;
    const clearing = clearPagedStockWriteRecovery(3, exact).then(() => {
      cleared = true;
    });
    for (let i = 0; i < 4; i++) await Promise.resolve();
    expect(cleared).toBe(false);
    expect(fake.records.get(3)).toMatchObject({ request: exact });
    fake.commit();
    await clearing;
    expect(fake.records.size).toBe(0);
    fake.fail();
    const failed = persistPagedStockWriteRecovery(3, exact);
    await expect(failed).rejects.toThrow(/could not be committed/);
    expect(fake.records.size).toBe(0);
    fake.records.set(3, {
      schema: 5,
      kind: 'paged_operation',
      uid: 3,
      database: billingDatabase,
      request: exact,
    });
    await expect(clearPagedStockWriteRecovery(3, exact)).rejects.toThrow(
      /could not be committed/,
    );
    expect(fake.records.get(3)).toMatchObject({ request: exact });
  });
  it('rejects invalid paged requests before storage and fails closed when storage is unavailable', async () => {
    const fake = database(),
      exact = pagedRequests[0][1];
    for (const invalid of [
      stockRequest(),
      { ...exact, review_complete_token: false },
      { ...exact, request_key: 'bad' },
      { ...exact, complete_inventory: true },
    ])
      await expect(
        persistPagedStockWriteRecovery(3, invalid as PagedStockWriteRequest),
      ).rejects.toThrow();
    await expect(persistPagedStockWriteRecovery(0, exact)).rejects.toThrow();
    expect(fake.factory.open).not.toHaveBeenCalled();
    Object.defineProperty(window, 'indexedDB', {
      configurable: true,
      value: undefined,
    });
    await expect(persistPagedStockWriteRecovery(3, exact)).rejects.toThrow(
      /unavailable/,
    );
  });
  const stepRequest = () => ({
    ...validationRequest(),
    continuation_key: false as const,
  });
  const nextStep = () => ({
    ...stepRequest(),
    request_key: '22222222-2222-4333-8444-555555555555',
    continuation_key: stepRequest().request_key,
    decisions: [{ kind: 'immediate' as const, selected: true }],
  });
  it('stores step requests as explicit database-bound schema 4 without reinterpreting old atomic recovery', async () => {
    const fake = database();
    await persistStockValidationRecovery(3, stepRequest());
    expect(fake.records.get(3)).toEqual({
      schema: 4,
      kind: 'validation_step',
      database: billingDatabase,
      uid: 3,
      request: stepRequest(),
    });
    expect(await loadStockValidationRecovery(3)).toEqual(stepRequest());
    expect(
      isStockValidationStepRequest((await loadStockValidationRecovery(3))!),
    ).toBe(true);
    for (const load of [
      loadStockReservationRecovery,
      loadStockOperationRecovery,
      loadStockConfirmationRecovery,
    ])
      await expect(load(3)).rejects.toThrow(/request is pending/);
    for (const exact of [
      validationRequest(),
      confirmationRequest(),
      operationRequest(),
      request(),
    ]) {
      await expect(
        persistStockValidationRecovery(
          3,
          exact as ReturnType<typeof validationRequest>,
        ),
      ).rejects.toThrow();
    }
    expect(await clearStockValidationRecovery(3, validationRequest())).toEqual(
      stepRequest(),
    );
    await clearStockValidationRecovery(3, stepRequest());
    await persistStockValidationRecovery(3, validationRequest());
    expect(await loadStockValidationRecovery(3)).toEqual(validationRequest());
    expect(
      isStockValidationStepRequest((await loadStockValidationRecovery(3))!),
    ).toBe(false);
    expect(fake.records.get(3)).toMatchObject({
      schema: 3,
      kind: 'validation',
    });
  });
  it('atomically replaces only the exact preceding step and waits for durable commit', async () => {
    const fake = database();
    await persistStockValidationRecovery(3, stepRequest());
    fake.hold();
    let resolved = false;
    const saving = replaceStockValidationRecovery(
      3,
      stepRequest(),
      nextStep(),
    ).then(() => {
      resolved = true;
    });
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(resolved).toBe(false);
    expect(fake.records.get(3)).toMatchObject({ request: stepRequest() });
    fake.commit();
    await saving;
    expect(fake.records.get(3)).toMatchObject({
      schema: 4,
      kind: 'validation_step',
      request: nextStep(),
    });
    expect(fake.db.transaction).toHaveBeenLastCalledWith(
      'pending',
      'readwrite',
      { durability: 'strict' },
    );
  });
  it('never replaces a missing, changed or older-kind recovery request', async () => {
    const fake = database();
    for (const stored of [
      undefined,
      {
        schema: 3,
        kind: 'validation',
        database: billingDatabase,
        uid: 3,
        request: validationRequest(),
      },
      {
        schema: 2,
        kind: 'confirmation',
        uid: 3,
        request: confirmationRequest(),
      },
      { schema: 1, uid: 3, request: operationRequest() },
      {
        schema: 4,
        kind: 'validation_step',
        database: billingDatabase,
        uid: 3,
        request: {
          ...stepRequest(),
          request_key: '33333333-2222-4333-8444-555555555555',
        },
      },
    ]) {
      if (stored) fake.records.set(3, stored);
      else fake.records.delete(3);
      await expect(
        replaceStockValidationRecovery(3, stepRequest(), nextStep()),
      ).rejects.toThrow(/preceding recovery request changed/);
      expect(fake.records.get(3)).toEqual(stored);
    }
  });
  it('rejects wrong continuation and foreign/malformed schema 4 without losing the old request', async () => {
    const fake = database();
    await persistStockValidationRecovery(3, stepRequest());
    for (const change of [
      { continuation_key: false as const },
      { transfer_id: 12 },
      { order_id: 10 },
    ]) {
      await expect(
        replaceStockValidationRecovery(3, stepRequest(), {
          ...nextStep(),
          ...change,
        }),
      ).rejects.toThrow();
      expect(fake.records.get(3)).toMatchObject({ request: stepRequest() });
    }
    for (const stored of [
      {
        schema: 4,
        kind: 'validation_step',
        database: `${billingDatabase}_other`,
        uid: 3,
        request: stepRequest(),
      },
      {
        schema: 4,
        kind: 'validation_step',
        database: billingDatabase,
        uid: 3,
        request: validationRequest(),
      },
      {
        schema: 3,
        kind: 'validation',
        database: billingDatabase,
        uid: 3,
        request: stepRequest(),
      },
      {
        schema: 4,
        kind: 'validation',
        database: billingDatabase,
        uid: 3,
        request: stepRequest(),
      },
    ]) {
      fake.records.set(3, stored);
      await expect(loadStockValidationRecovery(3)).rejects.toThrow();
      await expect(
        persistStockValidationRecovery(3, nextStep()),
      ).rejects.toThrow();
      expect(fake.records.get(3)).toEqual(stored);
    }
  });
  it('keeps the previous step when an atomic replacement aborts', async () => {
    const fake = database();
    await persistStockValidationRecovery(3, stepRequest());
    fake.fail();
    await expect(
      replaceStockValidationRecovery(3, stepRequest(), nextStep()),
    ).rejects.toThrow(/could not be committed/);
    expect(fake.records.get(3)).toMatchObject({ request: stepRequest() });
  });
  it('keeps validation choices durable in schema 3 and excludes every other stock writer', async () => {
    const fake = database();
    const exact = {
      ...validationRequest(),
      decisions: [
        { kind: 'immediate' as const, selected: true },
        { kind: 'expiry' as const, proceed: false },
      ],
    };
    await persistStockValidationRecovery(3, exact);
    expect(fake.records.get(3)).toEqual({
      schema: 3,
      kind: 'validation',
      database: billingDatabase,
      uid: 3,
      request: exact,
    });
    expect(await loadStockValidationRecovery(3)).toEqual(exact);
    for (const load of [
      loadStockReservationRecovery,
      loadStockOperationRecovery,
      loadStockConfirmationRecovery,
    ])
      await expect(load(3)).rejects.toThrow(/request is pending/);
    await expect(
      persistStockConfirmationRecovery(3, confirmationRequest()),
    ).rejects.toThrow(/Another stock request/);
    await expect(
      persistStockOperationRecovery(3, operationRequest()),
    ).rejects.toThrow(/Another stock request/);
    await expect(persistStockReservationRecovery(3, request())).rejects.toThrow(
      /Another stock request/,
    );
    expect(
      await clearStockConfirmationRecovery(3, confirmationRequest()),
    ).toEqual(exact);
    expect(
      await clearStockValidationRecovery(3, { ...exact, decisions: [] }),
    ).toEqual(exact);
    await persistStockValidationRecovery(4, exact);
    await clearStockValidationRecovery(3, exact);
    expect(await loadStockWriteRecovery(3)).toBeNull();
    expect(await loadStockValidationRecovery(4)).toEqual(exact);
  });
  it('does not reinterpret validation as an old request or overwrite malformed/foreign recovery', async () => {
    const fake = database();
    for (const value of [
      {
        schema: 3,
        uid: 3,
        kind: 'validation',
        database: `${billingDatabase}_other`,
        request: validationRequest(),
      },
      { schema: 1, uid: 3, request: validationRequest() },
      { schema: 2, uid: 3, kind: 'confirmation', request: validationRequest() },
      {
        schema: 3,
        database: billingDatabase,
        uid: 3,
        kind: 'confirmation',
        request: validationRequest(),
      },
      {
        schema: 3,
        database: billingDatabase,
        uid: 4,
        kind: 'validation',
        request: validationRequest(),
      },
      {
        schema: 3,
        database: billingDatabase,
        uid: 3,
        kind: 'validation',
        request: confirmationRequest(),
      },
      {
        schema: 3,
        uid: 3,
        kind: 'validation',
        database: billingDatabase,
        request: {
          ...validationRequest(),
          decisions: [{ kind: 'sms', selected: true }],
        },
      },
    ]) {
      fake.records.set(3, value);
      await expect(loadStockWriteRecovery(3)).rejects.toThrow();
      await expect(
        persistStockValidationRecovery(3, validationRequest()),
      ).rejects.toThrow();
      expect(fake.records.get(3)).toEqual(value);
    }
  });
  it('preserves all legacy kinds when validation attempts to load, save or clear', async () => {
    const fake = database();
    for (const [kind, exact] of [
      ['reservation', request()],
      ['operation', operationRequest()],
      ['confirmation', confirmationRequest()],
    ] as const) {
      fake.records.set(
        3,
        kind === 'confirmation'
          ? { schema: 2, kind, uid: 3, request: exact }
          : { schema: 1, uid: 3, request: exact },
      );
      await expect(loadStockValidationRecovery(3)).rejects.toThrow(
        /Another stock request/,
      );
      await expect(
        persistStockValidationRecovery(3, validationRequest()),
      ).rejects.toThrow(/Another stock request/);
      expect(
        await clearStockValidationRecovery(3, validationRequest()),
      ).toEqual(exact);
    }
  });
  it('stores explicitly typed confirmations in the existing durable per-account slot', async () => {
    const fake = database();
    await persistStockConfirmationRecovery(3, confirmationRequest());
    expect(fake.records.get(3)).toEqual({
      schema: 2,
      kind: 'confirmation',
      uid: 3,
      request: confirmationRequest(),
    });
    expect(await loadStockConfirmationRecovery(3)).toEqual(
      confirmationRequest(),
    );
    await expect(loadStockReservationRecovery(3)).rejects.toThrow(
      /confirmation request is pending/,
    );
    await expect(loadStockOperationRecovery(3)).rejects.toThrow(
      /confirmation request is pending/,
    );
    await expect(persistStockReservationRecovery(3, request())).rejects.toThrow(
      /Another stock request/,
    );
    await expect(
      persistStockOperationRecovery(3, operationRequest()),
    ).rejects.toThrow(/Another stock request/);
    expect(await clearStockReservationRecovery(3, request())).toEqual(
      confirmationRequest(),
    );
    expect(
      await clearStockConfirmationRecovery(3, {
        ...confirmationRequest(),
        request_key: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
      }),
    ).toEqual(confirmationRequest());
    await persistStockConfirmationRecovery(4, confirmationRequest());
    await clearStockConfirmationRecovery(3, confirmationRequest());
    expect(await loadStockWriteRecovery(3)).toBeNull();
    expect(await loadStockConfirmationRecovery(4)).toEqual(
      confirmationRequest(),
    );
    expect(fake.db.transaction).toHaveBeenCalledWith('pending', 'readwrite', {
      durability: 'strict',
    });
  });
  it('never reinterprets an old request missing its action as confirmation', async () => {
    const fake = database();
    for (const value of [
      { schema: 1, uid: 3, request: confirmationRequest() },
      {
        schema: 2,
        uid: 3,
        kind: 'reservation',
        request: confirmationRequest(),
      },
      { schema: 2, uid: 3, kind: 'confirmation', request: request() },
      {
        schema: 2,
        uid: 3,
        kind: 'confirmation',
        request: { ...confirmationRequest(), extra: true },
      },
    ]) {
      fake.records.set(3, value);
      await expect(loadStockWriteRecovery(3)).rejects.toThrow();
      await expect(
        persistStockConfirmationRecovery(3, confirmationRequest()),
      ).rejects.toThrow();
      expect(fake.records.get(3)).toEqual(value);
    }
  });
  it('keeps legacy reservations and operations recoverable while excluding a confirmation writer', async () => {
    database();
    for (const exact of [request(), operationRequest()]) {
      if ('move_id' in exact) await persistStockOperationRecovery(3, exact);
      else await persistStockReservationRecovery(3, exact);
      await expect(loadStockConfirmationRecovery(3)).rejects.toThrow(
        /Another stock request is pending/,
      );
      await expect(
        persistStockConfirmationRecovery(3, confirmationRequest()),
      ).rejects.toThrow(/Another stock request/);
      expect(
        await clearStockConfirmationRecovery(3, confirmationRequest()),
      ).toEqual(exact);
      if ('move_id' in exact) await clearStockOperationRecovery(3, exact);
      else await clearStockReservationRecovery(3, exact);
    }
  });
  it('waits for transaction commit, not just successful record access', async () => {
    const fake = database();
    fake.hold();
    let resolved = false;
    const saving = persistStockReservationRecovery(3, request()).then(() => {
      resolved = true;
    });
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(resolved).toBe(false);
    expect(fake.records.size).toBe(0);
    fake.commit();
    await saving;
    expect(resolved).toBe(true);
    expect(fake.db.transaction).toHaveBeenCalledWith('pending', 'readwrite', {
      durability: 'strict',
    });
    expect(fake.db.close).toHaveBeenCalledTimes(1);
  });
  it('retains exact request per user across reload and clears only that exact request', async () => {
    const fake = database();
    expect(await loadStockReservationRecovery(3)).toBeNull();
    await persistStockReservationRecovery(3, request());
    await persistStockReservationRecovery(4, request());
    expect(await loadStockReservationRecovery(3)).toEqual(request());
    await persistStockReservationRecovery(3, request());
    const other = {
      ...request(),
      request_key: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
    };
    await expect(persistStockReservationRecovery(3, other)).rejects.toThrow(
      /Another stock request/,
    );
    expect(await clearStockReservationRecovery(3, other)).toEqual(request());
    expect(await loadStockReservationRecovery(3)).toEqual(request());
    await clearStockReservationRecovery(3, request());
    expect(await loadStockReservationRecovery(3)).toBeNull();
    expect(await loadStockReservationRecovery(4)).toEqual(request());
    expect(fake.records.size).toBe(1);
  });
  it('rejects unknown schemas, foreign identity and malformed requests without overwriting', async () => {
    const fake = database();
    for (const value of [
      { schema: 2, uid: 3, request: request() },
      { schema: 1, uid: 4, request: request() },
      {
        schema: 1,
        uid: 3,
        request: {
          ...request(),
          transfer_id: 0,
        },
      },
    ]) {
      fake.records.set(3, value);
      await expect(loadStockReservationRecovery(3)).rejects.toThrow();
      await expect(
        persistStockReservationRecovery(3, request()),
      ).rejects.toThrow();
      expect(fake.records.get(3)).toEqual(value);
    }
  });
  it('fails closed on storage unavailability and aborted writes', async () => {
    Object.defineProperty(window, 'indexedDB', {
      configurable: true,
      value: undefined,
    });
    await expect(loadStockReservationRecovery(3)).rejects.toThrow(
      /unavailable/,
    );
    const fake = database();
    fake.fail();
    await expect(persistStockReservationRecovery(3, request())).rejects.toThrow(
      /could not be committed/,
    );
    expect(fake.records.size).toBe(0);
    expect(fake.db.close).toHaveBeenCalledTimes(1);
  });
  it('rejects invalid identities and invalid requests before opening storage', async () => {
    const fake = database();
    await expect(loadStockReservationRecovery(0)).rejects.toThrow();
    await expect(
      persistStockReservationRecovery(3, {
        ...request(),
        request_key: 'bad',
      }),
    ).rejects.toThrow();
    expect(fake.factory.open).not.toHaveBeenCalled();
  });
  it('uses the existing per-account slot for operations, never overwriting a pending reservation', async () => {
    database();
    await persistStockReservationRecovery(3, request());
    await expect(
      persistStockOperationRecovery(3, operationRequest()),
    ).rejects.toThrow(/Another stock request/);
    await expect(loadStockOperationRecovery(3)).rejects.toThrow(
      /reservation request is pending/,
    );
    expect(await clearStockOperationRecovery(3, operationRequest())).toEqual(
      request(),
    );
    expect(await loadStockWriteRecovery(3)).toEqual(request());
    await clearStockReservationRecovery(3, request());
    await persistStockOperationRecovery(3, operationRequest());
    expect(await loadStockWriteRecovery(3)).toEqual(operationRequest());
    expect(await loadStockOperationRecovery(3)).toEqual(operationRequest());
    await expect(loadStockReservationRecovery(3)).rejects.toThrow(
      /operation request is pending/,
    );
    await expect(persistStockReservationRecovery(3, request())).rejects.toThrow(
      /Another stock request/,
    );
    await clearStockReservationRecovery(3, request());
    expect(await loadStockWriteRecovery(3)).toEqual(operationRequest());
    await clearStockOperationRecovery(3, operationRequest());
    expect(await loadStockWriteRecovery(3)).toBeNull();
  });
  it('keeps exact deletion edits and identity across reload and waits for durable commit', async () => {
    const fake = database();
    fake.hold();
    const exact = {
      ...operationRequest(),
      action: 'delete' as const,
      edits: [],
    };
    let done = false;
    const saving = persistStockOperationRecovery(3, exact).then(() => {
      done = true;
    });
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(done).toBe(false);
    fake.commit();
    await saving;
    fake.commit();
    const loading = loadStockWriteRecovery(3);
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    fake.commit();
    expect(await loading).toEqual(exact);
  });
  it('rejects malformed stored operation requests without replacing them, and aborts failed writes', async () => {
    const fake = database();
    const invalid = {
      schema: 1,
      uid: 3,
      request: {
        ...operationRequest(),
        action: 'delete',
        edits: [],
        operation_id: false,
      },
    };
    fake.records.set(3, invalid);
    await expect(loadStockWriteRecovery(3)).rejects.toThrow();
    await expect(
      persistStockOperationRecovery(3, operationRequest()),
    ).rejects.toThrow();
    expect(fake.records.get(3)).toEqual(invalid);
    fake.records.clear();
    fake.fail();
    await expect(
      persistStockOperationRecovery(3, operationRequest()),
    ).rejects.toThrow(/could not be committed/);
    expect(fake.records.size).toBe(0);
  });
});
