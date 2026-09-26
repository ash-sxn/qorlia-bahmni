import { del, get, post } from '../api';
import { getDisplayNameForConcept } from '../conceptService';
import { isDate } from '../date/date';
import { AttributeFormat } from '../patientService/attributeFormatMapper';
import {
  PATIENT_PROGRAMS_URL,
  PATIENT_PROGRAMS_PAGE_URL,
  PROGRAM_DETAILS_URL,
  PROGRAMS_URL,
  ALL_PROGRAMS_URL,
  PROGRAM_ATTRIBUTE_TYPES_URL,
  PROGRAM_ENROLLMENTS_URL,
  PROGRAM_STATE_URL,
} from './constants';
import {
  NewProgramEnrollment,
  PatientProgramsResponse,
  Program,
  ProgramAttributeDefinition,
  ProgramEnrollment,
  ProgramsResponse,
} from './model';

/**
 * Fetches programs for a given patient UUID
 * @param patientUUID - The UUID of the patient
 * @returns Promise resolving to a list containing programs
 */
export const getPatientPrograms = async (
  patientUUID: string,
): Promise<PatientProgramsResponse> => {
  return await get<PatientProgramsResponse>(PATIENT_PROGRAMS_URL(patientUUID));
};

export interface ProgramPage {
  programs: ProgramEnrollment[];
  total: number | undefined;
}

/**
 * Fetches a single page of patient programs using offset-based pagination.
 * Uses startIndex = (page - 1) * count to jump directly to any page.
 * @param patientUUID - The UUID of the patient
 * @param count - Number of items per page (default 15)
 * @param page - 1-based page number (default 1)
 * @returns Promise resolving to a ProgramPage with programs and total count
 */
export const getPatientProgramsPage = async (
  patientUUID: string,
  count: number = 15,
  page: number = 1,
): Promise<ProgramPage> => {
  const startIndex = (page - 1) * count;
  const response = await get<PatientProgramsResponse>(
    PATIENT_PROGRAMS_PAGE_URL(patientUUID, count, startIndex),
  );
  return {
    programs: response.results,
    total: response.totalCount,
  };
};

/**
 * Fetches program for a given program UUID
 * @param programUUID - The UUID of the program
 * @returns Promise resolving to a program
 */
export const getProgramByUUID = async (
  programUUID: string,
): Promise<ProgramEnrollment> => {
  return await get<ProgramEnrollment>(PROGRAM_DETAILS_URL(programUUID));
};

/**
 * Updates the state of a program enrollment
 * @param programEnrollmentUUID - The UUID of the program enrollment to update
 * @param workflowStateUUID - The UUID of the allowed workflow state to set for the program enrollment
 * @returns Promise resolving to the updated program enrollment
 */
export const updateProgramState = async (
  programEnrollmentUUID: string,
  workflowStateUUID: string,
): Promise<ProgramEnrollment> => {
  const current = await getProgramByUUID(programEnrollmentUUID);
  if (current.voided || current.dateCompleted) {
    throw new Error('Only active program enrollments can change state');
  }
  const body = {
    uuid: programEnrollmentUUID,
    dateEnrolled: current.dateEnrolled,
    states: [
      {
        state: { uuid: workflowStateUUID },
      },
    ],
  };
  return await post<ProgramEnrollment>(
    PROGRAMS_URL(programEnrollmentUUID),
    body,
  );
};

export const completeProgramEnrollment = async (
  enrollmentUUID: string,
  dateCompleted: string,
  outcomeUUID: string,
): Promise<ProgramEnrollment> => {
  const current = await getProgramByUUID(enrollmentUUID);
  if (current.voided || current.dateCompleted) {
    throw new Error('Only active program enrollments can be completed');
  }
  return post<ProgramEnrollment>(PROGRAMS_URL(enrollmentUUID), {
    uuid: enrollmentUUID,
    dateEnrolled: current.dateEnrolled,
    dateCompleted,
    outcome: outcomeUUID,
  });
};

export const voidProgramEnrollment = async (
  enrollmentUUID: string,
): Promise<void> =>
  del<void>(
    `${PROGRAMS_URL(enrollmentUUID)}?${new URLSearchParams({ reason: 'Removed from the Qorlia program manager' })}`,
  );

export const removeProgramState = async (
  enrollmentUUID: string,
  stateUUID: string,
): Promise<void> =>
  del<void>(
    `${PROGRAM_STATE_URL(enrollmentUUID, stateUUID)}?${new URLSearchParams({ reason: 'User removed the current state' })}`,
  );

export const updateProgramEnrollmentDetails = async (
  enrollmentUUID: string,
  date: string,
  definitions: ProgramAttributeDefinition[],
  values: Record<string, string>,
): Promise<ProgramEnrollment> => {
  const current = await getProgramByUUID(enrollmentUUID);
  if (current.voided || current.dateCompleted) {
    throw new Error('Only active program enrollments can be edited');
  }
  const today = new Date();
  const maxDate = [
    [
      today.getFullYear(),
      String(today.getMonth() + 1).padStart(2, '0'),
      String(today.getDate()).padStart(2, '0'),
    ].join('-'),
    ...(current.states ?? [])
      .filter((state) => !state.voided)
      .map((state) => state.startDate.slice(0, 10)),
  ].sort()[0];
  const enrolledAt = new Date(`${date}T00:00:00`);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
    Number.isNaN(enrolledAt.getTime()) ||
    [
      enrolledAt.getFullYear(),
      String(enrolledAt.getMonth() + 1).padStart(2, '0'),
      String(enrolledAt.getDate()).padStart(2, '0'),
    ].join('-') !== date ||
    date > maxDate
  ) {
    throw new Error('Enrollment date must be on or before the first state');
  }
  const attributes = definitions.flatMap<{
    uuid?: string;
    attributeType: { uuid: string };
    value?: string;
    hydratedObject?: string;
    voided?: boolean;
  }>((definition) => {
    const existing = (current.attributes ?? []).find(
      (attribute) =>
        !attribute.voided && attribute.attributeType.uuid === definition.uuid,
    );
    const value = values[definition.uuid] ?? '';
    const currentValue = existing?.value;
    const original =
      typeof currentValue === 'string'
        ? definition.datatypeClassname === AttributeFormat.CONCEPT
          ? (definition.concept?.answers?.find(
              (answer) =>
                answer.display === currentValue ||
                answer.name?.display === currentValue,
            )?.uuid ?? currentValue)
          : currentValue.slice(
              0,
              definition.datatypeClassname ===
                AttributeFormat.ATTRIBUTABLE_DATE ||
                definition.datatypeClassname === AttributeFormat.DATE_DATATYPE
                ? 10
                : undefined,
            )
        : (currentValue?.uuid ?? '');
    if (value === original) return [];
    if (!value) {
      return existing
        ? [
            {
              uuid: existing.uuid,
              attributeType: { uuid: definition.uuid },
              voided: true,
            },
          ]
        : [];
    }
    const answer = definition.concept?.answers?.find(
      (item) => item.uuid === value,
    );
    if (definition.datatypeClassname === AttributeFormat.CONCEPT && !answer) {
      throw new Error(`Invalid concept answer for ${definition.name}`);
    }
    return [
      {
        ...(existing && { uuid: existing.uuid }),
        attributeType: { uuid: definition.uuid },
        value:
          definition.datatypeClassname === AttributeFormat.CONCEPT
            ? (answer?.name?.display ?? answer?.display ?? '')
            : value,
        ...(definition.datatypeClassname === AttributeFormat.CONCEPT && {
          hydratedObject: value,
        }),
      },
    ];
  });
  return post<ProgramEnrollment>(PROGRAMS_URL(enrollmentUUID), {
    uuid: enrollmentUUID,
    dateEnrolled: enrolledAt.toISOString(),
    attributes,
  });
};

/**
 * Gets the current state name of a program enrollment
 * @param enrollment - The program enrollment object
 * @returns The name of the current state or null if not available
 */
export function getCurrentStateName(
  enrollment: ProgramEnrollment,
): string | null {
  const states = enrollment.states.filter((state) => !state.voided);
  if (states.length === 0) {
    return null;
  }

  let currentState;

  if (enrollment.dateCompleted !== null) {
    const statesWithEndDate = states.filter((state) => state.endDate !== null);
    const sortedStates = statesWithEndDate.sort((a, b) => {
      const dateA = new Date(a.auditInfo.dateCreated).getTime();
      const dateB = new Date(b.auditInfo.dateCreated).getTime();
      return dateA - dateB;
    });
    currentState = sortedStates[sortedStates.length - 1];
  } else {
    currentState = states.find((state) => state.endDate === null);
  }

  if (!currentState) {
    return null;
  }

  return (
    getDisplayNameForConcept(currentState.state.concept.names) ??
    currentState.state.concept.display
  );
}

/**
 * Extracts attributes from a program enrollment based on provided attribute names
 * @param enrollment - The program enrollment object
 * @param programAttributes - List of attribute names to extract
 * @returns A map of attribute names to their values or null if not available
 */
export function extractAttributes(
  enrollment: ProgramEnrollment,
  programAttributes: string[],
): Record<string, string | Date | null> {
  if (programAttributes.length === 0) {
    return {};
  }

  const attributesMap: Record<string, string | Date | null> = {};

  for (const attributeName of programAttributes) {
    const foundAttribute = enrollment.attributes.find(
      (attr) => attr.attributeType.display === attributeName,
    );
    if (foundAttribute) {
      if (typeof foundAttribute.value === 'string') {
        if (isDate(foundAttribute.value)) {
          attributesMap[attributeName] = new Date(foundAttribute.value);
        } else {
          attributesMap[attributeName] = foundAttribute.value;
        }
      } else {
        attributesMap[attributeName] = foundAttribute.value.name!.name;
      }
    } else {
      attributesMap[attributeName] = null;
    }
  }

  return attributesMap;
}

/**
 * Fetches all programs configured across all locations
 * @returns Promise resolving to a list of programs
 */
export const getAllPrograms = async (): Promise<Program[]> => {
  const response = await get<ProgramsResponse>(ALL_PROGRAMS_URL);
  return response.results;
};

export const getProgramAttributeTypes = async (): Promise<
  ProgramAttributeDefinition[]
> => {
  const response = await get<{ results: ProgramAttributeDefinition[] }>(
    PROGRAM_ATTRIBUTE_TYPES_URL,
  );
  return response.results.filter((attribute) => !attribute.retired);
};

export const createProgramEnrollment = async (
  enrollment: NewProgramEnrollment,
): Promise<ProgramEnrollment> =>
  post<ProgramEnrollment>(PROGRAM_ENROLLMENTS_URL, enrollment);
