import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import {
  getPaymentWorkflow,
  PaymentWorkflow,
  previewPaymentWorkflow,
  recordPaymentWorkflow,
} from '../billingService';
import { CashierPaymentModal, orderMethods } from '../CashierPaymentModal';
import { printBill, printReceipt } from '../cashierPrint';
import { invoiceWorkflowFixture } from './invoiceWorkflowFixture';
import {
  paymentValuesFixture,
  paymentWorkflowFixture,
} from './paymentWorkflowFixture';

jest.mock('../billingService', () => ({
  ...jest.requireActual('../billingService'),
  getPaymentWorkflow: jest.fn(),
  previewPaymentWorkflow: jest.fn(),
  recordPaymentWorkflow: jest.fn(),
}));
jest.mock('../cashierPrint', () => ({
  printReceipt: jest.fn().mockResolvedValue(undefined),
  printBill: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../InvoiceReportsModal', () => ({
  BillingReportsModal: ({
    kind,
    recordId,
  }: {
    kind: string;
    recordId: number;
  }) => (
    <p>
      Printing {kind} {recordId}
    </p>
  ),
}));

const workflow = (changes: Partial<PaymentWorkflow> = {}) =>
  paymentWorkflowFixture({
    journals: [
      [2, 'Cash'],
      [4, 'UPI'],
    ],
    ...changes,
  });

const paidResult = (openAmount: number) =>
  workflow({
    invoice: invoiceWorkflowFixture({
      state: 'posted',
      name: 'INV/QA/7',
      can_post: false,
      open_amount: openAmount,
      payment_state: openAmount > 0 ? 'partial' : 'in_payment',
    }),
    payments: [
      {
        id: 41,
        name: 'PCASH/2026/0041',
        date: '2026-10-09',
        amount: 500,
        currency_id: [1, 'INR'],
        journal_id: [2, 'Cash'],
        journal_type: 'cash',
        is_matched: false,
        state: 'posted',
        payment_type: 'inbound',
        ref: false,
        bank_reference: false,
        cheque_reference: false,
        effective_date: false,
        method_code: 'manual',
      },
    ],
  });

const show = () => {
  const handlers = {
    close: jest.fn(),
    completed: jest.fn(),
    moreOptions: jest.fn(),
    reconnect: jest.fn(),
  };
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <CashierPaymentModal uid={3} invoiceId={7} {...handlers} />
    </QueryClientProvider>,
  );
  return handlers;
};

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(getPaymentWorkflow).mockResolvedValue(workflow());
  jest
    .mocked(previewPaymentWorkflow)
    .mockImplementation(async (_invoice, values) => workflow({ values }));
});

it('collects the full amount in cash, then offers the receipt', async () => {
  jest.mocked(recordPaymentWorkflow).mockResolvedValue(paidResult(0));
  const { completed } = show();

  expect(await screen.findByText('₹500.00')).toBeVisible();
  expect(screen.getByRole('button', { name: 'Cash' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  expect(screen.getByLabelText('Amount received')).toHaveValue(500);
  fireEvent.click(screen.getByRole('button', { name: 'Review payment' }));

  expect(await screen.findByText('The bill will be fully paid.')).toBeVisible();
  const [, reviewed, changed] = jest.mocked(previewPaymentWorkflow).mock
    .calls[0];
  expect(changed).toBeUndefined();
  expect(reviewed).toMatchObject({
    amount: 500,
    bank_reference: false,
    payment_difference_handling: 'open',
  });

  fireEvent.click(screen.getByRole('button', { name: 'Record payment' }));
  expect(
    await screen.findByText(/₹500.00 received for INV\/QA\/7. Fully paid./),
  ).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Print receipt' }));
  expect(printReceipt).toHaveBeenCalledWith(41);
  fireEvent.click(screen.getByRole('button', { name: 'Print bill' }));
  expect(printBill).toHaveBeenCalledWith(7);
  expect(completed).not.toHaveBeenCalled();
});

it('takes a part payment by UPI with a reference and shows what is still due', async () => {
  jest.mocked(recordPaymentWorkflow).mockResolvedValue(paidResult(200));
  const { completed } = show();

  fireEvent.click(await screen.findByRole('button', { name: 'UPI' }));
  await waitFor(() =>
    expect(previewPaymentWorkflow).toHaveBeenCalledWith(
      expect.anything(),
      { ...paymentValuesFixture(), journal_id: 4 },
      'journal_id',
    ),
  );
  expect(
    await screen.findByRole('button', { name: 'UPI', pressed: true }),
  ).toBeVisible();

  fireEvent.change(screen.getByLabelText('Amount received'), {
    target: { value: '300' },
  });
  fireEvent.change(
    screen.getByLabelText('Reference (UPI or card transaction, optional)'),
    { target: { value: ' UPI-REF-77 ' } },
  );
  fireEvent.click(screen.getByRole('button', { name: 'Review payment' }));
  expect(await screen.findByText('₹200.00 will still be due.')).toBeVisible();
  expect(screen.getByText(/by UPI on 2026-10-09/)).toBeVisible();
  expect(jest.mocked(previewPaymentWorkflow).mock.calls[1][1]).toMatchObject({
    journal_id: 4,
    amount: 300,
    bank_reference: 'UPI-REF-77',
  });

  fireEvent.click(screen.getByRole('button', { name: 'Record payment' }));
  expect(await screen.findByText(/Still due: ₹200.00./)).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Done' }));
  expect(completed).toHaveBeenCalledWith(paidResult(200));
});

it('says when extra money becomes patient credit', async () => {
  show();
  fireEvent.change(await screen.findByLabelText('Amount received'), {
    target: { value: '600' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Review payment' }));
  expect(
    await screen.findByText(
      "₹100.00 extra stays on the patient's account as credit.",
    ),
  ).toBeVisible();
});

it('refuses an empty or zero amount', async () => {
  show();
  fireEvent.change(await screen.findByLabelText('Amount received'), {
    target: { value: '0' },
  });
  expect(screen.getByRole('button', { name: 'Review payment' })).toBeDisabled();
  expect(previewPaymentWorkflow).not.toHaveBeenCalled();
});

it('blocks a second record after an unclear failure until the bill is reloaded', async () => {
  jest
    .mocked(recordPaymentWorkflow)
    .mockRejectedValue(new Error('Network error'));
  show();
  fireEvent.click(
    await screen.findByRole('button', { name: 'Review payment' }),
  );
  fireEvent.click(
    await screen.findByRole('button', { name: 'Record payment' }),
  );
  expect(await screen.findByText('Network error')).toBeVisible();
  expect(
    screen.getByText(/The payment may already be recorded. Reload/),
  ).toBeVisible();
  expect(screen.getByRole('button', { name: 'Record payment' })).toBeDisabled();
  expect(recordPaymentWorkflow).toHaveBeenCalledTimes(1);

  fireEvent.click(screen.getByRole('button', { name: 'Reload' }));
  await waitFor(() => expect(getPaymentWorkflow).toHaveBeenCalledTimes(2));
  expect(
    await screen.findByRole('button', { name: 'Review payment' }),
  ).toBeEnabled();
});

it('sends cheques and unbalanced bills elsewhere', async () => {
  jest
    .mocked(getPaymentWorkflow)
    .mockResolvedValueOnce(workflow({ method_code: 'pdc' }));
  const { moreOptions } = show();
  expect(
    await screen.findByText('Cheques need more details. Use More options.'),
  ).toBeVisible();
  expect(screen.getByRole('button', { name: 'Review payment' })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: 'More options' }));
  expect(moreOptions).toHaveBeenCalled();
});

it('does not offer payment on a bill that does not balance', async () => {
  jest.mocked(getPaymentWorkflow).mockResolvedValue(
    workflow({
      invoice: invoiceWorkflowFixture({
        state: 'posted',
        ledger_balanced: false,
      }),
    }),
  );
  show();
  expect(
    await screen.findByText(/This bill does not balance in the accounts/),
  ).toBeVisible();
  expect(
    screen.queryByRole('button', { name: 'Review payment' }),
  ).not.toBeInTheDocument();
});

describe('orderMethods', () => {
  const journals: [number, string][] = [
    [1, 'Bank'],
    [2, 'Cash'],
    [3, 'Card'],
  ];

  it('keeps Billing order without history', () => {
    expect(orderMethods(journals, []).map(([id]) => id)).toEqual([1, 2, 3]);
  });

  it('puts recently used methods first, most recent first', () => {
    expect(orderMethods(journals, [3, 2]).map(([id]) => id)).toEqual([3, 2, 1]);
  });
});
