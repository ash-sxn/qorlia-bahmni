import { Button, Modal, TextInput } from '@bahmni/design-system';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { money } from './billingFormat';
import styles from './BillingPage.module.scss';
import {
  AdvanceInvoice,
  AdvanceRequest,
  AdvanceReview,
  AdvanceValues,
  BillingActionRejected,
  BillingSessionExpired,
  checkedAdvanceRequest,
  getAdvanceInvoice,
  getAdvanceInvoiceStatus,
  OrderWorkflow,
  previewAdvanceInvoice,
  saveAdvanceInvoice,
  SavedAdvance,
} from './billingService';
import { DraftChoiceInput } from './DraftChoiceInput';

type Props = {
  uid: number;
  orderId: number;
  close: () => void;
  completed: (order: OrderWorkflow) => void;
  reconnect: () => void;
};

export function AdvanceInvoiceModal(props: Props) {
  const current = useQuery({
    queryKey: ['billing', 'advance-invoice', props.uid, props.orderId],
    queryFn: () => getAdvanceInvoice(props.orderId),
    retry: false,
    refetchOnMount: 'always',
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
  if (current.data && !current.isFetching && !current.isError)
    return (
      <AdvanceForm
        key={`${props.uid}:${props.orderId}`}
        {...props}
        initial={current.data}
      />
    );
  return (
    <Modal
      open
      passiveModal
      size="lg"
      modalHeading="Advance invoice"
      preventCloseOnClickOutside
      onRequestClose={props.close}
    >
      <section className={styles.card}>
        {current.isFetching ? (
          <p role="status">Loading native advance settings...</p>
        ) : (
          <p role="alert">
            {current.error?.message ?? 'Advance settings are unavailable.'}
          </p>
        )}
        <Button
          kind="tertiary"
          disabled={current.isFetching}
          onClick={() => void current.refetch()}
        >
          Reload advance settings
        </Button>
        {current.error instanceof BillingSessionExpired ? (
          <Button onClick={props.reconnect}>Reconnect Billing</Button>
        ) : null}
        <Button kind="ghost" onClick={props.close}>
          Back to order actions
        </Button>
      </section>
    </Modal>
  );
}

function AdvanceForm({
  initial,
  uid,
  orderId,
  close,
  completed,
  reconnect,
}: Props & { initial: AdvanceInvoice }) {
  const storageKey = `qorlia.billing.advance.pending:${uid}:${orderId}`;
  const [recovery] = useState(() => {
    try {
      const value = sessionStorage.getItem(storageKey);
      if (!value) return { request: null, error: null };
      const request = checkedAdvanceRequest(JSON.parse(value));
      if (request.order_id !== orderId)
        throw new Error('Stored advance belongs to another order.');
      return { request, error: null };
    } catch {
      return {
        request: null,
        error: new Error(
          'Advance recovery storage is unavailable or invalid. Do not start a new advance until the current order is checked by an administrator.',
        ),
      };
    }
  });
  const [values, setValues] = useState<AdvanceValues>(
    recovery.request?.values ?? initial.values,
  );
  const [pending, setPending] = useState<AdvanceRequest | null>(
    recovery.request,
  );
  const [review, setReview] = useState<AdvanceReview | null>(null);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [dirty, setDirty] = useState(false);
  const [failure, setFailure] = useState<Error | null>(recovery.error);
  const [status, setStatus] = useState('');
  const [discard, setDiscard] = useState<'close' | 'reconnect' | null>(null);
  const [labels, setLabels] = useState<Record<number, string>>({});
  const locked =
    busy || !!pending || !!recovery.error || !initial.order.can_advance;
  useEffect(() => {
    if (!dirty && !pending) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty, pending]);
  const leave = (action: 'close' | 'reconnect') => {
    if (busyRef.current) return;
    if (pending) {
      if (action === 'reconnect') reconnect();
      return;
    }
    if (dirty) setDiscard(action);
    else (action === 'reconnect' ? reconnect : close)();
  };
  const change = <K extends keyof AdvanceValues>(
    field: K,
    value: AdvanceValues[K],
  ) => {
    if (locked || busyRef.current) return;
    setValues({ ...values, [field]: value });
    setReview(null);
    setDirty(true);
    setFailure(null);
    setStatus('');
  };
  const accept = (saved: SavedAdvance) => {
    sessionStorage.removeItem(storageKey);
    setPending(null);
    setDirty(false);
    completed(saved.order);
  };
  const calculate = async () => {
    if (locked || busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setFailure(null);
    setReview(null);
    try {
      setReview(await previewAdvanceInvoice(orderId, values));
    } catch (error) {
      setFailure(
        error instanceof Error
          ? error
          : new Error(
              'Advance calculation unavailable. Your entries remain here.',
            ),
      );
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };
  const save = async () => {
    if (busyRef.current || recovery.error || (!pending && !review)) return;
    const request =
      pending ??
      checkedAdvanceRequest({
        order_id: orderId,
        values: review!.values,
        review_version: review!.review_version,
        request_key: crypto.randomUUID(),
      });
    busyRef.current = true;
    setBusy(true);
    setFailure(null);
    setStatus('');
    try {
      // Keep only the exact request, scoped to this user/order, across sign-in or tab reload.
      sessionStorage.setItem(storageKey, JSON.stringify(request));
      setPending(request);
      accept(await saveAdvanceInvoice(request));
    } catch (error) {
      if (error instanceof BillingActionRejected) {
        try {
          sessionStorage.removeItem(storageKey);
          setPending(null);
          setReview(null);
          setDirty(true);
        } catch {
          setFailure(
            new Error(
              'Billing rejected the save, but recovery storage could not be cleared. Check the current order before starting another advance.',
            ),
          );
          return;
        }
      }
      setFailure(
        error instanceof Error
          ? error
          : new Error('Advance save response unavailable.'),
      );
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };
  const check = async () => {
    if (!pending || busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setFailure(null);
    setStatus('');
    try {
      const result = await getAdvanceInvoiceStatus(pending);
      if (result) accept(result);
      else
        setStatus(
          'No saved invoice was found for this request yet. This does not prove the original request stopped. Entries remain locked; retry only the same request.',
        );
    } catch (error) {
      setFailure(
        error instanceof Error
          ? error
          : new Error('Advance status unavailable.'),
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
      modalHeading="Create advance invoice"
      preventCloseOnClickOutside
      onRequestClose={() => leave('close')}
    >
      {discard ? (
        <div role="alert">
          <h3>Discard unsaved advance entries?</h3>
          <p>
            No advance save has been sent. Your current entries and calculation
            will be lost.
          </p>
          <Button
            kind="danger"
            onClick={discard === 'reconnect' ? reconnect : close}
          >
            {discard === 'reconnect'
              ? 'Discard entries and reconnect'
              : 'Discard entries'}
          </Button>
          <Button kind="tertiary" onClick={() => setDiscard(null)}>
            Keep editing
          </Button>
        </div>
      ) : (
        <section
          className={styles.card}
          aria-label="Advance invoice editor"
          aria-busy={busy}
        >
          <p className={styles.eyebrow}>NATIVE DOWN-PAYMENT WORKFLOW</p>
          <h2>{initial.order.name}</h2>
          <p>Customer: {initial.order.customer || 'Not set'}</p>
          <p>
            Order total:{' '}
            {money(initial.order.amount_total, initial.order.currency[1])}
          </p>
          <p>
            Create a draft advance invoice. This does not post an invoice,
            collect payment or deliver stock. Payment and posting are separate
            actions.
          </p>
          {!initial.order.can_advance ? (
            <p role="alert">
              This order or your Billing permissions do not allow a new advance
              invoice.
            </p>
          ) : null}
          {busy ? (
            <p role="status">Checking native Billing. Please wait...</p>
          ) : null}
          {failure ? (
            <div role="alert">
              <p>{failure.message}</p>
              {failure instanceof BillingSessionExpired ? (
                <Button disabled={busy} onClick={() => leave('reconnect')}>
                  Reconnect Billing
                </Button>
              ) : null}
            </div>
          ) : null}
          {pending ? (
            <div role="alert">
              <h3>Save result needs confirmation</h3>
              <p>
                The invoice may already exist. Entries are locked. Reopening
                this order in this browser tab keeps the same request for
                recovery.
              </p>
              <p>Request: {pending.request_key}</p>
              <div className={styles.toolbar}>
                <Button disabled={busy} onClick={() => void check()}>
                  Check advance save status
                </Button>
                <Button
                  kind="tertiary"
                  disabled={busy}
                  onClick={() => void save()}
                >
                  Retry same advance save
                </Button>
              </div>
            </div>
          ) : null}
          {status ? <p role="status">{status}</p> : null}
          <div className={styles.editorGrid}>
            <label className={styles.select} htmlFor="advance-method">
              Advance type
              <select
                id="advance-method"
                value={values.advance_payment_method}
                disabled={locked}
                onChange={(event) =>
                  change(
                    'advance_payment_method',
                    event.target
                      .value as AdvanceValues['advance_payment_method'],
                  )
                }
              >
                <option value="percentage">Percentage</option>
                <option value="fixed">Fixed amount</option>
              </select>
            </label>
            <TextInput
              id="advance-amount"
              labelText={
                values.advance_payment_method === 'percentage'
                  ? 'Advance percentage'
                  : `Advance amount (${initial.order.currency[1]})`
              }
              type="number"
              min="0"
              step="any"
              disabled={locked}
              value={
                Number.isFinite(
                  values.advance_payment_method === 'percentage'
                    ? values.amount
                    : values.fixed_amount,
                )
                  ? values.advance_payment_method === 'percentage'
                    ? values.amount
                    : values.fixed_amount
                  : ''
              }
              onChange={(event) =>
                change(
                  values.advance_payment_method === 'percentage'
                    ? 'amount'
                    : 'fixed_amount',
                  event.target.value === '' ? NaN : Number(event.target.value),
                )
              }
            />
          </div>
          {initial.product ? (
            <p>
              Deposit product: {initial.product[1]}. Its native account, taxes
              and fiscal mappings determine the calculation.
            </p>
          ) : (
            <>
              <p role="note">
                No default deposit product is configured. Saving the first
                advance creates the native down-payment product and sets it as
                the Billing default for later advances.
              </p>
              <div className={styles.editorGrid}>
                {initial.can_set_account ? (
                  <DraftChoiceInput
                    id="advance-account"
                    label="Deposit income account"
                    uid={uid}
                    advanceOrderId={orderId}
                    kind="account"
                    value={values.deposit_account_id}
                    name={
                      values.deposit_account_id
                        ? labels[values.deposit_account_id]
                        : ''
                    }
                    disabled={locked}
                    reconnect={() => leave('reconnect')}
                    onChange={(id, name) => {
                      if (id && name)
                        setLabels((old) => ({ ...old, [id]: name }));
                      change('deposit_account_id', id);
                    }}
                  />
                ) : (
                  <p className={styles.note}>
                    Billing determines the default income account. Only an
                    accounting manager can override it.
                  </p>
                )}
                <DraftChoiceInput
                  id="advance-tax"
                  label="Add deposit sales tax"
                  uid={uid}
                  advanceOrderId={orderId}
                  kind="tax"
                  value={false}
                  disabled={locked}
                  reconnect={() => leave('reconnect')}
                  onChange={(id, name) => {
                    if (id && !values.deposit_taxes_id.includes(id)) {
                      if (name) setLabels((old) => ({ ...old, [id]: name }));
                      change('deposit_taxes_id', [
                        ...values.deposit_taxes_id,
                        id,
                      ]);
                    }
                  }}
                />
              </div>
              <ul>
                {values.deposit_taxes_id.map((id) => (
                  <li key={id}>
                    {labels[id] ?? `Tax ${id}`}{' '}
                    <Button
                      kind="ghost"
                      disabled={locked}
                      onClick={() =>
                        change(
                          'deposit_taxes_id',
                          values.deposit_taxes_id.filter((tax) => tax !== id),
                        )
                      }
                    >
                      Remove tax {id}
                    </Button>
                  </li>
                ))}
              </ul>
            </>
          )}
          {!pending ? (
            <Button
              kind="tertiary"
              disabled={locked}
              onClick={() => void calculate()}
            >
              Review advance calculation
            </Button>
          ) : null}
          {review && !pending ? (
            <section aria-label="Reviewed advance calculation">
              <h3>Draft calculation</h3>
              <p>
                {review.invoice.company} · {review.invoice.journal}
              </p>
              <ul>
                {review.invoice.lines.map((line) => (
                  <li key={line.key}>
                    {line.name}: {money(line.total, review.invoice.currency[1])}
                  </li>
                ))}
              </ul>
              <dl className={styles.totals}>
                <dt>Item subtotal</dt>
                <dd>
                  {money(
                    review.invoice.totals.qorlia_item_subtotal,
                    review.invoice.currency[1],
                  )}
                </dd>
                <dt>Tax</dt>
                <dd>
                  {money(
                    review.invoice.totals.amount_tax,
                    review.invoice.currency[1],
                  )}
                </dd>
                <dt>Rounding</dt>
                <dd>
                  {money(
                    review.invoice.totals.round_off_amount,
                    review.invoice.currency[1],
                  )}
                </dd>
                <dt>Advance invoice total</dt>
                <dd>
                  {money(
                    review.invoice.totals.invoice_total,
                    review.invoice.currency[1],
                  )}
                </dd>
              </dl>
              <Button disabled={locked} onClick={() => void save()}>
                Create draft advance invoice
              </Button>
            </section>
          ) : null}
          <p className={styles.note}>
            A later regular invoice can deduct posted down payments through the
            native Billing workflow.
          </p>
          <Button
            kind="ghost"
            disabled={busy || !!pending}
            onClick={() => leave('close')}
          >
            Back to order actions
          </Button>
        </section>
      )}
    </Modal>
  );
}
