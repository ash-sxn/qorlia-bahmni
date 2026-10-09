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
  getOrderWorkflow,
  getAdvanceInvoice,
  runOrderWorkflow,
} from '../billingService';
import { OrderWorkflowModal } from '../OrderWorkflowModal';
import { advanceFixture } from './advanceInvoiceFixture';
import { workflowFixture } from './workflowFixture';

jest.mock('../billingService', () => ({
  ...jest.requireActual('../billingService'),
  getOrderWorkflow: jest.fn(),
  getAdvanceInvoice: jest.fn(),
  runOrderWorkflow: jest.fn(),
}));
const close = jest.fn();
const completed = jest.fn();
const reconnect = jest.fn();
const show = () =>
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <OrderWorkflowModal
        uid={3}
        orderId={18}
        close={close}
        completed={completed}
        reconnect={reconnect}
      />
    </QueryClientProvider>,
  );

describe('Native order action review', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (getOrderWorkflow as jest.Mock).mockResolvedValue(workflowFixture());
    (runOrderWorkflow as jest.Mock).mockResolvedValue(
      workflowFixture({
        state: 'sale',
        can_confirm: false,
        invoices: [
          {
            id: 8,
            name: 'INV/QA/8',
            state: 'posted',
            total: 500,
            currency: [1, 'INR'],
          },
        ],
      }),
    );
  });
  it('discloses native invoice posting and stock delivery before any explicit action', async () => {
    show();
    await screen.findByRole('button', { name: 'Confirm quotation' });
    expect(screen.getByText(/inventory reduced/)).toBeInTheDocument();
    expect(screen.getByText(/creates and posts invoices/)).toBeInTheDocument();
    expect(runOrderWorkflow).not.toHaveBeenCalled();
    fireEvent.click(
      screen.getByRole('button', { name: 'Back to charge orders' }),
    );
    expect(close).toHaveBeenCalledTimes(1);
  });
  it('submits the loaded version once and prevents closing or duplicate actions while saving', async () => {
    let resolve!: (value: ReturnType<typeof workflowFixture>) => void;
    (runOrderWorkflow as jest.Mock).mockReturnValue(
      new Promise((r) => {
        resolve = r;
      }),
    );
    show();
    const button = await screen.findByRole('button', {
      name: 'Confirm quotation',
    });
    fireEvent.click(button);
    fireEvent.click(button);
    expect(runOrderWorkflow).toHaveBeenCalledTimes(1);
    expect(runOrderWorkflow).toHaveBeenCalledWith(workflowFixture(), 'confirm');
    expect(
      screen.getByRole('button', { name: 'Back to charge orders' }),
    ).toBeDisabled();
    fireEvent.keyDown(screen.getByRole('dialog'), {
      key: 'Escape',
      keyCode: 27,
    });
    expect(close).not.toHaveBeenCalled();
    const result = workflowFixture({ state: 'sale', can_confirm: false });
    await act(async () => resolve(result));
    expect(completed).toHaveBeenCalledWith(result);
  });
  it('never replays a failed mutation and requires an explicit fresh status read', async () => {
    (runOrderWorkflow as jest.Mock).mockRejectedValue(
      new Error('Response unavailable'),
    );
    show();
    fireEvent.click(
      await screen.findByRole('button', { name: 'Confirm quotation' }),
    );
    await screen.findByText('Response unavailable');
    expect(
      screen.getByText(/may already have reached Billing/),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Confirm quotation' }),
    ).toBeDisabled();
    expect(runOrderWorkflow).toHaveBeenCalledTimes(1);
    (getOrderWorkflow as jest.Mock).mockResolvedValue(
      workflowFixture({ state: 'sale', can_confirm: false }),
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Reload current status' }),
    );
    await screen.findByText(/No confirmation or regular invoicing action/);
    expect(screen.queryByText('Response unavailable')).not.toBeInTheDocument();
    expect(runOrderWorkflow).toHaveBeenCalledTimes(1);
  });
  it('offers a regular invoice only for a native eligible confirmed order', async () => {
    (getOrderWorkflow as jest.Mock).mockResolvedValue(
      workflowFixture({
        state: 'sale',
        can_confirm: false,
        can_invoice: true,
        automation: { delivery: false, invoice: false, legacy_delivery: false },
      }),
    );
    show();
    const button = await screen.findByRole('button', {
      name: 'Create regular invoice',
    });
    expect(screen.getByText(/remain a draft for review/)).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Confirm quotation' }),
    ).not.toBeInTheDocument();
    fireEvent.click(button);
    await waitFor(() =>
      expect(runOrderWorkflow).toHaveBeenCalledWith(
        expect.objectContaining({ state: 'sale' }),
        'invoice',
        true,
      ),
    );
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
  });
  it('defaults to native advance deduction and submits the explicit unchecked choice', async () => {
    (getOrderWorkflow as jest.Mock).mockResolvedValue(
      workflowFixture({
        state: 'sale',
        can_confirm: false,
        can_invoice: true,
        has_down_payments: true,
      }),
    );
    let resolve!: (value: ReturnType<typeof workflowFixture>) => void;
    (runOrderWorkflow as jest.Mock).mockReturnValue(
      new Promise((r) => {
        resolve = r;
      }),
    );
    show();
    const choice = await screen.findByRole('checkbox', {
      name: 'Deduct down payments',
    });
    expect(choice).toBeChecked();
    expect(runOrderWorkflow).not.toHaveBeenCalled();
    fireEvent.click(choice);
    expect(choice).not.toBeChecked();
    expect(screen.getByRole('alert')).toHaveTextContent(
      'can charge the full invoiceable amount again',
    );
    const save = screen.getByRole('button', { name: 'Create regular invoice' });
    fireEvent.click(save);
    fireEvent.click(save);
    expect(runOrderWorkflow).toHaveBeenCalledTimes(1);
    expect(runOrderWorkflow).toHaveBeenCalledWith(
      expect.objectContaining({ has_down_payments: true }),
      'invoice',
      false,
    );
    expect(choice).toBeDisabled();
    await act(async () => resolve(workflowFixture({ state: 'sale' })));
  });
  it('requires a fresh status read after an uncertain regular-invoice result and resets deduction safely', async () => {
    (getOrderWorkflow as jest.Mock).mockResolvedValue(
      workflowFixture({
        state: 'sale',
        can_confirm: false,
        can_invoice: true,
        has_down_payments: true,
      }),
    );
    (runOrderWorkflow as jest.Mock).mockRejectedValue(
      new Error('Response unavailable'),
    );
    show();
    fireEvent.click(
      await screen.findByRole('checkbox', { name: 'Deduct down payments' }),
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Create regular invoice' }),
    );
    await screen.findByText('Response unavailable');
    expect(screen.getByRole('checkbox')).toBeDisabled();
    expect(runOrderWorkflow).toHaveBeenCalledTimes(1);
    fireEvent.click(
      screen.getByRole('button', { name: 'Reload current status' }),
    );
    await waitFor(() => expect(screen.getByRole('checkbox')).toBeEnabled());
    expect(screen.getByRole('checkbox')).toBeChecked();
    expect(runOrderWorkflow).toHaveBeenCalledTimes(1);
  });
  it('distinguishes failed reads and expired sessions from orders without available actions', async () => {
    (getOrderWorkflow as jest.Mock).mockRejectedValueOnce(
      new Error('Read unavailable'),
    );
    show();
    await screen.findByText('Read unavailable');
    expect(
      screen.queryByText(/No confirmation or regular invoicing/),
    ).not.toBeInTheDocument();
    (getOrderWorkflow as jest.Mock).mockRejectedValueOnce(
      new BillingSessionExpired(),
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Reload current status' }),
    );
    fireEvent.click(
      await screen.findByRole('button', { name: 'Reconnect Billing' }),
    );
    expect(reconnect).toHaveBeenCalledTimes(1);
    expect(runOrderWorkflow).not.toHaveBeenCalled();
  });
  it('opens advances from eligible confirmed orders even with no regular invoiceable quantities', async () => {
    (getOrderWorkflow as jest.Mock).mockResolvedValue(
      workflowFixture({
        state: 'sale',
        can_confirm: false,
        can_invoice: false,
        can_advance: true,
      }),
    );
    (getAdvanceInvoice as jest.Mock).mockResolvedValue(advanceFixture());
    show();
    fireEvent.click(
      await screen.findByRole('button', { name: 'Create advance invoice' }),
    );
    await screen.findByLabelText('Advance percentage');
    expect(getAdvanceInvoice).toHaveBeenCalledWith(18);
    expect(runOrderWorkflow).not.toHaveBeenCalled();
    fireEvent.click(
      screen.getByRole('button', { name: 'Back to order actions' }),
    );
    await screen.findByRole('button', { name: 'Create advance invoice' });
    expect(close).not.toHaveBeenCalled();
  });
});
