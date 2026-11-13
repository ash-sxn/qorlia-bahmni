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

  it('opens the insurance desk list', () => {
    expect(routes).toContainEqual(
      expect.objectContaining({ path: '/insurance', name: 'InsuranceDesk' }),
    );
  });

  it('opens the hospital overview', () => {
    expect(routes).toContainEqual(
      expect.objectContaining({ path: '/overview', name: 'HospitalOverview' }),
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
