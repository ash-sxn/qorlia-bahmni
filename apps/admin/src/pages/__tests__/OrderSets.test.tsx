import { randomUUID } from 'crypto';
import {
  fetchMedicationOrdersMetadata,
  del,
  get,
  getOrderTypes,
  post,
} from '@bahmni/services';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Link, MemoryRouter, Route, Routes } from 'react-router-dom';
import { queryClientConfig } from '../../config/tanstackQuery';
import { OrderSets, savePayload } from '../OrderSets';

jest.mock('@bahmni/services', () => ({
  get: jest.fn(),
  post: jest.fn(),
  del: jest.fn(),
  getOrderTypes: jest.fn(),
  fetchMedicationOrdersMetadata: jest.fn(),
  useTranslation: () => ({ t: (key: string) => key }),
}));
jest.mock('../../components/AdminLayout', () => ({
  AdminLayout: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));

const existingSet = {
  uuid: 'one',
  name: 'QorliaQA original',
  description: 'Synthetic order set',
  operator: 'ALL' as const,
  orderSetMembers: [1, 2].map((index) => ({
    uuid: `member-${index}`,
    key: `member-${index}`,
    orderType: { uuid: 'drug-type' },
    concept: { uuid: `concept-${index}`, display: `Concept ${index}` },
    orderTemplate: {
      dosingInstructions: {
        dose: 1,
        doseUnits: 'Tablet',
        frequency: 'Daily',
        route: 'Oral',
      },
      duration: 1,
      durationUnits: 'Day',
    },
  })),
};

const renderEditor = (initialEntry = '/admin/order-sets/one') => {
  const client = new QueryClient({
    defaultOptions: {
      queries: { ...queryClientConfig.defaultOptions?.queries, retry: false },
    },
  });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <Link to="/admin/order-sets/new">Open another editor</Link>
        <Routes>
          <Route path="/admin/order-sets" element={<OrderSets />} />
          <Route path="/admin/order-sets/:uuid" element={<OrderSets />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return client;
};

beforeEach(() => {
  jest.resetAllMocks();
  Object.defineProperty(crypto, 'randomUUID', {
    value: randomUUID,
    configurable: true,
  });
  jest.mocked(getOrderTypes).mockResolvedValue({
    results: [{ uuid: 'drug-type', display: 'Drug Order', conceptClasses: [] }],
  });
  jest.mocked(fetchMedicationOrdersMetadata).mockResolvedValue({
    doseUnits: [{ name: 'Tablet' }],
    frequencies: [{ name: 'Daily' }],
    routes: [{ name: 'Oral' }],
    durationUnits: [{ name: 'Day' }],
    dosingInstructions: [],
    dosingRules: [],
  } as never);
});

afterEach(() => jest.restoreAllMocks());

it('asks inside the shared modal and cancellation does not send a DELETE', async () => {
  const user = userEvent.setup();
  const nativeConfirm = jest.spyOn(window, 'confirm').mockReturnValue(false);
  jest.mocked(get).mockResolvedValue({ results: [existingSet] });
  renderEditor('/admin/order-sets');
  await user.click(
    await screen.findByRole('button', { name: 'ADMIN_ORDER_REMOVE' }),
  );
  const dialog = await screen.findByRole('dialog');
  expect(within(dialog).getByText(existingSet.name)).toBeInTheDocument();
  await user.click(
    within(dialog).getByRole('button', { name: 'ADMIN_ORDER_CANCEL' }),
  );
  expect(dialog).not.toBeVisible();
  expect(del).not.toHaveBeenCalled();
  expect(nativeConfirm).not.toHaveBeenCalled();
  expect(
    screen.getByRole('button', { name: 'ADMIN_ORDER_REMOVE' }),
  ).toHaveFocus();
  nativeConfirm.mockRestore();
});

it('retires only the confirmed UUID through the native API and refreshes the list', async () => {
  const user = userEvent.setup();
  jest.spyOn(window, 'confirm').mockReturnValue(false);
  jest
    .mocked(get)
    .mockResolvedValueOnce({ results: [existingSet] })
    .mockResolvedValueOnce({ results: [] });
  jest.mocked(del).mockResolvedValue(undefined);
  renderEditor('/admin/order-sets');
  await user.click(
    await screen.findByRole('button', { name: 'ADMIN_ORDER_REMOVE' }),
  );
  const dialog = await screen.findByRole('dialog');
  await user.click(
    within(dialog).getByRole('button', { name: /ADMIN_ORDER_REMOVE$/ }),
  );
  await screen.findByText('ADMIN_ORDER_EMPTY');
  expect(del).toHaveBeenCalledTimes(1);
  expect(del).toHaveBeenCalledWith('/openmrs/ws/rest/v1/bahmniorderset/one', {
    params: { reason: 'User deleted the orderSet.' },
  });
  expect(dialog).not.toBeVisible();
  expect(
    screen.getByRole('button', { name: 'ADMIN_ORDER_CREATE' }),
  ).toHaveFocus();
  jest.restoreAllMocks();
});

it('shows a failed retirement in the confirmation without automatic replay', async () => {
  const user = userEvent.setup();
  jest.spyOn(window, 'confirm').mockReturnValue(false);
  jest.mocked(get).mockResolvedValue({ results: [existingSet] });
  jest.mocked(del).mockRejectedValue(new Error('delete unavailable'));
  renderEditor('/admin/order-sets');
  await user.click(
    await screen.findByRole('button', { name: 'ADMIN_ORDER_REMOVE' }),
  );
  const dialog = await screen.findByRole('dialog');
  await user.click(
    within(dialog).getByRole('button', { name: /ADMIN_ORDER_REMOVE$/ }),
  );
  expect(await within(dialog).findByRole('alert')).toHaveTextContent(
    'ADMIN_ORDER_REMOVE_ERROR',
  );
  expect(del).toHaveBeenCalledTimes(1);
  expect(dialog).toBeVisible();
  jest.restoreAllMocks();
});

it('keeps a pending retirement open and disables repeat submission or cancellation', async () => {
  const user = userEvent.setup();
  let resolveDelete!: () => void;
  jest.mocked(get).mockResolvedValue({ results: [existingSet] });
  jest.mocked(del).mockImplementation(
    () =>
      new Promise<void>((resolve) => {
        resolveDelete = resolve;
      }),
  );
  renderEditor('/admin/order-sets');
  await user.click(
    await screen.findByRole('button', { name: 'ADMIN_ORDER_REMOVE' }),
  );
  const dialog = await screen.findByRole('dialog');
  await user.click(
    within(dialog).getByRole('button', { name: /ADMIN_ORDER_REMOVE$/ }),
  );
  expect(
    within(dialog).getByRole('button', { name: 'ADMIN_ORDER_CANCEL' }),
  ).toBeDisabled();
  expect(
    within(dialog).getByRole('button', { name: /ADMIN_ORDER_REMOVING/ }),
  ).toBeDisabled();
  await user.keyboard('{Escape}');
  await user.click(
    within(dialog).getByRole('button', { name: 'ADMIN_ORDER_CLOSE' }),
  );
  expect(dialog).toBeInTheDocument();
  expect(del).toHaveBeenCalledTimes(1);
  await act(async () => resolveDelete());
});

it('retries only the list GET when retirement succeeds but list refresh fails', async () => {
  const user = userEvent.setup();
  jest
    .mocked(get)
    .mockResolvedValueOnce({ results: [existingSet] })
    .mockRejectedValueOnce(new Error('list unavailable'))
    .mockResolvedValueOnce({ results: [] });
  jest.mocked(del).mockResolvedValue(undefined);
  renderEditor('/admin/order-sets');
  await user.click(
    await screen.findByRole('button', { name: 'ADMIN_ORDER_REMOVE' }),
  );
  await user.click(
    within(await screen.findByRole('dialog')).getByRole('button', {
      name: /ADMIN_ORDER_REMOVE$/,
    }),
  );
  await screen.findByText('ADMIN_ORDER_LOAD_ERROR');
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(
    screen.queryByRole('button', { name: existingSet.name }),
  ).not.toBeInTheDocument();
  await user.click(
    screen.getByRole('button', { name: 'ADMIN_ORDER_TRY_AGAIN' }),
  );
  await waitFor(() =>
    expect(
      screen.queryByText('ADMIN_ORDER_LOAD_ERROR'),
    ).not.toBeInTheDocument(),
  );
  expect(del).toHaveBeenCalledTimes(1);
  expect(get).toHaveBeenCalledTimes(3);
});

it('reloads the full native detail after updating instead of restoring the cached draft', async () => {
  const user = userEvent.setup();
  jest
    .mocked(get)
    .mockResolvedValueOnce(existingSet)
    .mockResolvedValueOnce({ ...existingSet, name: 'QorliaQA updated' });
  jest.mocked(post).mockResolvedValue({ uuid: 'one' });
  renderEditor();
  const name = await screen.findByRole('textbox', { name: 'ADMIN_ORDER_NAME' });
  await user.clear(name);
  await user.type(name, 'QorliaQA updated');
  await user.click(screen.getByRole('button', { name: 'ADMIN_ORDER_SAVE' }));
  await waitFor(() => expect(post).toHaveBeenCalledTimes(1));
  await waitFor(() =>
    expect(
      screen.getByRole('textbox', { name: 'ADMIN_ORDER_NAME' }),
    ).toHaveValue('QorliaQA updated'),
  );
  expect(get).toHaveBeenCalledTimes(2);
  expect(get).toHaveBeenLastCalledWith(
    '/openmrs/ws/rest/v1/bahmniorderset/one?v=full',
  );
});

it('refreshes the invalidated list after a save despite the app disabling mount refetches', async () => {
  const user = userEvent.setup();
  const updated = { ...existingSet, name: 'QorliaQA updated' };
  jest
    .mocked(get)
    .mockResolvedValueOnce(existingSet)
    .mockResolvedValueOnce(updated)
    .mockResolvedValueOnce({ results: [updated] });
  jest.mocked(post).mockResolvedValue({ uuid: 'one' });
  const client = renderEditor();
  client.setQueryData(['admin', 'order-sets'], { results: [existingSet] });
  const name = await screen.findByRole('textbox', { name: 'ADMIN_ORDER_NAME' });
  await user.clear(name);
  await user.type(name, updated.name);
  await user.click(screen.getByRole('button', { name: 'ADMIN_ORDER_SAVE' }));
  await waitFor(() => expect(get).toHaveBeenCalledTimes(2));
  await user.click(screen.getByRole('button', { name: 'ADMIN_ORDER_BACK' }));
  expect(
    await screen.findByRole('button', { name: updated.name }),
  ).toBeInTheDocument();
  expect(get).toHaveBeenLastCalledWith(
    '/openmrs/ws/rest/v1/bahmniorderset?v=full',
  );
});

it('does not restore old detail or replay the POST when the post-save reload fails', async () => {
  const user = userEvent.setup();
  jest
    .mocked(get)
    .mockResolvedValueOnce(existingSet)
    .mockRejectedValueOnce(new Error('read unavailable'))
    .mockResolvedValueOnce({ ...existingSet, name: 'QorliaQA updated' });
  jest.mocked(post).mockResolvedValue({ uuid: 'one' });
  renderEditor();
  const name = await screen.findByRole('textbox', { name: 'ADMIN_ORDER_NAME' });
  await user.clear(name);
  await user.type(name, 'QorliaQA updated');
  await user.click(screen.getByRole('button', { name: 'ADMIN_ORDER_SAVE' }));
  await screen.findByText('ADMIN_ORDER_LOAD_ERROR');
  expect(
    screen.queryByRole('textbox', { name: 'ADMIN_ORDER_NAME' }),
  ).not.toBeInTheDocument();
  await user.click(
    screen.getByRole('button', { name: 'ADMIN_ORDER_TRY_AGAIN' }),
  );
  expect(
    await screen.findByRole('textbox', { name: 'ADMIN_ORDER_NAME' }),
  ).toHaveValue('QorliaQA updated');
  expect(post).toHaveBeenCalledTimes(1);
});

it('keeps the draft but blocks another save while the first POST is pending', async () => {
  const user = userEvent.setup();
  let resolveSave!: (value: { uuid: string }) => void;
  jest.mocked(get).mockResolvedValue(existingSet);
  jest.mocked(post).mockImplementation(
    () =>
      new Promise((resolve) => {
        resolveSave = resolve;
      }),
  );
  renderEditor();
  await screen.findByRole('textbox', { name: 'ADMIN_ORDER_NAME' });
  await user.click(screen.getByRole('button', { name: 'ADMIN_ORDER_SAVE' }));
  expect(
    screen.getByRole('textbox', { name: 'ADMIN_ORDER_NAME' }),
  ).toBeDisabled();
  expect(
    screen.getByRole('button', { name: 'ADMIN_ORDER_CANCEL' }),
  ).toBeDisabled();
  expect(
    screen.getByRole('button', { name: 'ADMIN_ORDER_BACK' }),
  ).toBeDisabled();
  await act(async () => resolveSave({ uuid: 'one' }));
});

it('starts a new draft when the URL changes instead of editing the previous order set', async () => {
  const user = userEvent.setup();
  jest.mocked(get).mockResolvedValue(existingSet);
  renderEditor();
  await screen.findByRole('textbox', { name: 'ADMIN_ORDER_NAME' });
  await user.click(screen.getByRole('link', { name: 'Open another editor' }));
  await waitFor(() =>
    expect(
      screen.getByRole('textbox', { name: 'ADMIN_ORDER_NAME' }),
    ).toHaveValue(''),
  );
  expect(post).not.toHaveBeenCalled();
});

it('keeps unsaved input after a rejected POST and never automatically replays it', async () => {
  const user = userEvent.setup();
  jest.mocked(get).mockResolvedValue(existingSet);
  jest.mocked(post).mockRejectedValue(new Error('write unavailable'));
  renderEditor();
  const name = await screen.findByRole('textbox', { name: 'ADMIN_ORDER_NAME' });
  await user.clear(name);
  await user.type(name, 'QorliaQA unsaved');
  await user.click(screen.getByRole('button', { name: 'ADMIN_ORDER_SAVE' }));
  await screen.findByRole('alert');
  expect(screen.getByRole('textbox', { name: 'ADMIN_ORDER_NAME' })).toHaveValue(
    'QorliaQA unsaved',
  );
  expect(post).toHaveBeenCalledTimes(1);
  expect(get).toHaveBeenCalledTimes(1);
});

it('does not navigate back to an old editor after its pending save finishes', async () => {
  const user = userEvent.setup();
  let resolveSave!: (value: { uuid: string }) => void;
  jest.mocked(get).mockResolvedValue(existingSet);
  jest.mocked(post).mockImplementation(
    () =>
      new Promise((resolve) => {
        resolveSave = resolve;
      }),
  );
  renderEditor();
  await screen.findByRole('textbox', { name: 'ADMIN_ORDER_NAME' });
  await user.click(screen.getByRole('button', { name: 'ADMIN_ORDER_SAVE' }));
  await user.click(screen.getByRole('link', { name: 'Open another editor' }));
  await waitFor(() =>
    expect(
      screen.getByRole('textbox', { name: 'ADMIN_ORDER_NAME' }),
    ).toHaveValue(''),
  );
  await act(async () => resolveSave({ uuid: 'one' }));
  expect(screen.getByRole('textbox', { name: 'ADMIN_ORDER_NAME' })).toHaveValue(
    '',
  );
});

it('keeps an unsaved draft during detail-read recovery but blocks writes while the read is unavailable', async () => {
  const user = userEvent.setup();
  jest
    .mocked(get)
    .mockResolvedValueOnce(existingSet)
    .mockRejectedValueOnce(new Error('read unavailable'))
    .mockResolvedValueOnce(existingSet);
  const client = renderEditor();
  const name = await screen.findByRole('textbox', { name: 'ADMIN_ORDER_NAME' });
  await user.clear(name);
  await user.type(name, 'QorliaQA unsaved');
  await act(async () => {
    await client.invalidateQueries({
      queryKey: ['admin', 'order-set', 'one'],
      exact: true,
    });
  });
  await screen.findByText('ADMIN_ORDER_LOAD_ERROR');
  expect(screen.getByRole('textbox', { name: 'ADMIN_ORDER_NAME' })).toHaveValue(
    'QorliaQA unsaved',
  );
  expect(
    screen.getByRole('button', { name: 'ADMIN_ORDER_SAVE' }),
  ).toBeDisabled();
  await user.click(
    screen.getByRole('button', { name: 'ADMIN_ORDER_TRY_AGAIN' }),
  );
  await waitFor(() =>
    expect(
      screen.getByRole('button', { name: 'ADMIN_ORDER_SAVE' }),
    ).toBeEnabled(),
  );
  expect(screen.getByRole('textbox', { name: 'ADMIN_ORDER_NAME' })).toHaveValue(
    'QorliaQA unsaved',
  );
  expect(post).not.toHaveBeenCalled();
});

it('loads the legacy order set list through the React route', async () => {
  (get as jest.Mock).mockResolvedValue({
    results: [{ uuid: 'one', name: 'Admission' }],
  });
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/order-sets']}>
        <Routes>
          <Route path="/order-sets" element={<OrderSets />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  expect(
    await screen.findByRole('button', { name: 'Admission' }),
  ).toBeInTheDocument();
  expect(get).toHaveBeenCalledWith('/openmrs/ws/rest/v1/bahmniorderset?v=full');
});

it('preserves member order and serializes dosing templates for the Bahmni API', () => {
  const payload = savePayload({
    name: '  Admission ',
    description: '  standard  ',
    operator: 'ALL',
    orderSetMembers: [
      {
        key: 'ui-1',
        uuid: 'existing',
        orderType: { uuid: 'drug-type' },
        concept: { uuid: 'concept-1', display: 'Drug' },
        orderTemplate: {
          drug: { uuid: 'drug-1' },
          dosingInstructions: { dose: 1, doseUnits: 'Tablet' },
        },
      },
      {
        key: 'ui-2',
        orderType: { uuid: 'lab-type' },
        concept: { uuid: 'concept-2', display: 'Test' },
        orderTemplate: {},
        retired: false,
      },
    ],
  });
  expect(payload.name).toBe('Admission');
  expect(payload.description).toBe('standard');
  expect(payload.orderSetMembers[0]).toEqual(
    expect.objectContaining({
      uuid: 'existing',
      orderTemplate:
        '{"drug":{"uuid":"drug-1"},"dosingInstructions":{"dose":1,"doseUnits":"Tablet"}}',
    }),
  );
  expect(payload.orderSetMembers[1].concept.uuid).toBe('concept-2');
  expect(payload.orderSetMembers[0]).not.toHaveProperty('key');
});
