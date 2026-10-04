import { Bundle, CapabilityStatement, DocumentReference } from 'fhir/r4';
import { get, post } from '../api';
import { OPENMRS_FHIR_R4, OPENMRS_REST_V1 } from '../constants/app';
import { getDocumentPath } from '../documentUploadService';
import { getUserLoginLocation } from '../userService';
import { SaveDocumentsInput } from './models';

export async function usesLegacyDocuments(): Promise<boolean> {
  const capability = await get<CapabilityStatement>(
    `${OPENMRS_FHIR_R4}/metadata`,
  );
  const server = capability.rest?.find((rest) => rest.mode === 'server');
  if (!server?.resource?.length)
    throw new Error('Could not determine document support from the server.');
  return !server.resource.some(
    (resource) => resource.type === 'DocumentReference',
  );
}

const contentTypeOf = (path: string) => {
  const extension = path.split('.').pop()?.toLowerCase();
  const types: Record<string, string> = {
    pdf: 'application/pdf',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    gif: 'image/gif',
    webp: 'image/webp',
    bmp: 'image/bmp',
    ogg: 'video/ogg',
    '3gp': 'video/3gpp',
    '3gpp': 'video/3gpp',
    mp4: 'video/mp4',
    mpeg: 'video/mpeg',
    mpg: 'video/mpeg',
    wmv: 'video/x-ms-wmv',
    avi: 'video/x-msvideo',
    mov: 'video/quicktime',
    flv: 'video/x-flv',
    webm: 'video/webm',
    mkv: 'video/x-matroska',
  };
  return extension ? types[extension] : undefined;
};

interface LegacyDocumentEncounter {
  uuid: string;
  voided?: boolean;
  provider?: { display?: string };
  obs?: Array<{
    uuid: string;
    voided?: boolean;
    concept: { uuid: string; name: { name: string } };
    groupMembers?: Array<{
      uuid: string;
      voided?: boolean;
      value?: unknown;
      obsDatetime?: string;
      comment?: string;
    }>;
  }>;
}

// ponytail: older servers need encounter pages for accurate client-side document
// pagination. Use a server document endpoint when large histories make this costly.
export async function getLegacyDocumentBundle(
  patientUuid: string,
  encounterUuids: string[] | undefined,
  count: number,
  offset: number,
): Promise<Bundle<DocumentReference>> {
  const documents: DocumentReference[] = [];
  const seen = new Set<string>();
  for (let startIndex = 0; ; startIndex += 100) {
    const page = await get<{ results: LegacyDocumentEncounter[] }>(
      `${OPENMRS_REST_V1}/encounter`,
      {
        params: {
          patient: patientUuid,
          order: 'desc',
          limit: 100,
          startIndex,
          v: 'custom:(uuid,voided,provider:(display),obs:(uuid,voided,concept:(uuid,name:(name)),groupMembers:(uuid,voided,obsDatetime,value,comment)))',
        },
      },
    );
    for (const encounter of page.results) {
      if (seen.has(encounter.uuid))
        throw new Error('The server repeated a page of document encounters.');
      seen.add(encounter.uuid);
      if (
        encounter.voided ||
        (encounterUuids?.length && !encounterUuids.includes(encounter.uuid))
      )
        continue;
      for (const group of encounter.obs ?? []) {
        if (group.voided) continue;
        for (const file of group.groupMembers ?? []) {
          const path = getDocumentPath(file.value);
          const contentType = path && contentTypeOf(path);
          if (file.voided || !path || !contentType) continue;
          documents.push({
            resourceType: 'DocumentReference',
            id: file.uuid,
            status: 'current',
            subject: { reference: `Patient/${patientUuid}` },
            masterIdentifier: { value: path.split('__').pop() ?? path },
            type: {
              coding: [
                { code: group.concept.uuid, display: group.concept.name.name },
              ],
            },
            date: file.obsDatetime,
            description: file.comment,
            author: [{ display: encounter.provider?.display }],
            context: {
              encounter: [{ reference: `Encounter/${encounter.uuid}` }],
            },
            content: [{ attachment: { url: path, contentType } }],
          });
        }
      }
    }
    if (page.results.length < 100) break;
  }
  documents.sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''));
  return {
    resourceType: 'Bundle',
    type: 'searchset',
    total: documents.length,
    entry: documents
      .slice(offset, offset + count)
      .map((resource) => ({ resource })),
  };
}

interface LegacyVisit {
  uuid: string;
  patient: { uuid: string };
  visitType: { uuid: string };
  startDatetime: string;
  stopDatetime: string | null;
  voided?: boolean;
}

export async function saveLegacyDocuments({
  patientUuid,
  target,
  documents,
}: SaveDocumentsInput) {
  const providerUuid = documents[0]?.authorPractitionerUuid;
  const files = documents.map((document) => {
    const path = getDocumentPath(document.url);
    if (
      !path ||
      !contentTypeOf(path) ||
      !document.typeCode ||
      !providerUuid ||
      document.authorPractitionerUuid !== providerUuid
    )
      throw new Error(
        'Choose a document type and a provider before saving a document.',
      );
    return {
      testUuid: document.typeCode,
      image: path,
      comment: document.description,
    };
  });
  const locationUuid = getUserLoginLocation().uuid;
  let visitUuid: string | undefined;
  let encounterTypeUuid: string | undefined;
  if ('encounterUuid' in target) {
    const encounter = await get<{
      patient: { uuid: string };
      visit: { uuid: string };
      encounterType: { uuid: string };
      voided: boolean;
      location: { uuid: string };
      encounterProviders: Array<{ provider: { uuid: string } }>;
    }>(
      `${OPENMRS_REST_V1}/encounter/${encodeURIComponent(target.encounterUuid)}?v=custom:(patient:(uuid),visit:(uuid),encounterType:(uuid),voided,location:(uuid),encounterProviders:(provider:(uuid)))`,
    );
    visitUuid = target.existingEncounter.partOf?.reference?.split('/').pop();
    encounterTypeUuid = target.existingEncounter.type?.[0]?.coding?.[0]?.code;
    if (
      encounter.voided ||
      encounter.patient.uuid !== patientUuid ||
      encounter.visit?.uuid !== visitUuid ||
      encounter.encounterType.uuid !== encounterTypeUuid ||
      encounter.location?.uuid !== locationUuid ||
      !(encounter.encounterProviders ?? []).some(
        (entry) => entry.provider.uuid === providerUuid,
      )
    )
      throw new Error(
        'The document encounter changed or belongs to another provider. Reload before saving.',
      );
  } else {
    visitUuid = target.createEncounterInVisit.visitUuid;
    encounterTypeUuid = target.createEncounterInVisit.encounterTypeUuid;
  }
  if (!visitUuid || !encounterTypeUuid || !locationUuid)
    throw new Error(
      'A visit, document encounter type and login location are required.',
    );
  const visit = await get<LegacyVisit>(
    `${OPENMRS_REST_V1}/visit/${encodeURIComponent(visitUuid)}?v=custom:(uuid,patient:(uuid),visitType:(uuid),startDatetime,stopDatetime,voided)`,
  );
  if (
    visit.uuid !== visitUuid ||
    visit.voided ||
    visit.patient.uuid !== patientUuid
  )
    throw new Error('This visit no longer belongs to the selected patient.');
  const start = Date.parse(visit.startDatetime);
  const end = visit.stopDatetime ? Date.parse(visit.stopDatetime) : undefined;
  if (
    !Number.isFinite(start) ||
    (end !== undefined && (!Number.isFinite(end) || end < start))
  )
    throw new Error('This visit has invalid dates. Reload before saving.');
  const encounterDateTime = visit.stopDatetime ? visit.startDatetime : null;
  // Choose the API before writing. Never retry a failed transaction through another API.
  const saved = await post<{ visitUuid: string; encounterUuid: string }>(
    `${OPENMRS_REST_V1}/bahmnicore/visitDocument`,
    {
      patientUuid,
      visitUuid,
      visitTypeUuid: visit.visitType.uuid,
      visitStartDate: visit.startDatetime,
      visitEndDate: visit.stopDatetime,
      encounterTypeUuid,
      encounterDateTime,
      providerUuid,
      locationUuid,
      documents: files.map((file) => ({
        ...file,
        obsDateTime: encounterDateTime,
      })),
    },
  );
  if (saved?.visitUuid !== visitUuid || !saved.encounterUuid)
    throw new Error(
      'The server did not confirm the document save. Reload to check before retrying.',
    );
  return saved;
}
