import { Button, Dropdown, Search } from '@bahmni/design-system';
import { useTranslation } from '@bahmni/services';
import { useState } from 'react';
import styles from '../styles/SearchPatient.module.scss';

interface SearchPatientInputProps {
  buttonTitle: string;
  searchBarPlaceholder: string;
  isLoading: boolean;
  searchInput: string;
  advanceSearchInput: string;
  validationError: string;
  dropdownItems: string[];
  selectedDropdownItem: string;
  onNameChange: (value: string) => void;
  onAdvanceChange: (value: string) => void;
  onNameSearch: () => void;
  onAdvanceSearch: () => void;
  onNameClear: () => void;
  onAdvanceClear: () => void;
  onDropdownChange: (item: string) => void;
}

/**
 * One search box. "Search by" picks what the box looks for: name or patient ID
 * first, then each configured field such as phone number. Reception types into
 * one place and presses one button, instead of choosing between two boxes.
 */
const SearchPatientInput = ({
  buttonTitle,
  searchBarPlaceholder,
  isLoading,
  searchInput,
  advanceSearchInput,
  validationError,
  dropdownItems,
  selectedDropdownItem,
  onNameChange,
  onAdvanceChange,
  onNameSearch,
  onAdvanceSearch,
  onNameClear,
  onAdvanceClear,
  onDropdownChange,
}: SearchPatientInputProps) => {
  const { t } = useTranslation();
  const nameOrId = t('PATIENT_SEARCH_BY_NAME_OR_ID', {
    defaultValue: 'Name or patient ID',
  });
  const [byName, setByName] = useState(true);
  const searchBy = [nameOrId, ...dropdownItems];

  const choose = (item: string) => {
    if (item === nameOrId) {
      setByName(true);
      onAdvanceClear();
      onNameClear();
      return;
    }
    setByName(false);
    onNameClear();
    onDropdownChange(item);
  };

  const value = byName ? searchInput : advanceSearchInput;
  const submit = byName ? onNameSearch : onAdvanceSearch;

  return (
    <div
      id="search-patient-tile"
      data-testid="search-patient-tile"
      className={styles.searchPatientContainer}
    >
      <div
        id="search-patient-input"
        className={styles.searchPatient}
        data-testid="search-patient-input"
      >
        <Dropdown
          id="search-type-dropdown"
          testId="search-type-dropdown"
          titleText={t('PATIENT_SEARCH_BY', { defaultValue: 'Search by' })}
          label={byName ? nameOrId : selectedDropdownItem}
          className={styles.searchTypeDropdown}
          size="lg"
          items={searchBy}
          selectedItem={byName ? nameOrId : selectedDropdownItem}
          onChange={(event) => choose(event.selectedItem ?? nameOrId)}
          aria-label={t('PATIENT_SEARCH_ATTRIBUTE_SELECTOR')}
        />
        <div className={styles.advanceInputWrapper}>
          {byName ? (
            <Search
              id="search-patient-searchbar"
              testId="search-patient-searchbar"
              placeholder={searchBarPlaceholder}
              labelText={nameOrId}
              size="lg"
              value={searchInput}
              onChange={(e) => onNameChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.code === 'Enter') onNameSearch();
              }}
              onClear={onNameClear}
            />
          ) : (
            <Search
              id="advance-search-input"
              testId="advance-search-input"
              labelText={selectedDropdownItem}
              placeholder={t('SEARCH_BY_CUSTOM_ATTRIBUTE', {
                attribute: String(selectedDropdownItem),
              })}
              size="lg"
              value={advanceSearchInput}
              onChange={(e) => onAdvanceChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.code === 'Enter') onAdvanceSearch();
              }}
              onClear={onAdvanceClear}
              inputMode="numeric"
            />
          )}
          {!byName && validationError && (
            <div
              className={styles.errorMessage}
              data-testid="field-validation-error"
            >
              {validationError}
            </div>
          )}
        </div>
        <Button
          id={byName ? 'search-patient-search-button' : 'advance-search-button'}
          testId={
            byName ? 'search-patient-search-button' : 'advance-search-button'
          }
          size="lg"
          onClick={submit}
          disabled={isLoading || value.trim().length === 0}
          className={styles.searchButton}
        >
          {buttonTitle}
        </Button>
      </div>
    </div>
  );
};

export default SearchPatientInput;
