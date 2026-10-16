import { StockReservationRequest } from '../billingService';
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
} from '../stockReservationRecovery';
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
