import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import {
  ChargeOrder,
  ChargeOrderLine,
  getChargeOrderLines,
  getDraftChoices,
  getInvoiceWorkflow,
  getOrderWorkflow,
  OrderWorkflow,
} from '../billingService';
import { BillTarget, BillVisitModal } from '../BillVisitModal';
import { addOrderProduct, billVisit, finaliseInvoice } from '../cashierBilling';

jest.mock('../billingService', () => ({
  ...jest.requireActual('../billingService'),
  getOrderWorkflow: jest.fn(),
  getChargeOrderLines: jest.fn(),
  getDraftChoices: jest.fn(),
  getInvoiceWorkflow: jest.fn(),
}));
jest.mock('../cashierBilling', () => ({
  ...jest.requireActual('../cashierBilling'),
  billVisit: jest.fn(),
  finaliseInvoice: jest.fn(),
  addOrderProduct: jest.fn(),
}));
jest.mock('../DraftOrderEditor', () => ({
  DraftOrderEditor: ({ close }: { close: () => void }) => (
    <button onClick={close}>Close charge editor</button>
  ),
}));

const visit = {
  id: 2,
  name: 'S00002',
  partner_id: [8, 'QorliaQA Patient'],
  shop_id: [1, 'Clinic'],
  provider_name: 'Dr Demo',
  amount_total: 300,
  currency_id: [1, 'INR'],
} as unknown as ChargeOrder;

const workflow = (overrides: Partial<OrderWorkflow> = {}): OrderWorkflow => ({
  id: 2,
  name: 'S00002',
  state: 'draft',
  version: 'a'.repeat(64),
  customer: 'QorliaQA Patient',
  currency: [1, 'INR'],
  amount_total: 300,
  can_confirm: true,
  can_invoice: false,
  can_advance: false,
  has_down_payments: false,
  automation: { delivery: false, invoice: false, legacy_delivery: false },
  invoices: [],
  pickings: [],
  ...overrides,
});

const line = (overrides: Partial<ChargeOrderLine> = {}): ChargeOrderLine => ({
  id: 1,
  name: 'Complete blood count',
  display_type: false,
  product_id: [20, 'Complete blood count'],
  product_uom: [1, 'Unit(s)'],
  product_uom_qty: 1,
  qty_delivered: 0,
  qty_invoiced: 0,
  price_unit: 300,
  discount: 0,
  price_subtotal: 300,
  price_tax: 0,
  price_total: 300,
  dispensed: false,
  lot_id: false,
  expiry_date: false,
  ...overrides,
});

const show = (target: BillTarget = { kind: 'order', order: visit }) => {
  const handlers = {
    close: jest.fn(),
    pay: jest.fn(),
    finished: jest.fn(),
    reconnect: jest.fn(),
  };
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <BillVisitModal uid={3} target={target} {...handlers} />
    </QueryClientProvider>,
  );
  return handlers;
};

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(getOrderWorkflow).mockResolvedValue(workflow());
  jest.mocked(getChargeOrderLines).mockResolvedValue([line()]);
});

it('shows the visit charges and total, then bills and opens payment', async () => {
  jest.mocked(billVisit).mockImplementation(async (_id, onStage) => {
    onStage('confirm');
    return { kind: 'pay', invoiceId: 11 };
  });
  const { pay } = show();

  const row = await screen.findByRole('row', { name: /Complete blood count/ });
  expect(within(row).getAllByText('₹300.00')).toHaveLength(2);
  expect(screen.getByText('S00002 · Dr Demo')).toBeVisible();

  fireEvent.click(
    screen.getByRole('button', { name: 'Create bill · ₹300.00' }),
  );
  await waitFor(() => expect(pay).toHaveBeenCalledWith(11));
  expect(billVisit).toHaveBeenCalledWith(2, expect.any(Function));
});

it('reports a bill with nothing left to collect', async () => {
  jest.mocked(billVisit).mockResolvedValue({ kind: 'done' });
  const { finished, pay } = show();
  fireEvent.click(
    await screen.findByRole('button', { name: 'Create bill · ₹300.00' }),
  );
  await waitFor(() =>
    expect(finished).toHaveBeenCalledWith(
      'Billed. Nothing is left to collect on this visit.',
    ),
  );
  expect(pay).not.toHaveBeenCalled();
});

it('shows why billing stopped and does not offer to retry blindly', async () => {
  jest.mocked(billVisit).mockResolvedValue({
    kind: 'blocked',
    message: 'This bill does not balance.',
  });
  show();
  const create = await screen.findByRole('button', {
    name: 'Create bill · ₹300.00',
  });
  fireEvent.click(create);
  expect(await screen.findByText('This bill does not balance.')).toBeVisible();
  expect(create).toBeDisabled();
});

it('lets the cashier continue after a failure without resending blindly', async () => {
  jest
    .mocked(billVisit)
    .mockRejectedValueOnce(new Error('Network error'))
    .mockResolvedValueOnce({ kind: 'pay', invoiceId: 11 });
  const { pay } = show();
  fireEvent.click(
    await screen.findByRole('button', { name: 'Create bill · ₹300.00' }),
  );
  expect(await screen.findByText('Network error')).toBeVisible();
  expect(
    screen.getByText(/Nothing is sent twice. Reload to see where/),
  ).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Continue billing' }));
  await waitFor(() => expect(pay).toHaveBeenCalledWith(11));
});

it('warns about a zero total and unpriced items', async () => {
  jest
    .mocked(getOrderWorkflow)
    .mockResolvedValue(workflow({ amount_total: 0 }));
  jest
    .mocked(getChargeOrderLines)
    .mockResolvedValue([line({ price_unit: 0, price_total: 0 })]);
  show();
  expect(await screen.findByText('No price')).toBeVisible();
  expect(
    screen.getByText(/This bill totals ₹0.00. Check the item prices/),
  ).toBeVisible();
});

it('adds a consultation fee once and re-reads the bill', async () => {
  jest.mocked(getDraftChoices).mockResolvedValue([[30, 'Consultation']]);
  jest.mocked(addOrderProduct).mockResolvedValue({} as never);
  show();
  fireEvent.click(
    await screen.findByRole('button', { name: 'Add consultation fee' }),
  );
  expect(getDraftChoices).toHaveBeenCalledWith('product', 'Consultation', 1);

  jest
    .mocked(getChargeOrderLines)
    .mockResolvedValue([
      line(),
      line({ id: 2, name: 'Consultation', product_id: [30, 'Consultation'] }),
    ]);
  fireEvent.click(
    await screen.findByRole('button', { name: 'Add Consultation' }),
  );
  await waitFor(() =>
    expect(addOrderProduct).toHaveBeenCalledWith(2, 30, expect.any(String)),
  );
  expect(
    await screen.findByText('A consultation fee is on this bill.'),
  ).toBeVisible();
  expect(
    screen.queryByRole('button', { name: /Add consultation fee/ }),
  ).not.toBeInTheDocument();
});

it('re-reads the bill even when adding the fee fails', async () => {
  jest.mocked(getDraftChoices).mockResolvedValue([[30, 'Consultation']]);
  jest
    .mocked(addOrderProduct)
    .mockRejectedValue(new Error('This charge order changed.'));
  show();
  fireEvent.click(
    await screen.findByRole('button', { name: 'Add consultation fee' }),
  );
  const callsBefore = jest.mocked(getChargeOrderLines).mock.calls.length;
  fireEvent.click(
    await screen.findByRole('button', { name: 'Add Consultation' }),
  );
  expect(await screen.findByText('This charge order changed.')).toBeVisible();
  expect(jest.mocked(getChargeOrderLines).mock.calls.length).toBeGreaterThan(
    callsBefore,
  );
});

it('explains when no consultation product is set up', async () => {
  jest.mocked(getDraftChoices).mockResolvedValue([]);
  show();
  fireEvent.click(
    await screen.findByRole('button', { name: 'Add consultation fee' }),
  );
  expect(await screen.findByText(/is set up in Billing yet/)).toBeVisible();
});

it('does not offer new charges once the order is confirmed', async () => {
  jest
    .mocked(getOrderWorkflow)
    .mockResolvedValue(
      workflow({ state: 'sale', can_confirm: false, can_invoice: true }),
    );
  show();
  expect(
    await screen.findByRole('button', { name: 'Finalise and collect' }),
  ).toBeVisible();
  expect(
    screen.queryByRole('button', { name: 'Add consultation fee' }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole('button', { name: 'Edit charges' }),
  ).not.toBeInTheDocument();
});

it('finalises a draft bill from the queue', async () => {
  jest.mocked(getInvoiceWorkflow).mockResolvedValue({
    id: 15,
    name: false,
    state: 'draft',
    move_type: 'out_invoice',
    version: 'b'.repeat(64),
    customer: 'Draft Patient',
    currency: [1, 'INR'],
    total: 250,
    open_amount: 250,
    payment_state: 'not_paid',
    invoice_date: false,
    journal: 'Customer Invoices',
    company: 'Clinic',
    ledger_balanced: true,
    can_post: true,
  });
  jest
    .mocked(finaliseInvoice)
    .mockResolvedValue({ kind: 'pay', invoiceId: 15 });
  const { pay } = show({ kind: 'invoice', invoiceId: 15 });
  expect(
    await screen.findByRole('heading', { name: 'Bill Draft Patient' }),
  ).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Finalise and collect' }));
  await waitFor(() => expect(pay).toHaveBeenCalledWith(15));
  expect(finaliseInvoice).toHaveBeenCalledWith(15, expect.any(Function));
  expect(getOrderWorkflow).not.toHaveBeenCalled();
});

it('opens the existing charge editor and returns to the review', async () => {
  show();
  fireEvent.click(await screen.findByRole('button', { name: 'Edit charges' }));
  fireEvent.click(screen.getByRole('button', { name: 'Close charge editor' }));
  expect(
    await screen.findByRole('button', { name: 'Create bill · ₹300.00' }),
  ).toBeVisible();
});
