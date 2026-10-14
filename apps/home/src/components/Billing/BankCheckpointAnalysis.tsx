import { Button, TextInput } from '@bahmni/design-system';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { money } from './billingFormat';
import styles from './BillingPage.module.scss';
import {
  BillingSessionExpired,
  CheckpointAnalysisFilters,
  CheckpointAnalysisRow,
  checkpointAnalysisPeriods,
  getCheckpointAnalysis,
} from './billingService';

const measures = {
  count: 'Checkpoint count',
  balance_start: 'Opening balance',
  balance_end: 'Computed ending balance',
  balance_end_real: 'Recorded ending balance',
};
type Measure = keyof typeof measures;
const journalKey = (row: CheckpointAnalysisRow) =>
  String(row.journal_id ? row.journal_id[0] : false);
const periodKey = (row: CheckpointAnalysisRow) =>
  String(row.period_from || false);
const journalName = (row: CheckpointAnalysisRow) =>
  row.journal_id ? row.journal_id[1] : 'No journal';
const valueLabel = (
  value: number,
  row: CheckpointAnalysisRow,
  measure: Measure,
) =>
  measure === 'count'
    ? String(value)
    : row.currency_id
      ? money(value, row.currency_id[1])
      : `${value} (no journal currency)`;

export function BankCheckpointAnalysis({
  uid,
  search,
  state,
  journalType,
  reconnect,
}: {
  uid: number;
  search: string;
  state: string;
  journalType: string;
  reconnect: () => void;
}) {
  const [draft, setDraft] = useState<CheckpointAnalysisFilters>({
    search,
    state,
    journal_type: journalType,
    period: 'month',
    date_from: false,
    date_to: false,
  });
  const [filters, setFilters] = useState(draft);
  const changeDraft = (
    field: keyof CheckpointAnalysisFilters,
    value: string,
  ) => {
    const next =
      field === 'date_from' || field === 'date_to' ? value || false : value;
    setDraft((prior) => ({ ...prior, [field]: next }));
  };
  const [view, setView] = useState<'pivot' | 'graph'>('pivot');
  const [transposed, setTransposed] = useState(false);
  const [measure, setMeasure] = useState<Measure>('balance_end');
  const result = useQuery({
    queryKey: ['billing', 'checkpoint-analysis', uid, filters],
    queryFn: () => getCheckpointAnalysis(filters),
    retry: false,
    refetchOnMount: 'always',
    refetchOnWindowFocus: false,
  });
  const rows = result.data?.rows ?? [];
  const journals = [
    ...new Map(rows.map((row) => [journalKey(row), row])).values(),
  ];
  const periods = [
    ...new Map(rows.map((row) => [periodKey(row), row])).values(),
  ];
  const cells = new Map(
    rows.map((row) => [JSON.stringify([journalKey(row), periodKey(row)]), row]),
  );
  const columns = transposed ? periods : journals;
  const pivotRows = transposed ? journals : periods;
  const columnKey = transposed ? periodKey : journalKey;
  const rowKey = transposed ? journalKey : periodKey;
  const journalTotals = new Map<string, number>();
  for (const row of rows) {
    const key = journalKey(row);
    journalTotals.set(key, (journalTotals.get(key) ?? 0) + row[measure]);
  }
  return (
    <section className={styles.card} aria-label="Statement checkpoint analysis">
      <h2>Statement checkpoint analysis</h2>
      <p>
        Native sums of recorded checkpoint balances, not bank cash flow or the
        current closing balance. Journals and currencies stay separate. Empty
        checkpoints have no invented currency. No sample figures are shown.
      </p>
      <form
        className={styles.toolbar}
        onSubmit={(event) => {
          event.preventDefault();
          setFilters({ ...draft, search: draft.search.trim() });
        }}
      >
        <TextInput
          id="analysis-search"
          labelText="Statement, external reference or journal"
          value={draft.search}
          maxLength={160}
          onChange={(event) => changeDraft('search', event.target.value)}
        />
        <label className={styles.select} htmlFor="analysis-state">
          Checkpoint status
          <select
            id="analysis-state"
            value={draft.state}
            onChange={(event) => changeDraft('state', event.target.value)}
          >
            <option value="all">All checkpoints</option>
            <option value="invalid">Needs attention</option>
            <option value="empty">Empty checkpoints</option>
          </select>
        </label>
        <label className={styles.select} htmlFor="analysis-journal">
          Journal type
          <select
            id="analysis-journal"
            value={draft.journal_type}
            onChange={(event) =>
              changeDraft('journal_type', event.target.value)
            }
          >
            <option value="all">Bank and cash</option>
            <option value="bank">Bank</option>
            <option value="cash">Cash</option>
          </select>
        </label>
        <label className={styles.select} htmlFor="analysis-period">
          Group by
          <select
            id="analysis-period"
            value={draft.period}
            onChange={(event) => changeDraft('period', event.target.value)}
          >
            {checkpointAnalysisPeriods.map((period) => (
              <option value={period} key={period}>
                {period === 'journal'
                  ? 'Journal only'
                  : period[0].toUpperCase() + period.slice(1)}
              </option>
            ))}
          </select>
        </label>
        <TextInput
          id="analysis-from"
          type="date"
          labelText="From posted date"
          value={draft.date_from || ''}
          onChange={(event) => changeDraft('date_from', event.target.value)}
          onInput={(event) =>
            changeDraft('date_from', event.currentTarget.value)
          }
        />
        <TextInput
          id="analysis-to"
          type="date"
          labelText="Through posted date"
          value={draft.date_to || ''}
          onChange={(event) => changeDraft('date_to', event.target.value)}
          onInput={(event) => changeDraft('date_to', event.currentTarget.value)}
        />
        <Button type="submit" disabled={result.isFetching}>
          Apply analysis filters
        </Button>
        <Button
          kind="tertiary"
          disabled={result.isFetching}
          onClick={() => void result.refetch()}
        >
          Refresh analysis
        </Button>
      </form>
      <div className={styles.toolbar}>
        <Button
          kind={view === 'pivot' ? 'primary' : 'tertiary'}
          aria-pressed={view === 'pivot'}
          onClick={() => setView('pivot')}
        >
          Pivot
        </Button>
        <Button
          kind={view === 'graph' ? 'primary' : 'tertiary'}
          aria-pressed={view === 'graph'}
          onClick={() => setView('graph')}
        >
          Graph
        </Button>
        {view === 'pivot' ? (
          <Button
            kind="tertiary"
            aria-pressed={transposed}
            disabled={result.isFetching || result.isError || !rows.length}
            onClick={() => setTransposed((prior) => !prior)}
          >
            Flip pivot axes
          </Button>
        ) : null}
        <label className={styles.select} htmlFor="analysis-measure">
          Measure
          <select
            id="analysis-measure"
            value={measure}
            onChange={(event) => setMeasure(event.target.value as Measure)}
          >
            {Object.entries(measures).map(([key, label]) => (
              <option value={key} key={key}>
                {label}
              </option>
            ))}
          </select>
        </label>
      </div>
      {result.isFetching ? (
        <p role="status">Loading complete native checkpoint aggregates...</p>
      ) : null}
      {result.isError ? (
        <p role="alert">
          {result.error instanceof BillingSessionExpired
            ? 'Your Billing session expired.'
            : result.error.message}{' '}
          Previous analysis is hidden until a successful reload.
        </p>
      ) : null}
      {result.error instanceof BillingSessionExpired ? (
        <Button onClick={reconnect}>Reconnect Billing</Button>
      ) : null}
      {result.data && !result.isFetching && !result.isError ? (
        <>
          <p>
            {result.data.total_count}{' '}
            {result.data.total_count === 1 ? 'checkpoint' : 'checkpoints'} in{' '}
            {rows.length} native journal/period{' '}
            {rows.length === 1 ? 'group' : 'groups'}. All matching checkpoints
            are included, not just the history page.
          </p>
          {!rows.length ? (
            <p>No checkpoints match these analysis filters.</p>
          ) : view === 'pivot' ? (
            <div
              className={styles.tableScroll}
              role="region"
              aria-label="Checkpoint pivot"
              tabIndex={0}
            >
              <table>
                <caption>
                  {measures[measure]} by{' '}
                  {transposed ? 'journal and period' : 'period and journal'}
                </caption>
                <thead>
                  <tr>
                    <th scope="col">{transposed ? 'Journal' : 'Period'}</th>
                    {columns.map((row) => (
                      <th scope="col" key={columnKey(row)}>
                        {transposed ? row.period_label : journalName(row)}
                        {!transposed ? (
                          <>
                            <br />
                            {row.currency_id
                              ? row.currency_id[1]
                              : 'No journal currency'}
                          </>
                        ) : null}
                      </th>
                    ))}
                    {transposed ? (
                      <th scope="col">Sum of checkpoint values</th>
                    ) : null}
                  </tr>
                </thead>
                <tbody>
                  {pivotRows.map((group) => (
                    <tr key={rowKey(group)}>
                      <th scope="row">
                        {transposed ? journalName(group) : group.period_label}
                        {transposed ? (
                          <>
                            <br />
                            {group.currency_id
                              ? group.currency_id[1]
                              : 'No journal currency'}
                          </>
                        ) : null}
                      </th>
                      {columns.map((column) => {
                        const journal = transposed ? group : column;
                        const period = transposed ? column : group;
                        const row = cells.get(
                          JSON.stringify([
                            journalKey(journal),
                            periodKey(period),
                          ]),
                        );
                        return (
                          <td key={columnKey(column)}>
                            {row
                              ? valueLabel(row[measure], row, measure)
                              : 'No checkpoints'}
                          </td>
                        );
                      })}
                      {transposed ? (
                        <td>
                          {valueLabel(
                            journalTotals.get(journalKey(group)) ?? 0,
                            group,
                            measure,
                          )}
                        </td>
                      ) : null}
                    </tr>
                  ))}
                </tbody>
                {!transposed ? (
                  <tfoot>
                    <tr>
                      <th scope="row">Sum of checkpoint values</th>
                      {journals.map((journal) => (
                        <td key={journalKey(journal)}>
                          {valueLabel(
                            journalTotals.get(journalKey(journal)) ?? 0,
                            journal,
                            measure,
                          )}
                        </td>
                      ))}
                    </tr>
                  </tfoot>
                ) : null}
              </table>
            </div>
          ) : (
            <div aria-label="Checkpoint graph">
              <p>
                Each journal uses its own symmetric scale. Bars left of the
                centre are negative; bars right are positive. Numeric values
                remain available below.
              </p>
              {journals.map((journal) => {
                const series = rows.filter(
                  (row) => journalKey(row) === journalKey(journal),
                );
                const maximum = series.reduce(
                  (max, row) => Math.max(max, Math.abs(row[measure])),
                  1,
                );
                return (
                  <section
                    key={journalKey(journal)}
                    aria-label={journalName(journal)}
                  >
                    <h3>
                      {journalName(journal)} (
                      {journal.currency_id
                        ? journal.currency_id[1]
                        : 'No journal currency'}
                      )
                    </h3>
                    <ul className={styles.checkpointGraph}>
                      {series.map((row) => {
                        const value = row[measure],
                          width = (Math.abs(value) / maximum) * 95;
                        return (
                          <li key={periodKey(row)}>
                            <span>{row.period_label}</span>
                            <svg
                              viewBox="0 0 200 18"
                              role="img"
                              aria-label={`${measures[measure]}: ${valueLabel(value, row, measure)}`}
                            >
                              <line x1="100" y1="0" x2="100" y2="18" />
                              <rect
                                className={
                                  value < 0
                                    ? styles.negativeBar
                                    : styles.positiveBar
                                }
                                x={value < 0 ? 100 - width : 100}
                                y="4"
                                width={width}
                                height="10"
                              />
                            </svg>
                            <span>{valueLabel(value, row, measure)}</span>
                          </li>
                        );
                      })}
                    </ul>
                  </section>
                );
              })}
            </div>
          )}
        </>
      ) : null}
    </section>
  );
}
