import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen } from '@testing-library/react';
import {
  BillingSessionExpired,
  downloadDocumentReport,
  getDocumentReports,
  downloadInvoiceReport,
  getInvoiceReports,
} from '../billingService';
import {
  BillingReportsModal,
  InvoiceReportsModal,
} from '../InvoiceReportsModal';

jest.mock('../billingService', () => ({
  ...jest.requireActual('../billingService'),
  downloadInvoiceReport: jest.fn(),
  getInvoiceReports: jest.fn(),
  downloadDocumentReport: jest.fn(),
  getDocumentReports: jest.fn(),
}));
const close = jest.fn(),
  reconnect = jest.fn();
const show = () =>
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <InvoiceReportsModal
        uid={3}
        invoiceId={7}
        close={close}
        reconnect={reconnect}
      />
    </QueryClientProvider>,
  );
describe('Invoice PDF reports', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    URL.createObjectURL = jest.fn(() => 'blob:invoice-test');
    URL.revokeObjectURL = jest.fn();
    jest
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => {});
    (getInvoiceReports as jest.Mock).mockResolvedValue([
      { key: 'invoice', name: 'Invoices' },
    ]);
    (downloadInvoiceReport as jest.Mock).mockResolvedValue({
      filename: 'Draft_7_invoice.pdf',
      blob: new Blob(['%PDF-']),
    });
  });
  afterEach(() => jest.restoreAllMocks());
  it('loads permitted reports but does not generate a PDF before an explicit click', async () => {
    show();
    await screen.findByRole('button', { name: 'Download Invoices' });
    expect(getInvoiceReports).toHaveBeenCalledWith(7);
    expect(downloadInvoiceReport).not.toHaveBeenCalled();
    expect(
      screen.getByText(/Unsaved edits are not included/),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Back to invoices' }));
    expect(close).toHaveBeenCalledTimes(1);
  });
  it('blocks duplicate downloads and closing during generation, then downloads a PDF', async () => {
    let resolve!: (result: { filename: string; blob: Blob }) => void;
    (downloadInvoiceReport as jest.Mock).mockReturnValue(
      new Promise((r) => {
        resolve = r;
      }),
    );
    show();
    const button = await screen.findByRole('button', {
      name: 'Download Invoices',
    });
    fireEvent.click(button);
    fireEvent.click(button);
    expect(downloadInvoiceReport).toHaveBeenCalledTimes(1);
    expect(
      screen.getByRole('button', { name: 'Back to invoices' }),
    ).toBeDisabled();
    fireEvent.keyDown(screen.getByRole('dialog'), {
      key: 'Escape',
      keyCode: 27,
    });
    expect(close).not.toHaveBeenCalled();
    await act(async () =>
      resolve({ filename: 'Draft_7_invoice.pdf', blob: new Blob(['%PDF-']) }),
    );
    expect(HTMLAnchorElement.prototype.click).toHaveBeenCalledTimes(1);
    expect(
      await screen.findByText(/PDF download requested/),
    ).toBeInTheDocument();
    expect(document.querySelector('a[download]')).toBeNull();
  });
  it('preserves failures without automatic retries and allows an explicit retry', async () => {
    (downloadInvoiceReport as jest.Mock).mockRejectedValueOnce(
      new Error('PDF unavailable'),
    );
    show();
    fireEvent.click(
      await screen.findByRole('button', { name: 'Download Invoices' }),
    );
    await screen.findByText(/PDF unavailable.*No automatic retry/);
    expect(downloadInvoiceReport).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Download Invoices' }));
    await screen.findByText(/PDF download requested/);
    expect(downloadInvoiceReport).toHaveBeenCalledTimes(2);
  });
  it('shows session expiry and reconnects without downloading again', async () => {
    (downloadInvoiceReport as jest.Mock).mockRejectedValue(
      new BillingSessionExpired(),
    );
    show();
    fireEvent.click(
      await screen.findByRole('button', { name: 'Download Invoices' }),
    );
    fireEvent.click(
      await screen.findByRole('button', { name: 'Reconnect Billing' }),
    );
    expect(reconnect).toHaveBeenCalledTimes(1);
    expect(
      screen.queryByRole('button', { name: 'Download Invoices' }),
    ).not.toBeInTheDocument();
    expect(downloadInvoiceReport).toHaveBeenCalledTimes(1);
  });
  it('handles empty report menus and read failures', async () => {
    (getInvoiceReports as jest.Mock).mockResolvedValue([]);
    const view = show();
    await screen.findByText(/No invoice PDF reports are available/);
    view.unmount();
    (getInvoiceReports as jest.Mock).mockRejectedValue(
      new Error('Report list unavailable'),
    );
    show();
    await screen.findByText('Report list unavailable');
    expect(downloadInvoiceReport).not.toHaveBeenCalled();
  });
  it.each([
    [
      'order',
      'quotation',
      'Quotation and order PDF reports',
      'Back to order details',
    ],
    [
      'payment',
      'receipt',
      'Payment receipt PDF reports',
      'Back to payment details',
    ],
  ] as const)(
    'uses the selected %s identity and keeps report navigation separate from financial actions',
    async (kind, key, heading, back) => {
      (getDocumentReports as jest.Mock).mockResolvedValue([
        { key, name: 'Native report' },
      ]);
      (downloadDocumentReport as jest.Mock).mockResolvedValue({
        filename: 'Native_9.pdf',
        blob: new Blob(['%PDF-']),
      });
      render(
        <QueryClientProvider
          client={
            new QueryClient({ defaultOptions: { queries: { retry: false } } })
          }
        >
          <BillingReportsModal
            uid={3}
            recordId={9}
            kind={kind}
            close={close}
            reconnect={reconnect}
          />
        </QueryClientProvider>,
      );
      const button = await screen.findByRole('button', {
        name: 'Download Native report',
      });
      expect(screen.getByRole('region', { name: heading })).toBeInTheDocument();
      expect(getDocumentReports).toHaveBeenCalledWith(kind, 9);
      expect(downloadDocumentReport).not.toHaveBeenCalled();
      fireEvent.click(button);
      await screen.findByText(/PDF download requested/);
      expect(downloadDocumentReport).toHaveBeenCalledWith(kind, 9, key);
      expect(downloadInvoiceReport).not.toHaveBeenCalled();
      expect(
        screen.getByText(
          kind === 'payment'
            ? /earlier archives are retained/
            : /pro-forma is not a posted invoice/,
        ),
      ).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: back }));
      expect(close).toHaveBeenCalledTimes(1);
    },
  );
});
