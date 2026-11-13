import { get } from '@bahmni/services';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { queryClientConfig } from '../../config/tanstackQuery';
import { AuditLog } from '../AuditLog';

const mockTranslate = jest.fn<string, [string, Record<string, unknown>?]>(
  (key) => key,
);

jest.mock('@bahmni/services', () => ({
  get: jest.fn(),
  useTranslation: () => ({
    t: (...args: Parameters<typeof mockTranslate>) => mockTranslate(...args),
  }),
}));

const entry = (auditLogId: number, message = 'USER_LOGIN_SUCCESS_MESSAGE') => ({
  auditLogId,
  dateCreated: 1788844712000,
  eventType: `EVENT_${auditLogId}`,
  userId: 'demo',
  patientId: '',
  message,
  module: 'Login',
});
const setup = (
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } }),
) =>
  render(
    <QueryClientProvider client={client}>
      <AuditLog />
    </QueryClientProvider>,
  );
beforeEach(() => {
  jest.clearAllMocks();
});
jest.mock('../../components/AdminLayout', () => ({
  AdminLayout: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));

it('loads audit events from the legacy API and pages with its cursor', async () => {
  (get as jest.Mock).mockImplementation((url: string) => {
    if (url.includes('defaultView=true')) return Promise.resolve([]);
    if (url.includes('lastAuditLogId=')) return Promise.resolve([]);
    return Promise.resolve([
      {
        auditLogId: 2,
        dateCreated: 1788844712000,
        eventType: 'USER_LOGIN_SUCCESS',
        userId: 'demo',
        patientId: '',
        message: 'USER_LOGIN_SUCCESS_MESSAGE',
        module: 'Login',
      },
    ]);
  });
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <AuditLog />
    </QueryClientProvider>,
  );

  await waitFor(() =>
    expect(get).toHaveBeenCalledWith(
      expect.stringContaining('defaultView=true'),
    ),
  );
  fireEvent.change(screen.getByLabelText('ADMIN_AUDIT_DATE'), {
    target: { value: '2026-08-01' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'ADMIN_AUDIT_FILTER' }));
  expect(await screen.findByText('USER_LOGIN_SUCCESS')).toBeInTheDocument();
  expect(get).toHaveBeenCalledWith(expect.stringContaining('startFrom='));

  fireEvent.click(screen.getByRole('button', { name: 'ADMIN_AUDIT_NEXT' }));
  await waitFor(() =>
    expect(get).toHaveBeenCalledWith(
      expect.stringContaining('lastAuditLogId=2'),
    ),
  );
  expect(await screen.findByText('ADMIN_AUDIT_NO_MORE')).toBeInTheDocument();
  expect(screen.getByText('USER_LOGIN_SUCCESS')).toBeInTheDocument();
});

it('reverses only default reads and preserves submitted filters and cursors in both directions', async () => {
  (get as jest.Mock).mockImplementation((url: string) => {
    const params = new URL(url, 'http://localhost').searchParams;
    if (params.has('defaultView'))
      return Promise.resolve([entry(100), entry(99)]);
    if (params.get('prev') === 'true')
      return Promise.resolve([entry(1), entry(2)]);
    if (params.has('lastAuditLogId'))
      return Promise.resolve([entry(3), entry(4)]);
    return Promise.resolve([entry(1), entry(2)]);
  });
  setup();
  await screen.findByText('EVENT_99');
  expect(
    within(screen.getAllByRole('row')[1]).getByText('99'),
  ).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('ADMIN_AUDIT_DATE'), {
    target: { value: '2026-08-01' },
  });
  fireEvent.change(screen.getByLabelText('ADMIN_AUDIT_TIME'), {
    target: { value: '12:34' },
  });
  fireEvent.change(screen.getByLabelText('ADMIN_AUDIT_USERNAME'), {
    target: { value: ' demo & one ' },
  });
  fireEvent.change(screen.getByLabelText('ADMIN_AUDIT_PATIENT_ID'), {
    target: { value: ' ABC200007 ' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'ADMIN_AUDIT_FILTER' }));
  await screen.findByText('EVENT_1');
  fireEvent.change(screen.getByLabelText('ADMIN_AUDIT_USERNAME'), {
    target: { value: 'unsent draft' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'ADMIN_AUDIT_NEXT' }));
  await screen.findByText('EVENT_3');
  fireEvent.click(screen.getByRole('button', { name: 'ADMIN_AUDIT_PREVIOUS' }));
  await screen.findByText('EVENT_1');
  const params = new URL(
    (get as jest.Mock).mock.calls.at(-1)[0],
    'http://localhost',
  ).searchParams;
  expect(params.get('username')).toBe('demo & one');
  expect(params.get('patientId')).toBe('ABC200007');
  expect(params.get('startFrom')).toBe(
    new Date('2026-08-01T12:34:00').toISOString(),
  );
  expect(params.get('lastAuditLogId')).toBe('3');
  expect(params.get('prev')).toBe('true');
});

it('recovers an empty filter through the native default view without retaining misleading filters', async () => {
  (get as jest.Mock).mockImplementation((url: string) =>
    Promise.resolve(url.includes('defaultView=true') ? [entry(100)] : []),
  );
  setup();
  await screen.findByText('EVENT_100');
  fireEvent.change(screen.getByLabelText('ADMIN_AUDIT_USERNAME'), {
    target: { value: 'missing' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'ADMIN_AUDIT_FILTER' }));
  await screen.findByText('ADMIN_AUDIT_EMPTY');
  fireEvent.click(screen.getByRole('button', { name: 'ADMIN_AUDIT_PREVIOUS' }));
  await screen.findByText('EVENT_100');
  expect(screen.getByLabelText('ADMIN_AUDIT_USERNAME')).toHaveValue('');
  expect((get as jest.Mock).mock.calls.at(-1)[0]).toContain('defaultView=true');
  expect((get as jest.Mock).mock.calls.at(-1)[0]).not.toContain('username=');
});

it.each([
  '<html>Sign in</html>',
  { message: 'User is not logged in', stackTrace: [] },
  [entry(1), { ...entry(2), dateCreated: 'bad date' }],
])(
  'rejects a malformed response and recovers through GET retry',
  async (invalid) => {
    (get as jest.Mock)
      .mockReset()
      .mockResolvedValueOnce(invalid)
      .mockResolvedValue([entry(1)]);
    setup();
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'ADMIN_AUDIT_ERROR',
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'ADMIN_ORDER_TRY_AGAIN' }),
    );
    await screen.findByText('EVENT_1');
    expect(get).toHaveBeenCalledTimes(2);
    expect((get as jest.Mock).mock.calls[0][0]).toBe(
      (get as jest.Mock).mock.calls[1][0],
    );
  },
);

it('preserves the last page on a failed page read and retries the same cursor', async () => {
  (get as jest.Mock)
    .mockReset()
    .mockResolvedValueOnce([entry(2)])
    .mockRejectedValueOnce(new Error('unavailable'))
    .mockResolvedValue([entry(3)]);
  setup();
  await screen.findByText('EVENT_2');
  fireEvent.click(screen.getByRole('button', { name: 'ADMIN_AUDIT_NEXT' }));
  await screen.findByRole('alert');
  expect(screen.getByText('EVENT_2')).toBeInTheDocument();
  expect(
    screen.getByRole('button', { name: 'ADMIN_AUDIT_PREVIOUS' }),
  ).toBeDisabled();
  fireEvent.click(
    screen.getByRole('button', { name: 'ADMIN_ORDER_TRY_AGAIN' }),
  );
  await screen.findByText('EVENT_3');
  expect((get as jest.Mock).mock.calls[1][0]).toBe(
    (get as jest.Mock).mock.calls[2][0],
  );
});

it('retains tilde characters inside message parameters and malformed original messages', async () => {
  (get as jest.Mock).mockResolvedValue([
    entry(1, 'RUN_REPORT_MESSAGE~{"reportName":"A ~ B"}'),
    entry(2, 'BROKEN_MESSAGE~{bad JSON}'),
  ]);
  setup();
  await screen.findByText('EVENT_1');
  expect(mockTranslate).toHaveBeenCalledWith(
    'RUN_REPORT_MESSAGE',
    expect.objectContaining({ params: { reportName: 'A ~ B' } }),
  );
  expect(screen.getByText('BROKEN_MESSAGE~{bad JSON}')).toBeInTheDocument();
});

it('refetches on re-entry despite the Admin cache defaults', async () => {
  (get as jest.Mock)
    .mockReset()
    .mockResolvedValueOnce([entry(1)])
    .mockResolvedValue([entry(2)]);
  const client = new QueryClient({
    ...queryClientConfig,
    defaultOptions: {
      ...queryClientConfig.defaultOptions,
      queries: { ...queryClientConfig.defaultOptions?.queries, retry: false },
    },
  });
  const first = setup(client);
  await screen.findByText('EVENT_1');
  first.unmount();
  setup(client);
  await screen.findByText('EVENT_2');
  expect(get).toHaveBeenCalledTimes(2);
});

it('rejects impossible local times without issuing a filter read', async () => {
  (get as jest.Mock).mockResolvedValue([]);
  setup();
  await screen.findByText('ADMIN_AUDIT_EMPTY');
  fireEvent.change(screen.getByLabelText('ADMIN_AUDIT_DATE'), {
    target: { value: '2026-03-08' },
  });
  fireEvent.change(screen.getByLabelText('ADMIN_AUDIT_TIME'), {
    target: { value: '02:30' },
  });
  fireEvent.submit(
    screen.getByRole('button', { name: 'ADMIN_AUDIT_FILTER' }).closest('form')!,
  );
  const validTime = new Date('2026-03-08T02:30:00').getHours() === 2;
  await waitFor(() => expect(get).toHaveBeenCalledTimes(validTime ? 2 : 1));
  expect(Boolean(screen.queryByText('ADMIN_AUDIT_INVALID_DATE'))).toBe(
    !validTime,
  );
});

it('omits a cleared date filter as the native screen does', async () => {
  (get as jest.Mock).mockResolvedValue([]);
  setup();
  await screen.findByText('ADMIN_AUDIT_EMPTY');
  fireEvent.change(screen.getByLabelText('ADMIN_AUDIT_DATE'), {
    target: { value: '' },
  });
  fireEvent.change(screen.getByLabelText('ADMIN_AUDIT_USERNAME'), {
    target: { value: 'demo' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'ADMIN_AUDIT_FILTER' }));
  await waitFor(() => expect(get).toHaveBeenCalledTimes(2));
  const params = new URL(
    (get as jest.Mock).mock.calls[1][0],
    'http://localhost',
  ).searchParams;
  expect(params.has('startFrom')).toBe(false);
  expect(params.get('username')).toBe('demo');
});
