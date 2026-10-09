import {
  Button,
  Loading,
  Tab,
  TabList,
  TabPanel,
  TabPanels,
  Tabs,
  TextInput,
} from '@bahmni/design-system';
import { useUserPrivilege } from '@bahmni/widgets';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { FormEvent, useState } from 'react';
import { Link } from 'react-router-dom';
import { HomePageHeader } from '../HomePageHeader';
import { invoiceName, money } from './billingFormat';
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
import { ChargeOrdersPanel } from './ChargeOrdersPanel';
import { CorrectionWorkflowModal } from './CorrectionWorkflowModal';
import { CreditWorkflowModal } from './CreditWorkflowModal';
import { InvoiceDraftEditor } from './InvoiceDraftEditor';
import { InvoiceWorkflowModal } from './InvoiceWorkflowModal';
import { PaymentWorkflowModal } from './PaymentWorkflowModal';
import { ReversalWorkflowModal } from './ReversalWorkflowModal';

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
  const [tab, setTab] = useState(0);
  const [reviewInvoice, setReviewInvoice] = useState<number | null>(null);
  const [editInvoice, setEditInvoice] = useState<number | false | null>(null);
  const [paymentInvoice, setPaymentInvoice] = useState<number | null>(null);
  const [creditInvoice, setCreditInvoice] = useState<number | null>(null);
  const [reversalInvoice, setReversalInvoice] = useState<number | null>(null);
  const [correctionInvoice, setCorrectionInvoice] = useState<number | null>(
    null,
  );
  const [invoiceNotice, setInvoiceNotice] = useState('');
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
      tab === 0 &&
      ready &&
      !!session.data?.uid &&
      !session.isError &&
      !session.isFetching,
    retry: false,
    refetchOnMount: 'always',
  });
  const lines = useQuery({
    queryKey: ['billing', 'lines', session.data?.uid, selected?.id],
    queryFn: () => getInvoiceLines(selected!.id),
    enabled:
      tab === 0 &&
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
      setReviewInvoice(null);
      setEditInvoice(null);
      setPaymentInvoice(null);
      setCreditInvoice(null);
      setCorrectionInvoice(null);
      setInvoiceNotice('');
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
          Create draft quotations and review invoices and bill details in your
          Qorlia workspace.
        </p>
        <p className={styles.note}>
          Order confirmation follows native Billing settings and may post
          invoices or deliver stock. Manual payment recording uses native
          Billing reconciliation; online payments are not collected here.
          Clinical and Billing have separate test datasets. No patient or order
          synchronization is enabled between them yet.
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
                    setReviewInvoice(null);
                    setPaymentInvoice(null);
                    setCreditInvoice(null);
                    setInvoiceNotice('');
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
            <Tabs
              selectedIndex={tab}
              onChange={({ selectedIndex }) => {
                setTab(selectedIndex);
                setSelected(null);
              }}
            >
              <TabList aria-label="Billing workflows">
                <Tab>Invoices and credit notes</Tab>
                <Tab>Charge orders</Tab>
              </TabList>
              <TabPanels>
                <TabPanel>
                  <section className={styles.card}>
                    <h2>Invoices and credit notes</h2>
                    <Button
                      kind="tertiary"
                      onClick={() => setEditInvoice(false)}
                    >
                      New invoice
                    </Button>
                    {invoiceNotice ? (
                      <p role="status">{invoiceNotice}</p>
                    ) : null}
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
                      <Button
                        kind="tertiary"
                        onClick={() => {
                          setSelected(null);
                          void invoices.refetch();
                        }}
                      >
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
                        No invoices match this search. Draft sales orders are
                        not invoices.
                      </p>
                    ) : (
                      <div className={styles.tableScroll}>
                        <table>
                          <caption>Customer invoices and credit notes</caption>
                          <thead>
                            <tr>
                              {[
                                'Invoice',
                                'Type',
                                'Customer',
                                'Date',
                                'Status',
                                'Payment',
                                'Total',
                                'Open amount',
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
                                <td>{invoiceName(invoice)}</td>
                                <td>
                                  {invoice.move_type === 'out_refund'
                                    ? 'Credit note'
                                    : 'Invoice'}
                                </td>
                                <td>
                                  {invoice.partner_id
                                    ? invoice.partner_id[1]
                                    : 'Not set'}
                                </td>
                                <td>{invoice.invoice_date || 'Not set'}</td>
                                <td>{label(invoice.state)}</td>
                                <td>
                                  {invoice.state === 'posted'
                                    ? label(invoice.payment_state)
                                    : 'Not posted'}
                                </td>
                                <td>
                                  {money(
                                    invoice.invoice_total,
                                    invoice.currency_id[1],
                                  )}
                                </td>
                                <td>
                                  {invoice.state === 'posted'
                                    ? money(
                                        invoice.amount_residual,
                                        invoice.currency_id[1],
                                      )
                                    : 'Not posted'}
                                </td>
                                <td>
                                  <Button
                                    kind="ghost"
                                    onClick={() => setSelected(invoice)}
                                  >
                                    View {invoiceName(invoice)}
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
                    <p className={styles.note}>
                      Drafts are not posted balances. Credit notes reduce billed
                      charges.
                    </p>
                  </section>
                  {selected ? (
                    <section
                      className={styles.card}
                      aria-label="Invoice details"
                    >
                      <h2>{invoiceName(selected)}</h2>
                      <p>
                        {selected.move_type === 'out_refund'
                          ? 'Credit note'
                          : 'Invoice'}{' '}
                        · {label(selected.state)}
                      </p>
                      <p>
                        Customer:{' '}
                        {selected.partner_id
                          ? selected.partner_id[1]
                          : 'Not set'}{' '}
                        · Due: {selected.invoice_date_due || 'Not set'}
                      </p>
                      {selected.ref ? <p>Reference: {selected.ref}</p> : null}
                      <dl className={styles.totals}>
                        <dt>Items after line discounts</dt>
                        <dd>
                          {money(
                            selected.qorlia_item_subtotal,
                            selected.currency_id[1],
                          )}
                        </dd>
                        <dt>Taxes</dt>
                        <dd>
                          {money(selected.amount_tax, selected.currency_id[1])}
                        </dd>
                        <dt>Document discount</dt>
                        <dd>
                          {money(selected.discount, selected.currency_id[1])}
                        </dd>
                        <dt>Rounding adjustment</dt>
                        <dd>
                          {money(
                            selected.round_off_amount,
                            selected.currency_id[1],
                          )}
                        </dd>
                        <dt>Final total</dt>
                        <dd>
                          {money(
                            selected.invoice_total,
                            selected.currency_id[1],
                          )}
                        </dd>
                        <dt>
                          {selected.move_type === 'out_refund'
                            ? 'Unapplied credit'
                            : 'Outstanding amount'}
                        </dt>
                        <dd>
                          {selected.state === 'posted'
                            ? money(
                                selected.amount_residual,
                                selected.currency_id[1],
                              )
                            : 'Not posted'}
                        </dd>
                      </dl>
                      <Button kind="tertiary" onClick={() => setSelected(null)}>
                        Close details
                      </Button>
                      <Button
                        kind="tertiary"
                        onClick={() => setReviewInvoice(selected.id)}
                      >
                        Review invoice posting
                      </Button>
                      {selected.state === 'draft' ? (
                        <Button
                          kind="tertiary"
                          onClick={() => setEditInvoice(selected.id)}
                        >
                          Edit draft{' '}
                          {selected.move_type === 'out_refund'
                            ? 'credit note'
                            : 'invoice'}
                        </Button>
                      ) : null}
                      <Button
                        kind="tertiary"
                        onClick={() => setCorrectionInvoice(selected.id)}
                      >
                        Review invoice correction
                      </Button>
                      {selected.move_type === 'out_invoice' &&
                      selected.state === 'posted' ? (
                        <Button
                          kind="tertiary"
                          onClick={() => setReversalInvoice(selected.id)}
                        >
                          Create credit note
                        </Button>
                      ) : null}
                      <Button
                        kind="tertiary"
                        onClick={() => setPaymentInvoice(selected.id)}
                      >
                        Review payments
                      </Button>
                      <Button
                        kind="tertiary"
                        onClick={() => setCreditInvoice(selected.id)}
                      >
                        Review credit allocation
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
                                <th scope="col">Line discount</th>
                                <th scope="col">Subtotal</th>
                                <th scope="col">Including tax</th>
                              </tr>
                            </thead>
                            <tbody>
                              {lines.data?.slice(0, 500).map((line) => (
                                <tr key={line.id}>
                                  <td>{line.name}</td>
                                  <td>{line.quantity}</td>
                                  <td>
                                    {money(
                                      line.price_unit,
                                      selected.currency_id[1],
                                    )}
                                  </td>
                                  <td>{line.discount}%</td>
                                  <td>
                                    {money(
                                      line.price_subtotal,
                                      selected.currency_id[1],
                                    )}
                                  </td>
                                  <td>
                                    {money(
                                      line.price_total,
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
                </TabPanel>
                <TabPanel>
                  {tab === 1 ? (
                    <ChargeOrdersPanel
                      uid={session.data!.uid as number}
                      openInvoice={(invoice) => {
                        setSelected(invoice);
                        setTab(0);
                      }}
                      reconnect={() => {
                        queryClient.removeQueries({ queryKey: ['billing'] });
                        void session.refetch();
                      }}
                    />
                  ) : null}
                </TabPanel>
              </TabPanels>
            </Tabs>
            {editInvoice !== null ? (
              <InvoiceDraftEditor
                uid={session.data!.uid as number}
                invoiceId={editInvoice}
                close={() => setEditInvoice(null)}
                reconnect={() => {
                  setEditInvoice(null);
                  setSelected(null);
                  setInvoiceNotice('');
                  queryClient.removeQueries({ queryKey: ['billing'] });
                  void session.refetch();
                }}
                saved={(draft) => {
                  setEditInvoice(null);
                  setSelected(null);
                  setInvoiceNotice(
                    `${invoiceName(draft)} draft saved. No payment or credit allocation was recorded.`,
                  );
                  void queryClient.invalidateQueries({
                    predicate: (query) =>
                      query.queryKey[0] === 'billing' &&
                      query.queryKey[1] !== 'session',
                  });
                }}
              />
            ) : null}
            {reviewInvoice !== null ? (
              <InvoiceWorkflowModal
                uid={session.data!.uid as number}
                invoiceId={reviewInvoice}
                close={() => setReviewInvoice(null)}
                reconnect={() => {
                  setReviewInvoice(null);
                  setSelected(null);
                  setInvoiceNotice('');
                  queryClient.removeQueries({ queryKey: ['billing'] });
                  void session.refetch();
                }}
                completed={(invoice) => {
                  setReviewInvoice(null);
                  setSelected(null);
                  setInvoiceNotice(
                    `${invoiceName(invoice)} updated. Current status: ${invoice.state}. Open amount: ${money(invoice.open_amount, invoice.currency[1])}. No payment was recorded.`,
                  );
                  void queryClient.invalidateQueries({
                    predicate: (query) =>
                      query.queryKey[0] === 'billing' &&
                      query.queryKey[1] !== 'session',
                  });
                }}
              />
            ) : null}
            {paymentInvoice !== null ? (
              <PaymentWorkflowModal
                uid={session.data!.uid as number}
                invoiceId={paymentInvoice}
                close={() => setPaymentInvoice(null)}
                reconnect={() => {
                  setPaymentInvoice(null);
                  setSelected(null);
                  setInvoiceNotice('');
                  queryClient.removeQueries({ queryKey: ['billing'] });
                  void session.refetch();
                }}
                completed={(result) => {
                  setPaymentInvoice(null);
                  setSelected(null);
                  setInvoiceNotice(
                    `${invoiceName(result.invoice)} payment recorded. Native status: ${result.invoice.payment_state.replaceAll('_', ' ')}. Open amount: ${money(result.invoice.open_amount, result.invoice.currency[1])}. Check linked payments for the saved entry.`,
                  );
                  void queryClient.invalidateQueries({
                    predicate: (query) =>
                      query.queryKey[0] === 'billing' &&
                      query.queryKey[1] !== 'session',
                  });
                }}
              />
            ) : null}
            {reversalInvoice !== null ? (
              <ReversalWorkflowModal
                uid={session.data!.uid as number}
                invoiceId={reversalInvoice}
                close={() => setReversalInvoice(null)}
                reconnect={() => {
                  setReversalInvoice(null);
                  setSelected(null);
                  setInvoiceNotice('');
                  queryClient.removeQueries({ queryKey: ['billing'] });
                  void session.refetch();
                }}
                completed={(result) => {
                  setReversalInvoice(null);
                  setSelected(null);
                  setInvoiceNotice(
                    `${invoiceName(result.credits[0])} created. Status: ${result.credits[0].state}.${result.scheduled ? ` Scheduled for ${result.effective_date}; the invoice balance is not reduced now.` : ''}${result.replacements.length ? ` Replacement ${invoiceName(result.replacements[0])} is available.` : ''} No money was transferred.`,
                  );
                  void queryClient.invalidateQueries({
                    predicate: (query) =>
                      query.queryKey[0] === 'billing' &&
                      query.queryKey[1] !== 'session',
                  });
                }}
              />
            ) : null}
            {correctionInvoice !== null ? (
              <CorrectionWorkflowModal
                uid={session.data!.uid as number}
                invoiceId={correctionInvoice}
                close={() => setCorrectionInvoice(null)}
                reconnect={() => {
                  setCorrectionInvoice(null);
                  setSelected(null);
                  setInvoiceNotice('');
                  queryClient.removeQueries({ queryKey: ['billing'] });
                  void session.refetch();
                }}
                completed={(invoice, action) => {
                  setCorrectionInvoice(null);
                  setSelected(null);
                  setInvoiceNotice(
                    `${invoiceName(invoice)} ${action === 'reset' ? 'reset to draft' : 'cancelled'}. Current status: ${invoice.state}. No money was transferred. Check allocations before reposting or payment.`,
                  );
                  void queryClient.invalidateQueries({
                    predicate: (query) =>
                      query.queryKey[0] === 'billing' &&
                      query.queryKey[1] !== 'session',
                  });
                }}
              />
            ) : null}
            {creditInvoice !== null ? (
              <CreditWorkflowModal
                uid={session.data!.uid as number}
                invoiceId={creditInvoice}
                close={() => setCreditInvoice(null)}
                reconnect={() => {
                  setCreditInvoice(null);
                  setSelected(null);
                  setInvoiceNotice('');
                  queryClient.removeQueries({ queryKey: ['billing'] });
                  void session.refetch();
                }}
                completed={(invoice, action) => {
                  setCreditInvoice(null);
                  setSelected(null);
                  setInvoiceNotice(
                    `${invoiceName(invoice)} allocation ${action === 'removed' ? 'removed' : 'saved'}. Native status: ${invoice.payment_state.replaceAll('_', ' ')}. Open amount: ${money(invoice.open_amount, invoice.currency[1])}. No new payment was created.`,
                  );
                  void queryClient.invalidateQueries({
                    predicate: (query) =>
                      query.queryKey[0] === 'billing' &&
                      query.queryKey[1] !== 'session',
                  });
                }}
              />
            ) : null}
          </>
        ) : null}
      </main>
    </>
  );
}
