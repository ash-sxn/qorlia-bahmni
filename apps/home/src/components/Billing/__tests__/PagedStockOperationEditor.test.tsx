import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import {
  BillingActionRejected,
  BillingSessionExpired,
  changePagedStockOperationForm,
  getPagedStockOperationForm,
  getPagedStockOperationReview,
  getPagedStockOperationStatus,
  getPagedStockOperationReferences,
  savePagedStockOperation,
  stopPagedStockOperation,
  getStockOperationForm,
  previewStockOperation,
  type StockOperationForm,
  type StockOperationSelection,
  type StockOperationSelectionRequest,
  type PagedStockOperationReview,
} from '../billingService';
import { PagedStockOperationEditor } from '../PagedStockOperationEditor';
import {
  clearPagedStockWriteRecovery,
  loadPagedStockWriteRecovery,
  persistPagedStockWriteRecovery,
  type PagedStockWriteRequest,
} from '../stockReservationRecovery';
import { operationForm, operationSelection } from './stockOperationFixture';
import {
  request,
  review,
  status,
  references,
} from './stockOperationPagedFixture';
import { request as preparation } from './stockReservationPagedFixture';

jest.mock('../billingService', () => ({
  ...jest.requireActual('../billingService'),
  getPagedStockOperationForm: jest.fn(),
  changePagedStockOperationForm: jest.fn(),
  getPagedStockOperationReview: jest.fn(),
  getPagedStockOperationStatus: jest.fn(),
  getPagedStockOperationReferences: jest.fn(),
  savePagedStockOperation: jest.fn(),
  stopPagedStockOperation: jest.fn(),
  getStockOperationForm: jest.fn(),
  previewStockOperation: jest.fn(),
}));
jest.mock('../stockReservationRecovery', () => ({
  ...jest.requireActual('../stockReservationRecovery'),
  loadPagedStockWriteRecovery: jest.fn(),
  persistPagedStockWriteRecovery: jest.fn(),
  clearPagedStockWriteRecovery: jest.fn(),
}));
const mockChoice = jest.fn();
jest.mock('../StockOperationChoice', () => ({
  StockOperationChoice: (props: {
    label: string;
    disabled: boolean;
    change: (value: number) => void;
  }) => {
    mockChoice(props);
    return (
      <button disabled={props.disabled} onClick={() => props.change(8)}>
        Choose {props.label}
      </button>
    );
  },
}));
const get = jest.mocked(getPagedStockOperationForm),
  change = jest.mocked(changePagedStockOperationForm),
  preview = jest.mocked(getPagedStockOperationReview),
  save = jest.mocked(savePagedStockOperation),
  check = jest.mocked(getPagedStockOperationStatus),
  refs = jest.mocked(getPagedStockOperationReferences),
  stop = jest.mocked(stopPagedStockOperation),
  load = jest.mocked(loadPagedStockWriteRecovery),
  persist = jest.mocked(persistPagedStockWriteRecovery),
  clear = jest.mocked(clearPagedStockWriteRecovery);
let disk: PagedStockWriteRequest | null,
  nativeForm: StockOperationForm,
  saved: boolean;
const close = jest.fn(),
  reconnect = jest.fn(),
  returnFocus = jest.fn();
const show = (selection = operationSelection()) => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const panel = (uid: number, selected: StockOperationSelection) => (
    <QueryClientProvider client={client}>
      <PagedStockOperationEditor
        uid={uid}
        selection={selected}
        close={close}
        reconnect={reconnect}
        returnFocus={returnFocus}
      />
    </QueryClientProvider>
  );
  const view = render(panel(3, selection));
  return {
    ...view,
    client,
    changeIdentity: (uid: number, selected = selection) =>
      view.rerender(panel(uid, selected)),
  };
};
const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
};
const edit = async (value = '2') => {
  const input = await screen.findByRole('spinbutton', {
    name: 'Recorded done quantity',
  });
  fireEvent.change(input, { target: { value } });
  fireEvent.blur(input);
  await waitFor(() =>
    expect(
      screen.getByRole('button', { name: 'Review operation changes' }),
    ).toBeEnabled(),
  );
};
const startReview = async (action: 'save' | 'delete' = 'save') => {
  fireEvent.click(
    await screen.findByRole('button', {
      name:
        action === 'delete'
          ? /Review operation removal$/
          : 'Review operation changes',
    }),
  );
  await screen.findByText('Operation effect page 1');
};
const complete = async () => {
  for (let page = 2; page <= 3; page++) {
    fireEvent.click(
      screen.getByRole('button', { name: 'Review next operation effects' }),
    );
    await screen.findByText(`Operation effect page ${page}`);
  }
};
const submit = async () => {
  fireEvent.click(
    screen.getByRole('button', { name: /Save reviewed operation action$/ }),
  );
  await screen.findByRole('region', {
    name: 'Stock operation request recovery',
  });
};
const result = () => ({
  ...status(saved),
  request_key: disk?.request_key ?? request().request_key,
  action:
    disk && 'action' in disk && disk.action === 'delete'
      ? ('delete' as const)
      : ('save' as const),
  operation_id:
    saved && disk && 'operation_id' in disk && disk.action === 'save'
      ? disk.operation_id || 77
      : (false as const),
});
const page = (
  selection: StockOperationSelectionRequest,
  after = 0,
  limit = 50,
): PagedStockOperationReview => {
  const end = Math.min(after + limit, 101),
    more = end < 101;
  const form = {
    ...nativeForm,
    ...operationSelection(),
    order_id: selection.order_id,
    transfer_id: selection.transfer_id,
    move_id: selection.move_id,
    operation_id: selection.operation_id,
  };
  return {
    ...review(),
    ...selection,
    form,
    operation_key:
      selection.action === 'delete'
        ? false
        : selection.operation_id || 'new:stock.move.line:0',
    after,
    total_count: 101,
    next_after: more ? end : false,
    continuation_token: more ? 'c'.repeat(64) : false,
    review_complete_token: more ? false : 'd'.repeat(64),
    effects: {
      ...review().effects,
      updated: {
        'stock.move.line': Array.from({ length: end - after }, (_, i) => ({
          id: after + i + 101,
          before: { qty_done: 0 },
          after: { qty_done: 2 },
        })),
      },
    },
  };
};

describe('Complete paged operation editor and native request recovery', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    disk = null;
    nativeForm = operationForm();
    saved = false;
    get.mockImplementation(async () => nativeForm);
    change.mockImplementation(async (selection) => {
      nativeForm = { ...nativeForm, values: { ...nativeForm.values } };
      for (const item of selection.edits)
        Object.assign(nativeForm.values, { [item.field]: item.value });
      return nativeForm;
    });
    preview.mockImplementation(async (...args) =>
      page(args[0], args[1], args[4]),
    );
    load.mockImplementation(async () => disk);
    persist.mockImplementation(async (_uid, exact) => {
      disk = exact;
      return exact;
    });
    clear.mockImplementation(async () => {
      disk = null;
      return null;
    });
    save.mockImplementation(async () => {
      saved = true;
      return result();
    });
    check.mockImplementation(async () => result());
    refs.mockResolvedValue(references());
    stop.mockImplementation(async () => ({
      accepted: saved,
      stopped: !saved,
      request_key: disk!.request_key,
    }));
    Object.defineProperty(crypto, 'randomUUID', {
      configurable: true,
      value: jest.fn(() => request().request_key),
    });
  });

  it.each(['create', 'edit', 'delete'] as const)(
    'completes every effect page for %s, pins the exact selection and persists before the native save',
    async (mode) => {
      const selection = {
        ...operationSelection(),
        operation_id: mode === 'create' ? (false as const) : 13,
      };
      nativeForm = { ...nativeForm, ...selection };
      show(selection);
      if (mode === 'edit') await edit();
      await startReview(mode === 'delete' ? 'delete' : 'save');
      expect(
        screen.getByRole('button', { name: /Save reviewed operation action$/ }),
      ).toBeDisabled();
      expect(crypto.randomUUID).not.toHaveBeenCalled();
      expect(save).not.toHaveBeenCalled();
      expect(
        screen
          .getByRole('region', { name: 'Reviewed operation effects' })
          .querySelectorAll('details'),
      ).toHaveLength(50);
      expect(
        screen.getByRole('spinbutton', { name: 'Recorded done quantity' }),
      ).toBeDisabled();
      await complete();
      await waitFor(() =>
        expect(screen.getByText('Operation effect page 3')).toHaveFocus(),
      );
      expect(preview.mock.calls.map((call) => call.slice(1))).toEqual([
        [0, false, false, 50],
        [50, 'b'.repeat(64), 'c'.repeat(64), 50],
        [100, 'b'.repeat(64), 'c'.repeat(64), 50],
      ]);
      await submit();
      expect(disk).toEqual({
        ...request(),
        ...selection,
        action: mode === 'delete' ? 'delete' : 'save',
        edits: mode === 'edit' ? request().edits : [],
      });
      expect(save).toHaveBeenCalledWith(disk);
      expect(persist.mock.invocationCallOrder[0]).toBeLessThan(
        save.mock.invocationCallOrder[0],
      );
      expect(crypto.randomUUID).toHaveBeenCalledTimes(1);
      expect(getStockOperationForm).not.toHaveBeenCalled();
      expect(previewStockOperation).not.toHaveBeenCalled();
      expect(
        await screen.findByText(/Accepted operation:/),
      ).toBeInTheDocument();
    },
  );
  it('uses native visibility/readonly rules, complete choice pins, UTC precision and ordered onchange edits', async () => {
    nativeForm.rules.cost_price = { visible: false, readonly: true };
    nativeForm.rules.qty_done.readonly = true;
    show();
    const input = await screen.findByRole('spinbutton', {
      name: 'Recorded done quantity',
    });
    expect(input).toHaveAttribute('readonly');
    expect(
      screen.queryByRole('spinbutton', { name: 'Cost price' }),
    ).not.toBeInTheDocument();
    expect(screen.getByLabelText('Expiry (UTC)')).toHaveAttribute('step', '1');
    expect(mockChoice.mock.calls.at(-1)?.[0]).toMatchObject({
      protocol: 'complete',
      request: { ...operationSelection(), version: 'a'.repeat(64), edits: [] },
    });
    fireEvent.click(
      screen.getByRole('button', { name: 'Choose Batch / serial' }),
    );
    await waitFor(() =>
      expect(change).toHaveBeenCalledWith({
        ...operationSelection(),
        version: 'a'.repeat(64),
        edits: [{ field: 'lot_id', value: 8 }],
      }),
    );
    await waitFor(() =>
      expect(screen.getByLabelText('Expiry (UTC)')).toBeEnabled(),
    );
    fireEvent.change(screen.getByLabelText('Expiry (UTC)'), {
      target: { value: '2027-02-02T03:04:05' },
    });
    fireEvent.blur(screen.getByLabelText('Expiry (UTC)'));
    await waitFor(() =>
      expect(change).toHaveBeenLastCalledWith({
        ...operationSelection(),
        version: 'a'.repeat(64),
        edits: [
          { field: 'lot_id', value: 8 },
          { field: 'expiration_date', value: '2027-02-02 03:04:05' },
        ],
      }),
    );
  });
  it('keeps native save/removal availability and warnings, without inventing eligibility', async () => {
    nativeForm = {
      ...nativeForm,
      write_ready: false,
      can_delete: false,
      reason: 'Native transfer is not editable',
      warning: 'Native warning',
      expiry_warning: true,
    };
    show();
    await screen.findByText('Native transfer is not editable');
    expect(screen.getByText('Native warning')).toBeInTheDocument();
    expect(screen.getByText(/Native expiry warning:/)).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Review operation changes' }),
    ).toBeDisabled();
    expect(
      screen.getByRole('button', { name: /Review operation removal$/ }),
    ).toBeDisabled();
    expect(preview).not.toHaveBeenCalled();
  });
  it('requires explicit discard before close/reconnect/reload of unsaved edits', async () => {
    show();
    await edit();
    fireEvent.click(
      screen.getByRole('button', { name: 'Back to stock transfers' }),
    );
    expect(close).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Keep editing' }));
    fireEvent.click(screen.getByRole('button', { name: 'Reload stock form' }));
    expect(get).toHaveBeenCalledTimes(1);
    fireEvent.click(
      screen.getByRole('button', { name: /Discard unsaved edits$/ }),
    );
    await waitFor(() => expect(get).toHaveBeenCalledTimes(2));
    expect(save).not.toHaveBeenCalled();
  });
  it('can correct an invalid number without discarding the whole form', async () => {
    show();
    const input = await screen.findByRole('spinbutton', {
      name: 'Recorded done quantity',
    });
    fireEvent.change(input, { target: { value: '' } });
    fireEvent.blur(input);
    await screen.findByText(/Enter a finite number/);
    expect(input).toBeEnabled();
    await edit('3');
    expect(change).toHaveBeenCalledTimes(1);
  });
  it('pins backward review and invalidates a failed page rather than leaving a saveable stale preview', async () => {
    show();
    await edit();
    await startReview();
    fireEvent.click(
      screen.getByRole('button', { name: 'Review next operation effects' }),
    );
    await screen.findByText('Operation effect page 2');
    fireEvent.click(
      screen.getByRole('button', { name: 'Previous operation effects' }),
    );
    await screen.findByText('Operation effect page 1');
    expect(preview.mock.calls.at(-1)?.slice(1)).toEqual([0, false, false, 50]);
    preview.mockRejectedValueOnce(new Error('Native snapshot expired'));
    fireEvent.click(
      screen.getByRole('button', { name: 'Review next operation effects' }),
    );
    await screen.findByText('Native snapshot expired');
    expect(
      screen.queryByRole('button', { name: /Save reviewed operation action$/ }),
    ).not.toBeInTheDocument();
    expect(save).not.toHaveBeenCalled();
  });
  it('rejects a changed review identity between pages', async () => {
    show();
    await edit();
    await startReview();
    preview.mockImplementationOnce(async (...args) => ({
      ...page(args[0], args[1]),
      operation_key: 77,
    }));
    fireEvent.click(
      screen.getByRole('button', { name: 'Review next operation effects' }),
    );
    await screen.findByText(/Operation pages changed/);
    expect(save).not.toHaveBeenCalled();
  });
  it('returns from review to editing and requires a fresh complete preview after another change', async () => {
    show();
    await edit();
    await startReview();
    fireEvent.click(
      screen.getByRole('button', { name: 'Return to operation edits' }),
    );
    await edit('4');
    await startReview();
    expect(preview).toHaveBeenLastCalledWith(
      {
        ...operationSelection(),
        version: 'a'.repeat(64),
        action: 'save',
        edits: [
          { field: 'qty_done', value: 2 },
          { field: 'qty_done', value: 4 },
        ],
      },
      0,
      false,
      false,
      50,
    );
  });
  it('blocks duplicate save/close while durable storage is committing, and does not dispatch after unmount', async () => {
    const commit = deferred<PagedStockWriteRequest>();
    persist.mockReturnValueOnce(commit.promise);
    const view = show();
    await edit();
    await startReview();
    await complete();
    const button = screen.getByRole('button', {
      name: /Save reviewed operation action$/,
    });
    fireEvent.click(button);
    fireEvent.click(button);
    expect(persist).toHaveBeenCalledTimes(1);
    expect(save).not.toHaveBeenCalled();
    expect(
      screen.getByRole('button', { name: 'Back to stock transfers' }),
    ).toBeDisabled();
    const exact = persist.mock.calls[0][1];
    view.unmount();
    await act(async () => {
      disk = exact;
      commit.resolve(exact);
      await commit.promise;
    });
    expect(save).not.toHaveBeenCalled();
    expect(disk).toEqual(exact);
    expect(returnFocus).toHaveBeenCalled();
  });
  it('does not dispatch when storage fails', async () => {
    persist.mockRejectedValueOnce(new Error('Storage commit failed'));
    show();
    await edit();
    await startReview();
    await complete();
    fireEvent.click(
      screen.getByRole('button', { name: /Save reviewed operation action$/ }),
    );
    await screen.findByText('Storage commit failed');
    expect(save).not.toHaveBeenCalled();
    expect(disk).toBeNull();
  });
  it.each([
    new Error('Response lost'),
    new BillingActionRejected('Native action rejected'),
    new BillingSessionExpired(),
  ])('retains the exact action after a failed save: %s', async (error) => {
    save.mockRejectedValueOnce(error);
    const view = show();
    await edit();
    await startReview();
    await complete();
    await submit();
    expect(disk).toEqual(request());
    expect(clear).not.toHaveBeenCalled();
    view.unmount();
    show();
    await screen.findByRole('button', {
      name: /Retry identical operation request$/,
    });
    fireEvent.click(
      screen.getByRole('button', {
        name: /Retry identical operation request$/,
      }),
    );
    await waitFor(() => expect(save).toHaveBeenCalledTimes(2));
    expect(save.mock.calls[1][0]).toEqual(request());
    expect(crypto.randomUUID).toHaveBeenCalledTimes(1);
  });
  it('recovers an accepted receipt only after every pinned reference page and a fresh status', async () => {
    disk = request();
    saved = true;
    check.mockImplementation(async () => ({
      ...result(),
      reference_count: 101,
    }));
    refs.mockImplementation(async (_exact, after = 0, version = false) => ({
      ...references(),
      version: version || 'e'.repeat(64),
      after,
      total_count: 101,
      next_after: after + 50 < 101 ? after + 50 : false,
      rows: Array.from({ length: Math.min(50, 101 - after) }, (_, i) => ({
        key: `new:stock.move.line:${String(after + i).padStart(3, '0')}`,
        model: 'stock.move.line',
        id: 101 + after + i,
        name: `QA Operation ${after + i}`,
        available: true,
      })),
    }));
    show();
    const finish = await screen.findByRole('button', {
      name: 'Finish and reload transfers',
    });
    expect(finish).toBeDisabled();
    fireEvent.click(
      screen.getByRole('button', { name: 'Read saved references' }),
    );
    await screen.findByText('Saved reference page 1');
    for (let page = 2; page <= 3; page++) {
      fireEvent.click(
        screen.getByRole('button', { name: 'Next saved references' }),
      );
      await screen.findByText(`Saved reference page ${page}`);
    }
    expect(refs.mock.calls.map((call) => call.slice(1))).toEqual([
      [0, false, 50],
      [50, 'e'.repeat(64), 50],
      [100, 'e'.repeat(64), 50],
    ]);
    fireEvent.click(finish);
    await waitFor(() => expect(clear).toHaveBeenCalledWith(3, request()));
    expect(check).toHaveBeenCalledTimes(2);
    expect(close).toHaveBeenCalledTimes(1);
    expect(get).not.toHaveBeenCalled();
  });
  it('keeps recovery if the final accepted status is unavailable', async () => {
    disk = request();
    saved = true;
    show();
    const finish = await screen.findByRole('button', {
      name: 'Finish and reload transfers',
    });
    check.mockRejectedValueOnce(new Error('Receipt unavailable'));
    fireEvent.click(finish);
    await screen.findByText('Receipt unavailable');
    expect(clear).not.toHaveBeenCalled();
    expect(disk).toEqual(request());
  });
  it('recovers the original off-page move without loading a fresh selected operation', async () => {
    disk = request();
    show({
      ...operationSelection(),
      order_id: 99,
      transfer_id: 98,
      move_id: 97,
      operation_id: 96,
    });
    await screen.findByRole('button', { name: 'Check operation request' });
    expect(get).not.toHaveBeenCalled();
    expect(check).toHaveBeenCalledWith(request());
    expect(screen.getByText(/Move #12/)).toBeInTheDocument();
  });
  it('rejects another pending workflow rather than dispatching it as an operation', async () => {
    disk = preparation();
    show();
    await screen.findByText(/Another stock request is pending/);
    expect(get).not.toHaveBeenCalled();
    expect(check).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
  });
  it('requires explicit stop acknowledgment, retains a clear failure, and never retries a known stopped action', async () => {
    disk = request();
    show();
    fireEvent.click(
      await screen.findByRole('button', {
        name: 'Stop pending operation request',
      }),
    );
    expect(stop).not.toHaveBeenCalled();
    clear.mockRejectedValueOnce(new Error('Clear failed'));
    fireEvent.click(
      screen.getByRole('button', { name: /Confirm stop pending request$/ }),
    );
    await screen.findByText('Clear failed');
    expect(stop).toHaveBeenCalledWith(request());
    expect(
      screen.getByRole('button', {
        name: /Retry identical operation request$/,
      }),
    ).toBeDisabled();
    expect(disk).toEqual(request());
    fireEvent.click(
      screen.getByRole('button', { name: /Confirm stop pending request$/ }),
    );
    await waitFor(() => expect(close).toHaveBeenCalled());
    expect(disk).toBeNull();
    expect(save).not.toHaveBeenCalled();
  });
  it('recovers acceptance if save won before stop, without undoing or clearing before receipt review', async () => {
    disk = request();
    show();
    fireEvent.click(
      await screen.findByRole('button', {
        name: 'Stop pending operation request',
      }),
    );
    saved = true;
    fireEvent.click(
      screen.getByRole('button', { name: /Confirm stop pending request$/ }),
    );
    await screen.findByText(/Accepted operation:/);
    expect(clear).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
  });
  it('retains recovery after a lost stop response and a rejected status on remount', async () => {
    disk = request();
    const view = show();
    fireEvent.click(
      await screen.findByRole('button', {
        name: 'Stop pending operation request',
      }),
    );
    stop.mockRejectedValueOnce(new Error('Stop response lost'));
    fireEvent.click(
      screen.getByRole('button', { name: /Confirm stop pending request$/ }),
    );
    await screen.findByText('Stop response lost');
    view.unmount();
    check.mockRejectedValueOnce(new BillingActionRejected('Request stopped'));
    show();
    await screen.findByText('Request stopped');
    fireEvent.click(
      screen.getByRole('button', { name: 'Stop pending operation request' }),
    );
    fireEvent.click(
      screen.getByRole('button', { name: /Confirm stop pending request$/ }),
    );
    await waitFor(() => expect(clear).toHaveBeenCalledWith(3, request()));
    expect(save).not.toHaveBeenCalled();
  });
  it('ignores a late native onchange after account identity changes', async () => {
    const pending = deferred<StockOperationForm>();
    change.mockReturnValueOnce(pending.promise);
    const view = show();
    const input = await screen.findByRole('spinbutton', {
      name: 'Recorded done quantity',
    });
    fireEvent.change(input, { target: { value: '2' } });
    fireEvent.blur(input);
    await waitFor(() => expect(change).toHaveBeenCalled());
    nativeForm = { ...operationForm(), product: [7, 'New account medicine'] };
    view.changeIdentity(4);
    await screen.findByText('New account medicine');
    await act(async () => {
      pending.resolve({
        ...operationForm(),
        product: [5, 'Old account result'],
      });
      await pending.promise;
    });
    expect(screen.queryByText('Old account result')).not.toBeInTheDocument();
    expect(save).not.toHaveBeenCalled();
  });
  it('keeps an expired recovered request locked until reconnect', async () => {
    disk = request();
    check.mockRejectedValueOnce(new BillingSessionExpired());
    show();
    const button = await screen.findByRole('button', {
      name: 'Reconnect Billing',
    });
    expect(
      screen.getByRole('button', {
        name: /Retry identical operation request$/,
      }),
    ).toBeDisabled();
    fireEvent.click(button);
    expect(reconnect).toHaveBeenCalledTimes(1);
    expect(disk).toEqual(request());
    expect(save).not.toHaveBeenCalled();
  });
  it('retains the exact request if the accepted operation identity changes before finish', async () => {
    disk = { ...request(), operation_id: false };
    saved = true;
    show();
    const button = await screen.findByRole('button', {
      name: 'Finish and reload transfers',
    });
    check.mockResolvedValueOnce({ ...result(), operation_id: 88 });
    fireEvent.click(button);
    await screen.findByText(/Accepted operation receipt changed/);
    expect(clear).not.toHaveBeenCalled();
    expect(disk).not.toBeNull();
  });
  it('ignores a late effect preview after selection changes', async () => {
    const pending = deferred<PagedStockOperationReview>();
    preview.mockReturnValueOnce(pending.promise);
    const view = show();
    await edit();
    fireEvent.click(
      screen.getByRole('button', { name: 'Review operation changes' }),
    );
    await waitFor(() => expect(preview).toHaveBeenCalled());
    nativeForm = {
      ...operationForm(),
      move_id: 88,
      operation_id: 89,
      product: [7, 'Other selected move'],
    };
    view.changeIdentity(3, {
      ...operationSelection(),
      move_id: 88,
      operation_id: 89,
    });
    await screen.findByText('Other selected move');
    await act(async () => {
      pending.resolve(page({ ...request() }, 0));
      await pending.promise;
    });
    expect(
      screen.queryByText('Operation effect page 1'),
    ).not.toBeInTheDocument();
    expect(save).not.toHaveBeenCalled();
  });
});
