import { type Module } from '@bahmni/services';
import { ModuleTileGrid } from '@bahmni/widgets';
import React, { useMemo } from 'react';
import { HOME_EXTENSION_POINT } from '../../constants/app';
import {
  hasPolicyEntries,
  loadPolicyCatalogue,
} from '../PolicyLibrary/policyCatalogue';
import styles from './styles/HomePageGrid.module.scss';

const reviewUrls = {
  'qorlia.billing': '/bahmni-v2/home/billing',
  'qorlia.policy-library': '/bahmni-v2/home/policies',
  'bahmni.registration.new': '/bahmni-v2/registration/search',
  'bahmni.programs': '/bahmni-v2/clinical/programs',
  'bahmni.clinical': '/bahmni-v2/clinical/',
  'bahmni.ipd': '/bahmni-v2/clinical/inpatient',
  'bahmni.admin': '/bahmni-v2/admin',
  'bahmni.reports': '/bahmni-v2/reports/',
  'bahmni.ot': '/bahmni-v2/clinical/operation-theatre',
  'bahmni.orders': '/bahmni-v2/clinical/orders',
  'bahmni.appointment.scheduling': '/bahmni-v2/appointments/',
  'bahmni.patient.document.upload':
    '/bahmni-v2/patient-documents/search?encounterType=Patient%20Document&topLevelConcept=Patient%20Document&defaultOption=Patient%20file',
  'bahmni.radiology.document.upload':
    '/bahmni-v2/patient-documents/search?encounterType=RADIOLOGY&topLevelConcept=All%20Radiology%20orders',
};

const billingModule: Module = {
  id: 'qorlia.billing',
  extensionPointId: HOME_EXTENSION_POINT,
  type: 'link',
  label: 'Billing',
  translationKey: 'HOME_TILE_BILLING',
  url: '/bahmni-v2/home/billing',
  order: 14,
  icon: 'fa-file-invoice-dollar',
  exclusiveOnlineModule: true,
};

const policyLibraryModule: Module = {
  id: 'qorlia.policy-library',
  extensionPointId: HOME_EXTENSION_POINT,
  type: 'link',
  label: 'Policy library',
  translationKey: 'HOME_TILE_POLICY_LIBRARY',
  url: '/bahmni-v2/home/policies',
  order: 15,
  icon: 'fa-book-open',
  exclusiveOnlineModule: true,
};

export const HomePageGrid: React.FC = () => {
  // Production has no approved policies yet, so the tile would open an empty page.
  const qorliaModules = useMemo(
    () =>
      hasPolicyEntries(loadPolicyCatalogue())
        ? [billingModule, policyLibraryModule]
        : [billingModule],
    [],
  );

  return (
    <div className={styles.headerOffset}>
      {process.env.NODE_ENV !== 'production' && (
        <p className={styles.reviewNote}>
          Qorlia review build. Available modules open the new interface. Other
          modules are still in progress.
        </p>
      )}
      <ModuleTileGrid
        extensionPointId={HOME_EXTENSION_POINT}
        loadingLabelKey="HOME_LOADING_MODULES"
        errorMessageKey="HOME_ERROR_FETCH_CONFIG"
        emptyMessageKey="HOME_NO_MODULES"
        reviewUrls={
          process.env.NODE_ENV !== 'production' ? reviewUrls : undefined
        }
        testId="home-modules"
        additionalModules={qorliaModules}
      />
    </div>
  );
};
