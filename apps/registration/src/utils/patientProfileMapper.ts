import type {
  CreatePatientRequest,
  PatientAddress,
  PatientIdentifier,
  PatientProfileResponse,
  PersonAttributeType,
} from '@bahmni/services';
import type { RelationshipData } from '../components/forms/patientRelationships/PatientRelationships';
import type {
  BasicInfoData,
  PersonAttributesData,
  AdditionalIdentifiersData,
} from '../models/patient';
import { convertTimeToISODateTime } from './dateTimeUtils';
import { mapGenderFromFhir, mapGenderToFhir } from './fhirUtils';

export interface PatientProfileFormData {
  profile: BasicInfoData & {
    dobEstimated: boolean;
    patientIdentifier: PatientIdentifier;
    image?: string;
  };
  address: PatientAddress;
  contact: PersonAttributesData;
  additional: PersonAttributesData;
  additionalIdentifiers: AdditionalIdentifiersData;
  relationships?: RelationshipData[];
}

// Use Bahmni's patient-profile API: older FHIR servers silently discard these
// attributes and reduce an estimated birth date to year-only precision.
export function buildPatientProfile(
  form: PatientProfileFormData,
  attributeTypes: PersonAttributeType[],
  existing?: PatientProfileResponse,
): CreatePatientRequest {
  const person = existing?.patient.person;
  const { profile } = form;
  const name =
    person?.names.find((n) => n.preferred && !n.voided) ??
    person?.names.find((n) => !n.voided);
  const address =
    person?.addresses?.find((a) => a.preferred && !a.voided) ??
    person?.addresses?.find((a) => !a.voided);
  const identifiers: PatientIdentifier[] = existing
    ? existing.patient.identifiers.map((id) => ({
        uuid: id.uuid,
        identifier: id.identifier,
        preferred: id.preferred,
        voided: id.voided,
        identifierType: id.identifierType.uuid,
      }))
    : [
        {
          identifier: profile.patientIdentifier.identifier,
          identifierType: profile.patientIdentifier.identifierType,
          identifierSourceUuid: profile.patientIdentifier.identifierSourceUuid,
          identifierPrefix: profile.patientIdentifier.identifierPrefix,
          preferred: profile.patientIdentifier.preferred,
          voided: profile.patientIdentifier.voided,
        },
      ];
  for (const [type, value] of Object.entries(form.additionalIdentifiers)) {
    const identifier = identifiers.find(
      (id) => id.identifierType === type && !id.voided,
    );
    if (identifier) {
      identifier.identifier = value.trim();
      identifier.voided = !value.trim();
    } else if (value.trim()) {
      identifiers.push({
        identifierType: type,
        identifier: value.trim(),
        preferred: false,
      });
    }
  }

  const values = { ...form.contact, ...form.additional };
  if (
    Object.keys(values).some(
      (key) => !attributeTypes.some((type) => type.name === key),
    )
  ) {
    throw new Error(
      'Patient field configuration is unavailable. Reload before saving.',
    );
  }
  const attributes = attributeTypes
    .filter((type) => Object.prototype.hasOwnProperty.call(values, type.name))
    .map((type) => {
      const saved = person?.attributes?.find(
        (a) => a.attributeType.uuid === type.uuid && !a.voided,
      );
      const value = values[type.name];
      const empty = value == null || String(value).trim() === '';
      return {
        ...(saved?.uuid && { uuid: saved.uuid }),
        attributeType: { uuid: type.uuid },
        ...(empty
          ? { voided: true }
          : type.format === 'org.openmrs.Concept'
            ? { hydratedObject: String(value) }
            : { value: String(value) }),
      };
    });

  const relationships = form.relationships
    ?.filter((rel) => rel.patientUuid && rel.relationshipType)
    .map((rel) => {
      const saved = existing?.relationships?.find((r) => r.uuid === rel.id);
      if (rel.isExisting && (!saved || saved.voided))
        throw new Error('A relationship has changed. Reload before saving.');
      return {
        ...(saved?.uuid && { uuid: saved.uuid }),
        relationshipType: { uuid: rel.relationshipType },
        ...(saved
          ? { personA: saved.personA, personB: saved.personB }
          : { personB: { uuid: rel.patientUuid } }),
        endDate: rel.tillDate || null,
        voided: !!rel.isDeleted,
      };
    });

  return {
    ...(profile.image && { image: profile.image }),
    patient: {
      person: {
        names: [
          {
            ...(name?.uuid && { uuid: name.uuid }),
            givenName: profile.firstName.trim(),
            middleName: profile.middleName.trim(),
            familyName: profile.lastName.trim(),
            preferred: true,
          },
        ],
        gender: mapGenderFromFhir(mapGenderToFhir(profile.gender)),
        birthdate: profile.dateOfBirth,
        birthdateEstimated: profile.dobEstimated,
        birthtime: convertTimeToISODateTime(
          profile.dateOfBirth,
          profile.birthTime,
        ),
        ...(Object.keys(form.address).length > 0 && {
          addresses: [
            {
              ...form.address,
              ...(address?.uuid && {
                uuid: address.uuid,
                preferred: address.preferred,
              }),
            },
          ],
        }),
        attributes,
      },
      identifiers,
    },
    relationships: relationships ?? [],
  };
}
