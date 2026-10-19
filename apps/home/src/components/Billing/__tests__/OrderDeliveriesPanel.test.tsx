import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  act,
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
import { request as cancellationRequest } from './stockCancellationPagedFixture';
import { confirmationRequest } from './stockConfirmationFixture';
import { operationRequest, operationSelection } from './stockOperationFixture';
import { stockRequest } from './stockReservationFixture';
import { returnRequest } from './stockReturnPagedFixture';
import { validationRequest } from './stockValidationFixture';

jest.mock('../stockReservationRecovery', () => ({
  ...jest.requireActual('../stockReservationRecovery'),
  loadStockWriteRecovery: jest.fn(),
}));
const mockEditor = jest.fn();
const mockPagedEditor = jest.fn();
const mockLegacyEditor = jest.fn();
jest.mock('../PagedStockOperationEditor', () => ({
  PagedStockOperationEditor: (props: { close: () => void }) => {
    mockPagedEditor(props);
    mockEditor(props);
    return <button onClick={props.close}>Return from operation</button>;
  },
}));
const mockConfirmation = jest.fn();
const mockPagedConfirmation = jest.fn();
const mockPagedReservation = jest.fn();
const mockLegacyReservation = jest.fn();
jest.mock('../PagedStockReservationModal', () => ({
  PagedStockReservationModal: (props: { close: () => void }) => {
    mockPagedReservation(props);
    return (
      <button onClick={props.close}>Return from complete preparation</button>
    );
  },
}));
jest.mock('../PagedStockConfirmationModal', () => ({
  PagedStockConfirmationModal: (props: { close: () => void }) => {
    mockPagedConfirmation(props);
    return (
      <button onClick={props.close}>Return from complete confirmation</button>
    );
  },
}));
const mockValidation = jest.fn();
const mockPagedValidation = jest.fn();
const mockPagedReturn = jest.fn();
const mockPagedCancellation = jest.fn();
const mockInventoryDetails = jest.fn();
jest.mock('../InventoryTransferDetails', () => ({
  InventoryTransferDetails: (props: { close: () => void }) => {
    mockInventoryDetails(props);
    return (
      <button onClick={props.close}>
        Back from returned Inventory transfer
      </button>
    );
  },
}));
jest.mock('../PagedStockCancellationModal', () => ({
  PagedStockCancellationModal: (props: { close: () => void }) => {
    mockPagedCancellation(props);
    return (
      <button onClick={props.close}>Return from complete cancellation</button>
    );
  },
}));
jest.mock('../PagedStockReturnModal', () => ({
  PagedStockReturnModal: (props: { close: () => void }) => {
    mockPagedReturn(props);
    return <button onClick={props.close}>Return from complete return</button>;
  },
}));
jest.mock('../PagedStockValidationModal', () => ({
  PagedStockValidationModal: (props: { close: () => void }) => {
    mockPagedValidation(props);
    return (
      <button onClick={props.close}>Return from complete validation</button>
    );
  },
}));
const mockSavedValidation = jest.fn();
jest.mock('../SavedValidationRecoveryModal', () => ({
  SavedValidationRecoveryModal: (props: {
    close: () => void;
    continueReview: () => void;
    continueCompleteReview: () => void;
  }) => {
    mockSavedValidation(props);
    return (
      <>
        <button onClick={props.close}>Return from saved validation</button>
        <button onClick={props.continueReview}>
          Continue saved validation
        </button>
        <button onClick={props.continueCompleteReview}>
          Continue complete saved validation
        </button>
      </>
    );
  },
}));
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
    mockLegacyEditor(props);
    mockEditor(props);
    return <button onClick={props.close}>Return from operation</button>;
  },
}));
jest.mock('../StockReservationModal', () => ({
  StockReservationModal: (props: { close: () => void }) => {
    mockLegacyReservation(props);
    return <button onClick={props.close}>Return from reservation</button>;
  },
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
const show = (closeLabel?: string) =>
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
        closeLabel={closeLabel}
        reconnect={reconnect}
      />
    </QueryClientProvider>,
  );
it('focuses the transfer heading and returns to Billing when opened from saved recovery', () => {
  show('Back to Billing');
  expect(
    screen.getByRole('heading', { name: 'Order stock transfers' }),
  ).toHaveFocus();
  expect(
    screen.queryByRole('button', { name: 'Back to order details' }),
  ).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Back to Billing' }));
  expect(close).toHaveBeenCalledTimes(1);
});

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
  it('recovers a global return encountered from Sales and routes its actual created transfer to Inventory', async () => {
    jest
      .mocked(loadStockWriteRecovery)
      .mockResolvedValue({ ...returnRequest(), order_id: false });
    show();
    fireEvent.click(
      await screen.findByRole('button', { name: 'Resume return request' }),
    );
    const props = mockPagedReturn.mock.calls.at(-1)![0];
    expect(props).toMatchObject({ uid: 3, orderId: false, transferId: 11 });
    jest.mocked(loadStockWriteRecovery).mockResolvedValue(null);
    act(() => props.openTransfer(false, 19));
    expect(mockInventoryDetails.mock.calls.at(-1)![0]).toMatchObject({
      uid: 3,
      transferId: 19,
    });
    fireEvent.click(
      screen.getByRole('button', {
        name: 'Back from returned Inventory transfer',
      }),
    );
    expect(
      await screen.findByRole('heading', { name: 'Order stock transfers' }),
    ).toBeInTheDocument();
    for (const call of get.mock.calls) expect(call[0]).toBe(9);
  });
  it.each(['draft', 'waiting', 'confirmed', 'assigned'] as const)(
    'opens reviewed native cancellation for %s transfers with focus restoration and refresh',
    async (state) => {
      fixture.rows[0].state = state;
      show();
      await openTransfer();
      const button = screen.getByRole('button', {
        name: 'Review transfer cancellation',
      });
      await waitFor(() => expect(button).toBeEnabled());
      fireEvent.click(button);
      const props = mockPagedCancellation.mock.calls.at(-1)?.[0];
      expect(props).toMatchObject({ uid: 3, orderId: 9, transferId: 11 });
      props.returnFocus();
      expect(button).toHaveFocus();
      fireEvent.click(
        screen.getByRole('button', {
          name: 'Return from complete cancellation',
        }),
      );
      await waitFor(() => expect(get).toHaveBeenCalledTimes(2));
      expect(mockPagedConfirmation).not.toHaveBeenCalled();
      expect(mockPagedReservation).not.toHaveBeenCalled();
    },
  );
  it.each(['done', 'cancel'] as const)(
    'does not offer cancellation for %s transfers',
    async (state) => {
      fixture.rows[0].state = state;
      show();
      await openTransfer();
      expect(
        screen.queryByRole('button', { name: 'Review transfer cancellation' }),
      ).not.toBeInTheDocument();
      expect(mockPagedCancellation).not.toHaveBeenCalled();
    },
  );
  it('resumes the original off-page cancellation and keeps other native actions locked', async () => {
    jest.mocked(loadStockWriteRecovery).mockResolvedValue({
      ...cancellationRequest(),
      order_id: 42,
      transfer_id: 57,
    });
    show();
    await openTransfer();
    for (const name of [
      'Review transfer cancellation',
      'Review transfer validation',
      'Review transfer confirmation',
      'Review stock preparation',
    ])
      expect(screen.getByRole('button', { name })).toBeDisabled();
    fireEvent.click(
      screen.getByRole('button', { name: 'Resume cancellation request' }),
    );
    expect(mockPagedCancellation.mock.calls.at(-1)?.[0]).toMatchObject({
      uid: 3,
      orderId: 42,
      transferId: 57,
    });
    expect(mockPagedConfirmation).not.toHaveBeenCalled();
    expect(mockPagedReservation).not.toHaveBeenCalled();
    expect(mockPagedValidation).not.toHaveBeenCalled();
  });
  it('blocks cancellation while recovery storage is unavailable', async () => {
    jest
      .mocked(loadStockWriteRecovery)
      .mockRejectedValue(new Error('Recovery unavailable'));
    show();
    await openTransfer();
    await screen.findByText('Recovery unavailable');
    expect(
      screen.getByRole('button', { name: 'Review transfer cancellation' }),
    ).toBeDisabled();
  });
  it('offers complete return only for completed transfers and restores focus on close', async () => {
    fixture.rows[0].state = 'done';
    show();
    await openTransfer();
    const opener = screen.getByRole('button', { name: 'Review stock return' });
    await waitFor(() => expect(opener).toBeEnabled());
    fireEvent.click(opener);
    const props = mockPagedReturn.mock.calls.at(-1)?.[0];
    expect(props).toMatchObject({ uid: 3, orderId: 9, transferId: 11 });
    props.returnFocus();
    expect(opener).toHaveFocus();
    fireEvent.click(
      screen.getByRole('button', { name: 'Return from complete return' }),
    );
    await waitFor(() => expect(get).toHaveBeenCalledTimes(2));
    expect(mockPagedConfirmation).not.toHaveBeenCalled();
  });
  it('does not offer return creation for uncompleted transfers', async () => {
    show();
    await openTransfer();
    expect(
      screen.queryByRole('button', { name: 'Review stock return' }),
    ).not.toBeInTheDocument();
  });
  it('resumes the original return scope and opens its actual created transfer even for another order', async () => {
    const pending = { ...returnRequest(), order_id: 10, transfer_id: 99 };
    jest.mocked(loadStockWriteRecovery).mockResolvedValue(pending);
    show();
    fireEvent.click(
      await screen.findByRole('button', { name: 'Resume return request' }),
    );
    const props = mockPagedReturn.mock.calls.at(-1)?.[0];
    expect(props).toMatchObject({ uid: 3, orderId: 10, transferId: 99 });
    expect(mockPagedConfirmation).not.toHaveBeenCalled();
    expect(mockPagedValidation).not.toHaveBeenCalled();
    expect(mockPagedReservation).not.toHaveBeenCalled();
    fixture.order_id = 10;
    fixture.order_name = 'QORLIAQA-OTHER-ORDER';
    fixture.rows[0] = { ...fixture.rows[0], id: 19, name: 'QA/RETURN/19' };
    jest.mocked(loadStockWriteRecovery).mockResolvedValue(null);
    act(() => props.openTransfer(10, 19));
    await screen.findByRole('heading', { name: 'QA/RETURN/19' });
    expect(screen.getByRole('heading', { name: 'QA/RETURN/19' })).toHaveFocus();
    expect(get).toHaveBeenLastCalledWith(10, 0, false, 25);
    expect(details).toHaveBeenCalledWith(
      10,
      19,
      'moves',
      0,
      fixture.version,
      50,
    );
    expect(
      screen.getByRole('button', { name: 'Review transfer validation' }),
    ).toBeEnabled();
  });
  it('opens native validation from details with focus return and refresh, not a raw Validate action', async () => {
    show();
    await openTransfer();
    const opener = screen.getByRole('button', {
      name: 'Review transfer validation',
    });
    await waitFor(() => expect(opener).toBeEnabled());
    fireEvent.click(opener);
    const props = mockPagedValidation.mock.calls.at(-1)?.[0];
    expect(props).toMatchObject({ uid: 3, orderId: 9, transferId: 11 });
    props.returnFocus();
    expect(opener).toHaveFocus();
    fireEvent.click(
      screen.getByRole('button', { name: 'Return from complete validation' }),
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
      const reader = step ? mockSavedValidation : mockValidation;
      expect(reader.mock.calls.at(-1)?.[0]).toMatchObject(
        step
          ? {
              uid: 3,
              request: {
                ...validationRequest(),
                order_id: 10,
                transfer_id: 12,
                continuation_key: false,
              },
            }
          : { uid: 3, orderId: 10, transferId: 12 },
      );
      expect(mockValidation).toHaveBeenCalledTimes(step ? 0 : 1);
      fireEvent.click(
        screen.getByRole('button', {
          name: step
            ? 'Return from saved validation'
            : 'Return from validation',
        }),
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
  it('hands an explicitly continued saved step to the original writer without changing its scope', async () => {
    jest.mocked(loadStockWriteRecovery).mockResolvedValue({
      ...validationRequest(),
      order_id: 10,
      transfer_id: 12,
      continuation_key: false,
    });
    show();
    fireEvent.click(
      await screen.findByRole('button', { name: 'Resume validation request' }),
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Continue saved validation' }),
    );
    expect(mockValidation.mock.calls.at(-1)?.[0]).toMatchObject({
      uid: 3,
      orderId: 10,
      transferId: 12,
    });
    expect(
      screen.queryByRole('button', { name: 'Return from saved validation' }),
    ).not.toBeInTheDocument();
  });
  it('routes schema-6 recovery to the complete writer for its original order without stripping proofs', async () => {
    const pending = {
      ...validationRequest(),
      order_id: 10,
      transfer_id: 12,
      continuation_key: false as const,
      review_complete_token: 'c'.repeat(64),
    };
    jest.mocked(loadStockWriteRecovery).mockResolvedValue(pending);
    show();
    fireEvent.click(
      await screen.findByRole('button', { name: 'Resume validation request' }),
    );
    expect(mockPagedValidation.mock.calls.at(-1)?.[0]).toMatchObject({
      uid: 3,
      orderId: 10,
      transferId: 12,
    });
    expect(mockSavedValidation).not.toHaveBeenCalled();
    expect(mockValidation).not.toHaveBeenCalled();
    expect(jest.mocked(loadStockWriteRecovery)).toHaveBeenCalledWith(3);
  });
  it('hands an accepted saved step to complete review explicitly, preserving its exact legacy parent', async () => {
    const parent = { ...validationRequest(), continuation_key: false as const };
    jest.mocked(loadStockWriteRecovery).mockResolvedValue(parent);
    show();
    fireEvent.click(
      await screen.findByRole('button', { name: 'Resume validation request' }),
    );
    fireEvent.click(
      screen.getByRole('button', {
        name: 'Continue complete saved validation',
      }),
    );
    expect(mockPagedValidation.mock.calls.at(-1)?.[0]).toMatchObject({
      uid: 3,
      orderId: 9,
      transferId: 11,
      legacyParent: parent,
    });
    expect(mockValidation).not.toHaveBeenCalled();
  });
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
    const props = mockPagedReservation.mock.calls.at(-1)?.[0];
    expect(props).toMatchObject({ uid: 3, orderId: 9, transferId: 11 });
    props.returnFocus();
    expect(
      screen.getByRole('button', { name: 'Review stock preparation' }),
    ).toHaveFocus();
    expect(mockLegacyReservation).not.toHaveBeenCalled();
    const refreshed = orderDeliveryFixture();
    refreshed.rows[0].moves[0].reserved = 12;
    fixture = refreshed;
    fireEvent.click(
      screen.getByRole('button', { name: 'Return from complete preparation' }),
    );
    await waitFor(() => expect(get).toHaveBeenCalledTimes(2));
    const table = await screen.findByRole('table', {
      name: /Demand and reservation quantities/,
    });
    await waitFor(() =>
      expect(within(table).getAllByText('12')).toHaveLength(2),
    );
  });
  it.each([false, true])(
    'resumes preparation with its original order and protocol (paged: %s)',
    async (paged) => {
      jest.mocked(loadStockWriteRecovery).mockResolvedValue({
        ...stockRequest(),
        order_id: 10,
        transfer_id: 12,
        ...(paged ? { review_complete_token: 'd'.repeat(64) } : {}),
      });
      show();
      fireEvent.click(
        await screen.findByRole('button', {
          name: 'Resume reservation request',
        }),
      );
      const called = paged ? mockPagedReservation : mockLegacyReservation;
      expect(called.mock.calls.at(-1)?.[0]).toMatchObject({
        uid: 3,
        orderId: 10,
        transferId: 12,
      });
      expect(
        paged ? mockLegacyReservation : mockPagedReservation,
      ).not.toHaveBeenCalled();
      fireEvent.click(
        screen.getByRole('button', {
          name: paged
            ? 'Return from complete preparation'
            : 'Return from reservation',
        }),
      );
      await openTransfer();
      expect(
        screen.getByRole('button', { name: 'Review stock preparation' }),
      ).toBeDisabled();
    },
  );
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
    expect(mockPagedEditor.mock.calls.at(-1)?.[0]).toMatchObject({
      uid: 3,
      returnFocus: expect.any(Function),
    });
    expect(mockLegacyEditor).not.toHaveBeenCalled();
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
    expect(mockLegacyEditor).toHaveBeenCalled();
    expect(mockPagedEditor).not.toHaveBeenCalled();
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
  it.each(['save', 'delete'] as const)(
    'resumes completed %s in its original off-page operation, never the legacy editor',
    async (action) => {
      const pending = {
        ...operationRequest(),
        action,
        edits: action === 'delete' ? [] : operationRequest().edits,
        review_complete_token: 'd'.repeat(64),
        order_id: 99,
        transfer_id: 98,
      };
      jest.mocked(loadStockWriteRecovery).mockResolvedValue(pending);
      show();
      fireEvent.click(
        await screen.findByRole('button', { name: 'Resume operation request' }),
      );
      expect(mockPagedEditor.mock.calls.at(-1)?.[0]).toMatchObject({
        uid: 3,
        selection: { ...operationSelection(), order_id: 99, transfer_id: 98 },
      });
      expect(mockLegacyEditor).not.toHaveBeenCalled();
      fireEvent.click(
        screen.getByRole('button', { name: 'Return from operation' }),
      );
      await openTransfer();
      expect(
        screen.getByRole('button', { name: 'Edit operation #13' }),
      ).toBeDisabled();
      expect(
        screen.getByRole('button', { name: 'Review stock preparation' }),
      ).toBeDisabled();
    },
  );
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
