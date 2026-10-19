import { Button } from '@bahmni/design-system';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import styles from './BillingPage.module.scss';
import { OrderDeliveriesPanel } from './OrderDeliveriesPanel';
import {
  isPagedStockReturnRequest,
  isPagedStockCancellationRequest,
  isStockValidationRequest,
  isStockOperationRequest,
  isStockConfirmationRequest,
  loadStockWriteRecovery,
} from './stockReservationRecovery';

type Props = {
  uid: number;
  reconnect: () => void;
  focusFallback: () => void;
};

export function StockRecoveryNotice(props: Props) {
  return <RecoveryNotice key={props.uid} {...props} />;
}

function RecoveryNotice({ uid, reconnect, focusFallback }: Props) {
  const [orderId, setOrderId] = useState<number | null>(null);
  const opener = useRef<HTMLButtonElement>(null);
  const retryButton = useRef<HTMLButtonElement>(null);
  const restoreFocus = useRef(false);
  const saved = useQuery({
    queryKey: ['billing', 'reservation-recovery', uid],
    queryFn: () => loadStockWriteRecovery(uid),
    retry: false,
    refetchOnMount: 'always',
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
  // A fast refetch can finish without a rendered isFetching transition.
  useEffect(() => {
    if (orderId === null && restoreFocus.current && !saved.isFetching) {
      restoreFocus.current = false;
      const target = opener.current ?? retryButton.current;
      if (target) target.focus();
      else focusFallback();
    }
  }, [
    orderId,
    saved.isFetching,
    saved.dataUpdatedAt,
    saved.errorUpdatedAt,
    focusFallback,
  ]);
  if (orderId !== null)
    return (
      <OrderDeliveriesPanel
        uid={uid}
        orderId={orderId}
        closeLabel="Back to Billing"
        reconnect={reconnect}
        close={() => {
          restoreFocus.current = true;
          setOrderId(null);
          void saved.refetch();
        }}
      />
    );
  if (saved.isFetching || saved.isPending)
    return <p role="status">Checking saved stock requests...</p>;
  if (saved.isError)
    return (
      <section className={styles.card} aria-label="Stock recovery unavailable">
        <p role="alert">
          Saved stock requests could not be read. They have not been cleared.{' '}
          {saved.error.message}
        </p>
        <Button
          ref={retryButton}
          kind="tertiary"
          onClick={() => {
            restoreFocus.current = true;
            void saved.refetch();
          }}
        >
          Reload saved stock requests
        </Button>
      </section>
    );
  const request = saved.data;
  if (!request) return null;
  const kind = isPagedStockCancellationRequest(request)
    ? 'Transfer cancellation'
    : isPagedStockReturnRequest(request)
      ? 'Return creation'
      : isStockValidationRequest(request)
        ? 'Transfer validation'
        : isStockOperationRequest(request)
          ? 'Detailed operation'
          : isStockConfirmationRequest(request)
            ? 'Transfer confirmation'
            : 'Stock preparation';
  return (
    <section className={styles.card} aria-label="Saved stock request">
      <h2>Check your saved stock request</h2>
      <p>
        {kind} · Order #{request.order_id} · Transfer #{request.transfer_id}
      </p>
      <p>
        A stock request is saved on this browser. Check its outcome before
        starting another stock action. Opening the workflow does not repeat or
        cancel it.
      </p>
      <Button ref={opener} onClick={() => setOrderId(request.order_id)}>
        Open saved stock workflow
      </Button>
    </section>
  );
}
