import { get, useTranslation } from '@bahmni/services';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { AdminLayout } from '../components/AdminLayout';
import styles from './styles/CsvExport.module.scss';

interface Concept {
  uuid: string;
  name: { name: string };
}

const searchConcepts = async (term: string) => {
  const params = new URLSearchParams({ q: term, v: 'custom:(uuid,name)' });
  const response = await get<{ results: Concept[] }>(
    `/openmrs/ws/rest/v1/concept?${params}`,
  );
  return response.results;
};

export const CsvExport = () => {
  const { t } = useTranslation();
  const [term, setTerm] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => setSearchTerm(term.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [term]);

  const concepts = useQuery({
    queryKey: ['admin', 'concept-export', searchTerm],
    queryFn: () => searchConcepts(searchTerm),
    enabled: searchTerm.length >= 2 && !selected,
  });

  const exportUrl = selected
    ? `/openmrs/ws/rest/v1/bahmnicore/admin/export/conceptset?conceptName=${encodeURIComponent(selected)}`
    : undefined;

  return (
    <AdminLayout>
      <section className={styles.page} aria-label={t('ADMIN_CSV_EXPORT_TITLE')}>
        <p className={styles.eyebrow}>{t('BREADCRUMB_ADMIN')}</p>
        <h1>{t('ADMIN_CSV_EXPORT_TITLE')}</h1>
        <p className={styles.description}>{t('ADMIN_CSV_EXPORT_DESCRIPTION')}</p>
        <div className={styles.card}>
          <label htmlFor="concept-export-search">{t('ADMIN_CSV_EXPORT_CONCEPT')}</label>
          <div className={styles.actions}>
            <input
              id="concept-export-search"
              value={term}
              autoComplete="off"
              onChange={(event) => {
                setTerm(event.target.value);
                setSelected(null);
              }}
              placeholder={t('ADMIN_CSV_EXPORT_PLACEHOLDER')}
            />
            <button
              className={styles.exportButton}
              disabled={!exportUrl}
              onClick={() => window.open(exportUrl, '_blank', 'noopener')}
              type="button"
            >
              {t('ADMIN_CSV_EXPORT_BUTTON')}
            </button>
          </div>
          {!selected && searchTerm === term.trim() && concepts.data && concepts.data.length > 0 && (
            <ul className={styles.suggestions} aria-label={t('ADMIN_CSV_EXPORT_RESULTS')}>
              {concepts.data.map((concept) => (
                <li key={concept.uuid}>
                  <button
                    type="button"
                    onClick={() => {
                      setTerm(concept.name.name);
                      setSelected(concept.name.name);
                    }}
                  >
                    {concept.name.name}
                  </button>
                </li>
              ))}
            </ul>
          )}
          {concepts.isError && <p role="alert">{t('ADMIN_CSV_EXPORT_ERROR')}</p>}
          {searchTerm.length >= 2 && searchTerm === term.trim() && !concepts.isPending && !concepts.isError &&
            !selected && concepts.data?.length === 0 && (
              <p>{t('ADMIN_CSV_EXPORT_EMPTY')}</p>
            )}
        </div>
      </section>
    </AdminLayout>
  );
};
