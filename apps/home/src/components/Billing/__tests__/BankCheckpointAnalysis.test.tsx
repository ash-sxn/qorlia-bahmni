import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
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
  getCheckpointAnalysis,
} from '../billingService';

jest.mock('../billingService', () => ({
  ...jest.requireActual('../billingService'),
  getCheckpointAnalysis: jest.fn(),
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
const reconnect = jest.fn();
const show = (uid = 3) =>
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <BankCheckpointAnalysis
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
    jest.clearAllMocks();
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
  it('hides previous totals when refresh fails and offers Billing reconnect', async () => {
    show();
    await screen.findByRole('table');
    get.mockRejectedValueOnce(new BillingSessionExpired());
    fireEvent.click(screen.getByRole('button', { name: 'Refresh analysis' }));
    await screen.findByText(
      /Previous analysis is hidden until a successful reload/,
    );
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Reconnect Billing' }));
    expect(reconnect).toHaveBeenCalledTimes(1);
  });
  it('does not fabricate charts or sample data for an empty result', async () => {
    get.mockResolvedValue({ ...filters, rows: [], total_count: 0 });
    show(4);
    await screen.findByText('No checkpoints match these analysis filters.');
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });
});
