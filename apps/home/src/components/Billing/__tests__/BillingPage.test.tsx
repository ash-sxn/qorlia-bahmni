import { useUserPrivilege } from '@bahmni/widgets';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  render,
  screen,
  fireEvent,
  waitFor,
  within,
} from '@testing-library/react';
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
  getPaymentWorkflow,
  previewPaymentWorkflow,
  recordPaymentWorkflow,
  getCreditWorkflow,
  applyCreditWorkflow,
  removeCreditWorkflow,
  getCorrectionWorkflow,
  runCorrectionWorkflow,
  getReversalWorkflow,
  previewReversalWorkflow,
  runReversalWorkflow,
  getInvoiceDraft,
  previewInvoiceDraft,
  saveInvoiceDraft,
  getInvoiceDraftChoices,
  getInvoiceReports,
  downloadInvoiceReport,
  getCustomerStatement,
  getInvoiceConversation,
  postInvoiceNote,
  getInvoiceJournal,
} from '../billingService';
import { correctionWorkflowFixture } from './correctionWorkflowFixture';
import { creditWorkflowFixture } from './creditWorkflowFixture';
import { customerStatementFixture } from './customerStatementFixture';
import { invoiceConversationFixture } from './invoiceConversationFixture';
import { invoiceDraftFixture } from './invoiceDraftFixture';
import { invoiceJournalFixture } from './invoiceJournalFixture';
import { invoiceWorkflowFixture } from './invoiceWorkflowFixture';
import { paymentWorkflowFixture } from './paymentWorkflowFixture';
import {
  reversalWorkflowFixture,
  reversalResultFixture,
} from './reversalWorkflowFixture';

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
  getPaymentWorkflow: jest.fn(),
  previewPaymentWorkflow: jest.fn(),
  recordPaymentWorkflow: jest.fn(),
  getCreditWorkflow: jest.fn(),
  applyCreditWorkflow: jest.fn(),
  removeCreditWorkflow: jest.fn(),
  getCorrectionWorkflow: jest.fn(),
  runCorrectionWorkflow: jest.fn(),
  getReversalWorkflow: jest.fn(),
  previewReversalWorkflow: jest.fn(),
  runReversalWorkflow: jest.fn(),
  getInvoiceDraft: jest.fn(),
  previewInvoiceDraft: jest.fn(),
  saveInvoiceDraft: jest.fn(),
  getInvoiceDraftChoices: jest.fn(),
  getInvoiceReports: jest.fn(),
  downloadInvoiceReport: jest.fn(),
  getCustomerStatement: jest.fn(),
  getInvoiceConversation: jest.fn(),
  postInvoiceNote: jest.fn(),
  getInvoiceJournal: jest.fn(),
}));
jest.mock('@bahmni/widgets', () => ({
  useUserPrivilege: jest.fn(),
  useDebounce: (value: string) => value,
}));
jest.mock('../../HomePageHeader', () => ({
  HomePageHeader: () => <header>Qorlia</header>,
}));
jest.mock('../JournalMoneyEditor', () => ({
  JournalMoneyEditor: ({ saved }: { saved: () => void }) => (
    <button onClick={saved}>Complete reviewed monetary save</button>
  ),
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
    (getInvoiceDraftChoices as jest.Mock).mockResolvedValue([]);
    (getInvoiceReports as jest.Mock).mockResolvedValue([
      { key: 'invoice', name: 'Invoices' },
    ]);
  });
  it('clears the old invoice detail snapshot when journal money is saved', async () => {
    (getInvoices as jest.Mock).mockResolvedValue([invoice]);
    (getInvoiceLines as jest.Mock).mockResolvedValue([]);
    (getInvoiceJournal as jest.Mock).mockResolvedValue(invoiceJournalFixture());
    show();
    fireEvent.click(
      await screen.findByRole('button', { name: 'View QorliaQA invoice' }),
    );
    expect(await screen.findByText('Final total')).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole('button', { name: 'Journal items', exact: true }),
    );
    fireEvent.click(
      await screen.findByRole('button', {
        name: 'Edit journal amounts and rows',
      }),
    );
    (getInvoices as jest.Mock).mockResolvedValue([
      { ...invoice, invoice_total: 600 },
    ]);
    fireEvent.click(
      screen.getByRole('button', { name: 'Complete reviewed monetary save' }),
    );
    await screen.findByRole('table', { name: 'Native invoice journal items' });
    expect(screen.queryByText('Final total')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Back to invoice' }));
    expect(
      screen.queryByRole('region', { name: 'Invoice details' }),
    ).not.toBeInTheDocument();
    await waitFor(() => expect(getInvoices).toHaveBeenCalledTimes(2));
    fireEvent.click(
      screen.getByRole('button', { name: 'View QorliaQA invoice' }),
    );
    await within(
      await screen.findByRole('region', { name: 'Invoice details' }),
    ).findByText('₹600.00');
  });
  it('opens native conversation only from a selected signed-in invoice without posting automatically', async () => {
    (getInvoices as jest.Mock).mockResolvedValue([invoice]);
    (getInvoiceLines as jest.Mock).mockResolvedValue([]);
    (getInvoiceConversation as jest.Mock).mockResolvedValue(
      invoiceConversationFixture(),
    );
    show();
    fireEvent.click(
      await screen.findByRole('button', { name: 'View QorliaQA invoice' }),
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Invoice conversation' }),
    );
    await screen.findByText('QorliaQA Checked invoice');
    expect(getInvoiceConversation).toHaveBeenCalledWith(7, false);
    expect(postInvoiceNote).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Back to invoices' }));
    expect(
      screen.getByRole('button', { name: 'Invoice conversation' }),
    ).toBeInTheDocument();
  });
  it('opens native journal items only after selecting a signed-in invoice', async () => {
    (getInvoices as jest.Mock).mockResolvedValue([invoice]);
    (getInvoiceLines as jest.Mock).mockResolvedValue([]);
    (getInvoiceJournal as jest.Mock).mockResolvedValue(invoiceJournalFixture());
    show();
    expect(
      screen.queryByRole('button', { name: 'Journal items' }),
    ).not.toBeInTheDocument();
    fireEvent.click(
      await screen.findByRole('button', { name: 'View QorliaQA invoice' }),
    );
    expect(getInvoiceJournal).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Journal items' }));
    await screen.findByRole('table', { name: 'Native invoice journal items' });
    expect(getInvoiceJournal).toHaveBeenCalledWith(7, false, false);
    expect(postInvoiceWorkflow).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Back to invoice' }));
    expect(
      screen.getByRole('region', { name: 'Invoice details' }),
    ).toBeInTheDocument();
  });
  it('opens native report choices from a selected invoice without generating or posting automatically', async () => {
    (getInvoices as jest.Mock).mockResolvedValue([invoice]);
    (getInvoiceLines as jest.Mock).mockResolvedValue([]);
    show();
    fireEvent.click(
      await screen.findByRole('button', { name: 'View QorliaQA invoice' }),
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Invoice PDF reports' }),
    );
    await screen.findByRole('button', { name: 'Download Invoices' });
    expect(getInvoiceReports).toHaveBeenCalledWith(7);
    expect(downloadInvoiceReport).not.toHaveBeenCalled();
    expect(postInvoiceWorkflow).not.toHaveBeenCalled();
  });
  it('opens the selected customer account statement only after signed-in invoice selection', async () => {
    (getInvoices as jest.Mock).mockResolvedValue([invoice]);
    (getInvoiceLines as jest.Mock).mockResolvedValue([]);
    (getCustomerStatement as jest.Mock).mockResolvedValue(
      customerStatementFixture(),
    );
    show();
    fireEvent.click(
      await screen.findByRole('button', { name: 'View QorliaQA invoice' }),
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Customer account statement' }),
    );
    await screen.findByRole('heading', { name: 'Customer account statement' });
    expect(getCustomerStatement).not.toHaveBeenCalled();
    expect(postInvoiceWorkflow).not.toHaveBeenCalled();
  });
  it('opens new customer invoice creation only within the signed-in Billing workspace', async () => {
    (getInvoiceDraft as jest.Mock).mockResolvedValue({
      ...invoiceDraftFixture(),
      id: false,
      lines: [],
    });
    show();
    fireEvent.click(await screen.findByRole('button', { name: 'New invoice' }));
    await screen.findByRole('heading', { name: 'New invoice' });
    expect(getInvoiceDraft).toHaveBeenCalledWith(false);
    expect(saveInvoiceDraft).not.toHaveBeenCalled();
  });
  it('opens existing invoice editing inside the signed-in workspace and refreshes after saving', async () => {
    Object.defineProperty(crypto, 'randomUUID', {
      configurable: true,
      value: () => 'test-line',
    });
    (getInvoices as jest.Mock).mockResolvedValue([invoice]);
    (getInvoiceLines as jest.Mock).mockResolvedValue([]);
    (getInvoiceDraft as jest.Mock).mockResolvedValue(invoiceDraftFixture());
    (previewInvoiceDraft as jest.Mock).mockImplementation(async (draft) => ({
      ...draft,
      review_version: 'b'.repeat(64),
    }));
    (saveInvoiceDraft as jest.Mock).mockResolvedValue(invoiceDraftFixture());
    show();
    fireEvent.click(
      await screen.findByRole('button', { name: 'View QorliaQA invoice' }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Edit draft invoice' }));
    const reference = await screen.findByLabelText('Reference');
    expect(getInvoiceDraft).toHaveBeenCalledWith(7);
    fireEvent.change(reference, { target: { value: 'QorliaQA Review' } });
    fireEvent.blur(reference);
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Save draft invoice' }),
      ).toBeEnabled(),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Save draft invoice' }));
    await screen.findByText(/Draft invoice #7 draft saved/);
    expect(
      screen.queryByRole('dialog', { name: 'Draft invoice editor' }),
    ).not.toBeInTheDocument();
    expect(postInvoiceWorkflow).not.toHaveBeenCalled();
    expect(recordPaymentWorkflow).not.toHaveBeenCalled();
    expect(getInvoices).toHaveBeenCalledTimes(2);
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
  it('distinguishes a draft credit note when Odoo has not assigned a number', async () => {
    (getInvoices as jest.Mock).mockResolvedValue([
      { ...invoice, name: false, move_type: 'out_refund' },
    ]);
    (getInvoiceLines as jest.Mock).mockResolvedValue([]);
    show();
    fireEvent.click(
      await screen.findByRole('button', { name: 'View Draft credit note #7' }),
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
  it('reviews a selected invoice correction and invalidates stale details after confirmation', async () => {
    (getInvoices as jest.Mock).mockResolvedValue([
      { ...invoice, state: 'posted' },
    ]);
    (getInvoiceLines as jest.Mock).mockResolvedValue([]);
    (getCorrectionWorkflow as jest.Mock).mockResolvedValue(
      correctionWorkflowFixture(),
    );
    (runCorrectionWorkflow as jest.Mock).mockResolvedValue(
      invoiceWorkflowFixture({ name: 'INV/QA/7' }),
    );
    show();
    fireEvent.click(
      await screen.findByRole('button', { name: 'View QorliaQA invoice' }),
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Review invoice correction' }),
    );
    fireEvent.click(
      await screen.findByRole('button', { name: 'Review reset to draft' }),
    );
    expect(runCorrectionWorkflow).not.toHaveBeenCalled();
    fireEvent.click(
      screen.getByRole('button', { name: /Confirm reset to draft/ }),
    );
    expect(
      await screen.findByText(
        /INV\/QA\/7 reset to draft.*No money was transferred/,
      ),
    ).toBeInTheDocument();
    expect(getCorrectionWorkflow).toHaveBeenCalledWith(7);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('region', { name: 'Invoice details' }),
    ).not.toBeInTheDocument();
    await waitFor(() => expect(getInvoices).toHaveBeenCalledTimes(2));
  });
  it('creates a reviewed credit note from a posted invoice and refreshes the invoice list', async () => {
    (getInvoices as jest.Mock).mockResolvedValue([
      { ...invoice, state: 'posted' },
    ]);
    (getInvoiceLines as jest.Mock).mockResolvedValue([]);
    (getReversalWorkflow as jest.Mock).mockResolvedValue(
      reversalWorkflowFixture(),
    );
    (previewReversalWorkflow as jest.Mock).mockResolvedValue(
      reversalWorkflowFixture(),
    );
    (runReversalWorkflow as jest.Mock).mockResolvedValue(
      reversalResultFixture(),
    );
    show();
    fireEvent.click(
      await screen.findByRole('button', { name: 'View QorliaQA invoice' }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Create credit note' }));
    fireEvent.click(
      await screen.findByRole('button', { name: 'Review credit note' }),
    );
    expect(runReversalWorkflow).not.toHaveBeenCalled();
    fireEvent.click(
      await screen.findByRole('button', {
        name: /Confirm credit-note creation/,
      }),
    );
    await screen.findByText(/created.*No money was transferred/);
    expect(getReversalWorkflow).toHaveBeenCalledWith(7);
    expect(runReversalWorkflow).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('region', { name: 'Invoice details' }),
    ).not.toBeInTheDocument();
    await waitFor(() => expect(getInvoices).toHaveBeenCalledTimes(2));
  });
  it('records a reviewed payment inside the workspace and refreshes native invoice balances', async () => {
    (getInvoices as jest.Mock).mockResolvedValue([
      { ...invoice, state: 'posted' },
    ]);
    (getInvoiceLines as jest.Mock).mockResolvedValue([]);
    (getPaymentWorkflow as jest.Mock).mockResolvedValue(
      paymentWorkflowFixture(),
    );
    (previewPaymentWorkflow as jest.Mock).mockResolvedValue(
      paymentWorkflowFixture(),
    );
    (recordPaymentWorkflow as jest.Mock).mockResolvedValue(
      paymentWorkflowFixture({
        can_record: false,
        values: false,
        invoice: invoiceWorkflowFixture({
          state: 'posted',
          name: 'INV/QA/7',
          can_post: false,
          open_amount: 0,
          payment_state: 'in_payment',
        }),
      }),
    );
    show();
    fireEvent.click(
      await screen.findByRole('button', { name: 'View QorliaQA invoice' }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Review payments' }));
    fireEvent.click(
      await screen.findByRole('button', { name: 'Review payment' }),
    );
    fireEvent.click(
      await screen.findByRole('button', { name: 'Record payment' }),
    );
    expect(
      await screen.findByText(
        /payment recorded.*Native status: in payment.*Open amount: ₹0.00/,
      ),
    ).toBeVisible();
    expect(getPaymentWorkflow).toHaveBeenCalledWith(7);
    expect(recordPaymentWorkflow).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await waitFor(() => expect(getInvoices).toHaveBeenCalledTimes(2));
  });
  it('applies only the reviewed native credit and refreshes invoice balances', async () => {
    (getInvoices as jest.Mock).mockResolvedValue([
      { ...invoice, state: 'posted' },
    ]);
    (getInvoiceLines as jest.Mock).mockResolvedValue([]);
    (getCreditWorkflow as jest.Mock).mockResolvedValue(creditWorkflowFixture());
    (applyCreditWorkflow as jest.Mock).mockResolvedValue(
      creditWorkflowFixture({
        invoice: invoiceWorkflowFixture({
          state: 'posted',
          name: 'INV/QA/7',
          can_post: false,
          open_amount: 400,
          payment_state: 'partial',
        }),
        credits: [],
      }),
    );
    show();
    fireEvent.click(
      await screen.findByRole('button', { name: 'View QorliaQA invoice' }),
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Review credit allocation' }),
    );
    fireEvent.click(
      await screen.findByRole('button', {
        name: 'Review QorliaQA Credit note',
      }),
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Apply reviewed item' }),
    );
    expect(
      await screen.findByText(
        /allocation saved.*Open amount: ₹400.00.*No new payment/,
      ),
    ).toBeVisible();
    expect(getCreditWorkflow).toHaveBeenCalledWith(7);
    expect(applyCreditWorkflow).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await waitFor(() => expect(getInvoices).toHaveBeenCalledTimes(2));
  });
  it('removes only the reviewed allocation and refreshes the reopened balance', async () => {
    (getInvoices as jest.Mock).mockResolvedValue([
      { ...invoice, state: 'posted' },
    ]);
    (getInvoiceLines as jest.Mock).mockResolvedValue([]);
    (getCreditWorkflow as jest.Mock).mockResolvedValue(
      creditWorkflowFixture({
        history: [
          {
            id: 23,
            name: 'QorliaQA Receipt',
            date: '2026-10-09',
            amount: 100,
            currency: [3, 'INR'],
            is_exchange: false,
            can_remove: true,
          },
        ],
      }),
    );
    (removeCreditWorkflow as jest.Mock).mockResolvedValue(
      creditWorkflowFixture({
        invoice: invoiceWorkflowFixture({
          state: 'posted',
          can_post: false,
          open_amount: 500,
        }),
      }),
    );
    show();
    fireEvent.click(
      await screen.findByRole('button', { name: 'View QorliaQA invoice' }),
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Review credit allocation' }),
    );
    fireEvent.click(
      await screen.findByRole('button', {
        name: 'Review removal of QorliaQA Receipt',
      }),
    );
    fireEvent.click(
      screen.getByRole('button', { name: /Remove reviewed allocation/ }),
    );
    expect(
      await screen.findByText(
        /allocation removed.*Open amount: ₹500.00.*No new payment/,
      ),
    ).toBeVisible();
    expect(removeCreditWorkflow).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await waitFor(() => expect(getInvoices).toHaveBeenCalledTimes(2));
  });
  it('clears invoice and credit data when a credit review requires Billing reconnection', async () => {
    (getBillingSession as jest.Mock)
      .mockResolvedValueOnce({ uid: 3, name: 'QA Cashier' })
      .mockRejectedValue(new BillingSessionExpired());
    (getInvoices as jest.Mock).mockResolvedValue([
      { ...invoice, state: 'posted' },
    ]);
    (getInvoiceLines as jest.Mock).mockResolvedValue([]);
    (getCreditWorkflow as jest.Mock).mockRejectedValue(
      new BillingSessionExpired(),
    );
    show();
    fireEvent.click(
      await screen.findByRole('button', { name: 'View QorliaQA invoice' }),
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Review credit allocation' }),
    );
    fireEvent.click(
      await screen.findByRole('button', { name: 'Reconnect Billing' }),
    );
    expect(
      await screen.findByText('Connect your billing account'),
    ).toBeVisible();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.queryByText('QorliaQA Customer')).not.toBeInTheDocument();
    expect(applyCreditWorkflow).not.toHaveBeenCalled();
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
