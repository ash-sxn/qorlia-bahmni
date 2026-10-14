import { Button } from '@bahmni/design-system';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import styles from './BillingPage.module.scss';
import { BillingSessionExpired, getOrderDeliveries } from './billingService';
import { StockReservationModal } from './StockReservationModal';
import { loadStockReservationRecovery } from './stockReservationRecovery';

const transferStates = {
  draft: 'Draft',
  waiting: 'Waiting for another operation',
  confirmed: 'Waiting for availability',
  assigned: 'Ready',
  done: 'Done',
  cancel: 'Cancelled',
};
const label = (relation: [number, string] | false) =>
  relation ? relation[1] : 'Not set';

export function OrderDeliveriesPanel({
  uid,
  orderId,
  close,
  reconnect,
}: {
  uid: number;
  orderId: number;
  close: () => void;
  reconnect: () => void;
}) {
  const client = useQueryClient();
  const [transferId, setTransferId] = useState<number | null>(null);
  const [reservation, setReservation] = useState<{
    orderId: number;
    transferId: number;
  } | null>(null);
  const recovery = useQuery({
    queryKey: ['billing', 'reservation-recovery', uid],
    queryFn: () => loadStockReservationRecovery(uid),
    retry: false,
    refetchOnMount: 'always',
    refetchOnWindowFocus: false,
  });
  const result = useQuery({
    queryKey: ['billing', 'order-deliveries', uid, orderId],
    queryFn: () => getOrderDeliveries(orderId),
    retry: false,
    refetchOnMount: 'always',
    refetchOnWindowFocus: false,
  });
  const transfer = result.data?.rows.find((row) => row.id === transferId);
  return (
    <section className={styles.card} aria-label="Order stock transfers">
      <h2>Order stock transfers</h2>
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
            onClick={() =>
              setReservation({
                orderId: recovery.data!.order_id,
                transferId: recovery.data!.transfer_id,
              })
            }
          >
            Resume reservation request
          </Button>
        ) : null}
        <Button kind="tertiary" onClick={close}>
          Back to order details
        </Button>
        <Button
          kind="tertiary"
          disabled={result.isFetching}
          onClick={() => void result.refetch()}
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
      {result.isFetching ? (
        <p role="status">Loading native order transfers...</p>
      ) : result.isError ? (
        <div role="alert">
          <p>
            {result.error.message} Previous transfer details are hidden until a
            successful reload.
          </p>
          {result.error instanceof BillingSessionExpired ? (
            <Button onClick={reconnect}>Reconnect Billing</Button>
          ) : null}
        </div>
      ) : result.data ? (
        <>
          <h3>{result.data.order_name}</h3>
          {!result.data.rows.length ? (
            <p>
              No stock transfers are linked to this order. Service-only orders
              may not require a transfer.
            </p>
          ) : transferId === null ? (
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
                  {result.data.rows.map((row) => (
                    <tr key={row.id}>
                      <td>{row.name}</td>
                      <td>{label(row.operation_type)}</td>
                      <td>{transferStates[row.state]}</td>
                      <td>{row.scheduled_date || 'Not set'}</td>
                      <td>{row.date_done || 'Not completed'}</td>
                      <td>{label(row.backorder)}</td>
                      <td>
                        <Button
                          kind="ghost"
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
          ) : transfer ? (
            <>
              <h3>{transfer.name}</h3>
              <Button
                kind="tertiary"
                onClick={() =>
                  setReservation({ orderId, transferId: transfer.id })
                }
              >
                Review stock reservation
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
                From: {label(transfer.source)} · To:{' '}
                {label(transfer.destination)}
              </p>
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
                      ].map((title) => (
                        <th scope="col" key={title}>
                          {title}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {transfer.moves.map((move) => (
                      <tr key={move.id}>
                        <td>{label(move.product)}</td>
                        <td>{label(move.unit)}</td>
                        <td>{move.demand}</td>
                        <td>{move.reserved}</td>
                        <td>{move.done}</td>
                        <td>{move.state}</td>
                        <td>{label(move.order_line)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {!transfer.moves.length ? (
                <p>No stock moves are recorded in this transfer.</p>
              ) : null}
              <div
                className={styles.tableScroll}
                role="region"
                aria-label="Detailed stock operations"
                tabIndex={0}
              >
                <table>
                  <caption>
                    Detailed operations, quantities in the unit shown
                  </caption>
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
                      ].map((title) => (
                        <th scope="col" key={title}>
                          {title}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {transfer.operations.map((line) => (
                      <tr key={line.id}>
                        <td>{label(line.product)}</td>
                        <td>{label(line.unit)}</td>
                        <td>{line.reserved}</td>
                        <td>{line.done}</td>
                        <td>
                          {line.lot ? line.lot[1] : line.lot_name || 'Not set'}
                        </td>
                        <td>{line.expiry_date || 'Not set'}</td>
                        <td>{label(line.source)}</td>
                        <td>{label(line.destination)}</td>
                        <td>{label(line.source_package)}</td>
                        <td>{label(line.destination_package)}</td>
                        <td>{label(line.owner)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {!transfer.operations.length ? (
                <p>
                  No detailed operations are recorded. Demand alone does not
                  mean stock has been reserved or delivered.
                </p>
              ) : null}
            </>
          ) : (
            <p role="status">
              This transfer is no longer linked to the order. Return to the
              updated transfer list.
            </p>
          )}
        </>
      ) : null}
      {reservation ? (
        <StockReservationModal
          key={`${uid}:${reservation.orderId}:${reservation.transferId}`}
          uid={uid}
          orderId={reservation.orderId}
          transferId={reservation.transferId}
          close={() => {
            setReservation(null);
            void client.invalidateQueries({
              queryKey: ['billing', 'reservation-recovery', uid],
            });
          }}
          reconnect={reconnect}
        />
      ) : null}
    </section>
  );
}
