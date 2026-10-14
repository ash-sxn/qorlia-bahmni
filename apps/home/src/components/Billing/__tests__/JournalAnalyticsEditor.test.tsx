import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import {
  BillingSessionExpired,
  getJournalAnalytics,
  getJournalDetailChoices,
  JournalDetailValues,
  getBankMatchAnalytics,
  getBankAnalyticChoices,
} from '../billingService';
import { JournalAnalyticsEditor } from '../JournalAnalyticsEditor';

jest.mock('../billingService', () => ({
  ...jest.requireActual('../billingService'),
  getJournalAnalytics: jest.fn(),
  getJournalDetailChoices: jest.fn(),
  getBankMatchAnalytics: jest.fn(),
  getBankAnalyticChoices: jest.fn(),
}));
const changed = jest.fn(),
  reconnect = jest.fn();
const plans = [
  { id: 20, name: 'Departments', applicability: 'mandatory' },
  { id: 30, name: 'Projects', applicability: 'optional' },
];
const accounts = [
  { id: 12, name: 'Outpatient', plan_id: 20 },
  { id: 13, name: 'Laboratory', plan_id: 20 },
  { id: 14, name: 'Clinic pilot', plan_id: 30 },
];
function Form({
  initial = false,
  disabled = false,
  bank = false,
}: {
  initial?: JournalDetailValues['analytic_distribution'];
  disabled?: boolean;
  bank?: boolean;
}) {
  const [value, setValue] = useState(initial);
  return (
    <JournalAnalyticsEditor
      uid={3}
      invoiceId={7}
      lineId={17}
      accountId={2}
      value={value}
      disabled={disabled}
      change={(next) => {
        changed(next);
        setValue(next);
      }}
      reconnect={reconnect}
      bankMatch={bank ? { statementLineId: 7, sourceLineId: 17 } : undefined}
    />
  );
}
const show = (
  initial: JournalDetailValues['analytic_distribution'] = false,
  disabled = false,
  bank = false,
) =>
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <Form initial={initial} disabled={disabled} bank={bank} />
    </QueryClientProvider>,
  );

describe('Named native journal analytic allocation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (getJournalAnalytics as jest.Mock).mockImplementation(
      async (_invoice, _line, _account, ids: number[]) => ({
        plans,
        accounts: accounts.filter((account) => ids.includes(account.id)),
      }),
    );
    (getJournalDetailChoices as jest.Mock).mockImplementation(
      async (_invoice, _line, _kind, _search, scope) =>
        accounts
          .filter((account) => account.plan_id === scope.plan_id)
          .map((account) => [account.id, account.name]),
    );
  });
  it('adds named accounts with the remaining percentage for that plan, not across different plans', async () => {
    show({ '12': 60 });
    const input = await screen.findByRole('combobox', {
      name: 'Add account to Departments',
    });
    await waitFor(() =>
      expect(getJournalDetailChoices).toHaveBeenCalledWith(
        7,
        17,
        'analytic',
        '',
        {
          account_id: 2,
          plan_id: 20,
          account_ids: [12],
        },
      ),
    );
    fireEvent.click(input);
    fireEvent.click(await screen.findByRole('option', { name: 'Laboratory' }));
    await screen.findByLabelText('Laboratory allocation (%)');
    expect(changed).toHaveBeenLastCalledWith({ '12': 60, '13': 40 });
    fireEvent.click(
      screen.getByRole('combobox', { name: 'Add account to Projects' }),
    );
    fireEvent.click(
      await screen.findByRole('option', { name: 'Clinic pilot' }),
    );
    await screen.findByLabelText('Clinic pilot allocation (%)');
    expect(changed).toHaveBeenLastCalledWith({ '12': 60, '13': 40, '14': 100 });
  });
  it('does not duplicate an account already present in a combined key and removes only the chosen allocation', async () => {
    show({ '12,14': 60, '13': 40 });
    fireEvent.click(
      await screen.findByRole('combobox', {
        name: 'Add account to Departments',
      }),
    );
    fireEvent.click(await screen.findByRole('option', { name: 'Outpatient' }));
    expect(changed).not.toHaveBeenCalled();
    fireEvent.click(
      screen.getByRole('button', { name: 'Remove allocation for Laboratory' }),
    );
    await waitFor(() => expect(changed).toHaveBeenCalledWith({ '12,14': 60 }));
    fireEvent.click(
      await screen.findByRole('button', {
        name: 'Remove allocation for Outpatient / Clinic pilot',
      }),
    );
    expect(changed).toHaveBeenLastCalledWith(false);
  });
  it('keeps allocations on failed lookup and offers explicit reload or session reconnection', async () => {
    (getJournalAnalytics as jest.Mock).mockRejectedValueOnce(
      new BillingSessionExpired(),
    );
    show({ '12': 100 });
    await screen.findByText(/Your allocations have not been removed/);
    expect(changed).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Reconnect Billing' }));
    expect(reconnect).toHaveBeenCalledTimes(1);
    fireEvent.click(
      screen.getByRole('button', { name: 'Reload analytic plans' }),
    );
    await screen.findByLabelText('Outpatient allocation (%)');
    expect(changed).not.toHaveBeenCalled();
  });
  it('locks percentage, addition and removal while a save is pending', async () => {
    show({ '12': 100 }, true);
    expect(
      await screen.findByLabelText('Outpatient allocation (%)'),
    ).toBeDisabled();
    expect(
      screen.getByRole('combobox', { name: 'Add account to Departments' }),
    ).toBeDisabled();
    expect(
      screen.getByRole('button', { name: 'Remove allocation for Outpatient' }),
    ).toBeDisabled();
    expect(changed).not.toHaveBeenCalled();
  });
  it('reuses named plan allocation for bank counterparts without calling invoice APIs', async () => {
    jest
      .mocked(getBankMatchAnalytics)
      .mockImplementation(async (_entry, _source, ids) => ({
        statement_line_id: 7,
        source_line_id: 17,
        account_id: 2,
        plans: [{ id: 20, name: 'Departments', applicability: 'mandatory' }],
        accounts: accounts.filter((account) => ids.includes(account.id)),
      }));
    jest.mocked(getBankAnalyticChoices).mockResolvedValue({
      rows: [[13, 'Laboratory']],
      offset: 0,
      has_more: false,
    });
    show({ '12': 60 }, false, true);
    fireEvent.click(
      await screen.findByRole('combobox', {
        name: 'Add account to Departments',
      }),
    );
    fireEvent.click(await screen.findByRole('option', { name: 'Laboratory' }));
    await screen.findByLabelText('Laboratory allocation (%)');
    expect(changed).toHaveBeenLastCalledWith({ '12': 60, '13': 40 });
    expect(getBankMatchAnalytics).toHaveBeenCalledWith(7, 17, [12]);
    expect(getBankAnalyticChoices).toHaveBeenCalledWith(7, 17, 20, [12], '', 0);
    expect(getJournalAnalytics).not.toHaveBeenCalled();
    expect(getJournalDetailChoices).not.toHaveBeenCalled();
  });
  it('pages bank analytic choices explicitly', async () => {
    jest.mocked(getBankMatchAnalytics).mockResolvedValue({
      statement_line_id: 7,
      source_line_id: 17,
      account_id: 2,
      plans: [{ id: 20, name: 'Departments', applicability: 'mandatory' }],
      accounts: [],
    });
    jest
      .mocked(getBankAnalyticChoices)
      .mockImplementation(
        async (_entry, _source, _plan, _ids, _term, offset) => ({
          rows: [[13, offset === 25 ? 'Next department' : 'Laboratory']],
          offset: offset ?? 0,
          has_more: offset === 0,
        }),
      );
    show(false, false, true);
    const more = await screen.findByRole('button', {
      name: 'More analytic accounts',
    });
    await waitFor(() => expect(more).toBeEnabled());
    fireEvent.click(more);
    await waitFor(() =>
      expect(getBankAnalyticChoices).toHaveBeenCalledWith(
        7,
        17,
        20,
        [],
        '',
        25,
      ),
    );
    await waitFor(() => expect(more).toBeDisabled());
    fireEvent.click(
      screen.getByRole('button', { name: 'Previous analytic accounts' }),
    );
    await waitFor(() => expect(more).toBeEnabled());
    fireEvent.change(
      screen.getByRole('combobox', { name: 'Add account to Departments' }),
      {
        target: { value: 'New search' },
      },
    );
    expect(more).toBeDisabled();
    await waitFor(() =>
      expect(getBankAnalyticChoices).toHaveBeenCalledWith(
        7,
        17,
        20,
        [],
        'New search',
        0,
      ),
    );
  });
  it('retains allocations but prevents editing when the native matching account changed', async () => {
    jest.mocked(getBankMatchAnalytics).mockResolvedValue({
      statement_line_id: 7,
      source_line_id: 17,
      account_id: 99,
      plans: [{ id: 20, name: 'Departments', applicability: 'mandatory' }],
      accounts: [],
    });
    show({ '12': 100 }, false, true);
    await screen.findByText(/The matching account changed/);
    expect(changed).not.toHaveBeenCalled();
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
  });
});
