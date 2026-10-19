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
  checkedPagedStockValidationRequest,
  PagedStockValidationRequest,
  getPagedStockValidationStatus,
  getStockValidationStepCompactStatus,
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
  | PagedStockValidationRequest
  | PagedStockWriteRequest;
type ValidationParent =
  | StockValidationStepRequest
  | PagedStockValidationRequest;
export type PagedStockValidationRecovery = {
  request: PagedStockValidationRequest;
  history: ValidationParent[];
};
type RecoveryRecord = {
  request: StockWriteRequest;
  history: ValidationParent[];
};
export const isPagedStockValidationRequest = (
  request: StockWriteRequest,
): request is PagedStockValidationRequest =>
  Object.hasOwn(request, 'continuation_key') &&
  Object.hasOwn(request, 'review_complete_token');
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
  Object.hasOwn(request, 'review_complete_token') &&
  !isPagedStockValidationRequest(request);
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
  value && isPagedStockValidationRequest(value)
    ? checkedPagedStockValidationRequest(value)
    : value && isPagedStockWriteRequest(value)
      ? checkedPagedWriteRequest(value)
      : value && isStockValidationStepRequest(value)
        ? checkedStockValidationStepRequest(value)
        : value && isStockValidationRequest(value)
          ? checkedStockValidationRequest(value)
          : value && isStockConfirmationRequest(value)
            ? checkedStockConfirmationRequest(value)
            : value && isStockOperationRequest(value)
              ? checkedStockOperationRequest(value)
              : checkedStockReservationRequest(
                  value as StockReservationRequest,
                );

const DATABASE = 'qorlia.billing.stock-reservation-recovery';
const STORE = 'pending';
const BILLING_DATABASE = process.env.BAHMNI_BILLING_DATABASE ?? 'odoo';
function checkBillingUser(uid: number) {
  if (!Number.isSafeInteger(uid) || uid <= 0)
    throw new Error(
      'A signed-in Billing account is required for reservation recovery.',
    );
}
function checkedValidationHistory(
  request: PagedStockValidationRequest,
  value: unknown,
): ValidationParent[] {
  if (!Array.isArray(value))
    throw new Error('Keep the exact native validation recovery history.');
  const history = value.map((parent) =>
    parent && isPagedStockValidationRequest(parent)
      ? checkedPagedStockValidationRequest(parent)
      : checkedStockValidationStepRequest(parent),
  );
  const chain = [...history, request];
  const keys = new Set<string>();
  for (let index = 0; index < chain.length; index++) {
    const step = chain[index];
    if (
      keys.has(step.request_key) ||
      step.order_id !== request.order_id ||
      step.transfer_id !== request.transfer_id ||
      (index === 0
        ? isPagedStockValidationRequest(step) && step.continuation_key !== false
        : !isPagedStockValidationRequest(step) ||
          step.continuation_key !== chain[index - 1].request_key)
    )
      throw new Error('The native validation recovery history does not match.');
    keys.add(step.request_key);
  }
  return history;
}
async function recoveryRecord(
  uid: number,
  operation: 'read' | 'save' | 'clear' | 'restore',
  request?: StockWriteRequest,
  previous?: ValidationParent,
  restoredSource?: string | false,
): Promise<RecoveryRecord | null> {
  checkBillingUser(uid);
  const exact = request ? checkedWriteRequest(request) : null;
  const prior = previous
    ? isPagedStockValidationRequest(previous)
      ? checkedPagedStockValidationRequest(previous)
      : checkedStockValidationStepRequest(previous)
    : null;
  if (
    prior &&
    (operation !== 'save' ||
      !exact ||
      !isStockValidationStepRequest(exact) ||
      (isPagedStockValidationRequest(prior) &&
        !isPagedStockValidationRequest(exact)) ||
      exact.request_key === prior.request_key ||
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
      let history: ValidationParent[] = [];
      let failure: Error | null = null;
      tx.oncomplete = () =>
        resolve(result ? { request: result, history } : null);
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
                value?.schema === 5 ||
                value?.schema === 6) &&
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
              (![5, 6].includes(value.schema) &&
                value.request &&
                Object.hasOwn(value.request, 'review_complete_token')) ||
              (value.schema === 6
                ? value.database !== BILLING_DATABASE ||
                  value.kind !== 'paged_validation' ||
                  Object.keys(value).sort().join(',') !==
                    'database,history,kind,request,schema,uid' ||
                  !value.request ||
                  !isPagedStockValidationRequest(value.request)
                : value.schema === 5
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
            if (value.schema === 6)
              history = checkedValidationHistory(
                result as PagedStockValidationRequest,
                value.history,
              );
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
            if (operation === 'restore') {
              if (
                !result ||
                !exact ||
                !isPagedStockValidationRequest(result) ||
                JSON.stringify(result) !== JSON.stringify(exact) ||
                restoredSource !== (history.at(-1)?.request_key ?? false)
              )
                throw new Error(
                  'The stopped recovery request changed. Keep its exact history.',
                );
              result = history.at(-1) ?? null;
              history = history.slice(0, -1);
              if (result) {
                store.put(
                  isPagedStockValidationRequest(result)
                    ? {
                        schema: 6,
                        kind: 'paged_validation',
                        database: BILLING_DATABASE,
                        uid,
                        request: result,
                        history,
                      }
                    : {
                        schema: 4,
                        kind: 'validation_step',
                        database: BILLING_DATABASE,
                        uid,
                        request: result,
                      },
                  uid,
                );
              } else store.delete(uid);
              return;
            }
            if (operation === 'save') {
              if (exact && isPagedStockValidationRequest(exact)) {
                history = checkedValidationHistory(
                  exact,
                  prior
                    ? [...history, prior]
                    : result && JSON.stringify(result) === JSON.stringify(exact)
                      ? history
                      : [],
                );
                store.put(
                  {
                    schema: 6,
                    kind: 'paged_validation',
                    database: BILLING_DATABASE,
                    uid,
                    request: exact,
                    history,
                  },
                  uid,
                );
                result = exact;
                return;
              }
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
              history = [];
            } else {
              store.delete(uid);
              result = null;
              history = [];
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
async function recovery(
  uid: number,
  operation: 'read' | 'save' | 'clear',
  request?: StockWriteRequest,
  previous?: StockValidationStepRequest,
): Promise<StockWriteRequest | null> {
  if (
    (request && isPagedStockValidationRequest(request)) ||
    (previous && isPagedStockValidationRequest(previous))
  )
    throw new Error(
      'Use the complete validation recovery protocol. Do not convert its request.',
    );
  const result = await recoveryRecord(uid, operation, request, previous);
  if (result && isPagedStockValidationRequest(result.request))
    throw new Error(
      'A complete validation request is pending. Keep its exact recovery history. This older stock dialog cannot recover it.',
    );
  return result?.request ?? null;
}
export const loadStockWriteRecovery = async (
  uid: number,
): Promise<StockWriteRequest | null> =>
  (await recoveryRecord(uid, 'read'))?.request ?? null;
export async function loadPagedStockValidationRecovery(
  uid: number,
): Promise<PagedStockValidationRecovery | null> {
  const record = await recoveryRecord(uid, 'read');
  if (!record) return null;
  if (!isPagedStockValidationRequest(record.request))
    throw new Error(
      'Another stock request is pending. Resume its original workflow.',
    );
  return { request: record.request, history: record.history };
}
export async function persistPagedStockValidationRecovery(
  uid: number,
  request: PagedStockValidationRequest,
  previous?: ValidationParent,
) {
  checkBillingUser(uid);
  const exact = checkedPagedStockValidationRequest(request);
  if (previous) {
    const parent = isPagedStockValidationRequest(previous)
      ? checkedPagedStockValidationRequest(previous)
      : checkedStockValidationStepRequest(previous);
    const status = isPagedStockValidationRequest(parent)
      ? await getPagedStockValidationStatus(parent)
      : await getStockValidationStepCompactStatus(parent);
    const receipt = 'receipt' in status ? status.receipt : status;
    if (
      !status.accepted ||
      !receipt ||
      receipt.terminal ||
      !receipt.next_step ||
      receipt.continuation_reason ||
      receipt.continuation_key !== parent.request_key
    )
      throw new Error(
        'The preceding native prompt is not acknowledged as available. Keep its recovery request.',
      );
  }
  await recoveryRecord(uid, 'save', exact, previous);
}
export async function restoreStoppedPagedStockValidationRecovery(
  uid: number,
  request: PagedStockValidationRequest,
) {
  checkBillingUser(uid);
  const exact = checkedPagedStockValidationRequest(request);
  const status = await getPagedStockValidationStatus(exact);
  if (!status.stopped || status.accepted)
    throw new Error(
      'The exact validation request is not acknowledged as stopped. Keep its recovery history.',
    );
  return (
    (
      await recoveryRecord(
        uid,
        'restore',
        exact,
        undefined,
        status.receipt ? status.receipt.request_key : false,
      )
    )?.request ?? null
  );
}
export async function clearPagedStockValidationRecovery(
  uid: number,
  request: PagedStockValidationRequest,
) {
  checkBillingUser(uid);
  const exact = checkedPagedStockValidationRequest(request);
  const status = await getPagedStockValidationStatus(exact);
  if (!status.accepted || !status.receipt || !status.receipt.terminal)
    throw new Error(
      'The exact accepted validation is not terminal. Keep its recovery history.',
    );
  return (await recoveryRecord(uid, 'clear', exact))?.request ?? null;
}
async function loadLegacyStockWriteRecovery(uid: number) {
  const pending = await loadStockWriteRecovery(uid);
  if (
    pending &&
    (isPagedStockValidationRequest(pending) ||
      isPagedStockWriteRequest(pending))
  )
    throw new Error(
      'A complete-review stock request is pending. Keep it intact and ask your Billing administrator to resume it. This older stock dialog cannot recover it.',
    );
  return pending;
}
export async function loadPagedStockWriteRecovery(uid: number) {
  const pending = await loadStockWriteRecovery(uid);
  if (pending && isPagedStockValidationRequest(pending))
    throw new Error(
      'A complete validation request is pending. Resume it before another stock workflow.',
    );
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
