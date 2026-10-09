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
import { BillingReportsModal } from './InvoiceReportsModal';

export function PaymentWorkflowModal({
  uid,
  invoiceId,
  close,
  completed,
  reconnect,
}: {
  uid: number;
  invoiceId: number;
  close: () => void;
  completed: (payment: PaymentWorkflow) => void;
  reconnect: () => void;
}) {
  const [prepared, setPrepared] = useState<PaymentWorkflow | null>(null);
  const [draft, setDraft] = useState<PaymentValues | null>(null);
  const [review, setReview] = useState<PaymentWorkflow | null>(null);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<Error | null>(null);
  const [uncertain, setUncertain] = useState(false);
  const [receipt, setReceipt] = useState<number | null>(null);
  const busyRef = useRef(false);
  const current = useQuery({
    queryKey: ['billing', 'payment-workflow', uid, invoiceId],
    queryFn: () => getPaymentWorkflow(invoiceId),
    retry: false,
    refetchOnMount: 'always',
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
  const payment = prepared ?? current.data;
  const values = draft ?? payment?.values;
  const expired =
    failure instanceof BillingSessionExpired ||
    current.error instanceof BillingSessionExpired;
  const change = <K extends keyof PaymentValues>(
    field: K,
    value: PaymentValues[K],
  ) => {
    if (!values || busyRef.current) return;
    setDraft({ ...values, [field]: value });
    setReview(null);
  };
  const preview = async (
    next: PaymentValues,
    changed:
      | false
      | 'journal_id'
      | 'payment_method_line_id'
      | 'currency_id'
      | 'payment_date' = false,
  ) => {
    if (!payment || busyRef.current || current.isFetching || uncertain) return;
    busyRef.current = true;
    setBusy(true);
    setFailure(null);
    setReview(null);
    try {
      const result = await previewPaymentWorkflow(
        payment.invoice,
        next,
        changed,
      );
      setPrepared(result);
      setDraft(null);
      if (!changed) setReview(result);
    } catch (error) {
      setFailure(
        error instanceof Error
          ? error
          : new Error('Payment preview unavailable.'),
      );
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };
  const record = async () => {
    if (
      !review?.can_record ||
      busyRef.current ||
      failure ||
      current.isFetching ||
      uncertain
    )
      return;
    busyRef.current = true;
    setBusy(true);
    try {
      completed(await recordPaymentWorkflow(review));
    } catch (error) {
      setUncertain(true);
      setFailure(
        error instanceof Error
          ? error
          : new Error('Payment response unavailable.'),
      );
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };
  const select = (
    field:
      | 'journal_id'
      | 'payment_method_line_id'
      | 'currency_id'
      | 'partner_bank_id'
      | 'writeoff_account_id',
    title: string,
    options: [number, string][],
    recompute = false,
  ) =>
    values ? (
      <label className={styles.select} htmlFor={`payment-${field}`}>
        {title}
        <select
          id={`payment-${field}`}
          value={values[field] || ''}
          disabled={busy || uncertain}
          onChange={(event) => {
            const value = event.target.value
              ? Number(event.target.value)
              : false;
            if (
              recompute &&
              (field === 'journal_id' ||
                field === 'currency_id' ||
                field === 'payment_method_line_id')
            ) {
              setDraft({ ...values, [field]: value });
              void preview({ ...values, [field]: value }, field);
            } else change(field, value);
          }}
        >
          <option value="">Select {title.toLowerCase()}</option>
          {options.map(([id, name]) => (
            <option key={id} value={id}>
              {name}
            </option>
          ))}
        </select>
      </label>
    ) : null;
  if (receipt !== null)
    return (
      <BillingReportsModal
        uid={uid}
        kind="payment"
        recordId={receipt}
        close={() => setReceipt(null)}
        reconnect={reconnect}
      />
    );
  return (
    <Modal
      open
      passiveModal
      size="lg"
      modalHeading="Review payment recording"
      preventCloseOnClickOutside
      onRequestClose={() => {
        if (!busyRef.current) close();
      }}
    >
      <section
        className={styles.card}
        aria-label="Payment recording review"
        aria-busy={busy}
      >
        {expired ? (
          <div role="alert">
            <p>
              Your Billing session expired. Reconnect and check the saved
              payment status.
            </p>
            <Button kind="tertiary" onClick={reconnect}>
              Reconnect Billing
            </Button>
          </div>
        ) : current.isFetching ? (
          <p role="status">
            Reading the invoice, payments and native payment options...
          </p>
        ) : current.isError ? (
          <p role="alert">{current.error.message}</p>
        ) : payment ? (
          <>
            <p className={styles.eyebrow}>NATIVE BILLING WORKFLOW</p>
            <h2>{invoiceName(payment.invoice)}</h2>
            <p>Customer: {payment.invoice.customer || 'Not set'}</p>
            <p>Company: {payment.invoice.company}</p>
            <p>
              Open amount:{' '}
              {money(payment.invoice.open_amount, payment.invoice.currency[1])}{' '}
              · {payment.invoice.payment_state.replaceAll('_', ' ')}
            </p>
            <p>
              Record money or a cheque already received or issued. This form
              does not charge a card or transfer money from a bank.
            </p>
            {payment.method_code === 'pdc' ? (
              <p role="status">
                The effective date records when the post-dated cheque is due.
                This Billing version posts on the payment date, not the
                effective date. Recording does not schedule a bank deposit or
                confirm clearance.
              </p>
            ) : null}
            {!payment.invoice.ledger_balanced ? (
              <p role="alert">
                The invoice journal entries do not balance. Do not record a
                payment.
              </p>
            ) : null}
            {payment.reason ? <p role="status">{payment.reason}</p> : null}
            {values ? (
              <form
                className={styles.form}
                onSubmit={(event: FormEvent) => {
                  event.preventDefault();
                  void preview(values);
                }}
              >
                <h3>
                  {payment.payment_type === 'outbound'
                    ? 'Refund payment details'
                    : 'Payment details'}
                </h3>
                {select(
                  'journal_id',
                  'Payment journal',
                  payment.journals,
                  true,
                )}
                {select(
                  'payment_method_line_id',
                  'Payment method',
                  payment.methods,
                  true,
                )}
                {select(
                  'currency_id',
                  'Payment currency',
                  payment.currencies,
                  true,
                )}
                <TextInput
                  id="payment-amount"
                  labelText="Amount"
                  type="number"
                  min="0.000001"
                  step="any"
                  required
                  value={values.amount}
                  disabled={busy || uncertain}
                  onChange={(event) =>
                    change('amount', Number(event.target.value))
                  }
                />
                <TextInput
                  id="payment-date"
                  labelText="Payment date"
                  type="date"
                  required
                  value={values.payment_date}
                  disabled={busy || uncertain}
                  onChange={(event) => {
                    setDraft({ ...values, payment_date: event.target.value });
                    if (event.target.value)
                      void preview(
                        { ...values, payment_date: event.target.value },
                        'payment_date',
                      );
                    else setReview(null);
                  }}
                />
                <TextInput
                  id="payment-bank-reference"
                  labelText="Bank reference"
                  value={values.bank_reference || ''}
                  maxLength={500}
                  disabled={busy || uncertain}
                  onChange={(event) =>
                    change('bank_reference', event.target.value)
                  }
                />
                <TextInput
                  id="payment-cheque-reference"
                  labelText="Cheque reference"
                  value={values.cheque_reference || ''}
                  maxLength={500}
                  disabled={busy || uncertain}
                  onChange={(event) =>
                    change('cheque_reference', event.target.value)
                  }
                />
                <TextInput
                  id="payment-effective-date"
                  labelText="Cheque effective date"
                  type="date"
                  required={payment.method_code === 'pdc'}
                  value={values.effective_date || ''}
                  disabled={busy || uncertain}
                  onChange={(event) =>
                    change('effective_date', event.target.value || false)
                  }
                />
                <TextInput
                  id="payment-memo"
                  labelText="Memo"
                  value={values.communication || ''}
                  maxLength={500}
                  disabled={busy || uncertain}
                  onChange={(event) =>
                    change('communication', event.target.value)
                  }
                />
                {payment.banks.length
                  ? select(
                      'partner_bank_id',
                      'Recipient bank account',
                      payment.banks,
                    )
                  : null}
                <label className={styles.select} htmlFor="payment-difference">
                  Payment difference
                  <select
                    id="payment-difference"
                    value={values.payment_difference_handling}
                    disabled={busy || uncertain}
                    onChange={(event) =>
                      change(
                        'payment_difference_handling',
                        event.target.value as 'open' | 'reconcile',
                      )
                    }
                  >
                    <option value="open">Keep the remaining amount open</option>
                    <option value="reconcile">
                      Settle the difference using native accounting
                    </option>
                  </select>
                </label>
                {values.payment_difference_handling === 'reconcile' ? (
                  <>
                    {select(
                      'writeoff_account_id',
                      'Difference account',
                      payment.accounts,
                    )}
                    <TextInput
                      id="payment-writeoff-label"
                      labelText="Difference label"
                      value={values.writeoff_label || ''}
                      maxLength={500}
                      disabled={busy || uncertain}
                      onChange={(event) =>
                        change('writeoff_label', event.target.value)
                      }
                    />
                  </>
                ) : null}
                <Button
                  type="submit"
                  disabled={busy || uncertain || current.isFetching}
                >
                  Review payment
                </Button>
              </form>
            ) : null}
            {review ? (
              <section aria-label="Reviewed payment">
                <h3>Check before recording</h3>
                <p>
                  {review.method_code === 'pdc' ||
                  review.method_code === 'check_printing'
                    ? 'Cheque amount'
                    : review.payment_type === 'outbound'
                      ? 'Money sent'
                      : 'Money received'}
                  :{' '}
                  {money(
                    review.values ? review.values.amount : 0,
                    review.currency[1],
                  )}
                </p>
                <p>Date: {review.values ? review.values.payment_date : ''}</p>
                <p>
                  Method:{' '}
                  {review.methods.find(
                    ([id]) =>
                      id ===
                      (review.values && review.values.payment_method_line_id),
                  )?.[1] ?? 'Not selected'}
                </p>
                {review.values ? (
                  <>
                    <p>
                      Bank reference:{' '}
                      {review.values.bank_reference || 'Not set'}
                    </p>
                    <p>
                      Cheque reference:{' '}
                      {review.values.cheque_reference || 'Not set'}
                    </p>
                    {review.values.effective_date ? (
                      <p>
                        Cheque effective date: {review.values.effective_date}
                      </p>
                    ) : null}
                  </>
                ) : null}
                <p>
                  Journal:{' '}
                  {review.values
                    ? review.journals.find(
                        ([id]) =>
                          id === (review.values && review.values.journal_id),
                      )?.[1]
                    : ''}
                </p>
                <p>
                  Native payment difference:{' '}
                  {money(review.difference, review.currency[1])}.
                </p>
                <p>
                  {review.values &&
                  review.values.payment_difference_handling === 'reconcile'
                    ? 'Native Billing will settle the difference using the reviewed difference or early-payment discount entries.'
                    : 'Any remaining amount stays open. Any excess becomes unapplied payment credit.'}
                </p>
                <p>
                  Recording creates and posts a payment journal entry and
                  reconciles it against this invoice. Payment status follows
                  native Billing; bank clearance is not implied.
                </p>
                {review.can_record ? (
                  <Button
                    disabled={busy || !!failure || uncertain}
                    onClick={() => void record()}
                  >
                    {review.payment_type === 'outbound'
                      ? 'Record refund payment'
                      : 'Record payment'}
                  </Button>
                ) : null}
              </section>
            ) : null}
            <h3>Payments linked by native reconciliation</h3>
            {payment.payments.length ? (
              <ul>
                {payment.payments.map((item) => (
                  <li key={item.id}>
                    {item.name}: {money(item.amount, item.currency_id[1])},{' '}
                    {item.date}, {item.journal_id[1]}, {item.state}
                    {item.ref ? `, ${item.ref}` : ''}
                    {item.method_code === 'pdc'
                      ? ', post-dated cheque'
                      : item.method_code === 'check_printing'
                        ? ', cheque'
                        : null}
                    {item.bank_reference
                      ? `, bank reference: ${item.bank_reference}`
                      : null}
                    {item.cheque_reference
                      ? `, cheque reference: ${item.cheque_reference}`
                      : null}
                    {item.effective_date
                      ? `, cheque effective date: ${item.effective_date}`
                      : null}
                    {item.journal_type === 'bank'
                      ? item.is_matched
                        ? ', bank matching complete'
                        : ', bank matching pending'
                      : null}
                    {item.state === 'posted' ? (
                      <Button
                        kind="tertiary"
                        disabled={busy || uncertain || current.isFetching}
                        onClick={() => setReceipt(item.id)}
                      >
                        PDF receipts for {item.name}
                      </Button>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p>No linked payments.</p>
            )}
          </>
        ) : null}
        {busy ? (
          <p role="status">Working in native Billing. Please wait...</p>
        ) : null}
        {failure && !expired ? (
          <div role="alert">
            <p>{failure.message}</p>
            {uncertain ? (
              <p>
                The payment may already have been saved. Reload and inspect the
                linked payments before any further action. It will not be sent
                again automatically.
              </p>
            ) : null}
          </div>
        ) : null}
        <div className={styles.toolbar}>
          <Button
            kind="tertiary"
            disabled={busy || current.isFetching}
            onClick={async () => {
              const result = await current.refetch();
              if (!result.isError && result.data) {
                setPrepared(null);
                setDraft(null);
                setReview(null);
                setFailure(null);
                setUncertain(false);
              }
            }}
          >
            Reload current payment status
          </Button>
          <Button kind="tertiary" disabled={busy} onClick={close}>
            Back to invoices
          </Button>
        </div>
      </section>
    </Modal>
  );
}
