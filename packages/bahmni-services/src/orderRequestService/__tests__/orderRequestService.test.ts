import type { Bundle, Encounter, ServiceRequest } from 'fhir/r4';
import { get } from '../../api';
import { SERVICE_REQUESTS_URL, SERVICE_REQUEST_COUNT } from '../constants';
import { getServiceRequests } from '../orderRequestService';

jest.mock('../../api');
const mockedGet = get as jest.MockedFunction<typeof get>;

const mockServiceRequestBundle: Bundle<ServiceRequest> = {
  resourceType: 'Bundle',
  id: '42235c1c-9f6a-4122-977c-ff7e1c3072b9',
  type: 'searchset',
  total: 3,
  entry: [
    {
      fullUrl:
        'http://localhost/openmrs/ws/fhir2/R4/ServiceRequest/4964b392-2d03-4ff2-870a-ad4ed177e59c',
      resource: {
        resourceType: 'ServiceRequest',
        id: '4964b392-2d03-4ff2-870a-ad4ed177e59c',
        status: 'completed',
        intent: 'order',
        category: [
          {
            coding: [
              {
                system: 'http://fhir.bahmni.org/code-system/order-type',
                code: '3f224d3e-afd7-4e90-8f14-34cf481b6d0f',
                display: 'Procedure Order',
              },
            ],
            text: 'Procedure Order',
          },
        ],
        priority: 'routine',
        code: {
          coding: [
            {
              code: '166105AAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
              display: 'Arthrodesis',
            },
          ],
          text: 'Arthrodesis',
        },
        subject: {
          reference: 'Patient/6db60a96-a688-4891-b9f6-59c78db52215',
          type: 'Patient',
          display: 'Shaik Jameela (Patient Identifier: PA000011)',
        },
      },
    },
  ],
};

describe('serviceRequestService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('SERVICE_REQUESTS_URL', () => {
    const category = '3f224d3e-afd7-4e90-8f14-34cf481b6d0f';
    const patientUuid = '6db60a96-a688-4891-b9f6-59c78db52215';

    it('should construct URL with required parameters only', () => {
      const url = SERVICE_REQUESTS_URL(category, patientUuid);

      expect(url).toBe(
        `/openmrs/ws/fhir2/R4/ServiceRequest?_count=${SERVICE_REQUEST_COUNT}&_sort=-_lastUpdated&category=${category}&patient=${patientUuid}`,
      );
    });

    it('should construct URL with numberOfVisits parameter', () => {
      const numberOfVisits = 5;
      const url = SERVICE_REQUESTS_URL(
        category,
        patientUuid,
        undefined,
        numberOfVisits,
        undefined,
      );

      expect(url).toBe(
        `/openmrs/ws/fhir2/R4/ServiceRequest?_count=${SERVICE_REQUEST_COUNT}&_sort=-_lastUpdated&category=${category}&patient=${patientUuid}&numberOfVisits=${numberOfVisits}`,
      );
    });

    it('should prioritize encounterUuids over numberOfVisits', () => {
      const encounterUuids = 'encounter-1';
      const numberOfVisits = 5;
      const url = SERVICE_REQUESTS_URL(
        category,
        patientUuid,
        encounterUuids,
        numberOfVisits,
        undefined,
      );

      expect(url).toBe(
        `/openmrs/ws/fhir2/R4/ServiceRequest?_count=${SERVICE_REQUEST_COUNT}&_sort=-_lastUpdated&category=${category}&patient=${patientUuid}&encounter=${encounterUuids}`,
      );
      expect(url).not.toContain('numberOfVisits');
    });

    it('should construct URL with all parameters', () => {
      const encounterUuids = 'encounter-1,encounter-2';
      const revinclude = 'ImagingStudy:basedon';
      const url = SERVICE_REQUESTS_URL(
        category,
        patientUuid,
        encounterUuids,
        undefined,
        revinclude,
      );

      expect(url).toBe(
        `/openmrs/ws/fhir2/R4/ServiceRequest?_count=${SERVICE_REQUEST_COUNT}&_sort=-_lastUpdated&category=${category}&patient=${patientUuid}&_revinclude=${revinclude}&encounter=${encounterUuids}`,
      );
    });
  });

  describe('getServiceRequests', () => {
    const unsupported = new Error(
      'Invalid input parameters. Please check your request and try again.',
    );

    it('filters category and encounter when the server only supports patient search', async () => {
      const category = 'lab-category';
      const patientUuid = 'patient-1';
      const request = (
        id: string,
        code: string,
        encounter: string,
      ): ServiceRequest => ({
        resourceType: 'ServiceRequest',
        id,
        status: 'active',
        intent: 'order',
        subject: { reference: `Patient/${patientUuid}` },
        code: { text: id },
        category: [{ coding: [{ code }] }],
        encounter: { reference: `Encounter/${encounter}` },
      });
      const bundle: Bundle<ServiceRequest> = {
        resourceType: 'Bundle',
        type: 'searchset',
        total: 3,
        entry: [
          { resource: request('keep', category, 'encounter-1') },
          { resource: request('wrong-category', 'radiology', 'encounter-1') },
          { resource: request('wrong-visit', category, 'encounter-2') },
        ],
      };
      mockedGet
        .mockRejectedValueOnce(unsupported)
        .mockResolvedValueOnce(bundle);

      const result = await getServiceRequests(category, patientUuid, [
        'encounter-1',
      ]);

      expect(result.entry?.map((entry) => entry.resource?.id)).toEqual([
        'keep',
      ]);
      expect(result.total).toBe(1);
      expect(mockedGet).toHaveBeenNthCalledWith(
        2,
        `/openmrs/ws/fhir2/R4/ServiceRequest?_count=${SERVICE_REQUEST_COUNT}&_sort=-_lastUpdated&patient=${patientUuid}`,
      );
    });

    it('keeps only orders from the latest configured visits on an older server', async () => {
      const category = 'lab-category';
      const patientUuid = 'patient-1';
      const request = (id: string, encounter: string): ServiceRequest => ({
        resourceType: 'ServiceRequest',
        id,
        status: 'active',
        intent: 'order',
        subject: { reference: `Patient/${patientUuid}` },
        code: { text: id },
        category: [{ coding: [{ code: category }] }],
        encounter: { reference: `Encounter/${encounter}` },
      });
      const orders: Bundle<ServiceRequest> = {
        resourceType: 'Bundle',
        type: 'searchset',
        total: 2,
        entry: [
          { resource: request('recent', 'encounter-new') },
          { resource: request('old', 'encounter-old') },
        ],
      };
      const encounter = (
        id: string,
        start: string,
        visit?: string,
      ): Encounter => ({
        resourceType: 'Encounter',
        id,
        status: 'finished',
        class: { system: 'http://example.org', code: 'AMB' },
        period: { start },
        meta: { tag: [{ code: visit ? 'encounter' : 'visit' }] },
        ...(visit && { partOf: { reference: `Encounter/${visit}` } }),
      });
      const visits: Bundle<Encounter> = {
        resourceType: 'Bundle',
        type: 'searchset',
        total: 4,
        entry: [
          { resource: encounter('visit-old', '2026-01-01') },
          { resource: encounter('encounter-old', '2026-01-01', 'visit-old') },
          { resource: encounter('visit-new', '2026-09-01') },
          { resource: encounter('encounter-new', '2026-09-01', 'visit-new') },
        ],
      };
      mockedGet
        .mockRejectedValueOnce(unsupported)
        .mockResolvedValueOnce(orders)
        .mockResolvedValueOnce(visits);

      const result = await getServiceRequests(
        category,
        patientUuid,
        undefined,
        1,
      );

      expect(result.entry?.map((entry) => entry.resource?.id)).toEqual([
        'recent',
      ]);
      expect(result.total).toBe(1);
    });

    it('should fetch service requests with required parameters', async () => {
      const category = '3f224d3e-afd7-4e90-8f14-34cf481b6d0f';
      const patientUuid = '6db60a96-a688-4891-b9f6-59c78db52215';
      mockedGet.mockResolvedValueOnce(mockServiceRequestBundle);

      await getServiceRequests(category, patientUuid);

      expect(mockedGet).toHaveBeenCalledWith(
        SERVICE_REQUESTS_URL(category, patientUuid),
      );
    });

    it('should return the service request bundle', async () => {
      const category = '3f224d3e-afd7-4e90-8f14-34cf481b6d0f';
      const patientUuid = '6db60a96-a688-4891-b9f6-59c78db52215';
      mockedGet.mockResolvedValueOnce(mockServiceRequestBundle);

      const result = await getServiceRequests(category, patientUuid);

      expect(result).toEqual(mockServiceRequestBundle);
    });

    it('should fetch service requests with encounterUuids', async () => {
      const category = '3f224d3e-afd7-4e90-8f14-34cf481b6d0f';
      const patientUuid = '6db60a96-a688-4891-b9f6-59c78db52215';
      const encounterUuids = ['encounter-1', 'encounter-2'];
      mockedGet.mockResolvedValueOnce(mockServiceRequestBundle);

      await getServiceRequests(category, patientUuid, encounterUuids);

      expect(mockedGet).toHaveBeenCalledWith(
        SERVICE_REQUESTS_URL(
          category,
          patientUuid,
          'encounter-1,encounter-2',
          undefined,
          undefined,
        ),
      );
    });

    it('should fetch service requests with empty encounterUuids array', async () => {
      const category = '3f224d3e-afd7-4e90-8f14-34cf481b6d0f';
      const patientUuid = '6db60a96-a688-4891-b9f6-59c78db52215';
      const encounterUuids: string[] = [];
      mockedGet.mockResolvedValueOnce(mockServiceRequestBundle);

      await getServiceRequests(category, patientUuid, encounterUuids);

      expect(mockedGet).toHaveBeenCalledWith(
        SERVICE_REQUESTS_URL(
          category,
          patientUuid,
          undefined,
          undefined,
          undefined,
        ),
      );
    });

    it('should fetch service requests with all optional parameters', async () => {
      const category = '3f224d3e-afd7-4e90-8f14-34cf481b6d0f';
      const patientUuid = '6db60a96-a688-4891-b9f6-59c78db52215';
      const encounterUuids = ['encounter-1'];
      const revinclude = 'ImagingStudy:basedon';
      mockedGet.mockResolvedValueOnce(mockServiceRequestBundle);

      await getServiceRequests(
        category,
        patientUuid,
        encounterUuids,
        undefined,
        revinclude,
      );

      expect(mockedGet).toHaveBeenCalledWith(
        SERVICE_REQUESTS_URL(
          category,
          patientUuid,
          'encounter-1',
          undefined,
          revinclude,
        ),
      );
    });

    it('should return all entries including duplicate investigations with same concept, encounter, and requester', async () => {
      const category = '3f224d3e-afd7-4e90-8f14-34cf481b6d0f';
      const patientUuid = '6db60a96-a688-4891-b9f6-59c78db52215';
      const duplicateBundle: Bundle<ServiceRequest> = {
        resourceType: 'Bundle',
        id: 'test-bundle',
        type: 'searchset',
        total: 2,
        entry: [
          {
            fullUrl: 'http://localhost/ServiceRequest/sr-1',
            resource: {
              resourceType: 'ServiceRequest',
              id: 'sr-1',
              status: 'active',
              intent: 'order',
              code: {
                coding: [{ code: 'CBC-001', display: 'Complete Blood Count' }],
              },
              subject: { reference: 'Patient/patient-1' },
              encounter: { reference: 'Encounter/encounter-1' },
              requester: { reference: 'Practitioner/practitioner-1' },
            },
          },
          {
            fullUrl: 'http://localhost/ServiceRequest/sr-2',
            resource: {
              resourceType: 'ServiceRequest',
              id: 'sr-2',
              status: 'active',
              intent: 'order',
              code: {
                coding: [{ code: 'CBC-001', display: 'Complete Blood Count' }],
              },
              subject: { reference: 'Patient/patient-1' },
              encounter: { reference: 'Encounter/encounter-1' },
              requester: { reference: 'Practitioner/practitioner-1' },
            },
          },
        ],
      };
      mockedGet.mockResolvedValueOnce(duplicateBundle);

      const result = await getServiceRequests(category, patientUuid);

      expect(result.entry).toHaveLength(2);
      expect(result.entry![0].resource!.id).toBe('sr-1');
      expect(result.entry![1].resource!.id).toBe('sr-2');
    });

    it('should return bundle unchanged when entry is undefined', async () => {
      const category = '3f224d3e-afd7-4e90-8f14-34cf481b6d0f';
      const patientUuid = '6db60a96-a688-4891-b9f6-59c78db52215';
      const emptyBundle: Bundle<ServiceRequest> = {
        resourceType: 'Bundle',
        id: 'empty-bundle',
        type: 'searchset',
        total: 0,
      };
      mockedGet.mockResolvedValueOnce(emptyBundle);

      const result = await getServiceRequests(category, patientUuid);

      expect(result).toEqual(emptyBundle);
      expect(result.entry).toBeUndefined();
    });
  });
});
