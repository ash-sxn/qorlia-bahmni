import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { BillingSessionExpired, getOrderDeliveries } from '../billingService';
import { OrderDeliveriesPanel } from '../OrderDeliveriesPanel';
import { orderDeliveryFixture } from './orderDeliveryFixture';
import { loadStockReservationRecovery } from '../stockReservationRecovery';

jest.mock('../stockReservationRecovery', () => ({
  loadStockReservationRecovery: jest.fn(),
}));

jest.mock('../billingService', () => ({
  ...jest.requireActual('../billingService'),
  getOrderDeliveries: jest.fn(),
}));
const get = jest.mocked(getOrderDeliveries);
const close = jest.fn();
const reconnect = jest.fn();
const show = () =>
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <OrderDeliveriesPanel
        uid={3}
        orderId={9}
        close={close}
        reconnect={reconnect}
      />
    </QueryClientProvider>,
  );
describe('Order stock transfer review', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(loadStockReservationRecovery).mockResolvedValue(null);
    get.mockResolvedValue(orderDeliveryFixture());
  });
  it('shows native transfers then exact demand, operation units, batches and no invented completion', async () => {
    show();
    fireEvent.click(
      await screen.findByRole('button', {
        name: 'View transfer QORLIAQA/OUT/11',
      }),
    );
    const table = screen.getByRole('table', {
      name: /Detailed operations, quantities/,
    });
    expect(within(table).getByText('Dozens')).toBeInTheDocument();
    expect(within(table).getAllByText('0.5')).toHaveLength(2);
    expect(within(table).getByText('QA-BATCH')).toBeInTheDocument();
    expect(within(table).getByText('2027-01-01 00:00:00')).toBeInTheDocument();
    expect(
      screen.getByText(/not a completed transfer until its status is Done/),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /Validate|Dispense|Pay/ }),
    ).not.toBeInTheDocument();
    expect(get).toHaveBeenCalledWith(9);
    fireEvent.click(
      screen.getByRole('button', { name: 'All order transfers' }),
    );
    await screen.findByRole('button', {
      name: 'View transfer QORLIAQA/OUT/11',
    });
    fireEvent.click(
      screen.getByRole('button', { name: 'Back to order details' }),
    );
    expect(close).toHaveBeenCalledTimes(1);
  });
  it('renders empty service orders without inventing stock quantities', async () => {
    get.mockResolvedValue({ ...orderDeliveryFixture(), rows: [] });
    show();
    await screen.findByText(/No stock transfers are linked/);
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });
  it('hides stale transfers on failed refresh and restores on successful reload', async () => {
    show();
    await screen.findByRole('table');
    get.mockRejectedValueOnce(new Error('Temporary transfer failure'));
    fireEvent.click(screen.getByRole('button', { name: 'Refresh transfers' }));
    await screen.findByText(/Temporary transfer failure/);
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Refresh transfers' }));
    await screen.findByRole('table');
    expect(get).toHaveBeenCalledTimes(3);
  });
  it('offers reconnect for an expired native Billing session', async () => {
    get.mockRejectedValueOnce(new BillingSessionExpired());
    show();
    fireEvent.click(
      await screen.findByRole('button', { name: 'Reconnect Billing' }),
    );
    expect(reconnect).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Your Billing session expired',
    );
  });
  it('does not retain a transfer that disappeared from the refreshed order', async () => {
    show();
    fireEvent.click(
      await screen.findByRole('button', {
        name: 'View transfer QORLIAQA/OUT/11',
      }),
    );
    get.mockResolvedValue({
      ...orderDeliveryFixture(),
      rows: [{ ...orderDeliveryFixture().rows[0], id: 22 }],
    });
    fireEvent.click(screen.getByRole('button', { name: 'Refresh transfers' }));
    await screen.findByText(/no longer linked to the order/);
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    fireEvent.click(
      screen.getByRole('button', { name: 'All order transfers' }),
    );
    await waitFor(() => expect(screen.getByRole('table')).toBeInTheDocument());
  });
});
