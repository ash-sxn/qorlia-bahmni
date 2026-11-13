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
  beforeEach(() => {
    jest.clearAllMocks();
    (get as jest.Mock).mockImplementation((url: string) =>
      Promise.resolve(
        url.endsWith('extension.json')
          ? { csv: { id: 'bahmni.admin.csv', extensionParams: {} } }
          : [],
      ),
    );
    Object.defineProperty(global.crypto, 'randomUUID', {
      configurable: true,
      value: () => 'file-1',
    });
  });

  it('shows import history and submits a selected CSV as multipart data', async () => {
    (post as jest.Mock).mockResolvedValue(true);
    Object.defineProperty(global.crypto, 'randomUUID', {
      configurable: true,
      value: () => 'file-1',
    });
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    render(
      <QueryClientProvider client={client}>
        <CsvUpload />
      </QueryClientProvider>,
    );

    await waitFor(() =>
      expect(get).toHaveBeenCalledWith(
        '/openmrs/ws/rest/v1/bahmnicore/admin/upload/status',
      ),
    );
    expect(
      await screen.findByText('ADMIN_CSV_UPLOAD_EMPTY'),
    ).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('ADMIN_CSV_UPLOAD_TYPE'), {
      target: { value: 'updateReferenceTerms' },
    });
    const file = new File(['concept,code\n'], 'terms.csv', {
      type: 'text/csv',
    });
    fireEvent.change(screen.getByLabelText('ADMIN_CSV_UPLOAD_FILES'), {
      target: { files: [file] },
    });
    fireEvent.click(
      screen.getByRole('button', { name: 'ADMIN_CSV_UPLOAD_SEND' }),
    );
    await waitFor(() => expect(post).toHaveBeenCalled());
    const [url, body, options] = (post as jest.Mock).mock.calls[0];
    expect(url).toBe(
      '/openmrs/ws/rest/v1/bahmnicore/admin/upload/referenceterms/new',
    );
    expect(body.get('file')).toBe(file);
    expect(body.get('patientMatchingAlgorithm')).toBe('');
    expect(options.headers['Content-Type']).toBeUndefined();
    expect(
      await screen.findByText('ADMIN_CSV_UPLOAD_SUCCESS'),
    ).toBeInTheDocument();
  });

  it('honors configured import types and the native patient-matching algorithm', async () => {
    (get as jest.Mock).mockImplementation((url: string) =>
      Promise.resolve(
        url.endsWith('extension.json')
          ? {
              csv: {
                id: 'bahmni.admin.csv',
                extensionParams: {
                  patientMatchingAlgorithm: 'patientIdentifier',
                },
                urlMap: {
                  localEncounter: {
                    name: 'Hospital encounter',
                    url: '/openmrs/ws/rest/v1/bahmnicore/admin/upload/encounter',
                  },
                },
              },
            }
          : [],
      ),
    );
    (post as jest.Mock).mockResolvedValue(true);
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    render(
      <QueryClientProvider client={client}>
        <CsvUpload />
      </QueryClientProvider>,
    );
    expect(
      await screen.findByRole('option', { name: 'Hospital encounter' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('option', { name: 'ADMIN_CSV_TYPE_patient' }),
    ).not.toBeInTheDocument();
    const file = new File(['header\nvalue\n'], 'encounter.csv', {
      type: 'text/csv',
    });
    fireEvent.change(screen.getByLabelText('ADMIN_CSV_UPLOAD_FILES'), {
      target: { files: [file] },
    });
    fireEvent.click(
      screen.getByRole('button', { name: 'ADMIN_CSV_UPLOAD_SEND' }),
    );
    await screen.findByText('ADMIN_CSV_UPLOAD_SUCCESS');
    expect(
      (post as jest.Mock).mock.calls[0][1].get('patientMatchingAlgorithm'),
    ).toBe('patientIdentifier');
  });

  it('does not report a login page as a successful import', async () => {
    (post as jest.Mock).mockResolvedValue('<html>Sign in</html>');
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    render(
      <QueryClientProvider client={client}>
        <CsvUpload />
      </QueryClientProvider>,
    );
    await screen.findByText('ADMIN_CSV_UPLOAD_EMPTY');
    const file = new File(['header\nvalue\n'], 'concept.csv', {
      type: 'text/csv',
    });
    fireEvent.change(screen.getByLabelText('ADMIN_CSV_UPLOAD_FILES'), {
      target: { files: [file] },
    });
    fireEvent.click(
      screen.getByRole('button', { name: 'ADMIN_CSV_UPLOAD_SEND' }),
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'ADMIN_CSV_UPLOAD_REJECTED',
    );
    expect(
      screen.queryByText('ADMIN_CSV_UPLOAD_SUCCESS'),
    ).not.toBeInTheDocument();
  });

  it.each([
    {},
    {
      csv: {
        id: 'bahmni.admin.csv',
        urlMap: {
          external: { name: 'External', url: 'https://other.example/upload' },
        },
      },
    },
  ])(
    'blocks file selection for missing or external configuration',
    async (configuration) => {
      (get as jest.Mock).mockImplementation((url: string) =>
        Promise.resolve(url.endsWith('extension.json') ? configuration : []),
      );
      const client = new QueryClient({
        defaultOptions: { queries: { retry: false } },
      });
      render(
        <QueryClientProvider client={client}>
          <CsvUpload />
        </QueryClientProvider>,
      );
      expect(await screen.findByRole('alert')).toHaveTextContent(
        'ADMIN_ERROR_FETCH_CONFIG',
      );
      expect(screen.getByLabelText('ADMIN_CSV_UPLOAD_FILES')).toBeDisabled();
      expect(screen.getByLabelText('ADMIN_CSV_UPLOAD_TYPE')).toBeDisabled();
      expect(post).not.toHaveBeenCalled();
    },
  );

  it('retains the submission acknowledgment when history refresh fails', async () => {
    let historyReads = 0;
    (get as jest.Mock).mockImplementation((url: string) => {
      if (url.endsWith('extension.json'))
        return Promise.resolve({ csv: { id: 'bahmni.admin.csv' } });
      return ++historyReads === 1
        ? Promise.resolve([])
        : Promise.reject(new Error('history unavailable'));
    });
    (post as jest.Mock).mockResolvedValue(true);
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    render(
      <QueryClientProvider client={client}>
        <CsvUpload />
      </QueryClientProvider>,
    );
    await screen.findByText('ADMIN_CSV_UPLOAD_EMPTY');
    fireEvent.change(screen.getByLabelText('ADMIN_CSV_UPLOAD_FILES'), {
      target: { files: [new File(['header\nvalue\n'], 'concept.csv')] },
    });
    fireEvent.click(
      screen.getByRole('button', { name: 'ADMIN_CSV_UPLOAD_SEND' }),
    );
    await screen.findByText('ADMIN_CSV_UPLOAD_HISTORY_ERROR');
    expect(screen.getByText('ADMIN_CSV_UPLOAD_SUCCESS')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'ADMIN_CSV_UPLOAD_SEND' }),
    ).not.toBeInTheDocument();
    expect(post).toHaveBeenCalledTimes(1);
  });

  it('encodes safe error files and suppresses traversal paths', async () => {
    (get as jest.Mock).mockImplementation((url: string) =>
      Promise.resolve(
        url.endsWith('extension.json')
          ? { csv: { id: 'bahmni.admin.csv' } }
          : [
              {
                id: 'safe',
                originalFileName: 'safe.csv',
                failedRecords: 1,
                errorFileName: 'concept/with space.err.csv',
              },
              {
                id: 'unsafe',
                originalFileName: 'unsafe.csv',
                failedRecords: 1,
                errorFileName: 'concept/../secret.csv',
              },
            ],
      ),
    );
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    render(
      <QueryClientProvider client={client}>
        <CsvUpload />
      </QueryClientProvider>,
    );
    expect(
      await screen.findByRole('link', { name: 'ADMIN_CSV_UPLOAD_ERROR_FILE' }),
    ).toHaveAttribute(
      'href',
      '/uploaded-files/mrs/concept/with%20space.err.csv',
    );
    expect(screen.getAllByRole('link')).toHaveLength(1);
  });
});
