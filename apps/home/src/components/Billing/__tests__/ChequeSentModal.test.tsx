import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import {
  BillingActionRejected,
  BillingSessionExpired,
  getChequeSentWorkflow,
  previewChequeSentWorkflow,
  saveChequeSentWorkflow,
  getChequeSentRequestStatus,
} from '../billingService';
import { ChequeSentModal } from '../ChequeSentModal';
import { sentFixture, sentRequest } from './chequeSentFixture';

jest.mock('../billingService', () => ({
  ...jest.requireActual('../billingService'),
  getChequeSentWorkflow: jest.fn(),
  previewChequeSentWorkflow: jest.fn(),
  saveChequeSentWorkflow: jest.fn(),
  getChequeSentRequestStatus: jest.fn(),
}));
const close = jest.fn(),
  reconnect = jest.fn();
const key = 'qorlia.billing.cheque.sent.pending:3:9';
const show = () =>
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <ChequeSentModal
        uid={3}
        paymentId={9}
        close={close}
        reconnect={reconnect}
      />
    </QueryClientProvider>,
  );
const review = async () => {
  fireEvent.click(
    await screen.findByRole('button', { name: 'Review mark sent' }),
  );
  await screen.findByRole('button', { name: 'Save reviewed sent status' });
};
const readyButton = async (name: string) => {
  const button = await screen.findByRole('button', { name });
  await waitFor(() => expect(button).toBeEnabled());
  return button;
};
describe('Cheque sent-status review and recovery', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    sessionStorage.clear();
    Object.defineProperty(global.crypto, 'randomUUID', {
      configurable: true,
      value: () => sentRequest().request_key,
    });
    (getChequeSentWorkflow as jest.Mock).mockResolvedValue(sentFixture());
    (previewChequeSentWorkflow as jest.Mock).mockResolvedValue(
      sentFixture({ action: 'mark_sent', review_version: 'b'.repeat(64) }),
    );
    (saveChequeSentWorkflow as jest.Mock).mockResolvedValue({
      accepted: true,
      action: 'mark_sent',
      payment: sentFixture({ sent: true }),
    });
    (getChequeSentRequestStatus as jest.Mock).mockResolvedValue({
      accepted: false,
      action: 'mark_sent',
      payment: sentFixture(),
    });
  });
  afterEach(() => jest.restoreAllMocks());
  it('requires explicit review and persists the exact request before saving', async () => {
    show();
    await review();
    expect(saveChequeSentWorkflow).not.toHaveBeenCalled();
    fireEvent.click(
      screen.getByRole('button', { name: 'Save reviewed sent status' }),
    );
    await screen.findByRole('button', {
      name: 'Finish request and reload status',
    });
    expect(saveChequeSentWorkflow).toHaveBeenCalledWith(sentRequest());
    expect(JSON.parse(sessionStorage.getItem(key)!)).toEqual(sentRequest());
    expect(screen.getByText(/Bank matching: Pending/)).toHaveTextContent(
      'Marked sent: Yes',
    );
    expect(
      screen.queryByRole('button', { name: 'Review unmark sent' }),
    ).not.toBeInTheDocument();
    (getChequeSentWorkflow as jest.Mock).mockResolvedValue(
      sentFixture({ sent: true }),
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Finish request and reload status' }),
    );
    await screen.findByRole('button', { name: 'Review unmark sent' });
    expect(sessionStorage.getItem(key)).toBeNull();
  });
  it('preserves uncertain requests over remount and checks without repeating the write', async () => {
    (saveChequeSentWorkflow as jest.Mock).mockRejectedValue(
      new Error('Response lost'),
    );
    const mounted = show();
    await review();
    fireEvent.click(
      screen.getByRole('button', { name: 'Save reviewed sent status' }),
    );
    await screen.findByText('Response lost');
    mounted.unmount();
    show();
    fireEvent.click(await readyButton('Check sent-status request'));
    await screen.findByText(/No receipt was found yet/);
    expect(saveChequeSentWorkflow).toHaveBeenCalledTimes(1);
    (getChequeSentRequestStatus as jest.Mock).mockResolvedValue({
      accepted: true,
      action: 'mark_sent',
      payment: sentFixture(),
    });
    fireEvent.click(
      screen.getByRole('button', { name: 'Check sent-status request' }),
    );
    await screen.findByRole('button', {
      name: 'Finish request and reload status',
    });
    expect(screen.getByText(/Bank matching: Pending/)).toHaveTextContent(
      'Marked sent: No',
    );
    expect(saveChequeSentWorkflow).toHaveBeenCalledTimes(1);
  });
  it('retries only an identical uncertain request', async () => {
    sessionStorage.setItem(key, JSON.stringify(sentRequest()));
    show();
    fireEvent.click(await readyButton('Retry identical sent-status request'));
    await screen.findByRole('button', {
      name: 'Finish request and reload status',
    });
    expect(saveChequeSentWorkflow).toHaveBeenCalledWith(sentRequest());
    expect(previewChequeSentWorkflow).not.toHaveBeenCalled();
  });
  it('blocks writes and close while an action is in flight', async () => {
    let finish!: (value: unknown) => void;
    (saveChequeSentWorkflow as jest.Mock).mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    show();
    await review();
    const button = screen.getByRole('button', {
      name: 'Save reviewed sent status',
    });
    fireEvent.click(button);
    fireEvent.click(button);
    fireEvent.click(screen.getByRole('button', { name: 'Back to payments' }));
    expect(close).not.toHaveBeenCalled();
    expect(saveChequeSentWorkflow).toHaveBeenCalledTimes(1);
    await act(async () =>
      finish({
        accepted: true,
        action: 'mark_sent',
        payment: sentFixture({ sent: true }),
      }),
    );
  });
  it('clears a definitely rejected request and requires a fresh review', async () => {
    (saveChequeSentWorkflow as jest.Mock).mockRejectedValue(
      new BillingActionRejected('Review changed'),
    );
    show();
    await review();
    fireEvent.click(
      screen.getByRole('button', { name: 'Save reviewed sent status' }),
    );
    await screen.findByText('Review changed');
    expect(sessionStorage.getItem(key)).toBeNull();
    expect(
      screen.queryByRole('button', { name: 'Save reviewed sent status' }),
    ).not.toBeInTheDocument();
  });
  it('fails closed on invalid recovery storage and readonly permissions', async () => {
    sessionStorage.setItem(
      key,
      JSON.stringify({ ...sentRequest(), payment_id: 8 }),
    );
    const mounted = show();
    await screen.findByText(/recovery storage is unavailable or invalid/);
    expect(
      await screen.findByRole('button', { name: 'Review mark sent' }),
    ).toBeDisabled();
    mounted.unmount();
    sessionStorage.clear();
    (getChequeSentWorkflow as jest.Mock).mockResolvedValue(
      sentFixture({ can_update: false, reason: 'Read only' }),
    );
    show();
    await screen.findByText('Read only');
    expect(
      screen.queryByRole('button', { name: 'Review mark sent' }),
    ).not.toBeInTheDocument();
    expect(saveChequeSentWorkflow).not.toHaveBeenCalled();
  });
  it('offers reconnect after session expiry without retrying', async () => {
    (saveChequeSentWorkflow as jest.Mock).mockRejectedValue(
      new BillingSessionExpired('Session expired'),
    );
    show();
    await review();
    fireEvent.click(
      screen.getByRole('button', { name: 'Save reviewed sent status' }),
    );
    fireEvent.click(
      await screen.findByRole('button', { name: 'Reconnect Billing' }),
    );
    await waitFor(() => expect(reconnect).toHaveBeenCalledTimes(1));
    expect(saveChequeSentWorkflow).toHaveBeenCalledTimes(1);
    expect(sessionStorage.getItem(key)).not.toBeNull();
  });
});
