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
  onChange: (value: number | false, name?: string) => void;
  reconnect: () => void;
} & (
  | {
      invoiceId: number | false;
      advanceOrderId?: undefined;
      kind: InvoiceDraftChoiceKind;
    }
  | { invoiceId?: undefined; advanceOrderId?: undefined; kind: DraftChoiceKind }
  | { invoiceId?: undefined; advanceOrderId: number; kind: 'account' | 'tax' }
)) {
  const [search, setSearch] = useState('');
  const term = useDebounce(search, 250);
  const choices = useQuery({
    queryKey: [
      'billing',
      'draft-choices',
      uid,
      invoiceId,
      advanceOrderId,
      kind,
      term,
      shopId,
      productId,
    ],
    queryFn: () =>
      advanceOrderId !== undefined
        ? getAdvanceChoices(advanceOrderId, kind as 'account' | 'tax', term)
        : invoiceId !== undefined
          ? getInvoiceDraftChoices(invoiceId, kind, term, productId)
          : getDraftChoices(kind as DraftChoiceKind, term, shopId, productId),
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
        items={choices.data ?? []}
        itemToString={(item) => item?.[1] ?? ''}
        selectedItem={selected}
        clearSelectedOnChange={kind === 'tax'}
        shouldFilterItem={() => true}
        onInputChange={setSearch}
        onChange={({ selectedItem }) =>
          onChange(selectedItem?.[0] ?? false, selectedItem?.[1])
        }
        disabled={disabled}
        invalid={choices.isError}
        invalidText={choices.error?.message}
        helperText={
          choices.isFetching
            ? 'Searching Billing...'
            : 'Search and select a record.'
        }
      />
      {choices.error instanceof BillingSessionExpired ? (
        <Button type="button" kind="tertiary" onClick={reconnect}>
          Reconnect Billing
        </Button>
      ) : null}
    </div>
  );
}
