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
  getPagedStockReservation,
  getPagedStockReservationReview,
  getPagedStockReservationStatus,
  getPagedStockReservationReferences,
  savePagedStockReservation,
  stopPagedStockReservation,
  getStockReservation,
  stockPreparationActions,
  type StockReservationAction,
  type PagedStockConfirmationReferences,
} from '../billingService';
import { PagedStockReservationModal } from '../PagedStockReservationModal';
import {
  loadPagedStockWriteRecovery,
  persistPagedStockWriteRecovery,
  clearPagedStockWriteRecovery,
  type PagedStockWriteRequest,
} from '../stockReservationRecovery';
import { stockPreparationLabels } from '../stockTransferPages';
import { request as confirmationRequest } from './stockConfirmationPagedFixture';
import { operationRequest } from './stockOperationFixture';
import { load, request, review, status } from './stockReservationPagedFixture';

jest.mock('../billingService', () => ({
  ...jest.requireActual('../billingService'),
  getPagedStockReservation: jest.fn(),
  getPagedStockReservationReview: jest.fn(),
  getPagedStockReservationStatus: jest.fn(),
  getPagedStockReservationReferences: jest.fn(),
  savePagedStockReservation: jest.fn(),
  stopPagedStockReservation: jest.fn(),
  getStockReservation: jest.fn(),
}));
jest.mock('../stockReservationRecovery', () => ({
  ...jest.requireActual('../stockReservationRecovery'),
  loadPagedStockWriteRecovery: jest.fn(),
  persistPagedStockWriteRecovery: jest.fn(),
  clearPagedStockWriteRecovery: jest.fn(),
}));
const get = jest.mocked(getPagedStockReservation),
  preview = jest.mocked(getPagedStockReservationReview),
  check = jest.mocked(getPagedStockReservationStatus),
  refs = jest.mocked(getPagedStockReservationReferences),
  save = jest.mocked(savePagedStockReservation),
  stop = jest.mocked(stopPagedStockReservation),
  restore = jest.mocked(loadPagedStockWriteRecovery),
  persist = jest.mocked(persistPagedStockWriteRecovery),
  clear = jest.mocked(clearPagedStockWriteRecovery);
const close = jest.fn(),
  reconnect = jest.fn(),
  returnFocus = jest.fn();
let disk: Map<number, PagedStockWriteRequest>,
  effectCount = 101,
  referenceCount = 0;
const exact = (action: StockReservationAction = 'assign') => ({
  ...request(),
  action,
});
const accepted = (value = true, action: StockReservationAction = 'assign') => ({
  ...status(value),
  action,
  state_after: value
    ? action === 'unreserve'
      ? 'confirmed'
      : 'assigned'
    : (false as const),
  reference_count: value ? referenceCount : 0,
});
function effectPage(action: StockReservationAction = 'assign', after = 0) {
  const data = review();
  data.action = action;
  data.state_after = action === 'unreserve' ? 'confirmed' : 'assigned';
  const original = data.effects.updated['stock.quant'][0];
  data.effects.updated['stock.quant'] = Array.from(
    { length: Math.min(50, effectCount - after) },
    (_, index) => ({ ...original, id: 13 + after + index }),
  );
  data.after = after;
  data.total_count = effectCount;
  data.next_after = after + 50 < effectCount ? after + 50 : false;
  data.continuation_token = data.next_after === false ? false : 'c'.repeat(64);
  data.review_complete_token =
    data.next_after === false ? 'd'.repeat(64) : false;
  return data;
}
function referencePage(after = 0): PagedStockConfirmationReferences {
  const rows = Array.from({ length: referenceCount }, (_, index) => ({
    key: `new:stock.move.line:${index}`,
    model: 'stock.move.line',
    id: 1000 + index,
    name: index
      ? `QorliaQA Operation ${index}`
      : '<img src=x onerror=alert(1)>',
    available: true,
  })).sort((a, b) => (a.key < b.key ? -1 : 1));
  return {
    request_key: request().request_key,
    version: 'e'.repeat(64),
    after,
    total_count: referenceCount,
    next_after: after + 50 < referenceCount ? after + 50 : false,
    rows: rows.slice(after, after + 50),
  };
}
const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
};
function show() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const panel = (uid = 3, orderId = 9, transferId = 11) => (
    <QueryClientProvider client={client}>
      <PagedStockReservationModal
        uid={uid}
        orderId={orderId}
        transferId={transferId}
        close={close}
        reconnect={reconnect}
        returnFocus={returnFocus}
      />
    </QueryClientProvider>
  );
  const view = render(panel());
  return {
    ...view,
    client,
    changeIdentity: (uid: number) => view.rerender(panel(uid)),
  };
}
async function begin(action: StockReservationAction = 'assign') {
  fireEvent.click(
    await screen.findByRole('button', {
      name: `Review ${stockPreparationLabels[action]}`,
    }),
  );
  await screen.findByRole('heading', { name: 'Preparation effect page 1' });
}
async function complete(action: StockReservationAction = 'assign') {
  await begin(action);
  for (let page = 2; page <= Math.ceil(effectCount / 50); page++) {
    fireEvent.click(
      screen.getByRole('button', { name: 'Review next preparation effects' }),
    );
    await screen.findByRole('heading', {
      name: `Preparation effect page ${page}`,
    });
  }
}
describe('Complete paged preparation consumer', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    disk = new Map();
    effectCount = 101;
    referenceCount = 0;
    get.mockResolvedValue(load());
    preview.mockImplementation(async (selection, after = 0) =>
      effectPage(selection.action, after),
    );
    save.mockImplementation(async (request) => accepted(true, request.action));
    check.mockImplementation(async (request) => accepted(true, request.action));
    refs.mockImplementation(async (_request, after = 0) =>
      referencePage(after),
    );
    stop.mockResolvedValue({
      request_key: request().request_key,
      stopped: true,
      accepted: false,
    });
    restore.mockImplementation(async (uid) => disk.get(uid) ?? null);
    persist.mockImplementation(async (uid, request) => {
      disk.set(uid, request);
      return request;
    });
    clear.mockImplementation(async (uid, request) => {
      if (JSON.stringify(disk.get(uid)) === JSON.stringify(request))
        disk.delete(uid);
      return disk.get(uid) ?? null;
    });
    Object.defineProperty(crypto, 'randomUUID', {
      configurable: true,
      value: jest.fn(() => request().request_key),
    });
  });
  it.each(stockPreparationActions)(
    'reviews all effects and saves the exact native %s action with terminal proof',
    async (action) => {
      show();
      await begin(action);
      expect(screen.getByText(/501 stock moves/)).toHaveTextContent(
        '2001 detailed operations',
      );
      expect(
        screen.getByRole('button', { name: 'Save reviewed preparation' }),
      ).toBeDisabled();
      expect(
        screen.getByRole('heading', { name: 'Preparation effect page 1' }),
      ).toHaveFocus();
      expect(
        screen
          .getByRole('region', { name: 'Reviewed preparation effects' })
          .querySelectorAll('details'),
      ).toHaveLength(50);
      expect(crypto.randomUUID).not.toHaveBeenCalled();
      for (const page of [2, 3]) {
        fireEvent.click(
          screen.getByRole('button', {
            name: 'Review next preparation effects',
          }),
        );
        await screen.findByRole('heading', {
          name: `Preparation effect page ${page}`,
        });
      }
      expect(
        screen
          .getByRole('region', { name: 'Reviewed preparation effects' })
          .querySelectorAll('details'),
      ).toHaveLength(1);
      fireEvent.click(
        screen.getByRole('button', { name: 'Save reviewed preparation' }),
      );
      await screen.findByRole('heading', { name: /Accepted preparation:/ });
      expect(persist).toHaveBeenCalledWith(3, exact(action));
      expect(save).toHaveBeenCalledWith(exact(action));
      expect(persist.mock.invocationCallOrder[0]).toBeLessThan(
        save.mock.invocationCallOrder[0],
      );
      expect(crypto.randomUUID).toHaveBeenCalledTimes(1);
      expect(preview.mock.calls.map((call) => call.slice(1))).toEqual([
        [0, false, false, 50],
        [50, 'b'.repeat(64), 'c'.repeat(64), 50],
        [100, 'b'.repeat(64), 'c'.repeat(64), 50],
      ]);
      expect(
        preview.mock.calls.every((call) => call[0].action === action),
      ).toBe(true);
      expect(getStockReservation).not.toHaveBeenCalled();
    },
  );
  it('retains every native disabled reason and does not turn a compact recovery summary into an editable load', async () => {
    const state = load();
    state.reasons.assign = 'Native role does not permit reservation';
    get.mockResolvedValueOnce(state);
    const first = show();
    await screen.findByText(state.reasons.assign);
    expect(
      screen.getByRole('button', {
        name: 'Review Check availability and reserve',
      }),
    ).toBeDisabled();
    expect(
      screen.getByRole('button', { name: 'Review Unreserve stock' }),
    ).toBeEnabled();
    first.unmount();
    disk.set(3, exact('clear_quantities'));
    check.mockResolvedValueOnce(accepted(false, 'clear_quantities'));
    get.mockClear();
    show();
    await screen.findByRole('button', {
      name: /Retry identical preparation request/,
    });
    expect(
      screen.queryByRole('button', { name: 'Review Unreserve stock' }),
    ).not.toBeInTheDocument();
    expect(get).not.toHaveBeenCalled();
    expect(
      screen.getByText('Action: Clear matching recorded quantities'),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Package counts are not included/),
    ).toBeInTheDocument();
  });
  it('keeps the action and original pins on backward review, then hides stale effects after a failed page', async () => {
    show();
    await begin('unreserve');
    fireEvent.click(
      screen.getByRole('button', { name: 'Review next preparation effects' }),
    );
    await screen.findByRole('heading', { name: 'Preparation effect page 2' });
    fireEvent.click(
      screen.getByRole('button', { name: 'Previous preparation effects' }),
    );
    await screen.findByRole('heading', { name: 'Preparation effect page 1' });
    expect(preview).toHaveBeenLastCalledWith(
      {
        order_id: 9,
        transfer_id: 11,
        version: load().version,
        action: 'unreserve',
      },
      0,
      false,
      false,
      50,
    );
    preview.mockRejectedValueOnce(
      new BillingActionRejected('Preparation review changed'),
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Review next preparation effects' }),
    );
    await screen.findByText('Preparation review changed');
    expect(
      screen.queryByRole('region', { name: 'Reviewed preparation effects' }),
    ).not.toBeInTheDocument();
    expect(save).not.toHaveBeenCalled();
    fireEvent.click(
      screen.getByRole('button', { name: 'Reload preparation state' }),
    );
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Review Unreserve stock' }),
      ).toBeEnabled(),
    );
  });
  it('rejects a changed action between pages instead of saving a mixed review', async () => {
    show();
    await begin();
    preview.mockResolvedValueOnce(effectPage('unreserve', 50));
    fireEvent.click(
      screen.getByRole('button', { name: 'Review next preparation effects' }),
    );
    await screen.findByText(/Preparation pages changed/);
    expect(
      screen.queryByRole('button', { name: 'Save reviewed preparation' }),
    ).not.toBeInTheDocument();
    expect(persist).not.toHaveBeenCalled();
  });
  it('awaits durable storage before dispatch and blocks duplicate clicks or close while committing', async () => {
    effectCount = 1;
    const commit = deferred<PagedStockWriteRequest | null>();
    persist.mockReturnValueOnce(commit.promise);
    show();
    await complete('set_quantities');
    const button = screen.getByRole('button', {
      name: 'Save reviewed preparation',
    });
    fireEvent.click(button);
    fireEvent.click(button);
    await waitFor(() => expect(persist).toHaveBeenCalledTimes(1));
    expect(save).not.toHaveBeenCalled();
    expect(crypto.randomUUID).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(close).not.toHaveBeenCalled();
    disk.set(3, exact('set_quantities'));
    await act(async () => commit.resolve(exact('set_quantities')));
    await screen.findByRole('heading', {
      name: 'Accepted preparation: assigned',
    });
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith(exact('set_quantities'));
  });
  it('retains a lost save over remount and retries only the exact original action without another nonce', async () => {
    effectCount = 1;
    save.mockRejectedValueOnce(new Error('Preparation response lost'));
    const first = show();
    await complete('clear_quantities');
    fireEvent.click(
      screen.getByRole('button', { name: 'Save reviewed preparation' }),
    );
    await screen.findByText('Preparation response lost');
    expect(disk.get(3)).toEqual(exact('clear_quantities'));
    first.unmount();
    get.mockClear();
    check.mockResolvedValueOnce(accepted(false, 'clear_quantities'));
    show();
    await screen.findByRole('button', {
      name: /Retry identical preparation request/,
    });
    expect(save).toHaveBeenCalledTimes(1);
    expect(get).not.toHaveBeenCalled();
    fireEvent.click(
      screen.getByRole('button', {
        name: /Retry identical preparation request/,
      }),
    );
    await screen.findByRole('heading', {
      name: 'Accepted preparation: assigned',
    });
    expect(save).toHaveBeenLastCalledWith(exact('clear_quantities'));
    expect(crypto.randomUUID).toHaveBeenCalledTimes(1);
    expect(clear).not.toHaveBeenCalled();
  });
  it.each([
    new BillingActionRejected('Native preparation rejected'),
    new BillingSessionExpired(),
  ])('keeps a rejected or expired write recoverable: %s', async (error) => {
    effectCount = 1;
    save.mockRejectedValueOnce(error);
    show();
    await complete();
    fireEvent.click(
      screen.getByRole('button', { name: 'Save reviewed preparation' }),
    );
    await screen.findByText(error.message);
    expect(disk.get(3)).toEqual(exact());
    expect(clear).not.toHaveBeenCalled();
    expect(
      screen.getByRole('button', {
        name: /Retry identical preparation request/,
      }),
    ).toHaveProperty('disabled', error instanceof BillingSessionExpired);
  });
  it('reads all pinned references and checks a fresh accepted receipt before exact finish', async () => {
    referenceCount = 101;
    disk.set(3, exact());
    const { client, container } = show(),
      invalidated = jest.spyOn(client, 'invalidateQueries');
    fireEvent.click(
      await screen.findByRole('button', { name: 'Read saved references' }),
    );
    await screen.findByRole('heading', { name: 'Saved reference page 1' });
    const region = () =>
      screen.getByRole('region', { name: 'Saved preparation references' });
    expect(within(region()).getAllByRole('listitem')).toHaveLength(50);
    expect(container.querySelector('img')).toBeNull();
    expect(
      screen.getByRole('button', { name: 'Finish and reload transfers' }),
    ).toBeDisabled();
    for (const page of [2, 3]) {
      fireEvent.click(
        screen.getByRole('button', { name: 'Next saved references' }),
      );
      await screen.findByRole('heading', {
        name: `Saved reference page ${page}`,
      });
    }
    expect(within(region()).getAllByRole('listitem')).toHaveLength(1);
    expect(refs.mock.calls).toEqual([
      [exact(), 0, false, 50],
      [exact(), 50, 'e'.repeat(64), 50],
      [exact(), 100, 'e'.repeat(64), 50],
    ]);
    const fresh = deferred<ReturnType<typeof accepted>>();
    check.mockReturnValueOnce(fresh.promise);
    fireEvent.click(
      screen.getByRole('button', { name: 'Finish and reload transfers' }),
    );
    await waitFor(() => expect(check).toHaveBeenCalledTimes(2));
    expect(clear).not.toHaveBeenCalled();
    await act(async () => fresh.resolve(accepted()));
    await waitFor(() => expect(close).toHaveBeenCalledTimes(1));
    expect(clear).toHaveBeenCalledWith(3, exact());
    expect(disk.has(3)).toBe(false);
    expect(invalidated).toHaveBeenCalledWith({
      queryKey: ['billing', 'stock-reservation-paged', 3],
      refetchType: 'none',
    });
  });
  it('keeps pending recovery when references or final receipt are unavailable', async () => {
    referenceCount = 1;
    disk.set(3, exact());
    refs.mockRejectedValueOnce(
      new BillingActionRejected('Reference access changed'),
    );
    show();
    fireEvent.click(
      await screen.findByRole('button', { name: 'Read saved references' }),
    );
    await screen.findByText('Reference access changed');
    expect(clear).not.toHaveBeenCalled();
    fireEvent.click(
      screen.getByRole('button', { name: 'Read saved references' }),
    );
    await screen.findByRole('heading', { name: 'Saved reference page 1' });
    check.mockResolvedValueOnce(accepted(false));
    fireEvent.click(
      screen.getByRole('button', { name: 'Finish and reload transfers' }),
    );
    await screen.findByText(/Accepted preparation receipt changed/);
    expect(disk.get(3)).toEqual(exact());
    expect(clear).not.toHaveBeenCalled();
  });
  it('does not dispatch if storage fails or the identity changes before its commit', async () => {
    effectCount = 1;
    persist.mockRejectedValueOnce(new Error('Preparation storage failed'));
    const first = show();
    await complete();
    fireEvent.click(
      screen.getByRole('button', { name: 'Save reviewed preparation' }),
    );
    await screen.findByText('Preparation storage failed');
    expect(save).not.toHaveBeenCalled();
    first.unmount();
    const commit = deferred<PagedStockWriteRequest | null>();
    persist.mockReturnValueOnce(commit.promise);
    const second = show();
    await complete();
    fireEvent.click(
      screen.getByRole('button', { name: 'Save reviewed preparation' }),
    );
    await waitFor(() => expect(persist).toHaveBeenCalledTimes(2));
    second.changeIdentity(4);
    await waitFor(() => expect(restore).toHaveBeenLastCalledWith(4));
    disk.set(3, exact());
    await act(async () => commit.resolve(exact()));
    expect(save).not.toHaveBeenCalled();
    expect(disk.get(3)).toEqual(exact());
  });
  it.each([
    confirmationRequest(),
    { ...operationRequest(), review_complete_token: 'd'.repeat(64) },
  ])(
    'does not convert a pending request from another workflow: %j',
    async (other) => {
      disk.set(3, other);
      show();
      await screen.findByText(/Another stock request is pending/);
      expect(get).not.toHaveBeenCalled();
      expect(check).not.toHaveBeenCalled();
      expect(save).not.toHaveBeenCalled();
      expect(clear).not.toHaveBeenCalled();
    },
  );
  it('stops the exact preparation only after confirmation, and retains it if local clearing fails', async () => {
    disk.set(3, exact('unreserve'));
    check.mockResolvedValueOnce(accepted(false, 'unreserve'));
    clear.mockRejectedValueOnce(new Error('Stop clear failed'));
    show();
    fireEvent.click(
      await screen.findByRole('button', {
        name: 'Stop pending preparation request',
      }),
    );
    expect(stop).not.toHaveBeenCalled();
    fireEvent.click(
      screen.getByRole('button', { name: 'Keep pending request' }),
    );
    expect(
      screen.getByRole('button', { name: 'Stop pending preparation request' }),
    ).toHaveFocus();
    fireEvent.click(
      screen.getByRole('button', { name: 'Stop pending preparation request' }),
    );
    fireEvent.click(
      screen.getByRole('button', { name: /Confirm stop pending request/ }),
    );
    await screen.findByText('Stop clear failed');
    expect(stop).toHaveBeenCalledWith(exact('unreserve'));
    expect(disk.get(3)).toEqual(exact('unreserve'));
    expect(
      screen.getByRole('button', {
        name: /Retry identical preparation request/,
      }),
    ).toBeDisabled();
    expect(close).not.toHaveBeenCalled();
    fireEvent.click(
      screen.getByRole('button', { name: /Confirm stop pending request/ }),
    );
    await waitFor(() => expect(close).toHaveBeenCalledTimes(1));
    expect(stop).toHaveBeenCalledTimes(2);
    expect(save).not.toHaveBeenCalled();
  });
  it('recovers an accepted preparation if acceptance wins before stop', async () => {
    disk.set(3, exact());
    check.mockResolvedValueOnce(accepted(false));
    stop.mockResolvedValueOnce({
      request_key: request().request_key,
      stopped: false,
      accepted: true,
    });
    show();
    fireEvent.click(
      await screen.findByRole('button', {
        name: 'Stop pending preparation request',
      }),
    );
    fireEvent.click(
      screen.getByRole('button', { name: /Confirm stop pending request/ }),
    );
    await screen.findByRole('heading', {
      name: 'Accepted preparation: assigned',
    });
    expect(check).toHaveBeenLastCalledWith(exact());
    expect(clear).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
    expect(disk.get(3)).toEqual(exact());
  });
  it('restores the original request after a lost stop response, despite a rejected status after remount', async () => {
    disk.set(3, exact());
    check.mockResolvedValueOnce(accepted(false));
    stop.mockRejectedValueOnce(new Error('Preparation stop response lost'));
    const first = show();
    fireEvent.click(
      await screen.findByRole('button', {
        name: 'Stop pending preparation request',
      }),
    );
    fireEvent.click(
      screen.getByRole('button', { name: /Confirm stop pending request/ }),
    );
    await screen.findByText('Preparation stop response lost');
    first.unmount();
    check.mockRejectedValue(
      new BillingActionRejected('Preparation was stopped'),
    );
    show();
    await screen.findByText('Preparation was stopped');
    fireEvent.click(
      screen.getByRole('button', { name: 'Stop pending preparation request' }),
    );
    fireEvent.click(
      screen.getByRole('button', { name: /Confirm stop pending request/ }),
    );
    await waitFor(() => expect(close).toHaveBeenCalledTimes(1));
    expect(stop.mock.calls).toEqual([[exact()], [exact()]]);
    expect(save).not.toHaveBeenCalled();
  });
  it('keeps an expired restored request locked until reconnect', async () => {
    disk.set(3, exact());
    check.mockRejectedValueOnce(new BillingSessionExpired());
    show();
    fireEvent.click(
      await screen.findByRole('button', { name: 'Reconnect Billing' }),
    );
    expect(reconnect).toHaveBeenCalledTimes(1);
    expect(
      screen.getByRole('button', { name: 'Stop pending preparation request' }),
    ).toBeDisabled();
    expect(clear).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
  });
  it('discards a late preview after the account changes', async () => {
    const late = deferred<ReturnType<typeof effectPage>>();
    preview.mockReturnValueOnce(late.promise);
    const view = show();
    fireEvent.click(
      await screen.findByRole('button', {
        name: 'Review Check availability and reserve',
      }),
    );
    await waitFor(() => expect(preview).toHaveBeenCalledTimes(1));
    view.changeIdentity(4);
    await waitFor(() => expect(restore).toHaveBeenLastCalledWith(4));
    await act(async () => late.resolve(effectPage()));
    expect(
      screen.queryByRole('heading', { name: /Preparation effect page/ }),
    ).not.toBeInTheDocument();
    expect(save).not.toHaveBeenCalled();
  });
  it.each([true, false])(
    'uses native write readiness for a terminal zero-effect review (%s)',
    async (ready) => {
      effectCount = 0;
      const empty = effectPage();
      empty.write_ready = ready;
      empty.effects = {
        created: {},
        updated: {},
        deleted: {},
        labels: {},
        schema: {},
        private_audit_counts: {},
      };
      preview.mockResolvedValueOnce(empty);
      show();
      await begin();
      expect(
        screen.getByRole('button', { name: 'Save reviewed preparation' }),
      ).toHaveProperty('disabled', !ready);
      expect(save).not.toHaveBeenCalled();
      expect(persist).not.toHaveBeenCalled();
    },
  );
  it('recovers an off-page preparation for its original order without loading the selected transfer', async () => {
    const old = { ...exact('set_quantities'), order_id: 10, transfer_id: 12 };
    disk.set(3, old);
    const receipt = accepted(true, 'set_quantities');
    receipt.current = {
      ...receipt.current,
      order_id: 10,
      transfer_id: 12,
      transfer: { ...receipt.current.transfer, id: 12 },
    };
    check.mockResolvedValue(receipt);
    show();
    await screen.findByText(/Resolve this previous preparation/);
    expect(check).toHaveBeenCalledWith(old);
    expect(get).not.toHaveBeenCalled();
    fireEvent.click(
      screen.getByRole('button', { name: 'Finish and reload transfers' }),
    );
    await waitFor(() => expect(close).toHaveBeenCalledTimes(1));
    expect(clear).toHaveBeenCalledWith(3, old);
    expect(save).not.toHaveBeenCalled();
  });
});
