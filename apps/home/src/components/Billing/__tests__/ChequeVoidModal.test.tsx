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
  getChequeVoidWorkflow,
  previewChequeVoidWorkflow,
  saveChequeVoidWorkflow,
  getChequeVoidRequestStatus,
  getPaymentWorkflow,
} from '../billingService';
import { ChequeVoidModal, chequeVoidStorageKey } from '../ChequeVoidModal';
import { PaymentWorkflowModal } from '../PaymentWorkflowModal';
import { voidFixture, voidRequest, voidedFixture } from './chequeVoidFixture';
import { paymentWorkflowFixture } from './paymentWorkflowFixture';

jest.mock('../billingService', () => ({
  ...jest.requireActual('../billingService'),
  getChequeVoidWorkflow: jest.fn(),
  previewChequeVoidWorkflow: jest.fn(),
  saveChequeVoidWorkflow: jest.fn(),
  getChequeVoidRequestStatus: jest.fn(),
  getPaymentWorkflow: jest.fn(),
}));
const close = jest.fn(),
  completed = jest.fn(),
  reconnect = jest.fn();
const key = chequeVoidStorageKey(3, 7);
const show = (parent = false) =>
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      {parent ? (
        <PaymentWorkflowModal
          uid={3}
          invoiceId={7}
          close={close}
          completed={completed}
          reconnect={reconnect}
        />
      ) : (
        <ChequeVoidModal
          uid={3}
          invoiceId={7}
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
  fireEvent.click(await ready('Review native cheque void'));
  return ready('Void reviewed cheque');
};
describe('Native cheque void review and recovery', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    sessionStorage.clear();
    Object.defineProperty(global.crypto, 'randomUUID', {
      configurable: true,
      value: () => voidRequest().request_key,
    });
    (getChequeVoidWorkflow as jest.Mock).mockResolvedValue(voidFixture());
    (previewChequeVoidWorkflow as jest.Mock).mockResolvedValue(
      voidFixture({ review_version: 'b'.repeat(64) }),
    );
    (saveChequeVoidWorkflow as jest.Mock).mockResolvedValue({
      accepted: true,
      payment: voidedFixture(),
    });
    (getChequeVoidRequestStatus as jest.Mock).mockResolvedValue({
      accepted: true,
      payment: voidedFixture(),
    });
    (getPaymentWorkflow as jest.Mock).mockResolvedValue(
      paymentWorkflowFixture({ payments: [] }),
    );
  });
  afterEach(() => jest.restoreAllMocks());
  it('shows affected documents and bank warning, requires explicit review and persists before write', async () => {
    show();
    const button = await review();
    expect(
      screen.getByRole('table', { name: 'Documents in cheque void review' }),
    ).toHaveTextContent('QorliaQA Credit');
    expect(
      screen.getByRole('cell', { name: 'Customer credit note' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/does not stop payment at the bank/),
    ).toBeInTheDocument();
    expect(saveChequeVoidWorkflow).not.toHaveBeenCalled();
    fireEvent.click(button);
    await ready('Finish void and reload invoice');
    expect(saveChequeVoidWorkflow).toHaveBeenCalledWith(voidRequest());
    expect(JSON.parse(sessionStorage.getItem(key)!)).toEqual(voidRequest());
    fireEvent.click(await ready('Finish void and reload invoice'));
    await waitFor(() => expect(completed).toHaveBeenCalledTimes(1));
    expect(sessionStorage.getItem(key)).toBeNull();
  });
  it('recovers after page remount even when cancelled payment disappeared from invoice history', async () => {
    sessionStorage.setItem(key, JSON.stringify(voidRequest()));
    (getChequeVoidWorkflow as jest.Mock).mockResolvedValue(voidedFixture());
    show(true);
    fireEvent.click(await ready('Recover pending cheque void request'));
    fireEvent.click(await ready('Check cheque void request'));
    await ready('Finish void and reload invoice');
    expect(saveChequeVoidWorkflow).not.toHaveBeenCalled();
    expect(getChequeVoidRequestStatus).toHaveBeenCalledWith(voidRequest());
    expect(screen.getByText(/State: Cancelled/)).toBeInTheDocument();
  });
  it('preserves lost responses and retries only the identical request', async () => {
    (saveChequeVoidWorkflow as jest.Mock).mockRejectedValueOnce(
      new Error('Response lost'),
    );
    const mounted = show();
    fireEvent.click(await review());
    await screen.findByText('Response lost');
    mounted.unmount();
    show();
    fireEvent.click(await ready('Retry identical cheque void request'));
    await ready('Finish void and reload invoice');
    expect(saveChequeVoidWorkflow).toHaveBeenCalledTimes(2);
    expect((saveChequeVoidWorkflow as jest.Mock).mock.calls[0]).toEqual(
      (saveChequeVoidWorkflow as jest.Mock).mock.calls[1],
    );
  });
  it('prevents double voiding and closing while native cancellation is in flight', async () => {
    let resolve!: (value: unknown) => void;
    (saveChequeVoidWorkflow as jest.Mock).mockReturnValue(
      new Promise((done) => {
        resolve = done;
      }),
    );
    show();
    const button = await review();
    fireEvent.click(button);
    fireEvent.click(button);
    fireEvent.click(screen.getByRole('button', { name: 'Back to payments' }));
    expect(saveChequeVoidWorkflow).toHaveBeenCalledTimes(1);
    expect(close).not.toHaveBeenCalled();
    await act(async () =>
      resolve({ accepted: true, payment: voidedFixture() }),
    );
  });
  it('clears definite rejection but does not silently repeat cancellation', async () => {
    (saveChequeVoidWorkflow as jest.Mock).mockRejectedValue(
      new BillingActionRejected('Allocations changed'),
    );
    show();
    fireEvent.click(await review());
    await screen.findByText('Allocations changed');
    expect(sessionStorage.getItem(key)).toBeNull();
    expect(
      screen.queryByRole('button', { name: /Void reviewed cheque/ }),
    ).not.toBeInTheDocument();
  });
  it('fails closed for corrupt recovery storage and exposes reconnect for expired sessions', async () => {
    sessionStorage.setItem(
      key,
      JSON.stringify({ ...voidRequest(), payment_id: 8 }),
    );
    const mounted = show();
    expect(await ready('Back to payments')).toBeEnabled();
    expect(
      screen.getByRole('button', { name: 'Review native cheque void' }),
    ).toBeDisabled();
    mounted.unmount();
    sessionStorage.clear();
    (getChequeVoidWorkflow as jest.Mock).mockRejectedValue(
      new BillingSessionExpired('Expired'),
    );
    show();
    fireEvent.click(await ready('Reconnect Billing'));
    expect(reconnect).toHaveBeenCalledTimes(1);
  });
});
