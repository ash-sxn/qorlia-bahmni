import { Bundle, Immunization } from 'fhir/r4';
import { getCompatiblePatientBundle } from '../fhirSearchCompatibility';
import { IMMUNIZATION_FHIR_URL, PATIENT_IMMUNIZATION_URL } from './constants';
import { ImmunizationStatus } from './models';

export async function getPatientImmunizations(
  patientUuid: string,
  status?: ImmunizationStatus,
): Promise<Immunization[]> {
  const bundle = await getPatientImmunizationsBundle(patientUuid, status);

  return (
    bundle.entry
      ?.filter((entry) => entry.resource?.resourceType === 'Immunization')
      .map((entry) => entry.resource as Immunization) ?? []
  );
}

export async function getPatientImmunizationsBundle(
  patientUuid: string,
  status?: ImmunizationStatus,
): Promise<Bundle<Immunization>> {
  const { bundle, usedFallback } =
    await getCompatiblePatientBundle<Immunization>(
      PATIENT_IMMUNIZATION_URL(patientUuid, status),
      `${IMMUNIZATION_FHIR_URL}?patient=${patientUuid}&_count=100`,
      (immunization) => !status || immunization.status === status,
    );
  if (usedFallback) {
    bundle.entry?.sort(
      (a, b) =>
        new Date(
          b.resource?.occurrenceDateTime ?? b.resource?.recorded ?? 0,
        ).getTime() -
        new Date(
          a.resource?.occurrenceDateTime ?? a.resource?.recorded ?? 0,
        ).getTime(),
    );
  }
  return bundle;
}
