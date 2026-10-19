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
  getPagedStockConfirmation,
  getPagedStockConfirmationReview,
  getPagedStockConfirmationStatus,
  getPagedStockConfirmationReferences,
  savePagedStockConfirmation,
  stopPagedStockConfirmation,
  type PagedStockConfirmationReferences,
} from '../billingService';
import { PagedStockConfirmationModal } from '../PagedStockConfirmationModal';
import {
  loadPagedStockWriteRecovery,
  persistPagedStockWriteRecovery,
  clearPagedStockWriteRecovery,
  type PagedStockWriteRequest,
} from '../stockReservationRecovery';
import { load, request, review, status } from './stockConfirmationPagedFixture';
import { operationRequest } from './stockOperationFixture';

jest.mock('../billingService', () => ({
  ...jest.requireActual('../billingService'),
  getPagedStockConfirmation: jest.fn(),
  getPagedStockConfirmationReview: jest.fn(),
  getPagedStockConfirmationStatus: jest.fn(),
  getPagedStockConfirmationReferences: jest.fn(),
  savePagedStockConfirmation: jest.fn(),
  stopPagedStockConfirmation: jest.fn(),
}));
jest.mock('../stockReservationRecovery', () => ({
  ...jest.requireActual('../stockReservationRecovery'),
  loadPagedStockWriteRecovery: jest.fn(),
  persistPagedStockWriteRecovery: jest.fn(),
  clearPagedStockWriteRecovery: jest.fn(),
}));
const get = jest.mocked(getPagedStockConfirmation),
  preview = jest.mocked(getPagedStockConfirmationReview),
  save = jest.mocked(savePagedStockConfirmation),
  stopRequest = jest.mocked(stopPagedStockConfirmation),
  check = jest.mocked(getPagedStockConfirmationStatus),
  refs = jest.mocked(getPagedStockConfirmationReferences),
  restore = jest.mocked(loadPagedStockWriteRecovery),
  persist = jest.mocked(persistPagedStockWriteRecovery),
  clear = jest.mocked(clearPagedStockWriteRecovery);
const close = jest.fn(),
  reconnect = jest.fn(),
  returnFocus = jest.fn();
let disk: Map<number, PagedStockWriteRequest>;
let effectCount = 101,
  referenceCount = 101;
function effectPage(after = 0) {
  const data = review();
  const row = data.effects.updated['stock.move'][0];
  data.effects.updated['stock.move'] = Array.from(
    { length: Math.min(50, effectCount - after) },
    (_, index) => ({ ...row, id: 12 + after + index }),
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
    key: `new:stock.move:${index}`,
    model: 'stock.move',
    id: index + 1000,
    name: index
      ? `QorliaQA reference ${index}`
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
const accepted = (value = true) => ({
  ...status(value),
  reference_count: value ? referenceCount : 0,
});
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
  const element = (uid = 3, orderId = 9, transferId = 11) => (
    <QueryClientProvider client={client}>
      <PagedStockConfirmationModal
        uid={uid}
        orderId={orderId}
        transferId={transferId}
        close={close}
        reconnect={reconnect}
        returnFocus={returnFocus}
      />
    </QueryClientProvider>
  );
  const view = render(element());
  return {
    ...view,
    client,
    changeIdentity: (uid: number, orderId = 9, transferId = 11) =>
      view.rerender(element(uid, orderId, transferId)),
  };
}
async function begin() {
  fireEvent.click(
    await screen.findByRole('button', { name: 'Review Mark as Todo' }),
  );
  await screen.findByRole('heading', { name: 'Confirmation effect page 1' });
}
async function completeReview() {
  await begin();
  for (let page = 2; page <= Math.ceil(effectCount / 50); page++) {
    fireEvent.click(
      screen.getByRole('button', { name: 'Review next confirmation effects' }),
    );
    await screen.findByRole('heading', {
      name: `Confirmation effect page ${page}`,
    });
  }
}
describe('Complete paged confirmation consumer', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    disk = new Map();
    effectCount = 101;
    referenceCount = 101;
    get.mockResolvedValue(load());
    preview.mockImplementation(async (_selection, after = 0) =>
      effectPage(after),
    );
    save.mockImplementation(async () => accepted());
    check.mockImplementation(async () => accepted());
    stopRequest.mockResolvedValue({
      request_key: request().request_key,
      stopped: true,
      accepted: false,
    });
    refs.mockImplementation(async (_request, after = 0) =>
      referencePage(after),
    );
    restore.mockImplementation(async (uid) => disk.get(uid) ?? null);
    persist.mockImplementation(async (uid, exact) => {
      disk.set(uid, exact);
      return exact;
    });
    clear.mockImplementation(async (uid, exact) => {
      if (JSON.stringify(disk.get(uid)) === JSON.stringify(exact))
        disk.delete(uid);
      return disk.get(uid) ?? null;
    });
    Object.defineProperty(crypto, 'randomUUID', {
      configurable: true,
      value: () => request().request_key,
    });
  });
  it('requires every effect page, keeps rendered rows bounded and supports pinned backward review', async () => {
    show();
    await begin();
    expect(screen.getByText(/501 stock moves/)).toHaveTextContent(
      '2001 detailed operations',
    );
    expect(
      screen.getByRole('button', { name: 'Save reviewed confirmation' }),
    ).toBeDisabled();
    expect(
      screen.getByRole('heading', { name: 'Confirmation effect page 1' }),
    ).toHaveFocus();
    expect(
      screen
        .getByRole('region', { name: 'Reviewed confirmation effects' })
        .querySelectorAll('details'),
    ).toHaveLength(50);
    fireEvent.click(
      screen.getByRole('button', { name: 'Review next confirmation effects' }),
    );
    await screen.findByRole('heading', { name: 'Confirmation effect page 2' });
    expect(
      screen.getByRole('button', { name: 'Save reviewed confirmation' }),
    ).toBeDisabled();
    fireEvent.click(
      screen.getByRole('button', { name: 'Previous confirmation effects' }),
    );
    await screen.findByRole('heading', { name: 'Confirmation effect page 1' });
    fireEvent.click(
      screen.getByRole('button', { name: 'Review next confirmation effects' }),
    );
    await screen.findByRole('heading', { name: 'Confirmation effect page 2' });
    fireEvent.click(
      screen.getByRole('button', { name: 'Review next confirmation effects' }),
    );
    await screen.findByRole('heading', { name: 'Confirmation effect page 3' });
    expect(
      screen
        .getByRole('region', { name: 'Reviewed confirmation effects' })
        .querySelectorAll('details'),
    ).toHaveLength(1);
    expect(
      screen.getByRole('button', { name: 'Save reviewed confirmation' }),
    ).toBeEnabled();
    expect(preview.mock.calls.map((args) => args.slice(1))).toEqual([
      [0, false, false, 50],
      [50, 'b'.repeat(64), 'c'.repeat(64), 50],
      [0, false, false, 50],
      [50, 'b'.repeat(64), 'c'.repeat(64), 50],
      [100, 'b'.repeat(64), 'c'.repeat(64), 50],
    ]);
    expect(save).not.toHaveBeenCalled();
    expect(persist).not.toHaveBeenCalled();
  });
  it('persists the terminal proof before HTTP, blocks duplicate dispatch and reads all references before exact finish', async () => {
    const committed = deferred<PagedStockWriteRequest | null>();
    persist.mockReturnValueOnce(committed.promise);
    const { client } = show();
    const invalidated = jest.spyOn(client, 'invalidateQueries');
    await completeReview();
    const button = screen.getByRole('button', {
      name: 'Save reviewed confirmation',
    });
    fireEvent.click(button);
    fireEvent.click(button);
    await waitFor(() => expect(persist).toHaveBeenCalledTimes(1));
    expect(persist).toHaveBeenCalledWith(3, request());
    expect(save).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(close).not.toHaveBeenCalled();
    disk.set(3, request());
    await act(async () => committed.resolve(request()));
    await screen.findByRole('heading', {
      name: 'Accepted confirmation: waiting',
    });
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith(request());
    expect(
      screen.getByRole('button', { name: 'Finish and reload transfers' }),
    ).toBeDisabled();
    fireEvent.click(
      screen.getByRole('button', { name: 'Read saved references' }),
    );
    await screen.findByRole('heading', { name: 'Saved reference page 1' });
    expect(
      screen.getByText(/<img src=x onerror=alert\(1\)>/),
    ).toBeInTheDocument();
    expect(document.querySelector('img')).toBeNull();
    const region = () =>
      screen.getByRole('region', { name: 'Saved confirmation references' });
    expect(within(region()).getAllByRole('listitem')).toHaveLength(50);
    for (const page of [2, 3]) {
      fireEvent.click(
        screen.getByRole('button', { name: 'Next saved references' }),
      );
      await screen.findByRole('heading', {
        name: `Saved reference page ${page}`,
      });
    }
    expect(within(region()).getAllByRole('listitem')).toHaveLength(1);
    expect(
      screen.getByRole('heading', { name: 'Saved reference page 3' }),
    ).toHaveFocus();
    expect(refs.mock.calls).toEqual([
      [request(), 0, false, 50],
      [request(), 50, 'e'.repeat(64), 50],
      [request(), 100, 'e'.repeat(64), 50],
    ]);
    fireEvent.click(
      screen.getByRole('button', { name: 'Finish and reload transfers' }),
    );
    await waitFor(() => expect(close).toHaveBeenCalledTimes(1));
    expect(check).toHaveBeenCalledWith(request());
    expect(clear).toHaveBeenCalledWith(3, request());
    expect(disk.has(3)).toBe(false);
    expect(check.mock.invocationCallOrder.at(-1)).toBeLessThan(
      clear.mock.invocationCallOrder[0],
    );
    expect(invalidated).toHaveBeenCalledWith({
      queryKey: ['billing', 'reservation-recovery', 3],
    });
  });
  it('retains an unknown outcome over remount, does not retry automatically and recovers the exact request', async () => {
    referenceCount = 0;
    save.mockRejectedValueOnce(new Error('Lost accepted response'));
    const view = show();
    await completeReview();
    fireEvent.click(
      screen.getByRole('button', { name: 'Save reviewed confirmation' }),
    );
    await screen.findByText('Lost accepted response');
    expect(disk.get(3)).toEqual(request());
    view.unmount();
    check.mockResolvedValueOnce(accepted(false));
    show();
    await screen.findByRole('button', {
      name: /Retry identical confirmation request/,
    });
    expect(save).toHaveBeenCalledTimes(1);
    expect(clear).not.toHaveBeenCalled();
    fireEvent.click(
      screen.getByRole('button', { name: 'Check confirmation request' }),
    );
    await screen.findByRole('heading', {
      name: 'Accepted confirmation: waiting',
    });
    expect(save).toHaveBeenCalledTimes(1);
    expect(disk.get(3)).toEqual(request());
    fireEvent.click(
      screen.getByRole('button', { name: 'Finish and reload transfers' }),
    );
    await waitFor(() => expect(close).toHaveBeenCalledTimes(1));
  });
  it.each([
    new BillingActionRejected('Native rejected'),
    new Error('Unknown network response'),
  ])('never clears unresolved recovery on save error %s', async (error) => {
    save.mockRejectedValue(error);
    show();
    await completeReview();
    fireEvent.click(
      screen.getByRole('button', { name: 'Save reviewed confirmation' }),
    );
    await screen.findByText(error.message);
    expect(disk.get(3)).toEqual(request());
    expect(clear).not.toHaveBeenCalled();
    fireEvent.click(
      screen.getByRole('button', {
        name: /Retry identical confirmation request/,
      }),
    );
    await waitFor(() => expect(save).toHaveBeenCalledTimes(2));
    expect(save).toHaveBeenLastCalledWith(request());
    expect(clear).not.toHaveBeenCalled();
  });
  it('does not dispatch if persistence fails or if the user unmounts before storage commits', async () => {
    persist.mockRejectedValueOnce(new Error('Storage failed'));
    const first = show();
    await completeReview();
    fireEvent.click(
      screen.getByRole('button', { name: 'Save reviewed confirmation' }),
    );
    await screen.findByText('Storage failed');
    expect(save).not.toHaveBeenCalled();
    first.unmount();
    const committed = deferred<PagedStockWriteRequest | null>();
    persist.mockReturnValueOnce(committed.promise);
    const second = show();
    await completeReview();
    fireEvent.click(
      screen.getByRole('button', { name: 'Save reviewed confirmation' }),
    );
    await waitFor(() => expect(persist).toHaveBeenCalledTimes(2));
    second.unmount();
    disk.set(3, request());
    await act(async () => committed.resolve(request()));
    expect(save).not.toHaveBeenCalled();
    expect(disk.get(3)).toEqual(request());
  });
  it('hides stale effects on continuation failure and requires a fresh review after reload', async () => {
    show();
    await begin();
    preview.mockRejectedValueOnce(new BillingActionRejected('Review changed'));
    fireEvent.click(
      screen.getByRole('button', { name: 'Review next confirmation effects' }),
    );
    await screen.findByText('Review changed');
    expect(
      screen.queryByRole('region', { name: 'Reviewed confirmation effects' }),
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
    await begin();
    expect(preview).toHaveBeenLastCalledWith(
      { order_id: 9, transfer_id: 11, version: load().version },
      0,
      false,
      false,
      50,
    );
    expect(save).not.toHaveBeenCalled();
  });
  it('rejects incoherent review pages rather than completing a mixed snapshot', async () => {
    show();
    await begin();
    preview.mockResolvedValueOnce({ ...effectPage(50), total_count: 102 });
    fireEvent.click(
      screen.getByRole('button', { name: 'Review next confirmation effects' }),
    );
    await screen.findByText(/Confirmation pages changed/);
    expect(
      screen.queryByRole('button', { name: 'Save reviewed confirmation' }),
    ).not.toBeInTheDocument();
  });
  it('keeps pending recovery on reference-page errors and restarts from a fresh pinned reference snapshot', async () => {
    disk.set(3, request());
    const view = show();
    await screen.findByRole('button', { name: 'Read saved references' });
    expect(screen.getByText(/2 package operations/)).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole('button', { name: 'Read saved references' }),
    );
    await screen.findByRole('heading', { name: 'Saved reference page 1' });
    refs.mockRejectedValueOnce(
      new BillingActionRejected('Reference snapshot changed'),
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Next saved references' }),
    );
    await screen.findByText('Reference snapshot changed');
    expect(
      screen.getByRole('button', { name: 'Finish and reload transfers' }),
    ).toBeDisabled();
    expect(disk.get(3)).toEqual(request());
    fireEvent.click(
      screen.getByRole('button', { name: 'Read saved references' }),
    );
    await screen.findByRole('heading', { name: 'Saved reference page 1' });
    expect(refs).toHaveBeenLastCalledWith(request(), 0, false, 50);
    expect(view.container.querySelector('img')).toBeNull();
  });
  it('keeps recovery when a fresh finish receipt or clear fails', async () => {
    referenceCount = 0;
    disk.set(3, request());
    show();
    await screen.findByRole('heading', {
      name: 'Accepted confirmation: waiting',
    });
    check.mockResolvedValueOnce(accepted(false));
    fireEvent.click(
      screen.getByRole('button', { name: 'Finish and reload transfers' }),
    );
    await screen.findByText(/Accepted confirmation receipt changed/);
    expect(clear).not.toHaveBeenCalled();
    clear.mockRejectedValueOnce(new Error('Clear failed'));
    fireEvent.click(
      screen.getByRole('button', { name: 'Finish and reload transfers' }),
    );
    await screen.findByText('Clear failed');
    expect(disk.get(3)).toEqual(request());
    expect(close).not.toHaveBeenCalled();
    fireEvent.click(
      screen.getByRole('button', { name: 'Finish and reload transfers' }),
    );
    await waitFor(() => expect(close).toHaveBeenCalledTimes(1));
  });
  it('preserves expiry recovery and exposes reconnect without another dispatch', async () => {
    save.mockRejectedValueOnce(new BillingSessionExpired());
    show();
    await completeReview();
    fireEvent.click(
      screen.getByRole('button', { name: 'Save reviewed confirmation' }),
    );
    fireEvent.click(
      await screen.findByRole('button', { name: 'Reconnect Billing' }),
    );
    expect(reconnect).toHaveBeenCalledTimes(1);
    expect(disk.get(3)).toEqual(request());
    expect(save).toHaveBeenCalledTimes(1);
    expect(
      screen.getByRole('button', {
        name: /Retry identical confirmation request/,
      }),
    ).toBeDisabled();
  });
  it('does not reinterpret a different paged pending kind', async () => {
    disk.set(3, {
      ...operationRequest(),
      review_complete_token: 'd'.repeat(64),
    });
    show();
    await screen.findByText(/Another stock request is pending/);
    expect(get).not.toHaveBeenCalled();
    expect(check).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
    expect(disk.has(3)).toBe(true);
  });
  it('discards an old asynchronous review when account identity changes', async () => {
    const late = deferred<ReturnType<typeof effectPage>>();
    preview.mockReturnValueOnce(late.promise);
    const view = show();
    fireEvent.click(
      await screen.findByRole('button', { name: 'Review Mark as Todo' }),
    );
    await waitFor(() => expect(preview).toHaveBeenCalledTimes(1));
    view.changeIdentity(4);
    await waitFor(() => expect(restore).toHaveBeenLastCalledWith(4));
    await act(async () => late.resolve(effectPage()));
    expect(
      screen.queryByRole('heading', { name: /Confirmation effect page/ }),
    ).not.toBeInTheDocument();
    expect(persist).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
  });
  it('keeps native access and write-readiness restrictions rather than enabling save for an empty page', async () => {
    get.mockResolvedValueOnce({
      ...load(),
      reason: 'Native role does not permit confirmation',
      write_ready: false,
    });
    const first = show();
    await screen.findByText('Native role does not permit confirmation');
    expect(
      screen.getByRole('button', { name: 'Review Mark as Todo' }),
    ).toBeDisabled();
    expect(preview).not.toHaveBeenCalled();
    first.unmount();
    effectCount = 0;
    const empty = effectPage();
    empty.effects = {
      created: {},
      updated: {},
      deleted: {},
      labels: {},
      schema: {},
      private_audit_counts: {},
    };
    preview.mockResolvedValueOnce({ ...empty, write_ready: false });
    show();
    await begin();
    expect(
      screen.getByText(/Saving is not available for this review/),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Save reviewed confirmation' }),
    ).toBeDisabled();
    expect(persist).not.toHaveBeenCalled();
  });
  it('paginates saved references backward with the original pin and preserves hidden reference privacy', async () => {
    disk.set(3, request());
    show();
    fireEvent.click(
      await screen.findByRole('button', { name: 'Read saved references' }),
    );
    await screen.findByRole('heading', { name: 'Saved reference page 1' });
    fireEvent.click(
      screen.getByRole('button', { name: 'Next saved references' }),
    );
    await screen.findByRole('heading', { name: 'Saved reference page 2' });
    const first = referencePage();
    first.rows[0] = {
      ...first.rows[0],
      id: false,
      name: false,
      available: false,
    };
    refs.mockResolvedValueOnce(first);
    fireEvent.click(
      screen.getByRole('button', { name: 'Previous saved references' }),
    );
    await screen.findByRole('heading', { name: 'Saved reference page 1' });
    expect(refs).toHaveBeenLastCalledWith(request(), 0, 'e'.repeat(64), 50);
    expect(
      screen.getByText(/No longer available or not readable/),
    ).toBeInTheDocument();
    expect(screen.queryByText(/#1000/)).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Finish and reload transfers' }),
    ).toBeDisabled();
  });
  it('checks the original off-page request without loading or silently replacing it with the selected transfer', async () => {
    const old = { ...request(), order_id: 10, transfer_id: 12 };
    disk.set(3, old);
    const saved = accepted();
    saved.current = {
      ...load(),
      order_id: 10,
      transfer_id: 12,
      transfer: { ...load().transfer, id: 12 },
    };
    check.mockResolvedValueOnce(saved);
    show();
    await screen.findByText(/Resolve this previous confirmation/);
    expect(check).toHaveBeenCalledWith(old);
    expect(get).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
    expect(persist).not.toHaveBeenCalled();
    expect(disk.get(3)).toEqual(old);
  });
  it('requires an explicit stop confirmation, commits the server outcome before exact clear and prevents duplicate dispatch', async () => {
    disk.set(3, request());
    check.mockResolvedValue(accepted(false));
    const stopped =
      deferred<Awaited<ReturnType<typeof stopPagedStockConfirmation>>>();
    stopRequest.mockReturnValueOnce(stopped.promise);
    const { client } = show();
    const invalidated = jest.spyOn(client, 'invalidateQueries');
    fireEvent.click(
      await screen.findByRole('button', {
        name: 'Stop pending confirmation request',
      }),
    );
    expect(screen.getByText('Stop this exact request?')).toHaveFocus();
    fireEvent.click(
      screen.getByRole('button', { name: 'Keep pending request' }),
    );
    expect(
      screen.getByRole('button', { name: 'Stop pending confirmation request' }),
    ).toHaveFocus();
    expect(stopRequest).not.toHaveBeenCalled();
    expect(clear).not.toHaveBeenCalled();
    fireEvent.click(
      screen.getByRole('button', { name: 'Stop pending confirmation request' }),
    );
    const confirm = screen.getByRole('button', {
      name: /Confirm stop pending request/,
    });
    fireEvent.click(confirm);
    fireEvent.click(confirm);
    await waitFor(() => expect(stopRequest).toHaveBeenCalledTimes(1));
    expect(stopRequest).toHaveBeenCalledWith(request());
    expect(clear).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(close).not.toHaveBeenCalled();
    await act(async () =>
      stopped.resolve({
        request_key: request().request_key,
        stopped: true,
        accepted: false,
      }),
    );
    await waitFor(() => expect(close).toHaveBeenCalledTimes(1));
    expect(clear).toHaveBeenCalledWith(3, request());
    expect(disk.has(3)).toBe(false);
    expect(invalidated).toHaveBeenCalledWith({
      queryKey: ['billing', 'reservation-recovery', 3],
    });
    expect(save).not.toHaveBeenCalled();
  });
  it('keeps an already accepted action and recovers its receipt when save wins before stop', async () => {
    disk.set(3, request());
    check.mockResolvedValueOnce(accepted(false));
    stopRequest.mockResolvedValueOnce({
      request_key: request().request_key,
      stopped: false,
      accepted: true,
    });
    show();
    fireEvent.click(
      await screen.findByRole('button', {
        name: 'Stop pending confirmation request',
      }),
    );
    fireEvent.click(
      screen.getByRole('button', { name: /Confirm stop pending request/ }),
    );
    await screen.findByRole('heading', {
      name: 'Accepted confirmation: waiting',
    });
    expect(clear).not.toHaveBeenCalled();
    expect(disk.get(3)).toEqual(request());
    expect(
      screen.queryByRole('button', {
        name: 'Stop pending confirmation request',
      }),
    ).not.toBeInTheDocument();
    expect(save).not.toHaveBeenCalled();
  });
  it('recovers a lost stop response after remount even when the stopped request status is rejected', async () => {
    disk.set(3, request());
    check.mockResolvedValueOnce(accepted(false));
    stopRequest.mockRejectedValueOnce(new Error('Stop response lost'));
    const first = show();
    fireEvent.click(
      await screen.findByRole('button', {
        name: 'Stop pending confirmation request',
      }),
    );
    fireEvent.click(
      screen.getByRole('button', { name: /Confirm stop pending request/ }),
    );
    await screen.findByText('Stop response lost');
    expect(clear).not.toHaveBeenCalled();
    first.unmount();
    check.mockRejectedValue(
      new BillingActionRejected('This exact request was stopped.'),
    );
    show();
    await screen.findByText('This exact request was stopped.');
    expect(get).not.toHaveBeenCalled();
    fireEvent.click(
      screen.getByRole('button', { name: 'Stop pending confirmation request' }),
    );
    fireEvent.click(
      screen.getByRole('button', { name: /Confirm stop pending request/ }),
    );
    await waitFor(() => expect(close).toHaveBeenCalledTimes(1));
    expect(stopRequest.mock.calls).toEqual([[request()], [request()]]);
    expect(disk.has(3)).toBe(false);
    expect(save).not.toHaveBeenCalled();
  });
  it('retains recovery if an accepted stop outcome cannot be followed by a matching accepted status', async () => {
    disk.set(3, request());
    check.mockResolvedValue(accepted(false));
    stopRequest.mockResolvedValueOnce({
      request_key: request().request_key,
      stopped: false,
      accepted: true,
    });
    show();
    fireEvent.click(
      await screen.findByRole('button', {
        name: 'Stop pending confirmation request',
      }),
    );
    fireEvent.click(
      screen.getByRole('button', { name: /Confirm stop pending request/ }),
    );
    await screen.findByText(/The accepted receipt is unavailable/);
    expect(clear).not.toHaveBeenCalled();
    expect(disk.get(3)).toEqual(request());
    expect(close).not.toHaveBeenCalled();
  });
  it('does not clear or close another account when a stop response arrives after identity changes', async () => {
    disk.set(3, request());
    check.mockResolvedValue(accepted(false));
    const stopped =
      deferred<Awaited<ReturnType<typeof stopPagedStockConfirmation>>>();
    stopRequest.mockReturnValueOnce(stopped.promise);
    const view = show();
    fireEvent.click(
      await screen.findByRole('button', {
        name: 'Stop pending confirmation request',
      }),
    );
    fireEvent.click(
      screen.getByRole('button', { name: /Confirm stop pending request/ }),
    );
    await waitFor(() => expect(stopRequest).toHaveBeenCalledTimes(1));
    view.changeIdentity(4);
    await waitFor(() => expect(restore).toHaveBeenLastCalledWith(4));
    await act(async () =>
      stopped.resolve({
        request_key: request().request_key,
        stopped: true,
        accepted: false,
      }),
    );
    expect(clear).not.toHaveBeenCalled();
    expect(close).not.toHaveBeenCalled();
    expect(disk.get(3)).toEqual(request());
    expect(
      screen.queryByText(/The server stopped this exact request/),
    ).not.toBeInTheDocument();
  });
  it('keeps a server-stopped request after storage failure, disables save and replays only stop to finish', async () => {
    disk.set(3, request());
    check.mockResolvedValue(accepted(false));
    clear.mockRejectedValueOnce(new Error('Stop recovery clear failed'));
    show();
    fireEvent.click(
      await screen.findByRole('button', {
        name: 'Stop pending confirmation request',
      }),
    );
    fireEvent.click(
      screen.getByRole('button', { name: /Confirm stop pending request/ }),
    );
    await screen.findByText('Stop recovery clear failed');
    expect(
      screen.getByRole('button', {
        name: /Retry identical confirmation request/,
      }),
    ).toBeDisabled();
    expect(
      screen.getByRole('button', { name: 'Check confirmation request' }),
    ).toBeDisabled();
    expect(disk.get(3)).toEqual(request());
    expect(close).not.toHaveBeenCalled();
    fireEvent.click(
      screen.getByRole('button', { name: /Confirm stop pending request/ }),
    );
    await waitFor(() => expect(close).toHaveBeenCalledTimes(1));
    expect(stopRequest).toHaveBeenCalledTimes(2);
    expect(save).not.toHaveBeenCalled();
  });
  it.each([
    new BillingActionRejected('Stop permission denied'),
    new BillingSessionExpired(),
  ])('preserves recovery on stop error %s', async (error) => {
    disk.set(3, request());
    check.mockResolvedValue(accepted(false));
    stopRequest.mockRejectedValueOnce(error);
    show();
    fireEvent.click(
      await screen.findByRole('button', {
        name: 'Stop pending confirmation request',
      }),
    );
    fireEvent.click(
      screen.getByRole('button', { name: /Confirm stop pending request/ }),
    );
    await screen.findByText(error.message);
    expect(clear).not.toHaveBeenCalled();
    expect(disk.get(3)).toEqual(request());
    expect(
      screen.getByRole('button', { name: /Confirm stop pending request/ }),
    ).toHaveProperty('disabled', error instanceof BillingSessionExpired);
    expect(
      screen.queryAllByRole('button', { name: 'Reconnect Billing' }),
    ).toHaveLength(Number(error instanceof BillingSessionExpired));
  });
  it('keeps recovery and reconnect available when initial status expires, without dispatching stop or save', async () => {
    disk.set(3, request());
    check.mockRejectedValueOnce(new BillingSessionExpired());
    show();
    await screen.findByRole('button', { name: 'Reconnect Billing' });
    expect(
      screen.getByRole('button', { name: 'Stop pending confirmation request' }),
    ).toBeDisabled();
    expect(get).not.toHaveBeenCalled();
    expect(stopRequest).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
    expect(clear).not.toHaveBeenCalled();
  });
});
