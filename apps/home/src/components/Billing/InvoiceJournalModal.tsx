import { Button, Modal } from '@bahmni/design-system';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { invoiceName, money } from './billingFormat';
import styles from './BillingPage.module.scss';
import { BillingSessionExpired, getInvoiceJournal } from './billingService';
import { JournalDetailsEditor } from './JournalDetailsEditor';

export function InvoiceJournalModal({
  uid,
  invoiceId,
  close,
  reconnect,
}: {
  uid: number;
  invoiceId: number;
  close: () => void;
  reconnect: () => void;
}) {
  const [editing, setEditing] = useState<number | null>(null);
  const journal = useInfiniteQuery({
    queryKey: ['billing', 'invoice-journal', uid, invoiceId],
    initialPageParam: {
      after: false as number | false,
      version: false as string | false,
    },
    queryFn: ({ pageParam }) =>
      getInvoiceJournal(invoiceId, pageParam.after, pageParam.version),
    getNextPageParam: (page) =>
      page.next_after === false
        ? undefined
        : { after: page.next_after, version: page.version },
    retry: false,
    refetchOnMount: 'always',
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
  const data = journal.data?.pages[0];
  const rows = journal.data?.pages.flatMap((page) => page.rows) ?? [];
  if (editing !== null)
    return (
      <JournalDetailsEditor
        uid={uid}
        invoiceId={invoiceId}
        lineId={editing}
        close={() => setEditing(null)}
        reconnect={reconnect}
        saved={() => {
          setEditing(null);
          void journal.refetch();
        }}
      />
    );
  return (
    <Modal
      open
      passiveModal
      size="lg"
      modalHeading="Invoice journal items"
      preventCloseOnClickOutside
      onRequestClose={close}
    >
      <section
        className={styles.card}
        aria-label="Invoice journal items"
        aria-busy={journal.isFetching}
      >
        <p>
          Native accounting entries, not just billed products. Debits, credits
          and residuals use the company currency. Reconciliation does not
          establish bank clearance. Draft items offer a separate reviewed detail
          editor. This view does not post or reconcile entries.
        </p>
        {journal.error instanceof BillingSessionExpired ? (
          <div role="alert">
            <p>
              Your Billing session expired. Reconnect to read journal items.
            </p>
            <Button onClick={reconnect}>Reconnect Billing</Button>
          </div>
        ) : journal.isError ? (
          <p role="alert">
            {journal.error.message} Previously loaded rows are hidden until a
            successful reload.
          </p>
        ) : data ? (
          <>
            <h2>{invoiceName({ id: data.invoice_id, name: data.name })}</h2>
            <p>
              {data.state} · {data.journal} · {data.company} · Accounting date:{' '}
              {data.date || 'Not set'}
            </p>
            {data.state !== 'posted' ? (
              <p role="status">
                These entries are {data.state}; they are not a posted customer
                balance.
              </p>
            ) : null}
            <dl className={styles.totals}>
              <dt>Total debit ({data.currency[1]})</dt>
              <dd>{money(data.debit, data.currency[1])}</dd>
              <dt>Total credit ({data.currency[1]})</dt>
              <dd>{money(data.credit, data.currency[1])}</dd>
              <dt>Journal balance</dt>
              <dd>{data.balanced ? 'Balanced' : 'Unbalanced'}</dd>
            </dl>
            {!data.balanced ? (
              <p role="alert">
                The journal does not balance. Ask your Billing administrator to
                review it before posting or recording payments.
              </p>
            ) : null}
            <p>
              Showing {rows.length} of {data.total_count} journal items. Totals
              cover all items, including pages not loaded.
            </p>
            {rows.length ? (
              <>
                <p id="journal-scroll-help">
                  Scroll horizontally to see all journal columns. Focus the
                  table region to scroll with the keyboard.
                </p>
                <div
                  className={styles.tableScroll}
                  role="region"
                  aria-label="Scrollable journal items"
                  aria-describedby="journal-scroll-help"
                  tabIndex={0}
                >
                  <table className={styles.journalTable}>
                    <caption>Native invoice journal items</caption>
                    <thead>
                      <tr>
                        <th scope="col">Account and label</th>
                        <th scope="col">Partner</th>
                        <th scope="col">Dates</th>
                        <th scope="col">Debit ({data.currency[1]})</th>
                        <th scope="col">Credit ({data.currency[1]})</th>
                        <th scope="col">Balance ({data.currency[1]})</th>
                        <th scope="col">Transaction currency</th>
                        <th scope="col">Residual and matching</th>
                        <th scope="col">Taxes and grids</th>
                        {data.state === 'draft' ? (
                          <th scope="col">Draft details</th>
                        ) : null}
                        {data.analytics_visible ? (
                          <th scope="col">Analytic distribution</th>
                        ) : null}
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((row) => (
                        <tr key={row.id}>
                          <th scope="row">
                            {row.account_id ? row.account_id[1] : 'No account'}
                            <br />
                            {row.name || 'No label'}
                            <br />
                            Item #{row.id} ·{' '}
                            {row.qorlia_adjustment_kind || row.display_type}
                          </th>
                          <td>
                            {row.partner_id ? row.partner_id[1] : 'Not set'}
                          </td>
                          <td>
                            {row.date || 'Not set'}
                            <br />
                            Due: {row.date_maturity || 'Not set'}
                          </td>
                          <td>{money(row.debit, data.currency[1])}</td>
                          <td>{money(row.credit, data.currency[1])}</td>
                          <td>{money(row.balance, data.currency[1])}</td>
                          <td>
                            {row.currency_id
                              ? money(row.amount_currency, row.currency_id[1])
                              : 'Not set'}
                          </td>
                          <td>
                            {money(row.amount_residual, data.currency[1])}
                            <br />
                            {row.currency_id
                              ? money(
                                  row.amount_residual_currency,
                                  row.currency_id[1],
                                )
                              : null}
                            <br />
                            {row.reconciled
                              ? 'Reconciled'
                              : 'Not fully reconciled'}
                            <br />
                            Matching: {row.matching_number || 'None'}
                          </td>
                          <td>
                            {row.tax_ids.map((tax) => tax[1]).join(', ') ||
                              'No taxes'}
                            <br />
                            Grids:{' '}
                            {row.tax_tag_ids
                              .map((grid) => grid[1])
                              .join(', ') || 'None'}
                          </td>
                          {data.state === 'draft' ? (
                            <td>
                              {!row.qorlia_adjustment_kind ? (
                                <Button
                                  kind="tertiary"
                                  onClick={() => setEditing(row.id)}
                                >
                                  Edit details for item {row.id}
                                </Button>
                              ) : (
                                'Managed by invoice editor'
                              )}
                            </td>
                          ) : null}
                          {data.analytics_visible ? (
                            <td>
                              {row.analytic_distribution
                                ? Object.entries(row.analytic_distribution)
                                    .map(
                                      ([accounts, percent]) =>
                                        `Accounts ${accounts}: ${percent}%`,
                                    )
                                    .join('; ')
                                : 'Not set'}
                            </td>
                          ) : null}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            ) : (
              <p>No accounting journal items are present.</p>
            )}
            {journal.hasNextPage ? (
              <Button
                disabled={journal.isFetching}
                onClick={() => void journal.fetchNextPage()}
              >
                Load more journal items
              </Button>
            ) : null}
          </>
        ) : null}
        {journal.isFetching ? (
          <p role="status">Reading native journal items...</p>
        ) : null}
        {!(journal.error instanceof BillingSessionExpired) ? (
          <Button
            kind="tertiary"
            disabled={journal.isFetching}
            onClick={() => void journal.refetch()}
          >
            Reload journal items
          </Button>
        ) : null}
        <Button kind="tertiary" onClick={close}>
          Back to invoice
        </Button>
      </section>
    </Modal>
  );
}
