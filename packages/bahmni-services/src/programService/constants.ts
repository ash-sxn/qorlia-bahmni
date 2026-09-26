import { OPENMRS_REST_V1 } from '../constants/app';

const PROGRAM_ENROLLMENT_CUSTOM_REP =
  'custom:(uuid,episodeUuid,patient,program,display,dateEnrolled,dateCompleted,location,voided,allowedStates,outcome,states:(uuid,startDate,endDate,voided,state:(uuid,concept:(uuid,display,name,names)),auditInfo),auditInfo,attributes)';
export const ALL_PROGRAMS_URL = `${OPENMRS_REST_V1}/program?v=default`;
export const PROGRAM_ATTRIBUTE_TYPES_URL = `${OPENMRS_REST_V1}/programattributetype?v=custom:(uuid,name,retired,description,datatypeClassname,datatypeConfig,concept)`;
export const PROGRAM_ENROLLMENTS_URL = `${OPENMRS_REST_V1}/bahmniprogramenrollment`;

export const PATIENT_PROGRAMS_URL = (patientUUID: string) =>
  `${PROGRAM_ENROLLMENTS_URL}?patient=${patientUUID}&v=${PROGRAM_ENROLLMENT_CUSTOM_REP}`;
export const PATIENT_PROGRAMS_PAGE_URL = (
  patientUUID: string,
  limit: number = 15,
  startIndex: number = 0,
) =>
  `${PROGRAM_ENROLLMENTS_URL}?patient=${patientUUID}&v=${PROGRAM_ENROLLMENT_CUSTOM_REP}&limit=${limit}&startIndex=${startIndex}&totalCount=true`;
export const PROGRAMS_URL = (programUUID: string) =>
  `${PROGRAM_ENROLLMENTS_URL}/${programUUID}`;
export const PROGRAM_STATE_URL = (enrollmentUUID: string, stateUUID: string) =>
  `${OPENMRS_REST_V1}/programenrollment/${encodeURIComponent(enrollmentUUID)}/state/${encodeURIComponent(stateUUID)}`;
export const PROGRAM_DETAILS_URL = (programUUID: string) =>
  `${PROGRAMS_URL(programUUID)}?v=${PROGRAM_ENROLLMENT_CUSTOM_REP}`;
