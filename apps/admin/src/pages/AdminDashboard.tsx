import { ModuleTileGrid } from '@bahmni/widgets';
import React from 'react';
import { AdminLayout } from '../components/AdminLayout';
import { ADMIN_CONFIG_APP, ADMIN_EXTENSION_POINT } from '../constants/app';

/**
 * Admin landing page.
 *
 * Mirrors the legacy AngularJS admin dashboard, which rendered a list of
 * config-driven links from the `org.bahmni.admin.dashboard` extension point.
 * The tiles use the same design as the home dashboard.
 */
export const AdminDashboard: React.FC = () => (
  <AdminLayout>
    <ModuleTileGrid
      extensionPointId={ADMIN_EXTENSION_POINT}
      appName={ADMIN_CONFIG_APP}
      loadingLabelKey="ADMIN_LOADING_MODULES"
      errorMessageKey="ADMIN_ERROR_FETCH_CONFIG"
      emptyMessageKey="ADMIN_NO_MODULES"
      reviewUrls={
        process.env.NODE_ENV !== 'production'
          ? {
              'bahmni.admin.csv': '/bahmni-v2/admin/csv',
              'bahmni.admin.csvExport': '/bahmni-v2/admin/csv-export',
              'bahmni.admin.auditLog': '/bahmni-v2/admin/audit-log',
              'bahmni.admin.orderSet': '/bahmni-v2/admin/order-sets',
            }
          : undefined
      }
      testId="admin-modules"
    />
  </AdminLayout>
);
