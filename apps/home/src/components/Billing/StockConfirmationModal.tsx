import { Button, Modal } from '@bahmni/design-system';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import styles from './BillingPage.module.scss';
import {
  BillingActionRejected,
  BillingSessionExpired,
  checkedStockConfirmationRequest,
  getStockConfirmation,
  getStockConfirmationStatus,
  previewStockConfirmation,
  saveStockConfirmation,
  StockConfirmationLoad,
  StockConfirmationRequest,
  StockConfirmationReview,
  StockConfirmationStatus,
} from './billingService';
import {
  confirmationModelLabel,
  StockConfirmationEffects,
} from './StockConfirmationEffects';
import {
  clearStockConfirmationRecovery,
  loadStockConfirmationRecovery,
  persistStockConfirmationRecovery,
} from './stockReservationRecovery';

type Props = {
  uid: number;
  orderId: number;
  transferId: number;
  close: () => void;
  reconnect: () => void;
  returnFocus?: () => void;
};
export function StockConfirmationModal(props: Props) {
  // Never carry a reviewed request or an asynchronous result across identities.
  return (
    <ConfirmationReview
      key={`${props.uid}:${props.orderId}:${props.transferId}`}
      {...props}
    />
  );
}
const label = (relation: [number, string] | false) =>
  relation ? relation[1] : 'Not set';
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
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      returnFocus?.();
    };
  }, [returnFocus]);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<
    StockConfirmationRequest | null | undefined
  >(undefined);
  const [current, setCurrent] = useState<StockConfirmationLoad | null>(null);
  const [review, setReview] = useState<StockConfirmationReview | null>(null);
  const [receipt, setReceipt] = useState<StockConfirmationStatus | null>(null);
  const [failure, setFailure] = useState<Error | null>(null);
  const [notice, setNotice] = useState('');
  const loaded = useQuery({
    queryKey: ['billing', 'stock-confirmation', uid, orderId, transferId],
    queryFn: async () => {
      const request = await loadStockConfirmationRecovery(uid);
      const state = await getStockConfirmation(
        request?.order_id ?? orderId,
        request?.transfer_id ?? transferId,
      );
      return { request, state };
    },
    retry: false,
    refetchOnMount: 'always',
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
  const request =
    pending === undefined ? (loaded.data?.request ?? null) : pending;
  const state = current ?? loaded.data?.state;
  const expired =
    failure instanceof BillingSessionExpired ||
    loaded.error instanceof BillingSessionExpired;
  const locked = busy || loaded.isFetching || loaded.isError || expired;
  const run = async (operation: () => Promise<void>) => {
    if (busyRef.current || loaded.isFetching || loaded.isError || expired)
      return;
    busyRef.current = true;
    setBusy(true);
    setFailure(null);
    setNotice('');
    try {
      await operation();
    } catch (error) {
      if (mounted.current)
        setFailure(
          error instanceof Error
            ? error
            : new Error(
                'Confirmation status is unavailable. Check the exact request.',
              ),
        );
    } finally {
      busyRef.current = false;
      if (mounted.current) setBusy(false);
    }
  };
  const show = (result: StockConfirmationStatus) => {
    if (!mounted.current) return;
    setCurrent(result.current);
    setReview(null);
    setReceipt(result.accepted ? result : null);
    setNotice(
      result.accepted
        ? 'This exact confirmation was accepted. Current native state and created document references are shown below.'
        : 'No receipt found yet. This does not prove the original request stopped. Check again or retry only the identical request.',
    );
  };
  const save = () =>
    run(async () => {
      if (
        receipt ||
        (!request && (!review || locked || failure || !review.write_ready))
      )
        return;
      const exact =
        request ??
        checkedStockConfirmationRequest({
          order_id: review!.order_id,
          transfer_id: review!.transfer_id,
          version: review!.version,
          review_version: review!.review_version,
          request_key: crypto.randomUUID(),
        });
      await persistStockConfirmationRecovery(uid, exact);
      if (!mounted.current) return;
      setPending(exact);
      try {
        show(await saveStockConfirmation(exact));
      } catch (error) {
        if (error instanceof BillingActionRejected) {
          await clearStockConfirmationRecovery(uid, exact);
          if (mounted.current) {
            setPending(null);
            setReview(null);
          }
          await client.invalidateQueries({
            queryKey: ['billing', 'stock-confirmation', uid],
            refetchType: 'none',
          });
        }
        throw error;
      }
    });
  const finish = () =>
    run(async () => {
      if (!request) return;
      const result = await getStockConfirmationStatus(request);
      if (!result.accepted)
        throw new Error(
          'Accepted confirmation receipt unavailable. Keep this recovery request.',
        );
      await clearStockConfirmationRecovery(uid, request);
      await Promise.all([
        client.invalidateQueries({
          queryKey: ['billing', 'order-deliveries', uid],
        }),
        client.invalidateQueries({
          queryKey: ['billing', 'reservation-recovery', uid],
        }),
        ...['stock-confirmation', 'stock-reservation', 'stock-operation'].map(
          (key) =>
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
      modalHeading="Transfer confirmation review"
      preventCloseOnClickOutside
      onRequestClose={() => {
        if (!busyRef.current) close();
      }}
    >
      <section
        className={styles.card}
        aria-label="Transfer confirmation review"
        aria-busy={busy || loaded.isFetching}
      >
        <p>
          Native Mark as Todo can reserve stock, merge moves, and create
          upstream transfers or vendor RFQs. It does not validate stock
          delivery, post an invoice or record a payment.
        </p>
        {loaded.isFetching ? (
          <p role="status">
            Reading native confirmation state and recovery request...
          </p>
        ) : loaded.isError ? (
          <p role="alert">{loaded.error.message}</p>
        ) : state ? (
          <>
            <h2>{state.graph.transfer.name}</h2>
            <p>
              Order #{state.order_id} · Transfer #{state.transfer_id} · Current
              state: {state.graph.transfer.state} · Company:{' '}
              {label(state.graph.transfer.company)}
            </p>
            {request &&
            (request.order_id !== orderId ||
              request.transfer_id !== transferId) ? (
              <p role="status">
                A previous confirmation for this order and transfer must be
                resolved before starting another stock action.
              </p>
            ) : null}
            <div
              className={styles.tableScroll}
              role="region"
              aria-label="Current transfer quantities"
              tabIndex={0}
            >
              <table>
                <caption>Current saved quantities in the unit shown</caption>
                <thead>
                  <tr>
                    {[
                      'Product',
                      'Unit',
                      'Demand',
                      'Reserved',
                      'Recorded done',
                    ].map((title) => (
                      <th scope="col" key={title}>
                        {title}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {state.graph.transfer.moves.map((move) => (
                    <tr key={move.id}>
                      <td>{label(move.product)}</td>
                      <td>{label(move.unit)}</td>
                      <td>{move.demand}</td>
                      <td>{move.reserved}</td>
                      <td>{move.done}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!request ? (
              <>
                {state.reason ? <p>{state.reason}</p> : null}
                {!state.write_ready ? (
                  <p>
                    Native confirmation saving is not available in this adapter.
                  </p>
                ) : null}
                <Button
                  kind="tertiary"
                  disabled={locked || !!state.reason || !!failure}
                  onClick={() =>
                    void run(async () => {
                      setReview(null);
                      setReceipt(null);
                      const value = await previewStockConfirmation({
                        order_id: state.order_id,
                        transfer_id: state.transfer_id,
                        version: state.version,
                      });
                      if (mounted.current) setReview(value);
                    })
                  }
                >
                  Review Mark as Todo
                </Button>
              </>
            ) : null}
            {review && !request ? (
              <>
                <p>
                  Native state after confirmation: {review.state_after}. This is
                  a rollback preview, not saved stock.
                </p>
                <StockConfirmationEffects effects={review.effects} />
                <Button
                  disabled={
                    locked ||
                    !!failure ||
                    !review.write_ready ||
                    !state.write_ready
                  }
                  onClick={() => void save()}
                >
                  Save reviewed confirmation
                </Button>
                {!review.write_ready ? (
                  <p>This native adapter supports preview only.</p>
                ) : null}
              </>
            ) : null}
            {receipt ? (
              <section aria-label="Saved confirmation references">
                <h3>Accepted native confirmation: {receipt.state_after}</h3>
                <ul>
                  {Object.entries(receipt.references).map(([key, item]) => (
                    <li key={key}>
                      {confirmationModelLabel(item.model)}:{' '}
                      {item.available
                        ? `${item.name} (#${item.id})`
                        : 'No longer available or not readable by this account'}
                    </li>
                  ))}
                </ul>
                {!Object.keys(receipt.references).length ? (
                  <p>No new business document references were created.</p>
                ) : null}
              </section>
            ) : null}
          </>
        ) : null}
        {request ? (
          <>
            <p>
              Request: {request.request_key}.{' '}
              {receipt
                ? 'The exact native receipt is available.'
                : 'The request may already have been saved. No write is retried automatically.'}
            </p>
            <Button
              kind="tertiary"
              disabled={locked}
              onClick={() =>
                void run(async () =>
                  show(await getStockConfirmationStatus(request)),
                )
              }
            >
              Check confirmation request
            </Button>
            {!receipt ? (
              <Button
                kind="danger"
                disabled={locked}
                onClick={() => void save()}
              >
                Retry identical confirmation request
              </Button>
            ) : (
              <Button
                kind="tertiary"
                disabled={locked}
                onClick={() => void finish()}
              >
                Finish and reload transfers
              </Button>
            )}
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
              setFailure(null);
              setNotice('');
              void loaded.refetch();
            }}
          >
            Reload confirmation state
          </Button>
        )}
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
