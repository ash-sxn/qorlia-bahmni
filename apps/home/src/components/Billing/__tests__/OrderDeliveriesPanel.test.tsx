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
import { loadStockWriteRecovery } from '../stockReservationRecovery';
import { orderDeliveryFixture } from './orderDeliveryFixture';
import { confirmationRequest } from './stockConfirmationFixture';
import { operationRequest, operationSelection } from './stockOperationFixture';

jest.mock('../stockReservationRecovery', () => ({
  ...jest.requireActual('../stockReservationRecovery'),
  loadStockWriteRecovery: jest.fn(),
}));
const mockEditor = jest.fn();
const mockConfirmation = jest.fn();
jest.mock('../StockConfirmationModal', () => ({
  StockConfirmationModal: (props: { close: () => void }) => {
    mockConfirmation(props);
    return <button onClick={props.close}>Return from confirmation</button>;
  },
}));
jest.mock('../StockOperationEditor', () => ({
  StockOperationEditor: (props: { close: () => void }) => {
    mockEditor(props);
    return <button onClick={props.close}>Return from operation</button>;
  },
}));
jest.mock('../StockReservationModal', () => ({
  StockReservationModal: ({ close }: { close: () => void }) => (
    <button onClick={close}>Return from reservation</button>
  ),
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
  it('opens the native confirmation review from transfer details and reloads on close', async () => {
    show();
    fireEvent.click(
      await screen.findByRole('button', {
        name: 'View transfer QORLIAQA/OUT/11',
      }),
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Review transfer confirmation' }),
    );
    expect(mockConfirmation.mock.calls.at(-1)?.[0]).toMatchObject({
      uid: 3,
      orderId: 9,
      transferId: 11,
    });
    const returnFocus = mockConfirmation.mock.calls.at(-1)?.[0].returnFocus;
    const opener = screen.getByRole('button', {
      name: 'Review transfer confirmation',
    });
    returnFocus();
    expect(opener).toHaveFocus();
    opener.setAttribute('disabled', '');
    returnFocus();
    expect(
      screen.getByRole('button', { name: 'Back to order details' }),
    ).toHaveFocus();
    fireEvent.click(
      screen.getByRole('button', { name: 'Return from confirmation' }),
    );
    await waitFor(() => expect(get).toHaveBeenCalledTimes(2));
  });
  it('resumes pending confirmation even after its native transfer no longer appears in the displayed order', async () => {
    jest.mocked(loadStockWriteRecovery).mockResolvedValue({
      ...confirmationRequest(),
      order_id: 10,
      transfer_id: 12,
    });
    const next = orderDeliveryFixture();
    next.rows = [];
    get.mockResolvedValue(next);
    show();
    fireEvent.click(
      await screen.findByRole('button', {
        name: 'Resume confirmation request',
      }),
    );
    expect(mockConfirmation.mock.calls.at(-1)?.[0]).toMatchObject({
      uid: 3,
      orderId: 10,
      transferId: 12,
    });
  });
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(loadStockWriteRecovery).mockResolvedValue(null);
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
  it('reloads saved transfer quantities when a reservation view closes before finish', async () => {
    show();
    fireEvent.click(
      await screen.findByRole('button', {
        name: 'View transfer QORLIAQA/OUT/11',
      }),
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Review stock preparation' }),
    );
    const refreshed = orderDeliveryFixture();
    refreshed.rows[0].moves[0].reserved = 12;
    get.mockResolvedValue(refreshed);
    fireEvent.click(
      screen.getByRole('button', { name: 'Return from reservation' }),
    );
    await waitFor(() => expect(get).toHaveBeenCalledTimes(2));
    const table = await screen.findByRole('table', {
      name: /Demand and reservation quantities/,
    });
    await waitFor(() =>
      expect(within(table).getAllByText('12')).toHaveLength(2),
    );
  });
  it('opens new and saved operations with their exact move identities, then reloads saved values', async () => {
    show();
    fireEvent.click(
      await screen.findByRole('button', {
        name: 'View transfer QORLIAQA/OUT/11',
      }),
    );
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Add operation for QA Medicine' }),
      ).toBeEnabled(),
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Add operation for QA Medicine' }),
    );
    expect(mockEditor.mock.calls.at(-1)?.[0]).toMatchObject({
      uid: 3,
      selection: { ...operationSelection(), operation_id: false },
    });
    fireEvent.click(
      screen.getByRole('button', { name: 'Return from operation' }),
    );
    await waitFor(() => expect(get).toHaveBeenCalledTimes(2));
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Edit operation #13' }),
      ).toBeEnabled(),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Edit operation #13' }));
    expect(mockEditor.mock.calls.at(-1)?.[0]).toMatchObject({
      selection: operationSelection(),
    });
    const next = orderDeliveryFixture();
    next.rows[0].operations[0].done = 2;
    get.mockResolvedValue(next);
    fireEvent.click(
      screen.getByRole('button', { name: 'Return from operation' }),
    );
    await waitFor(() => expect(get).toHaveBeenCalledTimes(3));
    await waitFor(() =>
      expect(
        within(
          screen.getByRole('table', {
            name: /Detailed operations, quantities/,
          }),
        ).getByText('2'),
      ).toBeInTheDocument(),
    );
  });
  it('routes a pending deletion to recovery even if its operation row is gone, blocking new writes', async () => {
    const pending = {
      ...operationRequest(),
      action: 'delete' as const,
      edits: [],
    };
    jest.mocked(loadStockWriteRecovery).mockResolvedValue(pending);
    const next = orderDeliveryFixture();
    next.rows[0].operations = [];
    get.mockResolvedValue(next);
    show();
    fireEvent.click(
      await screen.findByRole('button', { name: 'Resume operation request' }),
    );
    expect(mockEditor.mock.calls.at(-1)?.[0]).toMatchObject({
      selection: operationSelection(),
    });
    fireEvent.click(
      screen.getByRole('button', { name: 'Return from operation' }),
    );
    fireEvent.click(
      await screen.findByRole('button', {
        name: 'View transfer QORLIAQA/OUT/11',
      }),
    );
    expect(
      screen.getByRole('button', { name: 'Add operation for QA Medicine' }),
    ).toBeDisabled();
    expect(
      screen.getByRole('button', { name: 'Review stock preparation' }),
    ).toBeDisabled();
    expect(
      screen.getByRole('button', { name: 'Review transfer confirmation' }),
    ).toBeDisabled();
  });
  it('blocks new stock actions when recovery storage fails and supports an explicit reload', async () => {
    jest
      .mocked(loadStockWriteRecovery)
      .mockRejectedValueOnce(new Error('Storage failed'));
    show();
    fireEvent.click(
      await screen.findByRole('button', {
        name: 'View transfer QORLIAQA/OUT/11',
      }),
    );
    expect(
      screen.getByRole('button', { name: 'Edit operation #13' }),
    ).toBeDisabled();
    fireEvent.click(
      screen.getByRole('button', { name: 'Reload stock recovery' }),
    );
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Edit operation #13' }),
      ).toBeEnabled(),
    );
  });
});
