import { Button, Modal, TextInput } from '@bahmni/design-system';
import { useQuery } from '@tanstack/react-query';
import { Fragment, useEffect, useRef, useState } from 'react';
import { invoiceName, money } from './billingFormat';
import styles from './BillingPage.module.scss';
import {
  BillingActionRejected,
  BillingSessionExpired,
  checkedJournalMoneyRequest,
  getJournalMoney,
  getJournalMoneyStatus,
  JournalMoneyChange,
  JournalMoneyPayload,
  JournalMoneyRequest,
  JournalMoneyResult,
  JournalMoneyReview,
  JournalMoneyValues,
  JournalMoneyView,
  previewJournalMoney,
  saveJournalMoney,
} from './billingService';
import { DraftChoiceInput } from './DraftChoiceInput';
import { JournalAnalyticsEditor } from './JournalAnalyticsEditor';

type Props = {
  uid: number;
  invoiceId: number;
  close: () => void;
  saved: () => void;
  reconnect: () => void;
};
type DraftRow = {
  key: string;
  id: number | false;
  values: JournalMoneyValues;
  removed?: true;
};
const label = (
  labels: Record<string, string>,
  model: string,
  id: number | false,
) => (id ? (labels[`${model}:${id}`] ?? `${model} #${id}`) : 'Not set');

export function JournalMoneyEditor(props: Props) {
  const loaded = useQuery({
    queryKey: ['billing', 'journal-money', props.uid, props.invoiceId],
    queryFn: () => getJournalMoney(props.invoiceId),
    retry: false,
    refetchOnMount: 'always',
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
  if (loaded.data && !loaded.isFetching && !loaded.isError)
    return (
      <MoneyForm
        key={`${props.uid}:${props.invoiceId}`}
        {...props}
        initial={loaded.data}
      />
    );
  return (
    <Modal
      open
      passiveModal
      size="lg"
      modalHeading="Edit journal amounts"
      preventCloseOnClickOutside
      onRequestClose={props.close}
    >
      {loaded.isFetching ? (
        <p role="status">Loading the complete native ledger...</p>
      ) : (
        <p role="alert">
          {loaded.error?.message ?? 'Journal amounts are unavailable.'}
        </p>
      )}
      <Button
        kind="tertiary"
        disabled={loaded.isFetching}
        onClick={() => void loaded.refetch()}
      >
        Reload journal amounts
      </Button>
      {loaded.error instanceof BillingSessionExpired ? (
        <Button onClick={props.reconnect}>Reconnect Billing</Button>
      ) : null}
      <Button kind="ghost" onClick={props.close}>
        Back to journal items
      </Button>
    </Modal>
  );
}

function MoneyForm({
  uid,
  invoiceId,
  initial,
  close,
  saved,
  reconnect,
}: Props & { initial: JournalMoneyView }) {
  const storageKey = `qorlia.billing.journal-money.pending:${uid}:${invoiceId}`;
  const [recovery] = useState(() => {
    try {
      const raw = sessionStorage.getItem(storageKey);
      const request = raw ? checkedJournalMoneyRequest(JSON.parse(raw)) : null;
      if (request && request.payload.invoice_id !== invoiceId)
        throw new Error('Wrong invoice.');
      return { request, error: null };
    } catch {
      return {
        request: null,
        error: new Error(
          'Journal recovery storage is unavailable or invalid. Check this invoice with your Billing administrator before another save.',
        ),
      };
    }
  });
  const [rows, setRows] = useState<DraftRow[]>(() => {
    const result: DraftRow[] = initial.rows.map((row) => ({
      key: `saved-${row.id}`,
      id: row.id,
      values: {},
    }));
    for (const change of recovery.request?.payload.changes ?? []) {
      const row = change.id
        ? result.find((row) => row.id === change.id)
        : undefined;
      const patch =
        'delete' in change
          ? { removed: true as const }
          : { values: change.values };
      if (row) Object.assign(row, patch);
      else
        result.push({
          key: crypto.randomUUID(),
          id: change.id,
          values: {},
          ...patch,
        });
    }
    return result;
  });
  const [names, setNames] = useState(initial.labels);
  const [pending, setPending] = useState<JournalMoneyRequest | null>(
    recovery.request,
  );
  const [review, setReview] = useState<{
    payload: JournalMoneyPayload;
    result: JournalMoneyReview;
  } | null>(null);
  const [failure, setFailure] = useState<Error | null>(recovery.error);
  const [status, setStatus] = useState('');
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [discard, setDiscard] = useState<'close' | 'reconnect' | null>(null);
  const locked = busy || !!pending || !!recovery.error || !initial.can_edit;
  useEffect(() => {
    if (!dirty && !pending) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty, pending]);
  const update = (next: DraftRow[]) => {
    if (locked || busyRef.current) return;
    setRows(next);
    setReview(null);
    setDirty(true);
    setFailure(null);
    setStatus('');
  };
  const payload = (): JournalMoneyPayload => ({
    invoice_id: invoiceId,
    version: initial.version,
    changes: rows.flatMap((row): JournalMoneyChange[] => {
      if (row.removed) return row.id ? [{ id: row.id, delete: true }] : [];
      const original = initial.rows.find((item) => item.id === row.id)?.values;
      const values = Object.fromEntries(
        Object.entries(row.values).filter(
          ([field, value]) =>
            !original ||
            JSON.stringify(value) !==
              JSON.stringify(original[field as keyof typeof original]),
        ),
      );
      return Object.keys(values).length ? [{ id: row.id, values }] : [];
    }),
  });
  const leave = (action: 'close' | 'reconnect') => {
    if (busyRef.current) return;
    if (pending || recovery.error) {
      if (action === 'reconnect') reconnect();
      return;
    }
    if (dirty) setDiscard(action);
    else (action === 'close' ? close : reconnect)();
  };
  const accept = () => {
    sessionStorage.removeItem(storageKey);
    setPending(null);
    setDirty(false);
    saved();
  };
  const calculate = async () => {
    if (locked || busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setFailure(null);
    setReview(null);
    try {
      const proposed = payload();
      setReview({
        payload: proposed,
        result: await previewJournalMoney(proposed),
      });
    } catch (error) {
      setFailure(
        error instanceof Error
          ? error
          : new Error('Journal review unavailable. Your entries remain here.'),
      );
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };
  const save = async () => {
    if (busyRef.current || recovery.error || (!pending && !review)) return;
    busyRef.current = true;
    setBusy(true);
    setFailure(null);
    setStatus('');
    try {
      const request =
        pending ??
        checkedJournalMoneyRequest({
          payload: review!.payload,
          review_version: review!.result.review_version,
          request_key: crypto.randomUUID(),
        });
      sessionStorage.setItem(storageKey, JSON.stringify(request));
      setPending(request);
      await saveJournalMoney(request);
      accept();
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
              'Save was rejected, but recovery storage could not be cleared. Check the invoice before another save.',
            ),
          );
          return;
        }
      }
      setFailure(
        error instanceof Error
          ? error
          : new Error('Journal save response unavailable.'),
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
      if (await getJournalMoneyStatus(pending)) accept();
      else
        setStatus(
          'No receipt was found yet. This does not prove the original save stopped. Check again or retry only the same request.',
        );
    } catch (error) {
      setFailure(
        error instanceof Error
          ? error
          : new Error('Journal save status unavailable.'),
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
      modalHeading="Edit journal amounts"
      preventCloseOnClickOutside
      onRequestClose={() => leave('close')}
    >
      {discard ? (
        <div role="alert">
          <h3>Discard unsaved journal changes?</h3>
          <p>No save is pending. Your entries and review will be lost.</p>
          <Button
            kind="danger"
            onClick={discard === 'close' ? close : reconnect}
          >
            Discard changes
          </Button>
          <Button kind="tertiary" onClick={() => setDiscard(null)}>
            Keep editing
          </Button>
        </div>
      ) : (
        <section
          className={styles.card}
          aria-label="Journal amount editor"
          aria-busy={busy}
        >
          <h2>{invoiceName({ id: invoiceId, name: initial.name })}</h2>
          <p>
            Review native accounting changes before saving. This does not post
            an invoice, collect payment or establish bank clearance. Product
            unit prices and accounting amounts are distinct; the review shows
            both.
          </p>
          <p>
            {initial.totals.state} · Company currency:{' '}
            {initial.company_currency[1]} · Invoice currency:{' '}
            {initial.transaction_currency[1]}
          </p>
          {initial.totals.state === 'posted' ? (
            <p role="note">
              This invoice is posted. Native fiscal locks, protected entries,
              balance and reconciliation rules still apply. Posted rows cannot
              be removed.
            </p>
          ) : null}
          {!initial.can_edit ? (
            <p role="alert">
              Your Billing permissions or the invoice state do not allow
              editing.
            </p>
          ) : null}
          {rows.map((row, index) => {
            const original = initial.rows.find(
              (item) => item.id === row.id,
            )?.values;
            const values = { ...original, ...row.values };
            const editable =
              !row.removed &&
              !original?.qorlia_adjustment_kind &&
              !['line_note', 'line_section'].includes(
                String(original?.display_type),
              );
            const title = row.id ? `Item #${row.id}` : `New item ${index + 1}`;
            const change = <K extends keyof JournalMoneyValues>(
              field: K,
              value: JournalMoneyValues[K],
            ) =>
              update(
                rows.map((item) =>
                  item.key === row.key
                    ? { ...item, values: { ...item.values, [field]: value } }
                    : item,
                ),
              );
            return (
              <fieldset
                key={row.key}
                className={styles.draftItem}
                disabled={locked}
              >
                <legend>
                  {title}
                  {row.removed ? ' (will be removed)' : ''}
                </legend>
                {original?.qorlia_adjustment_kind ? (
                  <p>Managed by the invoice editor.</p>
                ) : null}
                {row.removed ? (
                  <p>
                    {original?.name === false
                      ? 'Saved journal item'
                      : (original?.name ?? 'Saved journal item')}
                    : review removal before saving.
                  </p>
                ) : editable ? (
                  <>
                    <div className={styles.editorGrid}>
                      <TextInput
                        id={`${row.key}-label`}
                        labelText={`${title} label`}
                        value={values.name === false ? '' : (values.name ?? '')}
                        disabled={locked}
                        onChange={(event) =>
                          change('name', event.target.value || false)
                        }
                      />
                      {(['account', 'partner', 'currency'] as const)
                        .filter((kind) =>
                          initial.editable_fields.includes(
                            `${kind}_id` as keyof JournalMoneyValues,
                          ),
                        )
                        .map((kind) => {
                          const field = `${kind}_id` as
                            | 'account_id'
                            | 'partner_id'
                            | 'currency_id';
                          const model =
                            kind === 'account'
                              ? 'account.account'
                              : kind === 'partner'
                                ? 'res.partner'
                                : 'res.currency';
                          const selected =
                            values[field] ??
                            (kind === 'currency'
                              ? initial.transaction_currency[0]
                              : false);
                          return (
                            <DraftChoiceInput
                              key={kind}
                              id={`${row.key}-${kind}`}
                              label={`${title} ${kind}`}
                              uid={uid}
                              moneyJournal={{ invoiceId, lineId: row.id }}
                              kind={kind}
                              value={selected}
                              name={
                                selected
                                  ? label(names, model, selected)
                                  : undefined
                              }
                              disabled={locked}
                              reconnect={() => leave('reconnect')}
                              onChange={(id, name) => {
                                change(field, id as number);
                                if (id && name)
                                  setNames((current) => ({
                                    ...current,
                                    [`${model}:${id}`]: name,
                                  }));
                              }}
                            />
                          );
                        })}
                      {(
                        [
                          'debit',
                          'credit',
                          'amount_currency',
                          'discount_amount_currency',
                        ] as const
                      )
                        .filter((field) =>
                          initial.editable_fields.includes(field),
                        )
                        .map((field) => {
                          const unit =
                            field === 'credit' || field === 'debit'
                              ? initial.company_currency[1]
                              : label(
                                  names,
                                  'res.currency',
                                  values.currency_id ??
                                    initial.transaction_currency[0],
                                );
                          const titleField = {
                            debit: 'debit',
                            credit: 'credit',
                            amount_currency: 'transaction amount',
                            discount_amount_currency:
                              'early-payment discount amount',
                          }[field];
                          return (
                            <TextInput
                              key={field}
                              id={`${row.key}-${field}`}
                              labelText={`${title} ${titleField} (${unit})`}
                              type="number"
                              step="any"
                              min={field === 'amount_currency' ? undefined : 0}
                              value={
                                Number.isFinite(values[field] ?? 0)
                                  ? (values[field] ?? 0)
                                  : ''
                              }
                              disabled={locked}
                              onChange={(event) =>
                                change(
                                  field,
                                  event.target.value === ''
                                    ? NaN
                                    : Number(event.target.value),
                                )
                              }
                            />
                          );
                        })}
                      {(['date_maturity', 'discount_date'] as const)
                        .filter((field) =>
                          initial.editable_fields.includes(field),
                        )
                        .map((field) => (
                          <TextInput
                            key={field}
                            id={`${row.key}-${field}`}
                            labelText={`${title} ${field === 'date_maturity' ? 'due date' : 'early-payment discount date'}`}
                            type="date"
                            value={
                              values[field] === false
                                ? ''
                                : (values[field] ?? '')
                            }
                            disabled={locked}
                            onChange={(event) =>
                              change(field, event.target.value || false)
                            }
                          />
                        ))}
                    </div>
                    {(['tax', 'grid'] as const).map((kind) => {
                      const field = kind === 'tax' ? 'tax_ids' : 'tax_tag_ids';
                      if (!initial.editable_fields.includes(field)) return null;
                      const selected = values[field] ?? [],
                        model =
                          kind === 'tax'
                            ? 'account.tax'
                            : 'account.account.tag';
                      return (
                        <section
                          key={kind}
                          aria-label={`${title} ${kind === 'tax' ? 'taxes' : 'tax grids'}`}
                        >
                          <DraftChoiceInput
                            id={`${row.key}-${kind}`}
                            label={`${title} add ${kind}`}
                            uid={uid}
                            moneyJournal={{ invoiceId, lineId: row.id }}
                            kind={kind}
                            value={false}
                            disabled={locked || selected.length >= 100}
                            reconnect={() => leave('reconnect')}
                            onChange={(id, name) => {
                              if (!id || selected.includes(id)) return;
                              change(field, [...selected, id]);
                              if (name)
                                setNames((current) => ({
                                  ...current,
                                  [`${model}:${id}`]: name,
                                }));
                            }}
                          />
                          {selected.map((id) => (
                            <p key={id}>
                              {label(names, model, id)}{' '}
                              <Button
                                kind="ghost"
                                disabled={locked}
                                onClick={() =>
                                  change(
                                    field,
                                    selected.filter((value) => value !== id),
                                  )
                                }
                              >
                                Remove {kind} {id} from {title}
                              </Button>
                            </p>
                          ))}
                        </section>
                      );
                    })}
                    {initial.editable_fields.includes(
                      'analytic_distribution',
                    ) && values.account_id ? (
                      <JournalAnalyticsEditor
                        uid={uid}
                        invoiceId={invoiceId}
                        lineId={row.id}
                        accountId={values.account_id}
                        value={values.analytic_distribution ?? false}
                        disabled={locked}
                        change={(value) =>
                          change('analytic_distribution', value)
                        }
                        reconnect={() => leave('reconnect')}
                        moneyJournal
                        inputPrefix={row.key}
                      />
                    ) : null}
                    {initial.can_delete || row.id === false ? (
                      <Button
                        kind="danger--tertiary"
                        disabled={locked}
                        onClick={() =>
                          update(
                            row.id
                              ? rows.map((item) =>
                                  item.key === row.key
                                    ? { ...item, removed: true }
                                    : item,
                                )
                              : rows.filter((item) => item.key !== row.key),
                          )
                        }
                      >
                        Remove {title}
                      </Button>
                    ) : null}
                  </>
                ) : (
                  <p>
                    {original?.name === false
                      ? 'Readonly journal row'
                      : (original?.name ?? 'Readonly journal row')}
                  </p>
                )}
                {row.removed ? (
                  <Button
                    kind="tertiary"
                    disabled={locked}
                    onClick={() =>
                      update(
                        rows.map((item) =>
                          item.key === row.key
                            ? { ...item, removed: undefined }
                            : item,
                        ),
                      )
                    }
                  >
                    Keep {title}
                  </Button>
                ) : null}
              </fieldset>
            );
          })}
          {initial.can_add ? (
            <Button
              kind="tertiary"
              disabled={locked || rows.length >= 1000}
              onClick={() =>
                update([
                  ...rows,
                  {
                    key: crypto.randomUUID(),
                    id: false,
                    values: { name: false, account_id: 0, debit: 0, credit: 0 },
                  },
                ])
              }
            >
              Add journal item
            </Button>
          ) : null}
          {failure ? <p role="alert">{failure.message}</p> : null}
          {status ? <p role="status">{status}</p> : null}
          {failure instanceof BillingSessionExpired ? (
            <Button disabled={busy} onClick={() => leave('reconnect')}>
              Reconnect Billing
            </Button>
          ) : null}
          {pending ? (
            <section aria-label="Pending journal save">
              <p role="alert">
                A save response is unresolved. Editing is locked. Check the
                native receipt or retry the identical request only.
              </p>
              <p>Request: {pending.request_key}</p>
              <details>
                <summary>Exact pending changes</summary>
                <pre>{JSON.stringify(pending.payload.changes, null, 2)}</pre>
              </details>
              <Button disabled={busy} onClick={() => void check()}>
                Check journal save
              </Button>
              <Button
                kind="tertiary"
                disabled={busy}
                onClick={() => void save()}
              >
                Retry identical journal save
              </Button>
            </section>
          ) : (
            <>
              <Button
                disabled={locked || !dirty}
                onClick={() => void calculate()}
              >
                Review journal amounts
              </Button>
              <Button disabled={locked || !review} onClick={() => void save()}>
                Save reviewed journal amounts
              </Button>
            </>
          )}
          {review && !pending ? (
            <JournalMoneyReviewTable result={review.result} initial={initial} />
          ) : null}
          <Button
            kind="ghost"
            disabled={busy || !!pending || !!recovery.error}
            onClick={() => leave('close')}
          >
            Back to journal items
          </Button>
        </section>
      )}
    </Modal>
  );
}

function JournalMoneyReviewTable({
  result,
  initial,
}: {
  result: JournalMoneyReview;
  initial: JournalMoneyView;
}) {
  const totals: [keyof JournalMoneyResult['totals'], string][] = [
    ['amount_untaxed', 'Untaxed'],
    ['amount_tax', 'Tax'],
    ['amount_total', 'Accounting total'],
    ['invoice_total', 'Native invoice total'],
    ['amount_residual', 'Residual'],
  ];
  const names = result.labels;
  return (
    <section aria-label="Reviewed journal amounts">
      <h3>Native calculation review</h3>
      <p>
        Review every row, including generated taxes and payment terms. Unit
        prices are shown separately from ledger amounts. State:{' '}
        {result.totals.state}; payment state: {result.totals.payment_state}.
      </p>
      <dl className={styles.totals}>
        {totals.map(([field, title]) => (
          <Fragment key={field}>
            <dt>
              {title} ({initial.transaction_currency[1]})
            </dt>
            <dd>
              {money(
                initial.totals[field] as number,
                initial.transaction_currency[1],
              )}{' '}
              →{' '}
              {money(
                result.totals[field] as number,
                initial.transaction_currency[1],
              )}
            </dd>
          </Fragment>
        ))}
      </dl>
      <div
        className={styles.tableScroll}
        role="region"
        aria-label="Scrollable reviewed journal ledger"
        tabIndex={0}
      >
        <table className={styles.journalTable}>
          <caption>All reviewed native journal rows</caption>
          <thead>
            <tr>
              {[
                'Item, account and label',
                'Partner',
                `Debit (${initial.company_currency[1]})`,
                `Credit (${initial.company_currency[1]})`,
                `Balance (${initial.company_currency[1]})`,
                'Transaction amount',
                'Product values',
                'Taxes and grids',
                'Dates, analytics and matching',
              ].map((title) => (
                <th scope="col" key={title}>
                  {title}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {result.rows.map((row, index) => {
              const value = row.values,
                currency = label(names, 'res.currency', value.currency_id);
              return (
                <tr key={row.id || `generated-${index}`}>
                  <th scope="row">
                    {row.id ? `Item #${row.id}` : 'Generated/new row'} ·{' '}
                    {value.display_type || 'Item'}
                    <br />
                    {label(names, 'account.account', value.account_id)}
                    <br />
                    {value.name || 'No label'}
                    {value.qorlia_adjustment_kind
                      ? ` (${value.qorlia_adjustment_kind})`
                      : ''}
                  </th>
                  <td>{label(names, 'res.partner', value.partner_id)}</td>
                  <td>{money(value.debit, initial.company_currency[1])}</td>
                  <td>{money(value.credit, initial.company_currency[1])}</td>
                  <td>{money(value.balance, initial.company_currency[1])}</td>
                  <td>{money(value.amount_currency, currency)}</td>
                  <td>
                    {label(names, 'product.product', value.product_id)}
                    <br />
                    Unit price: {money(value.price_unit, currency)}
                    <br />
                    Quantity: {value.quantity} ·{' '}
                    {label(names, 'uom.uom', value.product_uom_id)}
                    <br />
                    Discount: {value.discount}%<br />
                    Subtotal: {money(value.price_subtotal, currency)}
                    <br />
                    Total: {money(value.price_total, currency)}
                  </td>
                  <td>
                    {value.tax_ids
                      .map((id) => label(names, 'account.tax', id))
                      .join(', ') || 'No taxes'}
                    <br />
                    Grids:{' '}
                    {value.tax_tag_ids
                      .map((id) => label(names, 'account.account.tag', id))
                      .join(', ') || 'None'}
                  </td>
                  <td>
                    Due: {value.date_maturity ? value.date_maturity : 'Not set'}
                    <br />
                    Discount date: {value.discount_date || 'Not set'}
                    <br />
                    Early discount:{' '}
                    {money(value.discount_amount_currency, currency)}
                    <br />
                    Analytics:{' '}
                    {Object.entries(value.analytic_distribution ?? {})
                      .map(
                        ([key, percent]) =>
                          `${key
                            .split(',')
                            .map((id) =>
                              label(
                                names,
                                'account.analytic.account',
                                Number(id),
                              ),
                            )
                            .join(' / ')}: ${percent}%`,
                      )
                      .join('; ') || 'None'}
                    <br />
                    Residual:{' '}
                    {money(
                      value.amount_residual,
                      initial.company_currency[1],
                    )}{' '}
                    / {money(value.amount_residual_currency, currency)}
                    <br />
                    {value.reconciled ? 'Reconciled' : 'Not fully reconciled'}
                    <br />
                    Debit matches:{' '}
                    {value.matched_debit_ids.join(', ') || 'None'}
                    <br />
                    Credit matches:{' '}
                    {value.matched_credit_ids.join(', ') || 'None'}
                    <br />
                    Full match:{' '}
                    {label(
                      names,
                      'account.full.reconcile',
                      value.full_reconcile_id,
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
