import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { BankMatchingModal } from '../BankMatchingModal';
import {
  BankGraph,
  BankMatchPayload,
  BankMatchRequest,
  BankMatchView,
  BillingActionRejected,
  BillingSessionExpired,
  getBankAnalyticChoices,
  getBankCandidates,
  getBankDetail,
  getBankFeeChoices,
  getBankMatch,
  getBankMatchAnalytics,
  getBankMatchStatus,
  previewBankMatch,
  saveBankMatch,
} from '../billingService';
import { bankCandidates, bankDetail, bankEntry } from './bankFixture';

jest.mock('../billingService', () => ({
  ...jest.requireActual('../billingService'),
  getBankMatch: jest.fn(),
  getBankDetail: jest.fn(),
  getBankCandidates: jest.fn(),
  getBankFeeChoices: jest.fn(),
  getBankMatchAnalytics: jest.fn(),
  getBankAnalyticChoices: jest.fn(),
  previewBankMatch: jest.fn(),
  saveBankMatch: jest.fn(),
  getBankMatchStatus: jest.fn(),
}));
const storage = 'qorlia.billing.bank-match.pending:3:7';
const close = jest.fn(),
  saved = jest.fn(),
  reconnect = jest.fn();
const graph = (): BankGraph => ({
  'account.bank.statement.line': {
    rows: [
      {
        id: 7,
        values: {
          amount: 100,
          amount_residual: -100,
          currency_id: 1,
          move_id: 17,
        },
      },
    ],
    removed_ids: [],
  },
  'account.move': {
    rows: [
      {
        id: 17,
        values: { state: 'posted', currency_id: 1, line_ids: [71, 72] },
      },
    ],
    removed_ids: [],
  },
  'account.move.line': {
    rows: [
      {
        id: 71,
        values: { account_id: 41, debit: 100, credit: 0, currency_id: 1 },
      },
      {
        id: 72,
        values: { account_id: 42, debit: 0, credit: 100, currency_id: 1 },
      },
    ],
    removed_ids: [],
  },
  'account.partial.reconcile': { rows: [], removed_ids: [] },
  'account.full.reconcile': { rows: [], removed_ids: [] },
  'account.payment': { rows: [], removed_ids: [] },
  'account.analytic.line': { rows: [], removed_ids: [] },
});
const view = (): BankMatchView => ({
  statement_line_id: 7,
  entry: bankEntry(),
  version: 'b'.repeat(64),
  graph: graph(),
  labels: {
    'account.move:17': 'BNK/2026/7',
    'account.account:41': 'Bank INR',
    'account.account:42': 'Suspense INR',
    'res.currency:1': 'INR',
    'res.currency:2': 'USD',
  },
  company_currency: [1, 'INR'],
  transaction_currency: [1, 'INR'],
  reason: false,
  can_match: true,
  can_undo: false,
});
const payload = (): BankMatchPayload => ({
  statement_line_id: 7,
  version: 'b'.repeat(64),
  action: 'match',
  allocations: [{ line_id: 81, amount: 2 }],
  fee_model_id: false,
});
const request = (): BankMatchRequest => ({
  payload: payload(),
  review_version: 'c'.repeat(64),
  request_key: '11111111-2222-4333-8444-555555555555',
});
const reviewResult = () => {
  const before = graph();
  before['account.move.line'].rows.push({
    id: 81,
    values: {
      move_id: 18,
      account_id: 43,
      currency_id: 2,
      amount_residual: 100,
      amount_residual_currency: 2,
      analytic_distribution: { '11': 100 },
    },
  });
  before['account.payment'].rows.push({
    id: 52,
    values: { amount: 2, currency_id: 2, move_id: 18 },
  });
  const after = JSON.parse(JSON.stringify(before)) as BankGraph;
  after['account.move'].rows.push({
    id: 'new:1',
    values: {
      state: 'posted',
      currency_id: 1,
      reversed_entry_id: 17,
      tax_cash_basis_origin_move_id: 18,
    },
  });
  after['account.move.line'].rows.push({
    id: 'new:2',
    values: {
      currency_id: 2,
      amount_currency: 0.123456,
      analytic_distribution: { '11': 100 },
    },
  });
  after['account.partial.reconcile'].rows.push({
    id: 'new:3',
    values: {
      debit_move_id: 81,
      credit_move_id: 'new:2',
      amount: 100,
      debit_amount_currency: 2,
      credit_amount_currency: 100,
      exchange_move_id: 'new:1',
    },
  });
  after['account.full.reconcile'].rows.push({
    id: 'new:4',
    values: {
      name: false,
      partial_reconcile_ids: ['new:3'],
      reconciled_line_ids: [81, 'new:2'],
    },
  });
  after['account.analytic.line'].rows.push({
    id: 'new:5',
    values: { account_id: 11, move_line_id: 'new:2', amount: 100 },
  });
  after['account.payment'] = { rows: [], removed_ids: [52] };
  return {
    statement_line_id: 7,
    review_version: 'c'.repeat(64),
    before,
    after,
    labels: {
      ...view().labels,
      'account.payment:52': 'Generated synthetic payment',
      'account.analytic.account:11': 'Departments OPD',
    },
  };
};
const show = () =>
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <BankMatchingModal
        uid={3}
        entryId={7}
        close={close}
        saved={saved}
        reconnect={reconnect}
      />
    </QueryClientProvider>,
  );
const select = async () =>
  fireEvent.click(
    await screen.findByRole('button', { name: 'Select item 81' }),
  );
const review = async () => {
  await select();
  fireEvent.click(
    screen.getByRole('button', { name: 'Review native matching' }),
  );
  await screen.findByRole('region', {
    name: 'Reviewed bank accounting effects',
  });
};
describe('Reviewed bank matching workspace', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    sessionStorage.clear();
    jest.mocked(getBankMatch).mockResolvedValue(view());
    jest.mocked(getBankDetail).mockResolvedValue(bankDetail());
    jest.mocked(getBankCandidates).mockResolvedValue(bankCandidates());
    jest
      .mocked(getBankFeeChoices)
      .mockResolvedValue({ rows: [], offset: 0, has_more: false });
    jest.mocked(getBankMatchAnalytics).mockResolvedValue({
      statement_line_id: 7,
      source_line_id: 81,
      account_id: 43,
      plans: [],
      accounts: [],
    });
    jest
      .mocked(getBankAnalyticChoices)
      .mockResolvedValue({ rows: [], offset: 0, has_more: false });
    jest.mocked(previewBankMatch).mockResolvedValue(reviewResult());
    jest.mocked(saveBankMatch).mockResolvedValue({
      ...view(),
      accepted: true,
      request_key: request().request_key,
    });
    jest.mocked(getBankMatchStatus).mockResolvedValue(false);
  });
  afterEach(() => jest.restoreAllMocks());
  it('rejects mismatched initial statement snapshots and requires an explicit reload', async () => {
    jest.mocked(getBankDetail).mockResolvedValueOnce({
      ...bankDetail(),
      entry: { ...bankEntry(), amount: 101 },
    });
    show();
    await screen.findByText(/Statement entry changed while loading/);
    expect(getBankCandidates).not.toHaveBeenCalled();
    expect(previewBankMatch).not.toHaveBeenCalled();
    expect(saveBankMatch).not.toHaveBeenCalled();
    fireEvent.click(
      screen.getByRole('button', { name: 'Reload bank matching' }),
    );
    await screen.findByRole('button', { name: 'Select item 81' });
    expect(getBankDetail).toHaveBeenCalledTimes(2);
    expect(getBankMatch).toHaveBeenCalledTimes(2);
  });
  it('uses the matching version, source-currency allocation and every native effect group before save', async () => {
    show();
    expect(saveBankMatch).not.toHaveBeenCalled();
    await review();
    expect(getBankCandidates).toHaveBeenCalledWith(7, 'a'.repeat(64), '', 0);
    expect(previewBankMatch).toHaveBeenCalledWith(payload());
    const effects = screen.getByRole('region', {
      name: 'Reviewed bank accounting effects',
    });
    expect(within(effects).getAllByRole('heading', { level: 4 })).toHaveLength(
      7,
    );
    expect(
      within(effects).getByText('Deleted: Generated synthetic payment'),
    ).toBeInTheDocument();
    expect(within(effects).getByText('0.123456')).toBeInTheDocument();
    expect(
      within(effects).getAllByText('Departments OPD: 100%'),
    ).not.toHaveLength(0);
    expect(within(effects).getByText('exchange move id')).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole('button', { name: 'Save reviewed matching' }),
    );
    await waitFor(() => expect(saved).toHaveBeenCalledTimes(1));
    expect(saveBankMatch).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: payload(),
        review_version: 'c'.repeat(64),
        request_key: expect.any(String),
      }),
    );
    expect(sessionStorage.getItem(storage)).toBeNull();
    await screen.findByRole('region', {
      name: 'Native accounting at acceptance check',
    });
    expect(
      screen.queryByRole('button', { name: 'Save reviewed matching' }),
    ).not.toBeInTheDocument();
  });
  it('keeps selections across paging/search and invalidates the review on an amount edit', async () => {
    jest
      .mocked(getBankCandidates)
      .mockResolvedValue({ ...bankCandidates(), has_more: true });
    show();
    await review();
    fireEvent.change(screen.getByLabelText('Item 81 allocation (USD)'), {
      target: { value: '1' },
    });
    expect(
      screen.queryByRole('region', {
        name: 'Reviewed bank accounting effects',
      }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Save reviewed matching' }),
    ).toBeDisabled();
    fireEvent.click(
      screen.getByRole('button', { name: 'More matching items' }),
    );
    await waitFor(() =>
      expect(getBankCandidates).toHaveBeenLastCalledWith(
        7,
        'a'.repeat(64),
        '',
        25,
      ),
    );
    fireEvent.change(
      screen.getByLabelText('Find source document, partner or label'),
      { target: { value: 'Another document' } },
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Find matching items' }),
    );
    await waitFor(() =>
      expect(getBankCandidates).toHaveBeenLastCalledWith(
        7,
        'a'.repeat(64),
        'Another document',
        0,
      ),
    );
    expect(screen.getByLabelText('Item 81 allocation (USD)')).toHaveValue(1);
    fireEvent.click(
      screen.getByRole('button', { name: 'Review native matching' }),
    );
    await waitFor(() =>
      expect(previewBankMatch).toHaveBeenLastCalledWith({
        ...payload(),
        allocations: [{ line_id: 81, amount: 1 }],
      }),
    );
  });
  it('uses the actual named analytic editor and binds selected percentages to the matching payload', async () => {
    jest
      .mocked(getBankMatchAnalytics)
      .mockImplementation(async (_entry, _source, ids) => ({
        statement_line_id: 7,
        source_line_id: 81,
        account_id: 43,
        plans: [{ id: 20, name: 'Departments', applicability: 'mandatory' }],
        accounts: ids.map((id) => ({ id, name: 'OPD', plan_id: 20 })),
      }));
    jest
      .mocked(getBankAnalyticChoices)
      .mockResolvedValue({ rows: [[11, 'OPD']], offset: 0, has_more: false });
    show();
    await select();
    fireEvent.click(
      await screen.findByRole('combobox', {
        name: 'Add account to Departments',
      }),
    );
    fireEvent.click(await screen.findByRole('option', { name: 'OPD' }));
    await screen.findByLabelText('OPD allocation (%)');
    fireEvent.click(
      screen.getByRole('button', { name: 'Review native matching' }),
    );
    await waitFor(() =>
      expect(previewBankMatch).toHaveBeenCalledWith({
        ...payload(),
        allocations: [
          { line_id: 81, amount: 2, analytic_distribution: { '11': 100 } },
        ],
      }),
    );
    expect(getBankMatchAnalytics).toHaveBeenCalledWith(7, 81, [11]);
  });
  it('supports fee-only native matching and removes a selected rule without forgetting it on another search', async () => {
    jest.mocked(getBankFeeChoices).mockResolvedValue({
      rows: [{ id: 9, name: 'Bank charge', rule_type: 'writeoff_button' }],
      offset: 0,
      has_more: true,
    });
    show();
    fireEvent.click(
      await screen.findByRole('button', { name: 'Use fee rule Bank charge' }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'More fee rules' }));
    await waitFor(() =>
      expect(getBankFeeChoices).toHaveBeenLastCalledWith(7, '', 25),
    );
    fireEvent.change(screen.getByLabelText('Find an applicable fee rule'), {
      target: { value: 'Charge' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Find fee rules' }));
    await waitFor(() =>
      expect(getBankFeeChoices).toHaveBeenLastCalledWith(7, 'Charge', 0),
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Review native matching' }),
    );
    await waitFor(() =>
      expect(previewBankMatch).toHaveBeenCalledWith({
        ...payload(),
        allocations: [],
        fee_model_id: 9,
      }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Remove fee rule' }));
    expect(
      screen.getByRole('button', { name: 'Save reviewed matching' }),
    ).toBeDisabled();
    expect(
      screen.getByRole('button', { name: 'Review native matching' }),
    ).toBeDisabled();
  });
  it('requires a separate review for undo, with no mixed new sources or fee rule', async () => {
    jest.mocked(getBankMatch).mockResolvedValue({ ...view(), can_undo: true });
    show();
    await review();
    fireEvent.click(
      screen.getByRole('button', { name: 'Undo all entry matching' }),
    );
    expect(
      screen.getByRole('button', { name: /Save reviewed undo$/ }),
    ).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Review native undo' }));
    await waitFor(() =>
      expect(previewBankMatch).toHaveBeenLastCalledWith({
        ...payload(),
        action: 'undo',
        allocations: [],
        fee_model_id: false,
      }),
    );
    await screen.findByRole('region', {
      name: 'Reviewed bank accounting effects',
    });
    fireEvent.click(
      screen.getByRole('button', { name: /Save reviewed undo$/ }),
    );
    await waitFor(() =>
      expect(saveBankMatch).toHaveBeenCalledWith(
        expect.objectContaining({
          payload: {
            ...payload(),
            action: 'undo',
            allocations: [],
            fee_model_id: false,
          },
        }),
      ),
    );
  });
  it('retains input on native preview rejection and confirms before discarding', async () => {
    jest
      .mocked(previewBankMatch)
      .mockRejectedValue(
        new BillingActionRejected('Mandatory analytic allocation is missing'),
      );
    show();
    await select();
    fireEvent.click(
      screen.getByRole('button', { name: 'Review native matching' }),
    );
    await screen.findByText('Mandatory analytic allocation is missing');
    expect(screen.getByLabelText('Item 81 allocation (USD)')).toHaveValue(2);
    expect(saveBankMatch).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Back to statements' }));
    await screen.findByText('Discard unsaved bank selections?');
    expect(close).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Keep editing' }));
    fireEvent.click(
      screen.getByRole('button', { name: 'Remove matching item 81' }),
    );
    expect(
      screen.queryByLabelText('Item 81 allocation (USD)'),
    ).not.toBeInTheDocument();
  });
  it('persists before sending and locks edits after a lost response until exact receipt recovery', async () => {
    jest.mocked(saveBankMatch).mockImplementation(async (sent) => {
      expect(JSON.parse(sessionStorage.getItem(storage)!)).toEqual(sent);
      throw new Error('Response lost');
    });
    show();
    await review();
    fireEvent.click(
      screen.getByRole('button', { name: 'Save reviewed matching' }),
    );
    await screen.findByText('Response lost');
    const sent = jest.mocked(saveBankMatch).mock.calls[0][0];
    expect(
      screen.getByRole('button', { name: 'Back to statements' }),
    ).toBeDisabled();
    expect(
      screen.queryByRole('button', { name: 'Review native undo' }),
    ).not.toBeInTheDocument();
    fireEvent.click(
      screen.getByRole('button', { name: 'Check bank save status' }),
    );
    await screen.findByText(/No receipt was found yet/);
    expect(getBankMatchStatus).toHaveBeenCalledWith(sent);
    expect(saveBankMatch).toHaveBeenCalledTimes(1);
    jest.mocked(getBankMatchStatus).mockResolvedValue({
      ...view(),
      accepted: true,
      request_key: sent.request_key,
    });
    fireEvent.click(
      screen.getByRole('button', { name: 'Check bank save status' }),
    );
    await waitFor(() => expect(saved).toHaveBeenCalledTimes(1));
    expect(sessionStorage.getItem(storage)).toBeNull();
  });
  it('retries only the exact persisted request, even if current matching is no longer available', async () => {
    sessionStorage.setItem(storage, JSON.stringify(request()));
    jest.mocked(getBankMatch).mockResolvedValue({
      ...view(),
      can_match: false,
      can_undo: true,
      version: 'd'.repeat(64),
    });
    show();
    const retry = await screen.findByRole('button', {
      name: 'Retry exact bank request',
    });
    expect(previewBankMatch).not.toHaveBeenCalled();
    expect(getBankCandidates).not.toHaveBeenCalled();
    fireEvent.click(retry);
    await waitFor(() => expect(saveBankMatch).toHaveBeenCalledWith(request()));
    expect(saved).toHaveBeenCalledTimes(1);
  });
  it('labels accepted recovery as current native state, not proof that an earlier match still exists', async () => {
    sessionStorage.setItem(storage, JSON.stringify(request()));
    jest.mocked(getBankMatchStatus).mockResolvedValue({
      ...view(),
      accepted: true,
      request_key: request().request_key,
      can_match: true,
      can_undo: false,
    });
    show();
    fireEvent.click(
      await screen.findByRole('button', { name: 'Check bank save status' }),
    );
    await screen.findByRole('region', {
      name: 'Native accounting at acceptance check',
    });
    expect(
      screen.getByText(
        /native state at this response, which may include later changes/,
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Match statement entry' }),
    ).not.toBeInTheDocument();
    expect(saveBankMatch).not.toHaveBeenCalled();
    expect(sessionStorage.getItem(storage)).toBeNull();
  });
  it('rejects corrupted and wrong-entry recovery storage without sending or discarding it', async () => {
    sessionStorage.setItem(
      storage,
      JSON.stringify({
        ...request(),
        payload: { ...payload(), statement_line_id: 99 },
      }),
    );
    show();
    await screen.findByText(/Bank recovery storage is unavailable or invalid/);
    expect(
      screen.getByRole('button', { name: 'Back to statements' }),
    ).toBeDisabled();
    expect(getBankCandidates).not.toHaveBeenCalled();
    expect(saveBankMatch).not.toHaveBeenCalled();
    expect(sessionStorage.getItem(storage)).not.toBeNull();
  });
  it('never sends a save if writing the recovery request fails', async () => {
    show();
    await review();
    jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('Storage quota exceeded');
    });
    fireEvent.click(
      screen.getByRole('button', { name: 'Save reviewed matching' }),
    );
    await screen.findByText('Storage quota exceeded');
    expect(saveBankMatch).not.toHaveBeenCalled();
    expect(saved).not.toHaveBeenCalled();
    expect(
      screen.queryByRole('region', { name: 'Pending bank request' }),
    ).not.toBeInTheDocument();
  });
  it('keeps an accepted request locked when clearing storage fails and allows receipt checking, not replay', async () => {
    show();
    await review();
    const clear = jest
      .spyOn(Storage.prototype, 'removeItem')
      .mockImplementation(() => {
        throw new Error('Storage clear failed');
      });
    fireEvent.click(
      screen.getByRole('button', { name: 'Save reviewed matching' }),
    );
    await screen.findByText('Storage clear failed');
    expect(saved).not.toHaveBeenCalled();
    expect(
      screen.getByRole('button', { name: 'Retry exact bank request' }),
    ).toBeDisabled();
    expect(
      screen.getByRole('button', { name: 'Back to statements' }),
    ).toBeDisabled();
    clear.mockRestore();
    const sent = jest.mocked(saveBankMatch).mock.calls[0][0];
    jest.mocked(getBankMatchStatus).mockResolvedValue({
      ...view(),
      accepted: true,
      request_key: sent.request_key,
    });
    fireEvent.click(
      screen.getByRole('button', { name: 'Check bank save status' }),
    );
    await waitFor(() => expect(saved).toHaveBeenCalledTimes(1));
    expect(saveBankMatch).toHaveBeenCalledTimes(1);
  });
  it('clears only a confirmed native rejection and retains source values for another review', async () => {
    jest
      .mocked(saveBankMatch)
      .mockRejectedValue(
        new BillingActionRejected('Reviewed bank entry changed'),
      );
    show();
    await review();
    fireEvent.click(
      screen.getByRole('button', { name: 'Save reviewed matching' }),
    );
    await screen.findByText('Reviewed bank entry changed');
    expect(sessionStorage.getItem(storage)).toBeNull();
    expect(screen.getByLabelText('Item 81 allocation (USD)')).toHaveValue(2);
    expect(
      screen.getByRole('button', { name: 'Save reviewed matching' }),
    ).toBeDisabled();
  });
  it('blocks rapid duplicate saves while the first native request is running', async () => {
    let resolve!: (result: BankMatchView) => void;
    jest.mocked(saveBankMatch).mockReturnValue(
      new Promise((done) => {
        resolve = done;
      }),
    );
    show();
    await review();
    const button = screen.getByRole('button', {
      name: 'Save reviewed matching',
    });
    fireEvent.click(button);
    fireEvent.click(button);
    await screen.findByRole('button', { name: 'Check bank save status' });
    expect(saveBankMatch).toHaveBeenCalledTimes(1);
    expect(
      screen.getByRole('button', { name: 'Check bank save status' }),
    ).toBeDisabled();
    await act(async () =>
      resolve({
        ...view(),
        accepted: true,
        request_key: request().request_key,
      }),
    );
    expect(saved).toHaveBeenCalledTimes(1);
  });
  it('respects native read-only access and supports explicit reconnection without automatic writes', async () => {
    jest.mocked(getBankMatch).mockResolvedValue({
      ...view(),
      can_match: false,
      can_undo: false,
      reason: 'Native accounting permissions required',
    });
    show();
    await screen.findByText('Native accounting permissions required');
    expect(
      screen.getByRole('button', { name: 'Match statement entry' }),
    ).toBeDisabled();
    expect(getBankFeeChoices).not.toHaveBeenCalled();
    expect(getBankCandidates).not.toHaveBeenCalled();
    expect(saveBankMatch).not.toHaveBeenCalled();
  });
  it('keeps an expired pending request intact through reconnection', async () => {
    sessionStorage.setItem(storage, JSON.stringify(request()));
    jest
      .mocked(getBankMatchStatus)
      .mockRejectedValue(new BillingSessionExpired('Billing expired'));
    show();
    fireEvent.click(
      await screen.findByRole('button', { name: 'Check bank save status' }),
    );
    await screen.findByText('Billing expired');
    fireEvent.click(screen.getByRole('button', { name: 'Reconnect Billing' }));
    expect(reconnect).toHaveBeenCalledTimes(1);
    expect(JSON.parse(sessionStorage.getItem(storage)!)).toEqual(request());
    expect(saveBankMatch).not.toHaveBeenCalled();
  });
});
