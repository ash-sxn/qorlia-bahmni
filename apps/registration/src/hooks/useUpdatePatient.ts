import {
  updatePatient,
  getPatientProfile,
  PatientIdentifier,
  PatientAddress,
  AUDIT_LOG_EVENT_DETAILS,
  AuditEventType,
  dispatchAuditEvent,
  useTranslation,
} from '@bahmni/services';
import { useNotification } from '@bahmni/widgets';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { RelationshipData } from '../components/forms/patientRelationships/PatientRelationships';
import {
  BasicInfoData,
  PersonAttributesData,
  AdditionalIdentifiersData,
} from '../models/patient';
import { buildPatientProfile } from '../utils/patientProfileMapper';
import { usePersonAttributes } from './usePersonAttributes';

const TRAILING_BRACKETED_SUFFIX = /\s\[.*\]$/;

interface UpdatePatientFormData {
  patientUuid: string;
  profile: BasicInfoData & {
    dobEstimated: boolean;
    patientIdentifier: PatientIdentifier;
    image?: string;
  };
  address: PatientAddress;
  contact: PersonAttributesData;
  additional: PersonAttributesData;
  additionalIdentifiers: AdditionalIdentifiersData;
  additionalIdentifiersInitialData?: AdditionalIdentifiersData;
  relationships?: RelationshipData[];
}

export const useUpdatePatient = () => {
  const { t } = useTranslation();
  const { addNotification } = useNotification();
  const { personAttributes } = usePersonAttributes();
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: async (formData: UpdatePatientFormData) => {
      const existing = await getPatientProfile(formData.patientUuid);
      if (
        existing.patient.uuid !== formData.patientUuid ||
        existing.patient.voided
      ) {
        throw new Error(
          'This patient record is no longer available. Reload before saving.',
        );
      }
      return updatePatient(
        formData.patientUuid,
        buildPatientProfile(formData, personAttributes, existing),
      );
    },
    onSuccess: (response, variables) => {
      addNotification({
        title: t('NOTIFICATION_SUCCESS_TITLE'),
        message: t('NOTIFICATION_PATIENT_UPDATED_SUCCESSFULLY'),
        type: 'success',
        timeout: 5000,
      });

      const patientUuid = response?.patient?.uuid;
      if (patientUuid) {
        queryClient.invalidateQueries({
          queryKey: ['registrationPatientProfile', variables.patientUuid],
        });
        queryClient.invalidateQueries({
          queryKey: ['formattedPatient', variables.patientUuid],
        });

        const hasRelationshipChanges = variables.relationships?.some(
          (rel) =>
            (!rel.isExisting &&
              !rel.isDeleted &&
              !!rel.patientUuid &&
              !!rel.relationshipType) ||
            (rel.isExisting && rel.isDeleted),
        );
        if (hasRelationshipChanges) {
          queryClient.invalidateQueries({
            queryKey: ['relatedPersons', variables.patientUuid],
          });
        }

        dispatchAuditEvent({
          eventType: AUDIT_LOG_EVENT_DETAILS.EDIT_PATIENT_DETAILS
            .eventType as AuditEventType,
          patientUuid,
          module: AUDIT_LOG_EVENT_DETAILS.EDIT_PATIENT_DETAILS.module,
        });
      }
    },
    onError: (error) => {
      const message = (
        error instanceof Error ? error.message : String(error)
      ).replace(TRAILING_BRACKETED_SUFFIX, '');
      addNotification({
        type: 'error',
        title: t('ERROR_UPDATING_PATIENT'),
        message,
      });
    },
  });

  return mutation;
};
