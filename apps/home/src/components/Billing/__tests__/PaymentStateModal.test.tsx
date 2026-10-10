import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import {
  BillingActionRejected,
  getCustomerPaymentHistory,
  getPaymentStateWorkflow,
  getPaymentStateRequestStatus,
  previewPaymentStateWorkflow,
  savePaymentStateWorkflow,
} from '../billingService';
import { CustomerPaymentsPanel } from '../CustomerPaymentsPanel';
import {
  PaymentStateModal,
  paymentStateStorageKey,
} from '../PaymentStateModal';
import {
  paymentStateFixture,
  paymentStateRequest,
  postedPaymentState,
} from './paymentStateFixture';

jest.mock('../billingService', () => ({
  ...jest.requireActual('../billingService'),
  getCustomerPaymentHistory: jest.fn(),
  getPaymentStateWorkflow: jest.fn(),
  getPaymentStateRequestStatus: jest.fn(),
  previewPaymentStateWorkflow: jest.fn(),
  savePaymentStateWorkflow: jest.fn(),
}));
const close = jest.fn(),
  completed = jest.fn(),
  reconnect = jest.fn();
const key = paymentStateStorageKey(3);
const show = (panel = false) =>
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      {panel ? (
        <CustomerPaymentsPanel uid={3} reconnect={reconnect} />
      ) : (
        <PaymentStateModal
          uid={3}
          paymentId={9}
          close={close}
          completed={completed}
          reconnect={reconnect}
        />
      )}
    </QueryClientProvider>,
  );
const ready = async (name: string) => {
  const button = await screen.findByRole('button', { name: new RegExp(name) });
  await waitFor(() => expect(button).toBeEnabled());
  return button;
};
const review = async () => {
  fireEvent.click(await ready('Review: Confirm payment'));
  return ready('Save reviewed payment action');
};
describe('Customer payment review, history and recovery', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    sessionStorage.clear();
    Object.defineProperty(global.crypto, 'randomUUID', {
      configurable: true,
      value: () => paymentStateRequest().request_key,
    });
    (getPaymentStateWorkflow as jest.Mock).mockResolvedValue(
      paymentStateFixture(),
    );
    (previewPaymentStateWorkflow as jest.Mock).mockResolvedValue(
      paymentStateFixture({ action: 'post', review_version: 'b'.repeat(64) }),
    );
    (savePaymentStateWorkflow as jest.Mock).mockResolvedValue({
      accepted: true,
      action: 'post',
      payment: postedPaymentState(),
    });
    (getPaymentStateRequestStatus as jest.Mock).mockResolvedValue({
      accepted: true,
      action: 'post',
      payment: postedPaymentState(),
    });
    (getCustomerPaymentHistory as jest.Mock).mockResolvedValue({
      rows: [{ ...paymentStateFixture(), direction: 'inbound', reference: '' }],
      offset: 0,
      has_more: false,
    });
  });
  afterEach(() => jest.restoreAllMocks());
  it('shows allocations and native posting warning, persists request before explicit save', async () => {
    (savePaymentStateWorkflow as jest.Mock).mockImplementation(
      async (request) => {
        expect(JSON.parse(sessionStorage.getItem(key)!)).toEqual(request);
        return {
          accepted: true,
          action: 'post',
          payment: postedPaymentState(),
        };
      },
    );
    show();
    const button = await review();
    expect(
      screen.getByRole('table', { name: 'Documents in payment review' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/assign document and cheque numbers/),
    ).toBeInTheDocument();
    expect(savePaymentStateWorkflow).not.toHaveBeenCalled();
    fireEvent.click(button);
    await ready('Finish and reload payment history');
    expect(savePaymentStateWorkflow).toHaveBeenCalledTimes(1);
    expect(savePaymentStateWorkflow).toHaveBeenCalledWith(
      paymentStateRequest(),
    );
    fireEvent.click(await ready('Finish and reload payment history'));
    await waitFor(() => expect(completed).toHaveBeenCalledTimes(1));
    expect(sessionStorage.getItem(key)).toBeNull();
  });
  it('recovers after reload without repeating write and shows current state', async () => {
    sessionStorage.setItem(key, JSON.stringify(paymentStateRequest()));
    show();
    fireEvent.click(await ready('Check payment request'));
    await ready('Finish and reload payment history');
    expect(getPaymentStateRequestStatus).toHaveBeenCalledWith(
      paymentStateRequest(),
    );
    expect(savePaymentStateWorkflow).not.toHaveBeenCalled();
    expect(screen.getByText(/State: Posted/)).toBeInTheDocument();
  });
  it('keeps unknown outcomes and retries only identical request when explicitly asked', async () => {
    (savePaymentStateWorkflow as jest.Mock).mockRejectedValueOnce(
      new Error('Network timeout'),
    );
    show();
    fireEvent.click(await review());
    await screen.findByText('Network timeout');
    expect(JSON.parse(sessionStorage.getItem(key)!)).toEqual(
      paymentStateRequest(),
    );
    expect(savePaymentStateWorkflow).toHaveBeenCalledTimes(1);
    fireEvent.click(await ready('Retry identical payment request'));
    await ready('Finish and reload payment history');
    expect((savePaymentStateWorkflow as jest.Mock).mock.calls[1][0]).toEqual(
      paymentStateRequest(),
    );
  });
  it('clears a definitive rejection but does not automatically save again', async () => {
    (savePaymentStateWorkflow as jest.Mock).mockRejectedValue(
      new BillingActionRejected('Native posting denied'),
    );
    show();
    fireEvent.click(await review());
    await screen.findByText('Native posting denied');
    expect(sessionStorage.getItem(key)).toBeNull();
    expect(savePaymentStateWorkflow).toHaveBeenCalledTimes(1);
  });
  it('blocks malformed recovery and unavailable storage', async () => {
    sessionStorage.setItem(key, '{bad');
    show();
    await screen.findByText(/recovery storage is unavailable or invalid/);
    expect(
      await screen.findByRole('button', { name: 'Review: Confirm payment' }),
    ).toBeDisabled();
    expect(savePaymentStateWorkflow).not.toHaveBeenCalled();
  });
  it('offers reset for posted payments but not direct cancellation', async () => {
    (getPaymentStateWorkflow as jest.Mock).mockResolvedValue(
      postedPaymentState(),
    );
    show();
    expect(await ready('Review: Reset to Draft')).toBeEnabled();
    expect(
      screen.getByRole('button', { name: 'Review: Cancel draft payment' }),
    ).toBeDisabled();
  });
  it('keeps cancelled payments discoverable and recovers independently of invoice links', async () => {
    (getCustomerPaymentHistory as jest.Mock).mockResolvedValue({
      rows: [
        {
          ...postedPaymentState(),
          state: 'cancel',
          direction: 'inbound',
          reference: '',
        },
      ],
      offset: 0,
      has_more: false,
    });
    sessionStorage.setItem(key, JSON.stringify(paymentStateRequest()));
    show(true);
    await screen.findByText('Cancelled');
    fireEvent.click(await ready('Recover pending payment request'));
    await ready('Check payment request');
    expect(getPaymentStateWorkflow).toHaveBeenCalledWith(9);
    expect(savePaymentStateWorkflow).not.toHaveBeenCalled();
  });
  it('submits search and pages native history without automatic payment mutations', async () => {
    (getCustomerPaymentHistory as jest.Mock).mockResolvedValue({
      rows: [],
      offset: 0,
      has_more: true,
    });
    show(true);
    fireEvent.change(screen.getByLabelText('Payment, customer or reference'), {
      target: { value: 'QorliaQA' },
    });
    fireEvent.click(await ready('Search payments'));
    await waitFor(() =>
      expect(getCustomerPaymentHistory).toHaveBeenCalledWith(
        'QorliaQA',
        0,
        'all',
      ),
    );
    fireEvent.click(await ready('Next payment page'));
    await waitFor(() =>
      expect(getCustomerPaymentHistory).toHaveBeenCalledWith(
        'QorliaQA',
        25,
        'all',
      ),
    );
    expect(savePaymentStateWorkflow).not.toHaveBeenCalled();
  });
});
