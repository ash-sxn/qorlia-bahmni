import { lazy } from 'react';
import { WidgetConfig } from './model';

export const builtInWidgets: WidgetConfig[] = [
  {
    type: 'allergies',
    readPrivileges: ['Get Allergies'],
    component: lazy(() => import('../allergies/AllergiesTable')),
  },
  {
    type: 'appointments',
    readPrivileges: ['Get Appointments'],
    component: lazy(() => import('../appointments/AppointmentsTable')),
  },
  {
    type: 'conditions',
    component: lazy(() => import('../conditions/ConditionsTable')),
  },
  {
    type: 'diagnoses',
    readPrivileges: ['Get Diagnoses'],
    component: lazy(() => import('../diagnoses/DiagnosesTable')),
  },
  {
    type: 'patientDocuments',
    component: lazy(() => import('../documents/DocumentsTable')),
  },
  {
    type: 'flowSheet',
    component: lazy(() => import('../vitalFlowSheet/VitalFlowSheet')),
  },
  {
    type: 'forms',
    component: lazy(() => import('../forms/FormsTable')),
  },
  {
    type: 'labOrders',
    readPrivileges: ['Get Orders'],
    component: lazy(() => import('../labinvestigation/LabInvestigation')),
  },
  {
    type: 'observations',
    component: lazy(() => import('../observations/Observations')),
  },
  {
    type: 'ordersControl',
    readPrivileges: ['Get Orders'],
    component: lazy(
      () => import('../genericServiceRequest/GenericServiceRequestTable'),
    ),
  },
  {
    type: 'pacsOrders',
    readPrivileges: ['Get Orders'],
    component: lazy(
      () => import('../radiologyInvestigation/RadiologyInvestigationTable'),
    ),
  },
  {
    type: 'programs',
    component: lazy(() => import('../patientPrograms/PatientProgramsTable')),
  },
  {
    type: 'treatment',
    readPrivileges: ['Get Orders'],
    component: lazy(() => import('../medications/MedicationsTable')),
  },
  {
    type: 'immunizationHistory',
    readPrivileges: ['Get Immunizations'],
    component: lazy(() => import('../immunizationHistory/ImmunizationHistory')),
  },
  {
    type: 'tasksControl',
    component: lazy(() => import('../tasks/TaskList')),
  },
];
