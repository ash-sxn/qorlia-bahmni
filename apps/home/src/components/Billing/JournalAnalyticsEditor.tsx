import { Button, TextInput } from '@bahmni/design-system';
import { useQuery } from '@tanstack/react-query';
import {
  BillingSessionExpired,
  getJournalAnalytics,
  getJournalMoneyAnalytics,
  getBankMatchAnalytics,
  journalAnalyticIds,
  JournalAnalyticAccount,
  JournalAnalyticPlan,
  JournalDetailValues,
} from './billingService';
import { DraftChoiceInput } from './DraftChoiceInput';

export function analyticAllocationLabel(
  key: string,
  accounts: JournalAnalyticAccount[],
) {
  return key
    .split(',')
    .map(
      (id) =>
        accounts.find((account) => account.id === Number(id))?.name ??
        `Unavailable account ${id}`,
    )
    .join(' / ');
}

export function JournalAnalyticsEditor({
  uid,
  invoiceId,
  lineId,
  accountId,
  value,
  disabled,
  change,
  reconnect,
  moneyJournal = false,
  inputPrefix = 'journal',
  bankMatch,
}: {
  uid: number;
  invoiceId: number;
  lineId: number | false;
  accountId: number;
  value: JournalDetailValues['analytic_distribution'];
  disabled: boolean;
  change: (value: JournalDetailValues['analytic_distribution']) => void;
  reconnect: () => void;
  moneyJournal?: boolean;
  inputPrefix?: string;
  bankMatch?: { statementLineId: number; sourceLineId: number };
}) {
  const ids = journalAnalyticIds(value);
  const metadata = useQuery<{
    plans: JournalAnalyticPlan[];
    accounts: JournalAnalyticAccount[];
  }>({
    queryKey: [
      'billing',
      'journal-analytics',
      uid,
      invoiceId,
      lineId,
      accountId,
      ids,
      moneyJournal,
      bankMatch,
    ],
    queryFn: async () => {
      const result = await (bankMatch
        ? getBankMatchAnalytics(
            bankMatch.statementLineId,
            bankMatch.sourceLineId,
            ids,
          )
        : moneyJournal
          ? getJournalMoneyAnalytics(invoiceId, lineId, accountId, ids)
          : getJournalAnalytics(invoiceId, lineId as number, accountId, ids));
      if (bankMatch && result.account_id !== accountId)
        throw new Error('The matching account changed. Reload the bank entry.');
      return result;
    },
    retry: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
  const rows = Object.entries(value || {});
  return (
    <section aria-label="Analytic allocation">
      <h3>Analytic allocation</h3>
      <p>
        Choose named accounts and their percentages. Existing combined
        allocations remain intact. Native plan and posting rules still apply.
      </p>
      {metadata.isFetching ? (
        <p role="status">Loading analytic accounts and plan rules...</p>
      ) : null}
      {metadata.isError ? (
        <>
          <p role="alert">
            {metadata.error.message} Your allocations have not been removed.
          </p>
          <Button
            kind="tertiary"
            disabled={metadata.isFetching}
            onClick={() => void metadata.refetch()}
          >
            Reload analytic plans
          </Button>
          {metadata.error instanceof BillingSessionExpired ? (
            <Button onClick={reconnect}>Reconnect Billing</Button>
          ) : null}
        </>
      ) : null}
      {metadata.data && !metadata.isError && !metadata.isFetching ? (
        <>
          {metadata.data.plans.length === 0 ? (
            <p>No analytic plans are available for this journal account.</p>
          ) : null}
          {metadata.data.plans.map((plan) => {
            const total = rows.reduce(
              (sum, [key, percent]) =>
                sum +
                key
                  .split(',')
                  .filter((id) =>
                    metadata.data.accounts.some(
                      (account) =>
                        account.id === Number(id) &&
                        account.plan_id === plan.id,
                    ),
                  ).length *
                  percent,
              0,
            );
            return (
              <div key={plan.id}>
                <h4>{plan.name}</h4>
                <p>
                  {plan.applicability === 'mandatory'
                    ? 'Mandatory plan: target 100%'
                    : 'Optional plan'}{' '}
                  · Allocated{' '}
                  {Number.isFinite(total) ? `${total}%` : 'invalid percentage'}
                </p>
                <DraftChoiceInput
                  id={`${inputPrefix}-analytic-plan-${plan.id}`}
                  label={`Add account to ${plan.name}`}
                  uid={uid}
                  {...(bankMatch
                    ? { bankMatch }
                    : moneyJournal
                      ? { moneyJournal: { invoiceId, lineId } }
                      : {
                          journalInvoiceId: invoiceId,
                          journalLineId: lineId as number,
                        })}
                  kind="analytic"
                  analyticScope={{
                    account_id: accountId,
                    plan_id: plan.id,
                    account_ids: ids,
                  }}
                  value={false}
                  disabled={disabled || rows.length >= 100}
                  reconnect={reconnect}
                  onChange={(id) => {
                    if (!id || ids.includes(id)) return;
                    change({
                      ...(value || {}),
                      [String(id)]: Math.max(
                        0,
                        100 - (Number.isFinite(total) ? total : 0),
                      ),
                    });
                  }}
                />
              </div>
            );
          })}
          {rows.map(([key, percent]) => {
            const label = analyticAllocationLabel(key, metadata.data.accounts);
            return (
              <div key={key}>
                <TextInput
                  id={`${inputPrefix}-analytic-${key.replaceAll(',', '-')}`}
                  labelText={`${label} allocation (%)`}
                  type="number"
                  min={0}
                  max={100}
                  step="any"
                  value={Number.isFinite(percent) ? percent : ''}
                  disabled={disabled}
                  invalid={
                    !Number.isFinite(percent) || percent < 0 || percent > 100
                  }
                  invalidText="Enter a percentage between zero and 100."
                  onChange={(event) =>
                    change({
                      ...(value || {}),
                      [key]:
                        event.target.value === ''
                          ? NaN
                          : Number(event.target.value),
                    })
                  }
                />
                <Button
                  kind="ghost"
                  disabled={disabled}
                  onClick={() => {
                    const next = { ...(value || {}) };
                    delete next[key];
                    change(Object.keys(next).length ? next : false);
                  }}
                >
                  Remove allocation for {label}
                </Button>
              </div>
            );
          })}
          {rows.length === 0 ? <p>No analytic allocation selected.</p> : null}
        </>
      ) : null}
    </section>
  );
}
