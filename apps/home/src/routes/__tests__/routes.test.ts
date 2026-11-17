import { routes } from '..';

describe('home routes', () => {
  it('opens the policy library list', () => {
    expect(routes).toContainEqual(
      expect.objectContaining({ path: '/policies', name: 'PolicyLibrary' }),
    );
  });

  it('opens a policy detail page by id', () => {
    expect(routes).toContainEqual(
      expect.objectContaining({
        path: '/policies/:policyId',
        name: 'PolicyDetail',
      }),
    );
  });

  it('opens the patient record search and a record by patient', () => {
    expect(routes).toContainEqual(
      expect.objectContaining({
        path: '/records',
        name: 'PatientRecordSearch',
      }),
    );
    expect(routes).toContainEqual(
      expect.objectContaining({
        path: '/records/:patientUuid',
        name: 'PatientRecord',
      }),
    );
  });

  it('opens the referral directory and a referral letter by entry', () => {
    expect(routes).toContainEqual(
      expect.objectContaining({
        path: '/referrals',
        name: 'ReferralDirectory',
      }),
    );
    expect(routes).toContainEqual(
      expect.objectContaining({
        path: '/referrals/:entryId/letter',
        name: 'ReferralLetter',
      }),
    );
  });

  it('opens the pre-authorisation worksheet', () => {
    expect(routes).toContainEqual(
      expect.objectContaining({
        path: '/preauthorisation',
        name: 'PreauthWorksheet',
      }),
    );
  });

  it('opens the insurance desk list', () => {
    expect(routes).toContainEqual(
      expect.objectContaining({ path: '/insurance', name: 'InsuranceDesk' }),
    );
  });

  it('opens an insurance case detail page by id', () => {
    expect(routes).toContainEqual(
      expect.objectContaining({
        path: '/insurance/:caseId',
        name: 'InsuranceCaseDetail',
      }),
    );
  });
});
