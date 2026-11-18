/** One visit from GET /openmrs/ws/rest/v1/visit with a custom view. */
export interface RecordVisit {
  uuid: string;
  startDatetime: string;
  stopDatetime: string | null;
  visitType: { display: string };
  location: { display: string } | null;
}

/** An OpenMRS REST list. */
export interface RestPage<T> {
  results: T[];
  links?: { rel: string; uri: string }[];
}

/** Bahmni writes dates as ISO text or as milliseconds, depending on its version. */
export type BahmniDate = string | number | null | undefined;

/** One test result from GET bahmnicore/labOrderResults. */
export interface LabResult {
  testName: string;
  panelName?: string | null;
  result?: string | null;
  testUnitOfMeasurement?: string | null;
  minNormal?: number | null;
  maxNormal?: number | null;
  abnormal?: boolean | null;
  resultDateTime?: BahmniDate;
  accessionDateTime?: BahmniDate;
  visitStartTime?: BahmniDate;
}

export interface LabResultsResponse {
  results: LabResult[];
}

export const RECORD_KINDS = ['note', 'diagnosis', 'medicine', 'lab'] as const;
export type RecordKind = (typeof RECORD_KINDS)[number];

/** One line of the patient's history, whatever its source. */
export interface RecordEntry {
  id: string;
  kind: RecordKind;
  /** ISO date and time the entry was recorded. */
  date: string;
  title: string;
  detail: string;
  /** True for a lab result that Bahmni marked as outside the normal range. */
  abnormal?: boolean;
  /**
   * ISO start of the visit the source says this entry belongs to. Lab results carry it,
   * because the lab often finishes them after the visit has been closed.
   */
  visitStart?: string;
}

/** A visit with the entries recorded during it. `visit` is null for entries outside any visit. */
export interface VisitGroup {
  key: string;
  visit: RecordVisit | null;
  entries: RecordEntry[];
}

/** One saved consultation note (an observation of Bahmni's "Consultation Note"). */
export interface NoteObservation {
  uuid: string;
  value: string;
  obsDatetime: string;
  encounter?: {
    visit?: { startDatetime: string } | null;
    encounterProviders?: { provider: { display: string } }[];
  } | null;
}
