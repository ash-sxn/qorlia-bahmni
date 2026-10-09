import { Button, Modal, TextInput, TextArea } from '@bahmni/design-system';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { invoiceName, money } from './billingFormat';
import styles from './BillingPage.module.scss';
import {
  BillingSessionExpired,
  InvoiceDraft,
  InvoiceDraftChoiceKind,
  InvoiceDraftLine,
  getInvoiceDraft,
  previewInvoiceDraft,
  saveInvoiceDraft,
} from './billingService';
import { DraftChoiceInput } from './DraftChoiceInput';

type Change = { field: string; line?: number };
type Props = {
  uid: number;
  invoiceId: number | false;
  close: () => void;
  saved: (draft: InvoiceDraft) => void;
  reconnect: () => void;
};

export function InvoiceDraftEditor(props: Props) {
  const loaded = useQuery({
    queryKey: ['billing', 'invoice-draft', props.uid, props.invoiceId],
    queryFn: () => getInvoiceDraft(props.invoiceId),
    retry: false,
    refetchOnMount: 'always',
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
  if (loaded.isFetching) return <p role="status">Loading invoice editor...</p>;
  if (loaded.isError || !loaded.data)
    return (
      <section className={styles.card} role="alert">
        <p>
          {loaded.error?.message ?? 'The invoice draft could not be loaded.'}
        </p>
        <Button kind="tertiary" onClick={() => void loaded.refetch()}>
          Retry editor
        </Button>
        <Button kind="ghost" onClick={props.close}>
          Back to invoices
        </Button>
        {loaded.error instanceof BillingSessionExpired ? (
          <Button onClick={props.reconnect}>Reconnect Billing</Button>
        ) : null}
      </section>
    );
  return (
    <InvoiceForm
      key={`${props.invoiceId}:${loaded.data.version}`}
      {...props}
      initial={loaded.data}
    />
  );
}

function InvoiceForm({
  initial,
  uid,
  close,
  saved,
  reconnect,
}: Omit<Props, 'invoiceId'> & { initial: InvoiceDraft }) {
  const [draft, setDraft] = useState(initial);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [dirty, setDirty] = useState(false);
  const [pending, setPending] = useState<Change | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [discard, setDiscard] = useState<'close' | 'reconnect' | null>(null);
  const [unconfirmedSave, setUnconfirmedSave] = useState(false);
  const creationKey = useRef<string | null>(null);
  const lineKeys = useRef(initial.lines.map(() => crypto.randomUUID()));
  const disabled = busy || unconfirmedSave || !draft.can_edit;
  const requestReconnect = () => {
    if (busyRef.current) return;
    if (dirty) setDiscard('reconnect');
    else reconnect();
  };
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
  const currency =
    label('res.currency', draft.values.currency_id) || 'Currency not set';
  const changed = (next: InvoiceDraft, change: Change) => {
    if (busyRef.current || unconfirmedSave || !draft.can_edit) return;
    setDraft({ ...next, review_version: undefined });
    setPending(change);
    setDirty(true);
    setError(null);
  };
  const calculate = async (next: InvoiceDraft, change: Change) => {
    if (busyRef.current || unconfirmedSave || !draft.can_edit) return;
    busyRef.current = true;
    // Preserve the user's entries even when native validation rejects this preview.
    setDraft({ ...next, review_version: undefined });
    setPending(change);
    setDirty(true);
    setBusy(true);
    setError(null);
    try {
      setDraft(await previewInvoiceDraft(next, change));
      setPending(null);
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure
          : new Error('Calculation failed. Your entries remain here.'),
      );
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };
  const header = <K extends keyof InvoiceDraft['values']>(
    field: K,
    value: InvoiceDraft['values'][K],
    immediate = false,
  ) => {
    const next = { ...draft, values: { ...draft.values, [field]: value } };
    if (immediate) void calculate(next, { field });
    else changed(next, { field });
  };
  const item = <K extends keyof InvoiceDraftLine['values']>(
    index: number,
    field: K,
    value: InvoiceDraftLine['values'][K],
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
    else changed(next, { field, line: index });
  };
  const blur = () => {
    if (pending) void calculate(draft, pending);
  };
  const choice = (
    id: string,
    title: string,
    kind: InvoiceDraftChoiceKind,
    model: string,
    value: number | false,
    onChange: (value: number | false) => void,
    productId: number | false = false,
    locked = false,
  ) => (
    <DraftChoiceInput
      key={`${id}:${value}`}
      id={id}
      label={title}
      kind={kind}
      uid={uid}
      invoiceId={draft.id}
      value={value}
      name={label(model, value)}
      productId={productId}
      disabled={disabled || locked}
      onChange={onChange}
      reconnect={requestReconnect}
    />
  );
  const text = (
    field: keyof InvoiceDraft['values'],
    title: string,
    type = 'text',
  ) => (
    <TextInput
      id={`invoice-${field}`}
      labelText={title}
      type={type}
      value={String(draft.values[field] || '')}
      disabled={disabled}
      onChange={(event) => header(field, event.target.value || false)}
      onBlur={blur}
    />
  );
  const number = (
    id: string,
    title: string,
    value: number,
    onChange: (value: number) => void,
    max?: number,
  ) => (
    <TextInput
      id={id}
      labelText={title}
      type="number"
      step="any"
      max={max}
      value={Number.isFinite(value) ? value : ''}
      disabled={disabled}
      onChange={(event) =>
        onChange(event.target.value === '' ? NaN : Number(event.target.value))
      }
      onBlur={blur}
    />
  );
  const add = (displayType: InvoiceDraftLine['values']['display_type']) => {
    lineKeys.current.push(crypto.randomUUID());
    const line: InvoiceDraftLine = {
      id: false,
      values: {
        product_id: false,
        name: '',
        display_type: displayType,
        sequence: (draft.lines.length + 1) * 10,
        account_id: false,
        product_uom_id: false,
        quantity: displayType === 'product' ? 1 : 0,
        price_unit: 0,
        discount: 0,
        tax_ids: [],
        analytic_distribution: false,
      },
      totals: { price_subtotal: 0, price_total: 0 },
    };
    // A new manual line needs its account/product before native validation can run.
    changed(
      { ...draft, lines: [...draft.lines, line] },
      { field: 'invoice_line_ids' },
    );
  };
  const save = async () => {
    if (busyRef.current || pending || !draft.review_version || !draft.can_edit)
      return;
    busyRef.current = true;
    setBusy(true);
    setError(null);
    try {
      if (draft.id === false && !creationKey.current)
        creationKey.current = crypto.randomUUID();
      const result =
        draft.id === false
          ? await saveInvoiceDraft(draft, creationKey.current!)
          : await saveInvoiceDraft(draft);
      setDirty(false);
      saved(result);
    } catch (failure) {
      if (draft.id === false) setUnconfirmedSave(true);
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
  const requestClose = () => {
    if (!busyRef.current) {
      if (dirty) setDiscard('close');
      else close();
    }
  };
  return (
    <Modal
      open
      passiveModal
      size="lg"
      modalHeading={`Draft ${draft.move_type === 'out_refund' ? 'credit note' : 'invoice'} editor`}
      preventCloseOnClickOutside
      onRequestClose={requestClose}
    >
      {discard ? (
        <div role="alert">
          <h3>Discard unsaved invoice changes?</h3>
          <p>
            {unconfirmedSave
              ? 'The save result is unconfirmed. This invoice may already exist. Check the invoice list before creating another one.'
              : 'The unsaved entries in this editor will be lost.'}
            {discard === 'reconnect'
              ? ' Reconnecting opens Billing sign-in and reloads the saved draft.'
              : ''}
          </p>
          <Button
            kind="danger"
            onClick={discard === 'reconnect' ? reconnect : close}
          >
            {discard === 'reconnect'
              ? 'Discard changes and reconnect'
              : 'Discard changes'}
          </Button>
          <Button kind="tertiary" onClick={() => setDiscard(null)}>
            Keep editing
          </Button>
        </div>
      ) : (
        <section className={styles.card} aria-label="Invoice draft editor">
          <p className={styles.eyebrow}>
            DRAFT {draft.move_type === 'out_refund' ? 'CREDIT NOTE' : 'INVOICE'}
          </p>
          <h2>{invoiceName(draft)}</h2>
          <p>{draft.company[1]}</p>
          <p>
            {draft.id === false
              ? 'Save creates a new draft only.'
              : 'Save updates this draft only.'}{' '}
            Posting, payments and credit allocation are separate actions.
          </p>
          {!draft.can_edit ? (
            <p role="alert">
              Your Billing account can view this draft but cannot edit it.
            </p>
          ) : null}
          {busy ? (
            <p role="status">Checking native Billing calculations...</p>
          ) : null}
          {error ? (
            <div role="alert">
              <p>{error.message}</p>
              {error instanceof BillingSessionExpired ? (
                <Button onClick={requestReconnect}>Reconnect Billing</Button>
              ) : null}
            </div>
          ) : null}
          {unconfirmedSave ? (
            <div role="alert">
              <p>
                The save did not return a confirmed result. Entries are locked
                to prevent a duplicate invoice. Retry the same save request, or
                check the invoice list before starting again.
              </p>
              <Button disabled={busy} onClick={() => void save()}>
                Retry same invoice save
              </Button>
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
              'invoice-customer',
              'Customer',
              'customer',
              'res.partner',
              draft.values.partner_id,
              (id) => header('partner_id', id, true),
            )}
            {text('ref', 'Reference')}
            {text('invoice_date', 'Invoice date', 'date')}
            {text('date', 'Accounting date', 'date')}
            {choice(
              'invoice-term',
              'Payment terms',
              'payment_term',
              'account.payment.term',
              draft.values.invoice_payment_term_id,
              (id) => header('invoice_payment_term_id', id, true),
            )}
            {!draft.values.invoice_payment_term_id ? (
              text('invoice_date_due', 'Due date', 'date')
            ) : (
              <p className={styles.note}>
                Payment terms determine the instalment dates.
              </p>
            )}
            {choice(
              'invoice-currency',
              'Currency',
              'currency',
              'res.currency',
              draft.values.currency_id,
              (id) => header('currency_id', id, true),
            )}
            {choice(
              'invoice-journal',
              'Sales journal',
              'journal',
              'account.journal',
              draft.values.journal_id,
              (id) => header('journal_id', id, true),
              false,
              draft.journal_locked,
            )}
          </div>
          {draft.journal_locked ? (
            <p className={styles.note}>
              Previously posted documents keep their original journal.
            </p>
          ) : null}
          <h3>Products and services</h3>
          {draft.lines.map((line, index) => (
            <fieldset
              key={lineKeys.current[index]}
              className={styles.draftItem}
              disabled={disabled}
            >
              <legend>
                {line.values.display_type === 'product'
                  ? 'Item'
                  : line.values.display_type === 'line_section'
                    ? 'Section'
                    : 'Note'}{' '}
                {index + 1}
              </legend>
              <div className={styles.editorGrid}>
                {line.values.display_type === 'product'
                  ? choice(
                      `invoice-product-${index}`,
                      'Product or service',
                      'product',
                      'product.product',
                      line.values.product_id,
                      (id) => item(index, 'product_id', id, true),
                    )
                  : null}
                <TextInput
                  id={`invoice-name-${index}`}
                  labelText="Description"
                  value={line.values.name || ''}
                  onChange={(event) => item(index, 'name', event.target.value)}
                  onBlur={blur}
                />
                {number(
                  `invoice-sequence-${index}`,
                  'Sequence',
                  line.values.sequence,
                  (value) => item(index, 'sequence', value),
                )}
                {line.values.display_type === 'product' ? (
                  <>
                    {choice(
                      `invoice-account-${index}`,
                      'Line account',
                      'account',
                      'account.account',
                      line.values.account_id,
                      (id) => item(index, 'account_id', id, true),
                    )}
                    {number(
                      `invoice-qty-${index}`,
                      'Quantity',
                      line.values.quantity,
                      (value) => item(index, 'quantity', value),
                    )}
                    {choice(
                      `invoice-unit-${index}`,
                      'Unit',
                      'unit',
                      'uom.uom',
                      line.values.product_uom_id,
                      (id) => item(index, 'product_uom_id', id, true),
                      line.values.product_id,
                    )}
                    {number(
                      `invoice-price-${index}`,
                      `Unit price (${currency})`,
                      line.values.price_unit,
                      (value) => item(index, 'price_unit', value),
                    )}
                    {number(
                      `invoice-line-discount-${index}`,
                      'Line discount (%)',
                      line.values.discount,
                      (value) => item(index, 'discount', value),
                      100,
                    )}
                    {choice(
                      `invoice-tax-${index}`,
                      'Add tax',
                      'tax',
                      'account.tax',
                      false,
                      (id) => {
                        if (id && !line.values.tax_ids.includes(id))
                          item(
                            index,
                            'tax_ids',
                            [...line.values.tax_ids, id],
                            true,
                          );
                      },
                    )}
                  </>
                ) : null}
              </div>
              {line.values.tax_ids.map((id) => (
                <Button
                  key={id}
                  kind="ghost"
                  disabled={disabled}
                  onClick={() =>
                    item(
                      index,
                      'tax_ids',
                      line.values.tax_ids.filter((tax) => tax !== id),
                      true,
                    )
                  }
                >
                  Remove tax {label('account.tax', id) || id}
                </Button>
              ))}
              {line.values.display_type === 'product' ? (
                <details>
                  <summary>Analytic allocation</summary>
                  <p className={styles.note}>
                    Native analytic accounts and percentages. Combined-plan keys
                    are preserved.
                  </p>
                  {Object.entries(line.values.analytic_distribution || {}).map(
                    ([key, percentage]) => (
                      <div key={key} className={styles.toolbar}>
                        {number(
                          `invoice-analytic-${index}-${key}`,
                          key
                            .split(',')
                            .map(
                              (id) =>
                                label('account.analytic.account', Number(id)) ||
                                `Account ${id}`,
                            )
                            .join(' / '),
                          percentage,
                          (value) =>
                            item(index, 'analytic_distribution', {
                              ...(line.values.analytic_distribution || {}),
                              [key]: value,
                            }),
                          100,
                        )}
                        <Button
                          kind="ghost"
                          disabled={disabled}
                          onClick={() => {
                            const remaining = {
                              ...(line.values.analytic_distribution || {}),
                            };
                            delete remaining[key];
                            item(
                              index,
                              'analytic_distribution',
                              Object.keys(remaining).length ? remaining : false,
                              true,
                            );
                          }}
                        >
                          Remove analytic allocation
                        </Button>
                      </div>
                    ),
                  )}
                  {choice(
                    `invoice-analytic-add-${index}`,
                    'Add analytic account',
                    'analytic',
                    'account.analytic.account',
                    false,
                    (id) => {
                      if (id)
                        item(
                          index,
                          'analytic_distribution',
                          {
                            ...(line.values.analytic_distribution || {}),
                            [id]: 100,
                          },
                          true,
                        );
                    },
                  )}
                </details>
              ) : null}
              {line.values.display_type === 'product' && !pending ? (
                <p>Line total: {money(line.totals.price_total, currency)}</p>
              ) : null}
              <Button
                kind="danger--tertiary"
                disabled={disabled}
                onClick={() => {
                  lineKeys.current.splice(index, 1);
                  void calculate(
                    {
                      ...draft,
                      lines: draft.lines.filter((_, i) => i !== index),
                    },
                    { field: 'invoice_line_ids' },
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
              disabled={disabled || draft.lines.length >= 500}
              onClick={() => add('product')}
            >
              Add product or service
            </Button>
            <Button
              kind="ghost"
              disabled={disabled || draft.lines.length >= 500}
              onClick={() => add('line_section')}
            >
              Add section
            </Button>
            <Button
              kind="ghost"
              disabled={disabled || draft.lines.length >= 500}
              onClick={() => add('line_note')}
            >
              Add note
            </Button>
          </div>
          <h3>Document discount and rounding</h3>
          <div className={styles.editorGrid}>
            <label className={styles.select}>
              Discount type
              <select
                disabled={disabled}
                value={draft.values.discount_type}
                onChange={(event) =>
                  header(
                    'discount_type',
                    event.target
                      .value as InvoiceDraft['values']['discount_type'],
                    true,
                  )
                }
              >
                {draft.selections.discount_type.map(([value, name]) => (
                  <option key={value} value={value}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
            {draft.values.discount_type === 'fixed'
              ? number(
                  'invoice-discount',
                  `Discount (${currency})`,
                  draft.values.discount,
                  (value) => header('discount', value),
                )
              : null}
            {draft.values.discount_type === 'percentage'
              ? number(
                  'invoice-percent',
                  'Document discount (%)',
                  draft.values.discount_percentage,
                  (value) => header('discount_percentage', value),
                  100,
                )
              : null}
            {draft.values.discount_type !== 'none'
              ? choice(
                  'invoice-discount-account',
                  'Discount account head',
                  'discount_account',
                  'account.account',
                  draft.values.disc_acc_id,
                  (id) => header('disc_acc_id', id, true),
                )
              : null}
            {choice(
              'invoice-cash-rounding',
              'Cash rounding',
              'cash_rounding',
              'account.cash.rounding',
              draft.values.invoice_cash_rounding_id,
              (id) => header('invoice_cash_rounding_id', id, true),
            )}
          </div>
          <p className={styles.note}>
            Inherited rounding adjustment:{' '}
            {money(draft.totals.round_off_amount, currency)}. Generated discount
            and rounding lines are managed by Billing, not edited as products.
          </p>
          <details>
            <summary>Other invoice settings</summary>
            <div className={styles.editorGrid}>
              {choice(
                'invoice-shipping',
                'Delivery address',
                'shipping',
                'res.partner',
                draft.values.partner_shipping_id,
                (id) => header('partner_shipping_id', id, true),
              )}
              {choice(
                'invoice-fiscal',
                'Fiscal position',
                'fiscal_position',
                'account.fiscal.position',
                draft.values.fiscal_position_id,
                (id) => header('fiscal_position_id', id, true),
              )}
              {choice(
                'invoice-salesperson',
                'Salesperson',
                'salesperson',
                'res.users',
                draft.values.invoice_user_id,
                (id) => header('invoice_user_id', id, true),
              )}
              {choice(
                'invoice-bank',
                'Recipient bank account',
                'bank',
                'res.partner.bank',
                draft.values.partner_bank_id,
                (id) => header('partner_bank_id', id, true),
              )}
              {choice(
                'invoice-incoterm',
                'Incoterm',
                'incoterm',
                'account.incoterms',
                draft.values.invoice_incoterm_id,
                (id) => header('invoice_incoterm_id', id, true),
              )}
              {text('payment_reference', 'Payment reference')}
              <label className={styles.select}>
                Automatic posting
                <select
                  disabled={disabled}
                  value={draft.values.auto_post}
                  onChange={(event) =>
                    header(
                      'auto_post',
                      event.target.value as InvoiceDraft['values']['auto_post'],
                      true,
                    )
                  }
                >
                  {draft.selections.auto_post.map(([value, name]) => (
                    <option key={value} value={value}>
                      {name}
                    </option>
                  ))}
                </select>
              </label>
              {['monthly', 'quarterly', 'yearly'].includes(
                draft.values.auto_post,
              )
                ? text('auto_post_until', 'Repeat until', 'date')
                : null}
              <label>
                <input
                  type="checkbox"
                  disabled={disabled}
                  checked={draft.values.to_check}
                  onChange={(event) =>
                    header('to_check', event.target.checked, true)
                  }
                />{' '}
                To check
              </label>
            </div>
            {draft.values.auto_post !== 'no' ? (
              <p role="alert">
                Saving this schedule allows native Billing to post on the
                accounting date. Recurring options can create and post
                subsequent invoices.
              </p>
            ) : null}
          </details>
          <TextArea
            id="invoice-narration"
            labelText="Terms and notes"
            value={draft.values.narration || ''}
            disabled={disabled}
            onChange={(event) => header('narration', event.target.value)}
            onBlur={blur}
          />
          {pending ? (
            <p role="status">Totals need recalculation before saving.</p>
          ) : (
            <dl className={styles.totals}>
              <dt>Items after line discounts</dt>
              <dd>{money(draft.totals.qorlia_item_subtotal, currency)}</dd>
              <dt>Taxes</dt>
              <dd>{money(draft.totals.amount_tax, currency)}</dd>
              <dt>Document discount</dt>
              <dd>{money(draft.values.discount, currency)}</dd>
              <dt>Native invoice total</dt>
              <dd>{money(draft.totals.amount_total, currency)}</dd>
              <dt>Final bill total</dt>
              <dd>{money(draft.totals.invoice_total, currency)}</dd>
            </dl>
          )}
          <div className={styles.toolbar}>
            {pending ? (
              <Button
                kind="tertiary"
                disabled={disabled}
                onClick={() => void calculate(draft, pending)}
              >
                Recalculate totals
              </Button>
            ) : null}
            <Button
              disabled={
                disabled || !dirty || !!pending || !draft.review_version
              }
              onClick={() => void save()}
            >
              Save draft{' '}
              {draft.move_type === 'out_refund' ? 'credit note' : 'invoice'}
            </Button>
            <Button kind="ghost" disabled={busy} onClick={requestClose}>
              Back to invoices
            </Button>
          </div>
        </section>
      )}
    </Modal>
  );
}
