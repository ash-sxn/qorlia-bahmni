import { Search } from '@bahmni/design-system';
import { useTranslation } from '@bahmni/services';
import { useMemo, useState } from 'react';
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
  const [query, setQuery] = useState('');

  const renderCatalogue = () => {
    if (!catalogue.ok) {
      return (
        <p role="alert" className={styles.notice}>
          {t('POLICY_LIBRARY_LOAD_ERROR')}
        </p>
      );
    }

    if (filterPolicies(catalogue.entries, DEFAULT_FILTERS).length === 0) {
      return <p className={styles.notice}>{t('POLICY_LIBRARY_EMPTY')}</p>;
    }

    const policies = sortPolicies(
      filterPolicies(catalogue.entries, { ...DEFAULT_FILTERS, query }),
    );

    return (
      <>
        <div className={styles.search}>
          <Search
            size="lg"
            labelText={t('POLICY_LIBRARY_SEARCH_LABEL')}
            placeholder={t('POLICY_LIBRARY_SEARCH_PLACEHOLDER')}
            closeButtonLabelText={t('POLICY_LIBRARY_SEARCH_CLEAR')}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
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
