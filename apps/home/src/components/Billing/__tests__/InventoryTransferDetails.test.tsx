import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { axe, toHaveNoViolations } from 'jest-axe';
import {
  BillingActionRejected,
  BillingSessionExpired,
  getInventoryTransfer,
  getInventoryTransferDetailPage,
} from '../billingService';
import { InventoryTransferDetails } from '../InventoryTransferDetails';
import { inventoryLoad, inventoryDetail } from './inventoryTransferFixture';

jest.mock('../billingService', () => ({
  ...jest.requireActual('../billingService'),
  getInventoryTransfer: jest.fn(),
  getInventoryTransferDetailPage: jest.fn(),
}));
const mockConfirmation = jest.fn();
const mockPreparation = jest.fn();
const mockOperation = jest.fn();
const mockValidation = jest.fn();
jest.mock('../PagedStockValidationModal', () => ({
  PagedStockValidationModal: (props: { close: () => void }) => {
    mockValidation(props);
    return <button onClick={props.close}>Close global validation</button>;
  },
}));
jest.mock('../PagedStockOperationEditor', () => ({
  PagedStockOperationEditor: (props: { close: () => void }) => {
    mockOperation(props);
    return <button onClick={props.close}>Close global operation</button>;
  },
}));
jest.mock('../PagedStockReservationModal', () => ({
  PagedStockReservationModal: (props: { close: () => void }) => {
    mockPreparation(props);
    return <button onClick={props.close}>Close global preparation</button>;
  },
}));
jest.mock('../PagedStockConfirmationModal', () => ({
  PagedStockConfirmationModal: (props: {
    close: () => void;
    reconnect: () => void;
  }) => {
    mockConfirmation(props);
    return (
      <section aria-label="Global confirmation review">
        <button onClick={props.close}>Close global confirmation</button>
        <button onClick={props.reconnect}>Reconnect global confirmation</button>
      </section>
    );
  },
}));
expect.extend(toHaveNoViolations);
const load = jest.mocked(getInventoryTransfer),
  detail = jest.mocked(getInventoryTransferDetailPage);
const close = jest.fn(),
  reconnect = jest.fn();
function show(uid = 3) {
  return render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <InventoryTransferDetails
        uid={uid}
        transferId={11}
        close={close}
        reconnect={reconnect}
      />
    </QueryClientProvider>,
  );
}
function largeMoves(count = 101) {
  const loaded = inventoryLoad();
  loaded.transfer.move_count = count;
  load.mockResolvedValue(loaded);
  const sample = inventoryDetail('moves');
  if (sample.section !== 'moves') throw new Error('Expected move fixture');
  const rows = Array.from({ length: count }, (_, index) => ({
    ...sample.rows[0],
    id: 10000 + index * 7,
  }));
  detail.mockImplementation(
    async (_id, section, after = 0, version = false, limit = 50) => {
      if (version !== loaded.version)
        throw new Error('Expected the pinned inventory version');
      if (section === 'operations')
        return { ...inventoryDetail('operations'), ...loaded };
      const position =
        after === 0 ? 0 : rows.findIndex((row) => row.id === after) + 1;
      const page = rows.slice(position, position + limit);
      return {
        ...loaded,
        section: 'moves',
        after,
        position,
        total_count: count,
        next_after: position + page.length < count ? page.at(-1)!.id : false,
        rows: page,
      };
    },
  );
  return loaded;
}
beforeEach(() => {
  jest.clearAllMocks();
  load.mockReset().mockResolvedValue(inventoryLoad());
  detail
    .mockReset()
    .mockImplementation(async (_id, section) => inventoryDetail(section));
});
it('loads the independent transfer and both pinned sections, with shared read-only quantity and batch tables', async () => {
  show();
  expect(
    await screen.findByRole('heading', { name: 'QORLIAQA/OUT/11' }),
  ).toHaveFocus();
  expect(load).toHaveBeenCalledWith(11);
  expect(detail).toHaveBeenCalledWith(
    11,
    'moves',
    0,
    inventoryLoad().version,
    50,
  );
  expect(detail).toHaveBeenCalledWith(
    11,
    'operations',
    0,
    inventoryLoad().version,
    50,
  );
  expect(
    screen.getByRole('region', { name: 'Transfer demand and reservations' }),
  ).toHaveAttribute('tabindex', '0');
  expect(
    screen.getByRole('region', { name: 'Detailed stock operations' }),
  ).toHaveAttribute('tabindex', '0');
  expect(
    screen.queryByRole('columnheader', { name: 'Order item' }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole('button', { name: /^save|^validate|^cancel/i }),
  ).not.toBeInTheDocument();
  expect(
    screen.getByRole('button', { name: 'Review or recover confirmation' }),
  ).toBeEnabled();
  expect(await axe(document.body)).toHaveNoViolations();
});
it('opens add and existing operation forms with their real move and transfer identities', async () => {
  const moves = inventoryDetail('moves'),
    operations = inventoryDetail('operations');
  if (moves.section !== 'moves' || operations.section !== 'operations')
    throw new Error('Expected native section fixtures');
  show();
  fireEvent.click(
    await screen.findByRole('button', {
      name: `Add operation for move #${moves.rows[0].id}`,
    }),
  );
  expect(mockOperation.mock.calls.at(-1)?.[0]).toMatchObject({
    uid: 3,
    selection: {
      order_id: false,
      transfer_id: 11,
      move_id: moves.rows[0].id,
      operation_id: false,
    },
  });
  fireEvent.click(
    screen.getByRole('button', { name: 'Close global operation' }),
  );
  const row = operations.rows[0];
  fireEvent.click(
    await screen.findByRole('button', { name: `Open operation #${row.id}` }),
  );
  expect(mockOperation.mock.calls.at(-1)?.[0].selection).toEqual({
    order_id: false,
    transfer_id: 11,
    move_id: row.move_id,
    operation_id: row.id,
  });
  expect(mockConfirmation).not.toHaveBeenCalled();
  expect(mockPreparation).not.toHaveBeenCalled();
});
it('opens native validation without an order and reloads Inventory on close', async () => {
  show();
  fireEvent.click(
    await screen.findByRole('button', { name: 'Review or recover validation' }),
  );
  expect(mockValidation.mock.calls.at(-1)?.[0]).toMatchObject({
    uid: 3,
    orderId: false,
    transferId: 11,
    reconnect,
  });
  expect(mockConfirmation).not.toHaveBeenCalled();
  expect(mockPreparation).not.toHaveBeenCalled();
  fireEvent.click(
    screen.getByRole('button', { name: 'Close global validation' }),
  );
  await waitFor(() => expect(load).toHaveBeenCalledTimes(2));
  expect(
    screen.queryByRole('button', { name: 'Close global validation' }),
  ).not.toBeInTheDocument();
});
it('does not invent a move for an orphaned operation or offer new operations on completed moves', async () => {
  detail.mockImplementation(async (_id, section) => {
    const page = inventoryDetail(section);
    return page.section === 'operations'
      ? {
          ...page,
          rows: page.rows.map((row) => ({ ...row, move_id: false as const })),
        }
      : {
          ...page,
          rows: page.rows.map((row) => ({ ...row, state: 'done' as const })),
        };
  });
  show();
  expect(await screen.findByText('No linked move')).toBeInTheDocument();
  expect(
    screen.queryByRole('button', { name: /^Open operation/ }),
  ).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: /^Add operation/ })).toBeDisabled();
});
it('opens the existing confirmation consumer without an order and reloads details after close', async () => {
  show();
  const button = await screen.findByRole('button', {
    name: 'Review or recover confirmation',
  });
  fireEvent.click(button);
  expect(mockConfirmation.mock.calls.at(-1)?.[0]).toMatchObject({
    uid: 3,
    orderId: false,
    transferId: 11,
    reconnect,
  });
  expect(load).toHaveBeenCalledTimes(1);
  fireEvent.click(
    screen.getByRole('button', { name: 'Reconnect global confirmation' }),
  );
  expect(reconnect).toHaveBeenCalledTimes(1);
  fireEvent.click(
    screen.getByRole('button', { name: 'Close global confirmation' }),
  );
  await waitFor(() => expect(load).toHaveBeenCalledTimes(2));
  await screen.findByRole('button', { name: 'Review or recover confirmation' });
  expect(
    screen.queryByRole('region', { name: 'Global confirmation review' }),
  ).not.toBeInTheDocument();
});
it('opens native preparation with the same independent transfer and reloads after close', async () => {
  show();
  fireEvent.click(
    await screen.findByRole('button', {
      name: 'Prepare stock or recover request',
    }),
  );
  expect(mockPreparation.mock.calls.at(-1)?.[0]).toMatchObject({
    uid: 3,
    orderId: false,
    transferId: 11,
    reconnect,
  });
  expect(mockConfirmation).not.toHaveBeenCalled();
  fireEvent.click(
    screen.getByRole('button', { name: 'Close global preparation' }),
  );
  await waitFor(() => expect(load).toHaveBeenCalledTimes(2));
});
it('shows complete empty sections without requiring an order or inventing stock', async () => {
  const loaded = inventoryLoad();
  loaded.transfer.move_count = 0;
  loaded.transfer.operation_count = 0;
  load.mockResolvedValue(loaded);
  detail.mockImplementation(async (_id, section) => ({
    ...inventoryDetail(section),
    ...loaded,
    rows: [],
    total_count: 0,
  }));
  show();
  expect(
    await screen.findByText('No stock moves are recorded in this transfer.'),
  ).toBeInTheDocument();
  expect(
    screen.getByText('No detailed operations are recorded in this transfer.'),
  ).toBeInTheDocument();
  expect(
    screen.getByRole('button', { name: 'Next stock moves' }),
  ).toBeDisabled();
});
it('uses real native cursors in both directions and restores focus after the last page disables Next', async () => {
  largeMoves();
  show();
  await screen.findByRole('heading', { name: 'QORLIAQA/OUT/11' });
  for (const position of [100, 101]) {
    const next = screen.getByRole('button', { name: 'Next stock moves' });
    next.focus();
    fireEvent.click(next);
    await screen.findByText(new RegExp(`to ${position} of 101 stock moves`));
  }
  expect(detail).toHaveBeenCalledWith(
    11,
    'moves',
    10693,
    inventoryLoad().version,
    50,
  );
  expect(
    screen.getByRole('button', { name: 'Previous stock moves' }),
  ).toHaveFocus();
  fireEvent.click(screen.getByRole('button', { name: 'Previous stock moves' }));
  await screen.findByText(/51 to 100 of 101 stock moves/);
  expect(
    detail.mock.calls.filter((call) => call[1] === 'moves').at(-1)?.[2],
  ).toBe(10343);
});
it('hides both sections and old identifiers after a page is rejected, then focuses reload', async () => {
  largeMoves();
  show();
  await screen.findByRole('heading', { name: 'QORLIAQA/OUT/11' });
  detail.mockRejectedValue(new BillingActionRejected('Inventory changed.'));
  const next = screen.getByRole('button', { name: 'Next stock moves' });
  next.focus();
  fireEvent.click(next);
  expect(
    await screen.findByRole('alert', { name: 'Inventory detail error' }),
  ).toHaveTextContent('Inventory changed.');
  expect(
    screen.queryByRole('region', { name: 'Detailed stock operations' }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole('heading', { name: 'QORLIAQA/OUT/11' }),
  ).not.toBeInTheDocument();
  expect(
    screen.getByRole('button', { name: 'Reload inventory details' }),
  ).toHaveFocus();
});
it.each(['header', 'timezone', 'version', 'cursor'])(
  'rejects mismatched %s across sections rather than combining snapshots',
  async (kind) => {
    detail.mockImplementation(async (_id, section) => {
      const page = inventoryDetail(section);
      if (section === 'operations') {
        if (kind === 'header') page.transfer.name = 'Wrong transfer';
        if (kind === 'timezone') page.timezone = 'UTC';
        if (kind === 'version') page.version = 'e'.repeat(64);
        if (kind === 'cursor') page.position = 1;
      }
      return page;
    });
    show();
    expect(
      await screen.findByRole('alert', { name: 'Inventory detail error' }),
    ).toHaveTextContent(/do not match/);
    expect(
      screen.queryByRole('region', {
        name: 'Transfer demand and reservations',
      }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText('Wrong transfer')).not.toBeInTheDocument();
  },
);
it('reloads a fresh scope/version without calling a write or retaining stale cursors', async () => {
  show();
  await screen.findByRole('heading', { name: 'QORLIAQA/OUT/11' });
  const loaded = { ...inventoryLoad(), version: 'e'.repeat(64) };
  load.mockResolvedValue(loaded);
  detail.mockImplementation(async (_id, section) => ({
    ...inventoryDetail(section),
    ...loaded,
  }));
  fireEvent.click(
    screen.getByRole('button', { name: 'Reload inventory details' }),
  );
  await waitFor(() =>
    expect(detail).toHaveBeenCalledWith(11, 'moves', 0, loaded.version, 50),
  );
  expect(load).toHaveBeenCalledTimes(2);
  expect(close).not.toHaveBeenCalled();
});
it('keeps load rejection distinct from an empty successful transfer', async () => {
  load.mockRejectedValue(new BillingActionRejected('Stock access denied.'));
  show();
  expect(
    await screen.findByRole('alert', { name: 'Inventory detail error' }),
  ).toHaveTextContent('Stock access denied.');
  expect(detail).not.toHaveBeenCalled();
  expect(screen.queryByText(/No stock moves/)).not.toBeInTheDocument();
});
it('offers explicit reconnection on expiry and a separate return to the inventory list', async () => {
  detail.mockRejectedValue(new BillingSessionExpired());
  show();
  fireEvent.click(
    await screen.findByRole('button', { name: 'Reconnect Billing' }),
  );
  expect(reconnect).toHaveBeenCalledTimes(1);
  fireEvent.click(
    screen.getByRole('button', { name: 'Back to inventory transfers' }),
  );
  expect(close).toHaveBeenCalledTimes(1);
});
