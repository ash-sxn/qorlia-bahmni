import { Button, Modal } from '@bahmni/design-system';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import styles from './BillingPage.module.scss';
import {
  BillingSessionExpired,
  checkedPagedStockConfirmationRequest,
  checkedPagedStockReservationRequest,
  getPagedStockConfirmation,
  getPagedStockConfirmationReferences,
  getPagedStockConfirmationReview,
  getPagedStockConfirmationStatus,
  getPagedStockReservation,
  getPagedStockReservationReferences,
  getPagedStockReservationReview,
  getPagedStockReservationStatus,
  savePagedStockConfirmation,
  savePagedStockReservation,
  stopPagedStockConfirmation,
  stopPagedStockReservation,
  stockPreparationActions,
  type PagedStockConfirmationLoad,
  type PagedStockConfirmationReferences,
  type PagedStockConfirmationRequest,
  type PagedStockConfirmationReview,
  type PagedStockConfirmationStatus,
  type PagedStockReservationLoad,
  type PagedStockReservationRequest,
  type PagedStockReservationReview,
  type PagedStockReservationStatus,
  type StockReservationAction,
} from './billingService';
import {
  confirmationModelLabel,
  StockConfirmationEffects,
} from './StockConfirmationEffects';
import {
  clearPagedStockWriteRecovery,
  isStockConfirmationRequest,
  isStockOperationRequest,
  loadPagedStockWriteRecovery,
  persistPagedStockWriteRecovery,
} from './stockReservationRecovery';
import {
  stockPreparationLabels,
  transferLabel as label,
} from './stockTransferPages';

export type PagedStockWriteModalProps = {
  uid: number;
  orderId: number;
  transferId: number;
  close: () => void;
  reconnect: () => void;
  returnFocus?: () => void;
};
type Props = PagedStockWriteModalProps & {
  kind: 'confirmation' | 'preparation';
};
type Request = PagedStockConfirmationRequest | PagedStockReservationRequest;
type Status = PagedStockConfirmationStatus | PagedStockReservationStatus;
type Load = PagedStockConfirmationLoad | PagedStockReservationLoad;
type ReviewCursor = {
  after: number;
  version: string | false;
  token: string | false;
};
type Review = {
  page: PagedStockConfirmationReview | PagedStockReservationReview;
  cursors: ReviewCursor[];
};
type References = { page: PagedStockConfirmationReferences; cursors: number[] };
const requestStatus = (request: Request) =>
  request.action !== undefined
    ? getPagedStockReservationStatus(request)
    : getPagedStockConfirmationStatus(request);
const requestSave = (request: Request) =>
  request.action !== undefined
    ? savePagedStockReservation(request)
    : savePagedStockConfirmation(request);
const requestStop = (request: Request) =>
  request.action !== undefined
    ? stopPagedStockReservation(request)
    : stopPagedStockConfirmation(request);
const requestReferences = (
  request: Request,
  after: number,
  version: string | false,
) =>
  request.action !== undefined
    ? getPagedStockReservationReferences(request, after, version, 50)
    : getPagedStockConfirmationReferences(request, after, version, 50);

export function PagedStockWriteModal(props: Props) {
  return (
    <StockWriteReview
      key={`${props.kind}:${props.uid}:${props.orderId}:${props.transferId}`}
      {...props}
    />
  );
}

function StockWriteReview({
  kind,
  uid,
  orderId,
  transferId,
  close,
  reconnect,
  returnFocus,
}: Props) {
  const noun = kind === 'confirmation' ? 'confirmation' : 'preparation';
  const title = kind === 'confirmation' ? 'Confirmation' : 'Preparation';
  const heading = `Complete transfer ${noun} review`;
  const query =
    kind === 'confirmation'
      ? 'stock-confirmation-paged'
      : 'stock-reservation-paged';
  const client = useQueryClient();
  const mounted = useRef(true),
    busyRef = useRef(false);
  const reviewHeading = useRef<HTMLHeadingElement | null>(null);
  const referenceHeading = useRef<HTMLHeadingElement | null>(null);
  const stopHeading = useRef<HTMLLegendElement | null>(null);
  const stopTrigger = useRef<HTMLButtonElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<Request | null | undefined>(undefined);
  const [current, setCurrent] = useState<Status['current'] | null>(null);
  const [review, setReview] = useState<Review | null>(null);
  const [receipt, setReceipt] = useState<Status | null>(null);
  const [references, setReferences] = useState<References | null>(null);
  const [failure, setFailure] = useState<Error | null>(null);
  const [notice, setNotice] = useState('');
  const [confirmStop, setConfirmStop] = useState(false);
  const [stopped, setStopped] = useState(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      returnFocus?.();
    };
  }, [returnFocus]);
  useEffect(() => {
    if (review && !busy) reviewHeading.current?.focus();
  }, [review, busy]);
  useEffect(() => {
    if (references && !busy) referenceHeading.current?.focus();
  }, [references, busy]);
  useEffect(() => {
    if (confirmStop) stopHeading.current?.focus();
    else stopTrigger.current?.focus();
  }, [confirmStop]);
  const loaded = useQuery({
    queryKey: ['billing', query, uid, orderId, transferId],
    queryFn: async () => {
      const request = await loadPagedStockWriteRecovery(uid);
      if (
        request &&
        (isStockOperationRequest(request) ||
          (kind === 'confirmation'
            ? !isStockConfirmationRequest(request)
            : isStockConfirmationRequest(request)))
      )
        throw new Error(
          'Another stock request is pending. Resume its original workflow before starting this action.',
        );
      let status: Status | null = null;
      if (request) {
        try {
          status = await requestStatus(request);
        } catch (error) {
          // A lost stop response must not hide the exact request needed to recover it.
          return {
            request,
            status: null,
            state: null,
            load: null,
            recoveryError:
              error instanceof Error
                ? error
                : new Error('Request status is unavailable.'),
          };
        }
      }
      const load: Load | null = request
        ? null
        : await (kind === 'confirmation'
            ? getPagedStockConfirmation(orderId, transferId)
            : getPagedStockReservation(orderId, transferId));
      return {
        request,
        status,
        state: status?.current ?? load,
        load,
        recoveryError: null,
      };
    },
    retry: false,
    refetchOnMount: 'always',
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
  const request =
    pending === undefined ? (loaded.data?.request ?? null) : pending;
  const state = current ?? loaded.data?.state;
  const packageCount =
    state && 'package_count' in state && typeof state.package_count === 'number'
      ? state.package_count
      : null;
  const writable = request ? null : loaded.data?.load;
  const accepted = receipt ?? loaded.data?.status;
  const recoveryError = receipt || stopped ? null : loaded.data?.recoveryError;
  const expired =
    failure instanceof BillingSessionExpired ||
    recoveryError instanceof BillingSessionExpired ||
    loaded.error instanceof BillingSessionExpired;
  const locked = busy || loaded.isFetching || loaded.isError || expired;
  const run = async (action: () => Promise<void>) => {
    if (busyRef.current || loaded.isFetching || loaded.isError || expired)
      return;
    busyRef.current = true;
    setBusy(true);
    setFailure(null);
    setNotice('');
    try {
      await action();
    } catch (error) {
      if (mounted.current)
        setFailure(
          error instanceof Error
            ? error
            : new Error(
                `${title} is unavailable. Keep the exact recovery request.`,
              ),
        );
    } finally {
      busyRef.current = false;
      if (mounted.current) setBusy(false);
    }
  };
  const showStatus = (value: Status) => {
    if (!mounted.current) return;
    setCurrent(value.current);
    setReceipt(value);
    setReview(null);
    setReferences(null);
    setConfirmStop(false);
    setNotice(
      value.accepted
        ? `This exact ${noun} was accepted. Review saved references before finishing.`
        : 'No receipt found yet. This does not prove the earlier request stopped. Check again or retry only the identical request.',
    );
  };
  const reviewPage = (
    previous = false,
    selectedAction?: StockReservationAction,
  ) =>
    run(async () => {
      if (!writable || request || !writable.write_ready) return;
      const action =
        review && 'action' in review.page ? review.page.action : selectedAction;
      const preparing = 'reasons' in writable;
      if ((kind === 'preparation') !== preparing) return;
      if (preparing ? !action || !!writable.reasons[action] : !!writable.reason)
        return;
      const cursors = review
        ? previous
          ? review.cursors.slice(0, -1)
          : [
              ...review.cursors,
              {
                after: review.page.next_after as number,
                version: review.page.review_version,
                token: review.page.continuation_token,
              },
            ]
        : [{ after: 0, version: false as const, token: false as const }];
      if (!cursors.length || (!previous && review?.page.next_after === false))
        return;
      const cursor = cursors[cursors.length - 1];
      // Never keep effects from different previews on the same screen.
      const old = review?.page;
      setReview(null);
      const selection = {
        order_id: writable.order_id,
        transfer_id: writable.transfer_id,
        version: writable.version,
      };
      const page =
        kind === 'preparation' && action
          ? await getPagedStockReservationReview(
              { ...selection, action },
              cursor.after,
              cursor.version,
              cursor.token,
              50,
            )
          : await getPagedStockConfirmationReview(
              selection,
              cursor.after,
              cursor.version,
              cursor.token,
              50,
            );
      const previousAction = old && 'action' in old ? old.action : undefined;
      const nextAction = 'action' in page ? page.action : undefined;
      if (
        old &&
        (page.review_version !== old.review_version ||
          page.total_count !== old.total_count ||
          page.state_after !== old.state_after ||
          page.write_ready !== old.write_ready ||
          nextAction !== previousAction)
      )
        throw new Error(
          `${title} pages changed. Reload the transfer and start a new review.`,
        );
      if (mounted.current) setReview({ page, cursors });
    });
  const save = () =>
    run(async () => {
      if (
        stopped ||
        accepted?.accepted ||
        (!request &&
          (!review ||
            failure ||
            !review.page.write_ready ||
            review.page.next_after !== false ||
            !review.page.review_complete_token ||
            !writable?.write_ready))
      )
        return;
      let exact = request;
      if (!exact) {
        const page = review?.page;
        if (!page?.review_complete_token) return;
        const selection = {
          order_id: page.order_id,
          transfer_id: page.transfer_id,
          version: page.version,
          review_version: page.review_version,
          review_complete_token: page.review_complete_token,
          request_key: crypto.randomUUID(),
        };
        exact =
          'action' in page
            ? checkedPagedStockReservationRequest({
                ...selection,
                action: page.action,
              })
            : checkedPagedStockConfirmationRequest(selection);
      }
      await persistPagedStockWriteRecovery(uid, exact);
      if (!mounted.current) return;
      setPending(exact);
      showStatus(await requestSave(exact));
    });
  const referencePage = (previous = false) =>
    run(async () => {
      if (!request || !accepted?.accepted) return;
      const old = references?.page;
      const cursors = references
        ? previous
          ? references.cursors.slice(0, -1)
          : [...references.cursors, references.page.next_after as number]
        : [0];
      if (
        !cursors.length ||
        (!previous && references?.page.next_after === false)
      )
        return;
      setReferences(null);
      const page = await requestReferences(
        request,
        cursors[cursors.length - 1],
        old?.version ?? false,
      );
      if (page.total_count !== accepted.reference_count)
        throw new Error(
          `Saved reference counts changed. Check the exact ${noun} request again.`,
        );
      if (mounted.current) setReferences({ page, cursors });
    });
  const allReferencesRead =
    accepted?.accepted &&
    (accepted.reference_count === 0 || references?.page.next_after === false);
  const clearAndReload = async (exact: Request) => {
    await clearPagedStockWriteRecovery(uid, exact);
    await Promise.all([
      client.invalidateQueries({
        queryKey: ['billing', 'order-deliveries', uid],
      }),
      client.invalidateQueries({
        queryKey: ['billing', 'reservation-recovery', uid],
      }),
      ...[
        'stock-confirmation-paged',
        'stock-reservation-paged',
        'stock-confirmation',
        'stock-reservation',
        'stock-operation',
      ].map((key) =>
        client.invalidateQueries({
          queryKey: ['billing', key, uid],
          refetchType: 'none',
        }),
      ),
    ]);
    if (mounted.current) close();
  };
  const finish = () =>
    run(async () => {
      if (!request || !allReferencesRead) return;
      const fresh = await requestStatus(request);
      if (
        !fresh.accepted ||
        fresh.reference_count !== accepted?.reference_count
      )
        throw new Error(
          `Accepted ${noun} receipt changed or is unavailable. Keep this recovery request.`,
        );
      await clearAndReload(request);
    });
  const stop = () =>
    run(async () => {
      if (!request || !confirmStop || accepted?.accepted) return;
      const result = await requestStop(request);
      if (!mounted.current) return;
      if (result.accepted) {
        const fresh = await requestStatus(request);
        if (!fresh.accepted)
          throw new Error(
            'The accepted receipt is unavailable. Keep this recovery request and check it again.',
          );
        showStatus(fresh);
        return;
      }
      setStopped(true);
      setNotice(
        'The server stopped this exact request. Its stock action will not be applied.',
      );
      await clearAndReload(request);
    });
  return (
    <Modal
      open
      passiveModal
      size="lg"
      modalHeading={heading}
      preventCloseOnClickOutside
      onRequestClose={() => {
        if (!busyRef.current) close();
      }}
    >
      <section
        className={styles.card}
        aria-label={heading}
        aria-busy={busy || loaded.isFetching}
      >
        {kind === 'confirmation' ? (
          <p>
            Mark as Todo can reserve stock, merge moves and create upstream
            transfers or vendor RFQs. It does not complete delivery, post an
            invoice or record a payment.
          </p>
        ) : (
          <p>
            Reserve stock, release reservations or prepare recorded quantities
            through the native stock workflow. Recorded quantities are not
            delivered stock until validation. These actions do not complete
            delivery, post an invoice or record a payment.
          </p>
        )}
        {loaded.isFetching ? (
          <p role="status">
            Reading {noun} state and the saved recovery request...
          </p>
        ) : loaded.isError ? (
          <p role="alert">{loaded.error.message}</p>
        ) : state ? (
          <>
            <h2>{state.transfer.name}</h2>
            <p>
              Order #{state.order_id} · Transfer #{state.transfer_id} · State:{' '}
              {state.transfer.state} · Company: {label(state.transfer.company)}
            </p>
            <p>
              {state.transfer.move_count} stock moves ·{' '}
              {state.transfer.operation_count} detailed operations ·{' '}
              {packageCount !== null
                ? `${packageCount} package operations`
                : 'Package counts are not included in this recovery summary.'}
            </p>
            <p>
              From: {label(state.transfer.source)} · To:{' '}
              {label(state.transfer.destination)}
            </p>
            {request &&
            (request.order_id !== orderId ||
              request.transfer_id !== transferId) ? (
              <p role="status">
                Resolve this previous {noun} for its original order and transfer
                before another stock action.
              </p>
            ) : null}
            {!request && writable ? (
              'reason' in writable ? (
                <>
                  {writable.reason ? <p>{writable.reason}</p> : null}
                  <Button
                    kind="tertiary"
                    disabled={
                      locked ||
                      !!writable.reason ||
                      !writable.write_ready ||
                      !!review ||
                      !!failure
                    }
                    onClick={() => void reviewPage()}
                  >
                    Review Mark as Todo
                  </Button>
                </>
              ) : (
                stockPreparationActions.map((action) => (
                  <div key={action}>
                    {writable.reasons[action] ? (
                      <p>{writable.reasons[action]}</p>
                    ) : null}
                    <Button
                      kind="tertiary"
                      disabled={
                        locked ||
                        !!writable.reasons[action] ||
                        !writable.write_ready ||
                        !!review ||
                        !!failure
                      }
                      onClick={() => void reviewPage(false, action)}
                    >
                      Review {stockPreparationLabels[action]}
                    </Button>
                  </div>
                ))
              )
            ) : null}
            {review && !request ? (
              <>
                <h3 ref={reviewHeading} tabIndex={-1}>
                  {title} effect page {review.cursors.length}
                </h3>
                <p role="status">
                  {review.page.after} earlier effects reviewed ·{' '}
                  {review.page.total_count} total effects · Resulting state:{' '}
                  {review.page.state_after}. This preview has not been saved.
                </p>
                {'action' in review.page ? (
                  <p>Action: {stockPreparationLabels[review.page.action]}</p>
                ) : null}
                <p>
                  Displayed records cover this page. Private audit counts apply
                  to the complete review.
                </p>
                <StockConfirmationEffects
                  effects={review.page.effects}
                  workflow={noun}
                />
                <Button
                  kind="tertiary"
                  disabled={locked || review.cursors.length === 1 || !!failure}
                  onClick={() => void reviewPage(true)}
                >
                  Previous {noun} effects
                </Button>
                {review.page.next_after !== false ? (
                  <Button
                    kind="tertiary"
                    disabled={locked || !!failure}
                    onClick={() => void reviewPage()}
                  >
                    Review next {noun} effects
                  </Button>
                ) : (
                  <p role="status">
                    {review.page.write_ready
                      ? 'All effect pages reviewed. The complete review is ready to save.'
                      : 'All effect pages read. Saving is not available for this review.'}
                  </p>
                )}
                <Button
                  disabled={
                    locked ||
                    !!failure ||
                    !review.page.write_ready ||
                    !writable?.write_ready ||
                    review.page.next_after !== false ||
                    !review.page.review_complete_token
                  }
                  onClick={() => void save()}
                >
                  Save reviewed {noun}
                </Button>
              </>
            ) : null}
          </>
        ) : null}
        {request ? (
          <>
            <p>
              Order #{request.order_id} · Transfer #{request.transfer_id} ·{' '}
              Request: {request.request_key}.{' '}
              {accepted?.accepted
                ? 'The exact receipt is available.'
                : 'This request may already be saved. It is never retried automatically.'}
            </p>
            {request.action !== undefined ? (
              <p>Action: {stockPreparationLabels[request.action]}</p>
            ) : null}
            <Button
              kind="tertiary"
              disabled={locked || stopped}
              onClick={() =>
                void run(async () => showStatus(await requestStatus(request)))
              }
            >
              Check {noun} request
            </Button>
            {!accepted?.accepted ? (
              <>
                <Button
                  kind="danger"
                  disabled={locked || stopped}
                  onClick={() => void save()}
                >
                  Retry identical {noun} request
                </Button>
                {!confirmStop ? (
                  <Button
                    ref={stopTrigger}
                    kind="tertiary"
                    disabled={locked}
                    onClick={() => setConfirmStop(true)}
                  >
                    Stop pending {noun} request
                  </Button>
                ) : (
                  <fieldset disabled={locked}>
                    <legend ref={stopHeading} tabIndex={-1}>
                      Stop this exact request?
                    </legend>
                    <p>
                      This stops only a request the server has not accepted. It
                      does not cancel the transfer, undo reservations or reverse
                      an accepted action. If it was already accepted, its
                      receipt will be recovered instead. Keep the recovery
                      request until the server confirms the outcome.
                    </p>
                    <Button
                      kind="danger"
                      disabled={locked}
                      onClick={() => void stop()}
                    >
                      Confirm stop pending request
                    </Button>
                    <Button
                      kind="tertiary"
                      disabled={locked || stopped}
                      onClick={() => setConfirmStop(false)}
                    >
                      Keep pending request
                    </Button>
                  </fieldset>
                )}
              </>
            ) : (
              <>
                <h3>
                  Accepted {noun}: {accepted.state_after}
                </h3>
                {!accepted.reference_count ? (
                  <p>No new business document references were created.</p>
                ) : (
                  <>
                    <p>
                      {accepted.reference_count} saved business document
                      references.
                    </p>
                    {!references ? (
                      <Button
                        kind="tertiary"
                        disabled={locked}
                        onClick={() => void referencePage()}
                      >
                        Read saved references
                      </Button>
                    ) : (
                      <section aria-label={`Saved ${noun} references`}>
                        <h4 ref={referenceHeading} tabIndex={-1}>
                          Saved reference page {references.cursors.length}
                        </h4>
                        <ul>
                          {references.page.rows.map((item) => (
                            <li key={item.key}>
                              {confirmationModelLabel(item.model)}:{' '}
                              {item.available
                                ? `${item.name} (#${item.id})`
                                : 'No longer available or not readable by this account'}
                            </li>
                          ))}
                        </ul>
                        <Button
                          kind="tertiary"
                          disabled={locked || references.cursors.length === 1}
                          onClick={() => void referencePage(true)}
                        >
                          Previous saved references
                        </Button>
                        {references.page.next_after !== false ? (
                          <Button
                            kind="tertiary"
                            disabled={locked}
                            onClick={() => void referencePage()}
                          >
                            Next saved references
                          </Button>
                        ) : (
                          <p role="status">All saved reference pages read.</p>
                        )}
                      </section>
                    )}
                  </>
                )}
                <Button
                  kind="tertiary"
                  disabled={locked || !allReferencesRead}
                  onClick={() => void finish()}
                >
                  Finish and reload transfers
                </Button>
              </>
            )}
            <p>
              Keep this request after any failed response. An unaccepted status
              is not proof of cancellation. Only a matching server stop result
              allows this pending request to be cleared without an accepted
              receipt.
            </p>
          </>
        ) : (
          <Button
            kind="tertiary"
            disabled={busy || expired}
            onClick={() => {
              if (busyRef.current) return;
              setReview(null);
              setReceipt(null);
              setCurrent(null);
              setPending(undefined);
              setReferences(null);
              setFailure(null);
              setNotice('');
              void loaded.refetch();
            }}
          >
            Reload {noun} state
          </Button>
        )}
        {loaded.isError ? (
          <Button
            kind="tertiary"
            disabled={busy || loaded.isFetching}
            onClick={() => void loaded.refetch()}
          >
            Reload {noun} recovery
          </Button>
        ) : null}
        {failure ? <p role="alert">{failure.message}</p> : null}
        {recoveryError ? <p role="alert">{recoveryError.message}</p> : null}
        {notice ? <p role="status">{notice}</p> : null}
        {expired ? (
          <Button kind="tertiary" disabled={busy} onClick={reconnect}>
            Reconnect Billing
          </Button>
        ) : null}
        <Button
          kind="tertiary"
          disabled={busy}
          onClick={() => {
            if (!busyRef.current) close();
          }}
        >
          Back to stock transfers
        </Button>
      </section>
    </Modal>
  );
}
