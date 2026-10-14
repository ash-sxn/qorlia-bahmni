import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import {
  BillingActionRejected,
  BillingSessionExpired,
  getJournalMoney,
  getJournalMoneyChoices,
  getJournalMoneyStatus,
  previewJournalMoney,
  saveJournalMoney,
  getJournalMoneyAnalytics,
} from '../billingService';
import { JournalMoneyEditor } from '../JournalMoneyEditor';
import { moneyRequest, moneyView } from './journalMoneyFixture';

jest.mock('../billingService', () => ({
  ...jest.requireActual('../billingService'),
  getJournalMoney: jest.fn(),
  getJournalMoneyChoices: jest.fn(),
  getJournalMoneyStatus: jest.fn(),
  previewJournalMoney: jest.fn(),
  saveJournalMoney: jest.fn(),
  getJournalMoneyAnalytics: jest.fn(),
}));
const close = jest.fn(),
  saved = jest.fn(),
  reconnect = jest.fn();
const storage = 'qorlia.billing.journal-money.pending:3:7';
const show = () =>
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <JournalMoneyEditor
        uid={3}
        invoiceId={7}
        close={close}
        saved={saved}
        reconnect={reconnect}
      />
    </QueryClientProvider>,
  );
const review = async () => {
  fireEvent.change(await screen.findByLabelText('Item #14 credit (INR)'), {
    target: { value: '600' },
  });
  fireEvent.click(
    screen.getByRole('button', { name: 'Review journal amounts' }),
  );
  await screen.findByRole('region', { name: 'Reviewed journal amounts' });
};
describe('Reviewed monetary journal editor', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    sessionStorage.clear();
    (getJournalMoney as jest.Mock).mockResolvedValue(moneyView());
    (getJournalMoneyChoices as jest.Mock).mockResolvedValue([]);
    const initial = moneyView();
    (previewJournalMoney as jest.Mock).mockResolvedValue({
      ...initial,
      totals: { ...initial.totals, amount_total: 600 },
      review_version: 'b'.repeat(64),
      rows: [
        ...initial.rows,
        {
          ...initial.rows[1],
          id: false,
          values: {
            ...initial.rows[1].values,
            display_type: 'tax',
            name: 'Generated tax',
          },
        },
      ],
    });
    (saveJournalMoney as jest.Mock).mockResolvedValue(moneyView());
    (getJournalMoneyStatus as jest.Mock).mockResolvedValue(false);
    (getJournalMoneyAnalytics as jest.Mock).mockResolvedValue({
      plans: [],
      accounts: [],
    });
  });
  afterEach(() => jest.restoreAllMocks());
  it('reviews the complete native ledger, generated rows and distinct product prices before saving', async () => {
    show();
    await screen.findByLabelText('Item #14 label');
    expect(
      screen.getByRole('button', { name: 'Save reviewed journal amounts' }),
    ).toBeDisabled();
    await review();
    expect(previewJournalMoney).toHaveBeenCalledWith(moneyRequest().payload);
    const ledger = screen.getByRole('table', {
      name: 'All reviewed native journal rows',
    });
    expect(within(ledger).getAllByRole('row')).toHaveLength(4);
    expect(
      within(ledger).getByRole('rowheader', { name: /Generated tax/ }),
    ).toBeInTheDocument();
    expect(within(ledger).getAllByText(/Unit price:/)[0]).toHaveTextContent(
      '500.00',
    );
    expect(screen.getByRole('note')).toHaveTextContent(
      'Posted rows cannot be removed',
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Save reviewed journal amounts' }),
    );
    await waitFor(() => expect(saved).toHaveBeenCalledTimes(1));
    expect(saveJournalMoney).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: moneyRequest().payload,
        review_version: 'b'.repeat(64),
      }),
    );
    expect(sessionStorage.getItem(storage)).toBeNull();
  });
  it('invalidates review on another edit and asks before discarding', async () => {
    show();
    await review();
    fireEvent.change(screen.getByLabelText('Item #14 label'), {
      target: { value: 'Edited label' },
    });
    expect(
      screen.queryByRole('region', { name: 'Reviewed journal amounts' }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Save reviewed journal amounts' }),
    ).toBeDisabled();
    fireEvent.click(
      screen.getByRole('button', { name: 'Back to journal items' }),
    );
    await screen.findByText('Discard unsaved journal changes?');
    expect(close).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Keep editing' }));
    expect(screen.getByLabelText('Item #14 label')).toHaveValue('Edited label');
  });
  it('adds rows with native defaults and stages draft deletion with an undo control', async () => {
    (getJournalMoney as jest.Mock).mockResolvedValue({
      ...moneyView(),
      can_delete: true,
      totals: { ...moneyView().totals, state: 'draft' },
    });
    (getJournalMoneyChoices as jest.Mock).mockResolvedValue([
      [12, 'Consultation income'],
    ]);
    show();
    await screen.findByLabelText('Item #14 label');
    fireEvent.click(screen.getByRole('button', { name: /Remove Item #14$/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Keep Item #14' }));
    expect(screen.getByLabelText('Item #14 label')).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: /Remove Item #14$/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Add journal item' }));
    fireEvent.change(screen.getByLabelText('New item 3 label'), {
      target: { value: 'QorliaQA Added entry' },
    });
    fireEvent.click(
      screen.getByRole('combobox', { name: 'New item 3 account' }),
    );
    fireEvent.click(
      await screen.findByRole('option', { name: 'Consultation income' }),
    );
    fireEvent.change(screen.getByLabelText('New item 3 credit (INR)'), {
      target: { value: '100' },
    });
    fireEvent.click(
      screen.getByRole('button', { name: 'Review journal amounts' }),
    );
    await screen.findByRole('region', { name: 'Reviewed journal amounts' });
    expect(previewJournalMoney).toHaveBeenCalledWith(
      expect.objectContaining({
        changes: [
          { id: 14, delete: true },
          {
            id: false,
            values: {
              name: 'QorliaQA Added entry',
              account_id: 12,
              debit: 0,
              credit: 100,
            },
          },
        ],
      }),
    );
  });
  it('retains an uncertain save and retries only the identical reviewed request', async () => {
    (saveJournalMoney as jest.Mock)
      .mockRejectedValueOnce(new Error('Response lost'))
      .mockResolvedValueOnce(moneyView());
    show();
    await review();
    fireEvent.click(
      screen.getByRole('button', { name: 'Save reviewed journal amounts' }),
    );
    await screen.findByText('Response lost');
    const request = JSON.parse(sessionStorage.getItem(storage)!);
    expect(screen.getByLabelText('Item #14 credit (INR)')).toBeDisabled();
    expect(
      screen.getByRole('button', { name: 'Back to journal items' }),
    ).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Check journal save' }));
    await screen.findByText(/No receipt was found yet/);
    expect(saved).not.toHaveBeenCalled();
    fireEvent.click(
      screen.getByRole('button', { name: 'Retry identical journal save' }),
    );
    await waitFor(() => expect(saved).toHaveBeenCalledTimes(1));
    expect(saveJournalMoney).toHaveBeenNthCalledWith(2, request);
    expect(getJournalMoneyStatus).toHaveBeenCalledWith(request);
  });
  it('recovers after remount even if the removed row is no longer in the current ledger', async () => {
    const request = {
      ...moneyRequest(),
      payload: {
        ...moneyRequest().payload,
        changes: [{ id: 99, delete: true }],
      },
    };
    sessionStorage.setItem(storage, JSON.stringify(request));
    (getJournalMoneyStatus as jest.Mock).mockResolvedValue(moneyView());
    show();
    await screen.findByText('Item #99 (will be removed)');
    fireEvent.click(screen.getByRole('button', { name: 'Check journal save' }));
    await waitFor(() => expect(saved).toHaveBeenCalledTimes(1));
    expect(getJournalMoneyStatus).toHaveBeenCalledWith(request);
    expect(saveJournalMoney).not.toHaveBeenCalled();
    expect(sessionStorage.getItem(storage)).toBeNull();
  });
  it('clears only an explicit native rejection and does not resubmit automatically', async () => {
    (saveJournalMoney as jest.Mock).mockRejectedValue(
      new BillingActionRejected('Native lock prevents saving'),
    );
    show();
    await review();
    fireEvent.click(
      screen.getByRole('button', { name: 'Save reviewed journal amounts' }),
    );
    await screen.findByText('Native lock prevents saving');
    expect(sessionStorage.getItem(storage)).toBeNull();
    expect(screen.getByLabelText('Item #14 credit (INR)')).toBeEnabled();
    expect(
      screen.getByRole('button', { name: 'Save reviewed journal amounts' }),
    ).toBeDisabled();
    expect(saveJournalMoney).toHaveBeenCalledTimes(1);
  });
  it('refuses to send a save when durable request storage fails', async () => {
    show();
    await review();
    jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('Storage blocked');
    });
    fireEvent.click(
      screen.getByRole('button', { name: 'Save reviewed journal amounts' }),
    );
    await screen.findByText('Storage blocked');
    expect(saveJournalMoney).not.toHaveBeenCalled();
  });
  it('locks invalid recovery storage instead of silently discarding it', async () => {
    sessionStorage.setItem(storage, '{broken');
    show();
    await screen.findByText(/recovery storage is unavailable or invalid/);
    expect(screen.getByLabelText('Item #14 label')).toBeDisabled();
    expect(
      screen.getByRole('button', { name: 'Back to journal items' }),
    ).toBeDisabled();
    expect(saveJournalMoney).not.toHaveBeenCalled();
  });
  it('honours readonly and currency/analytic permissions and reconnects on load expiry', async () => {
    const initial = moneyView();
    (getJournalMoney as jest.Mock).mockResolvedValue({
      ...initial,
      can_edit: false,
      can_add: false,
      editable_fields: [],
    });
    const mounted = show();
    expect(await screen.findByLabelText('Item #14 label')).toBeDisabled();
    expect(
      screen.queryByRole('combobox', { name: 'Item #14 currency' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Add journal item' }),
    ).not.toBeInTheDocument();
    mounted.unmount();
    (getJournalMoney as jest.Mock).mockRejectedValue(
      new BillingSessionExpired(),
    );
    show();
    fireEvent.click(
      await screen.findByRole('button', { name: 'Reconnect Billing' }),
    );
    expect(reconnect).toHaveBeenCalledTimes(1);
  });
});
