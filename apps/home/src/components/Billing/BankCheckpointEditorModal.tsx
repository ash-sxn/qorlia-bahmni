import { Button, Modal, TextInput } from '@bahmni/design-system';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { BankNativeGraph } from './BankNativeGraph';
import { money } from './billingFormat';
import styles from './BillingPage.module.scss';
import {
  BankCheckpoint,
  BankCheckpointEditor,
  BankCheckpointPayload,
  BankCheckpointRequest,
  BankCheckpointReview,
  BankCheckpointSelection,
  BillingActionRejected,
  BillingSessionExpired,
  checkedBankCheckpointRequest,
  getBankCheckpointSaveStatus,
  loadBankCheckpointEditor,
  previewBankCheckpoint,
  saveBankCheckpoint,
} from './billingService';

type Props = {
  uid: number;
  selection: BankCheckpointSelection | null;
  close: () => void;
  reconnect: () => void;
};
export const checkpointRecoveryKey = (uid: number) =>
  `qorlia.billing.checkpoint.pending:v1:${uid}`;

function balance(value: number, row: Omit<BankCheckpoint, 'id'>) {
  return row.currency_id
    ? money(value, row.currency_id[1])
    : 'No journal currency';
}

export function BankCheckpointEditorModal(props: Props) {
  const [recovery] = useState(() => {
    try {
      const raw = sessionStorage.getItem(checkpointRecoveryKey(props.uid));
      return {
        request: raw ? checkedBankCheckpointRequest(JSON.parse(raw)) : null,
        error: null,
      };
    } catch {
      return {
        request: null,
        error: new Error(
          'Checkpoint recovery storage is unavailable or invalid. Ask your Billing administrator to check the previous save before another action.',
        ),
      };
    }
  });
  const loaded = useQuery({
    queryKey: ['billing', 'checkpoint-editor', props.uid, props.selection],
    queryFn: () => loadBankCheckpointEditor(props.selection!),
    enabled: !!props.selection && !recovery.request && !recovery.error,
    retry: false,
    refetchOnMount: 'always',
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
  if (
    recovery.request ||
    recovery.error ||
    (loaded.data && !loaded.isFetching && !loaded.isError)
  )
    return (
      <CheckpointForm
        key={`${props.uid}:${loaded.dataUpdatedAt}`}
        {...props}
        initial={
          recovery.request || recovery.error ? null : (loaded.data ?? null)
        }
        recovery={recovery}
        reload={() => void loaded.refetch()}
      />
    );
  return (
    <Modal
      open
      passiveModal
      size="lg"
      modalHeading="Statement checkpoint editor"
      preventCloseOnClickOutside
      onRequestClose={props.close}
    >
      {loaded.isFetching ? (
        <p role="status">Loading native checkpoint selection and balances...</p>
      ) : (
        <p role="alert">
          {loaded.error?.message ??
            'No pending checkpoint request was found. Select transactions or an existing checkpoint.'}
        </p>
      )}
      {props.selection ? (
        <Button
          disabled={loaded.isFetching}
          onClick={() => void loaded.refetch()}
        >
          Reload checkpoint source
        </Button>
      ) : null}
      {loaded.error instanceof BillingSessionExpired ? (
        <Button onClick={props.reconnect}>Reconnect Billing</Button>
      ) : null}
      <Button kind="ghost" onClick={props.close}>
        Back to statements
      </Button>
    </Modal>
  );
}

function CheckpointForm({
  uid,
  initial,
  recovery,
  close,
  reconnect,
  reload,
}: Omit<Props, 'selection'> & {
  initial: BankCheckpointEditor | null;
  recovery: { request: BankCheckpointRequest | null; error: Error | null };
  reload: () => void;
}) {
  const client = useQueryClient();
  const storageKey = checkpointRecoveryKey(uid);
  const start = recovery.request?.payload.values ?? initial?.values;
  const [draft, setDraft] = useState(() => ({
    name: start?.name === false ? '' : (start?.name ?? ''),
    reference: start?.reference === false ? '' : (start?.reference ?? ''),
    balance_start: start ? String(start.balance_start) : '',
    balance_end_real: start ? String(start.balance_end_real) : '',
  }));
  const [pending, setPending] = useState(recovery.request);
  const [review, setReview] = useState<{
    payload: BankCheckpointPayload;
    result: BankCheckpointReview;
  } | null>(null);
  const [accepted, setAccepted] = useState<BankCheckpoint | null>(null);
  const [failure, setFailure] = useState<Error | null>(recovery.error);
  const [storageFailure, setStorageFailure] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [status, setStatus] = useState('');
  const [discard, setDiscard] = useState<
    'close' | 'reconnect' | 'reload' | null
  >(null);
  const locked =
    busy || !!pending || !!recovery.error || storageFailure || !!accepted;
  const unresolved = !!pending;
  useEffect(() => {
    if (!dirty && !unresolved) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty, unresolved]);
  const leave = (target: 'close' | 'reconnect' | 'reload') => {
    if (busyRef.current) return;
    if (pending || recovery.error || storageFailure) {
      if (target === 'reconnect') reconnect();
      return;
    }
    if (dirty) setDiscard(target);
    else ({ close, reconnect, reload })[target]();
  };
  const change = (field: keyof typeof draft, value: string) => {
    if (locked || busyRef.current) return;
    setDraft((prior) => ({ ...prior, [field]: value }));
    setReview(null);
    setDirty(true);
    setFailure(null);
    setStatus('');
  };
  const calculate = async () => {
    if (locked || busyRef.current || !initial) return;
    setReview(null);
    setFailure(null);
    setStatus('');
    busyRef.current = true;
    setBusy(true);
    try {
      const numbers = [draft.balance_start, draft.balance_end_real];
      if (
        numbers.some(
          (value) => !value.trim() || !Number.isFinite(Number(value)),
        )
      )
        throw new Error(
          'Enter a finite opening and recorded ending balance. Blank balances are not zero.',
        );
      const payload: BankCheckpointPayload = {
        checkpoint_id: initial.checkpoint_id,
        entry_ids: initial.entry_ids,
        split_line_id: initial.split_line_id,
        version: initial.version,
        values: {
          name: draft.name || false,
          reference: draft.reference || false,
          balance_start: Number(draft.balance_start),
          balance_end_real: Number(draft.balance_end_real),
        },
      };
      setReview({ payload, result: await previewBankCheckpoint(payload) });
    } catch (error) {
      setFailure(
        error instanceof Error
          ? error
          : new Error(
              'Native checkpoint review is unavailable. Your edits remain here.',
            ),
      );
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };
  const accept = (checkpoint: BankCheckpoint) => {
    setAccepted(checkpoint);
    // Keep the exact request until its receipt is confirmed and storage is actually cleared.
    try {
      sessionStorage.removeItem(storageKey);
    } catch {
      setStorageFailure(true);
      throw new Error(
        'The save was accepted, but recovery storage could not be cleared. Do not start a new save.',
      );
    }
    setStorageFailure(false);
    setPending(null);
    setDirty(false);
    setReview(null);
    setStatus(
      'Your exact request was accepted. The checkpoint below is its current native state and may include later changes. Reopen it before another edit.',
    );
    void client.invalidateQueries({
      predicate: (query) =>
        query.queryKey[0] === 'billing' &&
        query.queryKey[2] === uid &&
        [
          'bank-history',
          'bank-detail',
          'checkpoint-history',
          'checkpoint-detail',
        ].includes(String(query.queryKey[1])),
    });
  };
  const save = async () => {
    if (
      busyRef.current ||
      recovery.error ||
      storageFailure ||
      (!pending && !review) ||
      accepted
    )
      return;
    busyRef.current = true;
    setBusy(true);
    setFailure(null);
    setStatus('');
    try {
      const request =
        pending ??
        checkedBankCheckpointRequest({
          payload: review!.payload,
          review_version: review!.result.review_version,
          request_key: crypto.randomUUID(),
        });
      sessionStorage.setItem(storageKey, JSON.stringify(request));
      setPending(request);
      const result = await saveBankCheckpoint(request);
      if (!result.accepted || !result.checkpoint)
        throw new Error(
          'The native checkpoint receipt is unavailable. Check the exact save request.',
        );
      accept(result.checkpoint);
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
              'Save was rejected, but recovery storage could not be cleared. Ask your Billing administrator to check the request.',
            ),
          );
          return;
        }
      }
      setFailure(
        error instanceof Error
          ? error
          : new Error(
              'Save response is unavailable. Check the exact request before another action.',
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
      const result = await getBankCheckpointSaveStatus(pending);
      if (result.accepted && result.checkpoint) accept(result.checkpoint);
      else
        setStatus(
          'No receipt was found yet. This does not prove the original save stopped. Check again or retry only the same request.',
        );
    } catch (error) {
      setFailure(
        error instanceof Error
          ? error
          : new Error('Checkpoint save status is unavailable.'),
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
      modalHeading="Statement checkpoint editor"
      preventCloseOnClickOutside
      onRequestClose={() => leave('close')}
    >
      {discard ? (
        <section role="alert" className={styles.card}>
          <h3>Discard unsaved checkpoint edits?</h3>
          <p>No save is pending. Your edits and review will be lost.</p>
          <Button
            kind="danger"
            onClick={() => ({ close, reconnect, reload })[discard]()}
          >
            Discard edits
          </Button>
          <Button kind="tertiary" onClick={() => setDiscard(null)}>
            Keep editing
          </Button>
        </section>
      ) : null}
      <section
        className={styles.card}
        aria-label="Checkpoint editing workspace"
      >
        <h2>
          {pending?.payload.checkpoint_id || initial?.checkpoint_id
            ? 'Edit statement checkpoint'
            : 'Create statement checkpoint'}
        </h2>
        <p>
          Group recorded transactions and review statement balances. This does
          not create a bank transaction, change its accounting or establish bank
          clearance.
        </p>
        {initial && !pending && !accepted ? (
          <>
            <p>
              {initial.checkpoint.journal_id
                ? initial.checkpoint.journal_id[1]
                : 'No journal'}{' '}
              · {initial.checkpoint.date || 'No posted entries'}
            </p>
            <p>
              Native selected transactions:{' '}
              {initial.selected_entry_ids.join(', ') ||
                'None (empty checkpoint)'}
              .
            </p>
            {initial.split_line_id ? (
              <p role="note">
                Native split selection can include earlier transactions, not
                just the anchor. Review every affected checkpoint before saving.
              </p>
            ) : null}
          </>
        ) : null}
        {pending ? (
          <section
            className={styles.card}
            aria-label="Pending checkpoint request"
          >
            <h3>Exact checkpoint request awaiting confirmation</h3>
            <p>
              No new checkpoint save can start until this request is resolved. A
              missing receipt is not a cancellation.
            </p>
            <p>Request: {pending.request_key}</p>
            <details>
              <summary>Exact pending request</summary>
              <pre>{JSON.stringify(pending, null, 2)}</pre>
            </details>
            <Button disabled={busy} onClick={() => void check()}>
              Check checkpoint save status
            </Button>
            <Button
              kind="tertiary"
              disabled={busy || !!accepted || storageFailure}
              onClick={() => void save()}
            >
              Retry exact checkpoint request
            </Button>
          </section>
        ) : null}
        {!accepted && !recovery.error ? (
          <>
            <div className={styles.toolbar}>
              <TextInput
                id="checkpoint-name"
                labelText="Statement name"
                maxLength={200}
                value={draft.name}
                disabled={locked}
                onChange={(event) => change('name', event.target.value)}
              />
              <TextInput
                id="checkpoint-reference"
                labelText="External reference"
                maxLength={200}
                value={draft.reference}
                disabled={locked}
                onChange={(event) => change('reference', event.target.value)}
              />
              <TextInput
                id="checkpoint-opening"
                labelText="Opening balance"
                inputMode="decimal"
                value={draft.balance_start}
                disabled={locked}
                onChange={(event) =>
                  change('balance_start', event.target.value)
                }
              />
              <TextInput
                id="checkpoint-ending"
                labelText="Recorded ending balance"
                inputMode="decimal"
                value={draft.balance_end_real}
                disabled={locked}
                onChange={(event) =>
                  change('balance_end_real', event.target.value)
                }
              />
            </div>
            {!pending ? (
              <div className={styles.toolbar}>
                <Button
                  disabled={locked || !initial}
                  onClick={() => void calculate()}
                >
                  Review native checkpoint effects
                </Button>
                <Button
                  disabled={locked || !review}
                  onClick={() => void save()}
                >
                  Save reviewed checkpoint
                </Button>
                <Button
                  kind="tertiary"
                  disabled={locked}
                  onClick={() => leave('reload')}
                >
                  Reload checkpoint source
                </Button>
              </div>
            ) : null}
          </>
        ) : null}
        {review && !pending ? (
          <section aria-label="Reviewed checkpoint effects">
            <h3>Reviewed checkpoint effects</h3>
            <p>
              All checkpoints in the native journal scope are included.
              Completeness compares computed and recorded ending balances.
              Continuity compares the opening balance with the preceding
              checkpoint.
            </p>
            <div
              className={styles.tableScroll}
              role="region"
              aria-label="Affected checkpoints"
              tabIndex={0}
            >
              <table className={styles.statementTable}>
                <caption>Complete native checkpoint review</caption>
                <thead>
                  <tr>
                    {[
                      'Checkpoint / reference',
                      'Date / journal',
                      'Transactions',
                      'Opening',
                      'Computed ending',
                      'Recorded ending',
                      'Completeness / continuity',
                      'Native explanation',
                    ].map((title) => (
                      <th key={title} scope="col">
                        {title}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {review.result.affected.map(
                    ({ checkpoint: row, entry_ids }) => (
                      <tr key={row.id}>
                        <td>
                          {row.id === 'new'
                            ? 'New checkpoint'
                            : `Checkpoint ${row.id}`}
                          <br />
                          {row.name || 'Unnamed checkpoint'}
                          <br />
                          {row.reference || 'No external reference'}
                        </td>
                        <td>
                          {row.date || 'No posted entries'}
                          <br />
                          {row.journal_id ? row.journal_id[1] : 'No journal'}
                        </td>
                        <td>{entry_ids.join(', ') || 'No entries'}</td>
                        <td>{balance(row.balance_start, row)}</td>
                        <td>{balance(row.balance_end, row)}</td>
                        <td>{balance(row.balance_end_real, row)}</td>
                        <td>
                          {row.is_complete ? 'Complete' : 'Incomplete'}
                          <br />
                          {row.is_valid ? 'Valid' : 'Needs attention'}
                        </td>
                        <td>
                          {row.problem_description ||
                            'No native problem reported'}
                        </td>
                      </tr>
                    ),
                  )}
                </tbody>
              </table>
            </div>
            <details>
              <summary>Complete unchanged native accounting</summary>
              {Object.keys(review.result.financial).length ? (
                <BankNativeGraph
                  heading="Unchanged checkpoint accounting"
                  before={review.result.financial}
                  labels={{}}
                  purpose="checkpoint"
                />
              ) : (
                <p>No accounting entries belong to this empty checkpoint.</p>
              )}
            </details>
          </section>
        ) : null}
        {accepted ? (
          <section
            aria-label="Accepted native checkpoint"
            className={styles.card}
          >
            <h3>Accepted checkpoint {accepted.id}</h3>
            <p>
              {accepted.name || 'Unnamed checkpoint'} ·{' '}
              {accepted.reference || 'No external reference'}
            </p>
            <p>
              {accepted.journal_id ? accepted.journal_id[1] : 'No journal'} ·{' '}
              {accepted.date || 'No posted entries'}
            </p>
            <dl className={styles.totals}>
              <dt>Opening balance</dt>
              <dd>{balance(accepted.balance_start, accepted)}</dd>
              <dt>Computed ending balance</dt>
              <dd>{balance(accepted.balance_end, accepted)}</dd>
              <dt>Recorded ending balance</dt>
              <dd>{balance(accepted.balance_end_real, accepted)}</dd>
              <dt>Completeness</dt>
              <dd>{accepted.is_complete ? 'Complete' : 'Incomplete'}</dd>
              <dt>Continuity</dt>
              <dd>{accepted.is_valid ? 'Valid' : 'Needs attention'}</dd>
            </dl>
            {accepted.problem_description ? (
              <p role="note">{accepted.problem_description}</p>
            ) : null}
          </section>
        ) : null}
        {status ? <p role="status">{status}</p> : null}
        {failure ? <p role="alert">{failure.message}</p> : null}
        {busy ? (
          <p role="status">
            Waiting for native Billing. Do not start another checkpoint action.
          </p>
        ) : null}
        {pending ||
        failure instanceof BillingSessionExpired ||
        recovery.error ||
        storageFailure ? (
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
          disabled={busy || !!pending || !!recovery.error || storageFailure}
          onClick={() => leave('close')}
        >
          Back to statements
        </Button>
      </section>
    </Modal>
  );
}
