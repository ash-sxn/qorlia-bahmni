import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type {
  PagedStockReturnRequest,
  StockReturnSelection,
} from '../billingService';
import { PagedStockReturnModal } from '../PagedStockReturnModal';
import {
  loadPagedStockReturnRecovery,
  persistPagedStockReturnRecovery,
  clearPagedStockReturnRecovery,
} from '../stockReservationRecovery';
import {
  returnLoad,
  returnLine,
  returnMetadata,
  returnRequest,
  returnReview,
  returnOutcome,
  returnReferences,
  returnSelection,
} from './stockReturnPagedFixture';

// Only transport and durable storage are doubled; the screen calls the real typed SDK and validators.
jest.mock('../stockReservationRecovery', () => ({
  ...jest.requireActual('../stockReservationRecovery'),
  loadPagedStockReturnRecovery: jest.fn(),
  persistPagedStockReturnRecovery: jest.fn(),
  clearPagedStockReturnRecovery: jest.fn(),
}));
const close = jest.fn(),
  openTransfer = jest.fn();
const requests: { method: string; kwargs: Record<string, unknown> }[] = [];
let disk: PagedStockReturnRequest | null;
let badReview: boolean;
let loseSave: boolean;
function show() {
  return render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <PagedStockReturnModal
        uid={3}
        orderId={9}
        transferId={11}
        close={close}
        reconnect={jest.fn()}
        openTransfer={openTransfer}
      />
    </QueryClientProvider>,
  );
}
const click = async (name: string) => {
  const button = await screen.findByRole('button', { name });
  await waitFor(() => expect(button).toBeEnabled());
  fireEvent.click(button);
  await waitFor(() =>
    expect(
      screen.queryByText('Checking native return and exact recovery...'),
    ).not.toBeInTheDocument(),
  );
};
beforeEach(() => {
  jest.clearAllMocks();
  requests.length = 0;
  disk = null;
  badReview = false;
  loseSave = false;
  Object.defineProperty(crypto, 'randomUUID', {
    configurable: true,
    value: jest.fn(() => returnRequest().request_key),
  });
  jest
    .mocked(loadPagedStockReturnRecovery)
    .mockImplementation(async () => disk);
  jest
    .mocked(persistPagedStockReturnRecovery)
    .mockImplementation(async (_uid, exact) => {
      disk = exact;
    });
  jest.mocked(clearPagedStockReturnRecovery).mockImplementation(async () => {
    disk = null;
  });
  global.fetch = jest.fn(async (url, options) => {
    const { params } = JSON.parse(String(options?.body));
    if (
      url !==
        `/openmrs/qorlia-billing-api/web/dataset/call_kw/stock.picking/${params.method}` ||
      params.model !== 'stock.picking' ||
      JSON.stringify(params.args) !== '[]'
    )
      throw new Error('Unexpected return RPC route or model.');
    requests.push({ method: params.method, kwargs: params.kwargs });
    let result: unknown;
    switch (params.method) {
      case 'qorlia_return_paged_load':
        result = returnLoad();
        break;
      case 'qorlia_return_paged_lines':
        result = {
          ...returnSelection(),
          form: returnMetadata(),
          after: 0,
          total_count: 1,
          next_after: false,
          rows: [returnLine()],
        };
        break;
      case 'qorlia_return_paged_review': {
        const page = returnReview(
          params.kwargs.payload as StockReturnSelection,
        );
        result = badReview ? { ...page, review_complete_token: false } : page;
        break;
      }
      case 'qorlia_return_paged_save':
        if (loseSave) throw new Error('Transport response lost');
        result = returnOutcome();
        break;
      case 'qorlia_return_paged_status':
        result = returnOutcome();
        break;
      case 'qorlia_return_paged_references':
        result = returnReferences();
        break;
      default:
        throw new Error(`Unexpected endpoint ${params.method}`);
    }
    return {
      ok: true,
      status: 200,
      json: async () => ({ result }),
    } as Response;
  });
});

it('connects form, review, exact save, references and handoff through the actual SDK contracts', async () => {
  show();
  await click('Review complete return');
  await click('Create reviewed return');
  await screen.findByRole('heading', { name: 'Return creation accepted' });
  await click('Read saved return references');
  await click('Open created transfer for receipt');
  expect(requests.map((request) => request.method)).toEqual(
    ['load', 'lines', 'review', 'save', 'references', 'status'].map(
      (name) => `qorlia_return_paged_${name}`,
    ),
  );
  expect(requests[2].kwargs).toEqual({
    payload: {
      ...returnSelection(),
      location_id: 3,
      lines: [{ move_id: 12, quantity: 2 }],
    },
    after: 0,
    review_version: false,
    continuation_token: false,
    limit: 50,
  });
  expect(requests[3].kwargs).toEqual({ payload: returnRequest() });
  expect(persistPagedStockReturnRecovery).toHaveBeenCalledWith(
    3,
    returnRequest(),
  );
  expect(clearPagedStockReturnRecovery).toHaveBeenCalledWith(
    3,
    returnRequest(),
  );
  expect(openTransfer).toHaveBeenCalledWith(9, 19);
});

it('does not reach native save if the actual SDK rejects an incomplete review proof', async () => {
  badReview = true;
  show();
  await click('Review complete return');
  expect(
    await screen.findByRole('alert', { name: 'Return workflow error' }),
  ).toHaveTextContent('Incomplete native return review page or proof');
  expect(requests.map((request) => request.method)).not.toContain(
    'qorlia_return_paged_save',
  );
  expect(persistPagedStockReturnRecovery).not.toHaveBeenCalled();
});

it('recovers a lost save acknowledgement through the actual exact-status API without another save', async () => {
  loseSave = true;
  show();
  await click('Review complete return');
  await click('Create reviewed return');
  expect(
    await screen.findByRole('alert', { name: 'Return workflow error' }),
  ).toHaveTextContent('Transport response lost');
  expect(disk).toEqual(returnRequest());
  await click('Check exact return request');
  await screen.findByRole('heading', { name: 'Return creation accepted' });
  expect(
    requests.filter((request) => request.method === 'qorlia_return_paged_save'),
  ).toHaveLength(1);
  expect(requests.at(-1)).toEqual({
    method: 'qorlia_return_paged_status',
    kwargs: { payload: returnRequest() },
  });
  expect(clearPagedStockReturnRecovery).not.toHaveBeenCalled();
});
