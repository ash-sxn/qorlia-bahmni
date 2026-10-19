import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { axe, toHaveNoViolations } from 'jest-axe';
import {
  BillingActionRejected,
  BillingSessionExpired,
  getInventoryTransfers,
} from '../billingService';
import { InventoryTransfersPanel } from '../InventoryTransfersPanel';
import { inventoryPage } from './inventoryTransferFixture';

jest.mock('../billingService', () => ({
  ...jest.requireActual('../billingService'),
  getInventoryTransfers: jest.fn(),
}));
expect.extend(toHaveNoViolations);
const load = jest.mocked(getInventoryTransfers);
const reconnect = jest.fn();
function show(uid = 3) {
  return render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <InventoryTransfersPanel uid={uid} reconnect={reconnect} />
    </QueryClientProvider>,
  );
}
beforeEach(() => {
  jest.clearAllMocks();
  load.mockResolvedValue(inventoryPage());
});
it('shows actual native transfer headers and account-timezone dates without write actions', async () => {
  show();
  expect(await screen.findByText('QORLIAQA/OUT/11')).toBeInTheDocument();
  expect(screen.getByText(/Times shown in Asia\/Kolkata/)).toBeInTheDocument();
  expect(screen.getByText('QA Stock')).toBeInTheDocument();
  expect(
    screen.getByRole('region', {
      name: 'Inventory transfer table, scroll for more columns',
    }),
  ).toHaveAttribute('tabindex', '0');
  expect(
    screen.getByText(
      new Intl.DateTimeFormat(undefined, {
        dateStyle: 'medium',
        timeStyle: 'short',
        timeZone: 'Asia/Kolkata',
      }).format(new Date('2026-10-14T10:00:00Z')),
    ),
  ).toBeInTheDocument();
  expect(
    screen.queryByRole('button', { name: /cancel|validate|save/i }),
  ).not.toBeInTheDocument();
  expect(load).toHaveBeenCalledWith('', 'all', 'all', 0);
  expect(await axe(document.body)).toHaveNoViolations();
});
it('filters native operation and status without treating status labels as row actions', async () => {
  show();
  await screen.findByText('QORLIAQA/OUT/11');
  fireEvent.change(screen.getByLabelText('Operation'), {
    target: { value: 'incoming' },
  });
  await waitFor(() =>
    expect(load).toHaveBeenLastCalledWith('', 'incoming', 'all', 0),
  );
  fireEvent.change(screen.getByLabelText('Status'), {
    target: { value: 'waiting' },
  });
  await waitFor(() =>
    expect(load).toHaveBeenLastCalledWith('', 'incoming', 'waiting', 0),
  );
  fireEvent.change(
    screen.getByLabelText('Transfer reference or source document'),
    { target: { value: ' QA ' } },
  );
  fireEvent.click(screen.getByRole('button', { name: 'Search transfers' }));
  await waitFor(() =>
    expect(load).toHaveBeenLastCalledWith('QA', 'incoming', 'waiting', 0),
  );
  fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
  await waitFor(() =>
    expect(load).toHaveBeenLastCalledWith('', 'all', 'all', 0),
  );
});
it('pages only from the current response and resets paging on a filter change', async () => {
  const first = inventoryPage();
  first.next_offset = 25;
  first.total_count = 26;
  first.rows = Array.from({ length: 25 }, (_, index) => ({
    ...first.rows[0],
    id: 11 + index,
    name: `QORLIAQA/OUT/${11 + index}`,
  }));
  load
    .mockResolvedValueOnce(first)
    .mockResolvedValue({ ...inventoryPage(), offset: 25, total_count: 26 });
  show();
  await screen.findByText('QORLIAQA/OUT/11');
  fireEvent.click(screen.getByRole('button', { name: 'Next transfer page' }));
  await waitFor(() =>
    expect(load).toHaveBeenLastCalledWith('', 'all', 'all', 25),
  );
  fireEvent.change(screen.getByLabelText('Operation'), {
    target: { value: 'internal' },
  });
  await waitFor(() =>
    expect(load).toHaveBeenLastCalledWith('', 'internal', 'all', 0),
  );
});
it('does not show stale rows when a refresh is denied', async () => {
  show();
  await screen.findByText('QORLIAQA/OUT/11');
  load.mockRejectedValue(new BillingActionRejected('Stock access denied.'));
  fireEvent.click(screen.getByRole('button', { name: 'Refresh transfers' }));
  await waitFor(() =>
    expect(
      screen.getByRole('alert', { name: 'Inventory error' }),
    ).toHaveTextContent('Stock access denied.'),
  );
  expect(screen.queryByText('QORLIAQA/OUT/11')).not.toBeInTheDocument();
  expect(screen.queryByText(/No transfers match/)).not.toBeInTheDocument();
});
it('requests reconnection on expiry, not an empty successful result', async () => {
  load.mockRejectedValue(new BillingSessionExpired());
  show();
  fireEvent.click(
    await screen.findByRole('button', { name: 'Reconnect Billing' }),
  );
  expect(reconnect).toHaveBeenCalledTimes(1);
  expect(screen.queryByText(/No transfers match/)).not.toBeInTheDocument();
});
it('keeps an empty filtered result explicit and disables both pagination buttons', async () => {
  load.mockResolvedValue({ ...inventoryPage(), rows: [], total_count: 0 });
  show();
  expect(
    await screen.findByText(/No transfers match these filters/),
  ).toBeInTheDocument();
  expect(
    screen.getByRole('button', { name: 'Previous transfer page' }),
  ).toBeDisabled();
  expect(
    screen.getByRole('button', { name: 'Next transfer page' }),
  ).toBeDisabled();
});
