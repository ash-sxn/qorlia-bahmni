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
  getPagedStockValidation,
  getPagedStockValidationReview,
  getPagedStockValidationStatus,
  getPagedStockValidationPromptPage,
  getPagedStockValidationReferencePage,
  getStockValidationStepCompactStatus,
  getStockValidationStepPromptPage,
  getStockValidationStepReferencePage,
  savePagedStockValidation,
  stopPagedStockValidation,
  type PagedStockValidationRequest,
  type PagedStockValidationStatus,
  type StockValidationStepRequest,
} from '../billingService';
import { PagedStockValidationModal } from '../PagedStockValidationModal';
import {
  loadStockWriteRecovery,
  loadPagedStockValidationRecovery,
  persistPagedStockValidationRecovery,
  clearPagedStockValidationRecovery,
  restoreStoppedPagedStockValidationRecovery,
  type PagedStockValidationRecovery,
} from '../stockReservationRecovery';
import { validationRequest } from './stockValidationFixture';
import {
  pagedValidationRequest as request,
  pagedValidationLoad as load,
  pagedValidationOutcome as outcome,
  pagedValidationEffectPage as effectPage,
  pagedValidationPrompt as promptPage,
  pagedValidationReferences as referencePage,
  promptMetadata,
} from './stockValidationPagedFixture';

jest.mock('../billingService', () => ({
  ...jest.requireActual('../billingService'),
  getPagedStockValidation: jest.fn(),
  getPagedStockValidationReview: jest.fn(),
  getPagedStockValidationStatus: jest.fn(),
  getPagedStockValidationPromptPage: jest.fn(),
  getPagedStockValidationReferencePage: jest.fn(),
  savePagedStockValidation: jest.fn(),
  stopPagedStockValidation: jest.fn(),
  getStockValidationStepCompactStatus: jest.fn(),
  getStockValidationStepPromptPage: jest.fn(),
  getStockValidationStepReferencePage: jest.fn(),
}));
jest.mock('../stockReservationRecovery', () => ({
  ...jest.requireActual('../stockReservationRecovery'),
  loadStockWriteRecovery: jest.fn(),
  loadPagedStockValidationRecovery: jest.fn(),
  persistPagedStockValidationRecovery: jest.fn(),
  clearPagedStockValidationRecovery: jest.fn(),
  restoreStoppedPagedStockValidationRecovery: jest.fn(),
}));
expect.extend(toHaveNoViolations);
const get = jest.mocked(getPagedStockValidation),
  review = jest.mocked(getPagedStockValidationReview),
  check = jest.mocked(getPagedStockValidationStatus),
  prompts = jest.mocked(getPagedStockValidationPromptPage),
  refs = jest.mocked(getPagedStockValidationReferencePage),
  save = jest.mocked(savePagedStockValidation),
  stop = jest.mocked(stopPagedStockValidation),
  diskLoad = jest.mocked(loadStockWriteRecovery),
  historyLoad = jest.mocked(loadPagedStockValidationRecovery),
  persist = jest.mocked(persistPagedStockValidationRecovery),
  clear = jest.mocked(clearPagedStockValidationRecovery),
  restore = jest.mocked(restoreStoppedPagedStockValidationRecovery);
const close = jest.fn(),
  reconnect = jest.fn(),
  returnFocus = jest.fn();
let disk: Map<number, PagedStockValidationRecovery>;
let native: Map<string, PagedStockValidationStatus>;
let effectCount = 101,
  referenceCount = 101;
const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
};
function show(
  legacyParent?: StockValidationStepRequest,
  initialOrderId: number | false = 9,
) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const node = (
    uid = 3,
    orderId: number | false = initialOrderId,
    transferId = 11,
  ) => (
    <QueryClientProvider client={client}>
      <PagedStockValidationModal
        uid={uid}
        orderId={orderId}
        transferId={transferId}
        legacyParent={legacyParent}
        close={close}
        reconnect={reconnect}
        returnFocus={returnFocus}
      />
    </QueryClientProvider>
  );
  return { ...render(node()), client, node };
}
async function begin() {
  fireEvent.click(
    await screen.findByRole('button', { name: 'Review native validation' }),
  );
  await screen.findByRole('heading', { name: 'Validation review page 1' });
}
async function advanceReview() {
  let page = 1;
  while (
    screen.queryByRole('button', { name: 'Review next validation page' })
  ) {
    fireEvent.click(
      screen.getByRole('button', { name: 'Review next validation page' }),
    );
    await screen.findByRole('heading', {
      name: `Validation review page ${++page}`,
    });
    await waitFor(() =>
      expect(
        screen.queryByText('Checking native validation and exact recovery...'),
      ).not.toBeInTheDocument(),
    );
  }
}
async function readSaved(kind: 'prompt' | 'reference') {
  fireEvent.click(
    await screen.findByRole('button', {
      name: kind === 'prompt' ? 'Read saved prompt' : 'Read saved references',
    }),
  );
  const endText =
    kind === 'prompt'
      ? 'All saved prompt pages have been read.'
      : 'All saved reference pages have been read.';
  await waitFor(() =>
    expect(
      screen.queryByText('Checking native validation and exact recovery...'),
    ).not.toBeInTheDocument(),
  );
  while (!screen.queryByText(endText)) {
    const next = await screen.findByRole('button', {
      name: `Next ${kind} page`,
    });
    await waitFor(() => expect(next).toBeEnabled());
    fireEvent.click(next);
    await waitFor(() =>
      expect(
        screen.queryByText('Checking native validation and exact recovery...'),
      ).not.toBeInTheDocument(),
    );
  }
}
function pending(
  kind: 'terminal' | 'prompt' | 'unknown' | 'stopped' = 'terminal',
  metadata = promptMetadata(),
) {
  const exact = request();
  disk.set(3, { request: exact, history: [] });
  native.set(exact.request_key, outcome(exact, kind, metadata, referenceCount));
  return exact;
}
describe('Complete paged native validation consumer', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    disk = new Map();
    native = new Map();
    effectCount = 101;
    referenceCount = 101;
    get.mockImplementation(async (order_id) => ({ ...load(), order_id }));
    review.mockImplementation(async (selection, after = 0) =>
      effectPage(selection, after, effectCount),
    );
    check.mockImplementation(
      async (exact) =>
        native.get(exact.request_key) ?? outcome(exact, 'unknown'),
    );
    save.mockImplementation(async (exact) => {
      const value = outcome(
        exact,
        'terminal',
        promptMetadata(),
        referenceCount,
      );
      native.set(exact.request_key, value);
      return value;
    });
    stop.mockImplementation(async (exact) =>
      native.get(exact.request_key)?.accepted
        ? native.get(exact.request_key)!
        : outcome(exact, 'stopped', promptMetadata(), referenceCount),
    );
    prompts.mockImplementation(async (exact, after = 0) => {
      const receipt = native.get(exact.request_key)?.receipt;
      return promptPage(
        exact,
        receipt && receipt.next_step ? receipt.next_step : promptMetadata(),
        after,
      );
    });
    refs.mockImplementation(async (exact, after = 0) =>
      referencePage(exact, after, referenceCount),
    );
    diskLoad.mockImplementation(async (uid) => disk.get(uid)?.request ?? null);
    historyLoad.mockImplementation(async (uid) => disk.get(uid) ?? null);
    persist.mockImplementation(async (uid, exact, previous) => {
      const old = disk.get(uid);
      disk.set(uid, {
        request: exact,
        history: previous
          ? [...(old?.history ?? []), previous]
          : (old?.history ?? []),
      });
    });
    clear.mockImplementation(async (uid) => {
      disk.delete(uid);
      return null;
    });
    restore.mockImplementation(async (uid) => {
      const stored = disk.get(uid),
        parent = stored?.history.at(-1);
      if (parent)
        disk.set(uid, {
          request: parent as PagedStockValidationRequest,
          history: stored!.history.slice(0, -1),
        });
      else disk.delete(uid);
      return parent ?? null;
    });
    Object.defineProperty(crypto, 'randomUUID', {
      configurable: true,
      value: () => request().request_key,
    });
  });
  it('requires all 101 effect rows in ordered pages, with bounded rendering, focus and backward review', async () => {
    show();
    await begin();
    expect(screen.getByText(/501 product moves/)).toHaveTextContent(
      '2001 recorded operations',
    );
    expect(
      screen.getByRole('heading', { name: 'Validation review page 1' }),
    ).toHaveFocus();
    expect(
      screen.getByRole('button', { name: 'Save reviewed native validation' }),
    ).toBeDisabled();
    expect(
      screen
        .getByRole('region', { name: 'Reviewed validation effects' })
        .querySelectorAll('details'),
    ).toHaveLength(50);
    fireEvent.click(
      screen.getByRole('button', { name: 'Review next validation page' }),
    );
    await screen.findByRole('heading', { name: 'Validation review page 2' });
    fireEvent.click(
      screen.getByRole('button', { name: 'Previous validation review page' }),
    );
    await screen.findByRole('heading', { name: 'Validation review page 1' });
    await advanceReview();
    expect(
      screen.getByRole('button', { name: 'Save reviewed native validation' }),
    ).toBeEnabled();
    expect(review.mock.calls.map((call) => call.slice(1))).toEqual([
      [],
      [50, 'b'.repeat(64), 'f'.repeat(64), 50],
      [0, false, false, 50],
      [50, 'b'.repeat(64), 'f'.repeat(64), 50],
      [100, 'b'.repeat(64), 'f'.repeat(64), 50],
    ]);
    expect(save).not.toHaveBeenCalled();
    expect(persist).not.toHaveBeenCalled();
  });
  it.each([9, false] as const)(
    'persists the complete proof before dispatch, blocks double clicks and reads every reference before finish, order %s',
    async (order_id) => {
      const exact = { ...request(), order_id };
      const held = deferred<void>();
      persist.mockReturnValueOnce(held.promise);
      const { client } = show(undefined, order_id);
      const inventoryQueries = [
        'inventory-transfers',
        'inventory-transfer-load',
        'inventory-transfer-detail',
      ];
      for (const key of inventoryQueries)
        client.setQueryData(['billing', key, 3], { synthetic: true });
      await begin();
      await advanceReview();
      const button = screen.getByRole('button', {
        name: 'Save reviewed native validation',
      });
      fireEvent.click(button);
      fireEvent.click(button);
      await waitFor(() => expect(persist).toHaveBeenCalledTimes(1));
      expect(save).not.toHaveBeenCalled();
      expect(persist.mock.calls[0]).toEqual([3, exact, undefined]);
      disk.set(3, { request: exact, history: [] });
      await act(async () => held.resolve());
      await screen.findByRole('button', { name: 'Finish accepted validation' });
      expect(save).toHaveBeenCalledTimes(1);
      expect(
        screen.getByRole('button', { name: 'Finish accepted validation' }),
      ).toBeDisabled();
      await readSaved('reference');
      expect(
        screen.getByText(/<img src=x onerror=alert\(1\)> \(#200\)/),
      ).toBeInTheDocument();
      expect(document.querySelector('img')).toBeNull();
      fireEvent.click(
        screen.getByRole('button', { name: 'Finish accepted validation' }),
      );
      await waitFor(() => expect(close).toHaveBeenCalledTimes(1));
      expect(clear).toHaveBeenCalledWith(3, exact);
      expect(refs.mock.calls.at(-1)).toEqual([exact, 0, 'f'.repeat(64), 50]);
      for (const key of inventoryQueries)
        expect(client.getQueryState(['billing', key, 3])?.isInvalidated).toBe(
          true,
        );
    },
  );
  it.each([9, false] as const)(
    'keeps a lost or rejected save exact and only retries the identical stored request, order %s',
    async (order_id) => {
      const exact = { ...request(), order_id };
      effectCount = 1;
      save.mockRejectedValueOnce(
        new BillingActionRejected('Native outcome unavailable'),
      );
      const view = show(undefined, order_id);
      await begin();
      fireEvent.click(
        screen.getByRole('button', { name: 'Save reviewed native validation' }),
      );
      await screen.findByRole('button', {
        name: 'Retry identical validation request',
      });
      await waitFor(() =>
        expect(
          screen.getByRole('button', {
            name: 'Retry identical validation request',
          }),
        ).toBeEnabled(),
      );
      expect(disk.get(3)?.request).toEqual(exact);
      expect(clear).not.toHaveBeenCalled();
      view.unmount();
      show(undefined, order_id);
      await screen.findByRole('button', {
        name: 'Retry identical validation request',
      });
      fireEvent.click(
        screen.getByRole('button', {
          name: 'Retry identical validation request',
        }),
      );
      await screen.findByRole('button', { name: 'Finish accepted validation' });
      expect(save.mock.calls).toEqual([[exact], [exact]]);
    },
  );
  it('never dispatches after failed storage or unmount while the strict commit is outstanding', async () => {
    effectCount = 1;
    const held = deferred<void>();
    persist.mockReturnValueOnce(held.promise);
    const view = show();
    await begin();
    fireEvent.click(
      screen.getByRole('button', { name: 'Save reviewed native validation' }),
    );
    await waitFor(() => expect(persist).toHaveBeenCalled());
    view.unmount();
    await act(async () => held.resolve());
    expect(save).not.toHaveBeenCalled();
    expect(clear).not.toHaveBeenCalled();
    expect(returnFocus).toHaveBeenCalled();
  });
  it('reads all saved prompt and reference pages before continuing with a fresh writable load version', async () => {
    const root = pending('prompt');
    Object.defineProperty(crypto, 'randomUUID', {
      configurable: true,
      value: () => '22222222-2222-4333-8444-555555555555',
    });
    show();
    const choose = await screen.findByRole('button', {
      name: 'Review receipt confirmation',
    });
    expect(choose).toBeDisabled();
    await readSaved('prompt');
    expect(choose).toBeDisabled();
    await readSaved('reference');
    fireEvent.click(choose);
    await screen.findByRole('heading', { name: 'Validation review page 1' });
    expect(review.mock.calls[0][0]).toMatchObject({
      version: 'a'.repeat(64),
      continuation_key: root.request_key,
      decisions: [{ kind: 'receipt', confirm: true }],
    });
    await advanceReview();
    fireEvent.click(
      screen.getByRole('button', { name: 'Save reviewed native validation' }),
    );
    await waitFor(() => expect(save).toHaveBeenCalled());
    expect(persist.mock.calls[0][2]).toEqual(root);
    expect(disk.get(3)?.history).toEqual([root]);
    expect(save.mock.calls[0][0]).toMatchObject({
      continuation_key: root.request_key,
      review_complete_token: 'c'.repeat(64),
    });
  });
  it.each(['immediate', 'backorder', 'expiry'] as const)(
    'offers both explicit %s choices only after saved rows are read',
    async (kind) => {
      pending('prompt', promptMetadata(kind));
      show();
      await readSaved('prompt');
      await readSaved('reference');
      const name =
        kind === 'immediate'
          ? 'Review without processing this transfer'
          : kind === 'backorder'
            ? 'Review cancelling remaining demand'
            : 'Review without expired batches';
      fireEvent.click(screen.getByRole('button', { name }));
      await screen.findByRole('heading', { name: 'Validation review page 1' });
      expect(review.mock.calls[0][0].decisions).toEqual([
        kind === 'expiry'
          ? { kind, proceed: false }
          : { kind, selected: false },
      ]);
      expect(save).not.toHaveBeenCalled();
    },
  );
  it('resumes unknown outcomes without reloading an editable graph or automatically replaying a write', async () => {
    pending('unknown');
    show();
    await screen.findByRole('button', {
      name: 'Retry identical validation request',
    });
    expect(get).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
    expect(stop).not.toHaveBeenCalled();
    expect(clear).not.toHaveBeenCalled();
    expect(restore).not.toHaveBeenCalled();
  });
  it('requires explicit stop confirmation, then a separate acknowledged retirement', async () => {
    pending('unknown');
    show();
    fireEvent.click(
      await screen.findByRole('button', {
        name: 'Stop this exact validation request',
      }),
    );
    await waitFor(() =>
      expect(
        screen.getByText(`Stop only request ${request().request_key}?`),
      ).toHaveFocus(),
    );
    expect(stop).not.toHaveBeenCalled();
    fireEvent.click(
      screen.getByRole('button', { name: 'Keep pending request' }),
    );
    expect(
      screen.getByRole('button', {
        name: 'Stop this exact validation request',
      }),
    ).toHaveFocus();
    fireEvent.click(
      screen.getByRole('button', {
        name: 'Stop this exact validation request',
      }),
    );
    fireEvent.click(
      screen.getByRole('button', { name: /Confirm exact request stop/ }),
    );
    const stopped = outcome(request(), 'stopped');
    native.set(request().request_key, stopped);
    await screen.findByRole('button', { name: 'Retire stopped request' });
    expect(restore).not.toHaveBeenCalled();
    fireEvent.click(
      screen.getByRole('button', { name: 'Retire stopped request' }),
    );
    await waitFor(() => expect(restore).toHaveBeenCalledWith(3, request()));
    expect(clear).not.toHaveBeenCalled();
  });
  it('keeps prior accepted preparation visible after stopping a child and restores that parent', async () => {
    const parent = request(),
      child = {
        ...parent,
        request_key: '22222222-2222-4333-8444-555555555555',
        continuation_key: parent.request_key,
        decisions: [{ kind: 'receipt' as const, confirm: true as const }],
      };
    disk.set(3, { request: child, history: [parent] });
    native.set(child.request_key, outcome(child, 'stopped'));
    show();
    await screen.findByText(
      'The prior accepted action and its native prompt remain saved.',
      { exact: false },
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Recover prior saved step' }),
    );
    await waitFor(() => expect(close).toHaveBeenCalled());
    expect(disk.get(3)).toEqual({ request: parent, history: [] });
    expect(clear).not.toHaveBeenCalled();
  });
  it('recovers an accepted result when save won the stop race, rather than retiring it', async () => {
    pending('unknown');
    show();
    fireEvent.click(
      await screen.findByRole('button', {
        name: 'Stop this exact validation request',
      }),
    );
    native.set(request().request_key, outcome());
    fireEvent.click(
      screen.getByRole('button', { name: /Confirm exact request stop/ }),
    );
    await screen.findByRole('button', { name: 'Finish accepted validation' });
    expect(
      screen.queryByRole('button', { name: 'Retire stopped request' }),
    ).not.toBeInTheDocument();
    expect(clear).not.toHaveBeenCalled();
    expect(restore).not.toHaveBeenCalled();
  });
  it.each(['prompt', 'reference'] as const)(
    'rejects a legal but wrong %s receipt identity',
    async (kind) => {
      const root = pending('prompt'),
        child = {
          ...root,
          continuation_key: root.request_key,
          request_key: '22222222-2222-4333-8444-555555555555',
          decisions: [{ kind: 'receipt' as const, confirm: true as const }],
        };
      disk.set(3, { request: child, history: [root] });
      native.set(child.request_key, outcome(child, 'prompt'));
      if (kind === 'prompt')
        prompts.mockResolvedValue({
          ...promptPage(child),
          receipt_key: root.request_key,
        });
      else
        refs.mockResolvedValue({
          ...referencePage(child),
          receipt_key: root.request_key,
        });
      show();
      fireEvent.click(
        await screen.findByRole('button', {
          name:
            kind === 'prompt' ? 'Read saved prompt' : 'Read saved references',
        }),
      );
      await screen.findByRole('alert');
      expect(save).not.toHaveBeenCalled();
      expect(clear).not.toHaveBeenCalled();
      expect(
        screen.getByRole('button', { name: 'Review receipt confirmation' }),
      ).toBeDisabled();
    },
  );
  it('rejects changed review metadata and hides previous effects after a page failure', async () => {
    review
      .mockImplementationOnce(async (selection) =>
        effectPage(selection, 0, 101),
      )
      .mockImplementationOnce(async (selection, after) => ({
        ...effectPage(selection, after, 101),
        terminal: false,
        next_step: promptMetadata('immediate'),
      }));
    show();
    await begin();
    fireEvent.click(
      screen.getByRole('button', { name: 'Review next validation page' }),
    );
    await screen.findByRole('alert');
    expect(
      screen.queryByRole('button', { name: 'Save reviewed native validation' }),
    ).not.toBeInTheDocument();
    expect(save).not.toHaveBeenCalled();
  });
  it('does not clear when fresh outcome, reference pin or storage clear changes', async () => {
    pending();
    show();
    await readSaved('reference');
    check.mockResolvedValue({
      ...outcome(),
      current: { ...outcome().current, version: '9'.repeat(64) },
    });
    fireEvent.click(
      screen.getByRole('button', { name: 'Finish accepted validation' }),
    );
    await screen.findByRole('alert');
    expect(clear).not.toHaveBeenCalled();
    expect(close).not.toHaveBeenCalled();
  });
  it('keeps expired and failed status recovery intact and offers reconnection', async () => {
    pending();
    check.mockRejectedValue(new BillingSessionExpired());
    show();
    fireEvent.click(
      await screen.findByRole('button', { name: 'Reconnect Billing' }),
    );
    expect(reconnect).toHaveBeenCalledTimes(1);
    expect(save).not.toHaveBeenCalled();
    expect(clear).not.toHaveBeenCalled();
  });
  it('blocks another workflow or a changed history before loading writable state', async () => {
    diskLoad.mockResolvedValue({ ...request(), order_id: 99 });
    show();
    await screen.findByRole('alert');
    expect(get).not.toHaveBeenCalled();
    expect(review).not.toHaveBeenCalled();
  });
  it('has no automated accessibility violations in the loaded read-only state', async () => {
    const view = show();
    await screen.findByRole('button', { name: 'Review native validation' });
    expect(await axe(view.container)).toHaveNoViolations();
    expect(save).not.toHaveBeenCalled();
  });
  it('hands an explicitly accepted legacy parent to the complete writer without changing its payload', async () => {
    const parent: StockValidationStepRequest = {
      ...validationRequest(),
      continuation_key: false,
    };
    diskLoad.mockResolvedValue(parent);
    const status = outcome(request(), 'prompt');
    const { receipt, current } = status;
    if (!receipt) throw new Error('Missing fixture receipt');
    jest.mocked(getStockValidationStepCompactStatus).mockResolvedValue({
      accepted: true,
      ...receipt,
      current: { ...current, order_id: parent.order_id },
    });
    jest
      .mocked(getStockValidationStepPromptPage)
      .mockImplementation(async (_exact, after = 0) => {
        const page = promptPage(request(), promptMetadata(), after);
        return {
          request_key: page.request_key,
          version: page.version,
          descriptor: page.descriptor,
          after: page.after,
          total_count: page.total_count,
          next_after: page.next_after,
          rows: page.rows,
        };
      });
    jest
      .mocked(getStockValidationStepReferencePage)
      .mockImplementation(async (_exact, after = 0) => {
        const page = referencePage(request(), after);
        return {
          request_key: page.request_key,
          version: page.version,
          after: page.after,
          total_count: page.total_count,
          next_after: page.next_after,
          rows: page.rows,
        };
      });
    Object.defineProperty(crypto, 'randomUUID', {
      configurable: true,
      value: () => '22222222-2222-4333-8444-555555555555',
    });
    show(parent);
    await readSaved('prompt');
    await readSaved('reference');
    fireEvent.click(
      screen.getByRole('button', { name: 'Review receipt confirmation' }),
    );
    await screen.findByRole('heading', { name: 'Validation review page 1' });
    await advanceReview();
    fireEvent.click(
      screen.getByRole('button', { name: 'Save reviewed native validation' }),
    );
    await waitFor(() => expect(save).toHaveBeenCalled());
    expect(persist.mock.calls[0][2]).toEqual(parent);
    expect(parent).not.toHaveProperty('review_complete_token');
    expect(save.mock.calls[0][0]).toMatchObject({
      continuation_key: parent.request_key,
      review_complete_token: 'c'.repeat(64),
    });
  });
  it('does not dispatch a write when recovery storage rejects the commit', async () => {
    effectCount = 1;
    persist.mockRejectedValue(new Error('Storage full'));
    show();
    await begin();
    fireEvent.click(
      screen.getByRole('button', { name: 'Save reviewed native validation' }),
    );
    await screen.findByText('Storage full');
    expect(save).not.toHaveBeenCalled();
    expect(clear).not.toHaveBeenCalled();
  });
  it('retains a lost stop response and resolves it only through an explicit status check', async () => {
    pending('unknown');
    stop.mockRejectedValue(new Error('Stop response lost'));
    show();
    fireEvent.click(
      await screen.findByRole('button', {
        name: 'Stop this exact validation request',
      }),
    );
    fireEvent.click(
      screen.getByRole('button', { name: /Confirm exact request stop/ }),
    );
    await screen.findByText('Stop response lost');
    expect(disk.get(3)?.request).toEqual(request());
    expect(restore).not.toHaveBeenCalled();
    native.set(request().request_key, outcome(request(), 'stopped'));
    fireEvent.click(
      screen.getByRole('button', { name: 'Check exact validation request' }),
    );
    await screen.findByRole('button', { name: 'Retire stopped request' });
    expect(stop).toHaveBeenCalledTimes(1);
    expect(restore).not.toHaveBeenCalled();
  });
  it('retains recovery if pinned references fail revalidation before finish', async () => {
    pending();
    show();
    await readSaved('reference');
    refs.mockRejectedValueOnce(new Error('Reference snapshot changed'));
    fireEvent.click(
      screen.getByRole('button', { name: 'Finish accepted validation' }),
    );
    await screen.findByText('Reference snapshot changed');
    expect(clear).not.toHaveBeenCalled();
    expect(close).not.toHaveBeenCalled();
  });
  it('does not close after clear reports a different pending request', async () => {
    pending();
    show();
    await readSaved('reference');
    clear.mockResolvedValueOnce({
      ...request(),
      request_key: '22222222-2222-4333-8444-555555555555',
    });
    fireEvent.click(
      screen.getByRole('button', { name: 'Finish accepted validation' }),
    );
    await screen.findByRole('alert');
    expect(close).not.toHaveBeenCalled();
  });
  it('saves an opening native prompt once without automatically processing the next choice', async () => {
    effectCount = 0;
    review.mockImplementation(async (selection) => ({
      ...effectPage(selection, 0, 0),
      state_after: 'assigned',
      terminal: false,
      next_step: promptMetadata('immediate'),
    }));
    save.mockImplementation(async (exact) => {
      const value = outcome(exact, 'prompt', promptMetadata('immediate'));
      native.set(exact.request_key, value);
      return value;
    });
    show();
    await begin();
    expect(
      screen.getByRole('button', { name: 'Save reviewed native validation' }),
    ).toBeEnabled();
    fireEvent.click(
      screen.getByRole('button', { name: 'Save reviewed native validation' }),
    );
    await screen.findByRole('heading', { name: 'Saved immediate prompt' });
    expect(save).toHaveBeenCalledTimes(1);
    expect(save.mock.calls[0][0].decisions).toEqual([]);
    expect(
      screen.getByRole('button', { name: 'Review immediate quantities' }),
    ).toBeDisabled();
    expect(
      screen.getByText(/Acceptance did not complete the transfer/),
    ).toBeInTheDocument();
  });
  it('finishes an accepted terminal decline without claiming delivery or recreating a prompt', async () => {
    referenceCount = 0;
    const exact = pending(),
      value = outcome(exact, 'terminal', promptMetadata(), referenceCount);
    if (!value.receipt) throw new Error('Missing fixture receipt');
    native.set(exact.request_key, {
      ...value,
      receipt: { ...value.receipt, state_after: 'assigned' },
    });
    show();
    await readSaved('reference');
    expect(
      screen.getByText(/Acceptance did not complete the transfer/),
    ).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole('button', { name: 'Finish accepted validation' }),
    );
    await waitFor(() => expect(close).toHaveBeenCalled());
    expect(save).not.toHaveBeenCalled();
  });
});
