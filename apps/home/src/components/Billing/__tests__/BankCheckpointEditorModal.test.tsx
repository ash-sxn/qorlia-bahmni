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
  BankCheckpointEditorModal,
  checkpointRecoveryKey,
} from '../BankCheckpointEditorModal';
import {
  BankCheckpointEditor,
  BankCheckpointPayload,
  BankCheckpointRequest,
  BankCheckpointReview,
  BankCheckpointSelection,
  BillingActionRejected,
  BillingSessionExpired,
  getBankCheckpointSaveStatus,
  loadBankCheckpointEditor,
  previewBankCheckpoint,
  saveBankCheckpoint,
} from '../billingService';
import { bankCheckpoint } from './bankFixture';

jest.mock('../billingService', () => ({
  ...jest.requireActual('../billingService'),
  loadBankCheckpointEditor: jest.fn(),
  previewBankCheckpoint: jest.fn(),
  saveBankCheckpoint: jest.fn(),
  getBankCheckpointSaveStatus: jest.fn(),
}));
const selection: BankCheckpointSelection = {
  checkpoint_id: 9,
  entry_ids: [],
  split_line_id: false,
};
const header = () => {
  const { id, ...row } = bankCheckpoint();
  expect(id).toBe(9);
  return row;
};
const payload = (): BankCheckpointPayload => ({
  ...selection,
  version: 'a'.repeat(64),
  values: {
    name: header().name,
    reference: header().reference,
    balance_start: 50,
    balance_end_real: 150,
  },
});
const loaded = (): BankCheckpointEditor => ({
  ...payload(),
  checkpoint: header(),
  selected_entry_ids: [7],
});
const reviewed = (): BankCheckpointReview => ({
  values: payload().values,
  checkpoint: header(),
  entry_ids: [7],
  affected: [
    { checkpoint: bankCheckpoint(), entry_ids: [7] },
    {
      checkpoint: {
        ...bankCheckpoint(),
        id: 10,
        name: 'Next checkpoint',
        is_complete: false,
        problem_description: 'Next opening balance needs review.',
      },
      entry_ids: [8],
    },
  ],
  financial: {},
  review_version: 'b'.repeat(64),
});
const request = (): BankCheckpointRequest => ({
  payload: payload(),
  review_version: 'b'.repeat(64),
  request_key: '11111111-2222-4333-8444-555555555555',
});
const close = jest.fn(),
  reconnect = jest.fn();
const show = (choice: BankCheckpointSelection | null = selection, uid = 3) => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const invalidate = jest.spyOn(client, 'invalidateQueries');
  return {
    ...render(
      <QueryClientProvider client={client}>
        <BankCheckpointEditorModal
          uid={uid}
          selection={choice}
          close={close}
          reconnect={reconnect}
        />
      </QueryClientProvider>,
    ),
    invalidate,
  };
};
const review = async () => {
  fireEvent.click(
    await screen.findByRole('button', {
      name: 'Review native checkpoint effects',
    }),
  );
  await screen.findByRole('region', { name: 'Reviewed checkpoint effects' });
};
const save = () =>
  fireEvent.click(
    screen.getByRole('button', { name: 'Save reviewed checkpoint' }),
  );

describe('Reviewed native checkpoint editor', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    sessionStorage.clear();
    jest.mocked(loadBankCheckpointEditor).mockResolvedValue(loaded());
    jest.mocked(previewBankCheckpoint).mockResolvedValue(reviewed());
    jest
      .mocked(saveBankCheckpoint)
      .mockResolvedValue({ accepted: true, checkpoint: bankCheckpoint() });
    jest
      .mocked(getBankCheckpointSaveStatus)
      .mockResolvedValue({ accepted: false, checkpoint: false });
    jest
      .spyOn(crypto, 'randomUUID')
      .mockReturnValue(
        request()
          .request_key as `${string}-${string}-${string}-${string}-${string}`,
      );
  });
  afterEach(() => jest.restoreAllMocks());
  it('loads exact native defaults, reviews all affected checkpoints and never writes on load', async () => {
    show();
    expect(await screen.findByLabelText('Opening balance')).toHaveValue('50');
    expect(loadBankCheckpointEditor).toHaveBeenCalledWith(selection);
    expect(previewBankCheckpoint).not.toHaveBeenCalled();
    expect(saveBankCheckpoint).not.toHaveBeenCalled();
    expect(
      screen.getByRole('button', { name: 'Save reviewed checkpoint' }),
    ).toBeDisabled();
    await review();
    expect(previewBankCheckpoint).toHaveBeenCalledWith(payload());
    const table = screen.getByRole('table', {
      name: 'Complete native checkpoint review',
    });
    expect(
      within(table).getByRole('cell', { name: /Next checkpoint/ }),
    ).toBeInTheDocument();
    expect(
      within(table).getByText('Next opening balance needs review.'),
    ).toBeInTheDocument();
    expect(
      within(table).getByText('Previous ending balance does not match.'),
    ).toBeInTheDocument();
    expect(
      screen.queryByLabelText('Computed ending balance'),
    ).not.toBeInTheDocument();
  });
  it('invalidates a review after edits, rejects blank/nonfinite balances and accepts negative or zero values', async () => {
    show();
    await review();
    fireEvent.change(screen.getByLabelText('Recorded ending balance'), {
      target: { value: '' },
    });
    expect(
      screen.queryByRole('region', { name: 'Reviewed checkpoint effects' }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Save reviewed checkpoint' }),
    ).toBeDisabled();
    fireEvent.click(
      screen.getByRole('button', { name: 'Review native checkpoint effects' }),
    );
    await screen.findByText(/Blank balances are not zero/);
    expect(previewBankCheckpoint).toHaveBeenCalledTimes(1);
    fireEvent.change(screen.getByLabelText('Recorded ending balance'), {
      target: { value: 'Infinity' },
    });
    fireEvent.click(
      screen.getByRole('button', { name: 'Review native checkpoint effects' }),
    );
    await screen.findByText(/Blank balances are not zero/);
    expect(previewBankCheckpoint).toHaveBeenCalledTimes(1);
    fireEvent.change(screen.getByLabelText('Opening balance'), {
      target: { value: '-25' },
    });
    fireEvent.change(screen.getByLabelText('Recorded ending balance'), {
      target: { value: '0' },
    });
    fireEvent.change(screen.getByLabelText('External reference'), {
      target: { value: '' },
    });
    await review();
    expect(previewBankCheckpoint).toHaveBeenLastCalledWith({
      ...payload(),
      values: {
        ...payload().values,
        reference: false,
        balance_start: -25,
        balance_end_real: 0,
      },
    });
  });
  it('persists before saving, accepts current native fields and invalidates statement reads only', async () => {
    jest.mocked(saveBankCheckpoint).mockImplementation(async (exact) => {
      expect(
        JSON.parse(sessionStorage.getItem(checkpointRecoveryKey(3))!),
      ).toEqual(exact);
      return {
        accepted: true,
        checkpoint: { ...bankCheckpoint(), reference: 'Later native edit' },
      };
    });
    const { invalidate } = show();
    await review();
    save();
    const accepted = await screen.findByRole('region', {
      name: 'Accepted native checkpoint',
    });
    expect(within(accepted).getByText(/Later native edit/)).toBeInTheDocument();
    expect(saveBankCheckpoint).toHaveBeenCalledWith(request());
    expect(sessionStorage.getItem(checkpointRecoveryKey(3))).toBeNull();
    expect(invalidate).toHaveBeenCalledTimes(1);
    const predicate = invalidate.mock.calls[0][0]!.predicate!;
    expect(
      predicate({ queryKey: ['billing', 'checkpoint-history', 3] } as never),
    ).toBe(true);
    expect(
      predicate({ queryKey: ['billing', 'bank-history', 4] } as never),
    ).toBe(false);
    expect(
      predicate({ queryKey: ['billing', 'checkpoint-editor', 3] } as never),
    ).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'Back to statements' }));
    expect(close).toHaveBeenCalledTimes(1);
  });
  it('keeps a timed-out save locked and recovers it after remount without loading a different source', async () => {
    jest
      .mocked(saveBankCheckpoint)
      .mockRejectedValueOnce(new Error('Connection lost'));
    const first = show();
    await review();
    save();
    await screen.findByRole('region', { name: 'Pending checkpoint request' });
    expect(screen.getByLabelText('Statement name')).toBeDisabled();
    expect(
      screen.getByRole('button', { name: 'Back to statements' }),
    ).toBeDisabled();
    const exact = JSON.parse(sessionStorage.getItem(checkpointRecoveryKey(3))!);
    first.unmount();
    show({ checkpoint_id: 20, entry_ids: [], split_line_id: false });
    expect(
      await screen.findByRole('region', { name: 'Pending checkpoint request' }),
    ).toBeInTheDocument();
    expect(loadBankCheckpointEditor).toHaveBeenCalledTimes(1);
    fireEvent.click(
      screen.getByRole('button', { name: 'Check checkpoint save status' }),
    );
    await screen.findByText(/No receipt was found yet/);
    expect(getBankCheckpointSaveStatus).toHaveBeenCalledWith(exact);
    expect(sessionStorage.getItem(checkpointRecoveryKey(3))).not.toBeNull();
    fireEvent.click(
      screen.getByRole('button', { name: 'Retry exact checkpoint request' }),
    );
    await screen.findByRole('region', { name: 'Accepted native checkpoint' });
    expect(saveBankCheckpoint).toHaveBeenLastCalledWith(exact);
    expect(crypto.randomUUID).toHaveBeenCalledTimes(1);
  });
  it('restores an accepted receipt without resubmitting a save or requiring the original source version', async () => {
    sessionStorage.setItem(checkpointRecoveryKey(3), JSON.stringify(request()));
    jest.mocked(getBankCheckpointSaveStatus).mockResolvedValue({
      accepted: true,
      checkpoint: {
        ...bankCheckpoint(),
        reference: 'Changed after original save',
      },
    });
    show(null);
    fireEvent.click(
      await screen.findByRole('button', {
        name: 'Check checkpoint save status',
      }),
    );
    await screen.findByText(/Changed after original save/);
    expect(loadBankCheckpointEditor).not.toHaveBeenCalled();
    expect(saveBankCheckpoint).not.toHaveBeenCalled();
    expect(sessionStorage.getItem(checkpointRecoveryKey(3))).toBeNull();
  });
  it('clears only a confirmed native rejection and requires another review', async () => {
    jest
      .mocked(saveBankCheckpoint)
      .mockRejectedValue(
        new BillingActionRejected('Statement changed. Reload.'),
      );
    show();
    await review();
    save();
    await screen.findByText('Statement changed. Reload.');
    expect(sessionStorage.getItem(checkpointRecoveryKey(3))).toBeNull();
    expect(
      screen.queryByRole('region', { name: 'Pending checkpoint request' }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Save reviewed checkpoint' }),
    ).toBeDisabled();
    fireEvent.click(
      screen.getByRole('button', { name: 'Reload checkpoint source' }),
    );
    fireEvent.click(screen.getByRole('button', { name: /Discard edits/ }));
    await waitFor(() =>
      expect(loadBankCheckpointEditor).toHaveBeenCalledTimes(2),
    );
  });
  it('fails closed on corrupt storage without discarding it or loading a new source', async () => {
    sessionStorage.setItem(checkpointRecoveryKey(3), '{bad');
    show();
    await screen.findByText(/recovery storage is unavailable or invalid/);
    expect(loadBankCheckpointEditor).not.toHaveBeenCalled();
    expect(
      screen.getByRole('button', { name: 'Back to statements' }),
    ).toBeDisabled();
    expect(
      screen.queryByRole('button', { name: 'Save reviewed checkpoint' }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Reconnect Billing' }));
    expect(reconnect).toHaveBeenCalledTimes(1);
    expect(sessionStorage.getItem(checkpointRecoveryKey(3))).toBe('{bad');
  });
  it('does not send a write when recovery storage cannot persist the exact request', async () => {
    show();
    await review();
    jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('Storage full');
    });
    save();
    await screen.findByText('Storage full');
    expect(saveBankCheckpoint).not.toHaveBeenCalled();
  });
  it('keeps an accepted request locked if clearing storage fails and allows status recovery afterward', async () => {
    show();
    await review();
    jest.spyOn(Storage.prototype, 'removeItem').mockImplementationOnce(() => {
      throw new Error('Storage unavailable');
    });
    save();
    await screen.findByText(
      /save was accepted, but recovery storage could not be cleared/,
    );
    expect(
      screen.getByRole('button', { name: 'Retry exact checkpoint request' }),
    ).toBeDisabled();
    expect(
      screen.getByRole('button', { name: 'Back to statements' }),
    ).toBeDisabled();
    jest
      .mocked(getBankCheckpointSaveStatus)
      .mockResolvedValue({ accepted: true, checkpoint: bankCheckpoint() });
    fireEvent.click(
      screen.getByRole('button', { name: 'Check checkpoint save status' }),
    );
    await waitFor(() =>
      expect(sessionStorage.getItem(checkpointRecoveryKey(3))).toBeNull(),
    );
    expect(
      screen.getByRole('button', { name: 'Back to statements' }),
    ).not.toBeDisabled();
    expect(saveBankCheckpoint).toHaveBeenCalledTimes(1);
  });
  it('guards unsaved edits and browser navigation but does not silently discard them', async () => {
    show();
    await screen.findByLabelText('Statement name');
    fireEvent.change(screen.getByLabelText('Statement name'), {
      target: { value: 'Changed' },
    });
    const event = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Back to statements' }));
    expect(close).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Keep editing' }));
    expect(screen.getByLabelText('Statement name')).toHaveValue('Changed');
    fireEvent.click(screen.getByRole('button', { name: 'Back to statements' }));
    fireEvent.click(screen.getByRole('button', { name: /Discard edits/ }));
    expect(close).toHaveBeenCalledTimes(1);
  });
  it('prevents duplicate preview/save actions while a response is still pending', async () => {
    let resolvePreview!: (result: BankCheckpointReview) => void;
    jest.mocked(previewBankCheckpoint).mockReturnValue(
      new Promise((resolve) => {
        resolvePreview = resolve;
      }),
    );
    show();
    const button = await screen.findByRole('button', {
      name: 'Review native checkpoint effects',
    });
    fireEvent.click(button);
    fireEvent.click(button);
    expect(previewBankCheckpoint).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText('External reference')).toBeDisabled();
    await act(async () => resolvePreview(reviewed()));
    let resolveSave!: (
      result: Awaited<ReturnType<typeof saveBankCheckpoint>>,
    ) => void;
    jest.mocked(saveBankCheckpoint).mockReturnValue(
      new Promise((resolve) => {
        resolveSave = resolve;
      }),
    );
    save();
    expect(saveBankCheckpoint).toHaveBeenCalledTimes(1);
    fireEvent.click(
      screen.getByRole('button', { name: 'Retry exact checkpoint request' }),
    );
    expect(saveBankCheckpoint).toHaveBeenCalledTimes(1);
    await act(async () =>
      resolveSave({ accepted: true, checkpoint: bankCheckpoint() }),
    );
  });
  it('shows a native split that selects more than its anchor and the complete unchanged ledger', async () => {
    const split: BankCheckpointSelection = {
      checkpoint_id: false,
      entry_ids: [8],
      split_line_id: 8,
    };
    jest
      .mocked(loadBankCheckpointEditor)
      .mockResolvedValue({ ...loaded(), ...split, selected_entry_ids: [7, 8] });
    jest.mocked(previewBankCheckpoint).mockResolvedValue({
      ...reviewed(),
      entry_ids: [7, 8],
      affected: [
        { checkpoint: { ...bankCheckpoint(), id: 'new' }, entry_ids: [7, 8] },
        {
          checkpoint: {
            ...bankCheckpoint(),
            name: 'Old checkpoint now empty',
            currency_id: false,
          },
          entry_ids: [],
        },
      ],
      financial: {
        'account.bank.statement.line': {
          rows: [{ id: 8, values: { amount: 123.4567, currency_id: 1 } }],
          removed_ids: [],
        },
      },
    });
    show(split);
    await screen.findByText('Native selected transactions: 7, 8.');
    await review();
    expect(previewBankCheckpoint).toHaveBeenCalledWith({
      ...payload(),
      ...split,
    });
    expect(
      screen.getByRole('cell', { name: /Old checkpoint now empty/ }),
    ).toBeInTheDocument();
    expect(screen.getAllByText('No journal currency')).toHaveLength(3);
    const ledger = screen.getByRole('region', {
      name: 'Unchanged checkpoint accounting',
    });
    expect(within(ledger).getByText('123.4567')).toBeInTheDocument();
    expect(
      within(ledger).getByText(/Only statement grouping changes/),
    ).toBeInTheDocument();
  });
  it('preserves pending saves through session expiry and offers reconnect', async () => {
    jest
      .mocked(saveBankCheckpoint)
      .mockRejectedValue(new BillingSessionExpired('Billing sign-in expired'));
    show();
    await review();
    save();
    await screen.findByText('Billing sign-in expired');
    fireEvent.click(screen.getByRole('button', { name: 'Reconnect Billing' }));
    expect(reconnect).toHaveBeenCalledTimes(1);
    expect(
      JSON.parse(sessionStorage.getItem(checkpointRecoveryKey(3))!),
    ).toEqual(request());
  });
  it('hides the editor after denied/expired load and permits explicit reload only', async () => {
    jest
      .mocked(loadBankCheckpointEditor)
      .mockRejectedValue(new BillingSessionExpired('No checkpoint access'));
    show();
    await screen.findByText('No checkpoint access');
    expect(screen.queryByLabelText('Opening balance')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Reconnect Billing' }));
    expect(reconnect).toHaveBeenCalledTimes(1);
    expect(previewBankCheckpoint).not.toHaveBeenCalled();
    expect(saveBankCheckpoint).not.toHaveBeenCalled();
  });
  it('isolates recovery by user and never loads a source for an empty resume action', async () => {
    sessionStorage.setItem(checkpointRecoveryKey(4), JSON.stringify(request()));
    show(null, 3);
    await screen.findByText(/No pending checkpoint request was found/);
    expect(loadBankCheckpointEditor).not.toHaveBeenCalled();
    expect(getBankCheckpointSaveStatus).not.toHaveBeenCalled();
    expect(sessionStorage.getItem(checkpointRecoveryKey(4))).not.toBeNull();
  });
});
