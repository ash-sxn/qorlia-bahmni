import { Button, ComboBox } from '@bahmni/design-system';
import { useDebounce } from '@bahmni/widgets';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import styles from './BillingPage.module.scss';
import {
  BillingSessionExpired,
  getStockOperationChoices,
  StockOperationFormRequest,
  stockOperationRelationFields,
} from './billingService';

export function StockOperationChoice({
  uid,
  request,
  field,
  label,
  value,
  name,
  disabled,
  change,
  reconnect,
}: {
  uid: number;
  request: StockOperationFormRequest;
  field: (typeof stockOperationRelationFields)[number];
  label: string;
  value: number | false;
  name?: string;
  disabled: boolean;
  change: (value: number | false) => void;
  reconnect: () => void;
}) {
  const [search, setSearch] = useState('');
  const [offset, setOffset] = useState(0);
  const term = useDebounce(search, 250);
  const searchPending = search !== term;
  const choices = useQuery({
    queryKey: [
      'billing',
      'stock-operation-choices',
      uid,
      request,
      field,
      term,
      offset,
    ],
    queryFn: () => getStockOperationChoices(request, field, term, offset),
    enabled: !disabled,
    retry: false,
    refetchOnWindowFocus: false,
  });
  return (
    <div>
      <ComboBox<[number, string]>
        id={`stock-operation-${field}`}
        titleText={label}
        items={
          choices.isError || choices.isFetching || searchPending
            ? []
            : (choices.data?.rows ?? [])
        }
        itemToString={(item) => item?.[1] ?? ''}
        selectedItem={value ? [value, name ?? `Record ${value}`] : null}
        shouldFilterItem={() => true}
        disabled={disabled}
        invalid={choices.isError}
        invalidText={choices.error?.message}
        helperText={
          choices.isFetching || searchPending
            ? 'Searching native stock records...'
            : 'Search and select a native record.'
        }
        onInputChange={(value) => {
          setSearch(value);
          setOffset(0);
        }}
        onChange={({ selectedItem }) => {
          if (disabled) return;
          // Carbon's explicit clear emits null; search typing does not clear the native value.
          if (selectedItem === null && value !== false) change(false);
          if (
            selectedItem &&
            selectedItem[0] !== value &&
            !disabled &&
            !choices.isFetching &&
            !choices.isError &&
            !searchPending
          )
            change(selectedItem[0]);
        }}
      />
      {offset > 0 || choices.data?.has_more ? (
        <div className={styles.toolbar}>
          <Button
            type="button"
            kind="tertiary"
            disabled={
              disabled || choices.isFetching || searchPending || offset === 0
            }
            onClick={() => setOffset((value) => Math.max(0, value - 25))}
          >
            Previous {label.toLowerCase()} choices
          </Button>
          <Button
            type="button"
            kind="tertiary"
            disabled={
              disabled ||
              choices.isFetching ||
              searchPending ||
              choices.isError ||
              !choices.data?.has_more
            }
            onClick={() => setOffset((value) => value + 25)}
          >
            More {label.toLowerCase()} choices
          </Button>
        </div>
      ) : null}
      {choices.error instanceof BillingSessionExpired ? (
        <Button type="button" kind="tertiary" onClick={reconnect}>
          Reconnect Billing
        </Button>
      ) : choices.isError ? (
        <Button
          type="button"
          kind="tertiary"
          disabled={disabled || choices.isFetching}
          onClick={() => void choices.refetch()}
        >
          Reload {label.toLowerCase()} choices
        </Button>
      ) : null}
    </div>
  );
}
