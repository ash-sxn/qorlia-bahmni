import { Button } from '@bahmni/design-system';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import styles from './BillingPage.module.scss';
import { InventoryHeaderRecovery } from './InventoryHeaderRecovery';
import { InventoryTransferDetails } from './InventoryTransferDetails';
import { OrderDeliveriesPanel } from './OrderDeliveriesPanel';
import { PagedStockCancellationModal } from './PagedStockCancellationModal';
import { PagedStockConfirmationModal } from './PagedStockConfirmationModal';
import { PagedStockReservationModal } from './PagedStockReservationModal';
import { PagedStockReturnModal } from './PagedStockReturnModal';
import { PagedStockValidationModal } from './PagedStockValidationModal';
import { PagedStockWriteModal } from './PagedStockWriteModal';
import {
  isPagedStockReturnRequest,
  isPagedStockCancellationRequest,
  isPagedStockValidationRequest,
  isStockValidationRequest,
  isStockOperationRequest,
  isStockConfirmationRequest,
  loadAnyStockWriteRecovery,
  isInventoryStoredSaveRequest,
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
  const [target, setTarget] = useState<{
    orderId: number | false;
    transferId: number;
    kind:
      | 'confirmation'
      | 'preparation'
      | 'operation'
      | 'validation'
      | 'cancellation'
      | 'return'
      | 'header'
      | 'details';
  } | null>(null);
  const opener = useRef<HTMLButtonElement>(null);
  const retryButton = useRef<HTMLButtonElement>(null);
  const restoreFocus = useRef(false);
  const saved = useQuery({
    queryKey: ['billing', 'reservation-recovery', uid, 'notice'],
    queryFn: () => loadAnyStockWriteRecovery(uid),
    retry: false,
    refetchOnMount: 'always',
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
  // A fast refetch can finish without a rendered isFetching transition.
  useEffect(() => {
    if (target === null && restoreFocus.current && !saved.isFetching) {
      restoreFocus.current = false;
      const target = opener.current ?? retryButton.current;
      if (target) target.focus();
      else focusFallback();
    }
  }, [
    target,
    saved.isFetching,
    saved.dataUpdatedAt,
    saved.errorUpdatedAt,
    focusFallback,
  ]);
  if (target?.orderId === false) {
    if (target.kind === 'header')
      return (
        <InventoryHeaderRecovery
          uid={uid}
          transferId={target.transferId}
          reconnect={reconnect}
          close={() => {
            restoreFocus.current = true;
            setTarget(null);
            void saved.refetch();
          }}
        />
      );
    if (target.kind === 'details')
      return (
        <InventoryTransferDetails
          uid={uid}
          transferId={target.transferId}
          reconnect={reconnect}
          close={() => {
            restoreFocus.current = true;
            setTarget(null);
            void saved.refetch();
          }}
        />
      );
    const Workflow =
      target.kind === 'confirmation'
        ? PagedStockConfirmationModal
        : target.kind === 'validation'
          ? PagedStockValidationModal
          : target.kind === 'cancellation'
            ? PagedStockCancellationModal
            : PagedStockReservationModal;
    const props = {
      uid,
      orderId: false as const,
      transferId: target.transferId,
      reconnect,
      close: () => {
        restoreFocus.current = true;
        setTarget(null);
        void saved.refetch();
      },
    };
    return target.kind === 'return' ? (
      <PagedStockReturnModal
        {...props}
        openTransfer={(_orderId, transferId) =>
          setTarget({ orderId: false, transferId, kind: 'details' })
        }
      />
    ) : target.kind === 'operation' ? (
      <PagedStockWriteModal {...props} kind="operation" />
    ) : (
      <Workflow {...props} />
    );
  }
  if (target !== null)
    return (
      <OrderDeliveriesPanel
        uid={uid}
        orderId={target.orderId}
        closeLabel="Back to Billing"
        reconnect={reconnect}
        close={() => {
          restoreFocus.current = true;
          setTarget(null);
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
  const kind = isInventoryStoredSaveRequest(request)
    ? 'Transfer header save'
    : isPagedStockCancellationRequest(request)
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
        {kind} ·{' '}
        {isInventoryStoredSaveRequest(request) || request.order_id === false
          ? 'Inventory'
          : `Order #${request.order_id}`}{' '}
        · Transfer #{request.transfer_id}
      </p>
      <p>
        A stock request is saved on this browser. Check its outcome before
        starting another stock action. Opening the workflow does not repeat or
        cancel it.
      </p>
      <Button
        ref={opener}
        onClick={() =>
          setTarget({
            orderId: isInventoryStoredSaveRequest(request)
              ? false
              : request.order_id,
            transferId: request.transfer_id,
            kind: isInventoryStoredSaveRequest(request)
              ? 'header'
              : isStockConfirmationRequest(request)
                ? 'confirmation'
                : isStockOperationRequest(request)
                  ? 'operation'
                  : isPagedStockValidationRequest(request)
                    ? 'validation'
                    : isPagedStockCancellationRequest(request)
                      ? 'cancellation'
                      : isPagedStockReturnRequest(request)
                        ? 'return'
                        : 'preparation',
          })
        }
      >
        Open saved stock workflow
      </Button>
    </section>
  );
}
