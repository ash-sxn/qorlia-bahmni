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

type Props = {
  uid: number;
  transferId: number;
  snapshot: Pick<
    OrderDeliveryPage,
    'order_id' | 'order_name' | 'order_state' | 'version'
  >;
  stockLocked: boolean;
  validation: MouseEventHandler<HTMLButtonElement>;
  confirmation: MouseEventHandler<HTMLButtonElement>;
  reservation: MouseEventHandler<HTMLButtonElement>;
  operation: (selection: StockOperationSelection) => void;
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
  validation,
  confirmation,
  reservation,
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
  // shortcut: Validation/editing stay capped until their paged consumers are connected.
  const legacyLimit =
    transfer.move_count > 500 || transfer.operation_count > 2000;
  const locked = stockLocked || legacyLimit || fetching;
  const nextMove = movePage.next_after;
  const nextOperation = operationPage.next_after;
  return (
    <>
      <h3>{transfer.name}</h3>
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
      {legacyLimit ? (
        <p>
          All details can be read in pages. Confirmation and preparation use
          complete paged review. Validation and operation editing for this
          larger transfer are not connected to this screen yet.
        </p>
      ) : null}
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
        <div
          className={styles.tableScroll}
          role="region"
          aria-label="Transfer demand and reservations"
          tabIndex={0}
        >
          <table>
            <caption>
              Demand and reservation quantities in the unit shown
            </caption>
            <thead>
              <tr>
                {[
                  'Product',
                  'Unit',
                  'Demand',
                  'Reserved',
                  'Recorded done',
                  'Move status',
                  'Order item',
                  'Operations',
                ].map((title) => (
                  <th scope="col" key={title}>
                    {title}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {movePage.rows.map((move) => (
                <tr key={move.id}>
                  <td>{label(move.product)}</td>
                  <td>{label(move.unit)}</td>
                  <td>{move.demand}</td>
                  <td>{move.reserved}</td>
                  <td>{move.done}</td>
                  <td>{move.state}</td>
                  <td>{label(move.order_line)}</td>
                  <td>
                    <Button
                      kind="ghost"
                      disabled={
                        locked ||
                        ['done', 'cancel'].includes(move.state) ||
                        ['done', 'cancel'].includes(transfer.state)
                      }
                      onClick={() =>
                        operation({
                          order_id: snapshot.order_id,
                          transfer_id: transferId,
                          move_id: move.id,
                          operation_id: false,
                        })
                      }
                    >
                      Add operation for {label(move.product)}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
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
        <div
          className={styles.tableScroll}
          role="region"
          aria-label="Detailed stock operations"
          tabIndex={0}
        >
          <table>
            <caption>Detailed operations, quantities in the unit shown</caption>
            <thead>
              <tr>
                {[
                  'Product',
                  'Unit',
                  'Reserved',
                  'Recorded done',
                  'Batch / serial',
                  'Expiry (UTC)',
                  'Source',
                  'Destination',
                  'Source package',
                  'Destination package',
                  'Owner',
                  'Edit',
                ].map((title) => (
                  <th scope="col" key={title}>
                    {title}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {operationPage.rows.map((line) => (
                <tr key={line.id}>
                  <td>{label(line.product)}</td>
                  <td>{label(line.unit)}</td>
                  <td>{line.reserved}</td>
                  <td>{line.done}</td>
                  <td>{line.lot ? line.lot[1] : line.lot_name || 'Not set'}</td>
                  <td>{line.expiry_date || 'Not set'}</td>
                  <td>{label(line.source)}</td>
                  <td>{label(line.destination)}</td>
                  <td>{label(line.source_package)}</td>
                  <td>{label(line.destination_package)}</td>
                  <td>{label(line.owner)}</td>
                  <td>
                    {line.move_id ? (
                      <Button
                        kind="ghost"
                        disabled={
                          locked || ['done', 'cancel'].includes(transfer.state)
                        }
                        onClick={() => {
                          if (line.move_id !== false)
                            operation({
                              order_id: snapshot.order_id,
                              transfer_id: transferId,
                              move_id: line.move_id,
                              operation_id: line.id,
                            });
                        }}
                      >
                        Edit operation #{line.id}
                      </Button>
                    ) : (
                      'No linked move'
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
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
