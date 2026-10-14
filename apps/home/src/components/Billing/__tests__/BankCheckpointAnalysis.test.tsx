import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { BankCheckpointAnalysis } from '../BankCheckpointAnalysis';
import {
  BillingSessionExpired,
  CheckpointAnalysisFilters,
  downloadCheckpointAnalysis,
  getCheckpointAnalysis,
} from '../billingService';

jest.mock('../billingService', () => ({
  ...jest.requireActual('../billingService'),
  getCheckpointAnalysis: jest.fn(),
  downloadCheckpointAnalysis: jest.fn(),
}));
const filters: CheckpointAnalysisFilters = {
  search: 'QorliaQA',
  state: 'all',
  journal_type: 'all',
  period: 'month',
  date_from: false,
  date_to: false,
};
const fixture = () => ({
  ...filters,
  version: 'a'.repeat(64),
  total_count: 3,
  rows: [
    {
      journal_id: [5, 'Synthetic INR bank'],
      currency_id: [21, 'INR'],
      period_label: 'January 2026',
      period_from: '2026-01-01',
      period_to: '2026-02-01',
      count: 2,
      balance_start: 100,
      balance_end: -30,
      balance_end_real: -30,
    },
    {
      journal_id: [6, 'Synthetic USD cash'],
      currency_id: [2, 'USD'],
      period_label: 'February 2026',
      period_from: '2026-02-01',
      period_to: '2026-03-01',
      count: 1,
      balance_start: 25,
      balance_end: 50,
      balance_end_real: 45,
    },
  ],
});
const get = jest.mocked(getCheckpointAnalysis);
const download = jest.mocked(downloadCheckpointAnalysis);
const reconnect = jest.fn();
const show = (uid = 3) =>
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <BankCheckpointAnalysis
        key={uid}
        uid={uid}
        search="QorliaQA"
        state="all"
        journalType="all"
        reconnect={reconnect}
      />
    </QueryClientProvider>,
  );
describe('Statement checkpoint pivot and graph', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
    jest.clearAllMocks();
    URL.createObjectURL = jest.fn(() => 'blob:checkpoint-export');
    URL.revokeObjectURL = jest.fn();
    jest
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => {});
    get.mockResolvedValue(
      fixture() as Awaited<ReturnType<typeof getCheckpointAnalysis>>,
    );
  });
  it('renders a real period/journal matrix, separates currencies and does not invent empty cells', async () => {
    show();
    const table = await screen.findByRole('table', {
      name: 'Computed ending balance by period and journal',
    });
    expect(
      within(table).getByRole('columnheader', {
        name: /Synthetic INR bank INR/,
      }),
    ).toBeInTheDocument();
    expect(
      within(table).getByRole('columnheader', {
        name: /Synthetic USD cash USD/,
      }),
    ).toBeInTheDocument();
    expect(within(table).getAllByText('No checkpoints')).toHaveLength(2);
    expect(screen.getByText(/3 checkpoints in 2 native/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Measure'), {
      target: { value: 'count' },
    });
    expect(
      screen.getByRole('table', {
        name: 'Checkpoint count by period and journal',
      }),
    ).toBeInTheDocument();
    expect(get).toHaveBeenCalledTimes(1);
  });
  it('shows signed graph bars with accessible exact numeric values', async () => {
    show();
    await screen.findByRole('table');
    fireEvent.click(screen.getByRole('button', { name: 'Graph' }));
    expect(
      screen.getByRole('img', { name: /Computed ending balance:.*30/ }),
    ).toBeInTheDocument();
    const bars = document.querySelectorAll('rect');
    expect(Number(bars[0].getAttribute('x'))).toBeLessThan(100);
    expect(Number(bars[1].getAttribute('x'))).toBe(100);
    expect(get).toHaveBeenCalledTimes(1);
  });
  it('flips both axes and retains sparse cells and per-journal totals without mixing currencies', async () => {
    const data = fixture();
    data.total_count = 4;
    data.rows.push({
      ...data.rows[0],
      period_label: 'February 2026',
      period_from: '2026-02-01',
      period_to: '2026-03-01',
      count: 1,
      balance_end: 70,
    });
    get.mockResolvedValue(
      data as Awaited<ReturnType<typeof getCheckpointAnalysis>>,
    );
    show();
    await screen.findByRole('table');
    const flip = screen.getByRole('button', { name: 'Flip pivot axes' });
    fireEvent.click(flip);
    const table = screen.getByRole('table', {
      name: 'Computed ending balance by journal and period',
    });
    expect(flip).toHaveAttribute('aria-pressed', 'true');
    expect(
      within(table).getByRole('columnheader', { name: 'January 2026' }),
    ).toBeInTheDocument();
    expect(
      within(table).getByRole('columnheader', { name: 'February 2026' }),
    ).toBeInTheDocument();
    const bank = within(table)
      .getByRole('rowheader', { name: /Synthetic INR bank INR/ })
      .closest('tr')!;
    const cash = within(table)
      .getByRole('rowheader', { name: /Synthetic USD cash USD/ })
      .closest('tr')!;
    expect(
      within(bank)
        .getAllByRole('cell')
        .map((cell) => cell.textContent),
    ).toEqual(['-₹30.00', '₹70.00', '₹40.00']);
    expect(
      within(cash)
        .getAllByRole('cell')
        .map((cell) => cell.textContent),
    ).toEqual(['No checkpoints', '$50.00', '$50.00']);
    expect(table.querySelector('tfoot')).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Measure'), {
      target: { value: 'count' },
    });
    expect(
      within(bank)
        .getAllByRole('cell')
        .map((cell) => cell.textContent),
    ).toEqual(['2', '1', '3']);
    fireEvent.click(flip);
    expect(
      screen.getByRole('table', {
        name: 'Checkpoint count by period and journal',
      }),
    ).toBeInTheDocument();
    expect(flip).toHaveAttribute('aria-pressed', 'false');
    expect(get).toHaveBeenCalledTimes(1);
  });
  it('applies date/status/type/grouping filters only on submission', async () => {
    show();
    await screen.findByRole('table');
    fireEvent.change(screen.getByLabelText('Group by'), {
      target: { value: 'quarter' },
    });
    fireEvent.change(screen.getByLabelText('From posted date'), {
      target: { value: '2026-01-01' },
    });
    fireEvent.change(screen.getByLabelText('Through posted date'), {
      target: { value: '2026-03-31' },
    });
    fireEvent.change(screen.getByLabelText('Checkpoint status'), {
      target: { value: 'invalid' },
    });
    fireEvent.change(screen.getByLabelText('Journal type'), {
      target: { value: 'cash' },
    });
    expect(get).toHaveBeenCalledTimes(1);
    fireEvent.click(
      screen.getByRole('button', { name: 'Apply analysis filters' }),
    );
    await waitFor(() =>
      expect(get).toHaveBeenLastCalledWith({
        ...filters,
        period: 'quarter',
        state: 'invalid',
        journal_type: 'cash',
        date_from: '2026-01-01',
        date_to: '2026-03-31',
      }),
    );
  });
  it('retains native input-only dates across batched grouping changes and clears them explicitly', async () => {
    show();
    await screen.findByRole('table');
    act(() => {
      fireEvent.input(screen.getByLabelText('From posted date'), {
        target: { value: '2026-10-10' },
      });
      fireEvent.input(screen.getByLabelText('Through posted date'), {
        target: { value: '2026-10-10' },
      });
      fireEvent.change(screen.getByLabelText('Group by'), {
        target: { value: 'day' },
      });
    });
    expect(screen.getByLabelText('From posted date')).toHaveValue('2026-10-10');
    expect(screen.getByLabelText('Through posted date')).toHaveValue(
      '2026-10-10',
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Apply analysis filters' }),
    );
    await waitFor(() =>
      expect(get).toHaveBeenLastCalledWith({
        ...filters,
        period: 'day',
        date_from: '2026-10-10',
        date_to: '2026-10-10',
      }),
    );
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Apply analysis filters' }),
      ).toBeEnabled(),
    );
    act(() => {
      fireEvent.input(screen.getByLabelText('From posted date'), {
        target: { value: '' },
      });
      fireEvent.input(screen.getByLabelText('Through posted date'), {
        target: { value: '' },
      });
      fireEvent.change(screen.getByLabelText('Group by'), {
        target: { value: 'journal' },
      });
    });
    fireEvent.click(
      screen.getByRole('button', { name: 'Apply analysis filters' }),
    );
    await waitFor(() =>
      expect(get).toHaveBeenLastCalledWith({ ...filters, period: 'journal' }),
    );
  });
  it('hides previous totals when refresh fails and offers Billing reconnect', async () => {
    show();
    await screen.findByRole('table');
    get.mockRejectedValueOnce(new BillingSessionExpired());
    fireEvent.click(screen.getByRole('button', { name: 'Refresh analysis' }));
    await screen.findByText(
      /Previous analysis is hidden until a successful reload/,
    );
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Flip pivot axes' }),
    ).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Reconnect Billing' }));
    expect(reconnect).toHaveBeenCalledTimes(1);
  });
  it('does not fabricate charts or sample data for an empty result', async () => {
    get.mockResolvedValue({
      ...filters,
      version: 'a'.repeat(64),
      rows: [],
      total_count: 0,
    });
    show(4);
    await screen.findByText('No checkpoints match these analysis filters.');
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Flip pivot axes' }),
    ).toBeDisabled();
    expect(
      screen.getByRole('button', { name: 'Download pivot Excel' }),
    ).toBeDisabled();
  });
  it('downloads the displayed snapshot/orientation rather than unsaved filter edits and clears stale feedback', async () => {
    download.mockResolvedValue({
      filename: 'Qorlia_Checkpoints.xlsx',
      blob: new Blob(['PK']),
    });
    show();
    await screen.findByRole('table');
    fireEvent.click(screen.getByRole('button', { name: 'Flip pivot axes' }));
    fireEvent.change(screen.getByLabelText('Measure'), {
      target: { value: 'count' },
    });
    fireEvent.change(
      screen.getByLabelText('Statement, external reference or journal'),
      { target: { value: 'Unsaved edit' } },
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Download pivot Excel' }),
    );
    await screen.findByText(
      /Excel download requested for the last applied filters/,
    );
    expect(download).toHaveBeenCalledWith(
      filters,
      'a'.repeat(64),
      'count',
      true,
    );
    expect(HTMLAnchorElement.prototype.click).toHaveBeenCalledTimes(1);
    expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
    fireEvent.change(screen.getByLabelText('Measure'), {
      target: { value: 'balance_start' },
    });
    expect(
      screen.queryByText(/Excel download requested/),
    ).not.toBeInTheDocument();
  });
  it('shows stale-export failures without downloading and offers session reconnect', async () => {
    download.mockRejectedValueOnce(
      new Error(
        'Checkpoint analysis changed. Refresh it before downloading Excel.',
      ),
    );
    show();
    await screen.findByRole('table');
    fireEvent.click(
      screen.getByRole('button', { name: 'Download pivot Excel' }),
    );
    await screen.findByText(/Checkpoint analysis changed/);
    expect(URL.createObjectURL).not.toHaveBeenCalled();
    download.mockRejectedValueOnce(new BillingSessionExpired());
    fireEvent.click(
      screen.getByRole('button', { name: 'Download pivot Excel' }),
    );
    fireEvent.click(
      await screen.findByRole('button', { name: 'Reconnect Billing' }),
    );
    expect(reconnect).toHaveBeenCalledTimes(1);
    expect(URL.createObjectURL).not.toHaveBeenCalled();
  });
  it('blocks duplicate exports and suppresses a late download after leaving the view', async () => {
    let resolve!: (
      value: Awaited<ReturnType<typeof downloadCheckpointAnalysis>>,
    ) => void;
    download.mockReturnValue(
      new Promise((accept) => {
        resolve = accept;
      }),
    );
    const view = show();
    await screen.findByRole('table');
    const button = screen.getByRole('button', { name: 'Download pivot Excel' });
    act(() => {
      fireEvent.click(button);
      fireEvent.click(button);
    });
    expect(download).toHaveBeenCalledTimes(1);
    expect(
      screen.getByRole('button', { name: 'Preparing Excel...' }),
    ).toBeDisabled();
    expect(screen.getByLabelText('Measure')).toBeDisabled();
    expect(
      screen.getByRole('button', { name: 'Refresh analysis' }),
    ).toBeDisabled();
    view.unmount();
    await act(async () =>
      resolve({ filename: 'Qorlia_Checkpoints.xlsx', blob: new Blob(['PK']) }),
    );
    expect(URL.createObjectURL).not.toHaveBeenCalled();
  });
});
