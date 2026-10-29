import { Button, Tag, TextInput } from '@bahmni/design-system';
import { useQuery } from '@tanstack/react-query';
import { FormEvent, useState } from 'react';
import { invoiceName, money } from './billingFormat';
import styles from './BillingPage.module.scss';
import { BillingSessionExpired, getInvoices } from './billingService';
import cashier from './CashierPanel.module.scss';

const PAGE_SIZE = 25;

const formatDate = (value: string | false) =>
  value
    ? new Intl.DateTimeFormat('en-IN', {
        dateStyle: 'medium',
        timeZone: 'UTC',
      }).format(new Date(`${value}T00:00:00Z`))
    : 'No date';

/**
 * The cashier's queue: posted bills that still have money to collect. Payment
 * and printing open the same reviewed native workflows as the Accounting view.
 */
export function CashierPanel({
  uid,
  notice,
  takePayment,
  print,
  reconnect,
}: {
  uid: number;
  notice: string;
  takePayment: (invoiceId: number) => void;
  print: (invoiceId: number) => void;
  reconnect: () => void;
}) {
  const [search, setSearch] = useState('');
  const [submittedSearch, setSubmittedSearch] = useState('');
  const [offset, setOffset] = useState(0);
  const bills = useQuery({
    queryKey: ['billing', 'cashier', uid, submittedSearch, offset],
    queryFn: () =>
      getInvoices(submittedSearch, offset, undefined, { unpaidOnly: true }),
    retry: false,
    refetchOnMount: 'always',
  });

  if (bills.error instanceof BillingSessionExpired)
    return (
      <section className={styles.card} role="alert">
        <p>Your Billing session expired. Reconnect to continue.</p>
        <Button kind="tertiary" onClick={reconnect}>
          Reconnect Billing
        </Button>
      </section>
    );

  const rows = bills.data?.slice(0, PAGE_SIZE) ?? [];
  const hasMore = (bills.data?.length ?? 0) > PAGE_SIZE;
  const currencies = new Set(rows.map((bill) => bill.currency_id[1]));
  const singleCurrency = currencies.size === 1 ? [...currencies][0] : null;
  const totalDue = rows.reduce((sum, bill) => sum + bill.amount_residual, 0);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setOffset(0);
    setSubmittedSearch(search.trim());
  };

  return (
    <section className={cashier.panel} aria-labelledby="cashier-heading">
      <div className={cashier.header}>
        <div>
          <h2 id="cashier-heading">Bills to collect</h2>
          <p className={cashier.subtle}>
            Finalised bills with an amount still due.
          </p>
        </div>
        {bills.isSuccess ? (
          <dl className={cashier.summary}>
            <div>
              <dt>Waiting</dt>
              <dd>
                {rows.length}
                {hasMore ? '+' : ''}
              </dd>
            </div>
            <div>
              <dt>Due{hasMore ? ' on this page' : ''}</dt>
              <dd>
                {singleCurrency
                  ? money(totalDue, singleCurrency)
                  : rows.length
                    ? 'Mixed currencies'
                    : money(0, 'INR')}
              </dd>
            </div>
          </dl>
        ) : null}
      </div>

      {notice ? (
        <p className={cashier.notice} role="status">
          {notice}
        </p>
      ) : null}

      <form className={cashier.search} onSubmit={submit} role="search">
        <TextInput
          id="cashier-search"
          labelText="Search patient or bill number"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <Button type="submit" size="md">
          Search
        </Button>
      </form>

      {bills.isPending ? <p role="status">Loading bills...</p> : null}
      {bills.isError ? (
        <div role="alert">
          <p>Bills could not be loaded.</p>
          <Button kind="tertiary" onClick={() => void bills.refetch()}>
            Try again
          </Button>
        </div>
      ) : null}
      {bills.isSuccess && rows.length === 0 ? (
        <p className={cashier.empty}>
          {submittedSearch
            ? 'No bills waiting for payment match this search.'
            : 'No bills waiting for payment.'}
        </p>
      ) : null}

      {rows.length ? (
        <div className={styles.tableScroll}>
          <table>
            <caption className={cashier.visuallyHidden}>
              Bills waiting for payment
            </caption>
            <thead>
              <tr>
                <th scope="col">Patient</th>
                <th scope="col">Bill</th>
                <th scope="col">Date</th>
                <th scope="col" className={cashier.amount}>
                  Total
                </th>
                <th scope="col" className={cashier.amount}>
                  Due
                </th>
                <th scope="col">Status</th>
                <th scope="col">
                  <span className={cashier.visuallyHidden}>Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((bill) => {
                const name = invoiceName(bill);
                return (
                  <tr key={bill.id}>
                    <td className={cashier.patient}>
                      {bill.partner_id ? bill.partner_id[1] : 'No patient'}
                    </td>
                    <td>{name}</td>
                    <td>{formatDate(bill.invoice_date)}</td>
                    <td className={cashier.amount}>
                      {money(bill.amount_total, bill.currency_id[1])}
                    </td>
                    <td className={`${cashier.amount} ${cashier.due}`}>
                      {money(bill.amount_residual, bill.currency_id[1])}
                    </td>
                    <td>
                      {bill.payment_state === 'partial' ? (
                        <Tag type="blue" size="sm">
                          Part paid
                        </Tag>
                      ) : (
                        <Tag type="warm-gray" size="sm">
                          Unpaid
                        </Tag>
                      )}
                    </td>
                    <td className={cashier.actions}>
                      <Button
                        size="sm"
                        onClick={() => takePayment(bill.id)}
                        aria-label={`Take payment for ${name}`}
                      >
                        Take payment
                      </Button>
                      <Button
                        size="sm"
                        kind="ghost"
                        onClick={() => print(bill.id)}
                        aria-label={`Print ${name}`}
                      >
                        Print
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}

      {offset > 0 || hasMore ? (
        <div className={cashier.pager}>
          <Button
            kind="tertiary"
            size="sm"
            disabled={offset === 0}
            onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
          >
            Previous
          </Button>
          <Button
            kind="tertiary"
            size="sm"
            disabled={!hasMore}
            onClick={() => setOffset(offset + PAGE_SIZE)}
          >
            Next
          </Button>
        </div>
      ) : null}
    </section>
  );
}
