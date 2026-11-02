import { render, screen } from '@testing-library/react';
import { syntheticPolicies } from '../../PolicyLibrary/__fixtures__/syntheticPolicies';
import { loadPolicyCatalogue } from '../../PolicyLibrary/policyCatalogue';
import { HomePageGrid } from '../HomePageGrid';

// Only the loader is replaced, so each test can choose an empty or filled catalogue.
jest.mock('../../PolicyLibrary/policyCatalogue', () => ({
  ...jest.requireActual('../../PolicyLibrary/policyCatalogue'),
  loadPolicyCatalogue: jest.fn(),
}));
const mockLoadPolicyCatalogue = loadPolicyCatalogue as jest.Mock;

// The grid's behaviour (loading / error / empty / tile rendering) is owned by
// ModuleTileGrid in @bahmni/widgets and tested there. What home is responsible
// for is wiring the right extension point and its own translation keys.
jest.mock('@bahmni/widgets', () => ({
  ModuleTileGrid: jest.fn((props) => (
    <div
      data-testid="module-tile-grid-mock"
      data-props={JSON.stringify(props)}
    />
  )),
}));

describe('HomePageGrid', () => {
  beforeEach(() => {
    mockLoadPolicyCatalogue.mockReturnValue({
      ok: true,
      entries: syntheticPolicies,
    });
  });

  it('delegates to ModuleTileGrid with the home extension point and home i18n keys', () => {
    render(<HomePageGrid />);

    const props = JSON.parse(
      screen.getByTestId('module-tile-grid-mock').dataset.props!,
    );

    expect(props.extensionPointId).toBe('org.bahmni.home.dashboard');
    expect(props.loadingLabelKey).toBe('HOME_LOADING_MODULES');
    expect(props.errorMessageKey).toBe('HOME_ERROR_FETCH_CONFIG');
    expect(props.emptyMessageKey).toBe('HOME_NO_MODULES');
    expect(props.additionalModules).toEqual([
      expect.objectContaining({
        id: 'qorlia.billing',
        label: 'Billing',
        url: '/bahmni-v2/home/billing',
      }),
      expect.objectContaining({
        id: 'qorlia.policy-library',
        label: 'Policy library',
        url: '/bahmni-v2/home/policies',
      }),
    ]);
  });

  it('gives the Qorlia tiles translation keys', () => {
    render(<HomePageGrid />);

    const props = JSON.parse(
      screen.getByTestId('module-tile-grid-mock').dataset.props!,
    );

    expect(props.additionalModules).toEqual([
      expect.objectContaining({
        id: 'qorlia.billing',
        translationKey: 'HOME_TILE_BILLING',
      }),
      expect.objectContaining({
        id: 'qorlia.policy-library',
        translationKey: 'HOME_TILE_POLICY_LIBRARY',
      }),
    ]);
  });

  it('hides the Policy library tile while the catalogue has no entries', () => {
    mockLoadPolicyCatalogue.mockReturnValue({ ok: true, entries: [] });

    render(<HomePageGrid />);

    const props = JSON.parse(
      screen.getByTestId('module-tile-grid-mock').dataset.props!,
    );

    expect(props.additionalModules).toEqual([
      expect.objectContaining({ id: 'qorlia.billing' }),
    ]);
  });

  it('hides the Policy library tile when the catalogue fails validation', () => {
    mockLoadPolicyCatalogue.mockReturnValue({
      ok: false,
      errors: ['bad entry'],
    });

    render(<HomePageGrid />);

    const props = JSON.parse(
      screen.getByTestId('module-tile-grid-mock').dataset.props!,
    );

    expect(props.additionalModules).toEqual([
      expect.objectContaining({ id: 'qorlia.billing' }),
    ]);
  });

  it('opens available React screens in the review build', () => {
    render(<HomePageGrid />);

    const props = JSON.parse(
      screen.getByTestId('module-tile-grid-mock').dataset.props!,
    );

    expect(props.reviewUrls['bahmni.clinical']).toBe('/bahmni-v2/clinical/');
    expect(props.reviewUrls['qorlia.policy-library']).toBe(
      '/bahmni-v2/home/policies',
    );
    expect(props.reviewUrls['bahmni.orders']).toBe(
      '/bahmni-v2/clinical/orders',
    );
    expect(props.reviewUrls['bahmni.ot']).toBe(
      '/bahmni-v2/clinical/operation-theatre',
    );
    expect(screen.getByText(/Qorlia review build/)).toBeInTheDocument();
    expect(props.reviewUrls['bahmni.patient.document.upload']).toContain(
      '/bahmni-v2/patient-documents/search?encounterType=Patient%20Document',
    );
    expect(props.reviewUrls['bahmni.radiology.document.upload']).toContain(
      '/bahmni-v2/patient-documents/search?encounterType=RADIOLOGY',
    );
  });

  it('does not pass an appName, so home reads its own config by default', () => {
    render(<HomePageGrid />);

    const props = JSON.parse(
      screen.getByTestId('module-tile-grid-mock').dataset.props!,
    );

    expect(props.appName).toBeUndefined();
  });
});
