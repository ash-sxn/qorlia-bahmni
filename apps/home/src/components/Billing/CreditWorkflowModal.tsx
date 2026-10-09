import { Button, Modal } from '@bahmni/design-system';
import { useQuery } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { money } from './billingFormat';
import styles from './BillingPage.module.scss';
import {
  applyCreditWorkflow,
  BillingSessionExpired,
  getCreditWorkflow,
  InvoiceWorkflow,
} from './billingService';

export function CreditWorkflowModal({
  uid,
  invoiceId,
  close,
  completed,
  reconnect,
}: {
  uid: number;
  invoiceId: number;
  close: () => void;
  completed: (invoice: InvoiceWorkflow) => void;
  reconnect: () => void;
}) {
  const [selected, setSelected] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<Error | null>(null);
  const busyRef = useRef(false);
  const current = useQuery({
    queryKey: ['billing', 'credit-workflow', uid, invoiceId],
    queryFn: () => getCreditWorkflow(invoiceId),
    retry: false,
    refetchOnMount: 'always',
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
  const review = current.data;
  const item = review?.credits.find((credit) => credit.id === selected);
  const expired =
    failure instanceof BillingSessionExpired ||
    current.error instanceof BillingSessionExpired;
  const apply = async () => {
    if (
      !review ||
      !item?.can_apply ||
      busyRef.current ||
      failure ||
      current.isFetching ||
      current.isError
    )
      return;
    busyRef.current = true;
    setBusy(true);
    try {
      completed((await applyCreditWorkflow(review, item.id)).invoice);
    } catch (error) {
      setFailure(
        error instanceof Error
          ? error
          : new Error('Allocation response unavailable.'),
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
      modalHeading="Review credit allocation"
      preventCloseOnClickOutside
      onRequestClose={() => {
        if (!busyRef.current) close();
      }}
    >
      <section
        className={styles.card}
        aria-label="Credit allocation review"
        aria-busy={busy}
      >
        {expired ? (
          <div role="alert">
            <p>
              Your Billing session expired. Reconnect and check the saved
              allocation.
            </p>
            <Button kind="tertiary" onClick={reconnect}>
              Reconnect Billing
            </Button>
          </div>
        ) : current.isFetching ? (
          <p role="status">
            Reading native outstanding items and reconciliation history...
          </p>
        ) : current.isError ? (
          <p role="alert">{current.error.message}</p>
        ) : review ? (
          <>
            <p className={styles.eyebrow}>NATIVE BILLING WORKFLOW</p>
            <h2>{review.invoice.name || 'Invoice'}</h2>
            <p>
              Customer: {review.invoice.customer || 'Not set'} · Company:{' '}
              {review.invoice.company}
            </p>
            <p>
              Open amount:{' '}
              {money(review.invoice.open_amount, review.invoice.currency[1])} ·{' '}
              {review.invoice.payment_state.replaceAll('_', ' ')}
            </p>
            <p>
              Apply an existing receipt or credit note using native
              reconciliation. This does not create a new payment, collect money
              or transfer funds.
            </p>
            {!review.invoice.ledger_balanced ? (
              <p role="alert">
                The invoice journal does not balance. Do not allocate credit.
              </p>
            ) : null}
            <h3>
              {review.invoice.move_type === 'out_refund'
                ? 'Outstanding debits'
                : 'Outstanding credits'}
            </h3>
            {review.credits.length ? (
              <ul>
                {review.credits.map((credit) => (
                  <li key={credit.id}>
                    {credit.name}: {money(credit.amount, credit.currency[1])},{' '}
                    {credit.date}{' '}
                    <Button
                      kind="tertiary"
                      disabled={busy || !!failure || !credit.can_apply}
                      onClick={() => setSelected(credit.id)}
                    >
                      Review {credit.name}
                    </Button>
                    {!credit.can_apply ? (
                      <p>
                        Unavailable: the source journal or invoice is not
                        eligible.
                      </p>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p>No native outstanding items are available.</p>
            )}
            {item?.can_apply ? (
              <section aria-label="Reviewed allocation">
                <h3>Check before applying</h3>
                <p>
                  Source: {item.name} · Available:{' '}
                  {money(item.amount, item.currency[1])}
                </p>
                <p>
                  Native Billing reconciles the eligible amount against this
                  invoice. Any remaining balance stays open. Currency exchange
                  and cash-basis entries follow native accounting.
                </p>
                <Button
                  disabled={busy || !!failure}
                  onClick={() => void apply()}
                >
                  Apply reviewed item
                </Button>
              </section>
            ) : null}
            <h3>Native reconciled items</h3>
            {review.history.length ? (
              <ul>
                {review.history.map((row) => (
                  <li key={`${row.id}-${row.is_exchange}`}>
                    {row.name}: {money(row.amount, row.currency[1])}, {row.date}
                    {row.is_exchange ? ', currency exchange entry' : ''}
                  </li>
                ))}
              </ul>
            ) : (
              <p>No reconciled items.</p>
            )}
          </>
        ) : null}
        {busy ? (
          <p role="status">Applying in native Billing. Please wait...</p>
        ) : null}
        {failure && !expired ? (
          <div role="alert">
            <p>{failure.message}</p>
            <p>
              The allocation may already be saved. Reload and inspect the native
              history before another action. This write will not be retried
              automatically.
            </p>
          </div>
        ) : null}
        <div className={styles.toolbar}>
          <Button
            kind="tertiary"
            disabled={busy || current.isFetching}
            onClick={async () => {
              setSelected(null);
              const result = await current.refetch();
              if (!result.isError) setFailure(null);
            }}
          >
            Reload current allocation status
          </Button>
          <Button kind="tertiary" disabled={busy} onClick={close}>
            Back to invoices
          </Button>
        </div>
      </section>
    </Modal>
  );
}
