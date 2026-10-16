import {
  checkedStockReservationRequest,
  StockReservationRequest,
  checkedStockOperationRequest,
  StockOperationRequest,
  checkedStockConfirmationRequest,
  StockConfirmationRequest,
  checkedStockValidationRequest,
  StockValidationRequest,
  checkedStockValidationStepRequest,
  StockValidationStepRequest,
  checkedPagedStockConfirmationRequest,
  PagedStockConfirmationRequest,
  checkedPagedStockOperationRequest,
  PagedStockOperationRequest,
  checkedPagedStockReservationRequest,
  PagedStockReservationRequest,
} from './billingService';

export type PagedStockWriteRequest =
  | PagedStockConfirmationRequest
  | PagedStockOperationRequest
  | PagedStockReservationRequest;
export type StockWriteRequest =
  | StockReservationRequest
  | StockOperationRequest
  | StockConfirmationRequest
  | StockValidationRequest
  | StockValidationStepRequest
  | PagedStockWriteRequest;
export type StockValidationRecoveryRequest =
  | StockValidationRequest
  | StockValidationStepRequest;
export const isStockValidationStepRequest = (
  request: StockWriteRequest,
): request is StockValidationStepRequest =>
  Object.hasOwn(request, 'continuation_key');
export const isStockValidationRequest = (
  request: StockWriteRequest,
): request is StockValidationRecoveryRequest =>
  Object.hasOwn(request, 'decisions');
export const isStockConfirmationRequest = (
  request: StockWriteRequest,
): request is StockConfirmationRequest =>
  !Object.hasOwn(request, 'action') && !isStockValidationRequest(request);
export const isStockOperationRequest = (
  request: StockWriteRequest,
): request is StockOperationRequest =>
  'action' in request &&
  (request.action === 'save' || request.action === 'delete');
export const isPagedStockWriteRequest = (
  request: StockWriteRequest,
): request is PagedStockWriteRequest =>
  Object.hasOwn(request, 'review_complete_token');
const pagedKind = (request: PagedStockWriteRequest) =>
  isStockOperationRequest(request)
    ? 'paged_operation'
    : isStockConfirmationRequest(request)
      ? 'paged_confirmation'
      : 'paged_reservation';
const checkedPagedWriteRequest = (value: PagedStockWriteRequest) =>
  isStockOperationRequest(value)
    ? checkedPagedStockOperationRequest(value as PagedStockOperationRequest)
    : isStockConfirmationRequest(value)
      ? checkedPagedStockConfirmationRequest(
          value as PagedStockConfirmationRequest,
        )
      : checkedPagedStockReservationRequest(
          value as PagedStockReservationRequest,
        );
const checkedWriteRequest = (value: StockWriteRequest) =>
  value && isPagedStockWriteRequest(value)
    ? checkedPagedWriteRequest(value)
    : value && isStockValidationStepRequest(value)
      ? checkedStockValidationStepRequest(value)
      : value && isStockValidationRequest(value)
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
  previous?: StockValidationStepRequest,
): Promise<StockWriteRequest | null> {
  if (!Number.isSafeInteger(uid) || uid <= 0)
    throw new Error(
      'A signed-in Billing account is required for reservation recovery.',
    );
  const exact = request ? checkedWriteRequest(request) : null;
  const prior = previous ? checkedStockValidationStepRequest(previous) : null;
  if (
    prior &&
    (operation !== 'save' ||
      !exact ||
      !isStockValidationStepRequest(exact) ||
      exact.continuation_key !== prior.request_key ||
      exact.order_id !== prior.order_id ||
      exact.transfer_id !== prior.transfer_id)
  )
    throw new Error('Replace only the exact preceding native validation step.');
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
              ((value?.schema === 3 && value.kind === 'validation') ||
                (value?.schema === 4 && value.kind === 'validation_step') ||
                value?.schema === 5) &&
              value.database !== BILLING_DATABASE
            )
              throw new Error(
                'This stock request belongs to another Billing database. Return to its original environment before starting another stock action.',
              );
            if (
              !value ||
              typeof value !== 'object' ||
              Array.isArray(value) ||
              value.uid !== uid ||
              (value.schema !== 5 &&
                value.request &&
                isPagedStockWriteRequest(value.request)) ||
              (value.schema === 5
                ? value.database !== BILLING_DATABASE ||
                  Object.keys(value).sort().join(',') !==
                    'database,kind,request,schema,uid' ||
                  !value.request ||
                  !isPagedStockWriteRequest(value.request) ||
                  value.kind !== pagedKind(value.request)
                : value.schema === 4
                  ? value.kind !== 'validation_step' ||
                    value.database !== BILLING_DATABASE ||
                    Object.keys(value).sort().join(',') !==
                      'database,kind,request,schema,uid' ||
                    !value.request ||
                    !isStockValidationStepRequest(value.request)
                  : value.schema === 3
                    ? value.kind !== 'validation' ||
                      value.database !== BILLING_DATABASE ||
                      Object.keys(value).sort().join(',') !==
                        'database,kind,request,schema,uid' ||
                      !value.request ||
                      !isStockValidationRequest(value.request) ||
                      isStockValidationStepRequest(value.request)
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
            if (
              prior &&
              (!result || JSON.stringify(result) !== JSON.stringify(prior))
            )
              throw new Error(
                'The preceding recovery request changed. No new step can be saved.',
              );
            if (result && JSON.stringify(result) !== JSON.stringify(exact)) {
              if (operation === 'save' && !prior)
                throw new Error(
                  'Another stock request is pending for this Billing account. Resume it before changing stock.',
                );
              if (operation === 'clear') return;
            }
            if (operation === 'save') {
              store.put(
                exact && isPagedStockWriteRequest(exact)
                  ? {
                      schema: 5,
                      kind: pagedKind(exact),
                      database: BILLING_DATABASE,
                      uid,
                      request: exact,
                    }
                  : exact && isStockValidationStepRequest(exact)
                    ? {
                        schema: 4,
                        kind: 'validation_step',
                        database: BILLING_DATABASE,
                        uid,
                        request: exact,
                      }
                    : exact && isStockValidationRequest(exact)
                      ? {
                          schema: 3,
                          kind: 'validation',
                          database: BILLING_DATABASE,
                          uid,
                          request: exact,
                        }
                      : exact && isStockConfirmationRequest(exact)
                        ? {
                            schema: 2,
                            kind: 'confirmation',
                            uid,
                            request: exact,
                          }
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
async function loadLegacyStockWriteRecovery(uid: number) {
  const pending = await loadStockWriteRecovery(uid);
  if (pending && isPagedStockWriteRequest(pending))
    throw new Error(
      'A complete-review stock request is pending. Keep it intact and ask your Billing administrator to resume it. This older stock dialog cannot recover it.',
    );
  return pending;
}
export async function loadPagedStockWriteRecovery(uid: number) {
  const pending = await loadStockWriteRecovery(uid);
  if (pending && !isPagedStockWriteRequest(pending))
    throw new Error(
      'An older stock request is pending. Resume its original workflow before a complete-review stock action.',
    );
  return pending;
}
export const persistPagedStockWriteRecovery = async (
  uid: number,
  request: PagedStockWriteRequest,
) => recovery(uid, 'save', checkedPagedWriteRequest(request));
export const clearPagedStockWriteRecovery = async (
  uid: number,
  request: PagedStockWriteRequest,
) => recovery(uid, 'clear', checkedPagedWriteRequest(request));
export async function loadStockReservationRecovery(uid: number) {
  const pending = await loadLegacyStockWriteRecovery(uid);
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
  const pending = await loadLegacyStockWriteRecovery(uid);
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
export const persistStockReservationRecovery = async (
  uid: number,
  request: StockReservationRequest,
) => recovery(uid, 'save', checkedStockReservationRequest(request));
export const clearStockReservationRecovery = async (
  uid: number,
  request: StockReservationRequest,
) => recovery(uid, 'clear', checkedStockReservationRequest(request));
export const persistStockOperationRecovery = async (
  uid: number,
  request: StockOperationRequest,
) => recovery(uid, 'save', checkedStockOperationRequest(request));
export const clearStockOperationRecovery = async (
  uid: number,
  request: StockOperationRequest,
) => recovery(uid, 'clear', checkedStockOperationRequest(request));
export async function loadStockConfirmationRecovery(uid: number) {
  const pending = await loadLegacyStockWriteRecovery(uid);
  if (pending && !isStockConfirmationRequest(pending))
    throw new Error(
      'Another stock request is pending. Resume it from stock transfers before confirming a transfer.',
    );
  return pending;
}
export const persistStockConfirmationRecovery = async (
  uid: number,
  request: StockConfirmationRequest,
) => recovery(uid, 'save', checkedStockConfirmationRequest(request));
export const clearStockConfirmationRecovery = async (
  uid: number,
  request: StockConfirmationRequest,
) => recovery(uid, 'clear', checkedStockConfirmationRequest(request));
export async function loadStockValidationRecovery(uid: number) {
  const pending = await loadLegacyStockWriteRecovery(uid);
  if (pending && !isStockValidationRequest(pending))
    throw new Error(
      'Another stock request is pending. Resume it from stock transfers before validating a transfer.',
    );
  return pending;
}
export const persistStockValidationRecovery = async (
  uid: number,
  request: StockValidationRecoveryRequest,
) =>
  recovery(
    uid,
    'save',
    isStockValidationStepRequest(request)
      ? checkedStockValidationStepRequest(request)
      : checkedStockValidationRequest(request),
  );
export const clearStockValidationRecovery = async (
  uid: number,
  request: StockValidationRecoveryRequest,
) =>
  recovery(
    uid,
    'clear',
    isStockValidationStepRequest(request)
      ? checkedStockValidationStepRequest(request)
      : checkedStockValidationRequest(request),
  );
export const replaceStockValidationRecovery = (
  uid: number,
  previous: StockValidationStepRequest,
  request: StockValidationStepRequest,
) => recovery(uid, 'save', request, previous);
