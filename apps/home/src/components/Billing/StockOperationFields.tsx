import { TextInput } from '@bahmni/design-system';
import styles from './BillingPage.module.scss';
import {
  StockOperationField,
  StockOperationForm,
  StockOperationFormRequest,
  stockOperationFields,
  stockOperationNumberFields,
  stockOperationRelationFields,
} from './billingService';
import { StockOperationChoice } from './StockOperationChoice';

export const stockOperationLabels: Record<StockOperationField, string> = {
  qty_done: 'Recorded done quantity',
  product_uom_id: 'Operation unit',
  lot_id: 'Batch / serial',
  lot_name: 'New batch / serial name',
  existing_lot_id: 'Existing receiving batch',
  expiration_date: 'Expiry (UTC)',
  location_id: 'Source location',
  location_dest_id: 'Destination location',
  package_id: 'Source package',
  result_package_id: 'Destination package',
  owner_id: 'Stock owner',
  cost_price: 'Cost price',
  sale_price: 'Sale price',
  mrp: 'MRP',
};

export function stockOperationInputValue(
  field: StockOperationField,
  raw: string,
): number | string | false {
  if ((stockOperationNumberFields as readonly string[]).includes(field)) {
    if (!raw.trim() || !Number.isFinite(Number(raw)))
      throw new Error(
        `Enter a finite number for ${stockOperationLabels[field]}.`,
      );
    return Number(raw);
  }
  if (field !== 'expiration_date' || !raw) return raw || false;
  // datetime-local can append zero milliseconds; native timestamps use whole UTC seconds.
  const value = raw.replace('T', ' ').replace(/\.0+$/, '');
  if (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}(:\d{2})?$/.test(value))
    throw new Error(
      'Enter a UTC expiry with whole seconds, without fractional seconds.',
    );
  return value.length === 16 ? value + ':00' : value;
}

export function StockOperationFields({
  uid,
  form,
  request,
  local,
  disabled,
  protocol,
  change,
  edit,
  blur,
  reconnect,
}: {
  uid: number;
  form: StockOperationForm;
  request: StockOperationFormRequest;
  local: Partial<Record<StockOperationField, string>>;
  disabled: boolean;
  protocol: 'legacy' | 'complete';
  change: (field: StockOperationField, value: number | string | false) => void;
  edit: (field: StockOperationField, value: string) => void;
  blur: (field: StockOperationField) => void;
  reconnect: () => void;
}) {
  return (
    <div className={styles.editorGrid}>
      {stockOperationFields
        .filter((field) => form.rules[field].visible)
        .map((field) => {
          const rule = form.rules[field];
          if (
            (stockOperationRelationFields as readonly string[]).includes(field)
          ) {
            const relation =
              field as (typeof stockOperationRelationFields)[number];
            const selectedLabel = form.labels[relation];
            const name = selectedLabel ? selectedLabel[1] : undefined;
            return rule.readonly ? (
              <p key={field}>
                {stockOperationLabels[field]}: {name ?? 'Not set'}
              </p>
            ) : (
              <StockOperationChoice
                key={field}
                uid={uid}
                request={request}
                protocol={protocol}
                field={relation}
                label={stockOperationLabels[field]}
                value={form.values[relation]}
                name={name}
                disabled={disabled}
                change={(value) => change(field, value)}
                reconnect={reconnect}
              />
            );
          }
          const number = (
            stockOperationNumberFields as readonly string[]
          ).includes(field);
          const value = form.values[field];
          return (
            <TextInput
              key={field}
              id={`operation-${field}`}
              labelText={stockOperationLabels[field]}
              type={
                number
                  ? 'number'
                  : field === 'expiration_date'
                    ? 'datetime-local'
                    : 'text'
              }
              value={
                local[field] ??
                (value === false
                  ? ''
                  : field === 'expiration_date'
                    ? String(value).replace(' ', 'T')
                    : String(value))
              }
              readOnly={rule.readonly}
              disabled={disabled}
              step={
                number ? 'any' : field === 'expiration_date' ? 1 : undefined
              }
              helperText={
                field === 'expiration_date'
                  ? 'Enter UTC, not device local time.'
                  : 'Native rules apply when you leave this field.'
              }
              onChange={(event) => {
                if (!disabled && !rule.readonly)
                  edit(field, event.target.value);
              }}
              onBlur={() => blur(field)}
            />
          );
        })}
    </div>
  );
}
