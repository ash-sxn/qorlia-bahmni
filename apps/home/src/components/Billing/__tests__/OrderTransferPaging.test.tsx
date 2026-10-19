import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import {
  BillingActionRejected,
  BillingSessionExpired,
  getOrderDeliveries,
  getOrderDeliveryPage,
  getOrderTransferDetailPage,
  type OrderDeliveryPage,
  type OrderTransferDetailPage,
} from '../billingService';
import { OrderDeliveriesPanel } from '../OrderDeliveriesPanel';
import { loadStockWriteRecovery } from '../stockReservationRecovery';
import {
  orderDeliveryFixture,
  orderDeliveryPageFixture,
  orderTransferDetailPageFixture,
} from './orderDeliveryFixture';

jest.mock('../billingService', () => ({
  ...jest.requireActual('../billingService'),
  getOrderDeliveries: jest.fn(),
  getOrderDeliveryPage: jest.fn(),
  getOrderTransferDetailPage: jest.fn(),
}));
jest.mock('../stockReservationRecovery', () => ({
  ...jest.requireActual('../stockReservationRecovery'),
  loadStockWriteRecovery: jest.fn(),
}));
const mockOperation = jest.fn();
jest.mock('../StockOperationEditor', () => ({
  StockOperationEditor: (props: { close: () => void }) => {
    mockOperation(props);
    return <button onClick={props.close}>Return from operation</button>;
  },
}));
const get = jest.mocked(getOrderDeliveryPage),
  details = jest.mocked(getOrderTransferDetailPage);
let fixture = orderDeliveryFixture();
const reconnect = jest.fn();
const close = jest.fn();
const show = (
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } }),
) => {
  const panel = (uid: number, orderId: number) => (
    <QueryClientProvider client={client}>
      <OrderDeliveriesPanel
        uid={uid}
        orderId={orderId}
        close={close}
        reconnect={reconnect}
      />
    </QueryClientProvider>
  );
  const view = render(panel(3, 9));
  return {
    ...view,
    changeIdentity: (uid: number, orderId: number) =>
      view.rerender(panel(uid, orderId)),
  };
};
const open = async (name = 'QORLIAQA/OUT/11') => {
  fireEvent.click(
    await screen.findByRole('button', { name: `View transfer ${name}` }),
  );
  await screen.findByRole('table', {
    name: /Demand and reservation quantities/,
  });
};
function manyTransfers() {
  const base = orderDeliveryFixture().rows[0];
  fixture.rows = Array.from({ length: 101 }, (_, index) => ({
    ...base,
    id: 1001 + index,
    name: `QORLIAQA/OUT/${1001 + index}`,
    moves: [{ ...base.moves[0], id: 2001 + index }],
    operations: [
      { ...base.operations[0], id: 3001 + index, move_id: 2001 + index },
    ],
  }));
}
function largeDetails(moveCount: number, operationCount: number) {
  const base = fixture.rows[0];
  base.moves = Array.from({ length: moveCount }, (_, index) => ({
    ...base.moves[0],
    id: 20001 + index,
    order_line: [60001 + index, `QA Order item ${index + 1}`],
  }));
  base.operations = Array.from({ length: operationCount }, (_, index) => ({
    ...base.operations[0],
    id: 40001 + index,
    move_id: 20001 + (index % Math.max(1, moveCount)),
    lot: [70001 + index, `QA Batch ${index + 1}`],
  }));
}
const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
};

describe('Native transfer summary and detail paging consumers', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    fixture = orderDeliveryFixture();
    jest.mocked(loadStockWriteRecovery).mockReset().mockResolvedValue(null);
    get
      .mockReset()
      .mockImplementation(
        async (order, after = 0, version = false, limit = 25) => {
          if (
            order !== fixture.order_id ||
            (version !== false && version !== fixture.version)
          )
            throw new BillingActionRejected('Native snapshot changed.');
          return orderDeliveryPageFixture(fixture, after, limit);
        },
      );
    details
      .mockReset()
      .mockImplementation(
        async (order, id, section, after = 0, version, limit = 50) => {
          if (order !== fixture.order_id || version !== fixture.version)
            throw new BillingActionRejected('Native snapshot changed.');
          return orderTransferDetailPageFixture(
            section,
            fixture,
            id,
            after,
            limit,
          );
        },
      );
  });

  it('traverses all 101 transfer summaries using native identity cursors and keeps the final button focused', async () => {
    manyTransfers();
    show();
    await screen.findByText('Showing 25 of 101 transfers.');
    for (const count of [50, 75, 100, 101]) {
      const button = screen.getByRole('button', {
        name: 'Load more transfers',
      });
      button.focus();
      fireEvent.click(button);
      await screen.findByText(`Showing ${count} of 101 transfers.`);
    }
    expect(get.mock.calls.map((call) => call.slice(1))).toEqual([
      [0, false, 25],
      [1025, fixture.version, 25],
      [1050, fixture.version, 25],
      [1075, fixture.version, 25],
      [1100, fixture.version, 25],
    ]);
    expect(
      screen.queryByRole('button', { name: 'Load more transfers' }),
    ).not.toBeInTheDocument();
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'View transfer QORLIAQA/OUT/1101' }),
      ).toHaveFocus(),
    );
    expect(getOrderDeliveries).not.toHaveBeenCalled();
  });

  it('reloads an off-page selection after a saved operation without inventing an unlinked transfer', async () => {
    manyTransfers();
    show();
    await screen.findByText('Showing 25 of 101 transfers.');
    for (const count of [50, 75, 100, 101]) {
      fireEvent.click(
        screen.getByRole('button', { name: 'Load more transfers' }),
      );
      await screen.findByText(`Showing ${count} of 101 transfers.`);
    }
    await open('QORLIAQA/OUT/1101');
    fireEvent.click(
      screen.getByRole('button', { name: 'Edit operation #3101' }),
    );
    expect(mockOperation.mock.calls.at(-1)?.[0]).toMatchObject({
      selection: {
        order_id: 9,
        transfer_id: 1101,
        move_id: 2101,
        operation_id: 3101,
      },
    });
    fixture.version = 'b'.repeat(64);
    fixture.rows[100].operations[0].done = 2;
    fireEvent.click(
      screen.getByRole('button', { name: 'Return from operation' }),
    );
    const operations = await screen.findByRole('table', {
      name: /Detailed operations, quantities/,
    });
    expect(within(operations).getByText('2')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'QORLIAQA/OUT/1101' }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/no longer linked/)).not.toBeInTheDocument();
    expect(get.mock.calls.at(-1)).toEqual([9, 0, false, 25]);
    expect(
      details.mock.calls.slice(-2).map((call) => [call[1], call[3], call[4]]),
    ).toEqual([
      [1101, 0, fixture.version],
      [1101, 0, fixture.version],
    ]);
    expect(
      screen.getByRole('button', { name: 'Back to order details' }),
    ).toHaveFocus();
  });

  it('reads every one of 501 moves and 2001 operations without an unbounded rendered table', async () => {
    largeDetails(501, 2001);
    show();
    await open();
    expect(
      screen.getByRole('status', { name: 'Stock move page' }),
    ).toHaveTextContent('Stock moves: 1 to 50 of 501.');
    for (let page = 1; page <= 10; page++) {
      fireEvent.click(screen.getByRole('button', { name: 'Next stock moves' }));
      const start = page * 50 + 1,
        end = Math.min((page + 1) * 50, 501);
      await waitFor(() =>
        expect(
          screen.getByRole('status', { name: 'Stock move page' }),
        ).toHaveTextContent(`Stock moves: ${start} to ${end} of 501.`),
      );
      expect(
        within(
          screen.getByRole('table', {
            name: /Demand and reservation quantities/,
          }),
        ).getAllByRole('row').length,
      ).toBeLessThanOrEqual(51);
    }
    expect(screen.getByText('QA Order item 501')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Next stock moves' }),
    ).toBeDisabled();
    expect(screen.queryByText('QA Order item 1')).not.toBeInTheDocument();
    for (let page = 1; page <= 40; page++) {
      const button = screen.getByRole('button', {
        name: 'Next detailed operations',
      });
      if (page === 40) button.focus();
      fireEvent.click(button);
      const start = page * 50 + 1,
        end = Math.min((page + 1) * 50, 2001);
      await waitFor(() =>
        expect(
          screen.getByRole('status', { name: 'Detailed operation page' }),
        ).toHaveTextContent(`Detailed operations: ${start} to ${end} of 2001.`),
      );
      expect(
        within(
          screen.getByRole('table', {
            name: /Detailed operations, quantities/,
          }),
        ).getAllByRole('row').length,
      ).toBeLessThanOrEqual(51);
    }
    expect(screen.getByText('QA Batch 2001')).toBeInTheDocument();
    expect(screen.queryByText('QA Batch 1')).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Next detailed operations' }),
    ).toBeDisabled();
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Previous detailed operations' }),
      ).toHaveFocus(),
    );
    expect(
      details.mock.calls.every(
        (call) => call[4] === fixture.version && call[5] === 50,
      ),
    ).toBe(true);
    expect(
      details.mock.calls
        .filter((call) => call[2] === 'moves')
        .map((call) => call[3]),
    ).toEqual([
      0,
      ...Array.from({ length: 10 }, (_, index) => 20050 + index * 50),
    ]);
    expect(
      details.mock.calls
        .filter((call) => call[2] === 'operations')
        .map((call) => call[3]),
    ).toEqual([
      0,
      ...Array.from({ length: 40 }, (_, index) => 40050 + index * 50),
    ]);
    expect(
      screen.getByText(
        /Confirmation and preparation use complete paged review/,
      ),
    ).toBeInTheDocument();
    for (const name of ['Review transfer validation', 'Edit operation #42001'])
      expect(screen.getByRole('button', { name })).toBeDisabled();
    expect(
      screen.getByRole('button', { name: 'Review transfer confirmation' }),
    ).toBeEnabled();
    expect(
      screen.getByRole('button', { name: 'Review stock preparation' }),
    ).toBeEnabled();
    expect(mockOperation).not.toHaveBeenCalled();
  }, 30000);

  it('navigates backward using earlier native cursors rather than subtracting row IDs', async () => {
    largeDetails(101, 1);
    show();
    await open();
    for (const end of [100, 101]) {
      fireEvent.click(screen.getByRole('button', { name: 'Next stock moves' }));
      await waitFor(() =>
        expect(
          screen.getByRole('status', { name: 'Stock move page' }),
        ).toHaveTextContent(`to ${end} of 101.`),
      );
    }
    fireEvent.click(
      screen.getByRole('button', { name: 'Previous stock moves' }),
    );
    await waitFor(() =>
      expect(
        screen.getByRole('status', { name: 'Stock move page' }),
      ).toHaveTextContent('Stock moves: 51 to 100 of 101.'),
    );
    expect(details.mock.calls.at(-1)?.slice(2)).toEqual([
      'moves',
      20050,
      fixture.version,
      50,
    ]);
    fireEvent.click(
      screen.getByRole('button', { name: 'Previous stock moves' }),
    );
    await waitFor(() =>
      expect(
        screen.getByRole('status', { name: 'Stock move page' }),
      ).toHaveTextContent('Stock moves: 1 to 50 of 101.'),
    );
    expect(
      screen.getByRole('button', { name: 'Previous stock moves' }),
    ).toBeDisabled();
  });

  it('edits an operation by its own linked move even when that move is on another page', async () => {
    largeDetails(51, 1);
    fixture.rows[0].operations[0].move_id = 20051;
    show();
    await open();
    expect(screen.queryByText('QA Order item 51')).not.toBeInTheDocument();
    fireEvent.click(
      screen.getByRole('button', { name: 'Edit operation #40001' }),
    );
    expect(mockOperation.mock.calls.at(-1)?.[0]).toMatchObject({
      selection: {
        order_id: 9,
        transfer_id: 11,
        move_id: 20051,
        operation_id: 40001,
      },
    });
  });

  it.each<[string, (page: OrderDeliveryPage) => void]>([
    [
      'version',
      (page) => {
        page.version = 'b'.repeat(64);
      },
    ],
    [
      'position',
      (page) => {
        page.position--;
      },
    ],
    [
      'count',
      (page) => {
        page.total_count++;
      },
    ],
    [
      'order',
      (page) => {
        page.order_id++;
      },
    ],
    [
      'name',
      (page) => {
        page.order_name = 'Another order';
      },
    ],
    [
      'state',
      (page) => {
        page.order_state = 'draft';
      },
    ],
    [
      'duplicate identity',
      (page) => {
        page.rows[0].id = 1001;
      },
    ],
  ])(
    'hides all summaries if a later page changes %s, then reloads from page zero',
    async (_field, change) => {
      manyTransfers();
      show();
      await screen.findByText('Showing 25 of 101 transfers.');
      const bad = orderDeliveryPageFixture(fixture, 1025);
      change(bad);
      get.mockResolvedValueOnce(bad);
      fireEvent.click(
        screen.getByRole('button', { name: 'Load more transfers' }),
      );
      await screen.findByRole('alert');
      expect(screen.queryByRole('table')).not.toBeInTheDocument();
      expect(
        screen.queryByText('Showing 25 of 101 transfers.'),
      ).not.toBeInTheDocument();
      fireEvent.click(
        screen.getByRole('button', { name: 'Refresh transfers' }),
      );
      await screen.findByText('Showing 25 of 101 transfers.');
      expect(get.mock.calls.at(-1)).toEqual([9, 0, false, 25]);
    },
  );

  it('hides both detail sections on stale continuation and resets their cursors to the new snapshot', async () => {
    largeDetails(51, 51);
    show();
    await open();
    details.mockRejectedValueOnce(
      new BillingActionRejected('Native stock changed.'),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Next stock moves' }));
    await screen.findByText(/Native stock changed/);
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    fixture.version = 'b'.repeat(64);
    fireEvent.click(
      screen.getByRole('button', { name: 'Reload transfer details' }),
    );
    await screen.findByRole('table', {
      name: /Demand and reservation quantities/,
    });
    expect(
      screen.getByRole('status', { name: 'Stock move page' }),
    ).toHaveTextContent('Stock moves: 1 to 50 of 51.');
    expect(
      screen.getByRole('status', { name: 'Detailed operation page' }),
    ).toHaveTextContent('Detailed operations: 1 to 50 of 51.');
    expect(
      details.mock.calls.slice(-2).map((call) => [call[3], call[4]]),
    ).toEqual([
      [0, fixture.version],
      [0, fixture.version],
    ]);
  });

  it.each<[string, (page: OrderTransferDetailPage) => void]>([
    [
      'section',
      (page) => {
        page.section = 'moves';
      },
    ],
    [
      'cursor position',
      (page) => {
        page.position = 1;
      },
    ],
    [
      'transfer header',
      (page) => {
        page.transfer.name = 'Another transfer';
      },
    ],
    [
      'root snapshot',
      (page) => {
        page.version = 'b'.repeat(64);
      },
    ],
  ])(
    'rejects incoherent operation %s rather than mixing details',
    async (_field, change) => {
      details.mockImplementation(async (_order, id, section) => {
        const page = orderTransferDetailPageFixture(section, fixture, id);
        if (section === 'operations') change(page);
        return page;
      });
      show();
      fireEvent.click(
        await screen.findByRole('button', {
          name: 'View transfer QORLIAQA/OUT/11',
        }),
      );
      await screen.findByRole('alert');
      expect(screen.queryByRole('table')).not.toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: 'Review stock preparation' }),
      ).not.toBeInTheDocument();
    },
  );

  it('starts both section requests independently and ignores an old response after refresh', async () => {
    const old = orderTransferDetailPageFixture('moves');
    const waiting = deferred<OrderTransferDetailPage>();
    details.mockImplementationOnce(() => waiting.promise);
    show();
    fireEvent.click(
      await screen.findByRole('button', {
        name: 'View transfer QORLIAQA/OUT/11',
      }),
    );
    await waitFor(() => expect(details).toHaveBeenCalledTimes(2));
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    fixture.version = 'b'.repeat(64);
    fixture.rows[0].moves[0].product = [5, 'QorliaQA Fresh medicine'];
    fixture.rows[0].operations[0].product = [5, 'QorliaQA Fresh medicine'];
    fireEvent.click(screen.getByRole('button', { name: 'Refresh transfers' }));
    await screen.findByRole('table', {
      name: /Demand and reservation quantities/,
    });
    await act(async () => {
      waiting.resolve(old);
    });
    expect(screen.queryByText('QA Medicine')).not.toBeInTheDocument();
    expect(screen.getAllByText('QorliaQA Fresh medicine')).toHaveLength(2);
  });

  it('offers reconnect when a detail session expires and never shows cached rows', async () => {
    details.mockRejectedValueOnce(new BillingSessionExpired());
    show();
    fireEvent.click(
      await screen.findByRole('button', {
        name: 'View transfer QORLIAQA/OUT/11',
      }),
    );
    fireEvent.click(
      await screen.findByRole('button', { name: 'Reconnect Billing' }),
    );
    expect(reconnect).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('does not reuse the old full-list cache shape', async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    client.setQueryData(['billing', 'order-deliveries', 3, 9], {
      ...fixture,
      order_name: 'QorliaQA Legacy cache',
    });
    show(client);
    await screen.findByRole('table');
    expect(screen.queryByText('QorliaQA Legacy cache')).not.toBeInTheDocument();
    expect(getOrderDeliveries).not.toHaveBeenCalled();
  });

  it('resets selected details and open write views across account/order identities', async () => {
    const view = show();
    await open();
    fireEvent.click(screen.getByRole('button', { name: 'Edit operation #13' }));
    expect(
      screen.getByRole('button', { name: 'Return from operation' }),
    ).toBeInTheDocument();
    fixture = {
      ...orderDeliveryFixture(),
      order_id: 10,
      order_name: 'QorliaQA Other account order',
      rows: [],
    };
    view.changeIdentity(4, 10);
    await screen.findByText(/No stock transfers are linked/);
    expect(
      screen.queryByRole('button', { name: 'Return from operation' }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(screen.queryByText('QORLIAQA-ORDER')).not.toBeInTheDocument();
    expect(get.mock.calls.at(-1)).toEqual([10, 0, false, 25]);
  });
});
