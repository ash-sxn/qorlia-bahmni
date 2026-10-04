import * as services from '@bahmni/services';
import {
  QueryClient,
  QueryClientProvider,
  useQuery,
} from '@tanstack/react-query';
import {
  render,
  screen,
  fireEvent,
  within,
  waitFor,
} from '@testing-library/react';
import { axe, toHaveNoViolations } from 'jest-axe';
import { MemoryRouter } from 'react-router-dom';
import { reportRequestUrl } from '../reportService';
import { ReportsPage } from '../ReportsPage';

expect.extend(toHaveNoViolations);

jest.mock('@bahmni/services', () => ({
  ...jest.requireActual('@bahmni/services'),
  logAuditEvent: jest.fn(),
  useTranslation: () => ({ t: (key: string) => key }),
}));

jest.mock('@bahmni/widgets', () => ({
  ...jest.requireActual('@bahmni/widgets'),
  useUserPrivilege: () => ({
    userPrivileges: [{ name: 'app:reports', uuid: 'privilege-1' }],
  }),
  UserGlobalAction: () => <div data-testid="user-global-action-test-id" />,
}));

jest.mock('@tanstack/react-query', () => ({
  ...jest.requireActual('@tanstack/react-query'),
  useQuery: jest.fn(),
}));

const mockUseQuery = useQuery as jest.Mock;

const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate,
}));

describe('ReportsPage', () => {
  const renderPage = (initialPath = '/reports/') =>
    render(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter initialEntries={[initialPath]}>
          <ReportsPage />
        </MemoryRouter>
      </QueryClientProvider>,
    );

  beforeEach(() => {
    jest.restoreAllMocks();
    jest.clearAllMocks();
    (services.logAuditEvent as jest.Mock).mockResolvedValue({ logged: true });
    mockUseQuery.mockImplementation(({ queryKey }) => ({
      data:
        queryKey[1] === 'catalog'
          ? {
              visitReport: {
                name: 'Visit Report',
                requiredPrivilege: 'app:reports',
              },
            }
          : queryKey[1] === 'settings'
            ? { config: { paperSize: 'A3', enableReportQueue: true } }
            : queryKey[0] === 'currentUser'
              ? { username: 'qorlia-demo' }
              : [],
      isPending: false,
      isError: false,
      refetch: jest.fn(),
    }));
  });

  it('renders the shared header with breadcrumbs and user menu', () => {
    renderPage();
    const header = screen.getByTestId('reports-page-header-test-id');
    const breadcrumb = screen.getByTestId('breadcrumb');
    const userGlobalAction = screen.getByTestId('user-global-action-test-id');

    expect(header).toContainElement(breadcrumb);
    expect(header).toContainElement(userGlobalAction);
    expect(breadcrumb).toHaveTextContent('REPORTS_LABEL');
    expect(screen.getByTestId('header-name')).toHaveTextContent('Qorlia');
  });

  it('renders breadcrumb navigation from home to reports', () => {
    renderPage();
    const homeLink = screen.getByRole('link', { name: /REPORTS_HOME_LABEL/i });
    expect(homeLink).toHaveAttribute('href', services.BAHMNI_HOME_PATH);
  });

  it('renders both Reports and My Reports tabs', () => {
    renderPage();
    expect(
      screen.getByRole('tab', { name: 'REPORTS_TAB_LABEL' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('tab', { name: 'REPORTS_MY_REPORTS_TAB_LABEL' }),
    ).toBeInTheDocument();
  });

  it('selects the Reports tab by default on /reports/', () => {
    renderPage('/reports/');
    expect(
      screen.getByRole('tab', { name: 'REPORTS_TAB_LABEL' }),
    ).toHaveAttribute('aria-selected', 'true');
  });

  it('selects the My Reports tab when on /reports/my-reports', () => {
    renderPage('/reports/my-reports');
    expect(
      screen.getByRole('tab', { name: 'REPORTS_MY_REPORTS_TAB_LABEL' }),
    ).toHaveAttribute('aria-selected', 'true');
  });

  it('navigates to the My Reports route when the My Reports tab is clicked', () => {
    renderPage('/reports/');
    fireEvent.click(
      screen.getByRole('tab', { name: 'REPORTS_MY_REPORTS_TAB_LABEL' }),
    );
    expect(mockNavigate).toHaveBeenCalledWith('/reports/my-reports');
  });

  it('navigates to the Reports route when the Reports tab is clicked', () => {
    renderPage('/reports/my-reports');
    fireEvent.click(screen.getByRole('tab', { name: 'REPORTS_TAB_LABEL' }));
    expect(mockNavigate).toHaveBeenCalledWith('/reports/');
  });

  it('renders configured reports and validates the date range', () => {
    renderPage();
    expect(
      screen.getByRole('button', { name: 'Visit Report' }),
    ).toBeInTheDocument();
    const dates = screen.getAllByLabelText(/REPORTS_FROM|REPORTS_TO/);
    fireEvent.change(dates[0], { target: { value: '2026-09-25' } });
    fireEvent.change(dates[1], { target: { value: '2026-09-24' } });
    expect(screen.getByRole('alert')).toHaveTextContent(
      'REPORTS_INVALID_DATES',
    );
    expect(
      screen.getByRole('button', { name: 'REPORTS_RUN_NOW' }),
    ).toBeDisabled();
  });

  it('builds a report URL with the legacy backend parameters', () => {
    const url = reportRequestUrl('report', {
      name: 'OPD/IPDVisitCount',
      startDate: '2026-09-01',
      endDate: '2026-09-25',
      responseType: 'text/csv',
      paperSize: 'A3',
    });
    expect(url).toContain('/bahmnireports/report?');
    expect(url).toContain('name=OPD%2FIPDVisitCount');
    expect(url).toContain('responseType=text%2Fcsv');
    expect(url).toContain('appName=reports');
  });

  it('sends and audits the configured report name rather than its configuration key', async () => {
    const open = jest.spyOn(window, 'open').mockImplementation(() => null);
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'REPORTS_RUN_NOW' }));
    const url = new URL(open.mock.calls[0][0] as string, 'http://localhost');
    expect(url.searchParams.get('name')).toBe('Visit Report');
    await waitFor(() =>
      expect(services.logAuditEvent).toHaveBeenCalledWith(
        undefined,
        'RUN_REPORT',
        { reportName: 'Visit Report' },
        'MODULE_LABEL_REPORTS_KEY',
      ),
    );
    open.mockRestore();
  });

  it('keeps accepted scheduling separate from failed audit logging and does not retry', async () => {
    const get = jest.spyOn(services, 'get').mockResolvedValue(undefined);
    (services.logAuditEvent as jest.Mock).mockRejectedValue(
      new Error('Audit offline'),
    );
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'REPORTS_QUEUE' }));
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(
        'REPORTS_AUDIT_ERROR',
      ),
    );
    expect(screen.getByRole('status')).toHaveTextContent('REPORTS_QUEUED');
    expect(screen.queryByText('REPORTS_QUEUE_ERROR')).toBeNull();
    expect(get).toHaveBeenCalledTimes(1);
    expect(
      new URL(
        get.mock.calls[0][0] as string,
        'http://localhost',
      ).searchParams.get('name'),
    ).toBe('Visit Report');
    expect(services.logAuditEvent).toHaveBeenCalledTimes(1);
  });

  it('audits the request like legacy without claiming a rejected queue response succeeded', async () => {
    jest.spyOn(services, 'get').mockResolvedValue('<html>Login</html>');
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'REPORTS_QUEUE' }));
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(
        'REPORTS_QUEUE_ERROR',
      ),
    );
    expect(services.logAuditEvent).toHaveBeenCalledWith(
      undefined,
      'RUN_REPORT',
      { reportName: 'Visit Report' },
      'MODULE_LABEL_REPORTS_KEY',
    );
    expect(screen.queryByText('REPORTS_QUEUED')).toBeNull();
  });

  it('opens a direct report synchronously and warns separately if its audit fails', async () => {
    const open = jest.spyOn(window, 'open').mockImplementation(() => null);
    (services.logAuditEvent as jest.Mock).mockResolvedValue({
      logged: false,
      error: 'Unknown event',
    });
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'REPORTS_RUN_NOW' }));
    expect(open).toHaveBeenCalledTimes(1);
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(
        'REPORTS_AUDIT_ERROR',
      ),
    );
    expect(open).toHaveBeenCalledTimes(1);
    expect(services.logAuditEvent).toHaveBeenCalledTimes(1);
  });

  it('honors configured formats and prevents concatenated CSV requests', () => {
    mockUseQuery.mockImplementation(({ queryKey }) => ({
      data:
        queryKey[1] === 'catalog'
          ? { combined: { name: 'Combined report', type: 'concatenated' } }
          : queryKey[1] === 'settings'
            ? { config: { supportedFormats: ['csv', 'PDF'] } }
            : queryKey[0] === 'currentUser'
              ? { username: 'qorlia-demo' }
              : [],
      isPending: false,
      isError: false,
    }));
    renderPage();
    const format = screen.getByLabelText('REPORTS_FORMAT');
    expect(within(format).queryByRole('option', { name: 'HTML' })).toBeNull();
    fireEvent.change(format, { target: { value: 'text/csv' } });
    expect(
      screen.getByRole('button', { name: 'REPORTS_RUN_NOW' }),
    ).toBeDisabled();
    expect(screen.getByRole('alert')).toHaveTextContent(
      'REPORTS_CONCATENATED_CSV',
    );
    fireEvent.change(format, { target: { value: 'application/pdf' } });
    expect(
      screen.getByRole('button', { name: 'REPORTS_RUN_NOW' }),
    ).toBeEnabled();
  });

  it('uses local date presets and allows an explicit custom range', () => {
    renderPage();
    fireEvent.change(screen.getByLabelText('REPORTS_DATE_RANGE'), {
      target: { value: 'Previous Month' },
    });
    const now = new Date();
    const date = (value: Date) =>
      services.formatDateTime(value, undefined, false, 'yyyy-MM-dd')
        .formattedResult;
    expect(screen.getByLabelText('REPORTS_FROM')).toHaveValue(
      date(new Date(now.getFullYear(), now.getMonth() - 1, 1)),
    );
    expect(screen.getByLabelText('REPORTS_TO')).toHaveValue(
      date(new Date(now.getFullYear(), now.getMonth(), 0)),
    );
    fireEvent.change(screen.getByLabelText('REPORTS_FROM'), {
      target: { value: '2026-01-01' },
    });
    expect(screen.getByLabelText('REPORTS_DATE_RANGE')).toHaveValue('custom');
  });

  it('hides date controls and sends empty dates when the configured report needs none', () => {
    mockUseQuery.mockImplementation(({ queryKey }) => ({
      data:
        queryKey[1] === 'catalog'
          ? {
              census: {
                name: 'Current census',
                config: { dateRangeRequired: false },
              },
            }
          : queryKey[0] === 'currentUser'
            ? { username: 'qorlia-demo' }
            : queryKey[1] === 'queue'
              ? []
              : {},
      isPending: false,
      isError: false,
    }));
    const open = jest.spyOn(window, 'open').mockImplementation(() => null);
    renderPage();
    expect(screen.queryByLabelText('REPORTS_DATE_RANGE')).toBeNull();
    expect(screen.queryByLabelText('REPORTS_FROM')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'REPORTS_RUN_NOW' }));
    const params = new URL(open.mock.calls[0][0] as string, 'http://localhost')
      .searchParams;
    expect(params.get('startDate')).toBe('');
    expect(params.get('endDate')).toBe('');
  });

  it('requires an uploaded or configured template before a custom Excel run', async () => {
    const post = jest.spyOn(services, 'post').mockResolvedValue('uuid-QA.xls');
    const open = jest.spyOn(window, 'open').mockImplementation(() => null);
    renderPage();
    fireEvent.change(screen.getByLabelText('REPORTS_FORMAT'), {
      target: { value: 'application/vnd.ms-excel-custom' },
    });
    expect(
      screen.getByRole('button', { name: 'REPORTS_RUN_NOW' }),
    ).toBeDisabled();
    fireEvent.change(screen.getByLabelText('REPORTS_TEMPLATE_UPLOAD'), {
      target: { files: [new File(['QA workbook'], 'QA.xls')] },
    });
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'REPORTS_RUN_NOW' }),
      ).toBeEnabled(),
    );
    fireEvent.click(screen.getByRole('button', { name: 'REPORTS_RUN_NOW' }));
    expect(
      new URL(
        open.mock.calls[0][0] as string,
        'http://localhost',
      ).searchParams.get('macroTemplateLocation'),
    ).toBe('uuid-QA.xls');
    expect(post).toHaveBeenCalledTimes(1);
  });

  it('renders numeric queue timestamps, date range and format, with literal search', () => {
    const rows = [
      {
        id: 'older',
        name: 'Older report',
        status: 'Processing',
        requestDatetime: 1750000000000,
        format: 'application/pdf',
      },
      {
        id: 'newer',
        name: 'Visit [Report]',
        status: 'Completed',
        requestDatetime: 1760000000000,
        startDate: '2026-09-01',
        endDate: '2026-09-30',
        format: 'text/csv',
      },
    ];
    mockUseQuery.mockImplementation(({ queryKey }) => ({
      data:
        queryKey[0] === 'currentUser'
          ? { username: 'qorlia-demo' }
          : queryKey[1] === 'queue'
            ? rows
            : {},
      isPending: false,
      isError: false,
      refetch: jest.fn(),
    }));
    renderPage('/reports/my-reports');
    const rendered = screen
      .getAllByRole('row')
      .filter((row) => row.querySelector('td'));
    expect(rendered[0]).toHaveTextContent('Visit [Report]');
    expect(rendered[0]).toHaveTextContent('CSV');
    expect(
      within(rendered[1]).queryByRole('button', { name: 'REPORTS_DELETE' }),
    ).toBeNull();
    fireEvent.change(screen.getByLabelText('REPORTS_QUEUE_SEARCH'), {
      target: { value: '[' },
    });
    expect(screen.queryByText('Older report')).toBeNull();
    expect(screen.getByText('Visit [Report]')).toBeInTheDocument();
  });

  it('keeps report removal in-page and sends nothing on Cancel', async () => {
    const get = jest.spyOn(services, 'get').mockResolvedValue(undefined);
    mockUseQuery.mockImplementation(({ queryKey }) => ({
      data:
        queryKey[0] === 'currentUser'
          ? { username: 'qorlia-demo' }
          : queryKey[1] === 'queue'
            ? [{ id: 'qa', name: 'Synthetic report', status: 'Completed' }]
            : {},
      isPending: false,
      isError: false,
      refetch: jest.fn(),
    }));
    renderPage('/reports/my-reports');
    fireEvent.click(screen.getByRole('button', { name: 'REPORTS_DELETE' }));
    fireEvent.click(screen.getByRole('button', { name: 'REPORTS_CANCEL' }));
    await waitFor(() => expect(get).not.toHaveBeenCalled());
    get.mockRestore();
  });

  describe('Accessibility', () => {
    it('has no accessibility violations', async () => {
      const { container } = renderPage();
      expect(await axe(container)).toHaveNoViolations();
    });
  });
});
