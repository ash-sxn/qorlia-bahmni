import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen } from '@testing-library/react';
import {
  BillingSessionExpired,
  getReversalWorkflow,
  previewReversalWorkflow,
  runReversalWorkflow,
} from '../billingService';
import { ReversalWorkflowModal } from '../ReversalWorkflowModal';
import {
  reversalResultFixture,
  reversalWorkflowFixture,
} from './reversalWorkflowFixture';

jest.mock('../billingService', () => ({
  ...jest.requireActual('../billingService'),
  getReversalWorkflow: jest.fn(),
  previewReversalWorkflow: jest.fn(),
  runReversalWorkflow: jest.fn(),
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
      <ReversalWorkflowModal
        uid={3}
        invoiceId={7}
        close={close}
        completed={completed}
        reconnect={reconnect}
      />
    </QueryClientProvider>,
  );
const preview = async () => {
  const button = await screen.findByRole('button', {
    name: 'Review credit note',
  });
  await act(async () => fireEvent.click(button));
};

describe('Native credit-note creation review', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (getReversalWorkflow as jest.Mock).mockResolvedValue(
      reversalWorkflowFixture(),
    );
    (previewReversalWorkflow as jest.Mock).mockResolvedValue(
      reversalWorkflowFixture(),
    );
    (runReversalWorkflow as jest.Mock).mockResolvedValue(
      reversalResultFixture(),
    );
  });
  it('loads native options, requires a preview and invalidates it after editing', async () => {
    show();
    await screen.findByLabelText('Credit-note method');
    expect(
      screen.queryByRole('button', { name: /Confirm credit-note/ }),
    ).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Reason'), {
      target: { value: 'QA correction' },
    });
    await preview();
    await screen.findByRole('button', { name: /Confirm credit-note/ });
    expect(previewReversalWorkflow).toHaveBeenCalledWith(
      reversalWorkflowFixture(),
      {
        ...reversalWorkflowFixture().values,
        reason: 'QA correction',
      },
    );
    expect(
      screen.getByText(/not posted or allocated automatically/),
    ).toBeInTheDocument();
    expect(runReversalWorkflow).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('Credit-note date'), {
      target: { value: '2026-10-10' },
    });
    expect(
      screen.queryByRole('button', { name: /Confirm credit-note/ }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Back to invoices' }));
    expect(close).toHaveBeenCalledTimes(1);
  });
  it('explains full reversal and replacement without conflating it with payment or stock', async () => {
    const loaded = reversalWorkflowFixture();
    (previewReversalWorkflow as jest.Mock).mockResolvedValue(
      reversalWorkflowFixture({
        values: {
          ...(loaded.values as Exclude<typeof loaded.values, false>),
          refund_method: 'modify',
          date_mode: 'entry',
        },
      }),
    );
    show();
    fireEvent.change(await screen.findByLabelText('Credit-note method'), {
      target: { value: 'modify' },
    });
    fireEvent.change(screen.getByLabelText('Reversal date'), {
      target: { value: 'entry' },
    });
    expect(screen.queryByLabelText('Credit-note date')).not.toBeInTheDocument();
    await preview();
    await screen.findByText(/releases existing invoice allocations/);
    expect(
      screen.getByText(/replacement invoice is also created in draft/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/does not transfer or refund money, return stock/),
    ).toBeInTheDocument();
  });
  it('explains future posting and keeps invoice balance unchanged now', async () => {
    (previewReversalWorkflow as jest.Mock).mockResolvedValue(
      reversalWorkflowFixture({
        scheduled: true,
        effective_date: '2026-10-10',
      }),
    );
    show();
    await preview();
    await screen.findByText(/does not reduce the invoice balance now/);
    expect(
      screen.queryByText(/posts the full credit note/),
    ).not.toBeInTheDocument();
  });
  it('confirms once and refuses closing during a pending save', async () => {
    let resolve!: (value: ReturnType<typeof reversalResultFixture>) => void;
    (runReversalWorkflow as jest.Mock).mockReturnValue(
      new Promise((r) => {
        resolve = r;
      }),
    );
    show();
    await preview();
    const button = await screen.findByRole('button', {
      name: /Confirm credit-note/,
    });
    fireEvent.click(button);
    fireEvent.click(button);
    expect(runReversalWorkflow).toHaveBeenCalledTimes(1);
    expect(runReversalWorkflow).toHaveBeenCalledWith(reversalWorkflowFixture());
    fireEvent.keyDown(screen.getByRole('dialog'), {
      key: 'Escape',
      keyCode: 27,
    });
    expect(close).not.toHaveBeenCalled();
    expect(
      screen.getByRole('button', { name: 'Back to invoices' }),
    ).toBeDisabled();
    await act(async () => resolve(reversalResultFixture()));
    expect(completed).toHaveBeenCalledWith(reversalResultFixture());
  });
  it('does not resend an ambiguous save and requires reload and a fresh review', async () => {
    (runReversalWorkflow as jest.Mock).mockRejectedValue(
      new Error('Response unavailable'),
    );
    show();
    await preview();
    fireEvent.click(
      await screen.findByRole('button', { name: /Confirm credit-note/ }),
    );
    await screen.findByText(/request may already have reached Billing/);
    expect(
      screen.getByRole('button', { name: /Confirm credit-note/ }),
    ).toBeDisabled();
    expect(
      screen.getByRole('button', { name: 'Review credit note' }),
    ).toBeDisabled();
    fireEvent.click(
      screen.getByRole('button', { name: 'Reload current status' }),
    );
    await screen.findByRole('button', { name: 'Review credit note' });
    expect(runReversalWorkflow).toHaveBeenCalledTimes(1);
    expect(
      screen.queryByRole('button', { name: /Confirm credit-note/ }),
    ).not.toBeInTheDocument();
  });
  it('hides sensitive review after session expiry and offers reconnect', async () => {
    (runReversalWorkflow as jest.Mock).mockRejectedValue(
      new BillingSessionExpired(),
    );
    show();
    await preview();
    fireEvent.click(
      await screen.findByRole('button', { name: /Confirm credit-note/ }),
    );
    fireEvent.click(
      await screen.findByRole('button', { name: 'Reconnect Billing' }),
    );
    expect(reconnect).toHaveBeenCalledTimes(1);
    expect(
      screen.queryByLabelText('Credit-note method'),
    ).not.toBeInTheDocument();
  });
  it('shows unavailable permission state without offering confirmation', async () => {
    (getReversalWorkflow as jest.Mock).mockResolvedValue(
      reversalWorkflowFixture({
        can_reverse: false,
        values: false,
        reason: 'Your Billing account cannot create credit notes.',
        source_version: false,
        version: false,
      }),
    );
    show();
    await screen.findByText(/cannot create credit notes/);
    expect(
      screen.queryByRole('button', { name: 'Review credit note' }),
    ).not.toBeInTheDocument();
    expect(runReversalWorkflow).not.toHaveBeenCalled();
  });
});
