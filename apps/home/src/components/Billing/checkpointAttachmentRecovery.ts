import {
  checkedCheckpointAttachmentRequest,
  CheckpointAttachmentSaveRequest,
} from './billingService';

const DATABASE = 'qorlia.billing.attachment-recovery';
const STORE = 'pending';

async function recovery(
  uid: number,
  operation: 'read' | 'save' | 'clear',
  request?: CheckpointAttachmentSaveRequest,
): Promise<CheckpointAttachmentSaveRequest | null> {
  if (!Number.isSafeInteger(uid) || uid <= 0)
    throw new Error('A signed-in Billing account is required for recovery.');
  const exact = request ? checkedCheckpointAttachmentRequest(request) : null;
  if (operation !== 'read' && !exact)
    throw new Error('Use an exact attachment request for recovery storage.');
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    let failed = false;
    if (!window.indexedDB)
      throw new Error(
        'Attachment recovery storage is unavailable. No new save can start.',
      );
    const open = window.indexedDB.open(DATABASE, 1);
    open.onupgradeneeded = () => open.result.createObjectStore(STORE);
    open.onerror = open.onblocked = () => {
      failed = true;
      reject(
        new Error(
          'Attachment recovery storage is unavailable. No new save can start.',
        ),
      );
    };
    open.onsuccess = () => {
      if (failed) open.result.close();
      else {
        open.result.onversionchange = () => open.result.close();
        resolve(open.result);
      }
    };
  });
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(
        STORE,
        operation === 'read' ? 'readonly' : 'readwrite',
        { durability: 'strict' },
      );
      let result: CheckpointAttachmentSaveRequest | null = null;
      let failure: Error | null = null;
      tx.oncomplete = () => resolve(result);
      tx.onabort = tx.onerror = () =>
        reject(
          failure ??
            new Error(
              'Attachment recovery storage could not be committed. Do not start another save.',
            ),
        );
      const store = tx.objectStore(STORE);
      const get = store.get(uid);
      get.onsuccess = () => {
        try {
          const value = get.result;
          if (value !== undefined) {
            if (
              typeof value !== 'object' ||
              Array.isArray(value) ||
              value?.schema !== 1 ||
              value.uid !== uid ||
              Object.keys(value).sort().join(',') !== 'request,schema,uid'
            )
              throw new Error(
                'Stored attachment recovery is invalid. Ask your Billing administrator to check the previous request.',
              );
            result = checkedCheckpointAttachmentRequest(value.request);
          }
          if (operation !== 'read') {
            if (result && JSON.stringify(result) !== JSON.stringify(exact)) {
              if (operation === 'save')
                throw new Error(
                  'Another attachment request is pending for this Billing account. Resume it before changing files.',
                );
              return;
            }
            if (operation === 'save') {
              store.put({ schema: 1, uid, request: exact }, uid);
              result = exact;
            } else {
              store.delete(uid);
              result = null;
            }
          }
        } catch (error) {
          failure =
            error instanceof Error
              ? error
              : new Error('Invalid attachment recovery storage.');
          tx.abort();
        }
      };
    });
  } finally {
    db.close();
  }
}

export const loadCheckpointAttachmentRecovery = (uid: number) =>
  recovery(uid, 'read');
export const persistCheckpointAttachmentRecovery = (
  uid: number,
  request: CheckpointAttachmentSaveRequest,
) => recovery(uid, 'save', request);
export const clearCheckpointAttachmentRecovery = (
  uid: number,
  request: CheckpointAttachmentSaveRequest,
) => recovery(uid, 'clear', request);
