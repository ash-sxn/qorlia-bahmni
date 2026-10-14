import { Button, Modal, TextInput } from '@bahmni/design-system';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { invoiceName, money } from './billingFormat';
import styles from './BillingPage.module.scss';
import {
  BillingActionRejected,
  BillingSessionExpired,
  checkedJournalRequest,
  getJournalDetails,
  getJournalDetailsStatus,
  JournalDetails,
  JournalDetailRequest,
  JournalDetailValues,
  previewJournalDetails,
  saveJournalDetails,
} from './billingService';
import { DraftChoiceInput } from './DraftChoiceInput';
import {
  analyticAllocationLabel,
  JournalAnalyticsEditor,
} from './JournalAnalyticsEditor';

type Props = {
  uid: number;
  invoiceId: number;
  lineId: number;
  close: () => void;
  saved: () => void;
  reconnect: () => void;
};

export function JournalDetailsEditor(props: Props) {
  const loaded = useQuery({
    queryKey: [
      'billing',
      'journal-details',
      props.uid,
      props.invoiceId,
      props.lineId,
    ],
    queryFn: () => getJournalDetails(props.invoiceId, props.lineId),
    retry: false,
    refetchOnMount: 'always',
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
  if (loaded.data && !loaded.isFetching && !loaded.isError)
    return (
      <DetailsForm
        key={`${props.uid}:${props.invoiceId}:${props.lineId}`}
        {...props}
        initial={loaded.data}
      />
    );
  return (
    <Modal
      open
      passiveModal
      size="lg"
      modalHeading="Edit journal details"
      preventCloseOnClickOutside
      onRequestClose={props.close}
    >
      {loaded.isFetching ? (
        <p role="status">Loading native journal details...</p>
      ) : (
        <p role="alert">
          {loaded.error?.message ?? 'Journal details are unavailable.'}
        </p>
      )}
      <Button
        kind="tertiary"
        disabled={loaded.isFetching}
        onClick={() => void loaded.refetch()}
      >
        Reload journal details
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

function DetailsForm({
  uid,
  invoiceId,
  lineId,
  initial,
  close,
  saved,
  reconnect,
}: Props & { initial: JournalDetails }) {
  const storageKey = `qorlia.billing.journal.pending:${uid}:${invoiceId}:${lineId}`;
  const [recovery] = useState(() => {
    try {
      const raw = sessionStorage.getItem(storageKey);
      if (!raw) return { request: null, error: null };
      const request = checkedJournalRequest(JSON.parse(raw));
      if (request.invoice_id !== invoiceId || request.line_id !== lineId)
        throw new Error('Wrong journal request.');
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
  const [values, setValues] = useState<JournalDetailValues>(
    recovery.request?.values ?? initial.values,
  );
  const [pending, setPending] = useState<JournalDetailRequest | null>(
    recovery.request,
  );
  const [review, setReview] = useState<JournalDetails | null>(null);
  const [failure, setFailure] = useState<Error | null>(recovery.error);
  const [status, setStatus] = useState('');
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [discard, setDiscard] = useState<'close' | 'reconnect' | null>(null);
  const [accountName, setAccountName] = useState(initial.account[1]);
  const [gridNames, setGridNames] = useState<Record<number, string>>(
    Object.fromEntries(initial.tax_grids),
  );
  const distributionInvalid = Object.values(
    values.analytic_distribution || {},
  ).some(
    (percent) => !Number.isFinite(percent) || percent < 0 || percent > 100,
  );
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
  const change = <K extends keyof JournalDetailValues>(
    field: K,
    value: JournalDetailValues[K],
  ) => {
    if (locked || busyRef.current) return;
    setValues({ ...values, [field]: value });
    setReview(null);
    setDirty(true);
    setFailure(null);
    setStatus('');
  };
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
    if (locked || busyRef.current || distributionInvalid) return;
    busyRef.current = true;
    setBusy(true);
    setFailure(null);
    setReview(null);
    try {
      setReview(await previewJournalDetails(initial, values));
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
    if (
      busyRef.current ||
      recovery.error ||
      (!pending && !review?.review_version)
    )
      return;
    busyRef.current = true;
    setBusy(true);
    setFailure(null);
    setStatus('');
    try {
      const request =
        pending ??
        checkedJournalRequest({
          invoice_id: invoiceId,
          line_id: lineId,
          version: initial.version,
          values: review!.values,
          review_version: review!.review_version!,
          request_key: crypto.randomUUID(),
        });
      sessionStorage.setItem(storageKey, JSON.stringify(request));
      setPending(request);
      await saveJournalDetails(request);
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
      if (await getJournalDetailsStatus(pending)) accept();
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
      modalHeading="Edit journal details"
      preventCloseOnClickOutside
      onRequestClose={() => leave('close')}
    >
      {discard ? (
        <div role="alert">
          <h3>Discard unsaved journal details?</h3>
          <p>No save has been sent. Your entries and review will be lost.</p>
          <Button
            kind="danger"
            onClick={discard === 'reconnect' ? reconnect : close}
          >
            Discard details
          </Button>
          <Button kind="tertiary" onClick={() => setDiscard(null)}>
            Keep editing
          </Button>
        </div>
      ) : (
        <section
          className={styles.card}
          aria-label="Journal detail editor"
          aria-busy={busy}
        >
          <h2>
            {invoiceName({ id: invoiceId, name: initial.name })} · Item #
            {lineId}
          </h2>
          <p>
            Change this item&apos;s accounting details. This does not post the
            invoice, collect payment or change its amounts. Use the journal
            amounts and rows editor for monetary changes.
          </p>
          {initial.state === 'posted' ? (
            <p role="note">
              This invoice is posted. Saving keeps it posted. Native Billing
              still enforces accounting locks, protected entries and
              reconciliation rules.
            </p>
          ) : null}
          <p>
            Debit {money(initial.debit, initial.currency[1])} · Credit{' '}
            {money(initial.credit, initial.currency[1])}
          </p>
          {!initial.can_edit ? (
            <p role="alert">
              This journal item&apos;s state or your Billing permissions do not
              allow editing.
            </p>
          ) : null}
          <DraftChoiceInput
            id="journal-account"
            label="Journal account"
            uid={uid}
            journalInvoiceId={invoiceId}
            journalLineId={lineId}
            kind="account"
            value={values.account_id}
            name={accountName}
            disabled={locked}
            reconnect={() => leave('reconnect')}
            onChange={(id, name) => {
              change('account_id', id as number);
              setAccountName(name ?? '');
            }}
          />
          <TextInput
            id="journal-label"
            labelText="Journal item label"
            value={values.name || ''}
            disabled={locked}
            onChange={(event) => change('name', event.target.value)}
          />
          <TextInput
            id="journal-due"
            labelText="Due date"
            type="date"
            value={values.date_maturity || ''}
            disabled={locked}
            onChange={(event) =>
              change('date_maturity', event.target.value || false)
            }
          />
          <TextInput
            id="journal-discount-date"
            labelText="Early-payment discount date"
            type="date"
            value={values.discount_date || ''}
            disabled={locked}
            onChange={(event) =>
              change('discount_date', event.target.value || false)
            }
          />
          <TextInput
            id="journal-discount-amount"
            labelText={`Early-payment discount amount (${initial.transaction_currency[1]})`}
            type="number"
            min={0}
            step="any"
            value={
              Number.isFinite(values.discount_amount_currency)
                ? values.discount_amount_currency
                : ''
            }
            disabled={locked}
            onChange={(event) =>
              change(
                'discount_amount_currency',
                event.target.value === '' ? NaN : Number(event.target.value),
              )
            }
          />
          <DraftChoiceInput
            id="journal-grid"
            label="Add tax grid"
            uid={uid}
            journalInvoiceId={invoiceId}
            journalLineId={lineId}
            kind="grid"
            value={false}
            disabled={locked}
            reconnect={() => leave('reconnect')}
            onChange={(id, name) => {
              if (id && !values.tax_tag_ids.includes(id)) {
                change('tax_tag_ids', [...values.tax_tag_ids, id]);
                setGridNames({ ...gridNames, [id]: name ?? `Grid ${id}` });
              }
            }}
          />
          {values.tax_tag_ids.map((id) => (
            <p key={id}>
              {gridNames[id] ?? `Grid ${id}`}{' '}
              <Button
                kind="ghost"
                disabled={locked}
                onClick={() =>
                  change(
                    'tax_tag_ids',
                    values.tax_tag_ids.filter((item) => item !== id),
                  )
                }
              >
                Remove grid {id}
              </Button>
            </p>
          ))}
          {initial.analytics_visible ? (
            <JournalAnalyticsEditor
              uid={uid}
              invoiceId={invoiceId}
              lineId={lineId}
              accountId={values.account_id}
              value={values.analytic_distribution}
              disabled={locked}
              change={(distribution) =>
                change('analytic_distribution', distribution)
              }
              reconnect={() => leave('reconnect')}
            />
          ) : null}
          {review ? (
            <div role="region" aria-label="Reviewed journal details">
              <h3>Review before saving</h3>
              <p>
                Account: {initial.account[1]} → {review.account[1]}
              </p>
              <p>
                Label: {initial.values.name || 'No label'} →{' '}
                {review.values.name || 'No label'}
              </p>
              <p>
                Due date: {initial.values.date_maturity || 'Not set'} →{' '}
                {review.values.date_maturity || 'Not set'}
              </p>
              <p>
                Early-payment discount:{' '}
                {money(
                  review.values.discount_amount_currency,
                  review.transaction_currency[1],
                )}
                , date {review.values.discount_date || 'Not set'}
              </p>
              <p>
                Tax grids:{' '}
                {review.tax_grids.map((grid) => grid[1]).join(', ') || 'None'}
              </p>
              {review.analytics_visible ? (
                <p>
                  Analytic allocation:{' '}
                  {Object.entries(review.values.analytic_distribution || {})
                    .map(
                      ([key, percent]) =>
                        `${analyticAllocationLabel(key, review.analytic_accounts)}: ${percent}%`,
                    )
                    .join('; ') || 'None'}
                </p>
              ) : null}
              <p>
                Save rechecks the native journal and rolls back if amounts or
                the reviewed details change.
              </p>
            </div>
          ) : null}
          {failure ? <p role="alert">{failure.message}</p> : null}
          {status ? <p role="status">{status}</p> : null}
          {busy ? (
            <p role="status">Checking native journal details...</p>
          ) : null}
          {pending ? (
            <>
              <p role="alert">
                A save was sent. Entries remain locked until its receipt is
                confirmed.
              </p>
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
            </>
          ) : (
            <>
              <Button
                kind="tertiary"
                disabled={locked || distributionInvalid}
                onClick={() => void calculate()}
              >
                Review journal details
              </Button>
              <Button
                disabled={
                  locked || !review?.review_version || distributionInvalid
                }
                onClick={() => void save()}
              >
                Save reviewed journal details
              </Button>
            </>
          )}
          {failure instanceof BillingSessionExpired || pending ? (
            <Button
              kind="tertiary"
              disabled={busy}
              onClick={() => leave('reconnect')}
            >
              Reconnect Billing
            </Button>
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
