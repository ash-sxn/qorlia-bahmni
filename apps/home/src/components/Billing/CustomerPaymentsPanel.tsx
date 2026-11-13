import { Button, TextInput } from '@bahmni/design-system';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { money } from './billingFormat';
import styles from './BillingPage.module.scss';
import {
  BillingSessionExpired,
  getCustomerPaymentHistory,
} from './billingService';
import {
  CustomerPaymentDraftEditor,
  pendingCustomerPaymentDraft,
} from './CustomerPaymentDraftEditor';
import {
  PaymentStateModal,
  pendingPaymentState,
  paymentStateLabels,
} from './PaymentStateModal';

export function CustomerPaymentsPanel({
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
  const [editing, setEditing] = useState<number | false | null>(null);
  const [notice, setNotice] = useState('');
  const queryClient = useQueryClient();
  const history = useQuery({
    queryKey: ['billing', 'customer-payments', uid, submitted, state, offset],
    queryFn: () => getCustomerPaymentHistory(submitted, offset, state),
    retry: false,
    refetchOnMount: 'always',
    refetchOnWindowFocus: false,
  });
  let pending = null,
    pendingDraft = null,
    recoveryError = '';
  try {
    pending = pendingPaymentState(uid);
    pendingDraft = pendingCustomerPaymentDraft(uid);
  } catch {
    recoveryError =
      'Payment recovery storage is unavailable or invalid. Ask your Billing administrator to check it before another action.';
  }
  const expired = history.error instanceof BillingSessionExpired;
  return (
    <section className={styles.card} aria-label="Customer payments">
      <h2>Customer payments</h2>
      <p>
        Native payment history includes draft, posted, cancelled and unallocated
        customer payments. Reset and cancellation do not delete the record.
      </p>
      {notice ? <p role="status">{notice}</p> : null}
      {recoveryError ? <p role="alert">{recoveryError}</p> : null}
      {pending ? (
        <Button
          kind="tertiary"
          onClick={() => setSelected(pending!.payment_id)}
        >
          Recover pending payment request
        </Button>
      ) : null}
      {pendingDraft ? (
        <Button
          kind="tertiary"
          onClick={() => setEditing(pendingDraft!.payload.id)}
        >
          Recover pending payment draft save
        </Button>
      ) : null}
      <Button
        disabled={!!pending || !!pendingDraft || !!recoveryError}
        onClick={() => setEditing(false)}
      >
        New customer payment
      </Button>
      <form
        className={styles.toolbar}
        onSubmit={(event) => {
          event.preventDefault();
          setSubmitted(search.trim());
          setOffset(0);
        }}
      >
        <TextInput
          id="customer-payment-search"
          labelText="Payment, customer or reference"
          value={search}
          maxLength={160}
          onChange={(event) => setSearch(event.target.value)}
        />
        <label htmlFor="customer-payment-state">
          Payment state{' '}
          <select
            id="customer-payment-state"
            value={state}
            onChange={(event) => {
              setState(event.target.value);
              setOffset(0);
            }}
          >
            <option value="all">All states</option>
            <option value="draft">Draft</option>
            <option value="posted">Posted</option>
            <option value="cancel">Cancelled</option>
          </select>
        </label>
        <Button type="submit" disabled={history.isFetching}>
          Search payments
        </Button>
        <Button
          kind="tertiary"
          disabled={history.isFetching}
          onClick={() => void history.refetch()}
        >
          Refresh payments
        </Button>
      </form>
      {history.isFetching ? (
        <p role="status">Loading native payment history...</p>
      ) : null}
      {history.isError ? <p role="alert">{history.error.message}</p> : null}
      {expired ? (
        <Button kind="tertiary" onClick={reconnect}>
          Reconnect Billing
        </Button>
      ) : null}
      {history.data && !history.isError ? (
        <>
          <div
            className={styles.tableScroll}
            role="region"
            aria-label="Customer payment history"
            tabIndex={0}
          >
            <table>
              <caption>Saved customer payments</caption>
              <thead>
                <tr>
                  <th>Payment</th>
                  <th>Date</th>
                  <th>Customer</th>
                  <th>Amount</th>
                  <th>Direction</th>
                  <th>Journal / method</th>
                  <th>State</th>
                  <th>Review</th>
                </tr>
              </thead>
              <tbody>
                {history.data.rows.map((row) => (
                  <tr key={row.payment_id}>
                    <td>
                      {row.name}
                      <br />
                      {row.reference}
                    </td>
                    <td>{row.date}</td>
                    <td>{row.customer}</td>
                    <td>{money(row.amount, row.currency[1])}</td>
                    <td>
                      {row.direction === 'inbound'
                        ? 'Received'
                        : 'Paid to customer'}
                    </td>
                    <td>
                      {row.journal}
                      <br />
                      {row.method}
                    </td>
                    <td>{paymentStateLabels[row.state]}</td>
                    <td>
                      <Button
                        kind="tertiary"
                        disabled={
                          history.isFetching ||
                          !!pending ||
                          !!pendingDraft ||
                          !!recoveryError
                        }
                        onClick={() => setSelected(row.payment_id)}
                      >
                        Review payment {row.name}
                      </Button>
                      {row.state === 'draft' ? (
                        <Button
                          kind="tertiary"
                          disabled={
                            history.isFetching ||
                            !!pending ||
                            !!pendingDraft ||
                            !!recoveryError
                          }
                          onClick={() => setEditing(row.payment_id)}
                        >
                          Edit draft {row.name}
                        </Button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!history.data.rows.length ? (
            <p>No customer payments match this search.</p>
          ) : null}
          <div className={styles.toolbar}>
            <Button
              kind="tertiary"
              disabled={history.isFetching || offset === 0}
              onClick={() => setOffset((value) => Math.max(0, value - 25))}
            >
              Previous payment page
            </Button>
            <span>Page {offset / 25 + 1}</span>
            <Button
              kind="tertiary"
              disabled={history.isFetching || !history.data.has_more}
              onClick={() => setOffset((value) => value + 25)}
            >
              Next payment page
            </Button>
          </div>
        </>
      ) : null}
      {editing !== null ? (
        <CustomerPaymentDraftEditor
          key={String(editing)}
          uid={uid}
          paymentId={editing}
          close={() => setEditing(null)}
          reconnect={reconnect}
          completed={() => {
            setEditing(null);
            setNotice(
              'Payment draft save accepted. Reloaded history shows the current native state.',
            );
            void queryClient.invalidateQueries({ queryKey: ['billing'] });
          }}
        />
      ) : null}
      {selected !== null ? (
        <PaymentStateModal
          key={selected}
          uid={uid}
          paymentId={selected}
          close={() => setSelected(null)}
          reconnect={reconnect}
          completed={() => {
            setSelected(null);
            setNotice(
              'Payment action accepted. Reloaded history shows the current native state.',
            );
            void queryClient.invalidateQueries({ queryKey: ['billing'] });
          }}
        />
      ) : null}
    </section>
  );
}
