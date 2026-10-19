import { Button } from '@bahmni/design-system';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useEffect, useRef, useState, type MouseEventHandler } from 'react';
import styles from './BillingPage.module.scss';
import {
  BillingSessionExpired,
  getOrderTransferDetailPage,
  type OrderDeliveryPage,
  type StockOperationSelection,
} from './billingService';
import {
  coherentTransferDetail,
  sameTransferSummary,
  transferLabel as label,
  transferStates,
} from './stockTransferPages';
import { StockMoveTable, StockOperationTable } from './StockTransferTables';

type Props = {
  uid: number;
  transferId: number;
  snapshot: Pick<
    OrderDeliveryPage,
    'order_id' | 'order_name' | 'order_state' | 'version'
  >;
  stockLocked: boolean;
  focusOnLoad?: boolean;
  validation: MouseEventHandler<HTMLButtonElement>;
  confirmation: MouseEventHandler<HTMLButtonElement>;
  reservation: MouseEventHandler<HTMLButtonElement>;
  returnStock: MouseEventHandler<HTMLButtonElement>;
  cancellation: MouseEventHandler<HTMLButtonElement>;
  operation: (
    selection: StockOperationSelection,
    opener: HTMLButtonElement,
  ) => void;
  reload: () => void;
  reconnect: () => void;
};

export function OrderTransferDetails(props: Props) {
  return (
    <TransferDetails
      key={`${props.uid}:${props.snapshot.order_id}:${props.transferId}:${props.snapshot.version}`}
      {...props}
    />
  );
}

function TransferDetails({
  uid,
  transferId,
  snapshot,
  stockLocked,
  focusOnLoad,
  validation,
  confirmation,
  reservation,
  returnStock,
  cancellation,
  operation,
  reload,
  reconnect,
}: Props) {
  const [moveCursors, setMoveCursors] = useState([{ after: 0, position: 0 }]);
  const [operationCursors, setOperationCursors] = useState([
    { after: 0, position: 0 },
  ]);
  const moveCursor = moveCursors[moveCursors.length - 1];
  const operationCursor = operationCursors[operationCursors.length - 1];
  const pageFocus = useRef<HTMLButtonElement | null>(null);
  const reloadButton = useRef<HTMLButtonElement | null>(null);
  const transferHeading = useRef<HTMLHeadingElement>(null);
  const focused = useRef(false);
  const moves = useQuery({
    queryKey: [
      'billing',
      'order-transfer-details',
      uid,
      snapshot.order_id,
      transferId,
      snapshot.version,
      'moves',
      moveCursor.after,
    ],
    queryFn: () =>
      getOrderTransferDetailPage(
        snapshot.order_id,
        transferId,
        'moves',
        moveCursor.after,
        snapshot.version,
        50,
      ),
    placeholderData: keepPreviousData,
    retry: false,
    refetchOnMount: 'always',
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
  const operations = useQuery({
    queryKey: [
      'billing',
      'order-transfer-details',
      uid,
      snapshot.order_id,
      transferId,
      snapshot.version,
      'operations',
      operationCursor.after,
    ],
    queryFn: () =>
      getOrderTransferDetailPage(
        snapshot.order_id,
        transferId,
        'operations',
        operationCursor.after,
        snapshot.version,
        50,
      ),
    placeholderData: keepPreviousData,
    retry: false,
    refetchOnMount: 'always',
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
  const failure = moves.error ?? operations.error;
  const movePage = moves.data,
    operationPage = operations.data;
  const coherent =
    (!movePage ||
      moves.isPlaceholderData ||
      coherentTransferDetail(
        movePage,
        snapshot,
        transferId,
        'moves',
        moveCursor,
      )) &&
    (!operationPage ||
      operations.isPlaceholderData ||
      coherentTransferDetail(
        operationPage,
        snapshot,
        transferId,
        'operations',
        operationCursor,
      )) &&
    (!movePage ||
      !operationPage ||
      sameTransferSummary(movePage.transfer, operationPage.transfer));
  const fetching = moves.isFetching || operations.isFetching;
  useEffect(() => {
    if (
      focusOnLoad &&
      !focused.current &&
      !fetching &&
      !failure &&
      coherent &&
      transferHeading.current &&
      document.activeElement === document.body
    ) {
      focused.current = true;
      transferHeading.current.focus();
    }
  }, [focusOnLoad, fetching, failure, coherent]);
  useEffect(() => {
    if (fetching || !pageFocus.current) return;
    const previous = pageFocus.current;
    pageFocus.current = null;
    if (
      document.activeElement !== document.body &&
      document.activeElement !== previous
    )
      return;
    const target =
      failure || !coherent
        ? reloadButton.current
        : previous.isConnected && !previous.disabled
          ? previous
          : previous.parentElement?.querySelector<HTMLButtonElement>(
              'button:not(:disabled)',
            );
    target?.focus();
  }, [fetching, failure, coherent]);
  if (failure || !coherent)
    return (
      <div role="alert">
        <p>
          {failure?.message ??
            'Transfer pages do not match the current order snapshot.'}{' '}
          Previous transfer details are hidden until a successful reload.
        </p>
        {failure instanceof BillingSessionExpired ? (
          <Button onClick={reconnect}>Reconnect Billing</Button>
        ) : null}
        <Button ref={reloadButton} kind="tertiary" onClick={reload}>
          Reload transfer details
        </Button>
      </div>
    );
  if (moves.isPending || operations.isPending || !movePage || !operationPage)
    return <p role="status">Loading native transfer details...</p>;
  if (movePage.section !== 'moves' || operationPage.section !== 'operations')
    return (
      <p role="alert">
        Transfer detail sections do not match. Refresh transfers before
        continuing.
      </p>
    );
  const transfer = movePage.transfer;
  const locked = stockLocked || fetching;
  const nextMove = movePage.next_after;
  const nextOperation = operationPage.next_after;
  return (
    <>
      <h3 ref={transferHeading} tabIndex={-1}>
        {transfer.name}
      </h3>
      {transfer.state === 'done' ? (
        <Button kind="tertiary" disabled={locked} onClick={returnStock}>
          Review stock return
        </Button>
      ) : null}
      {['assigned', 'confirmed', 'draft', 'waiting'].includes(
        transfer.state,
      ) ? (
        <Button kind="tertiary" disabled={locked} onClick={cancellation}>
          Review transfer cancellation
        </Button>
      ) : null}
      <Button kind="tertiary" disabled={locked} onClick={validation}>
        Review transfer validation
      </Button>
      <Button
        kind="tertiary"
        disabled={stockLocked || fetching}
        onClick={confirmation}
      >
        Review transfer confirmation
      </Button>
      <Button
        kind="tertiary"
        disabled={stockLocked || fetching}
        onClick={reservation}
      >
        Review stock preparation
      </Button>
      <p>
        Status: {transferStates[transfer.state]} · Company:{' '}
        {label(transfer.company)}
      </p>
      <p>
        Customer: {label(transfer.customer)} · Reference:{' '}
        {transfer.origin || 'Not set'}
      </p>
      <p>
        From: {label(transfer.source)} · To: {label(transfer.destination)}
      </p>
      <p role="status" aria-label="Stock move page">
        {fetching ? (
          'Loading native transfer pages...'
        ) : (
          <>
            Stock moves: {movePage.position + (movePage.rows.length ? 1 : 0)} to{' '}
            {movePage.position + movePage.rows.length} of {transfer.move_count}.
          </>
        )}
      </p>
      <div className={styles.toolbar}>
        <Button
          kind="tertiary"
          disabled={fetching || moveCursors.length === 1}
          onClick={(event) => {
            pageFocus.current =
              event.currentTarget === document.activeElement
                ? event.currentTarget
                : null;
            setMoveCursors((value) =>
              value.length > 1 ? value.slice(0, -1) : value,
            );
          }}
        >
          Previous stock moves
        </Button>
        <Button
          kind="tertiary"
          disabled={fetching || nextMove === false}
          onClick={(event) => {
            pageFocus.current =
              event.currentTarget === document.activeElement
                ? event.currentTarget
                : null;
            if (nextMove !== false)
              setMoveCursors((value) => [
                ...value,
                {
                  after: nextMove,
                  position: movePage.position + movePage.rows.length,
                },
              ]);
          }}
        >
          Next stock moves
        </Button>
      </div>
      {fetching ? null : (
        <StockMoveTable
          rows={movePage.rows}
          showOrderLine
          actions={(move) => (
            <Button
              kind="ghost"
              disabled={
                stockLocked ||
                fetching ||
                ['done', 'cancel'].includes(move.state) ||
                ['done', 'cancel'].includes(transfer.state)
              }
              onClick={(event) =>
                operation(
                  {
                    order_id: snapshot.order_id,
                    transfer_id: transferId,
                    move_id: move.id,
                    operation_id: false,
                  },
                  event.currentTarget,
                )
              }
            >
              Add operation for {label(move.product)}
            </Button>
          )}
        />
      )}
      {transfer.move_count === 0 ? (
        <p>No stock moves are recorded in this transfer.</p>
      ) : null}
      <p role="status" aria-label="Detailed operation page">
        {fetching ? (
          'Loading native transfer pages...'
        ) : (
          <>
            Detailed operations:{' '}
            {operationPage.position + (operationPage.rows.length ? 1 : 0)} to{' '}
            {operationPage.position + operationPage.rows.length} of{' '}
            {transfer.operation_count}.
          </>
        )}
      </p>
      <div className={styles.toolbar}>
        <Button
          kind="tertiary"
          disabled={fetching || operationCursors.length === 1}
          onClick={(event) => {
            pageFocus.current =
              event.currentTarget === document.activeElement
                ? event.currentTarget
                : null;
            setOperationCursors((value) =>
              value.length > 1 ? value.slice(0, -1) : value,
            );
          }}
        >
          Previous detailed operations
        </Button>
        <Button
          kind="tertiary"
          disabled={fetching || nextOperation === false}
          onClick={(event) => {
            pageFocus.current =
              event.currentTarget === document.activeElement
                ? event.currentTarget
                : null;
            if (nextOperation !== false)
              setOperationCursors((value) => [
                ...value,
                {
                  after: nextOperation,
                  position: operationPage.position + operationPage.rows.length,
                },
              ]);
          }}
        >
          Next detailed operations
        </Button>
      </div>
      {fetching ? null : (
        <StockOperationTable
          rows={operationPage.rows}
          actions={(line) =>
            line.move_id ? (
              <Button
                kind="ghost"
                disabled={
                  stockLocked ||
                  fetching ||
                  ['done', 'cancel'].includes(transfer.state)
                }
                onClick={(event) => {
                  if (line.move_id !== false)
                    operation(
                      {
                        order_id: snapshot.order_id,
                        transfer_id: transferId,
                        move_id: line.move_id,
                        operation_id: line.id,
                      },
                      event.currentTarget,
                    );
                }}
              >
                Edit operation #{line.id}
              </Button>
            ) : (
              'No linked move'
            )
          }
        />
      )}
      {transfer.operation_count === 0 ? (
        <p>
          No detailed operations are recorded. Demand alone does not mean stock
          has been reserved or delivered.
        </p>
      ) : null}
    </>
  );
}
