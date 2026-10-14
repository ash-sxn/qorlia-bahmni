import {
  BankGraph,
  BankMatchPayload,
  BankMatchRequest,
  BankMatchView,
  BillingActionRejected,
  BillingSessionExpired,
  checkedBankMatchPayload,
  getBankFeeChoices,
  getBankMatchAnalytics,
  getBankAnalyticChoices,
  getBankMatch,
  getBankMatchStatus,
  previewBankMatch,
  saveBankMatch,
} from '../billingService';
import { bankEntry } from './bankFixture';

const key = '11111111-2222-4333-8444-555555555555';
const payload = (): BankMatchPayload => ({
  statement_line_id: 7,
  version: 'a'.repeat(64),
  action: 'match',
  allocations: [{ line_id: 81, amount: 2 }],
  fee_model_id: false,
});
const request = (): BankMatchRequest => ({
  payload: payload(),
  review_version: 'b'.repeat(64),
  request_key: key,
});
const fields: Record<string, string> = {
  'account.bank.statement.line':
    'move_id journal_id date payment_ref partner_id amount currency_id amount_currency foreign_currency_id amount_residual is_reconciled to_check payment_ids statement_id transaction_type',
  'account.move':
    'name state move_type date company_id journal_id partner_id currency_id amount_total amount_residual payment_state line_ids reversed_entry_id tax_cash_basis_rec_id tax_cash_basis_origin_move_id narration',
  'account.move.line':
    'name move_id account_id partner_id date date_maturity debit credit balance currency_id amount_currency amount_residual amount_residual_currency reconciled matched_debit_ids matched_credit_ids full_reconcile_id tax_ids tax_tag_ids tax_repartition_line_id tax_line_id group_tax_id tax_base_amount tax_tag_invert display_type reconcile_model_id analytic_distribution payment_id statement_line_id',
  'account.partial.reconcile':
    'debit_move_id credit_move_id amount debit_amount_currency credit_amount_currency full_reconcile_id exchange_move_id max_date',
  'account.full.reconcile':
    'name partial_reconcile_ids reconciled_line_ids exchange_move_id',
  'account.payment':
    'move_id state amount currency_id payment_type partner_type partner_id journal_id is_matched is_reconciled',
  'account.analytic.line':
    'move_line_id account_id date amount unit_amount company_id',
};
function row(
  model: string,
  id: number | string,
  values: Record<string, unknown>,
) {
  const money =
    'amount amount_currency amount_residual amount_residual_currency amount_total debit credit balance debit_amount_currency credit_amount_currency tax_base_amount unit_amount'.split(
      ' ',
    );
  return {
    id,
    values: {
      ...Object.fromEntries(
        fields[model]
          .split(' ')
          .map((field) => [
            field,
            field.endsWith('_ids') ? [] : money.includes(field) ? 0 : false,
          ]),
      ),
      ...values,
    },
  };
}
function bankMatchGraph(): BankGraph {
  const graph: BankGraph = Object.fromEntries(
    Object.keys(fields).map((model) => [model, { rows: [], removed_ids: [] }]),
  );
  graph['account.bank.statement.line'].rows = [
    row('account.bank.statement.line', 7, {
      move_id: 17,
      journal_id: 4,
      currency_id: 1,
      amount: 100,
      date: '2026-10-10',
      amount_residual: -100,
    }),
  ];
  graph['account.move'].rows = [
    row('account.move', 17, {
      company_id: 1,
      journal_id: 4,
      currency_id: 1,
      state: 'posted',
      move_type: 'entry',
      line_ids: [71, 72],
    }),
  ];
  graph['account.move.line'].rows = [71, 72].map((id) =>
    row('account.move.line', id, {
      move_id: 17,
      account_id: 41,
      currency_id: 1,
      debit: id === 71 ? 100 : 0,
      credit: id === 72 ? 100 : 0,
      balance: id === 71 ? 100 : -100,
    }),
  );
  return graph;
}
function beforeGraph() {
  const graph = bankMatchGraph();
  graph['account.move'].rows.push(
    row('account.move', 18, {
      company_id: 1,
      journal_id: 5,
      currency_id: 2,
      line_ids: [81],
      state: 'posted',
    }),
  );
  graph['account.move.line'].rows.push(
    row('account.move.line', 81, {
      move_id: 18,
      account_id: 43,
      currency_id: 2,
      amount_residual: 100,
      amount_residual_currency: 2,
    }),
  );
  return graph;
}
const view = (): BankMatchView => ({
  statement_line_id: 7,
  entry: bankEntry(),
  version: 'a'.repeat(64),
  graph: bankMatchGraph(),
  labels: { 'account.account:41': 'Bank INR' },
  company_currency: [1, 'INR'],
  transaction_currency: [2, 'USD'],
  reason: false,
  can_match: true,
  can_undo: false,
});
function review() {
  const after = beforeGraph();
  after['account.partial.reconcile'].rows.push(
    row('account.partial.reconcile', 'new:1', {
      debit_move_id: 81,
      credit_move_id: 72,
      amount: 100,
      debit_amount_currency: 2,
      credit_amount_currency: 100,
    }),
  );
  return {
    statement_line_id: 7,
    review_version: 'b'.repeat(64),
    before: beforeGraph(),
    after,
    labels: view().labels,
  };
}
const reply = (result: unknown) =>
  (global.fetch as jest.Mock).mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ result }),
  });
const call = () =>
  JSON.parse((global.fetch as jest.Mock).mock.calls.at(-1)[1].body).params;

describe('Reviewed native bank API client', () => {
  beforeEach(() => {
    global.fetch = jest.fn();
  });
  it('uses named load/preview/save/status APIs and retains source-currency amounts without caller context', async () => {
    reply(view());
    await expect(getBankMatch(7)).resolves.toMatchObject({
      company_currency: [1, 'INR'],
      transaction_currency: [2, 'USD'],
    });
    expect(call()).toEqual({
      model: 'account.bank.statement.line',
      method: 'qorlia_bank_match_load',
      args: [],
      kwargs: { statement_line_id: 7 },
    });
    reply(review());
    await expect(previewBankMatch(payload())).resolves.toEqual(review());
    expect(call().kwargs).toEqual({ payload: payload() });
    reply({ ...view(), accepted: true, request_key: key });
    await saveBankMatch(request());
    expect(call()).toEqual({
      model: 'account.bank.statement.line',
      method: 'qorlia_bank_match_save',
      args: [],
      kwargs: request(),
    });
    await getBankMatchStatus(request());
    expect(call().method).toBe('qorlia_bank_match_status');
  });
  it('accepts a separate reviewed undo and refuses undo mixed with new matching', async () => {
    const undo: BankMatchPayload = {
      ...payload(),
      action: 'undo',
      allocations: [],
    };
    reply(review());
    await previewBankMatch(undo);
    expect(call().kwargs.payload).toEqual(undo);
    for (const invalid of [
      { ...undo, allocations: payload().allocations },
      { ...undo, fee_model_id: 1 },
    ])
      expect(() => checkedBankMatchPayload(invalid)).toThrow();
  });
  it('preserves explicit counterpart analytics and rejects unsafe allocations before RPC', async () => {
    const selected = {
      ...payload(),
      allocations: [
        { line_id: 81, amount: 2, analytic_distribution: { '11,12': 100 } },
      ],
    };
    reply(review());
    await previewBankMatch(selected);
    expect(call().kwargs.payload).toEqual(selected);
    for (const distribution of [
      undefined,
      null,
      [],
      { '0': 100 },
      { '01': 100 },
      { '11,11': 100 },
      { '11': NaN },
      { '11': Infinity },
      { '11': -1 },
      { '11': 101 },
      { '11': true },
      { '9007199254740992': 100 },
    ]) {
      jest.mocked(global.fetch).mockClear();
      await expect(
        previewBankMatch({
          ...payload(),
          allocations: [
            {
              line_id: 81,
              amount: 2,
              analytic_distribution: distribution as unknown as Record<
                string,
                number
              >,
            },
          ],
        }),
      ).rejects.toThrow();
      expect(global.fetch).not.toHaveBeenCalled();
    }
  });
  it('loads scoped native analytic plans and named choices with paging', async () => {
    const metadata = {
      statement_line_id: 7,
      source_line_id: 81,
      account_id: 43,
      plans: [{ id: 3, name: 'Department', applicability: 'mandatory' }],
      accounts: [{ id: 11, name: 'Outpatient', plan_id: 3 }],
    };
    reply(metadata);
    await expect(getBankMatchAnalytics(7, 81, [11])).resolves.toEqual(metadata);
    expect(call()).toEqual({
      model: 'account.bank.statement.line',
      method: 'qorlia_bank_match_analytics',
      args: [],
      kwargs: { statement_line_id: 7, source_line_id: 81, account_ids: [11] },
    });
    reply({ rows: [[11, 'Outpatient']], offset: 25, has_more: false });
    await expect(
      getBankAnalyticChoices(7, 81, 3, [11], 'Out', 25),
    ).resolves.toMatchObject({ offset: 25 });
    expect(call().kwargs).toEqual({
      statement_line_id: 7,
      source_line_id: 81,
      plan_id: 3,
      account_ids: [11],
      search: 'Out',
      offset: 25,
    });
    reply({ ...metadata, source_line_id: 82 });
    await expect(getBankMatchAnalytics(7, 81, [11])).rejects.toThrow('scope');
    reply({ ...metadata, accounts: [] });
    await expect(getBankMatchAnalytics(7, 81, [11])).rejects.toThrow('names');
    reply({
      rows: [
        [11, 'Outpatient'],
        [11, 'Duplicate'],
      ],
      offset: 0,
      has_more: false,
    });
    await expect(getBankAnalyticChoices(7, 81, 3, [], '', 0)).rejects.toThrow(
      'choices',
    );
    jest.mocked(global.fetch).mockClear();
    await expect(getBankMatchAnalytics(7, 81, [11, 11])).rejects.toThrow();
    await expect(getBankAnalyticChoices(7, 0, 3, [], '', 0)).rejects.toThrow();
    expect(global.fetch).not.toHaveBeenCalled();
  });
  it('rejects malformed, duplicate, nonfinite, nonpositive and unversioned requests before RPC', async () => {
    for (const invalid of [
      { ...payload(), statement_line_id: 0 },
      { ...payload(), version: 'bad' },
      { ...payload(), fee_model_id: 0 },
      { ...payload(), allocations: [] },
      { ...payload(), allocations: [{ line_id: 81, amount: NaN }] },
      { ...payload(), allocations: [{ line_id: 81, amount: Infinity }] },
      { ...payload(), allocations: [{ line_id: 81, amount: 0 }] },
      {
        ...payload(),
        allocations: [...payload().allocations, ...payload().allocations],
      },
      { ...payload(), context: { check_move_validity: false } },
    ])
      await expect(previewBankMatch(invalid)).rejects.toThrow();
    await expect(
      saveBankMatch({ ...request(), review_version: 'bad' }),
    ).rejects.toThrow();
    await expect(
      getBankMatchStatus({ ...request(), request_key: 'new' }),
    ).rejects.toThrow();
    await expect(getBankMatch(0)).rejects.toThrow();
    expect(global.fetch).not.toHaveBeenCalled();
  });
  it('accepts fee-only matching and complete native fee pagination without inventing a rule', async () => {
    reply(review());
    await previewBankMatch({ ...payload(), allocations: [], fee_model_id: 3 });
    const fees = {
      rows: [{ id: 3, name: 'Bank charge', rule_type: 'writeoff_button' }],
      offset: 0,
      has_more: false,
    };
    reply(fees);
    await expect(getBankFeeChoices(7, 'Bank')).resolves.toEqual(fees);
    expect(call().kwargs).toEqual({
      statement_line_id: 7,
      search: 'Bank',
      offset: 0,
    });
    for (const invalid of [
      { ...fees, offset: 25 },
      { ...fees, has_more: true },
      { ...fees, rows: [...fees.rows, ...fees.rows] },
      { ...fees, rows: [{ ...fees.rows[0], rule_type: 'invoice_matching' }] },
    ]) {
      reply(invalid);
      await expect(getBankFeeChoices(7)).rejects.toThrow();
    }
  });
  it('rejects partial graphs, missing money/currency, duplicates, invalid deletions and mismatched bank summaries', async () => {
    const corruptions: ((data: BankMatchView) => void)[] = [
      (data) => {
        delete data.graph['account.payment'];
      },
      (data) => {
        delete data.graph['account.move.line'].rows[0].values.credit;
      },
      (data) => {
        data.graph['account.move.line'].rows[0].values.currency_id = false;
      },
      (data) => {
        data.graph['account.move.line'].rows[0].values.debit = NaN;
      },
      (data) => {
        data.graph['account.move.line'].rows.push(
          data.graph['account.move.line'].rows[0],
        );
      },
      (data) => {
        data.graph['account.payment'].removed_ids = [5];
      },
      (data) => {
        data.graph['account.move'].rows = [];
      },
      (data) => {
        data.entry.amount = 101;
      },
      (data) => {
        data.labels = { 'account.account:0': 'Invalid' };
      },
      (data) => {
        data.reason = 'No write access';
      },
    ];
    for (const corrupt of corruptions) {
      const data = view();
      corrupt(data);
      reply(data);
      await expect(getBankMatch(7)).rejects.toThrow();
    }
    reply({
      ...view(),
      reason: 'Read only',
      can_match: false,
      can_undo: false,
    });
    await expect(getBankMatch(7)).resolves.toHaveProperty(
      'reason',
      'Read only',
    );
  });
  it('requires selected sources in the before graph and checks every generated effect and deletion', async () => {
    const incomplete = review();
    incomplete.before['account.move.line'].rows = incomplete.before[
      'account.move.line'
    ].rows.filter((row) => row.id !== 81);
    reply(incomplete);
    await expect(previewBankMatch(payload())).rejects.toThrow(/omits/);
    const invalid = review();
    invalid.after['account.partial.reconcile'].rows[0].values.amount = Infinity;
    reply(invalid);
    await expect(previewBankMatch(payload())).rejects.toThrow();
    const deleted = review();
    deleted.after['account.payment'].removed_ids = [9];
    reply(deleted);
    await expect(previewBankMatch(payload())).resolves.toEqual(deleted);
    deleted.after['account.payment'].removed_ids = [9, 9];
    reply(deleted);
    await expect(previewBankMatch(payload())).rejects.toThrow();
  });
  it('returns false only for an unaccepted exact request and checks accepted identity', async () => {
    reply(false);
    await expect(getBankMatchStatus(request())).resolves.toBe(false);
    for (const invalid of [
      { ...view(), accepted: false, request_key: key },
      { ...view(), accepted: true, request_key: 'another-key' },
      { ...view(), accepted: true, request_key: key, statement_line_id: 8 },
      null,
    ]) {
      reply(invalid);
      await expect(getBankMatchStatus(request())).rejects.toThrow();
    }
  });
  it('preserves native rejection, expired session and uncertain transport errors without retrying a save', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ error: { code: 100 } }),
    });
    await expect(saveBankMatch(request())).rejects.toBeInstanceOf(
      BillingSessionExpired,
    );
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        error: {
          data: {
            name: 'odoo.exceptions.UserError',
            arguments: ['Reload the stale statement'],
          },
        },
      }),
    });
    await expect(saveBankMatch(request())).rejects.toBeInstanceOf(
      BillingActionRejected,
    );
    (global.fetch as jest.Mock).mockRejectedValue(new Error('Connection lost'));
    await expect(saveBankMatch(request())).rejects.toThrow('Connection lost');
    expect(global.fetch).toHaveBeenCalledTimes(3);
  });
});
