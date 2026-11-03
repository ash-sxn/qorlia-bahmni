import {
  BillingDraft,
  DraftLine,
  getBillingDraft,
  getInvoiceWorkflow,
  getOrderWorkflow,
  InvoiceWorkflow,
  OrderWorkflow,
  postInvoiceWorkflow,
  previewBillingDraft,
  runOrderWorkflow,
  saveBillingDraft,
} from '../billingService';
import {
  addOrderProduct,
  billVisit,
  canAddCharges,
  finaliseInvoice,
} from '../cashierBilling';

jest.mock('../billingService', () => ({
  ...jest.requireActual('../billingService'),
  getOrderWorkflow: jest.fn(),
  runOrderWorkflow: jest.fn(),
  getInvoiceWorkflow: jest.fn(),
  postInvoiceWorkflow: jest.fn(),
  getBillingDraft: jest.fn(),
  previewBillingDraft: jest.fn(),
  saveBillingDraft: jest.fn(),
}));

const order = (overrides: Partial<OrderWorkflow> = {}): OrderWorkflow => ({
  id: 4,
  name: 'S00004',
  state: 'draft',
  version: 'a'.repeat(64),
  customer: 'QorliaQA Patient',
  currency: [1, 'INR'],
  amount_total: 700,
  can_confirm: true,
  can_invoice: false,
  can_advance: false,
  has_down_payments: false,
  automation: { delivery: false, invoice: false, legacy_delivery: false },
  invoices: [],
  pickings: [],
  ...overrides,
});

const confirmed = (overrides: Partial<OrderWorkflow> = {}) =>
  order({ state: 'sale', can_confirm: false, can_invoice: true, ...overrides });

const invoiced = (
  invoices: OrderWorkflow['invoices'],
  overrides: Partial<OrderWorkflow> = {},
) =>
  order({
    state: 'sale',
    can_confirm: false,
    can_invoice: false,
    invoices,
    ...overrides,
  });

const orderInvoice = (
  id: number,
  state: 'draft' | 'posted' | 'cancel' = 'draft',
) => ({
  id,
  name: false as const,
  state,
  total: 700,
  currency: [1, 'INR'] as [number, string],
});

const invoice = (
  overrides: Partial<InvoiceWorkflow> = {},
): InvoiceWorkflow => ({
  id: 11,
  name: false,
  state: 'draft',
  move_type: 'out_invoice',
  version: 'b'.repeat(64),
  customer: 'QorliaQA Patient',
  currency: [1, 'INR'],
  total: 700,
  open_amount: 700,
  payment_state: 'not_paid',
  invoice_date: false,
  journal: 'Customer Invoices',
  company: 'Clinic',
  ledger_balanced: true,
  can_post: true,
  ...overrides,
});

const posted = (overrides: Partial<InvoiceWorkflow> = {}) =>
  invoice({
    state: 'posted',
    name: 'INV/2026/0011',
    can_post: false,
    ...overrides,
  });

beforeEach(() => jest.clearAllMocks());

describe('billVisit', () => {
  it('confirms, invoices and finalises a new visit, then asks for payment', async () => {
    const stages: string[] = [];
    jest.mocked(getOrderWorkflow).mockResolvedValue(order());
    jest
      .mocked(runOrderWorkflow)
      .mockResolvedValueOnce(confirmed())
      .mockResolvedValueOnce(invoiced([orderInvoice(11)]));
    jest.mocked(getInvoiceWorkflow).mockResolvedValue(invoice());
    jest.mocked(postInvoiceWorkflow).mockResolvedValue(posted());

    await expect(billVisit(4, (stage) => stages.push(stage))).resolves.toEqual({
      kind: 'pay',
      invoiceId: 11,
    });
    expect(stages).toEqual(['confirm', 'invoice', 'post']);
    expect(runOrderWorkflow).toHaveBeenNthCalledWith(1, order(), 'confirm');
    expect(runOrderWorkflow).toHaveBeenNthCalledWith(2, confirmed(), 'invoice');
    expect(postInvoiceWorkflow).toHaveBeenCalledWith(invoice());
  });

  it('does not post again when Bahmni already created and posted the bill on confirm', async () => {
    jest.mocked(getOrderWorkflow).mockResolvedValue(order());
    jest
      .mocked(runOrderWorkflow)
      .mockResolvedValue(invoiced([orderInvoice(11, 'posted')]));
    jest.mocked(getInvoiceWorkflow).mockResolvedValue(posted());

    await expect(billVisit(4, jest.fn())).resolves.toEqual({
      kind: 'pay',
      invoiceId: 11,
    });
    expect(runOrderWorkflow).toHaveBeenCalledTimes(1);
    expect(postInvoiceWorkflow).not.toHaveBeenCalled();
  });

  it('resumes from the current native state after a stop part way', async () => {
    jest.mocked(getOrderWorkflow).mockResolvedValue(confirmed());
    jest
      .mocked(runOrderWorkflow)
      .mockResolvedValue(invoiced([orderInvoice(11)]));
    jest.mocked(getInvoiceWorkflow).mockResolvedValue(invoice());
    jest.mocked(postInvoiceWorkflow).mockResolvedValue(posted());

    await billVisit(4, jest.fn());
    expect(runOrderWorkflow).toHaveBeenCalledTimes(1);
    expect(runOrderWorkflow).toHaveBeenCalledWith(confirmed(), 'invoice');
  });

  it('reports done when the bill has nothing left to collect', async () => {
    jest
      .mocked(getOrderWorkflow)
      .mockResolvedValue(invoiced([orderInvoice(11, 'posted')]));
    jest
      .mocked(getInvoiceWorkflow)
      .mockResolvedValue(posted({ open_amount: 0, payment_state: 'paid' }));

    await expect(billVisit(4, jest.fn())).resolves.toEqual({ kind: 'done' });
    expect(runOrderWorkflow).not.toHaveBeenCalled();
  });

  it('skips credit notes and cancelled bills on the order', async () => {
    jest
      .mocked(getOrderWorkflow)
      .mockResolvedValue(
        invoiced([
          orderInvoice(9, 'cancel'),
          orderInvoice(10, 'posted'),
          orderInvoice(11, 'posted'),
        ]),
      );
    jest
      .mocked(getInvoiceWorkflow)
      .mockImplementation(async (id) =>
        id === 10
          ? posted({ id: 10, move_type: 'out_refund' })
          : posted({ id }),
      );

    await expect(billVisit(4, jest.fn())).resolves.toEqual({
      kind: 'pay',
      invoiceId: 11,
    });
    expect(getInvoiceWorkflow).not.toHaveBeenCalledWith(9);
  });

  it('stops instead of looping when native Billing does not move the order on', async () => {
    jest.mocked(getOrderWorkflow).mockResolvedValue(order());
    jest.mocked(runOrderWorkflow).mockResolvedValue(order());

    const outcome = await billVisit(4, jest.fn());
    expect(outcome.kind).toBe('blocked');
    expect(runOrderWorkflow).toHaveBeenCalledTimes(2);
  });

  it('says so when confirming created no bill', async () => {
    jest.mocked(getOrderWorkflow).mockResolvedValue(order());
    jest.mocked(runOrderWorkflow).mockResolvedValue(invoiced([]));

    await expect(billVisit(4, jest.fn())).resolves.toEqual({
      kind: 'blocked',
      message: expect.stringContaining('No bill was created'),
    });
  });

  it('never posts or collects an unbalanced bill', async () => {
    jest
      .mocked(getOrderWorkflow)
      .mockResolvedValue(invoiced([orderInvoice(11)]));
    jest
      .mocked(getInvoiceWorkflow)
      .mockResolvedValue(invoice({ ledger_balanced: false }));

    await expect(billVisit(4, jest.fn())).resolves.toEqual({
      kind: 'blocked',
      message: expect.stringContaining('does not balance'),
    });
    expect(postInvoiceWorkflow).not.toHaveBeenCalled();
  });

  it('does not post a draft bill the user may not post', async () => {
    jest
      .mocked(getOrderWorkflow)
      .mockResolvedValue(invoiced([orderInvoice(11)]));
    jest
      .mocked(getInvoiceWorkflow)
      .mockResolvedValue(invoice({ can_post: false }));

    const outcome = await billVisit(4, jest.fn());
    expect(outcome.kind).toBe('blocked');
    expect(postInvoiceWorkflow).not.toHaveBeenCalled();
  });

  it('lets a native failure reach the caller', async () => {
    jest.mocked(getOrderWorkflow).mockResolvedValue(order());
    jest
      .mocked(runOrderWorkflow)
      .mockRejectedValue(new Error('This order changed.'));
    await expect(billVisit(4, jest.fn())).rejects.toThrow(
      'This order changed.',
    );
  });
});

describe('finaliseInvoice', () => {
  it('posts a draft bill and asks for payment', async () => {
    jest.mocked(getInvoiceWorkflow).mockResolvedValue(invoice());
    jest.mocked(postInvoiceWorkflow).mockResolvedValue(posted());
    await expect(finaliseInvoice(11, jest.fn())).resolves.toEqual({
      kind: 'pay',
      invoiceId: 11,
    });
  });

  it('refuses a credit note opened directly', async () => {
    jest
      .mocked(getInvoiceWorkflow)
      .mockResolvedValue(invoice({ move_type: 'out_refund' }));
    await expect(finaliseInvoice(11, jest.fn())).resolves.toEqual({
      kind: 'blocked',
      message: expect.stringContaining('credit note'),
    });
    expect(postInvoiceWorkflow).not.toHaveBeenCalled();
  });
});

describe('canAddCharges', () => {
  it('allows charges only on a quotation with no billing or stock activity', () => {
    expect(canAddCharges(order())).toBe(true);
    expect(canAddCharges(confirmed())).toBe(false);
    expect(canAddCharges(order({ invoices: [orderInvoice(1)] }))).toBe(false);
    expect(
      canAddCharges(
        order({ pickings: [{ id: 1, name: 'WH/OUT/1', state: 'draft' }] }),
      ),
    ).toBe(false);
  });
});

describe('addOrderProduct', () => {
  const line = (
    overrides: Partial<DraftLine['values']> = {},
    id: number | false = 1,
  ): DraftLine => ({
    id,
    values: {
      product_id: 20,
      name: 'Complete blood count',
      display_type: false,
      sequence: 10,
      product_uom: 1,
      product_uom_qty: 1,
      price_unit: 300,
      discount: 0,
      tax_id: [],
      lot_id: false,
      expiry_date: false,
      analytic_distribution: false,
      ...overrides,
    },
    totals: { price_subtotal: 300, price_tax: 0, price_total: 300 },
  });
  const draft = (lines: DraftLine[]) =>
    ({ id: 4, version: 'v1', lines }) as unknown as BillingDraft;

  it('adds the product through native onchange and saves with the request key', async () => {
    jest.mocked(getBillingDraft).mockResolvedValue(draft([line()]));
    jest
      .mocked(previewBillingDraft)
      .mockImplementationOnce(async (next) => next)
      .mockImplementationOnce(async (next) =>
        draft([
          next.lines[0],
          line(
            {
              product_id: 30,
              name: 'Consultation',
              price_unit: 400,
              sequence: 20,
            },
            false,
          ),
        ]),
      );
    jest.mocked(saveBillingDraft).mockImplementation(async (saved) => saved);

    const saved = await addOrderProduct(4, 30, 'key-1');

    const [blank, blankChange] = jest.mocked(previewBillingDraft).mock.calls[0];
    expect(blankChange).toEqual({ field: 'order_line' });
    expect(blank.lines[1].values).toMatchObject({
      product_id: false,
      product_uom_qty: 1,
      sequence: 20,
    });
    const [withProduct, productChange] =
      jest.mocked(previewBillingDraft).mock.calls[1];
    expect(productChange).toEqual({ field: 'product_id', line: 1 });
    expect(withProduct.lines[1].values.product_id).toBe(30);
    expect(saveBillingDraft).toHaveBeenCalledWith(saved, 'key-1');
    expect(saved.lines[1].values.price_unit).toBe(400);
  });

  it('refuses to save when the prepared line is not the new blank line', async () => {
    jest.mocked(getBillingDraft).mockResolvedValue(draft([line()]));
    jest.mocked(previewBillingDraft).mockResolvedValue(draft([line()]));

    await expect(addOrderProduct(4, 30, 'key-1')).rejects.toThrow(
      'could not be prepared',
    );
    expect(saveBillingDraft).not.toHaveBeenCalled();
  });
});
