import { StockReservationRequest } from '../billingService';
import {
  clearStockReservationRecovery,
  loadStockReservationRecovery,
  persistStockReservationRecovery,
  clearStockOperationRecovery,
  loadStockOperationRecovery,
  loadStockWriteRecovery,
  persistStockOperationRecovery,
} from '../stockReservationRecovery';
import { operationRequest } from './stockOperationFixture';
import { stockRequest } from './stockReservationFixture';

const request = (): StockReservationRequest => stockRequest();

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
