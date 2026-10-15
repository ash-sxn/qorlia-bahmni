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
  getStockValidationStatus,
  previewStockValidation,
  saveStockValidation,
  StockValidationRequest,
  StockValidationReview,
} from '../billingService';
import {
  clearStockValidationRecovery,
  loadStockValidationRecovery,
  persistStockValidationRecovery,
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
  getStockValidationStatus: jest.fn(),
  previewStockValidation: jest.fn(),
  saveStockValidation: jest.fn(),
}));
jest.mock('../stockReservationRecovery', () => ({
  loadStockValidationRecovery: jest.fn(),
  persistStockValidationRecovery: jest.fn(),
  clearStockValidationRecovery: jest.fn(),
}));
const get = jest.mocked(getStockValidation),
  preview = jest.mocked(previewStockValidation),
  save = jest.mocked(saveStockValidation),
  status = jest.mocked(getStockValidationStatus);
const load = jest.mocked(loadStockValidationRecovery),
  persist = jest.mocked(persistStockValidationRecovery),
  clear = jest.mocked(clearStockValidationRecovery);
const close = jest.fn(),
  reconnect = jest.fn(),
  returnFocus = jest.fn();
let disk: StockValidationRequest | null;
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
describe('Reviewed native stock validation UI', () => {
  it('keeps the preview keyboard focus and passes automated accessibility checks', async () => {
    show();
    await review();
    expect(
      screen.getByRole('heading', { name: 'Validation preview' }),
    ).toHaveFocus();
    expect(await axe(document.body)).toHaveNoViolations();
  });
  beforeEach(() => {
    jest.resetAllMocks();
    disk = null;
    get.mockResolvedValue(validationLoad());
    preview.mockResolvedValue(terminalValidationReview());
    save.mockResolvedValue(validationStatus());
    status.mockResolvedValue(validationStatus());
    load.mockImplementation(async () => disk);
    persist.mockImplementation(async (_uid, exact) => {
      disk = exact;
      return exact;
    });
    clear.mockImplementation(async () => {
      disk = null;
      return null;
    });
    Object.defineProperty(crypto, 'randomUUID', {
      configurable: true,
      value: () => validationRequest().request_key,
    });
  });
  it('shows updated assigned metadata, private financial counts and stable native currency context without executing markup', async () => {
    const data = terminalValidationReview();
    data.effects.schema['account.move.line'] = {
      balance: { label: 'Balance', type: 'monetary', relation: false },
      currency_id: {
        label: 'Currency',
        type: 'many2one',
        relation: 'res.currency',
      },
    };
    data.effects.created['account.move.line'] = [];
    data.effects.updated['account.move.line'] = [
      {
        id: 42,
        before: { balance: 0, currency_id: 21 },
        after: { balance: -20, currency_id: 21 },
      },
    ];
    data.effects.deleted['account.move.line'] = [];
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
    expect(within(effects).getByText('-20')).toBeInTheDocument();
    expect(
      screen.getByRole('region', { name: 'Private native record changes' }),
    ).toHaveTextContent('Stock valuation: 1 created');
    fireEvent.click(within(effects).getByText('Create: New audit message 1'));
    expect(
      within(effects).getByText('<img src=x onerror="alert(1)">'),
    ).toBeInTheDocument();
    expect(effects.querySelector('img')).toBeNull();
    expect(save).not.toHaveBeenCalled();
  });
  it.each(['immediate', 'backorder'] as const)(
    'keeps the native %s default and uses a keyboard-controlled explicit selection',
    async (kind) => {
      const step = validationStep(kind);
      step.transfers[0].selected = false;
      preview.mockImplementation(async (selection) =>
        selection.decisions.length === 0
          ? validationWizardReview(step)
          : {
              ...terminalValidationReview(),
              decisions: selection.decisions,
              state_after:
                kind === 'immediate' &&
                !(
                  'selected' in selection.decisions[0] &&
                  selection.decisions[0].selected
                )
                  ? 'assigned'
                  : 'done',
            },
      );
      show();
      await review();
      expect(screen.getByRole('checkbox')).not.toBeChecked();
      expect(
        screen.queryByRole('button', { name: 'Save reviewed validation' }),
      ).not.toBeInTheDocument();
      fireEvent.click(
        screen.getByRole('button', { name: 'Review selected decision' }),
      );
      await screen.findByRole('button', { name: 'Save reviewed validation' });
      expect(preview.mock.calls.at(-1)?.[0].decisions).toEqual([
        { kind, selected: false },
      ]);
      fireEvent.click(
        screen.getByRole('button', { name: 'Review previous choice' }),
      );
      const checkbox = await screen.findByRole('checkbox');
      expect(checkbox).not.toBeChecked();
      act(() => checkbox.focus());
      await userEvent.setup().keyboard(' ');
      expect(checkbox).toBeChecked();
      fireEvent.click(
        screen.getByRole('button', { name: 'Review selected decision' }),
      );
      await screen.findByRole('button', { name: 'Save reviewed validation' });
      expect(preview).toHaveBeenLastCalledWith({
        order_id: 9,
        transfer_id: 11,
        version: validationLoad().version,
        decisions: [{ kind, selected: true }],
      });
      fireEvent.click(
        screen.getByRole('button', { name: 'Save reviewed validation' }),
      );
      await waitFor(() =>
        expect(save).toHaveBeenCalledWith({
          ...validationRequest(),
          decisions: [{ kind, selected: true }],
        }),
      );
    },
  );
  it('replays immediate then declined expiry, reports preparation instead of delivery and can revisit a native choice', async () => {
    const expiry = {
      ...validationStep(),
      kind: 'expiry' as const,
      transfers: [],
      lots: [[4, 'Expired batch'] as [number, string]],
      description: 'Native expired-batch warning',
    };
    preview.mockImplementation(async (selection) =>
      selection.decisions.length === 0
        ? validationWizardReview(validationStep())
        : selection.decisions.length === 1
          ? validationWizardReview(expiry, selection.decisions)
          : {
              ...terminalValidationReview(),
              state_after: 'assigned',
              decisions: selection.decisions,
            },
    );
    save.mockResolvedValue({ ...validationStatus(), state_after: 'assigned' });
    show();
    await review();
    fireEvent.click(
      screen.getByRole('button', { name: 'Review selected decision' }),
    );
    await screen.findByText('Expired batch');
    expect(
      screen.queryByRole('button', { name: 'Save reviewed validation' }),
    ).not.toBeInTheDocument();
    fireEvent.click(
      screen.getByRole('button', { name: 'Do not process expired batches' }),
    );
    await screen.findByText(
      /This reviewed action leaves the transfer assigned/,
    );
    const decisions = [
      { kind: 'immediate' as const, selected: true },
      { kind: 'expiry' as const, proceed: false },
    ];
    expect(preview.mock.calls.at(-1)?.[0].decisions).toEqual(decisions);
    fireEvent.click(
      screen.getByRole('button', { name: 'Review previous choice' }),
    );
    await screen.findByRole('button', {
      name: 'Do not process expired batches',
    });
    expect(preview.mock.calls.at(-1)?.[0].decisions).toEqual(
      decisions.slice(0, 1),
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Do not process expired batches' }),
    );
    fireEvent.click(
      await screen.findByRole('button', { name: 'Save reviewed validation' }),
    );
    await screen.findByText('Accepted native validation action: assigned');
    expect(
      screen.getByText(/The transfer was not completed/),
    ).toBeInTheDocument();
    expect(save).toHaveBeenCalledWith({ ...validationRequest(), decisions });
  });
  it('keeps receipt quantities, units, batch, expiry, prices, balance and native warnings read-only before confirmation', async () => {
    preview
      .mockResolvedValueOnce(
        validationWizardReview({
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
                message: 'Native expiring-soon days warning',
              },
            },
          ],
        }),
      )
      .mockResolvedValueOnce({
        ...terminalValidationReview(),
        decisions: [{ kind: 'receipt', confirm: true }],
      });
    show();
    await review();
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
      'Native expiring-soon days warning',
    ])
      expect(within(table).getByText(text)).toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Save reviewed validation' }),
    ).not.toBeInTheDocument();
    fireEvent.click(
      screen.getByRole('button', { name: 'Confirm receipt review' }),
    );
    await screen.findByRole('button', { name: 'Save reviewed validation' });
    expect(preview.mock.calls.at(-1)?.[0].decisions).toEqual([
      { kind: 'receipt', confirm: true },
    ]);
  });
  it('blocks SMS setup and never fabricates a terminal save or hides the native reason', async () => {
    preview.mockResolvedValue(
      validationWizardReview({
        ...validationStep(),
        kind: 'sms',
        transfers: [],
        blocked_reason: 'Company-wide notification approval required.',
      }),
    );
    show();
    await review();
    expect(
      screen.getByText('Company-wide notification approval required.'),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', {
        name: /Save reviewed|Review selected|Confirm receipt|Proceed with/,
      }),
    ).not.toBeInTheDocument();
    expect(save).not.toHaveBeenCalled();
  });
  it('commits the exact request before HTTP, blocks double click/close and requires a fresh receipt to finish', async () => {
    let done!: (result: ReturnType<typeof validationStatus>) => void;
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
      name: 'Save reviewed validation',
    });
    fireEvent.click(button);
    fireEvent.click(button);
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    expect(disk).toEqual(validationRequest());
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
    await act(async () => done(validationStatus()));
    await screen.findByText(
      'Stock valuation: No longer available or not readable by this account',
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Finish and reload transfers' }),
    );
    await waitFor(() => expect(close).toHaveBeenCalledTimes(1));
    expect(status).toHaveBeenCalledWith(validationRequest());
    expect(clear).toHaveBeenCalledWith(3, validationRequest());
    expect(invalidated).toHaveBeenCalledWith({
      queryKey: ['billing', 'order-deliveries', 3],
    });
    expect(disk).toBeNull();
  });
  it('retains an unknown result across remount and checks/retries only the identical request', async () => {
    save.mockRejectedValueOnce(new Error('Response lost'));
    status.mockResolvedValueOnce({
      ...validationStatus(),
      accepted: false,
      state_after: false,
      references: {},
    });
    const view = show();
    await review();
    fireEvent.click(
      screen.getByRole('button', { name: 'Save reviewed validation' }),
    );
    await screen.findByText('Response lost');
    expect(clear).not.toHaveBeenCalled();
    view.unmount();
    show();
    fireEvent.click(
      await screen.findByRole('button', { name: 'Check validation request' }),
    );
    await screen.findByText(/No receipt found yet/);
    expect(save).toHaveBeenCalledTimes(1);
    fireEvent.click(
      screen.getByRole('button', {
        name: /Retry identical validation request/,
      }),
    );
    await screen.findByRole('button', { name: 'Finish and reload transfers' });
    expect(save.mock.calls).toEqual([
      [validationRequest()],
      [validationRequest()],
    ]);
    expect(preview).toHaveBeenCalledTimes(1);
    expect(disk).toEqual(validationRequest());
  });
  it('does not send a write if durable storage fails or resolves after unmount', async () => {
    persist.mockRejectedValueOnce(new Error('Storage failed'));
    const view = show();
    await review();
    fireEvent.click(
      screen.getByRole('button', { name: 'Save reviewed validation' }),
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
      screen.getByRole('button', { name: 'Save reviewed validation' }),
    );
    await waitFor(() => expect(persist).toHaveBeenCalledTimes(2));
    next.unmount();
    await act(async () => commit());
    expect(save).not.toHaveBeenCalled();
    expect(disk).toEqual(validationRequest());
  });
  it('clears only a definitive native rejection and requires a new load/review', async () => {
    save.mockRejectedValueOnce(
      new BillingActionRejected('Native quantity changed'),
    );
    show();
    await review();
    fireEvent.click(
      screen.getByRole('button', { name: 'Save reviewed validation' }),
    );
    await screen.findByText('Native quantity changed');
    expect(disk).toBeNull();
    expect(
      screen.queryByRole('button', {
        name: /Retry identical validation request/,
      }),
    ).not.toBeInTheDocument();
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
  it('preserves the pending request on expiry and on a failed final receipt check', async () => {
    save.mockRejectedValueOnce(new BillingSessionExpired());
    const view = show();
    await review();
    fireEvent.click(
      screen.getByRole('button', { name: 'Save reviewed validation' }),
    );
    fireEvent.click(
      await screen.findByRole('button', { name: 'Reconnect Billing' }),
    );
    expect(reconnect).toHaveBeenCalledTimes(1);
    expect(disk).toEqual(validationRequest());
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
    status.mockResolvedValueOnce({
      ...validationStatus(),
      accepted: false,
      state_after: false,
      references: {},
    });
    fireEvent.click(
      screen.getByRole('button', { name: 'Finish and reload transfers' }),
    );
    await screen.findByText(/Accepted validation receipt unavailable/);
    expect(clear).not.toHaveBeenCalled();
    expect(disk).toEqual(validationRequest());
    clear.mockRejectedValueOnce(new Error('Recovery clear failed'));
    fireEvent.click(
      screen.getByRole('button', { name: 'Finish and reload transfers' }),
    );
    await screen.findByText('Recovery clear failed');
    expect(disk).toEqual(validationRequest());
    expect(close).not.toHaveBeenCalled();
  });
  it('resumes the original identities without automatically previewing or saving', async () => {
    disk = { ...validationRequest(), order_id: 10, transfer_id: 12 };
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
    expect(close).toHaveBeenCalledTimes(1);
    expect(clear).not.toHaveBeenCalled();
  });
  it('rejects another stock recovery before loading native data and honors native eligibility', async () => {
    load.mockRejectedValueOnce(new Error('Another stock request is pending.'));
    const view = show();
    await screen.findByText('Another stock request is pending.');
    expect(get).not.toHaveBeenCalled();
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
    expect(preview).not.toHaveBeenCalled();
  });
  it('does not display a late preview under another account and returns focus without clearing recovery', async () => {
    let done!: (result: StockValidationReview) => void;
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
    await act(async () => done(terminalValidationReview()));
    expect(
      screen.queryByRole('region', { name: 'Reviewed validation effects' }),
    ).not.toBeInTheDocument();
    view.unmount();
    expect(returnFocus).toHaveBeenCalled();
    expect(clear).not.toHaveBeenCalled();
  });
});
