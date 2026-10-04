import { HeaderSideNavItem } from '@bahmni/design-system';
import {
  hasPrivilege,
  PATIENT_NOT_FOUND_ERROR_KEY,
  type UserPrivilege,
} from '@bahmni/services';
import { Dashboard } from '../providers/clinicalConfig/models';
import {
  DashboardConfig,
  DashboardSectionConfig,
  ControlConfig,
} from './models';

export const getDefaultDashboard = (
  dashboards: Dashboard[],
): Dashboard | null => {
  if (dashboards.length === 0) {
    return null;
  }

  const defaultDashboard = dashboards.find(
    (dashboard) => dashboard.default === true,
  );

  if (defaultDashboard) {
    return defaultDashboard;
  }

  return dashboards[0];
};

export const filterControlsByPrivileges = (
  controls: ControlConfig[],
  userPrivileges: UserPrivilege[],
): ControlConfig[] => {
  return controls.filter(
    (control) =>
      !control.requiredPrivileges?.length ||
      hasPrivilege(userPrivileges, control.requiredPrivileges),
  );
};

export const filterSectionsByPrivileges = (
  sections: DashboardSectionConfig[],
  userPrivileges: UserPrivilege[],
): DashboardSectionConfig[] => {
  return sections
    .map((section) => ({
      ...section,
      controls: filterControlsByPrivileges(section.controls, userPrivileges),
    }))
    .filter((section) => section.controls.length > 0);
};

// getFormattedError (shared errorHandling) classifies a failed patient-resource
// fetch (400/404) as PATIENT_NOT_FOUND_ERROR_KEY. We key off it to surface a
// single "patient not found" message and hold back the patient-scoped widgets.
export const isPatientNotFoundError = (error: unknown): boolean => {
  const message =
    typeof error === 'string'
      ? error
      : error instanceof Error
        ? error.message
        : '';
  return message === PATIENT_NOT_FOUND_ERROR_KEY;
};

export const getSidebarItems = (
  dashboardConfig: DashboardConfig,
  t: (key: string) => string,
): HeaderSideNavItem[] => {
  return dashboardConfig.sections.map((section) => ({
    id: section.id!,
    icon: section.icon,
    label: t(section.translationKey ?? section.name),
  }));
};
