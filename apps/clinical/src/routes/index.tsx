import { lazy, ReactElement } from 'react';
import { Route } from 'react-router-dom';
import { Routes, RouteConfig } from './model';

const ConsultationPage = lazy(() => import('../pages/ConsultationPage'));

const ClinicalList = lazy(() => import('../pages/list'));
const BedManagement = lazy(() => import('../pages/BedManagement'));
const InpatientPatientList = lazy(
  () => import('../pages/InpatientPatientList'),
);
const InpatientPatientDetails = lazy(
  () => import('../pages/InpatientPatientDetails'),
);
const ProgramsPage = lazy(() => import('../pages/ProgramsPage'));
const OperationTheatrePage = lazy(
  () => import('../pages/OperationTheatrePage'),
);
const SurgicalBlockEditor = lazy(() => import('../pages/SurgicalBlockEditor'));

export const routes: Routes = [
  {
    path: 'operation-theatre/new',
    component: SurgicalBlockEditor,
  },
  {
    path: 'operation-theatre/:blockUuid',
    component: SurgicalBlockEditor,
  },
  {
    path: 'operation-theatre',
    component: OperationTheatrePage,
  },
  {
    path: 'programs/:patientUuid',
    component: ProgramsPage,
  },
  {
    path: 'programs',
    component: ProgramsPage,
  },
  {
    path: 'inpatient/:patientUuid',
    component: InpatientPatientDetails,
  },
  {
    path: 'inpatient',
    component: InpatientPatientList,
  },
  {
    path: 'beds',
    component: BedManagement,
  },
  {
    path: ':patientUuid',
    component: ConsultationPage,
  },
  {
    path: '/',
    component: ClinicalList,
  },
];

export const renderRoutes = (routeConfigs: Routes): ReactElement[] => {
  return routeConfigs.map((route: RouteConfig) => (
    <Route key={route.path} path={route.path} element={<route.component />} />
  ));
};
