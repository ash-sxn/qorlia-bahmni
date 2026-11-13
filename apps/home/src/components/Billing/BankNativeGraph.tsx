import styles from './BillingPage.module.scss';
import { BankGraph, BankGraphRow } from './billingService';

const titles: Record<string, string> = {
  'account.bank.statement.line': 'Statement entries',
  'account.move': 'Journal entries, exchange differences and cash-basis tax',
  'account.move.line': 'Journal items and residuals',
  'account.partial.reconcile': 'Partial reconciliations',
  'account.full.reconcile': 'Full reconciliations',
  'account.payment': 'Payments',
  'account.analytic.line': 'Analytic items',
};
const relations: Record<string, string> = {
  move_id: 'account.move',
  journal_id: 'account.journal',
  company_id: 'res.company',
  partner_id: 'res.partner',
  currency_id: 'res.currency',
  foreign_currency_id: 'res.currency',
  payment_id: 'account.payment',
  payment_ids: 'account.payment',
  statement_id: 'account.bank.statement',
  statement_line_id: 'account.bank.statement.line',
  line_ids: 'account.move.line',
  move_line_id: 'account.move.line',
  reversed_entry_id: 'account.move',
  tax_cash_basis_rec_id: 'account.partial.reconcile',
  tax_cash_basis_origin_move_id: 'account.move',
  matched_debit_ids: 'account.partial.reconcile',
  matched_credit_ids: 'account.partial.reconcile',
  full_reconcile_id: 'account.full.reconcile',
  tax_ids: 'account.tax',
  tax_tag_ids: 'account.account.tag',
  tax_repartition_line_id: 'account.tax.repartition.line',
  tax_line_id: 'account.tax',
  group_tax_id: 'account.tax',
  reconcile_model_id: 'account.reconcile.model',
  debit_move_id: 'account.move.line',
  credit_move_id: 'account.move.line',
  exchange_move_id: 'account.move',
  partial_reconcile_ids: 'account.partial.reconcile',
  reconciled_line_ids: 'account.move.line',
};

export function BankNativeGraph({
  before,
  after,
  labels,
  heading,
  purpose = 'matching',
}: {
  before: BankGraph;
  after?: BankGraph;
  labels: Record<string, string>;
  heading: string;
  purpose?: 'matching' | 'checkpoint';
}) {
  const name = (model: string, id: number | string) =>
    labels[`${model}:${id}`] ??
    (typeof id === 'string' ? `New ${model} ${id}` : `${model} #${id}`);
  const value = (model: string, field: string, item: unknown): string => {
    if (item === undefined) return 'Record not present';
    if (item === false) return 'Not set / false';
    if (field === 'analytic_distribution' && typeof item === 'object')
      return (
        Object.entries(item as Record<string, number>)
          .map(
            ([ids, percent]) =>
              `${ids
                .split(',')
                .map((id) => name('account.analytic.account', Number(id)))
                .join(' / ')}: ${percent}%`,
          )
          .join('; ') || 'No analytic allocation'
      );
    const related =
      field === 'account_id'
        ? model === 'account.analytic.line'
          ? 'account.analytic.account'
          : 'account.account'
        : relations[field];
    if (related) {
      if (Array.isArray(item))
        return item.map((id) => name(related, id)).join('; ') || 'None';
      return name(related, item as number | string);
    }
    return typeof item === 'string' ? item || 'Empty text' : String(item);
  };
  return (
    <section aria-label={heading}>
      <h3>{heading}</h3>
      <p>
        All seven native record groups are included, without limiting the review
        to the current search page. Monetary numbers below are exact native
        values. Check each record&apos;s currency and source links, not only its
        amount.{' '}
        {purpose === 'checkpoint'
          ? 'Only statement grouping changes. This complete financial snapshot must remain unchanged.'
          : 'New record labels are temporary until save. Undo can delete generated payments and reverse exchange or cash-basis entries.'}
      </p>
      {Object.entries(before).map(([model, original]) => {
        const proposed = after?.[model];
        const ids = [
          ...new Set([
            ...original.rows.map((row) => row.id),
            ...(proposed?.rows.map((row) => row.id) ?? []),
            ...(proposed?.removed_ids ?? []),
          ]),
        ];
        return (
          <section
            key={model}
            aria-label={titles[model]}
            className={styles.card}
          >
            <h4>{titles[model]}</h4>
            <p>
              {original.rows.length} before
              {proposed
                ? `; ${proposed.rows.length} after; ${proposed.removed_ids.length} deleted`
                : ''}
            </p>
            {ids.length === 0 ? <p>No native records in this group.</p> : null}
            {ids.map((id) => {
              const prior = original.rows.find((row) => row.id === id);
              const next = proposed?.rows.find((row) => row.id === id);
              const deleted =
                proposed?.removed_ids.includes(id as number) ?? false;
              const changed =
                !!after &&
                JSON.stringify(prior?.values) !== JSON.stringify(next?.values);
              const fields = [
                ...new Set([
                  ...Object.keys(prior?.values ?? {}),
                  ...Object.keys(next?.values ?? {}),
                ]),
              ];
              const state = !after
                ? 'Current'
                : deleted
                  ? 'Deleted'
                  : !prior
                    ? 'New'
                    : changed
                      ? 'Changed'
                      : 'Unchanged';
              const cell = (row: BankGraphRow | undefined, field: string) =>
                value(model, field, row?.values[field]);
              return (
                <details key={id} open={changed || deleted}>
                  <summary>
                    {state}: {name(model, id)}
                  </summary>
                  <div
                    className={styles.tableScroll}
                    role="region"
                    aria-label={`${state} ${model} ${id}`}
                    tabIndex={0}
                  >
                    <table>
                      <caption>
                        Complete native fields for {name(model, id)}
                      </caption>
                      <thead>
                        <tr>
                          <th scope="col">Native field</th>
                          <th scope="col">
                            {after ? 'Before' : 'Native value'}
                          </th>
                          {after ? <th scope="col">After</th> : null}
                        </tr>
                      </thead>
                      <tbody>
                        {fields.map((field) => (
                          <tr key={field}>
                            <th scope="row">{field.replaceAll('_', ' ')}</th>
                            <td className={styles.messageBody}>
                              {cell(prior, field)}
                            </td>
                            {after ? (
                              <td className={styles.messageBody}>
                                {deleted ? 'Record deleted' : cell(next, field)}
                              </td>
                            ) : null}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </details>
              );
            })}
          </section>
        );
      })}
    </section>
  );
}
