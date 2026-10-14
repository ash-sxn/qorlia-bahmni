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

export const routes: Routes = [
  { path: '/billing', component: BillingPage, name: 'Billing' },
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
