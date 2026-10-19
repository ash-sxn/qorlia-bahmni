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
  BillingSessionExpired,
  getStockValidationStepCompactStatus,
  getStockValidationStepPromptPage,
  getStockValidationStepReferencePage,
  getStockValidation,
  saveStockValidationStep,
  type StockValidationStepCompactStatus,
  type StockValidationStepRequest,
  type StockValidationPromptPage,
} from '../billingService';
import { SavedValidationRecoveryModal } from '../SavedValidationRecoveryModal';
import {
  loadStockValidationRecovery,
  clearStockValidationRecovery,
} from '../stockReservationRecovery';
import { orderDeliveryPageFixture } from './orderDeliveryFixture';
import { validationRequest } from './stockValidationFixture';

jest.mock('../billingService', () => ({
  ...jest.requireActual('../billingService'),
  getStockValidationStepCompactStatus: jest.fn(),
  getStockValidationStepPromptPage: jest.fn(),
  getStockValidationStepReferencePage: jest.fn(),
  getStockValidation: jest.fn(),
  saveStockValidationStep: jest.fn(),
}));
jest.mock('../stockReservationRecovery', () => ({
  ...jest.requireActual('../stockReservationRecovery'),
  loadStockValidationRecovery: jest.fn(),
  clearStockValidationRecovery: jest.fn(),
}));
const get = jest.mocked(getStockValidationStepCompactStatus),
  prompts = jest.mocked(getStockValidationStepPromptPage),
  references = jest.mocked(getStockValidationStepReferencePage),
  load = jest.mocked(loadStockValidationRecovery),
  clear = jest.mocked(clearStockValidationRecovery);
const close = jest.fn(),
  reconnect = jest.fn(),
  continueReview = jest.fn(),
  returnFocus = jest.fn();
const exact = (): StockValidationStepRequest => ({
  ...validationRequest(),
  continuation_key: false,
});
const version = 'e'.repeat(64),
  promptVersion = 'f'.repeat(64);
const state = (): StockValidationStepCompactStatus => ({
  accepted: true,
  request_key: exact().request_key,
  state_after: 'assigned',
  reference_count: 101,
  current: {
    order_id: 9,
    transfer_id: 11,
    version,
    transfer: {
      ...orderDeliveryPageFixture().rows[0],
      move_count: 501,
      operation_count: 2001,
    },
  },
  next_step: {
    kind: 'receipt',
    title: 'Saved receipt review',
    blocked_reason: false,
    counts: { transfers: 0, lots: 0, operations: 101 },
    source: [3, 'Supplier'],
    destination: [4, 'Stock'],
    picking_code: 'incoming',
  },
  prompt_count: 101,
  prompt_version: promptVersion,
  continuation_key: exact().request_key,
  continuation_reason: false,
  terminal: false,
});
let outcome: StockValidationStepCompactStatus;
const terminal = () => {
  outcome = {
    ...outcome,
    state_after: 'done',
    terminal: true,
    next_step: false,
    prompt_count: 0,
    prompt_version: false,
    continuation_key: false,
  };
};
const promptPage = (after: number): StockValidationPromptPage => ({
  request_key: exact().request_key,
  version: promptVersion,
  descriptor:
    outcome.next_step ||
    (state().next_step as StockValidationPromptPage['descriptor']),
  after,
  total_count: 101,
  next_after: after + 50 < 101 ? after + 50 : false,
  rows: Array.from({ length: Math.min(50, 101 - after) }, (_, index) => ({
    section: 'operations',
    value: {
      id: after + index + 1,
      product_id: [3, `Medicine ${after + index + 1}`],
      product_uom_id: [4, 'Dozens'],
      qty_done: 0.5,
      lot_id: false,
      lot_name: `Batch ${after + index + 1}`,
      expiration_date: '2027-02-01T00:00:00',
      cost_price: 2.5,
      sale_price: 5,
      mrp: 7,
      balance: 10,
      is_move_line_lot_expiring_soon: true,
      expiry_warning: {
        title: 'Batch expiry',
        type: 'warning',
        message: '<b>Native warning</b>',
      },
    },
  })),
});
const renderModal = (continueCompleteReview?: () => void) =>
  render(
    <QueryClientProvider
      client={
        new QueryClient({
          defaultOptions: { queries: { retry: false, gcTime: 0 } },
        })
      }
    >
      <SavedValidationRecoveryModal
        uid={3}
        request={exact()}
        close={close}
        reconnect={reconnect}
        returnFocus={returnFocus}
        continueReview={continueReview}
        continueCompleteReview={continueCompleteReview}
      />
    </QueryClientProvider>,
  );
const readReferences = async (all = true) => {
  fireEvent.click(
    await screen.findByRole('button', { name: 'Read saved references' }),
  );
  await screen.findByText('References 1 to 50 of 101.');
  if (!all) return;
  for (const text of [
    'References 51 to 100 of 101.',
    'References 101 to 101 of 101.',
  ]) {
    fireEvent.click(
      screen.getByRole('button', { name: 'Next reference page' }),
    );
    await screen.findByText(text);
  }
};
const readPrompt = async (all = true) => {
  fireEvent.click(
    await screen.findByRole('button', { name: 'Read saved prompt' }),
  );
  await screen.findByText('Prompt rows 1 to 50 of 101.');
  if (!all) return;
  for (const text of [
    'Prompt rows 51 to 100 of 101.',
    'Prompt rows 101 to 101 of 101.',
  ]) {
    fireEvent.click(screen.getByRole('button', { name: 'Next prompt page' }));
    await screen.findByText(text);
  }
};
expect.extend(toHaveNoViolations);
describe('Bounded exact validation-step recovery UI', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    outcome = state();
    load.mockResolvedValue(exact());
    clear.mockResolvedValue(null);
    get.mockImplementation(async () => outcome);
    prompts.mockImplementation(async (_request, after = 0) =>
      promptPage(after),
    );
    references.mockImplementation(async (_request, after = 0) => ({
      request_key: exact().request_key,
      version,
      after,
      total_count: 101,
      next_after: after + 50 < 101 ? after + 50 : false,
      rows: Array.from({ length: Math.min(50, 101 - after) }, (_, index) => ({
        key: `new:stock.lot:${after + index}`,
        model: 'stock.lot',
        id: false,
        name: false,
        available: false,
      })),
    }));
  });
  it('reads large accepted transfers without the capped graph or any automatic write, and retains recovery on close', async () => {
    const view = renderModal();
    await screen.findByText('501 product moves · 2001 recorded operations');
    expect(get).toHaveBeenCalledWith(exact());
    expect(load).toHaveBeenCalledWith(3);
    expect(
      screen.queryByRole('button', { name: 'Continue saved native workflow' }),
    ).not.toBeInTheDocument();
    expect(await axe(view.container)).toHaveNoViolations();
    fireEvent.click(
      screen.getByRole('button', { name: 'Back to stock transfers' }),
    );
    expect(close).toHaveBeenCalledTimes(1);
    expect(clear).not.toHaveBeenCalled();
    expect(getStockValidation).not.toHaveBeenCalled();
    expect(saveStockValidationStep).not.toHaveBeenCalled();
    view.unmount();
    expect(returnFocus).toHaveBeenCalledTimes(1);
  });
  it('hands a large accepted native prompt to the complete writer only after all saved pages and fresh checks', async () => {
    const complete = jest.fn();
    renderModal(complete);
    const button = await screen.findByRole('button', {
      name: 'Continue saved native workflow',
    });
    expect(button).toBeDisabled();
    await readPrompt();
    expect(button).toBeDisabled();
    await readReferences();
    fireEvent.click(button);
    await waitFor(() => expect(complete).toHaveBeenCalledTimes(1));
    expect(continueReview).not.toHaveBeenCalled();
    expect(clear).not.toHaveBeenCalled();
    expect(references).toHaveBeenLastCalledWith(exact(), 0, version, 50);
  });
  it('renders all saved prompt rows over bounded pinned pages, native prices/units/warnings, and supports keyboard focus and previous pages', async () => {
    renderModal();
    await readPrompt(false);
    const table = screen.getByRole('table', {
      name: /Native saved prompt values/,
    });
    for (const text of [
      'Medicine 1',
      'Batch 1',
      'Dozens',
      '0.5',
      '2.5',
      '5',
      '7',
      '10',
      '2027-02-01T00:00:00',
      'Batch expiry: <b>Native warning</b>',
    ])
      expect(within(table).getAllByText(text).length).toBeGreaterThan(0);
    expect(table.querySelector('b')).toBeNull();
    expect(
      screen.getByRole('heading', { name: 'Saved receipt review' }),
    ).toHaveFocus();
    for (const text of [
      'Prompt rows 51 to 100 of 101.',
      'Prompt rows 101 to 101 of 101.',
    ]) {
      fireEvent.click(screen.getByRole('button', { name: 'Next prompt page' }));
      await screen.findByText(text);
    }
    expect(screen.getByText('Medicine 101')).toBeInTheDocument();
    expect(prompts.mock.calls.map((call) => call.slice(1))).toEqual([
      [0, promptVersion, 50],
      [50, promptVersion, 50],
      [100, promptVersion, 50],
    ]);
    fireEvent.click(
      screen.getByRole('button', { name: 'Previous prompt page' }),
    );
    await screen.findByText('Prompt rows 51 to 100 of 101.');
    expect(prompts).toHaveBeenLastCalledWith(exact(), 50, promptVersion, 50);
    expect(clear).not.toHaveBeenCalled();
    expect(continueReview).not.toHaveBeenCalled();
  });
  it('requires every reference page and a fresh accepted terminal receipt before exact durable clearing', async () => {
    terminal();
    renderModal();
    const finish = await screen.findByRole('button', {
      name: 'Finish recovered validation and reload transfers',
    });
    expect(finish).toBeDisabled();
    await readReferences(false);
    expect(finish).toBeDisabled();
    for (const text of [
      'References 51 to 100 of 101.',
      'References 101 to 101 of 101.',
    ]) {
      fireEvent.click(
        screen.getByRole('button', { name: 'Next reference page' }),
      );
      await screen.findByText(text);
    }
    expect(finish).toBeEnabled();
    expect(references.mock.calls.map((call) => call.slice(1))).toEqual([
      [0, false, 50],
      [50, version, 50],
      [100, version, 50],
    ]);
    fireEvent.click(finish);
    await waitFor(() => expect(close).toHaveBeenCalledTimes(1));
    expect(get).toHaveBeenCalledTimes(2);
    expect(references).toHaveBeenLastCalledWith(exact(), 0, version, 50);
    expect(clear).toHaveBeenCalledWith(3, exact());
    expect(clear.mock.invocationCallOrder[0]).toBeGreaterThan(
      references.mock.invocationCallOrder.at(-1)!,
    );
  });
  it('waits for strict recovery clear completion and refuses double finish', async () => {
    terminal();
    let commit!: () => void;
    clear.mockImplementation(
      () =>
        new Promise((resolve) => {
          commit = () => resolve(null);
        }),
    );
    renderModal();
    await readReferences();
    const finish = screen.getByRole('button', {
      name: 'Finish recovered validation and reload transfers',
    });
    fireEvent.click(finish);
    await waitFor(() => expect(clear).toHaveBeenCalledTimes(1));
    expect(close).not.toHaveBeenCalled();
    expect(finish).toBeDisabled();
    fireEvent.click(finish);
    expect(clear).toHaveBeenCalledTimes(1);
    await act(async () => commit());
    await waitFor(() => expect(close).toHaveBeenCalledTimes(1));
  });
  it.each(['status', 'references', 'storage'] as const)(
    'retains the exact request on a changed %s during final recovery',
    async (change) => {
      terminal();
      renderModal();
      await readReferences();
      if (change === 'status')
        get.mockResolvedValue({ ...outcome, state_after: 'assigned' });
      if (change === 'references')
        references.mockRejectedValueOnce(
          new Error('References changed. Reload.'),
        );
      if (change === 'storage') clear.mockResolvedValue(exact());
      fireEvent.click(
        screen.getByRole('button', {
          name: 'Finish recovered validation and reload transfers',
        }),
      );
      const error = await screen.findByRole('alert');
      expect(error).toHaveFocus();
      expect(close).not.toHaveBeenCalled();
      expect(clear).toHaveBeenCalledTimes(change === 'storage' ? 1 : 0);
    },
  );
  it('requires complete prompt and reference reads, then explicitly hands a small transfer to its original continuation writer without clearing', async () => {
    outcome.current.transfer.move_count = 1;
    outcome.current.transfer.operation_count = 101;
    renderModal();
    const next = await screen.findByRole('button', {
      name: 'Continue saved native workflow',
    });
    expect(next).toBeDisabled();
    await readPrompt();
    expect(next).toBeDisabled();
    await readReferences();
    expect(next).toBeEnabled();
    fireEvent.click(next);
    await waitFor(() => expect(continueReview).toHaveBeenCalledTimes(1));
    expect(clear).not.toHaveBeenCalled();
    expect(close).not.toHaveBeenCalled();
    expect(get).toHaveBeenCalledTimes(2);
  });
  it('keeps unknown acceptance distinct from a stopped write and only opens the original retry flow explicitly', async () => {
    outcome = {
      ...outcome,
      accepted: false,
      state_after: false,
      reference_count: 0,
      next_step: false,
      prompt_count: 0,
      prompt_version: false,
      continuation_key: false,
    };
    outcome.current.transfer.move_count = 1;
    outcome.current.transfer.operation_count = 1;
    renderModal();
    await screen.findByText(/This does not prove the original write stopped/);
    expect(continueReview).not.toHaveBeenCalled();
    fireEvent.click(
      screen.getByRole('button', { name: 'Open identical-request recovery' }),
    );
    expect(continueReview).toHaveBeenCalledTimes(1);
    expect(clear).not.toHaveBeenCalled();
  });
  it('keeps consumed or unavailable prompts nonterminal and never invents a replacement prompt or clear action', async () => {
    outcome = {
      ...outcome,
      next_step: false,
      prompt_count: 0,
      prompt_version: false,
      continuation_key: false,
      continuation_reason: 'The saved native prompt is unavailable.',
    };
    renderModal();
    await screen.findByText('The saved native prompt is unavailable.');
    expect(
      screen.queryByRole('button', { name: /Continue saved|Finish recovered/ }),
    ).not.toBeInTheDocument();
    expect(prompts).not.toHaveBeenCalled();
    expect(clear).not.toHaveBeenCalled();
  });
  it.each(['prompt', 'references'] as const)(
    'fails closed on a stale %s page and resets visited pages only on explicit status reload',
    async (kind) => {
      renderModal();
      if (kind === 'prompt') {
        await readPrompt(false);
        prompts.mockRejectedValueOnce(
          new Error('Saved prompt changed. Reload.'),
        );
        fireEvent.click(
          screen.getByRole('button', { name: 'Next prompt page' }),
        );
      } else {
        await readReferences(false);
        references.mockRejectedValueOnce(
          new Error('References changed. Reload.'),
        );
        fireEvent.click(
          screen.getByRole('button', { name: 'Next reference page' }),
        );
      }
      await screen.findByRole('alert');
      expect(clear).not.toHaveBeenCalled();
      fireEvent.click(
        screen.getByRole('button', { name: 'Check exact validation request' }),
      );
      await waitFor(() => expect(get).toHaveBeenCalledTimes(2));
      await screen.findByRole('button', { name: 'Read saved prompt' });
      expect(
        screen.queryByText(/All saved prompt pages have been read/),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByText(/All reference pages have been read/),
      ).not.toBeInTheDocument();
    },
  );
  it.each(['account', 'unavailable'] as const)(
    'does not query native data when recovery storage is %s',
    async (reason) => {
      if (reason === 'account')
        load.mockResolvedValue({
          ...exact(),
          request_key: '33333333-2222-4333-8444-555555555555',
        });
      else load.mockRejectedValue(new Error('Storage unavailable'));
      renderModal();
      await screen.findByRole('alert');
      expect(get).not.toHaveBeenCalled();
      expect(clear).not.toHaveBeenCalled();
    },
  );
  it('keeps recovery on expiry and offers reconnection without retrying a mutation', async () => {
    get.mockRejectedValue(new BillingSessionExpired('Session expired'));
    renderModal();
    fireEvent.click(
      await screen.findByRole('button', { name: 'Reconnect Billing' }),
    );
    expect(reconnect).toHaveBeenCalledTimes(1);
    expect(clear).not.toHaveBeenCalled();
  });
  it('verifies even an empty reference set and preserves a terminal declined action distinct from completed delivery', async () => {
    terminal();
    outcome.state_after = 'assigned';
    outcome.reference_count = 0;
    references.mockResolvedValue({
      request_key: exact().request_key,
      version,
      after: 0,
      total_count: 0,
      next_after: false,
      rows: [],
    });
    renderModal();
    const finish = await screen.findByRole('button', {
      name: 'Finish recovered validation and reload transfers',
    });
    expect(finish).toBeDisabled();
    expect(
      screen.getByText(/The accepted action did not complete the transfer/),
    ).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole('button', { name: 'Read saved references' }),
    );
    await screen.findByText(
      'No new business document references were created.',
    );
    expect(finish).toBeEnabled();
    fireEvent.click(finish);
    await waitFor(() => expect(close).toHaveBeenCalledTimes(1));
    expect(references).toHaveBeenCalledTimes(2);
    expect(clear).toHaveBeenCalledWith(3, exact());
  });
  it('does not hide a failed durable clear as a finished request', async () => {
    terminal();
    renderModal();
    await readReferences();
    clear.mockRejectedValue(new Error('Storage commit aborted'));
    fireEvent.click(
      screen.getByRole('button', {
        name: 'Finish recovered validation and reload transfers',
      }),
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Storage commit aborted',
    );
    expect(close).not.toHaveBeenCalled();
    expect(continueReview).not.toHaveBeenCalled();
  });
  it('rechecks a prompt snapshot before entering the original continuation writer', async () => {
    outcome.current.transfer.move_count = 1;
    outcome.current.transfer.operation_count = 101;
    renderModal();
    await readPrompt();
    await readReferences();
    get.mockResolvedValue({ ...outcome, prompt_version: 'a'.repeat(64) });
    fireEvent.click(
      screen.getByRole('button', { name: 'Continue saved native workflow' }),
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The validation outcome changed.',
    );
    expect(continueReview).not.toHaveBeenCalled();
    expect(clear).not.toHaveBeenCalled();
  });
  it.each(['immediate', 'backorder', 'expiry'] as const)(
    'renders native %s choices as saved values, not actions on a partial prompt',
    async (kind) => {
      const descriptor: StockValidationPromptPage['descriptor'] =
        kind === 'expiry'
          ? {
              kind,
              title: 'Native expiry',
              blocked_reason: false,
              counts: { transfers: 0, lots: 1, operations: 0 },
              description: 'Native warning description',
            }
          : {
              kind,
              title: 'Native transfer choice',
              blocked_reason: false,
              counts: { transfers: 1, lots: 0, operations: 0 },
            };
      outcome = { ...outcome, next_step: descriptor, prompt_count: 1 };
      const rows: StockValidationPromptPage['rows'] =
        kind === 'expiry'
          ? [{ section: 'lots', value: [23, 'Expired lot'] }]
          : [
              {
                section: 'transfers',
                value: { transfer: [11, 'QA Transfer'], selected: false },
              },
            ];
      prompts.mockResolvedValue({
        request_key: exact().request_key,
        version: promptVersion,
        descriptor,
        after: 0,
        total_count: 1,
        next_after: false,
        rows,
      });
      renderModal();
      fireEvent.click(
        await screen.findByRole('button', { name: 'Read saved prompt' }),
      );
      await screen.findByText(
        kind === 'expiry' ? 'Expired lot' : 'Not selected',
      );
      expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
      expect(
        screen.queryByRole('button', {
          name: /Proceed with expired|Review selected decision|Confirm receipt review/,
        }),
      ).not.toBeInTheDocument();
      expect(clear).not.toHaveBeenCalled();
    },
  );
  it('retains a blocked native SMS prompt without offering continuation or hiding the reason', async () => {
    outcome = {
      ...outcome,
      next_step: {
        kind: 'sms',
        title: 'Native SMS prompt',
        blocked_reason: 'Native SMS is required',
        counts: { transfers: 0, lots: 0, operations: 0 },
      },
      prompt_count: 0,
    };
    outcome.current.transfer.move_count = 1;
    outcome.current.transfer.operation_count = 1;
    renderModal();
    await screen.findByText('Native SMS is required');
    expect(
      screen.queryByRole('button', { name: 'Continue saved native workflow' }),
    ).not.toBeInTheDocument();
    expect(clear).not.toHaveBeenCalled();
    expect(prompts).not.toHaveBeenCalled();
  });
  it('ignores a prompt response after the dialog is unmounted', async () => {
    let reply!: (page: StockValidationPromptPage) => void;
    prompts.mockImplementation(
      () =>
        new Promise((resolve) => {
          reply = resolve;
        }),
    );
    const view = renderModal();
    fireEvent.click(
      await screen.findByRole('button', { name: 'Read saved prompt' }),
    );
    await waitFor(() => expect(prompts).toHaveBeenCalledTimes(1));
    expect(
      screen.getByRole('button', { name: 'Back to stock transfers' }),
    ).toBeDisabled();
    view.unmount();
    await act(async () => reply(promptPage(0)));
    expect(close).not.toHaveBeenCalled();
    expect(clear).not.toHaveBeenCalled();
    expect(continueReview).not.toHaveBeenCalled();
  });
});
