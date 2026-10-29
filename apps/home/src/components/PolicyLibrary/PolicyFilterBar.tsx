import { Button, Dropdown } from '@bahmni/design-system';
import { useTranslation } from '@bahmni/services';
import { DEFAULT_FILTERS, PolicyFilters } from './filterPolicies';
import styles from './PolicyLibrary.module.scss';
import { CATEGORIES, JURISDICTIONS } from './types';

interface FilterOption {
  value: string;
  label: string;
}

interface PolicyFilterBarProps {
  filters: PolicyFilters;
  resultCount: number;
  onChange: (filters: PolicyFilters) => void;
  onClear: () => void;
}

export const PolicyFilterBar = ({
  filters,
  resultCount,
  onChange,
  onClear,
}: PolicyFilterBarProps) => {
  const { t } = useTranslation();
  const allOption = { value: 'all', label: t('POLICY_LIBRARY_FILTER_ALL') };

  const renderDropdown = (
    id: string,
    title: string,
    options: FilterOption[],
    value: string,
    onSelect: (value: string) => void,
  ) => (
    <Dropdown<FilterOption>
      id={id}
      titleText={title}
      label={title}
      items={options}
      itemToString={(option) => option?.label ?? ''}
      selectedItem={options.find((option) => option.value === value)}
      onChange={({ selectedItem }) => {
        if (selectedItem) {
          onSelect(selectedItem.value);
        }
      }}
    />
  );

  const isDefault = Object.entries(DEFAULT_FILTERS).every(
    ([key, value]) => filters[key as keyof PolicyFilters] === value,
  );

  return (
    <div className={styles.filterBar}>
      <div className={styles.filters}>
        {renderDropdown(
          'policy-filter-jurisdiction',
          t('POLICY_LIBRARY_FILTER_JURISDICTION'),
          [
            allOption,
            ...JURISDICTIONS.map((value) => ({
              value,
              label: t(`POLICY_LIBRARY_JURISDICTION_${value.toUpperCase()}`),
            })),
          ],
          filters.jurisdiction,
          (value) =>
            onChange({
              ...filters,
              jurisdiction: value as PolicyFilters['jurisdiction'],
            }),
        )}
        {renderDropdown(
          'policy-filter-category',
          t('POLICY_LIBRARY_FILTER_CATEGORY'),
          [
            allOption,
            ...CATEGORIES.map((value) => ({
              value,
              label: t(`POLICY_LIBRARY_CATEGORY_${value.toUpperCase()}`),
            })),
          ],
          filters.category,
          (value) =>
            onChange({
              ...filters,
              category: value as PolicyFilters['category'],
            }),
        )}
        {renderDropdown(
          'policy-filter-status',
          t('POLICY_LIBRARY_FILTER_STATUS'),
          [
            {
              value: 'reviewed',
              label: t('POLICY_LIBRARY_FILTER_STATUS_REVIEWED'),
            },
            { value: 'all', label: t('POLICY_LIBRARY_FILTER_STATUS_ALL') },
          ],
          filters.reviewStatus,
          (value) =>
            onChange({
              ...filters,
              reviewStatus: value as PolicyFilters['reviewStatus'],
            }),
        )}
      </div>
      <div className={styles.resultBar}>
        <p aria-live="polite">
          {t('POLICY_LIBRARY_RESULT_COUNT', { count: resultCount })}
        </p>
        <Button kind="ghost" size="sm" disabled={isDefault} onClick={onClear}>
          {t('POLICY_LIBRARY_CLEAR_FILTERS')}
        </Button>
      </div>
    </div>
  );
};
