import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { BillingSessionExpired, getCustomerStatement } from '../billingService';
import { CustomerStatementModal } from '../CustomerStatementModal';
import { customerStatementFixture } from './customerStatementFixture';

jest.mock('../billingService', () => ({
  ...jest.requireActual('../billingService'),
  getCustomerStatement: jest.fn(),
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
      <CustomerStatementModal
        uid={3}
        invoiceId={7}
        close={close}
        reconnect={reconnect}
      />
    </QueryClientProvider>,
  );
const load = () => {
  fireEvent.change(screen.getByLabelText('From accounting date'), {
    target: { value: '2026-01-01' },
  });
  fireEvent.change(screen.getByLabelText('Through accounting date'), {
    target: { value: '2026-01-31' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Load statement' }));
};
describe('Customer account statement', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (getCustomerStatement as jest.Mock).mockResolvedValue(
      customerStatementFixture(),
    );
  });
  it('requires an explicit dated read and shows ledger totals and source documents, without writes', async () => {
    show();
    expect(getCustomerStatement).not.toHaveBeenCalled();
    load();
    await screen.findByRole('heading', { name: 'QorliaQA Customer' });
    expect(getCustomerStatement).toHaveBeenCalledWith(
      7,
      '2026-01-01',
      '2026-01-31',
    );
    expect(
      screen.getByRole('table', { name: 'Posted customer receivable entries' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('region', {
        name: 'Scrollable customer receivable entries',
      }),
    ).toHaveAttribute('tabindex', '0');
    expect(screen.getByRole('cell', { name: /INV\/7/ })).toBeInTheDocument();
    expect(screen.getByText(/PAY\/9/)).toBeInTheDocument();
    expect(
      screen.getByText('Closing balance').nextElementSibling,
    ).toHaveTextContent('₹600.00');
    fireEvent.click(screen.getByRole('button', { name: 'Back to invoices' }));
    expect(close).toHaveBeenCalledTimes(1);
  });
  it('does not replace the displayed period until the edited dates are submitted and reloads identical periods', async () => {
    show();
    load();
    await screen.findByRole('heading', { name: 'QorliaQA Customer' });
    fireEvent.change(screen.getByLabelText('Through accounting date'), {
      target: { value: '2026-02-28' },
    });
    expect(getCustomerStatement).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/2026-01-01 to 2026-01-31/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Through accounting date'), {
      target: { value: '2026-01-31' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Load statement' }));
    await screen.findByRole('heading', { name: 'QorliaQA Customer' });
    expect(getCustomerStatement).toHaveBeenCalledTimes(2);
  });
  it('keeps an opening balance with no period rows instead of claiming no customer balance', async () => {
    (getCustomerStatement as jest.Mock).mockResolvedValue({
      ...customerStatementFixture(),
      rows: [],
      opening: 200,
      debit: 0,
      credit: 0,
      closing: 200,
    });
    show();
    load();
    await screen.findByText(/No posted receivable entries in this period/);
    expect(
      screen.getByText('Closing balance').nextElementSibling,
    ).toHaveTextContent('₹200.00');
  });
  it('does not retry errors automatically and supports explicit reload', async () => {
    (getCustomerStatement as jest.Mock).mockRejectedValueOnce(
      new Error('Statement denied'),
    );
    show();
    load();
    await screen.findByText('Statement denied');
    expect(getCustomerStatement).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Reload statement' }));
    await screen.findByRole('heading', { name: 'QorliaQA Customer' });
    expect(getCustomerStatement).toHaveBeenCalledTimes(2);
  });
  it('shows expired-session recovery without exposing previous data', async () => {
    (getCustomerStatement as jest.Mock).mockRejectedValue(
      new BillingSessionExpired(),
    );
    show();
    load();
    fireEvent.click(
      await screen.findByRole('button', { name: 'Reconnect Billing' }),
    );
    expect(reconnect).toHaveBeenCalledTimes(1);
    expect(getCustomerStatement).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Load statement' }),
    ).toBeDisabled();
  });
});
