import { Button, Modal } from '@bahmni/design-system';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import styles from './BillingPage.module.scss';
import {
  BillingActionRejected,
  BillingSessionExpired,
  checkedStockReservationRequest,
  getStockReservation,
  getStockReservationStatus,
  previewStockReservation,
  saveStockReservation,
  StockReservationLoad,
  StockReservationRequest,
  StockReservationReview,
  StockReservationStatus,
  stockPreparationActions,
} from './billingService';
import {
  clearStockReservationRecovery,
  loadStockReservationRecovery,
  persistStockReservationRecovery,
} from './stockReservationRecovery';

const labels = {
  assign: 'Check availability and reserve',
  unreserve: 'Unreserve stock',
  set_quantities: 'Set recorded quantities from reservations',
  clear_quantities: 'Clear matching recorded quantities',
};
const label = (relation: [number, string] | false) =>
  relation ? relation[1] : 'Not set';

export function StockReservationModal({
  uid,
  orderId,
  transferId,
  close,
  reconnect,
}: {
  uid: number;
  orderId: number;
  transferId: number;
  close: () => void;
  reconnect: () => void;
}) {
  const client = useQueryClient();
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const busyRef = useRef(false);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<
    StockReservationRequest | null | undefined
  >(undefined);
  const [current, setCurrent] = useState<StockReservationLoad | null>(null);
  const [review, setReview] = useState<StockReservationReview | null>(null);
  const [accepted, setAccepted] = useState(false);
  const [failure, setFailure] = useState<Error | null>(null);
  const [notice, setNotice] = useState('');
  const loaded = useQuery({
    queryKey: ['billing', 'stock-reservation', uid, orderId, transferId],
    queryFn: async () => {
      const request = await loadStockReservationRecovery(uid);
      const state = await getStockReservation(
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
                'Reservation status is unavailable. Check the exact request.',
              ),
        );
    } finally {
      busyRef.current = false;
      if (mounted.current) setBusy(false);
    }
  };
  const show = (result: StockReservationStatus) => {
    if (!mounted.current) return;
    setCurrent(result.current);
    setAccepted(result.accepted);
    setReview(null);
    setNotice(
      result.accepted
        ? 'This exact request was accepted. Current saved reservation state is shown below.'
        : 'No receipt found yet. This does not prove the original request stopped. Check again or retry only the identical request.',
    );
  };
  const save = () =>
    run(async () => {
      if (!request && (!review || locked || failure)) return;
      const exact =
        request ??
        checkedStockReservationRequest({
          order_id: review!.order_id,
          transfer_id: review!.transfer_id,
          version: review!.version,
          action: review!.action,
          review_version: review!.review_version,
          request_key: crypto.randomUUID(),
        });
      await persistStockReservationRecovery(uid, exact);
      if (!mounted.current) return;
      setPending(exact);
      try {
        show(await saveStockReservation(exact));
      } catch (error) {
        if (error instanceof BillingActionRejected) {
          await clearStockReservationRecovery(uid, exact);
          if (mounted.current) {
            setPending(null);
            setReview(null);
          }
          await client.invalidateQueries({
            queryKey: ['billing', 'stock-reservation', uid],
            refetchType: 'none',
          });
        }
        throw error;
      }
    });
  return (
    <Modal
      open
      passiveModal
      size="lg"
      modalHeading="Stock preparation review"
      preventCloseOnClickOutside
      onRequestClose={() => {
        if (!busyRef.current) close();
      }}
    >
      <section
        className={styles.card}
        aria-label="Stock preparation review"
        aria-busy={busy || loaded.isFetching}
      >
        <p>
          Reserve stock, release reservations or prepare recorded quantities
          through the native stock workflow. Recorded done quantities are not
          delivered stock until the transfer is validated. These actions do not
          complete a transfer, post an invoice or record a payment.
        </p>
        {loaded.isFetching ? (
          <p role="status">
            Reading native reservation state and recovery request...
          </p>
        ) : loaded.isError ? (
          <p role="alert">{loaded.error.message}</p>
        ) : state ? (
          <>
            <h2>{state.graph.transfer.name}</h2>
            <p>
              Order #{state.order_id} · Transfer #{state.transfer_id} · State:{' '}
              {state.graph.transfer.state} · Company:{' '}
              {label(state.graph.transfer.company)}
            </p>
            {request &&
            (request.order_id !== orderId ||
              request.transfer_id !== transferId) ? (
              <p role="status">
                A previous reservation request for this order and transfer must
                be resolved before starting another action.
              </p>
            ) : null}
            <div
              className={styles.tableScroll}
              role="region"
              aria-label="Current stock reservations"
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
                    ].map((text) => (
                      <th key={text} scope="col">
                        {text}
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
              <div className={styles.toolbar}>
                {stockPreparationActions.map((action) => (
                  <div key={action}>
                    <Button
                      kind="tertiary"
                      disabled={locked || !!state.reasons[action]}
                      onClick={() =>
                        void run(async () => {
                          setReview(null);
                          const value = await previewStockReservation({
                            order_id: state.order_id,
                            transfer_id: state.transfer_id,
                            version: state.version,
                            action,
                          });
                          if (mounted.current) setReview(value);
                        })
                      }
                    >
                      Review: {labels[action]}
                    </Button>
                    {state.reasons[action] ? (
                      <p>{state.reasons[action]}</p>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : null}
            {review && !request ? (
              <section
                className={styles.review}
                aria-label="Reviewed reservation effects"
              >
                <h3>{labels[review.action]}</h3>
                {review.action === 'set_quantities' ? (
                  <p>
                    Native Set quantities fills only eligible moves with zero
                    recorded done quantity. Tracked operations still need the
                    required batch or serial. Partially entered moves are
                    preserved.
                  </p>
                ) : review.action === 'clear_quantities' ? (
                  <p>
                    Native Clear quantities clears only eligible moves whose
                    recorded quantity equals their reservation. Other partially
                    entered moves are preserved. This is not a return or stock
                    adjustment.
                  </p>
                ) : null}
                <p>
                  Native preview only. Physical stock quantities stay unchanged.
                  Review the resulting operations and inventory reservations
                  before saving.
                </p>
                <div
                  className={styles.tableScroll}
                  role="region"
                  aria-label="Preview stock operations"
                  tabIndex={0}
                >
                  <table>
                    <caption>
                      Resulting detailed operations, quantities in the unit
                      shown
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
                        ].map((text) => (
                          <th scope="col" key={text}>
                            {text}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {review.after.transfer.operations.map((line, index) => (
                        <tr key={line.id || `preview-${index}`}>
                          <td>{label(line.product)}</td>
                          <td>{label(line.unit)}</td>
                          <td>{line.reserved}</td>
                          <td>{line.done}</td>
                          <td>
                            {line.lot
                              ? line.lot[1]
                              : line.lot_name || 'Not set'}
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
                {!review.after.transfer.operations.length ? (
                  <p>No detailed operations remain after this action.</p>
                ) : null}
                {review.after.packages.length ? (
                  <div
                    className={styles.tableScroll}
                    role="region"
                    aria-label="Reviewed package-level operations"
                    tabIndex={0}
                  >
                    <table>
                      <caption>
                        Package-level operations after this action
                      </caption>
                      <thead>
                        <tr>
                          {['Package', 'Status', 'Source', 'Destination'].map(
                            (text) => (
                              <th key={text} scope="col">
                                {text}
                              </th>
                            ),
                          )}
                        </tr>
                      </thead>
                      <tbody>
                        {review.after.packages.map((row, index) => (
                          <tr key={row.id || `package-preview-${index}`}>
                            <td>{label(row.package_id)}</td>
                            <td>{row.state}</td>
                            <td>{label(row.location_id)}</td>
                            <td>{label(row.location_dest_id)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : null}
                <div
                  className={styles.tableScroll}
                  role="region"
                  aria-label="Inventory reservation changes"
                  tabIndex={0}
                >
                  <table>
                    <caption>
                      Inventory in product stock units, not operation units
                    </caption>
                    <thead>
                      <tr>
                        {[
                          'Product',
                          'Stock unit',
                          'Location',
                          'Batch / serial',
                          'Package',
                          'Owner',
                          'Physical stock',
                          'Reserved before',
                          'Reserved after',
                        ].map((text) => (
                          <th scope="col" key={text}>
                            {text}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {review.quant_after.map((quant, index) => (
                        <tr key={quant.id}>
                          <td>{label(quant.product_id)}</td>
                          <td>{label(quant.unit)}</td>
                          <td>{label(quant.location_id)}</td>
                          <td>{label(quant.lot_id)}</td>
                          <td>{label(quant.package_id)}</td>
                          <td>{label(quant.owner_id)}</td>
                          <td>{quant.quantity}</td>
                          <td>
                            {review.quant_before[index].reserved_quantity}
                          </td>
                          <td>{quant.reserved_quantity}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <Button
                  kind={
                    ['unreserve', 'clear_quantities'].includes(review.action)
                      ? 'danger'
                      : 'primary'
                  }
                  disabled={locked || !!failure}
                  onClick={() => void save()}
                >
                  Save reviewed reservation action
                </Button>
              </section>
            ) : null}
          </>
        ) : null}
        {request ? (
          <>
            <p>
              {accepted
                ? 'This exact request was accepted. Finish before another reservation action.'
                : 'This request may already have been saved. No write is retried automatically.'}
            </p>
            <Button
              kind="tertiary"
              disabled={locked}
              onClick={() =>
                void run(async () =>
                  show(await getStockReservationStatus(request)),
                )
              }
            >
              Check reservation request
            </Button>
            {!accepted ? (
              <Button
                kind="danger"
                disabled={locked}
                onClick={() => void save()}
              >
                Retry identical reservation request
              </Button>
            ) : (
              <Button
                kind="tertiary"
                disabled={locked}
                onClick={() =>
                  void run(async () => {
                    const result = await getStockReservationStatus(request);
                    if (!result.accepted)
                      throw new Error(
                        'Accepted reservation receipt unavailable. Keep this recovery request.',
                      );
                    await clearStockReservationRecovery(uid, request);
                    await client.invalidateQueries({
                      queryKey: ['billing', 'order-deliveries', uid],
                    });
                    await client.invalidateQueries({
                      queryKey: ['billing', 'reservation-recovery', uid],
                    });
                    await client.invalidateQueries({
                      queryKey: ['billing', 'stock-reservation', uid],
                      refetchType: 'none',
                    });
                    if (mounted.current) close();
                  })
                }
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
              setReview(null);
              setCurrent(null);
              setPending(undefined);
              void loaded.refetch();
            }}
          >
            Reload reservation state
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
