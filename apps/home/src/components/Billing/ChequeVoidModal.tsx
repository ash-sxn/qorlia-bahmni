import { Button, Modal } from '@bahmni/design-system';
import { useQuery } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { money } from './billingFormat';
import styles from './BillingPage.module.scss';
import {
  BillingActionRejected,
  BillingSessionExpired,
  checkedChequeVoidRequest,
  ChequeVoidRequest,
  ChequeVoidWorkflow,
  getChequeVoidRequestStatus,
  getChequeVoidWorkflow,
  previewChequeVoidWorkflow,
  saveChequeVoidWorkflow,
} from './billingService';

const documentTypes: Record<string, string> = {
  entry: 'Journal entry',
  out_invoice: 'Customer invoice',
  out_refund: 'Customer credit note',
  in_invoice: 'Vendor bill',
  in_refund: 'Vendor credit note',
  out_receipt: 'Sales receipt',
  in_receipt: 'Purchase receipt',
};
const states: Record<string, string> = {
  draft: 'Draft',
  posted: 'Posted',
  cancel: 'Cancelled',
};

export const chequeVoidStorageKey = (uid: number, invoiceId: number) =>
  `qorlia.billing.cheque.void.pending:${uid}:${invoiceId}`;
export function pendingChequeVoid(uid: number, invoiceId: number) {
  const stored = sessionStorage.getItem(chequeVoidStorageKey(uid, invoiceId));
  return stored ? checkedChequeVoidRequest(JSON.parse(stored)) : null;
}

export function ChequeVoidModal({
  uid,
  invoiceId,
  paymentId,
  close,
  completed,
  reconnect,
}: {
  uid: number;
  invoiceId: number;
  paymentId: number;
  close: () => void;
  completed: () => void;
  reconnect: () => void;
}) {
  const key = chequeVoidStorageKey(uid, invoiceId);
  const [recovery] = useState(() => {
    try {
      const request = pendingChequeVoid(uid, invoiceId);
      if (request && request.payment_id !== paymentId)
        throw new Error('Another cheque request is pending.');
      return { request, error: null };
    } catch {
      return {
        request: null,
        error: new Error(
          'Cheque void recovery storage is unavailable or invalid. Ask your Billing administrator to check the payment before any further action.',
        ),
      };
    }
  });
  const [pending, setPending] = useState<ChequeVoidRequest | null>(
    recovery.request,
  );
  const [prepared, setPrepared] = useState<ChequeVoidWorkflow | null>(null);
  const [review, setReview] = useState<ChequeVoidWorkflow | null>(null);
  const [accepted, setAccepted] = useState(false);
  const [failure, setFailure] = useState<Error | null>(recovery.error);
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const current = useQuery({
    queryKey: ['billing', 'cheque-void', uid, paymentId],
    queryFn: () => getChequeVoidWorkflow(paymentId),
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
          : new Error(
              'Cheque void unavailable. Check the exact request status.',
            ),
      );
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };
  const save = () =>
    run(async () => {
      if (!pending && (!review?.review_version || locked || failure)) return;
      const request =
        pending ??
        checkedChequeVoidRequest({
          payment_id: paymentId,
          version: review!.version,
          review_version: review!.review_version!,
          request_key: crypto.randomUUID(),
        });
      sessionStorage.setItem(key, JSON.stringify(request));
      setPending(request);
      try {
        const result = await saveChequeVoidWorkflow(request);
        setPrepared(result.payment);
        setAccepted(result.accepted);
        setReview(null);
        setNotice(
          'Native Billing accepted this void request. Review the current cheque state and connected document balances below.',
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
  return (
    <Modal
      open
      passiveModal
      size="lg"
      modalHeading="Cheque void review"
      preventCloseOnClickOutside
      onRequestClose={() => {
        if (!busyRef.current) close();
      }}
    >
      <section
        className={styles.card}
        aria-label="Cheque void review"
        aria-busy={busy}
      >
        <p>
          Void through native Billing. This resets and cancels the cheque
          payment and can reopen invoice or credit-note allocations. It does not
          stop payment at the bank, refund money or delete the payment history.
        </p>
        {current.isFetching ? (
          <p role="status">Reading cheque and connected allocations...</p>
        ) : null}
        {current.isError ? <p role="alert">{current.error.message}</p> : null}
        {payment ? (
          <>
            <h2>{payment.name}</h2>
            <p>
              {money(payment.amount, payment.currency[1])} · State:{' '}
              {states[payment.state] ?? payment.state}
            </p>
            <p>
              Cheque number: {payment.check_number || 'Not assigned'} · Marked
              sent: {payment.sent ? 'Yes' : 'No'} · Bank matching:{' '}
              {payment.bank_matched ? 'Complete' : 'Pending'}
            </p>
            {payment.reason ? <p role="status">{payment.reason}</p> : null}
            <h3>Connected documents and current balances</h3>
            <p>
              Includes the cheque reconciliation and Bahmni&apos;s selected
              credit allocations. Native void may reverse related exchange or
              cash-basis entries. Balances shown are current values, not
              promised final balances.
            </p>
            <div
              className={styles.tableScroll}
              tabIndex={0}
              role="region"
              aria-label="Connected cheque documents"
            >
              <table>
                <caption>Documents in cheque void review</caption>
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
                      <td>{documentTypes[row.type] ?? row.type}</td>
                      <td>{states[row.state] ?? row.state}</td>
                      <td>{money(row.total, row.currency[1])}</td>
                      <td>{money(row.open_amount, row.currency[1])}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {payment.can_void && !pending ? (
              <Button
                kind="tertiary"
                disabled={locked}
                onClick={() =>
                  void run(async () =>
                    setReview(await previewChequeVoidWorkflow(payment)),
                  )
                }
              >
                Review native cheque void
              </Button>
            ) : null}
            {review && !pending ? (
              <section
                className={styles.review}
                aria-label="Reviewed cheque void"
              >
                <h3>
                  Cancel this cheque payment and remove its native allocations
                </h3>
                <p>
                  Confirm that the connected documents above are the intended
                  ones. If the cheque has been physically issued or cleared,
                  arrange the necessary bank action separately. This screen only
                  changes your accounting records.
                </p>
                <Button
                  kind="danger"
                  disabled={locked || !!failure}
                  onClick={() => void save()}
                >
                  Void reviewed cheque
                </Button>
              </section>
            ) : null}
          </>
        ) : null}
        {pending ? (
          <>
            <p>
              {accepted
                ? 'This exact void request was accepted. Check the current native state before finishing.'
                : 'The void may already have been saved. No write is retried automatically.'}
            </p>
            <Button
              kind="tertiary"
              disabled={locked}
              onClick={() =>
                void run(async () => {
                  const result = await getChequeVoidRequestStatus(pending);
                  setPrepared(result.payment);
                  setAccepted(result.accepted);
                  setNotice(
                    result.accepted
                      ? 'The exact void request was accepted. Current saved state is shown above.'
                      : 'No receipt was found yet. That does not prove the original request stopped. Check again or retry only this identical request.',
                  );
                })
              }
            >
              Check cheque void request
            </Button>
            {!accepted ? (
              <Button
                kind="danger"
                disabled={locked}
                onClick={() => void save()}
              >
                Retry identical cheque void request
              </Button>
            ) : (
              <Button
                kind="tertiary"
                disabled={locked}
                onClick={() =>
                  void run(async () => {
                    const result = await getChequeVoidRequestStatus(pending);
                    if (!result.accepted)
                      throw new Error(
                        'The accepted void receipt is unavailable. Keep this recovery request.',
                      );
                    sessionStorage.removeItem(key);
                    completed();
                  })
                }
              >
                Finish void and reload invoice
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
                setPrepared(await getChequeVoidWorkflow(paymentId));
              })
            }
          >
            Reload cheque void status
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
          Back to payments
        </Button>
      </section>
    </Modal>
  );
}
