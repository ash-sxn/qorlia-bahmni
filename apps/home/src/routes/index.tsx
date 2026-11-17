import { lazy } from 'react';
import { Navigate, Route } from 'react-router-dom';
import { Routes, RouteConfig } from './model';

const HomePage = lazy(() =>
  import('../components/HomePage').then((module) => ({
    default: module.HomePage,
  })),
);
const BillingPage = lazy(() =>
  import('../components/Billing/BillingPage').then((module) => ({
    default: module.BillingPage,
  })),
);
const PolicyLibraryPage = lazy(() =>
  import('../components/PolicyLibrary/PolicyLibraryPage').then((module) => ({
    default: module.PolicyLibraryPage,
  })),
);
const PolicyDetailPage = lazy(() =>
  import('../components/PolicyLibrary/PolicyDetailPage').then((module) => ({
    default: module.PolicyDetailPage,
  })),
);
const InsuranceDeskPage = lazy(() =>
  import('../components/InsuranceDesk/InsuranceDeskPage').then((module) => ({
    default: module.InsuranceDeskPage,
  })),
);
const PatientRecordSearchPage = lazy(() =>
  import('../components/PatientRecord/PatientRecordSearchPage').then(
    (module) => ({ default: module.PatientRecordSearchPage }),
  ),
);
const PatientRecordPage = lazy(() =>
  import('../components/PatientRecord/PatientRecordPage').then((module) => ({
    default: module.PatientRecordPage,
  })),
);
const ReferralDirectoryPage = lazy(() =>
  import('../components/ReferralNetwork/ReferralDirectoryPage').then(
    (module) => ({ default: module.ReferralDirectoryPage }),
  ),
);
const ReferralLetterPage = lazy(() =>
  import('../components/ReferralNetwork/ReferralLetterPage').then((module) => ({
    default: module.ReferralLetterPage,
  })),
);
const PreauthWorksheetPage = lazy(() =>
  import('../components/InsuranceDesk/PreauthWorksheetPage').then((module) => ({
    default: module.PreauthWorksheetPage,
  })),
);
const TreatmentEstimatePage = lazy(() =>
  import('../components/TreatmentEstimate/TreatmentEstimatePage').then(
    (module) => ({ default: module.TreatmentEstimatePage }),
  ),
);
const DictationPage = lazy(() =>
  import('../components/Dictation/DictationPage').then((module) => ({
    default: module.DictationPage,
  })),
);
const CaseDetailPage = lazy(() =>
  import('../components/InsuranceDesk/CaseDetailPage').then((module) => ({
    default: module.CaseDetailPage,
  })),
);

export const routes: Routes = [
  { path: '/billing', component: BillingPage, name: 'Billing' },
  { path: '/policies', component: PolicyLibraryPage, name: 'PolicyLibrary' },
  {
    path: '/policies/:policyId',
    component: PolicyDetailPage,
    name: 'PolicyDetail',
  },
  { path: '/insurance', component: InsuranceDeskPage, name: 'InsuranceDesk' },
  {
    path: '/insurance/:caseId',
    component: CaseDetailPage,
    name: 'InsuranceCaseDetail',
  },
  {
    path: '/records',
    component: PatientRecordSearchPage,
    name: 'PatientRecordSearch',
  },
  {
    path: '/records/:patientUuid',
    component: PatientRecordPage,
    name: 'PatientRecord',
  },
  {
    path: '/referrals',
    component: ReferralDirectoryPage,
    name: 'ReferralDirectory',
  },
  {
    path: '/referrals/:entryId/letter',
    component: ReferralLetterPage,
    name: 'ReferralLetter',
  },
  {
    path: '/preauthorisation',
    component: PreauthWorksheetPage,
    name: 'PreauthWorksheet',
  },
  {
    path: '/estimate',
    component: TreatmentEstimatePage,
    name: 'TreatmentEstimate',
  },
  {
    path: '/dictation',
    component: DictationPage,
    name: 'Dictation',
  },
  {
    path: '/',
    component: HomePage,
    name: 'Home',
  },
];

export const renderRoutes = (routeConfigs: Routes) => {
  return [
    ...routeConfigs.map((route: RouteConfig) => (
      <Route key={route.path} path={route.path} element={<route.component />} />
    )),
    <Route key="not-found" path="*" element={<Navigate to="/" replace />} />,
  ];
};
