import { render, screen } from '@testing-library/react';
import { Suspense } from 'react';
import { MemoryRouter, Routes } from 'react-router-dom';
import { renderRoutes, routes } from '../index';

jest.mock('../../components/PrivilegeGuard', () => ({
  PrivilegeGuard: ({ children }: { children: React.ReactNode }) => children,
}));

jest.mock('../../components/AdminLayout', () => ({
  AdminLayout: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="admin-layout-test-id">{children}</div>
  ),
}));

// Routing only needs to know the right page resolved, not how each page
// renders internally, so stub the pages out. This also keeps the assertions
// from racing the lazy-loaded pages' real dynamic import against
// findByTestId's timeout under load.
jest.mock('../../pages/AdminDashboard', () => ({
  AdminDashboard: () => <div data-testid="admin-dashboard-page-test-id" />,
}));

jest.mock('../../pages/CsvUpload', () => ({
  CsvUpload: () => <div data-testid="admin-csv-upload-page-test-id" />,
}));

jest.mock('../../pages/CsvExport', () => ({
  CsvExport: () => <div data-testid="admin-csv-export-page-test-id" />,
}));

jest.mock('../../pages/AuditLog', () => ({
  AuditLog: () => <div data-testid="admin-audit-log-page-test-id" />,
}));

jest.mock('../../pages/OrderSets', () => ({
  OrderSets: () => <div data-testid="admin-order-sets-page-test-id" />,
}));

const renderAt = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Suspense fallback={<div data-testid="loading-test-id" />}>
        <Routes>{renderRoutes(routes)}</Routes>
      </Suspense>
    </MemoryRouter>,
  );

describe('routes', () => {
  it('resolves / to the admin dashboard', async () => {
    renderAt('/');

    expect(
      await screen.findByTestId('admin-dashboard-page-test-id'),
    ).toBeInTheDocument();
  });

  it('resolves /csv to the CSV upload page without a 404', async () => {
    renderAt('/csv');

    expect(
      await screen.findByTestId('admin-csv-upload-page-test-id'),
    ).toBeInTheDocument();
  });

  it('resolves /csv-export to concept export', async () => {
    renderAt('/csv-export');
    expect(await screen.findByTestId('admin-csv-export-page-test-id')).toBeInTheDocument();
  });

  it('resolves /audit-log to the audit viewer', async () => {
    renderAt('/audit-log');
    expect(await screen.findByTestId('admin-audit-log-page-test-id')).toBeInTheDocument();
  });

  it('resolves order set list and editor routes', async () => {
    renderAt('/order-sets');
    expect(await screen.findByTestId('admin-order-sets-page-test-id')).toBeInTheDocument();
    renderAt('/order-sets/new');
    expect(await screen.findAllByTestId('admin-order-sets-page-test-id')).toHaveLength(2);
  });

  // NOTE: this asserts the catch-all resolves to `/` within this route table,
  // which is what the component does. It is NOT a claim about where the user
  // ends up in the running app: mounted under the distro's `/bahmni-v2/`
  // basename, `<Navigate to="/">` leaves the admin app entirely and lands on
  // home. Legacy Bahmni used `otherwise('/dashboard')` and stayed inside
  // admin. Every app in this repo shares the `Navigate to="/"` pattern, so
  // changing it is a repo-wide decision, not an admin-local one.
  it('sends unknown paths to the route table root', async () => {
    renderAt('/unknown-path');

    expect(
      await screen.findByTestId('admin-dashboard-page-test-id'),
    ).toBeInTheDocument();
  });
});
