import { lazy } from 'react';
import { Navigate, Route } from 'react-router-dom';
import { Routes, RouteConfig } from './model';

const IndexPage = lazy(() =>
  import('../pages/').then((module) => ({ default: module.IndexPage })),
);

const AppointmentListPage = lazy(() =>
  import('../pages/AppointmentListPage').then((module) => ({
    default: module.AppointmentListPage,
  })),
);

const CalendarPage = lazy(() =>
  import('../pages/CalendarPage').then((module) => ({
    default: module.CalendarPage,
  })),
);

const AllServicesPage = lazy(() =>
  import('../pages/admin/allServices').then((module) => ({
    default: module.default,
  })),
);

const ServiceEditorPage = lazy(() =>
  import('../pages/admin/allServices/ServiceEditorPage').then((module) => ({
    default: module.ServiceEditorPage,
  })),
);

const AppointmentUnavailabilityPage = lazy(() =>
  import('../pages/admin/appointmentUnavailability').then((module) => ({
    default: module.default,
  })),
);

export const routes: Routes = [
  {
    path: '/',
    component: IndexPage,
    name: 'Index',
  },
  {
    path: '/list',
    component: AppointmentListPage,
    name: 'AppointmentList',
  },
  {
    path: '/calendar',
    component: CalendarPage,
    name: 'Calendar',
  },
  {
    path: '/awaiting',
    component: AppointmentListPage,
    name: 'AwaitingAppointments',
  },
  {
    path: '/admin/services',
    component: AllServicesPage,
    name: 'AdminAllServices',
  },
  {
    path: '/admin/services/:uuid',
    component: ServiceEditorPage,
    name: 'AdminServiceEditor',
  },
  {
    path: '/admin/unavailability',
    component: AppointmentUnavailabilityPage,
    name: 'AdminAppointmentUnavailability',
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
