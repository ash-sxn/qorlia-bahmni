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
});
