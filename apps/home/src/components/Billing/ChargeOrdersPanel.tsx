import { Button, TextInput } from '@bahmni/design-system';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { invoiceName, money } from './billingFormat';
import styles from './BillingPage.module.scss';
import {
  BillingSessionExpired,
  ChargeOrder,
  getChargeOrderLines,
  getChargeOrders,
  getInvoices,
  Invoice,
} from './billingService';
import { DraftOrderEditor } from './DraftOrderEditor';
import { BillingReportsModal } from './InvoiceReportsModal';
import { OrderWorkflowModal } from './OrderWorkflowModal';

const orderState = {
  draft: 'Draft',
  sent: 'Sent',
  sale: 'Confirmed',
  done: 'Locked',
  cancel: 'Cancelled',
};
const invoiceState = {
  upselling: 'Upselling',
  invoiced: 'Fully invoiced',
  'to invoice': 'To invoice',
  no: 'Not invoiced',
};

export function ChargeOrdersPanel({
  uid,
  openInvoice,
  reconnect,
}: {
  uid: number;
  openInvoice: (invoice: Invoice) => void;
  reconnect: () => void;
}) {
  const [search, setSearch] = useState('');
  const [submittedSearch, setSubmittedSearch] = useState('');
  const [status, setStatus] = useState<'draft' | 'confirmed' | 'all'>('draft');
  const [offset, setOffset] = useState(0);
  const [selected, setSelected] = useState<ChargeOrder | null>(null);
  const [editing, setEditing] = useState<number | false | null>(null);
  const [notice, setNotice] = useState('');
  const [workflow, setWorkflow] = useState<number | null>(null);
  const [reportOrder, setReportOrder] = useState<number | null>(null);
  const queryClient = useQueryClient();
  const orders = useQuery({
    queryKey: [
      'billing',
      'charge-orders',
      uid,
      submittedSearch,
      status,
      offset,
    ],
    queryFn: () => getChargeOrders(submittedSearch, offset, status),
    retry: false,
    refetchOnMount: 'always',
  });
  const lines = useQuery({
    queryKey: ['billing', 'charge-lines', uid, selected?.id],
    queryFn: () => getChargeOrderLines(selected!.id),
    enabled: !!selected,
    retry: false,
    refetchOnMount: 'always',
  });
  const invoices = useQuery({
    queryKey: [
      'billing',
      'order-invoices',
      uid,
      selected?.id,
      selected?.invoice_ids,
    ],
    queryFn: () => getInvoices('', 0, selected!.invoice_ids),
    enabled: !!selected?.invoice_ids.length,
    retry: false,
    refetchOnMount: 'always',
  });
  const expired = [orders.error, lines.error, invoices.error].some(
    (error) => error instanceof BillingSessionExpired,
  );
  if (expired)
    return (
      <section className={styles.card} role="alert">
        <p>Your Billing session expired. Reconnect to continue.</p>
        <Button kind="tertiary" onClick={reconnect}>
          Reconnect Billing
        </Button>
      </section>
    );
  if (reportOrder !== null)
    return (
      <BillingReportsModal
        uid={uid}
        kind="order"
        recordId={reportOrder}
        close={() => setReportOrder(null)}
        reconnect={reconnect}
      />
    );
  if (editing !== null)
    return (
      <DraftOrderEditor
        uid={uid}
        orderId={editing}
        close={() => setEditing(null)}
        reconnect={reconnect}
        saved={(draft) => {
          setEditing(null);
          setSelected(null);
          setOffset(0);
          setSubmittedSearch('');
          setSearch('');
          setStatus('draft');
          setNotice(`${draft.name} saved as a draft quotation.`);
          void queryClient.invalidateQueries({
            predicate: ({ queryKey }) =>
              queryKey[0] === 'billing' &&
              ['charge-orders', 'charge-lines', 'draft'].includes(
                String(queryKey[1]),
              ),
          });
        }}
      />
    );

  return (
    <>
      {workflow !== null ? (
        <OrderWorkflowModal
          key={workflow}
          uid={uid}
          orderId={workflow}
          close={() => setWorkflow(null)}
          reconnect={reconnect}
          completed={(result) => {
            setWorkflow(null);
            setSelected(null);
            setStatus('all');
            setOffset(0);
            setSearch(result.name);
            setSubmittedSearch(result.name);
            setNotice(
              `${result.name} updated. Current status: ${result.state === 'sale' ? 'Confirmed' : result.state === 'done' ? 'Locked' : result.state}. Linked invoices: ${result.invoices.map((invoice) => `${invoiceName(invoice)} (${invoice.state})`).join(', ') || 'None'}. No payment was recorded.`,
            );
            void queryClient.invalidateQueries({
              predicate: ({ queryKey }) =>
                queryKey[0] === 'billing' &&
                [
                  'charge-orders',
                  'charge-lines',
                  'draft',
                  'order-workflow',
                  'order-invoices',
                  'invoices',
                  'invoice-lines',
                ].includes(String(queryKey[1])),
            });
          }}
        />
      ) : null}
      <section className={styles.card}>
        <h2>Charge orders</h2>
        <p>
          A draft charge order is a quotation, not an issued invoice or payment.
        </p>
        {notice ? <p role="status">{notice}</p> : null}
        <Button
          onClick={() => {
            setNotice('');
            setEditing(false);
          }}
        >
          New draft quotation
        </Button>
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
            id="charge-search"
            labelText="Find an order, customer or reference"
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <label className={styles.select}>
            Order status
            <select
              value={status}
              onChange={(event) => {
                setStatus(event.target.value as typeof status);
                setOffset(0);
                setSelected(null);
              }}
            >
              <option value="draft">Draft and sent quotations</option>
              <option value="confirmed">Confirmed and locked orders</option>
              <option value="all">All, including cancelled</option>
            </select>
          </label>
          <Button type="submit">Search orders</Button>
          <Button
            kind="tertiary"
            onClick={() => {
              setSelected(null);
              void orders.refetch();
            }}
          >
            Refresh orders
          </Button>
        </form>
        {orders.isFetching ? (
          <p role="status">Loading charge orders...</p>
        ) : orders.isError ? (
          <div role="alert">
            <p>{orders.error.message}</p>
            <Button kind="tertiary" onClick={() => void orders.refetch()}>
              Try again
            </Button>
          </div>
        ) : orders.data?.length === 0 ? (
          <p>No charge orders match these filters.</p>
        ) : (
          <div className={styles.tableScroll}>
            <table>
              <caption>Patient charge orders</caption>
              <thead>
                <tr>
                  {[
                    'Order',
                    'Customer',
                    'Shop',
                    'Care setting',
                    'Ordered (UTC)',
                    'Status',
                    'Invoicing',
                    'Total',
                    'Details',
                  ].map((title) => (
                    <th key={title} scope="col">
                      {title}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {orders.data?.slice(0, 25).map((order) => (
                  <tr key={order.id}>
                    <td>
                      {order.name}
                      {order.client_order_ref ? (
                        <small className={styles.reference}>
                          {order.client_order_ref}
                        </small>
                      ) : null}
                    </td>
                    <td>
                      {order.partner_id ? order.partner_id[1] : 'Not set'}
                    </td>
                    <td>{order.shop_id ? order.shop_id[1] : 'Not set'}</td>
                    <td>
                      {order.care_setting
                        ? order.care_setting.toUpperCase()
                        : 'Not set'}
                    </td>
                    <td>{order.date_order}</td>
                    <td>{orderState[order.state]}</td>
                    <td>{invoiceState[order.invoice_status]}</td>
                    <td>{money(order.amount_total, order.currency_id[1])}</td>
                    <td>
                      <Button kind="ghost" onClick={() => setSelected(order)}>
                        View order {order.name}
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
            disabled={offset === 0 || orders.isFetching || orders.isError}
            onClick={() => {
              setOffset(offset - 25);
              setSelected(null);
            }}
          >
            Previous orders
          </Button>
          <span>Page {offset / 25 + 1}</span>
          <Button
            kind="tertiary"
            disabled={
              !orders.data ||
              orders.data.length <= 25 ||
              orders.isFetching ||
              orders.isError
            }
            onClick={() => {
              setOffset(offset + 25);
              setSelected(null);
            }}
          >
            Next orders
          </Button>
        </div>
      </section>
      {selected ? (
        <section className={styles.card} aria-label="Charge order details">
          <h2>{selected.name}</h2>
          <p>
            {orderState[selected.state]} ·{' '}
            {invoiceState[selected.invoice_status]}
          </p>
          <p>
            Customer: {selected.partner_id ? selected.partner_id[1] : 'Not set'}
          </p>
          <p>
            Shop: {selected.shop_id ? selected.shop_id[1] : 'Not set'} · Care
            setting:{' '}
            {selected.care_setting
              ? selected.care_setting.toUpperCase()
              : 'Not set'}
          </p>
          {selected.client_order_ref ? (
            <p>Reference: {selected.client_order_ref}</p>
          ) : null}
          {selected.provider_name ? (
            <p>Provider: {selected.provider_name}</p>
          ) : null}
          <p>Ordered (UTC): {selected.date_order}</p>
          <dl className={styles.totals}>
            <dt>Items after line discounts</dt>
            <dd>{money(selected.amount_untaxed, selected.currency_id[1])}</dd>
            <dt>Taxes</dt>
            <dd>{money(selected.amount_tax, selected.currency_id[1])}</dd>
            <dt>Document discount</dt>
            <dd>
              {money(selected.discount, selected.currency_id[1])}
              {selected.discount_type === 'percentage'
                ? ` (${selected.discount_percentage}%)`
                : ''}
            </dd>
            {selected.disc_acc_id ? (
              <>
                <dt>Discount account</dt>
                <dd>{selected.disc_acc_id[1]}</dd>
              </>
            ) : null}
            {selected.chargeable_amount > 0 ? (
              <>
                <dt>Chargeable amount override</dt>
                <dd>
                  {money(selected.chargeable_amount, selected.currency_id[1])}
                </dd>
              </>
            ) : null}
            <dt>Rounding adjustment</dt>
            <dd>{money(selected.round_off_amount, selected.currency_id[1])}</dd>
            <dt>Final order total</dt>
            <dd>{money(selected.amount_total, selected.currency_id[1])}</dd>
          </dl>
          <Button kind="tertiary" onClick={() => setSelected(null)}>
            Close order details
          </Button>
          <Button kind="tertiary" onClick={() => setWorkflow(selected.id)}>
            Review order actions
          </Button>
          <Button kind="tertiary" onClick={() => setReportOrder(selected.id)}>
            Quotation and order PDF reports
          </Button>
          {['draft', 'sent'].includes(selected.state) &&
          !selected.invoice_ids.length ? (
            <Button kind="tertiary" onClick={() => setEditing(selected.id)}>
              Edit draft quotation
            </Button>
          ) : null}
          {lines.isFetching ? (
            <p role="status">Loading order items...</p>
          ) : lines.isError ? (
            <div role="alert">
              <p>{lines.error.message}</p>
              <Button kind="tertiary" onClick={() => void lines.refetch()}>
                Retry order items
              </Button>
            </div>
          ) : lines.data?.length === 0 ? (
            <p>This order has no line items.</p>
          ) : (
            <div className={styles.tableScroll}>
              <table>
                <caption>Charge order items</caption>
                <thead>
                  <tr>
                    {[
                      'Item',
                      'Quantity',
                      'Unit',
                      'Unit price',
                      'Line discount',
                      'Subtotal',
                      'Taxes',
                      'Including tax',
                      'Delivered',
                      'Invoiced',
                      'Dispensed',
                      'Batch',
                      'Expiry (UTC)',
                    ].map((title) => (
                      <th key={title} scope="col">
                        {title}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {lines.data?.slice(0, 500).map((line) => (
                    <tr key={line.id}>
                      {line.display_type ? (
                        <td colSpan={13}>
                          {line.display_type === 'line_section' ? (
                            <strong>{line.name}</strong>
                          ) : (
                            line.name
                          )}
                        </td>
                      ) : (
                        <>
                          <td>{line.name}</td>
                          <td>{line.product_uom_qty}</td>
                          <td>
                            {line.product_uom ? line.product_uom[1] : 'Not set'}
                          </td>
                          <td>
                            {money(line.price_unit, selected.currency_id[1])}
                          </td>
                          <td>{line.discount}%</td>
                          <td>
                            {money(
                              line.price_subtotal,
                              selected.currency_id[1],
                            )}
                          </td>
                          <td>
                            {money(line.price_tax, selected.currency_id[1])}
                          </td>
                          <td>
                            {money(line.price_total, selected.currency_id[1])}
                          </td>
                          <td>{line.qty_delivered}</td>
                          <td>{line.qty_invoiced}</td>
                          <td>{line.dispensed ? 'Yes' : 'No'}</td>
                          <td>{line.lot_id ? line.lot_id[1] : 'Not set'}</td>
                          <td>{line.expiry_date || 'Not set'}</td>
                        </>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
              {lines.data && lines.data.length > 500 ? (
                <p>Only the first 500 order items are shown.</p>
              ) : null}
            </div>
          )}
          <h3>Linked invoices and credit notes</h3>
          {!selected.invoice_ids.length ? (
            <p>No invoices are linked to this order.</p>
          ) : invoices.isFetching ? (
            <p role="status">Loading linked invoices...</p>
          ) : invoices.isError ? (
            <div role="alert">
              <p>{invoices.error.message}</p>
              <Button kind="tertiary" onClick={() => void invoices.refetch()}>
                Retry linked invoices
              </Button>
            </div>
          ) : (
            <>
              {invoices.data?.length === 0 ? (
                <p>
                  No linked customer invoices are available to your account.
                </p>
              ) : null}
              {invoices.data?.slice(0, 25).map((invoice) => (
                <p key={invoice.id}>
                  <Button kind="ghost" onClick={() => openInvoice(invoice)}>
                    Open {invoiceName(invoice)}
                  </Button>
                  {invoice.move_type === 'out_refund'
                    ? 'Credit note'
                    : 'Invoice'}{' '}
                  · {money(invoice.invoice_total, invoice.currency_id[1])}
                </p>
              ))}
              {invoices.data && invoices.data.length > 25 ? (
                <p>
                  Only the first 25 linked invoices are shown. Use the invoices
                  tab to find others.
                </p>
              ) : null}
            </>
          )}
        </section>
      ) : null}
    </>
  );
}
