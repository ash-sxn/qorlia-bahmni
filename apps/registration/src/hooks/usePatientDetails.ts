import {
  getPatientProfile,
  formatDateTime,
  useTranslation,
} from '@bahmni/services';
import { useNotification } from '@bahmni/widgets';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo } from 'react';
import { useGenderData } from '../utils/identifierGenderUtils';
import {
  convertToBasicInfoData,
  convertToPersonAttributesData,
  convertToAddressData,
  convertToAdditionalIdentifiersData,
  convertToRelationshipsData,
} from '../utils/patientDataConverter';
import { usePersonAttributes } from './usePersonAttributes';

export const usePatientDetails = ({
  patientUuid,
}: {
  patientUuid: string | undefined;
}) => {
  const { t } = useTranslation();
  const { getGenderDisplay } = useGenderData(t);
  const { addNotification } = useNotification();
  const { personAttributes } = usePersonAttributes();
  const {
    data: patientDetails,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['registrationPatientProfile', patientUuid],
    queryFn: () => getPatientProfile(patientUuid!),
    enabled: !!patientUuid,
  });

  useEffect(() => {
    if (error)
      addNotification({
        type: 'error',
        title: t('ERROR_LOADING_PATIENT_DETAILS'),
        message: error instanceof Error ? error.message : String(error),
      });
  }, [error, t, addNotification]);

  const metadata = useMemo(() => {
    const person = patientDetails?.patient.person;
    const preferredName =
      person?.names.find((n) => n.preferred && !n.voided) ??
      person?.names.find((n) => !n.voided);
    const registered =
      person?.auditInfo?.dateCreated ??
      patientDetails?.patient.auditInfo?.dateCreated;
    return {
      patientUuid: patientDetails?.patient.uuid ?? '',
      patientIdentifier:
        patientDetails?.patient.identifiers.find(
          (id) => id.preferred && !id.voided,
        )?.identifier ?? '',
      patientName: [
        preferredName?.givenName,
        preferredName?.middleName,
        preferredName?.familyName,
      ]
        .filter(Boolean)
        .join(' '),
      registerDate: registered
        ? formatDateTime(registered, t).formattedResult
        : '',
    };
  }, [patientDetails, t]);

  const initialData = useMemo(
    () => ({
      profileInitialData: convertToBasicInfoData(
        patientDetails,
        getGenderDisplay,
      ),
      personAttributesInitialData: convertToPersonAttributesData(
        patientDetails,
        personAttributes,
      ),
      addressInitialData: convertToAddressData(patientDetails),
      additionalIdentifiersInitialData:
        convertToAdditionalIdentifiersData(patientDetails),
      initialDobEstimated:
        patientDetails?.patient.person.birthdateEstimated ?? false,
      relationshipsInitialData: patientDetails
        ? convertToRelationshipsData(patientDetails)
        : undefined,
    }),
    [patientDetails, getGenderDisplay, personAttributes],
  );
  return { patientDetails, isLoading, ...initialData, metadata };
};
