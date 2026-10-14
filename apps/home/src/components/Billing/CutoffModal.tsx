import { Button, ComboBox, Modal, TextInput } from '@bahmni/design-system';
import { useDebounce } from '@bahmni/widgets';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { money } from './billingFormat';
import styles from './BillingPage.module.scss';
import {
  BillingActionRejected,
  BillingSessionExpired,
  checkedCutoffRequest,
  CutoffData,
  CutoffRequest,
  CutoffReview,
  CutoffSaved,
  CutoffValues,
  getCutoff,
  getCutoffChoices,
  getCutoffStatus,
  onchangeCutoff,
  previewCutoff,
  saveCutoff,
} from './billingService';

type Props = {
  uid: number;
  invoiceId: number;
  lineId: number;
  close: () => void;
  reconnect: () => void;
  saved: () => void;
};

export function CutoffModal(props: Props) {
  const { uid, invoiceId, lineId, close, reconnect, saved } = props;
  const storageKey = `qorlia.billing.cutoff.pending:${uid}:${invoiceId}:${lineId}`;
  const [recovery] = useState(() => {
    try {
      const text = sessionStorage.getItem(storageKey);
      const request = text ? checkedCutoffRequest(JSON.parse(text)) : null;
      if (
        request &&
        (request.invoice_id !== invoiceId || request.line_id !== lineId)
      )
        throw new Error();
      return { request, error: '' };
    } catch {
      return {
        request: null,
        error:
          'Cut-Off recovery storage is unavailable or invalid. Check the invoice before another save.',
      };
    }
  });
  const [pending, setPending] = useState<CutoffRequest | null>(
    recovery.request,
  );
  const [receipt, setReceipt] = useState<CutoffSaved | null>(null);
  const [rejectedValues, setRejectedValues] = useState<
    CutoffValues | undefined
  >();
  const [failure, setFailure] = useState<Error | null>(null);
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const leave = useRef(close);
  const dirty = useRef(false);
  const source = useQuery({
    queryKey: ['billing', 'cutoff', uid, invoiceId, lineId],
    queryFn: () => getCutoff(invoiceId, lineId),
    enabled: !pending && !receipt && !recovery.error,
    retry: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchOnMount: 'always',
  });
  useEffect(() => {
    const guard = (event: BeforeUnloadEvent) => {
      if (pending || dirty.current) {
        event.preventDefault();
        event.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', guard);
    return () => window.removeEventListener('beforeunload', guard);
  }, [pending]);
  const accept = (result: CutoffSaved) => {
    sessionStorage.removeItem(storageKey);
    setPending(null);
    setReceipt(result);
    dirty.current = false;
  };
  const run = async (request: CutoffRequest, check = false) => {
    if (busyRef.current || recovery.error) return;
    busyRef.current = true;
    setBusy(true);
    setFailure(null);
    setStatus('');
    try {
      checkedCutoffRequest(request);
      if (!check) {
        sessionStorage.setItem(storageKey, JSON.stringify(request));
        setPending(request);
      }
      const result = await (check
        ? getCutoffStatus(request)
        : saveCutoff(request));
      if (result) accept(result);
      else
        setStatus(
          'No receipt was found yet. This does not prove the save stopped. Check again or retry only this identical request.',
        );
    } catch (error) {
      if (!check && error instanceof BillingActionRejected) {
        try {
          sessionStorage.removeItem(storageKey);
          setRejectedValues(request.values);
          setPending(null);
        } catch {
          setFailure(
            new Error(
              'The request was rejected, but recovery storage could not be cleared. Check the invoice before another save.',
            ),
          );
          return;
        }
      }
      setFailure(
        error instanceof Error
          ? error
          : new Error('Cut-Off response unavailable.'),
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
      modalHeading="Cut-Off: change recognition period"
      preventCloseOnClickOutside
      onRequestClose={() => {
        if (!busyRef.current && !pending && !recovery.error)
          if (receipt) saved();
          else leave.current();
      }}
    >
      <section
        className={styles.card}
        aria-label="Cut-Off workflow"
        aria-busy={busy || source.isFetching}
      >
        {recovery.error ? <p role="alert">{recovery.error}</p> : null}
        {failure ? (
          <p role="alert">
            {failure.message || 'Billing response unavailable.'}
          </p>
        ) : null}
        {failure instanceof BillingSessionExpired ||
        source.error instanceof BillingSessionExpired ? (
          <Button disabled={busy} onClick={reconnect}>
            Reconnect Billing
          </Button>
        ) : null}
        {receipt ? (
          <section aria-label="Saved adjusting entries">
            <h2>Adjusting entries created</h2>
            <p>
              The source invoice amount and its payment matching were preserved.
            </p>
            <ul>
              {receipt.entries.map((entry) => (
                <li key={entry.id}>
                  {entry.name === '/' ? `Entry #${entry.id}` : entry.name}
                  {' · '}
                  {entry.date}
                  {' · '}
                  {entry.state}
                  {entry.state === 'draft' && entry.auto_post === 'at_date'
                    ? ' (scheduled to post on this date)'
                    : ''}
                </li>
              ))}
            </ul>
            <Button onClick={saved}>Back to journal items</Button>
          </section>
        ) : pending ? (
          <section aria-label="Cut-Off save recovery">
            <h2>Check the previous Cut-Off request</h2>
            <p>
              Request {pending.request_key}. Do not create another request until
              this one is resolved. Checking its receipt works even if the
              source invoice is no longer eligible.
            </p>
            {status ? <p role="status">{status}</p> : null}
            <Button disabled={busy} onClick={() => void run(pending, true)}>
              Check Cut-Off save
            </Button>
            <Button
              kind="tertiary"
              disabled={busy}
              onClick={() => void run(pending)}
            >
              Retry identical Cut-Off request
            </Button>
            <Button kind="tertiary" disabled={busy} onClick={reconnect}>
              Reconnect Billing
            </Button>
          </section>
        ) : !receipt && !recovery.error ? (
          source.isError ? (
            <>
              <p role="alert">
                {source.error.message || 'Cut-Off source is unavailable.'}
              </p>
              <Button
                disabled={source.isFetching}
                onClick={() => void source.refetch()}
              >
                Reload Cut-Off
              </Button>
              <Button kind="tertiary" onClick={close}>
                Back to journal items
              </Button>
            </>
          ) : source.data && !source.isFetching ? (
            <CutoffForm
              key={source.data.version}
              {...props}
              initial={source.data}
              seed={rejectedValues}
              dirty={dirty}
              leave={leave}
              send={(review) =>
                void run(
                  checkedCutoffRequest({
                    invoice_id: invoiceId,
                    line_id: lineId,
                    version: review.version,
                    values: review.values,
                    review_version: review.review_version,
                    request_key: crypto.randomUUID(),
                  }),
                )
              }
            />
          ) : (
            <p role="status">Reading native Cut-Off settings...</p>
          )
        ) : null}
      </section>
    </Modal>
  );
}

function CutoffForm({
  initial,
  seed,
  dirty,
  leave,
  send,
  ...props
}: Props & {
  initial: CutoffData;
  seed?: CutoffValues;
  dirty: React.MutableRefObject<boolean>;
  leave: React.MutableRefObject<() => void>;
  send: (review: CutoffReview) => void;
}) {
  const [data, setData] = useState(initial);
  const [values, setValues] = useState(seed ?? initial.values);
  const [review, setReview] = useState<CutoffReview | null>(null);
  const [failure, setFailure] = useState<Error | null>(null);
  const [busy, setBusy] = useState(false);
  const [discard, setDiscard] = useState<'close' | 'reconnect' | null>(null);
  const busyRef = useRef(false);
  const active =
    data.account_type === 'income'
      ? 'revenue_accrual_account'
      : 'expense_accrual_account';
  const leaveForm = (action: 'close' | 'reconnect') => {
    if (busyRef.current) return;
    if (dirty.current) setDiscard(action);
    else (action === 'close' ? props.close : props.reconnect)();
  };
  useEffect(() => {
    leave.current = () => leaveForm('close');
  });
  const change = (
    field: keyof CutoffValues,
    value: string | number | false,
  ) => {
    const next = { ...values, [field]: value };
    setValues(next);
    setReview(null);
    dirty.current = true;
    return next;
  };
  const calculate = async (next: CutoffValues, field?: keyof CutoffValues) => {
    if (busyRef.current || !data.can_create) return;
    busyRef.current = true;
    setBusy(true);
    setFailure(null);
    setReview(null);
    try {
      if (field) {
        const result = await onchangeCutoff(data, next, field);
        setData(result);
        setValues(result.values);
      } else {
        const result = await previewCutoff(data, next);
        setValues(result.values);
        setData(result);
        setReview(result);
      }
    } catch (error) {
      setFailure(
        error instanceof Error
          ? error
          : new Error('Cut-Off calculation unavailable.'),
      );
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };
  const locked = busy || !data.can_create;
  if (discard)
    return (
      <div role="alert">
        <h2>Discard unsaved Cut-Off settings?</h2>
        <p>No request has been sent.</p>
        <Button
          kind="danger"
          onClick={() => {
            dirty.current = false;
            (discard === 'close' ? props.close : props.reconnect)();
          }}
        >
          Discard settings
        </Button>
        <Button kind="tertiary" onClick={() => setDiscard(null)}>
          Keep editing
        </Button>
      </div>
    );
  return (
    <>
      <h2>
        {data.name} · Item #{data.line_id}
      </h2>
      <p>
        {data.source_account[1]} · Source balance{' '}
        {money(data.source_balance, data.currency[1])}
      </p>
      <p>
        This creates adjusting entries, not a refund or invoice payment. The
        original invoice and its matching remain unchanged.
      </p>
      {!data.can_create ? (
        <p role="alert">
          Your Billing permissions do not allow creating adjusting entries.
        </p>
      ) : null}
      {data.lock_date_message ? (
        <p role="note">{data.lock_date_message}</p>
      ) : null}
      {failure ? (
        <p role="alert">{failure.message || 'Calculation unavailable.'}</p>
      ) : null}
      {failure instanceof BillingSessionExpired ? (
        <Button onClick={() => leaveForm('reconnect')}>
          Reconnect Billing
        </Button>
      ) : null}
      <div className={styles.editorGrid}>
        <TextInput
          id="cutoff-date"
          type="date"
          labelText="Recognition date"
          value={values.date}
          disabled={locked}
          onChange={(event) => change('date', event.target.value)}
          onBlur={() => void calculate(values, 'date')}
        />
        <TextInput
          id="cutoff-percent"
          type="number"
          step="any"
          min={0}
          max={100}
          labelText="Percentage"
          value={Number.isFinite(values.percentage) ? values.percentage : ''}
          disabled={locked}
          onChange={(event) =>
            change(
              'percentage',
              event.target.value === '' ? NaN : Number(event.target.value),
            )
          }
          onBlur={() => void calculate(values, 'percentage')}
        />
        <TextInput
          id="cutoff-amount"
          type="number"
          step="any"
          labelText={`Adjusting amount (${data.currency[1]})`}
          value={
            Number.isFinite(values.total_amount) ? values.total_amount : ''
          }
          disabled={locked}
          helperText="Keep the native sign: invoice revenue is usually negative. Changing this recalculates the percentage."
          onChange={(event) =>
            change(
              'total_amount',
              event.target.value === '' ? NaN : Number(event.target.value),
            )
          }
          onBlur={() => void calculate(values, 'total_amount')}
        />
        <CutoffChoice
          uid={props.uid}
          data={data}
          kind="journal"
          field="journal_id"
          label="General journal"
          disabled={locked}
          value={values.journal_id}
          change={(id) =>
            void calculate(change('journal_id', id), 'journal_id')
          }
        />
        <CutoffChoice
          uid={props.uid}
          data={data}
          kind="accrual"
          field={active}
          label="Accrued account"
          disabled={locked}
          value={values[active]}
          change={(id) => void calculate(change(active, id), active)}
        />
      </div>
      <div className={styles.toolbar}>
        <Button disabled={locked} onClick={() => void calculate(values)}>
          Review adjusting entries
        </Button>
        <Button
          disabled={locked || !review}
          onClick={() => {
            if (review && !busyRef.current) send(review);
          }}
        >
          Create reviewed adjusting entries
        </Button>
        <Button
          kind="tertiary"
          disabled={busy}
          onClick={() => leaveForm('close')}
        >
          Back to journal items
        </Button>
      </div>
      {busy ? <p role="status">Calculating with native Billing...</p> : null}
      {review ? (
        <section aria-label="Reviewed adjusting entries">
          <h3>Review before creating entries</h3>
          <p role="note">
            Saving also sets {data.company}&apos;s default automatic-entry
            journal to {review.default_changes.journal[1]} and its{' '}
            {review.account_type === 'income' ? 'revenue' : 'expense'} accrual
            account to {review.default_changes.account[1]}.
            {review.reconcile_accrual_rows
              ? ' Native Billing will also reconcile the two new accrual rows with each other. It will not match them to the source invoice.'
              : ''}
          </p>
          {review.entries.map((entry, index) => (
            <section key={entry.kind}>
              <h4>
                {entry.date} ·{' '}
                {entry.state === 'draft' ? 'Scheduled draft' : 'Will post'}
              </h4>
              <p>{entry.ref}</p>
              <div
                className={styles.tableScroll}
                role="region"
                tabIndex={0}
                aria-label={`Adjusting entry ${index + 1}`}
              >
                <table>
                  <caption>Adjusting entry {index + 1}</caption>
                  <thead>
                    <tr>
                      <th scope="col">Account and label</th>
                      <th scope="col">Debit ({data.currency[1]})</th>
                      <th scope="col">Credit ({data.currency[1]})</th>
                      <th scope="col">Transaction amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {entry.rows.map((row) => (
                      <tr key={row.role}>
                        <th scope="row">
                          {row.account_id[1]}
                          <br />
                          {row.name}
                        </th>
                        <td>{money(row.debit, data.currency[1])}</td>
                        <td>{money(row.credit, data.currency[1])}</td>
                        <td>
                          {money(row.amount_currency, row.currency_id[1])}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ))}
          <p>
            Future-dated entries remain drafts scheduled for posting on their
            accounting date.
          </p>
        </section>
      ) : null}
    </>
  );
}

function CutoffChoice({
  uid,
  data,
  field,
  kind,
  label,
  value,
  disabled,
  change,
}: {
  uid: number;
  data: CutoffData;
  field: 'journal_id' | 'revenue_accrual_account' | 'expense_accrual_account';
  kind: 'journal' | 'accrual';
  label: string;
  value: number | false;
  disabled: boolean;
  change: (id: number | false) => void;
}) {
  const [search, setSearch] = useState('');
  const term = useDebounce(search, 250);
  const choices = useQuery({
    queryKey: [
      'billing',
      'cutoff-choices',
      uid,
      data.invoice_id,
      data.line_id,
      kind,
      term,
    ],
    queryFn: () => getCutoffChoices(data.invoice_id, data.line_id, kind, term),
    enabled: !disabled,
    retry: false,
  });
  return (
    <ComboBox<[number, string]>
      id={`cutoff-${field}`}
      titleText={label}
      items={choices.data ?? []}
      selectedItem={
        value ? (data.labels[field] ?? [value, `Record ${value}`]) : null
      }
      itemToString={(item) => item?.[1] ?? ''}
      onInputChange={setSearch}
      shouldFilterItem={() => true}
      disabled={disabled}
      invalid={choices.isError}
      invalidText={choices.error?.message}
      onChange={({ selectedItem }) => change(selectedItem?.[0] ?? false)}
      helperText={
        choices.isFetching
          ? 'Searching Billing...'
          : 'Search and select a native account or journal.'
      }
    />
  );
}
