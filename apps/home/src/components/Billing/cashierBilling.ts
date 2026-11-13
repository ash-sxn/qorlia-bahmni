import {
  BillingActionRejected,
  BillingDraft,
  DraftLine,
  getBillingDraft,
  getInvoiceDraftChoices,
  getInvoiceWorkflow,
  getOrderWorkflow,
  OrderWorkflow,
  postInvoiceWorkflow,
  previewBillingDraft,
  runOrderWorkflow,
  saveBillingDraft,
} from './billingService';

export type BillingStage = 'confirm' | 'invoice' | 'post';

export type BillingOutcome =
  /** A posted bill with money due: open Take payment for it. */
  | { kind: 'pay'; invoiceId: number }
  /** Everything is billed and nothing is left to collect. */
  | { kind: 'done' }
  /** Billing cannot continue here; the reason is shown to the cashier. */
  | { kind: 'blocked'; message: string };

// Each order action runs once at most per pass. More would mean the native
// state is not converging, which the cashier should see instead of a loop.
const MAX_ORDER_ACTIONS = 2;

/**
 * Finalises one draft customer invoice and reports what is left to collect.
 * Posting uses the same reviewed native workflow as the Accounting view.
 */
export async function finaliseInvoice(
  invoiceId: number,
  onStage: (stage: BillingStage) => void,
): Promise<BillingOutcome> {
  const outcome = await settleInvoice(invoiceId, onStage);
  return outcome.kind === 'creditNote'
    ? {
        kind: 'blocked',
        message: 'This is a credit note. Handle it in Accounting.',
      }
    : outcome;
}

async function settleInvoice(
  invoiceId: number,
  onStage: (stage: BillingStage) => void,
): Promise<BillingOutcome | { kind: 'creditNote' }> {
  let invoice = await getInvoiceWorkflow(invoiceId);
  if (invoice.move_type !== 'out_invoice') return { kind: 'creditNote' };
  if (!invoice.ledger_balanced)
    return {
      kind: 'blocked',
      message:
        'This bill does not balance in the accounts, so it cannot be collected. Ask your Billing administrator to review it.',
    };
  if (invoice.state === 'draft') {
    if (!invoice.can_post)
      return {
        kind: 'blocked',
        message:
          'This bill cannot be finalised with your account. Ask your Billing administrator.',
      };
    onStage('post');
    invoice = await postInvoiceWorkflow(invoice);
  }
  if (invoice.state !== 'posted') return { kind: 'done' };
  return invoice.open_amount > 0
    ? { kind: 'pay', invoiceId: invoice.id }
    : { kind: 'done' };
}

/**
 * Takes a visit's charge order from quotation to a collectable bill:
 * confirm, create the invoice, then finalise it. Every step re-reads the native
 * state first, so a pass that stopped part way can simply be run again.
 */
export async function billVisit(
  orderId: number,
  onStage: (stage: BillingStage) => void,
): Promise<BillingOutcome> {
  let order: OrderWorkflow = await getOrderWorkflow(orderId);
  for (let step = 0; step < MAX_ORDER_ACTIONS; step++) {
    if (order.can_confirm) {
      onStage('confirm');
      order = await runOrderWorkflow(order, 'confirm');
    } else if (order.can_invoice) {
      onStage('invoice');
      order = await runOrderWorkflow(order, 'invoice');
    } else break;
  }
  if (order.can_confirm || order.can_invoice)
    return {
      kind: 'blocked',
      message:
        'Billing did not finish creating this bill. Reload and try again, or open it in Accounting.',
    };

  let collect: number | null = null;
  for (const invoice of order.invoices) {
    if (invoice.state === 'cancel') continue;
    // Credit notes on the order are refunds, not something to collect.
    const outcome = await settleInvoice(invoice.id, onStage);
    if (outcome.kind === 'blocked') return outcome;
    if (outcome.kind === 'pay' && collect === null) collect = outcome.invoiceId;
  }
  if (collect !== null) return { kind: 'pay', invoiceId: collect };
  if (!order.invoices.some((invoice) => invoice.state !== 'cancel'))
    return {
      kind: 'blocked',
      message:
        'No bill was created for this visit. Its items may only be billed after delivery. Check it in Accounting.',
    };
  return { kind: 'done' };
}

/** True when a draft visit order can still take another charge line. */
export const canAddCharges = (order: OrderWorkflow) =>
  order.can_confirm && !order.invoices.length && !order.pickings.length;

const blankLine = (sequence: number): DraftLine => ({
  id: false,
  values: {
    product_id: false,
    name: '',
    display_type: false,
    sequence,
    product_uom: false,
    product_uom_qty: 1,
    price_unit: 0,
    discount: 0,
    tax_id: [],
    lot_id: false,
    expiry_date: false,
    analytic_distribution: false,
  },
  totals: { price_subtotal: 0, price_tax: 0, price_total: 0 },
});

/**
 * Adds one unit of a product to a draft visit order. Native onchange fills in
 * the price, unit and taxes, and the native save checks the order version, so
 * an order that changed meanwhile is refused rather than overwritten.
 */
export async function addOrderProduct(
  orderId: number,
  productId: number,
  requestKey: string,
): Promise<BillingDraft> {
  let draft = await getBillingDraft(orderId);
  const sequence =
    Math.max(0, ...draft.lines.map((line) => line.values.sequence)) + 10;
  draft = await previewBillingDraft(
    { ...draft, lines: [...draft.lines, blankLine(sequence)] },
    { field: 'order_line' },
  );
  const index = draft.lines.length - 1;
  const added = draft.lines[index];
  if (added?.id !== false || added.values.product_id !== false)
    throw new Error('The new charge line could not be prepared. Reload.');
  draft = await previewBillingDraft(
    {
      ...draft,
      lines: draft.lines.map((line, i) =>
        i === index
          ? { ...line, values: { ...line.values, product_id: productId } }
          : line,
      ),
    },
    { field: 'product_id', line: index },
  );
  return saveBillingDraft(draft, requestKey);
}

/**
 * True when Billing refused the bill because its lines need a department
 * (an analytic distribution). Hospitals that report by department require one.
 */
export const needsDepartment = (error: unknown) =>
  error instanceof BillingActionRejected && /analytic/i.test(error.message);

/** The departments (analytic accounts) the Billing account may use. */
export const getDepartments = () =>
  getInvoiceDraftChoices(false, 'analytic', '');

/**
 * Puts every charge line that has no department on the chosen one, in full.
 * The native save checks the order version, so a changed order is refused.
 */
export async function setOrderDepartment(
  orderId: number,
  departmentId: number,
  requestKey: string,
): Promise<BillingDraft> {
  const draft = await getBillingDraft(orderId);
  const distribution = { [String(departmentId)]: 100 };
  return saveBillingDraft(
    {
      ...draft,
      lines: draft.lines.map((line) =>
        line.values.display_type || line.values.analytic_distribution
          ? line
          : {
              ...line,
              values: { ...line.values, analytic_distribution: distribution },
            },
      ),
    },
    requestKey,
  );
}

// Pricing asks Billing once per product, so only short lists are priced.
export const MAX_PRICED_PRODUCTS = 6;

/**
 * The unit price Billing would put on each product for this order, read with
 * native onchange on an unsaved line. Nothing is saved.
 */
export async function priceProducts(
  orderId: number,
  productIds: number[],
): Promise<Map<number, number>> {
  const prices = new Map<number, number>();
  if (!productIds.length || productIds.length > MAX_PRICED_PRODUCTS)
    return prices;
  let draft = await getBillingDraft(orderId);
  const sequence =
    Math.max(0, ...draft.lines.map((line) => line.values.sequence)) + 10;
  draft = await previewBillingDraft(
    { ...draft, lines: [...draft.lines, blankLine(sequence)] },
    { field: 'order_line' },
  );
  const index = draft.lines.length - 1;
  for (const productId of productIds) {
    const priced = await previewBillingDraft(
      {
        ...draft,
        lines: draft.lines.map((line, i) =>
          i === index
            ? { ...line, values: { ...line.values, product_id: productId } }
            : line,
        ),
      },
      { field: 'product_id', line: index },
    );
    const line = priced.lines[index];
    if (line?.values.product_id === productId)
      prices.set(productId, line.values.price_unit);
  }
  return prices;
}
