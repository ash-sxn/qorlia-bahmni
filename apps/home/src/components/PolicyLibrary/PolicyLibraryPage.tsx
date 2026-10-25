import { Search } from '@bahmni/design-system';
import { useTranslation } from '@bahmni/services';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { HomePageHeader } from '../HomePageHeader';
import {
  DEFAULT_FILTERS,
  filterPolicies,
  PolicyFilters,
  sortPolicies,
} from './filterPolicies';
import { loadPolicyCatalogue, usesSyntheticExamples } from './policyCatalogue';
import { PolicyFilterBar } from './PolicyFilterBar';
import styles from './PolicyLibrary.module.scss';
import { PolicyList } from './PolicyList';

export const PolicyLibraryPage = () => {
  const { t } = useTranslation();
  const catalogue = useMemo(() => loadPolicyCatalogue(), []);
  const [filters, setFilters] = useState<PolicyFilters>(DEFAULT_FILTERS);

  const renderCatalogue = () => {
    if (!catalogue.ok) {
      return (
        <p role="alert" className={styles.notice}>
          {t('POLICY_LIBRARY_LOAD_ERROR')}
        </p>
      );
    }

    if (catalogue.entries.length === 0) {
      return <p className={styles.notice}>{t('POLICY_LIBRARY_EMPTY')}</p>;
    }

    const policies = sortPolicies(filterPolicies(catalogue.entries, filters));

    return (
      <>
        <div className={styles.search}>
          <Search
            size="lg"
            labelText={t('POLICY_LIBRARY_SEARCH_LABEL')}
            placeholder={t('POLICY_LIBRARY_SEARCH_PLACEHOLDER')}
            closeButtonLabelText={t('POLICY_LIBRARY_SEARCH_CLEAR')}
            value={filters.query}
            onChange={(event) =>
              setFilters({ ...filters, query: event.target.value })
            }
          />
        </div>
        <PolicyFilterBar
          filters={filters}
          resultCount={policies.length}
          onChange={setFilters}
          onClear={() => setFilters(DEFAULT_FILTERS)}
        />
        {policies.length > 0 ? (
          <PolicyList policies={policies} />
        ) : (
          <p className={styles.notice}>{t('POLICY_LIBRARY_NO_RESULTS')}</p>
        )}
      </>
    );
  };

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
        {renderCatalogue()}
      </main>
    </>
  );
};
