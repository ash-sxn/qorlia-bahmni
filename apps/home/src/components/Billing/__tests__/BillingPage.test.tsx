import { useUserPrivilege } from '@bahmni/widgets';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { BillingPage } from '../BillingPage';
import {
  getBillingSession,
  getInvoices,
  getInvoiceLines,
  signInToBilling,
  BillingSessionExpired,
  getChargeOrders,
  getChargeOrderLines,
  getInvoiceWorkflow,
  postInvoiceWorkflow,
} from '../billingService';
import { invoiceWorkflowFixture } from './invoiceWorkflowFixture';

jest.mock('../billingService', () => ({
  ...jest.requireActual('../billingService'),
  getBillingSession: jest.fn(),
  getInvoices: jest.fn(),
  getInvoiceLines: jest.fn(),
  signInToBilling: jest.fn(),
  getChargeOrders: jest.fn(),
  getChargeOrderLines: jest.fn(),
  getInvoiceWorkflow: jest.fn(),
  postInvoiceWorkflow: jest.fn(),
}));
jest.mock('@bahmni/widgets', () => ({ useUserPrivilege: jest.fn() }));
jest.mock('../../HomePageHeader', () => ({
  HomePageHeader: () => <header>Qorlia</header>,
}));
const show = () =>
  render(
    <MemoryRouter>
      <QueryClientProvider
        client={
          new QueryClient({ defaultOptions: { queries: { retry: false } } })
        }
      >
        <BillingPage />
      </QueryClientProvider>
    </MemoryRouter>,
  );
const invoice = {
  id: 7,
  name: 'QorliaQA invoice',
  ref: 'QORLIAQA-INVOICE',
  move_type: 'out_invoice',
  partner_id: [8, 'QorliaQA Customer'],
  invoice_date: '2026-10-08',
  invoice_date_due: false,
  state: 'draft',
  payment_state: 'not_paid',
  amount_total: 500,
  amount_untaxed: 480,
  qorlia_item_subtotal: 480,
  amount_tax: 20,
  discount: 25.5,
  round_off_amount: 0.25,
  invoice_total: 474.75,
  amount_residual: 500,
  currency_id: [1, 'INR'],
};
describe('Billing workspace', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (useUserPrivilege as jest.Mock).mockReturnValue({
      userPrivileges: [],
      error: null,
    });
    (getBillingSession as jest.Mock).mockResolvedValue({
      uid: 3,
      name: 'QA Cashier',
    });
    (getInvoices as jest.Mock).mockResolvedValue([]);
    (getChargeOrders as jest.Mock).mockResolvedValue([]);
    (getChargeOrderLines as jest.Mock).mockResolvedValue([]);
  });
  it('does not contact Billing before hospital sign-in is verified', () => {
    (useUserPrivilege as jest.Mock).mockReturnValue({
      userPrivileges: null,
      error: null,
    });
    show();
    expect(getBillingSession).not.toHaveBeenCalled();
    expect(getInvoices).not.toHaveBeenCalled();
  });
  it('shows the real empty response and never pretends demo data exists', async () => {
    show();
    expect(await screen.findByText(/No invoices match/)).toBeInTheDocument();
    expect(screen.getByText('Billing account: QA Cashier')).toBeInTheDocument();
  });
  it('requires ERP authentication after hospital sign-in and clears password input', async () => {
    (getBillingSession as jest.Mock).mockRejectedValue(
      new BillingSessionExpired(),
    );
    (signInToBilling as jest.Mock).mockResolvedValue({
      uid: 3,
      name: 'QA Cashier',
    });
    show();
    await screen.findByText('Connect your billing account');
    fireEvent.change(screen.getByLabelText('Billing username'), {
      target: { value: 'cashier' },
    });
    fireEvent.change(screen.getByLabelText('Billing password'), {
      target: { value: 'test-password' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Connect Billing' }));
    await waitFor(() =>
      expect(signInToBilling).toHaveBeenCalledWith('cashier', 'test-password'),
    );
    await waitFor(() =>
      expect(
        screen.queryByLabelText('Billing password'),
      ).not.toBeInTheDocument(),
    );
  });
  it('renders API invoice values and does not expose payment or posting actions', async () => {
    (getInvoices as jest.Mock).mockResolvedValue([invoice]);
    show();
    expect(await screen.findByText('QorliaQA Customer')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'View QorliaQA invoice' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /Pay|Post invoice/ }),
    ).not.toBeInTheDocument();
  });
  it('opens native invoice details and retries only the failed read', async () => {
    (getInvoices as jest.Mock).mockResolvedValue([invoice]);
    (getInvoiceLines as jest.Mock)
      .mockRejectedValueOnce(new Error('Read unavailable'))
      .mockResolvedValue([
        {
          id: 42,
          name: 'QA Consultation',
          quantity: 1,
          price_unit: 500,
          price_subtotal: 500,
          discount: 0,
          price_total: 500,
        },
      ]);
    show();
    fireEvent.click(
      await screen.findByRole('button', { name: 'View QorliaQA invoice' }),
    );
    expect(await screen.findByText('Read unavailable')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('QA Consultation')).toBeInTheDocument();
    expect(getInvoiceLines).toHaveBeenNthCalledWith(1, 7);
    expect(getInvoiceLines).toHaveBeenNthCalledWith(2, 7);
    fireEvent.click(screen.getByRole('button', { name: 'Close details' }));
    expect(screen.queryByText('QA Consultation')).not.toBeInTheDocument();
  });
  it('uses the native Bahmni final total and never labels a draft as outstanding debt', async () => {
    (getInvoices as jest.Mock).mockResolvedValue([invoice]);
    (getInvoiceLines as jest.Mock).mockResolvedValue([]);
    show();
    fireEvent.click(
      await screen.findByRole('button', { name: 'View QorliaQA invoice' }),
    );
    expect(screen.getAllByText('₹474.75')).toHaveLength(2);
    expect(screen.getByText('Document discount')).toBeInTheDocument();
    expect(screen.getByText('₹25.50')).toBeInTheDocument();
    expect(screen.getByText('₹0.25')).toBeInTheDocument();
    expect(screen.queryByText('₹500.00')).not.toBeInTheDocument();
    expect(screen.getAllByText('Not posted').length).toBeGreaterThan(0);
  });
  it('shows a draft credit note with its reference when Odoo has not assigned a number', async () => {
    (getInvoices as jest.Mock).mockResolvedValue([
      { ...invoice, name: false, move_type: 'out_refund' },
    ]);
    (getInvoiceLines as jest.Mock).mockResolvedValue([]);
    show();
    fireEvent.click(
      await screen.findByRole('button', { name: 'View QORLIAQA-INVOICE' }),
    );
    expect(screen.getByText('Unapplied credit')).toBeInTheDocument();
    expect(screen.getAllByText('Credit note').length).toBeGreaterThan(0);
  });
  it('shows item subtotal separately from posted accounting adjustments without subtracting them twice', async () => {
    (getInvoices as jest.Mock).mockResolvedValue([
      {
        ...invoice,
        state: 'posted',
        amount_total: 919.75,
        amount_untaxed: 874.75,
        qorlia_item_subtotal: 900,
        amount_tax: 45,
        invoice_total: 919.75,
        amount_residual: 919.75,
      },
    ]);
    (getInvoiceLines as jest.Mock).mockResolvedValue([]);
    show();
    fireEvent.click(
      await screen.findByRole('button', { name: 'View QorliaQA invoice' }),
    );
    expect(screen.getByText('₹900.00')).toBeInTheDocument();
    expect(screen.getByText('₹45.00')).toBeInTheDocument();
    expect(screen.getByText('₹25.50')).toBeInTheDocument();
    expect(screen.getByText('₹0.25')).toBeInTheDocument();
    expect(screen.getAllByText('₹919.75').length).toBeGreaterThan(0);
    expect(screen.queryByText('₹874.75')).not.toBeInTheDocument();
  });
  it('hides invoices and requests reconnection when ERP access expires', async () => {
    (getInvoices as jest.Mock).mockRejectedValue(new BillingSessionExpired());
    show();
    expect(
      await screen.findByText('Connect your billing account'),
    ).toBeInTheDocument();
    expect(
      screen.queryByText('Invoices and credit notes'),
    ).not.toBeInTheDocument();
  });
  it('does not treat permission failure as an empty invoice list', async () => {
    (getInvoices as jest.Mock).mockRejectedValue(
      new Error('Billing access failed.'),
    );
    show();
    expect(
      await screen.findByText('Billing access failed.'),
    ).toBeInTheDocument();
    expect(screen.queryByText(/No invoices match/)).not.toBeInTheDocument();
  });
  it('reviews and posts only the selected invoice, then refreshes the real list and shows its result', async () => {
    (getInvoices as jest.Mock).mockResolvedValue([invoice]);
    (getInvoiceLines as jest.Mock).mockResolvedValue([]);
    (getInvoiceWorkflow as jest.Mock).mockResolvedValue(
      invoiceWorkflowFixture(),
    );
    (postInvoiceWorkflow as jest.Mock).mockResolvedValue(
      invoiceWorkflowFixture({
        state: 'posted',
        name: 'INV/QA/7',
        can_post: false,
      }),
    );
    show();
    fireEvent.click(
      await screen.findByRole('button', { name: 'View QorliaQA invoice' }),
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Review invoice posting' }),
    );
    fireEvent.click(
      await screen.findByRole('button', { name: 'Post invoice' }),
    );
    expect(
      await screen.findByText(/INV\/QA\/7 updated.*No payment was recorded/),
    ).toBeInTheDocument();
    expect(getInvoiceWorkflow).toHaveBeenCalledWith(7);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('region', { name: 'Invoice details' }),
    ).not.toBeInTheDocument();
    await waitFor(() => expect(getInvoices).toHaveBeenCalledTimes(2));
  });
  it('fetches charge orders only after that tab is opened', async () => {
    show();
    await screen.findByText(/No invoices match/);
    expect(getChargeOrders).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('tab', { name: 'Charge orders' }));
    expect(
      await screen.findByText('No charge orders match these filters.'),
    ).toBeVisible();
    expect(getChargeOrders).toHaveBeenCalledWith('', 0, 'draft');
    expect(screen.getByRole('tab', { name: 'Charge orders' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });
  it('opens a native linked invoice in the invoice tab without a legacy redirect', async () => {
    (getChargeOrders as jest.Mock).mockResolvedValue([
      {
        id: 9,
        name: 'QA-ORDER',
        client_order_ref: false,
        partner_id: [8, 'QA'],
        shop_id: [1, 'QA Shop'],
        date_order: '2026-10-09 08:00:00',
        state: 'draft',
        invoice_status: 'no',
        care_setting: 'opd',
        provider_name: false,
        amount_untaxed: 480,
        amount_tax: 20,
        amount_total: 474.75,
        discount: 25.5,
        discount_type: 'fixed',
        discount_percentage: 0,
        chargeable_amount: 0,
        disc_acc_id: false,
        round_off_amount: 0.25,
        currency_id: [1, 'INR'],
        invoice_ids: [7],
      },
    ]);
    (getInvoices as jest.Mock).mockResolvedValue([invoice]);
    (getInvoiceLines as jest.Mock).mockResolvedValue([]);
    show();
    await screen.findByText('QorliaQA Customer');
    fireEvent.click(screen.getByRole('tab', { name: 'Charge orders' }));
    fireEvent.click(
      await screen.findByRole('button', { name: 'View order QA-ORDER' }),
    );
    fireEvent.click(
      await screen.findByRole('button', { name: 'Open QorliaQA invoice' }),
    );
    expect(
      screen.getByRole('tab', { name: 'Invoices and credit notes' }),
    ).toHaveAttribute('aria-selected', 'true');
    expect(
      await screen.findByRole('region', { name: 'Invoice details' }),
    ).toBeVisible();
    expect(getInvoiceLines).toHaveBeenCalledWith(7);
  });
});
