import { Button, Dropdown } from '@bahmni/design-system';
import { useTranslation } from '@bahmni/services';
import { CaseFilters, DEFAULT_FILTERS } from './filterCases';
import styles from './InsuranceDesk.module.scss';
import { CASE_STATUSES, CLAIM_ROUTES } from './types';

interface FilterOption {
  value: string;
  label: string;
}

interface CaseFilterBarProps {
  filters: CaseFilters;
  payers: readonly string[];
  resultCount: number;
  onChange: (filters: CaseFilters) => void;
  onClear: () => void;
}

export const CaseFilterBar = ({
  filters,
  payers,
  resultCount,
  onChange,
  onClear,
}: CaseFilterBarProps) => {
  const { t } = useTranslation();
  const allOption = { value: 'all', label: t('INSURANCE_DESK_FILTER_ALL') };

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
    ([key, value]) => filters[key as keyof CaseFilters] === value,
  );

  return (
    <div className={styles.filterBar}>
      <div className={styles.filters}>
        {renderDropdown(
          'case-filter-status',
          t('INSURANCE_DESK_FILTER_STATUS'),
          [
            allOption,
            ...CASE_STATUSES.map((value) => ({
              value,
              label: t(`INSURANCE_DESK_STATUS_${value.toUpperCase()}`),
            })),
          ],
          filters.status,
          (value) =>
            onChange({ ...filters, status: value as CaseFilters['status'] }),
        )}
        {renderDropdown(
          'case-filter-route',
          t('INSURANCE_DESK_FILTER_ROUTE'),
          [
            allOption,
            ...CLAIM_ROUTES.map((value) => ({
              value,
              label: t(`INSURANCE_DESK_ROUTE_${value.toUpperCase()}`),
            })),
          ],
          filters.route,
          (value) =>
            onChange({ ...filters, route: value as CaseFilters['route'] }),
        )}
        {renderDropdown(
          'case-filter-payer',
          t('INSURANCE_DESK_FILTER_PAYER'),
          [allOption, ...payers.map((value) => ({ value, label: value }))],
          filters.payer,
          (value) => onChange({ ...filters, payer: value }),
        )}
      </div>
      <div className={styles.resultBar}>
        <p aria-live="polite">
          {t('INSURANCE_DESK_RESULT_COUNT', { count: resultCount })}
        </p>
        <Button kind="ghost" size="sm" disabled={isDefault} onClick={onClear}>
          {t('INSURANCE_DESK_CLEAR_FILTERS')}
        </Button>
      </div>
    </div>
  );
};
