import assert from 'node:assert/strict';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { axe } from 'jest-axe';
import { StrictMode } from 'react';
import type {
  InventoryDraftSeed,
  InventoryHeaderEdit,
} from '../billingService';
import { InventoryDraftEditor } from '../InventoryDraftEditor';
import {
  inventoryDraftForm,
  inventoryFormChoices,
} from './inventoryFormFixture';

const close = jest.fn(),
  reconnect = jest.fn(),
  openTransfer = jest.fn(),
  returnFocus = jest.fn();
function fresh() {
  const draft = inventoryDraftForm();
  for (const [name, type, value] of [
    ['origin', 'char', 'QorliaQA native default'],
    ['scheduled_date', 'datetime', '2026-10-24 11:22:33'],
    ['immediate_transfer', 'boolean', false],
  ] as const) {
    draft.form.fields[name] = { type, string: name };
    draft.form.layout.push({ ...draft.form.layout[2], field: name });
    draft.form.values[name] = value;
    const payload = JSON.parse(draft.seed.payload);
    payload.values[name] = value;
    draft.seed.payload = JSON.stringify(payload);
  }
  return draft;
}
let draft = fresh();
let failure: 'load' | 'onchange' | 'choices' | null;
let corrupt = false,
  readonlyOrigin = false,
  hideOrigin = false;
let delayed: Promise<Response> | null;
const calls: { method: string; kwargs: Record<string, unknown> }[] = [];
const response = (result: unknown) =>
  ({ ok: true, status: 200, json: async () => ({ result }) }) as Response;
const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value));
function edited(seed: InventoryDraftSeed, edits: InventoryHeaderEdit[]) {
  const result = clone(draft);
  result.seed = clone(seed);
  result.version = seed.version;
  result.edits = clone(edits);
  result.form.version = 'd'.repeat(64);
  for (const edit of edits) {
    const name = result.form.layout[edit.node].field;
    result.form.values[name] = edit.value;
    if (name === 'partner_id')
      result.form.labels[name] = [Number(edit.value), 'QorliaQA Other contact'];
  }
  if (readonlyOrigin) result.form.layout[4].rules.readonly = true;
  if (hideOrigin) result.form.layout[4].rules.visible = false;
  if (readonlyOrigin || hideOrigin)
    result.form.warning = {
      title: 'Native warning',
      message: 'QorliaQA Contact rules changed',
    };
  return result;
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((yes) => {
    resolve = yes;
  });
  return { promise, resolve };
}
function show(strict = false) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const panel = (uid: number) => (
    <QueryClientProvider client={client}>
      <InventoryDraftEditor
        uid={uid}
        close={close}
        reconnect={reconnect}
        openTransfer={openTransfer}
        returnFocus={returnFocus}
      />
    </QueryClientProvider>
  );
  const view = render(strict ? <StrictMode>{panel(3)}</StrictMode> : panel(3));
  return {
    ...view,
    client,
    identity: (uid: number) => view.rerender(panel(uid)),
  };
}
async function edit(name = 'Note', value = 'QorliaQA edited note') {
  const input = await screen.findByRole('textbox', { name });
  fireEvent.change(input, { target: { value } });
  fireEvent.blur(input);
  await waitFor(() =>
    expect(calls.some((call) => call.method.endsWith('onchange'))).toBe(true),
  );
  await waitFor(() =>
    expect(
      screen.getByRole('region', { name: 'Native new-transfer form' }),
    ).toHaveAttribute('aria-busy', 'false'),
  );
}
beforeAll(() =>
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
    configurable: true,
    value: jest.fn(),
  }),
);
beforeEach(() => {
  jest.clearAllMocks();
  draft = fresh();
  failure = null;
  corrupt = false;
  readonlyOrigin = false;
  hideOrigin = false;
  delayed = null;
  calls.length = 0;
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
    assert.match(method, /^qorlia_inventory_draft_(load|onchange|choices)$/);
    assert(!Object.hasOwn(kwargs, 'context'));
    assert(!Object.hasOwn(kwargs, 'order_id'));
    calls.push({ method, kwargs: clone(kwargs) });
    if (method.endsWith(failure ?? 'never'))
      return {
        ok: true,
        status: 200,
        json: async () => ({ error: { code: 100 } }),
      } as Response;
    if (method.endsWith('load')) {
      assert.deepEqual(kwargs, { picking_type_id: false });
      return response(clone(draft));
    }
    assert.deepEqual(kwargs.seed, draft.seed);
    const current = edited(kwargs.seed, kwargs.edits);
    if (method.endsWith('onchange')) {
      if (delayed) return delayed;
      if (corrupt) current.seed.signature = 'e'.repeat(64);
      return response(current);
    }
    const offset = kwargs.offset as number;
    return response({
      version: draft.version,
      edits: kwargs.edits,
      page: {
        ...inventoryFormChoices(),
        form_version: current.form.version,
        node: kwargs.node,
        offset,
        rows: Array.from({ length: offset === 0 ? 25 : 1 }, (_, i) => [
          8 + offset + i,
          `QorliaQA Contact ${8 + offset + i}`,
        ]),
        has_more: offset === 0,
      },
    });
  });
});

it('loads signed defaults once and offers no working create/save operation', async () => {
  const view = show(true);
  expect(await screen.findByRole('textbox', { name: 'origin' })).toHaveValue(
    'QorliaQA native default',
  );
  expect(screen.getByLabelText('scheduled_date (Asia/Kolkata)')).toHaveValue(
    '2026-10-24T16:52:33.000',
  );
  expect(
    screen.getByRole('button', { name: 'Create transfer (not integrated)' }),
  ).toBeDisabled();
  expect(calls.map((call) => call.method)).toEqual([
    'qorlia_inventory_draft_load',
  ]);
  expect(
    screen.getByText(/direct collection editing is not available/),
  ).toBeInTheDocument();
  expect((await axe(view.baseElement)).violations).toEqual([]);
});
it('preserves the original signed seed and ordered edits through actual SDK requests', async () => {
  const original = clone(draft.seed);
  show();
  await edit();
  await edit('origin', 'QorliaQA second edit');
  expect(calls.at(-1)).toEqual({
    method: 'qorlia_inventory_draft_onchange',
    kwargs: {
      seed: original,
      edits: [
        { node: 2, value: 'QorliaQA edited note' },
        { node: 4, value: 'QorliaQA second edit' },
      ],
    },
  });
  expect(screen.getByRole('textbox', { name: 'Note' })).toHaveValue(
    'QorliaQA edited note',
  );
  expect(draft.seed).toEqual(original);
  expect(calls.filter((call) => call.method.endsWith('load'))).toHaveLength(1);
});
it('converts draft account-local dates back to native UTC through onchange', async () => {
  show();
  const date = await screen.findByLabelText('scheduled_date (Asia/Kolkata)');
  fireEvent.change(date, { target: { value: '2026-10-24T17:22:33' } });
  fireEvent.blur(date);
  await waitFor(() =>
    expect(calls.at(-1)?.kwargs).toEqual({
      seed: draft.seed,
      edits: [{ node: 5, value: '2026-10-24 11:52:33' }],
    }),
  );
  await waitFor(() => expect(date).toHaveValue('2026-10-24T17:22:33.000'));
});
it('does not commit or refetch defaults on unchanged blur, focus or reconnect events', async () => {
  show();
  const origin = await screen.findByRole('textbox', { name: 'origin' });
  fireEvent.blur(origin);
  fireEvent(window, new Event('focus'));
  fireEvent(window, new Event('online'));
  await act(async () => {});
  expect(calls).toHaveLength(1);
});
it('does not replace the pinned defaults when another Billing workflow invalidates its cache', async () => {
  const view = show();
  await edit();
  const original = clone(draft.seed);
  draft.seed.signature = 'f'.repeat(64);
  draft.seed.payload = draft.seed.payload.replace(
    'native default',
    'changed server default',
  );
  draft.form.values.origin = 'QorliaQA changed server default';
  await act(async () => {
    await view.client.invalidateQueries({ queryKey: ['billing'] });
  });
  expect(calls.filter((call) => call.method.endsWith('load'))).toHaveLength(1);
  expect(screen.getByRole('textbox', { name: 'origin' })).toHaveValue(
    'QorliaQA native default',
  );
  expect(screen.getByRole('textbox', { name: 'Note' })).toHaveValue(
    'QorliaQA edited note',
  );
  expect(
    calls.find((call) => call.method.endsWith('onchange'))?.kwargs.seed,
  ).toEqual(original);
});
it('uses draft relation search, debounces text, pages choices and only applies an explicit returned ID', async () => {
  show();
  await screen.findByRole('textbox', { name: 'origin' });
  const contact = screen.getByRole('combobox', { name: 'Contact' });
  fireEvent.focus(contact);
  await waitFor(() =>
    expect(calls.at(-1)?.kwargs).toEqual({
      seed: draft.seed,
      edits: [],
      node: 3,
      search: '',
      offset: 0,
    }),
  );
  fireEvent.change(contact, { target: { value: 'Other' } });
  expect(calls.some((call) => call.method.endsWith('onchange'))).toBe(false);
  await waitFor(() => expect(calls.at(-1)?.kwargs.search).toBe('Other'));
  fireEvent.click(
    await screen.findByRole('button', { name: 'More contact choices' }),
  );
  await waitFor(() => expect(calls.at(-1)?.kwargs.offset).toBe(25));
  fireEvent.keyDown(contact, { key: 'ArrowDown' });
  fireEvent.click(
    await screen.findByRole('option', { name: 'QorliaQA Contact 33' }),
  );
  await waitFor(() =>
    expect(calls.at(-1)?.kwargs.edits).toEqual([{ node: 3, value: 33 }]),
  );
  expect(calls.at(-1)?.method).toBe('qorlia_inventory_draft_onchange');
  expect(calls.at(-1)?.kwargs.seed).toEqual(draft.seed);
});
it('keeps another unapplied input after a native onchange response', async () => {
  show();
  const note = await screen.findByRole('textbox', { name: 'Note' });
  const origin = screen.getByRole('textbox', { name: 'origin' });
  fireEvent.change(note, { target: { value: 'QorliaQA accepted edit' } });
  fireEvent.change(origin, { target: { value: 'QorliaQA pending edit' } });
  fireEvent.blur(note);
  await waitFor(() =>
    expect(
      screen.getByRole('region', { name: 'Native new-transfer form' }),
    ).toHaveAttribute('aria-busy', 'false'),
  );
  expect(origin).toHaveValue('QorliaQA pending edit');
  expect(
    screen.getByText(/Some input has not passed native onchange/),
  ).toBeInTheDocument();
});
it.each(['close', 'reload', 'reconnect'] as const)(
  'protects dirty edits before %s and permits only explicit discard',
  async (target) => {
    show();
    await edit();
    if (target === 'reconnect') {
      failure = 'onchange';
      await edit('origin', 'QorliaQA expired input');
    }
    const button =
      target === 'close'
        ? 'Close new-transfer form'
        : target === 'reload'
          ? 'Reload native defaults'
          : 'Reconnect Billing';
    const previous = calls.length;
    fireEvent.click(screen.getByRole('button', { name: button }));
    expect(
      screen.getByText('Discard unsaved new-transfer changes?'),
    ).toHaveFocus();
    expect(close).not.toHaveBeenCalled();
    expect(reconnect).not.toHaveBeenCalled();
    expect(calls).toHaveLength(previous);
    fireEvent.click(
      screen.getByRole('button', { name: 'Keep new-transfer edits' }),
    );
    expect(screen.getByRole('textbox', { name: 'Note' })).toHaveValue(
      'QorliaQA edited note',
    );
    fireEvent.click(screen.getByRole('button', { name: button }));
    fireEvent.click(
      screen.getByRole('button', { name: /Discard new-transfer edits/ }),
    );
    expect(close).toHaveBeenCalledTimes(target === 'close' ? 1 : 0);
    expect(reconnect).toHaveBeenCalledTimes(target === 'reconnect' ? 1 : 0);
    await waitFor(() =>
      expect(calls.filter((call) => call.method.endsWith('load'))).toHaveLength(
        target === 'reload' ? 2 : 1,
      ),
    );
    expect(await screen.findByRole('textbox', { name: 'Note' })).toHaveValue(
      target === 'reload' ? '' : 'QorliaQA edited note',
    );
  },
);
it('warns on full-page unload only while dirty and removes the listener on unmount', async () => {
  const view = show();
  const origin = await screen.findByRole('textbox', { name: 'origin' });
  const clean = new Event('beforeunload', { cancelable: true });
  window.dispatchEvent(clean);
  expect(clean.defaultPrevented).toBe(false);
  fireEvent.change(origin, { target: { value: 'QorliaQA unsaved' } });
  const dirty = new Event('beforeunload', { cancelable: true });
  window.dispatchEvent(dirty);
  expect(dirty.defaultPrevented).toBe(true);
  view.unmount();
  const after = new Event('beforeunload', { cancelable: true });
  window.dispatchEvent(after);
  expect(after.defaultPrevented).toBe(false);
  expect(returnFocus).toHaveBeenCalled();
});
it.each(['hidden', 'readonly'] as const)(
  'retains unapplied input when native rules make its field %s',
  async (kind) => {
    show();
    const origin = await screen.findByRole('textbox', { name: 'origin' });
    fireEvent.change(origin, { target: { value: 'QorliaQA pending origin' } });
    if (kind === 'hidden') hideOrigin = true;
    else readonlyOrigin = true;
    await edit();
    expect(
      screen.queryByRole('textbox', { name: 'origin' }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText(/QorliaQA Contact rules changed/),
    ).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole('button', {
        name: 'Discard unapplied new-transfer inputs',
      }),
    );
    expect(
      calls.filter((call) => call.method.endsWith('onchange')),
    ).toHaveLength(1);
    fireEvent.click(
      screen.getByRole('button', { name: 'Close new-transfer form' }),
    );
    expect(
      screen.getByText('Discard unsaved new-transfer changes?'),
    ).toBeInTheDocument();
  },
);
it('fails closed on an invalid signed-seed acknowledgment without losing the local input', async () => {
  corrupt = true;
  show();
  await edit();
  expect(
    screen.getByText(
      'Invalid native transfer draft. Reload the signed defaults.',
    ),
  ).toHaveAttribute('role', 'alert');
  expect(screen.getByRole('textbox', { name: 'Note' })).toHaveValue(
    'QorliaQA edited note',
  );
  expect(
    screen.getByRole('button', { name: 'Create transfer (not integrated)' }),
  ).toBeDisabled();
});
it('reports load expiry without an editable form and allows explicit reconnect', async () => {
  failure = 'load';
  show();
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'No new-transfer form is shown.',
  );
  expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Reconnect Billing' }));
  expect(reconnect).toHaveBeenCalledTimes(1);
});
it('keeps a native access denial explicit and reloads only when requested', async () => {
  const denied = {
    ok: true,
    status: 200,
    json: async () => ({
      error: { code: 200, data: { name: 'odoo.exceptions.AccessError' } },
    }),
  } as Response;
  jest.mocked(fetch).mockResolvedValueOnce(denied);
  show();
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Check your billing account permissions',
  );
  expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  expect(fetch).toHaveBeenCalledTimes(1);
  fireEvent.click(
    screen.getByRole('button', { name: 'Reload native defaults' }),
  );
  expect(await screen.findByRole('textbox', { name: 'origin' })).toHaveValue(
    'QorliaQA native default',
  );
  expect(fetch).toHaveBeenCalledTimes(2);
});
it('allows exit during a slow defaults read without retaining a stale form', async () => {
  const pending = deferred<Response>();
  jest.mocked(fetch).mockReturnValueOnce(pending.promise);
  const view = show();
  expect(
    screen.getByText('Loading signed native transfer defaults...'),
  ).toBeInTheDocument();
  fireEvent.click(
    screen.getByRole('button', { name: 'Close new-transfer form' }),
  );
  expect(close).toHaveBeenCalledTimes(1);
  view.unmount();
  await act(async () => {
    pending.resolve(response(draft));
  });
  expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  expect(reconnect).not.toHaveBeenCalled();
});
it('loads a fresh signed default set when reopened instead of reusing a discarded draft cache', async () => {
  const first = show();
  await edit();
  first.unmount();
  draft = fresh();
  draft.seed.signature = 'f'.repeat(64);
  draft.seed.payload = draft.seed.payload.replace(
    'native default',
    'fresh defaults',
  );
  draft.form.values.origin = 'QorliaQA fresh defaults';
  render(
    <QueryClientProvider client={first.client}>
      <InventoryDraftEditor
        uid={3}
        close={close}
        reconnect={reconnect}
        openTransfer={openTransfer}
      />
    </QueryClientProvider>,
  );
  expect(await screen.findByRole('textbox', { name: 'origin' })).toHaveValue(
    'QorliaQA fresh defaults',
  );
  expect(screen.getByRole('textbox', { name: 'Note' })).toHaveValue('');
  expect(calls.filter((call) => call.method.endsWith('load'))).toHaveLength(2);
  await edit('origin', 'QorliaQA next draft');
  expect(calls.at(-1)?.kwargs.seed).toEqual(draft.seed);
  expect(calls.at(-1)?.kwargs.edits).toEqual([
    { node: 4, value: 'QorliaQA next draft' },
  ]);
});
it('does not let a late old-account onchange replace the new account form', async () => {
  const pending = deferred<Response>();
  delayed = pending.promise;
  const view = show();
  const input = await screen.findByRole('textbox', { name: 'Note' });
  fireEvent.change(input, { target: { value: 'QorliaQA previous account' } });
  fireEvent.blur(input);
  await waitFor(() =>
    expect(calls.some((call) => call.method.endsWith('onchange'))).toBe(true),
  );
  const old = edited(draft.seed, [
    { node: 2, value: 'QorliaQA previous account' },
  ]);
  delayed = null;
  view.identity(4);
  expect(await screen.findByRole('textbox', { name: 'Note' })).toHaveValue('');
  await act(async () => {
    pending.resolve(response(old));
  });
  expect(screen.getByRole('textbox', { name: 'Note' })).toHaveValue('');
  expect(calls.filter((call) => call.method.endsWith('load'))).toHaveLength(2);
});
it('locks overlapping changes and exit while native onchange is in flight', async () => {
  const pending = deferred<Response>();
  delayed = pending.promise;
  show();
  const note = await screen.findByRole('textbox', { name: 'Note' });
  fireEvent.change(note, { target: { value: 'QorliaQA one change' } });
  fireEvent.blur(note);
  fireEvent.blur(note);
  expect(
    screen.getByRole('button', { name: 'Close new-transfer form' }),
  ).toBeDisabled();
  expect(calls.filter((call) => call.method.endsWith('onchange'))).toHaveLength(
    1,
  );
  await act(async () => {
    pending.resolve(
      response(edited(draft.seed, [{ node: 2, value: 'QorliaQA one change' }])),
    );
  });
  expect(
    screen.getByRole('button', { name: 'Close new-transfer form' }),
  ).toBeEnabled();
});
