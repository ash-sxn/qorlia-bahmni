import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import {
  BillingSessionExpired,
  getOrderDeliveryPage,
  getOrderTransferDetailPage,
} from '../billingService';
import { OrderDeliveriesPanel } from '../OrderDeliveriesPanel';
import { loadStockWriteRecovery } from '../stockReservationRecovery';
import {
  orderDeliveryFixture,
  orderDeliveryPageFixture,
  orderTransferDetailPageFixture,
} from './orderDeliveryFixture';
import { confirmationRequest } from './stockConfirmationFixture';
import { operationRequest, operationSelection } from './stockOperationFixture';
import { validationRequest } from './stockValidationFixture';

jest.mock('../stockReservationRecovery', () => ({
  ...jest.requireActual('../stockReservationRecovery'),
  loadStockWriteRecovery: jest.fn(),
}));
const mockEditor = jest.fn();
const mockConfirmation = jest.fn();
const mockPagedConfirmation = jest.fn();
jest.mock('../PagedStockConfirmationModal', () => ({
  PagedStockConfirmationModal: (props: { close: () => void }) => {
    mockPagedConfirmation(props);
    return (
      <button onClick={props.close}>Return from complete confirmation</button>
    );
  },
}));
const mockValidation = jest.fn();
jest.mock('../StockValidationModal', () => ({
  StockValidationModal: (props: { close: () => void }) => {
    mockValidation(props);
    return <button onClick={props.close}>Return from validation</button>;
  },
}));
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
  getOrderDeliveryPage: jest.fn(),
  getOrderTransferDetailPage: jest.fn(),
}));
const get = jest.mocked(getOrderDeliveryPage);
const details = jest.mocked(getOrderTransferDetailPage);
let fixture = orderDeliveryFixture();
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
const openTransfer = async () => {
  fireEvent.click(
    await screen.findByRole('button', {
      name: 'View transfer QORLIAQA/OUT/11',
    }),
  );
  await screen.findByRole('table', {
    name: /Demand and reservation quantities/,
  });
};
describe('Order stock transfer review', () => {
  it('opens native validation from details with focus return and refresh, not a raw Validate action', async () => {
    show();
    await openTransfer();
    const opener = screen.getByRole('button', {
      name: 'Review transfer validation',
    });
    await waitFor(() => expect(opener).toBeEnabled());
    fireEvent.click(opener);
    const props = mockValidation.mock.calls.at(-1)?.[0];
    expect(props).toMatchObject({ uid: 3, orderId: 9, transferId: 11 });
    props.returnFocus();
    expect(opener).toHaveFocus();
    fireEvent.click(
      screen.getByRole('button', { name: 'Return from validation' }),
    );
    await waitFor(() => expect(get).toHaveBeenCalledTimes(2));
  });
  it.each([false, true])(
    'resumes validation (step protocol: %s) for its original order and missing transfer, blocking other writes',
    async (step) => {
      jest.mocked(loadStockWriteRecovery).mockResolvedValue({
        ...validationRequest(),
        order_id: 10,
        transfer_id: 12,
        ...(step ? { continuation_key: false } : {}),
      });
      show();
      fireEvent.click(
        await screen.findByRole('button', {
          name: 'Resume validation request',
        }),
      );
      expect(mockValidation.mock.calls.at(-1)?.[0]).toMatchObject({
        uid: 3,
        orderId: 10,
        transferId: 12,
      });
      fireEvent.click(
        screen.getByRole('button', { name: 'Return from validation' }),
      );
      await openTransfer();
      for (const name of [
        'Review transfer validation',
        'Review transfer confirmation',
        'Review stock preparation',
        'Add operation for QA Medicine',
      ])
        expect(screen.getByRole('button', { name })).toBeDisabled();
    },
  );
  it('opens complete confirmation review for a new request and reloads on close', async () => {
    show();
    await openTransfer();
    fireEvent.click(
      screen.getByRole('button', { name: 'Review transfer confirmation' }),
    );
    expect(mockPagedConfirmation.mock.calls.at(-1)?.[0]).toMatchObject({
      uid: 3,
      orderId: 9,
      transferId: 11,
    });
    expect(mockConfirmation).not.toHaveBeenCalled();
    const returnFocus =
      mockPagedConfirmation.mock.calls.at(-1)?.[0].returnFocus;
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
      screen.getByRole('button', { name: 'Return from complete confirmation' }),
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
    fixture = next;
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
  it('routes a completed paged confirmation to its own recovery dialog, even for an off-page order', async () => {
    jest.mocked(loadStockWriteRecovery).mockResolvedValue({
      ...confirmationRequest(),
      order_id: 10,
      transfer_id: 12,
      review_complete_token: 'c'.repeat(64),
    });
    fixture.rows = [];
    show();
    fireEvent.click(
      await screen.findByRole('button', {
        name: 'Resume confirmation request',
      }),
    );
    expect(mockPagedConfirmation.mock.calls.at(-1)?.[0]).toMatchObject({
      uid: 3,
      orderId: 10,
      transferId: 12,
    });
    expect(mockConfirmation).not.toHaveBeenCalled();
  });
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(loadStockWriteRecovery).mockResolvedValue(null);
    fixture = orderDeliveryFixture();
    get
      .mockReset()
      .mockImplementation(async (_order, after = 0, _version, limit = 25) =>
        orderDeliveryPageFixture(fixture, after, limit),
      );
    details
      .mockReset()
      .mockImplementation(
        async (order, id, section, after = 0, version, limit = 50) => {
          if (order !== fixture.order_id || version !== fixture.version)
            throw new Error('Native snapshot changed.');
          return orderTransferDetailPageFixture(
            section,
            fixture,
            id,
            after,
            limit,
          );
        },
      );
  });
  it('shows native transfers then exact demand, operation units, batches and no invented completion', async () => {
    show();
    await openTransfer();
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
    expect(get).toHaveBeenCalledWith(9, 0, false, 25);
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
    fixture = { ...orderDeliveryFixture(), rows: [] };
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
    await openTransfer();
    fixture = {
      ...orderDeliveryFixture(),
      rows: [{ ...orderDeliveryFixture().rows[0], id: 22 }],
    };
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
    await openTransfer();
    fireEvent.click(
      screen.getByRole('button', { name: 'Review stock preparation' }),
    );
    const refreshed = orderDeliveryFixture();
    refreshed.rows[0].moves[0].reserved = 12;
    fixture = refreshed;
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
    await openTransfer();
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
    fixture = next;
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
    fixture = next;
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
    await openTransfer();
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
    await openTransfer();
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
