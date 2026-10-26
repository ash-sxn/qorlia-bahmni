import { ServiceRequest, Bundle } from 'fhir/r4';

import { get } from '../../api';
import { SERVICE_REQUEST_COUNT } from '../../orderRequestService/constants';
import { getLabInvestigationsBundle } from '../labInvestigationService';

jest.mock('../../api');

describe('labInvestigationService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const patientUUID = '58493859-63f7-48b6-bd0b-698d5a119a21';
  const categoryUuid = 'category-uuid-123';

  const createMockServiceRequest = (
    overrides: Partial<ServiceRequest> = {},
  ): ServiceRequest => ({
    resourceType: 'ServiceRequest',
    id: 'test-id',
    status: 'completed',
    intent: 'order',
    code: {
      text: 'Test Name',
    },
    subject: {
      reference: 'Patient/test-patient',
    },
    priority: 'routine',
    occurrencePeriod: {
      start: '2025-05-08T12:44:24+00:00',
    },
    requester: {
      display: 'Test Doctor',
    },
    ...overrides,
  });

  const createMockBundle = (
    serviceRequests: ServiceRequest[] = [],
  ): Bundle<ServiceRequest> => ({
    resourceType: 'Bundle',
    id: 'bundle-id',
    type: 'searchset',
    total: serviceRequests.length,
    entry: serviceRequests.map((resource) => ({
      resource,
      fullUrl: `http://example.com/ServiceRequest/${resource.id}`,
    })),
  });

  describe('getLabInvestigationsBundle', () => {
    const setupMockAndCall = async (
      encounterUuids?: string[],
      numberOfVisits?: number,
    ) => {
      const mockBundle = createMockBundle([]);
      (get as jest.Mock).mockResolvedValue(mockBundle);

      const result = await getLabInvestigationsBundle(
        patientUUID,
        categoryUuid,
        encounterUuids,
        numberOfVisits,
      );

      return { result, mockBundle };
    };

    it('should fetch and return lab test bundle', async () => {
      const mockBundle = createMockBundle([
        createMockServiceRequest({
          id: 'test-1',
          code: { coding: [{ code: 'concept-1' }], text: 'Test Name 1' },
        }),
        createMockServiceRequest({
          id: 'test-2',
          code: { coding: [{ code: 'concept-2' }], text: 'Test Name 2' },
        }),
      ]);

      (get as jest.Mock).mockResolvedValue(mockBundle);

      const result = await getLabInvestigationsBundle(
        patientUUID,
        categoryUuid,
      );

      expect(get).toHaveBeenCalledWith(
        `/openmrs/ws/fhir2/R4/ServiceRequest?_count=${SERVICE_REQUEST_COUNT}&_sort=-_lastUpdated&category=category-uuid-123&patient=58493859-63f7-48b6-bd0b-698d5a119a21`,
      );
      expect(result).toEqual(mockBundle);
      expect(result.entry).toHaveLength(2);
    });

    it('should handle empty bundle', async () => {
      const { result } = await setupMockAndCall();

      expect(result.entry).toHaveLength(0);
    });

    it('should pass encounterUuids parameter when provided', async () => {
      const encounterUuids = ['encounter-1', 'encounter-2'];

      await setupMockAndCall(encounterUuids);

      expect(get).toHaveBeenCalledWith(
        `/openmrs/ws/fhir2/R4/ServiceRequest?_count=${SERVICE_REQUEST_COUNT}&_sort=-_lastUpdated&category=category-uuid-123&patient=58493859-63f7-48b6-bd0b-698d5a119a21&encounter=encounter-1,encounter-2`,
      );
    });

    it('should pass numberOfVisits parameter when provided', async () => {
      const numberOfVisits = 5;

      await setupMockAndCall(undefined, numberOfVisits);

      expect(get).toHaveBeenCalledWith(
        `/openmrs/ws/fhir2/R4/ServiceRequest?_count=${SERVICE_REQUEST_COUNT}&_sort=-_lastUpdated&category=category-uuid-123&patient=58493859-63f7-48b6-bd0b-698d5a119a21&numberOfVisits=5`,
      );
    });

    it('should handle API errors', async () => {
      const error = new Error('API Error');
      (get as jest.Mock).mockRejectedValue(error);

      await expect(
        getLabInvestigationsBundle(patientUUID, categoryUuid),
      ).rejects.toThrow('API Error');
    });
  });

  describe('older backends that reject the category search', () => {
    const unsupported = () =>
      new Error(
        'Invalid input parameters. Please check your request and try again.',
      );
    const legacyOrders = [
      {
        orderUuid: 'order-1',
        orderTypeUuid: categoryUuid,
        provider: 'Qorlia Demo',
        orderDate: Date.parse('2026-10-26T10:10:06Z'),
        commentToFulfiller: 'Fasting sample',
        concept: { uuid: 'concept-1', name: 'Blood typing', set: false },
      },
      {
        orderUuid: 'order-2',
        orderTypeUuid: categoryUuid,
        orderDate: Date.parse('2026-10-26T10:01:54Z'),
        commentToFulfiller: null,
        concept: { uuid: 'concept-2', name: 'Lipid panel', set: true },
      },
      {
        orderUuid: 'radiology-1',
        orderTypeUuid: 'another-order-type',
        concept: { uuid: 'concept-3', name: 'Chest X-ray' },
      },
    ];

    it('reads Bahmni lab orders when FHIR has no category search and no results', async () => {
      (get as jest.Mock)
        .mockRejectedValueOnce(unsupported())
        .mockResolvedValueOnce(createMockBundle([]))
        .mockResolvedValueOnce(legacyOrders);

      const result = await getLabInvestigationsBundle(
        patientUUID,
        categoryUuid,
      );

      expect(get).toHaveBeenLastCalledWith(
        `/openmrs/ws/rest/v1/bahmnicore/orders?patientUuid=${patientUUID}&orderTypeUuid=${categoryUuid}&includeActiveVisit=true&numberOfVisits=5`,
      );
      expect(result.total).toBe(2);
      expect(result.entry?.map((entry) => entry.resource)).toEqual([
        expect.objectContaining({
          resourceType: 'ServiceRequest',
          id: 'order-1',
          status: 'active',
          intent: 'order',
          category: [{ coding: [{ code: categoryUuid }] }],
          code: { coding: [{ code: 'concept-1' }], text: 'Blood typing' },
          occurrencePeriod: { start: '2026-10-26T10:10:06.000Z' },
          requester: { display: 'Qorlia Demo' },
          note: [{ text: 'Fasting sample' }],
        }),
        expect.objectContaining({
          id: 'order-2',
          code: { coding: [{ code: 'concept-2' }], text: 'Lipid panel' },
          extension: [expect.objectContaining({ valueString: 'Panel' })],
        }),
      ]);
      expect(result.entry?.[1].resource).not.toHaveProperty('note');
      expect(result.entry?.[1].resource).not.toHaveProperty('requester');
    });

    it('passes the configured number of visits to the Bahmni order API', async () => {
      (get as jest.Mock)
        .mockRejectedValueOnce(unsupported())
        .mockResolvedValueOnce(createMockBundle([]))
        .mockResolvedValueOnce([]);

      await getLabInvestigationsBundle(patientUUID, categoryUuid, undefined, 2);

      expect(get).toHaveBeenLastCalledWith(
        expect.stringContaining('includeActiveVisit=true&numberOfVisits=2'),
      );
    });

    it('keeps FHIR results from the patient-only search when there are any', async () => {
      const request = createMockServiceRequest({
        id: 'fhir-1',
        category: [{ coding: [{ code: categoryUuid }] }],
      });
      (get as jest.Mock)
        .mockRejectedValueOnce(unsupported())
        .mockResolvedValueOnce(createMockBundle([request]));

      const result = await getLabInvestigationsBundle(
        patientUUID,
        categoryUuid,
      );

      expect(result.entry?.map((entry) => entry.resource?.id)).toEqual([
        'fhir-1',
      ]);
      expect(get).toHaveBeenCalledTimes(2);
    });

    it('does not show unscoped Bahmni orders in an encounter-scoped view', async () => {
      (get as jest.Mock)
        .mockRejectedValueOnce(unsupported())
        .mockResolvedValueOnce(createMockBundle([]));

      const result = await getLabInvestigationsBundle(
        patientUUID,
        categoryUuid,
        ['encounter-1'],
      );

      expect(result.entry).toEqual([]);
      expect(get).toHaveBeenCalledTimes(2);
    });

    it('does not call the Bahmni order API when FHIR supports the category search', async () => {
      (get as jest.Mock).mockResolvedValueOnce(createMockBundle([]));

      const result = await getLabInvestigationsBundle(
        patientUUID,
        categoryUuid,
      );

      expect(result.entry).toEqual([]);
      expect(get).toHaveBeenCalledTimes(1);
    });
  });
});
