import { type PatientBannerProps } from '@bahmni/design-system';
import {
  AllergyStatus,
  calculateAge,
  getFormattedAllergies,
  getFormattedPatientById,
  useTranslation,
} from '@bahmni/services';
import { useQuery } from '@tanstack/react-query';
import { getPatientVisits } from '../PatientRecord/recordService';

const QUERY_OPTIONS = { retry: false, refetchOnWindowFocus: false } as const;

/**
 * What the compact patient banner needs on a work screen: who the patient is,
 * their allergies and whether a visit is open. Null until the patient is loaded.
 */
export const usePatientBanner = (
  patientUuid: string,
): Omit<PatientBannerProps, 'actions'> | null => {
  const { t } = useTranslation();
  const enabled = patientUuid !== '';
  const patient = useQuery({
    queryKey: ['banner', 'patient', patientUuid],
    queryFn: () => getFormattedPatientById(patientUuid),
    enabled,
    ...QUERY_OPTIONS,
  });
  const allergies = useQuery({
    queryKey: ['banner', 'allergies', patientUuid],
    queryFn: () => getFormattedAllergies(patientUuid),
    enabled,
    ...QUERY_OPTIONS,
  });
  const visits = useQuery({
    queryKey: ['banner', 'visits', patientUuid],
    queryFn: () => getPatientVisits(patientUuid),
    enabled,
    ...QUERY_OPTIONS,
  });
  if (!patient.data) return null;

  const age = patient.data.birthDate
    ? calculateAge(patient.data.birthDate)
    : null;
  const active = (allergies.data ?? [])
    .filter(({ status }) => status === AllergyStatus.Active)
    .map(({ display }) => display);
  let allergySummary: PatientBannerProps['allergies'] = {
    label:
      active.length > 0
        ? t('PATIENT_RECORD_ALLERGIES')
        : t('PATIENT_RECORD_NO_ALLERGIES'),
    items: active,
  };
  if (allergies.isPending) {
    allergySummary = { message: t('PATIENT_RECORD_LOADING') };
  } else if (allergies.isError) {
    allergySummary = { message: t('PATIENT_RECORD_ALLERGIES_ERROR') };
  }
  const open = (visits.data ?? []).find((visit) => !visit.stopDatetime);

  return {
    compact: true,
    headingLevel: 2,
    name: patient.data.fullName ?? '',
    nameHref: `/bahmni-v2/home/records/${encodeURIComponent(patientUuid)}`,
    details: [
      [
        age && t('PATIENT_RECORD_AGE_YEARS', { count: age.years }),
        patient.data.gender,
      ]
        .filter(Boolean)
        .join(', '),
      patient.data.identifier,
    ],
    allergies: allergySummary,
    visit: open
      ? t('DICTATION_VISIT_OPEN', { type: open.visitType.display })
      : undefined,
  };
};
