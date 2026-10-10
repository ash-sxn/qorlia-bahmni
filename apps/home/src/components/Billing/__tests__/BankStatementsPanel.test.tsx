import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { BankStatementsPanel } from '../BankStatementsPanel';
import {
  BillingSessionExpired,
  getBankCandidates,
  getBankDetail,
  getBankHistory,
} from '../billingService';
import { bankCandidates, bankDetail, bankEntry } from './bankFixture';

jest.mock('../BankMatchingModal', () => ({
  BankMatchingModal: ({
    uid,
    entryId,
    saved,
    close,
  }: {
    uid: number;
    entryId: number;
    saved: () => void;
    close: () => void;
  }) => (
    <section aria-label="Matching test workspace">
      <p>
        Matching user {uid}, entry {entryId}
      </p>
      <button onClick={saved}>Accepted matching receipt</button>
      <button onClick={close}>Close matching workspace</button>
    </section>
  ),
}));
jest.mock('../billingService', () => ({
  ...jest.requireActual('../billingService'),
  getBankCandidates: jest.fn(),
  getBankDetail: jest.fn(),
  getBankHistory: jest.fn(),
}));
const reconnect = jest.fn();
const show = (uid = 3) =>
  render(
    <QueryClientProvider
      client={
        new QueryClient({
          defaultOptions: { queries: { retry: false } },
        })
      }
    >
      <BankStatementsPanel uid={uid} reconnect={reconnect} />
    </QueryClientProvider>,
  );
const open = async () =>
  fireEvent.click(
    await screen.findByRole('button', { name: 'View statement entry 7' }),
  );
describe('Bank statement native read workspace', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    (getBankHistory as jest.Mock).mockResolvedValue({
      rows: [bankEntry()],
      offset: 0,
      has_more: false,
    });
    (getBankDetail as jest.Mock).mockResolvedValue(bankDetail());
    (getBankCandidates as jest.Mock).mockResolvedValue(bankCandidates());
  });
  it('opens native detail only on request and renders separate company and transaction residuals', async () => {
    show();
    await screen.findByRole('cell', { name: /BNK\/2026\/7/ });
    expect(getBankDetail).not.toHaveBeenCalled();
    await open();
    const candidates = await screen.findByRole('table', {
      name: 'Native candidate ledger items',
    });
    expect(within(candidates).getByText('₹100.00')).toBeInTheDocument();
    expect(within(candidates).getByText('$2.00')).toBeInTheDocument();
    expect(
      screen.getByText(/Company-currency ledger: debit/),
    ).toHaveTextContent('₹100.00');
    expect(
      screen.getByText(
        /Reading these candidate rows does not reconcile entries/,
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /^Match|^Reconcile|^Undo/ }),
    ).not.toBeInTheDocument();
    expect(getBankDetail).toHaveBeenCalledWith(7, false, false);
    expect(getBankCandidates).toHaveBeenCalledWith(7, 'a'.repeat(64), '', 0);
    fireEvent.click(screen.getByRole('button', { name: 'Back to statements' }));
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );
  });
  it('submits searches explicitly and resets page and selection when matching state changes', async () => {
    (getBankHistory as jest.Mock).mockResolvedValue({
      rows: [bankEntry()],
      offset: 0,
      has_more: true,
    });
    show();
    await screen.findByRole('cell', { name: /BNK\/2026\/7/ });
    fireEvent.change(
      screen.getByLabelText('Statement, entry, partner or label'),
      { target: { value: 'QorliaQA' } },
    );
    expect(getBankHistory).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Search statements' }));
    await waitFor(() =>
      expect(getBankHistory).toHaveBeenLastCalledWith('QorliaQA', 'all', 0),
    );
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Next statement entries' }),
      ).toBeEnabled(),
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Next statement entries' }),
    );
    await waitFor(() =>
      expect(getBankHistory).toHaveBeenLastCalledWith('QorliaQA', 'all', 25),
    );
    fireEvent.change(screen.getByLabelText('Matching state'), {
      target: { value: 'unmatched' },
    });
    await waitFor(() =>
      expect(getBankHistory).toHaveBeenLastCalledWith(
        'QorliaQA',
        'unmatched',
        0,
      ),
    );
  });
  it('replaces detail with matching for the selected user and entry, then refreshes history after acceptance', async () => {
    show(12);
    await open();
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Review matching and undo' }),
      ).toBeEnabled(),
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Review matching and undo' }),
    );
    expect(screen.getByText('Matching user 12, entry 7')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(getBankHistory).toHaveBeenCalledTimes(1);
    fireEvent.click(
      screen.getByRole('button', { name: 'Accepted matching receipt' }),
    );
    await waitFor(() => expect(getBankHistory).toHaveBeenCalledTimes(2));
    expect(
      screen.getByLabelText('Matching test workspace'),
    ).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole('button', { name: 'Close matching workspace' }),
    );
    expect(
      screen.queryByLabelText('Matching test workspace'),
    ).not.toBeInTheDocument();
    await open();
    expect(
      await screen.findByRole('button', { name: 'Review matching and undo' }),
    ).toBeInTheDocument();
  });
  it('does not open matching when the native statement detail cannot load', async () => {
    (getBankDetail as jest.Mock).mockRejectedValue(
      new Error('Statement detail unavailable'),
    );
    show();
    await open();
    await screen.findByText(/Statement detail unavailable/);
    expect(
      screen.getByRole('button', { name: 'Review matching and undo' }),
    ).toBeDisabled();
    expect(
      screen.queryByLabelText('Matching test workspace'),
    ).not.toBeInTheDocument();
  });
  it('loads later ledger rows with the original version and hides all prior rows on stale-page failure', async () => {
    (getBankDetail as jest.Mock)
      .mockResolvedValueOnce({
        ...bankDetail(),
        next_after: 72,
        total_count: 102,
      })
      .mockRejectedValueOnce(new Error('Statement entry changed'));
    show();
    await open();
    fireEvent.click(
      await screen.findByRole('button', { name: 'Load next ledger page' }),
    );
    await screen.findByText(
      /Statement entry changed.*Previously loaded ledger rows are hidden/,
    );
    expect(getBankDetail).toHaveBeenLastCalledWith(7, 72, 'a'.repeat(64));
    expect(
      screen.queryByRole('table', { name: /native journal items/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('table', { name: 'Native candidate ledger items' }),
    ).not.toBeInTheDocument();
    expect(getBankDetail).toHaveBeenCalledTimes(2);
  });
  it('does not offer possible matches for a natively matched entry', async () => {
    (getBankDetail as jest.Mock).mockResolvedValue({
      ...bankDetail(),
      entry: { ...bankEntry(), is_reconciled: true },
    });
    show();
    await open();
    await screen.findByText(/already matched according to native Billing/);
    expect(getBankCandidates).not.toHaveBeenCalled();
  });
  it('hides previously loaded history after expiry and permits explicit reconnection', async () => {
    (getBankHistory as jest.Mock)
      .mockResolvedValueOnce({
        rows: [bankEntry()],
        offset: 0,
        has_more: false,
      })
      .mockRejectedValueOnce(new BillingSessionExpired('Bank session expired'));
    show();
    await screen.findByRole('cell', { name: /BNK\/2026\/7/ });
    fireEvent.click(screen.getByRole('button', { name: 'Refresh statements' }));
    fireEvent.click(
      await screen.findByRole('button', { name: 'Reconnect Billing' }),
    );
    expect(reconnect).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(getBankHistory).toHaveBeenCalledTimes(2);
  });
  it('keeps no entries distinct from proof of bank clearance', async () => {
    (getBankHistory as jest.Mock).mockResolvedValue({
      rows: [],
      offset: 0,
      has_more: false,
    });
    show();
    await screen.findByText(/This does not establish bank clearance/);
    expect(getBankCandidates).not.toHaveBeenCalled();
    expect(
      screen.getByRole('button', { name: 'Next statement entries' }),
    ).toBeDisabled();
  });
  it('hides expired possible matches and exposes recovery without automatically retrying', async () => {
    (getBankCandidates as jest.Mock).mockRejectedValue(
      new BillingSessionExpired('Candidate session expired'),
    );
    show();
    await open();
    fireEvent.click(
      await screen.findByRole('button', { name: 'Reconnect Billing' }),
    );
    expect(reconnect).toHaveBeenCalledTimes(1);
    expect(getBankCandidates).toHaveBeenCalledTimes(1);
    expect(
      screen.queryByRole('table', { name: 'Native candidate ledger items' }),
    ).not.toBeInTheDocument();
  });
});
