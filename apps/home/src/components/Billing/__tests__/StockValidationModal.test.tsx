import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe, toHaveNoViolations } from 'jest-axe';
import {
  BillingActionRejected,
  BillingSessionExpired,
  getStockValidation,
  previewStockValidationStep,
  saveStockValidationStep,
  getStockValidationStepStatus,
  saveStockValidation,
  getStockValidationStatus,
  StockValidationStep,
  StockValidationStepRequest,
  StockValidationStepReview,
  StockValidationStepStatus,
} from '../billingService';
import {
  clearStockValidationRecovery,
  loadStockValidationRecovery,
  persistStockValidationRecovery,
  replaceStockValidationRecovery,
  StockValidationRecoveryRequest,
} from '../stockReservationRecovery';
import { StockValidationModal } from '../StockValidationModal';
import {
  terminalValidationReview,
  validationLoad,
  validationRequest,
  validationStatus,
  validationStep,
  validationWizardReview,
} from './stockValidationFixture';

jest.mock('../billingService', () => ({
  ...jest.requireActual('../billingService'),
  getStockValidation: jest.fn(),
  previewStockValidationStep: jest.fn(),
  saveStockValidationStep: jest.fn(),
  getStockValidationStepStatus: jest.fn(),
  saveStockValidation: jest.fn(),
  getStockValidationStatus: jest.fn(),
}));
jest.mock('../stockReservationRecovery', () => ({
  ...jest.requireActual('../stockReservationRecovery'),
  loadStockValidationRecovery: jest.fn(),
  persistStockValidationRecovery: jest.fn(),
  replaceStockValidationRecovery: jest.fn(),
  clearStockValidationRecovery: jest.fn(),
}));
const get = jest.mocked(getStockValidation),
  preview = jest.mocked(previewStockValidationStep),
  save = jest.mocked(saveStockValidationStep),
  status = jest.mocked(getStockValidationStepStatus),
  legacySave = jest.mocked(saveStockValidation),
  legacyStatus = jest.mocked(getStockValidationStatus);
const load = jest.mocked(loadStockValidationRecovery),
  persist = jest.mocked(persistStockValidationRecovery),
  replace = jest.mocked(replaceStockValidationRecovery),
  clear = jest.mocked(clearStockValidationRecovery);
const close = jest.fn(),
  reconnect = jest.fn(),
  returnFocus = jest.fn();
let disk: StockValidationRecoveryRequest | null;
let receipts: Map<string, StockValidationStepStatus>;
const key = (number = 1) =>
  `${number}${number}${number}${number}${number}${number}${number}${number}-2222-4333-8444-555555555555`;
const request = (): StockValidationStepRequest => ({
  ...validationRequest(),
  continuation_key: false,
});
const reviewed = (
  next: StockValidationStep | false = false,
): StockValidationStepReview => ({
  ...(next ? validationWizardReview(next) : terminalValidationReview()),
  continuation_key: false,
  write_ready: true,
  review_version: 'b'.repeat(64),
});
const accepted = (
  exact: StockValidationStepRequest,
  next: StockValidationStep | false = false,
  state: 'assigned' | 'done' = next ? 'assigned' : 'done',
): StockValidationStepStatus => {
  const result: StockValidationStepStatus = {
    ...validationStatus(),
    request_key: exact.request_key,
    state_after: state,
    terminal: !next,
    next_step: next,
    continuation_key: next ? exact.request_key : false,
    continuation_reason: false,
  };
  receipts.set(exact.request_key, result);
  return result;
};
const unknown = (): StockValidationStepStatus => ({
  ...validationStatus(),
  accepted: false,
  state_after: false,
  references: {},
  terminal: false,
  next_step: false,
  continuation_key: false,
  continuation_reason: false,
});
expect.extend(toHaveNoViolations);
const element = (client: QueryClient, uid = 3) => (
  <QueryClientProvider client={client}>
    <StockValidationModal
      uid={uid}
      orderId={9}
      transferId={11}
      close={close}
      reconnect={reconnect}
      returnFocus={returnFocus}
    />
  </QueryClientProvider>
);
const show = () => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return { ...render(element(client)), client };
};
const review = async () => {
  fireEvent.click(
    await screen.findByRole('button', { name: 'Review native validation' }),
  );
  await screen.findByRole('region', { name: 'Reviewed validation effects' });
};
const saveReview = async () => {
  fireEvent.click(
    screen.getByRole('button', { name: 'Save reviewed validation step' }),
  );
  await screen.findByRole('heading', {
    name: /Accepted native validation action/,
  });
};
const openPrompt = async (step = validationStep()) => {
  preview.mockResolvedValueOnce(reviewed(step));
  save.mockImplementationOnce(async (exact) => accepted(exact, step));
  await review();
  await saveReview();
};

describe('Per-RPC native validation UI and legacy recovery', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    disk = null;
    receipts = new Map();
    get.mockResolvedValue(validationLoad());
    preview.mockImplementation(async (selection) => ({
      ...reviewed(),
      ...selection,
    }));
    save.mockImplementation(async (exact) => accepted(exact));
    status.mockImplementation(
      async (exact) => receipts.get(exact.request_key) ?? accepted(exact),
    );
    load.mockImplementation(async (uid) => (uid === 3 ? disk : null));
    persist.mockImplementation(async (_uid, exact) => {
      disk = exact;
      return exact;
    });
    replace.mockImplementation(async (_uid, previous, exact) => {
      if (JSON.stringify(disk) !== JSON.stringify(previous))
        throw new Error('The preceding recovery request changed.');
      disk = exact;
      return exact;
    });
    clear.mockImplementation(async () => {
      disk = null;
      return null;
    });
    let nonce = 0;
    Object.defineProperty(crypto, 'randomUUID', {
      configurable: true,
      value: () => key(++nonce),
    });
  });

  it('focuses an accessible signed step preview without processing the future prompt', async () => {
    preview.mockResolvedValue(reviewed(validationStep()));
    show();
    await review();
    expect(
      screen.getByRole('heading', { name: 'Validation preview' }),
    ).toHaveFocus();
    expect(
      screen.getByRole('button', { name: 'Save reviewed validation step' }),
    ).toBeEnabled();
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    expect(
      screen.getByText(/Its decision is not processed by this save/),
    ).toBeInTheDocument();
    expect(await axe(document.body)).toHaveNoViolations();
    fireEvent.click(
      screen.getByRole('button', { name: 'Discard validation preview' }),
    );
    expect(save).not.toHaveBeenCalled();
    expect(persist).not.toHaveBeenCalled();
  });

  it.each(['immediate', 'backorder'] as const)(
    'saves before displaying the native %s prompt and only previews one keyboard-controlled decision',
    async (kind) => {
      const step = validationStep(kind);
      step.transfers[0].selected = false;
      show();
      await openPrompt(step);
      expect(screen.getByRole('checkbox')).not.toBeChecked();
      expect(
        screen.queryByRole('button', { name: 'Review previous choice' }),
      ).not.toBeInTheDocument();
      fireEvent.click(
        screen.getByRole('button', { name: 'Review selected decision' }),
      );
      await screen.findByRole('button', {
        name: 'Save reviewed validation step',
      });
      expect(preview).toHaveBeenLastCalledWith({
        order_id: 9,
        transfer_id: 11,
        version: validationLoad().version,
        continuation_key: key(),
        decisions: [{ kind, selected: false }],
      });
    },
  );

  it('discards only an uncommitted decision and atomically hands off the accepted receipt before the next HTTP write', async () => {
    show();
    await openPrompt();
    fireEvent.click(
      screen.getByRole('button', { name: 'Review selected decision' }),
    );
    await screen.findByRole('button', { name: 'Back to saved native prompt' });
    expect(disk).toEqual(request());
    expect(save).toHaveBeenCalledTimes(1);
    fireEvent.click(
      screen.getByRole('button', { name: 'Back to saved native prompt' }),
    );
    const checkbox = screen.getByRole('checkbox');
    act(() => checkbox.focus());
    await userEvent.setup().keyboard(' ');
    expect(checkbox).not.toBeChecked();
    fireEvent.click(
      screen.getByRole('button', { name: 'Review selected decision' }),
    );
    await screen.findByRole('button', {
      name: 'Save reviewed validation step',
    });
    expect(preview).toHaveBeenLastCalledWith({
      order_id: 9,
      transfer_id: 11,
      version: validationLoad().version,
      continuation_key: key(),
      decisions: [{ kind: 'immediate', selected: false }],
    });
    await saveReview();
    const next = {
      ...request(),
      request_key: key(2),
      continuation_key: key(),
      decisions: [{ kind: 'immediate', selected: false }],
    };
    expect(replace).toHaveBeenCalledWith(3, request(), next);
    expect(disk).toEqual(next);
    expect(replace.mock.invocationCallOrder[0]).toBeLessThan(
      save.mock.invocationCallOrder[1],
    );
    expect(persist).toHaveBeenCalledTimes(1);
  });

  it('keeps committed preparation before expiry and never replays an earlier immediate decision', async () => {
    const expiry: StockValidationStep = {
      ...validationStep(),
      kind: 'expiry',
      transfers: [],
      lots: [[4, 'Expired batch']],
      description: 'Native expiry warning',
    };
    preview.mockImplementation(async (selection) => ({
      ...reviewed(
        selection.decisions[0]?.kind === 'immediate' ? expiry : false,
      ),
      ...selection,
      state_after: 'assigned',
    }));
    save.mockImplementation(async (exact) => {
      const result = accepted(
        exact,
        exact.decisions[0]?.kind === 'immediate' ? expiry : false,
        'assigned',
      );
      result.current = { ...validationLoad(), version: 'c'.repeat(64) };
      result.current.graph.transfer.moves[0].done = 5;
      return result;
    });
    const view = show();
    await openPrompt();
    fireEvent.click(
      screen.getByRole('button', { name: 'Review selected decision' }),
    );
    await screen.findByRole('button', {
      name: 'Save reviewed validation step',
    });
    await saveReview();
    expect(screen.getByText('Expired batch')).toBeInTheDocument();
    expect(disk).toMatchObject({
      request_key: key(2),
      decisions: [{ kind: 'immediate', selected: true }],
    });
    view.unmount();
    show();
    fireEvent.click(
      await screen.findByRole('button', { name: 'Check validation request' }),
    );
    await screen.findByText('Expired batch');
    expect(save).toHaveBeenCalledTimes(2);
    fireEvent.click(
      screen.getByRole('button', { name: 'Do not process expired batches' }),
    );
    await screen.findByRole('button', {
      name: 'Save reviewed validation step',
    });
    expect(preview).toHaveBeenLastCalledWith({
      order_id: 9,
      transfer_id: 11,
      version: 'c'.repeat(64),
      continuation_key: key(2),
      decisions: [{ kind: 'expiry', proceed: false }],
    });
    await saveReview();
    expect(disk).toMatchObject({
      request_key: key(3),
      continuation_key: key(2),
      decisions: [{ kind: 'expiry', proceed: false }],
    });
    expect(
      screen.getByText(/The transfer was not completed/),
    ).toBeInTheDocument();
  });

  it('shows native receipt columns and warnings read-only only after the opening step is saved', async () => {
    const step: StockValidationStep = {
      ...validationStep(),
      kind: 'receipt',
      transfers: [],
      source: [1, 'Supplier'],
      destination: [2, 'Stock'],
      picking_code: 'incoming',
      operations: [
        {
          id: 17,
          product_id: [3, 'Medicine'],
          product_uom_id: [4, 'Dozens'],
          qty_done: 0.5,
          lot_id: false,
          lot_name: 'New batch',
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
      ],
    };
    show();
    await openPrompt(step);
    const table = screen.getByRole('table', {
      name: /Saved operations in their native units/,
    });
    for (const text of [
      'Medicine',
      'Dozens',
      '0.5',
      'New batch',
      '2027-02-01T00:00:00',
      '2.5',
      '5',
      '7',
      '10',
      '<b>Native warning</b>',
    ])
      expect(within(table).getByText(text)).toBeInTheDocument();
    expect(table.querySelector('b')).toBeNull();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    fireEvent.click(
      screen.getByRole('button', { name: 'Confirm receipt review' }),
    );
    await screen.findByRole('button', {
      name: 'Save reviewed validation step',
    });
    expect(preview.mock.calls.at(-1)?.[0]).toMatchObject({
      continuation_key: key(),
      decisions: [{ kind: 'receipt', confirm: true }],
    });
    expect(save).toHaveBeenCalledTimes(1);
  });

  it('keeps assigned fields, currencies and private counts and escapes effect markup', async () => {
    const data = reviewed();
    data.effects.schema['account.move.line'] = {
      balance: { label: 'Balance', type: 'monetary', relation: false },
      currency_id: {
        label: 'Currency',
        type: 'many2one',
        relation: 'res.currency',
      },
    };
    data.effects.created['account.move.line'] = [];
    data.effects.deleted['account.move.line'] = [];
    data.effects.updated['account.move.line'] = [
      {
        id: 42,
        before: { balance: 0, currency_id: 21 },
        after: { balance: -20, currency_id: 21 },
      },
    ];
    data.effects.labels['res.currency:21'] = 'INR';
    data.effects.schema['mail.message'] = {
      body: { label: 'Body', type: 'html', relation: false },
    };
    data.effects.created['mail.message'] = [
      {
        key: 'new:mail.message:0',
        values: { body: '<img src=x onerror="alert(1)">' },
        assigned_on_save: [],
      },
    ];
    data.effects.updated['mail.message'] = [];
    data.effects.deleted['mail.message'] = [];
    preview.mockResolvedValue(data);
    show();
    await review();
    const effects = screen.getByRole('region', {
      name: 'Reviewed validation effects',
    });
    fireEvent.click(within(effects).getByText('Change: Stock transfer #11'));
    expect(
      within(effects).getByText('Assigned by the native system on save'),
    ).toBeInTheDocument();
    fireEvent.click(within(effects).getByText('Change: Journal item #42'));
    expect(within(effects).getAllByText('INR (#21)')).toHaveLength(2);
    expect(
      screen.getByRole('region', { name: 'Private native record changes' }),
    ).toHaveTextContent('Stock valuation: 1 created');
    fireEvent.click(within(effects).getByText('Create: New audit message 1'));
    expect(
      within(effects).getByText('<img src=x onerror="alert(1)">'),
    ).toBeInTheDocument();
    expect(effects.querySelector('img')).toBeNull();
  });

  it('commits storage before HTTP, blocks double click and close, and checks a fresh receipt before clearing', async () => {
    let done!: (value: StockValidationStepStatus) => void;
    save.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          done = resolve;
        }),
    );
    const { client } = show();
    const invalidated = jest.spyOn(client, 'invalidateQueries');
    await review();
    const button = screen.getByRole('button', {
      name: 'Save reviewed validation step',
    });
    fireEvent.click(button);
    fireEvent.click(button);
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    expect(disk).toEqual(request());
    expect(persist.mock.invocationCallOrder[0]).toBeLessThan(
      save.mock.invocationCallOrder[0],
    );
    expect(
      screen.getByRole('button', { name: 'Back to stock transfers' }),
    ).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    fireEvent.keyDown(screen.getByRole('dialog'), {
      key: 'Escape',
      keyCode: 27,
    });
    expect(close).not.toHaveBeenCalled();
    await act(async () => done(accepted(request())));
    fireEvent.click(
      await screen.findByRole('button', {
        name: 'Finish and reload transfers',
      }),
    );
    await waitFor(() => expect(close).toHaveBeenCalledTimes(1));
    expect(status).toHaveBeenCalledWith(request());
    expect(clear).toHaveBeenCalledWith(3, request());
    expect(disk).toBeNull();
    expect(invalidated).toHaveBeenCalledWith({
      queryKey: ['billing', 'order-deliveries', 3],
    });
  });

  it('retains an unknown request across remount and retries only its exact nonce without replaying preview', async () => {
    save.mockRejectedValueOnce(new Error('Response lost'));
    status.mockResolvedValueOnce(unknown());
    const view = show();
    await review();
    fireEvent.click(
      screen.getByRole('button', { name: 'Save reviewed validation step' }),
    );
    await screen.findByText('Response lost');
    expect(clear).not.toHaveBeenCalled();
    view.unmount();
    show();
    fireEvent.click(
      await screen.findByRole('button', { name: 'Check validation request' }),
    );
    await screen.findByText(/No receipt found yet/);
    fireEvent.click(
      screen.getByRole('button', {
        name: /Retry identical validation request/,
      }),
    );
    await screen.findByRole('button', { name: 'Finish and reload transfers' });
    expect(save.mock.calls).toEqual([[request()], [request()]]);
    expect(preview).toHaveBeenCalledTimes(1);
    expect(disk).toEqual(request());
  });

  it('recovers the latest continuation request after an unknown second save without reprocessing the first step', async () => {
    const view = show();
    await openPrompt();
    fireEvent.click(
      screen.getByRole('button', { name: 'Review selected decision' }),
    );
    await screen.findByRole('button', {
      name: 'Save reviewed validation step',
    });
    save.mockRejectedValueOnce(new Error('Second response lost'));
    fireEvent.click(
      screen.getByRole('button', { name: 'Save reviewed validation step' }),
    );
    await screen.findByText('Second response lost');
    const exact = disk;
    expect(exact).toMatchObject({
      request_key: key(2),
      continuation_key: key(),
    });
    view.unmount();
    show();
    fireEvent.click(
      await screen.findByRole('button', {
        name: /Retry identical validation request/,
      }),
    );
    await screen.findByRole('button', { name: 'Finish and reload transfers' });
    expect(save.mock.calls.at(-1)).toEqual([exact]);
    expect(preview).toHaveBeenCalledTimes(2);
    expect(legacySave).not.toHaveBeenCalled();
  });

  it('does not write when first storage fails or commits after unmount', async () => {
    persist.mockRejectedValueOnce(new Error('Storage failed'));
    const view = show();
    await review();
    fireEvent.click(
      screen.getByRole('button', { name: 'Save reviewed validation step' }),
    );
    await screen.findByText('Storage failed');
    expect(save).not.toHaveBeenCalled();
    view.unmount();
    let commit!: () => void;
    persist.mockImplementationOnce(async (_uid, exact) => {
      await new Promise<void>((resolve) => {
        commit = resolve;
      });
      disk = exact;
      return exact;
    });
    const next = show();
    await review();
    fireEvent.click(
      screen.getByRole('button', { name: 'Save reviewed validation step' }),
    );
    await waitFor(() => expect(persist).toHaveBeenCalledTimes(2));
    next.unmount();
    await act(async () => commit());
    expect(save).not.toHaveBeenCalled();
    expect(disk).toMatchObject({ continuation_key: false });
  });

  it('keeps the previous receipt if continuation storage fails and never sends the next write', async () => {
    show();
    await openPrompt();
    fireEvent.click(
      screen.getByRole('button', { name: 'Review selected decision' }),
    );
    await screen.findByRole('button', {
      name: 'Save reviewed validation step',
    });
    replace.mockRejectedValueOnce(new Error('Handoff failed'));
    fireEvent.click(
      screen.getByRole('button', { name: 'Save reviewed validation step' }),
    );
    await screen.findByText('Handoff failed');
    expect(disk).toEqual(request());
    expect(save).toHaveBeenCalledTimes(1);
    expect(clear).not.toHaveBeenCalled();
  });

  it('does not send a continuation if its replacement commits after unmount', async () => {
    const view = show();
    await openPrompt();
    fireEvent.click(
      screen.getByRole('button', { name: 'Review selected decision' }),
    );
    await screen.findByRole('button', {
      name: 'Save reviewed validation step',
    });
    let commit!: () => void;
    replace.mockImplementationOnce(async (_uid, _previous, exact) => {
      await new Promise<void>((resolve) => {
        commit = resolve;
      });
      disk = exact;
      return exact;
    });
    fireEvent.click(
      screen.getByRole('button', { name: 'Save reviewed validation step' }),
    );
    await waitFor(() => expect(replace).toHaveBeenCalledTimes(1));
    view.unmount();
    await act(async () => commit());
    expect(disk).toMatchObject({
      request_key: key(2),
      continuation_key: key(),
    });
    expect(save).toHaveBeenCalledTimes(1);
  });

  it('does not clear a different stored request after a definitive rejection', async () => {
    save.mockRejectedValueOnce(
      new BillingActionRejected('Native state changed'),
    );
    clear.mockResolvedValueOnce({ ...request(), request_key: key(2) });
    show();
    await review();
    fireEvent.click(
      screen.getByRole('button', { name: 'Save reviewed validation step' }),
    );
    await screen.findByText(/Recovery storage changed/);
    expect(disk).toEqual(request());
    expect(
      screen.getByRole('button', {
        name: /Retry identical validation request/,
      }),
    ).toBeEnabled();
    expect(preview).toHaveBeenCalledTimes(1);
  });

  it('does not show a late accepted save under another account', async () => {
    let done!: (value: StockValidationStepStatus) => void;
    save.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          done = resolve;
        }),
    );
    const view = show();
    await review();
    fireEvent.click(
      screen.getByRole('button', { name: 'Save reviewed validation step' }),
    );
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    view.rerender(element(view.client, 4));
    await waitFor(() => expect(load).toHaveBeenCalledWith(4));
    await act(async () => done(accepted(request())));
    expect(
      screen.queryByRole('heading', {
        name: /Accepted native validation action/,
      }),
    ).not.toBeInTheDocument();
    expect(disk).toEqual(request());
    expect(clear).not.toHaveBeenCalled();
  });

  it('rechecks continuation acceptance just before the handoff, without losing the previous receipt', async () => {
    show();
    await openPrompt();
    fireEvent.click(
      screen.getByRole('button', { name: 'Review selected decision' }),
    );
    await screen.findByRole('button', {
      name: 'Save reviewed validation step',
    });
    status.mockResolvedValueOnce(unknown());
    fireEvent.click(
      screen.getByRole('button', { name: 'Save reviewed validation step' }),
    );
    await screen.findByText(/Keep its exact recovery request/);
    expect(replace).not.toHaveBeenCalled();
    expect(save).toHaveBeenCalledTimes(1);
    expect(disk).toEqual(request());
  });

  it('clears only definitive rejection and requires a fresh load before review', async () => {
    save.mockRejectedValueOnce(
      new BillingActionRejected('Native quantity changed'),
    );
    show();
    await review();
    fireEvent.click(
      screen.getByRole('button', { name: 'Save reviewed validation step' }),
    );
    await screen.findByText('Native quantity changed');
    expect(disk).toBeNull();
    expect(
      screen.getByRole('button', { name: 'Review native validation' }),
    ).toBeDisabled();
    fireEvent.click(
      screen.getByRole('button', { name: 'Reload validation state' }),
    );
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Review native validation' }),
      ).toBeEnabled(),
    );
  });

  it('keeps recovery on expiry, failed final status and failed or nonmatching clear', async () => {
    save.mockRejectedValueOnce(new BillingSessionExpired());
    const view = show();
    await review();
    fireEvent.click(
      screen.getByRole('button', { name: 'Save reviewed validation step' }),
    );
    fireEvent.click(
      await screen.findByRole('button', { name: 'Reconnect Billing' }),
    );
    expect(reconnect).toHaveBeenCalledTimes(1);
    expect(disk).toEqual(request());
    expect(
      screen.getByRole('button', {
        name: /Retry identical validation request/,
      }),
    ).toBeDisabled();
    view.unmount();
    show();
    fireEvent.click(
      await screen.findByRole('button', { name: 'Check validation request' }),
    );
    await screen.findByRole('button', { name: 'Finish and reload transfers' });
    status.mockResolvedValueOnce(unknown());
    fireEvent.click(
      screen.getByRole('button', { name: 'Finish and reload transfers' }),
    );
    await screen.findByText(/Accepted validation receipt unavailable/);
    expect(clear).not.toHaveBeenCalled();
    clear.mockRejectedValueOnce(new Error('Recovery clear failed'));
    fireEvent.click(
      screen.getByRole('button', { name: 'Finish and reload transfers' }),
    );
    await screen.findByText('Recovery clear failed');
    clear.mockResolvedValueOnce({ ...request(), request_key: key(2) });
    fireEvent.click(
      screen.getByRole('button', { name: 'Finish and reload transfers' }),
    );
    await screen.findByText(/Recovery storage changed/);
    expect(disk).toEqual(request());
    expect(close).not.toHaveBeenCalled();
  });

  it('recovers old six-key atomic requests only through the original APIs', async () => {
    disk = validationRequest();
    legacyStatus.mockResolvedValue(validationStatus());
    legacySave.mockResolvedValue(validationStatus());
    show();
    await screen.findByText(/legacy atomic validation request is stored/);
    expect(preview).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
    fireEvent.click(
      screen.getByRole('button', {
        name: /Retry identical validation request/,
      }),
    );
    await screen.findByRole('button', { name: 'Finish and reload transfers' });
    expect(legacySave).toHaveBeenCalledWith(validationRequest());
    expect(replace).not.toHaveBeenCalled();
    fireEvent.click(
      screen.getByRole('button', { name: 'Finish and reload transfers' }),
    );
    await waitFor(() => expect(close).toHaveBeenCalled());
    expect(legacyStatus).toHaveBeenCalledWith(validationRequest());
    expect(status).not.toHaveBeenCalled();
    expect(disk).toBeNull();
  });

  it('keeps accepted missing/consumed prompt receipts without fabricating another decision', async () => {
    disk = request();
    status.mockResolvedValue({
      ...accepted(request()),
      terminal: false,
      next_step: false,
      continuation_key: false,
      continuation_reason: 'Native prompt is unavailable.',
    });
    show();
    fireEvent.click(
      await screen.findByRole('button', { name: 'Check validation request' }),
    );
    await screen.findByText('Native prompt is unavailable.');
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    fireEvent.click(
      screen.getByRole('button', {
        name: 'Close saved prompt and reload transfers',
      }),
    );
    await waitFor(() => expect(close).toHaveBeenCalled());
    expect(save).not.toHaveBeenCalled();
  });

  it('blocks notification setup and native eligibility without a fallback atomic save', async () => {
    preview.mockRejectedValueOnce(
      new BillingActionRejected('Company-wide notification approval required.'),
    );
    const view = show();
    fireEvent.click(
      await screen.findByRole('button', { name: 'Review native validation' }),
    );
    await screen.findByText('Company-wide notification approval required.');
    expect(save).not.toHaveBeenCalled();
    expect(legacySave).not.toHaveBeenCalled();
    view.unmount();
    get.mockResolvedValue({
      ...validationLoad(),
      write_ready: false,
      reason: 'Native Stock User required',
    });
    show();
    await screen.findByText('Native Stock User required');
    expect(
      screen.getByRole('button', { name: 'Review native validation' }),
    ).toBeDisabled();
  });

  it('loads original recovery identities and does not automatically preview, retry or discard them', async () => {
    disk = { ...request(), order_id: 10, transfer_id: 12 };
    get.mockResolvedValue({
      ...validationLoad(),
      order_id: 10,
      transfer_id: 12,
    });
    show();
    await screen.findByRole('button', { name: 'Check validation request' });
    expect(get).toHaveBeenCalledWith(10, 12);
    expect(preview).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
    fireEvent.click(
      screen.getByRole('button', { name: 'Back to stock transfers' }),
    );
    expect(close).toHaveBeenCalled();
    expect(clear).not.toHaveBeenCalled();
  });

  it('stops before loading native data when another recovery kind is pending', async () => {
    load.mockRejectedValueOnce(new Error('Another stock request is pending.'));
    show();
    await screen.findByText('Another stock request is pending.');
    expect(get).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
  });

  it('ignores late preview results after an account change and restores focus without clearing recovery', async () => {
    let done!: (value: StockValidationStepReview) => void;
    preview.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          done = resolve;
        }),
    );
    const view = show();
    fireEvent.click(
      await screen.findByRole('button', { name: 'Review native validation' }),
    );
    await waitFor(() => expect(preview).toHaveBeenCalledTimes(1));
    view.rerender(element(view.client, 4));
    await waitFor(() => expect(load).toHaveBeenCalledWith(4));
    await act(async () => done(reviewed()));
    expect(
      screen.queryByRole('region', { name: 'Reviewed validation effects' }),
    ).not.toBeInTheDocument();
    view.unmount();
    expect(returnFocus).toHaveBeenCalled();
    expect(clear).not.toHaveBeenCalled();
  });
});
