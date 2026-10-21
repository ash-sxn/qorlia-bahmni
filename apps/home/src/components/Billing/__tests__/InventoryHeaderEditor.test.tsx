import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { axe } from 'jest-axe';
import {
  BillingSessionExpired,
  getInventoryStoredForm,
  previewInventoryStoredForm,
  getInventoryStoredSaveReview,
  getInventoryStoredFormChoices,
  saveInventoryStoredForm,
  getInventoryStoredSaveStatus,
  stopInventoryStoredSave,
  getInventoryStoredSaveReferences,
  type InventoryStoredSaveRequest,
} from '../billingService';
import { InventoryHeaderEditor } from '../InventoryHeaderEditor';
import { InventoryHeaderRecovery } from '../InventoryHeaderRecovery';
import {
  loadInventoryStoredSaveRecovery,
  persistInventoryStoredSaveRecovery,
  clearInventoryStoredSaveRecovery,
} from '../stockReservationRecovery';
import {
  headerForm,
  headerPreview,
  headerRequest,
  headerReview,
  headerOutcome,
} from './inventoryHeaderFixture';

jest.mock('../billingService', () => ({
  ...jest.requireActual('../billingService'),
  getInventoryStoredForm: jest.fn(),
  previewInventoryStoredForm: jest.fn(),
  getInventoryStoredSaveReview: jest.fn(),
  getInventoryStoredFormChoices: jest.fn(),
  saveInventoryStoredForm: jest.fn(),
  getInventoryStoredSaveStatus: jest.fn(),
  stopInventoryStoredSave: jest.fn(),
  getInventoryStoredSaveReferences: jest.fn(),
}));
jest.mock('../stockReservationRecovery', () => ({
  ...jest.requireActual('../stockReservationRecovery'),
  loadInventoryStoredSaveRecovery: jest.fn(),
  persistInventoryStoredSaveRecovery: jest.fn(),
  clearInventoryStoredSaveRecovery: jest.fn(),
}));
const get = jest.mocked(getInventoryStoredForm),
  change = jest.mocked(previewInventoryStoredForm),
  review = jest.mocked(getInventoryStoredSaveReview),
  choices = jest.mocked(getInventoryStoredFormChoices),
  save = jest.mocked(saveInventoryStoredForm),
  status = jest.mocked(getInventoryStoredSaveStatus),
  stop = jest.mocked(stopInventoryStoredSave),
  refs = jest.mocked(getInventoryStoredSaveReferences),
  load = jest.mocked(loadInventoryStoredSaveRecovery),
  persist = jest.mocked(persistInventoryStoredSaveRecovery),
  clear = jest.mocked(clearInventoryStoredSaveRecovery);
const close = jest.fn(),
  reconnect = jest.fn(),
  returnFocus = jest.fn();
let disk: InventoryStoredSaveRequest | null;
function show(recovery = false) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const panel = (uid: number, transferId: number) => (
    <QueryClientProvider client={client}>
      {recovery ? (
        <InventoryHeaderRecovery
          uid={uid}
          transferId={transferId}
          close={close}
          reconnect={reconnect}
          returnFocus={returnFocus}
        />
      ) : (
        <InventoryHeaderEditor
          uid={uid}
          transferId={transferId}
          close={close}
          reconnect={reconnect}
          returnFocus={returnFocus}
        />
      )}
    </QueryClientProvider>
  );
  const view = render(panel(3, 7));
  return {
    ...view,
    client,
    identity: (uid: number, transferId = 7) =>
      view.rerender(panel(uid, transferId)),
  };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((yes) => {
    resolve = yes;
  });
  return { promise, resolve };
}
async function editNote() {
  const note = await screen.findByRole('textbox', { name: 'Note' });
  fireEvent.change(note, { target: { value: 'QorliaQA revised note' } });
  fireEvent.blur(note);
  await waitFor(() => expect(change).toHaveBeenCalledTimes(1));
  await waitFor(() =>
    expect(
      screen.getByRole('button', { name: 'Review header save effects' }),
    ).toBeEnabled(),
  );
}
async function completeReview() {
  await editNote();
  fireEvent.click(
    screen.getByRole('button', { name: 'Review header save effects' }),
  );
  await screen.findByRole('heading', { name: 'Header save effect page 1' });
  fireEvent.click(
    screen.getByRole('button', { name: 'Review next header effects' }),
  );
  await screen.findByRole('heading', { name: 'Header save effect page 2' });
}
beforeAll(() => {
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
    configurable: true,
    value: jest.fn(),
  });
  Object.defineProperty(crypto, 'randomUUID', {
    configurable: true,
    value: jest.fn(() => '12345678-1234-4234-8234-123456789abc'),
  });
});
beforeEach(() => {
  jest.resetAllMocks();
  disk = null;
  global.fetch = jest.fn();
  jest
    .mocked(crypto.randomUUID)
    .mockReturnValue('12345678-1234-4234-8234-123456789abc');
  load.mockImplementation(async () => disk);
  persist.mockImplementation(async (_uid, exact) => {
    disk = JSON.parse(JSON.stringify(exact));
  });
  clear.mockImplementation(async () => {
    disk = null;
  });
  get.mockResolvedValue(headerForm());
  change.mockImplementation(async (selection) => headerPreview(selection));
  review.mockImplementation(async (selection, after = 0) =>
    headerReview(selection, after),
  );
  choices.mockImplementation(async (selection, node, ...[, offset = 0]) => ({
    ...headerPreview(selection),
    page: {
      read_only: true,
      transfer_id: 7,
      picking_type_id: false,
      form_version: 'c'.repeat(64),
      node,
      field: 'partner_id',
      offset,
      rows: [],
      has_more: false,
    },
  }));
  save.mockResolvedValue(headerOutcome());
  status.mockResolvedValue(headerOutcome());
  stop.mockResolvedValue(headerOutcome('stopped'));
  refs.mockImplementation(async (request, after = 0) => ({
    request_key: request.request_key,
    version: 'f'.repeat(64),
    after,
    total_count: 0,
    rows: [],
    next_after: false,
  }));
});

it('loads the native saved form without a write, preserving visible native labels and markup as text', async () => {
  const form = headerForm();
  form.form.values.note = '<img src=x onerror=alert(1)>';
  get.mockResolvedValue(form);
  const view = show();
  expect(await screen.findByRole('textbox', { name: 'Note' })).toHaveValue(
    '<img src=x onerror=alert(1)>',
  );
  expect(
    screen.getByRole('combobox', { name: 'Receive From' }),
  ).toBeInTheDocument();
  expect(screen.getByText(/direct collection editing/)).toBeInTheDocument();
  expect(view.baseElement.querySelector('img')).toBeNull();
  expect(get).toHaveBeenCalledWith(7);
  expect(save).not.toHaveBeenCalled();
  expect(persist).not.toHaveBeenCalled();
  expect(
    screen.getByRole('button', { name: 'Review header save effects' }),
  ).toBeDisabled();
});
it('keeps the original version and ordered occurrence edits through native onchange and every save-effect page', async () => {
  show();
  await editNote();
  expect(change).toHaveBeenCalledWith({
    transfer_id: 7,
    version: 'a'.repeat(64),
    edits: headerRequest().edits,
  });
  const origin = screen.getByRole('textbox', { name: 'Source document' });
  fireEvent.change(origin, { target: { value: 'QorliaQA second edit' } });
  fireEvent.blur(origin);
  await waitFor(() => expect(change).toHaveBeenCalledTimes(2));
  await waitFor(() =>
    expect(
      screen.getByRole('button', { name: 'Review header save effects' }),
    ).toBeEnabled(),
  );
  fireEvent.click(
    screen.getByRole('button', { name: 'Review header save effects' }),
  );
  await screen.findByRole('heading', { name: 'Header save effect page 1' });
  expect(
    screen.getByRole('button', { name: 'Save reviewed transfer header' }),
  ).toBeDisabled();
  expect(
    screen.getByRole('heading', { name: 'Header save effect page 1' }),
  ).toHaveFocus();
  fireEvent.click(
    screen.getByRole('button', { name: 'Review next header effects' }),
  );
  await screen.findByRole('heading', { name: 'Header save effect page 2' });
  expect(review).toHaveBeenLastCalledWith(
    {
      transfer_id: 7,
      version: 'a'.repeat(64),
      edits: [
        ...headerRequest().edits,
        { node: 4, value: 'QorliaQA second edit' },
      ],
    },
    50,
    'd'.repeat(64),
    'f'.repeat(64),
  );
  expect(
    screen.getByRole('button', { name: 'Save reviewed transfer header' }),
  ).toBeEnabled();
  expect(save).not.toHaveBeenCalled();
});
it('waits for durable persistence before Save and retires only through explicit outcome/Finish', async () => {
  const pending = deferred<void>();
  persist.mockImplementation(async (_uid, request) => {
    await pending.promise;
    disk = request;
  });
  show();
  await completeReview();
  fireEvent.click(
    screen.getByRole('button', { name: 'Save reviewed transfer header' }),
  );
  await waitFor(() => expect(persist).toHaveBeenCalledTimes(1));
  expect(save).not.toHaveBeenCalled();
  await act(async () => pending.resolve());
  await screen.findByRole('heading', { name: 'Save outcome' });
  expect(save).toHaveBeenCalledTimes(1);
  expect(save).toHaveBeenCalledWith(headerRequest());
  expect(disk).toEqual(headerRequest());
  expect(clear).not.toHaveBeenCalled();
  fireEvent.click(
    screen.getByRole('button', { name: 'Check exact save outcome' }),
  );
  await screen.findByText(/exact save was accepted/);
  fireEvent.click(
    screen.getByRole('button', { name: 'Finish and reload transfer' }),
  );
  await waitFor(() => expect(close).toHaveBeenCalledTimes(1));
  expect(clear).toHaveBeenCalledWith(3, headerRequest());
  expect(disk).toBeNull();
});
it('keeps the same UUID after a lost Save and explicit retry, never automatically writing on remount', async () => {
  save
    .mockRejectedValueOnce(new Error('Connection lost'))
    .mockResolvedValue(headerOutcome());
  const first = show();
  await completeReview();
  fireEvent.click(
    screen.getByRole('button', { name: 'Save reviewed transfer header' }),
  );
  await screen.findByRole('heading', { name: 'Save outcome' });
  expect(disk).toEqual(headerRequest());
  first.unmount();
  show();
  await screen.findByRole('heading', { name: 'Save outcome' });
  expect(save).toHaveBeenCalledTimes(1);
  status.mockResolvedValueOnce(headerOutcome('unknown'));
  fireEvent.click(
    screen.getByRole('button', { name: 'Check exact save outcome' }),
  );
  await waitFor(() => expect(status).toHaveBeenCalledTimes(1));
  fireEvent.click(
    screen.getByRole('button', { name: 'Retry exact header save' }),
  );
  await screen.findByText(/exact save was accepted/);
  expect(save.mock.calls.map((call) => call[0])).toEqual([
    headerRequest(),
    headerRequest(),
  ]);
  expect(crypto.randomUUID).toHaveBeenCalledTimes(1);
  expect(clear).not.toHaveBeenCalled();
});
it('never sends Save when persistence fails, preserving the exact request for explicit recovery', async () => {
  persist.mockRejectedValue(new Error('Storage unavailable'));
  show();
  await completeReview();
  fireEvent.click(
    screen.getByRole('button', { name: 'Save reviewed transfer header' }),
  );
  await screen.findByRole('heading', { name: 'Save outcome' });
  expect(save).not.toHaveBeenCalled();
  expect(crypto.randomUUID).toHaveBeenCalledTimes(1);
  fireEvent.click(
    screen.getByRole('button', { name: 'Retry exact header save' }),
  );
  await screen.findByText(/Storage unavailable/);
  expect(save).not.toHaveBeenCalled();
  expect(persist).toHaveBeenLastCalledWith(3, headerRequest());
});
it('requires explicit Stop confirmation and recovers acceptance if Save already won', async () => {
  disk = headerRequest();
  stop.mockResolvedValue(headerOutcome());
  show(true);
  const trigger = await screen.findByRole('button', {
    name: /Stop pending header request/,
  });
  fireEvent.click(trigger);
  expect(stop).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Keep pending request' }));
  expect(trigger).toHaveFocus();
  fireEvent.click(trigger);
  fireEvent.click(
    screen.getByRole('button', { name: /Confirm stop of this request/ }),
  );
  await screen.findByText(/exact save was accepted/);
  expect(stop).toHaveBeenCalledWith(headerRequest());
  expect(save).not.toHaveBeenCalled();
  expect(screen.queryByText(/was stopped/)).not.toBeInTheDocument();
  expect(disk).toEqual(headerRequest());
});
it('finishes an acknowledged Stop without undoing a previously accepted Save', async () => {
  disk = headerRequest();
  show(true);
  fireEvent.click(
    await screen.findByRole('button', { name: /Stop pending header request/ }),
  );
  fireEvent.click(
    screen.getByRole('button', { name: /Confirm stop of this request/ }),
  );
  await screen.findByText(/No accepted save was undone/);
  fireEvent.click(
    screen.getByRole('button', { name: 'Finish and reload transfer' }),
  );
  await waitFor(() => expect(clear).toHaveBeenCalledWith(3, headerRequest()));
  expect(refs).not.toHaveBeenCalled();
  expect(save).not.toHaveBeenCalled();
});
it('requires all generated reference pages before Finish and keeps a rejected retirement recoverable', async () => {
  disk = headerRequest();
  status.mockResolvedValue(headerOutcome('accepted', 51));
  refs.mockImplementation(async (request, after = 0) => ({
    request_key: request.request_key,
    version: 'f'.repeat(64),
    after,
    total_count: 51,
    rows: Array.from({ length: after ? 1 : 50 }, (_, index) => ({
      key: `new:stock.move:${after + index}`,
      model: 'stock.move',
      id: after + index + 1,
      name: 'QorliaQA generated move',
      available: true,
    })),
    next_after: after ? false : 50,
  }));
  show(true);
  fireEvent.click(
    await screen.findByRole('button', { name: 'Check exact save outcome' }),
  );
  await screen.findByText(/exact save was accepted/);
  expect(
    screen.queryByRole('button', { name: 'Finish and reload transfer' }),
  ).not.toBeInTheDocument();
  fireEvent.click(
    screen.getByRole('button', { name: 'Read saved references' }),
  );
  await waitFor(() => expect(refs).toHaveBeenCalledTimes(1));
  fireEvent.click(
    screen.getByRole('button', { name: 'Next saved references' }),
  );
  await screen.findByRole('button', { name: 'Finish and reload transfer' });
  expect(refs).toHaveBeenLastCalledWith(headerRequest(), 50, 'f'.repeat(64));
  clear.mockRejectedValue(new Error('Fresh account changed'));
  fireEvent.click(
    screen.getByRole('button', { name: 'Finish and reload transfer' }),
  );
  await screen.findByText(/Fresh account changed/);
  expect(disk).toEqual(headerRequest());
  expect(close).not.toHaveBeenCalled();
});
it('hides the old review on a changed or failed effect page and never exposes Save', async () => {
  review.mockImplementation(async (selection, after = 0) => ({
    ...headerReview(selection, after),
    review_version: (after ? 'b' : 'd').repeat(64),
  }));
  show();
  await editNote();
  fireEvent.click(
    screen.getByRole('button', { name: 'Review header save effects' }),
  );
  await screen.findByRole('heading', { name: 'Header save effect page 1' });
  fireEvent.click(
    screen.getByRole('button', { name: 'Review next header effects' }),
  );
  await screen.findByText(/effects changed between pages/);
  expect(
    screen.queryByRole('button', { name: 'Save reviewed transfer header' }),
  ).not.toBeInTheDocument();
  expect(save).not.toHaveBeenCalled();
  fireEvent.click(
    screen.getByRole('button', { name: 'Review header save effects' }),
  );
  await screen.findByRole('heading', { name: 'Header save effect page 1' });
  expect(review).toHaveBeenLastCalledWith(
    { transfer_id: 7, version: 'a'.repeat(64), edits: headerRequest().edits },
    0,
    false,
    false,
  );
  expect(
    screen.getByRole('button', { name: 'Save reviewed transfer header' }),
  ).toBeDisabled();
});
it('prompts before discarding local edits and preserves them when the user chooses Keep', async () => {
  show();
  const note = await screen.findByRole('textbox', { name: 'Note' });
  const cleanUnload = new Event('beforeunload', { cancelable: true });
  window.dispatchEvent(cleanUnload);
  expect(cleanUnload.defaultPrevented).toBe(false);
  fireEvent.change(note, { target: { value: 'QorliaQA unapplied' } });
  const dirtyUnload = new Event('beforeunload', { cancelable: true });
  window.dispatchEvent(dirtyUnload);
  expect(dirtyUnload.defaultPrevented).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: 'Close header editor' }));
  expect(close).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Keep header edits' }));
  expect(note).toHaveValue('QorliaQA unapplied');
  fireEvent.click(screen.getByRole('button', { name: 'Reload native header' }));
  fireEvent.click(screen.getByRole('button', { name: /Discard header edits/ }));
  await waitFor(() => expect(get).toHaveBeenCalledTimes(2));
  expect(save).not.toHaveBeenCalled();
});
it('obeys changed native visibility, readonly state and warnings after onchange', async () => {
  change.mockImplementation(async (selection) => {
    const data = headerPreview(selection);
    data.form.layout[4].rules.visible = false;
    data.form.layout[3].rules.readonly = true;
    data.form.warning = {
      title: 'Native scheduling',
      message: 'QorliaQA warning',
    };
    return data;
  });
  show();
  await editNote();
  expect(
    screen.queryByRole('textbox', { name: 'Source document' }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole('combobox', { name: 'Receive From' }),
  ).not.toBeInTheDocument();
  expect(
    screen.getByText(/Native scheduling: QorliaQA warning/),
  ).toBeInTheDocument();
});
it('preserves another unapplied field instead of silently losing it after one onchange', async () => {
  show();
  const note = await screen.findByRole('textbox', { name: 'Note' }),
    origin = screen.getByRole('textbox', { name: 'Source document' });
  fireEvent.change(note, { target: { value: 'QorliaQA revised note' } });
  fireEvent.change(origin, { target: { value: 'QorliaQA pending origin' } });
  fireEvent.blur(note);
  await waitFor(() => expect(change).toHaveBeenCalledTimes(1));
  expect(origin).toHaveValue('QorliaQA pending origin');
  expect(
    screen.getByRole('button', { name: 'Review header save effects' }),
  ).toBeDisabled();
});
it('keeps unknown status and session expiry recoverable without any automatic write or clear', async () => {
  disk = headerRequest();
  status.mockRejectedValue(new BillingSessionExpired('Sign in again'));
  show(true);
  fireEvent.click(
    await screen.findByRole('button', { name: 'Check exact save outcome' }),
  );
  fireEvent.click(
    await screen.findByRole('button', {
      name: 'Reconnect Billing, retaining recovery',
    }),
  );
  expect(reconnect).toHaveBeenCalledTimes(1);
  expect(save).not.toHaveBeenCalled();
  expect(stop).not.toHaveBeenCalled();
  expect(clear).not.toHaveBeenCalled();
  expect(disk).toEqual(headerRequest());
});
it('does not render another transfer request under the current transfer identity', async () => {
  disk = { ...headerRequest(), transfer_id: 8 };
  show();
  await screen.findByText(/another transfer is pending/);
  expect(get).not.toHaveBeenCalled();
  expect(save).not.toHaveBeenCalled();
});
it('drops the old account editor on identity change and restores focus on unmount', async () => {
  const view = show();
  await editNote();
  view.identity(4);
  await waitFor(() => expect(load).toHaveBeenCalledWith(4));
  expect(await screen.findByRole('textbox', { name: 'Note' })).toHaveValue(
    'QorliaQA original note',
  );
  expect(
    screen.getByRole('button', { name: 'Review header save effects' }),
  ).toBeDisabled();
  view.unmount();
  expect(returnFocus).toHaveBeenCalled();
});
it('has no automated accessibility violations on the loaded header form', async () => {
  const view = show();
  await screen.findByRole('textbox', { name: 'Note' });
  expect((await axe(view.baseElement)).violations).toEqual([]);
});
