import { get } from '@bahmni/services';
import { getPatientLabResults, getPatientVisits } from '../recordService';

jest.mock('@bahmni/services', () => ({
  get: jest.fn(),
  OPENMRS_REST_V1: '/openmrs/ws/rest/v1',
}));

const mockGet = get as jest.Mock;
const calledUrl = (call = 0) =>
  new URL(mockGet.mock.calls[call][0], 'http://x');

describe('getPatientVisits', () => {
  beforeEach(() => mockGet.mockReset());

  it('asks for open and closed visits of the patient', async () => {
    mockGet.mockResolvedValue({ results: [{ uuid: 'v1' }] });

    await expect(getPatientVisits('patient-1')).resolves.toEqual([
      { uuid: 'v1' },
    ]);

    const url = calledUrl();
    expect(url.pathname).toBe('/openmrs/ws/rest/v1/visit');
    expect(url.searchParams.get('patient')).toBe('patient-1');
    expect(url.searchParams.get('includeInactive')).toBe('true');
    expect(url.searchParams.get('startIndex')).toBe('0');
  });

  it('follows the next link until the last page', async () => {
    mockGet
      .mockResolvedValueOnce({
        results: [{ uuid: 'v1' }, { uuid: 'v2' }],
        links: [{ rel: 'next', uri: 'more' }],
      })
      .mockResolvedValueOnce({ results: [{ uuid: 'v3' }] });

    await expect(getPatientVisits('patient-1')).resolves.toHaveLength(3);
    expect(calledUrl(1).searchParams.get('startIndex')).toBe('2');
  });

  it('stops with an error instead of returning a partial list', async () => {
    mockGet.mockResolvedValue({
      results: [{ uuid: 'v' }],
      links: [{ rel: 'next', uri: 'more' }],
    });

    await expect(getPatientVisits('patient-1')).rejects.toThrow(
      'More than 2000 visits',
    );
    expect(mockGet).toHaveBeenCalledTimes(20);
  });
});

describe('getPatientLabResults', () => {
  beforeEach(() => mockGet.mockReset());

  it('reads the results of all visits', async () => {
    mockGet.mockResolvedValue({ results: [{ testName: 'ESR' }] });

    await expect(getPatientLabResults('patient 1')).resolves.toEqual([
      { testName: 'ESR' },
    ]);

    const url = calledUrl();
    expect(url.pathname).toBe('/openmrs/ws/rest/v1/bahmnicore/labOrderResults');
    expect(url.searchParams.get('patientUuid')).toBe('patient 1');
    expect(url.searchParams.has('numberOfVisits')).toBe(false);
  });

  it('returns an empty list when Bahmni sends no results field', async () => {
    mockGet.mockResolvedValue({});

    await expect(getPatientLabResults('patient-1')).resolves.toEqual([]);
  });
});
