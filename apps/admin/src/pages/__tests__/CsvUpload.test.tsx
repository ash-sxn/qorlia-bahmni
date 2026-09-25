import { get, post } from '@bahmni/services';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { CsvUpload } from '../CsvUpload';

jest.mock('@bahmni/services', () => ({
  get: jest.fn(),
  post: jest.fn(),
  useTranslation: () => ({ t: (key: string) => key }),
}));
jest.mock('../../components/AdminLayout', () => ({
  AdminLayout: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="admin-layout-test-id">{children}</div>
  ),
}));

describe('CsvUpload', () => {
  it('shows import history and submits a selected CSV as multipart data', async () => {
    (get as jest.Mock).mockResolvedValue([]);
    (post as jest.Mock).mockResolvedValue(true);
    Object.defineProperty(global.crypto, 'randomUUID', { configurable: true, value: () => 'file-1' });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={client}><CsvUpload /></QueryClientProvider>);

    await waitFor(() => expect(get).toHaveBeenCalledWith('/openmrs/ws/rest/v1/bahmnicore/admin/upload/status'));
    expect(await screen.findByText('ADMIN_CSV_UPLOAD_EMPTY')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('ADMIN_CSV_UPLOAD_TYPE'), { target: { value: 'updateReferenceTerms' } });
    const file = new File(['concept,code\n'], 'terms.csv', { type: 'text/csv' });
    fireEvent.change(screen.getByLabelText('ADMIN_CSV_UPLOAD_FILES'), { target: { files: [file] } });
    fireEvent.click(screen.getByRole('button', { name: 'ADMIN_CSV_UPLOAD_SEND' }));
    await waitFor(() => expect(post).toHaveBeenCalled());
    const [url, body, options] = (post as jest.Mock).mock.calls[0];
    expect(url).toBe('/openmrs/ws/rest/v1/bahmnicore/admin/upload/referenceterms/new');
    expect(body.get('file')).toBe(file);
    expect(body.get('patientMatchingAlgorithm')).toBe('');
    expect(options.headers['Content-Type']).toBeUndefined();
    expect(await screen.findByText('ADMIN_CSV_UPLOAD_SUCCESS')).toBeInTheDocument();
  });
});
