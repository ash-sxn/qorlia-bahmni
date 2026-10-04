import { del, get, post } from '../../api';
import {
  createEmptyBundle,
  createBundleWithAppointments,
  FIXED_NOW,
  patientUUID,
  upcomingAppointment,
  pastAppointment,
  mockUnavailabilities,
  mockCreateRequest,
  mockCreateRequestWithoutOptionalFields,
  multipleRequests,
} from '../__mocks__/mocks';
import {
  getUpcomingAppointments,
  getPastAppointments,
  getUpcomingAppointmentsPage,
  getPastAppointmentsPage,
  searchAppointmentsByAttribute,
  getAppointmentsForDate,
  getWaitlistedAppointments,
  getAppointmentSummary,
  getAppointmentBookingConflicts,
  bookAppointment,
  getLegacyAppointment,
  updateAppointment,
  updateAppointmentStatus,
  checkInAppointment,
  getAppointmentById,
  getAllAppointmentServices,
  getAppointmentService,
  saveAppointmentService,
  getFutureAppointmentsForServiceType,
  deleteAppointmentService,
  getAppointmentUnavailabilities,
  createAppointmentUnavailability,
} from '../appointmentService';
import {
  UPCOMING_APPOINTMENTS_URL,
  PAST_APPOINTMENTS_URL,
  APPOINTMENTS_SEARCH_URL,
  APPOINTMENT_SUMMARY_URL,
  APPOINTMENT_CONFLICTS_URL,
  APPOINTMENT_SAVE_URL,
  APPOINTMENT_DAY_URL,
  APPOINTMENT_LEGACY_SEARCH_URL,
  getAppointmentByIdUrl,
  updateAppointmentStatusUrl,
  ALL_APPOINTMENT_SERVICES_URL,
  APPOINTMENT_SERVICE_URL,
  APPOINTMENT_SERVICE_TYPE_FUTURE_URL,
  getDeleteAppointmentServiceUrl,
  getUpcomingAppointmentsPageUrl,
  getPastAppointmentsPageUrl,
  APPOINTMENT_UNAVAILABILITY_URL,
} from '../constants';

jest.mock('../../api');
const mockedGet = get as jest.MockedFunction<typeof get>;
const mockedPost = post as jest.MockedFunction<typeof post>;
const mockedDel = del as jest.MockedFunction<typeof del>;

jest.useFakeTimers().setSystemTime(FIXED_NOW);

const setupMockBundle = (appointments: any[]) => {
  const mockBundle = createBundleWithAppointments(appointments);
  mockedGet.mockResolvedValue(mockBundle);
  return mockBundle;
};

const setupEmptyBundle = () => {
  const mockBundle = createEmptyBundle();
  mockedGet.mockResolvedValue(mockBundle);
  return mockBundle;
};

describe('Appointment Service', () => {
  it('loads and saves the full service definition through the legacy endpoint', async () => {
    const service = {
      name: 'General Medicine',
      description: null,
      durationMins: 15,
      maxAppointmentsLimit: null,
      color: '#006400',
      initialAppointmentStatus: 'Scheduled',
      weeklyAvailability: [],
      serviceTypes: [],
      attributes: [],
    };
    mockedGet.mockResolvedValue(service);
    mockedPost.mockResolvedValue(service);

    await getAppointmentService('service-1');
    await saveAppointmentService(service);

    expect(mockedGet).toHaveBeenCalledWith(
      `${APPOINTMENT_SERVICE_URL}?uuid=service-1`,
    );
    expect(mockedPost).toHaveBeenCalledWith(APPOINTMENT_SERVICE_URL, service);
  });
  it('checks future bookings before a service type is removed', async () => {
    mockedGet.mockResolvedValue([]);
    await getFutureAppointmentsForServiceType('type-1');
    expect(mockedGet).toHaveBeenCalledWith(
      `${APPOINTMENT_SERVICE_TYPE_FUTURE_URL}?appointmentServiceTypeUuid=type-1`,
    );
  });
  afterAll(() => {
    jest.useRealTimers();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it.each([
    [
      'getUpcomingAppointments',
      () => getUpcomingAppointments(patientUUID),
      UPCOMING_APPOINTMENTS_URL(patientUUID),
    ],
    [
      'getPastAppointments',
      () => getPastAppointments(patientUUID),
      PAST_APPOINTMENTS_URL(patientUUID),
    ],
    [
      'getAppointmentById',
      () => getAppointmentById('appt-uuid-1'),
      getAppointmentByIdUrl('appt-uuid-1'),
    ],
    [
      'getAllAppointmentServices',
      () => getAllAppointmentServices(),
      ALL_APPOINTMENT_SERVICES_URL,
    ],
  ])(
    '%s should call GET with correct endpoint and return result',
    async (_, fn, expectedUrl) => {
      const mockResult = { id: 'mock' };
      mockedGet.mockResolvedValue(mockResult);

      const result = await fn();

      expect(mockedGet).toHaveBeenCalledWith(expectedUrl);
      expect(result).toEqual(mockResult);
    },
  );

  it.each([
    ['getUpcomingAppointments', () => getUpcomingAppointments(patientUUID)],
    ['getPastAppointments', () => getPastAppointments(patientUUID)],
  ])('%s should return empty Bundle when no appointments', async (_, fn) => {
    setupEmptyBundle();

    const result = await fn();

    expect(result.entry).toHaveLength(0);
  });

  it('searchAppointmentsByAttribute should call POST with correct endpoint and params and return result', async () => {
    const searchParam = { patient: patientUUID };
    const appointments = [
      { uuid: 'appt-uuid-1', appointmentNumber: 'APT-001' },
    ];
    mockedPost.mockResolvedValue(appointments);

    const result = await searchAppointmentsByAttribute(searchParam);

    expect(mockedPost).toHaveBeenCalledWith(
      APPOINTMENTS_SEARCH_URL,
      searchParam,
    );
    expect(result).toEqual(appointments);
  });

  it('loads the legacy day list using local midnight', async () => {
    const date = new Date('2026-09-25T00:00:00+05:30');
    mockedGet.mockResolvedValue([]);

    expect(await getAppointmentsForDate(date)).toEqual([]);
    expect(mockedGet).toHaveBeenCalledWith(
      `${APPOINTMENT_DAY_URL}?${new URLSearchParams({ forDate: date.toISOString() })}`,
    );
  });

  it('searches the legacy waitlist with the configured filters', async () => {
    const filters = {
      serviceUuids: ['service-1'],
      providerUuids: [],
      locationUuids: [],
    };
    mockedPost.mockResolvedValue([]);

    expect(await getWaitlistedAppointments(filters)).toEqual([]);
    expect(mockedPost).toHaveBeenCalledWith(APPOINTMENT_LEGACY_SEARCH_URL, {
      ...filters,
      serviceTypeUuids: [],
      statusList: ['WaitList'],
      status: 'WaitList',
    });
  });

  it('loads weekly appointment counts from the summary endpoint', async () => {
    const startDate = '2026-09-21T00:00:00.000+05:30';
    const endDate = '2026-09-27T23:59:59.999+05:30';
    const rows = [
      {
        appointmentService: { name: 'General Medicine' },
        appointmentCountMap: {},
      },
    ];
    mockedGet.mockResolvedValue(rows);

    expect(await getAppointmentSummary(startDate, endDate)).toEqual(rows);
    expect(mockedGet).toHaveBeenCalledWith(
      `${APPOINTMENT_SUMMARY_URL}?${new URLSearchParams({ startDate, endDate })}`,
    );
  });

  it('checks conflicts and books through Bahmni appointment endpoints', async () => {
    const request = {
      patientUuid: 'patient-1',
      serviceUuid: 'service-1',
      locationUuid: 'location-1',
      startDateTime: '2099-01-01T09:00:00.000Z',
      endDateTime: '2099-01-01T09:15:00.000Z',
      appointmentKind: 'Scheduled' as const,
      status: 'Scheduled' as const,
      providers: [],
    };
    mockedPost.mockResolvedValueOnce({ PATIENT_DOUBLE_BOOKING: [] });
    mockedPost.mockResolvedValueOnce({ uuid: 'appointment-1' });

    expect(await getAppointmentBookingConflicts(request)).toEqual({
      PATIENT_DOUBLE_BOOKING: [],
    });
    expect(await bookAppointment(request)).toEqual({ uuid: 'appointment-1' });
    expect(mockedPost).toHaveBeenNthCalledWith(
      1,
      APPOINTMENT_CONFLICTS_URL,
      request,
    );
    expect(mockedPost).toHaveBeenNthCalledWith(
      2,
      APPOINTMENT_SAVE_URL,
      request,
    );
  });

  it('treats the conflict endpoint no-content response as no conflicts', async () => {
    mockedPost.mockResolvedValueOnce('').mockResolvedValueOnce(undefined);
    const request = {
      patientUuid: 'patient-1',
      serviceUuid: 'service-1',
      locationUuid: 'location-1',
      startDateTime: '2099-01-01T09:00:00.000Z',
      endDateTime: '2099-01-01T09:15:00.000Z',
      appointmentKind: 'Scheduled' as const,
      status: 'Scheduled' as const,
      providers: [],
    };
    expect(await getAppointmentBookingConflicts(request)).toEqual({});
    expect(await getAppointmentBookingConflicts(request)).toEqual({});
  });

  it('loads and updates the legacy appointment through its edit endpoint', async () => {
    const appointment = { uuid: 'appointment-1' };
    const request = {
      uuid: 'appointment-1',
      patientUuid: 'patient-1',
      serviceUuid: 'service-1',
      locationUuid: 'location-1',
      startDateTime: '2099-01-01T09:00:00.000Z',
      endDateTime: '2099-01-01T09:15:00.000Z',
      appointmentKind: 'Scheduled',
      status: 'Scheduled',
      providers: [],
      comments: null,
    };
    mockedGet.mockResolvedValue(appointment);
    mockedPost.mockResolvedValue(appointment);

    expect(await getLegacyAppointment('appointment-1')).toEqual(appointment);
    expect(await updateAppointment(request)).toEqual(appointment);
    expect(mockedGet).toHaveBeenCalledWith(
      `${APPOINTMENT_SAVE_URL}?${new URLSearchParams({ uuid: 'appointment-1' })}`,
    );
    expect(mockedPost).toHaveBeenCalledWith(APPOINTMENT_SAVE_URL, request);
  });

  it('falls back to Bahmni appointments when the FHIR resource is unavailable', async () => {
    mockedGet.mockRejectedValue(
      Object.assign(new Error('Not found'), { status: 404 }),
    );
    mockedPost.mockResolvedValue([
      {
        uuid: 'appointment-1',
        appointmentNumber: 'APT-001',
        patient: { uuid: patientUUID, name: 'Demo Patient' },
        service: { name: 'Consultation' },
        providers: [{ uuid: 'doctor-1', name: 'Demo Doctor' }],
        reasons: [{ name: 'Follow-up' }],
        startDateTime: Date.parse('2026-02-20T10:00:00Z'),
        endDateTime: Date.parse('2026-02-20T10:30:00Z'),
        status: 'Scheduled',
      },
    ]);

    const { bundle, total } = await getUpcomingAppointmentsPage(patientUUID);

    expect(mockedPost).toHaveBeenCalledWith(
      APPOINTMENTS_SEARCH_URL,
      expect.objectContaining({
        patientUuid: patientUUID,
        startDate: expect.any(String),
      }),
    );
    expect(total).toBe(1);
    expect(bundle.entry?.[0]?.resource).toMatchObject({
      id: 'appointment-1',
      status: 'booked',
      serviceType: [{ text: 'Consultation' }],
      reasonCode: [{ text: 'Follow-up' }],
      start: '2026-02-20T10:00:00.000Z',
    });
  });

  it('slices legacy appointment results for later pages', async () => {
    mockedGet.mockRejectedValue(
      Object.assign(new Error('Not found'), { status: 404 }),
    );
    mockedPost.mockResolvedValue(
      Array.from({ length: 3 }, (_, index) => ({
        uuid: `appointment-${index}`,
        appointmentNumber: `APT-${index}`,
        patient: { uuid: patientUUID, name: 'Demo Patient' },
        service: { name: 'Consultation' },
        providers: [],
        reasons: [],
        startDateTime: Date.parse(`2026-02-${20 + index}T10:00:00Z`),
        endDateTime: Date.parse(`2026-02-${20 + index}T10:30:00Z`),
        status: 'Completed',
      })),
    );

    const { bundle, total } = await getPastAppointmentsPage(patientUUID, 2, 2);

    expect(total).toBe(3);
    expect(bundle.entry).toHaveLength(1);
    expect(bundle.entry?.[0]?.resource?.id).toBe('appointment-0');
  });

  it('does not hide a server error behind the legacy fallback', async () => {
    mockedGet.mockRejectedValue(
      Object.assign(new Error('Server error'), { status: 500 }),
    );

    await expect(getUpcomingAppointmentsPage(patientUUID)).rejects.toThrow(
      'Server error',
    );
    expect(mockedPost).not.toHaveBeenCalled();
  });

  it('deleteAppointmentService should call DELETE with correct endpoint', async () => {
    const serviceUuid = 'service-uuid-1';
    mockedDel.mockResolvedValue(undefined);

    await deleteAppointmentService(serviceUuid);

    expect(mockedDel).toHaveBeenCalledWith(
      getDeleteAppointmentServiceUrl(serviceUuid),
    );
  });

  it('updateAppointmentStatus should call POST with correct endpoint and body', async () => {
    const appointmentUUID = 'appt-uuid-1';
    const onDate = new Date('2026-02-18');
    mockedPost.mockResolvedValue(undefined);

    await updateAppointmentStatus(appointmentUUID, 'fulfilled', onDate);

    expect(mockedPost).toHaveBeenCalledWith(
      updateAppointmentStatusUrl(appointmentUUID),
      {
        toStatus: 'fulfilled',
        onDate,
      },
    );
  });

  it('checkInAppointment should call POST with the submit URL and appointmentUuid body', async () => {
    const submitUrl =
      '/openmrs/ws/rest/v1/iom/appointment/checkin?visitType=Follow+Up';
    const appointmentUuid = 'appt-uuid-1';
    const mockResponse = { uuid: appointmentUuid, status: 'Arrived' };
    mockedPost.mockResolvedValue(mockResponse);

    const result = await checkInAppointment(submitUrl, appointmentUuid);

    expect(mockedPost).toHaveBeenCalledWith(submitUrl, { appointmentUuid });
    expect(result).toEqual(mockResponse);
  });

  it.each([
    [
      'getUpcomingAppointments',
      () => getUpcomingAppointments(patientUUID),
      mockedGet,
    ],
    ['getPastAppointments', () => getPastAppointments(patientUUID), mockedGet],
    ['getAppointmentById', () => getAppointmentById('appt-uuid-1'), mockedGet],
    ['getAllAppointmentServices', () => getAllAppointmentServices(), mockedGet],
    [
      'searchAppointmentsByAttribute',
      () => searchAppointmentsByAttribute({ patient: patientUUID }),
      mockedPost,
    ],
    [
      'updateAppointmentStatus',
      () => updateAppointmentStatus('appt-uuid-1', 'fulfilled'),
      mockedPost,
    ],
    [
      'deleteAppointmentService',
      () => deleteAppointmentService('service-uuid-1'),
      mockedDel,
    ],
  ])('%s should propagate API errors', async (_, fn, mockedFn) => {
    mockedFn.mockRejectedValue(new Error('API Error'));

    await expect(fn()).rejects.toThrow('API Error');
  });

  it('getPastAppointments should append count to endpoint when provided', async () => {
    const mockBundle = setupMockBundle([pastAppointment]);

    const result = await getPastAppointments(patientUUID, 5);

    expect(result).toEqual(mockBundle);
    expect(mockedGet).toHaveBeenCalledWith(
      PAST_APPOINTMENTS_URL(patientUUID, 5),
    );
  });

  describe('getUpcomingAppointmentsPage', () => {
    it('should fetch page 1 with default count and offset 0', async () => {
      const mockBundle = setupMockBundle([upcomingAppointment]);
      (mockBundle as any).total = 42;

      const result = await getUpcomingAppointmentsPage(patientUUID);

      expect(mockedGet).toHaveBeenCalledWith(
        getUpcomingAppointmentsPageUrl(patientUUID, 10, 0),
      );
      expect(result.bundle).toEqual(mockBundle);
      expect(result.total).toBe(42);
    });

    it('should calculate correct offset for page 2', async () => {
      const mockBundle = setupMockBundle([upcomingAppointment]);
      (mockBundle as any).total = 50;

      await getUpcomingAppointmentsPage(patientUUID, 10, 2);

      expect(mockedGet).toHaveBeenCalledWith(
        getUpcomingAppointmentsPageUrl(patientUUID, 10, 10),
      );
    });

    it('should calculate correct offset for page 3', async () => {
      const mockBundle = setupMockBundle([upcomingAppointment]);
      (mockBundle as any).total = 100;

      await getUpcomingAppointmentsPage(patientUUID, 10, 3);

      expect(mockedGet).toHaveBeenCalledWith(
        getUpcomingAppointmentsPageUrl(patientUUID, 10, 20),
      );
    });

    it('should return total from bundle', async () => {
      const mockBundle = setupMockBundle([upcomingAppointment]);
      (mockBundle as any).total = 99;

      const result = await getUpcomingAppointmentsPage(patientUUID, 10, 1);

      expect(result.total).toBe(99);
    });

    it('should fall back to entry length when bundle total is undefined', async () => {
      const mockBundle = setupMockBundle([upcomingAppointment]);
      delete (mockBundle as any).total;

      const result = await getUpcomingAppointmentsPage(patientUUID, 10, 1);

      expect(result.total).toBe(1);
    });

    it('should propagate API errors', async () => {
      mockedGet.mockRejectedValue(new Error('API Error'));

      await expect(getUpcomingAppointmentsPage(patientUUID)).rejects.toThrow(
        'API Error',
      );
    });
  });

  describe('getPastAppointmentsPage', () => {
    it('should fetch page 1 with default count and offset 0', async () => {
      const mockBundle = setupMockBundle([pastAppointment]);
      (mockBundle as any).total = 30;

      const result = await getPastAppointmentsPage(patientUUID);

      expect(mockedGet).toHaveBeenCalledWith(
        getPastAppointmentsPageUrl(patientUUID, 10, 0),
      );
      expect(result.bundle).toEqual(mockBundle);
      expect(result.total).toBe(30);
    });

    it('should calculate correct offset for page 2', async () => {
      const mockBundle = setupMockBundle([pastAppointment]);
      (mockBundle as any).total = 50;

      await getPastAppointmentsPage(patientUUID, 10, 2);

      expect(mockedGet).toHaveBeenCalledWith(
        getPastAppointmentsPageUrl(patientUUID, 10, 10),
      );
    });

    it('should calculate correct offset for page 3', async () => {
      const mockBundle = setupMockBundle([pastAppointment]);
      (mockBundle as any).total = 100;

      await getPastAppointmentsPage(patientUUID, 10, 3);

      expect(mockedGet).toHaveBeenCalledWith(
        getPastAppointmentsPageUrl(patientUUID, 10, 20),
      );
    });

    it('should return total from bundle', async () => {
      const mockBundle = setupMockBundle([pastAppointment]);
      (mockBundle as any).total = 77;

      const result = await getPastAppointmentsPage(patientUUID, 10, 1);

      expect(result.total).toBe(77);
    });

    it('should fall back to entry length when bundle total is undefined', async () => {
      const mockBundle = setupMockBundle([pastAppointment]);
      delete (mockBundle as any).total;

      const result = await getPastAppointmentsPage(patientUUID, 10, 1);

      expect(result.total).toBe(1);
    });

    it('should propagate API errors', async () => {
      mockedGet.mockRejectedValue(new Error('API Error'));

      await expect(getPastAppointmentsPage(patientUUID)).rejects.toThrow(
        'API Error',
      );
    });
  });

  describe('getAppointmentUnavailabilities', () => {
    it('should fetch all appointment unavailabilities', async () => {
      mockedGet.mockResolvedValue(mockUnavailabilities);

      const result = await getAppointmentUnavailabilities();

      expect(mockedGet).toHaveBeenCalledWith(APPOINTMENT_UNAVAILABILITY_URL);
      expect(result).toEqual(mockUnavailabilities);
      expect(result).toHaveLength(2);
    });

    it('should return empty array when no unavailabilities exist', async () => {
      mockedGet.mockResolvedValue([]);

      const result = await getAppointmentUnavailabilities();

      expect(mockedGet).toHaveBeenCalledWith(APPOINTMENT_UNAVAILABILITY_URL);
      expect(result).toEqual([]);
    });

    it('should propagate API errors', async () => {
      mockedGet.mockRejectedValue(new Error('Unavailabilities API Error'));

      await expect(getAppointmentUnavailabilities()).rejects.toThrow(
        'Unavailabilities API Error',
      );
    });
  });

  describe('createAppointmentUnavailability', () => {
    it('should create appointment unavailability with all fields', async () => {
      mockedPost.mockResolvedValue(undefined);

      await createAppointmentUnavailability(mockCreateRequest);

      expect(mockedPost).toHaveBeenCalledWith(
        APPOINTMENT_UNAVAILABILITY_URL,
        mockCreateRequest,
      );
    });

    it('should create appointment unavailability without optional fields', async () => {
      mockedPost.mockResolvedValue(undefined);

      await createAppointmentUnavailability(
        mockCreateRequestWithoutOptionalFields,
      );

      expect(mockedPost).toHaveBeenCalledWith(
        APPOINTMENT_UNAVAILABILITY_URL,
        mockCreateRequestWithoutOptionalFields,
      );
    });

    it('should create multiple unavailabilities in a single request', async () => {
      mockedPost.mockResolvedValue(undefined);

      await createAppointmentUnavailability(multipleRequests);

      expect(mockedPost).toHaveBeenCalledWith(
        APPOINTMENT_UNAVAILABILITY_URL,
        multipleRequests,
      );
    });

    it('should propagate API errors', async () => {
      mockedPost.mockRejectedValue(
        new Error('Create Unavailability API Error'),
      );

      await expect(
        createAppointmentUnavailability(mockCreateRequest),
      ).rejects.toThrow('Create Unavailability API Error');
    });
  });
});
