import { isValid, isWithinInterval, parseISO } from 'date-fns';
import {
  BundleEntry,
  DocumentReference,
  Encounter,
  FhirResource,
  Period,
} from 'fhir/r4';
import { get, post } from '../api';
import { OPENMRS_FHIR_R4 } from '../constants/app';
import {
  FHIR_ENCOUNTER_CLASS_CODE_SYSTEM,
  FHIR_ENCOUNTER_TAG_SYSTEM,
  FHIR_ENCOUNTER_TYPE_CODE_SYSTEM,
} from '../constants/fhir';
import { getDocumentPath } from '../documentUploadService';
import {
  createBundleEntry,
  createEncounterBundle,
  ENCOUNTER_BUNDLE_URL,
} from '../encounterBundle';
import { getUserLoginLocation } from '../userService';
import { generateUUID } from '../utils/utils';
import { saveLegacyDocuments, usesLegacyDocuments } from './legacyDocuments';
import {
  AttachToExistingEncounter,
  CreateEncounterInVisit,
  DocumentPayload,
  SaveDocumentsInput,
} from './models';

// encounterReference is a concrete "Encounter/{uuid}" or a bundle-local "urn:uuid:..." placeholder.
function buildDocumentReference(
  patientUuid: string,
  input: DocumentPayload,
  encounterReference: string,
): DocumentReference {
  const documentReference: DocumentReference = {
    resourceType: 'DocumentReference',
    status: 'current',
    docStatus: 'final',
    subject: { reference: `Patient/${patientUuid}` },
    content: [
      {
        attachment: {
          contentType: input.contentType,
          url: input.url,
          title: input.title,
        },
      },
    ],
    context: { encounter: [{ reference: encounterReference }] },
  };
  if (input.typeCode) {
    documentReference.type = {
      coding: [{ code: input.typeCode, display: input.typeDisplay }],
    };
  }
  if (input.description) {
    documentReference.description = input.description;
  }
  if (input.authorPractitionerUuid) {
    documentReference.author = [
      {
        reference: `Practitioner/${input.authorPractitionerUuid}`,
        type: 'Practitioner',
      },
    ];
  }
  return documentReference;
}

const parseDate = (value?: string): Date | undefined => {
  if (!value) {
    return undefined;
  }
  const date = parseISO(value);
  return isValid(date) ? date : undefined;
};

function encounterStartWithinVisit(visitPeriod?: Period): string {
  const now = new Date();
  const visitStart = parseDate(visitPeriod?.start);
  if (!visitStart) {
    return now.toISOString();
  }
  const visitEnd = parseDate(visitPeriod?.end);
  // Inclusive on both bounds, and open-ended for a visit still in progress, as OpenMRS is.
  const withinVisit = visitEnd
    ? isWithinInterval(now, { start: visitStart, end: visitEnd })
    : now >= visitStart;
  return (withinVisit ? now : visitStart).toISOString();
}

function buildDocumentEncounter({
  patientUuid,
  visitUuid,
  encounterTypeUuid,
  locationUuid,
  encounterTypeDisplay,
  authorPractitionerUuid,
  visitPeriod,
}: {
  patientUuid: string;
  visitUuid: string;
  encounterTypeUuid: string;
  locationUuid: string;
  encounterTypeDisplay?: string;
  authorPractitionerUuid?: string;
  visitPeriod?: Period;
}): Encounter {
  const encounter: Encounter = {
    resourceType: 'Encounter',
    status: 'finished',
    class: {
      system: FHIR_ENCOUNTER_CLASS_CODE_SYSTEM,
      code: 'AMB',
      display: 'ambulatory',
    },
    meta: {
      tag: [
        {
          system: FHIR_ENCOUNTER_TAG_SYSTEM,
          code: 'encounter',
          display: 'Encounter',
        },
      ],
    },
    type: [
      {
        coding: [
          {
            system: FHIR_ENCOUNTER_TYPE_CODE_SYSTEM,
            code: encounterTypeUuid,
            display: encounterTypeDisplay,
          },
        ],
      },
    ],
    subject: { reference: `Patient/${patientUuid}` },
    partOf: { reference: `Encounter/${visitUuid}`, type: 'Encounter' },
    location: [
      { location: { reference: `Location/${locationUuid}`, type: 'Location' } },
    ],
    period: { start: encounterStartWithinVisit(visitPeriod) },
  };
  if (authorPractitionerUuid) {
    encounter.participant = [
      {
        individual: {
          reference: `Practitioner/${authorPractitionerUuid}`,
          type: 'Practitioner',
        },
      },
    ];
  }
  return encounter;
}

export async function saveDocuments({
  patientUuid,
  target,
  documents,
}: SaveDocumentsInput): Promise<unknown> {
  if (documents.length === 0) {
    return [];
  }
  if (documents.some((document) => !getDocumentPath(document.url)))
    throw new Error('Choose an uploaded document before saving.');

  if (await usesLegacyDocuments())
    return saveLegacyDocuments({ patientUuid, target, documents });

  const uuid =
    'encounterUuid' in target
      ? target.encounterUuid
      : target.createEncounterInVisit.visitUuid;
  if (!patientUuid || !uuid)
    throw new Error(
      'A patient and a visit or document encounter are required.',
    );
  const current = await get<Encounter>(
    `${OPENMRS_FHIR_R4}/Encounter/${encodeURIComponent(uuid)}`,
  );
  if (
    current.id !== uuid ||
    current.subject?.reference !== `Patient/${patientUuid}` ||
    current.status === 'entered-in-error' ||
    current.status === 'cancelled'
  )
    throw new Error(
      'This encounter is unavailable or belongs to another patient.',
    );

  let entries: Array<BundleEntry<FhirResource>>;
  if ('encounterUuid' in target) {
    // The transaction re-states encounter fields. Never replace newer clinical
    // metadata with the copy held while staff were selecting files.
    const fields = [
      'subject',
      'partOf',
      'type',
      'location',
      'participant',
      'period',
      'status',
    ] as const;
    if (
      fields.some(
        (field) =>
          JSON.stringify(current[field]) !==
          JSON.stringify(target.existingEncounter[field]),
      ) ||
      (target.existingEncounter.meta?.versionId &&
        current.meta?.versionId !== target.existingEncounter.meta.versionId)
    )
      throw new Error('This document encounter changed. Reload before saving.');
    entries = existingEncounterEntries(
      patientUuid,
      { ...target, existingEncounter: current },
      documents,
    );
  } else {
    if (current.partOf)
      throw new Error(
        'Choose a visit, not a clinical encounter, for these documents.',
      );
    const start = parseDate(current.period?.start);
    const end = parseDate(current.period?.end);
    if (!start || (current.period?.end && (!end || end < start)))
      throw new Error('This visit has invalid dates. Reload before saving.');
    entries = newEncounterEntries(
      patientUuid,
      { ...target.createEncounterInVisit, visitPeriod: current.period },
      documents,
    );
  }

  return post<unknown>(ENCOUNTER_BUNDLE_URL, createEncounterBundle(entries));
}

function documentEntries(
  patientUuid: string,
  documents: DocumentPayload[],
  encounterReference: string,
): Array<BundleEntry<FhirResource>> {
  return documents.map((document) =>
    createBundleEntry(
      `urn:uuid:${generateUUID()}`,
      buildDocumentReference(patientUuid, document, encounterReference),
      'POST',
    ),
  );
}

function existingEncounterEntries(
  patientUuid: string,
  target: AttachToExistingEncounter,
  documents: DocumentPayload[],
): Array<BundleEntry<FhirResource>> {
  // fullUrl must equal the reference the documents carry, otherwise the server cannot resolve it:
  // the endpoint requires exactly one Encounter entry and matches encounter references against
  // bundle entry fullUrls.
  const encounterReference = `Encounter/${target.encounterUuid}`;
  return [
    createBundleEntry(
      encounterReference,
      { ...target.existingEncounter, id: target.encounterUuid },
      'PUT',
      encounterReference,
    ),
    ...documentEntries(patientUuid, documents, encounterReference),
  ];
}

function newEncounterEntries(
  patientUuid: string,
  createEncounterInVisit: CreateEncounterInVisit,
  documents: DocumentPayload[],
): Array<BundleEntry<FhirResource>> {
  const { visitUuid, encounterTypeUuid, encounterTypeDisplay, visitPeriod } =
    createEncounterInVisit;
  const encounterPlaceholder = `urn:uuid:${generateUUID()}`;
  const encounter = buildDocumentEncounter({
    patientUuid,
    visitUuid,
    encounterTypeUuid,
    locationUuid: getUserLoginLocation().uuid,
    encounterTypeDisplay,
    authorPractitionerUuid: documents[0]?.authorPractitionerUuid,
    visitPeriod,
  });

  return [
    createBundleEntry(encounterPlaceholder, encounter, 'POST'),
    ...documentEntries(patientUuid, documents, encounterPlaceholder),
  ];
}
