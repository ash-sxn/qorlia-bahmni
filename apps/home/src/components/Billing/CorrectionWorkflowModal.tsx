import { Button, Modal } from '@bahmni/design-system';
import { useQuery } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { invoiceName, money } from './billingFormat';
import styles from './BillingPage.module.scss';
import {
  BillingSessionExpired,
  getCorrectionWorkflow,
  InvoiceWorkflow,
  runCorrectionWorkflow,
} from './billingService';

export function CorrectionWorkflowModal({
  uid,
  invoiceId,
  close,
  completed,
  reconnect,
}: {
  uid: number;
  invoiceId: number;
  close: () => void;
  completed: (invoice: InvoiceWorkflow, action: 'reset' | 'cancel') => void;
  reconnect: () => void;
}) {
  const [action, setAction] = useState<'reset' | 'cancel' | null>(null);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [failure, setFailure] = useState<Error | null>(null);
  const current = useQuery({
    queryKey: ['billing', 'correction-workflow', uid, invoiceId],
    queryFn: () => getCorrectionWorkflow(invoiceId),
    retry: false,
    refetchOnMount: 'always',
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
  const review = current.data;
  const allowed =
    !!review?.invoice.ledger_balanced &&
    (action === 'reset'
      ? review.can_reset && ['posted', 'cancel'].includes(review.invoice.state)
      : action === 'cancel' &&
        review.can_cancel &&
        review.invoice.state === 'draft');
  const expired =
    failure instanceof BillingSessionExpired ||
    current.error instanceof BillingSessionExpired;
  const confirm = async () => {
    if (
      !review ||
      !action ||
      !allowed ||
      busyRef.current ||
      failure ||
      current.isFetching ||
      current.isError
    )
      return;
    busyRef.current = true;
    setBusy(true);
    try {
      completed(await runCorrectionWorkflow(review, action), action);
    } catch (error) {
      setFailure(
        error instanceof Error
          ? error
          : new Error('Correction response unavailable.'),
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
      modalHeading="Review invoice correction"
      preventCloseOnClickOutside
      onRequestClose={() => {
        if (!busyRef.current) close();
      }}
    >
      <section
        className={styles.card}
        aria-label="Invoice correction review"
        aria-busy={busy}
      >
        {expired ? (
          <div role="alert">
            <p>
              Your Billing session expired. Reconnect and check the current
              invoice status.
            </p>
            <Button kind="tertiary" onClick={reconnect}>
              Reconnect Billing
            </Button>
          </div>
        ) : current.isFetching ? (
          <p role="status">
            Reading the invoice, allocations and accounting safeguards...
          </p>
        ) : current.isError ? (
          <p role="alert">{current.error.message}</p>
        ) : review ? (
          <>
            <p className={styles.eyebrow}>NATIVE BILLING WORKFLOW</p>
            <h2>{invoiceName(review.invoice)}</h2>
            <p>
              Customer: {review.invoice.customer || 'Not set'} · Company:{' '}
              {review.invoice.company}
            </p>
            <p>
              Journal: {review.invoice.journal} · Status: {review.invoice.state}
            </p>
            <p>
              Total: {money(review.invoice.total, review.invoice.currency[1])}
            </p>
            {review.posted_before ? (
              <p>
                This document has been posted before. Check your accounting
                policy before resetting an issued invoice. A credit note records
                a separate correction.
              </p>
            ) : null}
            {!review.invoice.ledger_balanced ? (
              <p role="alert">
                The journal entries do not balance. No correction is available.
              </p>
            ) : (
              <div className={styles.toolbar}>
                {review.can_reset &&
                ['posted', 'cancel'].includes(review.invoice.state) ? (
                  <Button
                    kind="tertiary"
                    disabled={busy || !!failure}
                    onClick={() => setAction('reset')}
                  >
                    Review reset to draft
                  </Button>
                ) : null}
                {review.can_cancel && review.invoice.state === 'draft' ? (
                  <Button
                    kind="tertiary"
                    disabled={busy || !!failure}
                    onClick={() => setAction('cancel')}
                  >
                    Review draft cancellation
                  </Button>
                ) : null}
                {!review.can_reset && !review.can_cancel ? (
                  <p>
                    No correction is available for this status or your
                    permissions. Native Billing enforces locked periods and
                    protected journals.
                  </p>
                ) : null}
              </div>
            )}
            {action && allowed ? (
              <section aria-label="Selected invoice correction">
                <h3>
                  {action === 'reset'
                    ? 'Reset this document to draft?'
                    : 'Cancel this draft?'}
                </h3>
                {action === 'reset' ? (
                  <>
                    <p>
                      Native Billing removes this document&apos;s payment and
                      credit allocations, removes its analytic entries and
                      returns it to draft. Related exchange and cash-basis
                      corrections follow native accounting.
                    </p>
                    <p>
                      Existing receipts and credit notes are not deleted. Their
                      released balances may be available for allocation again.
                      Reposting does not automatically reapply them.
                    </p>
                    <h4>Current allocations</h4>
                    {review.allocations.length ? (
                      <ul>
                        {review.allocations.map((row) => (
                          <li key={`${row.id}-${row.is_exchange}`}>
                            {row.name}: {money(row.amount, row.currency[1])},{' '}
                            {row.date}
                            {row.is_exchange ? ' (exchange adjustment)' : ''}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p>No current allocations are recorded.</p>
                    )}
                  </>
                ) : (
                  <p>
                    Native Billing marks this draft cancelled and turns off
                    scheduled posting. The document is retained, not deleted.
                    This does not return stock or cancel its sales order.
                  </p>
                )}
                <p>
                  This action does not refund, collect or transfer money. Review
                  the saved status before any subsequent posting or payment.
                </p>
                <Button
                  kind="danger"
                  disabled={busy || !!failure}
                  onClick={() => void confirm()}
                >
                  {action === 'reset'
                    ? 'Confirm reset to draft'
                    : 'Confirm draft cancellation'}
                </Button>
                <Button
                  kind="tertiary"
                  disabled={busy}
                  onClick={() => setAction(null)}
                >
                  Keep current status
                </Button>
              </section>
            ) : null}
          </>
        ) : null}
        {busy ? (
          <p role="status">
            Saving the correction in native Billing. Please wait...
          </p>
        ) : null}
        {failure && !expired ? (
          <div role="alert">
            <p>{failure.message}</p>
            <p>
              The request may already have reached Billing. Reload its current
              status and review again. It will not be sent again automatically.
            </p>
          </div>
        ) : null}
        <div className={styles.toolbar}>
          <Button
            kind="tertiary"
            disabled={busy || current.isFetching}
            onClick={async () => {
              setAction(null);
              const refreshed = await current.refetch();
              if (!refreshed.isError && refreshed.data) setFailure(null);
            }}
          >
            Reload current status
          </Button>
          <Button kind="tertiary" disabled={busy} onClick={close}>
            Back to invoices
          </Button>
        </div>
      </section>
    </Modal>
  );
}
