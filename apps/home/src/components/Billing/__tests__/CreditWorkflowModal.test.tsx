import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import {
  applyCreditWorkflow,
  BillingSessionExpired,
  getCreditWorkflow,
} from '../billingService';
import { CreditWorkflowModal } from '../CreditWorkflowModal';
import { creditWorkflowFixture } from './creditWorkflowFixture';
jest.mock('../billingService', () => ({
  ...jest.requireActual('../billingService'),
  getCreditWorkflow: jest.fn(),
  applyCreditWorkflow: jest.fn(),
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
      <CreditWorkflowModal
        uid={3}
        invoiceId={7}
        close={close}
        completed={completed}
        reconnect={reconnect}
      />
    </QueryClientProvider>,
  );
const select = async () => {
  const button = await screen.findByRole('button', {
    name: 'Review QorliaQA Credit note',
  });
  await act(async () => fireEvent.click(button));
};
describe('Reviewed native credit allocation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (getCreditWorkflow as jest.Mock).mockResolvedValue(creditWorkflowFixture());
    (applyCreditWorkflow as jest.Mock).mockResolvedValue(
      creditWorkflowFixture({ credits: [] }),
    );
  });
  it('requires an explicit item review and closing creates no allocation', async () => {
    show();
    await screen.findByText('Outstanding credits');
    expect(
      screen.queryByRole('button', { name: 'Apply reviewed item' }),
    ).not.toBeInTheDocument();
    await select();
    expect(
      screen.getByRole('region', { name: 'Reviewed allocation' }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Back to invoices' }));
    expect(close).toHaveBeenCalledTimes(1);
    expect(applyCreditWorkflow).not.toHaveBeenCalled();
  });
  it('uses the exact reviewed snapshot and calls completion with native invoice status', async () => {
    show();
    await select();
    await act(async () =>
      fireEvent.click(
        screen.getByRole('button', { name: 'Apply reviewed item' }),
      ),
    );
    expect(applyCreditWorkflow).toHaveBeenCalledWith(
      creditWorkflowFixture(),
      12,
    );
    expect(completed).toHaveBeenCalledWith(creditWorkflowFixture().invoice);
    expect(applyCreditWorkflow).toHaveBeenCalledTimes(1);
  });
  it('blocks duplicate submits and close during allocation', async () => {
    let finish!: (value: ReturnType<typeof creditWorkflowFixture>) => void;
    (applyCreditWorkflow as jest.Mock).mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    show();
    await select();
    const button = screen.getByRole('button', { name: 'Apply reviewed item' });
    fireEvent.click(button);
    fireEvent.click(button);
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(close).not.toHaveBeenCalled();
    expect(applyCreditWorkflow).toHaveBeenCalledTimes(1);
    await act(async () => finish(creditWorkflowFixture()));
    expect(completed).toHaveBeenCalledTimes(1);
  });
  it('does not retry an uncertain write and requires reload and a new item review', async () => {
    (applyCreditWorkflow as jest.Mock).mockRejectedValue(
      new Error('Response lost'),
    );
    show();
    await select();
    await act(async () =>
      fireEvent.click(
        screen.getByRole('button', { name: 'Apply reviewed item' }),
      ),
    );
    expect(await screen.findByText(/may already be saved/)).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Apply reviewed item' }),
    ).toBeDisabled();
    expect(applyCreditWorkflow).toHaveBeenCalledTimes(1);
    (getCreditWorkflow as jest.Mock).mockResolvedValue(
      creditWorkflowFixture({
        credits: [],
        history: [
          {
            id: 3,
            name: 'QorliaQA Saved credit',
            date: '2026-10-09',
            amount: 100,
            currency: [3, 'INR'],
            is_exchange: false,
          },
        ],
      }),
    );
    await act(async () =>
      fireEvent.click(
        screen.getByRole('button', {
          name: 'Reload current allocation status',
        }),
      ),
    );
    expect(
      await screen.findByText(/QorliaQA Saved credit/),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Apply reviewed item' }),
    ).not.toBeInTheDocument();
    expect(applyCreditWorkflow).toHaveBeenCalledTimes(1);
  });
  it('hides financial data when the native session expires', async () => {
    (applyCreditWorkflow as jest.Mock).mockRejectedValue(
      new BillingSessionExpired(),
    );
    show();
    await select();
    await act(async () =>
      fireEvent.click(
        screen.getByRole('button', { name: 'Apply reviewed item' }),
      ),
    );
    fireEvent.click(
      await screen.findByRole('button', { name: 'Reconnect Billing' }),
    );
    expect(reconnect).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('QorliaQA Credit note')).not.toBeInTheDocument();
  });
  it('shows read retry and unavailable credits without allocation controls', async () => {
    (getCreditWorkflow as jest.Mock).mockRejectedValue(
      new Error('Read unavailable'),
    );
    show();
    expect(await screen.findByText('Read unavailable')).toBeInTheDocument();
    (getCreditWorkflow as jest.Mock).mockResolvedValue(
      creditWorkflowFixture({
        credits: [
          {
            ...creditWorkflowFixture().credits[0],
            can_apply: false,
          },
        ],
      }),
    );
    await act(async () =>
      fireEvent.click(
        screen.getByRole('button', {
          name: 'Reload current allocation status',
        }),
      ),
    );
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Review QorliaQA Credit note' }),
      ).toBeDisabled(),
    );
    expect(
      screen.queryByRole('button', { name: 'Apply reviewed item' }),
    ).not.toBeInTheDocument();
  });
});
