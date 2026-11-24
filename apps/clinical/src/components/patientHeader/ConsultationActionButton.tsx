import { Button, SkeletonPlaceholder } from '@bahmni/design-system';
import { useTranslation } from '@bahmni/services';
import { useHasPrivilege, CONSULTATION_PAD_PRIVILEGES } from '@bahmni/widgets';
import React from 'react';
import { dispatchConsultationStart } from '../../events/startConsultation';
import styles from './styles/PatientHeader.module.scss';

interface ConsultationActionButtonProps {
  isActionAreaVisible: boolean;
  editActiveEncounter: boolean;
  isLoading: boolean;
  sessionError?: boolean;
}

const ConsultationActionButton: React.FC<ConsultationActionButtonProps> = ({
  isActionAreaVisible,
  editActiveEncounter,
  isLoading,
  sessionError = false,
}) => {
  const { t } = useTranslation();
  const canAddEncounter = useHasPrivilege(
    CONSULTATION_PAD_PRIVILEGES.ENCOUNTER,
  );

  if (!canAddEncounter) {
    return null;
  }

  if (isLoading) {
    return (
      <SkeletonPlaceholder
        className={styles.newConsultationButtonSkeleton}
        testId="consultation-action-button-skeleton"
      />
    );
  }

  // While the consultation is open beside the chart, say so rather than show a
  // greyed-out button that cannot be pressed.
  if (isActionAreaVisible && !sessionError) {
    return (
      <span
        role="status"
        className={styles.consultationOpen}
        data-testid="consultation-action-button"
      >
        {t('CONSULTATION_ACTION_IN_PROGRESS')}
      </span>
    );
  }

  return (
    <Button
      size="md"
      disabled={sessionError}
      onClick={() =>
        dispatchConsultationStart(
          editActiveEncounter
            ? { editTitle: 'CONSULTATION_ACTION_CONTINUE' }
            : {},
        )
      }
      data-testid="consultation-action-button"
    >
      {sessionError
        ? t('CONSULTATION_SESSION_UNAVAILABLE')
        : editActiveEncounter
          ? t('CONSULTATION_ACTION_CONTINUE')
          : t('CONSULTATION_ACTION_NEW')}
    </Button>
  );
};

export default ConsultationActionButton;
