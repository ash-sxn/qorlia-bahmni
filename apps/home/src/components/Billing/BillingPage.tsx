import { Button, Loading, TextInput } from '@bahmni/design-system';
import { useUserPrivilege } from '@bahmni/widgets';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { FormEvent, useState } from 'react';
import { Link } from 'react-router-dom';
import { HomePageHeader } from '../HomePageHeader';
import styles from './BillingPage.module.scss';
import {
  BillingSessionExpired,
  disconnectBilling,
  getBillingSession,
  getInvoiceLines,
  getInvoices,
  Invoice,
  signInToBilling,
} from './billingService';

const money = (value: number, currency: string) => {
  try {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency,
    }).format(value);
  } catch {
    return `${currency} ${value.toFixed(2)}`;
  }
};
const label = (value: string) => value.replaceAll('_', ' ');

export function BillingPage() {
  const { userPrivileges, error: privilegeError } = useUserPrivilege();
  const ready = userPrivileges !== null && !privilegeError;
  const queryClient = useQueryClient();
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [signInError, setSignInError] = useState('');
  const [signingIn, setSigningIn] = useState(false);
  const [search, setSearch] = useState('');
  const [submittedSearch, setSubmittedSearch] = useState('');
  const [offset, setOffset] = useState(0);
  const [selected, setSelected] = useState<Invoice | null>(null);
  const session = useQuery({
    queryKey: ['billing', 'session'],
    queryFn: getBillingSession,
    enabled: ready,
    retry: false,
    staleTime: 0,
    refetchOnMount: 'always',
  });
  const invoices = useQuery({
    queryKey: [
      'billing',
      'invoices',
      session.data?.uid,
      submittedSearch,
      offset,
    ],
    queryFn: () => getInvoices(submittedSearch, offset),
    enabled:
      ready && !!session.data?.uid && !session.isError && !session.isFetching,
    retry: false,
    refetchOnMount: 'always',
  });
  const lines = useQuery({
    queryKey: ['billing', 'lines', session.data?.uid, selected?.id],
    queryFn: () => getInvoiceLines(selected!.id),
    enabled:
      ready &&
      !!session.data?.uid &&
      !!selected &&
      !session.isError &&
      !session.isFetching,
    retry: false,
    refetchOnMount: 'always',
  });
  const expired =
    session.error instanceof BillingSessionExpired ||
    invoices.error instanceof BillingSessionExpired ||
    lines.error instanceof BillingSessionExpired;

  async function signIn(event: FormEvent) {
    event.preventDefault();
    setSigningIn(true);
    setSignInError('');
    try {
      const result = await signInToBilling(login, password);
      if (!result.uid)
        throw new Error('Check your billing username and password.');
      queryClient.removeQueries({ queryKey: ['billing'] });
      queryClient.setQueryData(['billing', 'session'], result);
      setSelected(null);
      setOffset(0);
    } catch (error) {
      setSignInError(
        error instanceof Error ? error.message : 'Billing sign-in failed.',
      );
    } finally {
      setPassword('');
      setSigningIn(false);
    }
  }

  if (privilegeError)
    return (
      <main className={styles.page} role="alert">
        <p>
          Hospital sign-in could not be verified. Billing has not been opened.
        </p>
        <Link to="/login">Sign in again</Link>
      </main>
    );
  if (!ready) return <Loading />;
  const sessionError = session.error && !expired;
  const loggedIn =
    !!session.data?.uid && !expired && !session.isError && !session.isFetching;
  return (
    <>
      <HomePageHeader />
      <main className={styles.page}>
        <Link to="/home/">Home</Link>
        <p className={styles.eyebrow}>HOSPITAL WORKSPACE</p>
        <h1>Billing</h1>
        <p>
          Review invoices, balances and bill details in your Qorlia workspace.
        </p>
        <p className={styles.note}>
          Connected to the shared billing demo. Clinical uses separate isolated
          staging data. This review screen does not collect payments or change
          invoices.
        </p>
        {session.isFetching ? (
          <p role="status">Connecting to Billing...</p>
        ) : null}
        {sessionError ? (
          <section className={styles.card} role="alert">
            <p>{session.error?.message}</p>
            <Button kind="tertiary" onClick={() => void session.refetch()}>
              Try again
            </Button>
          </section>
        ) : null}
        {!session.isFetching &&
        !session.isPending &&
        !sessionError &&
        !loggedIn ? (
          <section className={styles.card}>
            <h2>Connect your billing account</h2>
            <p>
              Your hospital sign-in is active. Billing uses its own staff
              account and permissions.
            </p>
            {expired ? <p>Please sign in to Billing to continue.</p> : null}
            <form onSubmit={signIn} className={styles.form}>
              <TextInput
                id="billing-username"
                labelText="Billing username"
                autoComplete="username"
                value={login}
                onChange={(event) => setLogin(event.target.value)}
                required
              />
              <TextInput
                id="billing-password"
                labelText="Billing password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
              />
              {signInError ? <p role="alert">{signInError}</p> : null}
              <Button type="submit" disabled={signingIn}>
                {signingIn ? 'Connecting...' : 'Connect Billing'}
              </Button>
            </form>
          </section>
        ) : null}
        {loggedIn ? (
          <>
            <div className={styles.toolbar}>
              <p>Billing account: {session.data?.name}</p>
              <Button
                kind="tertiary"
                onClick={async () => {
                  try {
                    await disconnectBilling();
                    queryClient.removeQueries({ queryKey: ['billing'] });
                    setSelected(null);
                    await session.refetch();
                  } catch {
                    setSignInError(
                      'Could not disconnect Billing. Please try again.',
                    );
                  }
                }}
              >
                Disconnect Billing
              </Button>
            </div>
            {signInError ? <p role="alert">{signInError}</p> : null}
            <section className={styles.card}>
              <h2>Invoices and credit notes</h2>
              <form
                className={styles.toolbar}
                onSubmit={(event) => {
                  event.preventDefault();
                  setSubmittedSearch(search.trim());
                  setOffset(0);
                  setSelected(null);
                }}
              >
                <TextInput
                  id="billing-search"
                  labelText="Find an invoice or customer"
                  type="search"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
                <Button type="submit">Search</Button>
                <Button kind="tertiary" onClick={() => void invoices.refetch()}>
                  Refresh
                </Button>
              </form>
              {invoices.isFetching ? (
                <p role="status">Loading invoices...</p>
              ) : invoices.isError ? (
                <div role="alert">
                  <p>{invoices.error.message}</p>
                  <Button
                    kind="tertiary"
                    onClick={() => void invoices.refetch()}
                  >
                    Try again
                  </Button>
                </div>
              ) : invoices.data?.length === 0 ? (
                <p>
                  No invoices match this search. Draft sales orders are not
                  invoices.
                </p>
              ) : (
                <div className={styles.tableScroll}>
                  <table>
                    <caption>Customer invoices</caption>
                    <thead>
                      <tr>
                        {[
                          'Invoice',
                          'Customer',
                          'Date',
                          'Status',
                          'Payment',
                          'Total',
                          'Balance',
                          'Details',
                        ].map((title) => (
                          <th key={title} scope="col">
                            {title}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {invoices.data?.slice(0, 25).map((invoice) => (
                        <tr key={invoice.id}>
                          <td>{invoice.name}</td>
                          <td>
                            {invoice.partner_id
                              ? invoice.partner_id[1]
                              : 'Not set'}
                          </td>
                          <td>{invoice.invoice_date || 'Not set'}</td>
                          <td>{label(invoice.state)}</td>
                          <td>{label(invoice.payment_state)}</td>
                          <td>
                            {money(
                              invoice.amount_total,
                              invoice.currency_id[1],
                            )}
                          </td>
                          <td>
                            {money(
                              invoice.amount_residual,
                              invoice.currency_id[1],
                            )}
                          </td>
                          <td>
                            <Button
                              kind="ghost"
                              onClick={() => setSelected(invoice)}
                            >
                              View {invoice.name}
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <div className={styles.toolbar}>
                <Button
                  kind="tertiary"
                  disabled={offset === 0 || invoices.isFetching}
                  onClick={() => {
                    setOffset(offset - 25);
                    setSelected(null);
                  }}
                >
                  Previous
                </Button>
                <span>Page {offset / 25 + 1}</span>
                <Button
                  kind="tertiary"
                  disabled={
                    !invoices.data ||
                    invoices.data.length <= 25 ||
                    invoices.isFetching
                  }
                  onClick={() => {
                    setOffset(offset + 25);
                    setSelected(null);
                  }}
                >
                  Next
                </Button>
              </div>
            </section>
            {selected ? (
              <section className={styles.card} aria-label="Invoice details">
                <h2>{selected.name}</h2>
                <p>
                  Customer:{' '}
                  {selected.partner_id ? selected.partner_id[1] : 'Not set'} ·
                  Due: {selected.invoice_date_due || 'Not set'}
                </p>
                <Button kind="tertiary" onClick={() => setSelected(null)}>
                  Close details
                </Button>
                {lines.isFetching ? (
                  <p role="status">Loading bill details...</p>
                ) : lines.isError ? (
                  <div role="alert">
                    <p>{lines.error.message}</p>
                    <Button
                      kind="tertiary"
                      onClick={() => void lines.refetch()}
                    >
                      Try again
                    </Button>
                  </div>
                ) : lines.data?.length === 0 ? (
                  <p>This invoice has no product line items.</p>
                ) : (
                  <div className={styles.tableScroll}>
                    <table>
                      <caption>Bill items</caption>
                      <thead>
                        <tr>
                          <th scope="col">Item</th>
                          <th scope="col">Quantity</th>
                          <th scope="col">Unit price</th>
                          <th scope="col">Subtotal</th>
                        </tr>
                      </thead>
                      <tbody>
                        {lines.data?.slice(0, 500).map((line) => (
                          <tr key={line.id}>
                            <td>{line.name}</td>
                            <td>{line.quantity}</td>
                            <td>
                              {money(line.price_unit, selected.currency_id[1])}
                            </td>
                            <td>
                              {money(
                                line.price_subtotal,
                                selected.currency_id[1],
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {lines.data && lines.data.length > 500 ? (
                      <p>Only the first 500 bill items are shown.</p>
                    ) : null}
                  </div>
                )}
              </section>
            ) : null}
          </>
        ) : null}
      </main>
    </>
  );
}
