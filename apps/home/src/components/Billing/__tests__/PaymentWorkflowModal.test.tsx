import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import {
  BillingSessionExpired,
  getDocumentReports,
  getPaymentWorkflow,
  previewPaymentWorkflow,
  recordPaymentWorkflow,
} from '../billingService';
import { PaymentWorkflowModal } from '../PaymentWorkflowModal';
import {
  paymentValuesFixture,
  paymentWorkflowFixture,
} from './paymentWorkflowFixture';

jest.mock('../billingService', () => ({
  ...jest.requireActual('../billingService'),
  getPaymentWorkflow: jest.fn(),
  previewPaymentWorkflow: jest.fn(),
  recordPaymentWorkflow: jest.fn(),
  getDocumentReports: jest.fn(),
}));
const close = jest.fn(),
  completed = jest.fn(),
  reconnect = jest.fn();
const show = () =>
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <PaymentWorkflowModal
        uid={3}
        invoiceId={7}
        close={close}
        completed={completed}
        reconnect={reconnect}
      />
    </QueryClientProvider>,
  );
const review = async () => {
  const button = await screen.findByRole('button', { name: 'Review payment' });
  await act(async () => fireEvent.click(button));
};

describe('Native payment recording review', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (getPaymentWorkflow as jest.Mock).mockResolvedValue(
      paymentWorkflowFixture(),
    );
    (previewPaymentWorkflow as jest.Mock).mockResolvedValue(
      paymentWorkflowFixture(),
    );
    (recordPaymentWorkflow as jest.Mock).mockResolvedValue(
      paymentWorkflowFixture({ can_record: false, values: false }),
    );
  });
  it('loads native fields without recording money and closes without a write', async () => {
    show();
    await screen.findByLabelText('Payment journal');
    expect(
      screen.getByText(/does not charge a card or transfer money/),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Record payment' }),
    ).not.toBeInTheDocument();
    expect(previewPaymentWorkflow).not.toHaveBeenCalled();
    expect(recordPaymentWorkflow).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Back to invoices' }));
    expect(close).toHaveBeenCalledTimes(1);
  });
  it('requires a preview after each edit, preserves partial amount and labels native differences', async () => {
    show();
    await review();
    await screen.findByRole('button', { name: 'Record payment' });
    fireEvent.change(screen.getByLabelText('Amount'), {
      target: { value: '100' },
    });
    expect(
      screen.queryByRole('button', { name: 'Record payment' }),
    ).not.toBeInTheDocument();
    const partial = paymentWorkflowFixture({
      values: {
        ...paymentValuesFixture(),
        amount: 100,
      },
      difference: 400,
    });
    (previewPaymentWorkflow as jest.Mock).mockResolvedValue(partial);
    await review();
    await screen.findByRole('button', { name: 'Record payment' });
    expect(previewPaymentWorkflow).toHaveBeenLastCalledWith(
      paymentWorkflowFixture().invoice,
      expect.objectContaining({
        amount: 100,
        payment_difference_handling: 'open',
      }),
      false,
    );
    expect(
      screen.getByText(/Any remaining amount stays open/),
    ).toBeInTheDocument();
    expect(recordPaymentWorkflow).not.toHaveBeenCalled();
  });
  it('records once, blocks closing during writes and passes only the reviewed native snapshot', async () => {
    let resolve!: (value: ReturnType<typeof paymentWorkflowFixture>) => void;
    (recordPaymentWorkflow as jest.Mock).mockReturnValue(
      new Promise((r) => {
        resolve = r;
      }),
    );
    show();
    await review();
    const button = await screen.findByRole('button', {
      name: 'Record payment',
    });
    fireEvent.click(button);
    fireEvent.click(button);
    expect(recordPaymentWorkflow).toHaveBeenCalledTimes(1);
    expect(recordPaymentWorkflow).toHaveBeenCalledWith(
      paymentWorkflowFixture(),
    );
    expect(
      screen.getByRole('button', { name: 'Back to invoices' }),
    ).toBeDisabled();
    fireEvent.keyDown(screen.getByRole('dialog'), {
      key: 'Escape',
      keyCode: 27,
    });
    expect(close).not.toHaveBeenCalled();
    const result = paymentWorkflowFixture({ values: false, can_record: false });
    await act(async () => resolve(result));
    expect(completed).toHaveBeenCalledWith(result);
  });
  it('does not resend after an uncertain result and reloads linked payments before another action', async () => {
    (recordPaymentWorkflow as jest.Mock).mockRejectedValue(
      new Error('Response lost'),
    );
    show();
    await review();
    fireEvent.click(
      await screen.findByRole('button', { name: 'Record payment' }),
    );
    await screen.findByText('Response lost');
    expect(
      screen.getByRole('button', { name: 'Record payment' }),
    ).toBeDisabled();
    expect(
      screen.getByText(/payment may already have been saved/),
    ).toBeInTheDocument();
    (getPaymentWorkflow as jest.Mock).mockResolvedValue(
      paymentWorkflowFixture({
        can_record: false,
        values: false,
        payments: [
          {
            id: 99,
            name: 'QA Payment 99',
            amount: 500,
            currency_id: [1, 'INR'],
            journal_id: [2, 'QA Cash'],
            journal_type: 'bank',
            is_matched: false,
            date: '2026-10-09',
            state: 'posted',
            payment_type: 'inbound',
            ref: 'QA Memo',
            bank_reference: false,
            cheque_reference: false,
            effective_date: false,
            method_code: 'manual',
          },
        ],
      }),
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Reload current payment status' }),
    );
    await screen.findByRole('button', {
      name: 'PDF receipts for QA Payment 99',
    });
    expect(screen.getByText(/bank matching pending/)).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Record payment' }),
    ).not.toBeInTheDocument();
    expect(recordPaymentWorkflow).toHaveBeenCalledTimes(1);
    (getDocumentReports as jest.Mock).mockResolvedValue([
      { key: 'receipt', name: 'Receipt' },
    ]);
    fireEvent.click(
      screen.getByRole('button', { name: 'PDF receipts for QA Payment 99' }),
    );
    await screen.findByRole('button', { name: 'Download Receipt' });
    expect(getDocumentReports).toHaveBeenCalledWith('payment', 99);
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
    fireEvent.click(
      screen.getByRole('button', { name: 'Back to payment details' }),
    );
    await screen.findByRole('button', {
      name: 'PDF receipts for QA Payment 99',
    });
    expect(recordPaymentWorkflow).toHaveBeenCalledTimes(1);
  });
  it('shows outbound refund wording and requires explicit difference accounting', async () => {
    (previewPaymentWorkflow as jest.Mock).mockResolvedValue(
      paymentWorkflowFixture({ payment_type: 'outbound' }),
    );
    show();
    await screen.findByLabelText('Payment difference');
    fireEvent.change(screen.getByLabelText('Payment difference'), {
      target: { value: 'reconcile' },
    });
    expect(screen.getByLabelText('Difference account')).toBeInTheDocument();
    await review();
    expect(
      await screen.findByRole('button', { name: 'Record refund payment' }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Money sent/)).toBeInTheDocument();
  });
  it('refreshes native amount and methods on journal changes without enabling a write', async () => {
    show();
    await screen.findByLabelText('Payment journal');
    await act(async () =>
      fireEvent.change(screen.getByLabelText('Payment journal'), {
        target: { value: '2' },
      }),
    );
    await waitFor(() =>
      expect(previewPaymentWorkflow).toHaveBeenCalledWith(
        paymentWorkflowFixture().invoice,
        expect.objectContaining({ journal_id: 2 }),
        'journal_id',
      ),
    );
    expect(
      screen.queryByRole('button', { name: 'Record payment' }),
    ).not.toBeInTheDocument();
    expect(recordPaymentWorkflow).not.toHaveBeenCalled();
  });
  it('hides financial details after expiration and supports reconnecting', async () => {
    (getPaymentWorkflow as jest.Mock).mockRejectedValue(
      new BillingSessionExpired(),
    );
    show();
    fireEvent.click(
      await screen.findByRole('button', { name: 'Reconnect Billing' }),
    );
    expect(reconnect).toHaveBeenCalledTimes(1);
    expect(screen.queryByLabelText('Amount')).not.toBeInTheDocument();
  });
  it('reviews native cheque references and effective date without implying deferred posting or clearance', async () => {
    const pdc = paymentWorkflowFixture({
      method_code: 'pdc',
      methods: [[3, 'PDC']],
      can_record: false,
      reason:
        'Enter the post-dated cheque effective date before recording payment.',
    });
    (getPaymentWorkflow as jest.Mock).mockResolvedValue(pdc);
    show();
    expect(
      await screen.findByLabelText('Cheque effective date'),
    ).toBeRequired();
    expect(
      screen.getByText(/posts on the payment date, not the effective date/),
    ).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Bank reference'), {
      target: { value: 'QA Bank 001' },
    });
    fireEvent.change(screen.getByLabelText('Cheque reference'), {
      target: { value: 'QA Cheque 002' },
    });
    fireEvent.change(screen.getByLabelText('Cheque effective date'), {
      target: { value: '2026-11-09' },
    });
    const accepted = {
      ...pdc,
      can_record: true,
      reason: false as const,
      values: {
        ...paymentValuesFixture(),
        bank_reference: 'QA Bank 001',
        cheque_reference: 'QA Cheque 002',
        effective_date: '2026-11-09',
      },
    };
    (previewPaymentWorkflow as jest.Mock).mockResolvedValue(accepted);
    await review();
    expect(previewPaymentWorkflow).toHaveBeenLastCalledWith(
      pdc.invoice,
      accepted.values,
      false,
    );
    expect(await screen.findByText(/Cheque amount/)).toBeInTheDocument();
    expect(
      screen.getByText('Cheque reference: QA Cheque 002'),
    ).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Cheque reference'), {
      target: { value: 'QA Changed' },
    });
    expect(
      screen.queryByRole('button', { name: 'Record payment' }),
    ).not.toBeInTheDocument();
    expect(recordPaymentWorkflow).not.toHaveBeenCalled();
  });
  it('reloads saved cheque metadata with bank matching still pending', async () => {
    (getPaymentWorkflow as jest.Mock).mockResolvedValue(
      paymentWorkflowFixture({
        can_record: false,
        values: false,
        method_code: false,
        payments: [
          {
            id: 99,
            name: 'QA PDC 99',
            amount: 100,
            currency_id: [1, 'INR'],
            journal_id: [2, 'QA Bank'],
            journal_type: 'bank',
            is_matched: false,
            date: '2026-10-09',
            state: 'posted',
            payment_type: 'inbound',
            ref: false,
            method_code: 'pdc',
            bank_reference: 'QA Bank 001',
            cheque_reference: 'QA Cheque 002',
            effective_date: '2026-11-09',
          },
        ],
      }),
    );
    show();
    expect(
      await screen.findByText(
        /post-dated cheque.*QA Cheque 002.*2026-11-09.*bank matching pending/,
      ),
    ).toBeInTheDocument();
    expect(recordPaymentWorkflow).not.toHaveBeenCalled();
  });
  it('does not offer recording for unbalanced or ineligible invoices', async () => {
    const fixture = paymentWorkflowFixture();
    (getPaymentWorkflow as jest.Mock).mockResolvedValue({
      ...fixture,
      values: false,
      can_record: false,
      invoice: { ...fixture.invoice, ledger_balanced: false },
      reason: 'Review the journal balance.',
    });
    show();
    await screen.findByText(/Do not record a payment/);
    expect(
      screen.queryByRole('button', { name: 'Review payment' }),
    ).not.toBeInTheDocument();
    expect(recordPaymentWorkflow).not.toHaveBeenCalled();
  });
});
