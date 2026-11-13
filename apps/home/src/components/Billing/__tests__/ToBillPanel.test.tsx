import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, within } from '@testing-library/react';
import {
  BillingSessionExpired,
  ChargeOrder,
  getChargeOrders,
  getInvoices,
  Invoice,
} from '../billingService';
import { ToBillPanel } from '../ToBillPanel';

jest.mock('../billingService', () => ({
  ...jest.requireActual('../billingService'),
  getChargeOrders: jest.fn(),
  getInvoices: jest.fn(),
}));

const chargeOrder = (overrides: Partial<ChargeOrder> = {}): ChargeOrder =>
  ({
    id: 2,
    name: 'S00002',
    client_order_ref: 'ORD-23',
    partner_id: [8, 'QorliaQA Patient'],
    shop_id: [1, 'Clinic'],
    date_order: '2026-10-26 09:30:00',
    state: 'draft',
    invoice_status: 'no',
    care_setting: 'opd',
    provider_name: 'Dr Demo',
    amount_untaxed: 700,
    amount_tax: 0,
    amount_total: 700,
    discount: 0,
    discount_type: 'none',
    discount_percentage: 0,
    chargeable_amount: 0,
    disc_acc_id: false,
    round_off_amount: 0,
    currency_id: [1, 'INR'],
    invoice_ids: [],
    ...overrides,
  }) as ChargeOrder;

const draftBill = (overrides: Partial<Invoice> = {}): Invoice => ({
  id: 15,
  name: '/',
  ref: false,
  move_type: 'out_invoice',
  partner_id: [9, 'Draft Patient'],
  invoice_date: false,
  invoice_date_due: false,
  state: 'draft',
  payment_state: 'not_paid',
  amount_total: 250,
  amount_untaxed: 250,
  qorlia_item_subtotal: 250,
  amount_tax: 0,
  discount: 0,
  round_off_amount: 0,
  invoice_total: 250,
  amount_residual: 250,
  currency_id: [1, 'INR'],
  ...overrides,
});

const show = () => {
  const handlers = { bill: jest.fn(), reconnect: jest.fn() };
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <ToBillPanel uid={3} {...handlers} />
    </QueryClientProvider>,
  );
  return handlers;
};

beforeEach(() => jest.clearAllMocks());

it('asks for unbilled visit orders and draft bills, and shows an empty queue', async () => {
  jest.mocked(getChargeOrders).mockResolvedValue([]);
  jest.mocked(getInvoices).mockResolvedValue([]);
  show();
  expect(
    await screen.findByText('No visits waiting to be billed.'),
  ).toBeVisible();
  expect(getChargeOrders).toHaveBeenCalledWith('', 0, 'toBill');
  expect(getInvoices).toHaveBeenCalledWith('', 0, undefined, {
    draftOnly: true,
  });
});

it('lists visit charges and draft bills and opens the right one to bill', async () => {
  const visit = chargeOrder();
  jest.mocked(getChargeOrders).mockResolvedValue([
    visit,
    chargeOrder({
      id: 3,
      name: 'S00003',
      state: 'sale',
      partner_id: [4, 'Confirmed Patient'],
    }),
  ]);
  jest.mocked(getInvoices).mockResolvedValue([draftBill()]);
  const { bill } = show();

  const row = await screen.findByRole('row', { name: /QorliaQA Patient/ });
  expect(within(row).getByText('New charges')).toBeVisible();
  expect(within(row).getByText('₹700.00')).toBeVisible();
  expect(within(row).getByText('26 Oct 2026')).toBeVisible();
  expect(
    within(screen.getByRole('row', { name: /Confirmed Patient/ })).getByText(
      'Confirmed',
    ),
  ).toBeVisible();
  expect(screen.getByText('3')).toBeVisible();

  fireEvent.click(
    screen.getByRole('button', { name: 'Bill S00002 for QorliaQA Patient' }),
  );
  expect(bill).toHaveBeenCalledWith({ kind: 'order', order: visit });

  fireEvent.click(
    screen.getByRole('button', {
      name: 'Finalise Draft bill for Draft Patient',
    }),
  );
  expect(bill).toHaveBeenLastCalledWith({ kind: 'invoice', invoiceId: 15 });
});

it('searches both lists', async () => {
  jest.mocked(getChargeOrders).mockResolvedValue([]);
  jest.mocked(getInvoices).mockResolvedValue([]);
  show();
  await screen.findByText('No visits waiting to be billed.');
  fireEvent.change(screen.getByLabelText('Search patient or visit reference'), {
    target: { value: ' Asha ' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Search' }));
  expect(
    await screen.findByText('No visits to bill match this search.'),
  ).toBeVisible();
  expect(getChargeOrders).toHaveBeenLastCalledWith('Asha', 0, 'toBill');
  expect(getInvoices).toHaveBeenLastCalledWith('Asha', 0, undefined, {
    draftOnly: true,
  });
});

it('offers reconnect when the Billing session expired', async () => {
  jest.mocked(getChargeOrders).mockRejectedValue(new BillingSessionExpired());
  jest.mocked(getInvoices).mockResolvedValue([]);
  const { reconnect } = show();
  fireEvent.click(
    await screen.findByRole('button', { name: 'Reconnect Billing' }),
  );
  expect(reconnect).toHaveBeenCalled();
});
