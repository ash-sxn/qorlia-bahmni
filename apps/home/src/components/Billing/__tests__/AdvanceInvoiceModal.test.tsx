import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { AdvanceInvoiceModal } from '../AdvanceInvoiceModal';
import {
  BillingActionRejected,
  BillingSessionExpired,
  getAdvanceInvoice,
  getAdvanceInvoiceStatus,
  previewAdvanceInvoice,
  saveAdvanceInvoice,
} from '../billingService';
import {
  advanceFixture,
  advanceRequestFixture,
  advanceReviewFixture,
  savedAdvanceFixture,
} from './advanceInvoiceFixture';

jest.mock('../billingService', () => ({
  ...jest.requireActual('../billingService'),
  getAdvanceInvoice: jest.fn(),
  getAdvanceInvoiceStatus: jest.fn(),
  previewAdvanceInvoice: jest.fn(),
  saveAdvanceInvoice: jest.fn(),
}));
jest.mock('../DraftChoiceInput', () => ({
  DraftChoiceInput: ({
    label,
    onChange,
    disabled,
  }: {
    label: string;
    onChange: (id: number, name: string) => void;
    disabled: boolean;
  }) => (
    <button disabled={disabled} onClick={() => onChange(11, 'QA Sales')}>
      {label}
    </button>
  ),
}));
const close = jest.fn(),
  completed = jest.fn(),
  reconnect = jest.fn();
const storageKey = 'qorlia.billing.advance.pending:3:18';
const show = () =>
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <AdvanceInvoiceModal
        uid={3}
        orderId={18}
        close={close}
        completed={completed}
        reconnect={reconnect}
      />
    </QueryClientProvider>,
  );
const review = async () => {
  fireEvent.change(await screen.findByLabelText('Advance percentage'), {
    target: { value: '50' },
  });
  fireEvent.click(
    screen.getByRole('button', { name: 'Review advance calculation' }),
  );
  return await screen.findByRole('button', {
    name: 'Create draft advance invoice',
  });
};
describe('Advance invoice editor', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    sessionStorage.clear();
    Object.defineProperty(crypto, 'randomUUID', {
      configurable: true,
      value: jest.fn(() => advanceRequestFixture().request_key),
    });
    (getAdvanceInvoice as jest.Mock).mockResolvedValue(advanceFixture());
    (previewAdvanceInvoice as jest.Mock).mockImplementation(
      async (_id, values) => advanceReviewFixture({ values }),
    );
    (saveAdvanceInvoice as jest.Mock).mockResolvedValue(savedAdvanceFixture());
    (getAdvanceInvoiceStatus as jest.Mock).mockResolvedValue(false);
  });
  it('requires review, invalidates it on edit, and sends a single save without payment/posting', async () => {
    let resolve!: (result: ReturnType<typeof savedAdvanceFixture>) => void;
    (saveAdvanceInvoice as jest.Mock).mockReturnValue(
      new Promise((r) => {
        resolve = r;
      }),
    );
    show();
    let save = await review();
    expect(screen.getByText(/does not post an invoice/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Advance percentage'), {
      target: { value: '60' },
    });
    expect(
      screen.queryByRole('button', { name: 'Create draft advance invoice' }),
    ).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Advance percentage'), {
      target: { value: '50' },
    });
    fireEvent.click(
      screen.getByRole('button', { name: 'Review advance calculation' }),
    );
    save = await screen.findByRole('button', {
      name: 'Create draft advance invoice',
    });
    fireEvent.click(save);
    fireEvent.click(save);
    expect(saveAdvanceInvoice).toHaveBeenCalledTimes(1);
    expect(saveAdvanceInvoice).toHaveBeenCalledWith(advanceRequestFixture());
    expect(
      screen.getByRole('button', { name: 'Back to order actions' }),
    ).toBeDisabled();
    fireEvent.keyDown(screen.getByRole('dialog'), {
      key: 'Escape',
      keyCode: 27,
    });
    expect(close).not.toHaveBeenCalled();
    await act(async () => resolve(savedAdvanceFixture()));
    expect(completed).toHaveBeenCalledWith(savedAdvanceFixture().order);
    expect(sessionStorage.getItem(storageKey)).toBeNull();
  });
  it('keeps unknown saves frozen, status absence inconclusive, and retry identical', async () => {
    (saveAdvanceInvoice as jest.Mock).mockRejectedValueOnce(
      new Error('Save response lost'),
    );
    show();
    fireEvent.click(await review());
    await screen.findByText('Save response lost');
    expect(screen.getByLabelText('Advance percentage')).toBeDisabled();
    expect(JSON.parse(sessionStorage.getItem(storageKey)!)).toEqual(
      advanceRequestFixture(),
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Check advance save status' }),
    );
    await screen.findByText(/does not prove the original request stopped/);
    expect(saveAdvanceInvoice).toHaveBeenCalledTimes(1);
    fireEvent.click(
      screen.getByRole('button', { name: 'Retry same advance save' }),
    );
    await waitFor(() => expect(completed).toHaveBeenCalled());
    expect((saveAdvanceInvoice as jest.Mock).mock.calls[1]).toEqual(
      (saveAdvanceInvoice as jest.Mock).mock.calls[0],
    );
  });
  it('recovers the exact request after remount or Billing reconnect without storing customer details', async () => {
    sessionStorage.setItem(storageKey, JSON.stringify(advanceRequestFixture()));
    (getAdvanceInvoiceStatus as jest.Mock).mockRejectedValueOnce(
      new BillingSessionExpired('Expired'),
    );
    show();
    await screen.findByText('Save result needs confirmation');
    expect(previewAdvanceInvoice).not.toHaveBeenCalled();
    fireEvent.click(
      screen.getByRole('button', { name: 'Check advance save status' }),
    );
    fireEvent.click(
      await screen.findByRole('button', { name: 'Reconnect Billing' }),
    );
    expect(reconnect).toHaveBeenCalledTimes(1);
    expect(sessionStorage.getItem(storageKey)).not.toContain('Customer');
    (getAdvanceInvoiceStatus as jest.Mock).mockResolvedValue(
      savedAdvanceFixture(),
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Check advance save status' }),
    );
    await waitFor(() => expect(completed).toHaveBeenCalled());
    expect(getAdvanceInvoiceStatus).toHaveBeenCalledWith(
      advanceRequestFixture(),
    );
    expect(saveAdvanceInvoice).not.toHaveBeenCalled();
  });
  it('unlocks a confirmed native rejection for a fresh review, without automatic replay', async () => {
    (saveAdvanceInvoice as jest.Mock).mockRejectedValueOnce(
      new BillingActionRejected('Order changed. Recalculate.'),
    );
    show();
    fireEvent.click(await review());
    await screen.findByText('Order changed. Recalculate.');
    expect(screen.getByLabelText('Advance percentage')).toHaveValue(50);
    expect(screen.getByLabelText('Advance percentage')).toBeEnabled();
    expect(
      screen.queryByRole('button', { name: 'Create draft advance invoice' }),
    ).not.toBeInTheDocument();
    expect(sessionStorage.getItem(storageKey)).toBeNull();
    expect(saveAdvanceInvoice).toHaveBeenCalledTimes(1);
  });
  it('supports fixed advances and manager-only first-use account/tax setup', async () => {
    (getAdvanceInvoice as jest.Mock).mockResolvedValue(
      advanceFixture({ product: false }),
    );
    show();
    await screen.findByLabelText('Advance percentage');
    fireEvent.change(screen.getByLabelText('Advance type'), {
      target: { value: 'fixed' },
    });
    fireEvent.change(screen.getByLabelText('Advance amount (INR)'), {
      target: { value: '123.45' },
    });
    fireEvent.click(
      screen.getByRole('button', { name: 'Deposit income account' }),
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Add deposit sales tax' }),
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Review advance calculation' }),
    );
    await screen.findByRole('button', { name: 'Create draft advance invoice' });
    expect(previewAdvanceInvoice).toHaveBeenCalledWith(
      18,
      expect.objectContaining({
        advance_payment_method: 'fixed',
        fixed_amount: 123.45,
        deposit_account_id: 11,
        deposit_taxes_id: [11],
      }),
    );
    expect(
      screen.getByText(/sets it as the Billing default/),
    ).toBeInTheDocument();
  });
  it('preserves failed-preview entries and asks before discarding or reconnecting', async () => {
    (previewAdvanceInvoice as jest.Mock).mockRejectedValueOnce(
      new BillingSessionExpired('Expired'),
    );
    show();
    fireEvent.change(await screen.findByLabelText('Advance percentage'), {
      target: { value: '70' },
    });
    fireEvent.click(
      screen.getByRole('button', { name: 'Review advance calculation' }),
    );
    fireEvent.click(
      await screen.findByRole('button', { name: 'Reconnect Billing' }),
    );
    expect(reconnect).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Keep editing' }));
    expect(screen.getByLabelText('Advance percentage')).toHaveValue(70);
    fireEvent.click(
      screen.getByRole('button', { name: 'Back to order actions' }),
    );
    expect(close).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: /Discard entries/ }));
    expect(close).toHaveBeenCalledTimes(1);
    expect(saveAdvanceInvoice).not.toHaveBeenCalled();
  });
  it('does not expose account override to clerks or editable actions to ineligible orders', async () => {
    (getAdvanceInvoice as jest.Mock).mockResolvedValue(
      advanceFixture({
        product: false,
        can_set_account: false,
        order: { ...advanceFixture().order, can_advance: false },
      }),
    );
    show();
    await screen.findByLabelText('Advance percentage');
    expect(
      screen.queryByRole('button', { name: 'Deposit income account' }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Add deposit sales tax' }),
    ).toBeDisabled();
    expect(
      screen.getByRole('button', { name: 'Review advance calculation' }),
    ).toBeDisabled();
    expect(saveAdvanceInvoice).not.toHaveBeenCalled();
  });
  it('fails closed on invalid saved recovery data and distinguishes read failure from an empty form', async () => {
    sessionStorage.setItem(storageKey, 'not-json');
    show();
    await screen.findByText(/recovery storage is unavailable or invalid/);
    expect(
      screen.getByRole('button', { name: 'Review advance calculation' }),
    ).toBeDisabled();
    expect(saveAdvanceInvoice).not.toHaveBeenCalled();
  });
});
