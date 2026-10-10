import { Button, Modal, TextInput } from '@bahmni/design-system';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { money } from './billingFormat';
import styles from './BillingPage.module.scss';
import {
  BankCheckpoint,
  BillingSessionExpired,
  getBankCheckpointDetail,
  getBankCheckpointHistory,
} from './billingService';

function checkpointMoney(value: number, row: BankCheckpoint) {
  return row.currency_id
    ? money(value, row.currency_id[1])
    : 'No journal currency';
}

export function BankCheckpointsPanel({
  uid,
  reconnect,
  openEntry,
}: {
  uid: number;
  reconnect: () => void;
  openEntry: (entryId: number) => void;
}) {
  const [search, setSearch] = useState('');
  const [submitted, setSubmitted] = useState('');
  const [state, setState] = useState('all');
  const [journalType, setJournalType] = useState('all');
  const [offset, setOffset] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const history = useQuery({
    queryKey: [
      'billing',
      'checkpoint-history',
      uid,
      submitted,
      state,
      journalType,
      offset,
    ],
    queryFn: () =>
      getBankCheckpointHistory(submitted, state, journalType, offset),
    retry: false,
    refetchOnMount: 'always',
    refetchOnWindowFocus: false,
  });
  return (
    <section className={styles.card} aria-label="Statement checkpoints">
      <h2>Statement checkpoints</h2>
      <p>
        Compare the recorded opening and ending balances. Completeness checks
        the entries within a statement. Continuity checks its opening balance
        against the previous statement. Neither means a payment has cleared your
        bank.
      </p>
      <form
        className={styles.toolbar}
        onSubmit={(event) => {
          event.preventDefault();
          setSubmitted(search.trim());
          setOffset(0);
          setSelected(null);
        }}
      >
        <TextInput
          id="checkpoint-search"
          labelText="Statement, external reference or journal"
          maxLength={160}
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <label className={styles.select} htmlFor="checkpoint-state">
          Checkpoint status
          <select
            id="checkpoint-state"
            value={state}
            onChange={(event) => {
              setState(event.target.value);
              setOffset(0);
              setSelected(null);
            }}
          >
            <option value="all">All checkpoints</option>
            <option value="invalid">Needs attention</option>
            <option value="empty">Empty checkpoints</option>
          </select>
        </label>
        <label className={styles.select} htmlFor="checkpoint-journal-type">
          Journal type
          <select
            id="checkpoint-journal-type"
            value={journalType}
            onChange={(event) => {
              setJournalType(event.target.value);
              setOffset(0);
              setSelected(null);
            }}
          >
            <option value="all">Bank and cash</option>
            <option value="bank">Bank</option>
            <option value="cash">Cash</option>
          </select>
        </label>
        <Button type="submit" disabled={history.isFetching}>
          Search checkpoints
        </Button>
        <Button
          kind="tertiary"
          disabled={history.isFetching}
          onClick={() => {
            setSelected(null);
            void history.refetch();
          }}
        >
          Refresh checkpoints
        </Button>
      </form>
      {history.isFetching ? (
        <p role="status">Loading native checkpoints...</p>
      ) : null}
      {history.isError ? (
        <p role="alert">
          {history.error.message} Previously loaded checkpoints are hidden until
          a successful reload.
        </p>
      ) : null}
      {history.error instanceof BillingSessionExpired ? (
        <Button onClick={reconnect}>Reconnect Billing</Button>
      ) : null}
      {history.data && !history.isError ? (
        <>
          <div
            className={styles.tableScroll}
            role="region"
            aria-label="Checkpoint history"
            tabIndex={0}
          >
            <table className={styles.statementTable}>
              <caption>Native statement balance checkpoints</caption>
              <thead>
                <tr>
                  {[
                    'Statement / reference',
                    'Date / journal',
                    'Opening balance',
                    'Computed ending',
                    'Recorded ending',
                    'Completeness',
                    'Continuity',
                    'Details',
                  ].map((title) => (
                    <th scope="col" key={title}>
                      {title}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {history.data.rows.map((row) => (
                  <tr key={row.id}>
                    <td>
                      {row.name || 'Unnamed checkpoint'}
                      <br />
                      {row.reference || 'No external reference'}
                    </td>
                    <td>
                      {row.date || 'No posted entries'}
                      <br />
                      {row.journal_id ? row.journal_id[1] : 'No journal'}
                    </td>
                    <td>{checkpointMoney(row.balance_start, row)}</td>
                    <td>{checkpointMoney(row.balance_end, row)}</td>
                    <td>{checkpointMoney(row.balance_end_real, row)}</td>
                    <td>{row.is_complete ? 'Complete' : 'Incomplete'}</td>
                    <td>{row.is_valid ? 'Valid' : 'Needs attention'}</td>
                    <td>
                      <Button
                        kind="tertiary"
                        disabled={history.isFetching}
                        onClick={() => setSelected(row.id)}
                      >
                        View checkpoint {row.id}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!history.data.rows.length ? (
            <p>No statement checkpoints match this search.</p>
          ) : null}
          <div className={styles.toolbar}>
            <Button
              kind="tertiary"
              disabled={history.isFetching || offset === 0}
              onClick={() => {
                setOffset((value) => Math.max(0, value - 25));
                setSelected(null);
              }}
            >
              Previous checkpoints
            </Button>
            <Button
              kind="tertiary"
              disabled={history.isFetching || !history.data.has_more}
              onClick={() => {
                setOffset((value) => value + 25);
                setSelected(null);
              }}
            >
              Next checkpoints
            </Button>
          </div>
        </>
      ) : null}
      {selected !== null ? (
        <CheckpointDetail
          key={selected}
          uid={uid}
          checkpointId={selected}
          close={() => setSelected(null)}
          reconnect={reconnect}
          openEntry={openEntry}
        />
      ) : null}
    </section>
  );
}

function CheckpointDetail({
  uid,
  checkpointId,
  close,
  reconnect,
  openEntry,
}: {
  uid: number;
  checkpointId: number;
  close: () => void;
  reconnect: () => void;
  openEntry: (entryId: number) => void;
}) {
  const detail = useInfiniteQuery({
    queryKey: ['billing', 'checkpoint-detail', uid, checkpointId],
    initialPageParam: {
      after: false as number | false,
      version: false as string | false,
    },
    queryFn: ({ pageParam }) =>
      getBankCheckpointDetail(checkpointId, pageParam.after, pageParam.version),
    getNextPageParam: (page) =>
      page.next_after === false
        ? undefined
        : { after: page.next_after, version: page.version },
    retry: false,
    refetchOnMount: 'always',
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
  const first = detail.data?.pages[0];
  const rows = detail.data?.pages.flatMap((page) => page.rows) ?? [];
  const inconsistent =
    (detail.data?.pages.some(
      (page) =>
        page.version !== first?.version ||
        page.total_count !== first?.total_count,
    ) ??
      false) ||
    new Set(rows.map((row) => row.id)).size !== rows.length ||
    rows.length > (first?.total_count ?? 0) ||
    (first && !detail.hasNextPage && rows.length !== first.total_count);
  const visible = first && !detail.isError && !inconsistent;
  return (
    <Modal
      open
      passiveModal
      modalHeading="Statement checkpoint details"
      onRequestClose={close}
      size="lg"
    >
      {detail.isFetching ? (
        <p role="status">Loading native checkpoint entries...</p>
      ) : null}
      {detail.isError || inconsistent ? (
        <p role="alert">
          {detail.error?.message ?? 'Checkpoint pages changed or overlapped.'}{' '}
          The balances and entries are hidden. Close and reopen the checkpoint
          to reload it.
        </p>
      ) : null}
      {detail.error instanceof BillingSessionExpired ? (
        <Button onClick={reconnect}>Reconnect Billing</Button>
      ) : null}
      {visible ? (
        <>
          <h3>{first.checkpoint.name || 'Unnamed checkpoint'}</h3>
          <p>
            {first.checkpoint.journal_id
              ? first.checkpoint.journal_id[1]
              : 'No journal'}{' '}
            · {first.checkpoint.date || 'No posted entries'}
          </p>
          <dl className={styles.totals}>
            <dt>Opening balance</dt>
            <dd>
              {checkpointMoney(
                first.checkpoint.balance_start,
                first.checkpoint,
              )}
            </dd>
            <dt>Computed ending balance</dt>
            <dd>
              {checkpointMoney(first.checkpoint.balance_end, first.checkpoint)}
            </dd>
            <dt>Recorded ending balance</dt>
            <dd>
              {checkpointMoney(
                first.checkpoint.balance_end_real,
                first.checkpoint,
              )}
            </dd>
            <dt>Completeness</dt>
            <dd>{first.checkpoint.is_complete ? 'Complete' : 'Incomplete'}</dd>
            <dt>Continuity</dt>
            <dd>{first.checkpoint.is_valid ? 'Valid' : 'Needs attention'}</dd>
          </dl>
          {first.checkpoint.problem_description ? (
            <p role="status">{first.checkpoint.problem_description}</p>
          ) : null}
          <p>
            Showing {rows.length} of {first.total_count} entries. Native
            balances use all posted entries, not just this page.
          </p>
          <div
            className={styles.tableScroll}
            role="region"
            aria-label="Checkpoint entries"
            tabIndex={0}
          >
            <table>
              <caption>Entries in native statement order</caption>
              <thead>
                <tr>
                  {[
                    'Date',
                    'Entry / label',
                    'Partner',
                    'Amount',
                    'Matching / state',
                    'Ledger',
                  ].map((title) => (
                    <th key={title} scope="col">
                      {title}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td>{row.date}</td>
                    <td>
                      {row.move_id[1]}
                      <br />
                      {row.payment_ref || 'No label'}
                    </td>
                    <td>{row.partner_id ? row.partner_id[1] : 'No partner'}</td>
                    <td>
                      {money(row.amount, row.currency_id[1])}
                      {row.foreign_currency_id ? (
                        <>
                          <br />
                          {money(
                            row.amount_currency,
                            row.foreign_currency_id[1],
                          )}
                        </>
                      ) : null}
                    </td>
                    <td>
                      {row.is_reconciled ? 'Matched' : 'Unmatched'}
                      <br />
                      {row.state}
                    </td>
                    <td>
                      <Button
                        kind="tertiary"
                        disabled={detail.isFetching}
                        onClick={() => openEntry(row.id)}
                      >
                        View entry ledger {row.id}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!rows.length ? <p>This checkpoint has no entries.</p> : null}
          {detail.hasNextPage ? (
            <Button
              disabled={detail.isFetching}
              onClick={() => void detail.fetchNextPage()}
            >
              Load more checkpoint entries
            </Button>
          ) : null}
        </>
      ) : null}
    </Modal>
  );
}
