import {
  Button,
  Checkbox,
  ComboBox,
  TextArea,
  TextInput,
} from '@bahmni/design-system';
import { useDebounce } from '@bahmni/widgets';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import styles from './BillingPage.module.scss';
import {
  BillingSessionExpired,
  getInventoryStoredFormChoices,
  type InventoryNativeForm,
  type InventoryStoredSelection,
  type InventoryHeaderEdit,
} from './billingService';

export function inventoryHeaderInputValue(
  type: string,
  raw: string,
): InventoryHeaderEdit['value'] {
  if (!raw) return false;
  if (['float', 'monetary', 'integer'].includes(type)) {
    const value = Number(raw);
    if (
      !raw.trim() ||
      !Number.isFinite(value) ||
      (type === 'integer' && !Number.isSafeInteger(value))
    )
      throw new Error(
        'Enter a finite native number, using a whole number for an integer field.',
      );
    return value;
  }
  if (type === 'datetime') {
    const value = raw.replace('T', ' ').replace(/\.0+$/, '');
    if (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}(:\d{2})?$/.test(value))
      throw new Error('Enter a UTC date and time with whole seconds.');
    return value.length === 16 ? value + ':00' : value;
  }
  return raw;
}

export function inventoryHeaderLabel(form: InventoryNativeForm, node: number) {
  const row = form.layout[node];
  const labels = form.label_nodes.filter((label) => label.visible);
  return (
    [
      row.label,
      labels.find(
        (label) => row.attributes.id && label.target === row.attributes.id,
      )?.label,
      labels.find((label) => label.target === row.field)?.label,
      form.fields[row.field].string,
    ].find(
      (label): label is string => typeof label === 'string' && label.length > 0,
    ) ?? row.field
  );
}
export const inventoryHeaderText = (value: unknown, fallback = '') =>
  typeof value === 'string' && value.length > 0 ? value : fallback;

function InventoryHeaderChoice({
  uid,
  selection,
  node,
  label,
  value,
  name,
  disabled,
  change,
  reconnect,
}: {
  uid: number;
  selection: InventoryStoredSelection;
  node: number;
  label: string;
  value: number | false;
  name?: string;
  disabled: boolean;
  change: (value: number | false) => void;
  reconnect: () => void;
}) {
  const [search, setSearch] = useState(''),
    [active, setActive] = useState(false),
    [offset, setOffset] = useState(0);
  const term = useDebounce(search, 250),
    searching = search !== term;
  const choices = useQuery({
    queryKey: [
      'billing',
      'inventory-header-choices',
      uid,
      selection,
      node,
      term,
      offset,
    ],
    queryFn: () => getInventoryStoredFormChoices(selection, node, term, offset),
    enabled: !disabled && active && !searching,
    retry: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
  const unavailable =
    disabled || searching || choices.isFetching || choices.isError;
  return (
    <div>
      <ComboBox<[number, string]>
        id={`inventory-header-choice-${node}`}
        titleText={label}
        items={unavailable ? [] : (choices.data?.page.rows ?? [])}
        itemToString={(item) => item?.[1] ?? ''}
        selectedItem={value ? [value, name ?? `Record ${value}`] : null}
        shouldFilterItem={() => true}
        disabled={disabled}
        onFocus={() => setActive(true)}
        invalid={choices.isError}
        invalidText={choices.error?.message}
        helperText={
          choices.isFetching || searching
            ? 'Searching native records...'
            : 'Select a record returned by the native field search.'
        }
        onInputChange={(value) => {
          setActive(true);
          setSearch(value);
          setOffset(0);
        }}
        onChange={({ selectedItem }) => {
          if (disabled) return;
          if (selectedItem === null && value !== false) change(false);
          else if (
            !unavailable &&
            selectedItem &&
            selectedItem[0] !== value &&
            choices.data?.page.rows.some((row) => row[0] === selectedItem[0])
          )
            change(selectedItem[0]);
        }}
      />
      <div className={styles.toolbar}>
        {offset > 0 ? (
          <Button
            kind="tertiary"
            disabled={unavailable}
            onClick={() => setOffset((value) => Math.max(0, value - 25))}
          >
            Previous {label.toLowerCase()} choices
          </Button>
        ) : null}
        {choices.data?.page.has_more ? (
          <Button
            kind="tertiary"
            disabled={unavailable}
            onClick={() => setOffset((value) => value + 25)}
          >
            More {label.toLowerCase()} choices
          </Button>
        ) : null}
        {choices.error instanceof BillingSessionExpired ? (
          <Button kind="tertiary" onClick={reconnect}>
            Reconnect Billing
          </Button>
        ) : choices.isError ? (
          <Button
            kind="tertiary"
            disabled={disabled || choices.isFetching}
            onClick={() => void choices.refetch()}
          >
            Reload {label.toLowerCase()} choices
          </Button>
        ) : null}
      </div>
    </div>
  );
}

export function InventoryHeaderFields({
  uid,
  form,
  selection,
  local,
  disabled,
  edit,
  blur,
  change,
  reconnect,
}: {
  uid: number;
  form: InventoryNativeForm;
  selection: InventoryStoredSelection;
  local: Record<number, string>;
  disabled: boolean;
  edit: (node: number, value: string) => void;
  blur: (node: number) => void;
  change: (node: number, value: InventoryHeaderEdit['value']) => void;
  reconnect: () => void;
}) {
  return (
    <div className={styles.editorGrid}>
      {Array.from(form.layout.entries()).map(([node, row]) => {
        if (!row.rules.visible) return null;
        const field = form.fields[row.field],
          label = inventoryHeaderLabel(form, node),
          value = form.values[row.field];
        const id = `inventory-header-${node}`,
          readonly = row.rules.readonly || row.field === 'id';
        const path = row.containers
          .map((parent) => parent.label)
          .filter(Boolean)
          .join(' / ');
        const selections = Array.isArray(field.selection)
          ? field.selection.filter(
              (item): item is [string | number, string] =>
                Array.isArray(item) &&
                item.length === 2 &&
                ['string', 'number'].includes(typeof item[0]) &&
                typeof item[1] === 'string',
            )
          : [];
        let control;
        // shortcut: custom native widgets use scalar controls; add their action-aware adapters before parity acceptance.
        if (form.collections.includes(row.field))
          control = (
            <p>
              {label}: direct collection editing is not available here. Header
              changes can affect linked rows; inspect the complete Save review.
              Stock rows use separate transfer and detailed-operation workflows.
              Collection-specific interfaces still need integration.
            </p>
          );
        else if (readonly)
          control = (
            <p>
              {label}:{' '}
              {field.type === 'many2one'
                ? (form.labels[row.field]?.[1] ?? 'Not set')
                : field.type === 'boolean'
                  ? value
                    ? 'Yes'
                    : 'No'
                  : field.type === 'selection'
                    ? (selections.find((item) => item[0] === value)?.[1] ??
                      (value === false || value == null
                        ? 'Not set'
                        : String(value)))
                    : value === false || value === undefined || value === null
                      ? 'Not set'
                      : String(value)}
            </p>
          );
        else if (field.type === 'many2one')
          control = (
            <InventoryHeaderChoice
              key={form.version}
              uid={uid}
              selection={selection}
              node={node}
              label={label}
              value={typeof value === 'number' ? value : false}
              name={form.labels[row.field]?.[1]}
              disabled={disabled}
              change={(value) => change(node, value)}
              reconnect={reconnect}
            />
          );
        else if (field.type === 'boolean')
          control = (
            <Checkbox
              id={id}
              labelText={label}
              checked={value === true}
              disabled={disabled}
              aria-required={row.rules.required}
              onChange={(_event, { checked }) => {
                if (!disabled) change(node, checked);
              }}
            />
          );
        else if (field.type === 'selection')
          control = (
            <label htmlFor={id}>
              {label}
              {row.rules.required ? ' (required)' : ''}
              <select
                id={id}
                disabled={disabled}
                aria-required={row.rules.required}
                value={
                  value === false
                    ? ''
                    : String(selections.findIndex((item) => item[0] === value))
                }
                onChange={(event) => {
                  if (
                    !disabled &&
                    (event.target.value === '' ||
                      selections[Number(event.target.value)])
                  )
                    change(
                      node,
                      event.target.value === ''
                        ? false
                        : selections[Number(event.target.value)][0],
                    );
                }}
              >
                <option value="">Not set</option>
                {value !== false &&
                value != null &&
                !selections.some((item) => item[0] === value) ? (
                  <option value="-1" disabled>
                    Current native value: {String(value)} (not offered)
                  </option>
                ) : null}
                {selections.map(([key, name], index) => (
                  <option key={`${typeof key}:${key}`} value={index}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
          );
        else if (['text', 'html'].includes(field.type))
          control = (
            <TextArea
              id={id}
              labelText={label}
              disabled={disabled}
              value={local[node] ?? (typeof value === 'string' ? value : '')}
              aria-required={row.rules.required}
              helperText={
                field.type === 'html'
                  ? 'HTML source is preserved as text, never executed. A rich-text editor is not integrated yet.'
                  : (row.attributes.help ?? inventoryHeaderText(field.help))
              }
              onChange={(event) => {
                if (!disabled) edit(node, event.target.value);
              }}
              onBlur={() => blur(node)}
            />
          );
        else
          control = (
            <TextInput
              id={id}
              labelText={field.type === 'datetime' ? `${label} (UTC)` : label}
              type={
                ['float', 'monetary', 'integer'].includes(field.type)
                  ? 'number'
                  : field.type === 'datetime'
                    ? 'datetime-local'
                    : field.type === 'date'
                      ? 'date'
                      : 'text'
              }
              step={
                field.type === 'integer' || field.type === 'datetime'
                  ? 1
                  : ['float', 'monetary'].includes(field.type)
                    ? 'any'
                    : undefined
              }
              disabled={disabled}
              aria-required={row.rules.required}
              placeholder={row.attributes.placeholder}
              helperText={
                field.type === 'datetime'
                  ? `Enter UTC, not device-local time. The native account time zone is ${form.timezone}.`
                  : (row.attributes.help ?? inventoryHeaderText(field.help))
              }
              value={
                local[node] ??
                (value === false || value == null
                  ? ''
                  : field.type === 'datetime'
                    ? String(value).replace(' ', 'T')
                    : String(value))
              }
              onChange={(event) => {
                if (!disabled) edit(node, event.target.value);
              }}
              onBlur={() => blur(node)}
            />
          );
        return (
          <div key={node}>
            {path ? <p className={styles.note}>{path}</p> : null}
            {control}
          </div>
        );
      })}
    </div>
  );
}
