import { Button, Modal } from '@bahmni/design-system';
import { useQuery } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { money } from './billingFormat';
import styles from './BillingPage.module.scss';
import {
  BillingActionRejected,
  BillingSessionExpired,
  checkedChequeSentRequest,
  ChequeSentRequest,
  ChequeSentWorkflow,
  getChequeSentRequestStatus,
  getChequeSentWorkflow,
  previewChequeSentWorkflow,
  saveChequeSentWorkflow,
} from './billingService';

export function ChequeSentModal({
  uid,
  paymentId,
  close,
  reconnect,
}: {
  uid: number;
  paymentId: number;
  close: () => void;
  reconnect: () => void;
}) {
  const key = `qorlia.billing.cheque.sent.pending:${uid}:${paymentId}`;
  const [recovery] = useState(() => {
    try {
      const stored = sessionStorage.getItem(key);
      const request = stored
        ? checkedChequeSentRequest(JSON.parse(stored))
        : null;
      if (request && request.payment_id !== paymentId)
        throw new Error('Wrong payment.');
      return { request, error: null };
    } catch {
      return {
        request: null,
        error: new Error(
          'Sent-status recovery storage is unavailable or invalid. Check this payment with your Billing administrator before changing its status.',
        ),
      };
    }
  });
  const [pending, setPending] = useState<ChequeSentRequest | null>(
    recovery.request,
  );
  const [prepared, setPrepared] = useState<ChequeSentWorkflow | null>(null);
  const [review, setReview] = useState<ChequeSentWorkflow | null>(null);
  const [accepted, setAccepted] = useState(false);
  const [failure, setFailure] = useState<Error | null>(recovery.error);
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const current = useQuery({
    queryKey: ['billing', 'cheque-sent', uid, paymentId],
    queryFn: () => getChequeSentWorkflow(paymentId),
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
              'Sent-status action unavailable. Check the request status.',
            ),
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
        (!review?.action || !review.review_version || locked || failure)
      )
        return;
      const request =
        pending ??
        checkedChequeSentRequest({
          payment_id: paymentId,
          version: review!.version,
          review_version: review!.review_version!,
          action: review!.action!,
          request_key: crypto.randomUUID(),
        });
      sessionStorage.setItem(key, JSON.stringify(request));
      setPending(request);
      try {
        const result = await saveChequeSentWorkflow(request);
        setPrepared(result.payment);
        setAccepted(result.accepted);
        setReview(null);
        setNotice(
          'Native Billing accepted the sent-status request. The status shown is the current saved status, not proof of physical delivery or bank clearance.',
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
      modalHeading="Cheque sent-status review"
      preventCloseOnClickOutside
      onRequestClose={() => {
        if (!busyRef.current) close();
      }}
    >
      <section
        className={styles.card}
        aria-label="Cheque sent-status review"
        aria-busy={busy}
      >
        <p>
          Update the native sent flag only. This does not print, renumber,
          cancel or clear a cheque, move money, or change invoice allocations.
        </p>
        {current.isFetching ? (
          <p role="status">Reading saved cheque status...</p>
        ) : null}
        {current.isError ? <p role="alert">{current.error.message}</p> : null}
        {payment ? (
          <>
            <h2>{payment.name}</h2>
            <p>
              {money(payment.amount, payment.currency[1])} · {payment.journal}
            </p>
            <p>Saved cheque number: {payment.check_number || 'Not assigned'}</p>
            <p>
              Marked sent: {payment.sent ? 'Yes' : 'No'} · Bank matching:{' '}
              {payment.bank_matched ? 'Complete' : 'Pending'}
            </p>
            {payment.reason ? <p role="status">{payment.reason}</p> : null}
            {payment.can_update && !pending ? (
              <Button
                kind="tertiary"
                disabled={locked}
                onClick={() =>
                  void run(async () =>
                    setReview(
                      await previewChequeSentWorkflow(
                        payment,
                        payment.sent ? 'unmark_sent' : 'mark_sent',
                      ),
                    ),
                  )
                }
              >
                {payment.sent ? 'Review unmark sent' : 'Review mark sent'}
              </Button>
            ) : null}
            {review && !pending ? (
              <section
                className={styles.review}
                aria-label="Reviewed sent-status action"
              >
                <h3>
                  {review.action === 'mark_sent'
                    ? 'Mark this cheque sent'
                    : 'Unmark this cheque sent'}
                </h3>
                <p>
                  Only the sent flag will change. Cheque number, ledger, invoice
                  balances and bank-matching status stay unchanged.
                </p>
                {review.action === 'unmark_sent' ? (
                  <p>
                    Unmarking allows another print review. Check the existing
                    physical cheque before printing again.
                  </p>
                ) : null}
                <Button
                  disabled={locked || !!failure}
                  onClick={() => void save()}
                >
                  Save reviewed sent status
                </Button>
              </section>
            ) : null}
          </>
        ) : null}
        {pending ? (
          <>
            <p>
              {accepted
                ? 'This exact request was accepted. Check the current saved status before starting another action.'
                : 'The request may already have been accepted. No write is retried automatically.'}
            </p>
            <Button
              kind="tertiary"
              disabled={locked}
              onClick={() =>
                void run(async () => {
                  const result = await getChequeSentRequestStatus(pending);
                  setPrepared(result.payment);
                  setAccepted(result.accepted);
                  setNotice(
                    result.accepted
                      ? 'This request was accepted. The current saved status is shown above.'
                      : 'No receipt was found yet. This does not prove the original request stopped. Check again or retry only this identical request.',
                  );
                })
              }
            >
              Check sent-status request
            </Button>
            {!accepted ? (
              <Button disabled={locked} onClick={() => void save()}>
                Retry identical sent-status request
              </Button>
            ) : (
              <Button
                kind="tertiary"
                disabled={locked}
                onClick={() =>
                  void run(async () => {
                    const fresh = await getChequeSentWorkflow(paymentId);
                    sessionStorage.removeItem(key);
                    setPending(null);
                    setAccepted(false);
                    setReview(null);
                    setPrepared(fresh);
                  })
                }
              >
                Finish request and reload status
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
                setPrepared(await getChequeSentWorkflow(paymentId));
              })
            }
          >
            Reload sent status
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
