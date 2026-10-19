import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { axe, toHaveNoViolations } from 'jest-axe';
import {
  BillingActionRejected,
  BillingSessionExpired,
  getPagedStockCancellation,
  getPagedStockCancellationReview,
  getPagedStockCancellationStatus,
  getPagedStockCancellationReferences,
  savePagedStockCancellation,
  stopPagedStockCancellation,
  getPagedStockConfirmation,
  getPagedStockReservation,
  type PagedStockCancellationRequest,
} from '../billingService';
import { PagedStockCancellationModal } from '../PagedStockCancellationModal';
import {
  loadPagedStockCancellationRecovery,
  persistPagedStockCancellationRecovery,
  clearPagedStockCancellationRecovery,
} from '../stockReservationRecovery';
import {
  load,
  request,
  review,
  status,
  references,
  privateAnalyticReview,
} from './stockCancellationPagedFixture';

jest.mock('../billingService', () => ({
  ...jest.requireActual('../billingService'),
  getPagedStockCancellation: jest.fn(),
  getPagedStockCancellationReview: jest.fn(),
  getPagedStockCancellationStatus: jest.fn(),
  getPagedStockCancellationReferences: jest.fn(),
  savePagedStockCancellation: jest.fn(),
  stopPagedStockCancellation: jest.fn(),
  getPagedStockConfirmation: jest.fn(),
  getPagedStockReservation: jest.fn(),
}));
jest.mock('../stockReservationRecovery', () => ({
  ...jest.requireActual('../stockReservationRecovery'),
  loadPagedStockCancellationRecovery: jest.fn(),
  persistPagedStockCancellationRecovery: jest.fn(),
  clearPagedStockCancellationRecovery: jest.fn(),
}));
expect.extend(toHaveNoViolations);
const get = jest.mocked(getPagedStockCancellation),
  preview = jest.mocked(getPagedStockCancellationReview),
  check = jest.mocked(getPagedStockCancellationStatus),
  refs = jest.mocked(getPagedStockCancellationReferences),
  save = jest.mocked(savePagedStockCancellation),
  stop = jest.mocked(stopPagedStockCancellation),
  restore = jest.mocked(loadPagedStockCancellationRecovery),
  persist = jest.mocked(persistPagedStockCancellationRecovery),
  clear = jest.mocked(clearPagedStockCancellationRecovery);
const close = jest.fn(),
  reconnect = jest.fn(),
  returnFocus = jest.fn();
let disk: Map<number, PagedStockCancellationRequest>,
  effectCount = 101,
  referenceCount = 0;
const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
};
function show(orderId: number | false = 9) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const node = (uid = 3) => (
    <QueryClientProvider client={client}>
      <PagedStockCancellationModal
        uid={uid}
        orderId={orderId}
        transferId={11}
        close={close}
        reconnect={reconnect}
        returnFocus={returnFocus}
      />
    </QueryClientProvider>
  );
  const view = render(node());
  return {
    ...view,
    client,
    changeIdentity: (uid: number) => view.rerender(node(uid)),
  };
}
async function begin() {
  fireEvent.click(
    await screen.findByRole('button', { name: 'Review transfer cancellation' }),
  );
  await screen.findByRole('heading', { name: 'Cancellation effect page 1' });
}
async function complete() {
  await begin();
  for (let page = 2; page <= Math.ceil(effectCount / 50); page++) {
    fireEvent.click(
      screen.getByRole('button', { name: 'Review next cancellation effects' }),
    );
    await screen.findByRole('heading', {
      name: `Cancellation effect page ${page}`,
    });
  }
}
beforeEach(() => {
  jest.resetAllMocks();
  global.fetch = jest.fn();
  disk = new Map();
  effectCount = 101;
  referenceCount = 0;
  get.mockImplementation(async (order_id) => ({ ...load(), order_id }));
  preview.mockImplementation(async (selection, after = 0) => ({
    ...review(after, effectCount),
    order_id: selection.order_id,
  }));
  const scopedStatus = (
    exact: PagedStockCancellationRequest,
    outcome: 'accepted' | 'stopped',
  ) => {
    const response = status(outcome, referenceCount);
    return {
      ...response,
      current: { ...response.current, order_id: exact.order_id },
    };
  };
  check.mockImplementation(async (exact) => scopedStatus(exact, 'accepted'));
  save.mockImplementation(async (exact) => scopedStatus(exact, 'accepted'));
  stop.mockImplementation(async (exact) => scopedStatus(exact, 'stopped'));
  refs.mockImplementation(async (_request, after = 0) =>
    references(after, referenceCount),
  );
  restore.mockImplementation(async (uid) => disk.get(uid) ?? null);
  persist.mockImplementation(async (uid, value) => {
    disk.set(uid, value);
  });
  clear.mockImplementation(async (uid, value) => {
    if (JSON.stringify(disk.get(uid)) === JSON.stringify(value))
      disk.delete(uid);
  });
  Object.defineProperty(crypto, 'randomUUID', {
    configurable: true,
    value: jest.fn(() => request().request_key),
  });
});

it.each([9, false] as const)(
  'reviews complete effects with correct cancellation labels, focus and native large counts before an explicit destructive save, order %s',
  async (order_id) => {
    const exact = { ...request(), order_id };
    show(order_id);
    await begin();
    expect(screen.getByText(/501 stock moves/)).toHaveTextContent(
      '2001 detailed operations',
    );
    expect(
      screen.getByRole('heading', { name: 'Cancellation effect page 1' }),
    ).toHaveFocus();
    expect(
      screen
        .getByRole('region', { name: 'Reviewed cancellation effects' })
        .querySelectorAll('details'),
    ).toHaveLength(50);
    expect(
      screen.getByText(/Analytic item: 0 created, 0 changed, 1 removed/),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Cancel reviewed transfer/ }),
    ).toBeDisabled();
    expect(crypto.randomUUID).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
    for (const page of [2, 3]) {
      fireEvent.click(
        screen.getByRole('button', {
          name: 'Review next cancellation effects',
        }),
      );
      await screen.findByRole('heading', {
        name: `Cancellation effect page ${page}`,
      });
    }
    expect(preview.mock.calls.map((call) => call.slice(1))).toEqual([
      [0, false, false, 50],
      [50, 'b'.repeat(64), 'c'.repeat(64), 50],
      [100, 'b'.repeat(64), 'c'.repeat(64), 50],
    ]);
    expect(
      preview.mock.calls.every((call) => call[0].action === 'cancel_transfer'),
    ).toBe(true);
    fireEvent.click(
      screen.getByRole('button', { name: /Cancel reviewed transfer/ }),
    );
    await screen.findByRole('heading', {
      name: 'Accepted cancellation: cancel',
    });
    expect(persist).toHaveBeenCalledWith(3, exact);
    expect(save).toHaveBeenCalledWith(exact);
    expect(persist.mock.invocationCallOrder[0]).toBeLessThan(
      save.mock.invocationCallOrder[0],
    );
    expect(crypto.randomUUID).toHaveBeenCalledTimes(1);
    expect(getPagedStockConfirmation).not.toHaveBeenCalled();
    expect(getPagedStockReservation).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  },
);
it('honours native unavailability without creating a cancellation request', async () => {
  get.mockResolvedValue({
    ...load(),
    reason: 'Native cancellation is denied',
    write_ready: false,
  });
  show();
  await screen.findByText('Native cancellation is denied');
  expect(
    screen.getByRole('button', { name: 'Review transfer cancellation' }),
  ).toBeDisabled();
  expect(preview).not.toHaveBeenCalled();
  expect(persist).not.toHaveBeenCalled();
});
it('keeps backward review pins and hides stale effects after a failed page', async () => {
  show();
  await begin();
  fireEvent.click(
    screen.getByRole('button', { name: 'Review next cancellation effects' }),
  );
  await screen.findByRole('heading', { name: 'Cancellation effect page 2' });
  fireEvent.click(
    screen.getByRole('button', { name: 'Previous cancellation effects' }),
  );
  await screen.findByRole('heading', { name: 'Cancellation effect page 1' });
  expect(preview).toHaveBeenLastCalledWith(
    {
      order_id: 9,
      transfer_id: 11,
      version: load().version,
      action: 'cancel_transfer',
    },
    0,
    false,
    false,
    50,
  );
  preview.mockRejectedValueOnce(
    new BillingActionRejected('Cancellation review changed'),
  );
  fireEvent.click(
    screen.getByRole('button', { name: 'Review next cancellation effects' }),
  );
  await screen.findByText('Cancellation review changed');
  expect(
    screen.queryByRole('region', { name: 'Reviewed cancellation effects' }),
  ).not.toBeInTheDocument();
  expect(save).not.toHaveBeenCalled();
  fireEvent.click(
    screen.getByRole('button', { name: 'Reload cancellation state' }),
  );
  await waitFor(() =>
    expect(
      screen.getByRole('button', { name: 'Review transfer cancellation' }),
    ).toBeEnabled(),
  );
});
it('rejects changing native effects between pages instead of mixing a complete review', async () => {
  show();
  await begin();
  preview.mockResolvedValueOnce({ ...review(50), state_after: 'done' });
  fireEvent.click(
    screen.getByRole('button', { name: 'Review next cancellation effects' }),
  );
  await screen.findByText(/Cancellation pages changed/);
  expect(
    screen.queryByRole('button', { name: /Cancel reviewed transfer/ }),
  ).not.toBeInTheDocument();
  expect(persist).not.toHaveBeenCalled();
});
it('waits for strict persistence and blocks duplicate dispatch and close during commit', async () => {
  effectCount = 1;
  const commit = deferred<void>();
  persist.mockReturnValueOnce(commit.promise);
  show();
  await complete();
  const button = screen.getByRole('button', {
    name: /Cancel reviewed transfer/,
  });
  fireEvent.click(button);
  fireEvent.click(button);
  await waitFor(() => expect(persist).toHaveBeenCalledTimes(1));
  expect(save).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Close' }));
  expect(close).not.toHaveBeenCalled();
  disk.set(3, request());
  await act(async () => commit.resolve());
  await screen.findByRole('heading', { name: 'Accepted cancellation: cancel' });
  expect(save).toHaveBeenCalledTimes(1);
});
it.each([9, false] as const)(
  'keeps a lost save across remount and retries only the original request, never automatically, order %s',
  async (order_id) => {
    const exact = { ...request(), order_id };
    effectCount = 1;
    save.mockRejectedValueOnce(new Error('Cancellation response lost'));
    const first = show(order_id);
    await complete();
    fireEvent.click(
      screen.getByRole('button', { name: /Cancel reviewed transfer/ }),
    );
    await screen.findByText('Cancellation response lost');
    expect(disk.get(3)).toEqual(exact);
    first.unmount();
    get.mockClear();
    const unknown = status('unknown');
    check.mockResolvedValueOnce({
      ...unknown,
      current: { ...unknown.current, order_id },
    });
    show(order_id);
    await screen.findByRole('button', {
      name: /Retry identical cancellation request/,
    });
    expect(get).not.toHaveBeenCalled();
    expect(save).toHaveBeenCalledTimes(1);
    fireEvent.click(
      screen.getByRole('button', {
        name: /Retry identical cancellation request/,
      }),
    );
    await screen.findByRole('heading', {
      name: 'Accepted cancellation: cancel',
    });
    expect(save).toHaveBeenLastCalledWith(exact);
    expect(crypto.randomUUID).toHaveBeenCalledTimes(1);
    expect(clear).not.toHaveBeenCalled();
  },
);
it.each([
  new BillingActionRejected('Cancellation denied'),
  new BillingSessionExpired(),
])('retains a rejected or expired cancellation: %s', async (error) => {
  effectCount = 1;
  save.mockRejectedValueOnce(error);
  show();
  await complete();
  fireEvent.click(
    screen.getByRole('button', { name: /Cancel reviewed transfer/ }),
  );
  await screen.findByText(error.message);
  expect(disk.get(3)).toEqual(request());
  expect(clear).not.toHaveBeenCalled();
  expect(
    screen.getByRole('button', {
      name: /Retry identical cancellation request/,
    }),
  ).toHaveProperty('disabled', error instanceof BillingSessionExpired);
});
it('never dispatches after storage failure or a changed identity during commit', async () => {
  effectCount = 1;
  persist.mockRejectedValueOnce(new Error('Storage blocked'));
  const first = show();
  await complete();
  fireEvent.click(
    screen.getByRole('button', { name: /Cancel reviewed transfer/ }),
  );
  await screen.findByText('Storage blocked');
  expect(save).not.toHaveBeenCalled();
  first.unmount();
  const commit = deferred<void>();
  persist.mockReturnValueOnce(commit.promise);
  const second = show();
  await complete();
  fireEvent.click(
    screen.getByRole('button', { name: /Cancel reviewed transfer/ }),
  );
  await waitFor(() => expect(persist).toHaveBeenCalledTimes(2));
  second.changeIdentity(4);
  await waitFor(() => expect(restore).toHaveBeenLastCalledWith(4));
  disk.set(3, request());
  await act(async () => commit.resolve());
  expect(save).not.toHaveBeenCalled();
  expect(disk.get(3)).toEqual(request());
});
it('does not drop or convert another pending stock purpose', async () => {
  restore.mockRejectedValueOnce(
    new Error(
      'Another stock request is pending. Resume its original workflow.',
    ),
  );
  show();
  await screen.findByText(/Another stock request is pending/);
  expect(get).not.toHaveBeenCalled();
  expect(check).not.toHaveBeenCalled();
  expect(save).not.toHaveBeenCalled();
});
it('does not reinterpret an ordinary text value as a private analytic reference', async () => {
  effectCount = 1;
  const page = privateAnalyticReview();
  page.effects.schema['stock.move'].note = {
    label: 'Note',
    type: 'char',
    relation: false,
  };
  page.effects.updated['stock.move'][0].before.note =
    'private:account.analytic.line';
  page.effects.updated['stock.move'][0].after.note = 'QorliaQA changed note';
  preview.mockResolvedValueOnce(page);
  show();
  await complete();
  expect(screen.getByText('Private analytic item')).toBeInTheDocument();
  expect(screen.getByText('private:account.analytic.line')).toBeInTheDocument();
  expect(save).not.toHaveBeenCalled();
});
it.each([9, false] as const)(
  'reads all saved references, preserves their UI pin through durable retirement and renders markup as text, order %s',
  async (order_id) => {
    const exact = { ...request(), order_id };
    disk.set(3, exact);
    referenceCount = 101;
    const { container } = show(order_id);
    fireEvent.click(
      await screen.findByRole('button', { name: 'Read saved references' }),
    );
    await screen.findByRole('heading', { name: 'Saved reference page 1' });
    expect(
      screen.getByRole('heading', { name: 'Saved reference page 1' }),
    ).toHaveFocus();
    expect(
      within(
        screen.getByRole('region', { name: 'Saved cancellation references' }),
      ).getAllByRole('listitem'),
    ).toHaveLength(50);
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
    expect(refs.mock.calls).toEqual([
      [exact, 0, false, 50],
      [exact, 50, 'e'.repeat(64), 50],
      [exact, 100, 'e'.repeat(64), 50],
    ]);
    fireEvent.click(
      screen.getByRole('button', { name: 'Finish and reload transfers' }),
    );
    await waitFor(() => expect(close).toHaveBeenCalledTimes(1));
    expect(clear).toHaveBeenCalledWith(3, exact, 'e'.repeat(64));
    expect(disk.has(3)).toBe(false);
  },
);
it('keeps pending recovery after reference, final status or retirement failure', async () => {
  disk.set(3, request());
  referenceCount = 1;
  refs.mockRejectedValueOnce(new Error('Reference unavailable'));
  show();
  fireEvent.click(
    await screen.findByRole('button', { name: 'Read saved references' }),
  );
  await screen.findByText('Reference unavailable');
  expect(clear).not.toHaveBeenCalled();
  fireEvent.click(
    screen.getByRole('button', { name: 'Read saved references' }),
  );
  await screen.findByRole('heading', { name: 'Saved reference page 1' });
  check.mockResolvedValueOnce(status('unknown'));
  fireEvent.click(
    screen.getByRole('button', { name: 'Finish and reload transfers' }),
  );
  await screen.findByText(/Accepted cancellation receipt changed/);
  expect(clear).not.toHaveBeenCalled();
  clear.mockRejectedValueOnce(
    new Error('Pinned cancellation references changed'),
  );
  fireEvent.click(
    screen.getByRole('button', { name: 'Finish and reload transfers' }),
  );
  await screen.findByText('Pinned cancellation references changed');
  expect(disk.get(3)).toEqual(request());
});
it('separates stopping a pending cancellation from cancelling goods and keeps recovery if clear fails', async () => {
  disk.set(3, request());
  check.mockResolvedValueOnce(status('unknown'));
  clear.mockRejectedValueOnce(new Error('Stop clear failed'));
  show();
  fireEvent.click(
    await screen.findByRole('button', {
      name: 'Stop pending cancellation request',
    }),
  );
  expect(stop).not.toHaveBeenCalled();
  expect(
    screen.getByText(/does not cancel the transfer, undo reservations/),
  ).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Keep pending request' }));
  expect(
    screen.getByRole('button', { name: 'Stop pending cancellation request' }),
  ).toHaveFocus();
  fireEvent.click(
    screen.getByRole('button', { name: 'Stop pending cancellation request' }),
  );
  fireEvent.click(
    screen.getByRole('button', { name: /Confirm stop pending request/ }),
  );
  await screen.findByText('Stop clear failed');
  expect(stop).toHaveBeenCalledWith(request());
  expect(
    screen.queryByRole('button', {
      name: /Retry identical cancellation request/,
    }),
  ).not.toBeInTheDocument();
  expect(save).not.toHaveBeenCalled();
  expect(disk.get(3)).toEqual(request());
  fireEvent.click(
    screen.getByRole('button', { name: 'Finish stopped cancellation request' }),
  );
  await waitFor(() => expect(close).toHaveBeenCalledTimes(1));
  expect(stop).toHaveBeenCalledTimes(1);
});
it('recovers an accepted cancellation when save wins before stop, without reversing or clearing it', async () => {
  disk.set(3, request());
  check.mockResolvedValueOnce(status('unknown'));
  stop.mockResolvedValueOnce(status('accepted'));
  show();
  fireEvent.click(
    await screen.findByRole('button', {
      name: 'Stop pending cancellation request',
    }),
  );
  fireEvent.click(
    screen.getByRole('button', { name: /Confirm stop pending request/ }),
  );
  await screen.findByRole('heading', { name: 'Accepted cancellation: cancel' });
  expect(clear).not.toHaveBeenCalled();
  expect(save).not.toHaveBeenCalled();
  expect(disk.get(3)).toEqual(request());
});
it('does not send a native stop when the exact durable account/slot cannot be confirmed', async () => {
  disk.set(3, request());
  check.mockResolvedValueOnce(status('unknown'));
  persist.mockRejectedValueOnce(
    new Error('The original Billing account changed'),
  );
  show();
  fireEvent.click(
    await screen.findByRole('button', {
      name: 'Stop pending cancellation request',
    }),
  );
  fireEvent.click(
    screen.getByRole('button', { name: /Confirm stop pending request/ }),
  );
  await screen.findByText('The original Billing account changed');
  expect(stop).not.toHaveBeenCalled();
  expect(clear).not.toHaveBeenCalled();
  expect(disk.get(3)).toEqual(request());
});
it('does not send a late stop after an account change during strict persistence', async () => {
  disk.set(3, request());
  check.mockResolvedValueOnce(status('unknown'));
  const commit = deferred<void>();
  persist.mockReturnValueOnce(commit.promise);
  const view = show();
  fireEvent.click(
    await screen.findByRole('button', {
      name: 'Stop pending cancellation request',
    }),
  );
  fireEvent.click(
    screen.getByRole('button', { name: /Confirm stop pending request/ }),
  );
  await waitFor(() => expect(persist).toHaveBeenCalledTimes(1));
  view.changeIdentity(4);
  await waitFor(() => expect(restore).toHaveBeenLastCalledWith(4));
  await act(async () => commit.resolve());
  expect(stop).not.toHaveBeenCalled();
  expect(disk.get(3)).toEqual(request());
});
it('recovers a lost stop response as stopped after remount, never offering another cancellation', async () => {
  disk.set(3, request());
  check.mockResolvedValueOnce(status('unknown'));
  stop.mockRejectedValueOnce(new Error('Stop response lost'));
  const first = show();
  fireEvent.click(
    await screen.findByRole('button', {
      name: 'Stop pending cancellation request',
    }),
  );
  fireEvent.click(
    screen.getByRole('button', { name: /Confirm stop pending request/ }),
  );
  await screen.findByText('Stop response lost');
  first.unmount();
  check.mockResolvedValueOnce(status('stopped'));
  show();
  await screen.findByRole('button', {
    name: 'Finish stopped cancellation request',
  });
  expect(
    screen.queryByRole('button', {
      name: /Retry identical cancellation request/,
    }),
  ).not.toBeInTheDocument();
  fireEvent.click(
    screen.getByRole('button', { name: 'Finish stopped cancellation request' }),
  );
  await waitFor(() => expect(close).toHaveBeenCalledTimes(1));
  expect(stop).toHaveBeenCalledTimes(1);
  expect(save).not.toHaveBeenCalled();
});
it('keeps the original request visible after failed status, and locks expiry until reconnect', async () => {
  disk.set(3, request());
  check.mockRejectedValueOnce(new BillingSessionExpired());
  show();
  fireEvent.click(
    await screen.findByRole('button', { name: 'Reconnect Billing' }),
  );
  expect(reconnect).toHaveBeenCalledTimes(1);
  expect(
    screen.getByRole('button', {
      name: /Retry identical cancellation request/,
    }),
  ).toBeDisabled();
  expect(clear).not.toHaveBeenCalled();
  expect(get).not.toHaveBeenCalled();
});
it('discards late review effects after an account change', async () => {
  const late = deferred<ReturnType<typeof review>>();
  preview.mockReturnValueOnce(late.promise);
  const view = show();
  fireEvent.click(
    await screen.findByRole('button', { name: 'Review transfer cancellation' }),
  );
  await waitFor(() => expect(preview).toHaveBeenCalledTimes(1));
  view.changeIdentity(4);
  await waitFor(() => expect(restore).toHaveBeenLastCalledWith(4));
  await act(async () => late.resolve(review()));
  expect(
    screen.queryByRole('heading', { name: 'Cancellation effect page 1' }),
  ).not.toBeInTheDocument();
  expect(save).not.toHaveBeenCalled();
});
it('recovers an off-page cancellation for its original order without loading the selected transfer', async () => {
  const old = { ...request(), order_id: 42, transfer_id: 57 };
  disk.set(3, old);
  const value = status();
  value.current.order_id = 42;
  value.current.transfer_id = 57;
  value.current.transfer.id = 57;
  check.mockResolvedValue(value);
  show();
  await screen.findByText(/Resolve this previous cancellation/);
  expect(check).toHaveBeenCalledWith(old);
  expect(get).not.toHaveBeenCalled();
  fireEvent.click(
    screen.getByRole('button', { name: 'Finish and reload transfers' }),
  );
  await waitFor(() => expect(close).toHaveBeenCalledTimes(1));
  expect(clear).toHaveBeenCalledWith(3, old, false);
  expect(save).not.toHaveBeenCalled();
});
it('provides labelled modal/effects and keyboard-accessible record summaries', async () => {
  effectCount = 1;
  show();
  await complete();
  expect(await axe(document.body)).toHaveNoViolations();
});
it('labels a private deleted analytic link without displaying its opaque token as a native identifier', async () => {
  effectCount = 1;
  preview.mockResolvedValueOnce(privateAnalyticReview());
  show();
  await complete();
  expect(screen.getByText('Private analytic item')).toBeInTheDocument();
  expect(
    screen.queryByText('private:account.analytic.line'),
  ).not.toBeInTheDocument();
  expect(save).not.toHaveBeenCalled();
});
