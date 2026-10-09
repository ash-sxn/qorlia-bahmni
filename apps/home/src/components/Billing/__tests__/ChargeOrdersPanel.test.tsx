import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import {
  BillingDraft,
  BillingSessionExpired,
  ChargeOrder,
  getChargeOrderLines,
  getChargeOrders,
  getInvoices,
} from '../billingService';
import { ChargeOrdersPanel } from '../ChargeOrdersPanel';

jest.mock('../billingService', () => ({
  ...jest.requireActual('../billingService'),
  getChargeOrders: jest.fn(),
  getChargeOrderLines: jest.fn(),
  getInvoices: jest.fn(),
}));
jest.mock('../DraftOrderEditor', () => ({
  DraftOrderEditor: ({ saved }: { saved: (draft: BillingDraft) => void }) => (
    <button onClick={() => saved({ name: 'QORLIAQA-SAVED' } as BillingDraft)}>
      Test save draft
    </button>
  ),
}));
const order: ChargeOrder = {
  id: 9,
  name: 'QORLIAQA-ORDER',
  client_order_ref: 'QORLIAQA-REF',
  partner_id: [2, 'QorliaQA Customer'],
  shop_id: [1, 'QA Shop'],
  date_order: '2026-10-09 08:00:00',
  state: 'draft',
  invoice_status: 'no',
  care_setting: 'opd',
  provider_name: 'QA Provider',
  amount_untaxed: 900,
  amount_tax: 45,
  amount_total: 919.75,
  discount: 25.5,
  discount_type: 'fixed',
  discount_percentage: 0,
  chargeable_amount: 0,
  disc_acc_id: false,
  round_off_amount: 0.25,
  currency_id: [1, 'INR'],
  invoice_ids: [],
};
const line = {
  id: 10,
  name: 'QA Consultation',
  display_type: false,
  product_id: [3, 'QA'],
  product_uom: [1, 'Units'],
  product_uom_qty: 2,
  qty_delivered: 0,
  qty_invoiced: 0,
  price_unit: 500,
  discount: 10,
  price_subtotal: 900,
  price_tax: 45,
  price_total: 945,
  dispensed: false,
  lot_id: [4, 'QA-BATCH'],
  expiry_date: '2027-01-01 00:00:00',
};
const openInvoice = jest.fn();
const reconnect = jest.fn();
const show = (
  client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  }),
) =>
  render(
    <QueryClientProvider client={client}>
      <ChargeOrdersPanel
        uid={3}
        openInvoice={openInvoice}
        reconnect={reconnect}
      />
    </QueryClientProvider>,
  );

describe('Charge orders workspace', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (getChargeOrders as jest.Mock).mockResolvedValue([order]);
    (getChargeOrderLines as jest.Mock).mockResolvedValue([line]);
    (getInvoices as jest.Mock).mockResolvedValue([]);
  });
  it('opens API-backed quotation details without treating a draft as a payment', async () => {
    show();
    fireEvent.click(
      await screen.findByRole('button', { name: 'View order QORLIAQA-ORDER' }),
    );
    const detail = screen.getByRole('region', { name: 'Charge order details' });
    expect(within(detail).getByText('₹919.75')).toBeInTheDocument();
    expect(within(detail).getByText('₹25.50')).toBeInTheDocument();
    expect(
      within(detail).getByText(/Provider: QA Provider/),
    ).toBeInTheDocument();
    expect(await screen.findByText('QA-BATCH')).toBeInTheDocument();
    expect(screen.getByText('2027-01-01 00:00:00')).toBeInTheDocument();
    expect(getChargeOrderLines).toHaveBeenCalledWith(9);
    expect(getInvoices).not.toHaveBeenCalled();
    expect(
      screen.getByText('No invoices are linked to this order.'),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /Confirm|Pay/ }),
    ).not.toBeInTheDocument();
  });
  it('submits identity filters, resets paging and clears details on status changes', async () => {
    (getChargeOrders as jest.Mock).mockResolvedValue(
      Array.from({ length: 26 }, (_, i) => ({
        ...order,
        id: i + 1,
        name: `QA-${i + 1}`,
      })),
    );
    show();
    await screen.findByRole('button', { name: 'View order QA-1' });
    fireEvent.click(await screen.findByRole('button', { name: 'Next orders' }));
    await waitFor(() =>
      expect(getChargeOrders).toHaveBeenLastCalledWith('', 25, 'draft'),
    );
    fireEvent.change(
      screen.getByLabelText('Find an order, customer or reference'),
      { target: { value: '  QA-ref  ' } },
    );
    fireEvent.click(screen.getByRole('button', { name: 'Search orders' }));
    await waitFor(() =>
      expect(getChargeOrders).toHaveBeenLastCalledWith('QA-ref', 0, 'draft'),
    );
    fireEvent.click(
      await screen.findByRole('button', { name: 'View order QA-1' }),
    );
    fireEvent.change(screen.getByLabelText('Order status'), {
      target: { value: 'confirmed' },
    });
    await waitFor(() =>
      expect(getChargeOrders).toHaveBeenLastCalledWith(
        'QA-ref',
        0,
        'confirmed',
      ),
    );
    expect(
      screen.queryByRole('region', { name: 'Charge order details' }),
    ).not.toBeInTheDocument();
  });
  it('shows a failed read distinctly from an empty result and retries it', async () => {
    (getChargeOrders as jest.Mock)
      .mockRejectedValueOnce(new Error('Order read unavailable'))
      .mockResolvedValue([]);
    show();
    expect(
      await screen.findByText('Order read unavailable'),
    ).toBeInTheDocument();
    expect(
      screen.queryByText('No charge orders match these filters.'),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(
      await screen.findByText('No charge orders match these filters.'),
    ).toBeInTheDocument();
  });
  it('preserves section and note lines and native delivered/invoiced/dispensed distinctions', async () => {
    (getChargeOrderLines as jest.Mock).mockResolvedValue([
      { ...line, id: 11, display_type: 'line_section', name: 'QA Services' },
      { ...line, id: 12, display_type: 'line_note', name: 'QA Order note' },
      { ...line, qty_delivered: 1, qty_invoiced: 2, dispensed: false },
    ]);
    show();
    fireEvent.click(
      await screen.findByRole('button', { name: 'View order QORLIAQA-ORDER' }),
    );
    const table = await screen.findByRole('table', {
      name: 'Charge order items',
    });
    expect(
      within(table).getByText('QA Services').closest('td'),
    ).toHaveAttribute('colspan', '13');
    expect(within(table).getByText('QA Order note')).toBeInTheDocument();
    expect(within(table).getByText('No')).toBeInTheDocument();
    expect(
      within(table).getByRole('columnheader', { name: 'Delivered' }),
    ).toBeInTheDocument();
    expect(
      within(table).getByRole('columnheader', { name: 'Invoiced' }),
    ).toBeInTheDocument();
  });
  it('loads only native linked invoices and opens one in the existing invoice pane', async () => {
    const invoice = {
      id: 7,
      name: 'QA-INVOICE',
      ref: false,
      move_type: 'out_invoice',
      invoice_total: 919.75,
      currency_id: [1, 'INR'],
    };
    (getChargeOrders as jest.Mock).mockResolvedValue([
      { ...order, invoice_ids: [7] },
    ]);
    (getInvoices as jest.Mock).mockResolvedValue([invoice]);
    show();
    fireEvent.click(
      await screen.findByRole('button', { name: 'View order QORLIAQA-ORDER' }),
    );
    fireEvent.click(
      await screen.findByRole('button', { name: 'Open QA-INVOICE' }),
    );
    expect(getInvoices).toHaveBeenCalledWith('', 0, [7]);
    expect(openInvoice).toHaveBeenCalledWith(invoice);
  });
  it('hides cached financial data and requests reconnection after an expired detail read', async () => {
    (getChargeOrderLines as jest.Mock).mockRejectedValue(
      new BillingSessionExpired(),
    );
    show();
    fireEvent.click(
      await screen.findByRole('button', { name: 'View order QORLIAQA-ORDER' }),
    );
    fireEvent.click(
      await screen.findByRole('button', { name: 'Reconnect Billing' }),
    );
    expect(reconnect).toHaveBeenCalledTimes(1);
    expect(
      screen.queryByRole('table', { name: 'Patient charge orders' }),
    ).not.toBeInTheDocument();
  });
  it('clears a selected order when refreshing to avoid showing stale totals', async () => {
    show();
    fireEvent.click(
      await screen.findByRole('button', { name: 'View order QORLIAQA-ORDER' }),
    );
    expect(
      screen.getByRole('region', { name: 'Charge order details' }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Refresh orders' }));
    expect(
      screen.queryByRole('region', { name: 'Charge order details' }),
    ).not.toBeInTheDocument();
    await waitFor(() => expect(getChargeOrders).toHaveBeenCalledTimes(2));
  });
  it('refreshes saved drafts without invalidating the login or losing the save notice', async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    client.setQueryData(['billing', 'session'], { uid: 3 });
    client.setQueryData(['billing', 'draft', 3, 9], { name: 'QORLIAQA-ORDER' });
    client.setQueryData(['billing', 'charge-lines', 3, 9], [line]);
    show(client);
    await screen.findByRole('button', { name: 'View order QORLIAQA-ORDER' });
    fireEvent.click(
      screen.getByRole('button', { name: 'New draft quotation' }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Test save draft' }));
    expect(
      await screen.findByText('QORLIAQA-SAVED saved as a draft quotation.'),
    ).toBeInTheDocument();
    await waitFor(() => expect(getChargeOrders).toHaveBeenCalledTimes(2));
    expect(client.getQueryState(['billing', 'session'])?.isInvalidated).toBe(
      false,
    );
    expect(
      client.getQueryState(['billing', 'draft', 3, 9])?.isInvalidated,
    ).toBe(true);
    expect(
      client.getQueryState(['billing', 'charge-lines', 3, 9])?.isInvalidated,
    ).toBe(true);
  });
});
