import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import {
  BillingActionRejected,
  BillingSessionExpired,
  changeCustomerPaymentDraft,
  getCustomerPaymentDraft,
  getCustomerPaymentDraftChoices,
  getCustomerPaymentDraftRequestStatus,
  getCustomerPaymentHistory,
  previewCustomerPaymentDraft,
  saveCustomerPaymentDraft,
} from '../billingService';
import {
  CustomerPaymentDraftEditor,
  paymentDraftStorageKey,
} from '../CustomerPaymentDraftEditor';
import { CustomerPaymentsPanel } from '../CustomerPaymentsPanel';
import {
  customerPaymentDraftFixture,
  customerPaymentDraftRequest,
} from './customerPaymentDraftFixture';
import { paymentStateFixture } from './paymentStateFixture';

jest.mock('../billingService', () => ({
  ...jest.requireActual('../billingService'),
  changeCustomerPaymentDraft: jest.fn(),
  getCustomerPaymentDraft: jest.fn(),
  getCustomerPaymentDraftChoices: jest.fn(),
  getCustomerPaymentDraftRequestStatus: jest.fn(),
  previewCustomerPaymentDraft: jest.fn(),
  saveCustomerPaymentDraft: jest.fn(),
  getCustomerPaymentHistory: jest.fn(),
}));
const close = jest.fn(),
  completed = jest.fn(),
  reconnect = jest.fn();
const key = paymentDraftStorageKey(3);
const show = (paymentId: number | false = false, panel = false) =>
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      {panel ? (
        <CustomerPaymentsPanel uid={3} reconnect={reconnect} />
      ) : (
        <CustomerPaymentDraftEditor
          uid={3}
          paymentId={paymentId}
          close={close}
          completed={completed}
          reconnect={reconnect}
        />
      )}
    </QueryClientProvider>,
  );
const review = async () => {
  const button = await screen.findByRole('button', {
    name: 'Review draft save',
  });
  await waitFor(() => expect(button).toBeEnabled());
  fireEvent.click(button);
  const save = await screen.findByRole('button', {
    name: 'Save reviewed payment draft',
  });
  await waitFor(() => expect(save).toBeEnabled());
  return save;
};
describe('Customer payment draft editor and exact save recovery', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    sessionStorage.clear();
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      value: jest.fn(),
    });
    Object.defineProperty(global.crypto, 'randomUUID', {
      configurable: true,
      value: () => customerPaymentDraftRequest().request_key,
    });
    (getCustomerPaymentDraft as jest.Mock).mockResolvedValue(
      customerPaymentDraftFixture(),
    );
    (getCustomerPaymentDraftChoices as jest.Mock).mockImplementation(
      (_values, kind) =>
        Promise.resolve(
          kind === 'journal' ? [[12, 'Another native bank']] : [],
        ),
    );
    (previewCustomerPaymentDraft as jest.Mock).mockImplementation((payload) =>
      Promise.resolve(customerPaymentDraftFixture({ ...payload })),
    );
    (changeCustomerPaymentDraft as jest.Mock).mockImplementation((payload) =>
      Promise.resolve(
        customerPaymentDraftFixture({
          ...payload,
          values: { ...payload.values, payment_method_line_id: 13 },
          labels: {
            ...customerPaymentDraftFixture().labels,
            journal_id: 'Another native bank',
            payment_method_line_id: 'Native method',
          },
        }),
      ),
    );
    (saveCustomerPaymentDraft as jest.Mock).mockResolvedValue({
      accepted: true,
      payment: paymentStateFixture(),
    });
    (getCustomerPaymentDraftRequestStatus as jest.Mock).mockResolvedValue({
      accepted: true,
      payment: paymentStateFixture(),
    });
    (getCustomerPaymentHistory as jest.Mock).mockResolvedValue({
      rows: [{ ...paymentStateFixture(), direction: 'inbound', reference: '' }],
      offset: 0,
      has_more: false,
    });
  });
  afterEach(() => jest.restoreAllMocks());
  it('shows original document currency separately from converted allocation amounts', async () => {
    const fixture = customerPaymentDraftFixture();
    (previewCustomerPaymentDraft as jest.Mock).mockResolvedValue({
      ...fixture,
      allocations: {
        outstanding: [
          {
            ...fixture.allocations.outstanding[0],
            open_amount: 500,
            document_currency: [2, 'USD'],
            invoice_amount: 1000,
            allocated_amount: 100,
            remaining_amount: 900,
          },
        ],
        credits: [],
      },
    });
    show();
    await review();
    expect(
      screen.getAllByRole('columnheader', { name: 'Allocated amount (INR)' }),
    ).toHaveLength(2);
    expect(
      screen.getAllByRole('columnheader', { name: 'Remaining amount (INR)' }),
    ).toHaveLength(2);
    expect(screen.getByText('$500.00')).toBeInTheDocument();
    expect(screen.getByText('₹900.00')).toBeInTheDocument();
    expect(saveCustomerPaymentDraft).not.toHaveBeenCalled();
  });
  it('requires native review, displays allocation and ledger, persists before explicit save', async () => {
    (saveCustomerPaymentDraft as jest.Mock).mockImplementation((request) => {
      expect(JSON.parse(sessionStorage.getItem(key)!)).toEqual(request);
      return Promise.resolve({
        accepted: true,
        payment: paymentStateFixture(),
      });
    });
    show();
    await screen.findByRole('button', { name: 'Review draft save' });
    expect(
      screen.queryByRole('button', { name: 'Save reviewed payment draft' }),
    ).not.toBeInTheDocument();
    fireEvent.click(await review());
    await screen.findByRole('heading', { name: /Current saved payment/ });
    expect(saveCustomerPaymentDraft).toHaveBeenCalledTimes(1);
    expect(saveCustomerPaymentDraft).toHaveBeenCalledWith(
      customerPaymentDraftRequest(),
    );
    expect(sessionStorage.getItem(key)).not.toBeNull();
    fireEvent.click(
      screen.getByRole('button', { name: 'Finish draft save review' }),
    );
    await waitFor(() =>
      expect(completed).toHaveBeenCalledWith(paymentStateFixture()),
    );
    expect(sessionStorage.getItem(key)).toBeNull();
  });
  it('uses native journal onchange defaults and invalidates the previous save review', async () => {
    show();
    await review();
    const input = screen.getByRole('combobox', { name: 'Journal' });
    fireEvent.change(input, { target: { value: 'Another' } });
    fireEvent.click(await screen.findByText('Another native bank'));
    await waitFor(() => expect(changeCustomerPaymentDraft).toHaveBeenCalled());
    expect(
      (changeCustomerPaymentDraft as jest.Mock).mock.calls[0][0].values
        .journal_id,
    ).toBe(12);
    expect((changeCustomerPaymentDraft as jest.Mock).mock.calls[0][1]).toBe(
      'journal_id',
    );
    await waitFor(() =>
      expect(
        screen.getByRole('combobox', { name: 'Payment method' }),
      ).toHaveValue('Native method'),
    );
    expect(
      screen.queryByRole('button', { name: 'Save reviewed payment draft' }),
    ).not.toBeInTheDocument();
    expect(saveCustomerPaymentDraft).not.toHaveBeenCalled();
  });
  it('retains uncertain saves across unmount, checks missing receipt and retries only the identical request', async () => {
    (saveCustomerPaymentDraft as jest.Mock).mockRejectedValueOnce(
      new Error('Response lost'),
    );
    const view = show();
    fireEvent.click(await review());
    await screen.findByText('Response lost');
    const original = JSON.parse(sessionStorage.getItem(key)!);
    view.unmount();
    (getCustomerPaymentDraft as jest.Mock).mockClear();
    (getCustomerPaymentDraftRequestStatus as jest.Mock).mockResolvedValue({
      accepted: false,
      payment: false,
    });
    show();
    fireEvent.click(
      await screen.findByRole('button', { name: 'Check exact draft save' }),
    );
    await screen.findByText(/No receipt found yet/);
    expect(sessionStorage.getItem(key)).not.toBeNull();
    expect(getCustomerPaymentDraft).not.toHaveBeenCalled();
    expect(screen.queryByLabelText('Amount')).not.toBeInTheDocument();
    fireEvent.click(
      screen.getByRole('button', { name: 'Retry identical draft save' }),
    );
    await screen.findByRole('heading', { name: /Current saved payment/ });
    expect((saveCustomerPaymentDraft as jest.Mock).mock.calls).toEqual([
      [original],
      [original],
    ]);
  });
  it('recovers a saved draft receipt after the payment was posted or cancelled without loading an editable draft', async () => {
    const request = customerPaymentDraftRequest();
    request.payload.id = 9;
    request.payload.version = 'a'.repeat(64);
    sessionStorage.setItem(key, JSON.stringify(request));
    const payment = paymentStateFixture({ state: 'cancel', amount: 150 });
    (getCustomerPaymentDraftRequestStatus as jest.Mock).mockResolvedValue({
      accepted: true,
      payment,
    });
    show(9);
    fireEvent.click(
      await screen.findByRole('button', { name: 'Check exact draft save' }),
    );
    await screen.findByText(/State: Cancelled/);
    expect(getCustomerPaymentDraft).not.toHaveBeenCalled();
    expect(saveCustomerPaymentDraft).not.toHaveBeenCalled();
    fireEvent.click(
      screen.getByRole('button', { name: 'Finish draft save review' }),
    );
    await waitFor(() => expect(completed).toHaveBeenCalledWith(payment));
  });
  it('keeps the exact save on Billing expiry and reconnects without discarding recovery', async () => {
    (saveCustomerPaymentDraft as jest.Mock).mockRejectedValue(
      new BillingSessionExpired('Sign in again'),
    );
    show();
    fireEvent.click(await review());
    await screen.findByText('Sign in again');
    fireEvent.click(screen.getByRole('button', { name: 'Reconnect Billing' }));
    expect(reconnect).toHaveBeenCalledTimes(1);
    expect(sessionStorage.getItem(key)).not.toBeNull();
  });
  it('clears an explicitly rejected save but never silently retries it', async () => {
    (saveCustomerPaymentDraft as jest.Mock).mockRejectedValue(
      new BillingActionRejected('Configuration changed. Review again.'),
    );
    show();
    fireEvent.click(await review());
    await screen.findByText('Configuration changed. Review again.');
    expect(sessionStorage.getItem(key)).toBeNull();
    expect(saveCustomerPaymentDraft).toHaveBeenCalledTimes(1);
    expect(
      screen.queryByRole('button', { name: 'Save reviewed payment draft' }),
    ).not.toBeInTheDocument();
  });
  it('does not issue a financial save when request persistence fails', async () => {
    show();
    const save = await review();
    jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('Storage blocked');
    });
    fireEvent.click(save);
    await screen.findByText('Storage blocked');
    expect(saveCustomerPaymentDraft).not.toHaveBeenCalled();
  });
  it('retains the exact receipt when finishing cannot clear recovery storage', async () => {
    show();
    fireEvent.click(await review());
    await screen.findByRole('heading', { name: /Current saved payment/ });
    const stored = sessionStorage.getItem(key);
    jest.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new Error('Recovery cleanup blocked');
    });
    fireEvent.click(
      screen.getByRole('button', { name: 'Finish draft save review' }),
    );
    await screen.findByText('Recovery cleanup blocked');
    expect(sessionStorage.getItem(key)).toBe(stored);
    expect(completed).not.toHaveBeenCalled();
    expect(saveCustomerPaymentDraft).toHaveBeenCalledTimes(1);
  });
  it('retains recovery when rejected-save cleanup fails and does not enable another draft', async () => {
    (saveCustomerPaymentDraft as jest.Mock).mockRejectedValue(
      new BillingActionRejected('Review is stale'),
    );
    jest.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new Error('Recovery cleanup blocked');
    });
    show();
    fireEvent.click(await review());
    await screen.findByText('Recovery cleanup blocked');
    expect(sessionStorage.getItem(key)).not.toBeNull();
    expect(screen.queryByLabelText('Amount')).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Check exact draft save' }),
    ).toBeEnabled();
    expect(saveCustomerPaymentDraft).toHaveBeenCalledTimes(1);
  });
  it('respects native company and previously posted journal locks on saved drafts', async () => {
    (getCustomerPaymentDraft as jest.Mock).mockResolvedValue(
      customerPaymentDraftFixture({
        id: 9,
        version: 'a'.repeat(64),
        journal_readonly: true,
      }),
    );
    show(9);
    await screen.findByRole('button', { name: 'Review draft save' });
    expect(screen.getByRole('combobox', { name: 'Company' })).toBeDisabled();
    expect(screen.getByRole('combobox', { name: 'Journal' })).toBeDisabled();
    expect(saveCustomerPaymentDraft).not.toHaveBeenCalled();
  });
  it('fails closed on malformed recovery and blocks new history actions', async () => {
    sessionStorage.setItem(key, '{bad');
    const view = show();
    await screen.findByText(/recovery storage is unavailable or invalid/);
    expect(getCustomerPaymentDraft).not.toHaveBeenCalled();
    expect(saveCustomerPaymentDraft).not.toHaveBeenCalled();
    view.unmount();
    show(false, true);
    await screen.findByText(/recovery storage is unavailable or invalid/);
    expect(
      screen.getByRole('button', { name: 'New customer payment' }),
    ).toBeDisabled();
  });
  it('guards unsaved close and unload and respects native readonly accounting date', async () => {
    show();
    await screen.findByRole('button', { name: 'Review draft save' });
    expect(screen.getByLabelText('Accounting date')).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Reference'), {
      target: { value: 'QorliaQA Unsaved' },
    });
    const event = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    fireEvent.click(
      screen.getByRole('button', { name: 'Back to customer payments' }),
    );
    expect(close).not.toHaveBeenCalled();
    await screen.findByText('Discard unsaved payment changes?');
    fireEvent.click(screen.getByRole('button', { name: 'Keep editing' }));
    expect(screen.getByLabelText('Reference')).toHaveValue('QorliaQA Unsaved');
  });
  it('prevents double save while a financial request is in flight', async () => {
    let resolve!: (result: unknown) => void;
    (saveCustomerPaymentDraft as jest.Mock).mockImplementation(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    show();
    const save = await review();
    fireEvent.click(save);
    fireEvent.click(save);
    await waitFor(() =>
      expect(saveCustomerPaymentDraft).toHaveBeenCalledTimes(1),
    );
    expect(
      screen.getByRole('button', { name: 'Back to customer payments' }),
    ).toBeDisabled();
    resolve({ accepted: true, payment: paymentStateFixture() });
    await screen.findByRole('heading', { name: /Current saved payment/ });
  });
  it('recovers a new payment not yet visible in history and blocks another payment action', async () => {
    sessionStorage.setItem(key, JSON.stringify(customerPaymentDraftRequest()));
    show(false, true);
    expect(
      await screen.findByRole('button', { name: 'New customer payment' }),
    ).toBeDisabled();
    expect(
      await screen.findByRole('button', { name: /Review payment/ }),
    ).toBeDisabled();
    fireEvent.click(
      screen.getByRole('button', {
        name: 'Recover pending payment draft save',
      }),
    );
    await screen.findByRole('button', { name: 'Check exact draft save' });
    expect(getCustomerPaymentDraft).not.toHaveBeenCalled();
  });
});
