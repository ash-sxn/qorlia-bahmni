import { Button, Modal, TextInput, TextArea } from '@bahmni/design-system';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { money } from './billingFormat';
import styles from './BillingPage.module.scss';
import {
  BillingDraft,
  BillingSessionExpired,
  DraftChoiceKind,
  DraftLine,
  getBillingDraft,
  previewBillingDraft,
  saveBillingDraft,
} from './billingService';
import { DraftChoiceInput } from './DraftChoiceInput';

type Change = { field: string; line?: number };
type Props = {
  uid: number;
  orderId: number | false;
  close: () => void;
  saved: (draft: BillingDraft) => void;
  reconnect: () => void;
};

export function DraftOrderEditor(props: Props) {
  const loaded = useQuery({
    queryKey: ['billing', 'draft', props.uid, props.orderId],
    queryFn: () => getBillingDraft(props.orderId),
    retry: false,
    refetchOnMount: 'always',
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
  if (loaded.isFetching)
    return <p role="status">Loading quotation editor...</p>;
  if (loaded.isError || !loaded.data)
    return (
      <section className={styles.card} role="alert">
        <p>{loaded.error?.message ?? 'The draft could not be loaded.'}</p>
        <Button kind="tertiary" onClick={() => void loaded.refetch()}>
          Retry editor
        </Button>
        <Button kind="ghost" onClick={props.close}>
          Back to charge orders
        </Button>
        {loaded.error instanceof BillingSessionExpired ? (
          <Button onClick={props.reconnect}>Reconnect Billing</Button>
        ) : null}
      </section>
    );
  return (
    <DraftForm
      key={`${props.orderId}:${loaded.data.version}`}
      {...props}
      initial={loaded.data}
    />
  );
}

function DraftForm({
  initial,
  uid,
  close,
  saved,
  reconnect,
}: Omit<Props, 'orderId'> & { initial: BillingDraft }) {
  const [draft, setDraft] = useState(initial);
  const [requestKey] = useState(() => crypto.randomUUID());
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [dirty, setDirty] = useState(false);
  const [pendingChange, setPendingChange] = useState<Change | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [discard, setDiscard] = useState(false);
  const lineKeys = useRef(initial.lines.map(() => crypto.randomUUID()));
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);
  const label = (model: string, id: number | false) =>
    id ? draft.labels[`${model}:${id}`] : '';
  const currency = draft.labels[`res.currency:${draft.totals.currency_id}`];
  const edited = (next: BillingDraft, change: Change) => {
    setDraft(next);
    setDirty(true);
    setPendingChange(change);
    setError(null);
  };
  const calculate = async (next: BillingDraft, change: Change) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError(null);
    setDraft(next);
    setDirty(true);
    setPendingChange(change);
    try {
      setDraft(await previewBillingDraft(next, change));
      setPendingChange(null);
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure
          : new Error('Pricing failed. Retry calculation.'),
      );
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };
  const header = <K extends keyof BillingDraft['values']>(
    field: K,
    value: BillingDraft['values'][K],
    immediate = false,
  ) => {
    const next = { ...draft, values: { ...draft.values, [field]: value } };
    if (immediate) void calculate(next, { field });
    else edited(next, { field });
  };
  const item = <K extends keyof DraftLine['values']>(
    index: number,
    field: K,
    value: DraftLine['values'][K],
    immediate = false,
  ) => {
    const next = {
      ...draft,
      lines: draft.lines.map((line, i) =>
        i === index
          ? { ...line, values: { ...line.values, [field]: value } }
          : line,
      ),
    };
    if (immediate) void calculate(next, { field, line: index });
    else edited(next, { field, line: index });
  };
  const blur = () => {
    if (pendingChange) void calculate(draft, pendingChange);
  };
  const choice = (
    id: string,
    title: string,
    kind: DraftChoiceKind,
    model: string,
    value: number | false,
    onChange: (value: number | false) => void,
    productId: number | false = false,
  ) => (
    <DraftChoiceInput
      key={`${id}:${value}`}
      id={id}
      label={title}
      kind={kind}
      uid={uid}
      value={value}
      name={label(model, value)}
      shopId={draft.values.shop_id}
      productId={productId}
      disabled={busy}
      onChange={onChange}
      reconnect={reconnect}
    />
  );
  const number = (
    id: string,
    title: string,
    value: number,
    onChange: (value: number) => void,
    min = 0,
    max?: number,
  ) => (
    <TextInput
      id={id}
      labelText={title}
      type="number"
      min={min}
      max={max}
      step="any"
      value={Number.isFinite(value) ? value : ''}
      onChange={(event) =>
        onChange(event.target.value === '' ? NaN : Number(event.target.value))
      }
      onBlur={blur}
      disabled={busy}
    />
  );
  const add = (displayType: DraftLine['values']['display_type']) => {
    lineKeys.current.push(crypto.randomUUID());
    const line: DraftLine = {
      id: false,
      values: {
        product_id: false,
        name: '',
        display_type: displayType,
        sequence: (draft.lines.length + 1) * 10,
        product_uom: false,
        product_uom_qty: displayType ? 0 : 1,
        price_unit: 0,
        discount: 0,
        tax_id: [],
        lot_id: false,
        expiry_date: false,
        analytic_distribution: false,
      },
      totals: { price_subtotal: 0, price_tax: 0, price_total: 0 },
    };
    void calculate(
      { ...draft, lines: [...draft.lines, line] },
      { field: 'order_line' },
    );
  };
  const save = async () => {
    if (busyRef.current || pendingChange) return;
    busyRef.current = true;
    setBusy(true);
    setError(null);
    try {
      const result = await saveBillingDraft(draft, requestKey);
      setDirty(false);
      saved(result);
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure
          : new Error('Save failed. Your entries remain here.'),
      );
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };
  return (
    <Modal
      open
      passiveModal
      size="lg"
      modalHeading="Draft quotation editor"
      preventCloseOnClickOutside
      onRequestClose={() => {
        if (!busy) {
          if (dirty) setDiscard(true);
          else close();
        }
      }}
    >
      {discard ? (
        <div role="alert">
          <h3>Discard unsaved quotation changes?</h3>
          <p>The unsaved entries in this editor will be lost.</p>
          <Button kind="danger" onClick={close}>
            Discard changes
          </Button>
          <Button kind="tertiary" onClick={() => setDiscard(false)}>
            Keep editing
          </Button>
        </div>
      ) : (
        <section className={styles.card} aria-label="Quotation editor">
          <p className={styles.eyebrow}>DRAFT QUOTATION</p>
          <h2>{draft.name}</h2>
          <p>
            Saving creates or updates a draft only. It does not issue an
            invoice, collect money or dispense stock.
          </p>
          {busy ? <p role="status">Checking Billing...</p> : null}
          {error ? (
            <div role="alert">
              <p>{error.message}</p>
              {error instanceof BillingSessionExpired ? (
                <Button onClick={reconnect}>Reconnect Billing</Button>
              ) : null}
            </div>
          ) : null}
          {draft.warning ? (
            <p role="alert">
              {draft.warning.title ? `${draft.warning.title}: ` : ''}
              {draft.warning.message}
            </p>
          ) : null}
          <div className={styles.editorGrid}>
            {choice(
              'draft-customer',
              'Customer',
              'customer',
              'res.partner',
              draft.values.partner_id,
              (id) => header('partner_id', id, true),
            )}
            {choice(
              'draft-shop',
              'Shop',
              'shop',
              'sale.shop',
              draft.values.shop_id,
              (id) => header('shop_id', id, true),
            )}
            <TextInput
              id="draft-reference"
              labelText="Reference"
              value={draft.values.client_order_ref || ''}
              disabled={busy}
              onChange={(event) =>
                header('client_order_ref', event.target.value)
              }
              onBlur={blur}
            />
            <TextInput
              id="draft-provider"
              labelText="Provider"
              value={draft.values.provider_name || ''}
              disabled={busy}
              onChange={(event) => header('provider_name', event.target.value)}
              onBlur={blur}
            />
            <label className={styles.select}>
              Care setting
              <select
                value={draft.values.care_setting || ''}
                disabled={busy}
                onChange={(event) =>
                  header(
                    'care_setting',
                    (event.target.value ||
                      false) as BillingDraft['values']['care_setting'],
                    true,
                  )
                }
              >
                <option value="">Not set</option>
                <option value="opd">OPD</option>
                <option value="ipd">IPD</option>
              </select>
            </label>
            {choice(
              'draft-pricelist',
              'Pricelist',
              'pricelist',
              'product.pricelist',
              draft.values.pricelist_id,
              (id) => header('pricelist_id', id, true),
            )}
            {choice(
              'draft-term',
              'Payment terms',
              'payment_term',
              'account.payment.term',
              draft.values.payment_term_id,
              (id) => header('payment_term_id', id, true),
            )}
          </div>
          <p className={styles.note}>
            Warehouse:{' '}
            {label('stock.warehouse', draft.values.warehouse_id) || 'Not set'}.
            Stock location:{' '}
            {label('stock.location', draft.values.location_id) || 'Not set'}.
          </p>
          <h3>Products and services</h3>
          {draft.lines.map((line, index) => (
            <fieldset
              key={lineKeys.current[index]}
              className={styles.draftItem}
              disabled={busy}
            >
              <legend>
                {line.values.display_type === 'line_section'
                  ? 'Section'
                  : line.values.display_type === 'line_note'
                    ? 'Note'
                    : 'Item'}{' '}
                {index + 1}
              </legend>
              <div className={styles.editorGrid}>
                {!line.values.display_type
                  ? choice(
                      `product-${index}`,
                      'Product or service',
                      'product',
                      'product.product',
                      line.values.product_id,
                      (id) => item(index, 'product_id', id, true),
                    )
                  : null}
                <TextInput
                  id={`name-${index}`}
                  labelText="Description"
                  value={line.values.name || ''}
                  onChange={(event) => item(index, 'name', event.target.value)}
                  onBlur={blur}
                />
                {!line.values.display_type ? (
                  <>
                    {number(
                      `qty-${index}`,
                      'Quantity',
                      line.values.product_uom_qty,
                      (value) => item(index, 'product_uom_qty', value),
                    )}
                    {choice(
                      `unit-${index}`,
                      'Unit',
                      'unit',
                      'uom.uom',
                      line.values.product_uom,
                      (id) => item(index, 'product_uom', id, true),
                    )}
                    {number(
                      `price-${index}`,
                      `Unit price (${currency})`,
                      line.values.price_unit,
                      (value) => item(index, 'price_unit', value),
                    )}
                    {number(
                      `discount-${index}`,
                      'Line discount (%)',
                      line.values.discount,
                      (value) => item(index, 'discount', value),
                      0,
                      100,
                    )}
                    {choice(
                      `tax-${index}`,
                      'Add tax',
                      'tax',
                      'account.tax',
                      false,
                      (id) => {
                        if (id && !line.values.tax_id.includes(id))
                          item(
                            index,
                            'tax_id',
                            [...line.values.tax_id, id],
                            true,
                          );
                      },
                    )}
                    {line.values.product_id && draft.values.shop_id
                      ? choice(
                          `lot-${index}`,
                          'Batch',
                          'lot',
                          'stock.lot',
                          line.values.lot_id,
                          (id) => item(index, 'lot_id', id, true),
                          line.values.product_id,
                        )
                      : null}
                  </>
                ) : null}
              </div>
              {line.values.tax_id.map((id) => (
                <Button
                  key={id}
                  kind="ghost"
                  onClick={() =>
                    item(
                      index,
                      'tax_id',
                      line.values.tax_id.filter((tax) => tax !== id),
                      true,
                    )
                  }
                >
                  Remove tax {label('account.tax', id) || id}
                </Button>
              ))}
              {!line.values.display_type && !pendingChange ? (
                <p>
                  Line total: {money(line.totals.price_total, currency)}
                  {line.values.expiry_date
                    ? ` · Batch expiry (UTC): ${line.values.expiry_date}`
                    : ''}
                </p>
              ) : null}
              <Button
                kind="danger--tertiary"
                onClick={() => {
                  lineKeys.current.splice(index, 1);
                  void calculate(
                    {
                      ...draft,
                      lines: draft.lines.filter((_, i) => i !== index),
                    },
                    { field: 'order_line' },
                  );
                }}
              >
                Remove item {index + 1}
              </Button>
            </fieldset>
          ))}
          <div className={styles.toolbar}>
            <Button
              kind="tertiary"
              disabled={
                busy || !draft.values.partner_id || !draft.values.shop_id
              }
              onClick={() => add(false)}
            >
              Add product or service
            </Button>
            <Button
              kind="ghost"
              disabled={busy}
              onClick={() => add('line_section')}
            >
              Add section
            </Button>
            <Button
              kind="ghost"
              disabled={busy}
              onClick={() => add('line_note')}
            >
              Add note
            </Button>
          </div>
          <h3>Document discount</h3>
          <div className={styles.editorGrid}>
            <label className={styles.select}>
              Discount type
              <select
                value={draft.values.discount_type}
                disabled={busy}
                onChange={(event) =>
                  header(
                    'discount_type',
                    event.target
                      .value as BillingDraft['values']['discount_type'],
                    true,
                  )
                }
              >
                <option value="none">None</option>
                <option value="fixed">Fixed amount</option>
                <option value="percentage">Percentage</option>
              </select>
            </label>
            {draft.values.discount_type === 'fixed'
              ? number(
                  'fixed-discount',
                  `Discount (${currency})`,
                  draft.values.discount,
                  (value) => header('discount', value),
                )
              : null}
            {draft.values.discount_type === 'percentage'
              ? number(
                  'percent-discount',
                  'Document discount (%)',
                  draft.values.discount_percentage,
                  (value) => header('discount_percentage', value),
                  0,
                  100,
                )
              : null}
            {draft.values.discount_type !== 'none'
              ? choice(
                  'draft-account',
                  'Discount account head',
                  'discount_account',
                  'account.account',
                  draft.values.disc_acc_id,
                  (id) => header('disc_acc_id', id, true),
                )
              : null}
          </div>
          <TextArea
            id="draft-note"
            labelText="Order notes"
            value={draft.values.note || ''}
            disabled={busy}
            onChange={(event) => header('note', event.target.value)}
            onBlur={blur}
          />
          {pendingChange ? (
            <p role="status">Totals need recalculation before saving.</p>
          ) : (
            <dl className={styles.totals}>
              <dt>Items after line discounts</dt>
              <dd>{money(draft.totals.amount_untaxed, currency)}</dd>
              <dt>Taxes</dt>
              <dd>{money(draft.totals.amount_tax, currency)}</dd>
              <dt>Document discount</dt>
              <dd>{money(draft.values.discount, currency)}</dd>
              <dt>Rounding adjustment</dt>
              <dd>{money(draft.totals.round_off_amount, currency)}</dd>
              <dt>Final quotation total</dt>
              <dd>{money(draft.totals.amount_total, currency)}</dd>
            </dl>
          )}
          <div className={styles.toolbar}>
            {pendingChange ? (
              <Button
                kind="tertiary"
                disabled={busy}
                onClick={() => void calculate(draft, pendingChange)}
              >
                Recalculate totals
              </Button>
            ) : null}
            <Button
              disabled={
                busy ||
                !!pendingChange ||
                !dirty ||
                !draft.values.partner_id ||
                !draft.values.shop_id ||
                !draft.lines.some(
                  (line) => !line.values.display_type && line.values.product_id,
                )
              }
              onClick={() => void save()}
            >
              Save draft quotation
            </Button>
            <Button
              kind="ghost"
              disabled={busy}
              onClick={() => (dirty ? setDiscard(true) : close())}
            >
              Back to charge orders
            </Button>
          </div>
        </section>
      )}
    </Modal>
  );
}
