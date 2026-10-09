import { Button, Modal } from '@bahmni/design-system';
import { useQuery } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { money } from './billingFormat';
import styles from './BillingPage.module.scss';
import {
  BillingSessionExpired,
  getInvoiceWorkflow,
  InvoiceWorkflow,
  postInvoiceWorkflow,
} from './billingService';

export function InvoiceWorkflowModal({
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
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<Error | null>(null);
  const busyRef = useRef(false);
  const current = useQuery({
    queryKey: ['billing', 'invoice-workflow', uid, invoiceId],
    queryFn: () => getInvoiceWorkflow(invoiceId),
    retry: false,
    refetchOnMount: 'always',
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
  const invoice = current.data;
  const expired =
    failure instanceof BillingSessionExpired ||
    current.error instanceof BillingSessionExpired;
  const post = async () => {
    if (
      !invoice ||
      !invoice.can_post ||
      !invoice.ledger_balanced ||
      invoice.state !== 'draft' ||
      busyRef.current ||
      failure ||
      current.isFetching ||
      current.isError
    )
      return;
    busyRef.current = true;
    setBusy(true);
    try {
      completed(await postInvoiceWorkflow(invoice));
    } catch (error) {
      setFailure(
        error instanceof Error
          ? error
          : new Error('Posting response unavailable.'),
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
      modalHeading="Review invoice posting"
      preventCloseOnClickOutside
      onRequestClose={() => {
        if (!busyRef.current) close();
      }}
    >
      <section
        className={styles.card}
        aria-label="Invoice posting review"
        aria-busy={busy}
      >
        {expired ? (
          <div role="alert">
            <p>
              Your Billing session expired. Reconnect, then check the current
              invoice status.
            </p>
            <Button kind="tertiary" onClick={reconnect}>
              Reconnect Billing
            </Button>
          </div>
        ) : current.isFetching ? (
          <p role="status">
            Reading the current invoice and journal balance...
          </p>
        ) : current.isError ? (
          <p role="alert">{current.error.message}</p>
        ) : invoice ? (
          <>
            <p className={styles.eyebrow}>NATIVE BILLING WORKFLOW</p>
            <h2>
              {invoice.name ||
                (invoice.move_type === 'out_refund'
                  ? 'Draft credit note'
                  : 'Draft invoice')}
            </h2>
            <p>Customer: {invoice.customer || 'Not set'}</p>
            <p>
              Company: {invoice.company} · Journal: {invoice.journal}
            </p>
            <p>Current status: {invoice.state}</p>
            <p>
              Invoice date:{' '}
              {invoice.invoice_date ||
                'Native Billing will set the date when posting.'}
            </p>
            <p>Final total: {money(invoice.total, invoice.currency[1])}</p>
            {invoice.state === 'posted' ? (
              <p>
                Open amount: {money(invoice.open_amount, invoice.currency[1])} ·{' '}
                {invoice.payment_state.replaceAll('_', ' ')}
              </p>
            ) : null}
            {!invoice.ledger_balanced ? (
              <div role="alert">
                <p>
                  The journal entries do not balance. Do not record a payment
                  against this invoice. Ask your Billing administrator to review
                  it.
                </p>
              </div>
            ) : invoice.can_post ? (
              <>
                <h3>What will happen?</h3>
                <p>
                  Posting assigns the native invoice number and records its
                  accounting entries. Billing validates analytic accounts,
                  taxes, dates and locked periods. The balance check must pass.
                </p>
                <p>
                  This does not receive money or issue a refund. The remaining
                  amount follows native Billing records.
                </p>
                <Button
                  disabled={busy || !!failure}
                  onClick={() => void post()}
                >
                  {invoice.move_type === 'out_refund'
                    ? 'Post credit note'
                    : 'Post invoice'}
                </Button>
              </>
            ) : (
              <p>
                No posting action is available for this invoice status, schedule
                or your account permissions.
              </p>
            )}
          </>
        ) : null}
        {busy ? (
          <p role="status">Posting in native Billing. Please wait...</p>
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
            Back to invoices
          </Button>
        </div>
      </section>
    </Modal>
  );
}
