import { Search } from '@bahmni/design-system';
import { useTranslation } from '@bahmni/services';
import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { HomePageHeader } from '../HomePageHeader';
import { loadCases, usesSyntheticCases } from './caseCatalogue';
import { CaseFilterBar } from './CaseFilterBar';
import { CaseList } from './CaseList';
import {
  CaseFilters,
  DEFAULT_FILTERS,
  filterCases,
  payerNames,
  sortCases,
} from './filterCases';
import { filtersFromParams, filtersToParams } from './filterParams';
import styles from './InsuranceDesk.module.scss';

export const InsuranceDeskPage = () => {
  const { t } = useTranslation();
  const catalogue = useMemo(() => loadCases(), []);
  const payers = useMemo(
    () => (catalogue.ok ? payerNames(catalogue.cases) : []),
    [catalogue],
  );
  const [searchParams, setSearchParams] = useSearchParams();
  // React Router applies URL updates as transitions, so a search box bound to the URL
  // drops characters when someone types quickly. The box keeps its own text and the
  // URL mirrors it, which is enough for Back and refresh because the page remounts.
  const [query, setQuery] = useState(
    () => filtersFromParams(searchParams, payers).query,
  );
  const filters: CaseFilters = {
    ...filtersFromParams(searchParams, payers),
    query,
  };
  // Replace rather than push, so typing a search does not add a history entry per keystroke.
  const setFilters = (next: CaseFilters) => {
    setQuery(next.query);
    setSearchParams(filtersToParams(next), { replace: true });
  };

  const renderCases = () => {
    if (!catalogue.ok) {
      return (
        <p role="alert" className={styles.notice}>
          {t('INSURANCE_DESK_LOAD_ERROR')}
        </p>
      );
    }

    if (catalogue.cases.length === 0) {
      return <p className={styles.notice}>{t('INSURANCE_DESK_EMPTY')}</p>;
    }

    const cases = sortCases(filterCases(catalogue.cases, filters));

    return (
      <>
        <div className={styles.search}>
          <Search
            size="lg"
            labelText={t('INSURANCE_DESK_SEARCH_LABEL')}
            placeholder={t('INSURANCE_DESK_SEARCH_PLACEHOLDER')}
            closeButtonLabelText={t('INSURANCE_DESK_SEARCH_CLEAR')}
            value={filters.query}
            onChange={(event) =>
              setFilters({ ...filters, query: event.target.value })
            }
          />
        </div>
        <CaseFilterBar
          filters={filters}
          payers={payers}
          resultCount={cases.length}
          onChange={setFilters}
          onClear={() => setFilters(DEFAULT_FILTERS)}
        />
        {cases.length > 0 ? (
          <CaseList cases={cases} />
        ) : (
          <p className={styles.notice}>{t('INSURANCE_DESK_NO_RESULTS')}</p>
        )}
      </>
    );
  };

  return (
    <>
      <HomePageHeader />
      <main className={styles.page}>
        <Link to="/home/">{t('HOME_LABEL')}</Link>
        <h1>{t('INSURANCE_DESK_TITLE')}</h1>
        <p>{t('INSURANCE_DESK_INFO_NOTE')}</p>
        {usesSyntheticCases && (
          <p className={styles.notice}>
            {t('INSURANCE_DESK_SYNTHETIC_NOTICE')}
          </p>
        )}
        {renderCases()}
      </main>
    </>
  );
};
