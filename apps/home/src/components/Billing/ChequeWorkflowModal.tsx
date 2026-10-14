import { Button, Modal, TextInput } from '@bahmni/design-system';
import { useQuery } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { money } from './billingFormat';
import styles from './BillingPage.module.scss';
import {
  BillingActionRejected,
  BillingSessionExpired,
  checkedChequeRequest,
  ChequeRequest,
  ChequeWorkflow,
  downloadCheque,
  downloadCurrentCheque,
  getChequeStatus,
  getChequeWorkflow,
  previewChequeWorkflow,
  printChequeWorkflow,
} from './billingService';

export function ChequeWorkflowModal({
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
  const storageKey = `qorlia.billing.cheque.pending:${uid}:${paymentId}`;
  const [recovery] = useState(() => {
    try {
      const stored = sessionStorage.getItem(storageKey);
      const request = stored ? checkedChequeRequest(JSON.parse(stored)) : null;
      if (request && request.payment_id !== paymentId)
        throw new Error('Wrong payment.');
      return { request, error: null };
    } catch {
      return {
        request: null,
        error: new Error(
          'Cheque recovery storage is unavailable or invalid. Check this payment with your Billing administrator before printing.',
        ),
      };
    }
  });
  const [pending, setPending] = useState<ChequeRequest | null>(
    recovery.request,
  );
  const [accepted, setAccepted] = useState(false);
  const [prepared, setPrepared] = useState<ChequeWorkflow | null>(null);
  const [number, setNumber] = useState('');
  const [review, setReview] = useState<ChequeWorkflow | null>(null);
  const [failure, setFailure] = useState<Error | null>(recovery.error);
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const current = useQuery({
    queryKey: ['billing', 'cheque', uid, paymentId],
    queryFn: () => getChequeWorkflow(paymentId),
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
    !!pending ||
    !!recovery.error ||
    expired;
  const pdfDownload = ({
    filename,
    blob,
  }: {
    filename: string;
    blob: Blob;
  }) => {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    try {
      anchor.click();
    } finally {
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
    setNotice(
      'Cheque PDF download requested. Check the file and your bank stationery before printing. Physical printing and bank clearance are not confirmed.',
    );
  };
  const run = async (action: () => Promise<void>) => {
    if (busyRef.current || current.isFetching || expired) return;
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
          : new Error('Cheque workflow unavailable. Check its saved status.'),
      );
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };
  const print = async () => {
    if (
      busyRef.current ||
      recovery.error ||
      expired ||
      current.isFetching ||
      (!pending && (!review?.review_version || locked || failure))
    )
      return;
    await run(async () => {
      const request =
        pending ??
        checkedChequeRequest({
          payment_id: paymentId,
          version: review!.version,
          review_version: review!.review_version!,
          check_number: review!.manual_sequencing ? false : number,
          request_key: crypto.randomUUID(),
        });
      sessionStorage.setItem(storageKey, JSON.stringify(request));
      setPending(request);
      try {
        const result = await printChequeWorkflow(request);
        setPrepared(result.payment);
        setAccepted(true);
        setReview(null);
        pdfDownload(result.pdf);
      } catch (error) {
        if (error instanceof BillingActionRejected) {
          sessionStorage.removeItem(storageKey);
          setPending(null);
          setReview(null);
        }
        throw error;
      }
    });
  };
  return (
    <Modal
      open
      passiveModal
      size="lg"
      modalHeading="Cheque printing review"
      preventCloseOnClickOutside
      onRequestClose={() => {
        if (!busyRef.current) close();
      }}
    >
      <section
        className={styles.card}
        aria-label="Cheque printing review"
        aria-busy={busy}
      >
        <p>
          Use the installed bank-compatible cheque layout and native numbering.
          This does not record another payment, transfer money, confirm physical
          printing or clear the cheque.
        </p>
        {current.isFetching ? (
          <p role="status">
            Reading the saved cheque and its native configuration...
          </p>
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
            <p>Cheque layout: {payment.layout || 'Not configured'}</p>
            {payment.reason ? <p role="status">{payment.reason}</p> : null}
            {payment.can_print && !pending ? (
              <>
                {payment.manual_sequencing ? (
                  <p>
                    Native Billing already assigned number{' '}
                    {payment.check_number}. It will not be replaced.
                  </p>
                ) : (
                  <>
                    <TextInput
                      id="cheque-print-number"
                      labelText="Number on cheque stationery"
                      value={number}
                      disabled={locked}
                      onChange={(event) => {
                        setNumber(event.target.value);
                        setReview(null);
                      }}
                    />
                    {payment.check_number ? (
                      <p>
                        A new print review replaces the saved cheque number.
                        Verify the stationery before continuing.
                      </p>
                    ) : null}
                  </>
                )}
                <Button
                  kind="tertiary"
                  disabled={
                    locked ||
                    (!payment.manual_sequencing &&
                      !/^[0-9]{1,19}$/.test(number))
                  }
                  onClick={() =>
                    void run(async () =>
                      setReview(
                        await previewChequeWorkflow(
                          payment,
                          payment.manual_sequencing ? false : number,
                        ),
                      ),
                    )
                  }
                >
                  Review cheque number
                </Button>
              </>
            ) : null}
            {review && !pending ? (
              <section className={styles.review} aria-label="Reviewed cheque">
                <h3>Print number {review.number_to_print}</h3>
                <p>
                  Layout: {review.layout}. Native Billing will assign this
                  number where needed and mark the payment sent when the PDF is
                  generated.
                </p>
                <Button
                  disabled={locked || !!failure}
                  onClick={() => void print()}
                >
                  Generate cheque PDF and mark sent
                </Button>
              </section>
            ) : null}
            {pending ? (
              <>
                <p>
                  {accepted
                    ? 'The print request was accepted. Downloading again preserves the same cheque number.'
                    : 'A print request may already have been accepted. Check it before another action. No write is retried automatically.'}
                </p>
                <Button
                  kind="tertiary"
                  disabled={busy || expired || current.isFetching}
                  onClick={() =>
                    void run(async () => {
                      const result = await getChequeStatus(pending);
                      setPrepared(result.payment);
                      setAccepted(result.accepted);
                      setNotice(
                        result.accepted
                          ? 'Native Billing accepted this request. You can download its PDF without assigning another number.'
                          : 'No receipt was found yet. This does not prove the original request stopped. Check again or ask your Billing administrator.',
                      );
                    })
                  }
                >
                  Check cheque request status
                </Button>
                {accepted ? (
                  <Button
                    kind="tertiary"
                    disabled={busy || expired || current.isFetching}
                    onClick={() =>
                      void run(async () =>
                        pdfDownload(await downloadCheque(pending)),
                      )
                    }
                  >
                    Download accepted cheque PDF
                  </Button>
                ) : null}
                {!accepted ? (
                  <Button
                    kind="tertiary"
                    disabled={
                      busy || expired || current.isFetching || !!recovery.error
                    }
                    onClick={() => void print()}
                  >
                    Retry identical cheque request
                  </Button>
                ) : null}
              </>
            ) : payment.sent && payment.layout && payment.check_number ? (
              <Button
                kind="tertiary"
                disabled={locked}
                onClick={() =>
                  void run(async () =>
                    pdfDownload(await downloadCurrentCheque(paymentId)),
                  )
                }
              >
                Download saved cheque PDF
              </Button>
            ) : null}
          </>
        ) : null}
        {busy ? <p role="status">Working in native Billing...</p> : null}
        {failure ? <p role="alert">{failure.message}</p> : null}
        {notice ? <p role="status">{notice}</p> : null}
        {expired ? (
          <Button kind="tertiary" disabled={busy} onClick={reconnect}>
            Reconnect Billing
          </Button>
        ) : null}
        <div className={styles.toolbar}>
          <Button
            kind="tertiary"
            disabled={busy || current.isFetching}
            onClick={() =>
              void run(async () => {
                const result = await current.refetch();
                if (result.data && !result.isError) {
                  setPrepared(null);
                  setReview(null);
                }
              })
            }
          >
            Reload cheque status
          </Button>
          <Button kind="ghost" disabled={busy} onClick={close}>
            Back to payments
          </Button>
        </div>
      </section>
    </Modal>
  );
}
