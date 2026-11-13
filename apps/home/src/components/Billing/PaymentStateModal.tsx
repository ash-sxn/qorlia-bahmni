import { Button, Modal } from '@bahmni/design-system';
import { useQuery } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { money } from './billingFormat';
import styles from './BillingPage.module.scss';
import {
  BillingActionRejected,
  BillingSessionExpired,
  checkedPaymentStateRequest,
  getPaymentStateWorkflow,
  getPaymentStateRequestStatus,
  previewPaymentStateWorkflow,
  savePaymentStateWorkflow,
  PaymentStateAction,
  PaymentStateRequest,
  PaymentStateWorkflow,
} from './billingService';

export const paymentStateStorageKey = (uid: number) =>
  `qorlia.billing.payment.state.pending:${uid}`;
export function pendingPaymentState(uid: number) {
  const stored = sessionStorage.getItem(paymentStateStorageKey(uid));
  return stored ? checkedPaymentStateRequest(JSON.parse(stored)) : null;
}
export const paymentStateLabels = {
  draft: 'Draft',
  posted: 'Posted',
  cancel: 'Cancelled',
};
const actionLabels = {
  post: 'Confirm payment',
  reset: 'Reset to Draft',
  cancel: 'Cancel draft payment',
};
const documentLabels: Record<string, string> = {
  entry: 'Journal entry',
  out_invoice: 'Customer invoice',
  out_refund: 'Customer credit note',
  in_invoice: 'Vendor bill',
  in_refund: 'Vendor credit note',
};

export function PaymentStateModal({
  uid,
  paymentId,
  close,
  completed,
  reconnect,
}: {
  uid: number;
  paymentId: number;
  close: () => void;
  completed: () => void;
  reconnect: () => void;
}) {
  const key = paymentStateStorageKey(uid);
  const [recovery] = useState(() => {
    try {
      const request = pendingPaymentState(uid);
      if (request && request.payment_id !== paymentId)
        throw new Error('Another payment request is pending.');
      return { request, error: null };
    } catch {
      return {
        request: null,
        error: new Error(
          'Payment recovery storage is unavailable or invalid. Ask your Billing administrator to check it before another action.',
        ),
      };
    }
  });
  const [pending, setPending] = useState<PaymentStateRequest | null>(
    recovery.request,
  );
  const [prepared, setPrepared] = useState<PaymentStateWorkflow | null>(null);
  const [review, setReview] = useState<PaymentStateWorkflow | null>(null);
  const [accepted, setAccepted] = useState(false);
  const [failure, setFailure] = useState<Error | null>(recovery.error);
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const current = useQuery({
    queryKey: ['billing', 'payment-state', uid, paymentId],
    queryFn: () => getPaymentStateWorkflow(paymentId),
    retry: false,
    refetchOnMount: 'always',
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
  const payment = prepared ?? current.data;
  const expired =
    failure instanceof BillingSessionExpired ||
    current.error instanceof BillingSessionExpired;
  const locked =
    busy ||
    current.isFetching ||
    current.isError ||
    expired ||
    !!recovery.error;
  const run = async (action: () => Promise<void>) => {
    if (busyRef.current || current.isFetching || expired || recovery.error)
      return;
    busyRef.current = true;
    setBusy(true);
    setFailure(null);
    setNotice('');
    try {
      await action();
    } catch (error) {
      setFailure(
        error instanceof Error
          ? error
          : new Error('Payment status unavailable. Check the exact request.'),
      );
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };
  const save = () =>
    run(async () => {
      if (
        !pending &&
        (!review?.review_version || !review.action || locked || failure)
      )
        return;
      const request =
        pending ??
        checkedPaymentStateRequest({
          payment_id: paymentId,
          version: review!.version,
          review_version: review!.review_version!,
          action: review!.action!,
          request_key: crypto.randomUUID(),
        });
      sessionStorage.setItem(key, JSON.stringify(request));
      setPending(request);
      try {
        const result = await savePaymentStateWorkflow(request);
        setPrepared(result.payment);
        setAccepted(result.accepted);
        setReview(null);
        setNotice(
          'Native Billing accepted this exact request. Review the current saved state and document balances.',
        );
      } catch (error) {
        if (error instanceof BillingActionRejected) {
          sessionStorage.removeItem(key);
          setPending(null);
          setReview(null);
        }
        throw error;
      }
    });
  const check = async () => {
    if (!pending) return;
    const result = await getPaymentStateRequestStatus(pending);
    setPrepared(result.payment);
    setAccepted(result.accepted);
    setNotice(
      result.accepted
        ? 'This exact request was accepted. Current saved state is shown below.'
        : 'No receipt found yet. This does not prove the original request stopped. Check again or retry only the identical request.',
    );
  };
  return (
    <Modal
      open
      passiveModal
      size="lg"
      modalHeading="Customer payment review"
      preventCloseOnClickOutside
      onRequestClose={() => {
        if (!busyRef.current) close();
      }}
    >
      <section
        className={styles.card}
        aria-label="Customer payment review"
        aria-busy={busy}
      >
        <p>
          These actions update native accounting records. They do not move
          money, stop a bank payment or delete payment history.
        </p>
        {current.isFetching ? (
          <p role="status">Reading payment and connected allocations...</p>
        ) : null}
        {current.isError ? <p role="alert">{current.error.message}</p> : null}
        {payment ? (
          <>
            <h2>{payment.name}</h2>
            <p>
              {payment.customer} · {money(payment.amount, payment.currency[1])}{' '}
              · State: {paymentStateLabels[payment.state]}
            </p>
            <p>
              {payment.journal} · {payment.method} · Accounting date:{' '}
              {payment.date} · Effective date:{' '}
              {payment.effective_date || 'Not set'}
            </p>
            <p>
              Cheque number: {payment.check_number || 'Not assigned'} · Marked
              sent: {payment.sent ? 'Yes' : 'No'} · Native bank-matched flag:{' '}
              {payment.bank_matched ? 'Yes' : 'No'}
            </p>
            <h3>Connected documents and current balances</h3>
            <p>
              Includes payment reconciliation and selected Bahmni credit
              allocations. Reset can reopen these balances and reverse exchange
              or cash-basis entries. Values shown are current, not predicted
              final balances.
            </p>
            <div
              className={styles.tableScroll}
              role="region"
              aria-label="Connected payment documents"
              tabIndex={0}
            >
              <table>
                <caption>Documents in payment review</caption>
                <thead>
                  <tr>
                    <th>Document</th>
                    <th>Type</th>
                    <th>State</th>
                    <th>Total</th>
                    <th>Open amount</th>
                  </tr>
                </thead>
                <tbody>
                  {payment.documents.map((row) => (
                    <tr key={row.id}>
                      <td>{row.name}</td>
                      <td>{documentLabels[row.type] || row.type}</td>
                      <td>
                        {paymentStateLabels[
                          row.state as keyof typeof paymentStateLabels
                        ] || row.state}
                      </td>
                      <td>{money(row.total, row.currency[1])}</td>
                      <td>{money(row.open_amount, row.currency[1])}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!pending ? (
              <div className={styles.toolbar}>
                {(['post', 'reset', 'cancel'] as PaymentStateAction[]).map(
                  (action) => (
                    <div key={action}>
                      <Button
                        kind="tertiary"
                        disabled={locked || !!payment.reasons[action]}
                        onClick={() =>
                          void run(async () =>
                            setReview(
                              await previewPaymentStateWorkflow(
                                payment,
                                action,
                              ),
                            ),
                          )
                        }
                      >
                        Review: {actionLabels[action]}
                      </Button>
                      {payment.reasons[action] ? (
                        <p>{payment.reasons[action]}</p>
                      ) : null}
                    </div>
                  ),
                )}
              </div>
            ) : null}
            {review && !pending ? (
              <section
                className={styles.review}
                aria-label="Reviewed payment action"
              >
                <h3>{actionLabels[review.action!]}</h3>
                <p>
                  {review.action === 'reset'
                    ? 'Reset removes native allocations and clears the sent flag. Review reopened balances before recording another payment. Cancel is a separate step after reset.'
                    : review.action === 'cancel'
                      ? 'Cancel this draft payment. A cancelled record remains in payment history and can be reset to draft through its native workflow.'
                      : `Confirm this draft through native Billing. It may assign document and cheque numbers or adjust a locked accounting date. ${review.auto_allocate ? 'Bahmni auto-allocation is enabled for the selected credit and outstanding documents.' : 'Bahmni auto-allocation is not enabled.'} This is not cheque printing or bank clearance.`}
                </p>
                <Button
                  kind={review.action === 'post' ? 'primary' : 'danger'}
                  disabled={locked || !!failure}
                  onClick={() => void save()}
                >
                  Save reviewed payment action
                </Button>
              </section>
            ) : null}
          </>
        ) : null}
        {pending ? (
          <>
            <p>
              {accepted
                ? 'This exact request was accepted. Finish before another payment action.'
                : 'This request may already have been saved. No write is retried automatically.'}
            </p>
            <Button
              kind="tertiary"
              disabled={locked}
              onClick={() => void run(check)}
            >
              Check payment request
            </Button>
            {!accepted ? (
              <Button
                kind="danger"
                disabled={locked}
                onClick={() => void save()}
              >
                Retry identical payment request
              </Button>
            ) : (
              <Button
                kind="tertiary"
                disabled={locked}
                onClick={() =>
                  void run(async () => {
                    const result = await getPaymentStateRequestStatus(pending);
                    if (!result.accepted)
                      throw new Error(
                        'Accepted receipt unavailable. Keep this recovery request.',
                      );
                    sessionStorage.removeItem(key);
                    completed();
                  })
                }
              >
                Finish and reload payment history
              </Button>
            )}
          </>
        ) : (
          <Button
            kind="tertiary"
            disabled={locked}
            onClick={() =>
              void run(async () => {
                setReview(null);
                setPrepared(await getPaymentStateWorkflow(paymentId));
              })
            }
          >
            Reload payment state
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
          Back to payment history
        </Button>
      </section>
    </Modal>
  );
}
