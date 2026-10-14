import {
  checkedStockReservationRequest,
  StockReservationRequest,
} from './billingService';

const DATABASE = 'qorlia.billing.stock-reservation-recovery';
const STORE = 'pending';
async function recovery(
  uid: number,
  operation: 'read' | 'save' | 'clear',
  request?: StockReservationRequest,
): Promise<StockReservationRequest | null> {
  if (!Number.isSafeInteger(uid) || uid <= 0)
    throw new Error(
      'A signed-in Billing account is required for reservation recovery.',
    );
  const exact = request ? checkedStockReservationRequest(request) : null;
  if (operation !== 'read' && !exact)
    throw new Error('Use an exact reservation request for recovery storage.');
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    let failed = false;
    if (!window.indexedDB)
      throw new Error(
        'Reservation recovery storage is unavailable. No new save can start.',
      );
    const open = window.indexedDB.open(DATABASE, 1);
    open.onupgradeneeded = () => open.result.createObjectStore(STORE);
    open.onerror = open.onblocked = () => {
      failed = true;
      reject(
        new Error(
          'Reservation recovery storage is unavailable. No new save can start.',
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
      let result: StockReservationRequest | null = null;
      let failure: Error | null = null;
      tx.oncomplete = () => resolve(result);
      tx.onabort = tx.onerror = () =>
        reject(
          failure ??
            new Error(
              'Reservation recovery storage could not be committed. Do not start another save.',
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
                'Stored reservation recovery is invalid. Ask your Billing administrator to check the previous request.',
              );
            result = checkedStockReservationRequest(value.request);
          }
          if (operation !== 'read') {
            if (result && JSON.stringify(result) !== JSON.stringify(exact)) {
              if (operation === 'save')
                throw new Error(
                  'Another reservation request is pending for this Billing account. Resume it before changing stock.',
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
              : new Error('Invalid reservation recovery storage.');
          tx.abort();
        }
      };
    });
  } finally {
    db.close();
  }
}
export const loadStockReservationRecovery = (uid: number) =>
  recovery(uid, 'read');
export const persistStockReservationRecovery = (
  uid: number,
  request: StockReservationRequest,
) => recovery(uid, 'save', request);
export const clearStockReservationRecovery = (
  uid: number,
  request: StockReservationRequest,
) => recovery(uid, 'clear', request);
