import { get } from '@bahmni/services';
import {
  fetchActiveIpdVisit,
  inpatientStatus,
} from '../InpatientPatientDetails';

jest.mock('@bahmni/services', () => ({
  ...jest.requireActual('@bahmni/services'),
  get: jest.fn(),
}));

it('reads the active visit and derives its admission state', async () => {
  jest.mocked(get).mockResolvedValueOnce({
    results: [{ uuid: 'visit-1', visitType: { name: 'OPD' } }],
  });

  expect(await fetchActiveIpdVisit('patient-1')).toMatchObject({
    uuid: 'visit-1',
  });
  expect(get).toHaveBeenCalledWith('/openmrs/ws/rest/v1/visit', {
    params: {
      includeInactive: false,
      patient: 'patient-1',
      v: 'custom:(uuid,startDatetime,stopDatetime,visitType,patient)',
    },
  });
  expect(inpatientStatus(undefined)).toBe('No active visit');
  const visit = {
    startDateTime: 1,
    stopDateTime: null,
    visitType: 'OPD',
    admissionDetails: null,
    dischargeDetails: null,
  };
  expect(inpatientStatus({ ...visit, admissionDetails: { date: 1 } })).toBe(
    'Admitted',
  );
  expect(
    inpatientStatus({
      ...visit,
      admissionDetails: { date: 1 },
      dischargeDetails: { date: 2 },
    }),
  ).toBe('Discharged');
});
