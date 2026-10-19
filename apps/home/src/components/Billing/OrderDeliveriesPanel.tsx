import { Button } from '@bahmni/design-system';
import {
  useInfiniteQuery,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';
import styles from './BillingPage.module.scss';
import {
  BillingSessionExpired,
  getOrderDeliveryPage,
  StockOperationSelection,
  StockValidationStepRequest,
} from './billingService';
import { OrderTransferDetails } from './OrderTransferDetails';
import { PagedStockConfirmationModal } from './PagedStockConfirmationModal';
import { PagedStockOperationEditor } from './PagedStockOperationEditor';
import { PagedStockReservationModal } from './PagedStockReservationModal';
import { PagedStockReturnModal } from './PagedStockReturnModal';
import { PagedStockValidationModal } from './PagedStockValidationModal';
import { SavedValidationRecoveryModal } from './SavedValidationRecoveryModal';
import { StockConfirmationModal } from './StockConfirmationModal';
import { StockOperationEditor } from './StockOperationEditor';
import { StockReservationModal } from './StockReservationModal';
import {
  isStockOperationRequest,
  isStockConfirmationRequest,
  isStockValidationRequest,
  isStockValidationStepRequest,
  isPagedStockWriteRequest,
  isPagedStockValidationRequest,
  isPagedStockReturnRequest,
  loadStockWriteRecovery,
} from './stockReservationRecovery';
import {
  coherentTransferPages,
  transferStates,
  transferLabel as label,
} from './stockTransferPages';
import { StockValidationModal } from './StockValidationModal';

type Props = {
  uid: number;
  orderId: number;
  close: () => void;
  closeLabel?: string;
  reconnect: () => void;
};
export function OrderDeliveriesPanel(props: Props) {
  return (
    <OrderTransferWorkspace key={`${props.uid}:${props.orderId}`} {...props} />
  );
}
function OrderTransferWorkspace(props: Props) {
  const [target, setTarget] = useState({
    orderId: props.orderId,
    transferId: null as number | null,
  });
  return (
    <OrderTransfers
      key={`${props.uid}:${target.orderId}:${target.transferId ?? ''}`}
      {...props}
      orderId={target.orderId}
      initialTransferId={target.transferId}
      openTransfer={(orderId, transferId) => setTarget({ orderId, transferId })}
    />
  );
}
function OrderTransfers({
  uid,
  orderId,
  initialTransferId,
  openTransfer,
  close,
  closeLabel = 'Back to order details',
  reconnect,
}: Props & {
  initialTransferId: number | null;
  openTransfer: (orderId: number, transferId: number) => void;
}) {
  const client = useQueryClient();
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (initialTransferId === null && document.activeElement === document.body)
      heading.current?.focus();
  }, [initialTransferId]);
  const confirmationOpener = useRef<HTMLButtonElement | null>(null);
  const backButton = useRef<HTMLButtonElement | null>(null);
  const refreshButton = useRef<HTMLButtonElement | null>(null);
  const lastTransferButton = useRef<HTMLButtonElement | null>(null);
  const moreFocus = useRef<HTMLButtonElement | null>(null);
  const restoreConfirmationFocus = useCallback(() => {
    const target =
      confirmationOpener.current?.isConnected &&
      !confirmationOpener.current.disabled
        ? confirmationOpener.current
        : backButton.current;
    target?.focus();
  }, []);
  const [transferId, setTransferId] = useState<number | null>(
    initialTransferId,
  );
  const [stockReturn, setStockReturn] = useState<{
    orderId: number;
    transferId: number;
  } | null>(null);
  const [reservation, setReservation] = useState<{
    orderId: number;
    transferId: number;
    paged: boolean;
  } | null>(null);
  const [operation, setOperation] = useState<{
    selection: StockOperationSelection;
    paged: boolean;
  } | null>(null);
  const [confirmation, setConfirmation] = useState<{
    orderId: number;
    transferId: number;
    paged: boolean;
  } | null>(null);
  const [validation, setValidation] = useState<{
    orderId: number;
    transferId: number;
    request?: StockValidationStepRequest;
    paged?: boolean;
    legacyParent?: StockValidationStepRequest;
  } | null>(null);
  const recovery = useQuery({
    queryKey: ['billing', 'reservation-recovery', uid],
    queryFn: () => loadStockWriteRecovery(uid),
    retry: false,
    refetchOnMount: 'always',
    refetchOnWindowFocus: false,
  });
  const result = useInfiniteQuery({
    queryKey: ['billing', 'order-deliveries', uid, orderId, 'pages'],
    initialPageParam: { after: 0, version: false as string | false },
    queryFn: ({ pageParam }) =>
      getOrderDeliveryPage(orderId, pageParam.after, pageParam.version, 25),
    getNextPageParam: (page) =>
      page.next_after === false
        ? undefined
        : { after: page.next_after, version: page.version },
    retry: false,
    refetchOnMount: 'always',
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
  const pages = result.data?.pages ?? [];
  const first = pages[0];
  const rows = pages.flatMap((page) => page.rows);
  const mismatch = !!first && !coherentTransferPages(pages, orderId);
  useEffect(() => {
    if (result.isFetching || !moreFocus.current) return;
    const previous = moreFocus.current;
    moreFocus.current = null;
    if (
      document.activeElement !== document.body &&
      document.activeElement !== previous
    )
      return;
    const target =
      result.isError || mismatch
        ? refreshButton.current
        : previous.isConnected && !previous.disabled
          ? previous
          : lastTransferButton.current;
    target?.focus();
  }, [result.isFetching, result.isError, mismatch, pages.length]);
  const stockLocked =
    recovery.isPending ||
    recovery.isFetching ||
    recovery.isError ||
    !!recovery.data ||
    result.isFetching ||
    result.isError ||
    mismatch;
  const refresh = () => {
    client.removeQueries({
      queryKey: ['billing', 'order-transfer-details', uid, orderId],
    });
    void client.resetQueries({
      queryKey: ['billing', 'order-deliveries', uid, orderId, 'pages'],
      exact: true,
    });
  };
  const reloadTransfers = () => {
    confirmationOpener.current = null;
    backButton.current?.focus();
    setReservation(null);
    setOperation(null);
    setConfirmation(null);
    setValidation(null);
    setStockReturn(null);
    refresh();
    void client.invalidateQueries({
      queryKey: ['billing', 'reservation-recovery', uid],
    });
    void client.invalidateQueries({
      queryKey: ['billing', 'charge-lines', uid],
    });
  };
  return (
    <section className={styles.card} aria-label="Order stock transfers">
      <h2 ref={heading} tabIndex={-1}>
        Order stock transfers
      </h2>
      <p>
        Review native demand, reservations and recorded done quantities. A
        recorded done quantity is not a completed transfer until its status is
        Done. Reading this view does not reserve, dispense or move stock, post
        an invoice or record a payment.
      </p>
      <div className={styles.toolbar}>
        {recovery.data ? (
          <Button
            kind="tertiary"
            disabled={recovery.isFetching || recovery.isError}
            onClick={(event) => {
              const pending = recovery.data!;
              if (isPagedStockReturnRequest(pending)) {
                confirmationOpener.current = event.currentTarget;
                setStockReturn({
                  orderId: pending.order_id,
                  transferId: pending.transfer_id,
                });
              } else if (isPagedStockValidationRequest(pending)) {
                confirmationOpener.current = event.currentTarget;
                setValidation({
                  orderId: pending.order_id,
                  transferId: pending.transfer_id,
                  paged: true,
                });
              } else if (isStockValidationRequest(pending)) {
                confirmationOpener.current = event.currentTarget;
                setValidation({
                  orderId: pending.order_id,
                  transferId: pending.transfer_id,
                  request: isStockValidationStepRequest(pending)
                    ? pending
                    : undefined,
                });
              } else if (isStockConfirmationRequest(pending)) {
                confirmationOpener.current = event.currentTarget;
                setConfirmation({
                  orderId: pending.order_id,
                  transferId: pending.transfer_id,
                  paged: isPagedStockWriteRequest(pending),
                });
              } else if (isStockOperationRequest(pending)) {
                confirmationOpener.current = event.currentTarget;
                setOperation({
                  paged: isPagedStockWriteRequest(pending),
                  selection: {
                    order_id: pending.order_id,
                    transfer_id: pending.transfer_id,
                    move_id: pending.move_id,
                    operation_id: pending.operation_id,
                  },
                });
              } else {
                confirmationOpener.current = event.currentTarget;
                setReservation({
                  orderId: pending.order_id,
                  transferId: pending.transfer_id,
                  paged: isPagedStockWriteRequest(pending),
                });
              }
            }}
          >
            {isPagedStockReturnRequest(recovery.data)
              ? 'Resume return request'
              : isStockValidationRequest(recovery.data)
                ? 'Resume validation request'
                : isStockConfirmationRequest(recovery.data)
                  ? 'Resume confirmation request'
                  : isStockOperationRequest(recovery.data)
                    ? 'Resume operation request'
                    : 'Resume reservation request'}
          </Button>
        ) : null}
        <Button ref={backButton} kind="tertiary" onClick={close}>
          {closeLabel}
        </Button>
        <Button
          ref={refreshButton}
          kind="tertiary"
          disabled={result.isFetching}
          onClick={refresh}
        >
          Refresh transfers
        </Button>
        {transferId !== null ? (
          <Button kind="tertiary" onClick={() => setTransferId(null)}>
            All order transfers
          </Button>
        ) : null}
      </div>
      {recovery.isError ? <p role="alert">{recovery.error.message}</p> : null}
      {recovery.isError ? (
        <Button
          kind="tertiary"
          disabled={recovery.isFetching}
          onClick={() => void recovery.refetch()}
        >
          Reload stock recovery
        </Button>
      ) : null}
      {result.isPending || (result.isFetching && !result.isFetchingNextPage) ? (
        <p role="status">Loading native order transfers...</p>
      ) : result.isError || mismatch ? (
        <div role="alert">
          <p>
            {result.error?.message ??
              'Transfer pages no longer match the current order snapshot.'}{' '}
            Previous transfer details are hidden until a successful reload.
          </p>
          {result.error instanceof BillingSessionExpired ? (
            <Button onClick={reconnect}>Reconnect Billing</Button>
          ) : null}
        </div>
      ) : first ? (
        <>
          <h3>{first.order_name}</h3>
          {first.total_count === 0 ? (
            <p>
              No stock transfers are linked to this order. Service-only orders
              may not require a transfer.
            </p>
          ) : transferId === null ? (
            <>
              <p role="status">
                Showing {rows.length} of {first.total_count} transfers.
              </p>
              <div
                className={styles.tableScroll}
                role="region"
                aria-label="Order transfer list"
                tabIndex={0}
              >
                <table>
                  <caption>Native transfers linked to this order</caption>
                  <thead>
                    <tr>
                      {[
                        'Transfer',
                        'Operation',
                        'Status',
                        'Scheduled (UTC)',
                        'Completed (UTC)',
                        'Backorder of',
                        'Details',
                      ].map((title) => (
                        <th scope="col" key={title}>
                          {title}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row, index) => (
                      <tr key={row.id}>
                        <td>{row.name}</td>
                        <td>{label(row.operation_type)}</td>
                        <td>{transferStates[row.state]}</td>
                        <td>{row.scheduled_date || 'Not set'}</td>
                        <td>{row.date_done || 'Not completed'}</td>
                        <td>{label(row.backorder)}</td>
                        <td>
                          <Button
                            ref={
                              index === rows.length - 1
                                ? lastTransferButton
                                : undefined
                            }
                            kind="ghost"
                            disabled={result.isFetching}
                            onClick={() => setTransferId(row.id)}
                          >
                            View transfer {row.name}
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {result.hasNextPage ? (
                <Button
                  kind="tertiary"
                  disabled={result.isFetching}
                  onClick={(event) => {
                    moreFocus.current =
                      event.currentTarget === document.activeElement
                        ? event.currentTarget
                        : null;
                    void result.fetchNextPage();
                  }}
                >
                  Load more transfers
                </Button>
              ) : null}
              {result.isFetchingNextPage ? (
                <p role="status">Loading more native transfers...</p>
              ) : null}
            </>
          ) : (
            <OrderTransferDetails
              uid={uid}
              transferId={transferId}
              snapshot={first}
              stockLocked={stockLocked}
              focusOnLoad={initialTransferId === transferId}
              returnStock={(event) => {
                confirmationOpener.current = event.currentTarget;
                setStockReturn({ orderId, transferId });
              }}
              validation={(event) => {
                confirmationOpener.current = event.currentTarget;
                setValidation({ orderId, transferId, paged: true });
              }}
              confirmation={(event) => {
                confirmationOpener.current = event.currentTarget;
                setConfirmation({ orderId, transferId, paged: true });
              }}
              reservation={(event) => {
                confirmationOpener.current = event.currentTarget;
                setReservation({ orderId, transferId, paged: true });
              }}
              operation={(selection, opener) => {
                confirmationOpener.current = opener;
                setOperation({ selection, paged: true });
              }}
              reload={refresh}
              reconnect={reconnect}
            />
          )}
        </>
      ) : null}
      {reservation?.paged ? (
        <PagedStockReservationModal
          uid={uid}
          orderId={reservation.orderId}
          transferId={reservation.transferId}
          close={reloadTransfers}
          reconnect={reconnect}
          returnFocus={restoreConfirmationFocus}
        />
      ) : reservation ? (
        <StockReservationModal
          key={`${uid}:${reservation.orderId}:${reservation.transferId}`}
          uid={uid}
          orderId={reservation.orderId}
          transferId={reservation.transferId}
          close={reloadTransfers}
          reconnect={reconnect}
        />
      ) : null}
      {stockReturn ? (
        <PagedStockReturnModal
          uid={uid}
          orderId={stockReturn.orderId}
          transferId={stockReturn.transferId}
          close={reloadTransfers}
          reconnect={reconnect}
          returnFocus={restoreConfirmationFocus}
          openTransfer={openTransfer}
        />
      ) : null}
      {confirmation?.paged ? (
        <PagedStockConfirmationModal
          uid={uid}
          orderId={confirmation.orderId}
          transferId={confirmation.transferId}
          close={reloadTransfers}
          reconnect={reconnect}
          returnFocus={restoreConfirmationFocus}
        />
      ) : confirmation ? (
        <StockConfirmationModal
          uid={uid}
          orderId={confirmation.orderId}
          transferId={confirmation.transferId}
          close={reloadTransfers}
          reconnect={reconnect}
          returnFocus={restoreConfirmationFocus}
        />
      ) : null}
      {validation?.paged ? (
        <PagedStockValidationModal
          uid={uid}
          orderId={validation.orderId}
          transferId={validation.transferId}
          legacyParent={validation.legacyParent}
          close={reloadTransfers}
          reconnect={reconnect}
          returnFocus={restoreConfirmationFocus}
        />
      ) : validation?.request ? (
        <SavedValidationRecoveryModal
          key={`${uid}:${validation.request.request_key}`}
          uid={uid}
          request={validation.request}
          close={reloadTransfers}
          reconnect={reconnect}
          returnFocus={restoreConfirmationFocus}
          continueReview={() =>
            setValidation({
              orderId: validation.orderId,
              transferId: validation.transferId,
            })
          }
          continueCompleteReview={() =>
            setValidation({
              orderId: validation.orderId,
              transferId: validation.transferId,
              paged: true,
              legacyParent: validation.request,
            })
          }
        />
      ) : validation ? (
        <StockValidationModal
          uid={uid}
          orderId={validation.orderId}
          transferId={validation.transferId}
          close={reloadTransfers}
          reconnect={reconnect}
          returnFocus={restoreConfirmationFocus}
        />
      ) : null}
      {operation?.paged ? (
        <PagedStockOperationEditor
          uid={uid}
          selection={operation.selection}
          close={reloadTransfers}
          reconnect={reconnect}
          returnFocus={restoreConfirmationFocus}
        />
      ) : operation ? (
        <StockOperationEditor
          key={`${uid}:${operation.selection.order_id}:${operation.selection.transfer_id}:${operation.selection.move_id}:${operation.selection.operation_id}`}
          uid={uid}
          selection={operation.selection}
          close={reloadTransfers}
          reconnect={reconnect}
        />
      ) : null}
    </section>
  );
}
