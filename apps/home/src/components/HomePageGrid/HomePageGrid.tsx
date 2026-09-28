import { ModuleTileGrid } from '@bahmni/widgets';
import React from 'react';
import { HOME_EXTENSION_POINT } from '../../constants/app';
import styles from './styles/HomePageGrid.module.scss';

const reviewUrls = {
  'bahmni.registration.new': '/bahmni-v2/registration/search',
  'bahmni.programs': '/bahmni-v2/clinical/programs',
  'bahmni.clinical': '/bahmni-v2/clinical/',
  'bahmni.ipd': '/bahmni-v2/clinical/inpatient',
  'bahmni.admin': '/bahmni-v2/admin',
  'bahmni.reports': '/bahmni-v2/reports/',
  'bahmni.ot': '/bahmni-v2/clinical/operation-theatre',
  'bahmni.appointment.scheduling': '/bahmni-v2/appointments/',
};

export const HomePageGrid: React.FC = () => (
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
    />
  </div>
);
