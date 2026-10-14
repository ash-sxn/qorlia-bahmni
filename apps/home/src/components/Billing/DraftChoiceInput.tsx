import { Button, ComboBox } from '@bahmni/design-system';
import { useDebounce } from '@bahmni/widgets';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import {
  BillingSessionExpired,
  DraftChoiceKind,
  getDraftChoices,
  getInvoiceDraftChoices,
  getAdvanceChoices,
  InvoiceDraftChoiceKind,
  getJournalDetailChoices,
  getCustomerPaymentDraftChoices,
  CustomerPaymentDraftValues,
  CustomerPaymentDraftChoiceKind,
  getJournalMoneyChoices,
  JournalMoneyChoice,
  getBankAnalyticChoices,
} from './billingService';

export function DraftChoiceInput({
  id,
  label,
  kind,
  uid,
  value,
  name,
  shopId = false,
  productId = false,
  invoiceId,
  advanceOrderId,
  journalInvoiceId,
  journalLineId,
  analyticScope,
  paymentValues,
  moneyJournal,
  bankMatch,
  disabled,
  onChange,
  reconnect,
}: {
  id: string;
  label: string;
  uid: number;
  value: number | false;
  name?: string;
  shopId?: number | false;
  productId?: number | false;
  disabled?: boolean;
  bankMatch?: { statementLineId: number; sourceLineId: number };
  analyticScope?: {
    account_id: number;
    plan_id: number;
    account_ids: number[];
  };
  onChange: (value: number | false, name?: string) => void;
  reconnect: () => void;
} & (
  | {
      bankMatch: { statementLineId: number; sourceLineId: number };
      invoiceId?: undefined;
      paymentValues?: undefined;
      advanceOrderId?: undefined;
      journalInvoiceId?: undefined;
      journalLineId?: undefined;
      moneyJournal?: undefined;
      kind: 'analytic';
    }
  | {
      invoiceId: number | false;
      paymentValues?: undefined;
      advanceOrderId?: undefined;
      journalInvoiceId?: undefined;
      journalLineId?: undefined;
      kind: InvoiceDraftChoiceKind;
      moneyJournal?: undefined;
    }
  | {
      invoiceId?: undefined;
      paymentValues?: undefined;
      advanceOrderId?: undefined;
      journalInvoiceId?: undefined;
      journalLineId?: undefined;
      kind: DraftChoiceKind;
      moneyJournal?: undefined;
    }
  | {
      invoiceId?: undefined;
      advanceOrderId: number;
      paymentValues?: undefined;
      journalInvoiceId?: undefined;
      journalLineId?: undefined;
      kind: 'account' | 'tax';
      moneyJournal?: undefined;
    }
  | {
      invoiceId?: undefined;
      advanceOrderId?: undefined;
      journalInvoiceId: number;
      paymentValues?: undefined;
      journalLineId: number;
      kind: 'account' | 'grid' | 'analytic';
      moneyJournal?: undefined;
    }
  | {
      paymentValues: CustomerPaymentDraftValues;
      invoiceId?: undefined;
      advanceOrderId?: undefined;
      journalInvoiceId?: undefined;
      journalLineId?: undefined;
      kind: CustomerPaymentDraftChoiceKind;
      moneyJournal?: undefined;
    }
  | {
      moneyJournal: { invoiceId: number; lineId: number | false };
      invoiceId?: undefined;
      advanceOrderId?: undefined;
      journalInvoiceId?: undefined;
      journalLineId?: undefined;
      paymentValues?: undefined;
      kind: JournalMoneyChoice;
    }
)) {
  const [search, setSearch] = useState('');
  const [bankOffset, setBankOffset] = useState(0);
  const term = useDebounce(search, 250);
  const bankSearchPending = !!bankMatch && search !== term;
  const choices = useQuery({
    queryKey: [
      'billing',
      'draft-choices',
      uid,
      invoiceId,
      advanceOrderId,
      journalInvoiceId,
      journalLineId,
      analyticScope,
      kind,
      term,
      shopId,
      productId,
      paymentValues,
      moneyJournal,
      bankMatch,
      bankOffset,
    ],
    queryFn: async () => {
      if (bankMatch) {
        if (kind !== 'analytic' || !analyticScope)
          throw new Error(
            'Select a native analytic plan for this matching item.',
          );
        return getBankAnalyticChoices(
          bankMatch.statementLineId,
          bankMatch.sourceLineId,
          analyticScope.plan_id,
          analyticScope.account_ids,
          term,
          bankOffset,
        );
      }
      const rows = await (moneyJournal !== undefined
        ? getJournalMoneyChoices(
            moneyJournal.invoiceId,
            kind as JournalMoneyChoice,
            term,
            moneyJournal.lineId,
            analyticScope,
          )
        : paymentValues !== undefined
          ? getCustomerPaymentDraftChoices(
              paymentValues,
              kind as CustomerPaymentDraftChoiceKind,
              term,
            )
          : journalInvoiceId !== undefined
            ? getJournalDetailChoices(
                journalInvoiceId,
                journalLineId!,
                kind as 'account' | 'grid' | 'analytic',
                term,
                analyticScope,
              )
            : advanceOrderId !== undefined
              ? getAdvanceChoices(
                  advanceOrderId,
                  kind as 'account' | 'tax',
                  term,
                )
              : invoiceId !== undefined
                ? getInvoiceDraftChoices(
                    invoiceId,
                    kind as InvoiceDraftChoiceKind,
                    term,
                    productId,
                  )
                : getDraftChoices(
                    kind as DraftChoiceKind,
                    term,
                    shopId,
                    productId,
                  ));
      return { rows, has_more: false };
    },
    enabled: !disabled,
    retry: false,
  });
  const selected: [number, string] | null = value
    ? [value, name ?? `Record ${value}`]
    : null;
  return (
    <div>
      <ComboBox<[number, string]>
        id={id}
        titleText={label}
        items={
          bankSearchPending || choices.isError ? [] : (choices.data?.rows ?? [])
        }
        itemToString={(item) => item?.[1] ?? ''}
        selectedItem={selected}
        clearSelectedOnChange={
          kind === 'tax' || kind === 'grid' || kind === 'analytic'
        }
        shouldFilterItem={() => true}
        onInputChange={(value) => {
          setSearch(value);
          setBankOffset(0);
        }}
        onChange={({ selectedItem }) =>
          onChange(selectedItem?.[0] ?? false, selectedItem?.[1])
        }
        disabled={disabled}
        invalid={choices.isError}
        invalidText={choices.error?.message}
        helperText={
          choices.isFetching || bankSearchPending
            ? 'Searching Billing...'
            : 'Search and select a record.'
        }
      />
      {bankMatch ? (
        <div>
          <Button
            type="button"
            kind="tertiary"
            disabled={
              (disabled ?? false) ||
              choices.isFetching ||
              bankSearchPending ||
              bankOffset === 0
            }
            onClick={() => setBankOffset((offset) => Math.max(0, offset - 25))}
          >
            Previous analytic accounts
          </Button>
          <Button
            type="button"
            kind="tertiary"
            disabled={
              (disabled ?? false) ||
              choices.isFetching ||
              bankSearchPending ||
              choices.isError ||
              !choices.data?.has_more
            }
            onClick={() => setBankOffset((offset) => offset + 25)}
          >
            More analytic accounts
          </Button>
        </div>
      ) : null}
      {choices.error instanceof BillingSessionExpired ? (
        <Button type="button" kind="tertiary" onClick={reconnect}>
          Reconnect Billing
        </Button>
      ) : null}
    </div>
  );
}
