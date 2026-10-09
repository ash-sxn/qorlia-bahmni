import { Button, Modal } from '@bahmni/design-system';
import { useQuery } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { invoiceName, money } from './billingFormat';
import styles from './BillingPage.module.scss';
import {
  BillingSessionExpired,
  getOrderWorkflow,
  OrderWorkflow,
  runOrderWorkflow,
} from './billingService';

export function OrderWorkflowModal({
  uid,
  orderId,
  close,
  completed,
  reconnect,
}: {
  uid: number;
  orderId: number;
  close: () => void;
  completed: (order: OrderWorkflow) => void;
  reconnect: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<Error | null>(null);
  const busyRef = useRef(false);
  const current = useQuery({
    queryKey: ['billing', 'order-workflow', uid, orderId],
    queryFn: () => getOrderWorkflow(orderId),
    retry: false,
    refetchOnMount: 'always',
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
  const order = current.data;
  const expired =
    failure instanceof BillingSessionExpired ||
    current.error instanceof BillingSessionExpired;
  const run = async (action: 'confirm' | 'invoice') => {
    if (
      !order ||
      busyRef.current ||
      failure ||
      current.isFetching ||
      current.isError
    )
      return;
    busyRef.current = true;
    setBusy(true);
    try {
      const result = await runOrderWorkflow(order, action);
      completed(result);
    } catch (error) {
      setFailure(
        error instanceof Error
          ? error
          : new Error('Billing action response unavailable.'),
      );
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };
  return (
    <Modal
      open
      passiveModal
      size="lg"
      modalHeading="Review charge order actions"
      preventCloseOnClickOutside
      onRequestClose={() => {
        if (!busyRef.current) close();
      }}
    >
      <section
        className={styles.card}
        aria-label="Order action review"
        aria-busy={busy}
      >
        {expired ? (
          <div role="alert">
            <p>
              Your Billing session expired. Reconnect, then check the current
              order status.
            </p>
            <Button kind="tertiary" onClick={reconnect}>
              Reconnect Billing
            </Button>
          </div>
        ) : current.isFetching ? (
          <p role="status">Reading the current order and Billing settings...</p>
        ) : current.isError ? (
          <p role="alert">{current.error.message}</p>
        ) : order ? (
          <>
            <p className={styles.eyebrow}>NATIVE BILLING WORKFLOW</p>
            <h2>{order.name}</h2>
            <p>Customer: {order.customer || 'Not set'}</p>
            <p>
              Current status:{' '}
              {order.state === 'sale'
                ? 'Confirmed'
                : order.state === 'done'
                  ? 'Locked'
                  : order.state}
            </p>
            <p>Order total: {money(order.amount_total, order.currency[1])}</p>
            <h3>What will happen?</h3>
            {order.can_confirm ? (
              <>
                <p>
                  Confirming accepts this quotation and runs Bahmni
                  Billing&apos;s native order workflow.
                </p>
                <p>
                  {order.automation.delivery || order.automation.legacy_delivery
                    ? 'Automatic delivery is enabled. Stock deliveries may be validated and inventory reduced.'
                    : 'Automatic delivery is disabled. Stock items follow the native reservation and delivery workflow.'}
                </p>
                <p>
                  {order.automation.invoice
                    ? 'Automatic invoicing is enabled. Confirmation creates and posts invoices for invoiceable items.'
                    : 'Automatic invoicing is disabled. Confirmation does not automatically create an invoice.'}
                </p>
                <Button
                  disabled={busy || !!failure}
                  onClick={() => void run('confirm')}
                >
                  Confirm quotation
                </Button>
              </>
            ) : order.can_invoice ? (
              <>
                <p>
                  Create a regular invoice using native ordered or delivered
                  quantities. Existing down payments are deducted by Billing.
                  Negative balances may produce a credit note.
                </p>
                <p>
                  {order.automation.invoice
                    ? 'Automatic posting is enabled. The native workflow will post the invoice.'
                    : 'Automatic posting is disabled. The invoice will remain a draft for review.'}
                </p>
                <Button
                  disabled={busy || !!failure}
                  onClick={() => void run('invoice')}
                >
                  Create regular invoice
                </Button>
              </>
            ) : (
              <p>
                No confirmation or regular invoicing action is currently
                available. Delivered-quantity policies and existing invoices are
                respected.
              </p>
            )}
            <p className={styles.note}>
              These actions do not record a payment. Posted invoices and stock
              movements are financial records, not just preview changes.
            </p>
            <h3>Existing invoices</h3>
            {order.invoices.length ? (
              <ul>
                {order.invoices.map((invoice) => (
                  <li key={invoice.id}>
                    {invoiceName(invoice)}: {invoice.state},{' '}
                    {money(invoice.total, invoice.currency[1])}
                  </li>
                ))}
              </ul>
            ) : (
              <p>No linked invoices.</p>
            )}
            <h3>Existing stock deliveries</h3>
            {order.pickings.length ? (
              <ul>
                {order.pickings.map((picking) => (
                  <li key={picking.id}>
                    {picking.name}: {picking.state}
                  </li>
                ))}
              </ul>
            ) : (
              <p>No linked stock deliveries.</p>
            )}
          </>
        ) : null}
        {busy ? (
          <p role="status">Saving the native Billing action. Please wait...</p>
        ) : null}
        {failure && !expired ? (
          <div role="alert">
            <p>{failure.message}</p>
            <p>
              The request may already have reached Billing. Reload the current
              status before taking another action. It will not be sent again
              automatically.
            </p>
          </div>
        ) : null}
        <div className={styles.toolbar}>
          <Button
            kind="tertiary"
            disabled={busy || current.isFetching}
            onClick={async () => {
              const refreshed = await current.refetch();
              if (!refreshed.isError && refreshed.data) setFailure(null);
            }}
          >
            Reload current status
          </Button>
          <Button kind="tertiary" disabled={busy} onClick={close}>
            Back to charge orders
          </Button>
        </div>
      </section>
    </Modal>
  );
}
