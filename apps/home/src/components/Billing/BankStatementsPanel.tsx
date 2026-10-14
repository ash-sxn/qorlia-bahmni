import { Button, Checkbox, Modal, TextInput } from '@bahmni/design-system';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { BankCheckpointEditorModal } from './BankCheckpointEditorModal';
import { BankCheckpointsPanel } from './BankCheckpointsPanel';
import { BankMatchingModal } from './BankMatchingModal';
import { money } from './billingFormat';
import styles from './BillingPage.module.scss';
import {
  BankCheckpointSelection,
  BillingSessionExpired,
  getBankCandidates,
  getBankDetail,
  getBankHistory,
} from './billingService';

export function BankStatementsPanel({
  uid,
  reconnect,
}: {
  uid: number;
  reconnect: () => void;
}) {
  const [search, setSearch] = useState('');
  const [submitted, setSubmitted] = useState('');
  const [state, setState] = useState('all');
  const [offset, setOffset] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [matching, setMatching] = useState(false);
  const [checkpoints, setCheckpoints] = useState(false);
  const [groupIds, setGroupIds] = useState<number[]>([]);
  const [editor, setEditor] = useState<{
    selection: BankCheckpointSelection | null;
  } | null>(null);
  const openCheckpoint = (selection: BankCheckpointSelection | null) => {
    setSelected(null);
    setEditor({ selection });
  };
  const history = useQuery({
    queryKey: ['billing', 'bank-history', uid, submitted, state, offset],
    queryFn: () => getBankHistory(submitted, state, offset),
    retry: false,
    refetchOnMount: 'always',
    refetchOnWindowFocus: false,
    enabled: !checkpoints,
  });
  if (checkpoints)
    return (
      <>
        <Button kind="tertiary" onClick={() => setCheckpoints(false)}>
          Back to statement entries
        </Button>
        <BankCheckpointsPanel
          uid={uid}
          reconnect={reconnect}
          openEntry={(entryId) => {
            setMatching(false);
            setSelected(entryId);
            setCheckpoints(false);
          }}
        />
      </>
    );
  return (
    <section className={styles.card} aria-label="Bank and cash statements">
      <h2>Bank and cash statements</h2>
      <Button
        kind="tertiary"
        onClick={() => {
          setSelected(null);
          setCheckpoints(true);
        }}
      >
        View statement checkpoints
      </Button>
      <p>
        Review recorded statement entries and their native ledgers. A customer
        payment is separate from a bank-statement match. Reading this workspace
        does not change accounting or connect to your bank.
      </p>
      <div className={styles.toolbar}>
        <Button
          disabled={!groupIds.length || history.isFetching || history.isError}
          onClick={() =>
            openCheckpoint({
              checkpoint_id: false,
              entry_ids: groupIds,
              split_line_id: false,
            })
          }
        >
          Create checkpoint from selected transactions
        </Button>
        <Button
          kind="tertiary"
          disabled={!groupIds.length}
          onClick={() => setGroupIds([])}
        >
          Clear checkpoint selection
        </Button>
        <Button kind="tertiary" onClick={() => openCheckpoint(null)}>
          Resume pending checkpoint save
        </Button>
      </div>
      <p>
        Selected checkpoint transactions: {groupIds.join(', ') || 'None'}.
        Selections remain across pages and are cleared when you submit a search
        or change filters. Native Billing requires a contiguous selection from
        one journal.
      </p>
      <form
        className={styles.toolbar}
        onSubmit={(event) => {
          event.preventDefault();
          setSubmitted(search.trim());
          setOffset(0);
          setSelected(null);
          setGroupIds([]);
        }}
      >
        <TextInput
          id="bank-history-search"
          labelText="Statement, entry, partner or label"
          maxLength={160}
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <label htmlFor="bank-history-state">
          Matching state{' '}
          <select
            id="bank-history-state"
            value={state}
            onChange={(event) => {
              setState(event.target.value);
              setOffset(0);
              setSelected(null);
              setGroupIds([]);
            }}
          >
            <option value="all">All entries</option>
            <option value="unmatched">Unmatched</option>
            <option value="matched">Matched</option>
          </select>
        </label>
        <Button type="submit" disabled={history.isFetching}>
          Search statements
        </Button>
        <Button
          kind="tertiary"
          disabled={history.isFetching}
          onClick={() => {
            setSelected(null);
            void history.refetch();
          }}
        >
          Refresh statements
        </Button>
      </form>
      {history.isFetching ? (
        <p role="status">Loading native statement entries...</p>
      ) : null}
      {history.isError ? (
        <p role="alert">
          {history.error.message} Previously loaded entries are hidden until a
          successful reload.
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
            aria-label="Statement entry history"
            tabIndex={0}
          >
            <table>
              <caption>Native bank and cash entries</caption>
              <thead>
                <tr>
                  {[
                    'Checkpoint selection',
                    'Date',
                    'Entry / statement',
                    'Label / partner',
                    'Journal',
                    'Amount',
                    'Foreign amount',
                    'Matching',
                    'Details',
                  ].map((title) => (
                    <th key={title} scope="col">
                      {title}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {history.data.rows.map((row) => (
                  <tr key={row.id}>
                    <td>
                      <Checkbox
                        id={`checkpoint-transaction-${row.id}`}
                        labelText={`Checkpoint transaction ${row.id}`}
                        checked={groupIds.includes(row.id)}
                        disabled={history.isFetching}
                        onChange={(_event, { checked }) =>
                          setGroupIds((ids) =>
                            checked
                              ? [...new Set([...ids, row.id])]
                              : ids.filter((id) => id !== row.id),
                          )
                        }
                      />
                    </td>
                    <td>{row.date}</td>
                    <td>
                      {row.move_id[1]}
                      <br />
                      {row.statement_id
                        ? row.statement_id[1]
                        : 'No statement checkpoint'}
                    </td>
                    <td>
                      {row.payment_ref || 'No label'}
                      <br />
                      {row.partner_id ? row.partner_id[1] : 'No partner'}
                    </td>
                    <td>{row.journal_id[1]}</td>
                    <td>{money(row.amount, row.currency_id[1])}</td>
                    <td>
                      {row.foreign_currency_id
                        ? money(row.amount_currency, row.foreign_currency_id[1])
                        : 'Not applicable'}
                    </td>
                    <td>
                      {row.is_reconciled ? 'Matched' : 'Unmatched'}
                      <br />
                      {row.state}
                    </td>
                    <td>
                      <Button
                        kind="tertiary"
                        disabled={history.isFetching}
                        onClick={() => {
                          setMatching(false);
                          setSelected(row.id);
                        }}
                      >
                        View statement entry {row.id}
                      </Button>
                      <Button
                        kind="tertiary"
                        disabled={history.isFetching}
                        onClick={() =>
                          openCheckpoint({
                            checkpoint_id: false,
                            entry_ids: [row.id],
                            split_line_id: row.id,
                          })
                        }
                      >
                        Split checkpoint at transaction {row.id}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!history.data.rows.length ? (
            <p>
              No statement entries match this search. This does not establish
              bank clearance.
            </p>
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
              Previous statement entries
            </Button>
            <Button
              kind="tertiary"
              disabled={history.isFetching || !history.data.has_more}
              onClick={() => {
                setOffset((value) => value + 25);
                setSelected(null);
              }}
            >
              Next statement entries
            </Button>
          </div>
        </>
      ) : null}
      {selected !== null ? (
        matching ? (
          <BankMatchingModal
            uid={uid}
            entryId={selected}
            close={() => setSelected(null)}
            saved={() => void history.refetch()}
            reconnect={reconnect}
          />
        ) : (
          <BankStatementDetail
            uid={uid}
            entryId={selected}
            close={() => setSelected(null)}
            reconnect={reconnect}
            manage={() => setMatching(true)}
          />
        )
      ) : null}
      {editor ? (
        <BankCheckpointEditorModal
          key={`${uid}:${JSON.stringify(editor.selection)}`}
          uid={uid}
          selection={editor.selection}
          close={() => {
            setEditor(null);
            setGroupIds([]);
          }}
          reconnect={reconnect}
        />
      ) : null}
    </section>
  );
}

function BankStatementDetail({
  uid,
  entryId,
  close,
  reconnect,
  manage,
}: {
  uid: number;
  entryId: number;
  close: () => void;
  reconnect: () => void;
  manage: () => void;
}) {
  const [search, setSearch] = useState('');
  const [submitted, setSubmitted] = useState('');
  const [offset, setOffset] = useState(0);
  const detail = useInfiniteQuery({
    queryKey: ['billing', 'bank-detail', uid, entryId],
    initialPageParam: {
      after: false as number | false,
      version: false as string | false,
    },
    queryFn: ({ pageParam }) =>
      getBankDetail(entryId, pageParam.after, pageParam.version),
    getNextPageParam: (page) =>
      page.next_after === false
        ? undefined
        : { after: page.next_after, version: page.version },
    retry: false,
    refetchOnMount: 'always',
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
  const data = detail.data?.pages[0];
  const candidates = useQuery({
    queryKey: [
      'billing',
      'bank-candidates',
      uid,
      entryId,
      data?.version,
      submitted,
      offset,
    ],
    queryFn: () => getBankCandidates(entryId, data!.version, submitted, offset),
    enabled: !!data && !detail.isError && !data.entry.is_reconciled,
    retry: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
  const rows = detail.data?.pages.flatMap((page) => page.rows) ?? [];
  const expired =
    detail.error instanceof BillingSessionExpired ||
    candidates.error instanceof BillingSessionExpired;
  return (
    <Modal
      open
      passiveModal
      size="lg"
      modalHeading="Statement ledger and possible matches"
      preventCloseOnClickOutside
      onRequestClose={close}
    >
      <section
        className={styles.card}
        aria-label="Statement ledger and possible matches"
      >
        {detail.isFetching ? (
          <p role="status">Loading native statement ledger...</p>
        ) : null}
        {detail.isError ? (
          <p role="alert">
            {detail.error.message} Previously loaded ledger rows are hidden
            until a successful reload.
          </p>
        ) : null}
        {expired ? (
          <Button onClick={reconnect}>Reconnect Billing</Button>
        ) : null}
        {data && !detail.isError ? (
          <>
            <h3>{data.entry.move_id[1]}</h3>
            <p>
              {data.company} · {data.entry.journal_id[1]} · {data.entry.date}
            </p>
            <p>
              Statement amount:{' '}
              {money(data.entry.amount, data.entry.currency_id[1])}. Native
              remaining statement amount:{' '}
              {money(data.entry.amount_residual, data.entry.currency_id[1])}.
            </p>
            <p>
              Company-currency ledger: debit{' '}
              {money(data.debit, data.company_currency[1])}, credit{' '}
              {money(data.credit, data.company_currency[1])}.{' '}
              {data.balanced ? 'Balanced' : 'Unbalanced'}.
            </p>
            <div
              className={styles.tableScroll}
              role="region"
              aria-label="Statement journal items"
              tabIndex={0}
            >
              <table>
                <caption>
                  {rows.length} of {data.total_count} native journal items
                </caption>
                <thead>
                  <tr>
                    {[
                      'Kind / account',
                      'Label / partner',
                      'Debit',
                      'Credit',
                      'Residual',
                      'Transaction amount',
                      'Matching',
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
                      <td>
                        {row.kind}
                        <br />
                        {row.account_id[1]}
                      </td>
                      <td>
                        {row.name || 'No label'}
                        <br />
                        {row.partner_id ? row.partner_id[1] : 'No partner'}
                      </td>
                      <td>{money(row.debit, data.company_currency[1])}</td>
                      <td>{money(row.credit, data.company_currency[1])}</td>
                      <td>
                        {money(row.amount_residual, data.company_currency[1])}
                      </td>
                      <td>
                        {row.currency_id
                          ? money(row.amount_currency, row.currency_id[1])
                          : 'Not set'}
                      </td>
                      <td>
                        {row.reconciled ? 'Reconciled' : 'Not reconciled'}
                        <br />
                        {row.matching_number || 'No matching number'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {detail.hasNextPage ? (
              <Button
                disabled={detail.isFetching}
                onClick={() => void detail.fetchNextPage()}
              >
                Load next ledger page
              </Button>
            ) : null}
            {data.entry.is_reconciled ? (
              <p>This entry is already matched according to native Billing.</p>
            ) : (
              <>
                <h3>Possible native ledger matches</h3>
                <p>
                  These rows follow native account, company and reconciliation
                  rules. They are not automatic recommendations. Matching,
                  partial allocation, fees and undo are available in the
                  separate reviewed matching workspace, subject to native
                  permissions. Reading these candidate rows does not reconcile
                  entries.
                </p>
                <form
                  className={styles.toolbar}
                  onSubmit={(event) => {
                    event.preventDefault();
                    setSubmitted(search.trim());
                    setOffset(0);
                  }}
                >
                  <TextInput
                    id="bank-candidate-search"
                    labelText="Possible match label, document or partner"
                    maxLength={160}
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                  />
                  <Button type="submit" disabled={candidates.isFetching}>
                    Search possible matches
                  </Button>
                </form>
                {candidates.isFetching ? (
                  <p role="status">Loading possible matches...</p>
                ) : null}
                {candidates.isError ? (
                  <p role="alert">
                    {candidates.error.message} Previously loaded possible
                    matches are hidden.
                  </p>
                ) : null}
                {candidates.data && !candidates.isError ? (
                  <>
                    <div
                      className={styles.tableScroll}
                      role="region"
                      aria-label="Possible statement matches"
                      tabIndex={0}
                    >
                      <table>
                        <caption>Native candidate ledger items</caption>
                        <thead>
                          <tr>
                            {[
                              'Document / date',
                              'Account',
                              'Label / partner',
                              'Company-currency residual',
                              'Transaction-currency residual',
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
                              </td>
                              <td>{row.account_id[1]}</td>
                              <td>
                                {row.name || 'No label'}
                                <br />
                                {row.partner_id
                                  ? row.partner_id[1]
                                  : 'No partner'}
                              </td>
                              <td>
                                {money(
                                  row.amount_residual,
                                  data.company_currency[1],
                                )}
                              </td>
                              <td>
                                {row.currency_id
                                  ? money(
                                      row.amount_residual_currency,
                                      row.currency_id[1],
                                    )
                                  : 'Not set'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {!candidates.data.rows.length ? (
                      <p>No native candidate ledger items match this search.</p>
                    ) : null}
                    <div className={styles.toolbar}>
                      <Button
                        kind="tertiary"
                        disabled={candidates.isFetching || offset === 0}
                        onClick={() =>
                          setOffset((value) => Math.max(0, value - 25))
                        }
                      >
                        Previous possible matches
                      </Button>
                      <Button
                        kind="tertiary"
                        disabled={
                          candidates.isFetching || !candidates.data.has_more
                        }
                        onClick={() => setOffset((value) => value + 25)}
                      >
                        Next possible matches
                      </Button>
                    </div>
                  </>
                ) : null}
              </>
            )}
          </>
        ) : null}
        <div className={styles.toolbar}>
          <Button
            disabled={detail.isFetching || detail.isError || !data}
            onClick={manage}
          >
            Review matching and undo
          </Button>
          <Button
            kind="tertiary"
            disabled={detail.isFetching}
            onClick={() => {
              setOffset(0);
              void detail.refetch();
            }}
          >
            Reload statement ledger
          </Button>
          <Button kind="ghost" onClick={close}>
            Back to statements
          </Button>
        </div>
      </section>
    </Modal>
  );
}
