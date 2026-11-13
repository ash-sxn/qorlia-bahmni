import { Coding } from 'fhir/r4';

export interface DiagnosisInputEntry {
  id: string;
  display: string;
  selectedCertainty: Coding | null;
  conceptSystem?: string;

  errors: {
    certainty?: string;
  };
  hasBeenValidated: boolean;
}

export interface Diagnosis {
  id: string;
  display: string;
  certainty: Coding;
  recordedDate: string;
  recorder: string;
}

export interface DiagnosesByDate {
  date: string;
  diagnoses: Diagnosis[];
}

/** Native record used for edits; FHIR omits rank and other native fields. */
export interface SavedDiagnosis {
  uuid: string;
  diagnosis: {
    coded?: { uuid: string } | null;
    nonCoded?: string | null;
  };
  patient: { uuid: string };
  encounter: { uuid: string; patient?: { uuid: string }; voided?: boolean };
  condition: { uuid: string } | null;
  certainty: 'CONFIRMED' | 'PROVISIONAL';
  rank: number;
  voided: boolean;
  display: string;
  formFieldNamespace?: string | null;
  formFieldPath?: string | null;
  auditInfo: { dateCreated: string; dateChanged?: string | null };
}
