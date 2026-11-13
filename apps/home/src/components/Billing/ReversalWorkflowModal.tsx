import { Button, Modal, TextInput } from '@bahmni/design-system';
import { useQuery } from '@tanstack/react-query';
import { FormEvent, useRef, useState } from 'react';
import { invoiceName, money } from './billingFormat';
import styles from './BillingPage.module.scss';
import {
  BillingSessionExpired,
  getReversalWorkflow,
  previewReversalWorkflow,
  ReversalResult,
  ReversalValues,
  ReversalWorkflow,
  runReversalWorkflow,
} from './billingService';

export function ReversalWorkflowModal({
  uid,
  invoiceId,
  close,
  completed,
  reconnect,
}: {
  uid: number;
  invoiceId: number;
  close: () => void;
  completed: (result: ReversalResult) => void;
  reconnect: () => void;
}) {
  const [draft, setDraft] = useState<ReversalValues | null>(null);
  const [review, setReview] = useState<ReversalWorkflow | null>(null);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [failure, setFailure] = useState<Error | null>(null);
  const [uncertain, setUncertain] = useState(false);
  const current = useQuery({
    queryKey: ['billing', 'reversal-workflow', uid, invoiceId],
    queryFn: () => getReversalWorkflow(invoiceId),
    retry: false,
    refetchOnMount: 'always',
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
  const loaded = current.data;
  const values = draft ?? loaded?.values;
  const expired =
    failure instanceof BillingSessionExpired ||
    current.error instanceof BillingSessionExpired;
  const change = <K extends keyof ReversalValues>(
    field: K,
    value: ReversalValues[K],
  ) => {
    if (!values || busyRef.current || uncertain) return;
    setDraft({ ...values, [field]: value });
    setReview(null);
  };
  const preview = async (event: FormEvent) => {
    event.preventDefault();
    if (
      !loaded ||
      !values ||
      busyRef.current ||
      uncertain ||
      current.isFetching ||
      current.isError
    )
      return;
    busyRef.current = true;
    setBusy(true);
    setFailure(null);
    setReview(null);
    try {
      setReview(await previewReversalWorkflow(loaded, values));
    } catch (error) {
      setFailure(
        error instanceof Error
          ? error
          : new Error('Credit-note preview unavailable.'),
      );
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };
  const confirm = async () => {
    if (
      !review?.can_reverse ||
      busyRef.current ||
      uncertain ||
      failure ||
      current.isFetching ||
      current.isError
    )
      return;
    busyRef.current = true;
    setBusy(true);
    try {
      completed(await runReversalWorkflow(review));
    } catch (error) {
      setUncertain(true);
      setFailure(
        error instanceof Error
          ? error
          : new Error('Credit-note response unavailable.'),
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
      modalHeading="Create a credit note"
      preventCloseOnClickOutside
      onRequestClose={() => {
        if (!busyRef.current) close();
      }}
    >
      <section
        className={styles.card}
        aria-label="Credit-note creation review"
        aria-busy={busy}
      >
        {expired ? (
          <div role="alert">
            <p>
              Your Billing session expired. Reconnect and check the saved credit
              notes.
            </p>
            <Button kind="tertiary" onClick={reconnect}>
              Reconnect Billing
            </Button>
          </div>
        ) : current.isFetching ? (
          <p role="status">
            Reading the invoice and native reversal options...
          </p>
        ) : current.isError ? (
          <p role="alert">{current.error.message}</p>
        ) : loaded ? (
          <>
            <p className={styles.eyebrow}>NATIVE BILLING WORKFLOW</p>
            <h2>{invoiceName(loaded.invoice)}</h2>
            <p>
              Customer: {loaded.invoice.customer || 'Not set'} · Company:{' '}
              {loaded.invoice.company}
            </p>
            <p>
              Total: {money(loaded.invoice.total, loaded.invoice.currency[1])} ·
              Open amount:{' '}
              {money(loaded.invoice.open_amount, loaded.invoice.currency[1])}
            </p>
            {loaded.reason ? <p role="status">{loaded.reason}</p> : null}
            {values ? (
              <form
                className={styles.form}
                onSubmit={(event) => void preview(event)}
              >
                <label className={styles.select} htmlFor="reversal-method">
                  Credit-note method
                  <select
                    id="reversal-method"
                    value={values.refund_method}
                    disabled={busy || uncertain}
                    onChange={(event) =>
                      change(
                        'refund_method',
                        event.target.value as ReversalValues['refund_method'],
                      )
                    }
                  >
                    {loaded.methods.map(([id, name]) => (
                      <option key={id} value={id}>
                        {name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className={styles.select} htmlFor="reversal-journal">
                  Reversal journal
                  <select
                    id="reversal-journal"
                    value={values.journal_id || ''}
                    required
                    disabled={busy || uncertain}
                    onChange={(event) =>
                      change(
                        'journal_id',
                        event.target.value ? Number(event.target.value) : false,
                      )
                    }
                  >
                    <option value="">Select a journal</option>
                    {loaded.journals.map(([id, name]) => (
                      <option key={id} value={id}>
                        {name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className={styles.select} htmlFor="reversal-date-mode">
                  Reversal date
                  <select
                    id="reversal-date-mode"
                    value={values.date_mode}
                    disabled={busy || uncertain}
                    onChange={(event) =>
                      change(
                        'date_mode',
                        event.target.value as ReversalValues['date_mode'],
                      )
                    }
                  >
                    <option value="custom">Specific date</option>
                    <option value="entry">Original journal entry date</option>
                  </select>
                </label>
                {values.date_mode === 'custom' ? (
                  <TextInput
                    id="reversal-date"
                    labelText="Credit-note date"
                    type="date"
                    value={values.date || ''}
                    required
                    disabled={busy || uncertain}
                    onChange={(event) => change('date', event.target.value)}
                  />
                ) : null}
                <TextInput
                  id="reversal-reason"
                  labelText="Reason"
                  value={values.reason || ''}
                  maxLength={500}
                  disabled={busy || uncertain}
                  onChange={(event) => change('reason', event.target.value)}
                />
                <Button
                  type="submit"
                  kind="tertiary"
                  disabled={busy || uncertain}
                >
                  Review credit note
                </Button>
              </form>
            ) : null}
            {review?.values ? (
              <section aria-label="Selected credit-note consequences">
                <h3>Review before creating</h3>
                <p>
                  Credit-note date: {review.effective_date} · Method:{' '}
                  {
                    review.methods.find(
                      ([method]) =>
                        review.values && method === review.values.refund_method,
                    )?.[1]
                  }
                </p>
                <p>
                  Native Billing applies the accounting period rules when
                  posting and may adjust the journal entry date.
                </p>
                {review.scheduled ? (
                  <p>
                    This creates a draft credit note scheduled for native
                    posting on its future date. It does not reduce the invoice
                    balance now.
                  </p>
                ) : review.values.refund_method === 'refund' ? (
                  <p>
                    This copies the original invoice into an editable draft
                    credit note. It is not posted or allocated automatically.
                    Review its items before issuing a partial credit.
                  </p>
                ) : (
                  <p>
                    Native Billing posts the full credit note, releases existing
                    invoice allocations and reconciles the credit against the
                    original invoice. Released receipts remain posted and may
                    need allocation again.
                  </p>
                )}
                {review.values.refund_method === 'modify' ? (
                  <p>
                    A separate replacement invoice is also created in draft. It
                    is not posted or paid automatically.
                  </p>
                ) : null}
                <p>
                  This action does not transfer or refund money, return stock or
                  cancel the sales order.
                </p>
                {review.reason ? <p role="alert">{review.reason}</p> : null}
                <Button
                  kind="danger"
                  disabled={
                    busy || uncertain || !!failure || !review.can_reverse
                  }
                  onClick={() => void confirm()}
                >
                  Confirm credit-note creation
                </Button>
              </section>
            ) : null}
            <h3>Existing credit notes for this invoice</h3>
            {loaded.history.length ? (
              <ul>
                {loaded.history.map((move) => (
                  <li key={move.id}>
                    {invoiceName(move)} · {move.state} ·{' '}
                    {money(move.total, move.currency[1])}
                  </li>
                ))}
              </ul>
            ) : (
              <p>No linked credit notes are recorded.</p>
            )}
          </>
        ) : null}
        {busy ? (
          <p role="status">
            Reviewing or saving the native credit note. Please wait...
          </p>
        ) : null}
        {failure && !expired ? (
          <div role="alert">
            <p>{failure.message}</p>
            {uncertain ? (
              <p>
                The request may already have reached Billing. Reload the invoice
                and linked credit notes before reviewing again. It will not be
                sent again automatically.
              </p>
            ) : null}
          </div>
        ) : null}
        <div className={styles.toolbar}>
          <Button
            kind="tertiary"
            disabled={busy || current.isFetching}
            onClick={async () => {
              setDraft(null);
              setReview(null);
              const refreshed = await current.refetch();
              if (!refreshed.isError && refreshed.data) {
                setFailure(null);
                setUncertain(false);
              }
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
