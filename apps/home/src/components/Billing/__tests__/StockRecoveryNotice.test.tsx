import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { axe, toHaveNoViolations } from 'jest-axe';
import { StockRecoveryNotice } from '../StockRecoveryNotice';
import {
  loadStockWriteRecovery,
  type StockWriteRequest,
} from '../stockReservationRecovery';
import { request as cancellationRequest } from './stockCancellationPagedFixture';
import { confirmationRequest } from './stockConfirmationFixture';
import { request as pagedConfirmationRequest } from './stockConfirmationPagedFixture';
import { operationRequest } from './stockOperationFixture';
import { request as pagedOperationRequest } from './stockOperationPagedFixture';
import { stockRequest } from './stockReservationFixture';
import { request as preparationRequest } from './stockReservationPagedFixture';
import { returnRequest } from './stockReturnPagedFixture';
import { validationRequest } from './stockValidationFixture';
import { pagedValidationRequest } from './stockValidationPagedFixture';

jest.mock('../stockReservationRecovery', () => ({
  ...jest.requireActual('../stockReservationRecovery'),
  loadStockWriteRecovery: jest.fn(),
}));
const mockPanel = jest.fn();
const mockGlobalConfirmation = jest.fn();
const mockGlobalPreparation = jest.fn();
const mockGlobalOperation = jest.fn();
const mockGlobalValidation = jest.fn();
const mockGlobalCancellation = jest.fn();
const mockGlobalReturn = jest.fn();
const mockInventoryDetail = jest.fn();
jest.mock('../InventoryTransferDetails', () => ({
  InventoryTransferDetails: (props: { close: () => void }) => {
    mockInventoryDetail(props);
    return (
      <button onClick={props.close}>Close recovered Inventory transfer</button>
    );
  },
}));
jest.mock('../PagedStockReturnModal', () => ({
  PagedStockReturnModal: (props: {
    close: () => void;
    openTransfer: (order: false, transfer: number) => void;
  }) => {
    mockGlobalReturn(props);
    return (
      <>
        <button onClick={props.close}>Close global return</button>
        <button onClick={() => props.openTransfer(false, 19)}>
          Open created global return
        </button>
      </>
    );
  },
}));
jest.mock('../PagedStockCancellationModal', () => ({
  PagedStockCancellationModal: (props: { close: () => void }) => {
    mockGlobalCancellation(props);
    return <button onClick={props.close}>Close global cancellation</button>;
  },
}));
jest.mock('../PagedStockValidationModal', () => ({
  PagedStockValidationModal: (props: { close: () => void }) => {
    mockGlobalValidation(props);
    return <button onClick={props.close}>Close global validation</button>;
  },
}));
jest.mock('../PagedStockWriteModal', () => ({
  PagedStockWriteModal: (props: { close: () => void }) => {
    mockGlobalOperation(props);
    return <button onClick={props.close}>Close global operation</button>;
  },
}));
jest.mock('../PagedStockReservationModal', () => ({
  PagedStockReservationModal: (props: { close: () => void }) => {
    mockGlobalPreparation(props);
    return <button onClick={props.close}>Close global preparation</button>;
  },
}));
jest.mock('../PagedStockConfirmationModal', () => ({
  PagedStockConfirmationModal: (props: { close: () => void }) => {
    mockGlobalConfirmation(props);
    return <button onClick={props.close}>Close global confirmation</button>;
  },
}));
let disk: StockWriteRequest | null;
jest.mock('../OrderDeliveriesPanel', () => ({
  OrderDeliveriesPanel: (props: {
    close: () => void;
    reconnect: () => void;
  }) => {
    mockPanel(props);
    return (
      <section aria-label="Original transfer workspace">
        <button onClick={props.close}>Close saved workflow</button>
        <button
          onClick={() => {
            disk = null;
            props.close();
          }}
        >
          Finish saved workflow
        </button>
        <button onClick={props.reconnect}>Reconnect original workflow</button>
      </section>
    );
  },
}));
expect.extend(toHaveNoViolations);
const load = jest.mocked(loadStockWriteRecovery);
const reconnect = jest.fn(),
  fallback = jest.fn();
function show() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const node = (uid = 3) => (
    <QueryClientProvider client={client}>
      <StockRecoveryNotice
        uid={uid}
        reconnect={reconnect}
        focusFallback={fallback}
      />
    </QueryClientProvider>
  );
  return { ...render(node()), node, client };
}
beforeEach(() => {
  jest.clearAllMocks();
  disk = returnRequest();
  load.mockImplementation(async () => disk);
  global.fetch = jest.fn();
});
it('pins global return recovery and opens the real returned transfer without going through Sales', async () => {
  disk = { ...returnRequest(), order_id: false };
  const view = show();
  fireEvent.click(
    await screen.findByRole('button', { name: 'Open saved stock workflow' }),
  );
  expect(mockGlobalReturn.mock.calls.at(-1)![0]).toEqual(
    expect.objectContaining({ uid: 3, orderId: false, transferId: 11 }),
  );
  disk = null;
  await act(async () => {
    await view.client.invalidateQueries({
      queryKey: ['billing', 'reservation-recovery', 3],
    });
  });
  expect(
    screen.getByRole('button', { name: 'Open created global return' }),
  ).toBeInTheDocument();
  fireEvent.click(
    screen.getByRole('button', { name: 'Open created global return' }),
  );
  expect(mockInventoryDetail.mock.calls.at(-1)![0]).toEqual(
    expect.objectContaining({ uid: 3, transferId: 19 }),
  );
  fireEvent.click(
    screen.getByRole('button', { name: 'Close recovered Inventory transfer' }),
  );
  await waitFor(() => expect(fallback).toHaveBeenCalled());
  expect(mockPanel).not.toHaveBeenCalled();
  expect(fetch).not.toHaveBeenCalled();
});
it('opens a saved global confirmation directly without routing through a sales order', async () => {
  disk = { ...pagedConfirmationRequest(), order_id: false };
  show();
  const open = await screen.findByRole('button', {
    name: 'Open saved stock workflow',
  });
  expect(screen.getByText(/Transfer confirmation/)).toHaveTextContent(
    'Inventory · Transfer #11',
  );
  expect(screen.queryByText(/Order #false/)).not.toBeInTheDocument();
  fireEvent.click(open);
  expect(mockGlobalConfirmation.mock.calls.at(-1)?.[0]).toMatchObject({
    uid: 3,
    orderId: false,
    transferId: 11,
    reconnect,
  });
  expect(mockPanel).not.toHaveBeenCalled();
  fireEvent.click(
    screen.getByRole('button', { name: 'Close global confirmation' }),
  );
  await waitFor(() =>
    expect(
      screen.getByRole('button', { name: 'Open saved stock workflow' }),
    ).toHaveFocus(),
  );
  expect(disk?.order_id).toBe(false);
  expect(fetch).not.toHaveBeenCalled();
});
it('keeps the exact global workflow mounted while its cleared recovery banner refetches', async () => {
  disk = { ...pagedConfirmationRequest(), order_id: false };
  const { client } = show();
  fireEvent.click(
    await screen.findByRole('button', { name: 'Open saved stock workflow' }),
  );
  disk = null;
  await act(async () => {
    await client.invalidateQueries({
      queryKey: ['billing', 'reservation-recovery', 3],
    });
  });
  expect(
    screen.getByRole('button', { name: 'Close global confirmation' }),
  ).toBeInTheDocument();
  expect(mockGlobalConfirmation.mock.calls.at(-1)?.[0].transferId).toBe(11);
  fireEvent.click(
    screen.getByRole('button', { name: 'Close global confirmation' }),
  );
  await waitFor(() => expect(fallback).toHaveBeenCalled());
  expect(
    screen.queryByRole('button', { name: 'Close global confirmation' }),
  ).not.toBeInTheDocument();
});
it('pins a global preparation target through banner clearing and never routes it to confirmation or Sales', async () => {
  disk = { ...preparationRequest(), order_id: false };
  const { client } = show();
  fireEvent.click(
    await screen.findByRole('button', { name: 'Open saved stock workflow' }),
  );
  expect(mockGlobalPreparation.mock.calls.at(-1)?.[0]).toMatchObject({
    uid: 3,
    orderId: false,
    transferId: 11,
  });
  expect(mockGlobalConfirmation).not.toHaveBeenCalled();
  expect(mockPanel).not.toHaveBeenCalled();
  disk = null;
  await act(async () => {
    await client.invalidateQueries({
      queryKey: ['billing', 'reservation-recovery', 3],
    });
  });
  expect(
    screen.getByRole('button', { name: 'Close global preparation' }),
  ).toBeInTheDocument();
  fireEvent.click(
    screen.getByRole('button', { name: 'Close global preparation' }),
  );
  await waitFor(() => expect(fallback).toHaveBeenCalled());
});
it('opens global operation recovery directly and pins its kind through banner clearing', async () => {
  disk = { ...pagedOperationRequest(), order_id: false };
  const { client } = show();
  fireEvent.click(
    await screen.findByRole('button', { name: 'Open saved stock workflow' }),
  );
  expect(mockGlobalOperation.mock.calls.at(-1)?.[0]).toMatchObject({
    uid: 3,
    orderId: false,
    transferId: 11,
    kind: 'operation',
  });
  expect(mockPanel).not.toHaveBeenCalled();
  expect(mockGlobalConfirmation).not.toHaveBeenCalled();
  expect(mockGlobalPreparation).not.toHaveBeenCalled();
  disk = null;
  await act(async () => {
    await client.invalidateQueries({
      queryKey: ['billing', 'reservation-recovery', 3],
    });
  });
  expect(
    screen.getByRole('button', { name: 'Close global operation' }),
  ).toBeInTheDocument();
  fireEvent.click(
    screen.getByRole('button', { name: 'Close global operation' }),
  );
  await waitFor(() => expect(fallback).toHaveBeenCalled());
});
it('opens the exact global validation recovery directly and keeps its target through banner clearing', async () => {
  disk = { ...pagedValidationRequest(), order_id: false };
  const { client } = show();
  fireEvent.click(
    await screen.findByRole('button', { name: 'Open saved stock workflow' }),
  );
  expect(mockGlobalValidation.mock.calls.at(-1)?.[0]).toMatchObject({
    uid: 3,
    orderId: false,
    transferId: 11,
    reconnect,
  });
  expect(mockPanel).not.toHaveBeenCalled();
  expect(mockGlobalOperation).not.toHaveBeenCalled();
  expect(mockGlobalConfirmation).not.toHaveBeenCalled();
  expect(mockGlobalPreparation).not.toHaveBeenCalled();
  disk = null;
  await act(async () => {
    await client.invalidateQueries({
      queryKey: ['billing', 'reservation-recovery', 3],
    });
  });
  expect(
    screen.getByRole('button', { name: 'Close global validation' }),
  ).toBeInTheDocument();
  fireEvent.click(
    screen.getByRole('button', { name: 'Close global validation' }),
  );
  await waitFor(() => expect(fallback).toHaveBeenCalled());
});
const cases: [string, () => StockWriteRequest][] = [
  ['Transfer cancellation', cancellationRequest],
  ['Return creation', returnRequest],
  ['Transfer validation', validationRequest],
  ['Transfer validation', pagedValidationRequest],
  ['Detailed operation', operationRequest],
  ['Transfer confirmation', confirmationRequest],
  ['Stock preparation', stockRequest],
];
it('opens a global cancellation directly and pins it while its cleared banner refetches', async () => {
  disk = { ...cancellationRequest(), order_id: false };
  const { client } = show();
  fireEvent.click(
    await screen.findByRole('button', { name: 'Open saved stock workflow' }),
  );
  expect(mockGlobalCancellation.mock.calls.at(-1)?.[0]).toMatchObject({
    uid: 3,
    orderId: false,
    transferId: 11,
    reconnect,
  });
  expect(mockPanel).not.toHaveBeenCalled();
  expect(mockGlobalOperation).not.toHaveBeenCalled();
  expect(mockGlobalValidation).not.toHaveBeenCalled();
  expect(mockGlobalConfirmation).not.toHaveBeenCalled();
  disk = null;
  await act(async () => {
    await client.invalidateQueries({
      queryKey: ['billing', 'reservation-recovery', 3],
    });
  });
  expect(
    screen.getByRole('button', { name: 'Close global cancellation' }),
  ).toBeInTheDocument();
  fireEvent.click(
    screen.getByRole('button', { name: 'Close global cancellation' }),
  );
  await waitFor(() => expect(fallback).toHaveBeenCalled());
});
it.each(cases)(
  'recognises %s without changing its stored protocol or exposing the request key',
  async (kind, request) => {
    disk = request();
    show();
    await screen.findByRole('region', { name: 'Saved stock request' });
    expect(screen.getByText(new RegExp(kind))).toHaveTextContent(
      `Order #${disk.order_id} · Transfer #${disk.transfer_id}`,
    );
    expect(screen.queryByText(disk.request_key)).not.toBeInTheDocument();
    expect(mockPanel).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  },
);

it('opens the exact original order directly, does not submit anything, and keeps recovery when closed', async () => {
  disk = { ...returnRequest(), order_id: 42, transfer_id: 57 };
  const original = disk;
  show();
  fireEvent.click(
    await screen.findByRole('button', { name: 'Open saved stock workflow' }),
  );
  expect(mockPanel.mock.calls.at(-1)?.[0]).toMatchObject({
    uid: 3,
    orderId: 42,
    closeLabel: 'Back to Billing',
  });
  expect(fetch).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Close saved workflow' }));
  const button = await screen.findByRole('button', {
    name: 'Open saved stock workflow',
  });
  await waitFor(() => expect(button).toHaveFocus());
  expect(disk).toEqual(original);
  expect(load).toHaveBeenCalledTimes(2);
});

it('rechecks storage after resolution and restores the Billing heading instead of leaving stale recovery', async () => {
  show();
  fireEvent.click(
    await screen.findByRole('button', { name: 'Open saved stock workflow' }),
  );
  fireEvent.click(
    screen.getByRole('button', { name: 'Finish saved workflow' }),
  );
  await waitFor(() => expect(fallback).toHaveBeenCalledTimes(1));
  expect(
    screen.queryByRole('region', { name: 'Saved stock request' }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole('button', { name: 'Open saved stock workflow' }),
  ).not.toBeInTheDocument();
});

it('resets open recovery when the Billing account changes', async () => {
  const view = show();
  fireEvent.click(
    await screen.findByRole('button', { name: 'Open saved stock workflow' }),
  );
  disk = { ...returnRequest(), order_id: 70, transfer_id: 80 };
  view.rerender(view.node(4));
  await screen.findByText(/Order #70/);
  expect(
    screen.queryByRole('region', { name: 'Original transfer workspace' }),
  ).not.toBeInTheDocument();
  fireEvent.click(
    screen.getByRole('button', { name: 'Open saved stock workflow' }),
  );
  expect(mockPanel.mock.calls.at(-1)?.[0]).toMatchObject({
    uid: 4,
    orderId: 70,
  });
});

it('reports unreadable storage, never assumes no request, and retries without a native mutation', async () => {
  load.mockRejectedValueOnce(new Error('Storage blocked'));
  show();
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'They have not been cleared',
  );
  expect(
    screen.queryByRole('button', { name: 'Open saved stock workflow' }),
  ).not.toBeInTheDocument();
  fireEvent.click(
    screen.getByRole('button', { name: 'Reload saved stock requests' }),
  );
  await screen.findByRole('region', { name: 'Saved stock request' });
  await waitFor(() =>
    expect(
      screen.getByRole('button', { name: 'Open saved stock workflow' }),
    ).toHaveFocus(),
  );
  expect(fetch).not.toHaveBeenCalled();
});

it('restores focus to reload when storage remains unreadable after a fast retry', async () => {
  load.mockRejectedValue(new Error('Storage blocked'));
  show();
  await screen.findByRole('alert');
  fireEvent.click(
    screen.getByRole('button', { name: 'Reload saved stock requests' }),
  );
  await waitFor(() => expect(load).toHaveBeenCalledTimes(2));
  await waitFor(() =>
    expect(
      screen.getByRole('button', { name: 'Reload saved stock requests' }),
    ).toHaveFocus(),
  );
  expect(fallback).not.toHaveBeenCalled();
  expect(fetch).not.toHaveBeenCalled();
});

it('restores Billing focus after a successful retry finds no saved request', async () => {
  load.mockRejectedValueOnce(new Error('Storage blocked'));
  disk = null;
  show();
  await screen.findByRole('alert');
  fireEvent.click(
    screen.getByRole('button', { name: 'Reload saved stock requests' }),
  );
  await waitFor(() => expect(fallback).toHaveBeenCalledTimes(1));
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  expect(
    screen.queryByRole('region', { name: 'Saved stock request' }),
  ).not.toBeInTheDocument();
  expect(fetch).not.toHaveBeenCalled();
});

it('does not offer stale recovery while loading or when the account has no saved request', async () => {
  let resolve!: (request: StockWriteRequest | null) => void;
  load.mockImplementationOnce(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  show();
  await screen.findByText('Checking saved stock requests...');
  expect(
    screen.queryByRole('button', { name: 'Open saved stock workflow' }),
  ).not.toBeInTheDocument();
  await act(async () => resolve(null));
  await waitFor(() =>
    expect(
      screen.queryByText('Checking saved stock requests...'),
    ).not.toBeInTheDocument(),
  );
  expect(
    screen.queryByRole('region', { name: 'Saved stock request' }),
  ).not.toBeInTheDocument();
});

it('passes reconnect to the original native workspace without rewriting recovery', async () => {
  show();
  fireEvent.click(
    await screen.findByRole('button', { name: 'Open saved stock workflow' }),
  );
  fireEvent.click(
    screen.getByRole('button', { name: 'Reconnect original workflow' }),
  );
  expect(reconnect).toHaveBeenCalledTimes(1);
  expect(disk).toEqual(returnRequest());
});

it('provides a labelled, keyboard-accessible recovery notice', async () => {
  show();
  await screen.findByRole('button', { name: 'Open saved stock workflow' });
  expect(await axe(document.body)).toHaveNoViolations();
});
