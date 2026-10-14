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
  getInvoiceWorkflow,
  postInvoiceWorkflow,
} from '../billingService';
import { InvoiceWorkflowModal } from '../InvoiceWorkflowModal';
import { invoiceWorkflowFixture } from './invoiceWorkflowFixture';

jest.mock('../billingService', () => ({
  ...jest.requireActual('../billingService'),
  getInvoiceWorkflow: jest.fn(),
  postInvoiceWorkflow: jest.fn(),
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
      <InvoiceWorkflowModal
        uid={3}
        invoiceId={7}
        close={close}
        completed={completed}
        reconnect={reconnect}
      />
    </QueryClientProvider>,
  );

describe('Invoice posting review', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (getInvoiceWorkflow as jest.Mock).mockResolvedValue(
      invoiceWorkflowFixture(),
    );
    (postInvoiceWorkflow as jest.Mock).mockResolvedValue(
      invoiceWorkflowFixture({
        state: 'posted',
        name: 'INV/QA/7',
        can_post: false,
      }),
    );
  });
  it('shows actual customer, journal and total before an explicit posting action', async () => {
    show();
    await screen.findByRole('button', { name: 'Post invoice' });
    expect(screen.getByText('Customer: QorliaQA Customer')).toBeInTheDocument();
    expect(screen.getByText(/QA Company.*QA Sales/)).toBeInTheDocument();
    expect(
      screen.getByText(/does not receive money or issue a refund/),
    ).toBeInTheDocument();
    expect(postInvoiceWorkflow).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Back to invoices' }));
    expect(close).toHaveBeenCalledTimes(1);
  });
  it('submits once and blocks duplicate clicks and closing while posting', async () => {
    let resolve!: (value: ReturnType<typeof invoiceWorkflowFixture>) => void;
    (postInvoiceWorkflow as jest.Mock).mockReturnValue(
      new Promise((r) => {
        resolve = r;
      }),
    );
    show();
    const button = await screen.findByRole('button', { name: 'Post invoice' });
    fireEvent.click(button);
    fireEvent.click(button);
    expect(postInvoiceWorkflow).toHaveBeenCalledTimes(1);
    expect(postInvoiceWorkflow).toHaveBeenCalledWith(invoiceWorkflowFixture());
    expect(
      screen.getByRole('button', { name: 'Back to invoices' }),
    ).toBeDisabled();
    fireEvent.keyDown(screen.getByRole('dialog'), {
      key: 'Escape',
      keyCode: 27,
    });
    expect(close).not.toHaveBeenCalled();
    const result = invoiceWorkflowFixture({ state: 'posted', can_post: false });
    await act(async () => resolve(result));
    expect(completed).toHaveBeenCalledWith(result);
  });
  it('blocks unbalanced entries even if a malformed backend offers posting', async () => {
    (getInvoiceWorkflow as jest.Mock).mockResolvedValue(
      invoiceWorkflowFixture({ ledger_balanced: false, can_post: true }),
    );
    show();
    await screen.findByText(/journal entries do not balance/);
    expect(screen.getByText(/Do not record a payment/)).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Post invoice' }),
    ).not.toBeInTheDocument();
    expect(postInvoiceWorkflow).not.toHaveBeenCalled();
  });
  it('never retries a mutation, then recovers by reading its posted status', async () => {
    (postInvoiceWorkflow as jest.Mock).mockRejectedValue(
      new Error('Response unavailable'),
    );
    show();
    fireEvent.click(
      await screen.findByRole('button', { name: 'Post invoice' }),
    );
    await screen.findByText('Response unavailable');
    expect(screen.getByRole('button', { name: 'Post invoice' })).toBeDisabled();
    expect(postInvoiceWorkflow).toHaveBeenCalledTimes(1);
    (getInvoiceWorkflow as jest.Mock).mockResolvedValue(
      invoiceWorkflowFixture({ state: 'posted', can_post: false }),
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Reload current status' }),
    );
    await screen.findByText(/No posting action is available/);
    expect(screen.queryByText('Response unavailable')).not.toBeInTheDocument();
    expect(postInvoiceWorkflow).toHaveBeenCalledTimes(1);
  });
  it('labels credit-note posting without claiming a refund payment', async () => {
    (getInvoiceWorkflow as jest.Mock).mockResolvedValue(
      invoiceWorkflowFixture({ move_type: 'out_refund' }),
    );
    show();
    fireEvent.click(
      await screen.findByRole('button', { name: 'Post credit note' }),
    );
    await waitFor(() => expect(postInvoiceWorkflow).toHaveBeenCalledTimes(1));
  });
  it('shows read failures and hides financial details when the ERP session expires', async () => {
    (getInvoiceWorkflow as jest.Mock).mockRejectedValueOnce(
      new Error('Read unavailable'),
    );
    show();
    await screen.findByText('Read unavailable');
    expect(screen.queryByText(/No posting action/)).not.toBeInTheDocument();
    (getInvoiceWorkflow as jest.Mock).mockRejectedValueOnce(
      new BillingSessionExpired(),
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Reload current status' }),
    );
    fireEvent.click(
      await screen.findByRole('button', { name: 'Reconnect Billing' }),
    );
    expect(reconnect).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('QorliaQA Customer')).not.toBeInTheDocument();
    expect(postInvoiceWorkflow).not.toHaveBeenCalled();
  });
});
