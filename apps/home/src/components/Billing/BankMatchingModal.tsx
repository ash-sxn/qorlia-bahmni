import { Button, Modal, TextInput } from '@bahmni/design-system';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { BankNativeGraph } from './BankNativeGraph';
import { money } from './billingFormat';
import styles from './BillingPage.module.scss';
import {
  BankCandidates,
  BankDetail,
  BankMatchPayload,
  BankMatchReview,
  BankMatchView,
  BillingActionRejected,
  BillingSessionExpired,
  checkedBankMatchRequest,
  getBankCandidates,
  getBankDetail,
  getBankFeeChoices,
  getBankMatch,
  getBankMatchStatus,
  previewBankMatch,
  saveBankMatch,
} from './billingService';
import { JournalAnalyticsEditor } from './JournalAnalyticsEditor';

type Props = {
  uid: number;
  entryId: number;
  close: () => void;
  saved: () => void;
  reconnect: () => void;
};
type Selection = BankMatchPayload['allocations'][number] & {
  row?: BankCandidates['rows'][number];
};

export function BankMatchingModal(props: Props) {
  const loaded = useQuery({
    queryKey: ['billing', 'bank-matching', props.uid, props.entryId],
    queryFn: async () => {
      const [initial, detail] = await Promise.all([
        getBankMatch(props.entryId),
        getBankDetail(props.entryId),
      ]);
      if (
        Object.entries(detail.entry).some(
          ([field, value]) =>
            JSON.stringify(value) !==
            JSON.stringify(initial.entry[field as keyof typeof initial.entry]),
        )
      )
        throw new Error(
          'Statement entry changed while loading. Reload bank matching before selecting an action.',
        );
      return { initial, detail };
    },
    retry: false,
    refetchOnMount: 'always',
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
  if (loaded.data && !loaded.isFetching && !loaded.isError)
    return (
      <MatchingForm
        key={`${props.uid}:${props.entryId}`}
        {...props}
        {...loaded.data}
      />
    );
  return (
    <Modal
      open
      passiveModal
      size="lg"
      modalHeading="Bank matching"
      preventCloseOnClickOutside
      onRequestClose={props.close}
    >
      {loaded.isFetching ? (
        <p role="status">Loading native matching access and accounting...</p>
      ) : (
        <p role="alert">
          {loaded.error?.message ?? 'Bank matching is unavailable.'}
        </p>
      )}
      <Button
        kind="tertiary"
        disabled={loaded.isFetching}
        onClick={() => void loaded.refetch()}
      >
        Reload bank matching
      </Button>
      {loaded.error instanceof BillingSessionExpired ? (
        <Button onClick={props.reconnect}>Reconnect Billing</Button>
      ) : null}
      <Button kind="ghost" onClick={props.close}>
        Back to statements
      </Button>
    </Modal>
  );
}

function MatchingForm({
  uid,
  entryId,
  close,
  saved,
  reconnect,
  initial,
  detail,
}: Props & { initial: BankMatchView; detail: BankDetail }) {
  const storageKey = `qorlia.billing.bank-match.pending:${uid}:${entryId}`;
  const [recovery] = useState(() => {
    try {
      const text = sessionStorage.getItem(storageKey);
      const request = text ? checkedBankMatchRequest(JSON.parse(text)) : null;
      if (request && request.payload.statement_line_id !== entryId)
        throw new Error('Wrong bank entry.');
      return { request, error: null };
    } catch {
      return {
        request: null,
        error: new Error(
          'Bank recovery storage is unavailable or invalid. Ask your Billing administrator to check this entry before another save.',
        ),
      };
    }
  });
  const [selected, setSelected] = useState<Selection[]>(
    recovery.request?.payload.allocations ?? [],
  );
  const [action, setAction] = useState<'match' | 'undo'>(
    recovery.request?.payload.action ?? 'match',
  );
  const [fee, setFee] = useState<{ id: number; name: string } | null>(() =>
    recovery.request?.payload.fee_model_id
      ? {
          id: recovery.request.payload.fee_model_id,
          name: `Native fee rule #${recovery.request.payload.fee_model_id}`,
        }
      : null,
  );
  const [pending, setPending] = useState(recovery.request);
  const [review, setReview] = useState<{
    payload: BankMatchPayload;
    result: BankMatchReview;
  } | null>(null);
  const [accepted, setAccepted] = useState<BankMatchView | null>(null);
  const [failure, setFailure] = useState<Error | null>(recovery.error);
  const [storageFailure, setStorageFailure] = useState(false);
  const [status, setStatus] = useState('');
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [discard, setDiscard] = useState<'close' | 'reconnect' | null>(null);
  const [search, setSearch] = useState('');
  const [submitted, setSubmitted] = useState('');
  const [offset, setOffset] = useState(0);
  const [feeSearch, setFeeSearch] = useState('');
  const [feeSubmitted, setFeeSubmitted] = useState('');
  const [feeOffset, setFeeOffset] = useState(0);
  const locked =
    busy || !!pending || !!recovery.error || storageFailure || !!accepted;
  const editable = !locked && initial.can_match && action === 'match';
  const candidates = useQuery({
    queryKey: [
      'billing',
      'bank-match-candidates',
      uid,
      entryId,
      detail.version,
      submitted,
      offset,
    ],
    queryFn: () =>
      getBankCandidates(entryId, detail.version, submitted, offset),
    enabled:
      initial.can_match &&
      action === 'match' &&
      !pending &&
      !accepted &&
      !recovery.error,
    retry: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
  const fees = useQuery({
    queryKey: [
      'billing',
      'bank-match-fees',
      uid,
      entryId,
      feeSubmitted,
      feeOffset,
    ],
    queryFn: () => getBankFeeChoices(entryId, feeSubmitted, feeOffset),
    enabled:
      initial.can_match &&
      action === 'match' &&
      !pending &&
      !accepted &&
      !recovery.error,
    retry: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
  useEffect(() => {
    if (!dirty && !pending) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty, pending]);
  const change = (apply: () => void) => {
    if (locked || busyRef.current) return;
    apply();
    setReview(null);
    setDirty(true);
    setFailure(null);
    setStatus('');
  };
  const leave = (target: 'close' | 'reconnect') => {
    if (busyRef.current) return;
    if (pending || recovery.error || storageFailure) {
      if (target === 'reconnect') reconnect();
      return;
    }
    if (dirty) setDiscard(target);
    else (target === 'close' ? close : reconnect)();
  };
  const payload = (): BankMatchPayload => ({
    statement_line_id: entryId,
    version: initial.version,
    action,
    allocations:
      action === 'undo'
        ? []
        : selected.map((item) => ({
            line_id: item.line_id,
            amount: item.amount,
            ...(Object.hasOwn(item, 'analytic_distribution')
              ? { analytic_distribution: item.analytic_distribution }
              : {}),
          })),
    fee_model_id: action === 'undo' ? false : (fee?.id ?? false),
  });
  const calculate = async () => {
    if (
      locked ||
      busyRef.current ||
      !(action === 'match' ? initial.can_match : initial.can_undo)
    )
      return;
    busyRef.current = true;
    setBusy(true);
    setFailure(null);
    setReview(null);
    try {
      const proposed = payload();
      setReview({
        payload: proposed,
        result: await previewBankMatch(proposed),
      });
    } catch (error) {
      setFailure(
        error instanceof Error
          ? error
          : new Error(
              'Native bank review is unavailable. Your selections remain here.',
            ),
      );
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };
  const accept = (result: BankMatchView) => {
    setAccepted(result);
    sessionStorage.removeItem(storageKey);
    setPending(null);
    setDirty(false);
    setReview(null);
    setStatus(
      'Your exact request was accepted. The accounting below is the native state at this response, which may include later changes. Reopen the statement before another action.',
    );
    saved();
  };
  const save = async () => {
    if (
      busyRef.current ||
      recovery.error ||
      storageFailure ||
      (!pending && !review) ||
      (accepted && !pending)
    )
      return;
    busyRef.current = true;
    setBusy(true);
    setFailure(null);
    setStatus('');
    try {
      const request =
        pending ??
        checkedBankMatchRequest({
          payload: review!.payload,
          review_version: review!.result.review_version,
          request_key: crypto.randomUUID(),
        });
      sessionStorage.setItem(storageKey, JSON.stringify(request));
      setPending(request);
      accept(await saveBankMatch(request));
    } catch (error) {
      if (error instanceof BillingActionRejected) {
        try {
          sessionStorage.removeItem(storageKey);
          setPending(null);
          setReview(null);
          setDirty(true);
        } catch {
          setStorageFailure(true);
          setFailure(
            new Error(
              'Save was rejected, but the recovery request could not be cleared. Check the bank entry before another save.',
            ),
          );
          return;
        }
      }
      setFailure(
        error instanceof Error
          ? error
          : new Error(
              'Bank save response is unavailable. Check the exact request before another action.',
            ),
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
      const result = await getBankMatchStatus(pending);
      if (result) accept(result);
      else
        setStatus(
          'No receipt was found yet. This does not prove the original save stopped. Check again or retry only the same request.',
        );
    } catch (error) {
      setFailure(
        error instanceof Error
          ? error
          : new Error('Bank request status is unavailable.'),
      );
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };
  const expired =
    failure instanceof BillingSessionExpired ||
    candidates.error instanceof BillingSessionExpired ||
    fees.error instanceof BillingSessionExpired;
  return (
    <Modal
      open
      passiveModal
      size="lg"
      modalHeading="Bank matching"
      preventCloseOnClickOutside
      onRequestClose={() => leave('close')}
    >
      {discard ? (
        <section role="alert" className={styles.card}>
          <h3>Discard unsaved bank selections?</h3>
          <p>No save is pending. Your selections and review will be lost.</p>
          <Button
            kind="danger"
            onClick={() => (discard === 'close' ? close : reconnect)()}
          >
            Discard selections
          </Button>
          <Button kind="tertiary" onClick={() => setDiscard(null)}>
            Keep editing
          </Button>
        </section>
      ) : null}
      <section className={styles.card} aria-label="Bank matching workspace">
        <h2>{initial.entry.move_id[1]}</h2>
        <p>
          {initial.entry.journal_id[1]} · {initial.entry.date} ·{' '}
          {initial.entry.partner_id
            ? initial.entry.partner_id[1]
            : 'No partner'}
        </p>
        <p>
          Statement amount:{' '}
          {money(initial.entry.amount, initial.entry.currency_id[1])}. Company
          currency: {initial.company_currency[1]}. Matching transaction
          currency: {initial.transaction_currency[1]}.
        </p>
        <p>
          Allocate positive amounts in each source item&apos;s own currency.
          Refund signs, exchange differences, taxes and remaining suspense are
          calculated by native Billing. Matching is not confirmation of bank
          clearance.
        </p>
        {initial.reason ? <p role="note">{initial.reason}</p> : null}
        {!initial.can_match && !initial.can_undo && !initial.reason ? (
          <p role="note">
            No matching or undo action is available for this native entry.
          </p>
        ) : null}
        {pending ? (
          <section aria-label="Pending bank request" className={styles.card}>
            <h3>Exact bank request awaiting confirmation</h3>
            <p>
              No new matching or undo action can be started until this request
              is resolved. Checking a missing receipt is not a cancellation.
            </p>
            <p>Request: {pending.request_key}</p>
            <details>
              <summary>Exact pending request</summary>
              <pre>{JSON.stringify(pending, null, 2)}</pre>
            </details>
            <Button disabled={busy} onClick={() => void check()}>
              Check bank save status
            </Button>
            <Button
              kind="tertiary"
              disabled={busy || !!accepted || storageFailure}
              onClick={() => void save()}
            >
              Retry exact bank request
            </Button>
          </section>
        ) : null}
        {accepted ? (
          <BankNativeGraph
            heading="Native accounting at acceptance check"
            before={accepted.graph}
            labels={accepted.labels}
          />
        ) : null}
        {!accepted && !pending && !recovery.error ? (
          <>
            <div className={styles.toolbar}>
              <Button
                kind={action === 'match' ? 'primary' : 'tertiary'}
                disabled={locked || !initial.can_match}
                onClick={() => change(() => setAction('match'))}
              >
                Match statement entry
              </Button>
              <Button
                kind={action === 'undo' ? 'primary' : 'tertiary'}
                disabled={locked || !initial.can_undo}
                onClick={() => change(() => setAction('undo'))}
              >
                Undo all entry matching
              </Button>
            </div>
            {action === 'undo' ? (
              <p role="note">
                Undo removes all native matches for this statement, not just the
                last selected item. Review payment deletions, restored residuals
                and generated reversals before saving.
              </p>
            ) : (
              <>
                <h3>Possible native ledger matches</h3>
                <form
                  className={styles.toolbar}
                  onSubmit={(event) => {
                    event.preventDefault();
                    if (!editable) return;
                    setSubmitted(search.trim());
                    setOffset(0);
                  }}
                >
                  <TextInput
                    id="bank-match-search"
                    labelText="Find source document, partner or label"
                    maxLength={160}
                    value={search}
                    disabled={!editable}
                    onChange={(event) => setSearch(event.target.value)}
                  />
                  <Button
                    type="submit"
                    disabled={!editable || candidates.isFetching}
                  >
                    Find matching items
                  </Button>
                </form>
                {candidates.isFetching ? (
                  <p role="status">Loading matching candidates...</p>
                ) : null}
                {candidates.isError ? (
                  <p role="alert">
                    {candidates.error.message} Previously loaded candidates are
                    hidden; your selections remain.
                  </p>
                ) : null}
                {candidates.data && !candidates.isError ? (
                  <>
                    <div
                      className={styles.tableScroll}
                      role="region"
                      aria-label="Selectable native matching items"
                      tabIndex={0}
                    >
                      <table>
                        <caption>
                          Matching candidates, page {offset / 25 + 1}
                        </caption>
                        <thead>
                          <tr>
                            {[
                              'Document / date',
                              'Account / partner',
                              'Company residual',
                              'Source transaction residual',
                              'Select',
                            ].map((title) => (
                              <th key={title} scope="col">
                                {title}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {candidates.data.rows.map((row) => (
                            <tr key={row.id}>
                              <td>
                                {row.move_id[1]}
                                <br />
                                {row.date}
                                <br />
                                {row.name || 'No label'}
                              </td>
                              <td>
                                {row.account_id[1]}
                                <br />
                                {row.partner_id
                                  ? row.partner_id[1]
                                  : 'No partner'}
                              </td>
                              <td>
                                {money(
                                  row.amount_residual,
                                  initial.company_currency[1],
                                )}
                              </td>
                              <td>
                                {row.currency_id
                                  ? money(
                                      row.amount_residual_currency,
                                      row.currency_id[1],
                                    )
                                  : 'Currency unavailable'}
                              </td>
                              <td>
                                <Button
                                  kind="tertiary"
                                  disabled={
                                    !editable ||
                                    candidates.isFetching ||
                                    !row.currency_id ||
                                    selected.some(
                                      (item) =>
                                        item.line_id === row.id && !!item.row,
                                    ) ||
                                    selected.length >= 1000
                                  }
                                  onClick={() =>
                                    change(() =>
                                      setSelected((items) => {
                                        const existing = items.find(
                                          (item) => item.line_id === row.id,
                                        );
                                        return existing
                                          ? items.map((item) =>
                                              item.line_id === row.id
                                                ? { ...item, row }
                                                : item,
                                            )
                                          : [
                                              ...items,
                                              {
                                                line_id: row.id,
                                                amount: Math.abs(
                                                  row.amount_residual_currency,
                                                ),
                                                row,
                                              },
                                            ];
                                      }),
                                    )
                                  }
                                >
                                  Select item {row.id}
                                </Button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {!candidates.data.rows.length ? (
                      <p>No eligible native ledger items match this search.</p>
                    ) : null}
                    <div className={styles.toolbar}>
                      <Button
                        kind="tertiary"
                        disabled={
                          !editable || candidates.isFetching || offset === 0
                        }
                        onClick={() =>
                          setOffset((page) => Math.max(0, page - 25))
                        }
                      >
                        Previous matching items
                      </Button>
                      <Button
                        kind="tertiary"
                        disabled={
                          !editable ||
                          candidates.isFetching ||
                          !candidates.data.has_more
                        }
                        onClick={() => setOffset((page) => page + 25)}
                      >
                        More matching items
                      </Button>
                    </div>
                  </>
                ) : null}
                <h3>Selected source allocations</h3>
                {!selected.length ? (
                  <p>
                    No source items selected. You may instead choose an
                    applicable native fee rule.
                  </p>
                ) : null}
                {selected.map((item) => (
                  <fieldset
                    className={styles.draftItem}
                    key={item.line_id}
                    disabled={!editable}
                  >
                    <legend>
                      {item.row ? item.row.move_id[1] : 'Recovered source'} ·
                      item #{item.line_id}
                    </legend>
                    {item.row ? (
                      <p>
                        {item.row.account_id[1]} ·{' '}
                        {item.row.partner_id
                          ? item.row.partner_id[1]
                          : 'No partner'}
                        . Source residual:{' '}
                        {item.row.currency_id
                          ? money(
                              item.row.amount_residual_currency,
                              item.row.currency_id[1],
                            )
                          : 'Currency unavailable'}
                        .
                      </p>
                    ) : (
                      <p>
                        Find and select this saved item again to load its
                        current name, account and currency. The exact recovered
                        allocation remains below.
                      </p>
                    )}
                    <TextInput
                      id={`bank-match-amount-${item.line_id}`}
                      labelText={`Item ${item.line_id} allocation (${item.row?.currency_id ? item.row.currency_id[1] : 'source currency'})`}
                      type="number"
                      step="any"
                      min={0}
                      max={
                        item.row
                          ? Math.abs(item.row.amount_residual_currency)
                          : undefined
                      }
                      value={Number.isFinite(item.amount) ? item.amount : ''}
                      disabled={!editable || !item.row}
                      invalid={
                        !Number.isFinite(item.amount) ||
                        item.amount <= 0 ||
                        (!!item.row &&
                          item.amount >
                            Math.abs(item.row.amount_residual_currency))
                      }
                      invalidText="Enter a positive amount within the source residual, using its native currency rounding."
                      onChange={(event) =>
                        change(() =>
                          setSelected((items) =>
                            items.map((row) =>
                              row.line_id === item.line_id
                                ? {
                                    ...row,
                                    amount:
                                      event.target.value === ''
                                        ? NaN
                                        : Number(event.target.value),
                                  }
                                : row,
                            ),
                          ),
                        )
                      }
                    />
                    {item.row ? (
                      <JournalAnalyticsEditor
                        uid={uid}
                        invoiceId={entryId}
                        lineId={item.line_id}
                        accountId={item.row.account_id[0]}
                        bankMatch={{
                          statementLineId: entryId,
                          sourceLineId: item.line_id,
                        }}
                        inputPrefix={`bank-match-${item.line_id}`}
                        value={item.analytic_distribution ?? false}
                        disabled={!editable}
                        reconnect={() => leave('reconnect')}
                        change={(distribution) =>
                          change(() =>
                            setSelected((items) =>
                              items.map((row) =>
                                row.line_id === item.line_id
                                  ? {
                                      ...row,
                                      analytic_distribution: distribution,
                                    }
                                  : row,
                              ),
                            ),
                          )
                        }
                      />
                    ) : (
                      <pre>
                        {JSON.stringify(
                          item.analytic_distribution ?? false,
                          null,
                          2,
                        )}
                      </pre>
                    )}
                    <Button
                      kind="ghost"
                      disabled={!editable}
                      onClick={() =>
                        change(() =>
                          setSelected((items) =>
                            items.filter((row) => row.line_id !== item.line_id),
                          ),
                        )
                      }
                    >
                      Remove matching item {item.line_id}
                    </Button>
                  </fieldset>
                ))}
                <h3>Native fee or write-off rule</h3>
                <p>
                  Selected: {fee?.name ?? 'No fee rule'}. Native tax, amount and
                  analytic settings apply. A rule is not an arbitrary balancing
                  adjustment.
                </p>
                {fee ? (
                  <Button
                    kind="ghost"
                    disabled={!editable}
                    onClick={() => change(() => setFee(null))}
                  >
                    Remove fee rule
                  </Button>
                ) : null}
                <form
                  className={styles.toolbar}
                  onSubmit={(event) => {
                    event.preventDefault();
                    if (!editable) return;
                    setFeeSubmitted(feeSearch.trim());
                    setFeeOffset(0);
                  }}
                >
                  <TextInput
                    id="bank-fee-search"
                    labelText="Find an applicable fee rule"
                    maxLength={160}
                    disabled={!editable}
                    value={feeSearch}
                    onChange={(event) => setFeeSearch(event.target.value)}
                  />
                  <Button type="submit" disabled={!editable || fees.isFetching}>
                    Find fee rules
                  </Button>
                </form>
                {fees.isFetching ? (
                  <p role="status">Loading applicable native fee rules...</p>
                ) : null}
                {fees.isError ? (
                  <p role="alert">
                    {fees.error.message} Previously loaded rules are hidden; the
                    selected rule remains.
                  </p>
                ) : null}
                {fees.data && !fees.isError ? (
                  <>
                    {!fees.data.rows.length ? (
                      <p>No applicable fee rules match this search.</p>
                    ) : null}
                    <div className={styles.toolbar}>
                      {fees.data.rows.map((rule) => (
                        <Button
                          key={rule.id}
                          kind="tertiary"
                          disabled={
                            !editable || fees.isFetching || fee?.id === rule.id
                          }
                          onClick={() =>
                            change(() =>
                              setFee({ id: rule.id, name: rule.name }),
                            )
                          }
                        >
                          Use fee rule {rule.name}
                        </Button>
                      ))}
                    </div>
                    <div className={styles.toolbar}>
                      <Button
                        kind="tertiary"
                        disabled={
                          !editable || fees.isFetching || feeOffset === 0
                        }
                        onClick={() =>
                          setFeeOffset((page) => Math.max(0, page - 25))
                        }
                      >
                        Previous fee rules
                      </Button>
                      <Button
                        kind="tertiary"
                        disabled={
                          !editable || fees.isFetching || !fees.data.has_more
                        }
                        onClick={() => setFeeOffset((page) => page + 25)}
                      >
                        More fee rules
                      </Button>
                    </div>
                  </>
                ) : null}
              </>
            )}
            <div className={styles.toolbar}>
              <Button
                disabled={
                  locked ||
                  !(action === 'match'
                    ? initial.can_match
                    : initial.can_undo) ||
                  (action === 'match' && !selected.length && !fee)
                }
                onClick={() => void calculate()}
              >
                {action === 'undo'
                  ? 'Review native undo'
                  : 'Review native matching'}
              </Button>
              <Button
                kind={action === 'undo' ? 'danger' : 'primary'}
                disabled={locked || !review}
                onClick={() => void save()}
              >
                {action === 'undo'
                  ? 'Save reviewed undo'
                  : 'Save reviewed matching'}
              </Button>
            </div>
          </>
        ) : null}
        {review && !pending ? (
          <BankNativeGraph
            heading="Reviewed bank accounting effects"
            before={review.result.before}
            after={review.result.after}
            labels={review.result.labels}
          />
        ) : null}
        {status ? <p role="status">{status}</p> : null}
        {failure ? <p role="alert">{failure.message}</p> : null}
        {busy ? (
          <p role="status">
            Waiting for native Billing. Do not start another bank action.
          </p>
        ) : null}
        {expired || pending ? (
          <Button
            kind="tertiary"
            disabled={busy}
            onClick={() => leave('reconnect')}
          >
            Reconnect Billing
          </Button>
        ) : null}
        <details>
          <summary>Complete current native accounting snapshot</summary>
          <BankNativeGraph
            heading="Loaded bank accounting"
            before={initial.graph}
            labels={initial.labels}
          />
        </details>
        <Button
          kind="ghost"
          disabled={busy || !!pending || !!recovery.error || storageFailure}
          onClick={() => leave('close')}
        >
          Back to statements
        </Button>
      </section>
    </Modal>
  );
}
