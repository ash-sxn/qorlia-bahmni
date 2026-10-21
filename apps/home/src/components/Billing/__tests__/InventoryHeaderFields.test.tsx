import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import {
  BillingSessionExpired,
  getInventoryStoredFormChoices,
  type InventoryNativeForm,
} from '../billingService';
import {
  InventoryHeaderFields,
  inventoryHeaderInputValue,
  inventoryHeaderLabel,
} from '../InventoryHeaderFields';
import {
  headerForm,
  headerPreview,
  headerRequest,
} from './inventoryHeaderFixture';

jest.mock('../billingService', () => ({
  ...jest.requireActual('../billingService'),
  getInventoryStoredFormChoices: jest.fn(),
}));
const get = jest.mocked(getInventoryStoredFormChoices),
  edit = jest.fn(),
  blur = jest.fn(),
  change = jest.fn(),
  reconnect = jest.fn();
const selection = () => ({
  transfer_id: 7,
  version: 'a'.repeat(64),
  edits: headerRequest().edits,
});
const relationPage = (offset = 0, more = false) => ({
  ...headerPreview(selection()),
  page: {
    read_only: true as const,
    transfer_id: 7,
    picking_type_id: false as const,
    form_version: 'c'.repeat(64),
    node: 3,
    field: 'partner_id',
    offset,
    rows: Array.from(
      { length: more ? 25 : 1 },
      (_, index): [number, string] => [
        8 + offset + index,
        `QorliaQA Contact ${8 + offset + index}`,
      ],
    ),
    has_more: more,
  },
});
function show(form = headerForm().form, disabled = false) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <InventoryHeaderFields
        uid={3}
        form={form}
        selection={selection()}
        local={{}}
        disabled={disabled}
        edit={edit}
        blur={blur}
        change={change}
        reconnect={reconnect}
      />
    </QueryClientProvider>,
  );
}
function add(
  form: InventoryNativeForm,
  name: string,
  type: string,
  value: string | number | boolean,
) {
  const node = form.layout.length;
  form.fields[name] = { type, string: name };
  form.layout.push({
    ...form.layout[2],
    field: name,
    rules: { visible: true, readonly: false, required: true },
  });
  form.values[name] = value;
  return node;
}
beforeAll(() => {
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
    configurable: true,
    value: jest.fn(),
  });
});
beforeEach(() => {
  jest.resetAllMocks();
  get.mockImplementation(async (_selection, _node, _search, offset) =>
    relationPage(offset),
  );
});

it.each([
  ['char', '  text  ', '  text  '],
  ['text', 'long note', 'long note'],
  ['html', '<p>x</p>', '<p>x</p>'],
  ['float', '0', 0],
  ['float', '1.25', 1.25],
  ['integer', '-2', -2],
  ['monetary', '9.99', 9.99],
  ['datetime', '2026-10-23T12:34', '2026-10-23 12:34:00'],
  ['datetime', '2026-10-23T12:34:56.000', '2026-10-23 12:34:56'],
  ['date', '2026-10-23', '2026-10-23'],
  ['float', '', false],
  ['html', '', false],
])(
  'preserves native %s input %s without silently reinterpreting it',
  (type, raw, value) => {
    expect(inventoryHeaderInputValue(type, raw)).toBe(value);
  },
);
it.each([
  ['float', 'NaN'],
  ['integer', '1.1'],
  ['integer', '9007199254740992'],
  ['monetary', 'Infinity'],
  ['float', '   '],
  ['datetime', '2026-10-23T12:34:56.01'],
  ['datetime', 'tomorrow'],
])('rejects invalid native %s input %s', (type, raw) => {
  expect(() => inventoryHeaderInputValue(type, raw)).toThrow();
});
it('uses the visible occurrence label without executing metadata expressions or exposing hidden fields', () => {
  const form = headerForm().form;
  form.layout[3].attributes.id = 'incoming-contact';
  form.label_nodes.push({
    ...form.label_nodes[0],
    target: 'incoming-contact',
    label: 'Native Receive From',
  });
  form.layout[4].rules.visible = false;
  expect(inventoryHeaderLabel(form, 3)).toBe('Native Receive From');
  show(form);
  expect(
    screen.getByRole('combobox', { name: 'Native Receive From' }),
  ).toBeInTheDocument();
  expect(
    screen.queryByRole('textbox', { name: 'Source document' }),
  ).not.toBeInTheDocument();
  expect(get).not.toHaveBeenCalled();
});
it('renders numeric zero, integer selection keys, Booleans and explicit UTC/date inputs using native types', () => {
  const form = headerForm().form;
  const count = add(form, 'Count', 'integer', 0),
    flag = add(form, 'Immediate', 'boolean', false),
    policy = add(form, 'Policy', 'selection', 0);
  form.fields.Policy.selection = [
    [0, 'First'],
    [1, 'Second'],
  ];
  add(form, 'Scheduled', 'datetime', '2026-10-23 12:34:56');
  add(form, 'Day', 'date', '2026-10-23');
  show(form);
  expect(screen.getByRole('spinbutton', { name: 'Count' })).toHaveValue(0);
  fireEvent.change(screen.getByRole('spinbutton', { name: 'Count' }), {
    target: { value: '7' },
  });
  expect(edit).toHaveBeenCalledWith(count, '7');
  fireEvent.click(screen.getByRole('checkbox', { name: 'Immediate' }));
  expect(change).toHaveBeenCalledWith(flag, true);
  const select = screen.getByRole('combobox', { name: /Policy/ });
  expect(select).toHaveValue('0');
  fireEvent.change(select, { target: { value: '1' } });
  expect(change).toHaveBeenCalledWith(policy, 1);
  fireEvent.change(select, { target: { value: '' } });
  expect(change).toHaveBeenCalledWith(policy, false);
  expect(screen.getByLabelText('Scheduled (UTC)')).toHaveValue(
    '2026-10-23T12:34:56.000',
  );
  expect(screen.getByLabelText('Day')).toHaveValue('2026-10-23');
});
it('does not search hidden or readonly relations or mutate a disabled form', () => {
  const form = headerForm().form;
  form.layout[3].rules.readonly = true;
  const flag = add(form, 'Immediate', 'boolean', false);
  show(form, true);
  expect(
    screen.queryByRole('combobox', { name: 'Receive From' }),
  ).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('checkbox', { name: 'Immediate' }));
  expect(change).not.toHaveBeenCalledWith(flag, true);
  expect(get).not.toHaveBeenCalled();
});
it('does not disguise an unavailable native selection value as an empty field', () => {
  const form = headerForm().form;
  add(form, 'Policy', 'selection', 'old-policy');
  form.fields.Policy.selection = [['current', 'Current policy']];
  show(form);
  expect(screen.getByRole('combobox', { name: /Policy/ })).toHaveValue('-1');
  expect(
    screen.getByRole('option', {
      name: 'Current native value: old-policy (not offered)',
    }),
  ).toBeDisabled();
  expect(change).not.toHaveBeenCalled();
});
it('searches only on interaction, pages native choices and keeps original version and ordered edits', async () => {
  get.mockImplementation(async (_selection, _node, _search, offset = 0) =>
    relationPage(offset, offset === 0),
  );
  show();
  expect(get).not.toHaveBeenCalled();
  const contact = screen.getByRole('combobox', { name: 'Receive From' });
  fireEvent.focus(contact);
  await waitFor(() => expect(get).toHaveBeenCalledWith(selection(), 3, '', 0));
  fireEvent.click(
    await screen.findByRole('button', { name: 'More receive from choices' }),
  );
  await waitFor(() =>
    expect(get).toHaveBeenLastCalledWith(selection(), 3, '', 25),
  );
  fireEvent.keyDown(contact, { key: 'ArrowDown' });
  fireEvent.click(
    await screen.findByRole('option', { name: 'QorliaQA Contact 33' }),
  );
  expect(change).toHaveBeenCalledWith(3, 33);
});
it('keeps typed search separate from a selection and only commits an explicit returned option', async () => {
  show();
  const contact = screen.getByRole('combobox', { name: 'Receive From' });
  fireEvent.focus(contact);
  await waitFor(() => expect(get).toHaveBeenCalledTimes(1));
  fireEvent.change(contact, { target: { value: 'Other' } });
  expect(change).not.toHaveBeenCalled();
  await waitFor(() =>
    expect(get).toHaveBeenLastCalledWith(selection(), 3, 'Other', 0),
  );
  fireEvent.keyDown(contact, { key: 'ArrowDown' });
  fireEvent.click(
    await screen.findByRole('option', { name: 'QorliaQA Contact 8' }),
  );
  expect(change).toHaveBeenCalledWith(3, 8);
});
it('shows relation search expiry without replacing the field value or mutating data', async () => {
  get.mockRejectedValue(new BillingSessionExpired());
  show();
  fireEvent.focus(screen.getByRole('combobox', { name: 'Receive From' }));
  fireEvent.click(
    await screen.findByRole('button', { name: 'Reconnect Billing' }),
  );
  expect(reconnect).toHaveBeenCalledTimes(1);
  expect(change).not.toHaveBeenCalled();
});
