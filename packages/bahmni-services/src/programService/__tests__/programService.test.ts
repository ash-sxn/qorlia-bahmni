import { del, get, post } from '../../api';
import { mockEnrollments, patientUUID, mockPrograms } from '../__mocks__/mocks';
import {
  PROGRAM_DETAILS_URL,
  PATIENT_PROGRAMS_URL,
  PATIENT_PROGRAMS_PAGE_URL,
  ALL_PROGRAMS_URL,
  PROGRAM_ATTRIBUTE_TYPES_URL,
  PROGRAM_ENROLLMENTS_URL,
} from '../constants';
import {
  ProgramEnrollment,
  PatientProgramsResponse,
  ProgramsResponse,
} from '../model';
import {
  extractAttributes,
  getAllPrograms,
  getProgramAttributeTypes,
  createProgramEnrollment,
  completeProgramEnrollment,
  voidProgramEnrollment,
  removeProgramState,
  updateProgramEnrollmentDetails,
  getCurrentStateName,
  getPatientPrograms,
  getPatientProgramsPage,
  getProgramByUUID,
  updateProgramState,
} from '../programService';

jest.mock('../../api');

describe('programService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getPatientProgramEnrollments', () => {
    it('should fetch and return program enrollments for a valid patient UUID', async () => {
      const mockResponse: PatientProgramsResponse = {
        results: mockEnrollments,
      };

      (get as jest.Mock).mockResolvedValue(mockResponse);

      const result = await getPatientPrograms(patientUUID);

      expect(result).toEqual(mockResponse);
      expect(get).toHaveBeenCalledWith(PATIENT_PROGRAMS_URL(patientUUID));
    });

    it('should return empty array when no enrollments exist', async () => {
      const mockResponse: PatientProgramsResponse = { results: [] };

      (get as jest.Mock).mockResolvedValue(mockResponse);

      const result = await getPatientPrograms(patientUUID);

      expect(result).toEqual(mockResponse);
    });
  });

  describe('getProgramByUUID', () => {
    it('should fetch and return program enrollment for a valid program UUID', async () => {
      const programUUID = 'enrollment-1';
      const mockProgramEnrollment: ProgramEnrollment = mockEnrollments[0];

      (get as jest.Mock).mockResolvedValue(mockProgramEnrollment);

      const result = await getProgramByUUID(programUUID);

      expect(result).toEqual(mockProgramEnrollment);
      expect(get).toHaveBeenCalledWith(PROGRAM_DETAILS_URL(programUUID));
    });
  });

  describe('extractAttributes', () => {
    it('should extract return empty map if no attributes are provided', () => {
      const mockEnrollment: ProgramEnrollment = mockEnrollments[0];
      const result = extractAttributes(mockEnrollment, []);
      expect(result).toEqual({});
    });

    it('should extract attributes based on provided attribute names', () => {
      const mockEnrollment: ProgramEnrollment = {
        ...mockEnrollments[0],
      };

      const result = extractAttributes(mockEnrollment, [
        'ID_Number',
        'Patient Stage',
        'Treatment Date',
      ]);

      expect(result).toEqual({
        ID_Number: '123145',
        'Patient Stage': 'Initial Stage',
        'Treatment Date': new Date('2026-02-04T00:00:00.000+0000'),
      });
    });

    it('should return null if attribute does not exist for provided attribute names', () => {
      const mockEnrollment: ProgramEnrollment = {
        ...mockEnrollments[0],
      };

      const result = extractAttributes(mockEnrollment, [
        'Non_Existent_Attribute',
      ]);

      expect(result).toEqual({
        Non_Existent_Attribute: null,
      });
    });

    it('should convert ISO date string attribute values to Date objects', () => {
      const result = extractAttributes(mockEnrollments[0], ['Treatment Date']);

      expect(result['Treatment Date']).toBeInstanceOf(Date);
      expect((result['Treatment Date'] as Date).toISOString()).toBe(
        new Date('2026-02-04T00:00:00.000+0000').toISOString(),
      );
    });

    it('should keep non-date string attribute values as strings', () => {
      const result = extractAttributes(mockEnrollments[0], ['ID_Number']);

      expect(result['ID_Number']).toBe('123145');
    });
  });

  describe('getCurrentStateName', () => {
    it('should return null if there are no states', () => {
      const mockEnrollment: ProgramEnrollment = {
        ...mockEnrollments[0],
        states: [],
      };

      const result = getCurrentStateName(mockEnrollment);
      expect(result).toBeNull();
    });

    it('should return the latest state name if the program is completed', () => {
      const mockEnrollment: ProgramEnrollment = mockEnrollments[2];

      const result = getCurrentStateName(mockEnrollment);
      expect(result).toBe('Phase de continuation');
    });

    it('should return the active state name if the program is not completed', () => {
      const mockEnrollment: ProgramEnrollment = mockEnrollments[1];

      const result = getCurrentStateName(mockEnrollment);
      expect(result).toBe('In Progress');
    });

    it('ignores voided states when finding the current state', () => {
      const mockEnrollment: ProgramEnrollment = {
        ...mockEnrollments[1],
        states: [
          { ...mockEnrollments[1].states[1], voided: true },
          mockEnrollments[1].states[0],
        ],
      };

      expect(getCurrentStateName(mockEnrollment)).toBeNull();
    });

    it('should return SHORT name when available', () => {
      const result = getCurrentStateName(mockEnrollments[1]);
      expect(result).toBe('In Progress');
    });

    it('should return FULLY_SPECIFIED name when SHORT not available', () => {
      const result = getCurrentStateName(mockEnrollments[2]);
      expect(result).toBe('Phase de continuation');
    });

    it('should fallback to display when names array is empty', () => {
      const result = getCurrentStateName(mockEnrollments[3]);
      expect(result).toBe('Initial Treatment');
    });
  });

  describe('updateProgramState', () => {
    it('should successfully update program state', async () => {
      const programEnrollmentUUID = 'enrollment-1';
      const stateConceptUUID = 'concept-state-1';
      const mockUpdatedEnrollment: ProgramEnrollment = {
        ...mockEnrollments[0],
        uuid: programEnrollmentUUID,
      };

      (post as jest.Mock).mockResolvedValue(mockUpdatedEnrollment);
      (get as jest.Mock).mockResolvedValue(mockUpdatedEnrollment);

      const result = await updateProgramState(
        programEnrollmentUUID,
        stateConceptUUID,
      );

      expect(result).toEqual(mockUpdatedEnrollment);
      expect(post).toHaveBeenCalledWith(
        `/openmrs/ws/rest/v1/bahmniprogramenrollment/${programEnrollmentUUID}`,
        {
          uuid: programEnrollmentUUID,
          dateEnrolled: mockUpdatedEnrollment.dateEnrolled,
          states: [
            {
              state: { uuid: stateConceptUUID },
            },
          ],
        },
      );
    });

    it('should call post with correct URL and body structure', async () => {
      const programEnrollmentUUID = 'enrollment-2';
      const stateConceptUUID = 'workflow-state-2';

      (post as jest.Mock).mockResolvedValue(mockEnrollments[1]);
      (get as jest.Mock).mockResolvedValue(mockEnrollments[1]);

      await updateProgramState(programEnrollmentUUID, stateConceptUUID);

      expect(post).toHaveBeenCalledTimes(1);
      expect(post).toHaveBeenCalledWith(
        `/openmrs/ws/rest/v1/bahmniprogramenrollment/${programEnrollmentUUID}`,
        expect.objectContaining({
          uuid: programEnrollmentUUID,
          dateEnrolled: mockEnrollments[1].dateEnrolled,
          states: expect.arrayContaining([
            expect.objectContaining({
              state: { uuid: stateConceptUUID },
            }),
          ]),
        }),
      );
    });

    it('should handle API errors correctly', async () => {
      const programEnrollmentUUID = 'enrollment-1';
      const stateConceptUUID = 'invalid-state-uuid';
      const mockError = new Error('Failed to update program state');

      (post as jest.Mock).mockRejectedValue(mockError);
      (get as jest.Mock).mockResolvedValue(mockEnrollments[0]);

      await expect(
        updateProgramState(programEnrollmentUUID, stateConceptUUID),
      ).rejects.toThrow('Failed to update program state');
    });
  });

  it('completes a current enrollment with its required original date', async () => {
    (get as jest.Mock).mockResolvedValue(mockEnrollments[0]);
    (post as jest.Mock).mockResolvedValue(mockEnrollments[0]);

    await completeProgramEnrollment(
      'enrollment-1',
      '2026-09-26T00:00:00.000Z',
      'outcome-1',
    );

    expect(post).toHaveBeenCalledWith(
      '/openmrs/ws/rest/v1/bahmniprogramenrollment/enrollment-1',
      {
        uuid: 'enrollment-1',
        dateEnrolled: mockEnrollments[0].dateEnrolled,
        dateCompleted: '2026-09-26T00:00:00.000Z',
        outcome: 'outcome-1',
      },
    );
  });

  it('voids through the dedicated Bahmni delete endpoint with a reason', async () => {
    await voidProgramEnrollment('enrollment-1');

    expect(del).toHaveBeenCalledWith(
      '/openmrs/ws/rest/v1/bahmniprogramenrollment/enrollment-1?reason=Removed+from+the+Qorlia+program+manager',
    );
  });

  it('voids the current state through the legacy programenrollment endpoint', async () => {
    await removeProgramState('enrollment-1', 'state-1');

    expect(del).toHaveBeenCalledWith(
      '/openmrs/ws/rest/v1/programenrollment/enrollment-1/state/state-1?reason=User+removed+the+current+state',
    );
  });

  it('updates changed attributes and voids a cleared value without replacing the rest', async () => {
    const current = mockEnrollments[0];
    (get as jest.Mock).mockResolvedValue(current);
    (post as jest.Mock).mockResolvedValue(current);

    await updateProgramEnrollmentDetails(
      current.uuid,
      '2023-01-01',
      [
        {
          uuid: current.attributes[0].attributeType.uuid,
          name: 'ID_Number',
          datatypeClassname: 'java.lang.String',
          retired: false,
        },
        {
          uuid: current.attributes[1].attributeType.uuid,
          name: 'Treatment Date',
          datatypeClassname: 'org.openmrs.customdatatype.datatype.DateDatatype',
          retired: false,
        },
        {
          uuid: current.attributes[2].attributeType.uuid,
          name: 'Patient Stage',
          datatypeClassname: 'org.openmrs.Concept',
          retired: false,
        },
      ],
      {
        [current.attributes[0].attributeType.uuid]: '456',
        [current.attributes[1].attributeType.uuid]: '',
        [current.attributes[2].attributeType.uuid]: (
          current.attributes[2].value as { uuid: string }
        ).uuid,
      },
    );

    expect(post).toHaveBeenCalledWith(
      `/openmrs/ws/rest/v1/bahmniprogramenrollment/${current.uuid}`,
      {
        uuid: current.uuid,
        dateEnrolled: new Date('2023-01-01T00:00:00').toISOString(),
        attributes: [
          {
            uuid: current.attributes[0].uuid,
            attributeType: { uuid: current.attributes[0].attributeType.uuid },
            value: '456',
          },
          {
            uuid: current.attributes[1].uuid,
            attributeType: { uuid: current.attributes[1].attributeType.uuid },
            voided: true,
          },
        ],
      },
    );
  });

  it('rejects an enrollment date later than its first state', async () => {
    (get as jest.Mock).mockResolvedValue({
      ...mockEnrollments[0],
      states: [{ startDate: '2023-01-02', voided: false }],
    });

    await expect(
      updateProgramEnrollmentDetails('enrollment-1', '2023-01-03', [], {}),
    ).rejects.toThrow('Enrollment date must be on or before the first state');
    expect(post).not.toHaveBeenCalled();
  });

  it('sends a concept answer with its hydrated UUID', async () => {
    const current = mockEnrollments[0];
    const attribute = current.attributes[2];
    (get as jest.Mock).mockResolvedValue(current);
    (post as jest.Mock).mockResolvedValue(current);

    await updateProgramEnrollmentDetails(
      current.uuid,
      '2023-01-01',
      [
        {
          uuid: attribute.attributeType.uuid,
          name: 'Patient Stage',
          datatypeClassname: 'org.openmrs.Concept',
          retired: false,
          concept: {
            answers: [
              {
                uuid: 'answer-2',
                display: 'Follow-up',
                name: { display: 'Follow-up care' },
              },
            ],
          } as ProgramEnrollment['program']['concept'],
        },
      ],
      { [attribute.attributeType.uuid]: 'answer-2' },
    );

    expect(post).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        attributes: [
          {
            uuid: attribute.uuid,
            attributeType: { uuid: attribute.attributeType.uuid },
            value: 'Follow-up care',
            hydratedObject: 'answer-2',
          },
        ],
      }),
    );
  });

  describe('getPatientProgramsPage', () => {
    it('should fetch page 1 with default count', async () => {
      const mockResponse: PatientProgramsResponse = {
        results: mockEnrollments.slice(0, 1),
        totalCount: 10,
      };
      (get as jest.Mock).mockResolvedValue(mockResponse);

      const result = await getPatientProgramsPage(patientUUID);

      expect(get).toHaveBeenCalledWith(
        PATIENT_PROGRAMS_PAGE_URL(patientUUID, 15, 0),
      );
      expect(result.programs).toEqual(mockEnrollments.slice(0, 1));
      expect(result.total).toBe(10);
    });

    it('should calculate correct startIndex for page 2', async () => {
      const mockResponse: PatientProgramsResponse = {
        results: [],
        totalCount: 20,
      };
      (get as jest.Mock).mockResolvedValue(mockResponse);

      await getPatientProgramsPage(patientUUID, 5, 2);

      expect(get).toHaveBeenCalledWith(
        PATIENT_PROGRAMS_PAGE_URL(patientUUID, 5, 5),
      );
    });

    it('should calculate correct startIndex for page 3 with count 10', async () => {
      const mockResponse: PatientProgramsResponse = {
        results: [],
        totalCount: 30,
      };
      (get as jest.Mock).mockResolvedValue(mockResponse);

      await getPatientProgramsPage(patientUUID, 10, 3);

      expect(get).toHaveBeenCalledWith(
        PATIENT_PROGRAMS_PAGE_URL(patientUUID, 10, 20),
      );
    });

    it('should return totalCount from response when available', async () => {
      const mockResponse: PatientProgramsResponse = {
        results: mockEnrollments.slice(0, 2),
        totalCount: 42,
      };
      (get as jest.Mock).mockResolvedValue(mockResponse);

      const result = await getPatientProgramsPage(patientUUID, 15, 1);

      expect(result.total).toBe(42);
    });

    it('should return undefined total when totalCount is absent', async () => {
      const mockResponse: PatientProgramsResponse = {
        results: mockEnrollments.slice(0, 2),
      };
      (get as jest.Mock).mockResolvedValue(mockResponse);

      const result = await getPatientProgramsPage(patientUUID, 15, 1);

      expect(result.total).toBeUndefined();
    });

    it('should return empty programs when no enrollments exist', async () => {
      const mockResponse: PatientProgramsResponse = {
        results: [],
        totalCount: 0,
      };
      (get as jest.Mock).mockResolvedValue(mockResponse);

      const result = await getPatientProgramsPage(patientUUID);

      expect(result.programs).toEqual([]);
      expect(result.total).toBe(0);
    });

    it('should propagate API errors', async () => {
      (get as jest.Mock).mockRejectedValue(new Error('Network error'));

      await expect(getPatientProgramsPage(patientUUID)).rejects.toThrow(
        'Network error',
      );
    });
  });

  describe('getAllPrograms', () => {
    it('should call get with ALL_PROGRAMS_URL', async () => {
      const mockResponse: ProgramsResponse = { results: mockPrograms };
      (get as jest.Mock).mockResolvedValue(mockResponse);

      await getAllPrograms();

      expect(get).toHaveBeenCalledWith(ALL_PROGRAMS_URL);
    });

    it('should return the results from the response', async () => {
      const mockResponse: ProgramsResponse = { results: mockPrograms };
      (get as jest.Mock).mockResolvedValue(mockResponse);

      const result = await getAllPrograms();

      expect(result).toEqual(mockPrograms);
    });

    it('should return an empty array when no programs exist', async () => {
      const mockResponse: ProgramsResponse = { results: [] };
      (get as jest.Mock).mockResolvedValue(mockResponse);

      const result = await getAllPrograms();

      expect(result).toEqual([]);
    });

    it('should propagate API errors', async () => {
      (get as jest.Mock).mockRejectedValue(new Error('Network error'));

      await expect(getAllPrograms()).rejects.toThrow('Network error');
    });
  });

  it('loads only active program attribute types', async () => {
    const active = { uuid: 'attr-1', name: 'ID_Number', retired: false };
    (get as jest.Mock).mockResolvedValue({
      results: [active, { uuid: 'attr-2', retired: true }],
    });

    expect(await getProgramAttributeTypes()).toEqual([active]);
    expect(get).toHaveBeenCalledWith(PROGRAM_ATTRIBUTE_TYPES_URL);
  });

  it('posts a new enrollment to Bahmni without changing its fields', async () => {
    const enrollment = {
      patient: 'patient-1',
      program: 'program-1',
      dateEnrolled: '2026-09-26T00:00:00.000Z',
      states: [
        { state: 'workflow-state-1', startDate: '2026-09-26T00:00:00.000Z' },
      ],
      attributes: [{ attributeType: { uuid: 'attr-1' }, value: '123' }],
    };
    (post as jest.Mock).mockResolvedValue(mockEnrollments[0]);

    await createProgramEnrollment(enrollment);

    expect(post).toHaveBeenCalledWith(PROGRAM_ENROLLMENTS_URL, enrollment);
  });
});
