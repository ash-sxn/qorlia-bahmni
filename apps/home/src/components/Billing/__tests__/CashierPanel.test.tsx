import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { BillingSessionExpired, getInvoices, Invoice } from '../billingService';
import { CashierPanel } from '../CashierPanel';

jest.mock('../billingService', () => ({
  ...jest.requireActual('../billingService'),
  getInvoices: jest.fn(),
}));

const bill = (overrides: Partial<Invoice> = {}): Invoice => ({
  id: 7,
  name: 'INV/QA/7',
  ref: false,
  move_type: 'out_invoice',
  partner_id: [8, 'QorliaQA Patient'],
  invoice_date: '2026-10-26',
  invoice_date_due: false,
  state: 'posted',
  payment_state: 'not_paid',
  amount_total: 500,
  amount_untaxed: 500,
  qorlia_item_subtotal: 500,
  amount_tax: 0,
  discount: 0,
  round_off_amount: 0,
  invoice_total: 500,
  amount_residual: 500,
  currency_id: [1, 'INR'],
  ...overrides,
});

const show = (props: Partial<Parameters<typeof CashierPanel>[0]> = {}) => {
  const handlers = {
    takePayment: jest.fn(),
    print: jest.fn(),
    reconnect: jest.fn(),
  };
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <CashierPanel uid={3} notice="" {...handlers} {...props} />
    </QueryClientProvider>,
  );
  return handlers;
};

beforeEach(() => jest.clearAllMocks());

it('shows an empty queue when no bills have money due', async () => {
  jest.mocked(getInvoices).mockResolvedValue([]);
  show();
  expect(
    await screen.findByText('No bills waiting for payment.'),
  ).toBeVisible();
  expect(getInvoices).toHaveBeenCalledWith('', 0, undefined, {
    unpaidOnly: true,
  });
});

it('lists due amounts, totals the page and opens payment or printing', async () => {
  jest.mocked(getInvoices).mockResolvedValue([
    bill(),
    bill({
      id: 9,
      name: 'INV/QA/9',
      partner_id: [10, 'Second Patient'],
      payment_state: 'partial',
      amount_residual: 150.5,
    }),
  ]);
  const { takePayment, print } = show();
  const row = await screen.findByRole('row', { name: /Second Patient/ });
  expect(within(row).getByText('Part paid')).toBeVisible();
  expect(within(row).getByText('₹150.50')).toBeVisible();
  expect(screen.getByText('₹650.50')).toBeVisible();
  fireEvent.click(
    screen.getByRole('button', { name: 'Take payment for INV/QA/7' }),
  );
  fireEvent.click(screen.getByRole('button', { name: 'Print INV/QA/9' }));
  expect(takePayment).toHaveBeenCalledWith(7);
  expect(print).toHaveBeenCalledWith(9);
});

it('searches by patient or bill and pages through long queues', async () => {
  jest
    .mocked(getInvoices)
    .mockResolvedValue(
      Array.from({ length: 26 }, (_, index) =>
        bill({ id: index + 1, name: `INV/QA/${index + 1}` }),
      ),
    );
  show();
  expect(await screen.findByText('25+')).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Next' }));
  expect(getInvoices).toHaveBeenLastCalledWith('', 25, undefined, {
    unpaidOnly: true,
  });
  fireEvent.change(
    screen.getByRole('textbox', { name: 'Search patient or bill number' }),
    { target: { value: '  Sharma ' } },
  );
  fireEvent.click(screen.getByRole('button', { name: 'Search' }));
  expect(getInvoices).toHaveBeenLastCalledWith('Sharma', 0, undefined, {
    unpaidOnly: true,
  });
});

it('asks the cashier to reconnect when the Billing session expires', async () => {
  jest.mocked(getInvoices).mockRejectedValue(new BillingSessionExpired());
  const { reconnect } = show();
  fireEvent.click(
    await screen.findByRole('button', { name: 'Reconnect Billing' }),
  );
  expect(reconnect).toHaveBeenCalledTimes(1);
});
