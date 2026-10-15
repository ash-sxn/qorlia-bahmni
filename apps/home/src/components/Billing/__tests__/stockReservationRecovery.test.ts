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
} from '../stockReservationRecovery';
import { confirmationRequest } from './stockConfirmationFixture';
import { operationRequest } from './stockOperationFixture';
import { stockRequest } from './stockReservationFixture';
import { validationRequest } from './stockValidationFixture';

const request = (): StockReservationRequest => stockRequest();
const billingDatabase = process.env.BAHMNI_BILLING_DATABASE ?? 'odoo';

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
