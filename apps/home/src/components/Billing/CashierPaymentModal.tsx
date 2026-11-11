import { Button, Modal, TextInput } from '@bahmni/design-system';
import { useQuery } from '@tanstack/react-query';
import { FormEvent, useRef, useState } from 'react';
import { invoiceName, money } from './billingFormat';
import styles from './BillingPage.module.scss';
import {
  BillingSessionExpired,
  getPaymentWorkflow,
  PaymentValues,
  PaymentWorkflow,
  previewPaymentWorkflow,
  recordPaymentWorkflow,
} from './billingService';
import cashier from './CashierPanel.module.scss';
import { printBill, printReceipt } from './cashierPrint';
import { BillingReportsModal } from './InvoiceReportsModal';

// Cheques need dates and references the simple form does not ask for.
const CHEQUE_METHODS = ['pdc', 'check_printing'];

// A front desk uses a few methods. The rest stay one click away, and the
// methods this browser used last come first.
const SHOWN_METHODS = 4;
const RECENT_METHODS_KEY = 'qorlia.cashier.recentJournals';

const readRecentMethods = (): number[] => {
  try {
    const value: unknown = JSON.parse(
      window.localStorage.getItem(RECENT_METHODS_KEY) ?? '[]',
    );
    return Array.isArray(value)
      ? value.filter((id): id is number => Number.isInteger(id))
      : [];
  } catch {
    return [];
  }
};

const rememberMethod = (journalId: number) => {
  try {
    window.localStorage.setItem(
      RECENT_METHODS_KEY,
      JSON.stringify(
        [
          journalId,
          ...readRecentMethods().filter((id) => id !== journalId),
        ].slice(0, SHOWN_METHODS),
      ),
    );
  } catch {
    // Without storage the order simply stays as Billing lists it.
  }
};

/** Recently used methods first, then Billing's own order. */
export const orderMethods = (
  journals: [number, string][],
  recent: number[],
): [number, string][] => {
  const rank = (id: number) => {
    const index = recent.indexOf(id);
    return index === -1 ? recent.length : index;
  };
  return journals
    .map((journal, index) => ({ journal, index }))
    .sort(
      (a, b) => rank(a.journal[0]) - rank(b.journal[0]) || a.index - b.index,
    )
    .map(({ journal }) => journal);
};

type Props = {
  uid: number;
  invoiceId: number;
  close: () => void;
  /** The cashier finished with this bill after recording a payment. */
  completed: (payment: PaymentWorkflow) => void;
  /** Open the full accounting payment form for this bill. */
  moreOptions: () => void;
  reconnect: () => void;
};

/**
 * Front-desk payment: pick how the patient paid, confirm the amount, record,
 * then print. Uses the same reviewed native load, preview and record as the
 * accounting payment form; the native version check refuses a second record
 * of the same reviewed payment.
 */
export function CashierPaymentModal({
  uid,
  invoiceId,
  close,
  completed,
  moreOptions,
  reconnect,
}: Props) {
  const [prepared, setPrepared] = useState<PaymentWorkflow | null>(null);
  const [amount, setAmount] = useState<string | null>(null);
  const [reference, setReference] = useState('');
  const [review, setReview] = useState<PaymentWorkflow | null>(null);
  const [recorded, setRecorded] = useState<PaymentWorkflow | null>(null);
  const [printing, setPrinting] = useState<{
    kind: 'payment' | 'invoice';
    id: number;
  } | null>(null);
  const [printFailure, setPrintFailure] = useState('');
  const [allMethods, setAllMethods] = useState(false);
  const [recentMethods] = useState(readRecentMethods);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<Error | null>(null);
  const [uncertain, setUncertain] = useState(false);
  const busyRef = useRef(false);
  const current = useQuery({
    queryKey: ['billing', 'cashier-payment', uid, invoiceId],
    queryFn: () => getPaymentWorkflow(invoiceId),
    retry: false,
    refetchOnMount: 'always',
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
  const payment = prepared ?? current.data;
  const values = (payment ? payment.values : false) || null;
  const currency = payment?.currency[1] ?? 'INR';
  const due = payment?.invoice.open_amount ?? 0;
  const enteredAmount = amount ?? (values ? String(values.amount) : '');
  const parsedAmount = Number(enteredAmount);
  const validAmount =
    enteredAmount.trim() !== '' &&
    Number.isFinite(parsedAmount) &&
    parsedAmount > 0;
  const expired =
    failure instanceof BillingSessionExpired ||
    current.error instanceof BillingSessionExpired;
  const cheque =
    !!payment?.method_code && CHEQUE_METHODS.includes(payment.method_code);

  const run = async (task: () => Promise<void>) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setFailure(null);
    try {
      await task();
    } catch (error) {
      setFailure(
        error instanceof Error ? error : new Error('Billing did not answer.'),
      );
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  const chooseJournal = (journalId: number) => {
    if (!payment || !values || values.journal_id === journalId) return;
    setReview(null);
    void run(async () => {
      // Native onchange picks the journal's payment method and currency.
      setPrepared(
        await previewPaymentWorkflow(
          payment.invoice,
          { ...values, journal_id: journalId },
          'journal_id',
        ),
      );
    });
  };

  const reviewPayment = (event: FormEvent) => {
    event.preventDefault();
    if (!payment || !values || !validAmount || uncertain) return;
    const next: PaymentValues = {
      ...values,
      amount: parsedAmount,
      bank_reference: reference.trim() || false,
      // Part payments keep the rest due; extra money stays as patient credit.
      payment_difference_handling: 'open',
    };
    void run(async () => {
      const result = await previewPaymentWorkflow(payment.invoice, next);
      setPrepared(result);
      setReview(result);
    });
  };

  const record = () => {
    if (!review?.can_record || uncertain) return;
    void run(async () => {
      try {
        const result = await recordPaymentWorkflow(review);
        if (review.values) rememberMethod(review.values.journal_id);
        setRecorded(result);
      } catch (error) {
        setUncertain(true);
        throw error;
      }
    });
  };

  const reload = async () => {
    setPrepared(null);
    setReview(null);
    setAmount(null);
    setFailure(null);
    const refreshed = await current.refetch();
    if (!refreshed.isError) setUncertain(false);
  };

  const print = (task: () => Promise<void>) => {
    setPrintFailure('');
    task().catch((error: unknown) =>
      setPrintFailure(
        error instanceof BillingSessionExpired
          ? 'Your Billing session expired. Reconnect to print.'
          : 'The PDF could not be opened. Try again, or choose another format.',
      ),
    );
  };

  if (printing)
    return (
      <BillingReportsModal
        uid={uid}
        kind={printing.kind}
        recordId={printing.id}
        close={() => setPrinting(null)}
        reconnect={reconnect}
      />
    );

  if (recorded) {
    const before = new Set(payment?.payments.map((item) => item.id));
    const receipt = recorded.payments
      .filter((item) => !before.has(item.id))
      .sort((a, b) => b.id - a.id)[0];
    const stillDue = recorded.invoice.open_amount;
    return (
      <Modal
        open
        passiveModal
        size="sm"
        modalHeading="Payment recorded"
        onRequestClose={() => completed(recorded)}
      >
        <section aria-label="Payment result">
          <p className={cashier.notice} role="status">
            {money(review?.values ? review.values.amount : 0, currency)}{' '}
            received for {invoiceName(recorded.invoice)}.{' '}
            {stillDue > 0
              ? `Still due: ${money(stillDue, currency)}.`
              : 'Fully paid.'}
          </p>
          <div className={styles.toolbar}>
            {receipt ? (
              <Button onClick={() => print(() => printReceipt(receipt.id))}>
                Print receipt
              </Button>
            ) : null}
            <Button
              kind="tertiary"
              onClick={() => print(() => printBill(recorded.invoice.id))}
            >
              Print bill
            </Button>
            <Button kind="ghost" onClick={() => completed(recorded)}>
              Done
            </Button>
          </div>
          {printFailure ? (
            <div role="alert">
              <p>{printFailure}</p>
              <Button
                kind="ghost"
                size="sm"
                onClick={() =>
                  setPrinting(
                    receipt
                      ? { kind: 'payment', id: receipt.id }
                      : { kind: 'invoice', id: recorded.invoice.id },
                  )
                }
              >
                Other print formats
              </Button>
            </div>
          ) : null}
        </section>
      </Modal>
    );
  }

  const orderedMethods = orderMethods(payment?.journals ?? [], recentMethods);
  const shownMethods = allMethods
    ? orderedMethods
    : orderedMethods.filter(
        ([id], index) => index < SHOWN_METHODS || id === values?.journal_id,
      );
  const hiddenMethods = orderedMethods.length - shownMethods.length;
  const journalName = (id: number | false) =>
    payment?.journals.find(([journal]) => journal === id)?.[1] ?? 'Not set';
  const afterPayment = review?.values ? due - review.values.amount : 0;

  return (
    <Modal
      open
      passiveModal
      size="sm"
      modalHeading={
        payment
          ? `Collect payment · ${invoiceName(payment.invoice)}`
          : 'Collect payment'
      }
      preventCloseOnClickOutside
      onRequestClose={() => {
        if (!busyRef.current) close();
      }}
    >
      <section aria-label="Collect payment" aria-busy={busy}>
        {expired ? (
          <div role="alert">
            <p>Your Billing session expired. Reconnect, then check the bill.</p>
            <Button kind="tertiary" onClick={reconnect}>
              Reconnect Billing
            </Button>
          </div>
        ) : current.isFetching && !payment ? (
          <p role="status">Loading the bill...</p>
        ) : current.isError ? (
          <p role="alert">{current.error.message}</p>
        ) : payment ? (
          <>
            <p>
              {payment.invoice.customer || 'No patient'} · Due{' '}
              <strong>{money(due, currency)}</strong>
            </p>
            {!payment.invoice.ledger_balanced ? (
              <p role="alert">
                This bill does not balance in the accounts. Do not take payment.
                Ask your Billing administrator.
              </p>
            ) : !values ? (
              <p role="status">
                {payment.reason || 'This bill cannot take a payment now.'}
              </p>
            ) : (
              <form onSubmit={reviewPayment}>
                <fieldset
                  className={cashier.methods}
                  disabled={busy || uncertain}
                >
                  <legend>Paid by</legend>
                  {shownMethods.map(([id, name]) => (
                    <Button
                      key={id}
                      type="button"
                      size="md"
                      kind={values.journal_id === id ? 'primary' : 'tertiary'}
                      aria-pressed={values.journal_id === id}
                      onClick={() => chooseJournal(id)}
                    >
                      {name}
                    </Button>
                  ))}
                  {hiddenMethods > 0 ? (
                    <Button
                      type="button"
                      size="md"
                      kind="ghost"
                      onClick={() => setAllMethods(true)}
                    >
                      More methods ({hiddenMethods})
                    </Button>
                  ) : null}
                </fieldset>
                {cheque ? (
                  <p role="status">
                    Cheques need more details. Use More options.
                  </p>
                ) : null}
                <TextInput
                  id="cashier-payment-amount"
                  labelText="Amount received"
                  type="number"
                  min="0.01"
                  step="any"
                  value={enteredAmount}
                  disabled={busy || uncertain}
                  invalid={!validAmount}
                  invalidText="Enter an amount above zero."
                  onChange={(event) => {
                    setAmount(event.target.value);
                    setReview(null);
                  }}
                />
                <TextInput
                  id="cashier-payment-reference"
                  labelText="Reference (UPI or card transaction, optional)"
                  value={reference}
                  maxLength={500}
                  disabled={busy || uncertain}
                  onChange={(event) => {
                    setReference(event.target.value);
                    setReview(null);
                  }}
                />
                {!review ? (
                  <div className={styles.toolbar}>
                    <Button
                      type="submit"
                      disabled={busy || uncertain || cheque || !validAmount}
                    >
                      Review payment
                    </Button>
                  </div>
                ) : null}
              </form>
            )}

            {review?.values ? (
              <section
                aria-label="Payment to record"
                className={cashier.review}
              >
                <p>
                  Receive{' '}
                  <strong>{money(review.values.amount, currency)}</strong> by{' '}
                  {journalName(review.values.journal_id)} on{' '}
                  {review.values.payment_date}.
                </p>
                <p className={cashier.subtle}>
                  {afterPayment > 0
                    ? `${money(afterPayment, currency)} will still be due.`
                    : afterPayment < 0
                      ? `${money(-afterPayment, currency)} extra stays on the patient's account as credit.`
                      : 'The bill will be fully paid.'}
                </p>
                {review.can_record ? (
                  <Button disabled={busy || uncertain} onClick={record}>
                    Record payment
                  </Button>
                ) : (
                  <p role="alert">
                    {review.reason || 'This payment cannot be recorded.'}
                  </p>
                )}
              </section>
            ) : null}
          </>
        ) : null}

        {busy ? <p role="status">Working...</p> : null}
        {failure && !expired ? (
          <div role="alert">
            <p>{failure.message}</p>
            {uncertain ? (
              <p>
                The payment may already be recorded. Reload to see the current
                balance before trying again.
              </p>
            ) : null}
          </div>
        ) : null}

        <div className={styles.toolbar}>
          <Button
            kind="tertiary"
            size="sm"
            disabled={busy}
            onClick={() => void reload()}
          >
            Reload
          </Button>
          <Button kind="ghost" size="sm" disabled={busy} onClick={moreOptions}>
            More options
          </Button>
          <Button kind="ghost" size="sm" disabled={busy} onClick={close}>
            Cancel
          </Button>
        </div>
      </section>
    </Modal>
  );
}
