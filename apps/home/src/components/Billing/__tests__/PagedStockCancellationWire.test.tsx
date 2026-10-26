import assert from 'node:assert/strict';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { PagedStockCancellationRequest } from '../billingService';
import { PagedStockCancellationModal } from '../PagedStockCancellationModal';
import {
  loadPagedStockCancellationRecovery,
  persistPagedStockCancellationRecovery,
  clearPagedStockCancellationRecovery,
} from '../stockReservationRecovery';
import {
  load,
  request,
  review,
  status,
  references,
} from './stockCancellationPagedFixture';

jest.mock('../stockReservationRecovery', () => ({
  ...jest.requireActual('../stockReservationRecovery'),
  loadPagedStockCancellationRecovery: jest.fn(),
  persistPagedStockCancellationRecovery: jest.fn(),
  clearPagedStockCancellationRecovery: jest.fn(),
}));
const close = jest.fn(),
  reconnect = jest.fn();
let pending: PagedStockCancellationRequest | null,
  accepted = false,
  stopped = false,
  loseSave = false,
  expireSave = false,
  corruptAcknowledgment = false;
const calls: { method: string; kwargs: Record<string, unknown> }[] = [];
function show() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <PagedStockCancellationModal
        uid={3}
        orderId={9}
        transferId={11}
        close={close}
        reconnect={reconnect}
      />
    </QueryClientProvider>,
  );
}
async function reviewAll() {
  fireEvent.click(
    await screen.findByRole('button', { name: 'Review transfer cancellation' }),
  );
  await screen.findByRole('heading', { name: 'Cancellation effect page 1' });
  for (const page of [2, 3]) {
    fireEvent.click(
      screen.getByRole('button', { name: 'Review next cancellation effects' }),
    );
    await screen.findByRole('heading', {
      name: `Cancellation effect page ${page}`,
    });
  }
}
beforeEach(() => {
  jest.resetAllMocks();
  pending = null;
  accepted = false;
  stopped = false;
  loseSave = false;
  expireSave = false;
  corruptAcknowledgment = false;
  calls.length = 0;
  jest
    .mocked(loadPagedStockCancellationRecovery)
    .mockImplementation(async () => pending);
  jest
    .mocked(persistPagedStockCancellationRecovery)
    .mockImplementation(async (_uid, exact) => {
      pending = exact;
    });
  jest
    .mocked(clearPagedStockCancellationRecovery)
    .mockImplementation(async (_uid, exact) => {
      assert.deepEqual(exact, pending);
      pending = null;
    });
  Object.defineProperty(crypto, 'randomUUID', {
    configurable: true,
    value: jest.fn(() => request().request_key),
  });
  global.fetch = jest.fn(async (route, options) => {
    const { model, method, args, kwargs } = JSON.parse(
      String(options?.body),
    ).params;
    assert.equal(
      route,
      '/openmrs/qorlia-billing-api/web/dataset/call_kw/stock.picking/' + method,
    );
    assert.equal(model, 'stock.picking');
    assert.deepEqual(args, []);
    assert.match(
      method,
      /^qorlia_cancellation_paged_(load|review|save|status|references|stop)$/,
    );
    assert(!Object.hasOwn(kwargs, 'context'));
    calls.push({ method, kwargs });
    let result: unknown;
    if (method.endsWith('_load')) result = load();
    else if (method.endsWith('_review')) {
      assert.deepEqual(kwargs.payload, {
        order_id: 9,
        transfer_id: 11,
        version: load().version,
        action: 'cancel_transfer',
      });
      result = review(kwargs.after);
    } else if (method.endsWith('_references'))
      result = references(kwargs.after, 101);
    else {
      assert.deepEqual(kwargs.payload, request());
      assert.deepEqual(pending, request());
      if (method.endsWith('_save')) {
        if (expireSave)
          return {
            ok: true,
            status: 200,
            json: async () => ({ error: { code: 100 } }),
          } as Response;
        accepted = true;
        if (loseSave) {
          loseSave = false;
          throw new Error('Cancellation response lost');
        }
      }
      if (method.endsWith('_stop') && !accepted) stopped = true;
      result = corruptAcknowledgment
        ? status('unknown')
        : status(accepted ? 'accepted' : stopped ? 'stopped' : 'unknown', 101);
    }
    return {
      ok: true,
      status: 200,
      json: async () => ({ result }),
    } as Response;
  });
});

it('connects complete review, exact durable dispatch, compact receipt and all references through the actual SDK', async () => {
  show();
  await reviewAll();
  expect(calls.map((c) => c.method)).toEqual([
    'qorlia_cancellation_paged_load',
    ...Array(3).fill('qorlia_cancellation_paged_review'),
  ]);
  fireEvent.click(
    screen.getByRole('button', { name: /Cancel reviewed transfer/ }),
  );
  await screen.findByRole('heading', { name: 'Accepted cancellation: cancel' });
  expect(pending).toEqual(request());
  fireEvent.click(
    screen.getByRole('button', { name: 'Read saved references' }),
  );
  await screen.findByRole('heading', { name: 'Saved reference page 1' });
  for (const page of [2, 3]) {
    fireEvent.click(
      screen.getByRole('button', { name: 'Next saved references' }),
    );
    await screen.findByRole('heading', {
      name: `Saved reference page ${page}`,
    });
  }
  fireEvent.click(
    screen.getByRole('button', { name: 'Finish and reload transfers' }),
  );
  await waitFor(() => expect(close).toHaveBeenCalledTimes(1));
  expect(clearPagedStockCancellationRecovery).toHaveBeenCalledWith(
    3,
    request(),
    'e'.repeat(64),
  );
  expect(calls.filter((c) => c.method.endsWith('_save'))).toHaveLength(1);
  expect(pending).toBeNull();
});
it('recovers an accepted lost-response cancellation after remount without a second native save', async () => {
  loseSave = true;
  const first = show();
  await reviewAll();
  fireEvent.click(
    screen.getByRole('button', { name: /Cancel reviewed transfer/ }),
  );
  await screen.findByText('Cancellation response lost');
  first.unmount();
  show();
  await screen.findByRole('heading', { name: 'Accepted cancellation: cancel' });
  expect(calls.filter((c) => c.method.endsWith('_save'))).toHaveLength(1);
  expect(calls.filter((c) => c.method.endsWith('_load'))).toHaveLength(1);
  expect(calls.filter((c) => c.method.endsWith('_status'))).toHaveLength(1);
  expect(crypto.randomUUID).toHaveBeenCalledTimes(1);
  expect(clearPagedStockCancellationRecovery).not.toHaveBeenCalled();
  expect(pending).toEqual(request());
});
it('does not infer acceptance from malformed native acknowledgment and stops only the original pending request', async () => {
  corruptAcknowledgment = true;
  const first = show();
  await reviewAll();
  fireEvent.click(
    screen.getByRole('button', { name: /Cancel reviewed transfer/ }),
  );
  await screen.findByText(/outcome is not acknowledged/);
  expect(clearPagedStockCancellationRecovery).not.toHaveBeenCalled();
  expect(pending).toEqual(request());
  first.unmount();
  corruptAcknowledgment = false;
  accepted = false;
  show();
  fireEvent.click(
    await screen.findByRole('button', {
      name: 'Stop pending cancellation request',
    }),
  );
  expect(calls.filter((c) => c.method.endsWith('_stop'))).toHaveLength(0);
  fireEvent.click(
    screen.getByRole('button', { name: /Confirm stop pending request/ }),
  );
  await waitFor(() => expect(close).toHaveBeenCalledTimes(1));
  expect(calls.filter((c) => c.method.endsWith('_stop'))).toEqual([
    {
      method: 'qorlia_cancellation_paged_stop',
      kwargs: { payload: request() },
    },
  ]);
  expect(calls.filter((c) => c.method.endsWith('_save'))).toHaveLength(1);
  expect(pending).toBeNull();
});
it('keeps native session expiry recoverable without dropping the completion proof or issuing another save', async () => {
  expireSave = true;
  show();
  await reviewAll();
  fireEvent.click(
    screen.getByRole('button', { name: /Cancel reviewed transfer/ }),
  );
  fireEvent.click(
    await screen.findByRole('button', { name: 'Reconnect Billing' }),
  );
  expect(reconnect).toHaveBeenCalledTimes(1);
  expect(pending).toEqual(request());
  expect(
    screen.getByRole('button', {
      name: /Retry identical cancellation request/,
    }),
  ).toBeDisabled();
  expect(clearPagedStockCancellationRecovery).not.toHaveBeenCalled();
  expect(calls.filter((c) => c.method.endsWith('_save'))).toHaveLength(1);
});
