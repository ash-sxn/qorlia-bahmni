import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { StockReservationModal } from '../StockReservationModal';
import {
  BillingActionRejected,
  BillingSessionExpired,
  getStockReservation,
  getStockReservationStatus,
  previewStockReservation,
  saveStockReservation,
  StockReservationRequest,
} from '../billingService';
import {
  clearStockReservationRecovery,
  loadStockReservationRecovery,
  persistStockReservationRecovery,
} from '../stockReservationRecovery';
import {
  stockLoad,
  stockRequest,
  stockReview,
} from './stockReservationFixture';

jest.mock('../billingService', () => ({
  ...jest.requireActual('../billingService'),
  getStockReservation: jest.fn(),
  getStockReservationStatus: jest.fn(),
  previewStockReservation: jest.fn(),
  saveStockReservation: jest.fn(),
}));
jest.mock('../stockReservationRecovery', () => ({
  loadStockReservationRecovery: jest.fn(),
  persistStockReservationRecovery: jest.fn(),
  clearStockReservationRecovery: jest.fn(),
}));
const get = jest.mocked(getStockReservation),
  preview = jest.mocked(previewStockReservation),
  save = jest.mocked(saveStockReservation),
  status = jest.mocked(getStockReservationStatus);
const load = jest.mocked(loadStockReservationRecovery),
  persist = jest.mocked(persistStockReservationRecovery),
  clear = jest.mocked(clearStockReservationRecovery);
const close = jest.fn(),
  reconnect = jest.fn();
let disk: StockReservationRequest | null;
const receipt = (accepted = true) => ({
  accepted,
  action: 'assign' as const,
  request_key: stockRequest().request_key,
  current: stockLoad(),
});
const show = () => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <StockReservationModal
        uid={3}
        orderId={9}
        transferId={11}
        close={close}
        reconnect={reconnect}
      />
    </QueryClientProvider>,
  );
};
const review = async () => {
  fireEvent.click(
    await screen.findByRole('button', {
      name: 'Review: Check availability and reserve',
    }),
  );
  await screen.findByRole('region', { name: 'Reviewed reservation effects' });
};
describe('Reviewed stock reservation UI', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    disk = null;
    get.mockResolvedValue(stockLoad());
    preview.mockResolvedValue(stockReview());
    save.mockResolvedValue(receipt());
    status.mockResolvedValue(receipt());
    load.mockImplementation(async () => disk);
    persist.mockImplementation(async (_uid, request) => {
      disk = request;
      return request;
    });
    clear.mockImplementation(async () => {
      disk = null;
      return null;
    });
    Object.defineProperty(crypto, 'randomUUID', {
      configurable: true,
      value: () => stockRequest().request_key,
    });
  });
  it('shows native units, batch, physical stock and reviewed reservation effects before save', async () => {
    show();
    await review();
    expect(preview).toHaveBeenCalledWith({
      order_id: 9,
      transfer_id: 11,
      version: 'a'.repeat(64),
      action: 'assign',
    });
    expect(save).not.toHaveBeenCalled();
    const operations = screen.getByRole('table', {
      name: /Resulting detailed operations/,
    });
    expect(within(operations).getByText('Dozens')).toBeInTheDocument();
    expect(within(operations).getByText('QA-BATCH')).toBeInTheDocument();
    const inventory = screen.getByRole('table', {
      name: /Inventory in product stock units/,
    });
    expect(within(inventory).getByText('Units')).toBeInTheDocument();
    expect(within(inventory).getByText('20')).toBeInTheDocument();
  });
  it('commits recovery before save, blocks duplicate clicks and clears only after accepted status', async () => {
    let resolve!: (value: ReturnType<typeof receipt>) => void;
    save.mockImplementation(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    show();
    await review();
    const button = screen.getByRole('button', {
      name: 'Save reviewed reservation action',
    });
    fireEvent.click(button);
    fireEvent.click(button);
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    expect(disk).toEqual(stockRequest());
    expect(persist.mock.invocationCallOrder[0]).toBeLessThan(
      save.mock.invocationCallOrder[0],
    );
    expect(
      screen.getByRole('button', { name: 'Back to stock transfers' }),
    ).toBeDisabled();
    await act(async () => resolve(receipt()));
    fireEvent.click(
      await screen.findByRole('button', {
        name: 'Finish and reload transfers',
      }),
    );
    await waitFor(() => expect(close).toHaveBeenCalledTimes(1));
    expect(status).toHaveBeenCalledWith(stockRequest());
    expect(clear).toHaveBeenCalledWith(3, stockRequest());
  });
  it('retains an unknown outcome and retries only the identical request after a check', async () => {
    save.mockRejectedValueOnce(new Error('Response lost'));
    status.mockResolvedValueOnce(receipt(false));
    show();
    await review();
    fireEvent.click(
      screen.getByRole('button', { name: 'Save reviewed reservation action' }),
    );
    await screen.findByRole('alert');
    expect(disk).toEqual(stockRequest());
    expect(clear).not.toHaveBeenCalled();
    fireEvent.click(
      screen.getByRole('button', { name: 'Check reservation request' }),
    );
    await screen.findByText(/No receipt found yet/);
    fireEvent.click(
      screen.getByRole('button', {
        name: /Retry identical reservation request/,
      }),
    );
    await screen.findByRole('button', { name: 'Finish and reload transfers' });
    expect(save.mock.calls).toEqual([[stockRequest()], [stockRequest()]]);
  });
  it('resumes a stored request for another transfer without creating a fresh review', async () => {
    disk = { ...stockRequest(), order_id: 10, transfer_id: 12 };
    get.mockResolvedValue({
      ...stockLoad(),
      order_id: 10,
      transfer_id: 12,
      graph: {
        ...stockLoad().graph,
        transfer: { ...stockLoad().graph.transfer, id: 12 },
      },
    });
    show();
    await screen.findByText(/A previous reservation request/);
    expect(get).toHaveBeenCalledWith(10, 12);
    expect(
      screen.queryByRole('button', { name: /Review:/ }),
    ).not.toBeInTheDocument();
    expect(save).not.toHaveBeenCalled();
    expect(preview).not.toHaveBeenCalled();
  });
  it('fails closed when recovery cannot be loaded or persisted', async () => {
    load.mockRejectedValueOnce(new Error('Storage unavailable'));
    const first = show();
    await screen.findByRole('alert');
    expect(get).not.toHaveBeenCalled();
    first.unmount();
    persist.mockRejectedValueOnce(new Error('Storage commit failed'));
    show();
    await review();
    fireEvent.click(
      screen.getByRole('button', { name: 'Save reviewed reservation action' }),
    );
    await screen.findByText('Storage commit failed');
    expect(save).not.toHaveBeenCalled();
    expect(disk).toBeNull();
  });
  it('keeps recovery across unmount and suppresses a save after storage finishes on an unmounted view', async () => {
    let resolve!: (value: StockReservationRequest) => void;
    persist.mockImplementation(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    const view = show();
    await review();
    fireEvent.click(
      screen.getByRole('button', { name: 'Save reviewed reservation action' }),
    );
    await waitFor(() => expect(persist).toHaveBeenCalledTimes(1));
    view.unmount();
    disk = stockRequest();
    await act(async () => resolve(stockRequest()));
    expect(save).not.toHaveBeenCalled();
    show();
    await screen.findByRole('button', { name: 'Check reservation request' });
    expect(disk).toEqual(stockRequest());
  });
  it('clears definitive rejection, discards review and requires a fresh reload', async () => {
    save.mockRejectedValueOnce(new BillingActionRejected('Inventory changed'));
    show();
    await review();
    fireEvent.click(
      screen.getByRole('button', { name: 'Save reviewed reservation action' }),
    );
    await screen.findByText('Inventory changed');
    expect(disk).toBeNull();
    expect(
      screen.queryByRole('button', {
        name: /Retry identical reservation request/,
      }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', {
        name: 'Save reviewed reservation action',
      }),
    ).not.toBeInTheDocument();
  });
  it('preserves the request and offers reconnect on expiry', async () => {
    save.mockRejectedValueOnce(new BillingSessionExpired());
    show();
    await review();
    fireEvent.click(
      screen.getByRole('button', { name: 'Save reviewed reservation action' }),
    );
    fireEvent.click(
      await screen.findByRole('button', { name: 'Reconnect Billing' }),
    );
    expect(reconnect).toHaveBeenCalledTimes(1);
    expect(disk).toEqual(stockRequest());
    expect(clear).not.toHaveBeenCalled();
    expect(
      screen.getByRole('button', {
        name: /Retry identical reservation request/,
      }),
    ).toBeDisabled();
  });
  it('keeps pending recovery if a receipt disappears during finish', async () => {
    status.mockResolvedValueOnce(receipt(false));
    show();
    await review();
    fireEvent.click(
      screen.getByRole('button', { name: 'Save reviewed reservation action' }),
    );
    fireEvent.click(
      await screen.findByRole('button', {
        name: 'Finish and reload transfers',
      }),
    );
    await screen.findByText(/Accepted reservation receipt unavailable/);
    expect(clear).not.toHaveBeenCalled();
    expect(close).not.toHaveBeenCalled();
  });
  it('respects native disabled reasons and does not keep a failed preview', async () => {
    get.mockResolvedValue({
      ...stockLoad(),
      reasons: { assign: 'Read-only stock role', unreserve: false },
    });
    preview.mockRejectedValueOnce(new Error('Inventory changed during review'));
    show();
    expect(
      await screen.findByRole('button', {
        name: 'Review: Check availability and reserve',
      }),
    ).toBeDisabled();
    fireEvent.click(
      screen.getByRole('button', { name: 'Review: Unreserve stock' }),
    );
    await screen.findByText('Inventory changed during review');
    expect(preview).toHaveBeenCalledWith({
      order_id: 9,
      transfer_id: 11,
      version: 'a'.repeat(64),
      action: 'unreserve',
    });
    expect(
      screen.queryByRole('button', {
        name: /Save reviewed reservation action/,
      }),
    ).not.toBeInTheDocument();
    expect(save).not.toHaveBeenCalled();
  });
});
