import type {
  PatientProfileResponse,
  PersonAttributeType,
} from '@bahmni/services';
import { convertToPersonAttributesData } from '../patientDataConverter';
import {
  buildPatientProfile,
  PatientProfileFormData,
} from '../patientProfileMapper';

const form: PatientProfileFormData = {
  profile: {
    patientIdFormat: 'ABC',
    entryType: true,
    firstName: 'QorliaQA',
    middleName: '',
    lastName: 'Synthetic',
    gender: 'Male',
    ageYears: '30',
    ageMonths: '0',
    ageDays: '0',
    dateOfBirth: '1996-10-01',
    birthTime: '',
    dobEstimated: true,
    patientIdentifier: {
      identifierType: 'primary',
      identifier: 'ABC200011',
      preferred: true,
    },
  },
  address: {},
  contact: {},
  additional: {},
  additionalIdentifiers: {},
  relationships: [],
};
const existing: PatientProfileResponse = {
  patient: {
    uuid: 'patient',
    identifiers: [
      {
        uuid: 'old',
        identifier: 'OTHER',
        identifierType: { uuid: 'other', name: 'Other' },
        preferred: false,
      },
      {
        uuid: 'primary',
        identifier: 'ABC200011',
        identifierType: { uuid: 'primary', name: 'Patient ID' },
        preferred: true,
      },
    ],
    person: {
      uuid: 'patient',
      names: [
        {
          uuid: 'name',
          givenName: 'QorliaQA',
          familyName: 'Synthetic',
          preferred: true,
        },
      ],
      gender: 'M',
      birthdate: '1996-10-01',
      birthdateEstimated: true,
    },
  },
  relationships: [
    {
      uuid: 'relation',
      display: 'Parent/Child',
      personA: { uuid: 'relative', display: 'Relative' },
      personB: { uuid: 'patient', display: 'QorliaQA Synthetic' },
      relationshipType: { uuid: 'parent', display: 'Parent/Child' },
      voided: false,
      startDate: '2026-10-01',
      endDate: null,
    },
  ],
};

it('keeps full estimated DOB and includes an empty relationship list required by legacy servers', () => {
  const result = buildPatientProfile(form, []);
  expect(result.patient.person.birthdate).toBe('1996-10-01');
  expect(result.patient.person.birthdateEstimated).toBe(true);
  expect(result.relationships).toEqual([]);
});

it('preserves identifier and name UUIDs instead of creating duplicates', () => {
  const result = buildPatientProfile(form, [], existing);
  expect(result.patient.identifiers.map((id) => id.uuid)).toEqual([
    'old',
    'primary',
  ]);
  expect(result.patient.person.names[0].uuid).toBe('name');
});

it('does not submit the form-only identifier type name to the REST API', () => {
  const result = buildPatientProfile(
    {
      ...form,
      profile: {
        ...form.profile,
        patientIdentifier: {
          ...form.profile.patientIdentifier,
          identifierTypeName: 'Patient Identifier',
        },
      },
    },
    [],
  );
  expect(result.patient.identifiers[0]).not.toHaveProperty(
    'identifierTypeName',
  );
  expect(result.patient.identifiers[0].identifier).toBe('ABC200011');
});

it('keeps an existing relationship in its original direction when voiding it', () => {
  const result = buildPatientProfile(
    {
      ...form,
      relationships: [
        {
          id: 'relation',
          relationshipType: 'parent',
          patientId: 'OTHER',
          patientUuid: 'relative',
          tillDate: '',
          isExisting: true,
          isDeleted: true,
        },
      ],
    },
    [],
    existing,
  );
  expect(result.relationships).toEqual([
    expect.objectContaining({
      uuid: 'relation',
      personA: existing.relationships![0].personA,
      personB: existing.relationships![0].personB,
      voided: true,
    }),
  ]);
});

it('rejects a stale relationship rather than re-creating it', () => {
  expect(() =>
    buildPatientProfile(
      {
        ...form,
        relationships: [
          {
            id: 'missing',
            relationshipType: 'parent',
            patientId: 'OTHER',
            patientUuid: 'relative',
            tillDate: '',
            isExisting: true,
          },
        ],
      },
      [],
      existing,
    ),
  ).toThrow('relationship has changed');
});

it('rejects unknown contact configuration instead of silently dropping the data', () => {
  expect(() =>
    buildPatientProfile(
      { ...form, contact: { phoneNumber: '0000000000' } },
      [],
    ),
  ).toThrow('configuration is unavailable');
});

it('uses concept UUIDs and preserves false and numeric attribute values', () => {
  const types: PersonAttributeType[] = [
    {
      uuid: 'bool',
      name: 'isActive',
      format: 'java.lang.Boolean',
      sortWeight: 1,
      description: null,
    },
    {
      uuid: 'number',
      name: 'number',
      format: 'java.lang.Integer',
      sortWeight: 2,
      description: null,
    },
    {
      uuid: 'concept',
      name: 'caste',
      format: 'org.openmrs.Concept',
      sortWeight: 3,
      description: null,
    },
  ];
  const result = buildPatientProfile(
    {
      ...form,
      additional: { isActive: false, number: 0, caste: 'concept-value' },
    },
    types,
  );
  expect(result.patient.person.attributes).toEqual([
    { attributeType: { uuid: 'bool' }, value: 'false' },
    { attributeType: { uuid: 'number' }, value: '0' },
    { attributeType: { uuid: 'concept' }, hydratedObject: 'concept-value' },
  ]);
  const data = convertToPersonAttributesData(
    {
      ...existing,
      patient: {
        ...existing.patient,
        person: {
          ...existing.patient.person,
          attributes: types.map((type, index) => ({
            value: [false, 0, { uuid: 'concept-value' }][index],
            attributeType: { uuid: type.uuid, links: [] },
            links: [],
            resourceVersion: '1.8',
          })),
        },
      },
    },
    types,
  );
  expect(data).toEqual({ isActive: false, number: 0, caste: 'concept-value' });
});
