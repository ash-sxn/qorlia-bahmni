import { get } from '@bahmni/services';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { AuditLog } from '../AuditLog';

jest.mock('@bahmni/services', () => ({
  get: jest.fn(),
  useTranslation: () => ({ t: (key: string) => key }),
}));
jest.mock('../../components/AdminLayout', () => ({
  AdminLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

it('loads audit events from the legacy API and pages with its cursor', async () => {
  (get as jest.Mock).mockImplementation((url: string) => {
    if (url.includes('defaultView=true')) return Promise.resolve([]);
    if (url.includes('lastAuditLogId=')) return Promise.resolve([]);
    return Promise.resolve([{ auditLogId: 2, dateCreated: 1788844712000,
      eventType: 'USER_LOGIN_SUCCESS', userId: 'demo', patientId: '',
      message: 'USER_LOGIN_SUCCESS_MESSAGE', module: 'Login' }]);
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><AuditLog /></QueryClientProvider>);

  await waitFor(() => expect(get).toHaveBeenCalledWith(expect.stringContaining('defaultView=true')));
  fireEvent.change(screen.getByLabelText('ADMIN_AUDIT_DATE'), { target: { value: '2026-08-01' } });
  fireEvent.click(screen.getByRole('button', { name: 'ADMIN_AUDIT_FILTER' }));
  expect(await screen.findByText('USER_LOGIN_SUCCESS')).toBeInTheDocument();
  expect(get).toHaveBeenCalledWith(expect.stringContaining('startFrom='));

  fireEvent.click(screen.getByRole('button', { name: 'ADMIN_AUDIT_NEXT' }));
  await waitFor(() => expect(get).toHaveBeenCalledWith(expect.stringContaining('lastAuditLogId=2')));
  expect(await screen.findByText('ADMIN_AUDIT_NO_MORE')).toBeInTheDocument();
  expect(screen.getByText('USER_LOGIN_SUCCESS')).toBeInTheDocument();
});
