import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { BillingSessionExpired, getInvoiceJournal } from '../billingService';
import { InvoiceJournalModal } from '../InvoiceJournalModal';
import { invoiceJournalFixture } from './invoiceJournalFixture';

jest.mock('../billingService', () => ({
  ...jest.requireActual('../billingService'),
  getInvoiceJournal: jest.fn(),
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
      <InvoiceJournalModal
        uid={3}
        invoiceId={7}
        close={close}
        reconnect={reconnect}
      />
    </QueryClientProvider>,
  );
describe('Invoice journal view', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (getInvoiceJournal as jest.Mock).mockResolvedValue(invoiceJournalFixture());
  });
  it('renders native accounts, totals, residuals, tax grids and readonly limitations', async () => {
    show();
    await screen.findByText('INV/QorliaQA/7');
    expect(getInvoiceJournal).toHaveBeenCalledWith(7, false, false);
    expect(
      screen.getByRole('table', { name: 'Native invoice journal items' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('rowheader', { name: /4000 Clinical income/ }),
    ).toBeInTheDocument();
    expect(screen.getByText(/QorliaQA Grid/)).toBeInTheDocument();
    expect(screen.getByText(/does not post or reconcile/)).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Edit details for item/ }),
    ).toBeEnabled();
    expect(
      screen.queryByRole('columnheader', { name: 'Analytic distribution' }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Back to invoice' }));
    expect(close).toHaveBeenCalledTimes(1);
  });
  it('paginates with the original snapshot and appends rows without replacing totals', async () => {
    const data = invoiceJournalFixture();
    (getInvoiceJournal as jest.Mock)
      .mockResolvedValueOnce({ ...data, total_count: 2, next_after: 17 })
      .mockResolvedValueOnce({
        ...data,
        total_count: 2,
        after: 17,
        rows: [{ ...data.rows[0], id: 18, name: 'QorliaQA Second entry' }],
      });
    show();
    fireEvent.click(
      await screen.findByRole('button', { name: 'Load more journal items' }),
    );
    await screen.findByRole('rowheader', { name: /QorliaQA Second entry/ });
    expect(getInvoiceJournal).toHaveBeenNthCalledWith(2, 7, 17, data.version);
    expect(screen.getByText(/Showing 2 of 2/)).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Load more journal items' }),
    ).not.toBeInTheDocument();
  });
  it('hides all rows on stale pagination and explicitly reloads a fresh first page', async () => {
    const data = invoiceJournalFixture();
    (getInvoiceJournal as jest.Mock)
      .mockResolvedValueOnce({ ...data, total_count: 2, next_after: 17 })
      .mockRejectedValueOnce(
        new Error('The journal changed. Reload all journal items.'),
      )
      .mockResolvedValueOnce({ ...data, version: 'b'.repeat(64) });
    show();
    fireEvent.click(
      await screen.findByRole('button', { name: 'Load more journal items' }),
    );
    await screen.findByRole('alert');
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(getInvoiceJournal).toHaveBeenCalledTimes(2);
    fireEvent.click(
      screen.getByRole('button', { name: 'Reload journal items' }),
    );
    await screen.findByRole('table');
    expect(getInvoiceJournal).toHaveBeenNthCalledWith(3, 7, false, false);
  });
  it('reconnects after expiry without exposing cached journal rows', async () => {
    (getInvoiceJournal as jest.Mock).mockRejectedValue(
      new BillingSessionExpired(),
    );
    show();
    fireEvent.click(
      await screen.findByRole('button', { name: 'Reconnect Billing' }),
    );
    expect(reconnect).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(getInvoiceJournal).toHaveBeenCalledTimes(1);
  });
  it('shows draft and imbalance warnings with optional analytic distribution', async () => {
    const data = invoiceJournalFixture();
    (getInvoiceJournal as jest.Mock).mockResolvedValue({
      ...data,
      state: 'draft',
      balanced: false,
      analytics_visible: true,
      rows: [{ ...data.rows[0], analytic_distribution: { '5,6': 100 } }],
    });
    show();
    await screen.findByText(/not a posted customer balance/);
    expect(screen.getByText(/journal does not balance/)).toBeInTheDocument();
    expect(screen.getByText('Accounts 5,6: 100%')).toBeInTheDocument();
  });
  it('handles empty journals without a misleading balance or hidden paging button', async () => {
    (getInvoiceJournal as jest.Mock).mockResolvedValue({
      ...invoiceJournalFixture(),
      total_count: 0,
      rows: [],
      debit: 0,
      credit: 0,
    });
    show();
    await screen.findByText('No accounting journal items are present.');
    expect(
      screen.queryByRole('button', { name: 'Load more journal items' }),
    ).not.toBeInTheDocument();
  });
});
