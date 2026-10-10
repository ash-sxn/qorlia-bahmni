import { ActionArea, InlineNotification, Loading } from '@bahmni/design-system';
import {
  MODULE_LABELS,
  createVisitWithFhirR4,
  dispatchAuditEvent,
  getActiveVisit,
  getActiveVisitAtLoginLocation,
  getVisitLocationUUID,
  getUserLoginLocation,
  useTranslation,
} from '@bahmni/services';
import {
  CONSULTATION_PAD_PRIVILEGES,
  useHasPrivilege,
  useNotification,
  usePatientUUID,
} from '@bahmni/widgets';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { EncounterSessionStartContext } from '../../events/startConsultation';
import { useActionAreaExpandProps } from '../../hooks/useActionAreaExpandProps';
import { useClinicalAppData } from '../../hooks/useClinicalAppData';
import { useEncounterConcepts } from '../../hooks/useEncounterConcepts';
import { useClinicalConfig } from '../../providers/clinicalConfig';
import { InputControl } from '../../providers/clinicalConfig/models';
import { useEncounterDetailsStore } from '../../stores/encounterDetailsStore';
import ConsultationPad from '../consultationPad';
import { ENCOUNTER_DETAILS_INPUT_CONTROL_KEY } from '../consultationPad/constants';
import EncounterDetails from '../forms/encounterDetails/EncounterDetails';
import styles from './styles/ConsultationPadContainer.module.scss';

interface ConsultationPadContainerProps {
  encounterSessionStartContext: EncounterSessionStartContext;
  onClose: () => void;
  isActionAreaExpanded?: boolean;
  onToggleActionAreaExpand?: () => void;
}

const ConsultationPadContainer: React.FC<ConsultationPadContainerProps> = ({
  encounterSessionStartContext,
  onClose,
  isActionAreaExpanded,
  onToggleActionAreaExpand,
}) => {
  const { t } = useTranslation();
  const { addNotification } = useNotification();
  const patientUuid = usePatientUUID();
  const { activeEpisodeId } = useClinicalAppData();
  const {
    clinicalConfig,
    isLoading: configLoading,
    error: configError,
  } = useClinicalConfig();
  const {
    encounterConcepts,
    loading: conceptsLoading,
    error: conceptsError,
    refetch: refetchConcepts,
  } = useEncounterConcepts();
  const hasAddVisitsPrivilege = useHasPrivilege(
    CONSULTATION_PAD_PRIVILEGES.ADD_VISITS,
  );
  const actionAreaExpandProps = useActionAreaExpandProps({
    isExpanded: isActionAreaExpanded,
    onToggleExpand: onToggleActionAreaExpand,
  });

  const queryClient = useQueryClient();

  const [visitCreated, setVisitCreated] = useState(false);
  const [creating, setCreating] = useState(false);
  const [creationError, setCreationError] = useState<Error | null>(null);
  const [checking, setChecking] = useState(false);
  const [recheckedEmpty, setRecheckedEmpty] = useState(false);
  const inFlight = useRef(false);
  const autoAttempted = useRef(false);
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  let loginLocationUuid: string | undefined;
  try {
    loginLocationUuid = getUserLoginLocation().uuid;
  } catch {
    // The query reports missing location/session data. No write is allowed.
  }
  const visitQueryKey = useMemo(
    () => ['activeVisitAtLoginLocation', patientUuid, loginLocationUuid],
    [patientUuid, loginLocationUuid],
  );

  const {
    data: activeVisit,
    error: queryError,
    isLoading: queryLoading,
    isFetching: queryFetching,
    refetch: refetchVisit,
  } = useQuery({
    queryKey: visitQueryKey,
    queryFn: () => getActiveVisitAtLoginLocation(patientUuid!),
    enabled: !!patientUuid,
    retry: false,
    refetchOnMount: 'always',
  });

  const allowedVisitTypes = useMemo<string[]>(
    () => clinicalConfig?.consultationPad?.allowedVisitTypes ?? [],
    [clinicalConfig],
  );

  const encounterDetailsControl = useMemo(() => {
    if (configLoading) return undefined;
    const inputControlConfig =
      clinicalConfig?.consultationPad?.inputControls?.find(
        (c) => c.type === ENCOUNTER_DETAILS_INPUT_CONTROL_KEY,
      );
    return {
      ...inputControlConfig,
      metadata: { ...inputControlConfig?.metadata, allowedVisitTypes },
    } as InputControl;
  }, [configLoading, clinicalConfig, allowedVisitTypes]);

  const defaultEncounterType = encounterDetailsControl?.metadata
    ?.defaultEncounterType as string;

  const allowedVisitTypeObjects = useMemo(() => {
    if (!encounterConcepts?.visitTypes || allowedVisitTypes.length === 0)
      return [];
    return encounterConcepts.visitTypes.filter((v) =>
      allowedVisitTypes.includes(v.name),
    );
  }, [encounterConcepts?.visitTypes, allowedVisitTypes]);

  const isAllowedVisitTypesMissing =
    !configLoading && allowedVisitTypes.length === 0;
  const noActiveVisit = activeVisit === null;
  const shouldAutoCreate =
    noActiveVisit &&
    !queryFetching &&
    !queryError &&
    !creationError &&
    !checking &&
    !visitCreated &&
    !configLoading &&
    !conceptsLoading &&
    !configError &&
    !conceptsError &&
    hasAddVisitsPrivilege &&
    allowedVisitTypeObjects.length === 1;

  const createVisitAndProceed = useCallback(
    async (visitTypeUuid: string, visitTypeName: string) => {
      if (
        inFlight.current ||
        !patientUuid ||
        !loginLocationUuid ||
        visitCreated
      )
        return;
      inFlight.current = true;
      autoAttempted.current = true;
      setCreating(true);
      setCreationError(null);
      try {
        const visitLocation = await getVisitLocationUUID(loginLocationUuid);
        if (!mounted.current) return;
        // Another user may have started a visit since the selection panel opened.
        const existingVisit = await getActiveVisit(
          patientUuid,
          visitLocation.uuid,
        );
        if (!mounted.current) return;
        const visit =
          existingVisit ??
          (await createVisitWithFhirR4(
            patientUuid,
            visitLocation.uuid,
            visitTypeUuid,
            activeEpisodeId ?? undefined,
          ));

        if (!existingVisit)
          dispatchAuditEvent({
            eventType: 'OPEN_VISIT',
            patientUuid,
            messageParams: { visitType: visitTypeName },
            module: MODULE_LABELS.CLINICAL,
          });
        queryClient.setQueryData(visitQueryKey, visit);
        if (!mounted.current) return;
        const details = useEncounterDetailsStore.getState();
        details.reset();
        details.setConsultationDate(new Date());
        details.setRequestedEncounterType(
          encounterSessionStartContext.encounterType ??
            defaultEncounterType ??
            null,
        );
        setVisitCreated(true);
      } catch (err) {
        if (!mounted.current) return;
        setCreationError(
          err instanceof Error
            ? err
            : new Error(t('START_VISIT_ERROR_MESSAGE')),
        );
      } finally {
        inFlight.current = false;
        if (mounted.current) setCreating(false);
      }
    },
    [
      patientUuid,
      loginLocationUuid,
      visitCreated,
      t,
      queryClient,
      visitQueryKey,
      activeEpisodeId,
      encounterSessionStartContext.encounterType,
      defaultEncounterType,
    ],
  );

  useEffect(() => {
    useEncounterDetailsStore.getState().setConsultationDate(new Date());
  }, []);

  useEffect(() => {
    useEncounterDetailsStore
      .getState()
      .setRequestedEncounterType(
        encounterSessionStartContext.encounterType ??
          defaultEncounterType ??
          null,
      );
  }, [encounterSessionStartContext.encounterType, defaultEncounterType]);

  useEffect(() => {
    if (!shouldAutoCreate || autoAttempted.current) return;
    const visitType = allowedVisitTypeObjects[0];
    createVisitAndProceed(visitType.uuid, visitType.name);
  }, [shouldAutoCreate, allowedVisitTypeObjects, createVisitAndProceed]);

  useEffect(() => {
    if (!creationError && !queryError) return;
    addNotification({
      type: 'error',
      title: t('START_VISIT_ERROR_TITLE'),
      message: t(
        creationError
          ? 'START_VISIT_ERROR_MESSAGE'
          : 'CHECK_VISIT_STATUS_ERROR',
      ),
    });
  }, [creationError, queryError, addNotification, t]);

  const selectedVisitType = useEncounterDetailsStore(
    (encounterDetails) => encounterDetails.selectedVisitType,
  );
  const selectedEncounterType = useEncounterDetailsStore(
    (encounterDetails) => encounterDetails.selectedEncounterType,
  );

  const handleCancel = useCallback(() => {
    useEncounterDetailsStore.getState().reset();
    onClose();
  }, [onClose]);

  const handleStart = useCallback(() => {
    if (
      creationError ||
      queryError ||
      queryFetching ||
      checking ||
      !noActiveVisit
    )
      return;
    const visitType =
      allowedVisitTypeObjects.length === 1
        ? allowedVisitTypeObjects[0]
        : allowedVisitTypeObjects.find(
            (type) => type.uuid === selectedVisitType?.uuid,
          );
    if (
      !visitType ||
      (allowedVisitTypeObjects.length > 1 && !selectedEncounterType)
    )
      return;
    createVisitAndProceed(visitType.uuid, visitType.name);
  }, [
    creationError,
    queryError,
    queryFetching,
    checking,
    noActiveVisit,
    allowedVisitTypeObjects,
    selectedVisitType,
    selectedEncounterType,
    createVisitAndProceed,
  ]);

  const handleCheckStatus = async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    // A lost POST reply may hide a committed visit. Recovery is GET-only.
    autoAttempted.current = true;
    setChecking(true);
    try {
      const result = await refetchVisit();
      if (!mounted.current || result.error || result.data === undefined) return;
      setCreationError(null);
      setRecheckedEmpty(result.data === null);
      if (result.data) setVisitCreated(true);
    } catch {
      // Keep recovery open. A failed read never authorizes another write.
    } finally {
      inFlight.current = false;
      if (mounted.current) setChecking(false);
    }
  };

  if (
    visitCreated ||
    (activeVisit && !queryError && !queryFetching && !creating && !checking)
  ) {
    return (
      <ConsultationPad
        encounterSessionStartContext={encounterSessionStartContext}
        onClose={onClose}
        isActionAreaExpanded={isActionAreaExpanded}
        onToggleActionAreaExpand={onToggleActionAreaExpand}
      />
    );
  }

  if (
    queryLoading ||
    queryFetching ||
    creating ||
    checking ||
    configLoading ||
    conceptsLoading
  ) {
    return (
      <div
        className={styles.loadingWrapper}
        data-testid="consultation-pad-container-loading"
      >
        <Loading
          description={t(creating ? 'STARTING_VISIT' : 'CHECKING_VISIT_STATUS')}
          withOverlay={false}
        />
      </div>
    );
  }

  if (creationError || queryError) {
    return (
      <ActionArea
        title={t('CONSULTATION_PAD_TITLE')}
        primaryButtonText={t('CHECK_VISIT_STATUS_BUTTON')}
        onPrimaryButtonClick={handleCheckStatus}
        secondaryButtonText={t('CONSULTATION_PAD_CANCEL_BUTTON')}
        onSecondaryButtonClick={handleCancel}
        content={
          <div className={styles.bannerWrapper}>
            <InlineNotification
              kind="error"
              title={t(
                creationError
                  ? 'START_VISIT_ERROR_MESSAGE'
                  : 'CHECK_VISIT_STATUS_ERROR',
              )}
              lowContrast
              hideCloseButton
              testId="consultation-pad-container-status-error"
            />
          </div>
        }
        ariaLabel={t('CONSULTATION_PAD_TITLE')}
        {...actionAreaExpandProps}
      />
    );
  }

  if (configError || conceptsError) {
    return (
      <ActionArea
        title={t('CONSULTATION_PAD_TITLE')}
        primaryButtonText={t('RETRY_VISIT_SETUP_BUTTON')}
        onPrimaryButtonClick={() => {
          if (configError)
            void queryClient.refetchQueries({ queryKey: ['clinicalConfig'] });
          if (conceptsError) refetchConcepts();
        }}
        secondaryButtonText={t('CONSULTATION_PAD_CANCEL_BUTTON')}
        onSecondaryButtonClick={handleCancel}
        content={
          <div className={styles.bannerWrapper}>
            <InlineNotification
              kind="error"
              title={t('START_VISIT_SETUP_UNAVAILABLE')}
              lowContrast
              hideCloseButton
            />
          </div>
        }
        ariaLabel={t('CONSULTATION_PAD_TITLE')}
        {...actionAreaExpandProps}
      />
    );
  }

  if (
    noActiveVisit &&
    (!hasAddVisitsPrivilege ||
      isAllowedVisitTypesMissing ||
      allowedVisitTypeObjects.length === 0)
  ) {
    return (
      <ActionArea
        title={t('CONSULTATION_PAD_TITLE')}
        primaryButtonText={t('CLOSE_BUTTON')}
        onPrimaryButtonClick={onClose}
        content={
          <div className={styles.bannerWrapper}>
            <InlineNotification
              kind="warning"
              title={t('START_VISIT_REQUEST_TO_BE_STARTED')}
              lowContrast
              hideCloseButton
              testId="consultation-pad-container-no-privilege"
            />
          </div>
        }
        ariaLabel={t('CONSULTATION_PAD_TITLE')}
        {...actionAreaExpandProps}
      />
    );
  }

  if (
    noActiveVisit &&
    hasAddVisitsPrivilege &&
    (allowedVisitTypeObjects.length > 1 || recheckedEmpty)
  ) {
    return (
      <ActionArea
        title={t('CONSULTATION_PAD_TITLE')}
        primaryButtonText={t('START_VISIT_BUTTON')}
        onPrimaryButtonClick={handleStart}
        isPrimaryButtonDisabled={
          allowedVisitTypeObjects.length > 1 &&
          (!selectedVisitType || !selectedEncounterType)
        }
        secondaryButtonText={t('CONSULTATION_PAD_CANCEL_BUTTON')}
        onSecondaryButtonClick={handleCancel}
        content={
          <>
            <div className={styles.bannerWrapper}>
              <InlineNotification
                kind="warning"
                title={t(
                  recheckedEmpty
                    ? 'START_VISIT_RECHECKED_EMPTY'
                    : 'START_VISIT_NO_ACTIVE_VISIT_BANNER',
                )}
                lowContrast
                hideCloseButton
              />
            </div>
            <EncounterDetails
              encounterSessionStartContext={{
                ...encounterSessionStartContext,
                isVisitActive: false,
              }}
              inputControlConfig={encounterDetailsControl}
            />
          </>
        }
        ariaLabel={t('CONSULTATION_PAD_TITLE')}
        {...actionAreaExpandProps}
      />
    );
  }

  return null;
};

export default ConsultationPadContainer;
