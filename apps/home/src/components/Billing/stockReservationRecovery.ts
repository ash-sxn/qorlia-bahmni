import {
  checkedStockReservationRequest,
  StockReservationRequest,
  checkedStockOperationRequest,
  StockOperationRequest,
  checkedStockConfirmationRequest,
  StockConfirmationRequest,
  checkedStockValidationRequest,
  StockValidationRequest,
} from './billingService';

export type StockWriteRequest =
  | StockReservationRequest
  | StockOperationRequest
  | StockConfirmationRequest
  | StockValidationRequest;
export const isStockValidationRequest = (
  request: StockWriteRequest,
): request is StockValidationRequest => Object.hasOwn(request, 'decisions');
export const isStockConfirmationRequest = (
  request: StockWriteRequest,
): request is StockConfirmationRequest =>
  !Object.hasOwn(request, 'action') && !isStockValidationRequest(request);
export const isStockOperationRequest = (
  request: StockWriteRequest,
): request is StockOperationRequest =>
  'action' in request &&
  (request.action === 'save' || request.action === 'delete');
const checkedWriteRequest = (value: StockWriteRequest) =>
  value && isStockValidationRequest(value)
    ? checkedStockValidationRequest(value)
    : value && isStockConfirmationRequest(value)
      ? checkedStockConfirmationRequest(value)
      : value && isStockOperationRequest(value)
        ? checkedStockOperationRequest(value)
        : checkedStockReservationRequest(value as StockReservationRequest);

const DATABASE = 'qorlia.billing.stock-reservation-recovery';
const STORE = 'pending';
const BILLING_DATABASE = process.env.BAHMNI_BILLING_DATABASE ?? 'odoo';
async function recovery(
  uid: number,
  operation: 'read' | 'save' | 'clear',
  request?: StockWriteRequest,
): Promise<StockWriteRequest | null> {
  if (!Number.isSafeInteger(uid) || uid <= 0)
    throw new Error(
      'A signed-in Billing account is required for reservation recovery.',
    );
  const exact = request ? checkedWriteRequest(request) : null;
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
      let result: StockWriteRequest | null = null;
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
              value?.schema === 3 &&
              value.kind === 'validation' &&
              value.database !== BILLING_DATABASE
            )
              throw new Error(
                'This validation request belongs to another Billing database. Return to its original environment before starting another stock action.',
              );
            if (
              !value ||
              typeof value !== 'object' ||
              Array.isArray(value) ||
              value.uid !== uid ||
              (value.schema === 3
                ? value.kind !== 'validation' ||
                  value.database !== BILLING_DATABASE ||
                  Object.keys(value).sort().join(',') !==
                    'database,kind,request,schema,uid' ||
                  !value.request ||
                  !isStockValidationRequest(value.request)
                : value.schema === 2
                  ? value.kind !== 'confirmation' ||
                    Object.keys(value).sort().join(',') !==
                      'kind,request,schema,uid' ||
                    !value.request ||
                    !isStockConfirmationRequest(value.request)
                  : value.schema !== 1 ||
                    Object.keys(value).sort().join(',') !==
                      'request,schema,uid' ||
                    !value.request ||
                    isStockConfirmationRequest(value.request) ||
                    isStockValidationRequest(value.request))
            )
              throw new Error(
                'Stored reservation recovery is invalid. Ask your Billing administrator to check the previous request.',
              );
            result = checkedWriteRequest(value.request);
          }
          if (operation !== 'read') {
            if (result && JSON.stringify(result) !== JSON.stringify(exact)) {
              if (operation === 'save')
                throw new Error(
                  'Another stock request is pending for this Billing account. Resume it before changing stock.',
                );
              return;
            }
            if (operation === 'save') {
              store.put(
                exact && isStockValidationRequest(exact)
                  ? {
                      schema: 3,
                      kind: 'validation',
                      database: BILLING_DATABASE,
                      uid,
                      request: exact,
                    }
                  : exact && isStockConfirmationRequest(exact)
                    ? { schema: 2, kind: 'confirmation', uid, request: exact }
                    : { schema: 1, uid, request: exact },
                uid,
              );
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
export const loadStockWriteRecovery = (uid: number) => recovery(uid, 'read');
export async function loadStockReservationRecovery(uid: number) {
  const pending = await loadStockWriteRecovery(uid);
  if (pending && isStockValidationRequest(pending))
    throw new Error(
      'A validation request is pending. Resume it from stock transfers before another reservation.',
    );
  if (pending && isStockConfirmationRequest(pending))
    throw new Error(
      'A confirmation request is pending. Resume it from stock transfers before another reservation.',
    );
  if (pending && isStockOperationRequest(pending))
    throw new Error(
      'An operation request is pending. Resume it from stock transfers before another reservation.',
    );
  return pending;
}
export async function loadStockOperationRecovery(uid: number) {
  const pending = await loadStockWriteRecovery(uid);
  if (pending && isStockValidationRequest(pending))
    throw new Error(
      'A validation request is pending. Resume it from stock transfers before editing operations.',
    );
  if (pending && isStockConfirmationRequest(pending))
    throw new Error(
      'A confirmation request is pending. Resume it from stock transfers before editing operations.',
    );
  if (pending && !isStockOperationRequest(pending))
    throw new Error(
      'A reservation request is pending. Resume it from stock transfers before editing operations.',
    );
  return pending;
}
export const persistStockReservationRecovery = (
  uid: number,
  request: StockReservationRequest,
) => recovery(uid, 'save', request);
export const clearStockReservationRecovery = (
  uid: number,
  request: StockReservationRequest,
) => recovery(uid, 'clear', request);
export const persistStockOperationRecovery = (
  uid: number,
  request: StockOperationRequest,
) => recovery(uid, 'save', request);
export const clearStockOperationRecovery = (
  uid: number,
  request: StockOperationRequest,
) => recovery(uid, 'clear', request);
export async function loadStockConfirmationRecovery(uid: number) {
  const pending = await loadStockWriteRecovery(uid);
  if (pending && !isStockConfirmationRequest(pending))
    throw new Error(
      'Another stock request is pending. Resume it from stock transfers before confirming a transfer.',
    );
  return pending;
}
export const persistStockConfirmationRecovery = (
  uid: number,
  request: StockConfirmationRequest,
) => recovery(uid, 'save', request);
export const clearStockConfirmationRecovery = (
  uid: number,
  request: StockConfirmationRequest,
) => recovery(uid, 'clear', request);
export async function loadStockValidationRecovery(uid: number) {
  const pending = await loadStockWriteRecovery(uid);
  if (pending && !isStockValidationRequest(pending))
    throw new Error(
      'Another stock request is pending. Resume it from stock transfers before validating a transfer.',
    );
  return pending;
}
export const persistStockValidationRecovery = (
  uid: number,
  request: StockValidationRequest,
) => recovery(uid, 'save', request);
export const clearStockValidationRecovery = (
  uid: number,
  request: StockValidationRequest,
) => recovery(uid, 'clear', request);
