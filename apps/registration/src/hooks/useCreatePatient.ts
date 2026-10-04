import {
  createPatient,
  generateIdentifier,
  PatientIdentifier,
  PatientAddress,
  AUDIT_LOG_EVENT_DETAILS,
  AuditEventType,
  dispatchAuditEvent,
  useTranslation,
} from '@bahmni/services';
import { useNotification } from '@bahmni/widgets';
import { useMutation } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import type { RelationshipData } from '../components/forms/patientRelationships/PatientRelationships';
import { getPatientUrlExternal } from '../constants/app';
import {
  BasicInfoData,
  PersonAttributesData,
  AdditionalIdentifiersData,
} from '../models/patient';
import { buildPatientProfile } from '../utils/patientProfileMapper';
import { usePersonAttributes } from './usePersonAttributes';

interface CreatePatientFormData {
  profile: BasicInfoData & {
    dobEstimated: boolean;
    patientIdentifier: PatientIdentifier;
    image?: string;
  };
  address: PatientAddress;
  contact: PersonAttributesData;
  additional: PersonAttributesData;
  additionalIdentifiers: AdditionalIdentifiersData;
  relationships: RelationshipData[];
}

export const useCreatePatient = () => {
  const { t } = useTranslation();
  const { addNotification } = useNotification();
  const navigate = useNavigate();
  const { personAttributes } = usePersonAttributes();

  const mutation = useMutation({
    mutationFn: async (formData: CreatePatientFormData) => {
      const { identifierSourceUuid, identifierType, identifier } =
        formData.profile.patientIdentifier;
      if (!identifierType || (!identifierSourceUuid && !identifier?.trim())) {
        throw new Error(
          'Patient ID configuration is unavailable. Select an ID format before saving.',
        );
      }
      let identifierValue: string | undefined;

      if (identifierSourceUuid) {
        const result = await generateIdentifier(identifierSourceUuid);
        identifierValue = result.identifier;
      }

      const profile = {
        ...formData.profile,
        patientIdentifier: {
          ...formData.profile.patientIdentifier,
          ...(identifierValue && { identifier: identifierValue }),
        },
      };

      return createPatient(
        buildPatientProfile({ ...formData, profile }, personAttributes),
      );
    },
    onSuccess: async (response) => {
      addNotification({
        title: t('NOTIFICATION_SUCCESS_TITLE'),
        message: t('NOTIFICATION_PATIENT_SAVED_SUCCESSFULLY'),
        type: 'success',
        timeout: 5000,
      });

      const patientUuid = response?.patient?.uuid;
      if (patientUuid) {
        dispatchAuditEvent({
          eventType: AUDIT_LOG_EVENT_DETAILS.REGISTER_NEW_PATIENT
            .eventType as AuditEventType,
          patientUuid,
          module: AUDIT_LOG_EVENT_DETAILS.REGISTER_NEW_PATIENT.module,
        });

        const patientDisplay =
          response.patient.person?.names?.[0]?.display || patientUuid;

        window.history.replaceState(
          { patientDisplay, patientUuid },
          '',
          getPatientUrlExternal(patientUuid),
        );
      } else {
        navigate('/registration/search');
      }
    },
    onError: (error) => {
      addNotification({
        type: 'error',
        title: t('ERROR_SAVING_PATIENT'),
        message: error instanceof Error ? error.message : String(error),
      });
    },
  });

  return mutation;
};
