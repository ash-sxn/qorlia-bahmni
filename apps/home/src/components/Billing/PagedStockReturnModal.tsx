import { Button, Modal, TextInput } from '@bahmni/design-system';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import styles from './BillingPage.module.scss';
import {
  BillingSessionExpired,
  checkedPagedStockReturnRequest,
  getPagedStockReturn,
  getPagedStockReturnLines,
  getPagedStockReturnReview,
  getPagedStockReturnStatus,
  getPagedStockReturnReferences,
  savePagedStockReturn,
  stopPagedStockReturn,
  type PagedStockReturnLoad,
  type PagedStockReturnLines,
  type PagedStockReturnReview,
  type PagedStockReturnRequest,
  type PagedStockReturnStatus,
  type PagedStockConfirmationReferences,
  type StockReturnSelection,
} from './billingService';
import {
  confirmationModelLabel,
  StockConfirmationEffects,
} from './StockConfirmationEffects';
import {
  loadPagedStockReturnRecovery,
  persistPagedStockReturnRecovery,
  clearPagedStockReturnRecovery,
} from './stockReservationRecovery';
import { StockReturnLocation } from './StockReturnLocation';
import { transferStates } from './stockTransferPages';

type Props = {
  uid: number;
  orderId: number;
  transferId: number;
  close: () => void;
  reconnect: () => void;
  returnFocus?: () => void;
  openTransfer: (orderId: number, transferId: number) => void;
};
type Draft = {
  load: PagedStockReturnLoad;
  rows: PagedStockReturnLines['rows'];
  next: number | false;
  position: number;
  quantities: Record<number, string>;
  removed: number[];
  location: [number, string];
};
type Session = {
  request: PagedStockReturnRequest | null;
  outcome: PagedStockReturnStatus | null;
  draft: Draft | null;
  error: Error | null;
};
type Review = {
  selection: StockReturnSelection;
  page: PagedStockReturnReview;
  pageNumber: number;
};
type References = {
  page: PagedStockConfirmationReferences;
  readTo: number;
  lastKey: string;
  foundReturn: boolean;
  unavailable: boolean;
};
const same = (a: unknown, b: unknown) =>
  JSON.stringify(a) === JSON.stringify(b);
const selectionOf = (load: PagedStockReturnLoad) => ({
  order_id: load.order_id,
  transfer_id: load.transfer_id,
  version: load.version,
});
function checkedFormPage(
  load: PagedStockReturnLoad,
  page: PagedStockReturnLines,
  after: number,
  lastId = 0,
) {
  if (
    page.order_id !== load.order_id ||
    page.transfer_id !== load.transfer_id ||
    page.version !== load.version ||
    !same(page.form, load.form) ||
    page.after !== after ||
    page.total_count !== load.line_count ||
    page.rows.some(
      (row, index) =>
        row.move_id <= (index ? page.rows[index - 1].move_id : lastId),
    ) ||
    page.rows.length !== Math.min(50, load.line_count - after) ||
    (after + page.rows.length < load.line_count
      ? page.next_after !== after + page.rows.length
      : page.next_after !== false)
  )
    throw new Error(
      'Native return form pages changed or overlap. Reload the complete form.',
    );
}
function reviewSnapshot(page: PagedStockReturnReview) {
  return [
    page.order_id,
    page.transfer_id,
    page.version,
    page.location_id,
    page.form,
    page.line_count,
    page.return_state,
    page.write_ready,
    page.review_version,
    page.total_count,
    page.effect_count,
    page.effects.private_effect_counts,
  ];
}

export function PagedStockReturnModal(props: Props) {
  return (
    <ReturnWorkflow
      key={`${props.uid}:${props.orderId}:${props.transferId}`}
      {...props}
    />
  );
}
function ReturnWorkflow({
  uid,
  orderId,
  transferId,
  close,
  reconnect,
  returnFocus,
  openTransfer,
}: Props) {
  const client = useQueryClient();
  const mounted = useRef(true),
    busyRef = useRef(false);
  const heading = useRef<HTMLHeadingElement>(null),
    errorHeading = useRef<HTMLParagraphElement>(null);
  const pageHeading = useRef<HTMLHeadingElement>(null),
    stopHeading = useRef<HTMLLegendElement>(null);
  const discardHeading = useRef<HTMLLegendElement>(null);
  const stopTrigger = useRef<HTMLButtonElement>(null);
  const [busy, setBusy] = useState(false),
    [failure, setFailure] = useState<Error | null>(null);
  const [local, setLocal] = useState<Session | null>(null);
  const [review, setReview] = useState<Review | null>(null);
  const [references, setReferences] = useState<References | null>(null);
  const [confirmStop, setConfirmStop] = useState(false);
  const [discard, setDiscard] = useState<
    'close' | 'reconnect' | 'reload' | null
  >(null);
  const loaded = useQuery({
    queryKey: ['billing', 'stock-return-paged', uid, orderId, transferId],
    queryFn: async (): Promise<Session> => {
      const request = await loadPagedStockReturnRecovery(uid);
      if (request) {
        if (request.order_id !== orderId || request.transfer_id !== transferId)
          throw new Error(
            'Another return request is pending. Resume its original transfer.',
          );
        try {
          return {
            request,
            outcome: await getPagedStockReturnStatus(request),
            draft: null,
            error: null,
          };
        } catch (value) {
          return {
            request,
            outcome: null,
            draft: null,
            error:
              value instanceof Error
                ? value
                : new Error('Return recovery is unavailable.'),
          };
        }
      }
      const load = await getPagedStockReturn(orderId, transferId);
      if (!load.form || !load.write_ready)
        return {
          request: null,
          outcome: null,
          draft: null,
          error: new Error(
            load.reason ||
              'This transfer cannot be returned under this account.',
          ),
        };
      const page = await getPagedStockReturnLines(selectionOf(load));
      checkedFormPage(load, page, 0);
      return {
        request: null,
        outcome: null,
        error: null,
        draft: {
          load,
          rows: page.rows,
          next: page.next_after,
          position: 0,
          quantities: {},
          removed: [],
          location: load.form.location,
        },
      };
    },
    retry: false,
    refetchOnMount: 'always',
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
  const session = local ?? loaded.data;
  const request = session?.request ?? null,
    outcome = session?.outcome ?? null,
    draft = session?.draft ?? null;
  const error = failure ?? session?.error ?? loaded.error;
  const expired = error instanceof BillingSessionExpired;
  const locked =
    busy ||
    loaded.isFetching ||
    loaded.isError ||
    expired ||
    !!discard ||
    confirmStop;
  const dirty =
    !!draft &&
    (Object.keys(draft.quantities).length > 0 ||
      draft.removed.length > 0 ||
      (draft.load.form && draft.location[0] !== draft.load.form.location[0]));
  const allReferences =
    !!references &&
    !!outcome?.accepted &&
    references.readTo === outcome.reference_count &&
    references.page.total_count === outcome.reference_count &&
    references.page.next_after === false &&
    references.foundReturn;
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      returnFocus?.();
    };
  }, [returnFocus]);
  useEffect(() => {
    if (!loaded.isFetching) heading.current?.focus();
  }, [loaded.isFetching]);
  useEffect(() => {
    if (!busy && error) errorHeading.current?.focus();
  }, [busy, error]);
  useEffect(() => {
    if (!busy) pageHeading.current?.focus();
  }, [busy, review, references, draft?.position]);
  useEffect(() => {
    if (discard) discardHeading.current?.focus();
  }, [discard]);
  useEffect(() => {
    if (!dirty && !request) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty, request]);
  const run = async (action: () => Promise<void>) => {
    if (busyRef.current || loaded.isFetching || loaded.isError || expired)
      return;
    busyRef.current = true;
    setBusy(true);
    setFailure(null);
    try {
      await action();
    } catch (value) {
      if (mounted.current)
        setFailure(
          value instanceof Error
            ? value
            : new Error('Return is unavailable. Keep the exact saved request.'),
        );
    } finally {
      busyRef.current = false;
      if (mounted.current) setBusy(false);
    }
  };
  const change = (update: Partial<Draft>) => {
    if (locked || request || review || !draft || !session) return;
    setFailure(null);
    setLocal({ ...session, draft: { ...draft, ...update } });
  };
  const removed = new Set(draft?.removed ?? []);
  const executeLeave = (action: 'close' | 'reconnect' | 'reload') => {
    if (action === 'close') close();
    else if (action === 'reconnect') reconnect();
    else {
      setLocal(null);
      setReview(null);
      setReferences(null);
      setFailure(null);
      setConfirmStop(false);
      void loaded.refetch();
    }
  };
  const leave = (action: 'close' | 'reconnect' | 'reload') => {
    if (busyRef.current) return;
    if (dirty && !request) setDiscard(action);
    else executeLeave(action);
  };
  const nextForm = () =>
    run(async () => {
      if (
        !draft ||
        !session ||
        error ||
        review ||
        request ||
        draft.next === false
      )
        return;
      const page = await getPagedStockReturnLines(
        selectionOf(draft.load),
        draft.next,
      );
      checkedFormPage(
        draft.load,
        page,
        draft.rows.length,
        draft.rows.at(-1)?.move_id,
      );
      if (mounted.current)
        setLocal({
          ...session,
          draft: {
            ...draft,
            position: draft.rows.length,
            rows: [...draft.rows, ...page.rows],
            next: page.next_after,
          },
        });
    });
  const readReview = () =>
    run(async () => {
      if (
        !draft ||
        error ||
        request ||
        draft.next !== false ||
        draft.rows.length !== draft.load.line_count
      )
        return;
      const selection: StockReturnSelection = review?.selection ?? {
        ...selectionOf(draft.load),
        location_id: draft.location[0],
        lines: draft.rows
          .filter((row) => !removed.has(row.move_id))
          .map((row) => {
            const raw = draft.quantities[row.move_id];
            const quantity =
              raw === undefined
                ? row.quantity
                : raw.trim() === ''
                  ? NaN
                  : Number(raw);
            if (!Number.isFinite(quantity))
              throw new Error(
                `Enter a finite return quantity for ${row.product[1]}.`,
              );
            return { move_id: row.move_id, quantity };
          }),
      };
      const previous = review?.page;
      if (previous?.next_after === false) return;
      setReview(null);
      const after = previous ? previous.next_after : 0;
      const page = await getPagedStockReturnReview(
        selection,
        after,
        previous?.review_version ?? false,
        previous?.continuation_token ?? false,
        50,
      );
      if (
        (previous && !same(reviewSnapshot(page), reviewSnapshot(previous))) ||
        !same(
          page.line_rows.map((row) => ({
            move_id: row.move_id,
            quantity: row.quantity,
          })),
          selection.lines.slice(
            after,
            Math.min(after + 50, selection.lines.length),
          ),
        )
      )
        throw new Error(
          'Return review pages changed or skip selected items. Start the complete review again.',
        );
      const originals = new Map(draft.rows.map((row) => [row.move_id, row]));
      if (
        page.line_rows.some((row) => {
          const original = originals.get(row.move_id);
          return (
            !original ||
            !same(row.product, original.product) ||
            !same(row.unit, original.unit) ||
            row.updates_order_quantities !== original.updates_order_quantities
          );
        })
      )
        throw new Error(
          'Native return item units or hidden rules changed. Reload the complete form.',
        );
      if (mounted.current)
        setReview({
          selection,
          page,
          pageNumber: (review?.pageNumber ?? 0) + 1,
        });
    });
  const show = (
    value: PagedStockReturnStatus,
    exact: PagedStockReturnRequest,
  ) => {
    if (!mounted.current) return;
    setLocal({ request: exact, outcome: value, draft: null, error: null });
    setReview(null);
    setReferences(null);
    setConfirmStop(false);
    queueMicrotask(() => {
      if (mounted.current) heading.current?.focus();
    });
  };
  const save = () =>
    run(async () => {
      let exact: PagedStockReturnRequest;
      if (request) {
        if (!outcome || outcome.accepted || outcome.stopped || error) return;
        if (!same(await loadPagedStockReturnRecovery(uid), request))
          throw new Error(
            'The saved request changed. Resume its original recovery.',
          );
        const fresh = await getPagedStockReturnStatus(request);
        if (fresh.accepted || fresh.stopped) {
          show(fresh, request);
          return;
        }
        exact = request;
      } else {
        if (
          !review ||
          error ||
          review.page.next_after !== false ||
          !review.page.review_complete_token
        )
          return;
        exact = checkedPagedStockReturnRequest({
          ...review.selection,
          review_version: review.page.review_version,
          review_complete_token: review.page.review_complete_token,
          request_key: crypto.randomUUID(),
        });
      }
      await persistPagedStockReturnRecovery(uid, exact);
      if (!mounted.current) return;
      setLocal({ request: exact, outcome: null, draft: null, error: null });
      setReview(null);
      setReferences(null);
      show(await savePagedStockReturn(exact), exact);
    });
  const check = () =>
    run(async () => {
      if (request) show(await getPagedStockReturnStatus(request), request);
    });
  const readReferences = () =>
    run(async () => {
      if (
        !request ||
        !outcome?.accepted ||
        !outcome.return_transfer ||
        error ||
        allReferences
      )
        return;
      const after = references?.readTo ?? 0;
      const page = await getPagedStockReturnReferences(
        request,
        after,
        references?.page.version ?? false,
        50,
      );
      if (
        page.total_count !== outcome.reference_count ||
        (references && page.version !== references.page.version)
      )
        throw new Error(
          'Saved reference pages changed. Check the exact return request again.',
        );
      let lastKey = references?.lastKey ?? '',
        foundReturn = references?.foundReturn ?? false;
      for (const row of page.rows) {
        if (row.key <= lastKey)
          throw new Error(
            'Saved return reference pages overlap. Check the exact request again.',
          );
        lastKey = row.key;
        const returned = outcome.return_transfer;
        if (
          row.model === returned.model &&
          row.id === returned.id &&
          row.name === returned.name &&
          row.available === returned.available
        )
          foundReturn = true;
      }
      if (
        page.next_after === false &&
        (!foundReturn || after + page.rows.length !== outcome.reference_count)
      )
        throw new Error(
          'The complete saved return reference is missing. Keep this exact request.',
        );
      if (mounted.current)
        setReferences({
          page,
          readTo: after + page.rows.length,
          lastKey,
          foundReturn,
          unavailable:
            (references?.unavailable ?? false) ||
            page.rows.some((row) => !row.available),
        });
    });
  const finish = (open: boolean) =>
    run(async () => {
      if (!request || !outcome || error || (!outcome.stopped && !allReferences))
        return;
      const returned = outcome.return_transfer;
      if (
        open &&
        (!outcome.accepted || !returned || !returned.available || !returned.id)
      )
        return;
      const fresh = await getPagedStockReturnStatus(request);
      if (!same(fresh, outcome)) {
        show(fresh, request);
        throw new Error(
          'The return outcome changed. Read its current references before finishing.',
        );
      }
      await clearPagedStockReturnRecovery(uid, request);
      await Promise.all(
        [
          'reservation-recovery',
          'order-deliveries',
          'order-transfer-details',
          'charge-lines',
        ].map((key) =>
          client.invalidateQueries({
            queryKey: ['billing', key, uid],
            refetchType: 'none',
          }),
        ),
      );
      if (mounted.current) {
        if (open && returned && returned.id) openTransfer(orderId, returned.id);
        else close();
      }
    });
  const stop = () =>
    run(async () => {
      if (!request || !confirmStop || outcome?.accepted || outcome?.stopped)
        return;
      if (!same(await loadPagedStockReturnRecovery(uid), request))
        throw new Error(
          'The saved return request changed. Do not stop another request.',
        );
      show(await stopPagedStockReturn(request), request);
    });
  const visibleRows =
    draft?.rows.slice(draft.position, draft.position + 50) ?? [];
  return (
    <Modal
      open
      passiveModal
      size="lg"
      modalHeading="Complete stock return"
      preventCloseOnClickOutside
      onRequestClose={() => leave('close')}
    >
      <section
        className={styles.card}
        aria-label="Native return workflow"
        aria-busy={busy || loaded.isFetching}
      >
        <h2 ref={heading} tabIndex={-1}>
          Review, create and recover a return
        </h2>
        <p>
          Creating a return prepares a separate stock transfer. It does not
          receive goods, reduce delivered quantities, issue a credit note or
          refund money. Receipt and validation are separate steps.
        </p>
        {loaded.isFetching ? (
          <p role="status">Loading native return and saved recovery...</p>
        ) : null}
        {busy ? (
          <p role="status">Checking native return and exact recovery...</p>
        ) : null}
        {error ? (
          <p
            ref={errorHeading}
            tabIndex={-1}
            role="alert"
            aria-label="Return workflow error"
          >
            {error.message}
          </p>
        ) : null}
        {expired ? (
          <Button onClick={() => leave('reconnect')}>Reconnect Billing</Button>
        ) : null}
        <Button
          kind="tertiary"
          disabled={busy || loaded.isFetching || !!discard || confirmStop}
          onClick={() => leave('reload')}
        >
          Reload return and recovery
        </Button>
        {draft && !request ? (
          <>
            <h3>{draft.load.transfer.name}</h3>
            <p>Return destination: {draft.location[1]}</p>
            {draft.load.form && draft.load.form.location_editable ? (
              <StockReturnLocation
                selection={selectionOf(draft.load)}
                disabled={locked || !!review}
                change={(location) => change({ location })}
                reconnect={() => leave('reconnect')}
              />
            ) : (
              <p>
                The native role controls this destination; it cannot be edited
                here.
              </p>
            )}
            {draft.load.form && draft.load.form.chained_move_warning ? (
              <p role="note">
                Native warning: this return can affect linked transfer
                reservations. Review all effects before creating it.
              </p>
            ) : null}
            {!review ? (
              <>
                <h3 ref={pageHeading} tabIndex={-1}>
                  Return items {draft.position + (visibleRows.length ? 1 : 0)}{' '}
                  to {draft.position + visibleRows.length}
                </h3>
                <p role="status">
                  Loaded {draft.rows.length} of {draft.load.line_count} native
                  return items. All original pages must be loaded before review.
                </p>
                <p>
                  Quantities use the product&apos;s native base unit. Native
                  defaults are suggestions, not a new maximum. Zero quantities
                  and removed rows retain native behavior.
                </p>
                <div
                  className={styles.tableScroll}
                  role="region"
                  aria-label="Return item editor"
                  tabIndex={0}
                >
                  <table>
                    <caption>Original native return items</caption>
                    <thead>
                      <tr>
                        <th scope="col">Include</th>
                        <th scope="col">Product</th>
                        <th scope="col">Quantity</th>
                        {draft.load.form && draft.load.form.show_units ? (
                          <th scope="col">Unit</th>
                        ) : null}
                        <th scope="col">Order quantity rule</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visibleRows.map((row) => (
                        <tr key={row.move_id}>
                          <td>
                            <input
                              aria-label={`Include move ${row.move_id}`}
                              type="checkbox"
                              checked={!removed.has(row.move_id)}
                              disabled={locked}
                              onChange={(event) =>
                                change({
                                  removed: event.target.checked
                                    ? draft.removed.filter(
                                        (id) => id !== row.move_id,
                                      )
                                    : [...draft.removed, row.move_id],
                                })
                              }
                            />
                          </td>
                          <td>
                            {row.product[1]}{' '}
                            <span className={styles.reference}>
                              Move #{row.move_id}
                            </span>
                          </td>
                          <td>
                            <TextInput
                              id={`return-quantity-${row.move_id}`}
                              labelText={`Return quantity for move ${row.move_id}`}
                              hideLabel
                              type="number"
                              step="any"
                              value={
                                draft.quantities[row.move_id] ?? row.quantity
                              }
                              disabled={locked || removed.has(row.move_id)}
                              onChange={(event) =>
                                change({
                                  quantities: {
                                    ...draft.quantities,
                                    [row.move_id]: event.target.value,
                                  },
                                })
                              }
                            />
                          </td>
                          {draft.load.form && draft.load.form.show_units ? (
                            <td>{row.unit[1]}</td>
                          ) : null}
                          <td>
                            {row.updates_order_quantities
                              ? 'Update order quantities on completed receipt'
                              : 'Keep order quantities'}{' '}
                            (native, read-only)
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className={styles.toolbar}>
                  <Button
                    kind="tertiary"
                    disabled={locked || draft.position === 0}
                    onClick={() =>
                      change({ position: Math.max(0, draft.position - 50) })
                    }
                  >
                    Previous return items
                  </Button>
                  {draft.position + 50 < draft.rows.length ? (
                    <Button
                      kind="tertiary"
                      disabled={locked}
                      onClick={() => change({ position: draft.position + 50 })}
                    >
                      Next loaded return items
                    </Button>
                  ) : null}
                  {draft.next !== false ? (
                    <Button
                      kind="tertiary"
                      disabled={locked || !!error}
                      onClick={() => void nextForm()}
                    >
                      Load next native return items
                    </Button>
                  ) : null}
                  <Button
                    disabled={
                      locked ||
                      !!error ||
                      draft.next !== false ||
                      draft.rows.length !== draft.load.line_count
                    }
                    onClick={() => void readReview()}
                  >
                    Review complete return
                  </Button>
                </div>
              </>
            ) : (
              <>
                <h3 ref={pageHeading} tabIndex={-1}>
                  Return review page {review.pageNumber}
                </h3>
                <p>
                  Native return creation state:{' '}
                  {transferStates[review.page.return_state]}. Review{' '}
                  {review.page.line_count} selected item rows, then{' '}
                  {review.page.effect_count} effect rows.
                </p>
                {review.page.form.chained_move_warning ? (
                  <p role="note">
                    The native review includes changes to linked transfer
                    reservations.
                  </p>
                ) : null}
                {review.page.line_rows.length ? (
                  <div
                    className={styles.tableScroll}
                    role="region"
                    aria-label="Reviewed return items"
                    tabIndex={0}
                  >
                    <table>
                      <caption>Native reviewed quantities and rules</caption>
                      <thead>
                        <tr>
                          <th scope="col">Product</th>
                          <th scope="col">Quantity</th>
                          {review.page.form.show_units ? (
                            <th scope="col">Unit</th>
                          ) : null}
                          <th scope="col">Order quantity rule</th>
                        </tr>
                      </thead>
                      <tbody>
                        {review.page.line_rows.map((row) => (
                          <tr key={row.move_id}>
                            <td>
                              {row.product[1]} (move #{row.move_id})
                            </td>
                            <td>{row.quantity}</td>
                            {review.page.form.show_units ? (
                              <td>{row.unit[1]}</td>
                            ) : null}
                            <td>
                              {row.updates_order_quantities
                                ? 'Update on completed receipt'
                                : 'Keep unchanged'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : null}
                <StockConfirmationEffects
                  effects={review.page.effects}
                  workflow="return creation"
                />
                {review.page.next_after !== false ? (
                  <Button
                    disabled={locked || !!error}
                    onClick={() => void readReview()}
                  >
                    Review next return page
                  </Button>
                ) : (
                  <p role="status">
                    All selected return items and native effect pages have been
                    reviewed.
                  </p>
                )}
                <Button
                  disabled={
                    locked ||
                    !!error ||
                    review.page.next_after !== false ||
                    !review.page.review_complete_token
                  }
                  onClick={() => void save()}
                >
                  Create reviewed return
                </Button>
                <Button
                  kind="tertiary"
                  disabled={locked}
                  onClick={() => {
                    setReview(null);
                    setFailure(null);
                  }}
                >
                  Back to return items
                </Button>
              </>
            )}
          </>
        ) : null}
        {request ? (
          <>
            <p>
              Exact return request: {request.request_key}. Closing keeps its
              recovery information.
            </p>
            <Button
              kind="tertiary"
              disabled={locked}
              onClick={() => void check()}
            >
              Check exact return request
            </Button>
            {!outcome?.accepted && !outcome?.stopped ? (
              <>
                <p role="status">
                  No accepted or stopped outcome is confirmed. Do not create a
                  replacement return.
                </p>
                <Button
                  disabled={locked || !!error || !outcome}
                  onClick={() => void save()}
                >
                  Retry identical return request
                </Button>
                <Button
                  ref={stopTrigger}
                  kind="tertiary"
                  disabled={locked}
                  onClick={() => {
                    setConfirmStop(true);
                    queueMicrotask(() => stopHeading.current?.focus());
                  }}
                >
                  Stop this exact return request
                </Button>
              </>
            ) : null}
            {confirmStop ? (
              <fieldset className={styles.draftItem} disabled={busy}>
                <legend ref={stopHeading} tabIndex={-1}>
                  Stop the pending return request?
                </legend>
                <p>
                  This only stops an unresolved creation request. A return
                  already accepted by the native system wins and cannot be
                  undone here.
                </p>
                <Button onClick={() => void stop()}>
                  Confirm stop return request
                </Button>
                <Button
                  kind="tertiary"
                  onClick={() => {
                    setConfirmStop(false);
                    queueMicrotask(() => stopTrigger.current?.focus());
                  }}
                >
                  Keep return request
                </Button>
              </fieldset>
            ) : null}
            {outcome?.stopped ? (
              <>
                <p role="status">
                  The native system acknowledged this exact request as stopped.
                  No return was created by it.
                </p>
                <Button
                  disabled={locked || !!error}
                  onClick={() => void finish(false)}
                >
                  Finish stopped return recovery
                </Button>
              </>
            ) : null}
            {outcome?.accepted ? (
              <>
                <h3>Return creation accepted</h3>
                <p>
                  State at creation:{' '}
                  {outcome.state_after
                    ? transferStates[outcome.state_after]
                    : 'Not available'}
                  . This is not confirmation of physical receipt.
                </p>
                <p>
                  Created return:{' '}
                  {outcome.return_transfer && outcome.return_transfer.available
                    ? outcome.return_transfer.name
                    : 'Unavailable under this account. Keep the reference warning and contact your Billing administrator.'}
                </p>
                {references ? (
                  <>
                    <h3 ref={pageHeading} tabIndex={-1}>
                      Saved return references {references.page.after + 1} to{' '}
                      {references.readTo}
                    </h3>
                    <ul>
                      {references.page.rows.map((row) => (
                        <li key={row.key}>
                          {confirmationModelLabel(row.model)}:{' '}
                          {row.available
                            ? `${row.name} (#${row.id})`
                            : 'Unavailable or no longer accessible'}
                        </li>
                      ))}
                    </ul>
                  </>
                ) : null}
                {references?.unavailable ? (
                  <p role="alert">
                    Some saved records are unavailable. Creation acceptance does
                    not restore access or prove that later receipt is complete.
                  </p>
                ) : null}
                {allReferences ? (
                  <p role="status">
                    All saved return reference pages have been read.
                  </p>
                ) : null}
                <Button
                  kind="tertiary"
                  disabled={locked || !!error || allReferences}
                  onClick={() => void readReferences()}
                >
                  {references
                    ? 'Next saved return reference page'
                    : 'Read saved return references'}
                </Button>
                <Button
                  disabled={
                    locked ||
                    !!error ||
                    !allReferences ||
                    !outcome.return_transfer ||
                    !outcome.return_transfer.available
                  }
                  onClick={() => void finish(true)}
                >
                  Open created transfer for receipt
                </Button>
                <Button
                  kind="tertiary"
                  disabled={locked || !!error || !allReferences}
                  onClick={() => void finish(false)}
                >
                  Finish return creation recovery
                </Button>
              </>
            ) : null}
          </>
        ) : null}
        {discard ? (
          <fieldset className={styles.draftItem}>
            <legend ref={discardHeading} tabIndex={-1}>
              Discard unsaved return edits?
            </legend>
            <p>
              These edits have not created a return. Saved pending requests are
              never discarded by this control.
            </p>
            <Button
              onClick={() => {
                const action = discard;
                setDiscard(null);
                executeLeave(action);
              }}
            >
              Discard unsaved edits
            </Button>
            <Button kind="tertiary" onClick={() => setDiscard(null)}>
              Keep editing return
            </Button>
          </fieldset>
        ) : null}
        <Button
          kind="tertiary"
          disabled={busy || loaded.isFetching || !!discard || confirmStop}
          onClick={() => leave('close')}
        >
          Close return workflow
        </Button>
      </section>
    </Modal>
  );
}
