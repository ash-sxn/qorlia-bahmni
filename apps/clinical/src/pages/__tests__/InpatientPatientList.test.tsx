import { get } from '@bahmni/services';
import { fetchIpdPatients } from '../InpatientPatientList';

jest.mock('@bahmni/services', () => ({
  ...jest.requireActual('@bahmni/services'),
  get: jest.fn(),
}));

it('uses the legacy inpatient search endpoint and session context', async () => {
  jest.mocked(get).mockResolvedValueOnce([]);

  await fetchIpdPatients('emrapi.sqlSearch.admittedPatients', 'loc', 'provider');

  expect(get).toHaveBeenCalledWith('/openmrs/ws/rest/v1/bahmnicore/sql', {
    params: {
      location_uuid: 'loc',
      provider_uuid: 'provider',
      q: 'emrapi.sqlSearch.admittedPatients',
      v: 'full',
    },
  });
});
