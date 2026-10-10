import { Bundle, DocumentReference } from 'fhir/r4';
import { get } from '../api';
import { searchConceptByName } from '../conceptService/conceptService';
import {
  DOCUMENT_UPLOAD_MAX_SIZE_URL,
  PATIENT_DOCUMENT_REFERENCES_URL,
} from './constants';
import {
  getLegacyDocumentBundle,
  usesLegacyDocuments,
} from './legacyDocuments';
import { DocumentType, DocumentViewModel } from './models';

/**
 * Reads the configured max document upload size (MB) from the
 * `bahmni.documentUpload.maxFileSizeInMB` system setting. Returns undefined when unset so callers
 * can fall back to their own default.
 */
export async function getDocumentUploadMaxSizeMb(): Promise<
  number | undefined
> {
  const response = await get<{ results: Array<{ value?: string }> }>(
    DOCUMENT_UPLOAD_MAX_SIZE_URL,
  );
  const value = Number(response.results?.[0]?.value);
  return Number.isFinite(value) && value > 0 ? value : undefined;
}

/**
 * Fetches the configurable document types (set members of the given document-type concept),
 * e.g. Prescription, Radiology Report. Used to populate the document-type dropdown.
 * @param conceptName - fully specified name of the document-type concept set
 */
export async function getDocumentTypes(
  conceptName: string,
): Promise<DocumentType[]> {
  const customView = 'custom:(setMembers:(uuid,display))';
  const concept = await searchConceptByName(conceptName, customView);
  return (concept?.setMembers ?? []).map((member) => ({
    id: member.uuid,
    label: member.display ?? '',
  }));
}

/**
 * Maps FHIR DocumentReference entries to DocumentViewModel for UI consumption
 * @param entries - Array of FHIR Bundle entries containing DocumentReference resources
 * @returns Array of formatted DocumentViewModel objects
 */
function mapDocumentReferencesToViewModels(
  entries: Array<{ resource: DocumentReference }>,
): DocumentViewModel[] {
  return entries
    .filter((entry) => entry.resource?.resourceType === 'DocumentReference')
    .map((entry) => {
      const doc = entry.resource;
      const masterIdentifier = doc.masterIdentifier?.value ?? '';
      const encounterId = doc.context?.encounter?.[0]?.reference
        ?.split('/')
        .pop();

      const attachments = (doc.content ?? [])
        .map((c) => c.attachment)
        .filter((a): a is NonNullable<typeof a> => !!a)
        .map((a) => ({ url: a.url ?? '', contentType: a.contentType }));

      const firstAttachment = attachments[0];

      return {
        id: doc.id ?? masterIdentifier,
        documentIdentifier: masterIdentifier,
        documentType:
          doc.type?.coding?.[0]?.display ??
          doc.category?.[0]?.coding?.[0]?.display,
        uploadedOn: doc.date ?? '',
        uploadedBy: doc.author?.[0]?.display,
        contentType: firstAttachment?.contentType,
        documentUrl: firstAttachment?.url ?? '',
        attachments,
        encounterId,
        description: doc.description,
      };
    });
}

/**
 * Fetches patient documents from the FHIR DocumentReference endpoint
 * The request includes _sort=-date; actual ordering depends on server support.
 * @param patientUuid - The UUID of the patient to fetch documents for
 * @param encounterUuids - Optional array of encounter UUIDs to filter documents
 * @returns Promise resolving to a FHIR Bundle containing DocumentReference resources
 */
export async function getDocumentReferences(
  patientUuid: string,
  encounterUuids?: string[],
): Promise<Bundle<DocumentReference>> {
  return getDocumentBundle(patientUuid, encounterUuids, 100, 0);
}

async function getDocumentBundle(
  patientUuid: string,
  encounterUuids: string[] | undefined,
  count: number,
  offset: number,
) {
  if (await usesLegacyDocuments())
    return getLegacyDocumentBundle(patientUuid, encounterUuids, count, offset);
  return get<Bundle<DocumentReference>>(
    PATIENT_DOCUMENT_REFERENCES_URL(patientUuid, encounterUuids, count, offset),
  );
}

/**
 * Fetches and formats patient documents from the FHIR DocumentReference endpoint
 * Returns documents transformed to DocumentViewModel; consumers are responsible
 * for client-side sorting where server-side _sort=-date is unsupported.
 * @param patientUuid - The UUID of the patient to fetch documents for
 * @param encounterUuids - Optional array of encounter UUIDs to filter documents
 * @returns Promise resolving to an array of formatted DocumentViewModel objects
 */
export async function getFormattedDocumentReferences(
  patientUuid: string,
  encounterUuids?: string[],
): Promise<DocumentViewModel[]> {
  const documents: DocumentViewModel[] = [];
  const seen = new Set<string>();
  if (await usesLegacyDocuments()) {
    // The legacy adapter already walks the complete encounter history. Read it
    // once, rather than walking that history again for each document page.
    const bundle = await getLegacyDocumentBundle(
      patientUuid,
      encounterUuids,
      Number.MAX_SAFE_INTEGER,
      0,
    );
    return mapDocumentReferencesToViewModels(
      (bundle.entry ?? []).filter(
        (entry): entry is { resource: DocumentReference } => !!entry.resource,
      ),
    );
  }
  for (let offset = 0; ; offset += 100) {
    const bundle = await get<Bundle<DocumentReference>>(
      PATIENT_DOCUMENT_REFERENCES_URL(patientUuid, encounterUuids, 100, offset),
    );
    const entries = (bundle.entry ?? []).filter(
      (entry): entry is { resource: DocumentReference } => !!entry.resource,
    );
    const page = mapDocumentReferencesToViewModels(entries);
    for (const document of page) {
      if (!document.id || seen.has(document.id))
        throw new Error(
          'The server returned missing or repeated document IDs.',
        );
      seen.add(document.id);
    }
    documents.push(...page);
    if (entries.length < 100) break;
  }
  return documents;
}

export interface DocumentReferencePage {
  documents: DocumentViewModel[];
  total: number;
}

/**
 * Fetches a single page of patient documents using offset-based pagination.
 * Uses _getpagesoffset = (page - 1) * count to jump directly to any page.
 * @param patientUuid - The UUID of the patient to fetch documents for
 * @param encounterUuids - Optional array of encounter UUIDs to filter documents
 * @param count - Number of items per page (default 10)
 * @param page - 1-based page number (default 1)
 * @returns Promise resolving to a DocumentReferencePage with documents and total count
 */
export async function getDocumentReferencePage(
  patientUuid: string,
  encounterUuids?: string[],
  count: number = 10,
  page: number = 1,
): Promise<DocumentReferencePage> {
  if (
    !Number.isInteger(count) ||
    count < 1 ||
    !Number.isInteger(page) ||
    page < 1
  )
    throw new Error('Document page and size must be positive whole numbers.');
  const offset = (page - 1) * count;
  const bundle = await getDocumentBundle(
    patientUuid,
    encounterUuids,
    count,
    offset,
  );

  const entries = (bundle.entry ?? []).filter(
    (entry): entry is { resource: DocumentReference } => !!entry.resource,
  );

  return {
    documents: mapDocumentReferencesToViewModels(entries),
    total: bundle.total ?? entries.length,
  };
}
