import { Button, Tag, TextInput } from '@bahmni/design-system';
import { useQuery } from '@tanstack/react-query';
import { FormEvent, useState } from 'react';
import { money } from './billingFormat';
import styles from './BillingPage.module.scss';
import {
  BillingSessionExpired,
  getChargeOrders,
  getInvoices,
} from './billingService';
import type { BillTarget } from './BillVisitModal';
import cashier from './CashierPanel.module.scss';

// Native queries return one extra row so the panel knows more exist.
const PAGE_SIZE = 25;

const formatDate = (value: string | false) =>
  value
    ? new Intl.DateTimeFormat('en-IN', {
        dateStyle: 'medium',
        timeZone: 'UTC',
      }).format(new Date(`${value.slice(0, 10)}T00:00:00Z`))
    : 'No date';

type Row = {
  key: string;
  patient: string;
  reference: string;
  date: string | false;
  total: number;
  currency: string;
  status: string;
  action: string;
  target: BillTarget;
};

/**
 * Visit charges that are not a finalised bill yet: quotations synced from
 * Bahmni orders, confirmed orders still to invoice, and draft bills. Billing
 * one moves it to "Bills to collect".
 */
export function ToBillPanel({
  uid,
  bill,
  reconnect,
}: {
  uid: number;
  bill: (target: BillTarget) => void;
  reconnect: () => void;
}) {
  const [search, setSearch] = useState('');
  const [submittedSearch, setSubmittedSearch] = useState('');
  const orders = useQuery({
    queryKey: ['billing', 'cashier-to-bill', uid, submittedSearch],
    queryFn: () => getChargeOrders(submittedSearch, 0, 'toBill'),
    retry: false,
    refetchOnMount: 'always',
  });
  const drafts = useQuery({
    queryKey: ['billing', 'cashier-draft-bills', uid, submittedSearch],
    queryFn: () =>
      getInvoices(submittedSearch, 0, undefined, { draftOnly: true }),
    retry: false,
    refetchOnMount: 'always',
  });

  if (
    orders.error instanceof BillingSessionExpired ||
    drafts.error instanceof BillingSessionExpired
  )
    return (
      <section className={styles.card} role="alert">
        <p>Your Billing session expired. Reconnect to continue.</p>
        <Button kind="tertiary" onClick={reconnect}>
          Reconnect Billing
        </Button>
      </section>
    );

  const rows: Row[] = [
    ...(orders.data ?? []).slice(0, PAGE_SIZE).map(
      (order): Row => ({
        key: `order-${order.id}`,
        patient: order.partner_id ? order.partner_id[1] : 'No patient',
        reference: order.name,
        date: order.date_order,
        total: order.amount_total,
        currency: order.currency_id[1],
        status:
          order.state === 'draft' || order.state === 'sent'
            ? 'New charges'
            : 'Confirmed',
        action: 'Bill',
        target: { kind: 'order', order },
      }),
    ),
    ...(drafts.data ?? []).slice(0, PAGE_SIZE).map(
      (invoice): Row => ({
        key: `invoice-${invoice.id}`,
        patient: invoice.partner_id ? invoice.partner_id[1] : 'No patient',
        reference:
          invoice.name && invoice.name !== '/' ? invoice.name : 'Draft bill',
        date: invoice.invoice_date,
        total: invoice.amount_total,
        currency: invoice.currency_id[1],
        status: 'Draft bill',
        action: 'Finalise',
        target: { kind: 'invoice', invoiceId: invoice.id },
      }),
    ),
  ];
  const hasMore =
    (orders.data?.length ?? 0) > PAGE_SIZE ||
    (drafts.data?.length ?? 0) > PAGE_SIZE;
  const loading = orders.isPending || drafts.isPending;
  const failed = orders.isError || drafts.isError;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setSubmittedSearch(search.trim());
  };

  return (
    <section className={cashier.panel} aria-labelledby="to-bill-heading">
      <div className={cashier.header}>
        <div>
          <h2 id="to-bill-heading">Visits to bill</h2>
          <p className={cashier.subtle}>
            Charges from visits that are not on a finalised bill yet.
          </p>
        </div>
        {!loading && !failed ? (
          <dl className={cashier.summary}>
            <div>
              <dt>To bill</dt>
              <dd>
                {rows.length}
                {hasMore ? '+' : ''}
              </dd>
            </div>
          </dl>
        ) : null}
      </div>

      <form className={cashier.search} onSubmit={submit} role="search">
        <TextInput
          id="to-bill-search"
          labelText="Search patient or visit reference"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <Button type="submit" size="md">
          Search
        </Button>
      </form>

      {loading ? <p role="status">Loading visits...</p> : null}
      {failed ? (
        <div role="alert">
          <p>Visits to bill could not be loaded.</p>
          <Button
            kind="tertiary"
            onClick={() => {
              void orders.refetch();
              void drafts.refetch();
            }}
          >
            Try again
          </Button>
        </div>
      ) : null}
      {!loading && !failed && rows.length === 0 ? (
        <p className={cashier.empty}>
          {submittedSearch
            ? 'No visits to bill match this search.'
            : 'No visits waiting to be billed.'}
        </p>
      ) : null}

      {rows.length ? (
        <div className={styles.tableScroll}>
          <table>
            <caption className={cashier.visuallyHidden}>
              Visits waiting to be billed
            </caption>
            <thead>
              <tr>
                <th scope="col">Patient</th>
                <th scope="col">Reference</th>
                <th scope="col">Date</th>
                <th scope="col" className={cashier.amount}>
                  Amount
                </th>
                <th scope="col">Status</th>
                <th scope="col">
                  <span className={cashier.visuallyHidden}>Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.key}>
                  <td className={cashier.patient}>{row.patient}</td>
                  <td>{row.reference}</td>
                  <td>{formatDate(row.date)}</td>
                  <td className={cashier.amount}>
                    {money(row.total, row.currency)}
                  </td>
                  <td>
                    <Tag
                      type={row.status === 'New charges' ? 'teal' : 'warm-gray'}
                      size="sm"
                    >
                      {row.status}
                    </Tag>
                  </td>
                  <td className={cashier.actions}>
                    <Button
                      size="sm"
                      onClick={() => bill(row.target)}
                      aria-label={`${row.action} ${row.reference} for ${row.patient}`}
                    >
                      {row.action}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      {hasMore ? (
        <p className={cashier.subtle}>
          Showing the most recent {PAGE_SIZE}. Search to find others.
        </p>
      ) : null}
    </section>
  );
}
