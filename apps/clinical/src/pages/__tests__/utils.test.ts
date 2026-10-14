import type { UserPrivilege } from '@bahmni/services';
import { registerWidget, resetWidgetRegistry } from '@bahmni/widgets';
import { lazy } from 'react';
import {
  validFullClinicalConfig,
  validDashboardConfig,
} from '../../__mocks__/configMocks';
import { Dashboard } from '../../providers/clinicalConfig/models';
import { DashboardConfig, DashboardSectionConfig } from '../models';
import {
  getDefaultDashboard,
  getSidebarItems,
  filterControlsByPrivileges,
  filterSectionsByPrivileges,
  isPatientNotFoundError,
} from '../util';

const mockTranslation = jest.fn((key: string) => key);
const privileges = (...names: string[]): UserPrivilege[] =>
  names.map((name) => ({ uuid: name, name }));

describe('ConsultationPageService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetWidgetRegistry();
  });

  describe('isPatientNotFoundError', () => {
    it('returns true for the ERROR_PATIENT_NOT_FOUND key as a string', () => {
      expect(isPatientNotFoundError('ERROR_PATIENT_NOT_FOUND')).toBe(true);
    });

    it('returns true when the rejection is an Error carrying the key', () => {
      expect(isPatientNotFoundError(new Error('ERROR_PATIENT_NOT_FOUND'))).toBe(
        true,
      );
    });

    it.each([
      'Bad Request: Invalid input parameters. Please check your request and try again.',
      'Server Error: The server encountered an error. Please try again later.',
      'Unauthorized: You are not authorized to perform this action.',
      'Network error',
    ])('returns false for any other rejection "%s"', (error) => {
      expect(isPatientNotFoundError(error)).toBe(false);
    });

    it.each([[null], [undefined], [{}], [42]])(
      'returns false for non-string/non-Error value %s',
      (error) => {
        expect(isPatientNotFoundError(error)).toBe(false);
      },
    );
  });

  describe('getDefaultDashboard', () => {
    it('should return the default dashboard when one exists', () => {
      const result = getDefaultDashboard(validFullClinicalConfig.dashboards);
      expect(result).toEqual(validFullClinicalConfig.dashboards[0]);
    });

    it('should return the first dashboard when no default dashboard exists', () => {
      const dashboardsWithNoDefault: Dashboard[] =
        validFullClinicalConfig.dashboards.map((dashboard) => ({
          ...dashboard,
          default: false,
        }));
      const result = getDefaultDashboard(dashboardsWithNoDefault);
      expect(result).toEqual(dashboardsWithNoDefault[0]);
    });

    it('should return null for empty dashboards array', () => {
      const result = getDefaultDashboard([]);
      expect(result).toBeNull();
    });
  });

  describe('filterControlsByPrivileges', () => {
    it.each([
      ['allergies', 'Get Allergies', 'Edit Allergies'],
      ['appointments', 'Get Appointments', 'Manage Appointments'],
      ['diagnoses', 'Get Diagnoses', 'Edit Diagnoses'],
      ['immunizationHistory', 'Get Immunizations', 'Add Immunizations'],
      ['labOrders', 'Get Orders', 'Add Orders'],
      ['pacsOrders', 'Get Orders', 'Add Orders'],
      ['ordersControl', 'Get Orders', 'Edit Orders'],
      ['treatment', 'Get Orders', 'Edit Orders'],
    ])(
      'requires %s read access even without dashboard metadata',
      (type, read, write) => {
        const controls = [{ type, name: type }];
        expect(filterControlsByPrivileges(controls, [])).toEqual([]);
        expect(filterControlsByPrivileges(controls, privileges(write))).toEqual(
          [],
        );
        expect(filterControlsByPrivileges(controls, privileges(read))).toEqual(
          controls,
        );
      },
    );

    it('preserves observations access and explicit hospital restrictions without inventing a native read gate', () => {
      const controls = [{ type: 'observations', name: 'vitals' }];
      expect(filterControlsByPrivileges(controls, [])).toEqual(controls);
      const restricted = [
        { ...controls[0], requiredPrivileges: ['Hospital observation access'] },
      ];
      expect(filterControlsByPrivileges(restricted, [])).toEqual([]);
      expect(
        filterControlsByPrivileges(
          restricted,
          privileges('Hospital observation access'),
        ),
      ).toEqual(restricted);
    });

    it('retains configured OR restrictions in addition to native read access', () => {
      const controls = [
        {
          type: 'allergies',
          name: 'allergies',
          requiredPrivileges: ['Hospital chart access', 'Hospital supervisor'],
        },
      ];
      expect(
        filterControlsByPrivileges(controls, privileges('Get Allergies')),
      ).toEqual([]);
      expect(
        filterControlsByPrivileges(controls, privileges('Hospital supervisor')),
      ).toEqual([]);
      expect(
        filterControlsByPrivileges(
          controls,
          privileges('Get Allergies', 'Hospital supervisor'),
        ),
      ).toEqual(controls);
    });

    it('does not let an explicit empty restriction waive native read access', () => {
      const controls = [
        { type: 'treatment', name: 'vaccinations', requiredPrivileges: [] },
      ];
      expect(
        filterControlsByPrivileges(controls, privileges('Edit Orders')),
      ).toEqual([]);
      expect(
        filterControlsByPrivileges(controls, privileges('Get Orders')),
      ).toEqual(controls);
    });

    it('uses the registered component read requirements, including all prerequisites', () => {
      registerWidget({
        type: 'customChart',
        component: lazy(() => Promise.resolve({ default: () => null })),
        readPrivileges: ['Get Orders', 'Get Observations'],
      });
      const controls = [{ type: 'customChart', name: 'custom' }];
      expect(
        filterControlsByPrivileges(controls, privileges('Get Orders')),
      ).toEqual([]);
      expect(
        filterControlsByPrivileges(
          controls,
          privileges('Get Orders', 'Get Observations'),
        ),
      ).toEqual(controls);
      resetWidgetRegistry();
      expect(filterControlsByPrivileges(controls, [])).toEqual(controls);
    });
    it('includes control when user has the required privilege', () => {
      const controls = [
        {
          type: 'widget',
          name: 'allergies',
          requiredPrivileges: ['Add Allergies'],
        },
      ];
      const result = filterControlsByPrivileges(
        controls,
        privileges('Add Allergies'),
      );
      expect(result).toHaveLength(1);
    });

    it('excludes control when user lacks the required privilege', () => {
      const controls = [
        {
          type: 'widget',
          name: 'medications',
          requiredPrivileges: ['Add Orders'],
        },
      ];
      const result = filterControlsByPrivileges(
        controls,
        privileges('View Orders'),
      );
      expect(result).toHaveLength(0);
    });

    it('includes control when no required privileges are defined', () => {
      const controls = [{ type: 'widget', name: 'vitals' }];
      const result = filterControlsByPrivileges(controls, []);
      expect(result).toHaveLength(1);
    });

    it('checks the configured required privilege', () => {
      const controls = [
        {
          type: 'widget',
          name: 'allergies',
          requiredPrivileges: ['Add Allergies'],
        },
      ];
      expect(
        filterControlsByPrivileges(controls, privileges('View Allergies')),
      ).toHaveLength(0);
    });

    it('accepts any of multiple required privileges', () => {
      const controls = [
        {
          type: 'widget',
          name: 'multi-priv',
          requiredPrivileges: ['Add Allergies', 'View Allergies'],
        },
      ];
      expect(
        filterControlsByPrivileges(controls, privileges('View Allergies')),
      ).toHaveLength(1);
    });
  });

  describe('filterSectionsByPrivileges', () => {
    it('removes denied widgets and their sidebar sections without mutating configuration', () => {
      const configured: DashboardSectionConfig[] = [
        {
          id: 'conditions',
          name: 'Conditions',
          icon: 'fa-stethoscope',
          controls: [
            {
              type: 'conditions',
              name: 'conditions',
              requiredPrivileges: ['Get Conditions'],
            },
            { type: 'diagnoses', name: 'diagnoses' },
          ],
        },
        {
          id: 'orders',
          name: 'Orders',
          icon: 'fa-flask',
          controls: [{ type: 'labOrders', name: 'labs' }],
        },
      ];
      const result = filterSectionsByPrivileges(
        configured,
        privileges('Get Conditions'),
      );
      expect(result).toEqual([
        { ...configured[0], controls: [configured[0].controls[0]] },
      ]);
      expect(
        getSidebarItems({ sections: result }, mockTranslation).map(
          (item) => item.id,
        ),
      ).toEqual(['conditions']);
      expect(configured[0].controls).toHaveLength(2);
      expect(filterSectionsByPrivileges(configured, [])).toEqual([]);
    });
    const sections: DashboardSectionConfig[] = [
      {
        id: 'section-1',
        name: 'Section 1',
        icon: 'allergies',
        controls: [
          {
            type: 'widget',
            name: 'allergies',
            requiredPrivileges: ['Add Allergies'],
          },
        ],
      },
      {
        id: 'section-2',
        name: 'Section 2',
        icon: 'pills',
        controls: [
          {
            type: 'widget',
            name: 'medications',
            requiredPrivileges: ['Add Orders'],
          },
        ],
      },
      {
        id: 'section-3',
        name: 'Section 3',
        icon: 'heartbeat',
        controls: [{ type: 'widget', name: 'vitals' }],
      },
    ];

    it('keeps section when user has privilege for at least one control', () => {
      const result = filterSectionsByPrivileges(
        sections,
        privileges('Add Allergies'),
      );
      const ids = result.map((s) => s.id);
      expect(ids).toContain('section-1');
    });

    it('removes section when user lacks privilege for all its controls', () => {
      const result = filterSectionsByPrivileges(
        sections,
        privileges('Add Allergies'),
      );
      const ids = result.map((s) => s.id);
      expect(ids).not.toContain('section-2');
    });

    it('keeps section with no required privileges regardless of user privileges', () => {
      const result = filterSectionsByPrivileges(
        sections,
        privileges('View Patients'),
      );
      const ids = result.map((s) => s.id);
      expect(ids).toContain('section-3');
    });

    it('removes all sections when user has no privileges and all controls require privileges', () => {
      const result = filterSectionsByPrivileges([sections[0], sections[1]], []);
      expect(result).toHaveLength(0);
    });

    it('removes sections that originally had empty controls array', () => {
      const sectionsWithEmpty: DashboardSectionConfig[] = [
        {
          id: 'section-empty',
          name: 'Empty Section',
          icon: 'star',
          controls: [],
        },
        {
          id: 'section-with-controls',
          name: 'Has Controls',
          icon: 'heart',
          controls: [{ type: 'widget', name: 'widget1' }],
        },
      ];
      const result = filterSectionsByPrivileges(
        sectionsWithEmpty,
        privileges('View Patients'),
      );
      const ids = result.map((s) => s.id);
      expect(ids).toContain('section-with-controls');
      expect(ids).not.toContain('section-empty');
    });
  });

  describe('getSidebarItems', () => {
    beforeEach(() => {
      mockTranslation.mockClear();
    });
    it('should convert dashboard sections to sidebar items', () => {
      const result = getSidebarItems(validDashboardConfig, mockTranslation);

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        id: 'vitals',
        icon: 'heartbeat',
        label: 'VITALS_SECTION',
      });
      expect(result[1]).toEqual({
        id: 'medications',
        icon: 'pills',
        label: 'Medications',
      });
      expect(mockTranslation).toHaveBeenNthCalledWith(1, 'VITALS_SECTION');
      expect(mockTranslation).toHaveBeenNthCalledWith(2, 'Medications');
    });

    it('should return empty array for empty sections', () => {
      const emptyConfig: DashboardConfig = {
        sections: [],
      };
      const result = getSidebarItems(emptyConfig, mockTranslation);
      expect(result).toEqual([]);
      expect(mockTranslation).not.toHaveBeenCalled();
    });
  });
});
