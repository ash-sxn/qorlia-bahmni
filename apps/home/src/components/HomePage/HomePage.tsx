import { landingFor, useShellNavigation } from '@bahmni/widgets';
import React from 'react';
import { Navigate } from 'react-router-dom';
import { TodayPage } from '../Today';

/**
 * Each person lands on the work they do: ward staff on the wards, someone who only
 * reads reports on the overview, everyone else on Today (the queue or front desk).
 */
export const HomePage: React.FC = () => {
  const { loading, privilegeNames } = useShellNavigation();
  // Wait for the permissions, so nobody sees Today flash before their own page.
  if (loading) return null;
  const landing = landingFor(privilegeNames);
  if (landing === 'wards') return <Navigate to="/wards" replace />;
  if (landing === 'overview') return <Navigate to="/overview" replace />;
  return <TodayPage />;
};
