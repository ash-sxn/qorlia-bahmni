import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { axe, toHaveNoViolations } from 'jest-axe';
import {
  BillingSessionExpired,
  BillingActionRejected,
  getPagedStockReturn,
  getPagedStockReturnLines,
  getPagedStockReturnReview,
  getPagedStockReturnStatus,
  getPagedStockReturnReferences,
  savePagedStockReturn,
  stopPagedStockReturn,
  getPagedStockReturnLocations,
  type PagedStockReturnRequest,
  type PagedStockReturnStatus,
} from '../billingService';
import { PagedStockReturnModal } from '../PagedStockReturnModal';
import {
  loadPagedStockReturnRecovery,
  persistPagedStockReturnRecovery,
  clearPagedStockReturnRecovery,
} from '../stockReservationRecovery';
import {
  returnLoad,
  returnLine,
  returnMetadata,
  returnRequest,
  returnReview,
  returnOutcome,
  returnReferences,
  returnSelection,
} from './stockReturnPagedFixture';

jest.mock('../billingService', () => ({
  ...jest.requireActual('../billingService'),
  getPagedStockReturn: jest.fn(),
  getPagedStockReturnLines: jest.fn(),
  getPagedStockReturnReview: jest.fn(),
  getPagedStockReturnStatus: jest.fn(),
  getPagedStockReturnReferences: jest.fn(),
  savePagedStockReturn: jest.fn(),
  stopPagedStockReturn: jest.fn(),
  getPagedStockReturnLocations: jest.fn(),
}));
jest.mock('../stockReservationRecovery', () => ({
  ...jest.requireActual('../stockReservationRecovery'),
  loadPagedStockReturnRecovery: jest.fn(),
  persistPagedStockReturnRecovery: jest.fn(),
  clearPagedStockReturnRecovery: jest.fn(),
}));
expect.extend(toHaveNoViolations);
const load = jest.mocked(getPagedStockReturn),
  lines = jest.mocked(getPagedStockReturnLines),
  review = jest.mocked(getPagedStockReturnReview);
const status = jest.mocked(getPagedStockReturnStatus),
  refs = jest.mocked(getPagedStockReturnReferences),
  save = jest.mocked(savePagedStockReturn),
  stop = jest.mocked(stopPagedStockReturn);
const diskLoad = jest.mocked(loadPagedStockReturnRecovery),
  persist = jest.mocked(persistPagedStockReturnRecovery),
  clear = jest.mocked(clearPagedStockReturnRecovery);
const locations = jest.mocked(getPagedStockReturnLocations);
const close = jest.fn(),
  reconnect = jest.fn(),
  openTransfer = jest.fn(),
  returnFocus = jest.fn();
let disk: PagedStockReturnRequest | null;
let native: PagedStockReturnStatus;
let count: number, effects: number;
const copy = <T,>(value: T): T => JSON.parse(JSON.stringify(value));
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
  const node = (
    uid = 3,
    targetOrderId: number | false = orderId,
    transferId = 11,
  ) => (
    <QueryClientProvider client={client}>
      <PagedStockReturnModal
        uid={uid}
        orderId={targetOrderId}
        transferId={transferId}
        close={close}
        reconnect={reconnect}
        openTransfer={openTransfer}
        returnFocus={returnFocus}
      />
    </QueryClientProvider>
  );
  return { ...render(node()), node };
}
const click = async (name: string) => {
  const button = await screen.findByRole('button', { name });
  await waitFor(() => expect(button).toBeEnabled());
  fireEvent.click(button);
  await waitFor(() =>
    expect(
      screen.queryByText('Checking native return and exact recovery...'),
    ).not.toBeInTheDocument(),
  );
};
const workflowError = () =>
  screen.findByRole('alert', { name: 'Return workflow error' });
async function begin() {
  await click('Review complete return');
  await screen.findByRole('heading', { name: 'Return review page 1' });
  expect(
    screen.getByRole('region', { name: 'Reviewed return creation effects' }),
  ).toBeInTheDocument();
  expect(
    screen.queryByRole('region', { name: 'Reviewed validation effects' }),
  ).not.toBeInTheDocument();
}
async function finishReview() {
  while (screen.queryByRole('button', { name: 'Review next return page' }))
    await click('Review next return page');
}
async function create() {
  await begin();
  await finishReview();
  await click('Create reviewed return');
  await screen.findByRole('heading', { name: 'Return creation accepted' });
}
beforeEach(() => {
  jest.clearAllMocks();
  count = 1;
  effects = 1;
  disk = null;
  native = returnOutcome('unknown');
  Object.defineProperty(crypto, 'randomUUID', {
    configurable: true,
    value: jest.fn(() => returnRequest().request_key),
  });
  diskLoad.mockImplementation(async () => disk);
  persist.mockImplementation(async (_uid, value) => {
    disk = copy(value);
  });
  clear.mockImplementation(async () => {
    disk = null;
  });
  load.mockImplementation(async (orderId) => ({
    ...returnLoad(count),
    order_id: orderId,
  }));
  lines.mockImplementation(async (selection, after = 0) => ({
    ...selection,
    form: returnMetadata(),
    after,
    total_count: count,
    next_after: after + 50 < count ? after + 50 : false,
    rows: Array.from({ length: Math.min(50, count - after) }, (_, index) =>
      returnLine(after + index),
    ),
  }));
  review.mockImplementation(async (selection, after = 0) =>
    returnReview(selection, after, effects),
  );
  status.mockImplementation(async () => copy(native));
  save.mockImplementation(async (request) => {
    native = returnOutcome();
    native.current.order_id = request.order_id;
    return copy(native);
  });
  stop.mockImplementation(async () => {
    if (!native.accepted) native = returnOutcome('stopped');
    return copy(native);
  });
  refs.mockImplementation(async () => returnReferences());
  locations.mockResolvedValue({
    ...returnSelection(),
    query: '',
    after: 0,
    rows: [[4, 'QA Returns']],
    next_after: false,
  });
});

it.each([9, false] as const)(
  'reviews native units, commits recovery before save, then opens the created transfer for order %s',
  async (orderId) => {
    const exact = { ...returnRequest(), order_id: orderId };
    show(orderId);
    await create();
    expect(persist).toHaveBeenCalledWith(3, exact);
    expect(save).toHaveBeenCalledWith(exact);
    expect(persist.mock.invocationCallOrder[0]).toBeLessThan(
      save.mock.invocationCallOrder[0],
    );
    expect(screen.getByText(/does not receive goods/)).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Open created transfer for receipt' }),
    ).toBeDisabled();
    await click('Read saved return references');
    await click('Open created transfer for receipt');
    expect(clear).toHaveBeenCalledWith(3, exact);
    expect(openTransfer).toHaveBeenCalledWith(orderId, 19);
  },
);

it('requires every original page and every line/effect review page, without the old 500-item cap', async () => {
  count = 501;
  effects = 51;
  show();
  await screen.findByLabelText('Return quantity for move 12');
  expect(
    screen.getByRole('button', { name: 'Review complete return' }),
  ).toBeDisabled();
  for (let i = 0; i < 10; i++) await click('Load next native return items');
  expect(lines.mock.calls.map((call) => call[1] ?? 0)).toEqual([
    0, 50, 100, 150, 200, 250, 300, 350, 400, 450, 500,
  ]);
  await begin();
  expect(
    screen.getByRole('button', { name: 'Create reviewed return' }),
  ).toBeDisabled();
  await finishReview();
  await click('Create reviewed return');
  expect(save.mock.calls[0][0].lines).toHaveLength(501);
  expect(review.mock.calls.map((call) => call[1])).toEqual([
    0, 50, 100, 150, 200, 250, 300, 350, 400, 450, 500, 550,
  ]);
  expect(review.mock.calls[1].slice(2)).toEqual([
    'b'.repeat(64),
    'd'.repeat(64),
    50,
  ]);
});

it('allows native over-return quantities and zero, and removes rows without sending hidden flags', async () => {
  count = 3;
  show();
  await screen.findByLabelText('Return quantity for move 12');
  fireEvent.change(screen.getByLabelText('Return quantity for move 12'), {
    target: { value: '30.5' },
  });
  fireEvent.change(screen.getByLabelText('Return quantity for move 13'), {
    target: { value: '0' },
  });
  fireEvent.click(screen.getByLabelText('Include move 14'));
  await create();
  expect(save.mock.calls[0][0].lines).toEqual([
    { move_id: 12, quantity: 30.5 },
    { move_id: 13, quantity: 0 },
  ]);
  expect(
    screen.queryByRole('checkbox', { name: /quantity rule/i }),
  ).not.toBeInTheDocument();
});

it('does not silently coerce an empty quantity to zero', async () => {
  show();
  await screen.findByLabelText('Return quantity for move 12');
  fireEvent.change(screen.getByLabelText('Return quantity for move 12'), {
    target: { value: '' },
  });
  await click('Review complete return');
  expect(await workflowError()).toHaveTextContent('finite return quantity');
  expect(review).not.toHaveBeenCalled();
  expect(save).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText('Return quantity for move 12'), {
    target: { value: '-1' },
  });
  await begin();
  expect(review.mock.calls[0][0].lines).toEqual([
    { move_id: 12, quantity: -1 },
  ]);
});

it.each(['version', 'overlap', 'tail', 'rules'])(
  'rejects inconsistent original form pages: %s',
  async (kind) => {
    count = 51;
    show();
    await screen.findByLabelText('Return quantity for move 12');
    lines.mockResolvedValueOnce({
      ...returnSelection(),
      version: kind === 'version' ? 'e'.repeat(64) : returnSelection().version,
      form: {
        ...returnMetadata(),
        show_units: kind === 'rules' ? false : true,
      },
      after: 50,
      total_count: 51,
      next_after: false,
      rows: kind === 'tail' ? [] : [returnLine(kind === 'overlap' ? 0 : 50)],
    });
    await click('Load next native return items');
    expect(await workflowError()).toHaveTextContent('form pages changed');
    expect(
      screen.getByRole('button', { name: 'Review complete return' }),
    ).toBeDisabled();
  },
);

it.each(['snapshot', 'duplicate', 'hidden'])(
  'rejects changed cross-page review: %s',
  async (kind) => {
    count = 51;
    show();
    await screen.findByLabelText('Return quantity for move 12');
    await click('Load next native return items');
    await begin();
    review.mockImplementationOnce(async (selection, after = 0) => {
      const page = returnReview(selection, after, effects);
      if (kind === 'snapshot') page.review_version = 'e'.repeat(64);
      if (kind === 'duplicate') page.line_rows[0] = returnLine();
      if (kind === 'hidden') page.line_rows[0].updates_order_quantities = false;
      return page;
    });
    await click('Review next return page');
    expect(await workflowError()).toHaveTextContent(/changed|skip/);
    expect(
      screen.queryByRole('button', { name: 'Create reviewed return' }),
    ).not.toBeInTheDocument();
    expect(save).not.toHaveBeenCalled();
  },
);

it('waits for durable storage and refuses to write after storage failure', async () => {
  const commit = deferred<void>();
  persist.mockImplementationOnce(() => commit.promise);
  show();
  await begin();
  fireEvent.click(
    screen.getByRole('button', { name: 'Create reviewed return' }),
  );
  await waitFor(() => expect(persist).toHaveBeenCalledTimes(1));
  expect(save).not.toHaveBeenCalled();
  await act(async () => commit.resolve());
  await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
});

it('does not call native save or stop when durable storage fails', async () => {
  persist.mockRejectedValueOnce(new Error('Storage quota exceeded'));
  show();
  await begin();
  await click('Create reviewed return');
  expect(await workflowError()).toHaveTextContent('Storage quota exceeded');
  expect(save).not.toHaveBeenCalled();
  expect(stop).not.toHaveBeenCalled();
  expect(clear).not.toHaveBeenCalled();
});

it.each(['transport', 'rejected', 'expired'])(
  'keeps exact recovery after a %s save error and checks acceptance without replay',
  async (kind) => {
    save.mockImplementationOnce(async () => {
      native = returnOutcome();
      throw kind === 'expired'
        ? new BillingSessionExpired()
        : kind === 'rejected'
          ? new BillingActionRejected('Native refusal')
          : new Error('Response lost');
    });
    const view = show();
    await begin();
    await click('Create reviewed return');
    expect(await workflowError()).toBeInTheDocument();
    expect(disk).toEqual(returnRequest());
    expect(clear).not.toHaveBeenCalled();
    if (kind === 'expired') {
      await click('Reconnect Billing');
      view.unmount();
      show();
    } else await click('Check exact return request');
    expect(reconnect).toHaveBeenCalledTimes(kind === 'expired' ? 1 : 0);
    await screen.findByRole('heading', { name: 'Return creation accepted' });
    expect(save).toHaveBeenCalledTimes(1);
    expect(load).toHaveBeenCalledTimes(1);
  },
);

it.each([9, false] as const)(
  'resumes an unknown request for order %s and retries only its exact original payload',
  async (orderId) => {
    disk = { ...returnRequest(), order_id: orderId };
    native.current.order_id = orderId;
    show(orderId);
    await screen.findByText(/No accepted or stopped outcome/);
    expect(load).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
    await click('Retry identical return request');
    expect(status).toHaveBeenCalledTimes(2);
    expect(save).toHaveBeenCalledWith({
      ...returnRequest(),
      order_id: orderId,
    });
    expect(crypto.randomUUID).not.toHaveBeenCalled();
  },
);

it('does not replay a retry when fresh status reports acceptance', async () => {
  disk = returnRequest();
  show();
  await screen.findByText(/No accepted or stopped outcome/);
  native = returnOutcome();
  await click('Retry identical return request');
  await screen.findByRole('heading', { name: 'Return creation accepted' });
  expect(save).not.toHaveBeenCalled();
  expect(clear).not.toHaveBeenCalled();
});

it('uses an explicit stop confirmation and retires only an acknowledged stop', async () => {
  disk = returnRequest();
  show();
  await screen.findByText(/No accepted or stopped outcome/);
  await click('Stop this exact return request');
  expect(stop).not.toHaveBeenCalled();
  await click('Keep return request');
  expect(stop).not.toHaveBeenCalled();
  await click('Stop this exact return request');
  await click('Confirm stop return request');
  expect(stop).toHaveBeenCalledWith(returnRequest());
  expect(clear).not.toHaveBeenCalled();
  await click('Finish stopped return recovery');
  expect(clear).toHaveBeenCalledWith(3, returnRequest());
  expect(save).not.toHaveBeenCalled();
});

it('shows acceptance if a save wins the stop race and never treats it as cancelled', async () => {
  disk = returnRequest();
  show();
  await screen.findByText(/No accepted or stopped outcome/);
  native = returnOutcome();
  await click('Stop this exact return request');
  await click('Confirm stop return request');
  await screen.findByRole('heading', { name: 'Return creation accepted' });
  expect(
    screen.queryByText(/acknowledged this exact request as stopped/),
  ).not.toBeInTheDocument();
  expect(clear).not.toHaveBeenCalled();
});

it('retains recovery when stop fails or deletion fails', async () => {
  disk = returnRequest();
  stop.mockRejectedValueOnce(new Error('Stop response lost'));
  show();
  await screen.findByText(/No accepted or stopped outcome/);
  await click('Stop this exact return request');
  await click('Confirm stop return request');
  expect(await workflowError()).toHaveTextContent('Stop response lost');
  expect(clear).not.toHaveBeenCalled();
  native = returnOutcome('stopped');
  await click('Keep return request');
  await click('Check exact return request');
  clear.mockRejectedValueOnce(new Error('Strict deletion failed'));
  await click('Finish stopped return recovery');
  expect(await workflowError()).toHaveTextContent('Strict deletion failed');
  expect(disk).toEqual(returnRequest());
  expect(close).not.toHaveBeenCalled();
});

it('reads every pinned saved reference page before retiring the request', async () => {
  disk = returnRequest();
  native = { ...returnOutcome(), reference_count: 101 };
  refs.mockImplementation(
    async (_request, after = 0, version = false, limit = 50) => {
      const rows: ReturnType<typeof returnReferences>['rows'] = Array.from(
        { length: 100 },
        (_, index) => ({
          key: `new:stock.move:${index}`,
          model: 'stock.move',
          id: index + 100,
          name: `QA ${index}`,
          available: true,
        }),
      ).sort((a, b) => a.key.localeCompare(b.key));
      rows.push(returnReferences().rows[1]);
      return {
        ...returnReferences(),
        after,
        version: version || 'f'.repeat(64),
        total_count: 101,
        next_after: after + limit < 101 ? after + limit : false,
        rows: rows.slice(after, after + limit),
      };
    },
  );
  show();
  await screen.findByRole('heading', { name: 'Return creation accepted' });
  await click('Read saved return references');
  expect(
    screen.getByRole('button', { name: 'Finish return creation recovery' }),
  ).toBeDisabled();
  await click('Next saved return reference page');
  await click('Next saved return reference page');
  expect(refs.mock.calls.map((call) => [call[1], call[2]])).toEqual([
    [0, false],
    [50, 'f'.repeat(64)],
    [100, 'f'.repeat(64)],
  ]);
  await click('Finish return creation recovery');
  expect(clear).toHaveBeenCalledTimes(1);
});

it.each(['missing', 'overlap', 'count'])(
  'keeps recovery for %s saved reference pages',
  async (kind) => {
    disk = returnRequest();
    native = returnOutcome();
    refs.mockImplementationOnce(async () => {
      const page = returnReferences();
      if (kind === 'missing') page.rows[1] = { ...page.rows[1], id: 999 };
      if (kind === 'overlap') page.rows[1].key = page.rows[0].key;
      if (kind === 'count') page.total_count = 3;
      return page;
    });
    show();
    await screen.findByRole('heading', { name: 'Return creation accepted' });
    await click('Read saved return references');
    expect(await workflowError()).toHaveTextContent(/missing|overlap|changed/);
    expect(clear).not.toHaveBeenCalled();
  },
);

it('warns about an inaccessible created return instead of inventing a receipt link', async () => {
  disk = returnRequest();
  native = {
    ...returnOutcome(),
    return_transfer: {
      model: 'stock.picking',
      id: false,
      name: false,
      available: false,
    },
  };
  refs.mockResolvedValueOnce({
    ...returnReferences(),
    rows: [
      returnReferences().rows[0],
      {
        ...returnReferences().rows[1],
        id: false,
        name: false,
        available: false,
      },
    ],
  });
  show();
  await screen.findByRole('heading', { name: 'Return creation accepted' });
  await click('Read saved return references');
  expect(screen.getByRole('alert')).toHaveTextContent(
    'Some saved records are unavailable',
  );
  expect(
    screen.getByRole('button', { name: 'Open created transfer for receipt' }),
  ).toBeDisabled();
  expect(
    screen.getByRole('button', { name: 'Finish return creation recovery' }),
  ).toBeEnabled();
});

it('rechecks the displayed outcome before clearing and does not open an outdated transfer', async () => {
  disk = returnRequest();
  native = returnOutcome();
  show();
  await screen.findByRole('heading', { name: 'Return creation accepted' });
  await click('Read saved return references');
  native = {
    ...returnOutcome(),
    current: { ...returnOutcome().current, version: 'f'.repeat(64) },
  };
  await click('Open created transfer for receipt');
  expect(await workflowError()).toHaveTextContent('outcome changed');
  expect(clear).not.toHaveBeenCalled();
  expect(openTransfer).not.toHaveBeenCalled();
});

it('keeps edited quantities when changing pages and asks before discarding unsaved edits', async () => {
  count = 51;
  show();
  await screen.findByLabelText('Return quantity for move 12');
  fireEvent.change(screen.getByLabelText('Return quantity for move 12'), {
    target: { value: '6' },
  });
  await click('Load next native return items');
  await click('Previous return items');
  expect(screen.getByLabelText('Return quantity for move 12')).toHaveValue(6);
  await click('Close return workflow');
  expect(close).not.toHaveBeenCalled();
  await click('Keep editing return');
  expect(screen.getByLabelText('Return quantity for move 12')).toHaveValue(6);
  await click('Reload return and recovery');
  await click('Discard unsaved edits');
  await waitFor(() =>
    expect(screen.getByLabelText('Return quantity for move 12')).toHaveValue(2),
  );
});

it('respects native visibility and role rules without searching locked destinations', async () => {
  load.mockResolvedValueOnce({
    ...returnLoad(),
    form: { ...returnMetadata(), location_editable: false, show_units: false },
  });
  lines.mockResolvedValueOnce({
    ...returnSelection(),
    form: { ...returnMetadata(), location_editable: false, show_units: false },
    after: 0,
    total_count: 1,
    next_after: false,
    rows: [returnLine()],
  });
  show();
  await screen.findByLabelText('Return quantity for move 12');
  expect(
    screen.queryByLabelText('Search return destinations'),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole('columnheader', { name: 'Unit' }),
  ).not.toBeInTheDocument();
  expect(locations).not.toHaveBeenCalled();
});

it('selects a native destination through its pinned role-controlled search', async () => {
  show();
  await screen.findByLabelText('Search return destinations');
  await click('Search native destinations');
  await click('Use destination QA Returns');
  expect(
    screen.getByText('Return destination: QA Returns'),
  ).toBeInTheDocument();
  await begin();
  expect(review.mock.calls[0][0].location_id).toBe(4);
  expect(locations).toHaveBeenCalledWith(returnSelection(), '', 0, 25);
});

it('pages native destination IDs and resets the cursor when the search changes', async () => {
  locations.mockResolvedValueOnce({
    ...returnSelection(),
    query: '',
    after: 0,
    rows: [[25, 'QA Shelf']],
    next_after: 25,
  });
  locations.mockResolvedValueOnce({
    ...returnSelection(),
    query: '',
    after: 25,
    rows: [[30, 'QA Returns']],
    next_after: false,
  });
  locations.mockResolvedValueOnce({
    ...returnSelection(),
    query: 'Ward',
    after: 0,
    rows: [[40, 'QA Ward']],
    next_after: false,
  });
  show();
  await screen.findByLabelText('Search return destinations');
  await click('Search native destinations');
  await screen.findByRole('button', { name: 'Use destination QA Shelf' });
  await click('More return destinations');
  await screen.findByRole('button', { name: 'Use destination QA Returns' });
  fireEvent.change(screen.getByLabelText('Search return destinations'), {
    target: { value: 'Ward' },
  });
  expect(
    screen.queryByRole('button', { name: 'Use destination QA Returns' }),
  ).not.toBeInTheDocument();
  await click('Search native destinations');
  await screen.findByRole('button', { name: 'Use destination QA Ward' });
  expect(locations.mock.calls.map((call) => call.slice(1))).toEqual([
    ['', 0, 25],
    ['', 25, 25],
    ['Ward', 0, 25],
  ]);
  expect(screen.getByText('Return destination: QA Stock')).toBeInTheDocument();
});

it('shows native denial without inventing a form or probing return locations', async () => {
  load.mockResolvedValueOnce({
    ...returnLoad(),
    form: false,
    line_count: 0,
    reason: 'The Stock User role is required.',
    write_ready: false,
  });
  show();
  expect(await workflowError()).toHaveTextContent(
    'Stock User role is required',
  );
  expect(lines).not.toHaveBeenCalled();
  expect(locations).not.toHaveBeenCalled();
  expect(
    screen.queryByRole('button', { name: 'Review complete return' }),
  ).not.toBeInTheDocument();
});

it('does not silently replace a pending return for a different identity', async () => {
  disk = { ...returnRequest(), transfer_id: 99 };
  show();
  expect(await workflowError()).toHaveTextContent('Another return request');
  expect(load).not.toHaveBeenCalled();
  expect(save).not.toHaveBeenCalled();
});

it('keeps recovery on close and restores focus without automatically saving or stopping', async () => {
  disk = returnRequest();
  const view = show();
  await screen.findByText(/No accepted or stopped outcome/);
  await click('Close return workflow');
  expect(close).toHaveBeenCalledTimes(1);
  view.unmount();
  expect(returnFocus).toHaveBeenCalled();
  expect(disk).toEqual(returnRequest());
  expect(save).not.toHaveBeenCalled();
  expect(stop).not.toHaveBeenCalled();
});

it('has labelled form controls and no basic axe violations in form and accepted receipt states', async () => {
  show();
  await screen.findByLabelText('Return quantity for move 12');
  expect(await axe(document.body)).toHaveNoViolations();
  await create();
  await click('Read saved return references');
  expect(await axe(document.body)).toHaveNoViolations();
});
