import { Button, Modal, TextInput } from '@bahmni/design-system';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { money } from './billingFormat';
import styles from './BillingPage.module.scss';
import {
  BillingActionRejected,
  BillingSessionExpired,
  checkedCustomerPaymentDraftRequest,
  changeCustomerPaymentDraft,
  CustomerPaymentDraft,
  CustomerPaymentDraftChoiceKind,
  CustomerPaymentDraftRequest,
  CustomerPaymentDraftValues,
  getCustomerPaymentDraft,
  getCustomerPaymentDraftRequestStatus,
  PaymentStateWorkflow,
  previewCustomerPaymentDraft,
  saveCustomerPaymentDraft,
} from './billingService';
import { DraftChoiceInput } from './DraftChoiceInput';
import { paymentStateLabels } from './PaymentStateModal';

export const paymentDraftStorageKey = (uid: number) =>
  `qorlia.billing.payment.draft.pending:${uid}`;
export function pendingCustomerPaymentDraft(uid: number) {
  const stored = sessionStorage.getItem(paymentDraftStorageKey(uid));
  return stored ? checkedCustomerPaymentDraftRequest(JSON.parse(stored)) : null;
}

export function CustomerPaymentDraftEditor({
  uid,
  paymentId,
  close,
  completed,
  reconnect,
}: {
  uid: number;
  paymentId: number | false;
  close: () => void;
  completed: (payment: PaymentStateWorkflow) => void;
  reconnect: () => void;
}) {
  const key = paymentDraftStorageKey(uid);
  const [recovery] = useState(() => {
    try {
      const request = pendingCustomerPaymentDraft(uid);
      if (request && request.payload.id !== paymentId)
        throw new Error('Another payment draft save is pending.');
      return { request, error: null };
    } catch {
      return {
        request: null,
        error: new Error(
          'Payment draft recovery storage is unavailable or invalid. Ask your Billing administrator to check it before another save.',
        ),
      };
    }
  });
  const [pending, setPending] = useState<CustomerPaymentDraftRequest | null>(
    recovery.request,
  );
  const [draft, setDraft] = useState<CustomerPaymentDraft | null>(null);
  const [reviewed, setReviewed] = useState<CustomerPaymentDraft | null>(null);
  const [accepted, setAccepted] = useState<PaymentStateWorkflow | null>(null);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [failure, setFailure] = useState<Error | null>(recovery.error);
  const [notice, setNotice] = useState('');
  const [discard, setDiscard] = useState<'close' | 'reconnect' | null>(null);
  const loaded = useQuery({
    queryKey: ['billing', 'customer-payment-draft', uid, paymentId],
    queryFn: () => getCustomerPaymentDraft(paymentId),
    enabled: !pending && !recovery.error,
    retry: false,
    refetchOnMount: 'always',
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
  const current = draft ?? loaded.data;
  const expired =
    failure instanceof BillingSessionExpired ||
    loaded.error instanceof BillingSessionExpired;
  const locked =
    busy ||
    !!pending ||
    expired ||
    loaded.isFetching ||
    loaded.isError ||
    !!recovery.error;
  useEffect(() => {
    if (!dirty && !pending && !busy) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty, pending, busy]);
  const run = async (action: () => Promise<void>) => {
    if (busyRef.current || recovery.error) return;
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
              'Payment draft result unavailable. Your request remains here.',
            ),
      );
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };
  const payload = (value: CustomerPaymentDraft) => ({
    id: value.id,
    version: value.version,
    values: value.values,
  });
  const change = <K extends keyof CustomerPaymentDraftValues>(
    field: K,
    value: CustomerPaymentDraftValues[K],
    immediate = false,
  ) => {
    if (!current || locked || busyRef.current) return;
    const next = { ...current, values: { ...current.values, [field]: value } };
    setDraft(next);
    setReviewed(null);
    setDirty(true);
    setFailure(null);
    if (immediate)
      void run(async () =>
        setDraft(await changeCustomerPaymentDraft(payload(next), field)),
      );
  };
  const navigate = (target: 'close' | 'reconnect') => {
    if (busyRef.current) return;
    if (pending) {
      if (target === 'close') close();
      else reconnect();
    } else if (dirty) setDiscard(target);
    else if (target === 'close') close();
    else reconnect();
  };
  const save = () =>
    void run(async () => {
      if (!pending && (!reviewed || locked || failure)) return;
      const request =
        pending ??
        checkedCustomerPaymentDraftRequest({
          payload: payload(reviewed!),
          review_version: reviewed!.review_version,
          request_key: crypto.randomUUID(),
        });
      // Persist before the financial write; lost responses may only retry this identical request.
      sessionStorage.setItem(key, JSON.stringify(request));
      setPending(request);
      try {
        const result = await saveCustomerPaymentDraft(request);
        if (result.accepted && result.payment) {
          setAccepted(result.payment);
          setNotice(
            'Native Billing accepted this exact draft save. Review the current saved payment below.',
          );
        }
      } catch (error) {
        if (error instanceof BillingActionRejected) {
          sessionStorage.removeItem(key);
          setPending(null);
          setReviewed(null);
        }
        throw error;
      }
    });
  const choice = (
    field:
      | 'partner_id'
      | 'company_id'
      | 'journal_id'
      | 'payment_method_line_id'
      | 'partner_bank_id'
      | 'currency_id',
    title: string,
    kind: CustomerPaymentDraftChoiceKind,
    readonly = false,
  ) =>
    current ? (
      <DraftChoiceInput
        key={`${field}:${current.values[field]}`}
        id={`payment-draft-${field}`}
        label={title}
        kind={kind}
        uid={uid}
        paymentValues={current.values}
        value={current.values[field]}
        name={current.labels[field]}
        disabled={locked || readonly}
        onChange={(value) => {
          if (field !== 'company_id' || value !== false)
            change(field, value, true);
        }}
        reconnect={() => navigate('reconnect')}
      />
    ) : null;
  const text = (
    field:
      | 'date'
      | 'effective_date'
      | 'ref'
      | 'payment_reference'
      | 'bank_reference'
      | 'cheque_reference',
    title: string,
    type = 'text',
    readonly = false,
  ) =>
    current ? (
      <TextInput
        id={`payment-draft-${field}`}
        labelText={title}
        type={type}
        maxLength={2000}
        value={current.values[field] || ''}
        disabled={locked || readonly}
        onChange={(event) => change(field, event.target.value || false)}
      />
    ) : null;
  const currency = current?.labels.currency_id ?? 'Currency not set';
  return (
    <Modal
      open
      passiveModal
      size="lg"
      modalHeading={
        paymentId ? 'Edit customer payment draft' : 'New customer payment draft'
      }
      preventCloseOnClickOutside
      onRequestClose={() => navigate('close')}
    >
      {discard ? (
        <div role="alert">
          <h3>Discard unsaved payment changes?</h3>
          <p>
            Your unsaved form entries will be lost. No draft save is pending.
          </p>
          <Button
            kind="danger"
            onClick={discard === 'close' ? close : reconnect}
          >
            Discard changes{discard === 'reconnect' ? ' and reconnect' : ''}
          </Button>
          <Button kind="tertiary" onClick={() => setDiscard(null)}>
            Keep editing
          </Button>
        </div>
      ) : (
        <section
          className={styles.card}
          aria-label="Customer payment draft editor"
          aria-busy={busy}
        >
          <p>
            Save creates or edits a draft accounting record. It does not confirm
            a payment, reconcile invoices or move bank funds.
          </p>
          {loaded.isFetching && !pending ? (
            <p role="status">Loading native payment defaults...</p>
          ) : null}
          {busy ? <p role="status">Checking native Billing...</p> : null}
          {notice ? <p role="status">{notice}</p> : null}
          {failure || loaded.isError ? (
            <p role="alert">{failure?.message ?? loaded.error?.message}</p>
          ) : null}
          {loaded.isError && !pending && !recovery.error ? (
            <Button
              kind="tertiary"
              disabled={busy}
              onClick={() => void loaded.refetch()}
            >
              Retry payment editor
            </Button>
          ) : null}
          {expired ? (
            <Button
              kind="tertiary"
              disabled={busy}
              onClick={() => navigate('reconnect')}
            >
              Reconnect Billing
            </Button>
          ) : null}
          {pending ? (
            <div role="alert">
              <p>
                The exact draft save is retained. Do not create another payment
                while its result is uncertain. Closing or reconnecting keeps
                this recovery request.
              </p>
              {!accepted ? (
                <>
                  <Button
                    disabled={busy}
                    onClick={() =>
                      void run(async () => {
                        const result =
                          await getCustomerPaymentDraftRequestStatus(pending);
                        if (result.accepted && result.payment)
                          setAccepted(result.payment);
                        setNotice(
                          result.accepted
                            ? 'This exact request was accepted. Current payment state is shown below.'
                            : 'No receipt found yet. This does not prove the original request stopped. Check again or retry only the identical request.',
                        );
                      })
                    }
                  >
                    Check exact draft save
                  </Button>
                  <Button kind="tertiary" disabled={busy} onClick={save}>
                    Retry identical draft save
                  </Button>
                </>
              ) : null}
            </div>
          ) : null}
          {accepted ? (
            <div>
              <h3>Current saved payment: {accepted.name}</h3>
              <p>
                {accepted.customer} ·{' '}
                {money(accepted.amount, accepted.currency[1])} · State:{' '}
                {paymentStateLabels[accepted.state]}
              </p>
              <p>
                {accepted.journal} · {accepted.method} · Accounting date:{' '}
                {accepted.date}
              </p>
              <Button
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    sessionStorage.removeItem(key);
                    setPending(null);
                    setDirty(false);
                    completed(accepted);
                  })
                }
              >
                Finish draft save review
              </Button>
            </div>
          ) : current && !pending ? (
            <>
              {current.warning ? <p role="alert">{current.warning}</p> : null}
              <div className={styles.editorGrid}>
                {choice(
                  'company_id',
                  'Company',
                  'company',
                  current.id !== false,
                )}
                {choice('partner_id', 'Customer', 'customer')}
                <label htmlFor="payment-draft-direction">
                  Payment direction{' '}
                  <select
                    id="payment-draft-direction"
                    value={current.values.payment_type}
                    disabled={locked}
                    onChange={(event) =>
                      change(
                        'payment_type',
                        event.target.value as 'inbound' | 'outbound',
                        true,
                      )
                    }
                  >
                    <option value="inbound">Receive from customer</option>
                    <option value="outbound">Pay to customer</option>
                  </select>
                </label>
                <TextInput
                  id="payment-draft-amount"
                  labelText="Amount"
                  type="number"
                  min={0}
                  step="any"
                  value={
                    Number.isFinite(current.values.amount)
                      ? current.values.amount
                      : ''
                  }
                  disabled={locked}
                  onChange={(event) =>
                    change(
                      'amount',
                      event.target.value === ''
                        ? NaN
                        : Number(event.target.value),
                    )
                  }
                />
                {text('date', 'Accounting date', 'date', current.date_readonly)}
                {text('effective_date', 'Effective date', 'date')}
                {choice(
                  'journal_id',
                  'Journal',
                  'journal',
                  current.journal_readonly,
                )}
                {choice('payment_method_line_id', 'Payment method', 'method')}
                {choice(
                  'currency_id',
                  'Currency',
                  'currency',
                  !current.multi_currency,
                )}
                {current.show_bank
                  ? choice(
                      'partner_bank_id',
                      current.require_bank
                        ? 'Bank account (required)'
                        : 'Bank account',
                      'bank',
                    )
                  : null}
                {text('ref', 'Reference')}
                {text('payment_reference', 'Payment reference')}
                {text('bank_reference', 'Bank reference')}
                {text('cheque_reference', 'Cheque reference')}
              </div>
              {current.date_readonly ? (
                <p className={styles.note}>
                  Native automatic allocation keeps the accounting date.
                  Effective Date records PDC details.
                </p>
              ) : null}
              {current.journal_readonly ? (
                <p className={styles.note}>
                  Previously posted payments retain their original journal.
                </p>
              ) : null}
              <Button
                kind="tertiary"
                disabled={locked}
                onClick={() =>
                  void run(async () => {
                    setReviewed(null);
                    const review = await previewCustomerPaymentDraft(
                      payload(current),
                    );
                    setDraft(review);
                    setReviewed(review);
                  })
                }
              >
                Review draft save
              </Button>
              {reviewed ? (
                <>
                  <h3>Native accounting and allocation review</h3>
                  <p>
                    Current outstanding:{' '}
                    {money(reviewed.totals.current_outstanding, currency)} ·
                    Balance after the reviewed amount:{' '}
                    {money(reviewed.totals.balance_outstanding, currency)}
                  </p>
                  <p>
                    Document balances retain their original currency. Allocation
                    and remaining amounts use {currency}, converted by Billing
                    at the accounting date.
                  </p>
                  <p>
                    {reviewed.auto_allocate
                      ? 'Native allocation is calculated oldest first. Saving the draft does not apply these allocations.'
                      : 'Automatic allocation is disabled for this native payment form.'}
                  </p>
                  {(['outstanding', 'credits'] as const).map((kind) => (
                    <div
                      key={kind}
                      className={styles.tableScroll}
                      role="region"
                      aria-label={`${kind} allocation review`}
                      tabIndex={0}
                    >
                      <table>
                        <caption>
                          {kind === 'outstanding'
                            ? 'Outstanding invoice allocation'
                            : 'Credit allocation'}
                        </caption>
                        <thead>
                          <tr>
                            <th>Document</th>
                            <th>Date</th>
                            <th>Open amount</th>
                            <th>Allocated amount ({currency})</th>
                            <th>Remaining amount ({currency})</th>
                            <th>Selected</th>
                          </tr>
                        </thead>
                        <tbody>
                          {reviewed.allocations[kind].map((row) => (
                            <tr key={row.invoice_id}>
                              <td>{row.name}</td>
                              <td>{row.date || 'Not set'}</td>
                              <td>
                                {money(
                                  row.open_amount,
                                  row.document_currency[1],
                                )}
                              </td>
                              <td>{money(row.allocated_amount, currency)}</td>
                              <td>{money(row.remaining_amount, currency)}</td>
                              <td>{row.selected ? 'Yes' : 'No'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ))}
                  <div
                    className={styles.tableScroll}
                    role="region"
                    aria-label="Draft payment journal review"
                    tabIndex={0}
                  >
                    <table>
                      <caption>Native draft journal lines</caption>
                      <thead>
                        <tr>
                          <th>Account</th>
                          <th>Label</th>
                          <th>Debit (company currency)</th>
                          <th>Credit (company currency)</th>
                          <th>Amount ({currency})</th>
                        </tr>
                      </thead>
                      <tbody>
                        {reviewed.ledger!.map((line) => (
                          <tr key={JSON.stringify(line)}>
                            <td>
                              {reviewed.account_labels![
                                String(line.account_id)
                              ] ?? line.account_id}
                            </td>
                            <td>{line.name}</td>
                            <td>{line.debit}</td>
                            <td>{line.credit}</td>
                            <td>{money(line.amount_currency, currency)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <Button disabled={locked || !!failure} onClick={save}>
                    Save reviewed payment draft
                  </Button>
                </>
              ) : null}
            </>
          ) : null}
          <Button
            kind="ghost"
            disabled={busy}
            onClick={() => navigate('close')}
          >
            Back to customer payments
          </Button>
        </section>
      )}
    </Modal>
  );
}
