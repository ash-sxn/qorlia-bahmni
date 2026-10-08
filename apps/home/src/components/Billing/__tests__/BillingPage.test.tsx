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
} from '../billingService';

jest.mock('../billingService', () => ({
  ...jest.requireActual('../billingService'),
  getBillingSession: jest.fn(),
  getInvoices: jest.fn(),
  getInvoiceLines: jest.fn(),
  signInToBilling: jest.fn(),
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
  partner_id: [8, 'QorliaQA Customer'],
  invoice_date: '2026-10-08',
  invoice_date_due: false,
  state: 'draft',
  payment_state: 'not_paid',
  amount_total: 500,
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
});
