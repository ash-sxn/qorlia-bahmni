import { lazy } from 'react';
import { Navigate, Route } from 'react-router-dom';
import { DocumentAccess } from '../components/DocumentAccess';
import { Routes, RouteConfig } from './model';

const IndexPage = lazy(() =>
  import('../pages/Index').then((module) => ({ default: module.IndexPage })),
);
const SearchPage = lazy(() =>
  import('../pages/Search').then((module) => ({ default: module.SearchPage })),
);

export const routes: Routes = [
  { path: '/', component: SearchPage, name: 'Search' },
  { path: 'search', component: SearchPage, name: 'Search' },
  {
    path: ':patientUuid',
    component: IndexPage,
    name: 'Index',
  },
];

export const renderRoutes = (routeConfigs: Routes) => {
  return [
    ...routeConfigs.map((route: RouteConfig) => (
      <Route
        key={route.path}
        path={route.path}
        element={
          <DocumentAccess>
            <route.component />
          </DocumentAccess>
        }
      />
    )),
    <Route key="not-found" path="*" element={<Navigate to="/" replace />} />,
  ];
};
