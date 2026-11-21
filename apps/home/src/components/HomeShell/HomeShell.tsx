import { type Module } from '@bahmni/services';
import { AppShell, ShellProvider } from '@bahmni/widgets';
import React, { ReactNode, useMemo } from 'react';
import { HOME_EXTENSION_POINT } from '../../constants/app';
import { hasCases, loadCases } from '../InsuranceDesk/caseCatalogue';
import {
  hasPolicyEntries,
  loadPolicyCatalogue,
} from '../PolicyLibrary/policyCatalogue';
import {
  hasReferralEntries,
  loadDirectory,
} from '../ReferralNetwork/referralDirectory';

/** Review builds open the new interface where a module has one. */
export const REVIEW_URLS: Record<string, string> = {
  'bahmni.registration.new': '/bahmni-v2/registration/search',
  'bahmni.programs': '/bahmni-v2/clinical/programs',
  'bahmni.clinical': '/bahmni-v2/clinical/',
  'bahmni.ipd': '/bahmni-v2/clinical/inpatient',
  'bahmni.admin': '/bahmni-v2/admin',
  'bahmni.reports': '/bahmni-v2/reports/',
  'bahmni.ot': '/bahmni-v2/clinical/operation-theatre',
  'bahmni.orders': '/bahmni-v2/clinical/orders',
  'bahmni.appointment.scheduling': '/bahmni-v2/appointments/',
  'bahmni.patient.document.upload':
    '/bahmni-v2/patient-documents/search?encounterType=Patient%20Document&topLevelConcept=Patient%20Document&defaultOption=Patient%20file',
  'bahmni.radiology.document.upload':
    '/bahmni-v2/patient-documents/search?encounterType=RADIOLOGY&topLevelConcept=All%20Radiology%20orders',
};

const contentModule = (
  id: string,
  label: string,
  url: string,
  order: number,
  icon: string,
  requiredPrivilege?: string,
): Module => ({
  id,
  extensionPointId: HOME_EXTENSION_POINT,
  type: 'link',
  label,
  url,
  order,
  icon,
  requiredPrivilege,
  exclusiveOnlineModule: true,
});

/**
 * Pages that only appear once they have approved content: an empty directory or
 * library would open a page with nothing on it.
 */
export const useContentModules = () =>
  useMemo(
    () => [
      ...(hasReferralEntries(loadDirectory())
        ? [
            contentModule(
              'qorlia.referral-network',
              'Referral directory',
              '/bahmni-v2/home/referrals',
              15,
              'fa-user-doctor',
              // Referral letters are written by whoever consults.
              'app:clinical:consultationTab',
            ),
          ]
        : []),
      ...(hasPolicyEntries(loadPolicyCatalogue())
        ? [
            contentModule(
              'qorlia.policy-library',
              'Policy library',
              '/bahmni-v2/home/policies',
              16,
              'fa-book-open',
              'app:reports',
            ),
          ]
        : []),
      ...(hasCases(loadCases())
        ? [
            contentModule(
              'qorlia.insurance-desk',
              'Insurance desk',
              '/bahmni-v2/home/insurance',
              15.5,
              'fa-file-shield',
              // The insurance (TPA) desk sits with registration.
              'app:registration',
            ),
          ]
        : []),
    ],
    [],
  );

interface HomeShellProps {
  children: ReactNode;
  activeNavId?: string;
  /** The page draws its own Header; give it the shared menu and top bar only. */
  ownHeader?: boolean;
}

/** The Qorlia frame for every page of the home app. */
export const HomeShell: React.FC<HomeShellProps> = ({
  children,
  activeNavId,
  ownHeader = false,
}) => {
  const extraModules = useContentModules();
  const props = {
    activeNavId,
    extraModules,
    reviewUrls: process.env.NODE_ENV !== 'production' ? REVIEW_URLS : undefined,
  };
  return ownHeader ? (
    <ShellProvider {...props}>{children}</ShellProvider>
  ) : (
    <AppShell {...props}>{children}</AppShell>
  );
};
