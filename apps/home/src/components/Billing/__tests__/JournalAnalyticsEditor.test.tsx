import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import {
  BillingSessionExpired,
  getJournalAnalytics,
  getJournalDetailChoices,
  JournalDetailValues,
} from '../billingService';
import { JournalAnalyticsEditor } from '../JournalAnalyticsEditor';

jest.mock('../billingService', () => ({
  ...jest.requireActual('../billingService'),
  getJournalAnalytics: jest.fn(),
  getJournalDetailChoices: jest.fn(),
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
}: {
  initial?: JournalDetailValues['analytic_distribution'];
  disabled?: boolean;
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
    />
  );
}
const show = (
  initial: JournalDetailValues['analytic_distribution'] = false,
  disabled = false,
) =>
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <Form initial={initial} disabled={disabled} />
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
});
