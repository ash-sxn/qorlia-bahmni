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
  BillingActionRejected,
  BillingSessionExpired,
  getStockConfirmation,
  getStockConfirmationStatus,
  previewStockConfirmation,
  saveStockConfirmation,
  StockConfirmationRequest,
} from '../billingService';
import { StockConfirmationModal } from '../StockConfirmationModal';
import {
  clearStockConfirmationRecovery,
  loadStockConfirmationRecovery,
  persistStockConfirmationRecovery,
} from '../stockReservationRecovery';
import {
  confirmationLoad,
  confirmationRequest,
  confirmationReview,
  confirmationStatus,
} from './stockConfirmationFixture';

jest.mock('../billingService', () => ({
  ...jest.requireActual('../billingService'),
  getStockConfirmation: jest.fn(),
  getStockConfirmationStatus: jest.fn(),
  previewStockConfirmation: jest.fn(),
  saveStockConfirmation: jest.fn(),
}));
jest.mock('../stockReservationRecovery', () => ({
  loadStockConfirmationRecovery: jest.fn(),
  persistStockConfirmationRecovery: jest.fn(),
  clearStockConfirmationRecovery: jest.fn(),
}));
const get = jest.mocked(getStockConfirmation),
  preview = jest.mocked(previewStockConfirmation),
  save = jest.mocked(saveStockConfirmation),
  status = jest.mocked(getStockConfirmationStatus);
const load = jest.mocked(loadStockConfirmationRecovery),
  persist = jest.mocked(persistStockConfirmationRecovery),
  clear = jest.mocked(clearStockConfirmationRecovery);
const close = jest.fn(),
  reconnect = jest.fn();
let disk: StockConfirmationRequest | null;
const element = (client: QueryClient, uid = 3) => (
  <QueryClientProvider client={client}>
    <StockConfirmationModal
      uid={uid}
      orderId={9}
      transferId={11}
      close={close}
      reconnect={reconnect}
    />
  </QueryClientProvider>
);
const show = () => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return { ...render(element(client)), client };
};
const review = async () => {
  fireEvent.click(
    await screen.findByRole('button', { name: 'Review Mark as Todo' }),
  );
  await screen.findByRole('region', { name: 'Reviewed confirmation effects' });
};
describe('Reviewed native transfer confirmation UI', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    disk = null;
    get.mockResolvedValue(confirmationLoad());
    preview.mockResolvedValue(confirmationReview());
    save.mockResolvedValue(confirmationStatus());
    status.mockResolvedValue(confirmationStatus());
    load.mockImplementation(async () => disk);
    persist.mockImplementation(async (_uid, exact) => {
      disk = exact;
      return exact;
    });
    clear.mockImplementation(async () => {
      disk = null;
      return null;
    });
    Object.defineProperty(crypto, 'randomUUID', {
      configurable: true,
      value: () => confirmationRequest().request_key,
    });
  });
  it('reviews all native effect kinds, assigned metadata and protected audit counts without executing markup', async () => {
    const data = confirmationReview();
    data.effects.deleted['stock.move'] = [
      { id: 99, values: { state: 'draft', product_uom_qty: 0 } },
    ];
    preview.mockResolvedValue(data);
    const view = show();
    await review();
    expect(preview).toHaveBeenCalledWith({
      order_id: 9,
      transfer_id: 11,
      version: confirmationLoad().version,
    });
    expect(save).not.toHaveBeenCalled();
    const region = screen.getByRole('region', {
      name: 'Reviewed confirmation effects',
    });
    expect(
      within(region).getByText('Stock move: 0 created, 1 changed, 1 removed'),
    ).toBeInTheDocument();
    expect(
      within(region).getByText(/Tracked audit change: 2 created/),
    ).toBeInTheDocument();
    fireEvent.click(within(region).getByText('Create: New stock transfer 1'));
    expect(
      within(region).getByText('Assigned by the native system on save'),
    ).toBeInTheDocument();
    expect(within(region).getByText('2026-10-15T10:00:00')).toBeInTheDocument();
    fireEvent.click(within(region).getByText('Create: New audit message 1'));
    expect(
      within(region).getByText(
        '<img src=x onerror="alert(1)">Native audit text',
      ),
    ).toBeInTheDocument();
    expect(region.querySelector('img')).toBeNull();
    expect(view.container.querySelector('script')).toBeNull();
  });
  it('persists the exact request before HTTP, blocks double-click and closes only after fresh receipt and exact clear', async () => {
    let done!: (value: ReturnType<typeof confirmationStatus>) => void;
    save.mockImplementation(
      () =>
        new Promise((resolve) => {
          done = resolve;
        }),
    );
    const { client } = show();
    const invalidated = jest.spyOn(client, 'invalidateQueries');
    await review();
    const button = screen.getByRole('button', {
      name: 'Save reviewed confirmation',
    });
    fireEvent.click(button);
    fireEvent.click(button);
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    expect(disk).toEqual(confirmationRequest());
    expect(persist.mock.invocationCallOrder[0]).toBeLessThan(
      save.mock.invocationCallOrder[0],
    );
    expect(
      screen.getByRole('button', { name: 'Back to stock transfers' }),
    ).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    fireEvent.keyDown(screen.getByRole('dialog'), {
      key: 'Escape',
      code: 'Escape',
      keyCode: 27,
    });
    expect(close).not.toHaveBeenCalled();
    await act(async () => done(confirmationStatus()));
    expect(
      await screen.findByText('Stock transfer: QA/IN/18 (#18)'),
    ).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole('button', { name: 'Finish and reload transfers' }),
    );
    await waitFor(() => expect(close).toHaveBeenCalledTimes(1));
    expect(status).toHaveBeenCalledWith(confirmationRequest());
    expect(clear).toHaveBeenCalledWith(3, confirmationRequest());
    expect(invalidated).toHaveBeenCalledWith({
      queryKey: ['billing', 'order-deliveries', 3],
    });
  });
  it('keeps unknown outcomes and retries only the identical request after checking status', async () => {
    save.mockRejectedValueOnce(new Error('Response lost'));
    status.mockResolvedValueOnce(confirmationStatus(false));
    show();
    await review();
    fireEvent.click(
      screen.getByRole('button', { name: 'Save reviewed confirmation' }),
    );
    await screen.findByText('Response lost');
    expect(disk).toEqual(confirmationRequest());
    expect(clear).not.toHaveBeenCalled();
    fireEvent.click(
      screen.getByRole('button', { name: 'Check confirmation request' }),
    );
    await screen.findByText(/No receipt found yet/);
    fireEvent.click(
      screen.getByRole('button', {
        name: /Retry identical confirmation request/,
      }),
    );
    await screen.findByRole('button', { name: 'Finish and reload transfers' });
    expect(save.mock.calls).toEqual([
      [confirmationRequest()],
      [confirmationRequest()],
    ]);
  });
  it('resumes a request for another transfer without a new review or automatic write', async () => {
    disk = { ...confirmationRequest(), order_id: 10, transfer_id: 12 };
    const current = confirmationLoad();
    current.order_id = 10;
    current.transfer_id = 12;
    current.graph.transfer.id = 12;
    get.mockResolvedValue(current);
    show();
    await screen.findByText(/A previous confirmation for this order/);
    expect(get).toHaveBeenCalledWith(10, 12);
    expect(preview).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
    expect(
      screen.queryByRole('button', { name: 'Review Mark as Todo' }),
    ).not.toBeInTheDocument();
  });
  it('does not issue HTTP if durable storage fails, and supports an explicit reload after a load failure', async () => {
    load.mockRejectedValueOnce(new Error('Storage unavailable'));
    show();
    await screen.findByText('Storage unavailable');
    expect(get).not.toHaveBeenCalled();
    fireEvent.click(
      screen.getByRole('button', { name: 'Reload confirmation state' }),
    );
    await review();
    persist.mockRejectedValueOnce(new Error('Storage commit failed'));
    fireEvent.click(
      screen.getByRole('button', { name: 'Save reviewed confirmation' }),
    );
    await screen.findByText('Storage commit failed');
    expect(save).not.toHaveBeenCalled();
    expect(disk).toBeNull();
    expect(
      screen.getByRole('button', { name: 'Save reviewed confirmation' }),
    ).toBeDisabled();
  });
  it('keeps the request on unmount and never sends a new write after delayed storage completes', async () => {
    let done!: (value: StockConfirmationRequest) => void;
    persist.mockImplementation(
      () =>
        new Promise((resolve) => {
          done = resolve;
        }),
    );
    const view = show();
    await review();
    fireEvent.click(
      screen.getByRole('button', { name: 'Save reviewed confirmation' }),
    );
    await waitFor(() => expect(persist).toHaveBeenCalledTimes(1));
    view.unmount();
    disk = confirmationRequest();
    await act(async () => done(confirmationRequest()));
    expect(save).not.toHaveBeenCalled();
    show();
    await screen.findByRole('button', { name: 'Check confirmation request' });
    expect(disk).toEqual(confirmationRequest());
  });
  it('discards a rejected review and requires reload without keeping an identical retry button', async () => {
    save.mockRejectedValueOnce(
      new BillingActionRejected('Native rule changed'),
    );
    show();
    await review();
    fireEvent.click(
      screen.getByRole('button', { name: 'Save reviewed confirmation' }),
    );
    await screen.findByText('Native rule changed');
    expect(disk).toBeNull();
    expect(
      screen.queryByRole('button', {
        name: /Retry identical confirmation request/,
      }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Save reviewed confirmation' }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Review Mark as Todo' }),
    ).toBeDisabled();
    fireEvent.click(
      screen.getByRole('button', { name: 'Reload confirmation state' }),
    );
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Review Mark as Todo' }),
      ).toBeEnabled(),
    );
  });
  it('keeps the durable request through session expiry and reconnect', async () => {
    save.mockRejectedValueOnce(new BillingSessionExpired());
    show();
    await review();
    fireEvent.click(
      screen.getByRole('button', { name: 'Save reviewed confirmation' }),
    );
    fireEvent.click(
      await screen.findByRole('button', { name: 'Reconnect Billing' }),
    );
    expect(reconnect).toHaveBeenCalledTimes(1);
    expect(disk).toEqual(confirmationRequest());
    expect(clear).not.toHaveBeenCalled();
    expect(
      screen.getByRole('button', {
        name: /Retry identical confirmation request/,
      }),
    ).toBeDisabled();
  });
  it('keeps accepted recovery when closed before Finish or when the final receipt check fails', async () => {
    show();
    await review();
    fireEvent.click(
      screen.getByRole('button', { name: 'Save reviewed confirmation' }),
    );
    await screen.findByRole('button', { name: 'Finish and reload transfers' });
    status.mockResolvedValueOnce(confirmationStatus(false));
    fireEvent.click(
      screen.getByRole('button', { name: 'Finish and reload transfers' }),
    );
    await screen.findByText(/Accepted confirmation receipt unavailable/);
    expect(clear).not.toHaveBeenCalled();
    expect(disk).toEqual(confirmationRequest());
    fireEvent.click(
      screen.getByRole('button', { name: 'Back to stock transfers' }),
    );
    expect(close).toHaveBeenCalledTimes(1);
    expect(disk).toEqual(confirmationRequest());
  });
  it('honours native visibility and adapter readiness rather than guessing from transfer state', async () => {
    get.mockResolvedValue({
      ...confirmationLoad(),
      reason: 'Native permission denied',
      write_ready: false,
    });
    const view = show();
    await screen.findByText('Native permission denied');
    expect(
      screen.getByRole('button', { name: 'Review Mark as Todo' }),
    ).toBeDisabled();
    view.unmount();
    get.mockResolvedValue(confirmationLoad());
    preview.mockResolvedValue({ ...confirmationReview(), write_ready: false });
    show();
    await review();
    expect(
      screen.getByRole('button', { name: 'Save reviewed confirmation' }),
    ).toBeDisabled();
    expect(save).not.toHaveBeenCalled();
  });
  it('never carries a previous account review or late result to the next identity', async () => {
    let done!: (value: ReturnType<typeof confirmationReview>) => void;
    preview.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          done = resolve;
        }),
    );
    const view = show();
    fireEvent.click(
      await screen.findByRole('button', { name: 'Review Mark as Todo' }),
    );
    await waitFor(() => expect(preview).toHaveBeenCalledTimes(1));
    view.rerender(element(view.client, 4));
    await waitFor(() => expect(load).toHaveBeenCalledWith(4));
    await act(async () => done(confirmationReview()));
    expect(
      screen.queryByRole('region', { name: 'Reviewed confirmation effects' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Save reviewed confirmation' }),
    ).not.toBeInTheDocument();
  });
  it('returns keyboard focus on unmount without clearing a pending confirmation', async () => {
    disk = confirmationRequest();
    const returnFocus = jest.fn();
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const view = render(
      <QueryClientProvider client={client}>
        <StockConfirmationModal
          uid={3}
          orderId={9}
          transferId={11}
          close={close}
          reconnect={reconnect}
          returnFocus={returnFocus}
        />
      </QueryClientProvider>,
    );
    await screen.findByRole('button', { name: 'Check confirmation request' });
    expect(returnFocus).not.toHaveBeenCalled();
    view.unmount();
    expect(returnFocus).toHaveBeenCalledTimes(1);
    expect(clear).not.toHaveBeenCalled();
    expect(disk).toEqual(confirmationRequest());
  });
});
