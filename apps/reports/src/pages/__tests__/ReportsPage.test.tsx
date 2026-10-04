import * as services from '@bahmni/services';
import {
  QueryClient,
  QueryClientProvider,
  useQuery,
} from '@tanstack/react-query';
import { render, screen, fireEvent } from '@testing-library/react';
import { axe, toHaveNoViolations } from 'jest-axe';
import { MemoryRouter } from 'react-router-dom';
import { reportRequestUrl } from '../reportService';
import { ReportsPage } from '../ReportsPage';

expect.extend(toHaveNoViolations);

jest.mock('@bahmni/services', () => ({
  ...jest.requireActual('@bahmni/services'),
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
    jest.clearAllMocks();
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

  describe('Accessibility', () => {
    it('has no accessibility violations', async () => {
      const { container } = renderPage();
      expect(await axe(container)).toHaveNoViolations();
    });
  });
});
