import { type Module } from '@bahmni/services';

/**
 * Where each module sits in the side menu. Staff see the work they do every day
 * first; hospital modules next; money and management after that; technical tools
 * last, folded under Settings and admin.
 */
export type NavGroup = 'work' | 'hospital' | 'business' | 'admin';

export const NAV_GROUPS: NavGroup[] = ['work', 'hospital', 'business', 'admin'];

export interface ShellNavItem {
  id: string;
  label: string;
  href: string;
  icon: string;
  group: NavGroup;
  order: number;
}

interface Placement {
  group: NavGroup;
  /** i18n key and its English text, so every app shows the same words. */
  labelKey: string;
  label: string;
  icon?: string;
}

const APP_BASE = '/bahmni-v2';

export const TODAY_ID = 'qorlia.today';
export const PATIENTS_ID = 'qorlia.patient-record';
export const WARDS_ID = 'qorlia.wards';

const PLACEMENTS: Record<string, Placement> = {
  [TODAY_ID]: { group: 'work', labelKey: 'SHELL_NAV_TODAY', label: 'Today' },
  [PATIENTS_ID]: {
    group: 'work',
    labelKey: 'SHELL_NAV_PATIENTS',
    label: 'Patients',
  },
  [WARDS_ID]: { group: 'work', labelKey: 'SHELL_NAV_WARDS', label: 'Wards' },
  'bahmni.registration.new': {
    group: 'work',
    labelKey: 'SHELL_NAV_REGISTRATION',
    label: 'Registration',
  },
  'bahmni.registration': {
    group: 'work',
    labelKey: 'SHELL_NAV_REGISTRATION_CLASSIC',
    label: 'Registration (classic)',
  },
  'bahmni.appointment.scheduling': {
    group: 'work',
    labelKey: 'SHELL_NAV_APPOINTMENTS',
    label: 'Appointments',
  },
  'bahmni.clinical': {
    group: 'work',
    labelKey: 'SHELL_NAV_CLINICAL',
    label: 'Clinical worklists',
  },
  'bahmni.ipd': {
    group: 'hospital',
    labelKey: 'SHELL_NAV_ADMISSIONS',
    label: 'Admissions and discharge',
  },
  'bahmni.orders': {
    group: 'hospital',
    labelKey: 'SHELL_NAV_ORDERS',
    label: 'Orders',
  },
  'bahmni.ot': {
    group: 'hospital',
    labelKey: 'SHELL_NAV_OT',
    label: 'Operation theatre',
  },
  'bahmni.programs': {
    group: 'hospital',
    labelKey: 'SHELL_NAV_PROGRAMS',
    label: 'Programmes',
  },
  'bahmni.patient.document.upload': {
    group: 'hospital',
    labelKey: 'SHELL_NAV_DOCUMENTS',
    label: 'Patient documents',
  },
  'bahmni.radiology.document.upload': {
    group: 'hospital',
    labelKey: 'SHELL_NAV_RADIOLOGY',
    label: 'Radiology uploads',
  },
  'qorlia.billing': {
    group: 'business',
    labelKey: 'SHELL_NAV_BILLING',
    label: 'Billing',
  },
  'qorlia.insurance-desk': {
    group: 'business',
    labelKey: 'SHELL_NAV_INSURANCE',
    label: 'Insurance desk',
  },
  'qorlia.referral-network': {
    group: 'business',
    labelKey: 'SHELL_NAV_REFERRALS',
    label: 'Referral directory',
  },
  'qorlia.policy-library': {
    group: 'business',
    labelKey: 'SHELL_NAV_POLICIES',
    label: 'Policy library',
  },
  'qorlia.hospital-overview': {
    group: 'business',
    labelKey: 'SHELL_NAV_OVERVIEW',
    label: 'Hospital overview',
  },
  'bahmni.reports': {
    group: 'business',
    labelKey: 'SHELL_NAV_REPORTS',
    label: 'Reports',
  },
  'bahmni.admin': {
    group: 'admin',
    labelKey: 'SHELL_NAV_ADMIN',
    label: 'Admin',
  },
  'bahmni.implementer.interface': {
    group: 'admin',
    labelKey: 'SHELL_NAV_FORMS_BUILDER',
    label: 'Form builder',
  },
  'bahmni.atomfeed.console': {
    group: 'admin',
    labelKey: 'SHELL_NAV_SYNC_CONSOLE',
    label: 'Sync console',
  },
};

/** Qorlia's own pages, present wherever the user has the privilege. */
export const CORE_MODULES: Module[] = [
  {
    id: TODAY_ID,
    extensionPointId: 'qorlia.shell',
    type: 'link',
    label: 'Today',
    url: `${APP_BASE}/home`,
    order: 0,
    icon: 'fa-calendar-day',
  },
  {
    id: PATIENTS_ID,
    extensionPointId: 'qorlia.shell',
    type: 'link',
    label: 'Patients',
    url: `${APP_BASE}/home/records`,
    order: 1,
    icon: 'fa-user-group',
    requiredPrivilege: 'app:clinical',
  },
  {
    id: WARDS_ID,
    extensionPointId: 'qorlia.shell',
    type: 'link',
    label: 'Wards',
    url: `${APP_BASE}/home/wards`,
    order: 2,
    icon: 'fa-bed',
    requiredPrivilege: 'app:adt',
  },
  {
    id: 'qorlia.billing',
    extensionPointId: 'qorlia.shell',
    type: 'link',
    label: 'Billing',
    url: `${APP_BASE}/home/billing`,
    order: 14,
    icon: 'fa-file-invoice-dollar',
    exclusiveOnlineModule: true,
  },
  {
    id: 'qorlia.hospital-overview',
    extensionPointId: 'qorlia.shell',
    type: 'link',
    label: 'Hospital overview',
    url: `${APP_BASE}/home/overview`,
    order: 17,
    icon: 'fa-chart-column',
    requiredPrivilege: 'app:reports',
    exclusiveOnlineModule: true,
  },
];

/**
 * The page each person lands on after signing in, from what they are allowed to do:
 * whoever consults starts on their queue, ward staff on the wards, the front desk on
 * arrivals and appointments, and someone who only reads reports on the overview.
 */
export type Landing = 'today' | 'wards' | 'frontdesk' | 'overview';

export const landingFor = (privilegeNames: string[]): Landing => {
  const has = (name: string) => privilegeNames.includes(name);
  if (has('app:clinical:consultationTab')) return 'today';
  if (has('app:adt')) return 'wards';
  if (has('app:registration') || has('app:appointments')) return 'frontdesk';
  if (has('app:reports')) return 'overview';
  return 'today';
};

/** Config URLs are absolute (`/bahmni/...`) or relative to the new interface. */
export const resolveModuleUrl = (url: string) => {
  if (!url) return '';
  if (/^(https?:)?\/\//.test(url) || url.startsWith('/')) return url;
  return `${APP_BASE}/${url.replace(/^\.?\//, '')}`;
};

export const toNavItems = (
  modules: Module[],
  translate: (key: string, fallback: string) => string,
  reviewUrls?: Record<string, string>,
): ShellNavItem[] => {
  const seen = new Set<string>();
  return modules
    .filter((module) => {
      if (seen.has(module.id)) return false;
      seen.add(module.id);
      return true;
    })
    .map((module) => {
      const place = PLACEMENTS[module.id];
      const configured = module.translationKey ?? module.label;
      return {
        id: module.id,
        label: place
          ? translate(place.labelKey, place.label)
          : translate(configured, configured),
        href: resolveModuleUrl(reviewUrls?.[module.id] ?? module.url),
        icon: place?.icon ?? module.icon ?? 'fa-circle',
        group: place?.group ?? 'hospital',
        order: module.order ?? 0,
      };
    })
    .filter((item) => item.href !== '')
    .sort((a, b) => a.order - b.order);
};

/** The item for the page being shown: the longest matching address wins. */
export const activeItemId = (items: ShellNavItem[], pathname: string) => {
  const path = pathname.replace(/\/+$/, '');
  let best: ShellNavItem | undefined;
  for (const item of items) {
    const href = item.href.split(/[?#]/)[0].replace(/\/+$/, '');
    if (!href) continue;
    const matches = path === href || path.startsWith(`${href}/`);
    if (matches && (!best || href.length > best.href.length)) best = item;
  }
  return best?.id;
};
