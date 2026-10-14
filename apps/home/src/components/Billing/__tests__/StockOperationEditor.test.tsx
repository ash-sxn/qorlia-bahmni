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
  changeStockOperationForm,
  getStockOperationForm,
  getStockOperationStatus,
  getStockReservation,
  previewStockOperation,
  saveStockOperation,
  StockOperationRequest,
} from '../billingService';
import { StockOperationEditor } from '../StockOperationEditor';
import {
  clearStockOperationRecovery,
  loadStockOperationRecovery,
  persistStockOperationRecovery,
} from '../stockReservationRecovery';
import {
  operationForm,
  operationRequest,
  operationReview,
  operationSelection,
  operationStatus,
} from './stockOperationFixture';
import { stockLoad } from './stockReservationFixture';

jest.mock('../billingService', () => ({
  ...jest.requireActual('../billingService'),
  getStockOperationForm: jest.fn(),
  changeStockOperationForm: jest.fn(),
  previewStockOperation: jest.fn(),
  saveStockOperation: jest.fn(),
  getStockOperationStatus: jest.fn(),
  getStockReservation: jest.fn(),
}));
jest.mock('../stockReservationRecovery', () => ({
  loadStockOperationRecovery: jest.fn(),
  persistStockOperationRecovery: jest.fn(),
  clearStockOperationRecovery: jest.fn(),
}));
// Relation search is tested with its real house control in StockOperationChoice.test.
jest.mock('../StockOperationChoice', () => ({
  StockOperationChoice: ({ label }: { label: string }) => (
    <p>{label} selector</p>
  ),
}));
const get = jest.mocked(getStockOperationForm),
  change = jest.mocked(changeStockOperationForm),
  preview = jest.mocked(previewStockOperation),
  save = jest.mocked(saveStockOperation),
  status = jest.mocked(getStockOperationStatus),
  load = jest.mocked(loadStockOperationRecovery),
  persist = jest.mocked(persistStockOperationRecovery),
  clear = jest.mocked(clearStockOperationRecovery);
const close = jest.fn(),
  reconnect = jest.fn();
let disk: StockOperationRequest | null;
const show = () =>
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <StockOperationEditor
        uid={3}
        selection={operationSelection()}
        close={close}
        reconnect={reconnect}
      />
    </QueryClientProvider>,
  );
const edit = async () => {
  const input = await screen.findByRole('spinbutton', {
    name: 'Recorded done quantity',
  });
  fireEvent.change(input, { target: { value: '2' } });
  expect(
    screen.getByRole('button', { name: 'Review operation changes' }),
  ).toBeDisabled();
  fireEvent.blur(input);
  await waitFor(() =>
    expect(
      screen.getByRole('button', { name: 'Review operation changes' }),
    ).toBeEnabled(),
  );
};
const review = async () => {
  await edit();
  fireEvent.click(
    screen.getByRole('button', { name: 'Review operation changes' }),
  );
  await screen.findByRole('region', { name: 'Reviewed operation effects' });
};
describe('Native operation editor and exact-request recovery', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    disk = null;
    get.mockResolvedValue(operationForm());
    change.mockResolvedValue(operationReview().form);
    preview.mockResolvedValue(operationReview());
    save.mockResolvedValue(operationStatus());
    status.mockResolvedValue(operationStatus());
    jest.mocked(getStockReservation).mockResolvedValue(stockLoad());
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
      value: () => operationRequest().request_key,
    });
  });
  it('replays native changes and shows operation/stock units, batch and pricing before a save', async () => {
    show();
    await review();
    expect(change).toHaveBeenCalledWith({
      ...operationSelection(),
      version: 'a'.repeat(64),
      edits: operationRequest().edits,
    });
    expect(preview).toHaveBeenCalledWith({
      ...operationSelection(),
      version: 'a'.repeat(64),
      edits: operationRequest().edits,
      action: 'save',
    });
    expect(save).not.toHaveBeenCalled();
    expect(
      within(
        screen.getByRole('table', { name: /Resulting detailed operations/ }),
      ).getByText('Dozens'),
    ).toBeInTheDocument();
    expect(
      within(
        screen.getByRole('table', { name: /Resulting detailed operations/ }),
      ).getByText('QA-BATCH'),
    ).toBeInTheDocument();
    expect(
      within(
        screen.getByRole('table', { name: /Inventory in product stock units/ }),
      ).getByText('Units'),
    ).toBeInTheDocument();
    expect(
      within(
        screen.getByRole('table', {
          name: /Operation prices and native balance/,
        }),
      ).getByText('120'),
    ).toBeInTheDocument();
  });
  it('preserves native hidden/readonly fields, UTC expiry precision and unsaved-edit discard', async () => {
    const form = operationForm();
    form.rules.qty_done.readonly = true;
    form.rules.lot_id.readonly = true;
    form.rules.cost_price = { visible: false, readonly: true };
    get.mockResolvedValue(form);
    show();
    expect(
      await screen.findByRole('spinbutton', { name: 'Recorded done quantity' }),
    ).toHaveAttribute('readonly');
    expect(screen.getByText('Batch / serial: QA-BATCH')).toBeInTheDocument();
    expect(
      screen.queryByRole('spinbutton', { name: 'Cost price' }),
    ).not.toBeInTheDocument();
    expect(screen.getByLabelText('Expiry (UTC)')).toHaveAttribute('step', '1');
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Sale price' }), {
      target: { value: '123' },
    });
    fireEvent.click(
      screen.getByRole('button', { name: 'Back to stock transfers' }),
    );
    expect(close).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Keep editing' }));
    expect(
      screen.queryByRole('group', { name: 'Discard unsaved stock edits' }),
    ).not.toBeInTheDocument();
    fireEvent.click(
      screen.getByRole('button', { name: 'Back to stock transfers' }),
    );
    fireEvent.click(
      screen.getByRole('button', { name: /Discard unsaved edits/ }),
    );
    expect(close).toHaveBeenCalledTimes(1);
    expect(change).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
  });
  it('waits for durable storage before HTTP, blocks double clicks and only finishes after accepted status', async () => {
    let commit!: (value: StockOperationRequest) => void;
    persist.mockImplementation(
      (_uid, exact) =>
        new Promise((resolve) => {
          commit = (value) => {
            disk = exact;
            resolve(value);
          };
        }),
    );
    show();
    await review();
    const button = screen.getByRole('button', {
      name: 'Save reviewed operation action',
    });
    fireEvent.click(button);
    fireEvent.click(button);
    await waitFor(() => expect(persist).toHaveBeenCalledTimes(1));
    expect(save).not.toHaveBeenCalled();
    expect(
      screen.getByRole('button', { name: 'Back to stock transfers' }),
    ).toBeDisabled();
    await act(async () => commit(operationRequest()));
    fireEvent.click(
      await screen.findByRole('button', {
        name: 'Finish and reload transfers',
      }),
    );
    await waitFor(() => expect(close).toHaveBeenCalledTimes(1));
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith(operationRequest());
    expect(status).toHaveBeenCalledWith(operationRequest());
    expect(clear).toHaveBeenCalledWith(3, operationRequest());
  });
  it('keeps an uncertain save for status checks and identical retries, including a full remount', async () => {
    save.mockRejectedValueOnce(new Error('Response lost'));
    status.mockResolvedValueOnce(operationStatus(false));
    const first = show();
    await review();
    fireEvent.click(
      screen.getByRole('button', { name: 'Save reviewed operation action' }),
    );
    await screen.findByText('Response lost');
    expect(disk).toEqual(operationRequest());
    expect(clear).not.toHaveBeenCalled();
    first.unmount();
    show();
    fireEvent.click(
      await screen.findByRole('button', { name: 'Check operation request' }),
    );
    await screen.findByText(/No receipt found yet/);
    fireEvent.click(
      screen.getByRole('button', { name: /Retry identical operation request/ }),
    );
    await screen.findByRole('button', { name: 'Finish and reload transfers' });
    expect(save.mock.calls).toEqual([
      [operationRequest()],
      [operationRequest()],
    ]);
    expect(get).toHaveBeenCalledTimes(1);
    expect(preview).toHaveBeenCalledTimes(1);
  });
  it('resumes a deletion after its row is gone without trying to load or recreate that form', async () => {
    disk = { ...operationRequest(), action: 'delete', edits: [] };
    status.mockResolvedValue({
      ...operationStatus(),
      action: 'delete',
      operation_id: false,
    });
    get.mockRejectedValue(new Error('Deleted row'));
    show();
    fireEvent.click(
      await screen.findByRole('button', { name: 'Check operation request' }),
    );
    await screen.findByRole('button', { name: 'Finish and reload transfers' });
    expect(get).not.toHaveBeenCalled();
    expect(preview).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
    expect(status).toHaveBeenCalledWith(disk);
    expect(getStockReservation).toHaveBeenCalledWith(9, 11);
  });
  it('requires a separate native removal review and never sends edited values with deletion', async () => {
    const removal = {
      ...operationReview(),
      action: 'delete' as const,
      edits: [],
    };
    removal.after.transfer.operations = [];
    removal.after.form_rows = [];
    preview.mockResolvedValue(removal);
    save.mockResolvedValue({
      ...operationStatus(),
      action: 'delete',
      operation_id: false,
    });
    show();
    fireEvent.click(
      await screen.findByRole('button', { name: /Review operation removal/ }),
    );
    await screen.findByText('No detailed operations remain after this action.');
    expect(save).not.toHaveBeenCalled();
    fireEvent.click(
      screen.getByRole('button', { name: /Save reviewed operation action/ }),
    );
    await screen.findByRole('button', { name: 'Finish and reload transfers' });
    expect(save).toHaveBeenCalledWith({
      ...operationRequest(),
      action: 'delete',
      edits: [],
    });
  });
  it('does not send a write after the component unmounts while storage is committing', async () => {
    let commit!: (value: StockOperationRequest) => void;
    persist.mockImplementation(
      (_uid, exact) =>
        new Promise((resolve) => {
          commit = (value) => {
            disk = exact;
            resolve(value);
          };
        }),
    );
    const view = show();
    await review();
    fireEvent.click(
      screen.getByRole('button', { name: 'Save reviewed operation action' }),
    );
    await waitFor(() => expect(persist).toHaveBeenCalledTimes(1));
    view.unmount();
    await act(async () => commit(operationRequest()));
    expect(save).not.toHaveBeenCalled();
    expect(disk).toEqual(operationRequest());
    expect(clear).not.toHaveBeenCalled();
  });
  it('does not write when recovery cannot commit and clears only an explicit server rejection', async () => {
    persist.mockRejectedValueOnce(new Error('Disk unavailable'));
    show();
    await review();
    fireEvent.click(
      screen.getByRole('button', { name: 'Save reviewed operation action' }),
    );
    await screen.findByText('Disk unavailable');
    expect(save).not.toHaveBeenCalled();
    expect(clear).not.toHaveBeenCalled();
    fireEvent.click(
      screen.getByRole('button', { name: 'Review operation changes' }),
    );
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Save reviewed operation action' }),
      ).toBeEnabled(),
    );
    save.mockRejectedValueOnce(
      new BillingActionRejected('Native validation rejected'),
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Save reviewed operation action' }),
    );
    await screen.findByText('Native validation rejected');
    expect(clear).toHaveBeenCalledWith(3, operationRequest());
    expect(disk).toBeNull();
  });
  it('offers an explicit reload for failed reads and reconnect for expiry, without auto retry', async () => {
    get.mockRejectedValueOnce(new Error('Read unavailable'));
    show();
    fireEvent.click(
      await screen.findByRole('button', { name: 'Reload stock form' }),
    );
    await screen.findByRole('spinbutton', { name: 'Recorded done quantity' });
    get.mockRejectedValueOnce(new BillingSessionExpired());
    fireEvent.click(screen.getByRole('button', { name: 'Reload stock form' }));
    fireEvent.click(
      await screen.findByRole('button', { name: 'Reconnect Billing' }),
    );
    expect(reconnect).toHaveBeenCalledTimes(1);
    expect(get).toHaveBeenCalledTimes(3);
    expect(save).not.toHaveBeenCalled();
  });
});
