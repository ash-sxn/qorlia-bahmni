import {
  ComboBox,
  Tile,
  BoxWHeader,
  SelectedItem,
  InlineNotification,
} from '@bahmni/design-system';
import {
  useTranslation,
  type ConceptSearch,
  getConditions,
  getPatientDiagnoses,
  useSubscribeConsultationSaved,
} from '@bahmni/services';
import {
  useNotification,
  usePatientUUID,
  useHasPrivilege,
  CONSULTATION_PAD_PRIVILEGES,
} from '@bahmni/widgets';
import { useQuery } from '@tanstack/react-query';
import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { useConceptSearch } from '../../../hooks/useConceptSearch';
import { useConditionsAndDiagnosesStore } from '../../../stores/conditionsAndDiagnosesStore';
import SelectedConditionItem from './SelectedConditionItem';
import SelectedDiagnosisItem from './SelectedDiagnosisItem';
import styles from './styles/ConditionsAndDiagnoses.module.scss';

/**
 * ConditionsAndDiagnoses component
 *
 * A component that displays a search interface for diagnoses and a list of selected diagnoses.
 * It allows users to search for diagnoses, select them, and specify the certainty level.
 */
const ConditionsAndDiagnoses: React.FC = React.memo(() => {
  const { t } = useTranslation();
  const patientUUID = usePatientUUID();
  const { addNotification } = useNotification();
  const canAddDiagnoses = useHasPrivilege(
    CONSULTATION_PAD_PRIVILEGES.CONDITIONS_AND_DIAGNOSES,
  );
  const canAddConditions = useHasPrivilege(
    CONSULTATION_PAD_PRIVILEGES.CONDITIONS,
  );
  const canEnter = canAddDiagnoses || canAddConditions;
  const [searchDiagnosesTerm, setSearchDiagnosesTerm] = useState('');
  const [selectedDiagnosisItem, setSelectedDiagnosisItem] =
    useState<ConceptSearch | null>(null);
  const [showDuplicateNotification, setShowDuplicateNotification] =
    useState(false);

  // Use Zustand store
  const {
    selectedDiagnoses,
    selectedConditions,
    addDiagnosis,
    addCondition,
    removeDiagnosis,
    updateCertainty,
    markAsCondition,
    removeCondition,
    updateConditionDuration,
  } = useConditionsAndDiagnosesStore();

  // Use concept search hook for diagnoses
  const {
    searchResults,
    loading: isSearchLoading,
    error: searchError,
  } = useConceptSearch(searchDiagnosesTerm);

  const {
    data: existingConditions,
    isLoading: existingConditionsLoading,
    error: existingConditionsError,
    refetch: refetchConditions,
  } = useQuery({
    queryKey: ['conditions', patientUUID!],
    enabled: !!patientUUID && canEnter,
    queryFn: () => getConditions(patientUUID!),
  });

  // Fetch existing diagnoses from backend
  const {
    data: existingDiagnoses,
    isLoading: existingDiagnosesLoading,
    error: existingDiagnosesError,
    refetch: refetchDiagnoses,
  } = useQuery({
    queryKey: ['diagnoses', patientUUID!],
    enabled: !!patientUUID && canAddDiagnoses,
    queryFn: () => getPatientDiagnoses(patientUUID!),
  });

  // Refresh duplicate-check caches after a consultation is saved so that newly
  // added diagnoses/conditions are reflected immediately without a page reload.
  useSubscribeConsultationSaved(
    (payload) => {
      if (
        payload.patientUUID === patientUUID &&
        payload.updatedResources.conditions
      ) {
        if (canAddDiagnoses) refetchDiagnoses();
        if (canEnter) refetchConditions();
      }
    },
    [
      patientUUID,
      canAddDiagnoses,
      canEnter,
      refetchDiagnoses,
      refetchConditions,
    ],
  );

  useEffect(() => {
    if (existingConditionsError) {
      addNotification({
        title: t('ERROR_DEFAULT_TITLE'),
        message: existingConditionsError.message,
        type: 'error',
      });
    }
  }, [existingConditionsLoading, existingConditionsError, addNotification, t]);

  useEffect(() => {
    if (canAddDiagnoses && existingDiagnosesError) {
      addNotification({
        title: t('ERROR_DEFAULT_TITLE'),
        message: existingDiagnosesError.message,
        type: 'error',
      });
    }
  }, [
    canAddDiagnoses,
    existingDiagnosesLoading,
    existingDiagnosesError,
    addNotification,
    t,
  ]);

  const handleSearch = (searchTerm: string) => {
    setSearchDiagnosesTerm(searchTerm);
  };

  const isDuplicateDiagnosis = useCallback(
    (diagnosisId: string, diagnosisDisplay: string): boolean => {
      // Normalize for case-insensitive comparison (same as backend deduplication)
      const normalizedDisplay = diagnosisDisplay.toLowerCase().trim();

      // Check against existing diagnoses from backend by display name
      const isExistingDiagnosis = existingDiagnoses?.some(
        (d) => d.display.toLowerCase().trim() === normalizedDisplay,
      );

      // Check against currently selected diagnoses in the form by ID
      const isSelectedDiagnosis = selectedDiagnoses.some(
        (d) => d.id === diagnosisId,
      );

      // We need || here (not ??) because we're checking boolean false values
      // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
      return !!(isExistingDiagnosis || isSelectedDiagnosis);
    },
    [existingDiagnoses, selectedDiagnoses],
  );

  const handleOnChange = (selectedItem: ConceptSearch | null) => {
    setShowDuplicateNotification(false);
    if (
      !canEnter ||
      selectedItem?.disabled ||
      !selectedItem?.conceptUuid ||
      !selectedItem.conceptName ||
      existingConditionsLoading ||
      (canAddDiagnoses && existingDiagnosesLoading) ||
      existingConditionsError ||
      (canAddDiagnoses && existingDiagnosesError) ||
      !existingConditions ||
      (canAddDiagnoses && !existingDiagnoses)
    ) {
      return;
    }

    // Check for duplicate BEFORE adding
    if (
      canAddDiagnoses
        ? isDuplicateDiagnosis(
            selectedItem.conceptUuid,
            selectedItem.conceptName,
          )
        : isConditionDuplicate(selectedItem.conceptUuid)
    ) {
      setShowDuplicateNotification(true);
      return; // Don't add duplicate!
    }

    // Successfully added, clear any previous duplicate notification
    if (canAddDiagnoses) addDiagnosis(selectedItem);
    else addCondition(selectedItem);
    setSearchDiagnosesTerm('');
    setSelectedDiagnosisItem(selectedItem);
  };

  const isConditionDuplicate = (diagnosisId: string): boolean => {
    const isExistingCondition =
      existingConditions?.some((d) =>
        d.code?.coding?.some((coding) => coding.code === diagnosisId),
      ) ?? false;
    const isSelectedConditions =
      selectedConditions?.some((condition) => condition.id === diagnosisId) ||
      false;
    return isExistingCondition || isSelectedConditions;
  };

  const filteredSearchResults: ConceptSearch[] = useMemo(() => {
    if (searchDiagnosesTerm.length === 0) return [];
    if (
      searchError ||
      existingConditionsError ||
      (canAddDiagnoses && existingDiagnosesError)
    ) {
      return [
        {
          conceptName: t('ERROR_FETCHING_CONCEPTS'),
          conceptUuid: '',
          matchedName: '',
          disabled: true,
        },
      ];
    }
    if (
      isSearchLoading ||
      existingConditionsLoading ||
      (canAddDiagnoses && existingDiagnosesLoading) ||
      !existingConditions ||
      (canAddDiagnoses && !existingDiagnoses)
    ) {
      return [
        {
          conceptName: t('LOADING_CONCEPTS'),
          conceptUuid: '',
          matchedName: '',
          disabled: true,
        },
      ];
    }

    if (searchResults.length === 0) {
      return [
        {
          conceptName: t(
            canAddDiagnoses
              ? 'NO_MATCHING_DIAGNOSIS_FOUND'
              : 'NO_MATCHING_CONDITION_FOUND',
          ),
          conceptUuid: '',
          matchedName: '',
          disabled: true,
        },
      ];
    }

    return searchResults.map((item) => {
      const isAlreadySelected = canAddDiagnoses
        ? selectedDiagnoses.some((d) => d.id === item.conceptUuid)
        : selectedConditions.some((d) => d.id === item.conceptUuid) ||
          existingConditions.some((d) =>
            d.code?.coding?.some((coding) => coding.code === item.conceptUuid),
          );
      return {
        ...item,
        conceptName: isAlreadySelected
          ? `${item.conceptName} (${t(canAddDiagnoses ? 'DIAGNOSIS_ALREADY_ADDED' : 'CONDITION_ALREADY_ADDED')})`
          : item.conceptName,
        disabled: isAlreadySelected,
      };
    });
  }, [
    isSearchLoading,
    existingConditionsLoading,
    existingDiagnosesLoading,
    searchResults,
    searchDiagnosesTerm,
    searchError,
    existingConditionsError,
    existingDiagnosesError,
    existingConditions,
    existingDiagnoses,
    selectedDiagnoses,
    selectedConditions,
    canAddDiagnoses,
    t,
  ]);

  if (!canEnter) return null;

  return (
    <Tile
      className={styles.conditionsAndDiagnosesTile}
      data-testid="conditions-and-diagnoses-tile"
    >
      <div
        className={styles.conditionsAndDiagnosesTitle}
        data-testid="conditions-and-diagnoses-title"
      >
        {t(
          canAddDiagnoses
            ? 'CONDITIONS_AND_DIAGNOSES_FORM_TITLE'
            : 'CONDITION_LIST_DISPLAY_CONTROL_TITLE',
        )}
      </div>
      <ComboBox
        id="diagnoses-search"
        data-testid="diagnoses-search-combobox"
        placeholder={t(
          canAddDiagnoses
            ? 'DIAGNOSES_SEARCH_PLACEHOLDER'
            : 'CONDITIONS_SEARCH_PLACEHOLDER',
        )}
        items={filteredSearchResults}
        itemToString={(item) => item?.conceptName ?? ''}
        onChange={(data) => handleOnChange(data.selectedItem ?? null)}
        onInputChange={(searchQuery: string) => handleSearch(searchQuery)}
        selectedItem={selectedDiagnosisItem}
        clearSelectedOnChange
        allowCustomValue
        size="md"
        autoAlign
        aria-label={t(
          canAddDiagnoses
            ? 'DIAGNOSES_SEARCH_ARIA_LABEL'
            : 'CONDITIONS_SEARCH_ARIA_LABEL',
        )}
      />
      {showDuplicateNotification && (
        <InlineNotification
          kind="error"
          lowContrast
          subtitle={t(
            canAddDiagnoses
              ? 'DIAGNOSIS_ALREADY_ADDED'
              : 'CONDITION_ALREADY_ADDED',
          )}
          onClose={() => setShowDuplicateNotification(false)}
          hideCloseButton={false}
          className={styles.duplicateNotification}
        />
      )}
      {selectedDiagnoses && selectedDiagnoses.length > 0 && (
        <BoxWHeader
          title={t('DIAGNOSES_ADDED_DIAGNOSES')}
          className={styles.conditionsAndDiagnosesBox}
        >
          {selectedDiagnoses.map((diagnosis) => (
            <SelectedItem
              key={diagnosis.id}
              className={styles.selectedDiagnosisItem}
              onClose={() => removeDiagnosis(diagnosis.id)}
            >
              <SelectedDiagnosisItem
                diagnosis={diagnosis}
                updateCertainty={updateCertainty}
                onMarkAsCondition={() => {
                  if (
                    canAddConditions &&
                    diagnosis.selectedCertainty?.code === 'confirmed' &&
                    existingConditions &&
                    !existingConditionsLoading &&
                    !existingConditionsError &&
                    !isConditionDuplicate(diagnosis.id)
                  ) {
                    markAsCondition(diagnosis.id);
                  }
                }}
                doesConditionExist={isConditionDuplicate(diagnosis.id)}
                canMarkAsCondition={
                  canAddConditions &&
                  !!existingConditions &&
                  !existingConditionsLoading &&
                  !existingConditionsError
                }
              />
            </SelectedItem>
          ))}
        </BoxWHeader>
      )}
      {selectedConditions && selectedConditions.length > 0 && (
        <BoxWHeader
          title={t('CONDITIONS_SECTION_TITLE')}
          className={styles.conditionsAndDiagnosesBox}
        >
          {selectedConditions.map((condition) => (
            <SelectedItem
              key={condition.id}
              className={styles.selectedConditionItem}
              onClose={() => removeCondition(condition.id)}
            >
              <SelectedConditionItem
                condition={condition}
                updateConditionDuration={updateConditionDuration}
              />
            </SelectedItem>
          ))}
        </BoxWHeader>
      )}
    </Tile>
  );
});

ConditionsAndDiagnoses.displayName = 'ConditionsAndDiagnoses';

export default ConditionsAndDiagnoses;
