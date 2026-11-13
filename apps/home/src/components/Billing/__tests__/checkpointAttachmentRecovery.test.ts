import { CheckpointAttachmentSaveRequest } from '../billingService';
import {
  clearCheckpointAttachmentRecovery,
  loadCheckpointAttachmentRecovery,
  persistCheckpointAttachmentRecovery,
} from '../checkpointAttachmentRecovery';

const request = (): CheckpointAttachmentSaveRequest => ({
  request_key: '11111111-2222-4333-8444-555555555555',
  payload: {
    checkpoint_id: 9,
    version: 'a'.repeat(64),
    remove_ids: [7],
    uploads: [{ name: 'Synthetic.txt', content: 'YWI=' }],
  },
});

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

describe('Checkpoint attachment IndexedDB recovery', () => {
  it('waits for transaction commit, not just successful record access', async () => {
    const fake = database();
    fake.hold();
    let resolved = false;
    const saving = persistCheckpointAttachmentRecovery(3, request()).then(
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
    expect(resolved).toBe(true);
    expect(fake.db.transaction).toHaveBeenCalledWith('pending', 'readwrite', {
      durability: 'strict',
    });
    expect(fake.db.close).toHaveBeenCalledTimes(1);
  });
  it('retains exact bytes per user across reload and clears only that exact request', async () => {
    const fake = database();
    expect(await loadCheckpointAttachmentRecovery(3)).toBeNull();
    await persistCheckpointAttachmentRecovery(3, request());
    await persistCheckpointAttachmentRecovery(4, request());
    expect(await loadCheckpointAttachmentRecovery(3)).toEqual(request());
    await persistCheckpointAttachmentRecovery(3, request());
    const other = {
      ...request(),
      request_key: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
    };
    await expect(persistCheckpointAttachmentRecovery(3, other)).rejects.toThrow(
      /Another attachment request/,
    );
    expect(await clearCheckpointAttachmentRecovery(3, other)).toEqual(
      request(),
    );
    expect(await loadCheckpointAttachmentRecovery(3)).toEqual(request());
    await clearCheckpointAttachmentRecovery(3, request());
    expect(await loadCheckpointAttachmentRecovery(3)).toBeNull();
    expect(await loadCheckpointAttachmentRecovery(4)).toEqual(request());
    expect(fake.records.size).toBe(1);
  });
  it('rejects unknown schemas, foreign identity and malformed file content without overwriting', async () => {
    const fake = database();
    for (const value of [
      { schema: 2, uid: 3, request: request() },
      { schema: 1, uid: 4, request: request() },
      {
        schema: 1,
        uid: 3,
        request: {
          ...request(),
          payload: {
            ...request().payload,
            uploads: [{ name: '../bad', content: '' }],
          },
        },
      },
    ]) {
      fake.records.set(3, value);
      await expect(loadCheckpointAttachmentRecovery(3)).rejects.toThrow();
      await expect(
        persistCheckpointAttachmentRecovery(3, request()),
      ).rejects.toThrow();
      expect(fake.records.get(3)).toEqual(value);
    }
  });
  it('fails closed on storage unavailability and aborted writes', async () => {
    Object.defineProperty(window, 'indexedDB', {
      configurable: true,
      value: undefined,
    });
    await expect(loadCheckpointAttachmentRecovery(3)).rejects.toThrow(
      /unavailable/,
    );
    const fake = database();
    fake.fail();
    await expect(
      persistCheckpointAttachmentRecovery(3, request()),
    ).rejects.toThrow(/could not be committed/);
    expect(fake.records.size).toBe(0);
    expect(fake.db.close).toHaveBeenCalledTimes(1);
  });
  it('rejects invalid identities and invalid requests before opening storage', async () => {
    const fake = database();
    await expect(loadCheckpointAttachmentRecovery(0)).rejects.toThrow();
    await expect(
      persistCheckpointAttachmentRecovery(3, {
        ...request(),
        request_key: 'bad',
      }),
    ).rejects.toThrow();
    expect(fake.factory.open).not.toHaveBeenCalled();
  });
});
