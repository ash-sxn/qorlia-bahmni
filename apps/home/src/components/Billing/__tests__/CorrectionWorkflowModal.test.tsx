import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen } from '@testing-library/react';
import {
  BillingSessionExpired,
  getCorrectionWorkflow,
  runCorrectionWorkflow,
} from '../billingService';
import { CorrectionWorkflowModal } from '../CorrectionWorkflowModal';
import { correctionWorkflowFixture } from './correctionWorkflowFixture';
import { invoiceWorkflowFixture } from './invoiceWorkflowFixture';

jest.mock('../billingService', () => ({
  ...jest.requireActual('../billingService'),
  getCorrectionWorkflow: jest.fn(),
  runCorrectionWorkflow: jest.fn(),
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
      <CorrectionWorkflowModal
        uid={3}
        invoiceId={7}
        close={close}
        completed={completed}
        reconnect={reconnect}
      />
    </QueryClientProvider>,
  );

describe('Invoice correction review', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (getCorrectionWorkflow as jest.Mock).mockResolvedValue(
      correctionWorkflowFixture(),
    );
    (runCorrectionWorkflow as jest.Mock).mockResolvedValue(
      invoiceWorkflowFixture(),
    );
  });
  it('requires a separate consequence review and allows backing out without mutation', async () => {
    show();
    fireEvent.click(
      await screen.findByRole('button', { name: 'Review reset to draft' }),
    );
    expect(screen.getByText(/QA Receipt:/)).toBeInTheDocument();
    expect(
      screen.getByText(/Reposting does not automatically reapply/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/does not refund, collect or transfer money/),
    ).toBeInTheDocument();
    expect(runCorrectionWorkflow).not.toHaveBeenCalled();
    fireEvent.click(
      screen.getByRole('button', { name: 'Keep current status' }),
    );
    expect(
      screen.queryByRole('button', { name: /Confirm reset to draft/ }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Back to invoices' }));
    expect(close).toHaveBeenCalledTimes(1);
  });
  it('confirms exactly once with the reviewed version and refuses close while saving', async () => {
    let resolve!: (value: ReturnType<typeof invoiceWorkflowFixture>) => void;
    (runCorrectionWorkflow as jest.Mock).mockReturnValue(
      new Promise((r) => {
        resolve = r;
      }),
    );
    show();
    fireEvent.click(
      await screen.findByRole('button', { name: 'Review reset to draft' }),
    );
    const button = screen.getByRole('button', {
      name: /Confirm reset to draft/,
    });
    fireEvent.click(button);
    fireEvent.click(button);
    expect(runCorrectionWorkflow).toHaveBeenCalledTimes(1);
    expect(runCorrectionWorkflow).toHaveBeenCalledWith(
      correctionWorkflowFixture(),
      'reset',
    );
    fireEvent.keyDown(screen.getByRole('dialog'), {
      key: 'Escape',
      keyCode: 27,
    });
    expect(close).not.toHaveBeenCalled();
    expect(
      screen.getByRole('button', { name: 'Back to invoices' }),
    ).toBeDisabled();
    const result = invoiceWorkflowFixture();
    await act(async () => resolve(result));
    expect(completed).toHaveBeenCalledWith(result, 'reset');
  });
  it('only offers draft cancellation and preserves the order/stock distinction', async () => {
    const review = correctionWorkflowFixture({
      invoice: invoiceWorkflowFixture(),
      can_reset: false,
      can_cancel: true,
      posted_before: false,
      allocations: [],
    });
    (getCorrectionWorkflow as jest.Mock).mockResolvedValue(review);
    show();
    fireEvent.click(
      await screen.findByRole('button', { name: 'Review draft cancellation' }),
    );
    expect(
      screen.getByText(/does not return stock or cancel its sales order/),
    ).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole('button', { name: /Confirm draft cancellation/ }),
    );
    expect(runCorrectionWorkflow).toHaveBeenCalledWith(review, 'cancel');
    await screen.findByRole('button', { name: 'Back to invoices' });
  });
  it('hides ineligible actions and blocks unbalanced or impossible state combinations', async () => {
    (getCorrectionWorkflow as jest.Mock).mockResolvedValue(
      correctionWorkflowFixture({ can_reset: false }),
    );
    show();
    await screen.findByText(/No correction is available/);
    expect(
      screen.queryByRole('button', { name: 'Review reset to draft' }),
    ).not.toBeInTheDocument();
    (getCorrectionWorkflow as jest.Mock).mockResolvedValue(
      correctionWorkflowFixture({
        invoice: invoiceWorkflowFixture({
          state: 'posted',
          ledger_balanced: false,
        }),
        can_cancel: true,
      }),
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Reload current status' }),
    );
    await screen.findByText(/journal entries do not balance/);
    expect(
      screen.queryByRole('button', { name: 'Review reset to draft' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Review draft cancellation' }),
    ).not.toBeInTheDocument();
  });
  it('does not retry ambiguous saves, requires a fresh review after readback', async () => {
    (runCorrectionWorkflow as jest.Mock).mockRejectedValue(
      new Error('Response unavailable'),
    );
    show();
    fireEvent.click(
      await screen.findByRole('button', { name: 'Review reset to draft' }),
    );
    fireEvent.click(
      screen.getByRole('button', { name: /Confirm reset to draft/ }),
    );
    await screen.findByText('Response unavailable');
    expect(
      screen.getByRole('button', { name: /Confirm reset to draft/ }),
    ).toBeDisabled();
    fireEvent.click(
      screen.getByRole('button', { name: 'Reload current status' }),
    );
    await screen.findByRole('button', { name: 'Review reset to draft' });
    expect(
      screen.queryByRole('button', { name: /Confirm reset to draft/ }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText('Response unavailable')).not.toBeInTheDocument();
    expect(runCorrectionWorkflow).toHaveBeenCalledTimes(1);
  });
  it('hides financial data on session expiry and supports reconnect', async () => {
    (getCorrectionWorkflow as jest.Mock).mockRejectedValue(
      new BillingSessionExpired(),
    );
    show();
    fireEvent.click(
      await screen.findByRole('button', { name: 'Reconnect Billing' }),
    );
    expect(reconnect).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(/QA Receipt/)).not.toBeInTheDocument();
    expect(runCorrectionWorkflow).not.toHaveBeenCalled();
  });
});
