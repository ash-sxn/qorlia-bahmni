import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { BankCheckpointsPanel } from '../BankCheckpointsPanel';
import {
  BillingSessionExpired,
  getBankCheckpointDetail,
  getBankCheckpointHistory,
} from '../billingService';
import { bankCheckpoint, checkpointDetail } from './bankFixture';

jest.mock('../BankCheckpointEditorModal', () => ({
  BankCheckpointEditorModal: ({
    selection,
    close,
  }: {
    selection: unknown;
    close: () => void;
  }) => (
    <section aria-label="Checkpoint editor test workspace">
      <pre>{JSON.stringify(selection)}</pre>
      <button onClick={close}>Close checkpoint editor</button>
    </section>
  ),
}));
jest.mock('../billingService', () => ({
  ...jest.requireActual('../billingService'),
  getBankCheckpointDetail: jest.fn(),
  getBankCheckpointHistory: jest.fn(),
}));
const reconnect = jest.fn();
const openEntry = jest.fn();
const show = (uid = 3) =>
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <BankCheckpointsPanel
        uid={uid}
        reconnect={reconnect}
        openEntry={openEntry}
      />
    </QueryClientProvider>,
  );
const open = async () =>
  fireEvent.click(
    await screen.findByRole('button', { name: 'View checkpoint 9' }),
  );
describe('Statement balance checkpoint workspace', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    (getBankCheckpointHistory as jest.Mock).mockResolvedValue({
      rows: [bankCheckpoint()],
      offset: 0,
      has_more: false,
    });
    (getBankCheckpointDetail as jest.Mock).mockResolvedValue(
      checkpointDetail(),
    );
  });
  it('opens the native edit selection from history and replaces detail rather than nesting dialogs', async () => {
    show();
    fireEvent.click(
      await screen.findByRole('button', { name: 'Edit checkpoint 9' }),
    );
    expect(
      screen.getByRole('region', { name: 'Checkpoint editor test workspace' }),
    ).toHaveTextContent(
      '{"checkpoint_id":9,"entry_ids":[],"split_line_id":false}',
    );
    expect(getBankCheckpointDetail).not.toHaveBeenCalled();
    fireEvent.click(
      screen.getByRole('button', { name: 'Close checkpoint editor' }),
    );
    await open();
    fireEvent.click(
      await screen.findByRole('button', { name: 'Edit checkpoint balances' }),
    );
    expect(
      screen.queryByRole('dialog', { name: 'Statement checkpoint details' }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('region', { name: 'Checkpoint editor test workspace' }),
    ).toHaveTextContent(
      '{"checkpoint_id":9,"entry_ids":[],"split_line_id":false}',
    );
  });
  it('keeps native completeness separate from continuity and opens details on demand', async () => {
    show();
    const history = await screen.findByRole('table', {
      name: 'Native statement balance checkpoints',
    });
    expect(within(history).getByText('Complete')).toBeInTheDocument();
    expect(within(history).getByText('Needs attention')).toBeInTheDocument();
    expect(getBankCheckpointDetail).not.toHaveBeenCalled();
    await open();
    const dialog = await screen.findByRole('dialog');
    await within(dialog).findByText('Previous ending balance does not match.');
    expect(
      within(dialog).getByText(
        'Showing 1 of 1 entries. Native balances use all posted entries, not just this page.',
      ),
    ).toBeInTheDocument();
    expect(getBankCheckpointDetail).toHaveBeenCalledWith(9, false, false);
    fireEvent.click(
      within(dialog).getByRole('button', { name: 'View entry ledger 7' }),
    );
    expect(openEntry).toHaveBeenCalledWith(7);
  });
  it('submits explicit searches and resets pagination for native status and journal filters', async () => {
    (getBankCheckpointHistory as jest.Mock).mockResolvedValue({
      rows: [bankCheckpoint()],
      offset: 0,
      has_more: true,
    });
    show();
    await screen.findByRole('button', { name: 'View checkpoint 9' });
    fireEvent.click(screen.getByRole('button', { name: 'Next checkpoints' }));
    await waitFor(() =>
      expect(getBankCheckpointHistory).toHaveBeenLastCalledWith(
        '',
        'all',
        'all',
        25,
      ),
    );
    fireEvent.change(screen.getByLabelText('Checkpoint status'), {
      target: { value: 'invalid' },
    });
    await waitFor(() =>
      expect(getBankCheckpointHistory).toHaveBeenLastCalledWith(
        '',
        'invalid',
        'all',
        0,
      ),
    );
    fireEvent.change(screen.getByLabelText('Journal type'), {
      target: { value: 'cash' },
    });
    await waitFor(() =>
      expect(getBankCheckpointHistory).toHaveBeenLastCalledWith(
        '',
        'invalid',
        'cash',
        0,
      ),
    );
    fireEvent.change(
      screen.getByLabelText('Statement, external reference or journal'),
      { target: { value: '  October  ' } },
    );
    expect(getBankCheckpointHistory).not.toHaveBeenCalledWith(
      'October',
      'invalid',
      'cash',
      0,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Search checkpoints' }));
    await waitFor(() =>
      expect(getBankCheckpointHistory).toHaveBeenLastCalledWith(
        'October',
        'invalid',
        'cash',
        0,
      ),
    );
  });
  it('renders an empty native checkpoint without fake money or completeness', async () => {
    const empty = {
      ...bankCheckpoint(),
      date: false,
      journal_id: false,
      currency_id: false,
      company_id: false,
      balance_start: 0,
      balance_end: 0,
      balance_end_real: 0,
      is_complete: false,
      is_valid: true,
    };
    (getBankCheckpointHistory as jest.Mock).mockResolvedValue({
      rows: [empty],
      offset: 0,
      has_more: false,
    });
    (getBankCheckpointDetail as jest.Mock).mockResolvedValue({
      ...checkpointDetail(),
      checkpoint: empty,
      total_count: 0,
      rows: [],
    });
    show();
    await open();
    const dialog = await screen.findByRole('dialog');
    await within(dialog).findByText('This checkpoint has no entries.');
    expect(within(dialog).getAllByText('No journal currency')).toHaveLength(3);
    expect(within(dialog).getByText('Incomplete')).toBeInTheDocument();
    expect(within(dialog).queryByText('₹0.00')).not.toBeInTheDocument();
  });
  it('loads native ordered pages with a version, and hides balances after stale-page failure', async () => {
    const first = {
      ...checkpointDetail(),
      total_count: 101,
      next_after: 102,
      rows: Array.from({ length: 100 }, (_, index) => ({
        ...checkpointDetail().rows[0],
        id: 201 - index,
      })),
    };
    (getBankCheckpointDetail as jest.Mock)
      .mockResolvedValueOnce(first)
      .mockRejectedValueOnce(new Error('Checkpoint changed'));
    show();
    await open();
    const more = await screen.findByRole('button', {
      name: 'Load more checkpoint entries',
    });
    const dialog = screen.getByRole('dialog');
    fireEvent.click(more);
    await within(dialog).findByRole('alert');
    expect(getBankCheckpointDetail).toHaveBeenLastCalledWith(
      9,
      102,
      first.version,
    );
    expect(within(dialog).getByRole('alert')).toHaveTextContent(
      'Checkpoint changed',
    );
    expect(
      screen.queryByRole('table', {
        name: 'Entries in native statement order',
      }),
    ).not.toBeInTheDocument();
    expect(
      within(dialog).queryByText('Opening balance'),
    ).not.toBeInTheDocument();
  });
  it('hides overlapping or changed pages rather than showing a partial checkpoint', async () => {
    const first = {
      ...checkpointDetail(),
      total_count: 101,
      next_after: 102,
      rows: Array.from({ length: 100 }, (_, index) => ({
        ...checkpointDetail().rows[0],
        id: 201 - index,
      })),
    };
    (getBankCheckpointDetail as jest.Mock)
      .mockResolvedValueOnce(first)
      .mockResolvedValueOnce({
        ...checkpointDetail(),
        after: 102,
        total_count: 101,
        rows: [first.rows[0]],
      });
    show();
    await open();
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(
      await screen.findByRole('button', {
        name: 'Load more checkpoint entries',
      }),
    );
    await within(dialog).findByRole('alert');
    expect(within(dialog).getByRole('alert')).toHaveTextContent('overlapped');
    expect(
      screen.queryByRole('table', {
        name: 'Entries in native statement order',
      }),
    ).not.toBeInTheDocument();
  });
  it('hides stale history after refresh failure and offers session reconnection', async () => {
    (getBankCheckpointHistory as jest.Mock)
      .mockResolvedValueOnce({
        rows: [bankCheckpoint()],
        offset: 0,
        has_more: false,
      })
      .mockRejectedValueOnce(
        new BillingSessionExpired('Billing sign-in expired'),
      );
    show();
    await screen.findByRole('button', { name: 'View checkpoint 9' });
    fireEvent.click(
      screen.getByRole('button', { name: 'Refresh checkpoints' }),
    );
    await screen.findByRole('alert');
    expect(
      screen.queryByRole('table', {
        name: 'Native statement balance checkpoints',
      }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Reconnect Billing' }));
    expect(reconnect).toHaveBeenCalledTimes(1);
  });
});
