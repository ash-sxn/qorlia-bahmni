import { useTranslation } from '@bahmni/services';
import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { HomePageHeader } from '../HomePageHeader';
import {
  DEFAULT_FILTERS,
  filterPolicies,
  sortPolicies,
} from './filterPolicies';
import { loadPolicyCatalogue, usesSyntheticExamples } from './policyCatalogue';
import styles from './PolicyLibrary.module.scss';
import { PolicyList } from './PolicyList';

export const PolicyLibraryPage = () => {
  const { t } = useTranslation();
  const catalogue = useMemo(() => loadPolicyCatalogue(), []);

  return (
    <>
      <HomePageHeader />
      <main className={styles.page}>
        <Link to="/home/">{t('HOME_LABEL')}</Link>
        <h1>{t('POLICY_LIBRARY_TITLE')}</h1>
        <p>{t('POLICY_LIBRARY_INFO_NOTE')}</p>
        {usesSyntheticExamples && (
          <p className={styles.notice}>
            {t('POLICY_LIBRARY_SYNTHETIC_NOTICE')}
          </p>
        )}
        {catalogue.ok ? (
          <PolicyList
            policies={sortPolicies(
              filterPolicies(catalogue.entries, DEFAULT_FILTERS),
            )}
          />
        ) : (
          <p role="alert" className={styles.notice}>
            {t('POLICY_LIBRARY_LOAD_ERROR')}
          </p>
        )}
      </main>
    </>
  );
};
