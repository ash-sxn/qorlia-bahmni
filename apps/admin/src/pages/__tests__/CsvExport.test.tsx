import { get } from '@bahmni/services';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { CsvExport } from '../CsvExport';

jest.mock('@bahmni/services', () => ({
  get: jest.fn(),
  useTranslation: () => ({ t: (key: string) => key }),
}));
jest.mock('../../components/AdminLayout', () => ({
  AdminLayout: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));

it('requires an API-selected concept before enabling its CSV export', async () => {
  jest.useFakeTimers();
  (get as jest.Mock).mockResolvedValue({
    results: [{ uuid: 'concept-1', name: { name: 'Blood group' } }],
  });
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <CsvExport />
    </QueryClientProvider>,
  );

  const exportButton = screen.getByRole('button', {
    name: 'ADMIN_CSV_EXPORT_BUTTON',
  });
  expect(exportButton).toBeDisabled();
  fireEvent.change(
    screen.getByRole('textbox', { name: 'ADMIN_CSV_EXPORT_CONCEPT' }),
    {
      target: { value: 'Blood' },
    },
  );
  act(() => jest.advanceTimersByTime(300));
  expect(
    await screen.findByRole('button', { name: 'Blood group' }),
  ).toBeInTheDocument();
  expect(get).toHaveBeenCalledWith(
    '/openmrs/ws/rest/v1/concept?q=Blood&v=custom%3A%28uuid%2Cname%29',
  );

  fireEvent.click(screen.getByRole('button', { name: 'Blood group' }));
  expect(exportButton).toBeEnabled();
  const open = jest.spyOn(window, 'open').mockImplementation(() => null);
  fireEvent.click(exportButton);
  expect(open).toHaveBeenCalledWith(
    '/openmrs/ws/rest/v1/bahmnicore/admin/export/conceptset?conceptName=Blood%20group',
    '_blank',
    'noopener',
  );
  open.mockClear();
  fireEvent.submit(exportButton.closest('form')!);
  expect(open).toHaveBeenCalledTimes(1);
  fireEvent.change(
    screen.getByRole('textbox', { name: 'ADMIN_CSV_EXPORT_CONCEPT' }),
    {
      target: { value: 'Changed' },
    },
  );
  expect(exportButton).toBeDisabled();
  fireEvent.submit(exportButton.closest('form')!);
  expect(open).toHaveBeenCalledTimes(1);
  open.mockRestore();
  jest.useRealTimers();
});

it('retries a failed concept search without starting an export', async () => {
  jest.useFakeTimers();
  (get as jest.Mock)
    .mockReset()
    .mockRejectedValueOnce(new Error('unavailable'))
    .mockResolvedValue({
      results: [{ uuid: 'concept-1', name: { name: 'Blood group' } }],
    });
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <CsvExport />
    </QueryClientProvider>,
  );
  fireEvent.change(
    screen.getByRole('textbox', { name: 'ADMIN_CSV_EXPORT_CONCEPT' }),
    {
      target: { value: 'Blood' },
    },
  );
  act(() => jest.advanceTimersByTime(300));
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'ADMIN_CSV_EXPORT_ERROR',
  );
  fireEvent.click(
    screen.getByRole('button', { name: 'ADMIN_ORDER_TRY_AGAIN' }),
  );
  await screen.findByRole('button', { name: 'Blood group' });
  expect(get).toHaveBeenCalledTimes(2);
  expect(
    screen.getByRole('button', { name: 'ADMIN_CSV_EXPORT_BUTTON' }),
  ).toBeDisabled();
  jest.useRealTimers();
});
