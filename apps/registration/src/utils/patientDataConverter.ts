import type {
  FhirRelatedPerson,
  PatientProfileResponse,
  PersonAttributeType,
} from '@bahmni/services';
import { calculateAge } from '@bahmni/services';
import { format, isValid, parseISO } from 'date-fns';
import type { RelationshipData } from '../components/forms/patientRelationships/PatientRelationships';
import {
  RELATED_PATIENT_EXT_URL,
  RELATIONSHIP_TYPE_SYSTEM,
} from '../constants/relatedPerson';
import { AddressData } from '../hooks/useAddressFields';
import type { BasicInfoData, PersonAttributesData } from '../models/patient';

export const convertToBasicInfoData = (
  patientData: PatientProfileResponse | undefined,
  getGenderDisplay?: (code: string) => string,
): BasicInfoData | undefined => {
  if (!patientData) return undefined;

  const preferredName =
    patientData.patient.person.names.find(
      (name) => name.preferred && !name.voided,
    ) ?? patientData.patient.person.names.find((name) => !name.voided);

  if (!preferredName) return undefined;

  const birthdate = patientData.patient.person.birthdate;
  const birthtimeIso = patientData.patient.person.birthtime;

  const dateOnly = birthdate ? birthdate.split('T')[0] : '';

  const age = dateOnly ? calculateAge(dateOnly) : null;

  let birthTime = '';
  if (birthtimeIso) {
    const date = parseISO(birthtimeIso);
    if (isValid(date)) {
      birthTime = format(date, 'HH:mm');
    }
  }
  const genderCode = patientData.patient.person.gender;
  const genderDisplay = getGenderDisplay?.(genderCode) ?? genderCode;

  return {
    patientIdFormat: '',
    entryType: patientData.patient.person.birthdateEstimated,
    firstName: preferredName.givenName,
    middleName: preferredName.middleName ?? '',
    lastName: preferredName.familyName,
    gender: genderDisplay,
    ageYears: age?.years.toString() ?? '',
    ageMonths: age?.months.toString() ?? '',
    ageDays: age?.days.toString() ?? '',
    dateOfBirth: dateOnly,
    birthTime: birthTime,
    nameUuid: preferredName.uuid,
  };
};

export const convertToPersonAttributesData = (
  patientData: PatientProfileResponse | undefined,
  attributeTypes: PersonAttributeType[] = [],
): PersonAttributesData | undefined => {
  if (
    !patientData?.patient.person.attributes ||
    patientData.patient.person.attributes.length === 0
  ) {
    return undefined;
  }

  const data: PersonAttributesData = {};

  patientData.patient.person.attributes.forEach((attr) => {
    const fieldName =
      attributeTypes.find((type) => type.uuid === attr.attributeType.uuid)
        ?.name ?? attr.attributeType?.display;
    if (!fieldName || attr.voided) return;
    data[fieldName] =
      attr.value && typeof attr.value === 'object'
        ? attr.value.uuid
        : (attr.value ?? '');
  });

  return data;
};

export const convertToAddressData = (
  patientData: PatientProfileResponse | undefined,
): AddressData | undefined => {
  if (
    !patientData?.patient.person.addresses ||
    patientData.patient.person.addresses.length === 0
  ) {
    return undefined;
  }

  const address =
    patientData.patient.person.addresses.find(
      (a) => a.preferred && !a.voided,
    ) ?? patientData.patient.person.addresses.find((a) => !a.voided);
  if (!address) return undefined;

  const addressData: AddressData = {};
  Object.keys(address).forEach((key) => {
    if (
      ['links', 'resourceVersion', 'preferred', 'voided', 'display'].includes(
        key,
      )
    )
      return;

    const value = (address as Record<string, unknown>)[key];
    addressData[key] =
      value !== undefined && value !== null ? String(value) : null;
  });

  return addressData;
};

export const convertToAdditionalIdentifiersData = (
  patientData: PatientProfileResponse | undefined,
): Record<string, string> | undefined => {
  if (
    !patientData?.patient.identifiers ||
    patientData.patient.identifiers.length <= 1
  ) {
    return undefined;
  }

  const additionalIdentifiers = patientData.patient.identifiers.filter(
    (id) => !id.preferred,
  );

  const identifiersData: Record<string, string> = {};

  additionalIdentifiers.forEach((identifier) => {
    if (!identifier.voided && identifier.identifierType?.uuid) {
      identifiersData[identifier.identifierType.uuid] =
        identifier.identifier ?? '';
    }
  });

  return Object.keys(identifiersData).length > 0 ? identifiersData : undefined;
};

export const convertFhirRelatedPersonsToRelationshipData = (
  fhirRelatedPersons: FhirRelatedPerson[],
): RelationshipData[] => {
  return fhirRelatedPersons
    .filter((rp) => rp.id)
    .map((rp) => {
      const relatedPatientExt = rp.extension?.find(
        (ext) => ext.url === RELATED_PATIENT_EXT_URL,
      );
      const relatedPatientUuid = relatedPatientExt?.valueReference?.reference
        ?.split('/')
        .at(-1);

      const nameObj = rp.name?.[0];
      const givenNames = nameObj?.given?.join(' ') ?? '';
      const patientName = [givenNames, nameObj?.family]
        .filter(Boolean)
        .join(' ')
        .trim();

      const coding = rp.relationship?.[0]?.coding?.[0];

      let tillDate = '';
      if (rp.period?.end) {
        const date = parseISO(rp.period.end);
        if (isValid(date)) {
          tillDate = format(date, 'yyyy-MM-dd');
        }
      }

      return {
        id: rp.id!,
        relationshipType: coding?.code ?? '',
        relationshipTypeLabel: coding?.display,
        patientId: '',
        patientUuid: relatedPatientUuid,
        patientName,
        tillDate,
        isExisting: true,
      };
    });
};

export const buildRelatedPersonPayload = (
  patientUuid: string,
  rel: RelationshipData,
): FhirRelatedPerson => ({
  resourceType: 'RelatedPerson',
  patient: { reference: `Patient/${patientUuid}` },
  relationship: [
    {
      coding: [
        { system: RELATIONSHIP_TYPE_SYSTEM, code: rel.relationshipType },
      ],
    },
  ],
  extension: [
    {
      url: RELATED_PATIENT_EXT_URL,
      valueReference: { reference: `Patient/${rel.patientUuid}` },
    },
  ],
  ...(rel.tillDate && { period: { end: rel.tillDate } }),
});

export const convertToRelationshipsData = (
  patientData: PatientProfileResponse | undefined,
): RelationshipData[] => {
  if (!patientData?.relationships || patientData.relationships.length === 0) {
    return [];
  }

  const currentPatientUuid = patientData.patient.uuid;

  return patientData.relationships
    .filter((rel) => !rel.voided)
    .map((rel) => {
      const isPersonA = rel.personA.uuid === currentPatientUuid;
      const relatedPerson = isPersonA ? rel.personB : rel.personA;

      let formattedDate = '';
      if (rel.endDate) {
        const date = parseISO(rel.endDate);
        if (isValid(date)) {
          formattedDate = format(date, 'yyyy-MM-dd');
        }
      }

      return {
        id: rel.uuid,
        relationshipType: rel.relationshipType.uuid,
        relationshipTypeLabel: isPersonA
          ? rel.relationshipType.display.split('/')[0]?.trim()
          : rel.relationshipType.display.split('/')[1]?.trim(),
        patientId: '',
        patientUuid: relatedPerson.uuid,
        patientName: relatedPerson.display,
        tillDate: formattedDate,
        isExisting: true,
      };
    });
};
