import { Button, Modal } from '@bahmni/design-system';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import styles from './BillingPage.module.scss';
import {
  BillingSessionExpired,
  checkedPagedStockConfirmationRequest,
  getPagedStockConfirmation,
  getPagedStockConfirmationReferences,
  getPagedStockConfirmationReview,
  getPagedStockConfirmationStatus,
  savePagedStockConfirmation,
  type PagedStockConfirmationLoad,
  type PagedStockConfirmationReferences,
  type PagedStockConfirmationRequest,
  type PagedStockConfirmationReview,
  type PagedStockConfirmationStatus,
} from './billingService';
import {
  confirmationModelLabel,
  StockConfirmationEffects,
} from './StockConfirmationEffects';
import {
  clearPagedStockWriteRecovery,
  isStockConfirmationRequest,
  loadPagedStockWriteRecovery,
  persistPagedStockWriteRecovery,
} from './stockReservationRecovery';
import { transferLabel as label } from './stockTransferPages';

type Props = {
  uid: number;
  orderId: number;
  transferId: number;
  close: () => void;
  reconnect: () => void;
  returnFocus?: () => void;
};
type ReviewCursor = {
  after: number;
  version: string | false;
  token: string | false;
};
type Review = { page: PagedStockConfirmationReview; cursors: ReviewCursor[] };
type References = { page: PagedStockConfirmationReferences; cursors: number[] };

export function PagedStockConfirmationModal(props: Props) {
  return (
    <ConfirmationReview
      key={`${props.uid}:${props.orderId}:${props.transferId}`}
      {...props}
    />
  );
}

function ConfirmationReview({
  uid,
  orderId,
  transferId,
  close,
  reconnect,
  returnFocus,
}: Props) {
  const client = useQueryClient();
  const mounted = useRef(true),
    busyRef = useRef(false);
  const reviewHeading = useRef<HTMLHeadingElement | null>(null);
  const referenceHeading = useRef<HTMLHeadingElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<
    PagedStockConfirmationRequest | null | undefined
  >(undefined);
  const [current, setCurrent] = useState<PagedStockConfirmationLoad | null>(
    null,
  );
  const [review, setReview] = useState<Review | null>(null);
  const [receipt, setReceipt] = useState<PagedStockConfirmationStatus | null>(
    null,
  );
  const [references, setReferences] = useState<References | null>(null);
  const [failure, setFailure] = useState<Error | null>(null);
  const [notice, setNotice] = useState('');
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
  const loaded = useQuery({
    queryKey: ['billing', 'stock-confirmation-paged', uid, orderId, transferId],
    queryFn: async () => {
      const request = await loadPagedStockWriteRecovery(uid);
      if (request && !isStockConfirmationRequest(request))
        throw new Error(
          'Another stock request is pending. Resume its original workflow before confirming a transfer.',
        );
      const status = request
        ? await getPagedStockConfirmationStatus(request)
        : null;
      return {
        request,
        status,
        state:
          status?.current ??
          (await getPagedStockConfirmation(orderId, transferId)),
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
  const accepted = receipt ?? loaded.data?.status;
  const expired =
    failure instanceof BillingSessionExpired ||
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
                'Confirmation is unavailable. Keep the exact recovery request.',
              ),
        );
    } finally {
      busyRef.current = false;
      if (mounted.current) setBusy(false);
    }
  };
  const showStatus = (value: PagedStockConfirmationStatus) => {
    if (!mounted.current) return;
    setCurrent(value.current);
    setReceipt(value);
    setReview(null);
    setReferences(null);
    setNotice(
      value.accepted
        ? 'This exact confirmation was accepted. Review saved references before finishing.'
        : 'No receipt found yet. This does not prove the earlier request stopped. Check again or retry only the identical request.',
    );
  };
  const reviewPage = (previous = false) =>
    run(async () => {
      if (!state || request || state.reason || !state.write_ready) return;
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
      const page = await getPagedStockConfirmationReview(
        {
          order_id: state.order_id,
          transfer_id: state.transfer_id,
          version: state.version,
        },
        cursor.after,
        cursor.version,
        cursor.token,
        50,
      );
      if (
        old &&
        (page.review_version !== old.review_version ||
          page.total_count !== old.total_count ||
          page.state_after !== old.state_after ||
          page.write_ready !== old.write_ready)
      )
        throw new Error(
          'Confirmation pages changed. Reload the transfer and start a new review.',
        );
      if (mounted.current) setReview({ page, cursors });
    });
  const save = () =>
    run(async () => {
      if (
        accepted?.accepted ||
        (!request &&
          (!review ||
            failure ||
            !review.page.write_ready ||
            review.page.next_after !== false ||
            !review.page.review_complete_token ||
            !state?.write_ready))
      )
        return;
      const exact =
        request ??
        checkedPagedStockConfirmationRequest({
          order_id: review!.page.order_id,
          transfer_id: review!.page.transfer_id,
          version: review!.page.version,
          review_version: review!.page.review_version,
          review_complete_token: review!.page.review_complete_token as string,
          request_key: crypto.randomUUID(),
        });
      await persistPagedStockWriteRecovery(uid, exact);
      if (!mounted.current) return;
      setPending(exact);
      // shortcut: Keep rejected requests pending until nonce-safe native cancellation is integrated.
      showStatus(await savePagedStockConfirmation(exact));
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
      const page = await getPagedStockConfirmationReferences(
        request,
        cursors[cursors.length - 1],
        old?.version ?? false,
        50,
      );
      if (page.total_count !== accepted.reference_count)
        throw new Error(
          'Saved reference counts changed. Check the exact confirmation request again.',
        );
      if (mounted.current) setReferences({ page, cursors });
    });
  const allReferencesRead =
    accepted?.accepted &&
    (accepted.reference_count === 0 || references?.page.next_after === false);
  const finish = () =>
    run(async () => {
      if (!request || !allReferencesRead) return;
      const fresh = await getPagedStockConfirmationStatus(request);
      if (
        !fresh.accepted ||
        fresh.reference_count !== accepted?.reference_count
      )
        throw new Error(
          'Accepted confirmation receipt changed or is unavailable. Keep this recovery request.',
        );
      await clearPagedStockWriteRecovery(uid, request);
      await Promise.all([
        client.invalidateQueries({
          queryKey: ['billing', 'order-deliveries', uid],
        }),
        client.invalidateQueries({
          queryKey: ['billing', 'reservation-recovery', uid],
        }),
        ...[
          'stock-confirmation-paged',
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
    });
  return (
    <Modal
      open
      passiveModal
      size="lg"
      modalHeading="Complete transfer confirmation review"
      preventCloseOnClickOutside
      onRequestClose={() => {
        if (!busyRef.current) close();
      }}
    >
      <section
        className={styles.card}
        aria-label="Complete transfer confirmation review"
        aria-busy={busy || loaded.isFetching}
      >
        <p>
          Mark as Todo can reserve stock, merge moves and create upstream
          transfers or vendor RFQs. It does not complete delivery, post an
          invoice or record a payment.
        </p>
        {loaded.isFetching ? (
          <p role="status">
            Reading confirmation state and the saved recovery request...
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
              {state.package_count} package operations
            </p>
            <p>
              From: {label(state.transfer.source)} · To:{' '}
              {label(state.transfer.destination)}
            </p>
            {request &&
            (request.order_id !== orderId ||
              request.transfer_id !== transferId) ? (
              <p role="status">
                Resolve this previous confirmation for its original order and
                transfer before another stock action.
              </p>
            ) : null}
            {!request ? (
              <>
                {state.reason ? <p>{state.reason}</p> : null}
                <Button
                  kind="tertiary"
                  disabled={
                    locked ||
                    !!state.reason ||
                    !state.write_ready ||
                    !!review ||
                    !!failure
                  }
                  onClick={() => void reviewPage()}
                >
                  Review Mark as Todo
                </Button>
              </>
            ) : null}
            {review && !request ? (
              <>
                <h3 ref={reviewHeading} tabIndex={-1}>
                  Confirmation effect page {review.cursors.length}
                </h3>
                <p role="status">
                  {review.page.after} earlier effects reviewed ·{' '}
                  {review.page.total_count} total effects · Resulting state:{' '}
                  {review.page.state_after}. This preview has not been saved.
                </p>
                <p>
                  Displayed records cover this page. Private audit counts apply
                  to the complete review.
                </p>
                <StockConfirmationEffects effects={review.page.effects} />
                <Button
                  kind="tertiary"
                  disabled={locked || review.cursors.length === 1 || !!failure}
                  onClick={() => void reviewPage(true)}
                >
                  Previous confirmation effects
                </Button>
                {review.page.next_after !== false ? (
                  <Button
                    kind="tertiary"
                    disabled={locked || !!failure}
                    onClick={() => void reviewPage()}
                  >
                    Review next confirmation effects
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
                    !state.write_ready ||
                    review.page.next_after !== false ||
                    !review.page.review_complete_token
                  }
                  onClick={() => void save()}
                >
                  Save reviewed confirmation
                </Button>
              </>
            ) : null}
          </>
        ) : null}
        {request ? (
          <>
            <p>
              Request: {request.request_key}.{' '}
              {accepted?.accepted
                ? 'The exact receipt is available.'
                : 'This request may already be saved. It is never retried automatically.'}
            </p>
            <Button
              kind="tertiary"
              disabled={locked}
              onClick={() =>
                void run(async () =>
                  showStatus(await getPagedStockConfirmationStatus(request)),
                )
              }
            >
              Check confirmation request
            </Button>
            {!accepted?.accepted ? (
              <Button
                kind="danger"
                disabled={locked}
                onClick={() => void save()}
              >
                Retry identical confirmation request
              </Button>
            ) : (
              <>
                <h3>Accepted confirmation: {accepted.state_after}</h3>
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
                      <section aria-label="Saved confirmation references">
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
              is not proof of cancellation. If it remains rejected, ask your
              Billing administrator to resolve it before starting another
              action.
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
            Reload confirmation state
          </Button>
        )}
        {loaded.isError ? (
          <Button
            kind="tertiary"
            disabled={busy || loaded.isFetching}
            onClick={() => void loaded.refetch()}
          >
            Reload confirmation recovery
          </Button>
        ) : null}
        {failure ? <p role="alert">{failure.message}</p> : null}
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
